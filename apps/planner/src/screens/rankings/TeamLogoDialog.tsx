"use client";

/**
 * Setting one team's logo in the rankings document (hosted rankings and team
 * logos spec, R5). The image is normalized in the browser by the same pipeline
 * as the practice logo (lib/utils/canvas/logo-file), with the rankings
 * document's smaller bounds, then stored on the team entry, so it travels
 * in the rankings file.
 *
 * `TeamLogoField` is the self-contained control (mark, choose or replace,
 * remove, error): it reports a change through `onChange`, so the team page's
 * "Team details" dialog (`TeamLogoDialog`) saves at once while Setup's team
 * dialog keeps the change in its own copy until Done.
 */
import { useRef, useState, type ChangeEvent } from "react";
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from "@mui/material";
import type { ActionResult } from "@/lib/planner-store";
import { LOGO_ACCEPT } from "@/lib/media/logo-rules";
import { normalizeLogoFile, type LogoNormalizeOptions } from "@/lib/utils/canvas/logo-file";
import { MAX_TEAM_LOGO_PNG_BYTES, TEAM_LOGO_FALLBACK_PX, TEAM_LOGO_MAX_PX, teamLogo, withTeamLogo, type RankingsDocument, type RankingsTeamLogo } from "@/lib/rankings-document";
import { TeamMark } from "./TeamMark";

export const TEAM_DETAILS_LABEL = "Team details";
export const CHOOSE_LOGO_LABEL = "Choose logo";
export const REPLACE_LOGO_LABEL = "Replace logo";
export const REMOVE_LOGO_LABEL = "Remove logo";
export const TEAM_LOGO_NOTE = "PNG, JPEG or WebP. It's stored small inside this rankings file and goes wherever the file goes.";

/** The rankings document's logo bounds, for the shared normalizer. */
export const RANKINGS_TEAM_LOGO_OPTIONS: LogoNormalizeOptions = { sides: [TEAM_LOGO_MAX_PX, TEAM_LOGO_FALLBACK_PX], maxPngBytes: MAX_TEAM_LOGO_PNG_BYTES };

export interface TeamLogoFieldProps {
    number: string;
    name: string;
    logo: RankingsTeamLogo | null;
    /**
     * Applies a new logo (null removes it) and resolves to why it was refused,
     * or null. The team page saves it at once; Setup's team dialog keeps it in
     * its own copy until Done.
     */
    onChange: (logo: RankingsTeamLogo | null) => Promise<string | null> | string | null;
    /** Draw the team's mark and name above the buttons; off where the dialog already shows them. */
    showMark?: boolean;
}

export function TeamLogoField({ number, name, logo, onChange, showMark = true }: TeamLogoFieldProps) {
    const input = useRef<HTMLInputElement>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const apply = async (next: RankingsTeamLogo | null) => setError(await onChange(next));

    const run = async (work: () => Promise<void>) => {
        setBusy(true);
        try {
            await work();
        } finally {
            setBusy(false);
        }
    };

    const pick = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        void run(async () => {
            const normalized = await normalizeLogoFile(file, RANKINGS_TEAM_LOGO_OPTIONS);
            if (!normalized.ok) setError(normalized.error);
            else await apply(normalized.logo);
        });
    };

    return (
        <Stack spacing={2}>
            {showMark && (
                <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
                    <TeamMark number={number} name={name} logoUrl={logo?.dataUrl ?? null} size="lg" crestOnly />
                    <Typography sx={{ fontWeight: 700, overflowWrap: "anywhere" }}>{`${name} (${number})`}</Typography>
                </Stack>
            )}
            <Typography variant="body2" color="text.secondary">
                {TEAM_LOGO_NOTE}
            </Typography>
            <input ref={input} type="file" accept={LOGO_ACCEPT} hidden aria-label={logo ? REPLACE_LOGO_LABEL : CHOOSE_LOGO_LABEL} onChange={pick} />
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
                <Button variant="contained" disabled={busy} onClick={() => input.current?.click()} sx={{ minHeight: 44 }}>
                    {logo ? REPLACE_LOGO_LABEL : CHOOSE_LOGO_LABEL}
                </Button>
                {logo && (
                    <Button color="error" disabled={busy} onClick={() => void run(() => apply(null))} sx={{ minHeight: 44 }}>
                        {REMOVE_LOGO_LABEL}
                    </Button>
                )}
            </Stack>
            {error && <Alert severity="error">{error}</Alert>}
        </Stack>
    );
}

export interface TeamLogoDialogProps {
    open: boolean;
    onClose: () => void;
    doc: RankingsDocument;
    number: string;
    save: (doc: RankingsDocument) => Promise<ActionResult<RankingsDocument>>;
}

/** The team page's dialog: a logo change is saved at once. */
export function TeamLogoDialog({ open, onClose, doc, number, save }: TeamLogoDialogProps) {
    const team = doc.teams.find((entry) => entry.number === number);
    if (!team) return null;
    const change = async (next: RankingsTeamLogo | null) => {
        const updated = withTeamLogo(doc, number, next);
        if (!updated.ok) return updated.error;
        const result = await save(updated.doc);
        return result.success ? null : result.error;
    };
    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="team-details-title">
            <DialogTitle id="team-details-title">{TEAM_DETAILS_LABEL}</DialogTitle>
            <DialogContent>
                <TeamLogoField number={team.number} name={team.name} logo={teamLogo(doc, number)} onChange={change} />
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} sx={{ minHeight: 44 }}>
                    Done
                </Button>
            </DialogActions>
        </Dialog>
    );
}

/**
 * Import a practice plan into this browser (ADR-0020): a chosen file, or a
 * #plan= link from the hosted Export menu. The link is read once and the
 * address bar is replaced with #/import, so the plan never lingers in the
 * URL or history. One instance serves both routes (App keys it "import"), and
 * the pending link lives in state, so the URL change can't cancel decoding.
 * Leaving #plan= clears the pending link, so pasting the same link again reads it again.
 * With AI assistance on (ADR-0023), the start view also offers a draft from notes.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Box, Button, Paper, Stack, Typography } from "@mui/material";
import { FileUploadOutlined as UploadIcon, NotesOutlined as NotesIcon } from "@mui/icons-material";
import { PageHeader } from "@/components/ui/PageHeader";
import { StarterTemplatePicker, starterTemplateImport } from "@/components/features/practice-planner/StarterTemplatePicker";
import { usePlannerPlatform } from "@/lib/planner-store";
import { readPlanFile, readPlanLink, type ParsePlanResult, type PlanDocument, type PlanError } from "@/lib/plan-document";
import { toTeamMark } from "@/lib/utils/team-mark";
import { LOCAL_TEAM_ID } from "../config";
import { replaceHash } from "../platform";
import { staticRoutes } from "../routes";
import type { LocalPlannerStore } from "../store/types";
import { PlanReviewPanel, planStartDate, usePlanSave } from "./PlanReviewPanel";
import { useAiSettings } from "./useAiSettings";
import { useStoreResult } from "./useStoreResult";
import { useTeamProfileVersion } from "./useTeamProfile";

export { planStartDate };

type ViewState =
    | { kind: "pick" }
    | { kind: "reading" }
    | { kind: "error"; error: PlanError }
    | { kind: "ready"; plan: PlanDocument; fromTemplate: boolean };

function toViewState(result: ParsePlanResult, fromTemplate = false): ViewState {
    return result.ok ? { kind: "ready", plan: result.plan, fromTemplate } : { kind: "error", error: result.error };
}

export const NOTES_CARD_TITLE = "Draft a plan from notes";

export function ImportScreen({ store, linkValue }: { store: LocalPlannerStore; linkValue: string | null }) {
    const { planGenerator } = usePlannerPlatform();
    const fileInput = useRef<HTMLInputElement>(null);
    const [pending, setPending] = useState<string | null>(linkValue);
    const [state, setState] = useState<ViewState>(linkValue ? { kind: "reading" } : { kind: "pick" });
    // A newly pasted link replaces the current one (adjusting state during render, not in an effect).
    if (linkValue && linkValue !== pending) {
        setPending(linkValue);
        setState({ kind: "reading" });
    } else if (!linkValue && pending) {
        // The route moved to #/import: forget the link (the screen keeps what it shows).
        setPending(null);
    }
    // The newest choice (a link read or a file pick); an older one's result is dropped when it lands.
    const latestChoice = useRef<symbol | null>(null);
    const [addToLibrary, setAddToLibrary] = useState(false);
    const { save, saving, saveError, clearError } = usePlanSave(store);
    // The device's "Your team": a plan file has no team, so the preview shows this device's (spec R5).
    const loadProfile = useCallback(() => store.getTeamProfile(), [store]);
    const profile = useStoreResult(loadProfile, useTeamProfileVersion(store));
    const teamMark = profile.kind === "ready" && profile.data ? toTeamMark(profile.data, LOCAL_TEAM_ID) : null;
    const ai = useAiSettings(store);
    const aiOn = ai.kind === "ready" && ai.data.enabled;

    useEffect(() => {
        if (!pending) return;
        const choice = Symbol("link");
        latestChoice.current = choice;
        // The plan must not linger in the address bar or history. This routes to
        // #/import and clears `pending`, so the read below must outlive it.
        replaceHash(staticRoutes.importPlan());
        void readPlanLink(pending).then((result) => {
            if (latestChoice.current === choice) setState(toViewState(result));
        });
    }, [pending]);

    const chooseFile = () => fileInput.current?.click();

    // Back to the import page, with the templates offered again.
    const startOver = () => {
        latestChoice.current = null;
        clearError();
        setState({ kind: "pick" });
    };

    const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = ""; // choosing the same file again still fires change
        if (!file) return;
        const choice = Symbol("file");
        latestChoice.current = choice;
        clearError();
        const result = await readPlanFile(file);
        // A link pasted while the file was being read wins.
        if (latestChoice.current === choice) setState(toViewState(result));
    };

    return (
        <>
            <PageHeader title="Import a practice plan" subtitle="Open a plan file, or a link from OpenLeague." />
            <input
                ref={fileInput}
                type="file"
                accept=".json,application/json"
                hidden
                data-testid="plan-file-input"
                onChange={(event) => void onFile(event)}
            />
            <Stack spacing={2}>
                {state.kind === "pick" && (
                    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
                        <Typography sx={{ mb: 2 }}>Choose a plan file (.olplan.json) exported from OpenLeague or this planner.</Typography>
                        <Button variant="contained" startIcon={<UploadIcon />} onClick={chooseFile}>
                            Choose plan file
                        </Button>
                    </Paper>
                )}

                {state.kind === "pick" && aiOn && (
                    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
                        <Typography variant="h6" component="h2" fontWeight={700}>
                            {NOTES_CARD_TITLE}
                        </Typography>
                        <Typography color="text.secondary" sx={{ mb: 2 }}>
                            Paste your practice notes and send them to the AI provider you set up. You review the draft before anything is saved.
                        </Typography>
                        <Button variant="outlined" startIcon={<NotesIcon />} href={staticRoutes.importNotes()} sx={{ minHeight: 44 }}>
                            Paste notes
                        </Button>
                    </Paper>
                )}

                {state.kind === "pick" && (
                    <StarterTemplatePicker
                        onUse={(template) => {
                            // Newest choice wins, as for a file or a link.
                            latestChoice.current = Symbol("template");
                            clearError();
                            setState(toViewState(starterTemplateImport(template, planGenerator), true));
                        }}
                    />
                )}

                {state.kind === "reading" && <Typography color="text.secondary">Reading the plan…</Typography>}

                {state.kind === "error" && (
                    <Alert
                        severity="error"
                        action={
                            <Button color="inherit" size="small" onClick={chooseFile}>
                                Choose another file
                            </Button>
                        }
                    >
                        <Typography fontWeight={600}>{state.error.message}</Typography>
                        {state.error.issues && state.error.issues.length > 0 && (
                            <Box component="ul" sx={{ m: 0, mt: 1, pl: 2.5 }}>
                                {state.error.issues.map((issue, index) => (
                                    <li key={index}>{issue}</li>
                                ))}
                            </Box>
                        )}
                    </Alert>
                )}

                {state.kind === "ready" && (
                    <PlanReviewPanel
                        plan={state.plan}
                        teamMark={teamMark}
                        offerAddToLibrary={!state.fromTemplate}
                        addToLibrary={addToLibrary}
                        onAddToLibraryChange={setAddToLibrary}
                        saving={saving}
                        saveError={saveError}
                        // A template's drills are already offered in the library as starters.
                        onSave={() => void save(state.plan, addToLibrary && !state.fromTemplate)}
                        secondary={state.fromTemplate ? { label: "Start over", onClick: startOver } : { label: "Choose another file", onClick: chooseFile }}
                    />
                )}
            </Stack>
        </>
    );
}

/**
 * Import a practice plan into this browser (ADR-0020): a chosen file, or a
 * #plan= link from the hosted Export menu. The link is read once and the
 * address bar is replaced with #/import, so the plan never lingers in the
 * URL or history. One instance serves both routes (App keys it "import"), and
 * the pending link lives in state, so the URL change can't cancel decoding.
 * Leaving #plan= clears the pending link, so pasting the same link again reads it again.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Box, Button, Checkbox, FormControlLabel, Paper, Stack, Typography } from "@mui/material";
import { FileUploadOutlined as UploadIcon } from "@mui/icons-material";
import { PageHeader } from "@/components/ui/PageHeader";
import { PlanPreview } from "@/components/features/practice-planner/PlanPreview";
import { StarterTemplatePicker, starterTemplateImport } from "@/components/features/practice-planner/StarterTemplatePicker";
import { usePlannerPlatform } from "@/lib/planner-store";
import { readPlanFile, readPlanLink, type ParsePlanResult, type PlanDocument, type PlanError } from "@/lib/plan-document";
import { parseDateTimeLocalToUtc, resolveTimeZone } from "@/lib/utils/date";
import { toTeamMark } from "@/lib/utils/team-mark";
import { LOCAL_TEAM_ID } from "../config";
import { replaceHash } from "../platform";
import { staticRoutes } from "../routes";
import type { LocalPlannerStore } from "../store/types";
import { useStoreResult } from "./useStoreResult";
import { useTeamProfileVersion } from "./useTeamProfile";

/** The plan's local date and start in this browser's zone; midnight without a start; now without a date. */
export function planStartDate(plan: PlanDocument, now: Date = new Date()): Date {
    const { date, startTime } = plan.session;
    if (!date) return now;
    return parseDateTimeLocalToUtc(`${date}T${startTime ?? "00:00"}`, resolveTimeZone(null)) ?? now;
}

type ViewState =
    | { kind: "pick" }
    | { kind: "reading" }
    | { kind: "error"; error: PlanError }
    | { kind: "ready"; plan: PlanDocument; fromTemplate: boolean };

function toViewState(result: ParsePlanResult, fromTemplate = false): ViewState {
    return result.ok ? { kind: "ready", plan: result.plan, fromTemplate } : { kind: "error", error: result.error };
}

const UNDATED_PLAN_NOTE = "This plan has no date, so it will be saved with today's date and time. You can change the date in Edit.";

export function ImportScreen({ store, linkValue }: { store: LocalPlannerStore; linkValue: string | null }) {
    const { navigate, planGenerator } = usePlannerPlatform();
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
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    // The device's "Your team": a plan file has no team, so the preview shows this device's (spec R5).
    const loadProfile = useCallback(() => store.getTeamProfile(), [store]);
    const profile = useStoreResult(loadProfile, useTeamProfileVersion(store));
    const teamMark = profile.kind === "ready" && profile.data ? toTeamMark(profile.data, LOCAL_TEAM_ID) : null;

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
        setSaveError(null);
        setState({ kind: "pick" });
    };

    const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = ""; // choosing the same file again still fires change
        if (!file) return;
        const choice = Symbol("file");
        latestChoice.current = choice;
        setSaveError(null);
        const result = await readPlanFile(file);
        // A link pasted while the file was being read wins.
        if (latestChoice.current === choice) setState(toViewState(result));
    };

    const save = async (plan: PlanDocument, fromTemplate: boolean) => {
        setSaving(true);
        setSaveError(null);
        // A template's drills are already offered in the library as starters.
        const result = await store.importPlan(plan, { date: planStartDate(plan), addToLibrary: addToLibrary && !fromTemplate });
        setSaving(false);
        if (!result.success) {
            setSaveError(result.error);
            return;
        }
        navigate(staticRoutes.session(result.data.sessionId));
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

                {state.kind === "pick" && (
                    <StarterTemplatePicker
                        onUse={(template) => {
                            // Newest choice wins, as for a file or a link.
                            latestChoice.current = Symbol("template");
                            setSaveError(null);
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
                    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
                        <PlanPreview plan={state.plan} teamMark={teamMark} />
                        {!state.plan.session.date && (
                            <Alert severity="info" sx={{ mt: 2 }}>
                                {UNDATED_PLAN_NOTE}
                            </Alert>
                        )}
                        {!state.fromTemplate && (
                            <FormControlLabel
                                sx={{ mt: 2 }}
                                control={<Checkbox checked={addToLibrary} onChange={(event) => setAddToLibrary(event.target.checked)} />}
                                label="Also add these drills to my library"
                            />
                        )}
                        {saveError && (
                            <Alert severity="error" sx={{ mt: 2 }}>
                                {saveError}
                            </Alert>
                        )}
                        <Stack direction="row" spacing={1} sx={{ mt: 2 }} flexWrap="wrap" useFlexGap>
                            <Button variant="contained" disabled={saving} onClick={() => void save(state.plan, state.fromTemplate)}>
                                {saving ? "Saving…" : "Save to my practices"}
                            </Button>
                            {state.fromTemplate ? (
                                <Button onClick={startOver} disabled={saving}>
                                    Start over
                                </Button>
                            ) : (
                                <Button onClick={chooseFile} disabled={saving}>
                                    Choose another file
                                </Button>
                            )}
                        </Stack>
                    </Paper>
                )}
            </Stack>
        </>
    );
}

/**
 * Import a practice plan into this browser (ADR-0020): a chosen file, or a
 * #plan= link from the hosted Export menu. The link is read once and the
 * address bar is replaced with #/import, so the plan never lingers in the
 * URL or history. One instance serves both routes (App keys it "import"), and
 * the pending link lives in state, so the URL change can't cancel decoding.
 */
import { useEffect, useRef, useState } from "react";
import { Alert, Box, Button, Checkbox, FormControlLabel, Paper, Stack, Typography } from "@mui/material";
import { FileUploadOutlined as UploadIcon } from "@mui/icons-material";
import { PageHeader } from "@/components/ui/PageHeader";
import { PlanPreview } from "@/components/features/practice-planner/PlanPreview";
import { usePlannerPlatform } from "@/lib/planner-store";
import { readPlanFile, readPlanLink, type ParsePlanResult, type PlanDocument, type PlanError } from "@/lib/plan-document";
import { parseDateTimeLocalToUtc, resolveTimeZone } from "@/lib/utils/date";
import { PRIVACY_NOTE } from "../config";
import { staticRoutes } from "../routes";
import type { LocalPlannerStore } from "../store/types";

/** The plan's local date and start in this browser's zone; midnight without a start; now without a date. */
export function planStartDate(plan: PlanDocument, now: Date = new Date()): Date {
    const { date, startTime } = plan.session;
    if (!date) return now;
    return parseDateTimeLocalToUtc(`${date}T${startTime ?? "00:00"}`, resolveTimeZone(null)) ?? now;
}

type ViewState = { kind: "pick" } | { kind: "reading" } | { kind: "error"; error: PlanError } | { kind: "ready"; plan: PlanDocument };

function toViewState(result: ParsePlanResult): ViewState {
    return result.ok ? { kind: "ready", plan: result.plan } : { kind: "error", error: result.error };
}

export function ImportScreen({ store, linkValue }: { store: LocalPlannerStore; linkValue: string | null }) {
    const { navigate } = usePlannerPlatform();
    const fileInput = useRef<HTMLInputElement>(null);
    const [pending, setPending] = useState<string | null>(linkValue);
    const [state, setState] = useState<ViewState>(linkValue ? { kind: "reading" } : { kind: "pick" });
    // A newly pasted link replaces the current one (adjusting state during render, not in an effect).
    if (linkValue && linkValue !== pending) {
        setPending(linkValue);
        setState({ kind: "reading" });
    }
    const [addToLibrary, setAddToLibrary] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    useEffect(() => {
        if (!pending) return;
        // The plan must not linger in the address bar or history (no hashchange fires).
        window.history.replaceState(window.history.state, "", staticRoutes.importPlan());
        let cancelled = false;
        void readPlanLink(pending).then((result) => {
            if (!cancelled) setState(toViewState(result));
        });
        return () => {
            cancelled = true;
        };
    }, [pending]);

    const chooseFile = () => fileInput.current?.click();

    const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = ""; // choosing the same file again still fires change
        if (!file) return;
        setSaveError(null);
        setState(toViewState(await readPlanFile(file)));
    };

    const save = async (plan: PlanDocument) => {
        setSaving(true);
        setSaveError(null);
        const result = await store.importPlan(plan, { date: planStartDate(plan), addToLibrary });
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
                        <PlanPreview plan={state.plan} />
                        <FormControlLabel
                            sx={{ mt: 2 }}
                            control={<Checkbox checked={addToLibrary} onChange={(event) => setAddToLibrary(event.target.checked)} />}
                            label="Also add these drills to my library"
                        />
                        {saveError && (
                            <Alert severity="error" sx={{ mt: 2 }}>
                                {saveError}
                            </Alert>
                        )}
                        <Stack direction="row" spacing={1} sx={{ mt: 2 }} flexWrap="wrap" useFlexGap>
                            <Button variant="contained" disabled={saving} onClick={() => void save(state.plan)}>
                                {saving ? "Saving…" : "Save to my practices"}
                            </Button>
                            <Button onClick={chooseFile} disabled={saving}>
                                Choose another file
                            </Button>
                        </Stack>
                    </Paper>
                )}

                <Typography variant="body2" color="text.secondary">
                    {PRIVACY_NOTE}
                </Typography>
            </Stack>
        </>
    );
}

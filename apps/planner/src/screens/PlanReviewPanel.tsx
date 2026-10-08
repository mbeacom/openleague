/**
 * The import preview's review-and-save panel (ADR-0020), shared by a plan
 * file, a link, a template and an AI draft (ADR-0023, spec R7), so a draft
 * lands in the same preview and is saved by the same button, or not at all.
 */
import { useCallback, useState, type ReactNode } from "react";
import { Alert, Button, Checkbox, FormControlLabel, Paper, Stack } from "@mui/material";
import { PlanPreview } from "@/components/features/practice-planner/PlanPreview";
import { usePlannerPlatform } from "@/lib/planner-store";
import { parseDateTimeLocalToUtc, resolveTimeZone } from "@/lib/utils/date";
import type { PlanDocument } from "@/lib/plan-document";
import type { TeamMark } from "@/types/practice-planner";
import { staticRoutes } from "../routes";
import type { LocalPlannerStore } from "../store/types";

export const UNDATED_PLAN_NOTE = "This plan has no date, so it will be saved with today's date and time. You can change the date in Edit.";

/** The plan's local date and start in this browser's zone; midnight without a start; now without a date. */
export function planStartDate(plan: PlanDocument, now: Date = new Date()): Date {
    const { date, startTime } = plan.session;
    if (!date) return now;
    return parseDateTimeLocalToUtc(`${date}T${startTime ?? "00:00"}`, resolveTimeZone(null)) ?? now;
}

/** Saving a reviewed plan, then opening the new practice. */
export function usePlanSave(store: LocalPlannerStore) {
    const { navigate } = usePlannerPlatform();
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const save = useCallback(
        async (plan: PlanDocument, addToLibrary: boolean) => {
            setSaving(true);
            setSaveError(null);
            const result = await store.importPlan(plan, { date: planStartDate(plan), addToLibrary });
            setSaving(false);
            if (!result.success) {
                setSaveError(result.error);
                return;
            }
            navigate(staticRoutes.session(result.data.sessionId));
        },
        [store, navigate],
    );
    const clearError = useCallback(() => setSaveError(null), []);
    return { save, saving, saveError, clearError };
}

export interface PlanReviewPanelProps {
    plan: PlanDocument;
    teamMark: TeamMark | null;
    /** Shown above the preview, such as the AI draft label. */
    notice?: ReactNode;
    /** Shown under a drill whose diagram is empty. */
    emptyDiagramCaption?: string;
    /** Extra controls under the preview, before the buttons. */
    children?: ReactNode;
    /** Offer "Also add these drills to my library" (not for a template, whose drills are starters already). */
    offerAddToLibrary: boolean;
    addToLibrary: boolean;
    onAddToLibraryChange: (value: boolean) => void;
    saving: boolean;
    saveError: string | null;
    onSave: () => void;
    secondary: { label: string; onClick: () => void };
}

export function PlanReviewPanel({
    plan,
    teamMark,
    notice,
    emptyDiagramCaption,
    children,
    offerAddToLibrary,
    addToLibrary,
    onAddToLibraryChange,
    saving,
    saveError,
    onSave,
    secondary,
}: PlanReviewPanelProps) {
    return (
        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
            {notice}
            <PlanPreview plan={plan} teamMark={teamMark} emptyDiagramCaption={emptyDiagramCaption} />
            {!plan.session.date && (
                <Alert severity="info" sx={{ mt: 2 }}>
                    {UNDATED_PLAN_NOTE}
                </Alert>
            )}
            {children}
            {offerAddToLibrary && (
                <FormControlLabel
                    sx={{ mt: 2 }}
                    control={<Checkbox checked={addToLibrary} onChange={(event) => onAddToLibraryChange(event.target.checked)} />}
                    label="Also add these drills to my library"
                />
            )}
            {saveError && (
                <Alert severity="error" sx={{ mt: 2 }}>
                    {saveError}
                </Alert>
            )}
            <Stack direction="row" spacing={1} sx={{ mt: 2 }} flexWrap="wrap" useFlexGap>
                <Button variant="contained" disabled={saving} onClick={onSave}>
                    {saving ? "Saving…" : "Save to my practices"}
                </Button>
                <Button onClick={secondary.onClick} disabled={saving}>
                    {secondary.label}
                </Button>
            </Stack>
        </Paper>
    );
}

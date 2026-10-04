"use client";

/**
 * Import a practice plan (ADR-0020). The plan arrives as a chosen file, a
 * `#plan=` fragment, or a fragment the login page stashed (pending.ts). The
 * coach previews it, picks a team, confirms the date and start, and the
 * import opens the new session in the editor.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Box, Button, Checkbox, FormControlLabel, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import { FileUploadOutlined as UploadIcon } from "@mui/icons-material";
import { PageHeader } from "@/components/ui/PageHeader";
import { PlanPreview } from "@/components/features/practice-planner/PlanPreview";
import { StarterTemplatePicker, starterTemplateImport } from "@/components/features/practice-planner/StarterTemplatePicker";
import { importPracticePlan } from "@/lib/actions/practice-plan-import";
import { parseDateTimeLocalToUtc, resolveTimeZone } from "@/lib/utils/date";
import {
    FILE_TOO_LARGE_MESSAGE,
    MAX_PLAN_FILE_BYTES,
    planByteLength,
    readPlanFile,
    readPlanLink,
    type ParsePlanResult,
    type PlanDocument,
    type PlanError,
} from "@/lib/plan-document";
import { takeIncomingPlan } from "@/lib/plan-document/pending";
import { usePlannerPlatform } from "@/lib/planner-store";

export { FILE_TOO_LARGE_MESSAGE, readPlanFile };

export const PLAN_TOO_LARGE_TO_IMPORT_MESSAGE = `This plan is too large to import (over ${MAX_PLAN_FILE_BYTES / 1000} KB).`;
export const NO_IMPORT_TEAMS_MESSAGE = "Only team admins can import practice plans. Ask an admin of your team to import it.";

type ViewState = { kind: "pick" } | { kind: "error"; error: PlanError } | { kind: "ready"; plan: PlanDocument; fromTemplate: boolean };

function toViewState(result: ParsePlanResult, fromTemplate = false): ViewState {
    return result.ok ? { kind: "ready", plan: result.plan, fromTemplate } : { kind: "error", error: result.error };
}

type Team = { id: string; name: string };

interface PlanImportViewProps {
    teams: Team[];
}

export function PlanImportView({ teams }: PlanImportViewProps) {
    const router = useRouter();
    const { planGenerator } = usePlannerPlatform();
    const fileInput = useRef<HTMLInputElement>(null);
    // undefined = not looked yet. takeIncomingPlan consumes the hash and the
    // stash, so StrictMode's effect replay must reuse this value, not take again.
    const incoming = useRef<string | null | undefined>(undefined);
    const [state, setState] = useState<ViewState>({ kind: "pick" });
    // Every choice (file, link, template, start over) replaces this; a slower
    // read that finishes after a newer choice is dropped.
    const latestChoice = useRef<symbol | null>(null);
    const choose = (next: ViewState) => {
        latestChoice.current = null;
        setState(next);
    };

    useEffect(() => {
        if (incoming.current === undefined) incoming.current = takeIncomingPlan();
        const value = incoming.current;
        if (!value) return;
        const choice = Symbol("link");
        latestChoice.current = choice;
        void readPlanLink(value).then((result) => {
            if (latestChoice.current === choice) setState(toViewState(result));
        });
        return () => {
            if (latestChoice.current === choice) latestChoice.current = null;
        };
    }, []);

    const chooseFile = () => fileInput.current?.click();

    const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = ""; // so choosing the same file again still fires change
        if (!file) return;
        const choice = Symbol("file");
        latestChoice.current = choice;
        const result = await readPlanFile(file);
        if (latestChoice.current === choice) setState(toViewState(result));
    };

    return (
        <>
            <PageHeader title="Import practice plan" subtitle="Open a plan file or a link from the OpenLeague planner" />
            <input
                ref={fileInput}
                type="file"
                accept=".json,application/json"
                hidden
                data-testid="plan-file-input"
                onChange={(event) => void onFile(event)}
            />
            <Stack spacing={2}>
                {teams.length === 0 && <Alert severity="info">{NO_IMPORT_TEAMS_MESSAGE}</Alert>}

                {state.kind === "pick" && (
                    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
                        <Typography sx={{ mb: 2 }}>Choose a plan file (.olplan.json) exported from OpenLeague.</Typography>
                        <Button variant="contained" startIcon={<UploadIcon />} onClick={chooseFile}>
                            Choose plan file
                        </Button>
                    </Paper>
                )}

                {state.kind === "pick" && (
                    <StarterTemplatePicker onUse={(template) => choose(toViewState(starterTemplateImport(template, planGenerator), true))} />
                )}

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
                    <PlanImportForm
                        // A new plan resets the form's prefilled fields.
                        key={state.plan.exportedAt + state.plan.session.title}
                        plan={state.plan}
                        teams={teams}
                        fromTemplate={state.fromTemplate}
                        onChooseAnother={chooseFile}
                        onStartOver={() => choose({ kind: "pick" })}
                        onImported={(sessionId) => router.push(`/practice-planner/${sessionId}/edit`)}
                    />
                )}
            </Stack>
        </>
    );
}

interface PlanImportFormProps {
    plan: PlanDocument;
    teams: Team[];
    /** A starter template: no library copy (its drills are already starters), and Start over instead of another file. */
    fromTemplate: boolean;
    onChooseAnother: () => void;
    onStartOver: () => void;
    onImported: (sessionId: string) => void;
}

function PlanImportForm({ plan, teams, fromTemplate, onChooseAnother, onStartOver, onImported }: PlanImportFormProps) {
    const [teamId, setTeamId] = useState(teams.length === 1 ? teams[0].id : "");
    const [date, setDate] = useState(plan.session.date ?? "");
    const [startTime, setStartTime] = useState(plan.session.startTime ?? "");
    const [addToLibrary, setAddToLibrary] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<{ message: string; details: string[] } | null>(null);

    // Combined in the coach's browser zone; a venue booking added later in the editor uses the venue's zone.
    const when = date && startTime ? parseDateTimeLocalToUtc(`${date}T${startTime}`, resolveTimeZone()) : null;
    const canImport = Boolean(teamId) && when !== null && !submitting;

    const submit = async () => {
        if (!teamId || !when) return;
        // The action's request body is capped at 1 MB; refuse here rather than fail as a network error.
        if (planByteLength(plan) > MAX_PLAN_FILE_BYTES) {
            setError({ message: PLAN_TOO_LARGE_TO_IMPORT_MESSAGE, details: [] });
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const result = await importPracticePlan({ teamId, document: plan, date: when.toISOString(), addToLibrary: addToLibrary && !fromTemplate });
            if (result.success) {
                onImported(result.data.sessionId); // stays "submitting" while the editor loads
                return;
            }
            const details = Array.isArray(result.details)
                ? result.details.filter((detail): detail is string => typeof detail === "string")
                : [];
            setError({ message: result.error, details });
        } catch (caught) {
            console.error("Import practice plan failed:", caught);
            setError({ message: "Couldn't reach OpenLeague. Please try again.", details: [] });
        }
        setSubmitting(false);
    };

    return (
        <Stack spacing={2}>
            <PlanPreview plan={plan} />
            <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
                <Stack spacing={2}>
                    {teams.length > 0 && (
                        <TextField select label="Team" value={teamId} onChange={(event) => setTeamId(event.target.value)} fullWidth>
                            {teams.map((team) => (
                                <MenuItem key={team.id} value={team.id}>
                                    {team.name}
                                </MenuItem>
                            ))}
                        </TextField>
                    )}
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                        <TextField
                            type="date"
                            label="Date"
                            value={date}
                            onChange={(event) => setDate(event.target.value)}
                            slotProps={{ inputLabel: { shrink: true } }}
                            fullWidth
                        />
                        <TextField
                            type="time"
                            label="Start time"
                            value={startTime}
                            onChange={(event) => setStartTime(event.target.value)}
                            slotProps={{ inputLabel: { shrink: true } }}
                            fullWidth
                        />
                    </Stack>
                    {!fromTemplate && (
                        <FormControlLabel
                            control={<Checkbox checked={addToLibrary} onChange={(event) => setAddToLibrary(event.target.checked)} />}
                            label="Also add these drills to the team library"
                        />
                    )}
                    {error && (
                        <Alert severity="error">
                            {error.message}
                            {error.details.length > 0 && (
                                <Box component="ul" sx={{ m: 0, mt: 1, pl: 2.5 }}>
                                    {error.details.map((detail, index) => (
                                        <li key={index}>{detail}</li>
                                    ))}
                                </Box>
                            )}
                        </Alert>
                    )}
                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                        {fromTemplate ? <Button onClick={onStartOver}>Start over</Button> : <Button onClick={onChooseAnother}>Choose another file</Button>}
                        <Button variant="contained" disabled={!canImport} onClick={() => void submit()}>
                            Import plan
                        </Button>
                    </Stack>
                </Stack>
            </Paper>
        </Stack>
    );
}

/**
 * Practice notes → a draft plan, #/import/notes (ADR-0023, spec R1, R7, R9).
 * Edit → preview (the exact request) → Send (after the disclosure, once per
 * provider) → streaming with Stop → the draft in the import preview. Nothing
 * is sent before Send, and nothing is saved before "Save to my practices".
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Alert, Box, Button, FormControlLabel, LinearProgress, Paper, Stack, Switch, TextField, Typography } from "@mui/material";
import { PageHeader } from "@/components/ui/PageHeader";
import {
    NOTES_MAX_INPUT_CHARS,
    buildNotesRequest,
    createProvider,
    libraryMatches,
    parseNameList,
    parseNotesReply,
    withLibraryDiagrams,
    type AiProvider,
    type NotesRequest,
    type ProviderConfig,
} from "@/lib/ai";
import type { PlanDocument } from "@/lib/plan-document";
import { toTeamMark } from "@/lib/utils/team-mark";
import type { PlayData } from "@/types/practice-planner";
import { AI_ORIGINS, LOCAL_TEAM_ID } from "../config";
import { staticRoutes } from "../routes";
import type { LocalPlannerStore } from "../store/types";
import { PlanReviewPanel, usePlanSave } from "../screens/PlanReviewPanel";
import { useAiSettings } from "../screens/useAiSettings";
import { useStoreResult } from "../screens/useStoreResult";
import { useTeamProfileVersion } from "../screens/useTeamProfile";
import { DisclosureDialog } from "./DisclosureDialog";
import { countRequest, getKey, hasKey, keysVersion, requestCount, subscribeKeys } from "./key-holder";
import { PROVIDER_PRESETS } from "./presets";
import { RequestPreview } from "./RequestPreview";
import { acknowledgementFor, isAcknowledged, type AiSettings } from "./settings";

export const DRAFT_LABEL = "Draft from your AI provider: check every row";
export const NO_DIAGRAM_CAPTION = "No diagram yet";
export const AI_OFF_MESSAGE = "AI assistance is off. Turn it on in AI settings to draft plans from notes.";
export const SET_UP_MESSAGE = "Choose a provider, a model and (for Anthropic or OpenAI) a key in AI settings first. Keys are held in this tab only, so after a reload the planner asks for it again.";

type Phase =
    | { kind: "edit" }
    | { kind: "preview"; built: NotesRequest }
    | { kind: "sending"; built: NotesRequest; received: number }
    | { kind: "failed"; built: NotesRequest; message: string; issues: string[] }
    | { kind: "review"; plan: PlanDocument };

/** Injected in tests; the app uses the real adapters with the build's origin list. */
export type ProviderFactory = (config: ProviderConfig) => AiProvider;
const realFactory: ProviderFactory = (config) => createProvider(config, { allowedOrigins: AI_ORIGINS });

/** The provider ready to use, or null when settings are incomplete. */
function readiness(settings: AiSettings): { config: ProviderConfig; model: string } | null {
    const kind = settings.active;
    if (!settings.enabled || !kind) return null;
    const provider = settings.providers[kind];
    const preset = PROVIDER_PRESETS[kind];
    if (!provider.model.trim()) return null;
    if (preset.needsKey && !hasKey(kind)) return null;
    if (kind === "openai-compatible" && !provider.baseUrl.trim()) return null;
    return { config: { kind, apiKey: getKey(kind), baseUrl: provider.baseUrl }, model: provider.model.trim() };
}

export function NotesDraftScreen({ store, providerFactory = realFactory }: { store: LocalPlannerStore; providerFactory?: ProviderFactory }) {
    const loaded = useAiSettings(store);
    useSyncExternalStore(subscribeKeys, keysVersion, () => 0);
    const loadProfile = useCallback(() => store.getTeamProfile(), [store]);
    const profile = useStoreResult(loadProfile, useTeamProfileVersion(store));
    const teamMark = profile.kind === "ready" && profile.data ? toTeamMark(profile.data, LOCAL_TEAM_ID) : null;

    const [notes, setNotes] = useState("");
    const [staffNames, setStaffNames] = useState("");
    const [otherNames, setOtherNames] = useState("");
    const [phase, setPhase] = useState<Phase>({ kind: "edit" });
    const [disclosureOpen, setDisclosureOpen] = useState(false);
    const [library, setLibrary] = useState<Map<number, PlayData>>(new Map());
    const [useLibrary, setUseLibrary] = useState(true);
    const [addToLibrary, setAddToLibrary] = useState(false);
    const controller = useRef<AbortController | null>(null);
    const { save, saving, saveError } = usePlanSave(store);

    // Leaving the screen stops a request in flight.
    useEffect(() => () => controller.current?.abort(), []);
    // The draft as it would be saved: with matched library diagrams when the coach keeps that on.
    const reviewedPlan = useMemo(
        () => (phase.kind !== "review" ? null : useLibrary && library.size > 0 ? withLibraryDiagrams(phase.plan, library) : phase.plan),
        [phase, useLibrary, library],
    );

    if (loaded.kind === "loading") return <Typography color="text.secondary">Loading…</Typography>;
    if (loaded.kind === "error") return <Alert severity="error">{loaded.message}</Alert>;
    const settings = loaded.data;
    const ready = readiness(settings);
    const kind = settings.active;
    const preset = kind ? PROVIDER_PRESETS[kind] : null;

    const header = <PageHeader title="Draft a plan from notes" subtitle="Paste your notes, check the request, then send it to your AI provider." />;
    if (!settings.enabled || !ready || !kind || !preset) {
        return (
            <>
                {header}
                <Alert
                    severity="info"
                    action={
                        <Button color="inherit" href={staticRoutes.aiSettings()} sx={{ minHeight: 44 }}>
                            AI settings
                        </Button>
                    }
                >
                    {settings.enabled ? SET_UP_MESSAGE : AI_OFF_MESSAGE}
                </Alert>
            </>
        );
    }

    const preview = () => {
        const built = buildNotesRequest({ notes, model: ready.model, staffNames: parseNameList(staffNames), otherNames: parseNameList(otherNames) });
        setPhase({ kind: "preview", built });
    };

    const send = async (built: NotesRequest) => {
        const abort = new AbortController();
        controller.current = abort;
        countRequest();
        setPhase({ kind: "sending", built, received: 0 });
        const provider = providerFactory(ready.config);
        let received = 0;
        for await (const event of provider.send(built.request, abort.signal)) {
            if (event.type === "text") {
                received += event.delta.length;
                setPhase({ kind: "sending", built, received });
            } else if (event.type === "error") {
                setPhase({ kind: "failed", built, message: event.message, issues: [] });
                return;
            } else {
                const result = parseNotesReply(event.text, built.redaction.restore);
                if (!result.ok) {
                    setPhase({ kind: "failed", built, message: result.message, issues: result.issues });
                    return;
                }
                setLibrary(await libraryDiagrams(store, result.plan));
                setPhase({ kind: "review", plan: result.plan });
                return;
            }
        }
    };

    const onSend = (built: NotesRequest) => {
        if (!isAcknowledged(settings, kind)) {
            setDisclosureOpen(true);
            return;
        }
        void send(built);
    };

    const acceptDisclosure = async (built: NotesRequest) => {
        setDisclosureOpen(false);
        const provider = settings.providers[kind];
        await store.saveAiSettings({
            ...settings,
            providers: { ...settings.providers, [kind]: { ...provider, acknowledged: acknowledgementFor(kind, provider.baseUrl) } },
        });
        void send(built);
    };

    const editing = phase.kind === "edit";
    const notesTooLong = notes.length > NOTES_MAX_INPUT_CHARS;

    return (
        <>
            {header}
            <Stack spacing={2}>
                {phase.kind !== "review" && (
                    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
                        <Stack spacing={2}>
                            <TextField
                                label="Practice notes"
                                multiline
                                minRows={6}
                                maxRows={16}
                                value={notes}
                                disabled={!editing}
                                onChange={(event) => setNotes(event.target.value)}
                                error={notesTooLong}
                                helperText={`${notes.length.toLocaleString("en-US")} / ${NOTES_MAX_INPUT_CHARS.toLocaleString("en-US")} characters${notesTooLong ? ". Only the first part will be sent." : ""}`}
                            />
                            <Typography variant="body2" color="text.secondary">
                                Replace names: list any names to swap for placeholders before sending. They are put back in the draft. Only the names
                                you list are replaced, so check the preview.
                            </Typography>
                            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                                <TextField
                                    label="Coaches' names (sent as Coach 1, Coach 2…)"
                                    multiline
                                    minRows={2}
                                    value={staffNames}
                                    disabled={!editing}
                                    onChange={(event) => setStaffNames(event.target.value)}
                                    helperText="One per line, or separated by commas"
                                    fullWidth
                                />
                                <TextField
                                    label="Other names, such as players (sent as Player 1…)"
                                    multiline
                                    minRows={2}
                                    value={otherNames}
                                    disabled={!editing}
                                    onChange={(event) => setOtherNames(event.target.value)}
                                    helperText="One per line, or separated by commas"
                                    fullWidth
                                />
                            </Stack>
                            {editing && (
                                <Box>
                                    <Button variant="contained" disabled={!notes.trim()} onClick={preview} sx={{ minHeight: 44 }}>
                                        Preview request
                                    </Button>
                                </Box>
                            )}
                        </Stack>
                    </Paper>
                )}

                {(phase.kind === "preview" || phase.kind === "sending" || phase.kind === "failed") && (
                    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
                        <RequestPreview
                            request={phase.built.request}
                            redaction={phase.built.redaction}
                            destination={preset.destination}
                            model={ready.model}
                            requestsSoFar={requestCount()}
                        />
                        {phase.kind === "sending" && (
                            <Box sx={{ mt: 2 }} role="status">
                                <LinearProgress />
                                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                                    Receiving the draft… {phase.received.toLocaleString("en-US")} characters so far
                                </Typography>
                            </Box>
                        )}
                        {phase.kind === "failed" && (
                            <Alert severity="error" sx={{ mt: 2 }}>
                                <Typography fontWeight={600}>{phase.message}</Typography>
                                {phase.issues.length > 0 && (
                                    <Box component="ul" sx={{ m: 0, mt: 1, pl: 2.5 }}>
                                        {phase.issues.map((issue, index) => (
                                            <li key={index}>{issue}</li>
                                        ))}
                                    </Box>
                                )}
                            </Alert>
                        )}
                        <Stack direction="row" spacing={1} sx={{ mt: 2 }} flexWrap="wrap" useFlexGap>
                            {phase.kind === "sending" ? (
                                <Button variant="outlined" color="error" onClick={() => controller.current?.abort()} sx={{ minHeight: 44 }}>
                                    Stop
                                </Button>
                            ) : (
                                <>
                                    <Button variant="contained" onClick={() => onSend(phase.built)} sx={{ minHeight: 44 }}>
                                        {phase.kind === "failed" ? `Try again: send to ${preset.destination}` : `Send to ${preset.destination}`}
                                    </Button>
                                    <Button onClick={() => setPhase({ kind: "edit" })} sx={{ minHeight: 44 }}>
                                        Edit notes
                                    </Button>
                                </>
                            )}
                        </Stack>
                        {phase.kind !== "sending" && (
                            <DisclosureDialog
                                open={disclosureOpen}
                                preset={preset}
                                onCancel={() => setDisclosureOpen(false)}
                                onAccept={() => void acceptDisclosure(phase.built)}
                            />
                        )}
                    </Paper>
                )}

                {phase.kind === "review" && (
                    <PlanReviewPanel
                        plan={reviewedPlan ?? phase.plan}
                        teamMark={teamMark}
                        notice={
                            <Alert severity="warning" sx={{ mb: 2 }}>
                                {DRAFT_LABEL}
                            </Alert>
                        }
                        emptyDiagramCaption={NO_DIAGRAM_CAPTION}
                        offerAddToLibrary
                        addToLibrary={addToLibrary}
                        onAddToLibraryChange={setAddToLibrary}
                        saving={saving}
                        saveError={saveError}
                        onSave={() => void save(reviewedPlan ?? phase.plan, addToLibrary)}
                        secondary={{ label: "Discard draft", onClick: () => setPhase({ kind: "edit" }) }}
                    >
                        {library.size > 0 && (
                            <FormControlLabel
                                sx={{ mt: 2, display: "flex" }}
                                control={<Switch checked={useLibrary} onChange={(event) => setUseLibrary(event.target.checked)} />}
                                label={`Use the diagrams from my library for ${library.size} ${library.size === 1 ? "drill" : "drills"} with the same name`}
                            />
                        )}
                    </PlanReviewPanel>
                )}
            </Stack>
        </>
    );
}

/** Diagrams from library drills whose names match drafted drills (spec R1), by row sequence. Read on the device only. */
async function libraryDiagrams(store: LocalPlannerStore, plan: PlanDocument): Promise<Map<number, PlayData>> {
    const listed = await store.getPlaysByTeam({ teamId: LOCAL_TEAM_ID, page: 1, limit: 10_000, dateFilter: "all" });
    if (!listed.success) return new Map();
    const matches = libraryMatches(plan, listed.data.plays);
    const diagrams = new Map<number, PlayData>();
    for (const [sequence, id] of matches) {
        const play = await store.getPlayById({ id, teamId: LOCAL_TEAM_ID });
        if (play.success) diagrams.set(sequence, play.data.playData);
    }
    return diagrams;
}

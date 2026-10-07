/**
 * Import (static rankings spec, Import and editing): paste or open the schedule
 * page, then optionally the snake chart; preview counts and unread lines; merge
 * into the device's rankings, resolving score conflicts; or open a rankings file.
 * Never fetches anything (spec R2).
 */
import { useRef, useState, type ChangeEvent } from "react";
import { Alert, Box, Button, List, ListItem, MenuItem, Stack, TextField, Typography } from "@mui/material";
import {
    applySnakeChart,
    createRankingsDocument,
    mergeSchedule,
    readRankingsFile,
    resolveConflict,
    scheduleTeamNumbers,
    snakeChartFit,
    type GameConflict,
    type RankingsDocument,
    type SnakeChartFit,
} from "@/lib/rankings-document";
import { CSHL_8U_METHOD } from "@/lib/ratings";
import { defaultSeasonYear, parseSchedule, parseSnakeChart, type ParsedSchedule, type ParsedSnakeChart } from "@/lib/ratings/import";
import { navigateTo } from "../../platform";
import { staticRoutes } from "../../routes";
import type { LocalPlannerStore } from "../../store/types";
import { RankingsStatus } from "./display";
import { useRankingsDoc } from "./useRankingsDoc";

export const READ_SCHEDULE_LABEL = "Read schedule";
export const READ_SNAKE_LABEL = "Read snake chart";
export const SAVE_IMPORT_LABEL = "Save rankings";
export const OPEN_FILE_LABEL = "Open rankings file";

export const REPLACE_CONFIRM_MESSAGE = "Replace your current rankings?";
export const REPLACE_LABEL = "Replace";
export const KEEP_MINE_LABEL = "Keep mine";

const PRESETS = [{ id: CSHL_8U_METHOD.preset, label: "CSHL 8U (2025 level sizes)", method: CSHL_8U_METHOD }];
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

type Choice = "existing" | "incoming";

const score = (game: { homeGoals: number | null; awayGoals: number | null }, home: string, gameHome: string) =>
    home === gameHome ? `${game.homeGoals}–${game.awayGoals}` : `${game.awayGoals}–${game.homeGoals}`;

export function RankingsImportScreen({ store }: { store: LocalPlannerStore }) {
    const { state, save, clear } = useRankingsDoc(store);
    const [scheduleText, setScheduleText] = useState("");
    const [snakeText, setSnakeText] = useState("");
    const [seasonYear, setSeasonYear] = useState(() => defaultSeasonYear(new Date()));
    const [presetId, setPresetId] = useState(PRESETS[0].id);
    const [title, setTitle] = useState("Pre-season rankings");
    const [schedule, setSchedule] = useState<ParsedSchedule | null>(null);
    const [snake, setSnake] = useState<ParsedSnakeChart | null>(null);
    const [draft, setDraft] = useState<RankingsDocument | null>(null);
    const [conflicts, setConflicts] = useState<GameConflict[]>([]);
    const [choices, setChoices] = useState<Map<string, Choice>>(new Map());
    /**
     * How the snake chart fits the teams this import concerns: the schedule just
     * read, or, when only a chart is read, the saved teams.
     */
    const [snakeFit, setSnakeFit] = useState<(SnakeChartFit & { scope: "schedule" | "saved" }) | null>(null);
    /** A rankings file waiting for the user to confirm it replaces the saved rankings. */
    const [pendingOpen, setPendingOpen] = useState<RankingsDocument | null>(null);
    const scheduleFile = useRef<HTMLInputElement>(null);
    const snakeFile = useRef<HTMLInputElement>(null);
    const rankingsFile = useRef<HTMLInputElement>(null);
    const [message, setMessage] = useState<{ severity: "error" | "success" | "info"; text: string } | null>(null);

    if (state.status !== "ready") return <RankingsStatus state={state} onStartOver={() => void clear()} />;
    const existing = state.doc;

    /** Everything derived from the inputs: nothing may be saved until the user reads again. */
    const invalidate = () => {
        setSchedule(null);
        setSnake(null);
        setSnakeFit(null);
        setDraft(null);
        setConflicts([]);
        setChoices(new Map());
        setMessage(null);
    };

    const rebuild = (nextSchedule: ParsedSchedule | null, nextSnake: ParsedSnakeChart | null, picked: Map<string, Choice>) => {
        const method = PRESETS.find((p) => p.id === presetId)!.method;
        let doc = existing ?? createRankingsDocument({ title, method });
        const open: GameConflict[] = [];
        if (nextSchedule) {
            const merged = mergeSchedule(doc, nextSchedule);
            doc = merged.doc;
            for (const conflict of merged.summary.conflicts) {
                const choice = picked.get(conflict.key);
                if (choice) doc = resolveConflict(doc, conflict, choice);
                else open.push(conflict);
            }
        }
        if (nextSnake) {
            doc = applySnakeChart(doc, nextSnake).doc;
            const scope = nextSchedule ? scheduleTeamNumbers(nextSchedule) : undefined;
            setSnakeFit({ ...snakeChartFit(doc, nextSnake, scope), scope: scope ? "schedule" : "saved" });
        } else setSnakeFit(null);
        setDraft(doc);
        setConflicts(open);
    };

    const readSchedule = () => {
        const parsed = parseSchedule(scheduleText, { seasonYear });
        const fresh = new Map<string, Choice>();
        setSchedule(parsed);
        setChoices(fresh);
        setMessage(null);
        rebuild(parsed, snake, fresh);
    };
    const readSnake = () => {
        const parsed = parseSnakeChart(snakeText);
        setSnake(parsed);
        setMessage(null);
        rebuild(schedule, parsed, choices);
    };
    const choose = (conflict: GameConflict, choice: Choice) => {
        const next = new Map(choices).set(conflict.key, choice);
        setChoices(next);
        rebuild(schedule, snake, next);
    };
    const editSchedule = (text: string) => {
        setScheduleText(text);
        invalidate();
    };
    const editSnake = (text: string) => {
        setSnakeText(text);
        setSnake(null);
        setSnakeFit(null);
        setMessage(null);
        // An edited chart must be read again before saving; a cleared one simply drops out of the preview.
        if (schedule && !text.trim()) rebuild(schedule, null, choices);
        else setDraft(null);
    };
    /** Reads a picked text file; sets the text only when a file was actually read. */
    const pickText = async (event: ChangeEvent<HTMLInputElement>, apply: (text: string) => void) => {
        const input = event.target;
        const file = input.files?.[0];
        input.value = "";
        if (!file) return;
        try {
            apply(await file.text());
        } catch {
            setMessage({ severity: "error", text: "Couldn't read that file." });
        }
    };
    const commit = async () => {
        if (!draft) return;
        const result = await save(draft);
        if (result.success) navigateTo(staticRoutes.rankings());
        else setMessage({ severity: "error", text: result.error });
    };
    const openFile = async (event: ChangeEvent<HTMLInputElement>) => {
        const input = event.target;
        const file = input.files?.[0];
        input.value = "";
        if (!file) return;
        const parsed = await readRankingsFile(file);
        if (!parsed.ok) {
            setMessage({ severity: "error", text: parsed.error.message });
            return;
        }
        if (existing) {
            setPendingOpen(parsed.doc);
            return;
        }
        await replaceWith(parsed.doc);
    };
    const replaceWith = async (doc: RankingsDocument) => {
        const result = await save(doc);
        if (result.success) navigateTo(staticRoutes.rankings());
        else {
            setPendingOpen(null);
            setMessage({ severity: "error", text: result.error });
        }
    };

    const finals = schedule?.games.filter((g) => g.homeGoals !== null).length ?? 0;
    const scheduled = (schedule?.games.length ?? 0) - finals;
    const withoutBracket = snakeFit?.without ?? [];

    return (
        <Stack spacing={3} sx={{ maxWidth: 820 }}>
            <Typography component="h1" variant="h5" sx={{ fontWeight: 800 }}>
                Import rankings
            </Typography>
            <Typography color="text.secondary">
                Open your league&rsquo;s schedule page, select everything (Ctrl/⌘ + A), copy, and paste it below. You can also save the page and open the file.
                Nothing is sent anywhere: it stays in this browser.
            </Typography>

            {!existing && (
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                    <TextField
                        label="Title"
                        value={title}
                        onChange={(e) => {
                            setTitle(e.target.value);
                            invalidate();
                        }}
                    />
                    <TextField
                        select
                        label="Rules"
                        value={presetId}
                        onChange={(e) => {
                            setPresetId(e.target.value);
                            invalidate();
                        }}
                        sx={{ minWidth: 240 }}
                    >
                        {PRESETS.map((p) => (
                            <MenuItem key={p.id} value={p.id}>
                                {p.label}
                            </MenuItem>
                        ))}
                    </TextField>
                </Stack>
            )}

            <Stack spacing={1}>
                <Typography component="h2" variant="h6">
                    1. Schedule
                </Typography>
                <TextField label="Schedule page" multiline minRows={4} maxRows={10} value={scheduleText} onChange={(e) => editSchedule(e.target.value)} />
                <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
                    <TextField
                        label="Season starts in"
                        type="number"
                        value={seasonYear}
                        onChange={(e) => {
                            setSeasonYear(Number(e.target.value) || defaultSeasonYear(new Date()));
                            invalidate();
                        }}
                        sx={{ width: 160 }}
                    />
                    <Button onClick={() => scheduleFile.current?.click()} sx={{ minHeight: 44 }}>
                        Open saved page
                    </Button>
                    <input
                        ref={scheduleFile}
                        hidden
                        type="file"
                        data-testid="schedule-file-input"
                        accept=".html,.htm,.txt,text/html,text/plain"
                        onChange={(e) => void pickText(e, editSchedule)}
                    />
                    <Button variant="contained" onClick={readSchedule} disabled={!scheduleText.trim()} sx={{ minHeight: 44 }}>
                        {READ_SCHEDULE_LABEL}
                    </Button>
                </Stack>
                {schedule && (
                    <Alert severity={schedule.games.length ? "success" : "warning"}>
                        {`${plural(finals, "completed game")}, ${scheduled} scheduled, ${plural(schedule.teams.length, "team")}`}
                        {schedule.unparsed.length > 0 && (
                            <>
                                <Typography variant="body2" sx={{ mt: 1 }}>
                                    {plural(schedule.unparsed.length, "line")} not understood:
                                </Typography>
                                <List dense>
                                    {schedule.unparsed.map((line, i) => (
                                        <ListItem key={`${i}-${line}`} sx={{ py: 0 }}>
                                            {line}
                                        </ListItem>
                                    ))}
                                </List>
                            </>
                        )}
                    </Alert>
                )}
            </Stack>

            <Stack spacing={1}>
                <Typography component="h2" variant="h6">
                    2. Snake chart (optional)
                </Typography>
                <TextField label="Snake chart" multiline minRows={3} maxRows={8} value={snakeText} onChange={(e) => editSnake(e.target.value)} />
                <Stack direction="row" spacing={1}>
                    <Button onClick={() => snakeFile.current?.click()} sx={{ minHeight: 44 }}>
                        Open saved page
                    </Button>
                    <input
                        ref={snakeFile}
                        hidden
                        type="file"
                        data-testid="snake-file-input"
                        accept=".html,.htm,.txt,text/html,text/plain"
                        onChange={(e) => void pickText(e, editSnake)}
                    />
                    <Button variant="outlined" onClick={readSnake} disabled={!snakeText.trim()} sx={{ minHeight: 44 }}>
                        {READ_SNAKE_LABEL}
                    </Button>
                </Stack>
                {snake && snakeFit && draft && (
                    <Alert severity={snakeFit.matched > 0 ? (withoutBracket.length > 0 ? "warning" : "success") : "warning"}>
                        {`${snakeFit.matched} of ${snakeFit.scope === "schedule" ? `${plural(snakeFit.total, "team")} in this schedule` : plural(snakeFit.total, "saved team")} got a starting bracket from the chart · ${plural(snakeFit.ignored, "chart team")} matched no team`}
                        {snake.unparsed.length > 0 ? ` · ${snake.unparsed.length} without a column: ${snake.unparsed.join(", ")}` : ""}
                        {withoutBracket.length > 0 && (
                            <>
                                <Typography variant="body2" sx={{ mt: 1 }}>
                                    {`Still without a starting bracket, not counting excluded teams (${withoutBracket.length}):`}
                                </Typography>
                                <List dense aria-label="Teams without a starting bracket">
                                    {withoutBracket.map((team) => (
                                        <ListItem key={team.number} sx={{ py: 0 }}>
                                            {`${team.number} ${team.name}`}
                                        </ListItem>
                                    ))}
                                </List>
                            </>
                        )}
                    </Alert>
                )}
            </Stack>

            {conflicts.length > 0 && (
                <Stack spacing={1}>
                    <Typography component="h2" variant="h6">
                        Scores that changed
                    </Typography>
                    {conflicts.map((conflict) => (
                        <Box key={conflict.key} sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                            <Typography sx={{ flex: "1 1 14rem" }}>
                                {conflict.existing.date}: {conflict.existing.home} vs {conflict.existing.away}
                            </Typography>
                            <Button sx={{ minHeight: 44 }} onClick={() => choose(conflict, "existing")}>
                                {`Keep ${score(conflict.existing, conflict.existing.home, conflict.existing.home)}`}
                            </Button>
                            <Button variant="outlined" sx={{ minHeight: 44 }} onClick={() => choose(conflict, "incoming")}>
                                {`Use imported ${score(conflict.incoming, conflict.existing.home, conflict.incoming.home)}`}
                            </Button>
                        </Box>
                    ))}
                </Stack>
            )}

            {message && <Alert severity={message.severity}>{message.text}</Alert>}

            {pendingOpen && (
                <Alert severity="warning">
                    <Typography sx={{ fontWeight: 700 }}>{REPLACE_CONFIRM_MESSAGE}</Typography>
                    <Typography variant="body2">{`Opening "${pendingOpen.meta.title}" replaces "${existing?.meta.title ?? ""}" on this device. Export yours first if you want to keep a copy.`}</Typography>
                    <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: "wrap", rowGap: 1 }}>
                        <Button color="error" variant="outlined" onClick={() => void replaceWith(pendingOpen)} sx={{ minHeight: 44 }}>
                            {REPLACE_LABEL}
                        </Button>
                        <Button onClick={() => setPendingOpen(null)} sx={{ minHeight: 44 }}>
                            {KEEP_MINE_LABEL}
                        </Button>
                    </Stack>
                </Alert>
            )}

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <Button variant="contained" size="large" onClick={() => void commit()} disabled={!draft || conflicts.length > 0} sx={{ minHeight: 44 }}>
                    {SAVE_IMPORT_LABEL}
                </Button>
                <Button onClick={() => rankingsFile.current?.click()} sx={{ minHeight: 44 }}>
                    {OPEN_FILE_LABEL}
                </Button>
                <input ref={rankingsFile} hidden type="file" data-testid="rankings-file-input" accept=".json,application/json" onChange={(e) => void openFile(e)} />
            </Stack>
        </Stack>
    );
}

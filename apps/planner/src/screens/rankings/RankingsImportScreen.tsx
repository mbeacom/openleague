/**
 * Import (static rankings spec, Import and editing): paste or open the schedule
 * page, then optionally the snake chart; preview counts and unread lines; merge
 * into the device's rankings, resolving score conflicts; or open a rankings file.
 * Never fetches anything (spec R2).
 */
import { useState, type ChangeEvent } from "react";
import { Alert, Box, Button, List, ListItem, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { applySnakeChart, createRankingsDocument, mergeSchedule, readRankingsFile, resolveConflict, type GameConflict, type RankingsDocument } from "@/lib/rankings-document";
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

const PRESETS = [{ id: CSHL_8U_METHOD.preset, label: "CSHL 8U", method: CSHL_8U_METHOD }];
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

async function readTextFile(event: ChangeEvent<HTMLInputElement>): Promise<string | null> {
    const file = event.target.files?.[0];
    event.target.value = "";
    return file ? file.text() : null;
}

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
    const [message, setMessage] = useState<{ severity: "error" | "success" | "info"; text: string } | null>(null);

    if (state.status !== "ready") return <RankingsStatus state={state} onStartOver={() => void clear()} />;
    const existing = state.doc;

    const rebuild = (nextSchedule: ParsedSchedule | null, nextSnake: ParsedSnakeChart | null) => {
        const method = PRESETS.find((p) => p.id === presetId)!.method;
        let doc = existing ?? createRankingsDocument({ title, method });
        let found: GameConflict[] = [];
        if (nextSchedule) {
            const merged = mergeSchedule(doc, nextSchedule);
            doc = merged.doc;
            found = merged.summary.conflicts;
        }
        if (nextSnake) doc = applySnakeChart(doc, nextSnake).doc;
        setDraft(doc);
        setConflicts(found);
    };

    const readSchedule = () => {
        const parsed = parseSchedule(scheduleText, { seasonYear });
        setSchedule(parsed);
        rebuild(parsed, snake);
    };
    const readSnake = () => {
        const parsed = parseSnakeChart(snakeText);
        setSnake(parsed);
        rebuild(schedule, parsed);
    };
    const choose = (conflict: GameConflict, choice: "existing" | "incoming") => {
        if (draft) setDraft(resolveConflict(draft, conflict, choice));
        setConflicts((list) => list.filter((c) => c !== conflict));
    };
    const commit = async () => {
        if (!draft) return;
        const result = await save(draft);
        if (result.success) navigateTo(staticRoutes.rankings());
        else setMessage({ severity: "error", text: result.error });
    };
    const openFile = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        const parsed = await readRankingsFile(file);
        if (!parsed.ok) {
            setMessage({ severity: "error", text: parsed.error.message });
            return;
        }
        const result = await save(parsed.doc);
        if (result.success) navigateTo(staticRoutes.rankings());
        else setMessage({ severity: "error", text: result.error });
    };

    const finals = schedule?.games.filter((g) => g.homeGoals !== null).length ?? 0;
    const scheduled = (schedule?.games.length ?? 0) - finals;

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
                    <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
                    <TextField select label="Rules" value={presetId} onChange={(e) => setPresetId(e.target.value)} sx={{ minWidth: 160 }}>
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
                <TextField label="Schedule page" multiline minRows={4} maxRows={10} value={scheduleText} onChange={(e) => setScheduleText(e.target.value)} />
                <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
                    <TextField
                        label="Season starts in"
                        type="number"
                        value={seasonYear}
                        onChange={(e) => setSeasonYear(Number(e.target.value) || defaultSeasonYear(new Date()))}
                        size="small"
                        sx={{ width: 150 }}
                    />
                    <Button component="label" sx={{ minHeight: 44 }}>
                        Open saved page
                        <input hidden type="file" accept=".html,.htm,.txt,text/html,text/plain" onChange={async (e) => setScheduleText((await readTextFile(e)) ?? scheduleText)} />
                    </Button>
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
                                    {schedule.unparsed.map((line) => (
                                        <ListItem key={line} sx={{ py: 0 }}>
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
                <TextField label="Snake chart" multiline minRows={3} maxRows={8} value={snakeText} onChange={(e) => setSnakeText(e.target.value)} />
                <Stack direction="row" spacing={1}>
                    <Button component="label" sx={{ minHeight: 44 }}>
                        Open saved page
                        <input hidden type="file" accept=".html,.htm,.txt,text/html,text/plain" onChange={async (e) => setSnakeText((await readTextFile(e)) ?? snakeText)} />
                    </Button>
                    <Button variant="outlined" onClick={readSnake} disabled={!snakeText.trim()} sx={{ minHeight: 44 }}>
                        {READ_SNAKE_LABEL}
                    </Button>
                </Stack>
                {snake && (
                    <Alert severity={snake.teams.length ? "success" : "warning"}>
                        {`${plural(snake.teams.length, "team")} with a starting bracket`}
                        {snake.unparsed.length > 0 ? ` · ${snake.unparsed.length} without a column: ${snake.unparsed.join(", ")}` : ""}
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

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <Button variant="contained" size="large" onClick={() => void commit()} disabled={!draft || conflicts.length > 0} sx={{ minHeight: 44 }}>
                    {SAVE_IMPORT_LABEL}
                </Button>
                <Button component="label" sx={{ minHeight: 44 }}>
                    {OPEN_FILE_LABEL}
                    <input hidden type="file" accept=".json,application/json" onChange={(e) => void openFile(e)} />
                </Button>
            </Stack>
        </Stack>
    );
}

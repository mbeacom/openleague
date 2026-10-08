/**
 * Import (static rankings spec, Import and editing): paste or open the schedule
 * page, then optionally the snake chart; preview counts and unread lines; merge
 * into the device's rankings, resolving score conflicts; or open a rankings file.
 * Each page's address can be remembered for "Update results" (spec, Updating
 * results). Never fetches anything (spec R2).
 */
import { useRef, useState, type ChangeEvent, type ClipboardEvent } from "react";
import { Alert, Box, Button, List, ListItem, MenuItem, Stack, TextField, Typography } from "@mui/material";
import {
    applySnakeChart,
    createRankingsDocument,
    docSource,
    mergeSchedule,
    pageAddressProblem,
    readRankingsFile,
    resolveConflict,
    scheduleTeamNumbers,
    snakeChartFit,
    type GameConflict,
    type MergeSummary,
    type RankingsDocument,
    type SnakeChartFit,
    withSource,
} from "@/lib/rankings-document";
import { CSHL_8U_METHOD } from "@/lib/ratings";
import { defaultSeasonYear, looksLikeHtml, parseSchedule, parseSnakeChart, savedPageText, type ParsedSchedule, type ParsedSnakeChart } from "@/lib/ratings/import";
import { navigateTo } from "../../platform";
import { staticRoutes } from "../../routes";
import type { LocalPlannerStore } from "../../store/types";
import { RankingsStatus } from "./display";
import { useRankingsDoc } from "./useRankingsDoc";
import { usePulledSchedule } from "./pulled-schedule";

export const READ_SCHEDULE_LABEL = "Read schedule";
export const READ_SNAKE_LABEL = "Read snake chart";
export const SAVE_IMPORT_LABEL = "Save rankings";
export const OPEN_FILE_LABEL = "Open rankings file";

export const REPLACE_CONFIRM_MESSAGE = "Replace your current rankings?";
export const REPLACE_LABEL = "Replace";
export const KEEP_MINE_LABEL = "Keep mine";

export const UPDATE_TITLE = "Update results";
export const UPDATE_HINT = "Select all on the league page, copy, then paste here.";
export const SCHEDULE_ADDRESS_LABEL = "Schedule page address (optional)";
export const SNAKE_ADDRESS_LABEL = "Snake chart page address (optional)";

/** "3 added · 1 updated · 40 unchanged · 1 conflict": what a re-import does to the saved games. */
export function mergeSummaryText(summary: MergeSummary): string {
    const conflicts = summary.conflicts.length;
    return `${summary.added} added · ${summary.updated} updated · ${summary.unchanged} unchanged · ${conflicts} ${conflicts === 1 ? "conflict" : "conflicts"}`;
}

const PRESETS = [{ id: CSHL_8U_METHOD.preset, label: "CSHL 8U (2025 level sizes)", method: CSHL_8U_METHOD }];
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

type Choice = "existing" | "incoming";

/** A pasted or opened page. It stays out of the text box: a page is hundreds of kilobytes of markup. */
interface PageSource {
    label: string;
    content: string;
}

export const PASTED_PAGE_LABEL = "Pasted page content";
const PAGE_FILE_TYPES = ".html,.htm,.txt,.webarchive,text/html,text/plain,application/x-webarchive";

/**
 * A pasted page's HTML when the clipboard has it: a plain-text copy of a page runs its cells
 * together, the HTML keeps them apart. Falls back to the plain text if only that reads, and
 * takes a plain-text-only paste as a page when it reads. Null leaves the paste to the text box.
 */
function pastedPage(event: ClipboardEvent<HTMLElement>, found: (content: string) => number): string | null {
    const html = event.clipboardData.getData("text/html");
    const plain = event.clipboardData.getData("text/plain");
    if (!looksLikeHtml(html)) {
        // Plain text only: treat it as a page when it reads; otherwise it is ordinary typing in the box.
        if (!plain.trim() || found(plain) === 0) return null;
        event.preventDefault();
        return plain;
    }
    event.preventDefault();
    return found(html) === 0 && plain.trim() && found(plain) > 0 ? plain : html;
}

function LoadedPage({ source, found, onClear, clearLabel }: { source: PageSource; found: string; onClear: () => void; clearLabel: string }) {
    return (
        <Box role="status" sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", border: 1, borderColor: "divider", borderRadius: 1, pl: 2, pr: 1, py: 0.5 }}>
            <Typography sx={{ flex: "1 1 14rem", overflowWrap: "anywhere" }}>{`${source.label} (${found})`}</Typography>
            <Button onClick={onClear} aria-label={clearLabel} sx={{ minHeight: 44 }}>
                Clear
            </Button>
        </Box>
    );
}

const score = (game: { homeGoals: number | null; awayGoals: number | null }, home: string, gameHome: string) =>
    home === gameHome ? `${game.homeGoals}–${game.awayGoals}` : `${game.awayGoals}–${game.homeGoals}`;

/** An optional https address field for a league page; it is remembered with the rankings on save. */
function PageAddress({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
    const problem = pageAddressProblem(value);
    return (
        <TextField
            label={label}
            type="url"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://"
            error={problem !== null}
            helperText={problem ?? undefined}
            slotProps={{ htmlInput: { inputMode: "url", autoComplete: "url", spellCheck: false, maxLength: 2000 } }}
        />
    );
}

export function RankingsImportScreen({ store, update = false, pull }: { store: LocalPlannerStore; update?: boolean; pull?: string }) {
    const { state, save, clear } = useRankingsDoc(store);
    const pulled = usePulledSchedule(pull);
    const [scheduleText, setScheduleText] = useState("");
    const [snakeText, setSnakeText] = useState("");
    const [scheduleSource, setScheduleSource] = useState<PageSource | null>(null);
    const [snakeSource, setSnakeSource] = useState<PageSource | null>(null);
    /** The age division picked on a snake chart with several; null follows the schedule's teams. */
    const [snakeDivision, setSnakeDivision] = useState<number | null>(null);
    const [seasonYear, setSeasonYear] = useState(() => defaultSeasonYear(new Date()));
    const [presetId, setPresetId] = useState(PRESETS[0].id);
    const [title, setTitle] = useState("Pre-season rankings");
    const [schedule, setSchedule] = useState<ParsedSchedule | null>(null);
    const [snake, setSnake] = useState<ParsedSnakeChart | null>(null);
    const [draft, setDraft] = useState<RankingsDocument | null>(null);
    const [conflicts, setConflicts] = useState<GameConflict[]>([]);
    /** What merging the schedule just read did to the saved games. */
    const [summary, setSummary] = useState<MergeSummary | null>(null);
    /** The pages' addresses as typed; null shows the saved address. */
    const [scheduleUrl, setScheduleUrl] = useState<string | null>(null);
    const [snakeUrl, setSnakeUrl] = useState<string | null>(null);
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
    const scheduleAddress = scheduleUrl ?? docSource(existing, "schedule")?.url ?? "";
    const snakeAddress = snakeUrl ?? docSource(existing, "snakeChart")?.url ?? "";
    const addressProblem = pageAddressProblem(scheduleAddress) ?? pageAddressProblem(snakeAddress);

    /** Everything derived from the inputs: nothing may be saved until the user reads again. */
    const invalidate = () => {
        setSchedule(null);
        setSnake(null);
        setSnakeFit(null);
        setDraft(null);
        setConflicts([]);
        setSummary(null);
        setChoices(new Map());
        setMessage(null);
    };

    const rebuild = (nextSchedule: ParsedSchedule | null, nextSnake: ParsedSnakeChart | null, picked: Map<string, Choice>) => {
        const method = PRESETS.find((p) => p.id === presetId)!.method;
        let doc = existing ?? createRankingsDocument({ title, method });
        const open: GameConflict[] = [];
        setSummary(null);
        if (nextSchedule) {
            const merged = mergeSchedule(doc, nextSchedule);
            doc = merged.doc;
            setSummary(merged.summary);
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

    /**
     * A chart with several age divisions is scoped to the picked one, else to the schedule's, else
     * (a chart read on its own over saved rankings) to the saved teams'.
     */
    const parseSnake = (content: string, forSchedule: ParsedSchedule | null, division: number | null) =>
        parseSnakeChart(content, { scheduleTeams: (forSchedule?.teams ?? existing?.teams)?.map((team) => team.number), division: division ?? undefined });
    const readSchedule = (content = scheduleSource?.content ?? scheduleText) => {
        const parsed = parseSchedule(content, { seasonYear });
        const fresh = new Map<string, Choice>();
        // A chart read before the schedule picks its division again, now that the teams are known.
        const snakeContent = snakeSource?.content ?? snakeText;
        const nextSnake = (snake || snakeSource) && snakeContent.trim() ? parseSnake(snakeContent, parsed, snakeDivision) : snake;
        setSchedule(parsed);
        setSnake(nextSnake);
        setChoices(fresh);
        setMessage(null);
        rebuild(parsed, nextSnake, fresh);
    };
    const readSnake = (content = snakeSource?.content ?? snakeText, division = snakeDivision) => {
        const parsed = parseSnake(content, schedule, division);
        setSnake(parsed);
        setMessage(null);
        rebuild(schedule, parsed, choices);
    };
    const pickDivision = (division: number) => {
        setSnakeDivision(division);
        readSnake(undefined, division);
    };
    /**
     * The one way incoming schedule text or HTML reaches the import draft: a paste, an opened saved
     * page, or a future handoff. It loads the page, reads it straight away, and fills in the page's
     * address when it is known, so saving remembers it.
     */
    const importScheduleSource = (text: string, { sourceUrl, label = PASTED_PAGE_LABEL }: { sourceUrl?: string | null; label?: string } = {}) => {
        if (sourceUrl) setScheduleUrl(sourceUrl);
        setScheduleSource({ label, content: text });
        setScheduleText("");
        readSchedule(text);
    };
    const loadSnake = (source: PageSource) => {
        setSnakeSource(source);
        setSnakeText("");
        setSnakeDivision(null);
        const parsed = parseSnake(source.content, schedule, null);
        setSnake(parsed);
        setMessage(null);
        rebuild(schedule, parsed, choices);
    };
    const pasteSchedule = (event: ClipboardEvent<HTMLElement>) => {
        const content = pastedPage(event, (text) => parseSchedule(text, { seasonYear }).games.length);
        if (content !== null) importScheduleSource(content);
    };
    const pasteSnake = (event: ClipboardEvent<HTMLElement>) => {
        const content = pastedPage(event, (text) => parseSnakeChart(text).teams.length);
        if (content !== null) loadSnake({ label: PASTED_PAGE_LABEL, content });
    };
    const clearSchedule = () => {
        setScheduleSource(null);
        editSchedule("");
    };
    const clearSnake = () => {
        setSnakeSource(null);
        editSnake("");
    };
    // A schedule from "Fetch it for me" (ADR-0024) loads like an opened page, once.
    const arrived = pulled.take();
    if (arrived) {
        if (arrived.ok) importScheduleSource(arrived.schedule.content, { sourceUrl: arrived.schedule.sourceUrl, label: arrived.schedule.label });
        else setMessage({ severity: "error", text: arrived.message });
    }
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
        // A replaced chart may list its divisions in another order: the old pick's index means nothing now.
        setSnakeDivision(null);
        setSnake(null);
        setSnakeFit(null);
        setMessage(null);
        // An edited chart must be read again before saving; a cleared one simply drops out of the preview.
        if (schedule && !text.trim()) rebuild(schedule, null, choices);
        else setDraft(null);
    };
    /** Reads a saved page (HTML, text or a Safari web archive) and reads it straight away. */
    const pickPage = async (event: ChangeEvent<HTMLInputElement>, load: (source: PageSource) => void) => {
        const input = event.target;
        const file = input.files?.[0];
        input.value = "";
        if (!file) return;
        let content: string | null;
        try {
            content = savedPageText(new Uint8Array(await file.arrayBuffer()), file.name);
        } catch {
            setMessage({ severity: "error", text: "Couldn't read that file." });
            return;
        }
        if (content === null) setMessage({ severity: "error", text: "That web archive has no page in it. Try saving the page as HTML." });
        else load({ label: file.name, content });
    };
    const commit = async () => {
        if (!draft || addressProblem) return;
        // A page read in this import is stamped as read now; the other keeps its last read time.
        const readAt = new Date().toISOString();
        const withSchedule = withSource(draft, "schedule", scheduleAddress, schedule ? { readAt } : {});
        const result = await save(withSource(withSchedule, "snakeChart", snakeAddress, snake ? { readAt } : {}));
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
                {update ? UPDATE_TITLE : "Import rankings"}
            </Typography>
            {!update && (
                <Box component="ol" sx={{ m: 0, pl: 3, color: "text.secondary", "& li": { mb: 0.5 } }}>
                    <li>Open your division&rsquo;s full schedule on the league site: the page that lists every game with its score.</li>
                    <li>Select everything (Ctrl/⌘ + A) and copy it (Ctrl/⌘ + C).</li>
                    <li>Paste it into the schedule box below. Or save the page (Web Archive is fine) and open the file.</li>
                </Box>
            )}
            <Typography color="text.secondary">Nothing is sent anywhere: it stays in this browser.</Typography>

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
                {scheduleSource ? (
                    <LoadedPage source={scheduleSource} found={`${plural(schedule?.games.length ?? 0, "game")} found`} onClear={clearSchedule} clearLabel="Clear schedule page" />
                ) : (
                    <TextField
                        label="Schedule page"
                        multiline
                        minRows={4}
                        maxRows={10}
                        value={scheduleText}
                        onChange={(e) => editSchedule(e.target.value)}
                        autoFocus={update}
                        helperText={update ? UPDATE_HINT : undefined}
                        slotProps={{ htmlInput: { onPaste: pasteSchedule } }}
                    />
                )}
                <PageAddress label={SCHEDULE_ADDRESS_LABEL} value={scheduleAddress} onChange={setScheduleUrl} />
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
                        accept={PAGE_FILE_TYPES}
                        onChange={(e) => void pickPage(e, (source) => importScheduleSource(source.content, { label: source.label }))}
                    />
                    <Button variant="contained" onClick={() => readSchedule()} disabled={!scheduleSource && !scheduleText.trim()} sx={{ minHeight: 44 }}>
                        {READ_SCHEDULE_LABEL}
                    </Button>
                </Stack>
                {schedule && (
                    <Alert severity={schedule.games.length ? "success" : "warning"}>
                        {`${plural(finals, "completed game")}, ${scheduled} scheduled, ${plural(schedule.teams.length, "team")}`}
                        {existing && summary && (
                            <Typography variant="body2" sx={{ mt: 0.5 }} data-testid="merge-summary">
                                {mergeSummaryText(summary)}
                            </Typography>
                        )}
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
                <Typography variant="body2" color="text.secondary">
                    The same steps on the league&rsquo;s snake chart page give each team its starting bracket.
                </Typography>
                {snakeSource ? (
                    <LoadedPage source={snakeSource} found={`${plural(snake?.teams.length ?? 0, "team")} found`} onClear={clearSnake} clearLabel="Clear snake chart page" />
                ) : (
                    <TextField
                        label="Snake chart"
                        multiline
                        minRows={3}
                        maxRows={8}
                        value={snakeText}
                        onChange={(e) => editSnake(e.target.value)}
                        slotProps={{ htmlInput: { onPaste: pasteSnake } }}
                    />
                )}
                <PageAddress label={SNAKE_ADDRESS_LABEL} value={snakeAddress} onChange={setSnakeUrl} />
                {snake?.divisions && snake.divisions.length > 1 && (
                    <TextField select label="Age division" value={snake.division ?? 0} onChange={(e) => pickDivision(Number(e.target.value))} sx={{ maxWidth: 420 }}>
                        {snake.divisions.map((division, index) => (
                            <MenuItem key={index} value={index}>
                                {`${division.name} (${plural(division.teams.length, "team")})`}
                            </MenuItem>
                        ))}
                    </TextField>
                )}
                <Stack direction="row" spacing={1}>
                    <Button onClick={() => snakeFile.current?.click()} sx={{ minHeight: 44 }}>
                        Open saved page
                    </Button>
                    <input
                        ref={snakeFile}
                        hidden
                        type="file"
                        data-testid="snake-file-input"
                        accept={PAGE_FILE_TYPES}
                        onChange={(e) => void pickPage(e, loadSnake)}
                    />
                    <Button variant="outlined" onClick={() => readSnake()} disabled={!snakeSource && !snakeText.trim()} sx={{ minHeight: 44 }}>
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
                <Button variant="contained" size="large" onClick={() => void commit()} disabled={!draft || conflicts.length > 0 || addressProblem !== null} sx={{ minHeight: 44 }}>
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

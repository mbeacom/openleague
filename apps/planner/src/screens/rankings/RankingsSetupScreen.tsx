/**
 * Setup (static rankings spec), in sections behind tabs: rules and levels,
 * starting brackets (strongest first), teams, games, the league pages results
 * are read from, and deleting the rankings. Everything is one draft across the
 * tabs, kept by Save setup in the sticky bar and validated then.
 */
import { useMemo, useState, type ReactNode } from "react";
import { Alert, Box, Button, IconButton, Paper, Stack, Tab, Tabs, TextField, Typography } from "@mui/material";
import { CSHL_8U_METHOD } from "@/lib/ratings";
import type { ActionResult } from "@/lib/planner-store";
import {
    MAX_BRACKETS,
    MAX_SOURCE_URL_LENGTH,
    docBracketOrder,
    docSource,
    pageAddressProblem,
    rankedTeamCount,
    withSource,
    type RankingsDocument,
    type RankingsGame,
    type RankingsTeam,
} from "@/lib/rankings-document";
import { navigateTo } from "../../platform";
import { staticRoutes, type RankingsSetupSection } from "../../routes";
import type { LocalPlannerStore } from "../../store/types";
import { RankingsStatus, levelFit, levelsShortMessage } from "./display";
import { Scoreboard } from "./Scoreboard";
import { AddGameDialog, EMPTY_GAME, EditGameDialog, GAMES_PAGE_SIZE, SetupGamesPanel } from "./SetupGamesPanel";
import { SetupTeamsPanel, TeamDialog, type BracketOption, type TeamEdit } from "./SetupTeamsPanel";
import { DEFAULT_GAME_FILTER, DEFAULT_TEAM_FILTER, recordOf, sectionOfPath, teamRecords, type GameFilter, type TeamFilter } from "./setup-model";
import { useRankingsDoc } from "./useRankingsDoc";

export const SAVE_SETUP_LABEL = "Save setup";
export const CLEAR_ALL_LABEL = "Delete these rankings";
export const SCHEDULE_PAGE_LABEL = "League schedule page";
export const SNAKE_PAGE_LABEL = "Snake chart page";

export type SetupSection = RankingsSetupSection;

export const SETUP_SECTIONS: ReadonlyArray<{ id: SetupSection; label: string }> = [
    { id: "rules", label: "Rules & levels" },
    { id: "brackets", label: "Brackets" },
    { id: "teams", label: "Teams" },
    { id: "games", label: "Games" },
    { id: "pages", label: "League pages" },
    { id: "danger", label: "Danger zone" },
];

const TARGET = { minHeight: 44 } as const;
const ICON_TARGET = { width: 44, height: 44 } as const;
const MONO = { fontFamily: "var(--font-mono), ui-monospace, monospace", fontVariantNumeric: "tabular-nums" } as const;

/** A starting bracket while editing: the key keeps its teams through a rename. */
interface BracketDraft {
    key: number;
    name: string;
}

const bracketLabel = (bracket: BracketDraft, index: number) => bracket.name.trim() || `bracket ${index + 1}`;

/** Why the brackets can't be saved, or null. */
function bracketProblem(brackets: readonly BracketDraft[]): string | null {
    if (brackets.length > MAX_BRACKETS) return `At most ${MAX_BRACKETS} starting brackets. Remove ${brackets.length - MAX_BRACKETS} to save.`;
    const seen = new Set<string>();
    for (const [i, bracket] of brackets.entries()) {
        const name = bracket.name.trim();
        if (!name) return `Give starting bracket ${i + 1} a name.`;
        if (seen.has(name)) return `Starting bracket ${name} is listed twice.`;
        seen.add(name);
    }
    return null;
}

/** The rank number at the start of an ordered row (levels, brackets). */
function Ordinal({ n }: { n: number }) {
    return (
        <Box
            aria-hidden
            sx={{
                ...MONO,
                flexShrink: 0,
                width: 28,
                height: 28,
                mt: "14px",
                display: "grid",
                placeItems: "center",
                borderRadius: "4px",
                bgcolor: "primary.main",
                color: "primary.contrastText",
                fontSize: "0.75rem",
                fontWeight: 600,
            }}
        >
            {n}
        </Box>
    );
}

function Section({ title, intro, action, children }: { title: string; intro?: ReactNode; action?: ReactNode; children: ReactNode }) {
    return (
        <Stack component="section" spacing={1.5} aria-label={title}>
            <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 1, borderBottom: 1, borderColor: "divider", pb: 1 }}>
                <Typography component="h2" variant="h6" sx={{ fontWeight: 800, letterSpacing: "-0.01em" }}>
                    {title}
                </Typography>
                {action}
            </Stack>
            {intro && (
                <Typography variant="body2" color="text.secondary" sx={{ maxWidth: "70ch" }}>
                    {intro}
                </Typography>
            )}
            {children}
        </Stack>
    );
}

function Editor({
    initial,
    routeSection = "rules",
    save,
    clear,
}: {
    initial: RankingsDocument;
    /** The section the route names; following it again when the route changes. */
    routeSection?: SetupSection;
    save: LocalPlannerStore["saveRankings"];
    clear: () => Promise<ActionResult<null>>;
}) {
    const [doc, setDoc] = useState<RankingsDocument>(initial);
    const [error, setError] = useState<string | null>(null);
    const [confirmClear, setConfirmClear] = useState(false);
    const [section, setSection] = useState<SetupSection>(routeSection);
    // A new route (back/forward, or a link to another section) opens its section; the draft stays.
    const [shownRoute, setShownRoute] = useState<SetupSection>(routeSection);
    if (shownRoute !== routeSection) {
        setShownRoute(routeSection);
        setSection(routeSection);
    }
    const [brackets, setBrackets] = useState<BracketDraft[]>(() => docBracketOrder(initial).map((name, key) => ({ key, name })));
    /** Team number to bracket key (null: no starting bracket). */
    const [assigned, setAssigned] = useState<Record<string, number | null>>(() => {
        const order = docBracketOrder(initial);
        return Object.fromEntries(initial.teams.map((team) => [team.number, team.startingBracket ? order.indexOf(team.startingBracket) : null]));
    });
    /** The league pages' addresses as typed; an empty field forgets that page. */
    const [pages, setPages] = useState(() => ({ schedule: docSource(initial, "schedule")?.url ?? "", snakeChart: docSource(initial, "snakeChart")?.url ?? "" }));
    const [teamFilter, setTeamFilter] = useState<TeamFilter>(DEFAULT_TEAM_FILTER);
    const [gameFilter, setGameFilter] = useState<GameFilter>(DEFAULT_GAME_FILTER);
    const [gameLimit, setGameLimit] = useState(GAMES_PAGE_SIZE);
    const [editingTeam, setEditingTeam] = useState<string | null>(null);
    /** The index of the game being edited, or "new" for Add game. */
    const [editingGame, setEditingGame] = useState<number | "new" | null>(null);
    /** The last added game's date: the next one usually shares it. */
    const [lastDate, setLastDate] = useState("");

    const setLevel = (index: number, patch: Partial<{ name: string; size: number }>) =>
        setDoc((d) => ({ ...d, method: { ...d.method, levels: d.method.levels.map((l, i) => (i === index ? { ...l, ...patch } : l)) } }));
    const setTeam = (number: string, patch: Partial<RankingsTeam>) => setDoc((d) => ({ ...d, teams: d.teams.map((t) => (t.number === number ? { ...t, ...patch } : t)) }));
    const setGame = (index: number, game: RankingsGame) => setDoc((d) => ({ ...d, games: d.games.map((g, i) => (i === index ? game : g)) }));
    /** Keeps a team dialog's edit in the draft. */
    const applyTeamEdit = (number: string, edit: TeamEdit) => {
        setTeam(number, { name: edit.name, excluded: edit.excluded });
        setAssigned((map) => ({ ...map, [number]: edit.bracketKey }));
        setDoc((d) => ({ ...d, myTeam: edit.mine ? number : d.myTeam === number ? null : d.myTeam }));
    };

    const records = useMemo(() => teamRecords(doc.games), [doc.games]);
    const ranked = rankedTeamCount(doc);
    const finals = doc.games.filter((g) => g.status === "final").length;
    const fit = levelFit(doc);
    const bracketOptions: BracketOption[] = brackets.map((b, i) => ({ key: b.key, label: bracketLabel(b, i) }));
    const teamsIn = (key: number) => doc.teams.filter((team) => assigned[team.number] === key).length;
    const moveBracket = (from: number, to: number) =>
        setBrackets((list) => {
            const next = [...list];
            const [moved] = next.splice(from, 1);
            next.splice(to, 0, moved);
            return next;
        });
    /** Removes a bracket; its teams are left without a starting bracket. */
    const removeBracket = (key: number) => {
        setBrackets((list) => list.filter((b) => b.key !== key));
        setAssigned((current) => Object.fromEntries(Object.entries(current).map(([number, k]) => [number, k === key ? null : k])));
        setTeamFilter((f) => (f.bracket === key ? { ...f, bracket: "all" } : f));
    };
    const addBracket = () =>
        setBrackets((list) => {
            const names = new Set(list.map((b) => b.name.trim()));
            let n = list.length + 1;
            while (names.has(`Bracket ${n}`)) n += 1;
            return [...list, { key: list.reduce((max, b) => Math.max(max, b.key), -1) + 1, name: `Bracket ${n}` }];
        });

    const clearAll = async () => {
        const result = await clear();
        if (result.success) navigateTo(staticRoutes.rankings());
        else {
            setError(result.error);
            setConfirmClear(false);
        }
    };

    /** Shows a problem and opens the section it is in. */
    const fail = (message: string, where?: SetupSection) => {
        setError(message);
        if (where) setSection(where);
    };

    const submit = async () => {
        const half = doc.games.find((g) => (g.homeGoals === null) !== (g.awayGoals === null));
        if (half) return fail(`Enter both scores or neither for ${half.date} ${half.home} vs ${half.away}.`, "games");
        const bracketIssue = bracketProblem(brackets);
        if (bracketIssue) return fail(bracketIssue, "brackets");
        const pageProblem = pageAddressProblem(pages.schedule) ?? pageAddressProblem(pages.snakeChart);
        if (pageProblem) return fail(pageProblem, "pages");
        const names = new Map(brackets.map((b) => [b.key, b.name.trim()]));
        // An unchanged address keeps its last read time; a new one has none until it is read.
        const withPages = withSource(withSource(doc, "schedule", pages.schedule), "snakeChart", pages.snakeChart);
        const result = await save({
            ...withPages,
            teams: doc.teams.map((team) => {
                const key = assigned[team.number];
                return { ...team, startingBracket: key === null || key === undefined ? null : names.get(key) ?? null };
            }),
            bracketOrder: brackets.map((b) => b.name.trim()),
        });
        if (result.success) {
            setError(null);
            navigateTo(staticRoutes.rankings());
        } else {
            // The store reports where in the document the problem is: open that section.
            const details = result.details as { path?: unknown } | undefined;
            fail(result.error, sectionOfPath(details?.path));
        }
    };

    const counts: Partial<Record<SetupSection, number>> = { brackets: brackets.length, teams: doc.teams.length, games: doc.games.length };
    const team = editingTeam === null ? undefined : doc.teams.find((t) => t.number === editingTeam);
    const game = typeof editingGame === "number" ? doc.games[editingGame] : undefined;

    return (
        <Stack spacing={2.5}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ justifyContent: "space-between", alignItems: { md: "flex-end" } }}>
                <Box sx={{ minWidth: 0 }}>
                    <Typography component="h1" variant="h5" sx={{ fontWeight: 800, letterSpacing: "-0.02em" }}>
                        Rankings setup
                    </Typography>
                    <Typography color="text.secondary" sx={{ overflowWrap: "anywhere" }}>
                        {doc.meta.title || "Untitled rankings"}
                    </Typography>
                </Box>
                <Scoreboard
                    width={{ xs: "100%", md: 400 }}
                    stats={[
                        { label: "Teams", value: doc.teams.length },
                        { label: "Ranked", value: ranked },
                        { label: "Games", value: doc.games.length },
                        { label: "Final", value: finals },
                    ]}
                />
            </Stack>

            <Box sx={{ boxShadow: { md: "inset 0 -1px 0 var(--mui-palette-divider)" } }}>
                {/* Phones and tablets: every section in view as a 3 × 2 grid; desktop: one row of tabs. */}
                <Tabs
                    value={section}
                    onChange={(_e, value: SetupSection) => setSection(value)}
                    aria-label="Setup sections"
                    sx={{
                        minHeight: 0,
                        "& .MuiTabs-flexContainer": { display: { xs: "grid", md: "flex" }, gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: { xs: 0.5, md: 0 } },
                        "& .MuiTabs-indicator": { display: { xs: "none", md: "block" } },
                        "& .MuiTab-root": {
                            minHeight: 48,
                            minWidth: 0,
                            maxWidth: "none",
                            textTransform: "none",
                            fontWeight: 700,
                            px: { xs: 1, md: 2 },
                            lineHeight: 1.2,
                            border: { xs: 1, md: 0 },
                            borderColor: { xs: "divider" },
                            borderRadius: { xs: 1, md: 0 },
                            bgcolor: { xs: "background.paper", md: "transparent" },
                        },
                        "& .MuiTab-root.Mui-selected": {
                            bgcolor: { xs: "primary.main", md: "transparent" },
                            color: { xs: "primary.contrastText", md: "primary.main" },
                            borderColor: { xs: "primary.main" },
                        },
                        "& .MuiTab-root.setup-danger": { color: "error.main" },
                        "& .MuiTab-root.setup-danger.Mui-selected": {
                            bgcolor: { xs: "error.main", md: "transparent" },
                            color: { xs: "error.contrastText", md: "error.main" },
                            borderColor: { xs: "error.main" },
                        },
                    }}
                >
                    {SETUP_SECTIONS.map(({ id, label }) => (
                        <Tab
                            key={id}
                            value={id}
                            id={`setup-tab-${id}`}
                            aria-controls={`setup-panel-${id}`}
                            className={id === "danger" ? "setup-danger" : undefined}
                            label={
                                <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
                                    {label}
                                    {counts[id] !== undefined && (
                                        <Box component="span" sx={{ ...MONO, fontSize: "0.75rem", fontWeight: 500, opacity: 0.75 }}>
                                            {` ${counts[id]}`}
                                        </Box>
                                    )}
                                    {id === "rules" && fit.short > 0 && (
                                        <Box component="span" role="img" aria-label="needs attention" sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "warning.main" }} />
                                    )}
                                </Box>
                            }
                        />
                    ))}
                </Tabs>
            </Box>

            <Box role="tabpanel" id={`setup-panel-${section}`} aria-labelledby={`setup-tab-${section}`} sx={{ minHeight: 240 }}>
                {section === "rules" && (
                    <Stack spacing={4}>
                        <Section title="Rules">
                            <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "minmax(0, 1fr) 112px", sm: "minmax(0, 360px) 120px auto" }, alignItems: "center" }}>
                                <TextField label="Title" value={doc.meta.title} onChange={(e) => setDoc({ ...doc, meta: { ...doc.meta, title: e.target.value } })} />
                                <TextField
                                    label="Goal cap"
                                    type="number"
                                    value={doc.method.goalCap}
                                    onChange={(e) => setDoc({ ...doc, method: { ...doc.method, goalCap: Number(e.target.value) } })}
                                />
                                <Button onClick={() => setDoc({ ...doc, method: structuredClone(CSHL_8U_METHOD) })} sx={{ ...TARGET, justifySelf: "start", gridColumn: { xs: "1 / -1", sm: "auto" } }}>
                                    Reset to CSHL 8U
                                </Button>
                            </Box>
                        </Section>
                        <Section title="Levels (top first)" intro="Ranked teams fill the levels from the top, each up to its size.">
                            <Stack component="ol" spacing={1} sx={{ listStyle: "none", p: 0, m: 0, maxWidth: 560 }}>
                                {doc.method.levels.map((level, i) => (
                                    <Stack component="li" key={i} direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
                                        <Ordinal n={i + 1} />
                                        <TextField label={`Name of level ${i + 1}`} value={level.name} onChange={(e) => setLevel(i, { name: e.target.value })} sx={{ flex: 1, minWidth: 0 }} />
                                        <TextField
                                            label={`Size of level ${i + 1}`}
                                            type="number"
                                            value={level.size}
                                            onChange={(e) => setLevel(i, { size: Number(e.target.value) })}
                                            sx={{ width: { xs: 96, sm: 140 }, flexShrink: 0 }}
                                        />
                                        <IconButton
                                            aria-label={`Remove level ${i + 1}`}
                                            onClick={() => setDoc((d) => ({ ...d, method: { ...d.method, levels: d.method.levels.filter((_l, k) => k !== i) } }))}
                                            sx={{ ...ICON_TARGET, mt: "6px", flexShrink: 0 }}
                                        >
                                            ×
                                        </IconButton>
                                    </Stack>
                                ))}
                            </Stack>
                            <Button
                                onClick={() => setDoc((d) => ({ ...d, method: { ...d.method, levels: [...d.method.levels, { name: `L${d.method.levels.length + 1}`, size: 6 }] } }))}
                                sx={{ alignSelf: "flex-start", ...TARGET }}
                            >
                                Add level
                            </Button>
                            {fit.short > 0 ? (
                                <Alert severity="warning">{`${levelsShortMessage(fit.held, fit.ranked)} Add a level or make one bigger.`}</Alert>
                            ) : (
                                <Typography variant="body2" color="text.secondary">
                                    {`Your levels hold ${fit.held} teams and ${fit.ranked} ${fit.ranked === 1 ? "is" : "are"} ranked.`}
                                </Typography>
                            )}
                        </Section>
                    </Stack>
                )}

                {section === "brackets" && (
                    <Section
                        title="Starting brackets (strongest first)"
                        intro={
                            <>
                                Movement compares each team&rsquo;s suggested level with where its starting bracket sits in this order. The snake chart sets it from its
                                columns, left to right; team numbers never do.
                            </>
                        }
                    >
                        {brackets.length === 0 && (
                            <Typography variant="body2" color="text.secondary">
                                No starting brackets yet. Read a snake chart on the import screen, or add them here.
                            </Typography>
                        )}
                        <Stack component="ol" spacing={1} sx={{ listStyle: "none", p: 0, m: 0, maxWidth: 640 }}>
                            {brackets.map((bracket, i) => {
                                const label = bracketLabel(bracket, i);
                                const count = teamsIn(bracket.key);
                                return (
                                    <Box component="li" key={bracket.key} sx={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", columnGap: 1, rowGap: 0.5 }}>
                                        <Ordinal n={i + 1} />
                                        <TextField
                                            label={`Name of bracket ${i + 1}`}
                                            value={bracket.name}
                                            onChange={(e) => setBrackets((list) => list.map((b) => (b.key === bracket.key ? { ...b, name: e.target.value } : b)))}
                                            slotProps={{ htmlInput: { maxLength: 40 } }}
                                            sx={{ flex: "1 1 200px", minWidth: 0 }}
                                        />
                                        <Box sx={{ display: "flex", alignItems: "center", flexWrap: "nowrap", ml: "auto", pt: "6px" }}>
                                            <Typography variant="body2" color="text.secondary" sx={{ ...MONO, minWidth: "4.5rem", textAlign: "right", pr: 1 }}>
                                                {`${count} ${count === 1 ? "team" : "teams"}`}
                                            </Typography>
                                            <IconButton aria-label={`Move ${label} up`} disabled={i === 0} onClick={() => moveBracket(i, i - 1)} sx={ICON_TARGET}>
                                                <span aria-hidden="true">▲</span>
                                            </IconButton>
                                            <IconButton aria-label={`Move ${label} down`} disabled={i === brackets.length - 1} onClick={() => moveBracket(i, i + 1)} sx={ICON_TARGET}>
                                                <span aria-hidden="true">▼</span>
                                            </IconButton>
                                            <IconButton
                                                aria-label={count > 0 ? `Remove ${label} (its ${count} ${count === 1 ? "team gets" : "teams get"} no starting bracket)` : `Remove ${label}`}
                                                onClick={() => removeBracket(bracket.key)}
                                                sx={ICON_TARGET}
                                            >
                                                ×
                                            </IconButton>
                                        </Box>
                                    </Box>
                                );
                            })}
                        </Stack>
                        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                            <Button onClick={addBracket} disabled={brackets.length >= MAX_BRACKETS} sx={{ ...TARGET, alignSelf: "flex-start" }}>
                                Add bracket
                            </Button>
                            <Typography variant="body2" color="text.secondary">{`${brackets.length} of at most ${MAX_BRACKETS}`}</Typography>
                        </Stack>
                    </Section>
                )}

                {section === "teams" && (
                    <Section title="Teams" intro="Pick a team to rename it, set its starting bracket, leave it out of the rankings, or mark it as yours.">
                        <SetupTeamsPanel
                            teams={doc.teams}
                            assigned={assigned}
                            brackets={bracketOptions}
                            records={records}
                            myTeam={doc.myTeam}
                            filter={teamFilter}
                            onFilter={setTeamFilter}
                            onEdit={setEditingTeam}
                        />
                    </Section>
                )}

                {section === "games" && (
                    <Section title="Games" intro="Pick a game to fix its score, date, teams or rink.">
                        <SetupGamesPanel
                            games={doc.games}
                            teams={doc.teams}
                            myTeam={doc.myTeam}
                            filter={gameFilter}
                            onFilter={setGameFilter}
                            limit={gameLimit}
                            onLimit={setGameLimit}
                            onEdit={setEditingGame}
                            onAdd={() => setEditingGame("new")}
                        />
                    </Section>
                )}

                {section === "pages" && (
                    <Section title="League pages" intro="Optional. With the schedule page saved, Update results opens it for you. Only the address is kept.">
                        {(
                            [
                                ["schedule", SCHEDULE_PAGE_LABEL],
                                ["snakeChart", SNAKE_PAGE_LABEL],
                            ] as const
                        ).map(([kind, label]) => {
                            const problem = pageAddressProblem(pages[kind]);
                            return (
                                <TextField
                                    key={kind}
                                    label={label}
                                    type="url"
                                    value={pages[kind]}
                                    onChange={(e) => setPages((current) => ({ ...current, [kind]: e.target.value }))}
                                    placeholder="https://"
                                    error={problem !== null}
                                    helperText={problem ?? undefined}
                                    slotProps={{ htmlInput: { inputMode: "url", autoComplete: "url", spellCheck: false, maxLength: MAX_SOURCE_URL_LENGTH } }}
                                    sx={{ maxWidth: 560 }}
                                />
                            );
                        })}
                    </Section>
                )}

                {section === "danger" && (
                    <Section title="Danger zone">
                        <Paper variant="outlined" sx={{ p: 2, borderColor: "error.main", maxWidth: 560 }}>
                            <Stack spacing={1.5} sx={{ alignItems: "flex-start" }}>
                                <Typography variant="body2">
                                    Deletes these rankings, teams and games from this browser. Export a rankings file first if you want to keep a copy.
                                </Typography>
                                {confirmClear ? (
                                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignSelf: "stretch" }}>
                                        <Button color="error" variant="contained" onClick={() => void clearAll()} sx={TARGET}>
                                            Yes, delete them
                                        </Button>
                                        <Button onClick={() => setConfirmClear(false)} sx={TARGET}>
                                            Keep them
                                        </Button>
                                    </Stack>
                                ) : (
                                    <Button color="error" variant="outlined" onClick={() => setConfirmClear(true)} sx={TARGET}>
                                        {CLEAR_ALL_LABEL}
                                    </Button>
                                )}
                            </Stack>
                        </Paper>
                    </Section>
                )}
            </Box>

            {/* Save stays in reach, and its problems in view, whichever section is open. */}
            <Paper
                elevation={0}
                sx={{
                    position: "sticky",
                    bottom: 0,
                    zIndex: 2,
                    mx: { xs: -2, sm: 0 },
                    px: { xs: 2, sm: 2 },
                    py: 1.5,
                    borderTop: 2,
                    borderColor: "primary.main",
                    borderRadius: { xs: 0, sm: "4px 4px 0 0" },
                }}
            >
                <Stack spacing={1}>
                    {error && <Alert severity="error">{error}</Alert>}
                    <Stack direction="row" spacing={1}>
                        <Button variant="contained" onClick={() => void submit()} sx={{ ...TARGET, flex: { xs: 1, sm: "none" }, px: 3 }}>
                            {SAVE_SETUP_LABEL}
                        </Button>
                        <Button href={staticRoutes.rankings()} sx={{ ...TARGET, flex: { xs: 1, sm: "none" } }}>
                            Cancel
                        </Button>
                    </Stack>
                </Stack>
            </Paper>

            {team && (
                <TeamDialog
                    key={team.number}
                    team={team}
                    record={recordOf(records, team.number)}
                    bracketKey={assigned[team.number] ?? null}
                    brackets={bracketOptions}
                    mine={doc.myTeam === team.number}
                    onDone={(edit) => {
                        applyTeamEdit(team.number, edit);
                        setEditingTeam(null);
                    }}
                    onShowGames={(edit) => {
                        applyTeamEdit(team.number, edit);
                        setGameFilter({ ...DEFAULT_GAME_FILTER, team: team.number });
                        setGameLimit(GAMES_PAGE_SIZE);
                        setEditingTeam(null);
                        setSection("games");
                    }}
                    onClose={() => setEditingTeam(null)}
                />
            )}
            {game && typeof editingGame === "number" && (
                <EditGameDialog
                    key={editingGame}
                    game={game}
                    teams={doc.teams}
                    onDone={(edited) => {
                        setGame(editingGame, edited);
                        setEditingGame(null);
                    }}
                    onDelete={() => {
                        setDoc((d) => ({ ...d, games: d.games.filter((_g, k) => k !== editingGame) }));
                        setEditingGame(null);
                    }}
                    onClose={() => setEditingGame(null)}
                />
            )}
            {editingGame === "new" && (
                <AddGameDialog
                    teams={doc.teams}
                    initial={{ ...EMPTY_GAME, date: gameFilter.date || lastDate, home: gameFilter.team }}
                    onAdd={(added) => {
                        setDoc((d) => ({ ...d, games: [...d.games, added] }));
                        setLastDate(added.date);
                        setEditingGame(null);
                    }}
                    onClose={() => setEditingGame(null)}
                />
            )}
        </Stack>
    );
}

export function RankingsSetupScreen({ store, section }: { store: LocalPlannerStore; section?: SetupSection }) {
    const { state, save, clear } = useRankingsDoc(store);
    if (state.status !== "ready") return <RankingsStatus state={state} onStartOver={() => void clear()} />;
    if (!state.doc) return <RankingsStatus state={{ status: "empty" }} onStartOver={() => void clear()} />;
    return <Editor initial={state.doc} routeSection={section} save={save} clear={clear} />;
}

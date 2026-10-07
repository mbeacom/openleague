/**
 * Setup (static rankings spec): title, goal cap, levels, starting brackets
 * (strongest first), teams (name, bracket, excluded, my team), games; validated
 * on save.
 */
import { useState } from "react";
import {
    Alert,
    Button,
    Checkbox,
    IconButton,
    MenuItem,
    Paper,
    Radio,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Typography,
} from "@mui/material";
import { CSHL_8U_METHOD } from "@/lib/ratings";
import type { ActionResult } from "@/lib/planner-store";
import { MAX_BRACKETS, docBracketOrder, type RankingsDocument, type RankingsGame } from "@/lib/rankings-document";
import { navigateTo } from "../../platform";
import { staticRoutes } from "../../routes";
import type { LocalPlannerStore } from "../../store/types";
import { RankingsStatus, levelFit, levelsShortMessage } from "./display";
import { useRankingsDoc } from "./useRankingsDoc";

export const SAVE_SETUP_LABEL = "Save setup";
export const CLEAR_ALL_LABEL = "Delete these rankings";

/** undefined = ignore the keystroke (not 0-2 digits); null = a deliberate clear. */
const goalsValue = (text: string): number | null | undefined => {
    if (text === "") return null;
    return /^\d{1,2}$/.test(text) ? Number(text) : undefined;
};

/** A starting bracket while editing: the key keeps its teams through a rename. */
interface BracketDraft {
    key: number;
    name: string;
}

const bracketLabel = (bracket: BracketDraft, index: number) => bracket.name.trim() || `bracket ${index + 1}`;

/** Why the brackets can't be saved, or null. */
function bracketProblem(brackets: readonly BracketDraft[]): string | null {
    const seen = new Set<string>();
    for (const [i, bracket] of brackets.entries()) {
        const name = bracket.name.trim();
        if (!name) return `Give starting bracket ${i + 1} a name.`;
        if (seen.has(name)) return `Starting bracket ${name} is listed twice.`;
        seen.add(name);
    }
    return null;
}

function Editor({ initial, save, clear }: { initial: RankingsDocument; save: LocalPlannerStore["saveRankings"]; clear: () => Promise<ActionResult<null>> }) {
    const [doc, setDoc] = useState<RankingsDocument>(initial);
    const [error, setError] = useState<string | null>(null);
    const [confirmClear, setConfirmClear] = useState(false);
    const [brackets, setBrackets] = useState<BracketDraft[]>(() => docBracketOrder(initial).map((name, key) => ({ key, name })));
    /** Team number to bracket key (null: no starting bracket). */
    const [assigned, setAssigned] = useState<Record<string, number | null>>(() => {
        const order = docBracketOrder(initial);
        return Object.fromEntries(initial.teams.map((team) => [team.number, team.startingBracket ? order.indexOf(team.startingBracket) : null]));
    });
    const [newGame, setNewGame] = useState<RankingsGame>({ date: "", time: null, home: "", away: "", homeGoals: null, awayGoals: null, status: "final", rink: null });

    const setLevel = (index: number, patch: Partial<{ name: string; size: number }>) =>
        setDoc((d) => ({ ...d, method: { ...d.method, levels: d.method.levels.map((l, i) => (i === index ? { ...l, ...patch } : l)) } }));
    const setTeam = (number: string, patch: Partial<RankingsDocument["teams"][number]>) =>
        setDoc((d) => ({ ...d, teams: d.teams.map((t) => (t.number === number ? { ...t, ...patch } : t)) }));
    const setGame = (index: number, patch: Partial<RankingsGame>) =>
        setDoc((d) => ({ ...d, games: d.games.map((g, i) => (i === index ? { ...g, ...patch } : g)) }));

    const fit = levelFit(doc);
    const teamsIn = (key: number) => doc.teams.filter((team) => assigned[team.number] === key).length;
    const moveBracket = (from: number, to: number) =>
        setBrackets((list) => {
            const next = [...list];
            const [moved] = next.splice(from, 1);
            next.splice(to, 0, moved);
            return next;
        });
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

    const submit = async () => {
        const half = doc.games.find((g) => (g.homeGoals === null) !== (g.awayGoals === null));
        if (half) {
            setError(`Enter both scores or neither for ${half.date} ${half.home} vs ${half.away}.`);
            return;
        }
        const problem = bracketProblem(brackets);
        if (problem) {
            setError(problem);
            return;
        }
        const names = new Map(brackets.map((b) => [b.key, b.name.trim()]));
        const result = await save({
            ...doc,
            teams: doc.teams.map((team) => {
                const key = assigned[team.number];
                return { ...team, startingBracket: key === null || key === undefined ? null : names.get(key) ?? null };
            }),
            bracketOrder: brackets.map((b) => b.name.trim()),
        });
        if (result.success) {
            setError(null);
            navigateTo(staticRoutes.rankings());
        } else setError(result.error);
    };

    return (
        <Stack spacing={3}>
            <Typography component="h1" variant="h5" sx={{ fontWeight: 800 }}>
                Rankings setup
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <TextField label="Title" value={doc.meta.title} onChange={(e) => setDoc({ ...doc, meta: { ...doc.meta, title: e.target.value } })} />
                <TextField
                    label="Goal cap"
                    type="number"
                    value={doc.method.goalCap}
                    onChange={(e) => setDoc({ ...doc, method: { ...doc.method, goalCap: Number(e.target.value) } })}
                    sx={{ width: 120 }}
                />
                <Button onClick={() => setDoc({ ...doc, method: structuredClone(CSHL_8U_METHOD) })} sx={{ minHeight: 44 }}>
                    Reset to CSHL 8U
                </Button>
            </Stack>

            <Stack spacing={1}>
                <Typography component="h2" variant="h6">
                    Levels (top first)
                </Typography>
                {doc.method.levels.map((level, i) => (
                    <Stack key={i} direction="row" spacing={1} sx={{ alignItems: "center" }}>
                        <TextField label={`Name of level ${i + 1}`} value={level.name} onChange={(e) => setLevel(i, { name: e.target.value })} />
                        <TextField
                            label={`Size of level ${i + 1}`}
                            type="number"
                            value={level.size}
                            onChange={(e) => setLevel(i, { size: Number(e.target.value) })}
                            sx={{ width: 140 }}
                        />
                        <IconButton
                            aria-label={`Remove level ${i + 1}`}
                            onClick={() => setDoc((d) => ({ ...d, method: { ...d.method, levels: d.method.levels.filter((_l, k) => k !== i) } }))}
                            sx={{ width: 44, height: 44 }}
                        >
                            ×
                        </IconButton>
                    </Stack>
                ))}
                <Button
                    onClick={() => setDoc((d) => ({ ...d, method: { ...d.method, levels: [...d.method.levels, { name: `L${d.method.levels.length + 1}`, size: 6 }] } }))}
                    sx={{ alignSelf: "flex-start", minHeight: 44 }}
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
            </Stack>

            <Stack spacing={1} component="section" aria-labelledby="brackets-heading">
                <Typography id="brackets-heading" component="h2" variant="h6">
                    Starting brackets (strongest first)
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    Movement compares each team&rsquo;s suggested level with where its starting bracket sits in this order. The snake chart sets it from its
                    columns, left to right; team numbers never do.
                </Typography>
                {brackets.length === 0 && (
                    <Typography variant="body2" color="text.secondary">
                        No starting brackets yet. Read a snake chart on the import screen, or add them here.
                    </Typography>
                )}
                <Stack component="ol" spacing={1} sx={{ listStyle: "none", p: 0, m: 0 }}>
                    {brackets.map((bracket, i) => {
                        const label = bracketLabel(bracket, i);
                        const count = teamsIn(bracket.key);
                        return (
                            <Stack component="li" key={bracket.key} direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
                                <TextField
                                    label={`Name of bracket ${i + 1}`}
                                    value={bracket.name}
                                    onChange={(e) => setBrackets((list) => list.map((b) => (b.key === bracket.key ? { ...b, name: e.target.value } : b)))}
                                    slotProps={{ htmlInput: { maxLength: 40 } }}
                                    sx={{ flex: "1 1 10rem", maxWidth: 260 }}
                                />
                                <Typography variant="body2" color="text.secondary" sx={{ minWidth: "4.5rem" }}>
                                    {`${count} ${count === 1 ? "team" : "teams"}`}
                                </Typography>
                                <IconButton aria-label={`Move ${label} up`} disabled={i === 0} onClick={() => moveBracket(i, i - 1)} sx={{ width: 44, height: 44 }}>
                                    <span aria-hidden="true">▲</span>
                                </IconButton>
                                <IconButton
                                    aria-label={`Move ${label} down`}
                                    disabled={i === brackets.length - 1}
                                    onClick={() => moveBracket(i, i + 1)}
                                    sx={{ width: 44, height: 44 }}
                                >
                                    <span aria-hidden="true">▼</span>
                                </IconButton>
                                <IconButton
                                    aria-label={count > 0 ? `Remove ${label} (move its teams out first)` : `Remove ${label}`}
                                    disabled={count > 0}
                                    onClick={() => setBrackets((list) => list.filter((b) => b.key !== bracket.key))}
                                    sx={{ width: 44, height: 44 }}
                                >
                                    ×
                                </IconButton>
                            </Stack>
                        );
                    })}
                </Stack>
                <Button onClick={addBracket} disabled={brackets.length >= MAX_BRACKETS} sx={{ alignSelf: "flex-start", minHeight: 44 }}>
                    Add bracket
                </Button>
            </Stack>

            <Stack spacing={1}>
                <Typography component="h2" variant="h6">
                    Teams
                </Typography>
                <TableContainer component={Paper} variant="outlined">
                    <Table aria-label="Teams">
                        <TableHead>
                            <TableRow>
                                <TableCell>My team</TableCell>
                                <TableCell>Number</TableCell>
                                <TableCell>Name</TableCell>
                                <TableCell>Starting bracket</TableCell>
                                <TableCell>Excluded</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {doc.teams.map((team) => (
                                <TableRow key={team.number}>
                                    <TableCell>
                                        <Radio sx={{ p: "10px" }} checked={doc.myTeam === team.number} onChange={() => setDoc({ ...doc, myTeam: team.number })} slotProps={{ input: { "aria-label": `My team: ${team.name}` } }} />
                                    </TableCell>
                                    <TableCell>{team.number}</TableCell>
                                    <TableCell>
                                        <TextField sx={{ minWidth: 190 }} value={team.name} onChange={(e) => setTeam(team.number, { name: e.target.value })} slotProps={{ htmlInput: { "aria-label": `Name of ${team.number}` } }} />
                                    </TableCell>
                                    <TableCell>
                                        <TextField
                                            select
                                            sx={{ minWidth: 150 }}
                                            value={assigned[team.number] ?? ""}
                                            onChange={(e) => setAssigned((map) => ({ ...map, [team.number]: e.target.value === "" ? null : Number(e.target.value) }))}
                                            slotProps={{ select: { native: true }, htmlInput: { "aria-label": `Starting bracket of ${team.number}` } }}
                                        >
                                            <option value="">None</option>
                                            {brackets.map((b, i) => (
                                                <option key={b.key} value={b.key}>
                                                    {bracketLabel(b, i)}
                                                </option>
                                            ))}
                                        </TextField>
                                    </TableCell>
                                    <TableCell>
                                        <Checkbox sx={{ p: "10px" }} checked={team.excluded} onChange={(e) => setTeam(team.number, { excluded: e.target.checked })} slotProps={{ input: { "aria-label": `Excluded: ${team.name}` } }} />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Stack>

            <Stack spacing={1}>
                <Typography component="h2" variant="h6">
                    Games
                </Typography>
                {doc.games.map((game, i) => (
                    <Stack key={i} direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
                        <Typography sx={{ minWidth: "11rem" }}>{`${game.date} · ${game.home} vs ${game.away}`}</Typography>
                        <TextField
                            label="Home"
                            value={game.homeGoals ?? ""}
                            onChange={(e) => {
                                const homeGoals = goalsValue(e.target.value);
                                if (homeGoals === undefined) return;
                                setGame(i, { homeGoals, status: homeGoals !== null && game.awayGoals !== null ? "final" : "scheduled" });
                            }}
                            sx={{ width: 80 }}
                        />
                        <TextField
                            label="Away"
                            value={game.awayGoals ?? ""}
                            onChange={(e) => {
                                const awayGoals = goalsValue(e.target.value);
                                if (awayGoals === undefined) return;
                                setGame(i, { awayGoals, status: game.homeGoals !== null && awayGoals !== null ? "final" : "scheduled" });
                            }}
                            sx={{ width: 80 }}
                        />
                        <IconButton aria-label={`Delete game ${i + 1}`} onClick={() => setDoc((d) => ({ ...d, games: d.games.filter((_g, k) => k !== i) }))} sx={{ width: 44, height: 44 }}>
                            ×
                        </IconButton>
                    </Stack>
                ))}
                <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1, alignItems: "center" }}>
                    <TextField label="Date" type="date" value={newGame.date} onChange={(e) => setNewGame({ ...newGame, date: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
                    {(["home", "away"] as const).map((side) => (
                        <TextField key={side} select label={side === "home" ? "Home team" : "Away team"} value={newGame[side]} onChange={(e) => setNewGame({ ...newGame, [side]: e.target.value })} sx={{ minWidth: 160 }}>
                            {doc.teams.map((t) => (
                                <MenuItem key={t.number} value={t.number}>
                                    {t.number} {t.name}
                                </MenuItem>
                            ))}
                        </TextField>
                    ))}
                    <Button
                        onClick={() => {
                            const status = newGame.homeGoals !== null && newGame.awayGoals !== null ? "final" : "scheduled";
                            setDoc((d) => ({ ...d, games: [...d.games, { ...newGame, status }] }));
                            setNewGame({ ...newGame, home: "", away: "", homeGoals: null, awayGoals: null });
                        }}
                        disabled={!newGame.date || !newGame.home || !newGame.away}
                        sx={{ minHeight: 44 }}
                    >
                        Add game
                    </Button>
                </Stack>
            </Stack>

            {error && <Alert severity="error">{error}</Alert>}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <Button variant="contained" onClick={() => void submit()} sx={{ minHeight: 44 }}>
                    {SAVE_SETUP_LABEL}
                </Button>
                <Button href={staticRoutes.rankings()} sx={{ minHeight: 44 }}>
                    Cancel
                </Button>
                {confirmClear ? (
                    <>
                        <Button color="error" variant="outlined" onClick={() => void clearAll()} sx={{ minHeight: 44 }}>
                            Yes, delete them
                        </Button>
                        <Button onClick={() => setConfirmClear(false)} sx={{ minHeight: 44 }}>
                            Keep them
                        </Button>
                    </>
                ) : (
                    <Button color="error" onClick={() => setConfirmClear(true)} sx={{ minHeight: 44 }}>
                        {CLEAR_ALL_LABEL}
                    </Button>
                )}
            </Stack>
        </Stack>
    );
}

export function RankingsSetupScreen({ store }: { store: LocalPlannerStore }) {
    const { state, save, clear } = useRankingsDoc(store);
    if (state.status !== "ready") return <RankingsStatus state={state} onStartOver={() => void clear()} />;
    if (!state.doc) return <RankingsStatus state={{ status: "empty" }} onStartOver={() => void clear()} />;
    return <Editor initial={state.doc} save={save} clear={clear} />;
}

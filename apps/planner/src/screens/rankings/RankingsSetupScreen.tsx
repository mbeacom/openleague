/** Setup (static rankings spec): title, goal cap, levels, teams (name, bracket, excluded, my team), games; validated on save. */
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
import type { RankingsDocument, RankingsGame } from "@/lib/rankings-document";
import { navigateTo } from "../../platform";
import { staticRoutes } from "../../routes";
import type { LocalPlannerStore } from "../../store/types";
import { RankingsStatus } from "./display";
import { useRankingsDoc } from "./useRankingsDoc";

export const SAVE_SETUP_LABEL = "Save setup";
export const CLEAR_ALL_LABEL = "Delete these rankings";

/** undefined = ignore the keystroke (not 0-2 digits); null = a deliberate clear. */
const goalsValue = (text: string): number | null | undefined => {
    if (text === "") return null;
    return /^\d{1,2}$/.test(text) ? Number(text) : undefined;
};

function Editor({ initial, save, clear }: { initial: RankingsDocument; save: LocalPlannerStore["saveRankings"]; clear: () => Promise<ActionResult<null>> }) {
    const [doc, setDoc] = useState<RankingsDocument>(initial);
    const [error, setError] = useState<string | null>(null);
    const [confirmClear, setConfirmClear] = useState(false);
    const [newGame, setNewGame] = useState<RankingsGame>({ date: "", time: null, home: "", away: "", homeGoals: null, awayGoals: null, status: "final", rink: null });

    const setLevel = (index: number, patch: Partial<{ name: string; size: number }>) =>
        setDoc((d) => ({ ...d, method: { ...d.method, levels: d.method.levels.map((l, i) => (i === index ? { ...l, ...patch } : l)) } }));
    const setTeam = (number: string, patch: Partial<RankingsDocument["teams"][number]>) =>
        setDoc((d) => ({ ...d, teams: d.teams.map((t) => (t.number === number ? { ...t, ...patch } : t)) }));
    const setGame = (index: number, patch: Partial<RankingsGame>) =>
        setDoc((d) => ({ ...d, games: d.games.map((g, i) => (i === index ? { ...g, ...patch } : g)) }));

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
        const result = await save(doc);
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
                <Typography variant="body2" color="text.secondary">
                    {`Levels hold ${doc.method.levels.reduce((sum, l) => sum + (Number.isFinite(l.size) ? l.size : 0), 0)} teams; ${doc.teams.filter((t) => !t.excluded).length} teams aren't excluded.`}
                </Typography>
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
                                            sx={{ minWidth: 150 }}
                                            value={team.startingBracket ?? ""}
                                            onChange={(e) => setTeam(team.number, { startingBracket: e.target.value || null })}
                                            slotProps={{ htmlInput: { "aria-label": `Starting bracket of ${team.number}` } }}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Checkbox sx={{ p: "10px" }} checked={team.excluded} onChange={(e) => setTeam(team.number, { excluded: e.target.checked })} slotProps={{ input: { "aria-label": "Excluded" } }} />
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

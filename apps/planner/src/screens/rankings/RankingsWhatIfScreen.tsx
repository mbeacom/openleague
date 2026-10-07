
/**
 * What-if (static rankings spec): scores typed for unplayed or hypothetical
 * games re-run everything in memory; a sweep shows the chosen team's level and
 * rank at every margin; "Record as final" is the only path to storage. Blank or
 * invalid scores mean "not applied" and never throw (Review Focus 5).
 */
import { useMemo, useRef, useState } from "react";
import { Alert, Box, Button, List, ListItem, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import { composite, marginSweep, whatIf, SWEEP_OTHER_GOALS, type RatingGame } from "@/lib/ratings";
import { toRatingInputs, type RankingsDocument, type RankingsGame } from "@/lib/rankings-document";
import type { LocalPlannerStore } from "../../store/types";
import { RankingsStatus, formatRating } from "./display";
import { useRankingsDoc } from "./useRankingsDoc";

export const RECORD_FINAL_LABEL = "Record as final";
export const ADD_HYPOTHETICAL_LABEL = "Add hypothetical game";
export const SWEEP_HEADING = "Every final margin";
export const WHO_MOVES_HEADING = "Who moves";

interface Fixture {
    id: string;
    home: string;
    away: string;
    date: string | null;
    /** Index into doc.games for a scheduled game; null for a hypothetical one. */
    gameIndex: number | null;
}

const goals = (text: string | undefined): number | null => (text !== undefined && /^\d{1,2}$/.test(text.trim()) ? Number(text) : null);

function WhatIf({ doc, save }: { doc: RankingsDocument; save: (doc: RankingsDocument) => Promise<unknown> }) {
    const [team, setTeam] = useState(doc.myTeam ?? doc.teams[0]?.number ?? "");
    const [scores, setScores] = useState<Record<string, { home?: string; away?: string }>>({});
    const [extra, setExtra] = useState<Fixture[]>([]);
    const [opponent, setOpponent] = useState("");
    const [sweepId, setSweepId] = useState<string | null>(null);
    const nextId = useRef(0);
    const names = new Map(doc.teams.map((t) => [t.number, t.name]));
    const name = (number: string) => names.get(number) ?? number;
    const { games, teams } = useMemo(() => toRatingInputs(doc), [doc]);

    const fixtures: Fixture[] = [
        ...doc.games
            .map((game, gameIndex) => ({ game, gameIndex }))
            .filter(({ game }) => game.status === "scheduled" && (game.home === team || game.away === team))
            .map(({ game, gameIndex }) => ({ id: `g${gameIndex}`, home: game.home, away: game.away, date: game.date, gameIndex })),
        ...extra.filter((f) => f.home === team || f.away === team),
    ];

    const entered = (f: Fixture): RatingGame | null => {
        const s = scores[f.id];
        const h = goals(s?.home);
        const a = goals(s?.away);
        return h === null || a === null ? null : { home: f.home, away: f.away, homeGoals: h, awayGoals: a };
    };
    const hypotheticals = fixtures.map(entered).filter((g): g is RatingGame => g !== null);
    const before = useMemo(() => composite(games, teams, doc.method), [games, teams, doc.method]);
    const after = whatIf(games, hypotheticals, teams, doc.method);
    const mineBefore = before.byNumber.get(team);
    const mineAfter = after.byNumber.get(team);
    const movers = after.ranked.filter((row) => before.byNumber.get(row.number)?.rank !== row.rank);

    const sweepFixture = fixtures.find((f) => f.id === sweepId) ?? fixtures[0];
    const otherEntered = sweepFixture ? fixtures.filter((f) => f.id !== sweepFixture.id).map(entered).filter((g): g is RatingGame => g !== null) : [];
    const sweep = sweepFixture ? marginSweep([...games, ...otherEntered], sweepFixture, team, teams, doc.method) : [];

    const record = async (f: Fixture) => {
        const game = entered(f);
        if (!game || f.gameIndex === null) return;
        const updated: RankingsGame = { ...doc.games[f.gameIndex], homeGoals: game.homeGoals, awayGoals: game.awayGoals, status: "final" };
        await save({ ...doc, games: doc.games.map((g, i) => (i === f.gameIndex ? updated : g)) });
        setScores((s) => ({ ...s, [f.id]: {} }));
    };

    return (
        <Stack spacing={3}>
            <Typography component="h1" variant="h5" sx={{ fontWeight: 800 }}>
                What-if
            </Typography>
            <TextField select label="Team" value={team} onChange={(e) => setTeam(e.target.value)} sx={{ maxWidth: 360 }}>
                {doc.teams.map((t) => (
                    <MenuItem key={t.number} value={t.number}>
                        {t.number} {t.name}
                    </MenuItem>
                ))}
            </TextField>

            {fixtures.length === 0 && <Alert severity="info">No unplayed games for this team. Add a hypothetical one below.</Alert>}
            {fixtures.map((f) => {
                const valid = entered(f) !== null;
                return (
                    <Paper key={f.id} variant="outlined" sx={{ p: 1.5 }}>
                        <Typography sx={{ mb: 1 }}>{`${f.date ?? "Hypothetical"} · ${name(f.home)} vs ${name(f.away)}`}</Typography>
                        <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
                            <TextField
                                label={`${name(f.home)} goals`}
                                value={scores[f.id]?.home ?? ""}
                                onChange={(e) => setScores((s) => ({ ...s, [f.id]: { ...s[f.id], home: e.target.value } }))}
                                size="small"
                                slotProps={{ htmlInput: { inputMode: "numeric" } }}
                                sx={{ width: 150 }}
                            />
                            <TextField
                                label={`${name(f.away)} goals`}
                                value={scores[f.id]?.away ?? ""}
                                onChange={(e) => setScores((s) => ({ ...s, [f.id]: { ...s[f.id], away: e.target.value } }))}
                                size="small"
                                slotProps={{ htmlInput: { inputMode: "numeric" } }}
                                sx={{ width: 150 }}
                            />
                            <Button onClick={() => setSweepId(f.id)} sx={{ minHeight: 44 }}>
                                Sweep this game
                            </Button>
                            {f.gameIndex !== null ? (
                                <Button variant="outlined" disabled={!valid} onClick={() => void record(f)} sx={{ minHeight: 44 }}>
                                    {RECORD_FINAL_LABEL}
                                </Button>
                            ) : (
                                <Button onClick={() => setExtra((list) => list.filter((x) => x.id !== f.id))} sx={{ minHeight: 44 }}>
                                    Remove
                                </Button>
                            )}
                        </Stack>
                    </Paper>
                );
            })}

            <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
                <TextField select label="Opponent" value={opponent} onChange={(e) => setOpponent(e.target.value)} size="small" sx={{ minWidth: 200 }}>
                    {doc.teams
                        .filter((t) => t.number !== team)
                        .map((t) => (
                            <MenuItem key={t.number} value={t.number}>
                                {t.number} {t.name}
                            </MenuItem>
                        ))}
                </TextField>
                <Button
                    disabled={!opponent || !team}
                    onClick={() => {
                        setExtra((list) => [...list, { id: `h${nextId.current++}`, home: team, away: opponent, date: null, gameIndex: null }]);
                        setOpponent("");
                    }}
                    sx={{ minHeight: 44 }}
                >
                    {ADD_HYPOTHETICAL_LABEL}
                </Button>
            </Stack>

            {mineBefore && mineAfter && hypotheticals.length > 0 && (
                <Paper variant="outlined" sx={{ p: 2 }}>
                    <Typography sx={{ fontWeight: 800 }}>{`Rank ${mineBefore.rank ?? "—"} → ${mineAfter.rank ?? "—"}`}</Typography>
                    <Typography>{`RPI ${formatRating(mineBefore.rpi)} → ${formatRating(mineAfter.rpi)} · Level ${mineBefore.level ?? "—"} → ${mineAfter.level ?? "—"}`}</Typography>
                </Paper>
            )}

            {sweepFixture && (
                <Stack spacing={1}>
                    <Typography component="h2" variant="h6" id="sweep-heading">
                        {SWEEP_HEADING}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        {`${name(team)} vs ${name(sweepFixture.home === team ? sweepFixture.away : sweepFixture.home)}, assuming the losing side scores ${SWEEP_OTHER_GOALS}.`}
                    </Typography>
                    <Box component="ul" aria-label={SWEEP_HEADING} sx={{ display: "flex", gap: 0.5, overflowX: "auto", listStyle: "none", p: 0, m: 0, pb: 1 }}>
                        {sweep.map((cell) => (
                            <Box
                                component="li"
                                key={cell.margin}
                                sx={{ minWidth: 64, minHeight: 64, p: 0.75, borderRadius: 1, border: 1, borderColor: cell.margin === 0 ? "text.secondary" : "divider", textAlign: "center" }}
                            >
                                <Typography sx={{ fontWeight: 800 }}>{cell.margin > 0 ? `+${cell.margin}` : cell.margin}</Typography>
                                <Typography variant="body2">{cell.level ?? "—"}</Typography>
                                <Typography variant="caption" color="text.secondary">{`#${cell.rank ?? "—"}`}</Typography>
                            </Box>
                        ))}
                    </Box>
                </Stack>
            )}

            {hypotheticals.length > 0 && (
                <Stack spacing={1}>
                    <Typography component="h2" variant="h6">
                        {WHO_MOVES_HEADING}
                    </Typography>
                    {movers.length === 0 ? (
                        <Typography color="text.secondary">No ranks change.</Typography>
                    ) : (
                        <List dense>
                            {movers.map((row) => (
                                <ListItem key={row.number}>{`${row.name}: ${before.byNumber.get(row.number)?.rank ?? "—"} → ${row.rank}`}</ListItem>
                            ))}
                        </List>
                    )}
                </Stack>
            )}
        </Stack>
    );
}

export function RankingsWhatIfScreen({ store }: { store: LocalPlannerStore }) {
    const { state, save, clear } = useRankingsDoc(store);
    if (state.status !== "ready") return <RankingsStatus state={state} onStartOver={() => void clear()} />;
    if (!state.doc) return <RankingsStatus state={{ status: "empty" }} onStartOver={() => void clear()} />;
    return <WhatIf doc={state.doc} save={save} />;
}

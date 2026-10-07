/** Team detail (static rankings spec): game log with capped margins and the arithmetic behind the numbers. */
import { Alert, Box, Button, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import { capMargin } from "@/lib/ratings";
import type { RankingsDocument } from "@/lib/rankings-document";
import { staticRoutes } from "../../routes";
import type { LocalPlannerStore } from "../../store/types";
import { MovementLabel, RankingsStatus, formatRating, formatSigned } from "./display";
import { useRatings } from "./RankingsScreen";
import { useRankingsDoc } from "./useRankingsDoc";

export const TEAM_NOT_FOUND_MESSAGE = "That team isn't in these rankings.";

function TeamDetail({ doc, number }: { doc: RankingsDocument; number: string }) {
    const result = useRatings(doc);
    const row = result.byNumber.get(number);
    if (!row) return <Alert severity="warning">{TEAM_NOT_FOUND_MESSAGE}</Alert>;
    const cap = doc.method.goalCap;
    const names = new Map(doc.teams.map((team) => [team.number, team.name]));
    const games = doc.games.filter((game) => game.home === number || game.away === number);
    const finals = games.filter((game) => game.status === "final");
    const upcoming = games.filter((game) => game.status === "scheduled");

    return (
        <Stack spacing={2}>
            <Button href={staticRoutes.rankings()} sx={{ alignSelf: "flex-start", minHeight: 44 }}>
                ← All teams
            </Button>
            <Typography component="h1" variant="h5" sx={{ fontWeight: 800 }}>
                {row.name} ({row.number})
            </Typography>
            <Typography>
                Rank {row.rank ?? "—"} · RPI {formatRating(row.rpi)} · Level {row.level ?? "—"} <MovementLabel movement={row.movement} startingBracket={row.startingBracket} />
            </Typography>
            <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography sx={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                    {`AGD ${formatSigned(row.agd)} + SCHED ${formatSigned(row.sched)} = Lodin ${formatSigned(row.lodin)}`}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    AGD is the average goal margin, with each game capped at {cap}. SCHED is the average rating of the opponents played.
                    {row.lowConfidence ? ` Fewer than ${doc.method.lowConfidenceGames} games: treat this rating with caution.` : ""}
                </Typography>
            </Paper>

            <TableContainer component={Paper} variant="outlined">
                <Table size="small" aria-label="Game log">
                    <TableHead>
                        <TableRow>
                            <TableCell>Date</TableCell>
                            <TableCell>Opponent</TableCell>
                            <TableCell align="right">Opp. rating</TableCell>
                            <TableCell>Score</TableCell>
                            <TableCell align="right">Margin</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {finals.map((game, i) => {
                            const home = game.home === number;
                            const opponent = home ? game.away : game.home;
                            const goalsFor = home ? game.homeGoals! : game.awayGoals!;
                            const goalsAgainst = home ? game.awayGoals! : game.homeGoals!;
                            const raw = goalsFor - goalsAgainst;
                            const margin = capMargin(raw, cap);
                            return (
                                <TableRow key={`${game.date}-${opponent}-${i}`}>
                                    <TableCell>{game.date}</TableCell>
                                    <TableCell>
                                        <a href={staticRoutes.rankingsTeam(opponent)} style={{ display: "inline-flex", alignItems: "center", minHeight: 44 }}>{names.get(opponent) ?? opponent}</a>
                                    </TableCell>
                                    <TableCell align="right">{formatSigned(result.byNumber.get(opponent)?.lodin ?? null)}</TableCell>
                                    <TableCell>{`${goalsFor > goalsAgainst ? "W" : goalsFor < goalsAgainst ? "L" : "T"} ${goalsFor}–${goalsAgainst}`}</TableCell>
                                    <TableCell align="right">
                                        <Box component="span" sx={{ fontVariantNumeric: "tabular-nums" }}>
                                            {margin > 0 ? `+${margin}` : margin}
                                        </Box>
                                        {raw !== margin && (
                                            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                                                capped at {cap}
                                            </Typography>
                                        )}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </TableContainer>
            {!finals.some((game) => Math.abs((game.homeGoals ?? 0) - (game.awayGoals ?? 0)) > cap) && (
                <Typography variant="caption" color="text.secondary">
                    Margins are capped at {cap}; no game here reached the cap.
                </Typography>
            )}

            {upcoming.length > 0 && (
                <Stack spacing={0.5}>
                    <Typography component="h2" variant="h6">
                        Still to play
                    </Typography>
                    {upcoming.map((game, i) => {
                        const opponent = game.home === number ? game.away : game.home;
                        return <Typography key={`${game.date}-${opponent}-${i}`}>{`${game.date} vs ${names.get(opponent) ?? opponent}`}</Typography>;
                    })}
                    <Button href={staticRoutes.rankingsWhatIf()} variant="contained" sx={{ alignSelf: "flex-start", minHeight: 44 }}>
                        Try results in What-if
                    </Button>
                </Stack>
            )}
        </Stack>
    );
}

export function RankingsTeamScreen({ store, number }: { store: LocalPlannerStore; number: string }) {
    const { state, clear } = useRankingsDoc(store);
    if (state.status !== "ready") return <RankingsStatus state={state} onStartOver={() => void clear()} />;
    if (!state.doc) return <RankingsStatus state={{ status: "empty" }} onStartOver={() => void clear()} />;
    return <TeamDetail doc={state.doc} number={number} />;
}

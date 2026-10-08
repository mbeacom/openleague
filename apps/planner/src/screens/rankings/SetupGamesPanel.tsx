/**
 * Setup → Games: games grouped by day as compact scoreboard cards, filtered by
 * team, status and date, shown a page at a time. A card opens an edit dialog;
 * "Add game" opens the same form empty. Edits go into Setup's draft.
 */
import { useId, useState } from "react";
import {
    Alert,
    Box,
    Button,
    ButtonBase,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Stack,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
    useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { RankingsGame, RankingsTeam } from "@/lib/rankings-document";
import { TeamMark } from "./TeamMark";
import { DEFAULT_GAME_FILTER, dayHeading, filterGames, gameDates, groupByDate, type GameFilter, type GameStatusFilter, type IndexedGame } from "./setup-model";

export const ADD_GAME_LABEL = "Add game";
export const NO_GAMES_MATCH = "No games match these filters.";
export const HALF_SCORE_MESSAGE = "Enter both scores or neither.";
export const SAME_TEAM_MESSAGE = "A team can't play itself.";
/** Games shown at first, and added by each "Show more". */
export const GAMES_PAGE_SIZE = 40;
const TARGET = { minHeight: 44 } as const;
const MONO = { fontFamily: "var(--font-mono), ui-monospace, monospace", fontVariantNumeric: "tabular-nums" } as const;

/** undefined = ignore the keystroke (not 0-2 digits); null = a deliberate clear. */
export const goalsValue = (text: string): number | null | undefined => {
    if (text === "") return null;
    return /^\d{1,2}$/.test(text) ? Number(text) : undefined;
};

export const editGameLabel = (game: RankingsGame) => `Edit game ${game.date} ${game.home} vs ${game.away}`;

export const EMPTY_GAME: RankingsGame = { date: "", time: null, home: "", away: "", homeGoals: null, awayGoals: null, status: "scheduled", rink: null };

/** Why the game's form can't be kept as is, or null. */
export function gameFormProblem(game: RankingsGame): string | null {
    if (game.home && game.home === game.away) return SAME_TEAM_MESSAGE;
    if ((game.homeGoals === null) !== (game.awayGoals === null)) return HALF_SCORE_MESSAGE;
    return null;
}

function GameCard({ game, nameOf, myTeam, onEdit }: { game: RankingsGame; nameOf: (number: string) => string; myTeam: string | null; onEdit: () => void }) {
    const final = game.status === "final" && game.homeGoals !== null && game.awayGoals !== null;
    const side = (number: string, goals: number | null, other: number | null) => {
        const won = final && goals !== null && other !== null && goals > other;
        const lost = final && goals !== null && other !== null && goals < other;
        return (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <TeamMark number={number} name={nameOf(number)} size="xs" mine={myTeam === number} strong={won} muted={lost} />
                </Box>
                <Box sx={{ ...MONO, fontSize: "1.125rem", fontWeight: won ? 800 : 500, minWidth: 24, textAlign: "right", color: final ? "text.primary" : "text.disabled" }}>
                    {final ? goals : "–"}
                </Box>
            </Box>
        );
    };
    return (
        <ButtonBase
            onClick={onEdit}
            aria-label={editGameLabel(game)}
            focusRipple
            sx={{
                width: "100%",
                display: "block",
                textAlign: "left",
                px: 1.5,
                py: 1,
                bgcolor: "background.paper",
                border: 1,
                borderColor: "divider",
                borderLeft: "3px solid",
                borderLeftColor: final ? "primary.main" : "divider",
                borderRadius: 1,
                "&:hover": { bgcolor: "action.hover" },
                "&.Mui-focusVisible": { outline: "2px solid", outlineColor: "secondary.main", outlineOffset: 2 },
            }}
        >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.75, fontSize: "0.75rem", color: "text.secondary" }}>
                <Box component="span" sx={{ ...MONO, fontWeight: 600, color: "text.primary" }}>
                    {game.time ?? "No time"}
                </Box>
                {game.rink && (
                    <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                        {game.rink}
                    </Box>
                )}
                <Box
                    component="span"
                    sx={{ ml: "auto", fontSize: "0.625rem", fontWeight: 800, letterSpacing: "0.09em", textTransform: "uppercase", color: final ? "primary.main" : "text.secondary", flexShrink: 0 }}
                >
                    {final ? "Final" : "Scheduled"}
                </Box>
            </Box>
            <Stack spacing={0.5}>
                {side(game.home, game.homeGoals, game.awayGoals)}
                {side(game.away, game.awayGoals, game.homeGoals)}
            </Stack>
        </ButtonBase>
    );
}

export function SetupGamesPanel({
    games,
    teams,
    myTeam,
    filter,
    onFilter,
    limit,
    onLimit,
    onEdit,
    onAdd,
}: {
    games: readonly RankingsGame[];
    teams: readonly RankingsTeam[];
    myTeam: string | null;
    filter: GameFilter;
    onFilter: (filter: GameFilter) => void;
    limit: number;
    onLimit: (limit: number) => void;
    onEdit: (index: number) => void;
    onAdd: () => void;
}) {
    const names = new Map(teams.map((t) => [t.number, t.name]));
    const nameOf = (number: string) => names.get(number) ?? number;
    const matching = filterGames(games, filter);
    const shown: IndexedGame[] = matching.slice(0, limit);
    const days = groupByDate(shown);
    const dates = gameDates(games);
    const filtered = filter.team !== "" || filter.status !== "all" || filter.date !== "";
    const setFilter = (next: GameFilter) => {
        onFilter(next);
        onLimit(GAMES_PAGE_SIZE);
    };

    return (
        <Stack spacing={2}>
            <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "minmax(0, 1fr) minmax(0, 1fr) auto auto" }, alignItems: "center" }}>
                <TextField
                    select
                    label="Team"
                    value={filter.team}
                    onChange={(e) => setFilter({ ...filter, team: e.target.value })}
                    slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
                >
                    <option value="">All teams</option>
                    {teams.map((t) => (
                        <option key={t.number} value={t.number}>
                            {`${t.number} ${t.name}`}
                        </option>
                    ))}
                </TextField>
                <TextField
                    select
                    label="Date"
                    value={filter.date}
                    onChange={(e) => setFilter({ ...filter, date: e.target.value })}
                    slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
                >
                    <option value="">All dates</option>
                    {dates.map(({ date, count }) => (
                        <option key={date} value={date}>
                            {`${dayHeading(date)} (${count})`}
                        </option>
                    ))}
                </TextField>
                <ToggleButtonGroup
                    exclusive
                    size="small"
                    value={filter.status}
                    onChange={(_e, value: GameStatusFilter | null) => value && setFilter({ ...filter, status: value })}
                    aria-label="Status"
                    sx={{ "& .MuiToggleButton-root": { ...TARGET, minWidth: 44, px: 1.5, textTransform: "none", flex: { xs: 1, md: "none" } } }}
                >
                    <ToggleButton value="all">All</ToggleButton>
                    <ToggleButton value="final">Final</ToggleButton>
                    <ToggleButton value="scheduled">Scheduled</ToggleButton>
                </ToggleButtonGroup>
                <Button variant="contained" onClick={onAdd} sx={{ ...TARGET, whiteSpace: "nowrap" }}>
                    {ADD_GAME_LABEL}
                </Button>
            </Box>
            <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", minHeight: 44 }}>
                <Typography variant="body2" color="text.secondary" role="status">
                    {`Showing ${shown.length} of ${matching.length} ${matching.length === 1 ? "game" : "games"}${filtered ? ` (${games.length} in all)` : ""}`}
                </Typography>
                {filtered && (
                    <Button onClick={() => setFilter(DEFAULT_GAME_FILTER)} sx={TARGET}>
                        Clear filters
                    </Button>
                )}
            </Stack>
            {games.length === 0 ? (
                <Typography color="text.secondary">No games yet. Import a schedule, or add them one at a time.</Typography>
            ) : matching.length === 0 ? (
                <Typography color="text.secondary">{NO_GAMES_MATCH}</Typography>
            ) : (
                <Stack spacing={2.5}>
                    {days.map((day) => (
                        <Box component="section" key={day.date} aria-label={dayHeading(day.date)}>
                            <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, mb: 1, pb: 0.5, borderBottom: 1, borderColor: "divider" }}>
                                <Typography component="h3" sx={{ fontWeight: 800, fontSize: "0.9375rem" }}>
                                    {dayHeading(day.date)}
                                </Typography>
                                <Box component="span" sx={{ ...MONO, fontSize: "0.75rem", color: "text.secondary" }}>
                                    {`${day.games.length} ${day.games.length === 1 ? "game" : "games"}`}
                                </Box>
                            </Box>
                            <Box
                                component="ul"
                                sx={{
                                    listStyle: "none",
                                    p: 0,
                                    m: 0,
                                    display: "grid",
                                    gap: 1,
                                    gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(3, minmax(0, 1fr))" },
                                }}
                            >
                                {day.games.map(({ game, index }) => (
                                    <Box component="li" key={index} sx={{ minWidth: 0 }}>
                                        <GameCard game={game} nameOf={nameOf} myTeam={myTeam} onEdit={() => onEdit(index)} />
                                    </Box>
                                ))}
                            </Box>
                        </Box>
                    ))}
                </Stack>
            )}
            {matching.length > shown.length && (
                <Button variant="outlined" onClick={() => onLimit(limit + GAMES_PAGE_SIZE)} sx={{ ...TARGET, alignSelf: "center" }}>
                    {`Show ${Math.min(GAMES_PAGE_SIZE, matching.length - shown.length)} more (${matching.length - shown.length} left)`}
                </Button>
            )}
        </Stack>
    );
}

/** The game form: date, time, the two teams, the score and the rink. Scores set the status. */
function GameFields({ game, teams, onChange }: { game: RankingsGame; teams: readonly RankingsTeam[]; onChange: (patch: Partial<RankingsGame>) => void }) {
    const score = (side: "homeGoals" | "awayGoals", text: string) => {
        const value = goalsValue(text);
        if (value === undefined) return;
        const next = { ...game, [side]: value };
        onChange({ [side]: value, status: next.homeGoals !== null && next.awayGoals !== null ? "final" : "scheduled" });
    };
    const teamSelect = (side: "home" | "away") => (
        <TextField
            select
            label={side === "home" ? "Home team" : "Away team"}
            value={game[side]}
            onChange={(e) => onChange({ [side]: e.target.value })}
            slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
            fullWidth
        >
            <option value="">Choose a team</option>
            {teams.map((t) => (
                <option key={t.number} value={t.number}>
                    {`${t.number} ${t.name}`}
                </option>
            ))}
        </TextField>
    );
    const scoreField = (side: "homeGoals" | "awayGoals") => (
        <TextField
            label={side === "homeGoals" ? "Home" : "Away"}
            value={game[side] ?? ""}
            onChange={(e) => score(side, e.target.value)}
            slotProps={{ htmlInput: { inputMode: "numeric", pattern: "[0-9]*", sx: { ...MONO, fontSize: "1.25rem", textAlign: "center" } } }}
            sx={{ width: 88, flexShrink: 0 }}
        />
    );
    return (
        <Stack spacing={2}>
            <Box sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 1 }}>
                <TextField label="Date" type="date" value={game.date} onChange={(e) => onChange({ date: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
                <TextField label="Time" type="time" value={game.time ?? ""} onChange={(e) => onChange({ time: e.target.value || null })} slotProps={{ inputLabel: { shrink: true } }} />
            </Box>
            <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
                {teamSelect("home")}
                {scoreField("homeGoals")}
            </Stack>
            <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
                {teamSelect("away")}
                {scoreField("awayGoals")}
            </Stack>
            <Typography variant="body2" color="text.secondary">
                Leave both scores empty for a game not played yet.
            </Typography>
            <TextField label="Rink" value={game.rink ?? ""} onChange={(e) => onChange({ rink: e.target.value || null })} slotProps={{ htmlInput: { maxLength: 100 } }} />
        </Stack>
    );
}

/** Edits a game in place; Done just closes (Save setup keeps it). */
export function EditGameDialog({
    game,
    teams,
    onChange,
    onDelete,
    onClose,
}: {
    game: RankingsGame;
    teams: readonly RankingsTeam[];
    onChange: (patch: Partial<RankingsGame>) => void;
    onDelete: () => void;
    onClose: () => void;
}) {
    const theme = useTheme();
    const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
    const titleId = useId();
    const problem = gameFormProblem(game);
    return (
        <Dialog open onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="xs" aria-labelledby={titleId}>
            <DialogTitle id={titleId} sx={{ fontWeight: 800 }}>
                Edit game
            </DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
                    <GameFields game={game} teams={teams} onChange={onChange} />
                    {problem && <Alert severity="warning">{problem}</Alert>}
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2, gap: 1, flexWrap: "wrap" }}>
                <Button color="error" onClick={onDelete} sx={{ ...TARGET, mr: "auto" }}>
                    Delete this game
                </Button>
                <Button variant="contained" onClick={onClose} sx={TARGET}>
                    Done
                </Button>
            </DialogActions>
        </Dialog>
    );
}

/** A new game in its own draft: added only when complete. */
export function AddGameDialog({ teams, initial, onAdd, onClose }: { teams: readonly RankingsTeam[]; initial: RankingsGame; onAdd: (game: RankingsGame) => void; onClose: () => void }) {
    const theme = useTheme();
    const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
    const titleId = useId();
    const [game, setGame] = useState<RankingsGame>(initial);
    const problem = gameFormProblem(game);
    const ready = Boolean(game.date && game.home && game.away) && problem === null;
    return (
        <Dialog open onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="xs" aria-labelledby={titleId}>
            <DialogTitle id={titleId} sx={{ fontWeight: 800 }}>
                {ADD_GAME_LABEL}
            </DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
                    <GameFields game={game} teams={teams} onChange={(patch) => setGame((g) => ({ ...g, ...patch }))} />
                    {problem && <Alert severity="warning">{problem}</Alert>}
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
                <Button onClick={onClose} sx={TARGET}>
                    Cancel
                </Button>
                <Button variant="contained" disabled={!ready} onClick={() => onAdd(game)} sx={TARGET}>
                    {ADD_GAME_LABEL}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

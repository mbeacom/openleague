/**
 * Rankings (static rankings spec, Screens): my-team tiles, a ladder with level
 * bands (a compact list on phones), a sortable table with every column, filters,
 * the method summary and export. Movement is always an icon plus a word.
 */
import { useMemo, useState, type ReactNode } from "react";
import {
    Alert,
    Box,
    Button,
    Checkbox,
    Chip,
    FormControlLabel,
    MenuItem,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TableSortLabel,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Tooltip,
    Typography,
} from "@mui/material";
import { downloadBlob } from "@/components/features/practice-planner/export/download";
import { compareTeamNumbers, composite, type RatingMethod, type RatingsResult, type TeamRating } from "@/lib/ratings";
import { rankingsFileName, serializeRankings, toRatingInputs, type RankingsDocument } from "@/lib/rankings-document";
import { staticRoutes } from "../../routes";
import type { LocalPlannerStore } from "../../store/types";
import {
    BELOW_LAST_LEVEL,
    COMPONENTS_WARNING,
    MovementLabel,
    NOT_CONVERGED_WARNING,
    NO_GAMES_LABEL,
    RankingsStatus,
    formatRating,
    formatSigned,
    levelBandSx,
    levelText,
    levelsHeld,
} from "./display";
import { useRankingsDoc } from "./useRankingsDoc";

export const PICK_TEAM_LABEL = "Pick your team";
export const LADDER_LABEL = "Ladder";
export const TABLE_LABEL = "Table";
export const EXPORT_LABEL = "Export rankings file";
export const FEW_GAMES_LABEL = "Few games";

/** "Your levels hold 46 teams but 51 are ranked, so 5 have no suggested level." */
export function levelsShortMessage(held: number, ranked: number): string {
    return `Your levels hold ${held} teams but ${ranked} are ranked, so ${ranked - held} have no suggested level.`;
}

type SortKey = "rank" | "name" | "startingBracket" | "games" | "agd" | "sched" | "lodin" | "walkush" | "lodinScaled" | "walkushScaled" | "rpi";

interface Column {
    label: string;
    numeric: boolean;
    /** Sortable columns name their key. */
    key?: SortKey;
    cell: (row: TeamRating) => ReactNode;
}

const teamLink = (row: TeamRating) => (
    <Box component="a" href={staticRoutes.rankingsTeam(row.number)} sx={{ display: "inline-flex", alignItems: "center", minHeight: 44, color: "inherit" }}>
        {row.name}
    </Box>
);

const COLUMNS: Column[] = [
    { key: "rank", label: "Rank", numeric: true, cell: (row) => row.rank ?? "—" },
    { key: "name", label: "Team", numeric: false, cell: teamLink },
    { key: "startingBracket", label: "Starting bracket", numeric: false, cell: (row) => row.startingBracket ?? "—" },
    { key: "games", label: "GP", numeric: true, cell: (row) => row.games },
    { label: "W-L-T", numeric: false, cell: (row) => `${row.wins}-${row.losses}-${row.ties}` },
    { key: "agd", label: "AGD", numeric: true, cell: (row) => formatSigned(row.agd) },
    { key: "sched", label: "SCHED", numeric: true, cell: (row) => formatSigned(row.sched) },
    { key: "lodin", label: "Lodin", numeric: true, cell: (row) => formatSigned(row.lodin) },
    { key: "walkush", label: "Walkush (approx.)", numeric: true, cell: (row) => formatRating(row.walkush, 2) },
    { key: "lodinScaled", label: "Lodin scaled", numeric: true, cell: (row) => formatRating(row.lodinScaled) },
    { key: "walkushScaled", label: "Walkush (approx.) scaled", numeric: true, cell: (row) => formatRating(row.walkushScaled) },
    { key: "rpi", label: "CSHL-compatible RPI", numeric: true, cell: (row) => formatRating(row.rpi) },
    { label: "Level", numeric: false, cell: levelText },
    { label: "Movement", numeric: false, cell: (row) => <MovementLabel movement={row.movement} startingBracket={row.startingBracket} /> },
    { label: FEW_GAMES_LABEL, numeric: false, cell: (row) => (row.lowConfidence && row.games > 0 ? FEW_GAMES_LABEL : "") },
];

export function useRatings(doc: RankingsDocument): RatingsResult {
    return useMemo(() => {
        const { games, teams, options } = toRatingInputs(doc);
        return composite(games, teams, doc.method, options);
    }, [doc]);
}

function opponentsOf(doc: RankingsDocument, team: string | null): Set<string> {
    const set = new Set<string>();
    if (!team) return set;
    for (const game of doc.games) {
        if (game.home === team) set.add(game.away);
        if (game.away === team) set.add(game.home);
    }
    return set;
}

function Tiles({ row, total }: { row: TeamRating; total: number }) {
    const level = levelText(row);
    const tiles = [
        { label: "CSHL-compatible RPI", value: formatRating(row.rpi) },
        { label: "Rank", value: row.rank === null ? "—" : `${row.rank} of ${total}` },
        { label: "Suggested level", value: level, extra: <MovementLabel movement={row.movement} startingBracket={row.startingBracket} /> },
    ];
    return (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" }, gap: 1.5 }}>
            {tiles.map((tile) => (
                <Paper key={tile.label} variant="outlined" sx={{ p: 2, borderRadius: 1 }}>
                    <Typography variant="overline" color="text.secondary">
                        {tile.label}
                    </Typography>
                    <Typography sx={{ fontSize: tile.value.length > 8 ? { xs: 22, sm: 24 } : { xs: 28, sm: 34 }, fontWeight: 800, lineHeight: 1.1 }}>{tile.value}</Typography>
                    {tile.extra}
                </Paper>
            ))}
        </Box>
    );
}

function Ladder({ rows, doc, myTeam }: { rows: TeamRating[]; doc: RankingsDocument; myTeam: string | null }) {
    const levelIndex = new Map(doc.method.levels.map((level, i) => [level.name, i]));
    const groupOf = (row: TeamRating) => (row.rank === null ? "unranked" : row.level === null ? "below" : `level:${row.level}`);
    return (
        <Stack component="ol" sx={{ listStyle: "none", p: 0, m: 0 }} aria-label="Rankings ladder">
            {rows.map((row, index) => {
                const header = index === 0 || groupOf(row) !== groupOf(rows[index - 1]) ? (row.rank === null ? "Not ranked" : row.level ?? BELOW_LAST_LEVEL) : null;
                const level = row.level;
                const mine = row.number === myTeam;
                const caption = [
                    row.number,
                    row.startingBracket && !row.movement ? `started ${row.startingBracket}` : null,
                    row.excluded ? "excluded" : row.games === 0 ? NO_GAMES_LABEL : null,
                ].filter(Boolean);
                return (
                    <Box component="li" key={row.number}>
                        {header && (
                            <Typography variant="subtitle2" sx={{ mt: 1.5, px: 1, fontWeight: 800, borderTop: 2, borderColor: "divider" }}>
                                {header}
                            </Typography>
                        )}
                        <Box
                            data-level={level ?? undefined}
                            sx={(theme) => ({
                                display: "grid",
                                gridTemplateColumns: { xs: "2.5rem 1fr auto", sm: "2.5rem minmax(9rem, 14rem) 1fr 3.5rem 12rem" },
                                alignItems: "center",
                                gap: 1,
                                minHeight: 44,
                                px: 1,
                                borderLeft: 4,
                                borderColor: mine ? "secondary.main" : "transparent",
                                ...(level === null ? {} : levelBandSx(theme, levelIndex.get(level) ?? 0, doc.method.levels.length)),
                            })}
                        >
                            <Typography sx={{ fontWeight: 700 }}>{row.rank ?? "—"}</Typography>
                            <Box sx={{ minWidth: 0 }}>
                                <Box component="a" href={staticRoutes.rankingsTeam(row.number)} sx={{ color: "text.primary", fontWeight: mine ? 800 : 500, display: "inline-flex", alignItems: "center", minHeight: 44 }}>
                                    {row.name}
                                </Box>
                                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                                    {caption.join(" · ")}
                                </Typography>
                                <Box sx={{ display: { xs: "block", sm: "none" } }}>
                                    <MovementLabel movement={row.movement} startingBracket={row.startingBracket} />
                                </Box>
                                {row.lowConfidence && row.games > 0 && row.rank !== null && <Chip size="small" label={FEW_GAMES_LABEL} variant="outlined" sx={{ mt: 0.25 }} />}
                            </Box>
                            <Box sx={{ display: { xs: "none", sm: "block" }, position: "relative", height: 10, borderRadius: 5, bgcolor: "action.hover" }}>
                                {row.rpi !== null && (
                                    <Tooltip title={`RPI ${formatRating(row.rpi)} · Lodin ${formatRating(row.lodin)} · Walkush (approx.) ${formatRating(row.walkush, 2)} · ${row.wins}-${row.losses}-${row.ties}`}>
                                        <Box
                                            tabIndex={0}
                                            role="img"
                                            aria-label={`${row.name} RPI ${formatRating(row.rpi)}`}
                                            sx={{
                                                position: "absolute",
                                                top: "50%",
                                                left: `${(row.rpi / 20) * 100}%`,
                                                width: 14,
                                                height: 14,
                                                transform: "translate(-50%, -50%)",
                                                borderRadius: "50%",
                                                bgcolor: mine ? "secondary.main" : "primary.main",
                                                border: 2,
                                                borderColor: "background.paper",
                                            }}
                                        />
                                    </Tooltip>
                                )}
                            </Box>
                            <Typography sx={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{formatRating(row.rpi)}</Typography>
                            <Box sx={{ display: { xs: "none", sm: "block" } }}>
                                <MovementLabel movement={row.movement} startingBracket={row.startingBracket} />
                            </Box>
                        </Box>
                    </Box>
                );
            })}
        </Stack>
    );
}

function sortValue(row: TeamRating, key: SortKey): number | string | null {
    if (key === "name") return row.name.toLowerCase();
    if (key === "startingBracket") return row.startingBracket?.toLowerCase() ?? null;
    return row[key];
}

/** Nulls (unranked, excluded) always sort last, in both directions; ties fall back to team number. */
function compareRows(a: TeamRating, b: TeamRating, key: SortKey, dir: "asc" | "desc"): number {
    const x = sortValue(a, key);
    const y = sortValue(b, key);
    if (x === null && y !== null) return 1;
    if (y === null && x !== null) return -1;
    if (x !== null && y !== null && x !== y) {
        const cmp = typeof x === "string" && typeof y === "string" ? x.localeCompare(y) : (x as number) - (y as number);
        if (cmp !== 0) return dir === "asc" ? cmp : -cmp;
    }
    return compareTeamNumbers(a.number, b.number);
}

function RatingsTable({ rows, cap }: { rows: TeamRating[]; cap: number }) {
    const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "rank", dir: "asc" });
    const sorted = [...rows].sort((a, b) => compareRows(a, b, sort.key, sort.dir));
    return (
        <TableContainer component={Paper} variant="outlined">
            <Table size="small" aria-label={`Ratings table, margins capped at ${cap}`}>
                <TableHead>
                    <TableRow>
                        {COLUMNS.map((column) => {
                            const key = column.key;
                            return (
                                <TableCell key={column.label} align={column.numeric ? "right" : "left"} sortDirection={key && sort.key === key ? sort.dir : false}>
                                    {key ? (
                                        <TableSortLabel
                                            active={sort.key === key}
                                            direction={sort.key === key ? sort.dir : "asc"}
                                            onClick={() => setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }))}
                                            sx={{ minHeight: 44 }}
                                        >
                                            {column.label}
                                        </TableSortLabel>
                                    ) : (
                                        column.label
                                    )}
                                </TableCell>
                            );
                        })}
                    </TableRow>
                </TableHead>
                <TableBody>
                    {sorted.map((row) => (
                        <TableRow key={row.number}>
                            {COLUMNS.map((column) => (
                                <TableCell key={column.label} align={column.numeric ? "right" : "left"} sx={{ whiteSpace: column.key === "name" ? undefined : "nowrap" }}>
                                    {column.cell(row)}
                                </TableCell>
                            ))}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    );
}

/** Every method setting, in words (spec success criterion 5). */
function MethodSummary({ method }: { method: RatingMethod }) {
    const levels = method.levels.map((level) => `${level.name} ${level.size}`).join(", ");
    return (
        <Stack spacing={0.5} component="section" aria-label="Method">
            <Typography variant="body2" color="text.secondary">
                {`CSHL-compatible RPI = (Lodin scaled + Walkush (approx.) scaled) ÷ 2, each scaled 0–20 over the teams that aren't excluded. Not the league's official number.`}
            </Typography>
            <Typography variant="body2" color="text.secondary" component="ul" sx={{ m: 0, pl: 2.5 }}>
                <li>{`Goal margins capped at ${method.goalCap} for AGD (Lodin = AGD + SCHED).`}</li>
                <li>{`Walkush (approx.) variant: ${method.walkush.variant}, a ratio of (goals for + 1) ÷ (goals against + 1) per game.`}</li>
                <li>{`"${FEW_GAMES_LABEL}" when a team has fewer than ${method.lowConfidenceGames} final games.`}</li>
                <li>{`Levels, top first: ${levels} (${levelsHeld(method)} teams).`}</li>
            </Typography>
        </Stack>
    );
}

function Ready({ doc, save }: { doc: RankingsDocument; save: (doc: RankingsDocument) => Promise<unknown> }) {
    const result = useRatings(doc);
    const [view, setView] = useState<"ladder" | "table">("ladder");
    const [query, setQuery] = useState("");
    const [bracket, setBracket] = useState("");
    const [onlyOpponents, setOnlyOpponents] = useState(false);
    const brackets = [...new Set(doc.teams.map((team) => team.startingBracket).filter((b): b is string => !!b))];
    const opponents = opponentsOf(doc, doc.myTeam);
    const rows = result.teams.filter(
        (row) =>
            (!query || row.name.toLowerCase().includes(query.toLowerCase()) || row.number.includes(query)) &&
            (!bracket || row.startingBracket === bracket) &&
            (!onlyOpponents || opponents.has(row.number) || row.number === doc.myTeam),
    );
    const mine = doc.myTeam ? result.byNumber.get(doc.myTeam) : undefined;
    const held = levelsHeld(doc.method);

    return (
        <Stack spacing={2}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}>
                <Typography component="h1" variant="h5" sx={{ fontWeight: 800 }}>
                    {doc.meta.title}
                </Typography>
                <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
                    <Button href={staticRoutes.rankingsWhatIf()} variant="contained" sx={{ minHeight: 44 }}>
                        What-if
                    </Button>
                    <Button href={staticRoutes.rankingsImport()} sx={{ minHeight: 44 }}>
                        Update from schedule
                    </Button>
                    <Button href={staticRoutes.rankingsSetup()} sx={{ minHeight: 44 }}>
                        Setup
                    </Button>
                    <Button
                        sx={{ minHeight: 44 }}
                        onClick={() => downloadBlob(new Blob([serializeRankings(doc)], { type: "application/json" }), rankingsFileName(doc))}
                    >
                        {EXPORT_LABEL}
                    </Button>
                </Stack>
            </Stack>

            {result.componentCount > 1 && <Alert severity="warning">{COMPONENTS_WARNING}</Alert>}
            {!result.converged && <Alert severity="info">{NOT_CONVERGED_WARNING}</Alert>}
            {result.ranked.length > held && (
                <Alert
                    severity="warning"
                    action={
                        <Button color="inherit" href={staticRoutes.rankingsSetup()} sx={{ minHeight: 44 }}>
                            Edit levels
                        </Button>
                    }
                >
                    {levelsShortMessage(held, result.ranked.length)}
                </Alert>
            )}

            {mine ? (
                <Tiles row={mine} total={result.ranked.length} />
            ) : (
                <TextField
                    select
                    label={PICK_TEAM_LABEL}
                    value=""
                    onChange={(event) => void save({ ...doc, myTeam: event.target.value })}
                    sx={{ maxWidth: 360 }}
                >
                    {doc.teams.map((team) => (
                        <MenuItem key={team.number} value={team.number}>
                            {team.number} {team.name}
                        </MenuItem>
                    ))}
                </TextField>
            )}

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "center" }, flexWrap: { sm: "wrap" }, rowGap: 1 }}>
                <TextField label="Find a team" value={query} onChange={(e) => setQuery(e.target.value)} />
                <TextField select label="Starting bracket" value={bracket} onChange={(e) => setBracket(e.target.value)} sx={{ minWidth: 180 }}>
                    <MenuItem value="">All brackets</MenuItem>
                    {brackets.map((b) => (
                        <MenuItem key={b} value={b}>
                            {b}
                        </MenuItem>
                    ))}
                </TextField>
                <FormControlLabel
                    control={<Checkbox sx={{ p: "10px" }} checked={onlyOpponents} onChange={(e) => setOnlyOpponents(e.target.checked)} disabled={!doc.myTeam} />}
                    label="My team's opponents"
                    sx={{ minHeight: 44 }}
                />
                <ToggleButtonGroup exclusive size="small" value={view} onChange={(_e, value) => value && setView(value)} sx={{ ml: { sm: "auto" } }}>
                    <ToggleButton value="ladder" sx={{ minHeight: 44 }}>
                        {LADDER_LABEL}
                    </ToggleButton>
                    <ToggleButton value="table" sx={{ minHeight: 44 }}>
                        {TABLE_LABEL}
                    </ToggleButton>
                </ToggleButtonGroup>
            </Stack>

            {view === "ladder" ? <Ladder rows={rows} doc={doc} myTeam={doc.myTeam} /> : <RatingsTable rows={rows} cap={doc.method.goalCap} />}

            <MethodSummary method={doc.method} />
        </Stack>
    );
}

export function RankingsScreen({ store }: { store: LocalPlannerStore }) {
    const { state, save, clear } = useRankingsDoc(store);
    if (state.status !== "ready") return <RankingsStatus state={state} onStartOver={() => void clear()} />;
    if (!state.doc) return <RankingsStatus state={{ status: "empty" }} onStartOver={() => void clear()} />;
    return <Ready doc={state.doc} save={save} />;
}

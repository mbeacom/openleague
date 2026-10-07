/**
 * Rankings (static rankings spec, Screens): my-team tiles, a ladder with level
 * bands (a compact list on phones), a sortable table with every column, filters
 * and export. Movement is always an icon plus a word.
 */
import { useMemo, useState } from "react";
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
import { useTheme } from "@mui/material/styles";
import { downloadBlob } from "@/components/features/practice-planner/export/download";
import { compareTeamNumbers, composite, type RatingsResult, type TeamRating } from "@/lib/ratings";
import { rankingsFileName, serializeRankings, toRatingInputs, type RankingsDocument } from "@/lib/rankings-document";
import { staticRoutes } from "../../routes";
import type { LocalPlannerStore } from "../../store/types";
import { COMPONENTS_WARNING, MovementLabel, NOT_CONVERGED_WARNING, RankingsStatus, formatRating, formatSigned, levelBandColor } from "./display";
import { useRankingsDoc } from "./useRankingsDoc";

export const PICK_TEAM_LABEL = "Pick your team";
export const LADDER_LABEL = "Ladder";
export const TABLE_LABEL = "Table";
export const EXPORT_LABEL = "Export rankings file";

type SortKey = "rank" | "name" | "games" | "agd" | "sched" | "lodin" | "walkush" | "rpi";
const COLUMNS: Array<{ key: SortKey; label: string; numeric: boolean }> = [
    { key: "rank", label: "Rank", numeric: true },
    { key: "name", label: "Team", numeric: false },
    { key: "games", label: "GP", numeric: true },
    { key: "agd", label: "AGD", numeric: true },
    { key: "sched", label: "SCHED", numeric: true },
    { key: "lodin", label: "Lodin", numeric: true },
    { key: "walkush", label: "Walkush (approx.)", numeric: true },
    { key: "rpi", label: "RPI", numeric: true },
];

export function useRatings(doc: RankingsDocument): RatingsResult {
    return useMemo(() => {
        const { games, teams } = toRatingInputs(doc);
        return composite(games, teams, doc.method);
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
    const tiles = [
        { label: "CSHL-compatible RPI", value: formatRating(row.rpi) },
        { label: "Rank", value: row.rank === null ? "—" : `${row.rank} of ${total}` },
        { label: "Suggested level", value: row.level ?? "—", extra: <MovementLabel movement={row.movement} startingLevel={row.startingLevel} /> },
    ];
    return (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" }, gap: 1.5 }}>
            {tiles.map((tile) => (
                <Paper key={tile.label} variant="outlined" sx={{ p: 2, borderRadius: 1 }}>
                    <Typography variant="overline" color="text.secondary">
                        {tile.label}
                    </Typography>
                    <Typography sx={{ fontSize: { xs: 28, sm: 34 }, fontWeight: 800, lineHeight: 1.1 }}>{tile.value}</Typography>
                    {tile.extra}
                </Paper>
            ))}
        </Box>
    );
}

function Ladder({ rows, doc, myTeam }: { rows: TeamRating[]; doc: RankingsDocument; myTeam: string | null }) {
    const theme = useTheme();
    const levelIndex = new Map(doc.method.levels.map((level, i) => [level.name, i]));
    const groupOf = (row: TeamRating) => (row.rank === null ? "unranked" : row.level === null ? "below" : `level:${row.level}`);
    return (
        <Stack component="ol" sx={{ listStyle: "none", p: 0, m: 0 }} aria-label="Rankings ladder">
            {rows.map((row, index) => {
                const header = index === 0 || groupOf(row) !== groupOf(rows[index - 1]) ? (row.rank === null ? "Not ranked" : row.level ?? "Below the last level") : null;
                const band = row.level === null ? "transparent" : levelBandColor(theme, levelIndex.get(row.level) ?? 0, doc.method.levels.length);
                const mine = row.number === myTeam;
                return (
                    <Box component="li" key={row.number}>
                        {header && (
                            <Typography variant="subtitle2" sx={{ mt: 1.5, px: 1, fontWeight: 800, borderTop: 2, borderColor: "divider" }}>
                                {header}
                            </Typography>
                        )}
                        <Box
                            sx={{
                                display: "grid",
                                gridTemplateColumns: { xs: "2.5rem 1fr auto", sm: "2.5rem minmax(9rem, 14rem) 1fr 3.5rem 8rem" },
                                alignItems: "center",
                                gap: 1,
                                minHeight: 44,
                                px: 1,
                                bgcolor: band,
                                borderLeft: 4,
                                borderColor: mine ? "secondary.main" : "transparent",
                            }}
                        >
                            <Typography sx={{ fontWeight: 700 }}>{row.rank ?? "—"}</Typography>
                            <Box sx={{ minWidth: 0 }}>
                                <Box component="a" href={staticRoutes.rankingsTeam(row.number)} sx={{ color: "text.primary", fontWeight: mine ? 800 : 500, display: "inline-flex", alignItems: "center", minHeight: 44 }}>
                                    {row.name}
                                </Box>
                                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                                    {row.number}
                                    {row.startingBracket ? ` · started ${row.startingBracket}` : ""}
                                    {row.excluded ? " · excluded" : ""}
                                </Typography>
                                <Box sx={{ display: { xs: "block", sm: "none" } }}>
                                    <MovementLabel movement={row.movement} startingLevel={row.startingLevel} />
                                </Box>
                                {row.lowConfidence && row.rank !== null && <Chip size="small" label="Few games" variant="outlined" sx={{ mt: 0.25 }} />}
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
                                <MovementLabel movement={row.movement} startingLevel={row.startingLevel} />
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
                        {COLUMNS.map((column) => (
                            <TableCell key={column.key} align={column.numeric ? "right" : "left"} sortDirection={sort.key === column.key ? sort.dir : false}>
                                <TableSortLabel
                                    active={sort.key === column.key}
                                    direction={sort.key === column.key ? sort.dir : "asc"}
                                    onClick={() => setSort((s) => ({ key: column.key, dir: s.key === column.key && s.dir === "asc" ? "desc" : "asc" }))}
                                >
                                    {column.label}
                                </TableSortLabel>
                            </TableCell>
                        ))}
                        <TableCell>W-L-T</TableCell>
                        <TableCell>Level</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {sorted.map((row) => (
                        <TableRow key={row.number}>
                            <TableCell align="right">{row.rank ?? "—"}</TableCell>
                            <TableCell>
                                <Box component="a" href={staticRoutes.rankingsTeam(row.number)} sx={{ display: "inline-flex", alignItems: "center", minHeight: 44, color: "inherit" }}>
                                    {row.name}
                                </Box>
                            </TableCell>
                            <TableCell align="right">{row.games}</TableCell>
                            <TableCell align="right">{formatSigned(row.agd)}</TableCell>
                            <TableCell align="right">{formatSigned(row.sched)}</TableCell>
                            <TableCell align="right">{formatSigned(row.lodin)}</TableCell>
                            <TableCell align="right">{formatRating(row.walkush, 2)}</TableCell>
                            <TableCell align="right">{formatRating(row.rpi)}</TableCell>
                            <TableCell>{`${row.wins}-${row.losses}-${row.ties}`}</TableCell>
                            <TableCell>{row.level ?? "—"}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
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

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "center" } }}>
                <TextField label="Find a team" value={query} onChange={(e) => setQuery(e.target.value)} size="small" />
                <TextField select label="Starting bracket" value={bracket} onChange={(e) => setBracket(e.target.value)} size="small" sx={{ minWidth: 180 }}>
                    <MenuItem value="">All brackets</MenuItem>
                    {brackets.map((b) => (
                        <MenuItem key={b} value={b}>
                            {b}
                        </MenuItem>
                    ))}
                </TextField>
                <FormControlLabel
                    control={<Checkbox checked={onlyOpponents} onChange={(e) => setOnlyOpponents(e.target.checked)} disabled={!doc.myTeam} />}
                    label="My team's opponents"
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

            <Typography variant="body2" color="text.secondary">
                CSHL-compatible RPI = (Lodin scaled + Walkush (approx.) scaled) ÷ 2, each scaled 0–20. Margins capped at {doc.method.goalCap}. Not the league&apos;s official number.
            </Typography>
        </Stack>
    );
}

export function RankingsScreen({ store }: { store: LocalPlannerStore }) {
    const { state, save, clear } = useRankingsDoc(store);
    if (state.status !== "ready") return <RankingsStatus state={state} onStartOver={() => void clear()} />;
    if (!state.doc) return <RankingsStatus state={{ status: "empty" }} onStartOver={() => void clear()} />;
    return <Ready doc={state.doc} save={save} />;
}

/**
 * Setup → Teams: a searchable, filterable list of compact team rows (crest,
 * number and name, starting bracket, record), each opening an edit dialog.
 * The dialog edits its own copy, which goes into Setup's draft on Done; nothing
 * is kept until Save setup.
 */
import { useId, useState } from "react";
import {
    Box,
    Button,
    ButtonBase,
    Checkbox,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    Stack,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
    useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { RankingsTeam } from "@/lib/rankings-document";
import { NO_GAMES_LABEL } from "./display";
import { Scoreboard } from "./Scoreboard";
import { TeamMark } from "./TeamMark";
import { DEFAULT_TEAM_FILTER, filterTeams, formatRecord, recordOf, type TeamFilter, type TeamRecord, type TeamShow } from "./setup-model";

export const TEAM_SEARCH_LABEL = "Find a team";
export const NO_TEAMS_MATCH = "No teams match these filters.";
const TARGET = { minHeight: 44 } as const;

export interface BracketOption {
    key: number;
    label: string;
}

const editTeamLabel = (team: RankingsTeam) => `Edit ${team.number} ${team.name}`;

function TeamRow({
    team,
    record,
    bracket,
    mine,
    onEdit,
}: {
    team: RankingsTeam;
    record: TeamRecord;
    bracket: string | null;
    mine: boolean;
    onEdit: () => void;
}) {
    const detailsId = useId();
    return (
        <ButtonBase
            onClick={onEdit}
            aria-label={editTeamLabel(team)}
            aria-describedby={detailsId}
            focusRipple
            sx={{
                width: "100%",
                minHeight: 64,
                px: 1.5,
                py: 1,
                gap: 1.5,
                justifyContent: "flex-start",
                textAlign: "left",
                bgcolor: "background.paper",
                border: 1,
                borderColor: "divider",
                borderLeft: "3px solid",
                borderLeftColor: mine ? "secondary.main" : team.excluded ? "text.disabled" : "transparent",
                borderRadius: 1,
                "&:hover": { bgcolor: "action.hover" },
                "&.Mui-focusVisible": { outline: "2px solid", outlineColor: "secondary.main", outlineOffset: 2 },
            }}
        >
            <TeamMark number={team.number} name={team.name} mine={mine} crestOnly />
            <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: "flex", alignItems: "baseline", columnGap: 0.75, minWidth: 0 }}>
                    <Box component="span" sx={{ fontFamily: "var(--font-mono), ui-monospace, monospace", fontSize: "0.8125rem", color: "text.secondary", flexShrink: 0 }}>
                        {team.number}
                    </Box>
                    <Box
                        component="span"
                        sx={{
                            fontWeight: 700,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            minWidth: 0,
                            color: team.excluded ? "text.secondary" : "text.primary",
                        }}
                    >
                        {team.name}
                    </Box>
                </Box>
                <Box id={detailsId} sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.5 }}>
                    <Chip size="small" variant="outlined" label={bracket ?? "No bracket"} sx={{ maxWidth: "100%", color: bracket ? "text.primary" : "text.secondary" }} />
                    {mine && <Chip size="small" color="secondary" label="My team" />}
                    {team.excluded && <Chip size="small" color="warning" variant="outlined" label="Excluded" />}
                    {/* Screen readers get the record here; the column on the right is visual. */}
                    <Box component="span" sx={visuallyHidden}>
                        {record.played === 0 ? NO_GAMES_LABEL : `${record.played} played, record ${formatRecord(record)}`}
                    </Box>
                </Box>
            </Box>
            <Box aria-hidden sx={{ textAlign: "right", flexShrink: 0, minWidth: 56 }}>
                <Box sx={{ fontFamily: "var(--font-mono), ui-monospace, monospace", fontVariantNumeric: "tabular-nums", fontWeight: 600, fontSize: "0.9375rem" }}>
                    {record.played === 0 ? "—" : formatRecord(record)}
                </Box>
                <Box sx={{ fontSize: "0.625rem", fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "text.secondary", whiteSpace: "nowrap" }}>
                    {record.played === 0 ? "No games" : `${record.played} GP`}
                </Box>
            </Box>
        </ButtonBase>
    );
}

/** Read by screen readers, not drawn. ("1px", not 1: a bare 1 in sx means 100%.) */
const visuallyHidden = {
    position: "absolute",
    width: "1px",
    height: "1px",
    p: 0,
    m: "-1px",
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
    border: 0,
} as const;

export function SetupTeamsPanel({
    teams,
    assigned,
    brackets,
    records,
    myTeam,
    filter,
    onFilter,
    onEdit,
}: {
    teams: readonly RankingsTeam[];
    assigned: Record<string, number | null>;
    brackets: readonly BracketOption[];
    records: Map<string, TeamRecord>;
    myTeam: string | null;
    filter: TeamFilter;
    onFilter: (filter: TeamFilter) => void;
    onEdit: (number: string) => void;
}) {
    const shown = filterTeams(teams, filter, { assigned, records });
    const labelOf = new Map(brackets.map((b) => [b.key, b.label]));
    const excludedCount = teams.filter((t) => t.excluded).length;
    const noGamesCount = teams.filter((t) => recordOf(records, t.number).played === 0).length;
    const filtered = filter.query.trim() !== "" || filter.bracket !== "all" || filter.show !== "all";

    return (
        <Stack spacing={2}>
            <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "1fr", sm: "minmax(0, 1fr) 200px", md: "minmax(0, 1fr) 220px auto" }, alignItems: "center" }}>
                <TextField
                    label={TEAM_SEARCH_LABEL}
                    type="search"
                    value={filter.query}
                    onChange={(e) => onFilter({ ...filter, query: e.target.value })}
                    placeholder="Number or name"
                    slotProps={{ htmlInput: { maxLength: 100 } }}
                />
                <TextField
                    select
                    label="Bracket"
                    value={String(filter.bracket)}
                    onChange={(e) => {
                        const value = e.target.value;
                        onFilter({ ...filter, bracket: value === "all" || value === "none" ? value : Number(value) });
                    }}
                    slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
                >
                    <option value="all">All brackets</option>
                    {brackets.map((b) => (
                        <option key={b.key} value={b.key}>
                            {b.label}
                        </option>
                    ))}
                    <option value="none">No bracket</option>
                </TextField>
                <ToggleButtonGroup
                    exclusive
                    size="small"
                    value={filter.show}
                    onChange={(_e, value: TeamShow | null) => value && onFilter({ ...filter, show: value })}
                    aria-label="Show"
                    sx={{ gridColumn: { xs: "1", sm: "1 / -1", md: "auto" }, "& .MuiToggleButton-root": { ...TARGET, minWidth: 44, px: 1.5, textTransform: "none", flex: { xs: 1, md: "none" } } }}
                >
                    <ToggleButton value="all">All</ToggleButton>
                    <ToggleButton value="excluded">{`Excluded · ${excludedCount}`}</ToggleButton>
                    <ToggleButton value="no-games">{`No games · ${noGamesCount}`}</ToggleButton>
                </ToggleButtonGroup>
            </Box>
            <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", minHeight: 44 }}>
                <Typography variant="body2" color="text.secondary" role="status">
                    {`Showing ${shown.length} of ${teams.length} ${teams.length === 1 ? "team" : "teams"}`}
                </Typography>
                {filtered && (
                    <Button onClick={() => onFilter(DEFAULT_TEAM_FILTER)} sx={TARGET}>
                        Clear filters
                    </Button>
                )}
            </Stack>
            {teams.length === 0 ? (
                <Typography color="text.secondary">No teams yet. Import a schedule to add them.</Typography>
            ) : shown.length === 0 ? (
                <Typography color="text.secondary">{NO_TEAMS_MATCH}</Typography>
            ) : (
                <Box
                    component="ul"
                    aria-label="Teams"
                    sx={{ listStyle: "none", p: 0, m: 0, display: "grid", gap: 1, gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))", lg: "repeat(3, minmax(0, 1fr))" } }}
                >
                    {shown.map((team) => {
                        const key = assigned[team.number] ?? null;
                        return (
                            <Box component="li" key={team.number} sx={{ minWidth: 0 }}>
                                <TeamRow
                                    team={team}
                                    record={recordOf(records, team.number)}
                                    bracket={key === null ? null : labelOf.get(key) ?? null}
                                    mine={myTeam === team.number}
                                    onEdit={() => onEdit(team.number)}
                                />
                            </Box>
                        );
                    })}
                </Box>
            )}
        </Stack>
    );
}

/** What the team dialog changes: the team's name and exclusion, its starting bracket, and whether it is mine. */
export interface TeamEdit {
    name: string;
    excluded: boolean;
    bracketKey: number | null;
    mine: boolean;
}

export const TEAM_NAME_MISSING = "A team needs a name.";

/** Edits a copy of a team: Done keeps it when it has a name; Cancel or closing drops it. */
export function TeamDialog({
    team,
    record,
    bracketKey,
    brackets,
    mine,
    onDone,
    onShowGames,
    onClose,
}: {
    team: RankingsTeam;
    record: TeamRecord;
    bracketKey: number | null;
    brackets: readonly BracketOption[];
    mine: boolean;
    onDone: (edit: TeamEdit) => void;
    /** Keeps the edit, then lists the team's games. */
    onShowGames: (edit: TeamEdit) => void;
    onClose: () => void;
}) {
    const theme = useTheme();
    const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
    const titleId = useId();
    const [edit, setEdit] = useState<TeamEdit>({ name: team.name, excluded: team.excluded, bracketKey, mine });
    const change = (patch: Partial<TeamEdit>) => setEdit((current) => ({ ...current, ...patch }));
    const nameMissing = edit.name.trim() === "";
    return (
        <Dialog open onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="xs" aria-labelledby={titleId}>
            <DialogTitle id={titleId} component="div" sx={{ pb: 1 }}>
                <Typography component="h2" variant="h6" sx={{ fontWeight: 800 }}>
                    {`Team ${team.number}`}
                </Typography>
            </DialogTitle>
            <DialogContent>
                <Stack spacing={2.5} sx={{ pt: 0.5 }}>
                    <TeamMark number={team.number} name={edit.name || team.number} size="md" mine={edit.mine} />
                    <Scoreboard
                        columns={3}
                        stats={[
                            { label: "Played", value: record.played },
                            { label: "Won", value: record.wins },
                            { label: "Lost", value: record.losses },
                            { label: "Tied", value: record.ties },
                            { label: "Goals for", value: record.goalsFor },
                            { label: "Against", value: record.goalsAgainst },
                        ]}
                    />
                    <TextField
                        label="Team name"
                        value={edit.name}
                        onChange={(e) => change({ name: e.target.value })}
                        error={nameMissing}
                        helperText={nameMissing ? TEAM_NAME_MISSING : undefined}
                        slotProps={{ htmlInput: { "aria-label": `Name of ${team.number}`, maxLength: 100 } }}
                        fullWidth
                    />
                    <TextField
                        select
                        label="Starting bracket"
                        value={edit.bracketKey ?? ""}
                        onChange={(e) => change({ bracketKey: e.target.value === "" ? null : Number(e.target.value) })}
                        slotProps={{ select: { native: true }, inputLabel: { shrink: true }, htmlInput: { "aria-label": `Starting bracket of ${team.number}` } }}
                        fullWidth
                    >
                        <option value="">None</option>
                        {brackets.map((b) => (
                            <option key={b.key} value={b.key}>
                                {b.label}
                            </option>
                        ))}
                    </TextField>
                    <Stack>
                        <FormControlLabel
                            control={<Checkbox checked={edit.mine} onChange={(e) => change({ mine: e.target.checked })} sx={{ p: "10px" }} />}
                            label="This is my team"
                            sx={TARGET}
                        />
                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={edit.excluded}
                                    onChange={(e) => change({ excluded: e.target.checked })}
                                    sx={{ p: "10px" }}
                                    slotProps={{ input: { "aria-label": `Excluded: ${team.name}` } }}
                                />
                            }
                            label="Leave out of the rankings"
                            sx={TARGET}
                        />
                    </Stack>
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2, gap: 1, flexWrap: "wrap" }}>
                <Button onClick={() => onShowGames(edit)} disabled={nameMissing} sx={{ ...TARGET, mr: "auto" }}>
                    {"Show this team's games"}
                </Button>
                <Button onClick={onClose} sx={TARGET}>
                    Cancel
                </Button>
                <Button variant="contained" disabled={nameMissing} onClick={() => onDone(edit)} sx={TARGET}>
                    Done
                </Button>
            </DialogActions>
        </Dialog>
    );
}

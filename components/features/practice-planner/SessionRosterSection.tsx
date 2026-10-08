"use client";

/**
 * The editor's Roster section (roster and suggestions spec R2–R4, R8, R9,
 * R14): who the coach expects, by position. An age group sets the default
 * positions; toggles and custom positions adjust them for this practice.
 * Each player has an optional number and name and a position. Add one, paste
 * a list, or (hosted) add from the team's roster. Portable: everything comes
 * in as props.
 */
import { useId, useState } from "react";
import { Alert, Box, Button, Chip, IconButton, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import { AddOutlined, ContentPasteOutlined, GroupAddOutlined, LinkOutlined, PersonRemoveOutlined } from "@mui/icons-material";
import { AGE_GROUPS, AGE_GROUP_LABELS, toAgeGroup } from "@/lib/utils/age-groups";
import {
    CUSTOM_ROSTER_ROLE_MAX,
    GOALIE_ROLE,
    MAX_ROSTER_PLAYERS,
    ROSTER_BUILTIN_ROLES,
    ROSTER_NAME_MAX,
    isBuiltinRosterRole,
    rosterCounts,
    rosterCountsLabel,
    rosterPlayerLabels,
    rosterRoleLabel,
    type RosterOption,
} from "@/lib/utils/practice-roster";
import { RosterPasteDialog, RosterTeamDialog } from "./RosterDialogs";
import type { SessionRosterState } from "./useSessionRoster";

export const ROSTER_HEADING = "Roster";
export const ROSTER_HELP = "Who you expect at this practice. Names are optional: a number or initials work.";
export const ADD_PLAYER_LABEL = "Add player";
export const PASTE_LIST_LABEL = "Paste a list";
export const ADD_FROM_TEAM_LABEL = "Add from team";
export const ADD_POSITION_LABEL = "Add position";
export const TEAM_PLAYER_BADGE = "Team";

const TARGET = { minWidth: 44, minHeight: 44 } as const;
const SELECT_FIX = { "& .MuiSelect-select.MuiInputBase-input": { minHeight: "1.4375em" } } as const;
const NOT_SET = "";

/** "Goalies attending is 2; this roster has 1." (R14) */
export function goalieMismatchText(attending: number, roster: number): string {
    return `Goalies attending is ${attending}; this roster has ${roster}.`;
}

export interface SessionRosterSectionProps {
    state: SessionRosterState;
    /** Hosted: the team's players. The static planner passes none. */
    teamOptions?: readonly RosterOption[];
    goaliesAttending: number | null;
    onUseGoalies: (count: number) => void;
    disabled: boolean;
}

export function SessionRosterSection({ state, teamOptions = [], goaliesAttending, onUseGoalies, disabled }: SessionRosterSectionProps) {
    const headingId = useId();
    const { roster } = state;
    const counts = rosterCounts(roster);
    const labels = rosterPlayerLabels(roster);
    const [pasting, setPasting] = useState(false);
    const [picking, setPicking] = useState(false);
    const [customOpen, setCustomOpen] = useState(false);
    const [custom, setCustom] = useState("");
    const [customError, setCustomError] = useState<string | null>(null);
    const full = roster.players.length >= MAX_ROSTER_PLAYERS;
    const listed = new Set(roster.players.flatMap((player) => (player.playerId ? [player.playerId] : [])));
    const toggleable = [...ROSTER_BUILTIN_ROLES.filter((role) => role !== GOALIE_ROLE), ...roster.roles.filter((role) => !isBuiltinRosterRole(role))];
    const skaterRolesOn = roster.roles.filter((role) => role !== GOALIE_ROLE).length;
    const mismatch = counts.total > 0 && goaliesAttending !== null && goaliesAttending !== counts.goalies;

    const addCustom = () => {
        const error = state.addCustomRole(custom);
        setCustomError(error);
        if (!error) {
            setCustom("");
            setCustomOpen(false);
        }
    };

    return (
        <Paper elevation={2} sx={{ p: 2 }} component="section" aria-labelledby={headingId}>
            <Stack spacing={2}>
                <Box>
                    <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                        <Typography id={headingId} variant="h6" component="h2" sx={{ fontWeight: 800 }}>
                            {ROSTER_HEADING}
                        </Typography>
                        <Chip label={rosterCountsLabel(roster)} size="small" color={counts.total > 0 ? "primary" : "default"} variant="outlined" />
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                        {ROSTER_HELP}
                    </Typography>
                </Box>

                <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ xs: "stretch", sm: "flex-start" }}>
                    <TextField
                        select
                        label="Age group"
                        value={roster.ageGroup ?? NOT_SET}
                        onChange={(event) => state.setAgeGroup(toAgeGroup(event.target.value))}
                        disabled={disabled}
                        slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
                        sx={{ minWidth: 160, ...SELECT_FIX }}
                    >
                        <MenuItem value={NOT_SET}>Not set</MenuItem>
                        {AGE_GROUPS.map((group) => (
                            <MenuItem key={group} value={group}>
                                {AGE_GROUP_LABELS[group]}
                            </MenuItem>
                        ))}
                    </TextField>
                    <Box role="group" aria-label="Positions" sx={{ flex: 1 }}>
                        <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 0.5 }}>
                            Positions
                        </Typography>
                        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
                            {toggleable.map((role) => {
                                const on = roster.roles.includes(role);
                                const last = on && skaterRolesOn <= 1;
                                return (
                                    <Chip
                                        key={role}
                                        label={rosterRoleLabel(role)}
                                        color={on ? "secondary" : "default"}
                                        variant={on ? "filled" : "outlined"}
                                        onClick={disabled || last ? undefined : () => state.toggleRole(role)}
                                        aria-pressed={on}
                                        aria-disabled={disabled || last || undefined}
                                        sx={{ minHeight: 44, borderRadius: 22, fontWeight: 700 }}
                                    />
                                );
                            })}
                            <Chip label={rosterRoleLabel(GOALIE_ROLE)} color="secondary" aria-pressed aria-disabled sx={{ minHeight: 44, borderRadius: 22, fontWeight: 700 }} />
                            {!customOpen && (
                                <Button size="small" startIcon={<AddOutlined />} onClick={() => setCustomOpen(true)} disabled={disabled} sx={TARGET}>
                                    {ADD_POSITION_LABEL}
                                </Button>
                            )}
                        </Stack>
                        {customOpen && (
                            <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mt: 1 }}>
                                <TextField
                                    size="small"
                                    label="Position name"
                                    value={custom}
                                    onChange={(event) => {
                                        setCustom(event.target.value);
                                        setCustomError(null);
                                    }}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter") {
                                            event.preventDefault();
                                            addCustom();
                                        }
                                    }}
                                    error={customError !== null}
                                    helperText={customError ?? "Counts as a skater."}
                                    autoFocus
                                    slotProps={{ htmlInput: { maxLength: CUSTOM_ROSTER_ROLE_MAX } }}
                                    sx={{ "& .MuiInputBase-root": { minHeight: 44 } }}
                                />
                                <Button variant="outlined" onClick={addCustom} sx={TARGET}>
                                    Add
                                </Button>
                                <Button
                                    onClick={() => {
                                        setCustomOpen(false);
                                        setCustom("");
                                        setCustomError(null);
                                    }}
                                    sx={TARGET}
                                >
                                    Cancel
                                </Button>
                            </Stack>
                        )}
                    </Box>
                </Stack>

                {mismatch && goaliesAttending !== null && (
                    <Alert
                        severity="info"
                        action={
                            <Button color="inherit" onClick={() => onUseGoalies(counts.goalies)} disabled={disabled} sx={TARGET}>
                                Use {counts.goalies}
                            </Button>
                        }
                    >
                        {goalieMismatchText(goaliesAttending, counts.goalies)}
                    </Alert>
                )}

                {roster.players.length > 0 && (
                    <Stack spacing={1} component="ol" aria-label="Players" sx={{ listStyle: "none", m: 0, p: 0 }}>
                        {roster.players.map((player, index) => {
                            const linked = Boolean(player.playerId);
                            return (
                                <Stack
                                    key={player.key}
                                    component="li"
                                    direction="row"
                                    spacing={1}
                                    useFlexGap
                                    flexWrap="wrap"
                                    alignItems="center"
                                    sx={{ borderBottom: 1, borderColor: "divider", pb: 1 }}
                                >
                                    {linked ? (
                                        <Stack direction="row" spacing={1} alignItems="center" sx={{ flex: "1 1 200px", minWidth: 0, minHeight: 44 }}>
                                            <Typography sx={{ fontWeight: 700 }} noWrap>
                                                {labels[index]}
                                            </Typography>
                                            <Chip size="small" variant="outlined" color="secondary" icon={<LinkOutlined />} label={TEAM_PLAYER_BADGE} />
                                        </Stack>
                                    ) : (
                                        <>
                                            <TextField
                                                label="No."
                                                size="small"
                                                value={player.number}
                                                onChange={(event) => state.updatePlayer(player.key, { number: event.target.value.replace(/\D/g, "").slice(0, 3) })}
                                                disabled={disabled}
                                                slotProps={{ htmlInput: { inputMode: "numeric", maxLength: 3, "aria-label": `Number for ${labels[index]}` } }}
                                                sx={{ width: 72, "& .MuiInputBase-root": { minHeight: 44 } }}
                                            />
                                            <TextField
                                                label="Name"
                                                size="small"
                                                value={player.name}
                                                onChange={(event) => state.updatePlayer(player.key, { name: event.target.value })}
                                                disabled={disabled}
                                                placeholder="Optional"
                                                slotProps={{ htmlInput: { maxLength: ROSTER_NAME_MAX, "aria-label": `Name for ${labels[index]}` } }}
                                                sx={{ flex: "1 1 140px", minWidth: 0, "& .MuiInputBase-root": { minHeight: 44 } }}
                                            />
                                        </>
                                    )}
                                    <TextField
                                        select
                                        label="Position"
                                        size="small"
                                        value={player.role}
                                        onChange={(event) => state.updatePlayer(player.key, { role: event.target.value })}
                                        disabled={disabled}
                                        // Named per player: every row's select is "Position", so the visible label alone is ambiguous.
                                        slotProps={{ select: { SelectDisplayProps: { "aria-labelledby": undefined, "aria-label": `Position for ${labels[index]}` } as object } }}
                                        sx={{ width: 130, "& .MuiInputBase-root": { minHeight: 44 } }}
                                    >
                                        {roster.roles.map((role) => (
                                            <MenuItem key={role} value={role}>
                                                {rosterRoleLabel(role)}
                                            </MenuItem>
                                        ))}
                                    </TextField>
                                    <IconButton aria-label={`Remove ${labels[index]}`} onClick={() => state.removePlayer(player.key)} disabled={disabled} sx={TARGET}>
                                        <PersonRemoveOutlined />
                                    </IconButton>
                                </Stack>
                            );
                        })}
                    </Stack>
                )}

                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                    <Button variant="outlined" startIcon={<AddOutlined />} onClick={() => state.addPlayer()} disabled={disabled || full} sx={TARGET}>
                        {ADD_PLAYER_LABEL}
                    </Button>
                    <Button variant="outlined" startIcon={<ContentPasteOutlined />} onClick={() => setPasting(true)} disabled={disabled || full} sx={TARGET}>
                        {PASTE_LIST_LABEL}
                    </Button>
                    {teamOptions.length > 0 && (
                        <Button variant="outlined" startIcon={<GroupAddOutlined />} onClick={() => setPicking(true)} disabled={disabled || full} sx={TARGET}>
                            {ADD_FROM_TEAM_LABEL}
                        </Button>
                    )}
                </Stack>
            </Stack>

            <RosterPasteDialog open={pasting} roles={roster.roles} existing={roster.players.length} onClose={() => setPasting(false)} onAdd={state.addPlayers} />
            {teamOptions.length > 0 && (
                <RosterTeamDialog
                    open={picking}
                    options={teamOptions}
                    listed={listed}
                    room={MAX_ROSTER_PLAYERS - roster.players.length}
                    onClose={() => setPicking(false)}
                    onAdd={state.addFromTeam}
                />
            )}
        </Paper>
    );
}

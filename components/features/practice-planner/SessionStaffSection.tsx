"use client";

/**
 * The editor's Staff section (spec R8): who runs this practice. One 44px row
 * per person: a typed name is editable; a team official or admin shows their
 * team name, read-only, with a link badge. Add staff offers the team's
 * officials and admins (hosted: the options prop) and Type a name (both
 * planners). Removing someone who runs rows asks first. Portable: no store,
 * action or Next import; everything comes in as props.
 */
import { useId, useState } from "react";
import {
    Box,
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Divider,
    IconButton,
    ListItemText,
    Menu,
    MenuItem,
    Paper,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import { LinkOutlined, PersonAddAlt1Outlined, PersonRemoveOutlined } from "@mui/icons-material";
import { MAX_SESSION_STAFF, STAFF_NAME_MAX, type SessionStaffMember, type StaffOption } from "@/types/practice-planner";
import { STAFF_NAME_TAKEN_MESSAGE, cleanStaffName, removeStaffPrompt, staffNameKey } from "@/lib/utils/session-staff";

export const STAFF_HEADING = "Staff";
export const NO_STAFF_TEXT = "No staff yet. Add a coach or a volunteer to show who runs each part.";
export const ADD_STAFF_LABEL = "Add staff";
export const TYPE_A_NAME_LABEL = "Type a name";
export const UNSAVED_NAME_HELP = "Not saved until it has a name";
export const TEAM_OFFICIAL_BADGE = "Team official";
export const TEAM_ADMIN_BADGE = "Team admin";
export const REMOVE_STAFF_TITLE = "Remove staff member";

const TARGET = { minWidth: 44, minHeight: 44 } as const;

const NO_RENDER_KEYS: ReadonlyMap<string, string> = new Map();

export interface SessionStaffSectionProps {
    staff: readonly SessionStaffMember[];
    /** A swapped id → the person's first key (useSessionStaff), so a save never remounts their row. */
    renderKeys?: ReadonlyMap<string, string>;
    /** Hosted: the team's officials and admins. The static planner passes none. */
    options: readonly StaffOption[];
    /** How many rows a person runs. */
    assignments: (key: string) => number;
    disabled: boolean;
    onAddOption: (option: StaffOption) => void;
    /** Adds an empty typed name; returns its key. */
    onAddTyped: () => string;
    onRename: (key: string, name: string) => void;
    onRemove: (key: string) => void;
}

export function SessionStaffSection({ staff, renderKeys = NO_RENDER_KEYS, options, assignments, disabled, onAddOption, onAddTyped, onRename, onRemove }: SessionStaffSectionProps) {
    const headingId = useId();
    const menuId = useId();
    const dialogTitleId = useId();
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const [focusKey, setFocusKey] = useState<string | null>(null);
    const [pending, setPending] = useState<{ key: string; name: string; rows: number } | null>(null);

    // An official or admin already on the list isn't offered again.
    const available = options.filter(
        (option) => !staff.some((member) => (option.kind === "official" ? member.teamOfficialId === option.id : member.userId === option.id)),
    );
    const clashes = (member: SessionStaffMember) => {
        const key = staffNameKey(member.name);
        return key !== "" && staff.some((other) => other.id !== member.id && staffNameKey(other.name) === key);
    };
    const remove = (member: SessionStaffMember) => {
        const rows = assignments(member.id);
        if (rows === 0) onRemove(member.id);
        else setPending({ key: member.id, name: cleanStaffName(member.name), rows });
    };

    return (
        <Paper elevation={2} sx={{ p: 2 }}>
            <Stack spacing={2}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                    <Typography id={headingId} variant="h6" component="h2">
                        {STAFF_HEADING}
                    </Typography>
                    <Button
                        variant="outlined"
                        startIcon={<PersonAddAlt1Outlined />}
                        aria-haspopup="menu"
                        aria-controls={anchor ? menuId : undefined}
                        aria-expanded={anchor ? "true" : undefined}
                        onClick={(event) => setAnchor(event.currentTarget)}
                        disabled={disabled || staff.length >= MAX_SESSION_STAFF}
                        sx={{ minHeight: 44 }}
                    >
                        {ADD_STAFF_LABEL}
                    </Button>
                </Stack>
                {staff.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                        {NO_STAFF_TEXT}
                    </Typography>
                ) : (
                    <Stack component="ul" aria-labelledby={headingId} spacing={1} sx={{ listStyle: "none", m: 0, p: 0 }}>
                        {staff.map((member) => {
                            const name = cleanStaffName(member.name);
                            const linked = Boolean(member.teamOfficialId || member.userId);
                            const clash = clashes(member);
                            // Not member.id: a save swaps a new person's key to their stored id.
                            const rowKey = renderKeys.get(member.id) ?? member.id;
                            return (
                                <Stack component="li" key={rowKey} direction="row" spacing={1.5} alignItems="center" sx={{ minHeight: 44 }}>
                                    <Box
                                        aria-hidden
                                        sx={{
                                            width: 36,
                                            height: 36,
                                            flexShrink: 0,
                                            borderRadius: "50%",
                                            display: "grid",
                                            placeItems: "center",
                                            bgcolor: "action.selected",
                                            color: "primary.main",
                                            fontWeight: 800,
                                        }}
                                    >
                                        {name.charAt(0).toUpperCase() || "?"}
                                    </Box>
                                    {linked ? (
                                        <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap" sx={{ flex: 1, minWidth: 0 }}>
                                            <Typography sx={{ fontWeight: 700 }} noWrap>
                                                {name}
                                            </Typography>
                                            <Chip
                                                size="small"
                                                variant="outlined"
                                                color="secondary"
                                                icon={<LinkOutlined />}
                                                label={member.teamOfficialId ? TEAM_OFFICIAL_BADGE : TEAM_ADMIN_BADGE}
                                            />
                                        </Stack>
                                    ) : (
                                        <TextField
                                            label="Name"
                                            size="small"
                                            value={member.name}
                                            onChange={(event) => onRename(member.id, event.target.value)}
                                            autoFocus={rowKey === focusKey}
                                            disabled={disabled}
                                            error={clash}
                                            helperText={clash ? STAFF_NAME_TAKEN_MESSAGE : name === "" ? UNSAVED_NAME_HELP : undefined}
                                            slotProps={{ htmlInput: { maxLength: STAFF_NAME_MAX } }}
                                            sx={{ flex: 1, "& .MuiInputBase-root": { minHeight: 44 } }}
                                        />
                                    )}
                                    <IconButton
                                        aria-label={name ? `Remove ${name}` : "Remove unnamed staff member"}
                                        onClick={() => remove(member)}
                                        disabled={disabled}
                                        sx={TARGET}
                                    >
                                        <PersonRemoveOutlined />
                                    </IconButton>
                                </Stack>
                            );
                        })}
                    </Stack>
                )}
            </Stack>

            <Menu
                id={menuId}
                anchorEl={anchor}
                open={anchor !== null}
                onClose={() => setAnchor(null)}
                // The typed name's field takes focus (autoFocus); the menu must not pull it back to the button.
                disableRestoreFocus
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                transformOrigin={{ vertical: "top", horizontal: "right" }}
            >
                {available.map((option) => (
                    <MenuItem
                        key={`${option.kind}-${option.id}`}
                        onClick={() => {
                            setAnchor(null);
                            onAddOption(option);
                        }}
                        sx={{ minHeight: 44 }}
                    >
                        <ListItemText primary={option.name} secondary={option.roleLabel} />
                    </MenuItem>
                ))}
                {available.length > 0 && <Divider />}
                <MenuItem
                    onClick={() => {
                        setAnchor(null);
                        setFocusKey(onAddTyped());
                    }}
                    sx={{ minHeight: 44 }}
                >
                    {TYPE_A_NAME_LABEL}
                </MenuItem>
            </Menu>

            <Dialog open={pending !== null} onClose={() => setPending(null)} aria-labelledby={dialogTitleId}>
                <DialogTitle id={dialogTitleId}>{REMOVE_STAFF_TITLE}</DialogTitle>
                <DialogContent>
                    <DialogContentText>{pending ? removeStaffPrompt(pending.name, pending.rows) : ""}</DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setPending(null)} sx={{ minHeight: 44 }}>
                        Cancel
                    </Button>
                    <Button
                        color="error"
                        variant="contained"
                        onClick={() => {
                            if (pending) onRemove(pending.key);
                            setPending(null);
                        }}
                        sx={{ minHeight: 44 }}
                    >
                        Remove
                    </Button>
                </DialogActions>
            </Dialog>
        </Paper>
    );
}

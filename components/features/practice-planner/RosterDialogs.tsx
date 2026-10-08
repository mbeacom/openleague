"use client";

/**
 * The Roster section's two dialogs (roster and suggestions spec R8, R9):
 * paste a list (both planners) and add from the team's roster (hosted only).
 * Portable: everything comes in as props.
 */
import { useId, useMemo, useState } from "react";
import {
    Alert,
    Button,
    Checkbox,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    FormControlLabel,
    List,
    ListItem,
    TextField,
    Typography,
} from "@mui/material";
import { MAX_ROSTER_PLAYERS, parseRosterPaste, rosterRoleLabel, type PastedPlayer, type RosterOption } from "@/lib/utils/practice-roster";

export const PASTE_TITLE = "Paste a list";
export const PASTE_HELP = "One player per line. A number, a name or initials, and a position such as G, D or F all work: \"12 Sam G\".";
export const TEAM_TITLE = "Add from team";

const TARGET = { minHeight: 44 } as const;

/** "Add 3 players" / "Add 1 player". */
export function addPlayersLabel(count: number): string {
    return `Add ${count} ${count === 1 ? "player" : "players"}`;
}

export function overflowMessage(count: number): string {
    return `${count} more ${count === 1 ? "line goes" : "lines go"} past the ${MAX_ROSTER_PLAYERS}-player limit and won't be added.`;
}

function pastedLabel(player: PastedPlayer): string {
    const who = [player.number ? `#${player.number}` : "", player.name].filter(Boolean).join(" ");
    return `${who || "Unnamed"} · ${rosterRoleLabel(player.role)}`;
}

export function RosterPasteDialog({
    open,
    roles,
    existing,
    onClose,
    onAdd,
}: {
    open: boolean;
    roles: readonly string[];
    existing: number;
    onClose: () => void;
    onAdd: (players: PastedPlayer[]) => void;
}) {
    const titleId = useId();
    const [text, setText] = useState("");
    const parsed = useMemo(() => parseRosterPaste(text, roles, existing), [text, roles, existing]);
    const close = () => {
        setText("");
        onClose();
    };
    return (
        <Dialog open={open} onClose={close} aria-labelledby={titleId} fullWidth maxWidth="sm">
            <DialogTitle id={titleId}>{PASTE_TITLE}</DialogTitle>
            <DialogContent>
                <DialogContentText sx={{ mb: 2 }}>{PASTE_HELP}</DialogContentText>
                <TextField label="Players" multiline minRows={5} fullWidth value={text} onChange={(event) => setText(event.target.value)} autoFocus />
                {parsed.players.length > 0 && (
                    <List dense aria-label="Players to add" sx={{ mt: 1 }}>
                        {parsed.players.map((player, index) => (
                            <ListItem key={index} disableGutters>
                                <Typography variant="body2">{pastedLabel(player)}</Typography>
                            </ListItem>
                        ))}
                    </List>
                )}
                {parsed.overflow > 0 && (
                    <Alert severity="warning" sx={{ mt: 1 }}>
                        {overflowMessage(parsed.overflow)}
                    </Alert>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={close} sx={TARGET}>
                    Cancel
                </Button>
                <Button
                    variant="contained"
                    disabled={parsed.players.length === 0}
                    onClick={() => {
                        onAdd(parsed.players);
                        close();
                    }}
                    sx={TARGET}
                >
                    {addPlayersLabel(parsed.players.length)}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

export function RosterTeamDialog({
    open,
    options,
    listed,
    room,
    onClose,
    onAdd,
}: {
    open: boolean;
    options: readonly RosterOption[];
    /** Team player ids already on the roster: not offered again. */
    listed: ReadonlySet<string>;
    /** How many more players fit. */
    room: number;
    onClose: () => void;
    onAdd: (options: RosterOption[]) => void;
}) {
    const titleId = useId();
    const available = options.filter((option) => !listed.has(option.playerId));
    const [picked, setPicked] = useState<Set<string>>(new Set());
    const chosen = available.filter((option) => picked.has(option.playerId));
    const close = () => {
        setPicked(new Set());
        onClose();
    };
    const add = (list: RosterOption[]) => {
        onAdd(list.slice(0, room));
        close();
    };
    return (
        <Dialog open={open} onClose={close} aria-labelledby={titleId} fullWidth maxWidth="sm">
            <DialogTitle id={titleId}>{TEAM_TITLE}</DialogTitle>
            <DialogContent>
                {available.length === 0 ? (
                    <DialogContentText>Everyone on the team is already on this roster.</DialogContentText>
                ) : (
                    <List dense aria-label="Team players">
                        {available.map((option) => (
                            <ListItem key={option.playerId} disableGutters>
                                <FormControlLabel
                                    sx={{ minHeight: 44, m: 0 }}
                                    control={
                                        <Checkbox
                                            checked={picked.has(option.playerId)}
                                            onChange={(event) =>
                                                setPicked((current) => {
                                                    const next = new Set(current);
                                                    if (event.target.checked) next.add(option.playerId);
                                                    else next.delete(option.playerId);
                                                    return next;
                                                })
                                            }
                                        />
                                    }
                                    label={[option.number ? `#${option.number}` : "", option.name, option.position ? `(${option.position})` : ""].filter(Boolean).join(" ")}
                                />
                            </ListItem>
                        ))}
                    </List>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={close} sx={TARGET}>
                    Cancel
                </Button>
                <Button onClick={() => add(available)} disabled={available.length === 0 || room === 0} sx={TARGET}>
                    Add all
                </Button>
                <Button variant="contained" onClick={() => add(chosen)} disabled={chosen.length === 0 || room === 0} sx={TARGET}>
                    {addPlayersLabel(chosen.length)}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

"use client";

/**
 * One drill in a practice session: thumbnail, duration, instructions, the
 * station switch (2b), and the reorder / edit / delete controls. Extracted
 * from PracticeSessionEditor.
 */

import { useId, useState } from "react";
import {
    Box,
    Button,
    Card,
    CardActions,
    CardContent,
    CardMedia,
    Checkbox,
    Chip,
    FormControlLabel,
    FormHelperText,
    IconButton,
    Stack,
    Switch,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import {
    ArrowDownward as ArrowDownwardIcon,
    ArrowUpward as ArrowUpwardIcon,
    Delete as DeleteIcon,
    Draw as DrawIcon,
    Edit as EditIcon,
} from "@mui/icons-material";
import { usePlannerPlatform } from "@/lib/planner-store";
import { VALIDATION_CONSTRAINTS, type PlayInSession } from "@/types/practice-planner";
import { MAX_STATIONS_PER_GROUP } from "@/lib/utils/session-timeline";
import { needsGoalie } from "@/lib/utils/drill-tags";
import type { RowEdit } from "@/lib/utils/session-rows";
import { GoalieBadge } from "./GoalieBadge";
import { RunByField, type RowRunBy } from "./RunByField";

/** Hidden from sight but read by screen readers (the standard clip pattern). */
const VISUALLY_HIDDEN = {
    position: "absolute",
    // Strings, not numbers: sx reads width 1 as 100% and m as theme spacing.
    width: "1px",
    height: "1px",
    padding: 0,
    margin: "-1px",
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
    border: 0,
} as const;

export const STATION_SWITCH_LABEL = "Run as a station with the previous drill";
export const STATION_CAP_TOOLTIP = `A station block holds at most ${MAX_STATIONS_PER_GROUP} drills`;
export const STAYS_LABEL = "Stays";
export const STAYS_HELP = "Doesn't rotate, e.g. goalie station";

/**
 * Props for the SessionDrillCard component
 */
export interface SessionDrillCardProps {
    play: PlayInSession;
    /** Position in the whole session (not within a station block): the move / toggle index. */
    index: number;
    /** 1-based number among the session's drills (block rows aren't counted); defaults to index + 1. */
    number?: number;
    /** Whether Move up / Move down would change the order (station-aware, 2b). */
    canMoveUp: boolean;
    canMoveDown: boolean;
    /** The station switch; null for the first drill, which always runs on its own. */
    station: { checked: boolean; canToggle: boolean } | null;
    onToggleStation: (index: number) => void;
    /**
     * This drill's place in its station block, when it is one of several
     * stations (2b): `position` is 1-based within the block, `count` the block
     * size. The card is styled as part of the block and is a group named
     * "Station k of N: <title>" (the block header is announced once, as its own
     * h3); the list stays flat so cards never remount.
     */
    stationSlot?: { position: number; count: number };
    /** Advisory: the drill is larger than the booked ice segment (2b). Never blocks a save. */
    fitWarning?: string | null;
    /** Advisory goalie shortfall for a standalone drill. Never blocks a save. */
    goalieWarning?: string | null;
    /**
     * Set while this drill's station block rotates (spec R8): the Stays
     * checkbox replaces the minutes, which the rotation sets.
     */
    stays?: { checked: boolean; onToggle: () => void } | null;
    /** Who runs this drill (practice staff, spec R8); null hides the field (nobody on the list is named). */
    runBy?: RowRunBy | null;
    isEditing: boolean;
    onDelete: (playId: string) => void;
    onEdit: (playId: string) => void;
    onUpdate: (playId: string, edit: RowEdit) => void;
    onCancelEdit: () => void;
    onMoveUp: (index: number) => void;
    onMoveDown: (index: number) => void;
    /** Diagram editing needs a saved session. */
    canEditDiagram: boolean;
    /** The list is busy (saving or sharing). */
    disabled?: boolean;
    /** The session is being created: nothing on the card may change. */
    locked?: boolean;
    onEditDiagram: (clientKey: string) => void;
}

/**
 * SessionDrillCard Component
 *
 * Individual play card showing thumbnail, duration, and instructions
 * Requirements: 2.2, 2.4, 2.5
 */
export function SessionDrillCard({
    play,
    index,
    number = index + 1,
    canMoveUp,
    canMoveDown,
    station,
    onToggleStation,
    stationSlot,
    fitWarning = null,
    goalieWarning = null,
    stays = null,
    runBy = null,
    isEditing,
    onDelete,
    onEdit,
    onUpdate,
    onCancelEdit,
    onMoveUp,
    onMoveDown,
    canEditDiagram,
    disabled = false,
    locked = false,
    onEditDiagram,
}: SessionDrillCardProps) {
    const { Image } = usePlannerPlatform();
    // Local state for editing
    const [editDuration, setEditDuration] = useState(play.duration);
    const [editInstructions, setEditInstructions] = useState(play.instructions);

    const titleId = useId();
    const slotLabelId = useId();
    const grouped = stationSlot !== undefined;
    const capReasonId = useId();
    const capped = station !== null && !station.canToggle;
    const staysHelpId = useId();

    // Get thumbnail from play instance (copied from library play when added)
    const thumbnail = play.thumbnail || "";

    /**
     * Handle save edits
     * Requirements: 2.4 - Save inline edits
     */
    const handleSaveEdits = () => {
        // While the block rotates, the rotation owns the minutes.
        onUpdate(play.id, { ...(stays ? {} : { duration: editDuration }), instructions: editInstructions });
    };

    /**
     * Handle cancel edits
     */
    const handleCancelEdits = () => {
        setEditDuration(play.duration);
        setEditInstructions(play.instructions);
        onCancelEdit();
    };

    return (
        <Card
            // A grouped card can't sit inside a wrapper (moving it in or out would remount it),
            // so each one is its own group, named by its place in the block and its title.
            role={grouped ? "group" : undefined}
            aria-labelledby={grouped ? `${slotLabelId} ${titleId}` : undefined}
            sx={{
                display: "flex",
                flexDirection: { xs: "column", sm: "row" },
                gap: 2,
                ...(grouped && {
                    borderLeft: 4,
                    borderColor: "primary.main",
                    bgcolor: "action.hover",
                    ml: 1,
                }),
            }}
        >
            {stationSlot && (
                // Out of flow (absolute), so it takes no flex gap; read as part of the group's name.
                <Box component="span" id={slotLabelId} sx={VISUALLY_HIDDEN}>
                    {`Station ${stationSlot.position} of ${stationSlot.count}:`}
                </Box>
            )}

            {/* Thumbnail */}
            <CardMedia
                component="div"
                sx={{
                    width: { xs: "100%", sm: 200 },
                    height: { xs: 150, sm: 120 },
                    bgcolor: "action.hover",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    position: "relative",
                    flexShrink: 0,
                }}
            >
                {thumbnail ? (
                    <Image src={thumbnail} alt={play.name || `Drill ${number}`} fit="contain" />
                ) : (
                    <Typography variant="body2" color="text.secondary">
                        Play {number}
                    </Typography>
                )}
                <Chip
                    label={`#${number}`}
                    color="primary"
                    size="small"
                    sx={{
                        position: "absolute",
                        top: 8,
                        left: 8,
                    }}
                />
                {needsGoalie(play) && <GoalieBadge sx={{ position: "absolute", top: 8, right: 8 }} />}
            </CardMedia>

            {/* Content */}
            <CardContent sx={{ flexGrow: 1, py: 1 }}>
                <Stack spacing={1}>
                    <Typography id={titleId} variant="h6" component={grouped ? "h4" : "h3"}>
                        {play.name || `Drill ${number}`}
                    </Typography>

                    {fitWarning && (
                        <Chip
                            label={fitWarning}
                            color="warning"
                            size="small"
                            variant="outlined"
                            sx={{ alignSelf: "flex-start" }}
                        />
                    )}
                    {goalieWarning && (
                        <Chip label={goalieWarning} color="warning" size="small" variant="outlined" sx={{ alignSelf: "flex-start" }} />
                    )}

                    {/* Duration - Editable; while the block rotates, Stays in its place (spec R8) */}
                    {/* Requirements: 2.4 - Duration input for each play */}
                    {stays ? (
                        <Box>
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={stays.checked}
                                        onChange={stays.onToggle}
                                        slotProps={{ input: { "aria-describedby": `${titleId} ${staysHelpId}` } }}
                                    />
                                }
                                label={STAYS_LABEL}
                                disabled={locked}
                                sx={{ minHeight: 44, ml: 0 }}
                            />
                            <FormHelperText id={staysHelpId} sx={{ mt: 0 }}>
                                {STAYS_HELP}
                            </FormHelperText>
                        </Box>
                    ) : isEditing ? (
                        <TextField
                            label="Duration (minutes)"
                            type="number"
                            value={editDuration}
                            onChange={(e) => setEditDuration(parseInt(e.target.value, 10) || 0)}
                            size="small"
                            disabled={locked}
                            inputProps={{
                                min: VALIDATION_CONSTRAINTS.MIN_DURATION,
                                max: VALIDATION_CONSTRAINTS.MAX_DURATION,
                            }}
                            fullWidth
                        />
                    ) : (
                        <Stack direction="row" spacing={1} alignItems="center">
                            <Typography variant="body2" color="text.secondary">
                                Duration:
                            </Typography>
                            <Typography variant="body2" fontWeight="medium">
                                {play.duration} minutes
                            </Typography>
                        </Stack>
                    )}

                    {/* Instructions - Editable */}
                    {/* Requirements: 2.4 - Inline editor for play instructions */}
                    {isEditing ? (
                        <TextField
                            label="Instructions"
                            value={editInstructions}
                            onChange={(e) => setEditInstructions(e.target.value)}
                            multiline
                            rows={3}
                            size="small"
                            disabled={locked}
                            fullWidth
                            inputProps={{ maxLength: 2000 }}
                            helperText={`${editInstructions.length}/2000 characters`}
                        />
                    ) : (
                        play.instructions && (
                            <Box>
                                <Typography variant="body2" color="text.secondary" gutterBottom>
                                    Instructions:
                                </Typography>
                                <Typography
                                    variant="body2"
                                    sx={{
                                        display: "-webkit-box",
                                        WebkitLineClamp: 2,
                                        WebkitBoxOrient: "vertical",
                                        overflow: "hidden",
                                    }}
                                >
                                    {play.instructions}
                                </Typography>
                            </Box>
                        )
                    )}

                    {runBy && <RunByField {...runBy} title={play.name || `Drill ${number}`} disabled={disabled || locked} />}

                    {!isEditing && (
                        <Tooltip title={canEditDiagram ? "" : "Save the session first"}>
                            <span>
                                <Button
                                    size="small"
                                    startIcon={<DrawIcon />}
                                    onClick={() => onEditDiagram(play.id)}
                                    disabled={disabled || !canEditDiagram}
                                    aria-label={`Edit diagram for ${play.name || `drill ${number}`}`}
                                    sx={{ minHeight: 44 }}
                                >
                                    Edit diagram
                                </Button>
                            </span>
                        </Tooltip>
                    )}

                    {/* Station grouping (2b): runs at the same time as the drill before it */}
                    {/* The switch is described by the drill's name (every switch shares one label) and, */}
                    {/* at the block cap, by the visible reason it is disabled. */}
                    {!isEditing && station && (
                        <Box>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={station.checked}
                                        onChange={() => onToggleStation(index)}
                                        slotProps={{
                                            input: {
                                                "aria-describedby": capped ? `${titleId} ${capReasonId}` : titleId,
                                            },
                                        }}
                                    />
                                }
                                label={STATION_SWITCH_LABEL}
                                disabled={locked || capped}
                                sx={{ minHeight: 44, ml: 0 }}
                            />
                            {capped && (
                                <FormHelperText id={capReasonId} sx={{ mt: 0 }}>
                                    {STATION_CAP_TOOLTIP}
                                </FormHelperText>
                            )}
                        </Box>
                    )}

                    {/* Edit Actions */}
                    {isEditing && (
                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                            <Button size="small" onClick={handleCancelEdits}>
                                Cancel
                            </Button>
                            <Button
                                size="small"
                                variant="contained"
                                onClick={handleSaveEdits}
                                disabled={locked}
                            >
                                Save
                            </Button>
                        </Stack>
                    )}
                </Stack>
            </CardContent>

            {/* Actions */}
            {!isEditing && (
                <CardActions
                    sx={{
                        // Phone: one row of 44px targets under the content; sm+: the column beside it.
                        flexDirection: { xs: "row", sm: "column" },
                        justifyContent: { xs: "space-between", sm: "center" },
                        p: 1,
                        gap: 0.5,
                        "& .MuiIconButton-root": {
                            minWidth: { xs: 44, sm: 0 },
                            minHeight: { xs: 44, sm: 0 },
                            // CardActions adds a left margin to later siblings
                            ml: 0,
                        },
                    }}
                >
                    {/* Requirements: 2.5 - Reordering controls (station-aware, 2b) */}
                    <IconButton
                        size="small"
                        onClick={() => onMoveUp(index)}
                        disabled={locked || !canMoveUp}
                        aria-label={`Move play ${number} up`}
                    >
                        <ArrowUpwardIcon />
                    </IconButton>
                    <IconButton
                        size="small"
                        onClick={() => onMoveDown(index)}
                        disabled={locked || !canMoveDown}
                        aria-label={`Move play ${number} down`}
                    >
                        <ArrowDownwardIcon />
                    </IconButton>
                    <IconButton
                        size="small"
                        color="primary"
                        onClick={() => onEdit(play.id)}
                        disabled={locked}
                        aria-label={`Edit play ${number}`}
                    >
                        <EditIcon />
                    </IconButton>
                    <IconButton
                        size="small"
                        color="error"
                        onClick={() => onDelete(play.id)}
                        disabled={locked}
                        aria-label={`Delete play ${number}`}
                    >
                        <DeleteIcon />
                    </IconButton>
                </CardActions>
            )}
        </Card>
    );
}

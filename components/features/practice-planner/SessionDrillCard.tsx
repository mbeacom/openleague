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
import Image from "next/image";
import { VALIDATION_CONSTRAINTS, type PlayInSession } from "@/types/practice-planner";
import { MAX_STATIONS_PER_GROUP } from "@/lib/utils/session-timeline";

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

/**
 * Props for the SessionDrillCard component
 */
export interface SessionDrillCardProps {
    play: PlayInSession;
    /** Position in the whole session (not within a station block). */
    index: number;
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
    isEditing: boolean;
    onDelete: (playId: string) => void;
    onEdit: (playId: string) => void;
    onUpdate: (playId: string, updates: Partial<PlayInSession>) => void;
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
    canMoveUp,
    canMoveDown,
    station,
    onToggleStation,
    stationSlot,
    fitWarning = null,
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
    // Local state for editing
    const [editDuration, setEditDuration] = useState(play.duration);
    const [editInstructions, setEditInstructions] = useState(play.instructions);

    const titleId = useId();
    const slotLabelId = useId();
    const grouped = stationSlot !== undefined;
    const capReasonId = useId();
    const capped = station !== null && !station.canToggle;

    // Get thumbnail from play instance (copied from library play when added)
    const thumbnail = play.thumbnail || "";

    /**
     * Handle save edits
     * Requirements: 2.4 - Save inline edits
     */
    const handleSaveEdits = () => {
        onUpdate(play.id, {
            duration: editDuration,
            instructions: editInstructions,
        });
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
                    bgcolor: "grey.100",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    position: "relative",
                    flexShrink: 0,
                }}
            >
                {thumbnail ? (
                    <Image
                        src={thumbnail}
                        alt={play.name || `Drill ${index + 1}`}
                        fill
                        style={{ objectFit: "contain" }}
                        unoptimized
                    />
                ) : (
                    <Typography variant="body2" color="text.secondary">
                        Play {index + 1}
                    </Typography>
                )}
                <Chip
                    label={`#${index + 1}`}
                    color="primary"
                    size="small"
                    sx={{
                        position: "absolute",
                        top: 8,
                        left: 8,
                    }}
                />
            </CardMedia>

            {/* Content */}
            <CardContent sx={{ flexGrow: 1, py: 1 }}>
                <Stack spacing={1}>
                    <Typography id={titleId} variant="h6" component={grouped ? "h4" : "h3"}>
                        {play.name || `Drill ${index + 1}`}
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

                    {/* Duration - Editable */}
                    {/* Requirements: 2.4 - Duration input for each play */}
                    {isEditing ? (
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

                    {!isEditing && (
                        <Tooltip title={canEditDiagram ? "" : "Save the session first"}>
                            <span>
                                <Button
                                    size="small"
                                    startIcon={<DrawIcon />}
                                    onClick={() => onEditDiagram(play.id)}
                                    disabled={disabled || !canEditDiagram}
                                    aria-label={`Edit diagram for ${play.name || `drill ${index + 1}`}`}
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
                <CardActions sx={{ flexDirection: "column", justifyContent: "center", p: 1, gap: 0.5 }}>
                    {/* Requirements: 2.5 - Reordering controls (station-aware, 2b) */}
                    <IconButton
                        size="small"
                        onClick={() => onMoveUp(index)}
                        disabled={locked || !canMoveUp}
                        aria-label={`Move play ${index + 1} up`}
                    >
                        <ArrowUpwardIcon />
                    </IconButton>
                    <IconButton
                        size="small"
                        onClick={() => onMoveDown(index)}
                        disabled={locked || !canMoveDown}
                        aria-label={`Move play ${index + 1} down`}
                    >
                        <ArrowDownwardIcon />
                    </IconButton>
                    <IconButton
                        size="small"
                        color="primary"
                        onClick={() => onEdit(play.id)}
                        disabled={locked}
                        aria-label={`Edit play ${index + 1}`}
                    >
                        <EditIcon />
                    </IconButton>
                    <IconButton
                        size="small"
                        color="error"
                        onClick={() => onDelete(play.id)}
                        disabled={locked}
                        aria-label={`Delete play ${index + 1}`}
                    >
                        <DeleteIcon />
                    </IconButton>
                </CardActions>
            )}
        </Card>
    );
}

"use client";

/**
 * One drill in a practice session: thumbnail, duration, instructions, and the
 * reorder / edit / delete controls. Extracted from PracticeSessionEditor.
 */

import { useState } from "react";
import {
    Box,
    Button,
    Card,
    CardActions,
    CardContent,
    CardMedia,
    Chip,
    IconButton,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import {
    ArrowDownward as ArrowDownwardIcon,
    ArrowUpward as ArrowUpwardIcon,
    Delete as DeleteIcon,
    Edit as EditIcon,
} from "@mui/icons-material";
import Image from "next/image";
import { VALIDATION_CONSTRAINTS, type PlayInSession } from "@/types/practice-planner";

/**
 * Props for the SessionDrillCard component
 */
export interface SessionDrillCardProps {
    play: PlayInSession;
    index: number;
    totalPlays: number;
    isEditing: boolean;
    onDelete: (playId: string) => void;
    onEdit: (playId: string) => void;
    onUpdate: (playId: string, updates: Partial<PlayInSession>) => void;
    onCancelEdit: () => void;
    onMoveUp: (index: number) => void;
    onMoveDown: (index: number) => void;
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
    totalPlays,
    isEditing,
    onDelete,
    onEdit,
    onUpdate,
    onCancelEdit,
    onMoveUp,
    onMoveDown,
}: SessionDrillCardProps) {
    // Local state for editing
    const [editDuration, setEditDuration] = useState(play.duration);
    const [editInstructions, setEditInstructions] = useState(play.instructions);

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
            sx={{
                display: "flex",
                flexDirection: { xs: "column", sm: "row" },
                gap: 2,
            }}
        >
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
                    <Typography variant="h6" component="h3">
                        {play.name || `Drill ${index + 1}`}
                    </Typography>

                    {/* Duration - Editable */}
                    {/* Requirements: 2.4 - Duration input for each play */}
                    {isEditing ? (
                        <TextField
                            label="Duration (minutes)"
                            type="number"
                            value={editDuration}
                            onChange={(e) => setEditDuration(parseInt(e.target.value, 10) || 0)}
                            size="small"
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
                    {/* Requirements: 2.5 - Reordering controls */}
                    <IconButton
                        size="small"
                        onClick={() => onMoveUp(index)}
                        disabled={index === 0}
                        aria-label={`Move play ${index + 1} up`}
                    >
                        <ArrowUpwardIcon />
                    </IconButton>
                    <IconButton
                        size="small"
                        onClick={() => onMoveDown(index)}
                        disabled={index === totalPlays - 1}
                        aria-label={`Move play ${index + 1} down`}
                    >
                        <ArrowDownwardIcon />
                    </IconButton>
                    <IconButton
                        size="small"
                        color="primary"
                        onClick={() => onEdit(play.id)}
                        aria-label={`Edit play ${index + 1}`}
                    >
                        <EditIcon />
                    </IconButton>
                    <IconButton
                        size="small"
                        color="error"
                        onClick={() => onDelete(play.id)}
                        aria-label={`Delete play ${index + 1}`}
                    >
                        <DeleteIcon />
                    </IconButton>
                </CardActions>
            )}
        </Card>
    );
}

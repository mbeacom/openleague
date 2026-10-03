"use client";

import { Alert, Box, Button, Paper, Stack, Typography } from "@mui/material";
import { Add as AddIcon } from "@mui/icons-material";
import type { PlayInSession } from "@/types/practice-planner";
import { SessionDrillCard } from "./SessionDrillCard";

export interface SessionDrillListProps {
    plays: PlayInSession[];
    duration: number;
    editingPlayId: string | null;
    disabled: boolean;
    onOpenLibrary: () => void;
    onDelete: (playId: string) => void;
    onEdit: (playId: string) => void;
    onUpdate: (playId: string, updates: Partial<PlayInSession>) => void;
    onCancelEdit: () => void;
    onMoveUp: (index: number) => void;
    onMoveDown: (index: number) => void;
}

/** Plays in Session: totals, empty state, and one card per drill (Requirements 2.2-2.5). */
export function SessionDrillList({
    plays,
    duration,
    editingPlayId,
    disabled,
    onOpenLibrary,
    onDelete,
    onEdit,
    onUpdate,
    onCancelEdit,
    onMoveUp,
    onMoveDown,
}: SessionDrillListProps) {
    const totalPlayTime = plays.reduce((sum, play) => sum + play.duration, 0);

    return (
        <Paper elevation={2} sx={{ p: 2 }}>
            <Stack spacing={2}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="h6" component="h2">
                        Plays in Session
                    </Typography>
                    <Button
                        variant="outlined"
                        startIcon={<AddIcon />}
                        onClick={onOpenLibrary}
                        disabled={disabled}
                    >
                        Add Play
                    </Button>
                </Stack>

                {plays.length > 0 && (
                    <Box>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Typography variant="body2" color="text.secondary">
                                Total Play Time: {totalPlayTime} minutes
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Session Duration: {duration} minutes
                            </Typography>
                        </Stack>
                        {totalPlayTime > duration && (
                            <Alert severity="warning" sx={{ mt: 1 }}>
                                Total play time ({totalPlayTime} min) exceeds
                                session duration ({duration} min)
                            </Alert>
                        )}
                    </Box>
                )}

                {plays.length === 0 && (
                    <Box
                        sx={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            minHeight: 200,
                            textAlign: "center",
                            p: 3,
                        }}
                    >
                        <Typography variant="h6" color="text.secondary" gutterBottom>
                            No plays added yet
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Add plays from your library to build your practice session
                        </Typography>
                    </Box>
                )}

                {plays.length > 0 && (
                    <Stack spacing={2}>
                        {plays.map((play, index) => (
                            <SessionDrillCard
                                key={play.id}
                                play={play}
                                index={index}
                                totalPlays={plays.length}
                                isEditing={editingPlayId === play.id}
                                onDelete={onDelete}
                                onEdit={onEdit}
                                onUpdate={onUpdate}
                                onCancelEdit={onCancelEdit}
                                onMoveUp={onMoveUp}
                                onMoveDown={onMoveDown}
                            />
                        ))}
                    </Stack>
                )}
            </Stack>
        </Paper>
    );
}

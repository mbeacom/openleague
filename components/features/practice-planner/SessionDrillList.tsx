"use client";

import type { ReactNode } from "react";
import { Alert, Box, Button, Paper, Stack, Tooltip, Typography } from "@mui/material";
import { Add as AddIcon, Draw as DrawIcon } from "@mui/icons-material";
import type { PlayInSession } from "@/types/practice-planner";
import {
    canMove,
    canToggleRunsWithPrevious,
    groupStations,
    sessionWallMinutes,
    stationBlockLabel,
} from "@/lib/utils/session-timeline";
import { SessionDrillCard } from "./SessionDrillCard";

export interface SessionDrillListProps {
    plays: PlayInSession[];
    duration: number;
    editingPlayId: string | null;
    disabled: boolean;
    /** The session is being created: every card control is locked. */
    locked?: boolean;
    onOpenLibrary: () => void;
    onDelete: (playId: string) => void;
    onEdit: (playId: string) => void;
    onUpdate: (playId: string, updates: Partial<PlayInSession>) => void;
    onCancelEdit: () => void;
    onMoveUp: (index: number) => void;
    onMoveDown: (index: number) => void;
    /** Flips "Run as a station with the previous drill" on the drill at this position (2b). */
    onToggleStation: (index: number) => void;
    /** Diagram editing and new drills need a saved session. */
    canEditDiagram: boolean;
    onEditDiagram: (clientKey: string) => void;
    onNewDrill: () => void;
}

/** Drills that run at the same time: one outlined block headed "Stations · N · M min" (2b). */
function StationBlock({ label, children }: { label: string; children: ReactNode }) {
    return (
        <Box
            role="group"
            aria-label={label}
            sx={{ border: 2, borderColor: "primary.main", borderRadius: 1, p: 1.5 }}
        >
            <Stack spacing={1.5}>
                <Typography
                    variant="subtitle2"
                    component="p"
                    sx={{ fontWeight: 800, color: "primary.main", textTransform: "uppercase", letterSpacing: 1 }}
                >
                    {label}
                </Typography>
                {children}
            </Stack>
        </Box>
    );
}

/**
 * Plays in Session: totals, empty state, and one card per drill
 * (Requirements 2.2-2.5). Drills that run together render as one station
 * block; the total is the session's wall time (2b).
 */
export function SessionDrillList({
    plays,
    duration,
    editingPlayId,
    disabled,
    locked = false,
    onOpenLibrary,
    onDelete,
    onEdit,
    onUpdate,
    onCancelEdit,
    onMoveUp,
    onMoveDown,
    onToggleStation,
    canEditDiagram,
    onEditDiagram,
    onNewDrill,
}: SessionDrillListProps) {
    const totalPlayTime = sessionWallMinutes(plays);
    const groups = groupStations(plays);

    // The editor keeps array order equal to sequence order, so a drill's
    // position in `plays` is its card number and its move/toggle index.
    const renderCard = (play: PlayInSession) => {
        const index = plays.indexOf(play);
        return (
            <SessionDrillCard
                key={play.id}
                play={play}
                index={index}
                canMoveUp={canMove(plays, index, -1)}
                canMoveDown={canMove(plays, index, 1)}
                station={index === 0 ? null : {
                    checked: play.runsWithPrevious,
                    canToggle: canToggleRunsWithPrevious(plays, index),
                }}
                onToggleStation={onToggleStation}
                isEditing={editingPlayId === play.id}
                onDelete={onDelete}
                onEdit={onEdit}
                onUpdate={onUpdate}
                onCancelEdit={onCancelEdit}
                onMoveUp={onMoveUp}
                onMoveDown={onMoveDown}
                canEditDiagram={canEditDiagram}
                disabled={disabled}
                locked={locked}
                onEditDiagram={onEditDiagram}
            />
        );
    };

    return (
        <Paper elevation={2} sx={{ p: 2 }}>
            <Stack spacing={2}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="h6" component="h2">
                        Plays in Session
                    </Typography>
                    <Stack direction="row" spacing={1}>
                        <Tooltip title={canEditDiagram ? "" : "Save the session first"}>
                            <span>
                                <Button
                                    variant="outlined"
                                    startIcon={<DrawIcon />}
                                    onClick={onNewDrill}
                                    disabled={disabled || !canEditDiagram}
                                    sx={{ minHeight: 44 }}
                                >
                                    New drill
                                </Button>
                            </span>
                        </Tooltip>
                        <Button
                            variant="outlined"
                            startIcon={<AddIcon />}
                            onClick={onOpenLibrary}
                            disabled={disabled}
                            sx={{ minHeight: 44 }}
                        >
                            Add from library
                        </Button>
                    </Stack>
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
                        {groups.map((group) =>
                            group.stations.length > 1 ? (
                                <StationBlock
                                    key={`stations-${group.stations[0].id}`}
                                    label={stationBlockLabel(group.stations.length, group.wallMinutes)}
                                >
                                    {group.stations.map(renderCard)}
                                </StationBlock>
                            ) : (
                                renderCard(group.stations[0])
                            )
                        )}
                    </Stack>
                )}
            </Stack>
        </Paper>
    );
}

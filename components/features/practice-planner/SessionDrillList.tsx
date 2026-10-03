"use client";

import type { ReactNode } from "react";
import type { SegmentKind } from "@/types/segments";
import { Alert, Box, Button, Paper, Stack, Tooltip, Typography } from "@mui/material";
import { Add as AddIcon, Draw as DrawIcon } from "@mui/icons-material";
import type { PlayInSession } from "@/types/practice-planner";
import {
    SEGMENT_KIND_FIT_LABELS,
    canMove,
    canToggleRunsWithPrevious,
    groupStations,
    sessionWallMinutes,
    stationBlockLabel,
    stationWarnings,
    type StationGroup,
} from "@/lib/utils/session-timeline";
import { SessionDrillCard } from "./SessionDrillCard";

export interface SessionDrillListProps {
    plays: PlayInSession[];
    duration: number;
    /** The booked segment's kind, for the fit warning (2b); null = unbooked or the whole surface. */
    segmentKind?: SegmentKind | null;
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

/**
 * The header of a station block, "Stations · N · M min", with its overlap
 * warnings (2b). It is a sibling of the block's cards, not their parent: the
 * list renders flat so a drill joining, leaving or heading a block never
 * remounts its card (which would drop keyboard focus and inline-edit drafts).
 * It is an h3 like a standalone card's title; each grouped card is a
 * role="group" named "Station k of N: <title>" (its own h4), so the header
 * is announced once rather than repeated on every card.
 */
function StationBlockHeader({ id, label, warnings }: { id: string; label: string; warnings: string[] }) {
    return (
        <Box sx={{ borderLeft: 4, borderColor: "primary.main", pl: 1.5 }}>
            <Typography
                id={id}
                variant="subtitle2"
                component="h3"
                sx={{ fontWeight: 800, color: "primary.main", textTransform: "uppercase", letterSpacing: 1 }}
            >
                {label}
            </Typography>
            {warnings.map((warning) => (
                <Alert key={warning} severity="warning" sx={{ mt: 1 }}>
                    {warning}
                </Alert>
            ))}
        </Box>
    );
}

/** "Stations 1 and 2 overlap on the ice", numbering stations by their place in the block. */
function overlapMessages(
    group: StationGroup<PlayInSession>,
    overlaps: Array<[number, number, number]>,
): string[] {
    const position = (sequence: number) => group.stations.findIndex((station) => station.sequence === sequence) + 1;
    return overlaps
        .filter(([groupIndex]) => groupIndex === group.index)
        .map(([, a, b]) => `Stations ${position(a)} and ${position(b)} overlap on the ice`);
}

/**
 * Plays in Session: totals, empty state, and one card per drill
 * (Requirements 2.2-2.5). Drills that run together render as one station
 * block; the total is the session's wall time; overlap and fit warnings are
 * advisory (2b).
 */
export function SessionDrillList({
    plays,
    duration,
    segmentKind = null,
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
    // An unreadable drill (area null) is skipped by the warnings, not read as full ice.
    const warnings = stationWarnings(
        groupStations(plays.map((play) => ({ ...play, area: play.playDataUnreadable ? null : play.playData.area }))),
        segmentKind,
    );
    const fitLabel = segmentKind ? SEGMENT_KIND_FIT_LABELS[segmentKind] : null;

    // The editor keeps array order equal to sequence order, so a drill's
    // position in `plays` is its card number and its move/toggle index.
    const renderCard = (play: PlayInSession, stationSlot?: { position: number; count: number }) => {
        const index = plays.indexOf(play);
        return (
            <SessionDrillCard
                key={play.id}
                play={play}
                index={index}
                stationSlot={stationSlot}
                canMoveUp={canMove(plays, index, -1)}
                canMoveDown={canMove(plays, index, 1)}
                station={index === 0 ? null : {
                    checked: play.runsWithPrevious,
                    canToggle: canToggleRunsWithPrevious(plays, index),
                }}
                onToggleStation={onToggleStation}
                fitWarning={fitLabel && warnings.tooBig.includes(play.sequence) ? `Larger than the booked ${fitLabel}` : null}
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

                {/* One flat, play.id-keyed list (no per-block wrapper or keyed Fragment): */}
                {/* block headers are keyed siblings, so regrouping never remounts a card. */}
                {plays.length > 0 && (
                    <Stack spacing={2}>
                        {groups.flatMap((group): ReactNode[] => {
                            if (group.stations.length === 1) return [renderCard(group.stations[0])];
                            const headerId = `station-block-${group.stations[0].id}`;
                            return [
                                <StationBlockHeader
                                    key={`header-${group.stations[0].id}`}
                                    id={headerId}
                                    label={stationBlockLabel(group.stations.length, group.wallMinutes)}
                                    warnings={overlapMessages(group, warnings.overlaps)}
                                />,
                                ...group.stations.map((play, slot) =>
                                    renderCard(play, { position: slot + 1, count: group.stations.length })),
                            ];
                        })}
                    </Stack>
                )}
            </Stack>
        </Paper>
    );
}

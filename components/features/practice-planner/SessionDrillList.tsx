"use client";

import type { ReactNode } from "react";
import type { SegmentKind } from "@/types/segments";
import { Alert, Box, Button, Paper, Stack, Tooltip, Typography } from "@mui/material";
import { Add as AddIcon, Draw as DrawIcon } from "@mui/icons-material";
import type { BlockInSession, BlockKind, PlayInSession, SessionItem, SessionStaffMember } from "@/types/practice-planner";
import { isNamedStaff } from "@/lib/utils/session-staff";
import {
    SEGMENT_KIND_FIT_LABELS,
    canMove,
    canToggleRunsWithPrevious,
    defaultRotationMinutes,
    goalieShortMessage,
    goalieWarnings,
    goaliesUnusedMessage,
    groupStations,
    rotatingStations,
    rotationRoundLabel,
    rotationTable,
    sessionWallMinutes,
    stationBlockLabel,
    stationWarnings,
    type StationGroup,
} from "@/lib/utils/session-timeline";
import { drillRows, isBlockRow, isDrillRow, type RowEdit } from "@/lib/utils/session-rows";
import { AddBlockMenu } from "./AddBlockMenu";
import { BlockRowCard } from "./BlockRowCard";
import { SessionDrillCard } from "./SessionDrillCard";
import { StationBlockHeader, type StationRotationControls } from "./StationBlockHeader";
import type { RowRunBy } from "./RunByField";

export interface SessionDrillListProps {
    plays: SessionItem[];
    duration: number;
    /** The booked segment's kind, for the fit warning (2b); null = unbooked or the whole surface. */
    segmentKind?: SegmentKind | null;
    /** Goalies expected (null = not set): drives the goalie warnings (advisory). */
    goaliesAttending?: number | null;
    editingPlayId: string | null;
    disabled: boolean;
    /** The session is being created: every card control is locked. */
    locked?: boolean;
    onOpenLibrary: () => void;
    onDelete: (playId: string) => void;
    onEdit: (playId: string) => void;
    onUpdate: (playId: string, edit: RowEdit) => void;
    onCancelEdit: () => void;
    onMoveUp: (index: number) => void;
    onMoveDown: (index: number) => void;
    /** Flips "Run as a station with the previous drill" on the drill at this position (2b). */
    onToggleStation: (index: number) => void;
    /** Diagram editing and new drills need a saved session. */
    canEditDiagram: boolean;
    onEditDiagram: (clientKey: string) => void;
    onNewDrill: () => void;
    /** Minutes between blocks, counted in the total (spec R4). */
    transitionMinutes?: number;
    /** Appends a warm-up, water break, transition or cool-down. */
    onAddBlock: (kind: BlockKind) => void;
    /** Sets or clears (null) the rotation on the block whose first drill is at this position. */
    onSetRotation: (headIndex: number, minutes: number | null) => void;
    /** Marks the drill at this position as staying put in its rotating block. */
    onSetStays: (index: number, stays: boolean) => void;
    /** The practice's staff (practice staff, spec R8); absent or unnamed hides Run by. */
    staff?: SessionStaffMember[];
    /** Sets who runs the row with this id. */
    onSetRowStaff?: (rowId: string, keys: string[]) => void;
}

/** "Stations 1 and 2 overlap on the ice", numbering stations by their place in the block. */
function overlapMessages(
    group: StationGroup<SessionItem>,
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
    goaliesAttending = null,
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
    transitionMinutes = 0,
    onAddBlock,
    onSetRotation,
    onSetStays,
    staff,
    onSetRowStaff,
}: SessionDrillListProps) {
    const totalPlayTime = sessionWallMinutes(plays, transitionMinutes);
    const groups = groupStations(plays);
    // An unreadable drill (area null) is skipped by the warnings, not read as full ice; a block has no area.
    const warnings = stationWarnings(
        groupStations(plays.map((play) => (isDrillRow(play) ? { ...play, area: play.playDataUnreadable ? null : play.playData.area } : { ...play, area: null }))),
        segmentKind,
    );
    // Raw diagrams (never the display copy): hidden markers must not hide a shortfall.
    // An unreadable drill (playData null) needs one goalie if it is tagged so, never zero by accident.
    const goalieAlerts = goalieWarnings(
        groupStations(plays.map((play) => (isDrillRow(play) ? { ...play, playData: play.playDataUnreadable ? null : play.playData } : play))),
        goaliesAttending,
    );
    const goalieMessage = (group: StationGroup<SessionItem>): string | null => {
        const shortfall = goalieAlerts.short.find((short) => short.groupIndex === group.index);
        return shortfall && goaliesAttending !== null
            ? goalieShortMessage(shortfall.needed, goaliesAttending, group.stations.length > 1)
            : null;
    };
    const fitLabel = segmentKind ? SEGMENT_KIND_FIT_LABELS[segmentKind] : null;

    // The editor keeps array order equal to sequence order, so a drill's
    // position in `plays` is its move/toggle index; its card number counts
    // drills only, so a warm-up or break never shifts "Play N". Looked up by
    // row id, not object identity, so a copied row still finds its number.
    const drillNumbers = new Map(drillRows(plays).map((drill, index) => [drill.id, index + 1]));
    // Run by appears on every card once the practice has a named person (spec R8).
    const staffed = Boolean(staff?.some(isNamedStaff));
    const runByFor = (row: SessionItem): RowRunBy | null =>
        staffed && staff && onSetRowStaff ? { staff, value: row.staff ?? [], onChange: (keys) => onSetRowStaff(row.id, keys) } : null;
    const renderCard = (
        play: PlayInSession,
        stationSlot?: { position: number; count: number },
        goalieWarning: string | null = null,
        stays: { checked: boolean; onToggle: () => void } | null = null,
    ) => {
        const index = plays.indexOf(play);
        // A drill right after a block row (or first) can't join a station block.
        const previous = plays[index - 1];
        return (
            <SessionDrillCard
                key={play.id}
                play={play}
                index={index}
                number={drillNumbers.get(play.id) ?? drillNumbers.size + 1}
                stationSlot={stationSlot}
                canMoveUp={canMove(plays, index, -1)}
                canMoveDown={canMove(plays, index, 1)}
                station={previous === undefined || isBlockRow(previous) ? null : {
                    checked: play.runsWithPrevious,
                    canToggle: canToggleRunsWithPrevious(plays, index),
                }}
                onToggleStation={onToggleStation}
                fitWarning={fitLabel && warnings.tooBig.includes(play.sequence) ? `Larger than the booked ${fitLabel}` : null}
                goalieWarning={goalieWarning}
                stays={stays}
                runBy={runByFor(play)}
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

    const renderBlock = (item: BlockInSession) => {
        const index = plays.indexOf(item);
        return (
            <BlockRowCard
                key={item.id}
                item={item}
                index={index}
                canMoveUp={canMove(plays, index, -1)}
                canMoveDown={canMove(plays, index, 1)}
                locked={locked}
                runBy={runByFor(item)}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onMoveUp={onMoveUp}
                onMoveDown={onMoveDown}
            />
        );
    };

    return (
        <Paper elevation={2} sx={{ p: 2 }}>
            <Stack spacing={2}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" useFlexGap spacing={1}>
                    <Typography variant="h6" component="h2">
                        Plays in Session
                    </Typography>
                    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" justifyContent="flex-end">
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
                        <AddBlockMenu onAdd={onAddBlock} disabled={disabled || locked} />
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
                        {goalieAlerts.unused && goaliesAttending !== null && (
                            <Alert severity="info" sx={{ mt: 1 }}>
                                {goaliesUnusedMessage(goaliesAttending)}
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
                            const only = group.stations[0];
                            if (group.stations.length === 1) {
                                return [isDrillRow(only) ? renderCard(only, undefined, goalieMessage(group)) : renderBlock(only)];
                            }
                            // A station block's stations are drills: a block row never joins one.
                            const stations = drillRows(group.stations);
                            const blockGoalieMessage = goalieMessage(group);
                            const headerId = `station-block-${only.id}`;
                            const head = stations[0];
                            const headIndex = plays.indexOf(head);
                            const grid = group.rotation;
                            // Set to rotate, even when it can't yet: Stays stays visible with the note (spec R3).
                            const rotateOn = head.rotateEveryMinutes != null;
                            const rotation: StationRotationControls = {
                                rotateEveryMinutes: head.rotateEveryMinutes ?? null,
                                rotatingCount: rotatingStations(stations).length,
                                table: grid
                                    ? rotationTable(grid, (row) => (isDrillRow(row) ? row.name || "Drill" : ""), (start) => rotationRoundLabel(start, grid.minutes))
                                    : null,
                                onRotateChange: (on) => onSetRotation(headIndex, on ? defaultRotationMinutes(stations) : null),
                                onMinutesChange: (minutes) => onSetRotation(headIndex, minutes),
                                disabled: locked,
                            };
                            return [
                                <StationBlockHeader
                                    key={`header-${only.id}`}
                                    id={headerId}
                                    label={stationBlockLabel(stations.length, group.wallMinutes)}
                                    warnings={[
                                        ...overlapMessages(group, warnings.overlaps),
                                        ...(blockGoalieMessage ? [blockGoalieMessage] : []),
                                    ]}
                                    rotation={rotation}
                                />,
                                ...stations.map((play, slot) =>
                                    renderCard(
                                        play,
                                        { position: slot + 1, count: stations.length },
                                        null,
                                        rotateOn ? { checked: Boolean(play.stays), onToggle: () => onSetStays(plays.indexOf(play), !play.stays) } : null,
                                    )),
                            ];
                        })}
                    </Stack>
                )}
            </Stack>
        </Paper>
    );
}

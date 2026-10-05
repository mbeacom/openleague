"use client";

/**
 * Session timeline (practice planner 3b, practice timing): one row per block
 * (a standalone drill, a station group, or a warm-up / break / transition /
 * cool-down) with its start clock time, its minutes and its contents, and a
 * "Planned X of Y min" footer. The gap between blocks is folded into the next
 * block's start; it is never a row (spec R9). The screen variant is a compact
 * MUI table whose drill names select the drill. The print variant is a plain
 * table for the bench sheet, styled by app/(print)/print.css.
 */
import { Fragment } from "react";
import { Box, Chip, Link, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import type { BlockKind, SessionStaffMember } from "@/types/practice-planner";
import {
    buildSchedule,
    rotationBlockLabel,
    rotatesEveryLabel,
    rotationTable,
    sessionWallMinutes,
    staysSuffix,
    type RotationGrid,
    type TimelinePlay,
} from "@/lib/utils/session-timeline";
import { blockTitle, drillRows, isBlockRow, rotationColumnName } from "@/lib/utils/session-rows";
import { runBySuffix, staffNames } from "@/lib/utils/session-staff";
import { useClockText } from "@/lib/hooks/useClockText";
import { RotationGridTable } from "./RotationGridTable";

/** A drill row: its name selects it on screen. */
export interface SessionTimelineDrill extends TimelinePlay {
    /** The session-play row id */
    id: string;
    kind?: "drill";
    play: { name: string };
    /** Staff ids running this row (practice staff); names come from the `staff` prop. */
    staff?: readonly string[];
}

/** A block row: its label and note, never a link. */
export interface SessionTimelineBlock extends TimelinePlay {
    id: string;
    kind: BlockKind;
    label: string | null;
    instructions: string | null;
    /** Staff ids running this row (practice staff); names come from the `staff` prop. */
    staff?: readonly string[];
}

export type SessionTimelinePlay = SessionTimelineDrill | SessionTimelineBlock;

export interface SessionTimelineProps<T extends SessionTimelinePlay> {
    plays: readonly T[];
    /** startAt when booked, else date (lib/utils/date `sessionStart`) */
    sessionStart: Date;
    /** The venue's zone; undefined means the viewer's */
    timeZone?: string;
    /** Append the short zone name ("EDT"); true only with a venue zone */
    showZone: boolean;
    /** The session's booked length */
    durationMinutes: number;
    /** Minutes between blocks (0–5), folded into each later block's start */
    transitionMinutes?: number;
    /** The practice's staff: each row shows " · run by …" from it, by key (spec R9, R11). */
    staff?: readonly SessionStaffMember[];
    /** Session-play id of the drill on screen; its block is highlighted */
    activePlayId?: string;
    /** Screen only: called with a session-play id when a drill name is clicked */
    onSelectPlay?: (playId: string) => void;
    variant?: "screen" | "print";
}

/** "Stations · 3": a station group's label in the timeline. */
export function stationsLabel(count: number): string {
    return `Stations · ${count}`;
}

/** "Planned 25 of 60 min", with " (over time!)" when the plan runs past the booking. */
export function plannedLabel(planned: number, booked: number): string {
    return `Planned ${planned} of ${booked} min${planned > booked ? " (over time!)" : ""}`;
}

/** "Warm-up · Easy laps": a block's label, and its note when it has one. */
export function blockLine(row: SessionTimelineBlock): string {
    const note = row.instructions?.trim();
    return `${blockTitle(row.kind, row.label)}${note ? ` · ${note}` : ""}`;
}

/** The grid as a table, each round at its clock time (spec R9). */
function gridTable(grid: RotationGrid<SessionTimelinePlay>, roundStarts: Date[], time: (date: Date) => string) {
    return rotationTable(grid, rotationColumnName, (_, round) => time(roundStarts[round]));
}

function DrillName({ id, name, onSelect }: { id: string; name: string; onSelect?: (id: string) => void }) {
    if (!onSelect) return <>{name}</>;
    return (
        <Link
            component="button"
            type="button"
            variant="body2"
            underline="hover"
            onClick={() => onSelect(id)}
            sx={{ textAlign: "left", fontWeight: 600 }}
        >
            {name}
        </Link>
    );
}

function BlockText({ row }: { row: SessionTimelineBlock }) {
    const note = row.instructions?.trim();
    return (
        <>
            <Typography component="span" variant="body2" sx={{ fontWeight: 600 }}>
                {blockTitle(row.kind, row.label)}
            </Typography>
            {note && (
                <Typography component="span" variant="caption" color="text.secondary">
                    {` · ${note}`}
                </Typography>
            )}
        </>
    );
}

export function SessionTimeline<T extends SessionTimelinePlay>({
    plays,
    sessionStart,
    timeZone,
    showZone,
    durationMinutes,
    transitionMinutes = 0,
    staff,
    activePlayId,
    onSelectPlay,
    variant = "screen",
}: SessionTimelineProps<T>) {
    const clock = useClockText(timeZone, showZone);
    const rows = buildSchedule(plays, sessionStart, transitionMinutes);
    const planned = sessionWallMinutes(plays, transitionMinutes);
    const overTime = planned > durationMinutes;
    const footer = plannedLabel(planned, durationMinutes);
    // " · run by Coach Lee, Sam" after a row or a station (spec R9).
    const runBy = (row: SessionTimelinePlay) => runBySuffix(staffNames(row.staff, staff));
    const runByCaption = (row: SessionTimelinePlay) => {
        const text = runBy(row);
        return text ? (
            <Typography component="span" variant="caption" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>
                {text}
            </Typography>
        ) : null;
    };

    if (variant === "print") {
        return (
            <div className="bench-timeline">
                <table aria-label="Session timeline">
                    <thead>
                        <tr>
                            <th scope="col">Start</th>
                            <th scope="col">Min</th>
                            <th scope="col">Drill</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(({ group, startsAt, roundStarts }) => {
                            // Upcast: narrowing works on the concrete union, not on T.
                            const stations: readonly SessionTimelinePlay[] = group.stations;
                            const grid: RotationGrid<SessionTimelinePlay> | null = group.rotation;
                            const head = stations[0];
                            const drills = drillRows(stations);
                            return (
                                <Fragment key={head.id}>
                                    {/* A rotating block's row stays on the page with its grid (print.css). */}
                                    <tr className={grid ? "bench-keep-with-grid" : undefined}>
                                        <td>{clock.time(startsAt)}</td>
                                        <td>{group.wallMinutes}</td>
                                        <td>
                                            {isBlockRow(head) ? (
                                                `${blockLine(head)}${runBy(head)}`
                                            ) : drills.length > 1 ? (
                                                <>
                                                    <strong>{grid ? rotationBlockLabel(grid.minutes, group.wallMinutes) : stationsLabel(drills.length)}</strong>
                                                    <ul>
                                                        {drills.map((sp) => (
                                                            <li key={sp.id}>{`${sp.play.name}${grid ? staysSuffix(sp.stays) : ` · ${sp.duration} min`}${runBy(sp)}`}</li>
                                                        ))}
                                                    </ul>
                                                </>
                                            ) : (
                                                `${drills[0].play.name}${runBy(drills[0])}`
                                            )}
                                        </td>
                                    </tr>
                                    {grid && (
                                        <tr>
                                            <td colSpan={3}>
                                                <RotationGridTable
                                                    variant="print"
                                                    table={gridTable(grid, roundStarts, (date) => clock.time(date))}
                                                    caption={`Rotation grid: ${rotationBlockLabel(grid.minutes, group.wallMinutes)}`}
                                                />
                                            </td>
                                        </tr>
                                    )}
                                </Fragment>
                            );
                        })}
                    </tbody>
                </table>
                <p className={overTime ? "bench-over-time" : undefined}>{footer}</p>
            </div>
        );
    }

    return (
        <Stack spacing={1}>
            <Table size="small" aria-label="Session timeline">
                <TableHead>
                    <TableRow>
                        <TableCell sx={{ width: 120 }}>Start</TableCell>
                        <TableCell sx={{ width: 56 }} align="right">
                            Min
                        </TableCell>
                        <TableCell>Drill</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {rows.map(({ group, startsAt, roundStarts }) => {
                        const stations: readonly SessionTimelinePlay[] = group.stations;
                        const grid: RotationGrid<SessionTimelinePlay> | null = group.rotation;
                        const head = stations[0];
                        const drills = drillRows(stations);
                        return (
                            <Fragment key={head.id}>
                                <TableRow selected={stations.some((sp) => sp.id === activePlayId)}>
                                    <TableCell sx={{ whiteSpace: "nowrap", fontFamily: "var(--font-mono), monospace" }}>
                                        {clock.time(startsAt)}
                                    </TableCell>
                                    <TableCell align="right">{group.wallMinutes}</TableCell>
                                    <TableCell>
                                        {isBlockRow(head) ? (
                                            <>
                                                <BlockText row={head} />
                                                {runByCaption(head)}
                                            </>
                                        ) : drills.length > 1 ? (
                                            <>
                                                {/* A div, not a p: the chip is a div (invalid inside a p). */}
                                                <Typography
                                                    variant="caption"
                                                    component="div"
                                                    sx={{
                                                        fontWeight: 800,
                                                        color: "primary.main",
                                                        textTransform: "uppercase",
                                                        letterSpacing: 1,
                                                        display: "flex",
                                                        alignItems: "center",
                                                        flexWrap: "wrap",
                                                        gap: 1,
                                                    }}
                                                >
                                                    {stationsLabel(drills.length)}
                                                    {grid && (
                                                        // The caption is upper case; the chip keeps its own case.
                                                        <Chip
                                                            size="small"
                                                            variant="outlined"
                                                            color="secondary"
                                                            label={rotatesEveryLabel(grid.minutes)}
                                                            sx={{ textTransform: "none", letterSpacing: "normal" }}
                                                        />
                                                    )}
                                                </Typography>
                                                <Box component="ul" sx={{ m: 0, pl: 2 }}>
                                                    {drills.map((sp) => (
                                                        <li key={sp.id}>
                                                            <DrillName id={sp.id} name={sp.play.name} onSelect={onSelectPlay} />
                                                            <Typography component="span" variant="caption" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>
                                                                {`${grid ? staysSuffix(sp.stays) : ` · ${sp.duration} min`}${runBy(sp)}`}
                                                            </Typography>
                                                        </li>
                                                    ))}
                                                </Box>
                                            </>
                                        ) : (
                                            <>
                                                <DrillName id={head.id} name={drills[0].play.name} onSelect={onSelectPlay} />
                                                {runByCaption(drills[0])}
                                            </>
                                        )}
                                    </TableCell>
                                </TableRow>
                                {grid && (
                                    <TableRow>
                                        <TableCell colSpan={3} sx={{ pt: 0 }}>
                                            <RotationGridTable
                                                table={gridTable(grid, roundStarts, (date) => clock.time(date))}
                                                caption={`Rotation grid: ${rotationBlockLabel(grid.minutes, group.wallMinutes)}`}
                                            />
                                        </TableCell>
                                    </TableRow>
                                )}
                            </Fragment>
                        );
                    })}
                </TableBody>
            </Table>
            <Typography
                variant="caption"
                color={overTime ? "error.main" : "text.secondary"}
                fontWeight={overTime ? 700 : 400}
                sx={{ alignSelf: "flex-end" }}
            >
                {footer}
            </Typography>
        </Stack>
    );
}

"use client";

/**
 * Session timeline (practice planner 3b): one row per block (a standalone
 * drill or a station group) with its start clock time, its minutes and its
 * drills, and a "Planned X of Y min" footer. The screen variant is a compact
 * MUI table whose drill names select the drill. The print variant is a plain
 * table for the bench sheet, styled by app/(print)/print.css.
 */
import { Box, Link, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { buildSchedule, sessionWallMinutes, type TimelinePlay } from "@/lib/utils/session-timeline";
import { useClockText } from "@/lib/hooks/useClockText";

export interface SessionTimelinePlay extends TimelinePlay {
    /** The session-play row id */
    id: string;
    play: { name: string };
}

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

export function SessionTimeline<T extends SessionTimelinePlay>({
    plays,
    sessionStart,
    timeZone,
    showZone,
    durationMinutes,
    activePlayId,
    onSelectPlay,
    variant = "screen",
}: SessionTimelineProps<T>) {
    const clock = useClockText(timeZone, showZone);
    const rows = buildSchedule(plays, sessionStart);
    const planned = sessionWallMinutes(plays);
    const overTime = planned > durationMinutes;
    const footer = plannedLabel(planned, durationMinutes);

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
                        {rows.map(({ group, startsAt }) => (
                            <tr key={group.stations[0].id}>
                                <td>{clock.time(startsAt)}</td>
                                <td>{group.wallMinutes}</td>
                                <td>
                                    {group.stations.length > 1 ? (
                                        <>
                                            <strong>{stationsLabel(group.stations.length)}</strong>
                                            <ul>
                                                {group.stations.map((sp) => (
                                                    <li key={sp.id}>{`${sp.play.name} · ${sp.duration} min`}</li>
                                                ))}
                                            </ul>
                                        </>
                                    ) : (
                                        group.stations[0].play.name
                                    )}
                                </td>
                            </tr>
                        ))}
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
                    {rows.map(({ group, startsAt }) => {
                        const grouped = group.stations.length > 1;
                        return (
                            <TableRow key={group.stations[0].id} selected={group.stations.some((sp) => sp.id === activePlayId)}>
                                <TableCell sx={{ whiteSpace: "nowrap", fontFamily: "var(--font-mono), monospace" }}>
                                    {clock.time(startsAt)}
                                </TableCell>
                                <TableCell align="right">{group.wallMinutes}</TableCell>
                                <TableCell>
                                    {grouped ? (
                                        <>
                                            <Typography
                                                variant="caption"
                                                component="p"
                                                sx={{ fontWeight: 800, color: "primary.main", textTransform: "uppercase", letterSpacing: 1 }}
                                            >
                                                {stationsLabel(group.stations.length)}
                                            </Typography>
                                            <Box component="ul" sx={{ m: 0, pl: 2 }}>
                                                {group.stations.map((sp) => (
                                                    <li key={sp.id}>
                                                        <DrillName id={sp.id} name={sp.play.name} onSelect={onSelectPlay} />
                                                        <Typography component="span" variant="caption" color="text.secondary">
                                                            {` · ${sp.duration} min`}
                                                        </Typography>
                                                    </li>
                                                ))}
                                            </Box>
                                        </>
                                    ) : (
                                        <DrillName id={group.stations[0].id} name={group.stations[0].play.name} onSelect={onSelectPlay} />
                                    )}
                                </TableCell>
                            </TableRow>
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

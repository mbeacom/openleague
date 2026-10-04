/**
 * The bench sheet as plain data (sub-project 4): what the HTML and Word
 * exports print, computed once. It follows BenchSheet exactly: buildSchedule
 * order, the session's zone rule (venue zone with its short name when booked,
 * else the viewer's), printPixelRatio for diagrams, one combined legend.
 * Images come from injected renderers, so this module never touches a canvas.
 */
import type { PlayData, PlayFocus, PlayGoalies } from "@/types/practice-planner";
import { buildLegend, type LegendEntry } from "@/lib/utils/canvas/legend";
import { combinedLegendData } from "@/lib/utils/canvas/station-map";
import { buildSchedule, sessionWallMinutes } from "@/lib/utils/session-timeline";
import { formatClockTime, formatLongDate, sessionStart, sessionTimeZone } from "@/lib/utils/date";
import { plannedLabel, stationsLabel } from "../SessionTimeline";
import { drillText, stationTag } from "../print/BenchSheetDrill";
import { printPixelRatio } from "../print/PrintDiagram";

export interface ExportSessionPlay {
    sequence: number;
    duration: number;
    instructions: string | null;
    runsWithPrevious: boolean;
    play: { name: string; description: string | null; playData: PlayData | null; focus?: PlayFocus; goalies?: PlayGoalies };
}

/** What the session page hands the Export menu (a PracticeSessionView fits). */
export interface ExportSession {
    title: string;
    date: string;
    duration: number;
    startAt?: string | null;
    venueTimezone?: string | null;
    teamName?: string | null;
    venueName?: string | null;
    surfaceName?: string | null;
    segmentName?: string | null;
    goaliesAttending?: number | null;
    plays: ExportSessionPlay[];
}

export interface BenchSheetTimelineRow {
    start: string;
    minutes: number;
    /** The drill's name, or "Stations · N" for a station block */
    label: string;
    /** "Name · N min" per station, or null for a lone drill */
    stations: string[] | null;
}

export interface BenchSheetDrillItem {
    /** 1-based, in schedule order */
    number: number;
    name: string;
    /** The block's start, formatted */
    start: string;
    minutes: number;
    /** "Station 1 of 2", or null */
    station: string | null;
    /** A PNG data URI, or null when unreadable or not drawable */
    diagram: string | null;
    /** Instructions, else description, else null */
    text: string | null;
}

export interface BenchSheetModel {
    title: string;
    /** null: omitted */
    teamName: string | null;
    /** "Tuesday, April 7, 2026 · 6:00 PM – 7:00 PM MDT" */
    when: string;
    /** "Venue · Surface · Segment", or null when unbooked */
    place: string | null;
    timeline: BenchSheetTimelineRow[];
    planned: string;
    overTime: boolean;
    legend: Array<{ label: string; image: string | null }>;
    drills: BenchSheetDrillItem[];
}

export interface BenchSheetRenderers {
    /** A 720×306 diagram as a PNG data URI at this backing scale, or null when it can't be drawn */
    diagram(playData: PlayData, pixelRatio: number): string | null;
    /** One legend symbol as a PNG data URI, or null */
    swatch(entry: LegendEntry): string | null;
}

const MS_PER_MINUTE = 60_000;

export function buildBenchSheetModel(
    session: ExportSession,
    renderers: BenchSheetRenderers,
    options: { omitTeam?: boolean } = {},
): BenchSheetModel {
    const start = sessionStart(session);
    const end = new Date(start.getTime() + session.duration * MS_PER_MINUTE);
    const { timeZone, showZone } = sessionTimeZone(session);
    const time = (date: Date, withZone = showZone) => formatClockTime(date, timeZone, withZone);

    const rows = buildSchedule(session.plays, start);
    const ordered = rows.flatMap((row) =>
        row.group.stations.map((sp, k) => ({
            sp,
            startsAt: row.startsAt,
            station: row.group.stations.length > 1 ? stationTag(k + 1, row.group.stations.length) : null,
        })),
    );
    const pixelRatio = printPixelRatio(ordered.filter(({ sp }) => sp.play.playData !== null).length);
    const legendData = combinedLegendData(session.plays.map((sp) => ({ name: sp.play.name, playData: sp.play.playData })));
    const planned = sessionWallMinutes(session.plays);
    const team = session.teamName?.trim();

    return {
        title: session.title,
        teamName: options.omitTeam || !team ? null : team,
        when: `${formatLongDate(start, timeZone)} · ${time(start, false)} – ${time(end)}`,
        place: [session.venueName, session.surfaceName, session.segmentName].filter(Boolean).join(" · ") || null,
        timeline: rows.map(({ group, startsAt }) => {
            const block = group.stations.length > 1;
            return {
                start: time(startsAt),
                minutes: group.wallMinutes,
                label: block ? stationsLabel(group.stations.length) : group.stations[0].play.name,
                stations: block ? group.stations.map((sp) => `${sp.play.name} · ${sp.duration} min`) : null,
            };
        }),
        planned: plannedLabel(planned, session.duration),
        overTime: planned > session.duration,
        legend: legendData ? buildLegend(legendData).map((entry) => ({ label: entry.label, image: renderers.swatch(entry) })) : [],
        drills: ordered.map(({ sp, startsAt, station }, index) => ({
            number: index + 1,
            name: sp.play.name,
            start: time(startsAt),
            minutes: sp.duration,
            station,
            diagram: sp.play.playData ? renderers.diagram(sp.play.playData, pixelRatio) : null,
            text: drillText(sp.instructions, sp.play.description),
        })),
    };
}

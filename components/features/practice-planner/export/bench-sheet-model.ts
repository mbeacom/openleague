/**
 * The bench sheet as plain data (sub-project 4): what the HTML and Word
 * exports print, computed once. It follows BenchSheet exactly: buildSchedule
 * order, the session's zone rule (venue zone with its short name when booked,
 * else the viewer's), printPixelRatio for diagrams, one combined legend.
 * Images come from injected renderers, so this module never touches a canvas.
 */
import type { BlockKind, EquipmentCountItem, LogoImage, PlayData, PlayFocus, PlayGoalies, SessionStaffMember, TeamMark } from "@/types/practice-planner";
import type { AgeGroup } from "@/lib/utils/age-groups";
import { resolveCrestColor } from "@/lib/utils/crest";
import { EXPORT_MARK_HEIGHT, exportMarkSize, isLogoImage, teamLogoAlt } from "@/lib/utils/team-mark";
import { buildLegend, type LegendEntry } from "@/lib/utils/canvas/legend";
import { combinedLegendData } from "@/lib/utils/canvas/station-map";
import {
    betweenBlocksLabel,
    buildSchedule,
    rotationBlockLabel,
    rotationTable,
    sessionWallMinutes,
    staysSuffix,
    type RotationGrid,
    type RotationTable,
} from "@/lib/utils/session-timeline";
import { sessionForDisplay } from "@/lib/utils/drill-tags";
import { blockTitle, drillRows, isBlockRow, rotationColumnName } from "@/lib/utils/session-rows";
import { formatClockTime, formatLongDate, sessionStart, sessionTimeZone } from "@/lib/utils/date";
import { plannedLabel, stationsLabel } from "../SessionTimeline";
import { drillText, stationTag } from "../print/BenchSheetDrill";
import { printPixelRatio } from "../print/PrintDiagram";
import { runBySuffix, runByText, staffHeaderLabel, staffNames } from "@/lib/utils/session-staff";
import { drillEquipment, drillEquipmentText, equipmentLabel } from "@/lib/utils/equipment-needs";
import { rollupEquipment } from "@/lib/utils/practice-equipment";

export interface ExportSessionPlay {
    kind?: "drill";
    sequence: number;
    duration: number;
    instructions: string | null;
    runsWithPrevious: boolean;
    stays?: boolean;
    rotateEveryMinutes?: number | null;
    /** Staff ids running this row; names come from ExportSession.staff. */
    staff?: string[];
    play: { name: string; description: string | null; playData: PlayData | null; focus?: PlayFocus; goalies?: PlayGoalies; ageGroups?: readonly AgeGroup[] };
}

/** A warm-up, break, transition or cool-down: a timeline row with no drill. */
export interface ExportSessionBlock {
    kind: BlockKind;
    sequence: number;
    duration: number;
    /** The block's note */
    instructions: string | null;
    runsWithPrevious: boolean;
    label: string | null;
    /** Staff ids running this row; names come from ExportSession.staff. */
    staff?: string[];
}

export type ExportSessionRow = ExportSessionPlay | ExportSessionBlock;

/** What the session page hands the Export menu (a PracticeSessionView fits). */
export interface ExportSession {
    title: string;
    /** The practice's id: the hosted logo read takes it. */
    id?: string;
    date: string;
    duration: number;
    startAt?: string | null;
    venueTimezone?: string | null;
    teamName?: string | null;
    /** The team's mark (practice logo spec R5); absent or null: none. */
    teamMark?: TeamMark | null;
    venueName?: string | null;
    surfaceName?: string | null;
    segmentName?: string | null;
    goaliesAttending?: number | null;
    /** Minutes between blocks; absent reads as 0 */
    transitionMinutes?: number;
    /** The practice's staff, in list order; absent reads as none. */
    staff?: SessionStaffMember[];
    /** The practice's own equipment; absent reads as none. */
    equipment?: EquipmentCountItem[];
    plays: ExportSessionRow[];
}

export type BenchSheetTimelineRow =
    | {
          kind?: "drill";
          start: string;
          minutes: number;
          /** The drill's name, or "Stations · N" for a station block */
          label: string;
          /** "Name · N min" per station, or null for a lone drill */
          stations: string[] | null;
          /** "run by Coach Lee, Sam" for a lone drill or a block; absent when nobody runs it (a station's names are in its line) */
          runBy?: string;
      }
    | {
          kind: "block";
          start: string;
          minutes: number;
          /** The block's label, else its kind's default */
          label: string;
          note: string | null;
          stations: null;
          /** "run by Coach Lee, Sam" for a lone drill or a block; absent when nobody runs it (a station's names are in its line) */
          runBy?: string;
      }
    | {
          kind: "rotation";
          start: string;
          minutes: number;
          /** "Stations · rotate every 5 min · 15 min" */
          label: string;
          /** "Name", or "Name · stays" for a station that doesn't rotate */
          stations: string[];
          /** A Start column (each round's clock time) plus one column per station */
          grid: RotationTable;
      };

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
    /** "Equipment: Cones ×6 · Net ×1", or null when the drill needs none */
    equipment: string | null;
}

/** The team's mark in an export header: a PNG data URI at its drawn size. */
export interface BenchSheetMark {
    image: string;
    width: number;
    height: number;
    /** "<team> logo", unescaped */
    alt: string;
}

export interface BenchSheetModel {
    title: string;
    /** null: omitted */
    teamName: string | null;
    /** The logo, else the Crest, beside the title; null: none */
    mark: BenchSheetMark | null;
    /** "Tuesday, April 7, 2026 · 6:00 PM – 7:00 PM MDT" */
    when: string;
    /** "Venue · Surface · Segment", or null when unbooked */
    place: string | null;
    /** "2 min between blocks", or null when there is no gap */
    gap: string | null;
    /** "Staff: Coach Lee, Sam, Alex", or null when the practice lists none */
    staff: string | null;
    timeline: BenchSheetTimelineRow[];
    /** The practice's equipment, one "Cones ×12" per item (practice equipment spec R5); empty: omitted */
    equipment: string[];
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
    /** The team's Crest (initials on `color`) as a PNG data URI for a 48 px mark, or null */
    crest(name: string, color: string): string | null;
}

const MS_PER_MINUTE = 60_000;

export function buildBenchSheetModel(
    stored: ExportSession,
    renderers: BenchSheetRenderers,
    options: { logo?: LogoImage | null } = {},
): BenchSheetModel {
    // Goalie markers hidden at render time only (spec R7). The plan JSON export never calls this.
    const session = sessionForDisplay(stored);
    const start = sessionStart(session);
    const end = new Date(start.getTime() + session.duration * MS_PER_MINUTE);
    const { timeZone, showZone } = sessionTimeZone(session);
    const time = (date: Date, withZone = showZone) => formatClockTime(date, timeZone, withZone);

    const gap = session.transitionMinutes ?? 0;
    const rows = buildSchedule(session.plays, start, gap);
    const ordered = rows.flatMap((row) => {
        const stations = drillRows(row.group.stations);
        return stations.map((sp, k) => ({
            sp,
            startsAt: row.startsAt,
            station: stations.length > 1 ? stationTag(k + 1, stations.length) : null,
        }));
    });
    const pixelRatio = printPixelRatio(ordered.filter(({ sp }) => sp.play.playData !== null).length);
    const legendData = combinedLegendData(drillRows(session.plays).map((sp) => ({ name: sp.play.name, playData: sp.play.playData })));
    const planned = sessionWallMinutes(session.plays, gap);
    const team = session.teamName?.trim();
    // Names from the practice's list by key (spec R9, R11); a row only says runBy when someone runs it.
    const names = (row: ExportSessionRow) => staffNames(row.staff, session.staff);
    const runBy = (row: ExportSessionRow): { runBy?: string } => {
        const text = runByText(names(row));
        return text ? { runBy: text } : {};
    };

    return {
        title: session.title,
        teamName: team || null,
        mark: benchSheetMark(session, team, options.logo ?? null, renderers),
        when: `${formatLongDate(start, timeZone)} · ${time(start, false)} – ${time(end)}`,
        place: [session.venueName, session.surfaceName, session.segmentName].filter(Boolean).join(" · ") || null,
        gap: gap > 0 ? betweenBlocksLabel(gap) : null,
        staff: staffHeaderLabel(session.staff),
        timeline: rows.map(({ group, startsAt, roundStarts }): BenchSheetTimelineRow => {
            const head = group.stations[0];
            if (isBlockRow(head)) {
                return { kind: "block", start: time(startsAt), minutes: group.wallMinutes, label: blockTitle(head.kind, head.label), note: head.instructions?.trim() || null, stations: null, ...runBy(head) };
            }
            const stations = drillRows(group.stations);
            const grid: RotationGrid<ExportSessionRow> | null = group.rotation;
            if (grid) {
                return {
                    kind: "rotation",
                    start: time(startsAt),
                    minutes: group.wallMinutes,
                    label: rotationBlockLabel(grid.minutes, group.wallMinutes),
                    stations: stations.map((sp) => `${sp.play.name}${staysSuffix(sp.stays)}${runBySuffix(names(sp))}`),
                    grid: rotationTable(grid, rotationColumnName, (_, round) => time(roundStarts[round])),
                };
            }
            const block = stations.length > 1;
            return {
                start: time(startsAt),
                minutes: group.wallMinutes,
                label: block ? stationsLabel(stations.length) : stations[0].play.name,
                stations: block ? stations.map((sp) => `${sp.play.name} · ${sp.duration} min${runBySuffix(names(sp))}`) : null,
                ...(block ? {} : runBy(stations[0])),
            };
        }),
        equipment: benchSheetEquipment(session),
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
            equipment: drillEquipmentText(drillEquipment(sp.play.playData)),
        })),
    };
}

/** The practice's equipment as the bench sheet lists it (practice equipment spec R4, R5). */
export function benchSheetEquipment(session: Pick<ExportSession, "plays" | "equipment">): string[] {
    return rollupEquipment(session.plays, (row) => (isBlockRow(row) ? null : { name: row.play.name, playData: row.play.playData }), session.equipment)
        .map((item) => equipmentLabel(item, item.count));
}

/** The logo when it is a valid normalized PNG, else the Crest; none without a team (spec R3, R5). */
function benchSheetMark(session: ExportSession, team: string | undefined, logo: LogoImage | null, renderers: BenchSheetRenderers): BenchSheetMark | null {
    const mark = session.teamMark;
    if (!mark || !team) return null;
    const alt = teamLogoAlt(mark.name || team);
    if (logo && isLogoImage(logo)) return { image: logo.dataUrl, ...exportMarkSize(logo), alt };
    const crest = renderers.crest(mark.name || team, resolveCrestColor(mark.id, mark.color));
    return crest ? { image: crest, width: EXPORT_MARK_HEIGHT, height: EXPORT_MARK_HEIGHT, alt } : null;
}

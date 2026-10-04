/**
 * Practice-session timeline (practice planner 2b): station groups, wall time,
 * the server's group check, and the editor's reorder / toggle / remove rules.
 * Pure, so the session editor, the session actions, the detail view and 3b's
 * timeline all share it.
 *
 * A drill with `runsWithPrevious` runs at the same time as the drill before it
 * (by sequence). Consecutive flagged drills form one group with the nearest
 * preceding unflagged drill. A group lasts as long as its longest drill.
 *
 * `groupStations`, `sessionWallMinutes` and `stationGroupError` order by
 * `sequence`, because a payload's array order is not trusted. The list helpers
 * (`normalizeGroups`, `toggleRunsWithPrevious`, `moveItem`, `removeItem`) work
 * on array order, which the editor keeps equal to sequence order: every edit
 * ends in `normalizeGroups`.
 */

import type { SegmentKind } from "@/types/segments";
import type { IceArea, PlayData, PlayFocus, PlayGoalies } from "@/types/practice-planner";
import { goalieDemand, toPlayGoalies } from "@/lib/utils/drill-tags";
import { areaRect, isFullIce } from "@/lib/utils/ice-area";
import { BLUE_LINES, RINK_DIMENSIONS } from "@/lib/utils/canvas/rink-renderer";

/** The most drills one station group may hold. */
export const MAX_STATIONS_PER_GROUP = 4;

export const FIRST_DRILL_STATION_ERROR = "The first drill can't run as a station with a previous drill";
export const STATION_GROUP_CAP_ERROR = `A station block can hold at most ${MAX_STATIONS_PER_GROUP} drills`;

export interface TimelinePlay {
    sequence: number;
    duration: number;
    runsWithPrevious: boolean;
}

export interface StationGroup<T extends TimelinePlay> {
    /** 0-based block index */
    index: number;
    /** Offset from the session start, in minutes */
    startMinute: number;
    /** The group's longest drill, in minutes */
    wallMinutes: number;
    /** At least one drill, in sequence order (the caller's objects); more than one is a station block */
    stations: T[];
}

/** Header of a station block: "Stations · 3 · 15 min". */
export function stationBlockLabel(count: number, minutes: number): string {
    return `Stations · ${count} · ${minutes} min`;
}

function bySequence<T extends TimelinePlay>(plays: readonly T[]): T[] {
    return [...plays].sort((a, b) => a.sequence - b.sequence);
}

/**
 * Groups drills by sequence. A flagged first drill (bad stored data) starts a
 * group rather than being dropped; `stationGroupError` rejects it on save.
 */
export function groupStations<T extends TimelinePlay>(plays: readonly T[]): StationGroup<T>[] {
    const groups: StationGroup<T>[] = [];
    for (const play of bySequence(plays)) {
        const current = groups[groups.length - 1];
        if (current && play.runsWithPrevious) {
            current.stations.push(play);
            current.wallMinutes = Math.max(current.wallMinutes, play.duration);
        } else {
            const startMinute = current ? current.startMinute + current.wallMinutes : 0;
            groups.push({ index: groups.length, startMinute, wallMinutes: play.duration, stations: [play] });
        }
    }
    return groups;
}

/** The session's planned length: each group counts once, for its longest drill. */
export function sessionWallMinutes(plays: readonly TimelinePlay[]): number {
    return groupStations(plays).reduce((total, group) => total + group.wallMinutes, 0);
}

const MS_PER_MINUTE = 60_000;

export interface ScheduleRow<T extends TimelinePlay> {
    group: StationGroup<T>;
    /** sessionStart + group.startMinute */
    startsAt: Date;
    /** startsAt + group.wallMinutes */
    endsAt: Date;
}

/**
 * Each block's start and end instant (3b). Instants only: formatting, and so
 * the timezone, belong to the caller (lib/utils/date.ts), which keeps this
 * module zone-free.
 */
export function buildSchedule<T extends TimelinePlay>(plays: readonly T[], sessionStart: Date): ScheduleRow<T>[] {
    const base = sessionStart.getTime();
    return groupStations(plays).map((group) => {
        const startsAt = new Date(base + group.startMinute * MS_PER_MINUTE);
        return { group, startsAt, endsAt: new Date(startsAt.getTime() + group.wallMinutes * MS_PER_MINUTE) };
    });
}

/** The server's group check: the first drill runs on its own, and no group passes the cap. */
export function stationGroupError(plays: readonly TimelinePlay[]): string | null {
    const groups = groupStations(plays);
    if (groups[0]?.stations[0].runsWithPrevious) return FIRST_DRILL_STATION_ERROR;
    return groups.some((group) => group.stations.length > MAX_STATIONS_PER_GROUP)
        ? STATION_GROUP_CAP_ERROR
        : null;
}

/** Sequence = position, and the first drill never runs with a previous one. Unchanged drills keep their object. */
export function normalizeGroups<T extends TimelinePlay>(plays: readonly T[]): T[] {
    return plays.map((play, index) => {
        const runsWithPrevious = index === 0 ? false : play.runsWithPrevious;
        return play.sequence === index && play.runsWithPrevious === runsWithPrevious
            ? play
            : { ...play, sequence: index, runsWithPrevious };
    });
}

/**
 * The half-open range [start, end) of the block holding `index`, by array
 * position. Throws a RangeError for an index that isn't a position in `plays`:
 * every caller here bounds-checks first, so one only reaches it by misuse.
 */
export function groupRange(plays: readonly TimelinePlay[], index: number): { start: number; end: number } {
    if (!Number.isInteger(index) || index < 0 || index >= plays.length) {
        throw new RangeError(`groupRange: index ${index} is out of range for ${plays.length} drill(s)`);
    }
    let start = index;
    while (start > 0 && plays[start].runsWithPrevious) start--;
    let end = index + 1;
    while (end < plays.length && plays[end].runsWithPrevious) end++;
    return { start, end };
}

/**
 * Whether the drill at `index` may flip its flag. Turning it off is always
 * allowed. Turning it on merges its block into the block before it, so the
 * two together must fit the cap.
 */
export function canToggleRunsWithPrevious(plays: readonly TimelinePlay[], index: number): boolean {
    if (index <= 0 || index >= plays.length) return false;
    if (plays[index].runsWithPrevious) return true;
    const before = groupRange(plays, index - 1);
    const after = groupRange(plays, index);
    return before.end - before.start + (after.end - after.start) <= MAX_STATIONS_PER_GROUP;
}

/** Flips the drill's flag; returns `plays` itself when that isn't allowed. */
export function toggleRunsWithPrevious<T extends TimelinePlay>(plays: T[], index: number): T[] {
    if (!canToggleRunsWithPrevious(plays, index)) return plays;
    return normalizeGroups(
        plays.map((play, i) => (i === index ? { ...play, runsWithPrevious: !play.runsWithPrevious } : play)),
    );
}

/**
 * Moves the drill at `index` one step. Returns `plays` itself when nothing moves.
 * - A block's first drill, or a standalone drill, moves as a unit and hops
 *   over the neighboring unit (a standalone drill or a whole block).
 * - Any other station reorders inside its block. Moving the second station
 *   up makes it the block's first drill. The last station can't move down.
 */
export function moveItem<T extends TimelinePlay>(plays: T[], index: number, dir: -1 | 1): T[] {
    if (index < 0 || index >= plays.length) return plays;
    const group = groupRange(plays, index);

    if (index !== group.start) {
        const target = index + dir;
        if (target < group.start || target >= group.end) return plays;
        const next = [...plays];
        [next[index], next[target]] = [next[target], next[index]];
        // Flags are positional inside a block: its first drill runs on its own.
        for (let i = group.start; i < group.end; i++) {
            const runsWithPrevious = i !== group.start;
            if (next[i].runsWithPrevious !== runsWithPrevious) next[i] = { ...next[i], runsWithPrevious };
        }
        return normalizeGroups(next);
    }

    if (dir === -1 ? group.start === 0 : group.end === plays.length) return plays;
    const neighbor = groupRange(plays, dir === -1 ? group.start - 1 : group.end);
    const [first, second] = dir === -1 ? [neighbor, group] : [group, neighbor];
    return normalizeGroups([
        ...plays.slice(0, first.start),
        ...plays.slice(second.start, second.end),
        ...plays.slice(first.start, first.end),
        ...plays.slice(second.end),
    ]);
}

/** Whether `moveItem` would change the order. */
export function canMove(plays: TimelinePlay[], index: number, dir: -1 | 1): boolean {
    return moveItem(plays, index, dir) !== plays;
}

/**
 * Removes the drill at `index`. Removing a block's first drill makes the next
 * station the head of what is left, so it never joins the block before it.
 */
export function removeItem<T extends TimelinePlay>(plays: T[], index: number): T[] {
    if (index < 0 || index >= plays.length) return plays;
    const removedHead = index === 0 || !plays[index].runsWithPrevious;
    const next = plays.filter((_, i) => i !== index);
    const follower = next[index];
    if (removedHead && follower?.runsWithPrevious) next[index] = { ...follower, runsWithPrevious: false };
    return normalizeGroups(next);
}

// ---------------------------------------------------------------------------
// Advisory warnings (client-only; they never block a save)
// ---------------------------------------------------------------------------

/** Areas that share an edge, or overlap by at most this much, don't count as overlapping. */
export const STATION_OVERLAP_TOLERANCE_FT = 1;

/** A drill's ice area for the warnings. null = the drill couldn't be read, so it is never flagged. */
export interface StationArea {
    area?: IceArea | null;
}

/** How much ice a drill needs, judged by its area's width against the rink's halves and zones. */
export type DrillFootprint = "full" | "half" | "zone";

export function drillFootprint(area?: IceArea): DrillFootprint {
    if (isFullIce(area)) return "full";
    const { w } = areaRect(area);
    if (w > RINK_DIMENSIONS.width / 2) return "full";
    if (w > BLUE_LINES.left) return "half";
    return "zone";
}

const TOO_BIG_FOR: Record<SegmentKind, readonly DrillFootprint[]> = {
    HALF: ["full"],
    CROSS: ["full", "half"],
    CUSTOM: [],
};

/** How the fit warning names a booked segment kind. */
export const SEGMENT_KIND_FIT_LABELS: Record<SegmentKind, string> = {
    HALF: "half ice",
    CROSS: "cross ice",
    CUSTOM: "ice segment",
};

function areasOverlap(a: IceArea | undefined, b: IceArea | undefined): boolean {
    const r = areaRect(a);
    const s = areaRect(b);
    const width = Math.min(r.x + r.w, s.x + s.w) - Math.max(r.x, s.x);
    const height = Math.min(r.y + r.h, s.y + s.h) - Math.max(r.y, s.y);
    return width > STATION_OVERLAP_TOLERANCE_FT && height > STATION_OVERLAP_TOLERANCE_FT;
}

/**
 * Overlapping stations within each block ([groupIndex, sequenceA, sequenceB])
 * and drills larger than the booked segment's kind (sequences). A whole-
 * surface or unbooked session (`null`) and a CUSTOM segment flag nothing for
 * size; HALF flags full-ice drills; CROSS flags full- and half-ice drills.
 */
export function stationWarnings(
    groups: StationGroup<TimelinePlay & StationArea>[],
    bookedSegmentKind: SegmentKind | null,
): { overlaps: Array<[number, number, number]>; tooBig: number[] } {
    const overlaps: Array<[number, number, number]> = [];
    const tooBig: number[] = [];
    const tooBigFootprints: readonly DrillFootprint[] = bookedSegmentKind ? TOO_BIG_FOR[bookedSegmentKind] : [];
    for (const group of groups) {
        const readable = group.stations.filter((station) => station.area !== null);
        readable.forEach((station, i) => {
            const area = station.area ?? undefined;
            if (tooBigFootprints.includes(drillFootprint(area))) tooBig.push(station.sequence);
            for (const other of readable.slice(i + 1)) {
                if (areasOverlap(area, other.area ?? undefined)) {
                    overlaps.push([group.index, station.sequence, other.sequence]);
                }
            }
        });
    }
    return { overlaps, tooBig };
}

// ---------------------------------------------------------------------------
// Goalie warnings (advisory, never block a save)
// ---------------------------------------------------------------------------

/** What the goalie warnings read from a drill. playData null = unreadable (needs one goalie if required). */
export interface GoalieNeeds {
    focus?: PlayFocus;
    goalies?: PlayGoalies;
    playData: PlayData | null;
}

export interface GoalieShortfall {
    /** The block (StationGroup.index) that needs more goalies than attend. */
    groupIndex: number;
    /** Sequences of the drills in that block that need a goalie. */
    sequences: number[];
    needed: number;
}

export interface GoalieWarnings {
    short: GoalieShortfall[];
    /** Goalies attend, but no drill uses one (every drill is tagged "none" and needs none). */
    unused: boolean;
}

/**
 * Blocks needing more goalies than attend. Stations in a block run at once,
 * so their demand adds up (goalieDemand per drill). A null count (not set)
 * warns about nothing.
 */
export function goalieWarnings(
    groups: StationGroup<TimelinePlay & GoalieNeeds>[],
    goaliesAttending: number | null | undefined,
): GoalieWarnings {
    if (goaliesAttending === null || goaliesAttending === undefined) return { short: [], unused: false };
    const short: GoalieShortfall[] = [];
    let drills = 0;
    let anyUsesGoalie = false;
    for (const group of groups) {
        let needed = 0;
        const sequences: number[] = [];
        for (const station of group.stations) {
            drills++;
            const demand = goalieDemand(station);
            // A goalie-focus drill uses a goalie even when tagged "none".
            if (toPlayGoalies(station.goalies) !== "none" || demand > 0) anyUsesGoalie = true;
            if (demand > 0) {
                needed += demand;
                sequences.push(station.sequence);
            }
        }
        if (needed > goaliesAttending) short.push({ groupIndex: group.index, sequences, needed });
    }
    return { short, unused: goaliesAttending > 0 && drills > 0 && !anyUsesGoalie };
}

/** "Needs a goalie — none attending" (a drill) or "These stations need 3 goalies — 2 attending" (a block). */
export function goalieShortMessage(needed: number, attending: number, stations: boolean): string {
    const have = attending === 0 ? "none attending" : `${attending} attending`;
    if (stations) return `These stations need ${needed} ${needed === 1 ? "goalie" : "goalies"} — ${have}`;
    return `Needs ${needed === 1 ? "a goalie" : `${needed} goalies`} — ${have}`;
}

/** "2 goalies attending, but no drill uses a goalie". */
export function goaliesUnusedMessage(attending: number): string {
    return `${attending} ${attending === 1 ? "goalie" : "goalies"} attending, but no drill uses a goalie`;
}

/** The detail page's one-line summary of the shortfalls. */
export function goalieShortSummary(count: number, attending: number): string {
    const subject = count === 1 ? "1 drill or station block needs" : `${count} drills or station blocks need`;
    return attending === 0 ? `${subject} a goalie, but none are attending` : `${subject} more goalies than the ${attending} attending`;
}

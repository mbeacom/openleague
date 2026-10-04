/**
 * Practice-session timeline (practice planner 2b, practice timing): the rows
 * grouped into blocks, wall time with the gap between blocks, station
 * rotation, the save rules, and the editor's reorder / toggle / remove rules.
 * Pure, so the session editor, the session actions, the static store, the
 * plan document, the detail view, the bench sheet and the exports all share it.
 *
 * A row is a drill or a block row (warm-up, break, transition, cool-down).
 * A drill with `runsWithPrevious` runs at the same time as the drill before it
 * (by sequence): consecutive flagged drills form one station block with the
 * nearest preceding unflagged drill. A block row is always its own block. A
 * block lasts as long as its longest row, or, when its first drill sets
 * `rotateEveryMinutes` (M) and at least 2 stations rotate, M × rotating
 * stations; a station marked `stays` keeps its group for the whole block.
 * `transitionMinutes` is added between consecutive blocks, never after the last.
 *
 * `groupStations`, `sessionWallMinutes`, `buildSchedule` and the save checks
 * order by `sequence`, because a payload's array order is not trusted. The
 * list helpers (`normalizeGroups`, `toggleRunsWithPrevious`, `moveItem`,
 * `removeItem`, `settleRotations`) work on array order, which the editor keeps
 * equal to sequence order: every edit ends in `normalizeGroups`.
 */

import type { SegmentKind } from "@/types/segments";
import {
    MAX_ROTATE_MINUTES,
    MIN_ROTATE_MINUTES,
    type IceArea,
    type PlayData,
    type PlayFocus,
    type PlayGoalies,
    type SessionRowKind,
} from "@/types/practice-planner";
import { isBlockKind } from "@/lib/utils/session-rows";
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
    /** Absent = a drill (rows saved before practice timing). A block row never joins a station block. */
    kind?: SessionRowKind;
    /** In a rotating block: this station's group stays all block (spec R3). Ignored elsewhere. */
    stays?: boolean;
    /** On the first drill of a station block of 2 or more: groups rotate every this many minutes (spec R4). */
    rotateEveryMinutes?: number | null;
}

export interface StationGroup<T extends TimelinePlay> {
    /** 0-based block index */
    index: number;
    /** Offset from the session start, in minutes, gaps between blocks included */
    startMinute: number;
    /** The block's length: its longest drill, or M × rotating stations when it rotates */
    wallMinutes: number;
    /** At least one row, in sequence order (the caller's objects); more than one is a station block */
    stations: T[];
    /** The block's rotation, or null when it doesn't rotate */
    rotation: RotationGrid<T> | null;
}

/** Header of a station block: "Stations · 3 · 15 min". */
export function stationBlockLabel(count: number, minutes: number): string {
    return `Stations · ${count} · ${minutes} min`;
}

function bySequence<T extends TimelinePlay>(plays: readonly T[]): T[] {
    return [...plays].sort((a, b) => a.sequence - b.sequence);
}

/** A row may join the block in progress only when both are drills. */
function joinsBlock(head: TimelinePlay, row: TimelinePlay): boolean {
    return row.runsWithPrevious && !isBlockKind(head.kind) && !isBlockKind(row.kind);
}

/**
 * Groups rows by sequence. A flagged first row (bad stored data) starts a
 * group rather than being dropped; sessionRowsError rejects it on save. A
 * block row is always its own group. `transitionMinutes` separates
 * consecutive groups (never after the last).
 */
export function groupStations<T extends TimelinePlay>(plays: readonly T[], transitionMinutes = 0): StationGroup<T>[] {
    const blocks: T[][] = [];
    for (const play of bySequence(plays)) {
        const current = blocks[blocks.length - 1];
        if (current && joinsBlock(current[0], play)) current.push(play);
        else blocks.push([play]);
    }
    let startMinute = 0;
    return blocks.map((stations, index) => {
        const group = { index, startMinute, wallMinutes: blockMinutes(stations), stations, rotation: rotationGrid(stations) };
        startMinute += group.wallMinutes + transitionMinutes;
        return group;
    });
}

/** The session's planned length: each block once, plus the gaps between blocks. */
export function sessionWallMinutes(plays: readonly TimelinePlay[], transitionMinutes = 0): number {
    const groups = groupStations(plays, transitionMinutes);
    const last = groups[groups.length - 1];
    return last ? last.startMinute + last.wallMinutes : 0;
}

const MS_PER_MINUTE = 60_000;

export interface ScheduleRow<T extends TimelinePlay> {
    group: StationGroup<T>;
    /** sessionStart + group.startMinute */
    startsAt: Date;
    /** startsAt + group.wallMinutes */
    endsAt: Date;
    /** Each rotation round's start; empty when the block doesn't rotate */
    roundStarts: Date[];
}

/**
 * Each block's start and end instant, and each rotation round's start (3b,
 * spec R4). Instants only: formatting, and so the timezone, belong to the
 * caller (lib/utils/date.ts), which keeps this module zone-free.
 */
export function buildSchedule<T extends TimelinePlay>(plays: readonly T[], sessionStart: Date, transitionMinutes = 0): ScheduleRow<T>[] {
    const base = sessionStart.getTime();
    return groupStations(plays, transitionMinutes).map((group) => {
        const startsAt = new Date(base + group.startMinute * MS_PER_MINUTE);
        return {
            group,
            startsAt,
            endsAt: new Date(startsAt.getTime() + group.wallMinutes * MS_PER_MINUTE),
            roundStarts: (group.rotation?.rounds ?? []).map((round) => new Date(startsAt.getTime() + round.start * MS_PER_MINUTE)),
        };
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

/** The row itself when every change is already true of it, else a copy with the changes. */
function withChanges<T extends TimelinePlay>(row: T, changes: Partial<TimelinePlay>): T {
    const keys = Object.keys(changes) as Array<keyof TimelinePlay>;
    return keys.every((key) => row[key] === changes[key]) ? row : { ...row, ...changes };
}

/**
 * The editor's list rules, applied after every edit (2b, spec R3), by array order:
 * - sequence = position;
 * - the first row, a block row, and a drill right after a block row never run with a previous row;
 * - a block row never stays or rotates;
 * - only the first drill of a block of 2 or more keeps a rotation;
 * - in a rotating block, each rotating station lasts M and each stays station the whole block;
 * - outside a rotating block nothing stays.
 * A block set to rotate with fewer than 2 rotating stations keeps the coach's
 * settings while editing (the editor explains why); settleRotations clears it on save.
 * Unchanged rows keep their object.
 */
export function normalizeGroups<T extends TimelinePlay>(plays: readonly T[]): T[] {
    const next = plays.map((play, index) => {
        const block = isBlockKind(play.kind);
        const afterBlock = index > 0 && isBlockKind(plays[index - 1].kind);
        return withChanges(play, {
            sequence: index,
            runsWithPrevious: index > 0 && !block && !afterBlock && play.runsWithPrevious,
            ...(block && play.stays && { stays: false }),
            ...(block && play.rotateEveryMinutes != null && { rotateEveryMinutes: null }),
        });
    });
    for (let start = 0; start < next.length; ) {
        const { end } = groupRange(next, start);
        const stations = next.slice(start, end);
        const head = stations[0];
        const setToRotate = !isBlockKind(head.kind) && stations.length >= MIN_ROTATING_STATIONS && head.rotateEveryMinutes != null;
        const minutes = rotationMinutes(stations);
        const rotating = rotatingStations(stations).length;
        stations.forEach((row, k) => {
            const changes: Partial<TimelinePlay> = {};
            if ((k > 0 || !setToRotate) && row.rotateEveryMinutes != null) changes.rotateEveryMinutes = null;
            if (!setToRotate && row.stays) changes.stays = false;
            if (minutes !== null) changes.duration = stationMinutes(row, minutes, rotating);
            next[start + k] = withChanges(row, changes);
        });
        start = end;
    }
    return next;
}

/** A station's minutes in a rotating block (spec R3): M, or the whole block when its group stays. */
function stationMinutes(row: TimelinePlay, minutes: number, rotating: number): number {
    return row.stays ? minutes * rotating : minutes;
}

/**
 * On write (spec R3): each station of a rotating block gets the minutes the
 * editor shows (normalizeGroups's rule): M, or M × rotating stations when its
 * group stays. For rows that already pass sessionRowsError; groups by sequence.
 * Rows keep their order, and an unchanged row keeps its object. The wall time
 * doesn't change: a rotating block's length never reads its stations' minutes.
 */
export function withRotationMinutes<T extends TimelinePlay>(rows: readonly T[]): T[] {
    const minutes = new Map<T, number>();
    for (const { stations, rotation } of groupStations(rows)) {
        if (!rotation) continue;
        const rotating = rotatingStations(stations).length;
        for (const station of stations) minutes.set(station, stationMinutes(station, rotation.minutes, rotating));
    }
    return rows.map((row) => {
        const duration = minutes.get(row);
        return duration === undefined ? row : withChanges(row, { duration });
    });
}

/**
 * The half-open range [start, end) of the block holding `index`, by array
 * position. Throws a RangeError for an index that isn't a position in `plays`:
 * every caller here bounds-checks first, so one only reaches it by misuse.
 */
export function groupRange(plays: readonly TimelinePlay[], index: number): { start: number; end: number } {
    if (!Number.isInteger(index) || index < 0 || index >= plays.length) {
        throw new RangeError(`groupRange: index ${index} is out of range for ${plays.length} row(s)`);
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
    // A block row never joins, and is never joined by, a station block (spec R3).
    if (isBlockKind(plays[index].kind) || isBlockKind(plays[index - 1].kind)) return false;
    if (plays[index].runsWithPrevious) return true;
    const before = groupRange(plays, index - 1);
    const after = groupRange(plays, index);
    return before.end - before.start + (after.end - after.start) <= MAX_STATIONS_PER_GROUP;
}

/**
 * A block's rotation lives on its first drill (spec R3). After an edit that
 * gives the block a new first drill, that drill takes the rotation; the old
 * holder, now a later station, loses it in normalizeGroups. The block still
 * rotates, so its stays ticks stay. A no-op for a block row or no rotation.
 */
function carryRotation<T extends TimelinePlay>(rows: T[], head: number, rotateEveryMinutes: number | null | undefined): T[] {
    const row = rows[head];
    if (rotateEveryMinutes == null || !row || isBlockKind(row.kind) || row.rotateEveryMinutes === rotateEveryMinutes) return rows;
    const next = [...rows];
    next[head] = { ...row, rotateEveryMinutes };
    return next;
}

/**
 * Flips the drill's flag; returns `plays` itself when that isn't allowed.
 * Joining the block before: the merged block keeps that block's rotation, else
 * takes the joining block's. Leaving a block: the block keeps its rotation on
 * its first drill; the drill that left starts a block with none (so nothing in
 * it stays, R3).
 */
export function toggleRunsWithPrevious<T extends TimelinePlay>(plays: T[], index: number): T[] {
    if (!canToggleRunsWithPrevious(plays, index)) return plays;
    const joining = !plays[index].runsWithPrevious;
    const next = plays.map((play, i) => (i === index ? { ...play, runsWithPrevious: !play.runsWithPrevious } : play));
    if (!joining) return normalizeGroups(next);
    const head = groupRange(plays, index - 1).start;
    return normalizeGroups(plays[head].rotateEveryMinutes != null ? next : carryRotation(next, head, plays[index].rotateEveryMinutes));
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
        // A station moved up to the top takes the block's rotation.
        return normalizeGroups(carryRotation(next, group.start, plays[group.start].rotateEveryMinutes));
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
 * station the head of what is left, so it never joins the block before it, and
 * hands it the block's rotation.
 */
export function removeItem<T extends TimelinePlay>(plays: T[], index: number): T[] {
    if (index < 0 || index >= plays.length) return plays;
    const removedHead = index === 0 || !plays[index].runsWithPrevious;
    const next = plays.filter((_, i) => i !== index);
    const follower = next[index];
    if (removedHead && follower?.runsWithPrevious) {
        next[index] = { ...follower, runsWithPrevious: false };
        return normalizeGroups(carryRotation(next, index, plays[index].rotateEveryMinutes));
    }
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
    /** null = unreadable (needs one goalie if required); absent on a block row */
    playData?: PlayData | null;
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
            // A block row has no drill: it neither needs nor uses a goalie.
            if (isBlockKind(station.kind)) continue;
            drills++;
            const demand = goalieDemand({ focus: station.focus, goalies: station.goalies, playData: station.playData ?? null });
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

// ---------------------------------------------------------------------------
// Station rotation (practice timing, spec R4)
// ---------------------------------------------------------------------------

/** A rotating block needs at least this many stations that rotate. */
export const MIN_ROTATING_STATIONS = 2;
/** A stays station's cell in every round. */
export const ROTATION_ALL = "all";

export const BLOCK_STATION_ERROR = "A warm-up, break, transition or cool-down can't be part of a station block";
export const BLOCK_ROW_FIELDS_ERROR = "A warm-up, break, transition or cool-down can't rotate or stay";
export const ROTATION_PLACEMENT_ERROR = "Only the first drill of a station block can set a rotation";
export const ROTATION_TOO_FEW_ERROR = `A rotating station block needs at least ${MIN_ROTATING_STATIONS} stations that rotate`;

export interface RotationCell<T> {
    row: T;
    /** "A", "B", … or ROTATION_ALL */
    group: string;
}

export interface RotationRound<T> {
    /** Minutes from the block's start */
    start: number;
    /** One cell per station, in station order */
    stations: RotationCell<T>[];
}

export interface RotationGrid<T> {
    minutes: number;
    /** One group per rotating station: "A", "B", … */
    groups: string[];
    rounds: RotationRound<T>[];
}

/** The grid as rows of text: a Start column plus one column per station. */
export interface RotationTable {
    columns: string[];
    rows: Array<{ start: string; cells: string[] }>;
}

/** The stations that rotate (not marked stays). */
export function rotatingStations<T extends TimelinePlay>(stations: readonly T[]): T[] {
    return stations.filter((station) => !station.stays);
}

/** M when the block rotates: set on its first drill, with at least 2 rotating stations; else null. */
export function rotationMinutes(stations: readonly TimelinePlay[]): number | null {
    const head = stations[0];
    if (!head || isBlockKind(head.kind) || stations.length < MIN_ROTATING_STATIONS || head.rotateEveryMinutes == null) return null;
    return rotatingStations(stations).length >= MIN_ROTATING_STATIONS ? head.rotateEveryMinutes : null;
}

/** A lone row's minutes; a station block's longest station; a rotating block's M × rotating stations. */
export function blockMinutes(stations: readonly TimelinePlay[]): number {
    const minutes = rotationMinutes(stations);
    if (minutes !== null) return minutes * rotatingStations(stations).length;
    return stations.reduce((longest, station) => Math.max(longest, station.duration), 0);
}

function groupLetter(index: number): string {
    return String.fromCharCode(65 + index);
}

/**
 * Who is where in a rotating block: one group per rotating station, and in
 * round r group g is at rotating station (g + r) mod n, so every group visits
 * every rotating station once. A stays station shows ROTATION_ALL.
 */
export function rotationGrid<T extends TimelinePlay>(stations: readonly T[]): RotationGrid<T> | null {
    const minutes = rotationMinutes(stations);
    if (minutes === null) return null;
    const rotating = rotatingStations(stations);
    const n = rotating.length;
    const groups = rotating.map((_, g) => groupLetter(g));
    const rounds = Array.from({ length: n }, (_, r) => ({
        start: r * minutes,
        stations: stations.map((row) => {
            if (row.stays) return { row, group: ROTATION_ALL };
            // Station s holds the group g with (g + r) mod n = s.
            return { row, group: groups[(rotating.indexOf(row) - r + n) % n] };
        }),
    }));
    return { minutes, groups, rounds };
}

export function rotationTable<T extends TimelinePlay>(
    grid: RotationGrid<T>,
    name: (row: T) => string,
    start: (offsetMinutes: number, round: number) => string,
): RotationTable {
    return {
        columns: (grid.rounds[0]?.stations ?? []).map((cell) => name(cell.row)),
        rows: grid.rounds.map((round, index) => ({ start: start(round.start, index), cells: round.stations.map((cell) => cell.group) })),
    };
}

/** The interval offered when Rotate is switched on: the block keeps about its length. */
export function defaultRotationMinutes(stations: readonly TimelinePlay[]): number {
    const longest = stations.reduce((max, station) => Math.max(max, station.duration), 0);
    const each = Math.round(longest / Math.max(1, stations.length));
    return Math.min(MAX_ROTATE_MINUTES, Math.max(MIN_ROTATE_MINUTES, each));
}

/**
 * On save (spec R3): a block set to rotate that can't (fewer than 2 rotating
 * stations) loses its rotation and its stays flags. Returns `plays` itself
 * when nothing changes.
 */
export function settleRotations<T extends TimelinePlay>(plays: T[]): T[] {
    let changed = false;
    const next = [...plays];
    for (let start = 0; start < next.length; ) {
        const { end } = groupRange(next, start);
        const head = next[start];
        if (head.rotateEveryMinutes != null && rotationMinutes(next.slice(start, end)) === null) {
            changed = true;
            next[start] = { ...head, rotateEveryMinutes: null };
        }
        start = end;
    }
    return changed ? normalizeGroups(next) : plays;
}

/**
 * The save and import rules (spec R3), by sequence: the station rules, then
 * block rows outside station blocks with no timing, and rotation only on the
 * first drill of a block with at least 2 rotating stations. `stays` outside a
 * rotating block is ignored, not rejected.
 */
export function sessionRowsError(plays: readonly TimelinePlay[]): string | null {
    const rows = bySequence(plays);
    const stationError = stationGroupError(rows);
    if (stationError) return stationError;
    for (const [index, row] of rows.entries()) {
        const previous = rows[index - 1];
        if (isBlockKind(row.kind)) {
            if (row.runsWithPrevious) return BLOCK_STATION_ERROR;
            if (row.stays || row.rotateEveryMinutes != null) return BLOCK_ROW_FIELDS_ERROR;
        } else if (row.runsWithPrevious && previous && isBlockKind(previous.kind)) {
            return BLOCK_STATION_ERROR;
        }
    }
    for (const group of groupStations(rows)) {
        const [head, ...rest] = group.stations;
        if (rest.some((row) => row.rotateEveryMinutes != null)) return ROTATION_PLACEMENT_ERROR;
        if (head.rotateEveryMinutes == null) continue;
        if (group.stations.length < MIN_ROTATING_STATIONS) return ROTATION_PLACEMENT_ERROR;
        if (rotatingStations(group.stations).length < MIN_ROTATING_STATIONS) return ROTATION_TOO_FEW_ERROR;
    }
    return null;
}

/**
 * Spec R3 for an older client: a rotation or stays flag it never sent but
 * inherited from the stored row may no longer fit the plan (a station was
 * moved or removed). The inherited value gives way instead of failing a save
 * the coach didn't make invalid; values the client sent are still checked.
 * `rows` are withStoredTiming's output for `sent`, in the same order. Hosted
 * and the static store both settle before checking (sessionRowsError).
 */
export function settleInheritedTiming<R extends TimelinePlay & { stays: boolean; rotateEveryMinutes: number | null }>(
    rows: readonly R[],
    sent: readonly { sequence: number; stays?: boolean; rotateEveryMinutes?: number | null }[],
): R[] {
    const inheritsRotation = new Set(rows.filter((_, index) => sent[index].rotateEveryMinutes === undefined));
    const inheritsStays = new Set(rows.filter((_, index) => sent[index].stays === undefined));
    const settled = new Map<R, R>();
    for (const { stations } of groupStations(rows)) {
        const [head, ...rest] = stations;
        for (const station of rest) {
            if (station.rotateEveryMinutes != null && inheritsRotation.has(station)) {
                settled.set(station, { ...station, rotateEveryMinutes: null });
            }
        }
        if (head.rotateEveryMinutes == null || rotationMinutes(stations) !== null) continue;
        if (inheritsRotation.has(head)) {
            settled.set(head, { ...head, rotateEveryMinutes: null });
            continue;
        }
        // The rotation was sent: inherited stays flags give way if that lets it run.
        if (stations.length < MIN_ROTATING_STATIONS) continue;
        const freed = stations.map((station) => (station.stays && inheritsStays.has(station) ? { ...station, stays: false } : station));
        if (rotatingStations(freed).length < MIN_ROTATING_STATIONS) continue;
        freed.forEach((station, index) => {
            if (station !== stations[index]) settled.set(stations[index], station);
        });
    }
    return rows.map((row) => settled.get(row) ?? row);
}

/** The bench sheet's rotation header: "Stations · rotate every 5 min · 15 min". */
export function rotationBlockLabel(rotateEvery: number, minutes: number): string {
    return `Stations · rotate every ${rotateEvery} min · ${minutes} min`;
}

/**
 * The editor's summary: "3 stations × 5 min = 15 min · groups A–C". Only for a
 * block that rotates: fewer than 2 rotating stations is a RangeError (callers
 * show CANT_ROTATE_MESSAGE instead).
 */
export function rotationSummary(rotating: number, rotateEvery: number): string {
    if (!Number.isInteger(rotating) || rotating < MIN_ROTATING_STATIONS) {
        throw new RangeError(`rotationSummary: a rotation needs at least ${MIN_ROTATING_STATIONS} rotating stations, got ${rotating}`);
    }
    return `${rotating} stations × ${rotateEvery} min = ${rotating * rotateEvery} min · groups A–${groupLetter(rotating - 1)}`;
}

/** The session page's chip: "Rotates every 5 min". */
export function rotatesEveryLabel(minutes: number): string {
    return `Rotates every ${minutes} min`;
}

/**
 * A station's timing beside its name in a list of a block's stations (the
 * session sidebar, the import preview): in a rotating block "Rotates every 5
 * min", or STAYS_MARK for a station that stays; elsewhere its own minutes.
 */
export function stationTimingLabel(row: TimelinePlay, rotation: { minutes: number } | null): string {
    if (!rotation) return `${row.duration} min`;
    return row.stays ? STAYS_MARK : rotatesEveryLabel(rotation.minutes);
}

/** "2 min between blocks". */
export function betweenBlocksLabel(minutes: number): string {
    return `${minutes} min between blocks`;
}

/** A round's minutes within its block, where no clock time is known: "5–10 min". */
export function rotationRoundLabel(start: number, minutes: number): string {
    return `${start}–${start + minutes} min`;
}

/** The mark of a station whose group doesn't rotate (session page, bench sheet, import preview). */
export const STAYS_MARK = "stays";

/** What follows a station's name in a rotating block: " · stays", or nothing (its minutes are the rotation's). */
export function staysSuffix(stays: boolean | undefined): string {
    return stays ? ` · ${STAYS_MARK}` : "";
}

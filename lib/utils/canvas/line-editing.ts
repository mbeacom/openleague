/**
 * Line editing on the practice board (line editing spec R1, R3, R4, R5):
 * pure helpers for a line's handles, the edits a handle drag makes, and
 * where a line end snaps. Rink feet throughout. No DOM and no React, so the
 * static planner shares it unchanged (ADR-0020).
 *
 * Every edit returns the same reference when it changes nothing, so the
 * board can skip a no-op history entry.
 */
import type { DrawingElement, PlayData, Position, RinkRect } from "@/types/practice-planner";
import { RINK_HEIGHT_FT, RINK_WIDTH_FT } from "@/lib/utils/play-data";
import { rectContains } from "@/lib/utils/ice-area";
import { clampToRect, distanceToLineSegment } from "./interaction-utils";
import { curvePoint, strokeCenterline } from "./stroke-geometry";
import { EQUIPMENT_RADIUS_FT, PLAYER_RADIUS_FT } from "./glyph-metrics";

/** Bends (on a curve) or corners (on a straight polyline) an edit may add up to (R1). */
export const MAX_LINE_BENDS = 6;
/** Points in an edited line: its two ends plus MAX_LINE_BENDS bends, corners or freehand anchors. */
export const MAX_EDIT_POINTS = MAX_LINE_BENDS + 2;
/** Snap radius floor in feet (R4); the board uses the larger of this and its minimum hit radius. */
export const SNAP_RADIUS_FT = 3;
/** Two presses on one bend within this many milliseconds remove it (R3). */
export const DOUBLE_TAP_MS = 300;
/** A freehand point closer than this to the simplified line is not an anchor. */
const ANCHOR_TOLERANCE_FT = 0.25;
const RINK: RinkRect = { x: 0, y: 0, w: RINK_WIDTH_FT, h: RINK_HEIGHT_FT };

export type LineStroke = Pick<DrawingElement, "path" | "points">;

/**
 * A handle on the selected line. `index` is a position in the line's
 * editable points: its stored points for a straight line or a curve, its
 * anchorPoints for a freehand line. Interior points are a curve's "bend"s, a
 * straight polyline's "corner"s and a freehand line's "anchor"s. An "add"
 * handle sits on segment `segment` (between points `segment` and
 * `segment + 1`); dragging it inserts a point there.
 */
export type LineHandle =
    | { kind: "end" | "bend" | "corner" | "anchor"; index: number; position: Position }
    | { kind: "add"; segment: number; position: Position };

/** The points an edit works on: a straight line's or a curve's own, or a freehand line's anchors. */
function editablePoints(stroke: LineStroke): Position[] {
    return stroke.path === "freehand" ? anchorPoints(stroke.points) : stroke.points;
}

/**
 * Up to `max` of `points`, always the first and last: a greedy
 * Douglas–Peucker pass that adds, each round, the point farthest from the
 * line through the points kept so far, until `max` are kept or none is more
 * than ANCHOR_TOLERANCE_FT away. A line of `max` points or fewer is returned
 * as is (the same array), so already-anchored lines keep every handle.
 */
export function anchorPoints(points: Position[], max: number = MAX_EDIT_POINTS): Position[] {
    // A line already within the cap is its own anchors, so anchoring is idempotent
    if (points.length <= max) return points;
    const kept = [0, points.length - 1];
    while (kept.length < max) {
        let best = -1;
        let bestDistance = ANCHOR_TOLERANCE_FT;
        let insertAt = -1;
        for (let k = 0; k < kept.length - 1; k++) {
            const a = kept[k];
            const b = kept[k + 1];
            for (let i = a + 1; i < b; i++) {
                const d = distanceToLineSegment(points[i], points[a], points[b]);
                if (d > bestDistance) {
                    best = i;
                    bestDistance = d;
                    insertAt = k + 1;
                }
            }
        }
        if (best < 0) break;
        kept.splice(insertAt, 0, best);
    }
    return kept.map((i) => ({ ...points[i] }));
}

const INTERIOR_HANDLE = { curve: "bend", straight: "corner", freehand: "anchor" } as const;

/**
 * The selected line's handles (R3), ends first so they win ties: the two
 * ends; a handle on each interior point (a curve's bends, a straight
 * polyline's corners, a freehand line's anchors); and, on a straight line or
 * a curve with fewer than MAX_LINE_BENDS interior points, a "+" handle on
 * each segment, at the drawn curve's midpoint on a curve and at the
 * segment's midpoint on a straight line.
 */
export function lineHandles(stroke: LineStroke): LineHandle[] {
    const points = editablePoints(stroke);
    const last = points.length - 1;
    if (last < 1) return [];
    const handles: LineHandle[] = [
        { kind: "end", index: 0, position: points[0] },
        { kind: "end", index: last, position: points[last] },
    ];
    const interior = INTERIOR_HANDLE[stroke.path];
    for (let i = 1; i < last; i++) handles.push({ kind: interior, index: i, position: points[i] });
    if (stroke.path !== "freehand" && last - 1 < MAX_LINE_BENDS) {
        for (let segment = 0; segment < last; segment++) {
            const position = stroke.path === "curve" && last > 1
                ? curvePoint(points, segment, 0.5)
                : { x: (points[segment].x + points[segment + 1].x) / 2, y: (points[segment].y + points[segment + 1].y) / 2 };
            handles.push({ kind: "add", segment, position });
        }
    }
    return handles;
}

/** The handle nearest `point` within `radiusFt`; on a tie, the earlier one. */
export function hitTestLineHandle(handles: readonly LineHandle[], point: Position, radiusFt: number): LineHandle | null {
    let hit: LineHandle | null = null;
    let nearest = Infinity;
    for (const handle of handles) {
        const d = Math.hypot(point.x - handle.position.x, point.y - handle.position.y);
        if (d <= radiusFt && d < nearest) {
            hit = handle;
            nearest = d;
        }
    }
    return hit;
}

/**
 * Moves editable point `index` (an end, a bend or an anchor) to `to`, kept
 * inside `rect`. A freehand line's points become its anchors (at most 8),
 * and it stays freehand, so it is still smoothed (R3).
 */
export function moveLinePoint(stroke: DrawingElement, index: number, to: Position, rect: RinkRect): DrawingElement {
    const points = editablePoints(stroke);
    if (!Number.isInteger(index) || index < 0 || index >= points.length) return stroke;
    const target = clampToRect(to, rect);
    if (points === stroke.points && points[index].x === target.x && points[index].y === target.y) return stroke;
    return { ...stroke, points: points.map((p, i) => (i === index ? target : { ...p })) };
}

/** One axis of a whole-line move: the shift keeping [min, max] in [lo, hi]; none when the line is longer than that. */
function clampShift(shift: number, min: number, max: number, lo: number, hi: number): number {
    if (max - min > hi - lo) return 0;
    return Math.min(hi - max, Math.max(lo - min, shift));
}

/**
 * Moves the whole line by `delta`, clamped as a whole so every point stays
 * inside `rect` and the shape is never distorted (R3). A line longer than
 * `rect` along an axis does not move along it. A curve is bounded by its
 * rendered centerline, which can overshoot its points. Never simplifies.
 */
export function moveLine(stroke: DrawingElement, delta: Position, rect: RinkRect): DrawingElement {
    // A curve can overshoot between its points, so its drawn centerline is what must stay inside
    const shape = stroke.path === "curve" && stroke.points.length >= 3 ? strokeCenterline(stroke) : stroke.points;
    const xs = shape.map((p) => p.x);
    const ys = shape.map((p) => p.y);
    const dx = clampShift(delta.x, Math.min(...xs), Math.max(...xs), rect.x, rect.x + rect.w);
    const dy = clampShift(delta.y, Math.min(...ys), Math.max(...ys), rect.y, rect.y + rect.h);
    if (dx === 0 && dy === 0) return stroke;
    // The rink clamp only absorbs floating-point rounding at the boards
    return { ...stroke, points: stroke.points.map((p) => clampToRect({ x: p.x + dx, y: p.y + dy }, RINK)) };
}

/**
 * Adds a point on segment `segment` at `at` (kept inside `rect`), for a line
 * with fewer than 6 bends or corners (R3). A 2-point straight line becomes a
 * curve; a multi-point straight line gets a corner and stays straight; a
 * curve gets another bend. Freehand lines take no points.
 */
export function insertBend(stroke: DrawingElement, segment: number, at: Position, rect: RinkRect): DrawingElement {
    const { points } = stroke;
    if (stroke.path === "freehand" || points.length - 2 >= MAX_LINE_BENDS) return stroke;
    if (!Number.isInteger(segment) || segment < 0 || segment > points.length - 2) return stroke;
    const next = points.map((p) => ({ ...p }));
    next.splice(segment + 1, 0, clampToRect(at, rect));
    const path = stroke.path === "straight" && points.length === 2 ? "curve" : stroke.path;
    return { ...stroke, path, points: next };
}

/**
 * Removes interior point `index` (a curve's bend or a polyline's corner);
 * ends and freehand anchors can't be removed (R3). A curve left with 2
 * points becomes a straight line again.
 */
export function removeBend(stroke: DrawingElement, index: number): DrawingElement {
    if (stroke.path === "freehand" || !Number.isInteger(index) || index <= 0 || index >= stroke.points.length - 1) return stroke;
    const points = stroke.points.filter((_, i) => i !== index);
    const path = stroke.path === "curve" && points.length === 2 ? "straight" : stroke.path;
    return { ...stroke, path, points };
}

/** Straighten (a curve or a polyline) / Make straight (freehand) (R3): a straight line between the first and last points. */
export function straighten(stroke: DrawingElement): DrawingElement {
    const { points } = stroke;
    if (stroke.path === "straight" && points.length === 2) return stroke;
    return { ...stroke, path: "straight", points: [{ ...points[0] }, { ...points[points.length - 1] }] };
}

export interface SnapOptions {
    /** Snap radius in feet (snapRadiusFt) */
    radiusFt: number;
    /** The line being edited: never its own target */
    excludeId?: string;
    /** Every target at exactly this point is skipped: the line's other end, so an end never lands on it */
    excludePoint?: Position;
    /** Alt/Option held: no snapping for this gesture */
    bypass?: boolean;
    /** Targets outside this rectangle (the drill's ice area) are skipped */
    rect?: RinkRect;
}

/** Where a line end snaps, and how large the target is drawn (so the ring can clear it). */
export interface SnapTarget {
    /** The target's point, a copy */
    position: Position;
    /** The target glyph's radius in feet: a player's or an equipment item's; 0 for a line end */
    radiusFt: number;
}

/**
 * Where a line end at `point` snaps (R4): the nearest player centre,
 * equipment centre, or first or last point of another line within
 * `radiusFt`; ties go to the earlier target in that order. Text is never a
 * target. Null for no snap.
 */
export function findSnapTarget(data: PlayData, point: Position, options: SnapOptions): SnapTarget | null {
    if (options.bypass) return null;
    const candidates: SnapTarget[] = [
        ...data.players.map((p) => ({ position: p.position, radiusFt: PLAYER_RADIUS_FT })),
        ...data.equipment.map((e) => ({ position: e.position, radiusFt: EQUIPMENT_RADIUS_FT[e.kind] })),
        ...data.drawings
            .filter((d) => d.id !== options.excludeId)
            .flatMap((d) => [d.points[0], d.points[d.points.length - 1]].map((position) => ({ position, radiusFt: 0 }))),
    ];
    const excluded = options.excludePoint;
    let best: SnapTarget | null = null;
    let nearest = Infinity;
    for (const c of candidates) {
        const p = c.position;
        if (options.rect && !rectContains(options.rect, p)) continue;
        if (excluded && p.x === excluded.x && p.y === excluded.y) continue;
        const d = Math.hypot(p.x - point.x, p.y - point.y);
        if (d <= options.radiusFt && d < nearest) {
            best = c;
            nearest = d;
        }
    }
    return best ? { position: { ...best.position }, radiusFt: best.radiusFt } : null;
}

/** The board's snap radius: the larger of SNAP_RADIUS_FT and its minimum hit radius in feet (R4). */
export function snapRadiusFt(minHitRadiusFt: number): number {
    return Math.max(SNAP_RADIUS_FT, minHitRadiusFt);
}

/** A press on a bend handle, remembered to recognize a double-tap. */
export interface TapRecord {
    /** The line's id */
    id: string;
    /** The bend's index */
    index: number;
    /** Where the press landed (rink feet) */
    position: Position;
    /** When, in milliseconds */
    time: number;
}

/** Two presses on the same bend of the same line within `windowMs` and `radiusFt` (R3). */
export function isDoubleTap(previous: TapRecord | null, next: TapRecord, radiusFt: number, windowMs: number = DOUBLE_TAP_MS): boolean {
    if (!previous) return false;
    const elapsed = next.time - previous.time;
    return (
        previous.id === next.id &&
        previous.index === next.index &&
        elapsed >= 0 &&
        elapsed <= windowMs &&
        Math.hypot(next.position.x - previous.position.x, next.position.y - previous.position.y) <= radiusFt
    );
}

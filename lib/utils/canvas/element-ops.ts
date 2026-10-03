/** Pure, immutable edits on PlayData elements by id. */
import {
    AREA_SNAP_FT,
    MIN_AREA_FT,
    VALIDATION_CONSTRAINTS as C,
    type DrawingElement,
    type EquipmentItem,
    type EquipmentKind,
    type PlayData,
    type PlayerIcon,
    type PlayerRole,
    type Position,
    type RinkRect,
    type StrokeOptions,
    type TextAnnotation,
} from "@/types/practice-planner";
import { RINK_HEIGHT_FT, RINK_WIDTH_FT, simplifyPoints } from "@/lib/utils/play-data";
import { ROLE_DEFAULT_COLORS } from "@/lib/utils/canvas/notation";

export type ElementKind = "player" | "drawing" | "equipment" | "annotation";

export type SelectedElement =
    | { kind: "player"; element: PlayerIcon }
    | { kind: "drawing"; element: DrawingElement }
    | { kind: "equipment"; element: EquipmentItem }
    | { kind: "annotation"; element: TextAnnotation };

export type ElementPatch = Partial<Pick<PlayerIcon, "role" | "label" | "color">> &
    Partial<Pick<DrawingElement, "action" | "end" | "color">> &
    Partial<Pick<EquipmentItem, "kind" | "rotation">> &
    Partial<Pick<TextAnnotation, "text" | "color">>;

const ALLOWED: Record<ElementKind, readonly (keyof ElementPatch)[]> = {
    player: ["role", "label", "color"],
    drawing: ["action", "end", "color"],
    equipment: ["kind", "rotation"],
    annotation: ["text", "color"],
};

export function findElement(data: PlayData, id: string): SelectedElement | null {
    const p = data.players.find((e) => e.id === id);
    if (p) return { kind: "player", element: p };
    const d = data.drawings.find((e) => e.id === id);
    if (d) return { kind: "drawing", element: d };
    const q = data.equipment.find((e) => e.id === id);
    if (q) return { kind: "equipment", element: q };
    const a = data.annotations.find((e) => e.id === id);
    if (a) return { kind: "annotation", element: a };
    return null;
}

function pick(patch: ElementPatch, kind: ElementKind): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of ALLOWED[kind]) if (patch[key] !== undefined) out[key] = patch[key];
    return out;
}

export function updateElement(data: PlayData, id: string, patch: ElementPatch): PlayData {
    const found = findElement(data, id);
    if (!found) return data;
    const fields = pick(patch, found.kind);
    // A no-op patch (e.g. re-clicking the current role) returns `data` itself,
    // so callers can skip recording an undo step.
    const current = found.element as unknown as Record<string, unknown>;
    if (Object.keys(fields).every((key) => current[key] === fields[key])) return data;
    const apply = <T extends { id: string }>(list: T[]) => list.map((e) => (e.id === id ? { ...e, ...fields } : e));
    switch (found.kind) {
        case "player":
            return { ...data, players: apply(data.players) };
        case "drawing":
            return { ...data, drawings: apply(data.drawings) };
        case "equipment":
            return { ...data, equipment: apply(data.equipment) };
        case "annotation":
            return { ...data, annotations: apply(data.annotations) };
    }
}

export function removeElement(data: PlayData, id: string): PlayData {
    return {
        ...data,
        players: data.players.filter((e) => e.id !== id),
        drawings: data.drawings.filter((e) => e.id !== id),
        equipment: data.equipment.filter((e) => e.id !== id),
        annotations: data.annotations.filter((e) => e.id !== id),
    };
}

export function moveElement(data: PlayData, id: string, position: Position): PlayData {
    // Nothing to move (unknown id, a stroke, or already there): same reference,
    // so callers can skip recording a no-op history entry.
    const current = findElement(data, id);
    if (!current || current.kind === "drawing") return data;
    const at = current.element.position;
    if (at.x === position.x && at.y === position.y) return data;
    const move = <T extends { id: string; position: Position }>(list: T[]) =>
        list.map((e) => (e.id === id ? { ...e, position: { ...position } } : e));
    return { ...data, players: move(data.players), equipment: move(data.equipment), annotations: move(data.annotations) };
}

// ============================================================================
// Placement (board adds) and limits
// ============================================================================

/** Shortest stroke (first point to last, in feet) worth keeping; shorter is a tap. */
const MIN_STROKE_LENGTH_FT = 1;
const STROKE_WIDTH = 2;

export function placePlayer(data: PlayData, position: Position, role: PlayerRole, id: string): PlayData {
    const player: PlayerIcon = { id, position: { ...position }, role, label: "", color: ROLE_DEFAULT_COLORS[role] };
    return { ...data, players: [...data.players, player] };
}

export function placeEquipment(data: PlayData, position: Position, kind: EquipmentKind, id: string): PlayData {
    const item: EquipmentItem = { id, kind, position: { ...position }, rotation: 0 };
    return { ...data, equipment: [...data.equipment, item] };
}

/**
 * Appends a finished stroke: `[first, last]` for straight paths, simplified
 * points for freehand. Returns `data` itself (same reference) for taps, so
 * callers can skip the update and keep undo history clean.
 */
export function finishStroke(
    data: PlayData,
    rawPoints: Position[],
    options: StrokeOptions,
    color: string,
    id: string
): PlayData {
    if (rawPoints.length < 2) return data;
    const first = rawPoints[0];
    const last = rawPoints[rawPoints.length - 1];
    if (Math.hypot(last.x - first.x, last.y - first.y) < MIN_STROKE_LENGTH_FT) return data;
    const points = options.path === "straight" ? [{ ...first }, { ...last }] : simplifyPoints(rawPoints, 0.5);
    const stroke: DrawingElement = { id, ...options, points, color, strokeWidth: STROKE_WIDTH };
    return { ...data, drawings: [...data.drawings, stroke] };
}

const KIND_LIMITS: Record<ElementKind, { count: (d: PlayData) => number; max: number; noun: string }> = {
    player: { count: (d) => d.players.length, max: C.MAX_PLAYERS, noun: "players" },
    drawing: { count: (d) => d.drawings.length, max: C.MAX_DRAWINGS, noun: "drawings" },
    equipment: { count: (d) => d.equipment.length, max: C.MAX_EQUIPMENT, noun: "equipment items" },
    annotation: { count: (d) => d.annotations.length, max: C.MAX_ANNOTATIONS, noun: "text annotations" },
};

/**
 * Why one more element of `kind` can't be added, or null if it can. Checks the
 * kind's own cap first, then MAX_ELEMENTS_PER_PLAY across all collections.
 */
export function limitMessage(data: PlayData, kind: ElementKind): string | null {
    const limit = KIND_LIMITS[kind];
    if (limit.count(data) >= limit.max) return `A play can have at most ${limit.max} ${limit.noun}.`;
    const total = data.players.length + data.drawings.length + data.equipment.length + data.annotations.length;
    if (total >= C.MAX_ELEMENTS_PER_PLAY) return `A play can have at most ${C.MAX_ELEMENTS_PER_PLAY} elements in total.`;
    return null;
}

// ============================================================================
// Custom ice area (area tool)
// ============================================================================

const snapTo = (value: number, step: number) => Math.round(value / step) * step;

/**
 * One axis of a dragged rectangle: both edges snapped and clamped to
 * [0, max]; a span under `minFt` grows from its low edge, shifted back
 * inside the rink if that overflows.
 */
function snappedSpan(a: number, b: number, snapFt: number, minFt: number, max: number): [number, number] {
    let lo = Math.min(max, Math.max(0, snapTo(Math.min(a, b), snapFt)));
    let hi = Math.min(max, Math.max(0, snapTo(Math.max(a, b), snapFt)));
    if (hi - lo < minFt) {
        hi = lo + minFt;
        if (hi > max) {
            hi = max;
            lo = max - minFt;
        }
    }
    return [lo, hi];
}

/**
 * The custom area a drag from `start` to `end` (rink feet, either direction)
 * describes: snapped to `snapFt`, at least `minFt` on each side, inside the
 * rink. Always valid for `iceAreaSchema`.
 */
export function rectFromDrag(
    start: Position,
    end: Position,
    snapFt: number = AREA_SNAP_FT,
    minFt: number = MIN_AREA_FT
): RinkRect {
    const [x0, x1] = snappedSpan(start.x, end.x, snapFt, minFt, RINK_WIDTH_FT);
    const [y0, y1] = snappedSpan(start.y, end.y, snapFt, minFt, RINK_HEIGHT_FT);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** An area-tool press released under this far from where it started, in both axes, is a click. */
const AREA_CLICK_FT = 1;

/**
 * True when an area-tool gesture from `start` to `end` (rink feet) is a click,
 * not a drag: it moved less than 1 ft in both axes. A click records no area.
 */
export function isAreaClick(start: Position, end: Position): boolean {
    return Math.abs(end.x - start.x) < AREA_CLICK_FT && Math.abs(end.y - start.y) < AREA_CLICK_FT;
}

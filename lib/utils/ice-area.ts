/**
 * Ice-area resolver for the practice planner (phase 2a). Pure: safe to import
 * from Server Actions and Client Components. Phase 2b reads
 * `areaRect(playData.area)` for station layout and overlap checks, so this
 * module is that contract.
 */
import type { IceArea, IceAreaPreset, PlayData, Position, RinkRect } from "@/types/practice-planner";
import { isAreaClick, rectFromDrag } from "@/lib/utils/canvas/element-ops";
import { BLUE_LINES, FULL_RINK, RINK_DIMENSIONS } from "@/lib/utils/canvas/rink-renderer";

/** Margin the edit board shows around a drill's area, in feet. */
export const AREA_EDIT_MARGIN_FT = 5;

const RINK_W = RINK_DIMENSIONS.width;
const RINK_H = RINK_DIMENSIONS.height;
const HALF_H = RINK_H / 2;
const NEUTRAL_W = BLUE_LINES.right - BLUE_LINES.left;
const END_W = RINK_W - BLUE_LINES.right;

/**
 * Every preset's rectangle in rink feet. Full ice, the halves and the zones
 * span the rink's height; a quarter is a zone's top or bottom half.
 */
const PRESET_RECTS: Record<IceAreaPreset, Readonly<RinkRect>> = {
    full: { x: 0, y: 0, w: RINK_W, h: RINK_H },
    "half-left": { x: 0, y: 0, w: RINK_W / 2, h: RINK_H },
    "half-right": { x: RINK_W / 2, y: 0, w: RINK_W / 2, h: RINK_H },
    "zone-left": { x: 0, y: 0, w: BLUE_LINES.left, h: RINK_H },
    "zone-neutral": { x: BLUE_LINES.left, y: 0, w: NEUTRAL_W, h: RINK_H },
    "zone-right": { x: BLUE_LINES.right, y: 0, w: END_W, h: RINK_H },
    "zone-left-top": { x: 0, y: 0, w: BLUE_LINES.left, h: HALF_H },
    "zone-left-bottom": { x: 0, y: HALF_H, w: BLUE_LINES.left, h: HALF_H },
    "zone-neutral-top": { x: BLUE_LINES.left, y: 0, w: NEUTRAL_W, h: HALF_H },
    "zone-neutral-bottom": { x: BLUE_LINES.left, y: HALF_H, w: NEUTRAL_W, h: HALF_H },
    "zone-right-top": { x: BLUE_LINES.right, y: 0, w: END_W, h: HALF_H },
    "zone-right-bottom": { x: BLUE_LINES.right, y: HALF_H, w: END_W, h: HALF_H },
};

/** True for a missing area and for an explicit `{ kind: "full" }`. */
export function isFullIce(area?: IceArea): boolean {
    return area === undefined || area.kind === "full";
}

/**
 * The area's rectangle in rink feet (a fresh object). A preset kind this build
 * doesn't know (data written by a newer build) is drawn as full ice rather
 * than throwing; the strict schema still refuses it on write.
 */
export function areaRect(area?: IceArea): RinkRect {
    if (!area) return { ...FULL_RINK };
    if (area.kind === "custom") return { ...area.rect };
    const preset = PRESET_RECTS[area.kind] as Readonly<RinkRect> | undefined;
    return preset ? { ...preset } : { ...FULL_RINK };
}

/** What the edit board fits: the area plus a margin, clamped to the rink; the whole rink for full ice. */
export function editViewport(area?: IceArea, marginFt: number = AREA_EDIT_MARGIN_FT): RinkRect {
    if (isFullIce(area)) return { ...FULL_RINK };
    const r = areaRect(area);
    const x0 = Math.max(0, r.x - marginFt);
    const y0 = Math.max(0, r.y - marginFt);
    const x1 = Math.min(RINK_W, r.x + r.w + marginFt);
    const y1 = Math.min(RINK_H, r.y + r.h + marginFt);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Edges count as inside. */
export function rectContains(rect: RinkRect, p: Position): boolean {
    return p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h;
}

/**
 * Elements lying outside `rect`: players, equipment and annotations by
 * position; a drawing if any of its points is outside.
 */
export function countElementsOutside(data: PlayData, rect: RinkRect): number {
    const outside = (p: Position) => !rectContains(rect, p);
    return (
        data.players.filter((e) => outside(e.position)).length +
        data.equipment.filter((e) => outside(e.position)).length +
        data.annotations.filter((e) => outside(e.position)).length +
        data.drawings.filter((d) => d.points.some(outside)).length
    );
}

/** Value equality; every full-ice form (missing, `{ kind: "full" }`) is equal. */
export function sameArea(a?: IceArea, b?: IceArea): boolean {
    if (isFullIce(a) || isFullIce(b)) return isFullIce(a) && isFullIce(b);
    if (!a || !b || a.kind !== b.kind) return false;
    if (a.kind === "custom" && b.kind === "custom") {
        return a.rect.x === b.rect.x && a.rect.y === b.rect.y && a.rect.w === b.rect.w && a.rect.h === b.rect.h;
    }
    return true;
}

/**
 * Sets a drill's area. Full ice removes the key, so a reset drill matches a
 * pre-2a one. Returns `data` itself when nothing changes, so callers can skip
 * recording an undo step; an explicit `{ kind: "full" }` is still normalized
 * away, since `sameArea` treats it as equal to a missing area.
 */
export function withArea(data: PlayData, area: IceArea | undefined): PlayData {
    if (sameArea(data.area, area) && data.area?.kind !== "full") return data;
    const next: PlayData = { ...data };
    delete next.area;
    if (!area || isFullIce(area)) return next;
    next.area = area.kind === "custom" ? { kind: "custom", rect: { ...area.rect } } : { kind: area.kind };
    return next;
}

/**
 * The rectangle the board masks to. While an area-tool drag is past a bare
 * click it previews the snapped rectangle; otherwise it is the stored area, so
 * a mouse-down alone never flashes a minimum-size preview.
 */
export function areaMaskRect(drag: { start: Position; end: Position } | null, area?: IceArea): RinkRect {
    if (drag && !isAreaClick(drag.start, drag.end)) return rectFromDrag(drag.start, drag.end);
    return areaRect(area);
}

/** Glyph sizes in rink feet. Shared by renderers and hit-testing. */
import type { EquipmentKind } from "@/types/practice-planner";

export const PLAYER_RADIUS_FT = 6;
export const MIN_GLYPH_RADIUS_PX = 8;

export const EQUIPMENT_RADIUS_FT: Record<EquipmentKind, number> = {
    puck: 0.75,
    puckPile: 2,
    cone: 1.5,
    pylon: 1.5,
    tire: 2,
    net: 3,
};

/**
 * `zoom` is the canvas scale applied on top of the user-space radius; `minPx`
 * (the board's 8 px by default) is divided by it so a glyph never renders
 * below it on screen. Thumbnail-style diagrams pass a much smaller minimum.
 */
export function glyphRadiusPx(radiusFt: number, pxPerFt: number, zoom: number = 1, minPx: number = MIN_GLYPH_RADIUS_PX): number {
    return Math.max(radiusFt * pxPerFt, minPx / zoom);
}

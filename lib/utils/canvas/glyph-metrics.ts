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
 * `zoom` is the canvas scale applied on top of the user-space radius; the
 * minimum is divided by it so the glyph never renders below MIN_GLYPH_RADIUS_PX on screen.
 */
export function glyphRadiusPx(radiusFt: number, pxPerFt: number, zoom: number = 1): number {
    return Math.max(radiusFt * pxPerFt, MIN_GLYPH_RADIUS_PX / zoom);
}

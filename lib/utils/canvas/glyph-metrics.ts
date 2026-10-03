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

export function glyphRadiusPx(radiusFt: number, pxPerFt: number): number {
    return Math.max(radiusFt * pxPerFt, MIN_GLYPH_RADIUS_PX);
}

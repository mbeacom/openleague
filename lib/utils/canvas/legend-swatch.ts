/**
 * One legend symbol's sample (practice board notation). Shared by the
 * on-screen LegendSwatch and the bench sheet document exports, so a symbol
 * looks the same everywhere. Draws in logical px; callers scale for density.
 */
import type { StrokeAction } from "@/types/practice-planner";
import type { LegendEntry } from "./legend";
import { buildStrokeGeometry } from "./stroke-geometry";
import { paintStrokeGeometry } from "./drawing-utils";
import { drawEquipmentGlyph, drawPlayerGlyph } from "./glyphs";
import { ROLE_DEFAULT_COLORS } from "./notation";
import { DIAGRAM_THEME } from "./diagram-theme";
import { REFERENCE_PX_PER_FT } from "./scale";

export const LEGEND_SWATCH_SIZE = { width: 40, height: 20 } as const;

// Swatches are drawn at the reference board's scale, so they show the board's look.
const SWATCH_PX_PER_FT = REFERENCE_PX_PER_FT;

export function paintLegendSwatch(ctx: CanvasRenderingContext2D, entry: LegendEntry): void {
    const W = LEGEND_SWATCH_SIZE.width;
    const H = LEGEND_SWATCH_SIZE.height;
    ctx.clearRect(0, 0, W, H);
    const center = { x: W / 2, y: H / 2 };
    const strokeSwatch = (action: StrokeAction, end: "arrow" | "stop") => {
        const geometry = buildStrokeGeometry(
            { action, path: "straight", end, points: [{ x: 4, y: H / 2 }, { x: W - 6, y: H / 2 }], strokeWidth: 2 },
            SWATCH_PX_PER_FT
        );
        paintStrokeGeometry(ctx, geometry, DIAGRAM_THEME.ink, SWATCH_PX_PER_FT);
    };
    switch (entry.type) {
        case "action":
            strokeSwatch(entry.action, "arrow");
            break;
        case "end":
            strokeSwatch("skate", "stop");
            break;
        case "role":
            drawPlayerGlyph(ctx, { id: "", role: entry.role, label: "", color: ROLE_DEFAULT_COLORS[entry.role], position: { x: 0, y: 0 } }, center, 8, false);
            break;
        case "equipment":
            drawEquipmentGlyph(ctx, { kind: entry.kind, rotation: 0 }, center, 8, false);
            break;
    }
}

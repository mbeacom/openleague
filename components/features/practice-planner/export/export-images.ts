/**
 * The canvas half of the bench sheet exports: diagrams exactly as the printed
 * bench sheet draws them, and legend swatches with the legend's own painter.
 * A drawing failure is logged and returns null, which the files show as
 * "Diagram unavailable" (or a label without its swatch); it never fails the export.
 */
import { generateThumbnail } from "@/lib/utils/canvas/thumbnail-generator";
import { LEGEND_SWATCH_SIZE, paintLegendSwatch } from "@/lib/utils/canvas/legend-swatch";
import { PRINT_DIAGRAM_SIZE } from "../print/PrintDiagram";
import type { BenchSheetRenderers } from "./bench-sheet-model";

const SWATCH_PIXEL_RATIO = 2;

export const canvasRenderers: BenchSheetRenderers = {
    diagram(playData, pixelRatio) {
        try {
            return generateThumbnail(playData, { width: PRINT_DIAGRAM_SIZE.width, height: PRINT_DIAGRAM_SIZE.height, pixelRatio });
        } catch (error) {
            console.warn("Bench sheet export: a diagram couldn't be drawn:", error);
            return null;
        }
    },
    swatch(entry) {
        try {
            const canvas = document.createElement("canvas");
            canvas.width = LEGEND_SWATCH_SIZE.width * SWATCH_PIXEL_RATIO;
            canvas.height = LEGEND_SWATCH_SIZE.height * SWATCH_PIXEL_RATIO;
            const ctx = canvas.getContext("2d");
            if (!ctx) return null;
            ctx.scale(SWATCH_PIXEL_RATIO, SWATCH_PIXEL_RATIO);
            paintLegendSwatch(ctx, entry);
            return canvas.toDataURL("image/png");
        } catch (error) {
            console.warn(`Bench sheet export: the "${entry.label}" legend swatch couldn't be drawn:`, error);
            return null;
        }
    },
};

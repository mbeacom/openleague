/** paintLegendSwatch: the legend's swatch drawing, shared by LegendSwatch and the document exports. */
import { describe, expect, it, vi } from "vitest";
import { LEGEND_SWATCH_SIZE, paintLegendSwatch } from "@/lib/utils/canvas/legend-swatch";
import type { LegendEntry } from "@/lib/utils/canvas/legend";
import { BOARD_COLORS, ROLE_DEFAULT_COLORS } from "@/lib/utils/canvas/notation";

/**
 * vitest.setup.ts's 2d context mock (measureText returns a width), wrapped so
 * any method it lacks (setLineDash, …) exists as a recording vi.fn too.
 */
let strokeStyles: string[] = [];
let fillStyles: string[] = [];

function recordingContext() {
    strokeStyles = [];
    fillStyles = [];
    const base = document.createElement("canvas").getContext("2d") as unknown as Record<string | symbol, unknown>;
    return new Proxy(base, {
        get(t, key) {
            if (!(key in t)) t[key] = vi.fn();
            return t[key];
        },
        set(t, key, value) {
            // Record every colour assignment: the property itself only keeps the last.
            if (key === "strokeStyle") strokeStyles.push(String(value));
            if (key === "fillStyle") fillStyles.push(String(value));
            t[key] = value;
            return true;
        },
    }) as unknown as CanvasRenderingContext2D & Record<string, ReturnType<typeof vi.fn>>;
}

const ENTRIES: LegendEntry[] = [
    { key: "action-pass", label: "Pass", type: "action", action: "pass" },
    { key: "end-stop", label: "Stop", type: "end", end: "stop" },
    { key: "role-F", label: "Forward", type: "role", role: "F" },
    { key: "equipment-puck", label: "Puck", type: "equipment", kind: "puck" },
];

describe("paintLegendSwatch", () => {
    it("is 40×20", () => {
        expect(LEGEND_SWATCH_SIZE).toEqual({ width: 40, height: 20 });
    });

    it.each(ENTRIES)("clears the canvas before painting the $type swatch", (entry) => {
        const ctx = recordingContext();
        paintLegendSwatch(ctx, entry);
        expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 40, 20);
    });

    it("paints an action swatch as a stroked line in board ink", () => {
        const ctx = recordingContext();
        paintLegendSwatch(ctx, ENTRIES[0]);
        expect(ctx.stroke).toHaveBeenCalled();
        expect(strokeStyles).toContain(BOARD_COLORS.ink);
        expect(ctx.lineTo).toHaveBeenCalled();
    });

    it("paints an end swatch as a stroked stop in board ink", () => {
        const ctx = recordingContext();
        paintLegendSwatch(ctx, ENTRIES[1]);
        expect(ctx.stroke).toHaveBeenCalled();
        expect(strokeStyles).toContain(BOARD_COLORS.ink);
    });

    it("paints a role swatch as a filled circle in the role's colour", () => {
        const ctx = recordingContext();
        paintLegendSwatch(ctx, ENTRIES[2]);
        expect(ctx.arc).toHaveBeenCalled();
        expect(ctx.fill).toHaveBeenCalled();
        expect(fillStyles).toContain(ROLE_DEFAULT_COLORS.F);
    });

    it("paints an equipment swatch as a glyph", () => {
        const ctx = recordingContext();
        paintLegendSwatch(ctx, ENTRIES[3]);
        const drew = ["stroke", "fill", "arc", "fillRect"].some((m) => ctx[m].mock.calls.length > 0);
        expect(drew).toBe(true);
    });
});

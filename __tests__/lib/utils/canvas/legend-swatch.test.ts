/** paintLegendSwatch: the legend's swatch drawing, shared by LegendSwatch and the document exports. */
import { describe, expect, it, vi } from "vitest";
import { LEGEND_SWATCH_SIZE, paintLegendSwatch } from "@/lib/utils/canvas/legend-swatch";
import type { LegendEntry } from "@/lib/utils/canvas/legend";

/**
 * vitest.setup.ts's 2d context mock (measureText returns a width), wrapped so
 * any method it lacks (setLineDash, …) exists as a recording vi.fn too.
 */
function recordingContext() {
    const base = document.createElement("canvas").getContext("2d") as unknown as Record<string | symbol, unknown>;
    return new Proxy(base, {
        get(t, key) {
            if (!(key in t)) t[key] = vi.fn();
            return t[key];
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

    it.each(ENTRIES)("clears and paints the $type swatch", (entry) => {
        const ctx = recordingContext();
        paintLegendSwatch(ctx, entry);
        expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 40, 20);
        const drew = ["stroke", "fill", "arc", "lineTo", "fillRect"].some((m) => ctx[m].mock.calls.length > 0);
        expect(drew).toBe(true);
    });
});

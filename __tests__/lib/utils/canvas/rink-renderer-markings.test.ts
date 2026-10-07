import { describe, expect, it } from "vitest";
import { createTransformContext, drawRink } from "@/lib/utils/canvas/rink-renderer";

type Call = { name: string; args: unknown[]; lineWidth: number };

/** Records each call with the lineWidth in effect; `transform` is what getTransform reports (null: no getTransform). */
function recordingCtx(transform: { a: number; b: number; c: number; d: number; e: number; f: number } | null) {
    const calls: Call[] = [];
    const state: Record<string, unknown> = { lineWidth: 1 };
    const target: Record<string, unknown> = transform ? { getTransform: () => transform } : {};
    const ctx = new Proxy(target, {
        get: (t, prop) => {
            if (typeof prop !== "string") return undefined;
            if (prop in t) return t[prop];
            if (prop in state) return state[prop];
            return (...args: unknown[]) => { calls.push({ name: prop, args, lineWidth: state.lineWidth as number }); return { width: 10 }; };
        },
        set: (_t, prop, value) => { if (typeof prop === "string") state[prop] = value; return true; },
    }) as unknown as CanvasRenderingContext2D;
    return { ctx, calls };
}

const strokeWidths = (calls: Call[]) => calls.filter((c) => c.name === "stroke").map((c) => c.lineWidth);

describe("rink markings (scale model)", () => {
    it("draws the boards, circles and creases as today on the reference board", () => {
        const { ctx, calls } = recordingCtx(null);
        drawRink(ctx, createTransformContext(800, 400), { cache: false }); // 3.8 px/ft
        const widths = strokeWidths(calls);
        expect(widths).toContain(3); // boards
        expect(widths).toContain(2); // circles and creases
    });

    it("scales them with the rink on a thumbnail, down to the 1 px floor", () => {
        const { ctx, calls } = recordingCtx(null);
        const thumb = createTransformContext(300, 128, 10); // height-bound: about 1.27 px/ft
        drawRink(ctx, thumb, { cache: false });
        const widths = strokeWidths(calls);
        expect(widths.some((w) => Math.abs(w - 3 * (thumb.scaleX / 3.8)) < 1e-9)).toBe(true); // boards ≈ 1.0
        expect(widths).not.toContain(3);
        expect(widths).not.toContain(2);
        expect(Math.min(...widths)).toBeGreaterThanOrEqual(1);
    });

    it("puts the vertical lines on the device pixel grid when the transform allows", () => {
        const { ctx, calls } = recordingCtx({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 });
        drawRink(ctx, createTransformContext(800, 400), { cache: false });
        // The 1 ft lines (3.8 px, 7.6 device px, drawn 8 device px wide): center red, two blue, two goal lines;
        // the outline's straight runs are 3 px wide.
        const verticals = calls.filter((c, i) =>
            c.name === "moveTo" && Math.abs(c.lineWidth - 4) < 1e-9 &&
            calls[i + 1]?.name === "lineTo" && (calls[i + 1].args[0] as number) === (c.args[0] as number));
        expect(verticals).toHaveLength(5);
        for (const v of verticals) {
            const deviceX = 2 * (v.args[0] as number);
            const offset = Math.round(v.lineWidth * 2) % 2 ? 0.5 : 0; // 8 device px, even: whole pixels
            const onGrid = deviceX - offset;
            expect(Math.abs(onGrid - Math.round(onGrid)), `x ${v.args[0]}`).toBeLessThan(1e-9);
        }
    });

    it("rounds the vertical lines' width to whole device pixels", () => {
        const { ctx, calls } = recordingCtx({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 });
        drawRink(ctx, createTransformContext(800, 400), { cache: false });
        const widths = strokeWidths(calls);
        expect(widths).not.toContain(3.8);
        expect(widths.filter((w) => w === 4)).toHaveLength(5);
    });

    it("draws unsnapped without getTransform", () => {
        const { ctx, calls } = recordingCtx(null);
        expect(() => drawRink(ctx, createTransformContext(800, 400), { cache: false })).not.toThrow();
        expect(calls.some((c) => c.name === "stroke")).toBe(true);
    });
});

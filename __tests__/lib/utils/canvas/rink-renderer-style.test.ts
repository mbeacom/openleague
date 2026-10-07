import { describe, expect, it } from "vitest";
import { createTransformContext, drawRink } from "@/lib/utils/canvas/rink-renderer";
import { DIAGRAM_THEME } from "@/lib/utils/canvas/diagram-theme";

type Call = { name: string; args: unknown[]; state: Record<string, unknown> };

/** Records calls with the fill/stroke state in effect; `gradients` controls createRadialGradient support. */
function recordingCtx(gradients: boolean) {
    const calls: Call[] = [];
    const state: Record<string, unknown> = { lineWidth: 1 };
    const stops: Array<[number, string]> = [];
    const target: Record<string, unknown> = gradients
        ? { createRadialGradient: () => ({ addColorStop: (o: number, c: string) => stops.push([o, c]) }) }
        : {};
    const ctx = new Proxy(target, {
        get: (t, prop) => {
            if (typeof prop !== "string") return undefined;
            if (prop in t) return t[prop];
            if (prop in state) return state[prop];
            return (...args: unknown[]) => { calls.push({ name: prop, args, state: { ...state } }); return { width: 10 }; };
        },
        set: (_t, prop, value) => { if (typeof prop === "string") state[prop] = value; return true; },
    }) as unknown as CanvasRenderingContext2D;
    return { ctx, calls, stops };
}

const board = createTransformContext(800, 400);

describe("playbook rink (spec §3)", () => {
    it("fills the ice with a soft radial lightening toward center ice", () => {
        const { ctx, stops } = recordingCtx(true);
        drawRink(ctx, board, { cache: false });
        expect(stops).toEqual([[0, DIAGRAM_THEME.iceCenter], [1, DIAGRAM_THEME.ice]]);
    });

    it("fills the ice flat when the context has no gradients", () => {
        const { ctx, calls } = recordingCtx(false);
        expect(() => drawRink(ctx, board, { cache: false })).not.toThrow();
        expect(calls.some((c) => c.name === "fill" && c.state.fillStyle === DIAGRAM_THEME.ice)).toBe(true);
    });

    it("draws the boards as a double line: League Blue outside, the kick plate inside", () => {
        const { ctx, calls } = recordingCtx(false);
        drawRink(ctx, board, { cache: false });
        const strokes = calls.filter((c) => c.name === "stroke").map((c) => c.state.strokeStyle);
        expect(strokes).toContain(DIAGRAM_THEME.boards);
        expect(strokes).toContain(DIAGRAM_THEME.kickPlate);
    });

    it("shades the ice along the boards", () => {
        const { ctx, calls } = recordingCtx(false);
        drawRink(ctx, board, { cache: false });
        expect(calls.some((c) => c.name === "stroke" && c.state.strokeStyle === DIAGRAM_THEME.iceEdgeShadow)).toBe(true);
    });

    it("adds hash marks where hockey has them: top and bottom of each end-zone circle, toward the side boards", () => {
        const { ctx, calls } = recordingCtx(false);
        drawRink(ctx, board, { cache: false });
        const ft = board.scaleX;
        // 2 ft marks parallel to the goal line (vertical here), sticking out from the circle toward the boards.
        const hashes = calls.flatMap((c, i) => {
            const next = calls[i + 1];
            if (c.name !== "moveTo" || c.state.strokeStyle !== DIAGRAM_THEME.redLine || next?.name !== "lineTo") return [];
            const [x0, y0] = c.args as number[];
            const [x1, y1] = next.args as number[];
            return Math.abs(x1 - x0) < 1e-9 && Math.abs(Math.abs(y1 - y0) - 2 * ft) < 1e-9 ? [{ x0, y0, y1 }] : [];
        });
        expect(hashes).toHaveLength(16); // 4 circles × top and bottom × 2 marks
        for (const h of hashes) {
            // Each points away from its circle's center line, toward the nearer side boards.
            const centerY = h.y0 < board.offsetY + 42.5 * ft ? 20.5 : 64.5;
            const cy = board.offsetY + centerY * ft;
            expect(Math.sign(h.y1 - h.y0)).toBe(Math.sign(h.y0 - cy));
        }
    });

    it("fills the creases light blue", () => {
        const { ctx, calls } = recordingCtx(false);
        drawRink(ctx, board, { cache: false });
        expect(calls.some((c) => c.name === "fill" && c.state.fillStyle === DIAGRAM_THEME.creaseFill)).toBe(true);
        expect(DIAGRAM_THEME.creaseFill).toBe("rgba(155, 198, 232, 0.6)");
    });
});

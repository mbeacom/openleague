/**
 * Rink markings are clipped to the rounded rink outline, so the goal lines and
 * anything else near the ends stop at the boards instead of running past the
 * curved corners; the boards are stroked after the clip is released.
 */
import { DIAGRAM_THEME } from "@/lib/utils/canvas/diagram-theme";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    clearRinkCache,
    createTransformContext,
    drawRink,
    rinkOutline,
    rinkToCanvas,
    type TransformContext,
} from "@/lib/utils/canvas/rink-renderer";

type Call = { name: string; args: unknown[]; strokeStyle?: unknown };

function recordingCtx(calls: Call[]): CanvasRenderingContext2D {
    const target: Record<string, unknown> = {};
    return new Proxy(target, {
        get(t, prop) {
            if (typeof prop !== "string") return undefined;
            if (prop in t) return t[prop];
            return (...args: unknown[]) => {
                calls.push({ name: prop, args, strokeStyle: t.strokeStyle });
            };
        },
        set(t, prop, value) {
            if (typeof prop === "string") t[prop] = value;
            return true;
        },
    }) as unknown as CanvasRenderingContext2D;
}

const t = createTransformContext(800, 400, 20);

function outlineArgs(transform: TransformContext): number[] {
    const o = rinkOutline(transform);
    return [o.x, o.y, o.width, o.height, o.radius];
}

/** Asserts the clip → markings → restore → boards order on one recorded draw. */
function expectClippedMarkings(calls: Call[], transform: TransformContext): void {
    // Two clips to the outline: the ice's edge shadow (spec §3), then the markings.
    const clipIndexes = calls.flatMap((c, i) => (c.name === "clip" ? [i] : []));
    expect(clipIndexes).toHaveLength(2);
    const clip = clipIndexes[1];

    // The clip path is the rink outline, freshly begun.
    expect(calls[clip - 1].name).toBe("roundRect");
    expect(calls[clip - 1].args).toEqual(outlineArgs(transform));
    expect(calls[clip - 2].name).toBe("beginPath");
    expect(calls[clip - 3].name).toBe("save");

    const restore = calls.findIndex((c, i) => i > clip && c.name === "restore");
    expect(restore).toBeGreaterThan(clip);

    // Every red line and circle is drawn inside the clip.
    const red = calls.flatMap((c, i) => (c.name === "stroke" && c.strokeStyle === "#C8102E" ? [i] : []));
    expect(red.length).toBeGreaterThan(0);
    for (const i of red) {
        expect(i).toBeGreaterThan(clip);
        expect(i).toBeLessThan(restore);
    }

    // The goal line is one of them, and it still spans the full rink height.
    const leftGoalTop = rinkToCanvas({ x: 11, y: 0 }, transform);
    const goalMove = calls.findIndex(
        (c) => c.name === "moveTo" && c.args[0] === leftGoalTop.x && c.args[1] === leftGoalTop.y
    );
    expect(goalMove).toBeGreaterThan(clip);
    expect(goalMove).toBeLessThan(restore);

    // The boards are stroked after the restore, along the same outline.
    // Boards and blue lines share League Blue (spec §3): the boards are the first such stroke after the restore.
    const boardStroke = calls.findIndex((c, i) => i > restore && c.name === "stroke" && c.strokeStyle === DIAGRAM_THEME.boards);
    expect(boardStroke).toBeGreaterThan(restore);
    expect(calls[boardStroke - 1].name).toBe("roundRect");
    expect(calls[boardStroke - 1].args).toEqual(outlineArgs(transform));
}

describe("rinkOutline", () => {
    it("is the 200x85 ft rink with 28 ft corners, in canvas pixels", () => {
        const o = rinkOutline(t);
        const topLeft = rinkToCanvas({ x: 0, y: 0 }, t);
        const bottomRight = rinkToCanvas({ x: 200, y: 85 }, t);
        expect(o.x).toBe(topLeft.x);
        expect(o.y).toBe(topLeft.y);
        expect(o.width).toBeCloseTo(bottomRight.x - topLeft.x, 9);
        expect(o.height).toBeCloseTo(bottomRight.y - topLeft.y, 9);
        expect(o.radius).toBeCloseTo(28 * t.scaleX, 9);
    });

    it("leaves the goal-line ends outside the rounded corners", () => {
        // At x = 11 ft the corner arc (centre 28,28, radius 28) is well below y = 0,
        // which is why the unclipped goal line used to run off the ice.
        const dx = 28 - 11;
        const arcTopY = 28 - Math.sqrt(28 * 28 - dx * dx);
        expect(arcTopY).toBeGreaterThan(5);
    });
});

describe("drawRink clipping", () => {
    beforeEach(() => clearRinkCache());
    afterEach(() => {
        vi.restoreAllMocks();
        clearRinkCache();
    });

    it("clips the markings on the direct path", () => {
        const calls: Call[] = [];
        drawRink(recordingCtx(calls), t, { cache: false });
        expectClippedMarkings(calls, t);
    });

    it("clips the markings in the cached background", () => {
        const built: Call[][] = [];
        const real = document.createElement.bind(document);
        vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
            if (tag !== "canvas") return real(tag);
            const calls: Call[] = [];
            built.push(calls);
            const ctx = recordingCtx(calls);
            return { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
        }) as typeof document.createElement);

        const scaled = createTransformContext(1600, 800, 20); // a pixelRatio-2 thumbnail-sized transform
        const out: Call[] = [];
        drawRink(recordingCtx(out), scaled);

        expect(built).toHaveLength(1);
        expectClippedMarkings(built[0], scaled);
        expect(out.map((c) => c.name)).toEqual(["drawImage"]);
    });
});

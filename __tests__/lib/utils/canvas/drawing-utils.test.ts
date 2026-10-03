import { describe, it, expect, vi, afterEach } from "vitest";
import { drawStroke, drawAreaMask, drawBoardScene } from "@/lib/utils/canvas/drawing-utils";
import { clearRinkCache, createTransformContext, FULL_RINK, rinkToCanvas } from "@/lib/utils/canvas/rink-renderer";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { areaRect } from "@/lib/utils/ice-area";
import { STROKE_ACTIONS, STROKE_ENDS } from "@/types/practice-planner";

function mockCtx() {
    return {
        beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), fill: vi.fn(), closePath: vi.fn(),
        strokeStyle: "", fillStyle: "", lineWidth: 1, lineCap: "", lineJoin: "",
    } as unknown as CanvasRenderingContext2D & Record<string, ReturnType<typeof vi.fn>>;
}

const transform = createTransformContext(800, 400);
const points = [{ x: 20, y: 40 }, { x: 120, y: 40 }];

describe("drawStroke", () => {
    it.each(STROKE_ACTIONS)("strokes %s without throwing", (action) => {
        const ctx = mockCtx();
        drawStroke(ctx, { action, path: "straight", end: "none", points, color: "#1976D2", strokeWidth: 2 }, transform);
        expect(ctx.stroke).toHaveBeenCalled();
        expect(ctx.strokeStyle).toBe("#1976D2");
    });

    it.each(STROKE_ENDS)("renders end cap %s", (end) => {
        const ctx = mockCtx();
        drawStroke(ctx, { action: "skate", path: "straight", end, points, color: "#000000", strokeWidth: 2 }, transform);
        if (end === "arrow") expect(ctx.fill).toHaveBeenCalledTimes(1);
        else expect(ctx.fill).not.toHaveBeenCalled();
    });
});

type Call = { name: string; args: unknown[] };

/** Records every method call in order; property writes are stored. */
function recordingCtx(calls: Call[]): CanvasRenderingContext2D {
    const target: Record<string, unknown> = {};
    return new Proxy(target, {
        get(t, prop) {
            if (typeof prop !== "string") return undefined;
            if (prop in t) return t[prop];
            return (...args: unknown[]) => {
                calls.push({ name: prop, args });
                return { width: 10 };
            };
        },
        set(t, prop, value) {
            if (typeof prop === "string") t[prop] = value;
            return true;
        },
    }) as unknown as CanvasRenderingContext2D;
}

describe("drawAreaMask", () => {
    const t = createTransformContext(800, 400);

    it("draws nothing for the whole rink", () => {
        const calls: Call[] = [];
        drawAreaMask(recordingCtx(calls), FULL_RINK, t);
        expect(calls).toEqual([]);
    });

    it("shades the rink outside the area and outlines it, dashed, in Action Blue", () => {
        const calls: Call[] = [];
        const ctx = recordingCtx(calls);
        const rect = areaRect({ kind: "zone-neutral" });
        drawAreaMask(ctx, rect, t);
        const names = calls.map((c) => c.name);
        expect(names[0]).toBe("save");
        expect(names.at(-1)).toBe("restore");
        expect(calls.filter((c) => c.name === "rect")).toHaveLength(2);
        expect(calls.find((c) => c.name === "fill")?.args).toEqual(["evenodd"]);
        expect(calls.find((c) => c.name === "setLineDash")?.args).toEqual([[8, 6]]);
        const tl = rinkToCanvas({ x: rect.x, y: rect.y }, t);
        const br = rinkToCanvas({ x: rect.x + rect.w, y: rect.y + rect.h }, t);
        expect(calls.find((c) => c.name === "strokeRect")?.args).toEqual([tl.x, tl.y, br.x - tl.x, br.y - tl.y]);
        expect((ctx as unknown as Record<string, unknown>).strokeStyle).toBe("#1976D2");
    });

    it("draws a 2 px, [8, 6] outline at zoom 1 (thumbnails)", () => {
        const calls: Call[] = [];
        const ctx = recordingCtx(calls);
        drawAreaMask(ctx, areaRect({ kind: "zone-left" }), t);
        expect((ctx as unknown as Record<string, unknown>).lineWidth).toBe(2);
        expect(calls.find((c) => c.name === "setLineDash")?.args).toEqual([[8, 6]]);
    });

    it("divides the outline width and dash by the board zoom, so they stay constant on screen", () => {
        const calls: Call[] = [];
        const ctx = recordingCtx(calls);
        drawAreaMask(ctx, areaRect({ kind: "zone-left" }), t, 2);
        expect((ctx as unknown as Record<string, unknown>).lineWidth).toBe(1);
        expect(calls.find((c) => c.name === "setLineDash")?.args).toEqual([[4, 3]]);
    });
});

describe("drawBoardScene", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        clearRinkCache();
    });

    it("draws the rink, then the elements, then the mask on top", () => {
        clearRinkCache();
        const real = document.createElement.bind(document);
        vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
            if (tag !== "canvas") return real(tag);
            const cacheCtx = recordingCtx([]);
            return { width: 0, height: 0, getContext: () => cacheCtx } as unknown as HTMLCanvasElement;
        }) as typeof document.createElement);

        const calls: Call[] = [];
        const data = {
            ...createEmptyPlayData(),
            players: [{ id: "p", position: { x: 150, y: 40 }, role: "X" as const, label: "", color: "#1976D2" }],
        };
        drawBoardScene(recordingCtx(calls), createTransformContext(800, 400), data, { maskRect: areaRect({ kind: "zone-left" }) });

        const names = calls.map((c) => c.name);
        const rinkAt = names.indexOf("drawImage");
        const glyphAt = names.indexOf("fillText");
        const maskAt = calls.findIndex((c) => c.name === "fill" && c.args[0] === "evenodd");
        expect(rinkAt).toBe(0);
        expect(glyphAt).toBeGreaterThan(rinkAt);
        expect(maskAt).toBeGreaterThan(glyphAt);
    });

    it("draws no mask without a mask rectangle", () => {
        const calls: Call[] = [];
        drawBoardScene(recordingCtx(calls), createTransformContext(800, 400), createEmptyPlayData());
        expect(calls.some((c) => c.name === "setLineDash")).toBe(false);
    });

    it("passes the zoom to the mask outline", () => {
        const calls: Call[] = [];
        const ctx = recordingCtx(calls);
        drawBoardScene(ctx, createTransformContext(800, 400), createEmptyPlayData(), {
            maskRect: areaRect({ kind: "zone-left" }),
            zoom: 0.5,
        });
        expect((ctx as unknown as Record<string, unknown>).lineWidth).toBe(4);
        expect(calls.find((c) => c.name === "setLineDash")?.args).toEqual([[16, 12]]);
    });
});

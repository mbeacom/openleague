import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
    drawStroke,
    drawAreaMask,
    drawBoardScene,
    drawBoardFrame,
    drawElement,
    drawLineHandles,
    drawSnapRing,
    paintStrokeGeometry,
    LINE_HANDLE_RADIUS_PX,
    SNAP_RING_RADIUS_PX,
} from "@/lib/utils/canvas/drawing-utils";
import { LINE_EDIT_COLORS } from "@/lib/utils/canvas/notation";
import { EQUIPMENT_RADIUS_FT, PLAYER_RADIUS_FT, glyphRadiusPx } from "@/lib/utils/canvas/glyph-metrics";
import type { LineHandle } from "@/lib/utils/canvas/line-editing";
import { CURVE_SAMPLES_PER_SEGMENT, buildStrokeGeometry } from "@/lib/utils/canvas/stroke-geometry";
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

describe("drawBoardFrame", () => {
    let built: number;
    beforeEach(() => {
        clearRinkCache();
        built = 0;
        const real = document.createElement.bind(document);
        vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
            if (tag !== "canvas") return real(tag);
            built++;
            const cacheCtx = recordingCtx([]);
            return { width: 0, height: 0, getContext: () => cacheCtx } as unknown as HTMLCanvasElement;
        }) as typeof document.createElement);
    });
    afterEach(() => {
        vi.restoreAllMocks();
        clearRinkCache();
    });

    const t = createTransformContext(800, 400, 20, { x: 95, y: 25, w: 30, h: 30 });
    const zoned = { ...createEmptyPlayData(), area: { kind: "custom" as const, rect: { x: 100, y: 30, w: 20, h: 20 } } };
    const scene = { maskRect: areaRect(zoned.area) };

    it("clears the whole canvas under an identity transform, then applies zoom/pan, before drawing", () => {
        const calls: Call[] = [];
        drawBoardFrame(recordingCtx(calls), t, zoned, { ...scene, zoom: 0.5, pan: { x: 30, y: -12 } });
        const names = calls.map((c) => c.name);
        const identity = calls.findIndex((c) => c.name === "setTransform" && c.args.join() === "1,0,0,1,0,0");
        const clear = names.indexOf("clearRect");
        const view = calls.findIndex((c) => c.name === "setTransform" && c.args.join() === "0.5,0,0,0.5,30,-12");
        expect(identity).toBeGreaterThanOrEqual(0);
        expect(clear).toBe(identity + 1);
        expect(calls[clear].args).toEqual([0, 0, 800, 400]);
        expect(view).toBeGreaterThan(clear);
        const firstDraw = names.findIndex((n) => ["fill", "fillRect", "drawImage", "stroke", "roundRect"].includes(n));
        expect(firstDraw).toBeGreaterThan(clear);
    });

    it("at pixelRatio 2, clears in CSS pixels under the ratio transform and folds the ratio into zoom and pan", () => {
        const calls: Call[] = [];
        drawBoardFrame(recordingCtx(calls), t, zoned, { ...scene, zoom: 0.5, pan: { x: 30, y: -12 }, pixelRatio: 2 });
        const base = calls.findIndex((c) => c.name === "setTransform" && c.args.join() === "2,0,0,2,0,0");
        const clear = calls.findIndex((c) => c.name === "clearRect");
        const view = calls.findIndex((c) => c.name === "setTransform" && c.args.join() === "1,0,0,1,60,-24");
        expect(base).toBeGreaterThanOrEqual(0);
        expect(clear).toBe(base + 1);
        expect(calls[clear].args).toEqual([0, 0, 800, 400]);
        expect(view).toBeGreaterThan(clear);
    });

    it("draws the rink as vectors above ratio 1, even unzoomed, so it isn't upscaled from a CSS-size cache", () => {
        const calls: Call[] = [];
        drawBoardFrame(recordingCtx(calls), t, zoned, { ...scene, pixelRatio: 2 });
        expect(calls.some((c) => c.name === "drawImage")).toBe(false);
        expect(built).toBe(0);
    });

    it("draws the mask exactly once per frame", () => {
        const calls: Call[] = [];
        drawBoardFrame(recordingCtx(calls), t, zoned, { ...scene, zoom: 2, pan: { x: -100, y: -40 } });
        expect(calls.filter((c) => c.name === "fill" && c.args[0] === "evenodd")).toHaveLength(1);
    });

    it("draws the rink directly, not from the viewport-sized cache, when zoomed or panned", () => {
        for (const view of [{ zoom: 0.5, pan: { x: 0, y: 0 } }, { zoom: 1, pan: { x: 25, y: 0 } }]) {
            const calls: Call[] = [];
            drawBoardFrame(recordingCtx(calls), t, zoned, { ...scene, ...view });
            expect(calls.some((c) => c.name === "drawImage")).toBe(false);
            expect(calls.some((c) => c.name === "roundRect")).toBe(true); // the ice surface
        }
        expect(built).toBe(0);
    });

    it("still uses the cached rink at zoom 1 with no pan", () => {
        const calls: Call[] = [];
        drawBoardFrame(recordingCtx(calls), t, zoned, { ...scene, zoom: 1, pan: { x: 0, y: 0 } });
        expect(built).toBe(1);
        expect(calls.some((c) => c.name === "drawImage")).toBe(true);
        expect(calls.some((c) => c.name === "roundRect")).toBe(false);
    });
});

describe("drawElement selection highlight", () => {
    const element = (path: "straight" | "freehand" | "curve", pts: { x: number; y: number }[]) => ({
        id: "d", action: "skate" as const, path, end: "none" as const, points: pts, color: "#212121", strokeWidth: 2,
    });
    /** lineTo calls in the highlight: everything before the first stroke(). */
    const highlightLineTos = (path: "straight" | "freehand" | "curve", pts: { x: number; y: number }[]) => {
        const calls: Call[] = [];
        drawElement(recordingCtx(calls), element(path, pts), transform, true);
        const firstStroke = calls.findIndex((c) => c.name === "stroke");
        return calls.slice(0, firstStroke).filter((c) => c.name === "lineTo").length;
    };
    const three = [{ x: 20, y: 40 }, { x: 60, y: 20 }, { x: 120, y: 40 }];

    it("follows a curve", () => {
        expect(highlightLineTos("curve", three)).toBe(2 * CURVE_SAMPLES_PER_SEGMENT);
    });

    it("stays on the stored points for straight and freehand lines, as before", () => {
        expect(highlightLineTos("straight", three)).toBe(2);
        expect(highlightLineTos("straight", points)).toBe(1);
        expect(highlightLineTos("freehand", three)).toBe(2);
    });
});

describe("drawLineHandles", () => {
    const handles: LineHandle[] = [
        { kind: "end", index: 0, position: { x: 20, y: 40 } },
        { kind: "end", index: 1, position: { x: 120, y: 40 } },
        { kind: "add", segment: 0, position: { x: 70, y: 40 } },
    ];

    it("draws every handle 7 px on screen, whatever the zoom", () => {
        for (const zoom of [1, 2]) {
            const calls: Call[] = [];
            drawLineHandles(recordingCtx(calls), handles, transform, LINE_EDIT_COLORS, zoom);
            const arcs = calls.filter((c) => c.name === "arc");
            expect(arcs).toHaveLength(3);
            for (const arc of arcs) expect(arc.args[2]).toBeCloseTo(LINE_HANDLE_RADIUS_PX / zoom);
            const mid = rinkToCanvas({ x: 70, y: 40 }, transform);
            expect(arcs[2].args.slice(0, 2)).toEqual([mid.x, mid.y]);
        }
    });

    it("draws a plus on '+' handles only", () => {
        const calls: Call[] = [];
        drawLineHandles(recordingCtx(calls), handles, transform, LINE_EDIT_COLORS);
        expect(calls.filter((c) => c.name === "moveTo")).toHaveLength(2);
    });

    it("draws a polyline's corner as a 14 px square", () => {
        const calls: Call[] = [];
        drawLineHandles(recordingCtx(calls), [{ kind: "corner", index: 1, position: { x: 70, y: 40 } }], transform, LINE_EDIT_COLORS);
        const c = rinkToCanvas({ x: 70, y: 40 }, transform);
        expect(calls.filter((call) => call.name === "arc")).toHaveLength(0);
        expect(calls.find((call) => call.name === "rect")!.args).toEqual([c.x - 7, c.y - 7, 14, 14]);
    });
});

describe("drawSnapRing", () => {
    const pxPerFt = Math.min(transform.scaleX, transform.scaleY);
    const arcs = (calls: Call[]) => calls.filter((c) => c.name === "arc");

    it("rings a line end 14 px on screen, a white halo under a League Blue ring", () => {
        for (const zoom of [1, 2]) {
            const calls: Call[] = [];
            const strokes: { strokeStyle: unknown; lineWidth: unknown }[] = [];
            const recorder = recordingCtx(calls) as unknown as Record<string, unknown>;
            // Each stroke records the style it was drawn with
            const ctx = new Proxy(recorder, {
                get: (t, prop) => (prop === "stroke" ? () => strokes.push({ strokeStyle: t.strokeStyle, lineWidth: t.lineWidth }) : t[prop as string]),
                set: (t, prop, value) => { t[prop as string] = value; return true; },
            }) as unknown as CanvasRenderingContext2D;
            drawSnapRing(ctx, { position: { x: 50, y: 40 }, radiusFt: 0 }, transform, LINE_EDIT_COLORS.snapRing, zoom);
            const c = rinkToCanvas({ x: 50, y: 40 }, transform);
            expect(arcs(calls)).toHaveLength(1);
            expect(arcs(calls)[0].args.slice(0, 3)).toEqual([c.x, c.y, SNAP_RING_RADIUS_PX / zoom]);
            expect(strokes).toEqual([
                { strokeStyle: "#FFFFFF", lineWidth: 6 / zoom },
                { strokeStyle: LINE_EDIT_COLORS.snapRing, lineWidth: 3 / zoom },
            ]);
        }
    });

    it("draws the ring outside the target's glyph at desktop scale", () => {
        for (const zoom of [1, 2]) {
            const calls: Call[] = [];
            drawSnapRing(recordingCtx(calls), { position: { x: 50, y: 40 }, radiusFt: PLAYER_RADIUS_FT }, transform, LINE_EDIT_COLORS.snapRing, zoom);
            const ring = arcs(calls)[0].args[2] as number;
            const glyph = glyphRadiusPx(PLAYER_RADIUS_FT, pxPerFt, zoom);
            expect(glyph).toBeGreaterThan(SNAP_RING_RADIUS_PX / zoom);
            // The halo's inner edge (3 px inside the ring) clears the glyph and its outline (up to 0.11 r past it)
            expect(ring - 3 / zoom).toBeGreaterThan(glyph * 1.11);
        }
    });

    it("clears a small glyph drawn at its on-screen minimum", () => {
        const calls: Call[] = [];
        const zoom = 1;
        drawSnapRing(recordingCtx(calls), { position: { x: 50, y: 40 }, radiusFt: EQUIPMENT_RADIUS_FT.puck }, transform, LINE_EDIT_COLORS.snapRing, zoom);
        const ring = arcs(calls)[0].args[2] as number;
        expect(ring).toBe(SNAP_RING_RADIUS_PX);
        expect(ring - 3).toBeGreaterThan(glyphRadiusPx(EQUIPMENT_RADIUS_FT.puck, pxPerFt, zoom) * 1.11);
    });
});

describe("stroke ends in proportion to the rink (scale model)", () => {
    const arrowLength = (pxPerFt: number, strokeWidth = 2) => {
        const calls: Call[] = [];
        const geometry = buildStrokeGeometry(
            { action: "skate", path: "straight", end: "arrow", points: [{ x: 0, y: 0 }, { x: 500, y: 0 }], strokeWidth },
            pxPerFt
        );
        paintStrokeGeometry(recordingCtx(calls), geometry, "#000", pxPerFt);
        // The arrowhead is moveTo(tip) then two lineTo corners; its length is the tip-to-corner distance along x.
        const head = calls.findIndex((c, i) => c.name === "moveTo" && calls[i + 1]?.name === "lineTo" && calls[i + 2]?.name === "lineTo" && calls[i + 3]?.name === "closePath");
        const [tx] = calls[head].args as number[];
        const [cx] = calls[head + 1].args as number[];
        return (tx - cx) / Math.cos(Math.PI / 6);
    };

    it("keeps today's arrowhead on the reference board", () => {
        expect(arrowLength(3.8)).toBeCloseTo(10);
    });

    it("keeps the same arrowhead-to-rink proportion at thumbnail, board and zoomed scales", () => {
        for (const pxPerFt of [1.9, 3.8, 9.5]) {
            expect(arrowLength(pxPerFt) / pxPerFt, `${pxPerFt} px/ft`).toBeCloseTo(10 / 3.8, 5);
        }
    });

    it("never draws an arrowhead shorter than 4 px", () => {
        // At 0.05 px/ft refPx(10) is 0.13 px and the line is floored to 1 px (5 px of head); the 4 px floor is the
        // lower bound either way, so assert the bound rather than which term wins.
        expect(arrowLength(0.05)).toBeGreaterThanOrEqual(4);
    });

    it("keeps line width to rink in proportion too", () => {
        for (const pxPerFt of [1.9, 3.8, 9.5]) {
            const g = buildStrokeGeometry({ action: "skate", path: "straight", end: "none", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], strokeWidth: 2 }, pxPerFt);
            expect(g.lineWidth / pxPerFt).toBeCloseTo(2 / 3.8, 5);
        }
    });

    it("sizes the selection highlight in proportion: the line plus 4 reference px", () => {
        const widths: number[] = [];
        const calls: Call[] = [];
        const ctx = recordingCtx(calls);
        Object.defineProperty(ctx, "lineWidth", { set: (v: number) => widths.push(v), get: () => widths.at(-1) ?? 1, configurable: true });
        const element = { id: "s", action: "skate" as const, path: "straight" as const, end: "none" as const, points: [{ x: 100, y: 40 }, { x: 110, y: 40 }], color: "#000", strokeWidth: 2 };
        const zoomed = createTransformContext(800, 400, 20, { x: 95, y: 25, w: 30, h: 30 }); // well above 3.8 px/ft
        const pxPerFt = Math.min(zoomed.scaleX, zoomed.scaleY);
        drawElement(ctx, element as never, zoomed, true);
        expect(widths[0]).toBeCloseTo((2 + 4) * (pxPerFt / 3.8));
    });
});

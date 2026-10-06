import { describe, it, expect } from "vitest";
import {
    buildStrokeGeometry,
    catmullRomPath,
    curvePoint,
    resampleByArcLength,
    smoothPath,
    strokeCenterline,
    ACTION_PATTERN,
    CURVE_SAMPLES_PER_SEGMENT,
} from "@/lib/utils/canvas/stroke-geometry";
import { STROKE_ACTIONS, type StrokeAction } from "@/types/practice-planner";

const straight = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
const geom = (action: StrokeAction, end: "arrow" | "stop" | "none" = "arrow", points = straight) =>
    buildStrokeGeometry({ action, path: "straight", end, points, strokeWidth: 2 }, 4);

describe("resampleByArcLength", () => {
    it("spaces points evenly and keeps the endpoint", () => {
        const out = resampleByArcLength(straight, 10);
        expect(out[0]).toEqual({ x: 0, y: 0 });
        expect(out[out.length - 1]).toEqual({ x: 100, y: 0 });
        expect(out.length).toBe(11);
        expect(out[3].x).toBeCloseTo(30);
    });
});

describe("smoothPath", () => {
    it("keeps endpoints and adds points", () => {
        const pts = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }];
        const out = smoothPath(pts);
        expect(out[0]).toEqual(pts[0]);
        expect(out[out.length - 1]).toEqual(pts[2]);
        expect(out.length).toBeGreaterThan(pts.length);
    });
});

describe("buildStrokeGeometry", () => {
    it("has a pattern for every action", () => {
        for (const a of STROKE_ACTIONS) expect(ACTION_PATTERN[a]).toBeDefined();
    });

    it("skate is one straight polyline", () => {
        const g = geom("skate");
        expect(g.polylines).toHaveLength(1);
        expect(g.polylines[0].every((p) => p.y === 0)).toBe(true);
    });

    it("carry is a wave that leaves the centerline on both sides", () => {
        const ys = geom("carry").polylines[0].map((p) => p.y);
        expect(Math.max(...ys)).toBeGreaterThan(1);
        expect(Math.min(...ys)).toBeLessThan(-1);
    });

    it("lateral is a zigzag (piecewise linear, alternating sides)", () => {
        const ys = geom("lateral").polylines[0].map((p) => Math.sign(Math.round(p.y)));
        expect(ys.filter((s) => s > 0).length).toBeGreaterThan(2);
        expect(ys.filter((s) => s < 0).length).toBeGreaterThan(2);
    });

    it("pass is many short dash segments", () => {
        const g = geom("pass");
        expect(g.polylines.length).toBeGreaterThan(5);
        for (const seg of g.polylines) {
            const len = Math.hypot(seg[seg.length - 1].x - seg[0].x, seg[seg.length - 1].y - seg[0].y);
            expect(len).toBeLessThanOrEqual(10.01);
        }
    });

    it("shot is two parallel rails", () => {
        const g = geom("shot");
        expect(g.polylines).toHaveLength(2);
        expect(g.polylines[0][0].y).toBeCloseTo(-g.polylines[1][0].y);
        expect(Math.abs(g.polylines[0][0].y)).toBeGreaterThan(0);
    });

    it("backskate is a centerline plus perpendicular ticks", () => {
        const g = geom("backskate");
        expect(g.polylines.length).toBeGreaterThan(3);
        const tick = g.polylines[1];
        expect(tick[0].x).toBeCloseTo(tick[1].x);
    });

    it("line is thinner than skate", () => {
        expect(geom("line").lineWidth).toBeLessThan(geom("skate").lineWidth);
    });

    it("end cap points along the base path, not the pattern", () => {
        const g = geom("carry", "arrow");
        expect(g.end).toMatchObject({ type: "arrow", tip: { x: 100, y: 0 } });
        expect(g.end!.angle).toBeCloseTo(0);
        expect(geom("skate", "none").end).toBeNull();
        expect(geom("skate", "stop").end?.type).toBe("stop");
    });

    it("straight path keeps every stored point (v1 polylines survive)", () => {
        const bent = [{ x: 0, y: 0 }, { x: 50, y: 40 }, { x: 100, y: 0 }];
        const g = buildStrokeGeometry({ action: "skate", path: "straight", end: "none", points: bent, strokeWidth: 2 }, 4);
        expect(g.polylines[0]).toEqual(bent);
    });

    it("freehand path is smoothed", () => {
        const bent = [{ x: 0, y: 0 }, { x: 50, y: 40 }, { x: 100, y: 0 }];
        const g = buildStrokeGeometry({ action: "skate", path: "freehand", end: "none", points: bent, strokeWidth: 2 }, 4);
        expect(g.polylines[0].length).toBeGreaterThan(3);
    });

    it("degenerate zero-length stroke yields no polylines and no end", () => {
        const g = geom("carry", "arrow", [{ x: 5, y: 5 }, { x: 5, y: 5 }]);
        expect(g.polylines).toEqual([]);
        expect(g.end).toBeNull();
    });
});

describe("curve lines (line editing R2)", () => {
    const bent = [{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 0 }];
    const curve = (points: { x: number; y: number }[], action: StrokeAction = "skate") =>
        buildStrokeGeometry({ action, path: "curve", end: "arrow", points, strokeWidth: 2 }, 4);

    it("draws a 3-point curve through its middle point", () => {
        const line = curve(bent).polylines[0];
        expect(line).toHaveLength(1 + 2 * CURVE_SAMPLES_PER_SEGMENT);
        expect(line[0]).toEqual({ x: 0, y: 0 });
        expect(line[CURVE_SAMPLES_PER_SEGMENT]).toEqual({ x: 50, y: 50 });
        expect(line[line.length - 1]).toEqual({ x: 100, y: 0 });
        // A curve, not two chords: halfway along the first segment it bulges off the chord y = x
        const quarter = line[CURVE_SAMPLES_PER_SEGMENT / 2];
        expect(quarter.x).toBeCloseTo(25, 6);
        expect(quarter.y).toBeCloseTo(31.25, 6);
    });

    it("points the arrow along the curve's end tangent, not along the chord from start to end", () => {
        const g = curve(bent);
        const nearEnd = curvePoint(bent, 1, 1 - 1e-6);
        const tangent = Math.atan2(0 - nearEnd.y, 100 - nearEnd.x);
        expect(Math.abs(g.end!.angle - tangent)).toBeLessThan(0.05);
        expect(Math.abs(g.end!.angle)).toBeGreaterThan(0.5); // the start→end chord is horizontal (angle 0)
    });

    it("passes through every point exactly, one run of samples per segment", () => {
        const pts = [{ x: 0, y: 0 }, { x: 30, y: 20 }, { x: 60, y: 0 }, { x: 90, y: 20 }];
        const path = catmullRomPath(pts);
        expect(path).toHaveLength(1 + 3 * CURVE_SAMPLES_PER_SEGMENT);
        pts.forEach((p, i) => expect(path[i * CURVE_SAMPLES_PER_SEGMENT]).toEqual(p));
    });

    it("stays finite when points coincide, and the arrow keeps a direction", () => {
        const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 5 }];
        expect(catmullRomPath(pts).every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
        expect(Number.isFinite(curve(pts, "pass").end!.angle)).toBe(true);
    });

    it("curves only a curve: straight lines of any length and freehand lines keep today's centerline", () => {
        expect(strokeCenterline({ path: "straight", points: straight })).toEqual(straight);
        expect(strokeCenterline({ path: "straight", points: bent })).toEqual(bent);
        const free = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }];
        expect(strokeCenterline({ path: "freehand", points: free })).toEqual(smoothPath(free));
        expect(strokeCenterline({ path: "curve", points: bent })).toEqual(catmullRomPath(bent));
        expect(strokeCenterline({ path: "curve", points: straight })).toEqual(straight);
    });

    it("puts a 2-point line's curve midpoint at the segment midpoint", () => {
        expect(curvePoint(straight, 0, 0.5)).toEqual({ x: 50, y: 0 });
    });
});

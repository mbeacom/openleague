import { describe, it, expect } from "vitest";
import {
    buildRevealedStrokeGeometry,
    buildStrokeGeometry,
    catmullRomPath,
    curvePoint,
    pointAtFraction,
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

describe("stroke sizes in proportion to the rink (scale model)", () => {
    const line = (action: StrokeAction, strokeWidth: number) =>
        ({ action, path: "straight" as const, end: "none" as const, points: [{ x: 0, y: 0 }, { x: 400, y: 0 }], strokeWidth });

    it("keeps a stroke's width on the reference board, and scales it elsewhere", () => {
        expect(buildStrokeGeometry(line("skate", 2), 3.8).lineWidth).toBe(2);
        expect(buildStrokeGeometry(line("skate", 2), 7.6).lineWidth).toBeCloseTo(4);
        expect(buildStrokeGeometry(line("line", 2), 7.6).lineWidth).toBeCloseTo(3);
    });

    it("scales the thickest stroke down on a small diagram instead of swallowing the rink", () => {
        // 300 px thumbnail: (300 − 20) ÷ 200 = 1.4 px/ft; a width-20 stroke is 20 · 1.4/3.8 ≈ 7.4 px, not 20.
        expect(buildStrokeGeometry(line("skate", 20), 1.4).lineWidth).toBeCloseTo(7.37, 1);
    });

    it("never draws a line thinner than 1 px", () => {
        expect(buildStrokeGeometry(line("skate", 2), 0.5).lineWidth).toBe(1);
    });

    it("applies the plain line's lighter weight before the floor, so it never drops below 1 px either", () => {
        expect(buildStrokeGeometry(line("line", 2), 0.5).lineWidth).toBe(1);
        expect(buildStrokeGeometry(line("line", 2), 3.8).lineWidth).toBe(1.5);
    });

    it("sizes pass dashes in feet, with only the 1 px floor, so a small diagram keeps their rhythm", () => {
        // 1 px/ft: dash 2.5 px, gap 1.5 px (the old floors, 4 and 3 px, would have stretched them).
        const g = buildStrokeGeometry(line("pass", 2), 1);
        const first = g.polylines[0];
        const dashLength = Math.hypot(first[first.length - 1].x - first[0].x, first[first.length - 1].y - first[0].y);
        expect(dashLength).toBeLessThan(3.5);
        expect(g.polylines.length).toBeGreaterThan(80); // 400 px of 4 px cycles
    });
});

describe("buildRevealedStrokeGeometry (playback trails)", () => {
    const reveal = (action: StrokeAction, fraction: number, points = straight) =>
        buildRevealedStrokeGeometry({ action, path: "straight", end: "arrow", points, strokeWidth: 2 }, 4, fraction);

    it.each(STROKE_ACTIONS)("%s: the whole reveal is the full pattern, without the end cap", (action) => {
        const full = geom(action);
        const all = reveal(action, 1);
        expect(all.polylines).toEqual(full.polylines);
        expect(all.lineWidth).toBe(full.lineWidth);
        expect(all.end).toBeNull();
    });

    it.each(STROKE_ACTIONS)("%s: nothing is revealed at 0", (action) => {
        expect(reveal(action, 0).polylines).toEqual([]);
        expect(reveal(action, Number.NaN).polylines).toEqual([]);
    });

    it.each(STROKE_ACTIONS)("%s: a partial reveal is a prefix of the full pattern, so it never shimmers", (action) => {
        const full = geom(action).polylines;
        for (const fraction of [0.21, 0.5, 0.83]) {
            const part = reveal(action, fraction).polylines;
            expect(part.length).toBeGreaterThan(0);
            expect(part.length).toBeLessThanOrEqual(full.length);
            part.forEach((line) => {
                // Every point but a cut-off last one is a point of the full pattern.
                const source = full.find((f) => f[0].x === line[0].x && f[0].y === line[0].y);
                expect(source).toBeDefined();
                line.slice(0, -1).forEach((p, i) => expect(p).toEqual(source?.[i]));
            });
        }
    });

    it("stops the trail at the fraction along the line", () => {
        const half = reveal("skate", 0.5).polylines;
        const end = half[0][half[0].length - 1];
        expect(end.x).toBeCloseTo(50);
        expect(end.y).toBeCloseTo(0);
        const wave = reveal("carry", 0.5).polylines[0];
        expect(Math.max(...wave.map((p) => p.x))).toBeLessThanOrEqual(50.5);
    });

    it("keeps a wave's phase as the trail grows", () => {
        const a = reveal("carry", 0.4).polylines[0];
        const b = reveal("carry", 0.6).polylines[0];
        a.slice(0, -1).forEach((p, i) => expect(b[i]).toEqual(p));
    });
});

describe("pointAtFraction", () => {
    it("walks the polyline by arc length", () => {
        const l = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 30 }];
        expect(pointAtFraction(l, 0)).toEqual({ x: 0, y: 0 });
        expect(pointAtFraction(l, 0.5)).toEqual({ x: 10, y: 10 });
        expect(pointAtFraction(l, 1)).toEqual({ x: 10, y: 30 });
        expect(pointAtFraction(l, 2)).toEqual({ x: 10, y: 30 });
        expect(pointAtFraction([{ x: 3, y: 4 }], 0.5)).toEqual({ x: 3, y: 4 });
    });
});

describe("revealPattern", () => {
    it("re-cuts one built pattern to the same result as building it each time", async () => {
        const { buildPattern, revealPattern } = await import("@/lib/utils/canvas/stroke-geometry");
        const stroke = { action: "carry" as const, path: "straight" as const, end: "arrow" as const, points: straight, strokeWidth: 2 };
        const pattern = buildPattern(stroke, 4, 1);
        for (const f of [0, 0.3, 0.77, 1]) expect(revealPattern(pattern, f)).toEqual(buildRevealedStrokeGeometry(stroke, 4, f, 1));
    });
});

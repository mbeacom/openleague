/**
 * Pure geometry for practice-board strokes. Inputs and outputs are canvas px;
 * `pxPerFt` scales feet-based pattern sizes. No canvas access, so every
 * pattern is unit-testable.
 */
import type { Position, StrokeAction, StrokeEnd, StrokeOptions, StrokePath } from "@/types/practice-planner";
import { MIN_LINE_PX, refPx } from "./scale";

export type StrokePattern = "solid" | "ticks" | "wave" | "dashed" | "double" | "zigzag" | "thin";

export const ACTION_PATTERN: Record<StrokeAction, StrokePattern> = {
    skate: "solid",
    backskate: "ticks",
    carry: "wave",
    pass: "dashed",
    shot: "double",
    lateral: "zigzag",
    line: "thin",
};

export interface StrokeGeometry {
    polylines: Position[][];
    lineWidth: number;
    end: { type: Exclude<StrokeEnd, "none">; tip: Position; angle: number } | null;
}

/** A pattern size in feet at this scale, never below the 1 px floor. */
const ft = (feet: number, pxPerFt: number) => Math.max(feet * pxPerFt, MIN_LINE_PX);

export function smoothPath(points: Position[], iterations = 2): Position[] {
    let pts = points;
    for (let n = 0; n < iterations && pts.length > 2; n++) {
        const next: Position[] = [pts[0]];
        for (let i = 0; i < pts.length - 1; i++) {
            const a = pts[i];
            const b = pts[i + 1];
            next.push({ x: 0.75 * a.x + 0.25 * b.x, y: 0.75 * a.y + 0.25 * b.y });
            next.push({ x: 0.25 * a.x + 0.75 * b.x, y: 0.25 * a.y + 0.75 * b.y });
        }
        next.push(pts[pts.length - 1]);
        pts = next;
    }
    return pts;
}

/** Samples per segment of a curve line (line editing R2). */
export const CURVE_SAMPLES_PER_SEGMENT = 16;

/** Centripetal (alpha 0.5) knot spacing; the floor keeps coincident points finite. */
function nextKnot(t: number, a: Position, b: Position): number {
    return t + Math.max(Math.sqrt(Math.hypot(b.x - a.x, b.y - a.y)), 1e-6);
}

function lerpAt(a: Position, b: Position, ta: number, tb: number, t: number): Position {
    const w = (t - ta) / (tb - ta);
    return { x: a.x + (b.x - a.x) * w, y: a.y + (b.y - a.y) * w };
}

/**
 * The point at `u` (0..1) along segment `segment` (points[segment] to
 * points[segment + 1]) of the centripetal Catmull-Rom curve through `points`
 * (Barry–Goldman form). The ends use mirrored phantom points, so the curve
 * leaves its first point and reaches its last along those segments.
 */
export function curvePoint(points: Position[], segment: number, u: number): Position {
    const p1 = points[segment];
    const p2 = points[segment + 1];
    const p0 = segment > 0 ? points[segment - 1] : { x: 2 * p1.x - p2.x, y: 2 * p1.y - p2.y };
    const p3 = segment + 2 < points.length ? points[segment + 2] : { x: 2 * p2.x - p1.x, y: 2 * p2.y - p1.y };
    const t0 = 0;
    const t1 = nextKnot(t0, p0, p1);
    const t2 = nextKnot(t1, p1, p2);
    const t3 = nextKnot(t2, p2, p3);
    const t = t1 + (t2 - t1) * u;
    const a1 = lerpAt(p0, p1, t0, t1, t);
    const a2 = lerpAt(p1, p2, t1, t2, t);
    const a3 = lerpAt(p2, p3, t2, t3, t);
    return lerpAt(lerpAt(a1, a2, t0, t2, t), lerpAt(a2, a3, t1, t3, t), t1, t2, t);
}

/**
 * A centripetal Catmull-Rom curve through every point, sampled into a
 * polyline that contains each input point exactly (point i is sample
 * i × samplesPerSegment). Fewer than 3 points come back as copies.
 */
export function catmullRomPath(points: Position[], samplesPerSegment: number = CURVE_SAMPLES_PER_SEGMENT): Position[] {
    if (points.length < 3) return points.map((p) => ({ ...p }));
    const out: Position[] = [{ ...points[0] }];
    for (let i = 0; i < points.length - 1; i++) {
        for (let k = 1; k < samplesPerSegment; k++) out.push(curvePoint(points, i, k / samplesPerSegment));
        out.push({ ...points[i + 1] });
    }
    return out;
}

/**
 * The line a stroke is drawn along, before its action pattern (line editing
 * R2): a freehand line is smoothed, a curve with 3 or more points is a curve
 * through them, and everything else (a straight polyline of any length, a
 * 2-point curve) is its stored points.
 */
export function strokeCenterline(stroke: { path: StrokePath; points: Position[] }): Position[] {
    if (stroke.path === "freehand") return smoothPath(stroke.points);
    if (stroke.path === "curve" && stroke.points.length >= 3) return catmullRomPath(stroke.points);
    return stroke.points.map((p) => ({ ...p }));
}

/** Total length of a polyline, in the units of its points. */
export function pathLength(points: Position[]): number {
    let len = 0;
    for (let i = 1; i < points.length; i++) len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    return len;
}

/** Evenly spaced samples along the polyline; always includes the last point. */
export function resampleByArcLength(points: Position[], spacing: number): Position[] {
    const total = pathLength(points);
    if (total === 0 || spacing <= 0) return [points[0]];
    const count = Math.max(1, Math.round(total / spacing));
    const step = total / count;
    const out: Position[] = [{ ...points[0] }];
    let seg = 1;
    let segStart = 0; // arc length at points[seg - 1]
    for (let k = 1; k < count; k++) {
        const target = k * step;
        while (seg < points.length) {
            const a = points[seg - 1];
            const b = points[seg];
            const segLen = Math.hypot(b.x - a.x, b.y - a.y);
            if (segStart + segLen >= target) {
                const t = segLen === 0 ? 0 : (target - segStart) / segLen;
                out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
                break;
            }
            segStart += segLen;
            seg++;
        }
    }
    out.push({ ...points[points.length - 1] });
    return out;
}

/** Unit normals at each sample, from neighbor differences. */
function normals(samples: Position[]): Position[] {
    return samples.map((_, i) => {
        const a = samples[Math.max(0, i - 1)];
        const b = samples[Math.min(samples.length - 1, i + 1)];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        return { x: -dy / len, y: dx / len };
    });
}

function offsetAlong(samples: Position[], offset: (i: number) => number): Position[] {
    const ns = normals(samples);
    return samples.map((p, i) => ({ x: p.x + ns[i].x * offset(i), y: p.y + ns[i].y * offset(i) }));
}

/** Arc length (along the base line) of each of `n` evenly spaced samples over `total`. */
const evenArcs = (n: number, total: number) => Array.from({ length: n }, (_, i) => (n > 1 ? (i * total) / (n - 1) : 0));

function cumulative(points: Position[]): number[] {
    const cum = [0];
    for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
    return cum;
}

interface PatternedStroke {
    base: Position[];
    total: number;
    polylines: Position[][];
    /** For each polyline point, how far along the base line it sits. */
    arcs: number[][];
    lineWidth: number;
}

function buildPattern(
    stroke: StrokeOptions & { points: Position[]; strokeWidth: number },
    pxPerFt: number,
    minLinePx: number
): PatternedStroke {
    const base = strokeCenterline(stroke);
    const total = pathLength(base);
    const pattern = ACTION_PATTERN[stroke.action];
    // Stored widths are px on the reference board (scale model); drawn in proportion here.
    // The plain line's lighter weight applies before the floor, so no stroke drops below it.
    const lineWidth = refPx(pattern === "thin" ? stroke.strokeWidth * 0.75 : stroke.strokeWidth, pxPerFt, minLinePx);
    if (base.length < 2 || total === 0) return { base, total, polylines: [], arcs: [], lineWidth };

    let polylines: Position[][];
    let arcs: number[][];
    switch (pattern) {
        case "solid":
        case "thin":
            polylines = [base];
            arcs = [cumulative(base)];
            break;
        case "wave": {
            const amp = ft(1.0, pxPerFt);
            const wavelength = ft(4, pxPerFt);
            const samples = resampleByArcLength(base, wavelength / 12);
            const spacing = total / (samples.length - 1);
            polylines = [offsetAlong(samples, (i) => amp * Math.sin((2 * Math.PI * i * spacing) / wavelength))];
            arcs = [evenArcs(samples.length, total)];
            break;
        }
        case "zigzag": {
            const amp = ft(1.2, pxPerFt);
            const half = ft(3, pxPerFt) / 2;
            const samples = resampleByArcLength(base, half);
            polylines = [offsetAlong(samples, (i) => (i === 0 || i === samples.length - 1 ? 0 : i % 2 ? amp : -amp))];
            arcs = [evenArcs(samples.length, total)];
            break;
        }
        case "dashed": {
            const dash = ft(2.5, pxPerFt);
            const gap = ft(1.5, pxPerFt);
            const samples = resampleByArcLength(base, Math.min(dash, gap) / 2);
            const spacing = total / (samples.length - 1);
            polylines = [];
            arcs = [];
            let current: Position[] = [];
            let currentArcs: number[] = [];
            const flush = () => {
                if (current.length > 1) {
                    polylines.push(current);
                    arcs.push(currentArcs);
                }
                current = [];
                currentArcs = [];
            };
            samples.forEach((p, i) => {
                const inDash = (i * spacing) % (dash + gap) <= dash;
                if (inDash) {
                    current.push(p);
                    currentArcs.push(i * spacing);
                } else if (current.length) flush();
            });
            flush();
            break;
        }
        case "double": {
            const rail = ft(0.7, pxPerFt);
            const samples = resampleByArcLength(base, ft(1, pxPerFt));
            const a = evenArcs(samples.length, total);
            polylines = [offsetAlong(samples, () => rail), offsetAlong(samples, () => -rail)];
            arcs = [a, a];
            break;
        }
        case "ticks": {
            const every = ft(4, pxPerFt);
            const half = ft(1.2, pxPerFt);
            const samples = resampleByArcLength(base, every);
            const sampleArcs = evenArcs(samples.length, total);
            const ns = normals(samples);
            polylines = [base];
            arcs = [cumulative(base)];
            for (let i = 1; i < samples.length - 1; i++) {
                const p = samples[i];
                polylines.push([
                    { x: p.x + ns[i].x * half, y: p.y + ns[i].y * half },
                    { x: p.x - ns[i].x * half, y: p.y - ns[i].y * half },
                ]);
                arcs.push([sampleArcs[i], sampleArcs[i]]);
            }
            break;
        }
    }
    return { base, total, polylines, arcs, lineWidth };
}

/** The part of `line` whose base arc length is at most `limit`, ending exactly there; null when nothing is left to draw. */
function cutAt(line: Position[], arcs: number[], limit: number): Position[] | null {
    if (arcs[0] > limit) return null;
    // A tick (both points at one arc length) is all or nothing.
    if (arcs[arcs.length - 1] === arcs[0]) return line.map((p) => ({ ...p }));
    const out: Position[] = [{ ...line[0] }];
    for (let i = 1; i < line.length; i++) {
        if (arcs[i] <= limit) {
            out.push({ ...line[i] });
            continue;
        }
        const span = arcs[i] - arcs[i - 1];
        const w = span === 0 ? 0 : (limit - arcs[i - 1]) / span;
        const a = line[i - 1];
        const b = line[i];
        if (w > 0) out.push({ x: a.x + (b.x - a.x) * w, y: a.y + (b.y - a.y) * w });
        break;
    }
    return out.length > 1 ? out : null;
}

/**
 * The pattern of a stroke laid out over its whole length, cut off `fraction`
 * (0..1) of the way along: the part a skater or puck has travelled. Because
 * the pattern is built on the full line, a wave or zigzag keeps its phase as
 * the cut moves, so a growing trail doesn't shimmer. No end cap: that belongs
 * to the finished stroke.
 */
export function buildRevealedStrokeGeometry(
    stroke: StrokeOptions & { points: Position[]; strokeWidth: number },
    pxPerFt: number,
    fraction: number,
    minLinePx: number = MIN_LINE_PX
): StrokeGeometry {
    const { total, polylines, arcs, lineWidth } = buildPattern(stroke, pxPerFt, minLinePx);
    const f = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
    const limit = f * total;
    const cut: Position[][] = [];
    polylines.forEach((line, i) => {
        const part = cutAt(line, arcs[i], limit);
        if (part) cut.push(part);
    });
    return { polylines: f > 0 ? cut : [], lineWidth, end: null };
}

/** The point `fraction` (0..1) of the way along a polyline, by arc length. */
export function pointAtFraction(points: Position[], fraction: number): Position {
    if (points.length === 0) return { x: 0, y: 0 };
    const cum = cumulative(points);
    const target = Math.min(1, Math.max(0, fraction)) * cum[cum.length - 1];
    for (let i = 1; i < points.length; i++) {
        if (cum[i] >= target) {
            const span = cum[i] - cum[i - 1];
            const w = span === 0 ? 0 : (target - cum[i - 1]) / span;
            return { x: points[i - 1].x + (points[i].x - points[i - 1].x) * w, y: points[i - 1].y + (points[i].y - points[i - 1].y) * w };
        }
    }
    return { ...points[points.length - 1] };
}

export function buildStrokeGeometry(
    stroke: StrokeOptions & { points: Position[]; strokeWidth: number },
    pxPerFt: number,
    /** Thinnest line drawn (the editing board passes a higher minimum) */
    minLinePx: number = MIN_LINE_PX
): StrokeGeometry {
    const { base, total, polylines, lineWidth } = buildPattern(stroke, pxPerFt, minLinePx);
    if (base.length < 2 || total === 0) return { polylines: [], lineWidth, end: null };

    let end: StrokeGeometry["end"] = null;
    if (stroke.end !== "none") {
        const tip = base[base.length - 1];
        let k = base.length - 2;
        while (k > 0 && base[k].x === tip.x && base[k].y === tip.y) k--;
        const from = base[k];
        end = { type: stroke.end, tip: { ...tip }, angle: Math.atan2(tip.y - from.y, tip.x - from.x) };
    }

    return { polylines, lineWidth, end };
}

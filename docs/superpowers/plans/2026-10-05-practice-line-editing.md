# Line Editing on the Rink Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A coach can fix a line on the rink board without redrawing it: move it, drag its ends, bend it into a smooth curve with "+" handles, remove a bend, straighten it, and have new and dragged line ends snap to players, equipment and other lines' ends.

**Architecture:**
- **No schema change (spec R1).** A `straight` line with more than 2 points is a bent line; an edit can give it at most 6 bends (8 points).
- **One renderer (spec R2).** `buildStrokeGeometry` gets its centerline from a new `strokeCenterline`: a centripetal Catmull-Rom curve (alpha 0.5) for a straight line with 3 or more points, unchanged for 2-point and freehand lines. The board, thumbnails, the bench sheet, the exports and the legend all go through it. The selection highlight and line hit-testing use the same centerline.
- **Pure editing helpers (spec R5)** in `lib/utils/canvas/line-editing.ts` (no DOM, no React, portable to `apps/planner`): handle positions, handle hit-testing, point and whole-line moves, bend insert and remove, straighten, freehand anchors, snapping and the double-tap test.
- **Gesture state in hooks, so `RinkBoard.tsx` does not grow (spec R5).** Task 3 first moves the existing touch and pinch handling into `useBoardTouch.ts`. Line-editing gestures, the live preview, the snap ring and the one-history-entry commit then live in `useStrokeEditing.ts`. RinkBoard only routes events and draws. A line-budget test pins `RinkBoard.tsx` at 1057 lines or fewer.
- **Drawing** of handles and the snap ring goes in `drawing-utils.ts`, with colours passed in (`LINE_EDIT_COLORS`, the theme's light-scheme blues, because the board's ice is drawn light in both colour schemes).

**Tech Stack:** TypeScript (strict), React 19, MUI v7, Vite (static planner), Vitest + jsdom + Testing Library, Playwright (screenshots only, from a local harness outside the repository), Bun.

**Spec:** `docs/superpowers/specs/2026-10-05-practice-line-editing-design.md`. Its success criteria (1–7) and rulings R1–R6 are referenced below.

## Global Constraints

- Use `bun` for every script (`bun run …`), never npm or yarn.
- Use `/usr/bin/git`. Never `git stash`. Never switch branches (work on `feat/line-editing`). Stage files by path, never `git add -A` or `git add .`, because `next dev` can rewrite `CLAUDE.md`.
- **Commit trailer:** every commit message ends, as its own paragraph, with the `Claude-Session:` line the executing session's instructions give. Set it once per shell as `SESSION_TRAILER` (for example `export SESSION_TRAILER='Claude-Session: https://claude.ai/code/…'` with the real URL) and pass it as the last `-m`, as every commit step below does.
- **No schema or format change (R1).** `PLAY_DATA_VERSION` (2), `PLAN_VERSION` (1), `playDataSchema` and the plan-file format are unchanged. No migration, no Prisma change. Never run `prisma migrate dev`, `db:migrate`, `db:push` or `db:migrate:reset`.
- **Constants, exactly:**
  - from `lib/utils/canvas/line-editing.ts`: `MAX_LINE_BENDS = 6`, `MAX_EDIT_POINTS = 8` (`MAX_LINE_BENDS + 2`), `SNAP_RADIUS_FT = 3`, `DOUBLE_TAP_MS = 300`;
  - from `lib/utils/canvas/stroke-geometry.ts`: `CURVE_SAMPLES_PER_SEGMENT = 16`;
  - from `lib/utils/canvas/drawing-utils.ts`: `LINE_HANDLE_RADIUS_PX = 7`, `SNAP_RING_RADIUS_PX = 14`;
  - from `lib/utils/canvas/rink-renderer.ts`: `ICE_COLOR = "#E8F4F8"` (the value `drawIceSurface` already uses);
  - from `lib/utils/canvas/notation.ts`: `LINE_EDIT_COLORS = { handleFill: "#FFFFFF", handleStroke: BOARD_COLORS.actionBlue, snapRing: BOARD_COLORS.leagueBlue }`;
  - existing and unchanged: `MIN_HIT_RADIUS_PX = 22` (RinkBoard), `DRAG_THRESHOLD_PX = 4` (`interaction-utils.ts`).
- **Geometry (R2):** centripetal Catmull-Rom (alpha 0.5, Barry–Goldman form) for a straight line with ≥ 3 points; the ends use mirrored phantom points; every stored point is a sample exactly. A 2-point straight line and every freehand line produce **byte-identical** geometry to today, pinned by a snapshot recorded before the change (Task 1). Never run the suite with `-u` / `--update` on this branch.
- **Snapping (R4):** radius `snapRadiusFt(minHitRadiusFt) = max(3, minHitRadiusFt)`; targets in order: player centres, equipment centres, the first and last points of other lines; nearest wins, ties go to the earlier target; text is never a target; a line never snaps to itself; targets outside the drill's ice area are skipped; Alt/Option on the gesture's events turns it off. Snapping sets coordinates only.
- **Portability (ADR-0020):** `lib/utils/canvas/line-editing.ts` imports only types and pure `lib/utils` modules (no DOM, no React, no MUI). `useBoardTouch.ts` and `useStrokeEditing.ts` sit in `components/features/practice-planner/` (the `adr-0020/portable-practice-planner` ESLint block) and import only `react`, `@/types/practice-planner` and `@/lib/utils/...`. Nothing new imports `next/*`, `@/lib/actions/*`, `@/lib/db/*`, `@/lib/auth/*` or `@prisma/client`.
- **Colour and touch (R6):** handles draw at 7 px radius on screen at any zoom; their hit area is the board's 22 px minimum hit radius. Handle and ring colours come from `LINE_EDIT_COLORS`, which equal the theme's light-scheme `secondary.main` and `primary.main` and reach 3:1 against `ICE_COLOR` (Action Blue about 4.1:1, League Blue about 7.7:1). The ice is drawn light in both schemes, so these hold in dark mode too. On-screen MUI controls use palette tokens only and are at least 44 × 44 px.
- **Copy, exactly:** inspector buttons `Straighten` (a straight line with bends) and `Make straight` (a freehand line). No other new user-facing text.
- **Line budget:** `components/features/practice-planner/RinkBoard.tsx` stays at or under **1057** lines, pinned by `__tests__/components/features/practice-planner/RinkBoard.line-budget.test.ts` (Task 3). Expected: about 940 after Task 3 and about 1000 after Task 6.
- **Breaking tests:** a task that changes a shared function's behaviour lists the existing tests it touches. Every task ends with `bun run type-check` and its suites green (`tsconfig.json` includes `__tests__`).
- **Screenshots (Task 7):** build and serve the static planner, drive it with a local headless Playwright script kept outside the repository, launch Chromium with `executablePath: process.env.CHROMIUM_PATH`, and write the PNGs to `.cache/line-editing/` in the repository (git-ignored by the `.cache` rule). Read every PNG before calling the task done.
- **Public repository:** commit messages, comments and test names are neutral and factual. No local machine paths, scratch directories or session ids in anything committed (the commit trailer is the one allowed session URL).

## Review Focus

1. **Lines with more points than an edit makes.** 16 starter strokes are `straight` with 3–16 points (for example `st-weave`, `wv-f1-route`, `pt-wrap`, and the 16-point `ec-figure-eight`), and a play upgraded from v1 can carry a `straight` line with any number of points. They now draw as curves; they must stay on the ice, show a bend handle on every interior point, show no "+" handle once 6 bends exist, refuse a new bend, and still straighten. Tests: Task 1 (every starter curve inside the rink; zone outlines are 2-point segments), Task 2 (`lineHandles`, `insertBend` and `straighten` on a 10-point line; every starter straight line, including the 16-point `ec-figure-eight`).
2. **Coincident or collinear points** (a bend dragged onto its neighbour, a line whose points all lie on one line). The curve stays finite, the arrow keeps a direction, anchors collapse to the two ends. Tests: Task 1 (`catmullRomPath` and the end angle with duplicate points), Task 2 (`anchorPoints` on collinear points).
3. **A line partly outside the drill's ice area, or larger than it** (the area was set after drawing). A tap selects it without moving it; a drag moves it in as a whole without distorting it; an axis on which it is longer than the area does not move. Tests: Task 2 (`moveLine`), Task 4 (a touch tap on a line outside the area records nothing; a whole-line move is clamped with its shape kept).
4. **Short lines whose handles overlap** (a line under two hit radii long: both ends and the "+" within 22 px). The nearest handle wins and an end beats a "+" on a tie, so pressing an end drags the end. Tests: Task 2 (`hitTestLineHandle` ties), Task 4 (dragging an end of a 6 ft line).
5. **An interrupted gesture.** Release outside the canvas commits once; a second finger, a touchcancel or a tool change cancels without committing or leaving a preview. Tests: Task 4 (window release, second finger, touchcancel, tool change).

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `lib/utils/canvas/stroke-geometry.ts` | `CURVE_SAMPLES_PER_SEGMENT`, `curvePoint`, `catmullRomPath`, `strokeCenterline`; `buildStrokeGeometry` uses the centerline | 1 |
| `lib/utils/canvas/drawing-utils.ts` | selection highlight along the centerline (1); `drawLineHandles`, `LINE_HANDLE_RADIUS_PX`, `LineEditColors` (4); `drawSnapRing`, `SNAP_RING_RADIUS_PX` (6) | 1, 4, 6 |
| `lib/utils/canvas/interaction-utils.ts` | `hitTestDrawing` along a bent line's curve (1); export `distanceToLineSegment`, add `drawingHitRadius` (2) | 1, 2 |
| `lib/data/starter-plays.ts` | `dz-house` zone outline split into four 2-point segments | 1 |
| `lib/utils/canvas/line-editing.ts` (new) | the pure helpers of R3–R5 | 2 |
| `lib/utils/canvas/element-ops.ts` | `replaceDrawing`; `ElementPatch` admits a line's `path` and `points` | 2 |
| `components/features/practice-planner/useBoardTouch.ts` (new) | touch: one-finger pointer, tap tools, pinch, cancel (moved out of RinkBoard) | 3 |
| `components/features/practice-planner/useStrokeEditing.ts` (new) | line-editing gesture state, preview, commit (4); double-tap removal (5); snapping and the ring (6) | 4, 5, 6 |
| `components/features/practice-planner/RinkBoard.tsx` | touch delegated (3); line editing routed and drawn (4); press time (5); snapping while drawing (6) | 3–6 |
| `lib/utils/canvas/rink-renderer.ts` | export `ICE_COLOR` | 4 |
| `lib/utils/canvas/notation.ts` | `LINE_EDIT_COLORS` | 4 |
| `components/features/practice-planner/ElementInspector.tsx` | `Straighten` / `Make straight` | 5 |

---

### Task 1: Bent lines draw as curves everywhere

A `straight` line with 3 or more points becomes a centripetal Catmull-Rom curve in the one place lines become geometry, so the board, thumbnails, print, exports and the legend all change together (spec R2, success criterion 4). The selection highlight and hit-testing follow the drawn curve. A snapshot recorded **before** the change pins today's 2-point and freehand geometry byte for byte (criterion 7). The starter `dz-house` zone outline, the one multi-point straight line that is meant to have corners, becomes four 2-point segments.

**Files:**
- Modify: `lib/utils/canvas/stroke-geometry.ts` (add the curve functions after `smoothPath`, lines 28–42; `buildStrokeGeometry` line 99)
- Modify: `lib/utils/canvas/drawing-utils.ts` (`drawElement`'s highlight, lines 239–258; import line 22)
- Modify: `lib/utils/canvas/interaction-utils.ts` (`hitTestDrawing`, lines 247–264; imports)
- Modify: `lib/data/starter-plays.ts:317` (`dz-house`)
- Test (create): `__tests__/lib/utils/canvas/stroke-geometry.legacy.test.ts` and its snapshot `__tests__/lib/utils/canvas/__snapshots__/stroke-geometry.legacy.test.ts.snap`
- Test (modify): `__tests__/lib/utils/canvas/stroke-geometry.test.ts`, `__tests__/lib/utils/canvas/drawing-utils.test.ts`, `__tests__/lib/utils/canvas/interaction-utils.test.ts`, `__tests__/lib/data/starter-plays.test.ts`
- Existing tests that must stay green unchanged: `__tests__/lib/utils/canvas/legend-swatch.test.ts`, `thumbnail-*.test.ts`, the export and print suites under `__tests__/components/features/practice-planner/`.

**Interfaces:**
- Produces, from `lib/utils/canvas/stroke-geometry.ts`:
  - `CURVE_SAMPLES_PER_SEGMENT: 16`;
  - `curvePoint(points: Position[], segment: number, u: number): Position` (the point at `u` in [0, 1] along segment `segment` of the curve through `points`; needs `points.length >= 2`);
  - `catmullRomPath(points: Position[], samplesPerSegment?: number): Position[]` (`1 + (n − 1) × samplesPerSegment` samples, input point `i` at sample `i × samplesPerSegment`; fewer than 3 points come back as copies);
  - `strokeCenterline(stroke: { path: StrokePath; points: Position[] }): Position[]`.
- `hitTestDrawing(point, drawing, threshold)` keeps its signature.

- [ ] **Step 1: Record today's geometry (before any code change)**

Create `__tests__/lib/utils/canvas/stroke-geometry.legacy.test.ts`:

```ts
/**
 * Pins the geometry of every line the editor could draw before line editing
 * (line editing spec R2, success criterion 7): 2-point straight lines and
 * freehand lines. The snapshot was recorded from the code before bent lines
 * existed. Never update it with `-u`: a diff here means existing plays would
 * look different.
 */
import { describe, expect, it } from "vitest";
import { buildStrokeGeometry } from "@/lib/utils/canvas/stroke-geometry";
import { STROKE_ACTIONS, type Position, type StrokeAction, type StrokeEnd, type StrokePath } from "@/types/practice-planner";

// Canvas px, as drawStroke passes them; 3.8 px/ft is an 800 × 400 board's scale.
const PX_PER_FT = 3.8;
const STRAIGHT: Position[] = [{ x: 139.7, y: 172.95 }, { x: 562.45, y: 90.3 }];
const FREEHAND: Position[] = [
    { x: 96, y: 248 },
    { x: 153, y: 217.6 },
    { x: 202.4, y: 251.8 },
    { x: 270.8, y: 187.2 },
    { x: 324, y: 210 },
];

const geometry = (path: StrokePath, action: StrokeAction, end: StrokeEnd, points: Position[]) =>
    JSON.stringify(buildStrokeGeometry({ action, path, end, points, strokeWidth: 2 }, PX_PER_FT));

describe("geometry of lines drawn before line editing", () => {
    for (const action of STROKE_ACTIONS) {
        it(`straight ${action} with an arrow`, () => {
            expect(geometry("straight", action, "arrow", STRAIGHT)).toMatchSnapshot();
        });
        it(`freehand ${action} with an arrow`, () => {
            expect(geometry("freehand", action, "arrow", FREEHAND)).toMatchSnapshot();
        });
    }
    for (const end of ["stop", "none"] as const) {
        it(`straight skate with end ${end}`, () => {
            expect(geometry("straight", "skate", end, STRAIGHT)).toMatchSnapshot();
        });
    }
});
```

- [ ] **Step 2: Write the snapshot from the current code**

Run: `env -u CI bun run test __tests__/lib/utils/canvas/stroke-geometry.legacy.test.ts`
Expected: PASS, 16 tests, and Vitest reports `16 written`. (`env -u CI` matters: with `CI` set, Vitest refuses to write new snapshots.) Confirm the file `__tests__/lib/utils/canvas/__snapshots__/stroke-geometry.legacy.test.ts.snap` exists. Do not edit `stroke-geometry.ts` before this step has passed.

- [ ] **Step 3: Write the failing curve tests**

In `__tests__/lib/utils/canvas/stroke-geometry.test.ts`, replace the import on line 2 with:

```ts
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
```

Append to the file:

```ts
describe("bent straight lines (line editing R2)", () => {
    const bent = [{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 0 }];

    it("draws a 3-point straight line as a curve through its middle point", () => {
        const line = geom("skate", "arrow", bent).polylines[0];
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
        const g = geom("skate", "arrow", bent);
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
        expect(Number.isFinite(geom("pass", "arrow", pts).end!.angle)).toBe(true);
    });

    it("leaves 2-point straight lines and freehand lines on today's centerline", () => {
        expect(strokeCenterline({ path: "straight", points: straight })).toEqual(straight);
        const free = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }];
        expect(strokeCenterline({ path: "freehand", points: free })).toEqual(smoothPath(free));
        expect(strokeCenterline({ path: "straight", points: bent })).toEqual(catmullRomPath(bent));
    });

    it("puts a 2-point line's curve midpoint at the segment midpoint", () => {
        expect(curvePoint(straight, 0, 0.5)).toEqual({ x: 50, y: 0 });
    });
});
```

In `__tests__/lib/utils/canvas/drawing-utils.test.ts`, change the import on line 2 to

```ts
import { drawStroke, drawAreaMask, drawBoardScene, drawBoardFrame, drawElement } from "@/lib/utils/canvas/drawing-utils";
```

add `import { CURVE_SAMPLES_PER_SEGMENT } from "@/lib/utils/canvas/stroke-geometry";` below it, and append:

```ts
describe("drawElement selection highlight", () => {
    const element = (pts: { x: number; y: number }[]) => ({
        id: "d", action: "skate" as const, path: "straight" as const, end: "none" as const, points: pts, color: "#212121", strokeWidth: 2,
    });
    /** lineTo calls in the highlight: everything before the first stroke(). */
    const highlightLineTos = (pts: { x: number; y: number }[]) => {
        const calls: Call[] = [];
        drawElement(recordingCtx(calls), element(pts), transform, true);
        const firstStroke = calls.findIndex((c) => c.name === "stroke");
        return calls.slice(0, firstStroke).filter((c) => c.name === "lineTo").length;
    };

    it("follows a bent line's curve", () => {
        expect(highlightLineTos([{ x: 20, y: 40 }, { x: 60, y: 20 }, { x: 120, y: 40 }])).toBe(2 * CURVE_SAMPLES_PER_SEGMENT);
    });

    it("is still one segment for a 2-point line", () => {
        expect(highlightLineTos(points)).toBe(1);
    });
});
```

In `__tests__/lib/utils/canvas/interaction-utils.test.ts`, append:

```ts
describe("hitTestDrawing on a bent line (line editing R2)", () => {
    const bent: DrawingElement = {
        id: "b", action: "skate", path: "straight", end: "arrow",
        points: [{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 0 }], color: "#212121", strokeWidth: 2,
    };

    it("hits the drawn curve, not the chords between its points", () => {
        // The curve passes (25, 31.25); the chord y = x passes (25, 25), about 4 ft from the curve
        expect(hitTestDrawing({ x: 25, y: 31.25 }, bent, 1)).toBe(true);
        expect(hitTestDrawing({ x: 25, y: 25 }, bent, 1)).toBe(false);
    });
});
```

In `__tests__/lib/data/starter-plays.test.ts`, add `import { strokeCenterline } from "@/lib/utils/canvas/stroke-geometry";` to the imports and append:

```ts
describe("Starter play lines (line editing R2)", () => {
    const strokes = STARTER_PLAYS.flatMap((play) => play.playData.drawings);

    it("draws zone outlines as separate segments, since a straight line with bends now draws as a curve", () => {
        const bentOutlines = strokes
            .filter((d) => d.action === "line" && d.path === "straight" && d.points.length > 2)
            .map((d) => d.id);
        expect(bentOutlines).toEqual([]);
    });

    it("keeps every drawn route, curved or not, on the ice", () => {
        for (const d of strokes) {
            for (const p of strokeCenterline(d)) expect(withinRink(p)).toBe(true);
        }
    });
});
```

- [ ] **Step 4: Run the tests to see them fail**

Run: `bun run test __tests__/lib/utils/canvas/stroke-geometry.test.ts __tests__/lib/utils/canvas/drawing-utils.test.ts __tests__/lib/utils/canvas/interaction-utils.test.ts __tests__/lib/data/starter-plays.test.ts`
Expected: FAIL. The new stroke-geometry tests fail on missing exports (`catmullRomPath is not a function` / undefined `CURVE_SAMPLES_PER_SEGMENT`); the highlight test reports 2 lineTo calls instead of 32; the bent-line hit test returns `false` for the curve point; the starter test lists `["dz-house"]`.

- [ ] **Step 5: Add the curve to `stroke-geometry.ts`**

In `lib/utils/canvas/stroke-geometry.ts`, change the import on line 6 to

```ts
import type { Position, StrokeAction, StrokeEnd, StrokeOptions, StrokePath } from "@/types/practice-planner";
```

and insert after `smoothPath` (after line 42):

```ts
/** Samples per segment of a bent straight line's curve (line editing R2). */
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
 * The line a stroke is drawn along, before its action pattern: a freehand
 * line is smoothed, a 2-point straight line is its segment, and a straight
 * line with bends (3 or more points) is a curve through them (line editing R2).
 */
export function strokeCenterline(stroke: { path: StrokePath; points: Position[] }): Position[] {
    if (stroke.path === "freehand") return smoothPath(stroke.points);
    if (stroke.points.length < 3) return stroke.points.map((p) => ({ ...p }));
    return catmullRomPath(stroke.points);
}
```

Then in `buildStrokeGeometry` replace

```ts
    const base = stroke.path === "freehand" ? smoothPath(stroke.points) : stroke.points.map((p) => ({ ...p }));
```

with

```ts
    const base = strokeCenterline(stroke);
```

(For 2 points and for freehand this is exactly the old expression, so the snapshot holds. The arrow and stop angle keep using the last two distinct samples, which on a curve lie along its end tangent.)

- [ ] **Step 6: Highlight and hit-test along the drawn line**

In `lib/utils/canvas/drawing-utils.ts`, change line 22 to

```ts
import { buildStrokeGeometry, strokeCenterline, type StrokeGeometry } from "./stroke-geometry";
```

and in `drawElement` replace

```ts
        ctx.beginPath();
        const startCanvas = rinkToCanvas(element.points[0], transform);
        ctx.moveTo(startCanvas.x, startCanvas.y);

        for (let i = 1; i < element.points.length; i++) {
            const pointCanvas = rinkToCanvas(element.points[i], transform);
            ctx.lineTo(pointCanvas.x, pointCanvas.y);
        }

        ctx.stroke();
```

with

```ts
        // Along the drawn centerline, so a bent or freehand line's highlight follows its curve
        const path = strokeCenterline({ path: element.path, points: element.points.map((p) => rinkToCanvas(p, transform)) });
        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
        ctx.stroke();
```

(The viewport transform is a uniform scale plus an offset, and the centripetal curve is unchanged by that, so the curve computed in canvas px is the rink-feet curve, mapped.)

In `lib/utils/canvas/interaction-utils.ts`, add below the `glyph-metrics` import:

```ts
import { strokeCenterline } from "./stroke-geometry";
```

and replace the body of `hitTestDrawing`:

```ts
export function hitTestDrawing(
    point: Position,
    drawing: DrawingElement,
    threshold = HIT_THRESHOLD
): boolean {
    // A bent straight line is drawn as a curve through its points (line editing R2): test what is drawn
    const path = drawing.path === "straight" && drawing.points.length > 2 ? strokeCenterline(drawing) : drawing.points;
    for (let i = 0; i < path.length - 1; i++) {
        if (distanceToLineSegment(point, path[i], path[i + 1]) <= threshold) return true;
    }
    return false;
}
```

(Freehand and 2-point lines keep today's hit test on their stored points.)

- [ ] **Step 7: Split the starter zone outline**

In `lib/data/starter-plays.ts`, replace line 317

```ts
                zoneLine("dz-house", [11, 27], [33, 27], [43, 42.5], [33, 58], [11, 58]),
```

with

```ts
                // Four segments: a straight line with bends now draws as a curve, and the house has corners
                zoneLine("dz-house-1", [11, 27], [33, 27]),
                zoneLine("dz-house-2", [33, 27], [43, 42.5]),
                zoneLine("dz-house-3", [43, 42.5], [33, 58]),
                zoneLine("dz-house-4", [33, 58], [11, 58]),
```

The other 15 multi-point starter strokes are routes (skates, carries, passes, the goalie shuffle) and are meant to read as curves; they stay as they are.

- [ ] **Step 8: Run the tests to see them pass**

Run: `bun run test __tests__/lib/utils/canvas __tests__/lib/data __tests__/components/features/practice-planner`
Expected: PASS. The legacy file reports `16 passed` with nothing written, updated or obsolete.

Run: `bun run type-check`
Expected: exit 0.

- [ ] **Step 9: Commit**

```bash
/usr/bin/git add lib/utils/canvas/stroke-geometry.ts lib/utils/canvas/drawing-utils.ts lib/utils/canvas/interaction-utils.ts \
  lib/data/starter-plays.ts __tests__/lib/utils/canvas/stroke-geometry.legacy.test.ts \
  __tests__/lib/utils/canvas/__snapshots__/stroke-geometry.legacy.test.ts.snap \
  __tests__/lib/utils/canvas/stroke-geometry.test.ts __tests__/lib/utils/canvas/drawing-utils.test.ts \
  __tests__/lib/utils/canvas/interaction-utils.test.ts __tests__/lib/data/starter-plays.test.ts
/usr/bin/git commit -m "feat(practice-planner): draw bent straight lines as smooth curves" -m "$SESSION_TRAILER"
```

---

### Task 2: Pure line-editing helpers

Everything the board needs to edit a line, as pure functions in rink feet (spec R3, R4, R5). Each edit returns the same reference when it changes nothing. Nothing is wired to the board yet.

**Files:**
- Create: `lib/utils/canvas/line-editing.ts`
- Modify: `lib/utils/canvas/interaction-utils.ts` (export `distanceToLineSegment`, line 392; add `drawingHitRadius` and use it in `hitTest`, line 371)
- Modify: `lib/utils/canvas/element-ops.ts` (`ElementPatch` and `ALLOWED`, lines 28–38; add `replaceDrawing` after `moveElement`)
- Test (create): `__tests__/lib/utils/canvas/line-editing.test.ts`
- Test (modify): `__tests__/lib/utils/canvas/element-ops.test.ts`, `__tests__/lib/utils/canvas/interaction-utils.test.ts`

**Interfaces:**
- Consumes (Task 1): `curvePoint(points, segment, u)`.
- Produces, from `lib/utils/canvas/line-editing.ts`:
  - `MAX_LINE_BENDS = 6`, `MAX_EDIT_POINTS = 8`, `SNAP_RADIUS_FT = 3`, `DOUBLE_TAP_MS = 300`;
  - `type LineStroke = Pick<DrawingElement, "path" | "points">`;
  - `type LineHandle = { kind: "end" | "bend" | "anchor"; index: number; position: Position } | { kind: "add"; segment: number; position: Position }`;
  - `anchorPoints(points: Position[], max?: number): Position[]`;
  - `lineHandles(stroke: LineStroke): LineHandle[]` (ends first, then bends or anchors, then "+" handles);
  - `hitTestLineHandle(handles: readonly LineHandle[], point: Position, radiusFt: number): LineHandle | null`;
  - `moveLinePoint(stroke: DrawingElement, index: number, to: Position, rect: RinkRect): DrawingElement`;
  - `moveLine(stroke: DrawingElement, delta: Position, rect: RinkRect): DrawingElement`;
  - `insertBend(stroke: DrawingElement, segment: number, at: Position, rect: RinkRect): DrawingElement`;
  - `removeBend(stroke: DrawingElement, index: number): DrawingElement`;
  - `straighten(stroke: DrawingElement): DrawingElement`;
  - `interface SnapOptions { radiusFt: number; excludeId?: string; bypass?: boolean; rect?: RinkRect }`;
  - `findSnapTarget(data: PlayData, point: Position, options: SnapOptions): Position | null`;
  - `snapRadiusFt(minHitRadiusFt: number): number`;
  - `interface TapRecord { id: string; index: number; position: Position; time: number }`;
  - `isDoubleTap(previous: TapRecord | null, next: TapRecord, radiusFt: number, windowMs?: number): boolean`.
- Produces, from `lib/utils/canvas/interaction-utils.ts`: `distanceToLineSegment(point, lineStart, lineEnd): number` (now exported), `drawingHitRadius(minHitRadiusFt?: number): number` (`max(5, minHitRadiusFt)`, the radius `hitTest` already used for drawings).
- Produces, from `lib/utils/canvas/element-ops.ts`: `replaceDrawing(data: PlayData, stroke: DrawingElement): PlayData`; `ElementPatch` now includes `Partial<Pick<DrawingElement, "path" | "points">>`, applied to drawings only.

- [ ] **Step 1: Write the failing helper tests**

Create `__tests__/lib/utils/canvas/line-editing.test.ts`:

```ts
/** Pure line-editing helpers (line editing spec R1, R3, R4, R5). Rink feet throughout. */
import { describe, expect, it } from "vitest";
import {
    DOUBLE_TAP_MS,
    MAX_EDIT_POINTS,
    MAX_LINE_BENDS,
    SNAP_RADIUS_FT,
    anchorPoints,
    findSnapTarget,
    hitTestLineHandle,
    insertBend,
    isDoubleTap,
    lineHandles,
    moveLine,
    moveLinePoint,
    removeBend,
    snapRadiusFt,
    straighten,
    type LineHandle,
    type TapRecord,
} from "@/lib/utils/canvas/line-editing";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { STARTER_PLAYS } from "@/lib/data/starter-plays";
import type { DrawingElement, PlayData, Position, RinkRect, StrokePath } from "@/types/practice-planner";

const RINK: RinkRect = { x: 0, y: 0, w: 200, h: 85 };
const line = (points: Position[], path: StrokePath = "straight", id = "l"): DrawingElement => ({
    id, action: "skate", path, end: "arrow", points, color: "#212121", strokeWidth: 2,
});
/** n points along y = 40 + 8 sin(i / 4): a wavy freehand line. */
const wave = (n: number): Position[] => Array.from({ length: n }, (_, i) => ({ x: 40 + i * 2, y: 40 + 8 * Math.sin(i / 4) }));
/** A straight line with `bends` bends, zig-zagging so every bend is real. */
const zigzag = (bends: number): Position[] =>
    Array.from({ length: bends + 2 }, (_, i) => ({ x: 20 + i * 10, y: i % 2 === 0 ? 40 : 50 }));

describe("limits", () => {
    it("are 6 bends and 8 points", () => {
        expect([MAX_LINE_BENDS, MAX_EDIT_POINTS, SNAP_RADIUS_FT, DOUBLE_TAP_MS]).toEqual([6, 8, 3, 300]);
    });

    it("give every starter straight line a bend handle per interior point, and '+' handles only under 6 bends", () => {
        for (const play of STARTER_PLAYS) {
            for (const d of play.playData.drawings) {
                if (d.path !== "straight") continue;
                const handles = lineHandles(d);
                const bends = d.points.length - 2;
                expect(handles.filter((h) => h.kind === "bend")).toHaveLength(bends);
                expect(handles.filter((h) => h.kind === "add")).toHaveLength(bends < MAX_LINE_BENDS ? d.points.length - 1 : 0);
            }
        }
        // The 16-point figure-eight is the starter line with more points than an edit can make
        const eight = STARTER_PLAYS.flatMap((p) => p.playData.drawings).find((d) => d.id === "ec-figure-eight")!;
        expect(eight.points).toHaveLength(16);
        expect(insertBend(eight, 0, { x: 160, y: 30 }, RINK)).toBe(eight);
        expect(straighten(eight).points).toHaveLength(2);
    });
});

describe("anchorPoints", () => {
    it("keeps at most 8 points, always the first and last, all taken from the line", () => {
        const pts = wave(50);
        const anchors = anchorPoints(pts);
        expect(anchors.length).toBeLessThanOrEqual(MAX_EDIT_POINTS);
        expect(anchors.length).toBeGreaterThan(2);
        expect(anchors[0]).toEqual(pts[0]);
        expect(anchors[anchors.length - 1]).toEqual(pts[49]);
        for (const a of anchors) expect(pts).toContainEqual(a);
    });

    it("collapses collinear points to the two ends", () => {
        const pts = Array.from({ length: 20 }, (_, i) => ({ x: i * 3, y: 10 }));
        expect(anchorPoints(pts)).toEqual([{ x: 0, y: 10 }, { x: 57, y: 10 }]);
    });

    it("returns the same array when every point is kept", () => {
        const pts = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }, { x: 30, y: 10 }];
        expect(anchorPoints(pts)).toBe(pts);
        const two = [{ x: 0, y: 0 }, { x: 5, y: 5 }];
        expect(anchorPoints(two)).toBe(two);
    });
});

describe("lineHandles", () => {
    it("gives a 2-point line two ends and one '+' at its midpoint", () => {
        expect(lineHandles(line([{ x: 0, y: 0 }, { x: 100, y: 0 }]))).toEqual([
            { kind: "end", index: 0, position: { x: 0, y: 0 } },
            { kind: "end", index: 1, position: { x: 100, y: 0 } },
            { kind: "add", segment: 0, position: { x: 50, y: 0 } },
        ]);
    });

    it("puts a bent line's '+' handles on the drawn curve", () => {
        const handles = lineHandles(line([{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 0 }]));
        expect(handles.map((h) => h.kind)).toEqual(["end", "end", "bend", "add", "add"]);
        const adds = handles.filter((h) => h.kind === "add");
        expect(adds[0].position.x).toBeCloseTo(25, 6);
        expect(adds[0].position.y).toBeCloseTo(31.25, 6);
        expect(adds[1].position.x).toBeCloseTo(75, 6);
        expect(adds[1].position.y).toBeCloseTo(31.25, 6);
    });

    it("shows no '+' once a line has 6 bends", () => {
        const handles = lineHandles(line(zigzag(6)));
        expect(handles.filter((h) => h.kind === "bend")).toHaveLength(6);
        expect(handles.filter((h) => h.kind === "add")).toHaveLength(0);
    });

    it("gives an older line with more than 8 points a bend on every interior point and no '+'", () => {
        const handles = lineHandles(line(zigzag(8)));
        expect(handles.filter((h) => h.kind === "bend")).toHaveLength(8);
        expect(handles.filter((h) => h.kind === "add")).toHaveLength(0);
    });

    it("gives a freehand line its ends and up to 6 anchors, and no '+'", () => {
        const pts = wave(50);
        const anchors = anchorPoints(pts);
        const handles = lineHandles(line(pts, "freehand"));
        expect(handles.filter((h) => h.kind === "end").map((h) => h.position)).toEqual([anchors[0], anchors[anchors.length - 1]]);
        expect(handles.filter((h) => h.kind === "anchor").map((h) => h.position)).toEqual(anchors.slice(1, -1));
        expect(handles.filter((h) => h.kind === "anchor").length).toBeLessThanOrEqual(MAX_LINE_BENDS);
        expect(handles.some((h) => h.kind === "add")).toBe(false);
    });
});

describe("hitTestLineHandle", () => {
    const handles: LineHandle[] = [
        { kind: "end", index: 0, position: { x: 0, y: 0 } },
        { kind: "add", segment: 0, position: { x: 2, y: 0 } },
    ];

    it("picks the nearest handle inside the radius", () => {
        expect(hitTestLineHandle(handles, { x: 1.6, y: 0 }, 3)).toBe(handles[1]);
        expect(hitTestLineHandle(handles, { x: 0.2, y: 0 }, 3)).toBe(handles[0]);
    });

    it("lets the earlier handle (an end) win a tie", () => {
        expect(hitTestLineHandle(handles, { x: 1, y: 0 }, 3)).toBe(handles[0]);
    });

    it("misses outside the radius", () => {
        expect(hitTestLineHandle(handles, { x: 10, y: 0 }, 3)).toBeNull();
    });
});

describe("moveLinePoint", () => {
    const l = line([{ x: 10, y: 10 }, { x: 50, y: 10 }]);

    it("moves one point and leaves the others", () => {
        expect(moveLinePoint(l, 1, { x: 60, y: 30 }, RINK).points).toEqual([{ x: 10, y: 10 }, { x: 60, y: 30 }]);
    });

    it("keeps the point inside the area", () => {
        const area = { x: 0, y: 0, w: 55, h: 20 };
        expect(moveLinePoint(l, 1, { x: 80, y: 30 }, area).points[1]).toEqual({ x: 55, y: 20 });
    });

    it("returns the same line when nothing moves or the index is unknown", () => {
        expect(moveLinePoint(l, 1, { x: 50, y: 10 }, RINK)).toBe(l);
        expect(moveLinePoint(l, 5, { x: 1, y: 1 }, RINK)).toBe(l);
    });

    it("replaces a freehand line's points with its anchors on the first drag, and keeps it freehand", () => {
        const free = line(wave(50), "freehand");
        const anchors = anchorPoints(free.points);
        const moved = moveLinePoint(free, anchors.length - 1, { x: 150, y: 70 }, RINK);
        expect(moved.path).toBe("freehand");
        expect(moved.points.length).toBe(anchors.length);
        expect(moved.points[0]).toEqual(free.points[0]);
        expect(moved.points[moved.points.length - 1]).toEqual({ x: 150, y: 70 });
    });
});

describe("moveLine", () => {
    it("moves every point by the same amount", () => {
        const l = line([{ x: 10, y: 10 }, { x: 20, y: 30 }]);
        expect(moveLine(l, { x: 5, y: -5 }, RINK).points).toEqual([{ x: 15, y: 5 }, { x: 25, y: 25 }]);
    });

    it("clamps the move as a whole at the area's edge, so the shape is kept", () => {
        const l = line([{ x: 180, y: 10 }, { x: 195, y: 20 }]);
        expect(moveLine(l, { x: 20, y: 0 }, RINK).points).toEqual([{ x: 185, y: 10 }, { x: 200, y: 20 }]);
    });

    it("does not move a line along an axis on which it is longer than the area", () => {
        const area = { x: 100, y: 30, w: 20, h: 20 };
        const l = line([{ x: 90, y: 35 }, { x: 130, y: 40 }]);
        expect(moveLine(l, { x: 5, y: 3 }, area).points).toEqual([{ x: 90, y: 38 }, { x: 130, y: 43 }]);
    });

    it("never simplifies a freehand line", () => {
        const free = line(wave(50), "freehand");
        expect(moveLine(free, { x: 1, y: 1 }, RINK).points).toHaveLength(50);
    });

    it("returns the same line when the move comes to nothing", () => {
        const l = line([{ x: 190, y: 10 }, { x: 200, y: 20 }]);
        expect(moveLine(l, { x: 0, y: 0 }, RINK)).toBe(l);
        expect(moveLine(l, { x: 5, y: 0 }, RINK)).toBe(l);
    });
});

describe("insertBend and removeBend", () => {
    const l = line([{ x: 0, y: 0 }, { x: 100, y: 0 }]);

    it("inserts a bend after the segment's first point, inside the area", () => {
        expect(insertBend(l, 0, { x: 50, y: 20 }, RINK).points).toEqual([{ x: 0, y: 0 }, { x: 50, y: 20 }, { x: 100, y: 0 }]);
        expect(insertBend(l, 0, { x: 50, y: -10 }, RINK).points[1]).toEqual({ x: 50, y: 0 });
    });

    it("refuses a seventh bend, a freehand line and an unknown segment", () => {
        const full = line(zigzag(6));
        expect(insertBend(full, 0, { x: 1, y: 1 }, RINK)).toBe(full);
        const free = line([{ x: 0, y: 0 }, { x: 100, y: 0 }], "freehand");
        expect(insertBend(free, 0, { x: 50, y: 20 }, RINK)).toBe(free);
        expect(insertBend(l, 1, { x: 50, y: 20 }, RINK)).toBe(l);
        expect(insertBend(l, -1, { x: 50, y: 20 }, RINK)).toBe(l);
        const legacy = line(zigzag(8));
        expect(insertBend(legacy, 0, { x: 1, y: 1 }, RINK)).toBe(legacy);
    });

    it("removes an interior bend but never an end", () => {
        const bent = line([{ x: 0, y: 0 }, { x: 50, y: 20 }, { x: 100, y: 0 }]);
        expect(removeBend(bent, 1).points).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
        expect(removeBend(bent, 0)).toBe(bent);
        expect(removeBend(bent, 2)).toBe(bent);
        const free = line(wave(10), "freehand");
        expect(removeBend(free, 3)).toBe(free);
    });
});

describe("straighten", () => {
    it("keeps a bent line's first and last points", () => {
        const s = straighten(line(zigzag(3)));
        expect(s.path).toBe("straight");
        expect(s.points).toEqual([{ x: 20, y: 40 }, { x: 60, y: 40 }]);
    });

    it("makes a freehand line straight between its ends", () => {
        const pts = wave(30);
        const s = straighten(line(pts, "freehand"));
        expect(s.path).toBe("straight");
        expect(s.points).toEqual([pts[0], pts[29]]);
    });

    it("straightens an older line with more than 8 points", () => {
        expect(straighten(line(zigzag(8))).points).toHaveLength(2);
    });

    it("returns the same line when it is already straight", () => {
        const l = line([{ x: 0, y: 0 }, { x: 10, y: 0 }]);
        expect(straighten(l)).toBe(l);
    });
});

describe("findSnapTarget", () => {
    const data: PlayData = {
        ...createEmptyPlayData(),
        players: [{ id: "p", position: { x: 50, y: 40 }, role: "X", label: "", color: "#1976D2" }],
        equipment: [{ id: "c", kind: "cone", position: { x: 52, y: 40 }, rotation: 0 }],
        drawings: [
            line([{ x: 100, y: 10 }, { x: 110, y: 20 }, { x: 120, y: 10 }], "straight", "other"),
            line([{ x: 150, y: 60 }, { x: 160, y: 60 }], "straight", "self"),
        ],
        annotations: [{ id: "a", text: "Here", position: { x: 80, y: 70 }, fontSize: 8, color: "#000000" }],
    };

    it("snaps to the nearest target inside the radius", () => {
        expect(findSnapTarget(data, { x: 51.2, y: 40 }, { radiusFt: 3 })).toEqual({ x: 52, y: 40 });
        expect(findSnapTarget(data, { x: 60, y: 40 }, { radiusFt: 3 })).toBeNull();
    });

    it("gives a tie to the earlier target: players, then equipment, then line ends", () => {
        expect(findSnapTarget(data, { x: 51, y: 40 }, { radiusFt: 3 })).toEqual({ x: 50, y: 40 });
    });

    it("snaps to another line's first and last points, not its bends", () => {
        expect(findSnapTarget(data, { x: 101, y: 11 }, { radiusFt: 3 })).toEqual({ x: 100, y: 10 });
        expect(findSnapTarget(data, { x: 110, y: 19 }, { radiusFt: 3 })).toBeNull();
    });

    it("never snaps a line to itself", () => {
        expect(findSnapTarget(data, { x: 151, y: 60 }, { radiusFt: 3 })).toEqual({ x: 150, y: 60 });
        expect(findSnapTarget(data, { x: 151, y: 60 }, { radiusFt: 3, excludeId: "self" })).toBeNull();
    });

    it("ignores text, and skips everything when bypassed (Alt/Option)", () => {
        expect(findSnapTarget(data, { x: 80, y: 70 }, { radiusFt: 3 })).toBeNull();
        expect(findSnapTarget(data, { x: 50, y: 40 }, { radiusFt: 3, bypass: true })).toBeNull();
    });

    it("skips targets outside the drill's area", () => {
        expect(findSnapTarget(data, { x: 51, y: 40 }, { radiusFt: 3, rect: { x: 51, y: 30, w: 20, h: 20 } })).toEqual({ x: 52, y: 40 });
    });

    it("returns a copy, never the target's own position object", () => {
        expect(findSnapTarget(data, { x: 50, y: 40 }, { radiusFt: 3 })).not.toBe(data.players[0].position);
    });

    it("uses the larger of 3 ft and the board's hit radius", () => {
        expect(snapRadiusFt(1.83)).toBe(3);
        expect(snapRadiusFt(5.79)).toBe(5.79);
    });
});

describe("isDoubleTap", () => {
    const first: TapRecord = { id: "l", index: 1, position: { x: 50, y: 20 }, time: 1000 };

    it("is two presses on the same bend within 300 ms and the radius", () => {
        expect(isDoubleTap(first, { ...first, position: { x: 51, y: 20 }, time: 1300 }, 3)).toBe(true);
    });

    it("is not a slow second press, another bend, another line, a far press or a first press", () => {
        expect(isDoubleTap(first, { ...first, time: 1301 }, 3)).toBe(false);
        expect(isDoubleTap(first, { ...first, index: 2, time: 1100 }, 3)).toBe(false);
        expect(isDoubleTap(first, { ...first, id: "m", time: 1100 }, 3)).toBe(false);
        expect(isDoubleTap(first, { ...first, position: { x: 60, y: 20 }, time: 1100 }, 3)).toBe(false);
        expect(isDoubleTap(null, first, 3)).toBe(false);
    });
});
```

Append to `__tests__/lib/utils/canvas/element-ops.test.ts` (add `replaceDrawing` to the `element-ops` import on line 2):

```ts
describe("line edits through element-ops (line editing R3)", () => {
    it("patches a line's path and points, as Straighten does", () => {
        const bent = { ...data, drawings: [{ ...data.drawings[0], points: [{ x: 0, y: 0 }, { x: 2, y: 4 }, { x: 5, y: 5 }] }] };
        const next = updateElement(bent, "d", { path: "straight", points: [{ x: 0, y: 0 }, { x: 5, y: 5 }] });
        expect(next.drawings[0].points).toEqual([{ x: 0, y: 0 }, { x: 5, y: 5 }]);
        expect(updateElement(data, "p", { points: [] } as never)).toBe(data); // not a player field
    });

    it("replaces a drawing by id", () => {
        const edited = { ...data.drawings[0], points: [{ x: 1, y: 1 }, { x: 6, y: 6 }] };
        const next = replaceDrawing(data, edited);
        expect(next.drawings[0]).toBe(edited);
        expect(next.players).toBe(data.players);
    });

    it("returns the same data for the same drawing object or an unknown id", () => {
        expect(replaceDrawing(data, data.drawings[0])).toBe(data);
        expect(replaceDrawing(data, { ...data.drawings[0], id: "zzz" })).toBe(data);
    });
});
```

Append to `__tests__/lib/utils/canvas/interaction-utils.test.ts` (add `distanceToLineSegment` and `drawingHitRadius` to its `interaction-utils` import):

```ts
describe("drawing hit radius and segment distance", () => {
    it("uses 5 ft, or the board's minimum when larger", () => {
        expect(drawingHitRadius()).toBe(5);
        expect(drawingHitRadius(7)).toBe(7);
    });

    it("measures a point's distance to a segment, clamped to its ends", () => {
        expect(distanceToLineSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
        expect(distanceToLineSegment({ x: 13, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
    });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `bun run test __tests__/lib/utils/canvas/line-editing.test.ts __tests__/lib/utils/canvas/element-ops.test.ts __tests__/lib/utils/canvas/interaction-utils.test.ts`
Expected: FAIL. `line-editing.test.ts` cannot resolve `@/lib/utils/canvas/line-editing`; `replaceDrawing`, `drawingHitRadius` and `distanceToLineSegment` are not exported; the `path`/`points` patch leaves the bend in place.

- [ ] **Step 3: Export the segment distance and the drawing radius**

In `lib/utils/canvas/interaction-utils.ts`, change line 392 from `function distanceToLineSegment(` to `export function distanceToLineSegment(`. Add after `hitTestEquipment`:

```ts
/** Hit radius in feet for a drawing: HIT_THRESHOLD, or the board's minimum when larger. */
export function drawingHitRadius(minHitRadiusFt = 0): number {
    return Math.max(HIT_THRESHOLD, minHitRadiusFt);
}
```

and in `hitTest` replace `hitTestDrawing(point, drawing, Math.max(HIT_THRESHOLD, minHitRadiusFt))` with `hitTestDrawing(point, drawing, drawingHitRadius(minHitRadiusFt))`.

- [ ] **Step 4: Let element-ops patch and replace a line**

In `lib/utils/canvas/element-ops.ts`, replace lines 28–38 with:

```ts
export type ElementPatch = Partial<Pick<PlayerIcon, "role" | "label" | "color">> &
    Partial<Pick<DrawingElement, "action" | "end" | "color" | "path" | "points">> &
    Partial<Pick<EquipmentItem, "kind" | "rotation">> &
    Partial<Pick<TextAnnotation, "text" | "color">>;

const ALLOWED: Record<ElementKind, readonly (keyof ElementPatch)[]> = {
    player: ["role", "label", "color"],
    // path and points: the inspector's Straighten / Make straight (line editing R3)
    drawing: ["action", "end", "color", "path", "points"],
    equipment: ["kind", "rotation"],
    annotation: ["text", "color"],
};
```

and add after `moveElement`:

```ts
/**
 * `data` with the drawing whose id is `stroke.id` replaced by `stroke` (a line
 * edit's result). Same reference for an unknown id or the same object, so
 * callers can skip a no-op history entry.
 */
export function replaceDrawing(data: PlayData, stroke: DrawingElement): PlayData {
    const index = data.drawings.findIndex((d) => d.id === stroke.id);
    if (index < 0 || data.drawings[index] === stroke) return data;
    const drawings = data.drawings.slice();
    drawings[index] = stroke;
    return { ...data, drawings };
}
```

(`updateElement`'s no-op check compares by `===`, so a `points` patch always records a step. The inspector only sends one when `straighten` returns a new line; Task 5.)

- [ ] **Step 5: Write `line-editing.ts`**

Create `lib/utils/canvas/line-editing.ts`:

```ts
/**
 * Line editing on the practice board (line editing spec R1, R3, R4, R5):
 * pure helpers for a line's handles, the edits a handle drag makes, and
 * where a line end snaps. Rink feet throughout. No DOM and no React, so the
 * static planner shares it unchanged (ADR-0020).
 *
 * Every edit returns the same reference when it changes nothing, so the
 * board can skip a no-op history entry.
 */
import type { DrawingElement, PlayData, Position, RinkRect } from "@/types/practice-planner";
import { RINK_HEIGHT_FT, RINK_WIDTH_FT } from "@/lib/utils/play-data";
import { rectContains } from "@/lib/utils/ice-area";
import { clampToRect, distanceToLineSegment } from "./interaction-utils";
import { curvePoint } from "./stroke-geometry";

/** Bends an edit may give a straight line (R1). */
export const MAX_LINE_BENDS = 6;
/** Points in an edited line: its two ends plus MAX_LINE_BENDS bends (or freehand anchors). */
export const MAX_EDIT_POINTS = MAX_LINE_BENDS + 2;
/** Snap radius floor in feet (R4); the board uses the larger of this and its minimum hit radius. */
export const SNAP_RADIUS_FT = 3;
/** Two presses on one bend within this many milliseconds remove it (R3). */
export const DOUBLE_TAP_MS = 300;
/** A freehand point closer than this to the simplified line is not an anchor. */
const ANCHOR_TOLERANCE_FT = 0.25;
const RINK: RinkRect = { x: 0, y: 0, w: RINK_WIDTH_FT, h: RINK_HEIGHT_FT };

export type LineStroke = Pick<DrawingElement, "path" | "points">;

/**
 * A handle on the selected line. `index` is a position in the line's
 * editable points: its stored points for a straight line, its anchorPoints
 * for a freehand line. An "add" handle sits on segment `segment` (between
 * points `segment` and `segment + 1`); dragging it inserts a bend there.
 */
export type LineHandle =
    | { kind: "end" | "bend" | "anchor"; index: number; position: Position }
    | { kind: "add"; segment: number; position: Position };

/** The points an edit works on: a straight line's own, or a freehand line's anchors. */
function editablePoints(stroke: LineStroke): Position[] {
    return stroke.path === "freehand" ? anchorPoints(stroke.points) : stroke.points;
}

/**
 * Up to `max` of `points`, always the first and last: a greedy
 * Douglas–Peucker pass that adds, each round, the point farthest from the
 * line through the points kept so far, until `max` are kept or none is more
 * than ANCHOR_TOLERANCE_FT away. Returns `points` itself when all are kept.
 */
export function anchorPoints(points: Position[], max: number = MAX_EDIT_POINTS): Position[] {
    if (points.length <= 2) return points;
    const kept = [0, points.length - 1];
    while (kept.length < max) {
        let best = -1;
        let bestDistance = ANCHOR_TOLERANCE_FT;
        let insertAt = -1;
        for (let k = 0; k < kept.length - 1; k++) {
            const a = kept[k];
            const b = kept[k + 1];
            for (let i = a + 1; i < b; i++) {
                const d = distanceToLineSegment(points[i], points[a], points[b]);
                if (d > bestDistance) {
                    best = i;
                    bestDistance = d;
                    insertAt = k + 1;
                }
            }
        }
        if (best < 0) break;
        kept.splice(insertAt, 0, best);
    }
    if (kept.length === points.length) return points;
    return kept.map((i) => ({ ...points[i] }));
}

/**
 * The selected line's handles (R3), ends first so they win ties: the two
 * ends; a bend handle on each interior point of a straight line, or an
 * anchor handle on each interior anchor of a freehand line; and, on a
 * straight line with fewer than MAX_LINE_BENDS bends, a "+" handle on each
 * segment at the drawn curve's midpoint (the plain midpoint for 2 points).
 */
export function lineHandles(stroke: LineStroke): LineHandle[] {
    const points = editablePoints(stroke);
    const last = points.length - 1;
    if (last < 1) return [];
    const handles: LineHandle[] = [
        { kind: "end", index: 0, position: points[0] },
        { kind: "end", index: last, position: points[last] },
    ];
    const interior: "bend" | "anchor" = stroke.path === "freehand" ? "anchor" : "bend";
    for (let i = 1; i < last; i++) handles.push({ kind: interior, index: i, position: points[i] });
    if (stroke.path === "straight" && last - 1 < MAX_LINE_BENDS) {
        for (let segment = 0; segment < last; segment++) {
            const position = last === 1
                ? { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 }
                : curvePoint(points, segment, 0.5);
            handles.push({ kind: "add", segment, position });
        }
    }
    return handles;
}

/** The handle nearest `point` within `radiusFt`; on a tie, the earlier one. */
export function hitTestLineHandle(handles: readonly LineHandle[], point: Position, radiusFt: number): LineHandle | null {
    let hit: LineHandle | null = null;
    let nearest = Infinity;
    for (const handle of handles) {
        const d = Math.hypot(point.x - handle.position.x, point.y - handle.position.y);
        if (d <= radiusFt && d < nearest) {
            hit = handle;
            nearest = d;
        }
    }
    return hit;
}

/**
 * Moves editable point `index` (an end, a bend or an anchor) to `to`, kept
 * inside `rect`. A freehand line's points become its anchors (at most 8),
 * and it stays freehand, so it is still smoothed (R3).
 */
export function moveLinePoint(stroke: DrawingElement, index: number, to: Position, rect: RinkRect): DrawingElement {
    const points = editablePoints(stroke);
    if (!Number.isInteger(index) || index < 0 || index >= points.length) return stroke;
    const target = clampToRect(to, rect);
    if (points === stroke.points && points[index].x === target.x && points[index].y === target.y) return stroke;
    return { ...stroke, points: points.map((p, i) => (i === index ? target : { ...p })) };
}

/** One axis of a whole-line move: the shift keeping [min, max] in [lo, hi]; none when the line is longer than that. */
function clampShift(shift: number, min: number, max: number, lo: number, hi: number): number {
    if (max - min > hi - lo) return 0;
    return Math.min(hi - max, Math.max(lo - min, shift));
}

/**
 * Moves the whole line by `delta`, clamped as a whole so every point stays
 * inside `rect` and the shape is never distorted (R3). A line longer than
 * `rect` along an axis does not move along it. Never simplifies.
 */
export function moveLine(stroke: DrawingElement, delta: Position, rect: RinkRect): DrawingElement {
    const xs = stroke.points.map((p) => p.x);
    const ys = stroke.points.map((p) => p.y);
    const dx = clampShift(delta.x, Math.min(...xs), Math.max(...xs), rect.x, rect.x + rect.w);
    const dy = clampShift(delta.y, Math.min(...ys), Math.max(...ys), rect.y, rect.y + rect.h);
    if (dx === 0 && dy === 0) return stroke;
    // The rink clamp only absorbs floating-point rounding at the boards
    return { ...stroke, points: stroke.points.map((p) => clampToRect({ x: p.x + dx, y: p.y + dy }, RINK)) };
}

/** Adds a bend on segment `segment` at `at` (kept inside `rect`); straight lines with fewer than 6 bends only. */
export function insertBend(stroke: DrawingElement, segment: number, at: Position, rect: RinkRect): DrawingElement {
    const { points } = stroke;
    if (stroke.path !== "straight" || points.length - 2 >= MAX_LINE_BENDS) return stroke;
    if (!Number.isInteger(segment) || segment < 0 || segment > points.length - 2) return stroke;
    const next = points.map((p) => ({ ...p }));
    next.splice(segment + 1, 0, clampToRect(at, rect));
    return { ...stroke, points: next };
}

/** Removes bend `index` of a straight line; ends can't be removed (R3). */
export function removeBend(stroke: DrawingElement, index: number): DrawingElement {
    if (stroke.path !== "straight" || index <= 0 || index >= stroke.points.length - 1) return stroke;
    return { ...stroke, points: stroke.points.filter((_, i) => i !== index) };
}

/** Straighten / Make straight (R3): a straight line between the first and last points. */
export function straighten(stroke: DrawingElement): DrawingElement {
    const { points } = stroke;
    if (stroke.path === "straight" && points.length === 2) return stroke;
    return { ...stroke, path: "straight", points: [{ ...points[0] }, { ...points[points.length - 1] }] };
}

export interface SnapOptions {
    /** Snap radius in feet (snapRadiusFt) */
    radiusFt: number;
    /** The line being edited: never its own target */
    excludeId?: string;
    /** Alt/Option held: no snapping for this gesture */
    bypass?: boolean;
    /** Targets outside this rectangle (the drill's ice area) are skipped */
    rect?: RinkRect;
}

/**
 * Where a line end at `point` snaps (R4): the nearest player centre,
 * equipment centre, or first or last point of another line within
 * `radiusFt`; ties go to the earlier target in that order. Text is never a
 * target. A copy, or null for no snap.
 */
export function findSnapTarget(data: PlayData, point: Position, options: SnapOptions): Position | null {
    if (options.bypass) return null;
    const candidates: Position[] = [
        ...data.players.map((p) => p.position),
        ...data.equipment.map((e) => e.position),
        ...data.drawings
            .filter((d) => d.id !== options.excludeId)
            .flatMap((d) => [d.points[0], d.points[d.points.length - 1]]),
    ];
    let best: Position | null = null;
    let nearest = Infinity;
    for (const c of candidates) {
        if (options.rect && !rectContains(options.rect, c)) continue;
        const d = Math.hypot(c.x - point.x, c.y - point.y);
        if (d <= options.radiusFt && d < nearest) {
            best = c;
            nearest = d;
        }
    }
    return best ? { ...best } : null;
}

/** The board's snap radius: the larger of SNAP_RADIUS_FT and its minimum hit radius in feet (R4). */
export function snapRadiusFt(minHitRadiusFt: number): number {
    return Math.max(SNAP_RADIUS_FT, minHitRadiusFt);
}

/** A press on a bend handle, remembered to recognize a double-tap. */
export interface TapRecord {
    /** The line's id */
    id: string;
    /** The bend's index */
    index: number;
    /** Where the press landed (rink feet) */
    position: Position;
    /** When, in milliseconds */
    time: number;
}

/** Two presses on the same bend of the same line within `windowMs` and `radiusFt` (R3). */
export function isDoubleTap(previous: TapRecord | null, next: TapRecord, radiusFt: number, windowMs: number = DOUBLE_TAP_MS): boolean {
    if (!previous) return false;
    const elapsed = next.time - previous.time;
    return (
        previous.id === next.id &&
        previous.index === next.index &&
        elapsed >= 0 &&
        elapsed <= windowMs &&
        Math.hypot(next.position.x - previous.position.x, next.position.y - previous.position.y) <= radiusFt
    );
}
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `bun run test __tests__/lib/utils/canvas __tests__/lib/data`
Expected: PASS.

Run: `bun run type-check && bun run lint`
Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
/usr/bin/git add lib/utils/canvas/line-editing.ts lib/utils/canvas/interaction-utils.ts lib/utils/canvas/element-ops.ts \
  __tests__/lib/utils/canvas/line-editing.test.ts __tests__/lib/utils/canvas/element-ops.test.ts \
  __tests__/lib/utils/canvas/interaction-utils.test.ts
/usr/bin/git commit -m "feat(practice-planner): add pure line editing helpers" -m "$SESSION_TRAILER"
```

---

### Task 3: Move touch handling out of RinkBoard and pin its line budget

`RinkBoard.tsx` is at its 1057-line budget. Before any line-editing code goes in, the touch and pinch handling (about 190 lines, a leaf: it only calls the board's pointer handlers, the pan bound and the abandon routine) moves to `useBoardTouch.ts`, unchanged in behaviour (spec R5). Its callback seam, `onAbandon`, is how a second finger will later cancel a line drag without the hook changing. The three pinch-cancel tests in `RinkBoard.ice-area.test.tsx` are the behaviour guard and must pass unchanged.

**Files:**
- Create: `components/features/practice-planner/useBoardTouch.ts`
- Modify: `components/features/practice-planner/RinkBoard.tsx` (imports lines 46–58; `TAP_TOOLS` lines 120–124; refs lines 176–179; viewport-reset effect lines 295–302; the touch block lines 837–1024)
- Test (create): `__tests__/components/features/practice-planner/useBoardTouch.test.ts`, `__tests__/components/features/practice-planner/RinkBoard.line-budget.test.ts`
- Existing tests that must stay green unchanged: `__tests__/components/features/practice-planner/RinkBoard.test.tsx`, `RinkBoard.ice-area.test.tsx`, `PlayEditor*.test.tsx`.

**Interfaces:**
- Produces, from `components/features/practice-planner/useBoardTouch.ts`:
  - `TAP_TOOLS: ReadonlySet<DrawingTool>` (moved);
  - `interface BoardTouchOptions { canvasRef: React.RefObject<HTMLCanvasElement | null>; enabled: boolean; areaTool: boolean; selectedTool: DrawingTool; scaleRef: React.RefObject<number>; panOffsetRef: React.RefObject<Position>; applyView: (view: BoardView) => void; onPointerDown: (clientX: number, clientY: number) => void; onPointerMove: (clientX: number, clientY: number) => void; onPointerUp: () => void; onAbandon: () => void }`;
  - `interface BoardTouch { handleTouchStart; handleTouchMove; handleTouchEnd: (event: React.TouchEvent<HTMLCanvasElement>) => void; handleTouchCancel: () => void; resetGestures: () => void }`;
  - `useBoardTouch(options: BoardTouchOptions): BoardTouch`.
- RinkBoard keeps `abandonTransientInteraction` (Task 4 adds the line cancel to it) and gains `simulateMouseMove` and `applyPinchView`.

- [ ] **Step 1: Write the failing hook and budget tests**

Create `__tests__/components/features/practice-planner/useBoardTouch.test.ts`:

```ts
/** Touch input for the rink board, moved out of RinkBoard (line editing spec R5, R6). */
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { TAP_TOOLS, useBoardTouch, type BoardTouchOptions } from "@/components/features/practice-planner/useBoardTouch";

function setup(overrides: Partial<BoardTouchOptions> = {}) {
    const canvas = document.createElement("canvas");
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 400, right: 800, bottom: 400, x: 0, y: 0, toJSON: () => ({}) });
    const options: BoardTouchOptions = {
        canvasRef: { current: canvas },
        enabled: true,
        areaTool: false,
        selectedTool: "select",
        scaleRef: { current: 1 },
        panOffsetRef: { current: { x: 0, y: 0 } },
        applyView: vi.fn(),
        onPointerDown: vi.fn(),
        onPointerMove: vi.fn(),
        onPointerUp: vi.fn(),
        onAbandon: vi.fn(),
        ...overrides,
    };
    const { result } = renderHook(() => useBoardTouch(options));
    return { options, touch: result.current };
}

const touches = (...points: Array<[number, number]>) =>
    ({
        touches: points.map(([clientX, clientY]) => ({ clientX, clientY })),
        cancelable: false,
        preventDefault: vi.fn(),
    }) as unknown as React.TouchEvent<HTMLCanvasElement>;

describe("useBoardTouch", () => {
    it("presses at once with the select tool, and moves and releases like the mouse", () => {
        const { options, touch } = setup();
        touch.handleTouchStart(touches([10, 20]));
        touch.handleTouchMove(touches([30, 40]));
        touch.handleTouchEnd(touches());
        expect(options.onPointerDown).toHaveBeenCalledWith(10, 20);
        expect(options.onPointerMove).toHaveBeenCalledWith(30, 40);
        expect(options.onPointerUp).toHaveBeenCalledTimes(1);
    });

    it("waits for the finger to lift with a tap tool", () => {
        expect([...TAP_TOOLS].sort()).toEqual(["equipment", "eraser", "player", "text"]);
        const { options, touch } = setup({ selectedTool: "player" });
        touch.handleTouchStart(touches([10, 20]));
        expect(options.onPointerDown).not.toHaveBeenCalled();
        touch.handleTouchEnd(touches());
        expect(options.onPointerDown).toHaveBeenCalledWith(10, 20);
    });

    it("abandons the first finger's gesture when a second lands, then pinches", () => {
        const { options, touch } = setup();
        touch.handleTouchStart(touches([100, 100]));
        touch.handleTouchStart(touches([100, 100], [200, 100]));
        expect(options.onAbandon).toHaveBeenCalledTimes(1);
        touch.handleTouchMove(touches([50, 100], [250, 100]));
        expect(options.applyView).toHaveBeenCalledWith(expect.objectContaining({ zoom: 2 }));
    });

    it("abandons on touchcancel and ignores input while disabled", () => {
        const { options, touch } = setup();
        touch.handleTouchCancel();
        expect(options.onAbandon).toHaveBeenCalledTimes(1);
        const off = setup({ enabled: false });
        off.touch.handleTouchStart(touches([10, 20]));
        expect(off.options.onPointerDown).not.toHaveBeenCalled();
    });
});
```

Create `__tests__/components/features/practice-planner/RinkBoard.line-budget.test.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const BOARD = path.join(process.cwd(), "components/features/practice-planner/RinkBoard.tsx");

describe("RinkBoard line budget", () => {
    it("stays at or under 1057 lines (gesture logic belongs in useBoardTouch, useStrokeEditing or lib/utils/canvas)", () => {
        const lines = readFileSync(BOARD, "utf8").trimEnd().split("\n").length;
        expect(lines).toBeLessThanOrEqual(1057);
    });
});
```

- [ ] **Step 2: Run them to see the hook test fail**

Run: `bun run test __tests__/components/features/practice-planner/useBoardTouch.test.ts __tests__/components/features/practice-planner/RinkBoard.line-budget.test.ts`
Expected: `useBoardTouch.test.ts` FAILS (cannot resolve `@/components/features/practice-planner/useBoardTouch`); the budget test passes at exactly 1057 and keeps passing from here on.

- [ ] **Step 3: Create `useBoardTouch.ts`**

Create `components/features/practice-planner/useBoardTouch.ts`:

```ts
"use client";

/**
 * Touch input for the rink board, moved out of RinkBoard unchanged in
 * behaviour: one finger acts like the mouse (tap tools wait for the finger
 * to lift), two fingers pinch to zoom and pan, and a second finger or a
 * touchcancel abandons whatever the first finger started. RinkBoard supplies
 * the pointer callbacks and applies the pinch's view.
 *
 * Requirements: 3.5
 */
import React, { useCallback, useRef } from "react";
import type { DrawingTool, Position } from "@/types/practice-planner";
import { DRAG_THRESHOLD_PX, pinchView, type BoardView } from "@/lib/utils/canvas/interaction-utils";

/**
 * Tools whose touch tap acts once (place, erase, ask for text). On touch they
 * wait for the finger to lift, so the first finger of a pinch never acts.
 */
export const TAP_TOOLS: ReadonlySet<DrawingTool> = new Set<DrawingTool>(["player", "equipment", "eraser", "text"]);

export interface BoardTouchOptions {
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    /** False until the board has a transform; touches are ignored until then */
    enabled: boolean;
    areaTool: boolean;
    selectedTool: DrawingTool;
    /** The board's zoom and pan, read when a pinch starts */
    scaleRef: React.RefObject<number>;
    panOffsetRef: React.RefObject<Position>;
    /** Applies a pinch's view (RinkBoard bounds the pan and updates its refs and state) */
    applyView: (view: BoardView) => void;
    /** A one-finger press, move and release, in client px (RinkBoard maps them like mouse events) */
    onPointerDown: (clientX: number, clientY: number) => void;
    onPointerMove: (clientX: number, clientY: number) => void;
    onPointerUp: () => void;
    /** A second finger or a touchcancel: drop any gesture in progress without committing it */
    onAbandon: () => void;
}

export interface BoardTouch {
    handleTouchStart: (event: React.TouchEvent<HTMLCanvasElement>) => void;
    handleTouchMove: (event: React.TouchEvent<HTMLCanvasElement>) => void;
    handleTouchEnd: (event: React.TouchEvent<HTMLCanvasElement>) => void;
    handleTouchCancel: () => void;
    /** Ends any pinch and drops a pending tap (the viewport changed) */
    resetGestures: () => void;
}

/** Distance between two touches, in client px */
function touchDistance(touch1: React.Touch, touch2: React.Touch): number {
    return Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
}

export function useBoardTouch(options: BoardTouchOptions): BoardTouch {
    const {
        canvasRef, enabled, areaTool, selectedTool, scaleRef, panOffsetRef,
        applyView, onPointerDown, onPointerMove, onPointerUp, onAbandon,
    } = options;
    // The view and fingers when the current pinch began (null = no pinch)
    const pinchStartRef = useRef<(BoardView & { center: Position; distance: number }) | null>(null);
    // A touch tap with a TAP_TOOLS tool, waiting for touchend (client px; null = none)
    const pendingTapRef = useRef<{ clientX: number; clientY: number } | null>(null);

    /**
     * Center point between two touches, relative to the canvas (the space
     * the zoom/pan transform works in)
     */
    const touchCenter = useCallback((touch1: React.Touch, touch2: React.Touch): Position => {
        const rect = canvasRef.current?.getBoundingClientRect();
        return {
            x: (touch1.clientX + touch2.clientX) / 2 - (rect?.left ?? 0),
            y: (touch1.clientY + touch2.clientY) / 2 - (rect?.top ?? 0),
        };
    }, [canvasRef]);

    /**
     * Starts a pinch from the current view and these touches when exactly two
     * are down, and ends it otherwise. Called whenever the finger count
     * changes, so a pinch never continues from a different pair of fingers.
     */
    const capturePinch = useCallback(
        (touches: React.TouchList) => {
            pinchStartRef.current = touches.length === 2
                ? {
                    zoom: scaleRef.current,
                    pan: panOffsetRef.current,
                    center: touchCenter(touches[0], touches[1]),
                    distance: touchDistance(touches[0], touches[1]),
                }
                : null;
        },
        [scaleRef, panOffsetRef, touchCenter]
    );

    const handleTouchStart = useCallback(
        (event: React.TouchEvent<HTMLCanvasElement>) => {
            if (!enabled || !canvasRef.current) return;

            // No preventDefault here: React registers touchstart/touchmove as
            // passive listeners, so it would throw on every move. The canvas's
            // `touch-action: none` is what stops scrolling and browser zoom.

            if (event.touches.length === 1) {
                pendingTapRef.current = null; // never replay an older, unfinished tap
                const { clientX, clientY } = event.touches[0];
                // Place / erase / text act on touchend, and only for a still,
                // one-finger tap: this finger may be the first of a pinch.
                if (!areaTool && TAP_TOOLS.has(selectedTool)) {
                    pendingTapRef.current = { clientX, clientY };
                    return;
                }
                // Select (drag), stroke and the area tool start now, like a mouse down
                onPointerDown(clientX, clientY);
            } else {
                pendingTapRef.current = null;
                // Two touches pinch to zoom or pan (Requirements: 3.5); a third
                // finger ends the pinch until the count is back to two.
                capturePinch(event.touches);
                // The pinch takes over: nothing the coach was dragging or
                // drawing may commit on the final touchend.
                onAbandon();
            }
        },
        [enabled, canvasRef, areaTool, selectedTool, capturePinch, onPointerDown, onAbandon]
    );

    const handleTouchMove = useCallback(
        (event: React.TouchEvent<HTMLCanvasElement>) => {
            if (!enabled || !canvasRef.current) return;

            // No preventDefault here: see handleTouchStart.

            if (event.touches.length === 1) {
                // A pending tap that travels past the drag threshold is not a tap
                const tap = pendingTapRef.current;
                const touch = event.touches[0];
                if (tap && Math.hypot(touch.clientX - tap.clientX, touch.clientY - tap.clientY) >= DRAG_THRESHOLD_PX) {
                    pendingTapRef.current = null;
                }
                // Single touch - treat like mouse move
                onPointerMove(touch.clientX, touch.clientY);
            } else if (event.touches.length === 2 && pinchStartRef.current) {
                // Two touches: zoom about the fingers' midpoint and pan with it
                // Requirements: 3.5
                applyView(pinchView(pinchStartRef.current, {
                    center: touchCenter(event.touches[0], event.touches[1]),
                    distance: touchDistance(event.touches[0], event.touches[1]),
                }));
            }
        },
        [enabled, canvasRef, onPointerMove, applyView, touchCenter]
    );

    const handleTouchEnd = useCallback(
        (event: React.TouchEvent<HTMLCanvasElement>) => {
            // Suppresses the compatibility mouse events and click after a tap.
            // A touchend the browser marks non-cancelable logs an error if
            // cancelled, so only cancel when it can be.
            if (event.cancelable) event.preventDefault();

            if (event.touches.length === 0) {
                // A still one-finger tap with a place / erase / text tool acts now
                const tap = pendingTapRef.current;
                pendingTapRef.current = null;
                if (tap) onPointerDown(tap.clientX, tap.clientY);
                // All touches ended - treat like mouse up
                onPointerUp();
                pinchStartRef.current = null;
            } else {
                // Fewer fingers remain: one ends the pinch; two (after a
                // third lifted) restart it from the pair that is left.
                capturePinch(event.touches);
            }
        },
        [onPointerDown, onPointerUp, capturePinch]
    );

    /** The browser took the touches away (e.g. a system gesture): drop the pending tap, the pinch and any interaction in progress. */
    const handleTouchCancel = useCallback(() => {
        pendingTapRef.current = null;
        pinchStartRef.current = null;
        onAbandon();
    }, [onAbandon]);

    const resetGestures = useCallback(() => {
        pinchStartRef.current = null;
        pendingTapRef.current = null;
    }, []);

    return { handleTouchStart, handleTouchMove, handleTouchEnd, handleTouchCancel, resetGestures };
}
```

- [ ] **Step 4: Delegate RinkBoard's touch handling**

In `components/features/practice-planner/RinkBoard.tsx`:

1. In the `interaction-utils` import (lines 46–58) remove `pinchView,` and add `type BoardView,`. Below that import add:

```ts
import { useBoardTouch } from "./useBoardTouch";
```

2. Delete the `TAP_TOOLS` comment and constant (lines 120–124, from `/**\n * Tools whose touch tap acts once` through `const TAP_TOOLS … ;`).

3. Delete these four lines (176–179):

```ts
    // The view and fingers when the current pinch began (null = no pinch)
    const pinchStartRef = useRef<{ zoom: number; pan: Position; center: Position; distance: number } | null>(null);
    // A touch tap with a TAP_TOOLS tool, waiting for touchend (client px; null = none)
    const pendingTapRef = useRef<{ clientX: number; clientY: number } | null>(null);
```

4. Delete the viewport-reset effect (lines 295–302). It is re-added after the hook call in step 5, because it now calls `resetGestures`:

```ts
    // A new viewport starts unzoomed: a pinch-zoom/pan made for the old one would
    // misframe it. A pinch in progress ends too, or its next move would re-apply it.
    useEffect(() => {
        pinchStartRef.current = null;
        pendingTapRef.current = null;
        setScale(1);
        setPanOffset({ x: 0, y: 0 });
    }, [viewX, viewY, viewW, viewH]);
```

5. Replace everything from the comment `/**\n     * Calculate distance between two touch points` (line 837) through the end of `handleTouchCancel` (`    }, [abandonTransientInteraction]);`, line 1024) with:

```ts
    /** Runs handleMouseDown for a touch point (it maps the point through zoom/pan). */
    const simulateMouseDown = useCallback(
        (clientX: number, clientY: number) => {
            handleMouseDown({
                nativeEvent: new MouseEvent("mousedown", { clientX, clientY }),
                preventDefault: () => { /* No-op: touch preventDefault handled at parent level */ },
                stopPropagation: () => { /* No-op: propagation control not needed for simulated events */ },
            } as React.MouseEvent<HTMLCanvasElement>);
        },
        [handleMouseDown]
    );

    /** Runs handleMouseMove for a touch point: a one-finger move acts like the mouse. */
    const simulateMouseMove = useCallback(
        (clientX: number, clientY: number) => {
            handleMouseMove({
                nativeEvent: new MouseEvent("mousemove", { clientX, clientY }),
                preventDefault: () => { /* No-op: touch preventDefault handled at parent level */ },
                stopPropagation: () => { /* No-op: propagation control not needed for simulated events */ },
            } as React.MouseEvent<HTMLCanvasElement>);
        },
        [handleMouseMove]
    );

    /**
     * Abandons any area drag, element drag or stroke in progress, so a later
     * touchend or mouse event cannot commit a rectangle, a move or a line the
     * coach never meant. A drag's preview is visual only, so dropping it leaves
     * the element where it was, with no history entry; the selection stays.
     * Shared by the pinch takeover and touchcancel so they cannot drift.
     */
    const abandonTransientInteraction = useCallback(() => {
        setAreaDrag(null);
        setIsDragging(false);
        isDraggingRef.current = false;
        setDragOffset(null);
        setDragPreviewPosition(null);
        grabPointRef.current = null;
        setIsDrawing(false);
        setCurrentDrawingPoints([]);
    }, []);

    /**
     * Applies a pinch's view. The anchored pan is bounded, so the rink can't be
     * pinched off-screen, and the refs follow at once, so a tap right after the
     * pinch maps through the new view. Requirements: 3.5
     */
    const applyPinchView = useCallback(
        (view: BoardView) => {
            const pan = boundPan(view.pan, view.zoom);
            scaleRef.current = view.zoom;
            panOffsetRef.current = pan;
            setScale(view.zoom);
            setPanOffset(pan);
        },
        [boundPan]
    );

    // Touch: one finger acts like the mouse, two fingers pinch (useBoardTouch)
    const { handleTouchStart, handleTouchMove, handleTouchEnd, handleTouchCancel, resetGestures } = useBoardTouch({
        canvasRef,
        enabled: transform !== null,
        areaTool,
        selectedTool,
        scaleRef,
        panOffsetRef,
        applyView: applyPinchView,
        onPointerDown: simulateMouseDown,
        onPointerMove: simulateMouseMove,
        onPointerUp: handleMouseUp,
        onAbandon: abandonTransientInteraction,
    });

    // A new viewport starts unzoomed: a pinch-zoom/pan made for the old one would
    // misframe it. A pinch in progress ends too, or its next move would re-apply it.
    useEffect(() => {
        resetGestures();
        setScale(1);
        setPanOffset({ x: 0, y: 0 });
    }, [viewX, viewY, viewW, viewH, resetGestures]);
```

The JSX is unchanged: it already passes `handleTouchStart`, `handleTouchMove`, `handleTouchEnd` and `handleTouchCancel` to the canvas.

- [ ] **Step 5: Run the board suites**

Run: `bun run test __tests__/components/features/practice-planner/useBoardTouch.test.ts __tests__/components/features/practice-planner/RinkBoard.test.tsx __tests__/components/features/practice-planner/RinkBoard.ice-area.test.tsx __tests__/components/features/practice-planner/RinkBoard.line-budget.test.ts __tests__/components/features/practice-planner/PlayEditor.test.tsx __tests__/components/features/practice-planner/PlayEditor.ice-area.test.tsx`
Expected: PASS, with no test edited. In particular the three pinch tests ("abandons an element drag when a second touch starts…", "does not resume an abandoned drag…", "abandons an element drag on touchcancel…") pass unchanged.

Run: `wc -l components/features/practice-planner/RinkBoard.tsx`
Expected: about 940 (anything at or under 1057). Note the number in the commit body.

Run: `bun run type-check && bun run lint`
Expected: both exit 0 (no unused `Position` or `useRef` imports are left: both are still used elsewhere in RinkBoard).

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add components/features/practice-planner/useBoardTouch.ts components/features/practice-planner/RinkBoard.tsx \
  __tests__/components/features/practice-planner/useBoardTouch.test.ts \
  __tests__/components/features/practice-planner/RinkBoard.line-budget.test.ts
/usr/bin/git commit -m "refactor(practice-planner): move rink board touch handling into useBoardTouch" \
  -m "RinkBoard.tsx is now <N> lines; a test pins it at 1057 or fewer." -m "$SESSION_TRAILER"
```

(Replace `<N>` with the number from Step 5.)

---

### Task 4: Handles and drags on the selected line

With the Select tool, a selected line shows its handles. Dragging the line moves it as a whole, dragging an end, bend or freehand anchor moves that point, and dragging a "+" adds a bend (success criteria 1, 2, 6; spec R3, R6). The preview is live, release commits one history entry, and a second finger, a touchcancel or a tool change cancels without committing. The gesture state lives in `useStrokeEditing`; RinkBoard routes events and draws.

**Files:**
- Create: `components/features/practice-planner/useStrokeEditing.ts`
- Modify: `components/features/practice-planner/RinkBoard.tsx` (imports; move `updatePlayData` above `render`; `render`; the selection/tool effect; `handleMouseDown`'s `case "select"`; `handleMouseMove`; `handleMouseUp`; the window `mouseup` effect; `abandonTransientInteraction`)
- Modify: `lib/utils/canvas/drawing-utils.ts` (add `LINE_HANDLE_RADIUS_PX`, `LineEditColors`, `drawLineHandles`)
- Modify: `lib/utils/canvas/rink-renderer.ts` (export `ICE_COLOR`; use it in `drawIceSurface`, line 346)
- Modify: `lib/utils/canvas/notation.ts` (add `LINE_EDIT_COLORS` after `BOARD_COLORS`)
- Test (create): `__tests__/components/features/practice-planner/RinkBoard.line-editing.test.tsx`, `__tests__/lib/utils/canvas/line-edit-colors.test.ts`
- Test (modify): `__tests__/lib/utils/canvas/drawing-utils.test.ts`

**Interfaces:**
- Consumes (Task 2): `lineHandles`, `hitTestLineHandle`, `moveLinePoint`, `moveLine`, `insertBend`, `LineHandle`, `replaceDrawing`, `drawingHitRadius`; (Task 3) `abandonTransientInteraction` as `useBoardTouch`'s `onAbandon`.
- Produces, from `components/features/practice-planner/useStrokeEditing.ts`:
  - `interface LinePress { selectedId: string | null; point: Position; hitRadiusFt: number }`;
  - `interface LineMove { area: RinkRect; thresholdFt: number }`;
  - `interface StrokeEditingOptions { playDataRef: React.RefObject<PlayData>; commit: (next: PlayData) => void }`;
  - `interface StrokeEditing { press(press: LinePress): boolean; grab(stroke: DrawingElement, point: Position): void; move(pointer: Position, move: LineMove): boolean; release(): void; cancel(): void; preview: DrawingElement | null; active: boolean }`;
  - `useStrokeEditing(options: StrokeEditingOptions): StrokeEditing`.
- Produces, from `lib/utils/canvas/drawing-utils.ts`: `LINE_HANDLE_RADIUS_PX = 7`, `interface LineEditColors { handleFill: string; handleStroke: string; snapRing: string }`, `drawLineHandles(ctx, handles: readonly LineHandle[], transform: TransformContext, colors: LineEditColors, zoom?: number): void`.
- Produces: `ICE_COLOR` (`rink-renderer.ts`), `LINE_EDIT_COLORS` (`notation.ts`).

- [ ] **Step 1: Write the failing board tests**

Create `__tests__/components/features/practice-planner/RinkBoard.line-editing.test.tsx`:

```tsx
/**
 * Line editing on the rink board (line editing spec R3, R6): select a line,
 * drag an end, a bend or a "+", move the whole line; each edit is one undo
 * step; touch drags work, and a second finger, touchcancel or a tool change
 * cancels without committing.
 */
import React from "react";
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { RinkBoard, type RinkBoardHandle, type RinkBoardProps } from "@/components/features/practice-planner/RinkBoard";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { createTransformContext, rinkToCanvas } from "@/lib/utils/canvas/rink-renderer";
import { editViewport } from "@/lib/utils/ice-area";
import type { DrawingElement, IceArea, PlayData, Position, StrokePath } from "@/types/practice-planner";

const mockCanvasContext = new Proxy({} as Record<string, unknown>, {
    get(t, prop) {
        if (typeof prop !== "string") return undefined;
        if (!(prop in t)) t[prop] = vi.fn(() => ({ width: 10 }));
        return t[prop];
    },
    set(t, prop, value) {
        if (typeof prop === "string") t[prop] = value;
        return true;
    },
});

beforeAll(() => {
    global.ResizeObserver = class {
        observe() { /* noop */ }
        unobserve() { /* noop */ }
        disconnect() { /* noop */ }
    } as unknown as typeof ResizeObserver;
    // Never runs the callback: drawing is tested in drawing-utils.
    global.requestAnimationFrame = vi.fn(() => 1) as unknown as typeof requestAnimationFrame;
    global.cancelAnimationFrame = vi.fn();
    HTMLCanvasElement.prototype.getContext = vi.fn(() => mockCanvasContext) as unknown as HTMLCanvasElement["getContext"];
});

let widthSpy: ReturnType<typeof vi.spyOn>;
let heightSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
    widthSpy = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800);
    heightSpy = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(400);
});
afterEach(() => {
    widthSpy.mockRestore();
    heightSpy.mockRestore();
    vi.useRealTimers();
});

const line = (points: Position[], path: StrokePath = "straight", id = "l"): DrawingElement => ({
    id, action: "skate", path, end: "arrow", points, color: "#212121", strokeWidth: 2,
});
const withLines = (...drawings: DrawingElement[]): PlayData => ({ ...createEmptyPlayData(), drawings });
const CUSTOM: IceArea = { kind: "custom", rect: { x: 100, y: 30, w: 20, h: 20 } }; // viewport { 95, 25, 30, 30 }
const STRAIGHT = [{ x: 40, y: 40 }, { x: 120, y: 40 }];
const BENT = [{ x: 40, y: 40 }, { x: 80, y: 20 }, { x: 120, y: 40 }];

function setup(props: Partial<RinkBoardProps> = {}) {
    const onPlayDataChange = vi.fn();
    const onSelectionChange = vi.fn();
    const onUndoRedoStateChange = vi.fn();
    const ref = React.createRef<RinkBoardHandle>();
    const playData: PlayData = props.playData ?? createEmptyPlayData();
    const board = (data: PlayData, extra: Partial<RinkBoardProps> = {}) => (
        <RinkBoard
            ref={ref}
            mode="edit"
            width={800}
            height={400}
            selectedTool="select"
            onPlayDataChange={onPlayDataChange}
            onSelectionChange={onSelectionChange}
            onUndoRedoStateChange={onUndoRedoStateChange}
            {...props}
            {...extra}
            playData={data}
        />
    );
    const utils = render(board(playData));
    const canvas = utils.container.querySelector("canvas")!;
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 400, right: 800, bottom: 400, x: 0, y: 0, toJSON: () => ({}) });
    const transform = createTransformContext(800, 400, 20, editViewport(playData.area));
    const at = (x: number, y: number) => {
        const p = rinkToCanvas({ x, y }, transform);
        return { clientX: p.x, clientY: p.y };
    };
    const click = (x: number, y: number) => {
        fireEvent.mouseDown(canvas, at(x, y));
        fireEvent.mouseUp(canvas);
    };
    const drag = (from: [number, number], to: [number, number]) => {
        fireEvent.mouseDown(canvas, at(...from));
        fireEvent.mouseMove(canvas, at(...to));
        fireEvent.mouseUp(canvas);
    };
    const last = (): PlayData => onPlayDataChange.mock.calls.at(-1)![0];
    const rerender = (data: PlayData, extra: Partial<RinkBoardProps> = {}) => utils.rerender(board(data, extra));
    return { canvas, at, click, drag, last, rerender, ref, onPlayDataChange, onSelectionChange, onUndoRedoStateChange };
}

const expectPoint = (p: Position, x: number, y: number) => {
    expect(p.x).toBeCloseTo(x, 0);
    expect(p.y).toBeCloseTo(y, 0);
};

describe("RinkBoard line editing: handles and drags", () => {
    it("selects a line with a click and records nothing", () => {
        const ctx = setup({ playData: withLines(line(STRAIGHT)) });
        ctx.click(60, 40);
        expect(ctx.onSelectionChange).toHaveBeenLastCalledWith("l");
        expect(ctx.onPlayDataChange).not.toHaveBeenCalled();
    });

    it("drags an end of the selected line and leaves the other end", () => {
        const ctx = setup({ playData: withLines(line(STRAIGHT)) });
        ctx.click(60, 40);
        ctx.drag([120, 40], [130, 60]);
        expect(ctx.onPlayDataChange).toHaveBeenCalledTimes(1);
        const [start, end] = ctx.last().drawings[0].points;
        expect(start).toEqual({ x: 40, y: 40 });
        expectPoint(end, 130, 60);
    });

    it("drags a '+' handle to add a bend", () => {
        const ctx = setup({ playData: withLines(line(STRAIGHT)) });
        ctx.click(60, 40);
        ctx.drag([80, 40], [80, 20]);
        const stroke = ctx.last().drawings[0];
        expect(stroke.path).toBe("straight");
        expect(stroke.points).toHaveLength(3);
        expectPoint(stroke.points[1], 80, 20);
    });

    it("drags a bend", () => {
        const ctx = setup({ playData: withLines(line(BENT)) });
        ctx.click(60, 30);
        ctx.drag([80, 20], [90, 10]);
        const points = ctx.last().drawings[0].points;
        expect(points).toHaveLength(3);
        expectPoint(points[1], 90, 10);
    });

    it("moves the whole line from its body, keeping its shape", () => {
        const ctx = setup({ playData: withLines(line(BENT)) });
        ctx.drag([60, 30], [70, 40]);
        expect(ctx.onPlayDataChange).toHaveBeenCalledTimes(1);
        const points = ctx.last().drawings[0].points;
        BENT.forEach((p, i) => expectPoint(points[i], p.x + 10, p.y + 10));
    });

    it("drags an end of a line shorter than two hit radii, not its '+'", () => {
        const ctx = setup({ playData: withLines(line([{ x: 60, y: 40 }, { x: 66, y: 40 }])) });
        ctx.click(63, 40);
        ctx.drag([60, 40], [60, 50]);
        const points = ctx.last().drawings[0].points;
        expect(points).toHaveLength(2);
        expectPoint(points[0], 60, 50);
    });

    it("keeps a whole-line move inside the drill's area, with its shape", () => {
        const ctx = setup({ playData: { ...withLines(line([{ x: 102, y: 35 }, { x: 110, y: 45 }])), area: CUSTOM } });
        ctx.drag([106, 40], [124, 40]);
        const [a, b] = ctx.last().drawings[0].points;
        expect(b.x).toBeCloseTo(120, 6);
        expect(b.x - a.x).toBeCloseTo(8, 6);
        expect(a.y).toBeCloseTo(35, 6);
    });

    it("never moves a line outside the area on a touch tap", () => {
        const ctx = setup({ playData: { ...withLines(line([{ x: 96, y: 27 }, { x: 99, y: 27 }])), area: CUSTOM } });
        fireEvent.touchStart(ctx.canvas, { touches: [ctx.at(97, 27)] });
        fireEvent.touchMove(ctx.canvas, { touches: [ctx.at(97, 27)] });
        fireEvent.touchEnd(ctx.canvas, { touches: [] });
        expect(ctx.onSelectionChange).toHaveBeenLastCalledWith("l");
        expect(ctx.onPlayDataChange).not.toHaveBeenCalled();
    });

    it("simplifies a freehand line to at most 8 points on the first end drag, and keeps it freehand", () => {
        const wave = Array.from({ length: 30 }, (_, i) => ({ x: 40 + i * 2, y: 40 + 8 * Math.sin(i / 3) }));
        const ctx = setup({ playData: withLines(line(wave, "freehand")) });
        ctx.click(wave[5].x, wave[5].y);
        ctx.drag([wave[29].x, wave[29].y], [110, 70]);
        const stroke = ctx.last().drawings[0];
        expect(stroke.path).toBe("freehand");
        expect(stroke.points.length).toBeLessThanOrEqual(8);
        expect(stroke.points[0]).toEqual(wave[0]);
        expectPoint(stroke.points[stroke.points.length - 1], 110, 70);
    });

    it("never simplifies a freehand line it moves as a whole", () => {
        const wave = Array.from({ length: 30 }, (_, i) => ({ x: 40 + i * 2, y: 40 + 8 * Math.sin(i / 3) }));
        const ctx = setup({ playData: withLines(line(wave, "freehand")) });
        ctx.drag([wave[5].x, wave[5].y], [wave[5].x + 5, wave[5].y + 5]);
        expect(ctx.last().drawings[0].points).toHaveLength(30);
    });
});

describe("RinkBoard line editing: history and interruptions", () => {
    it("makes each edit one undo step, and redo restores it", () => {
        const start = withLines(line(STRAIGHT));
        const ctx = setup({ playData: start });
        ctx.click(60, 40);
        ctx.drag([80, 40], [80, 20]);
        expect(ctx.onUndoRedoStateChange).toHaveBeenLastCalledWith(true, false);
        const edited = ctx.last();
        ctx.rerender(edited);
        act(() => ctx.ref.current!.undo());
        expect(ctx.last().drawings[0].points).toEqual(STRAIGHT);
        act(() => ctx.ref.current!.redo());
        expect(ctx.last().drawings[0].points).toEqual(edited.drawings[0].points);
    });

    it("commits once when a line drag is released outside the canvas", () => {
        const ctx = setup({ playData: withLines(line(STRAIGHT)) });
        ctx.click(60, 40);
        fireEvent.mouseDown(ctx.canvas, ctx.at(120, 40));
        fireEvent.mouseMove(ctx.canvas, ctx.at(130, 60));
        fireEvent.mouseUp(window);
        expect(ctx.onPlayDataChange).toHaveBeenCalledTimes(1);
        expectPoint(ctx.last().drawings[0].points[1], 130, 60);
    });

    it("cancels a handle drag when the tool changes", () => {
        const start = withLines(line(STRAIGHT));
        const ctx = setup({ playData: start });
        ctx.click(60, 40);
        fireEvent.mouseDown(ctx.canvas, ctx.at(120, 40));
        fireEvent.mouseMove(ctx.canvas, ctx.at(130, 60));
        ctx.rerender(start, { selectedTool: "player" });
        fireEvent.mouseUp(ctx.canvas);
        expect(ctx.onPlayDataChange).not.toHaveBeenCalled();
    });

    it("drags an end with one finger", () => {
        const ctx = setup({ playData: withLines(line(STRAIGHT)) });
        fireEvent.touchStart(ctx.canvas, { touches: [ctx.at(60, 40)] });
        fireEvent.touchEnd(ctx.canvas, { touches: [] });
        fireEvent.touchStart(ctx.canvas, { touches: [ctx.at(120, 40)] });
        fireEvent.touchMove(ctx.canvas, { touches: [ctx.at(130, 60)] });
        fireEvent.touchEnd(ctx.canvas, { touches: [] });
        expect(ctx.onPlayDataChange).toHaveBeenCalledTimes(1);
        expectPoint(ctx.last().drawings[0].points[1], 130, 60);
    });

    it("cancels a handle drag when a second finger lands, and keeps the selection", () => {
        const ctx = setup({ playData: withLines(line(STRAIGHT)) });
        ctx.click(60, 40);
        fireEvent.touchStart(ctx.canvas, { touches: [ctx.at(120, 40)] });
        fireEvent.touchMove(ctx.canvas, { touches: [ctx.at(130, 60)] });
        fireEvent.touchStart(ctx.canvas, { touches: [ctx.at(130, 60), ctx.at(60, 70)] });
        fireEvent.touchEnd(ctx.canvas, { touches: [] });
        expect(ctx.onPlayDataChange).not.toHaveBeenCalled();
        expect(ctx.onSelectionChange).toHaveBeenLastCalledWith("l");
    });

    it("cancels a handle drag on touchcancel", () => {
        const ctx = setup({ playData: withLines(line(STRAIGHT)) });
        ctx.click(60, 40);
        fireEvent.touchStart(ctx.canvas, { touches: [ctx.at(120, 40)] });
        fireEvent.touchMove(ctx.canvas, { touches: [ctx.at(130, 60)] });
        fireEvent.touchCancel(ctx.canvas, { touches: [] });
        fireEvent.touchEnd(ctx.canvas, { touches: [] });
        fireEvent.mouseUp(window);
        expect(ctx.onPlayDataChange).not.toHaveBeenCalled();
    });
});
```

(Scale on this 800 × 400 board is 3.8 px/ft, so the 22 px hit radius is about 5.8 ft and the 4 px drag threshold about 1.05 ft.)

Create `__tests__/lib/utils/canvas/line-edit-colors.test.ts`:

```ts
/** Line editing handle and ring colours (line editing spec R6). */
import { describe, expect, it } from "vitest";
import { getContrastRatio } from "@mui/material/styles";
import theme from "@/lib/theme";
import { LINE_EDIT_COLORS } from "@/lib/utils/canvas/notation";
import { ICE_COLOR } from "@/lib/utils/canvas/rink-renderer";

describe("line editing colours", () => {
    it("are the theme's light-scheme blues (the ice is drawn light in both schemes)", () => {
        const light = theme.colorSchemes.light!.palette;
        expect(LINE_EDIT_COLORS.handleStroke).toBe(light.secondary.main);
        expect(LINE_EDIT_COLORS.snapRing).toBe(light.primary.main);
    });

    it("reach 3:1 against the ice", () => {
        expect(getContrastRatio(LINE_EDIT_COLORS.handleStroke, ICE_COLOR)).toBeGreaterThanOrEqual(3);
        expect(getContrastRatio(LINE_EDIT_COLORS.snapRing, ICE_COLOR)).toBeGreaterThanOrEqual(3);
    });
});
```

In `__tests__/lib/utils/canvas/drawing-utils.test.ts`, extend the `drawing-utils` import with `drawLineHandles, LINE_HANDLE_RADIUS_PX`, add `import { LINE_EDIT_COLORS } from "@/lib/utils/canvas/notation";` and `import type { LineHandle } from "@/lib/utils/canvas/line-editing";`, and append:

```ts
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
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `bun run test __tests__/components/features/practice-planner/RinkBoard.line-editing.test.tsx __tests__/lib/utils/canvas/line-edit-colors.test.ts __tests__/lib/utils/canvas/drawing-utils.test.ts`
Expected: FAIL. The board tests that drag handles find no change (lines can't be edited yet; "selects a line" and "never moves a line outside the area" already pass); the colour test can't import `LINE_EDIT_COLORS` / `ICE_COLOR`; `drawLineHandles` is not exported.

- [ ] **Step 3: Colours and the handle painter**

In `lib/utils/canvas/rink-renderer.ts`, add above `drawIceSurface`:

```ts
/** The ice colour. The board draws it in both colour schemes, so line-editing colours are checked against it. */
export const ICE_COLOR = "#E8F4F8";
```

and in `drawIceSurface` replace `ctx.fillStyle = "#E8F4F8"; // Light ice blue` with `ctx.fillStyle = ICE_COLOR;`.

In `lib/utils/canvas/notation.ts`, add after `BOARD_COLORS`:

```ts
/**
 * Line-editing handle and snap-ring colours (line editing R6): the theme's
 * light-scheme Action Blue and League Blue, since the ice (ICE_COLOR) is
 * drawn light in both schemes. On the ice they are about 4.1:1 and 7.7:1.
 */
export const LINE_EDIT_COLORS = {
    handleFill: "#FFFFFF",
    handleStroke: BOARD_COLORS.actionBlue,
    snapRing: BOARD_COLORS.leagueBlue,
} as const;
```

In `lib/utils/canvas/drawing-utils.ts`, add `import type { LineHandle } from "./line-editing";` to the imports, and add after `drawElement`:

```ts
/** A line handle's radius on screen, at any zoom (line editing R6). */
export const LINE_HANDLE_RADIUS_PX = 7;

export interface LineEditColors {
    /** Inside of end, bend and anchor handles; the plus on "+" handles */
    handleFill: string;
    /** Handle outlines and the "+" disc */
    handleStroke: string;
    /** The snap ring */
    snapRing: string;
}

/**
 * Draws the selected line's handles (rink feet, under the board's zoom):
 * ends, bends and anchors as rings, "+" handles as filled discs with a plus.
 * `zoom` keeps the radius and outline the same size on screen.
 */
export function drawLineHandles(
    ctx: CanvasRenderingContext2D,
    handles: readonly LineHandle[],
    transform: TransformContext,
    colors: LineEditColors,
    zoom: number = 1
): void {
    const radius = LINE_HANDLE_RADIUS_PX / zoom;
    ctx.save();
    ctx.lineWidth = 2 / zoom;
    for (const handle of handles) {
        const c = rinkToCanvas(handle.position, transform);
        const add = handle.kind === "add";
        ctx.beginPath();
        ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = add ? colors.handleStroke : colors.handleFill;
        ctx.fill();
        ctx.strokeStyle = colors.handleStroke;
        ctx.stroke();
        if (add) {
            const arm = radius * 0.55;
            ctx.beginPath();
            ctx.moveTo(c.x - arm, c.y);
            ctx.lineTo(c.x + arm, c.y);
            ctx.moveTo(c.x, c.y - arm);
            ctx.lineTo(c.x, c.y + arm);
            ctx.strokeStyle = colors.handleFill;
            ctx.stroke();
        }
    }
    ctx.restore();
}
```

- [ ] **Step 4: Write `useStrokeEditing.ts`**

Create `components/features/practice-planner/useStrokeEditing.ts`:

```ts
"use client";

/**
 * Gesture state for editing the selected line on the rink board (line
 * editing spec R3, R5): drag the whole line, an end, a bend or a freehand
 * anchor, or a "+" handle to add a bend. The geometry is pure
 * (lib/utils/canvas/line-editing.ts); this hook holds the gesture between
 * press and release, exposes the live preview, and commits one history
 * entry on release.
 */
import React, { useCallback, useRef, useState } from "react";
import type { DrawingElement, PlayData, Position, RinkRect } from "@/types/practice-planner";
import { findElement, replaceDrawing } from "@/lib/utils/canvas/element-ops";
import { drawingHitRadius, hitTestDrawing, pastDragThreshold } from "@/lib/utils/canvas/interaction-utils";
import {
    hitTestLineHandle,
    insertBend,
    lineHandles,
    moveLine,
    moveLinePoint,
    type LineHandle,
} from "@/lib/utils/canvas/line-editing";

export interface LinePress {
    /** The board's selected element (null = none); only a selected line has handles */
    selectedId: string | null;
    /** Pointer in rink feet, clamped to the rink */
    point: Position;
    /** The board's minimum hit radius in feet (MIN_HIT_RADIUS_PX at the current zoom) */
    hitRadiusFt: number;
}

export interface LineMove {
    /** The drill's ice area: every edited point stays inside it */
    area: RinkRect;
    /** DRAG_THRESHOLD_PX in feet: until the pointer passes it, a press edits nothing */
    thresholdFt: number;
}

export interface StrokeEditingOptions {
    /** The board's latest play data */
    playDataRef: React.RefObject<PlayData>;
    /** Records one history entry (RinkBoard's updatePlayData) */
    commit: (next: PlayData) => void;
}

export interface StrokeEditing {
    /** A Select press on the selected line's handles or body starts a gesture; false (and nothing) otherwise */
    press: (press: LinePress) => boolean;
    /** Starts a whole-line move on a line a press has just selected */
    grab: (stroke: DrawingElement, point: Position) => void;
    /** Updates the preview; false when no gesture is in progress */
    move: (pointer: Position, move: LineMove) => boolean;
    /** Commits the preview as one history entry, or nothing if it changed nothing */
    release: () => void;
    /** Drops the gesture without committing */
    cancel: () => void;
    /** The edited line while a gesture has moved it (null = none) */
    preview: DrawingElement | null;
    /** True from press to release or cancel */
    active: boolean;
}

interface Gesture {
    /** The line as it was at the press */
    stroke: DrawingElement;
    /** The handle pressed, or null for the line's body (a whole-line move) */
    handle: LineHandle | null;
    /** Where the press landed (rink feet) */
    grab: Position;
    /** True once the pointer passed the drag threshold */
    started: boolean;
}

/** The gesture's line with the pointer applied; a handle keeps its offset from the press. */
function editedStroke(g: Gesture, pointer: Position, area: RinkRect): DrawingElement {
    const delta = { x: pointer.x - g.grab.x, y: pointer.y - g.grab.y };
    if (!g.handle) return moveLine(g.stroke, delta, area);
    const target = { x: g.handle.position.x + delta.x, y: g.handle.position.y + delta.y };
    return g.handle.kind === "add"
        ? insertBend(g.stroke, g.handle.segment, target, area)
        : moveLinePoint(g.stroke, g.handle.index, target, area);
}

export function useStrokeEditing({ playDataRef, commit }: StrokeEditingOptions): StrokeEditing {
    const gestureRef = useRef<Gesture | null>(null);
    // The preview in a ref too, so a release in the same frame as the last move reads it
    const previewRef = useRef<DrawingElement | null>(null);
    const [preview, setPreviewState] = useState<DrawingElement | null>(null);
    const [active, setActive] = useState(false);

    const setPreview = useCallback((stroke: DrawingElement | null) => {
        previewRef.current = stroke;
        setPreviewState(stroke);
    }, []);

    const begin = useCallback(
        (stroke: DrawingElement, handle: LineHandle | null, point: Position) => {
            gestureRef.current = { stroke, handle, grab: point, started: false };
            setPreview(null);
            setActive(true);
        },
        [setPreview]
    );

    const press = useCallback(
        ({ selectedId, point, hitRadiusFt }: LinePress): boolean => {
            if (!selectedId) return false;
            const found = findElement(playDataRef.current, selectedId);
            if (!found || found.kind !== "drawing") return false;
            const stroke = found.element;
            // Handles first, then the line's body (R3)
            const handle = hitTestLineHandle(lineHandles(stroke), point, hitRadiusFt);
            if (handle) {
                begin(stroke, handle, point);
                return true;
            }
            if (hitTestDrawing(point, stroke, drawingHitRadius(hitRadiusFt))) {
                begin(stroke, null, point);
                return true;
            }
            return false;
        },
        [playDataRef, begin]
    );

    const grab = useCallback((stroke: DrawingElement, point: Position) => begin(stroke, null, point), [begin]);

    const move = useCallback(
        (pointer: Position, { area, thresholdFt }: LineMove): boolean => {
            const g = gestureRef.current;
            if (!g) return false;
            // A press that never travels the drag threshold is a tap: it edits nothing
            if (!g.started) {
                if (!pastDragThreshold(g.grab, pointer, thresholdFt)) return true;
                g.started = true;
            }
            setPreview(editedStroke(g, pointer, area));
            return true;
        },
        [setPreview]
    );

    const release = useCallback(() => {
        const g = gestureRef.current;
        const edited = previewRef.current;
        gestureRef.current = null;
        setPreview(null);
        setActive(false);
        if (!g?.started || !edited || edited === g.stroke) return;
        const current = playDataRef.current;
        const next = replaceDrawing(current, edited);
        if (next !== current) commit(next);
    }, [playDataRef, commit, setPreview]);

    const cancel = useCallback(() => {
        gestureRef.current = null;
        setPreview(null);
        setActive(false);
    }, [setPreview]);

    return { press, grab, move, release, cancel, preview, active };
}
```

- [ ] **Step 5: Wire the hook into RinkBoard**

In `components/features/practice-planner/RinkBoard.tsx`:

1. Imports. Change the `drawing-utils` import to

```ts
import { drawBoardFrame, drawLineHandles, drawStroke } from "@/lib/utils/canvas/drawing-utils";
```

add `replaceDrawing,` to the `element-ops` import list, and add below the `useBoardTouch` import:

```ts
import { lineHandles } from "@/lib/utils/canvas/line-editing";
import { LINE_EDIT_COLORS } from "@/lib/utils/canvas/notation";
import { useStrokeEditing } from "./useStrokeEditing";
```

2. Move the whole `updatePlayData` block (the `/**\n     * Handle play data updates\n     */` comment and its `useCallback`, unchanged) from below the animation-frame effect to just above the `/**\n     * Rendering function` comment. It depends only on `mode`, `onPlayDataChange`, `onUndoRedoStateChange` and `historyManagerRef`, all declared earlier. Directly after it add:

```ts
    // Line editing: the selected line's handles, bends and whole-line moves (line editing R3, R5)
    const {
        press: pressLine,
        grab: grabLine,
        move: moveLineGesture,
        release: releaseLine,
        cancel: cancelLine,
        preview: linePreview,
        active: lineGestureActive,
    } = useStrokeEditing({ playDataRef, commit: updatePlayData });
```

3. In `render`, replace

```ts
        const renderData = isDragging && selectedElementId && dragPreviewPosition
            ? moveElement(playData, selectedElementId, dragPreviewPosition)
            : playData;
```

with

```ts
        const renderData = linePreview
            ? replaceDrawing(playData, linePreview)
            : isDragging && selectedElementId && dragPreviewPosition
                ? moveElement(playData, selectedElementId, dragPreviewPosition)
                : playData;
```

after the `drawBoardFrame(…);` call add

```ts
        // The selected line's handles, over the scene (line editing R3, R6)
        const selected = selectedElementId ? findElement(renderData, selectedElementId) : null;
        if (selected?.kind === "drawing") drawLineHandles(ctx, lineHandles(selected.element), transform, LINE_EDIT_COLORS, scale);
```

and add `linePreview,` to `render`'s dependency list.

4. In the selection/tool effect, replace

```ts
    useEffect(() => {
        if (selectedTool !== "select" || areaTool) setSelectedElementId(null);
        setIsDrawing(false);
        setCurrentDrawingPoints([]);
        setAreaDrag(null);
    }, [selectedTool, areaTool]);
```

with

```ts
    useEffect(() => {
        if (selectedTool !== "select" || areaTool) setSelectedElementId(null);
        setIsDrawing(false);
        setCurrentDrawingPoints([]);
        setAreaDrag(null);
        cancelLine();
    }, [selectedTool, areaTool, cancelLine]);
```

5. In `handleMouseDown`, replace the whole `case "select":` clause (from `case "select":` through its `break;` before `case "player": {`) with:

```ts
                case "select":
                    // Handle selection
                    // Requirements: 5.4
                    // A gesture whose release was never seen (e.g. released
                    // outside the window) must not leak its preview into this one.
                    setDragPreviewPosition(null);
                    setIsDragging(false);
                    setDragOffset(null);
                    setIsDrawing(false);
                    setCurrentDrawingPoints([]);
                    grabPointRef.current = null;
                    cancelLine();
                    // The selected line's handles, then its body, come before
                    // anything else under the pointer (line editing R3)
                    if (pressLine({ selectedId: selectedElementIdRef.current, point: hitPos, hitRadiusFt: minHitRadiusFt() })) break;
                    const hitResult = hitTest(hitPos, playData, minHitRadiusFt());
                    if (hitResult.hit && hitResult.elementId) {
                        setSelectedElementId(hitResult.elementId);
                        const found = findElement(playData, hitResult.elementId);
                        if (found?.kind === "drawing") {
                            // A line moves as a whole from wherever it is grabbed
                            grabLine(found.element, hitPos);
                            break;
                        }
                        setIsDragging(true);
                        grabPointRef.current = hitPos;
                        // Drag offset keeps the grab point under the pointer
                        if (found) {
                            setDragOffset({
                                x: hitPos.x - found.element.position.x,
                                y: hitPos.y - found.element.position.y,
                            });
                        }
                    } else {
                        // Clicked on empty space, deselect
                        setSelectedElementId(null);
                    }
                    break;
```

and add `pressLine, grabLine, cancelLine,` to `handleMouseDown`'s dependency list.

6. In `handleMouseMove`, insert after the `if (areaDrag) { … return; }` block:

```ts
            // A line edit in progress previews only; release commits it (line editing R3)
            if (moveLineGesture(clampToRect(rinkPos, FULL_RINK), {
                area,
                thresholdFt: pxToRinkFt(DRAG_THRESHOLD_PX, transform, scaleRef.current),
            })) return;
```

and add `moveLineGesture` to its dependency list.

7. In `handleMouseUp`, insert before the comment `// Commit drag changes to playData (single history entry); a drag`:

```ts
            // A line edit commits one history entry, or nothing if it changed nothing
            releaseLine();
```

and add `releaseLine` to its dependency list.

8. Replace the window `mouseup` effect's guard and dependencies:

```ts
    useEffect(() => {
        if (!isDragging && !isDrawing && !areaDrag && !lineGestureActive) return;
        const onWindowMouseUp = (event: MouseEvent) => {
            if (event.target instanceof Node && canvasRef.current?.contains(event.target)) return;
            handleMouseUp();
        };
        window.addEventListener("mouseup", onWindowMouseUp);
        return () => window.removeEventListener("mouseup", onWindowMouseUp);
    }, [isDragging, isDrawing, areaDrag, lineGestureActive, handleMouseUp]);
```

9. In `abandonTransientInteraction`, add `cancelLine();` after `setCurrentDrawingPoints([]);` and change its dependency list from `[]` to `[cancelLine]`.

- [ ] **Step 6: Run the tests to see them pass**

Run: `bun run test __tests__/components/features/practice-planner __tests__/lib/utils/canvas`
Expected: PASS, including `RinkBoard.test.tsx`, `RinkBoard.ice-area.test.tsx` and `RinkBoard.line-budget.test.ts`.

Run: `wc -l components/features/practice-planner/RinkBoard.tsx && bun run type-check && bun run lint`
Expected: about 975 lines (≤ 1057); type-check and lint exit 0.

- [ ] **Step 7: Commit**

```bash
/usr/bin/git add components/features/practice-planner/useStrokeEditing.ts components/features/practice-planner/RinkBoard.tsx \
  lib/utils/canvas/drawing-utils.ts lib/utils/canvas/rink-renderer.ts lib/utils/canvas/notation.ts \
  __tests__/components/features/practice-planner/RinkBoard.line-editing.test.tsx \
  __tests__/lib/utils/canvas/line-edit-colors.test.ts __tests__/lib/utils/canvas/drawing-utils.test.ts
/usr/bin/git commit -m "feat(practice-planner): move lines, drag their ends and add bends on the rink board" -m "$SESSION_TRAILER"
```

---

### Task 5: Removing bends: double-tap and Straighten

A double-click or double-tap on a bend removes it; ends can't be removed. The inspector's **Straighten** removes every bend of a straight line, and **Make straight** turns a freehand line into a straight one; both keep the first and last points and are one undoable `updateElement` (success criterion 3; spec R3).

**Files:**
- Modify: `components/features/practice-planner/useStrokeEditing.ts` (`LinePress.time`; `press`; `release`)
- Modify: `components/features/practice-planner/RinkBoard.tsx` (the `pressLine({ … })` call)
- Modify: `components/features/practice-planner/ElementInspector.tsx` (imports; the `drawing` section)
- Test (modify): `__tests__/components/features/practice-planner/RinkBoard.line-editing.test.tsx`, `__tests__/components/features/practice-planner/ElementInspector.test.tsx`

**Interfaces:**
- Consumes (Task 2): `isDoubleTap`, `removeBend`, `straighten`, `TapRecord`.
- Changes: `LinePress` gains `time: number` (milliseconds; RinkBoard passes `Date.now()`).
- `ElementInspector` sends `{ path, points }` patches through the existing `onChange: (patch: ElementPatch) => void`; `PlayEditor` already forwards them to `RinkBoardHandle.updateElement`.

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/components/features/practice-planner/RinkBoard.line-editing.test.tsx`:

```tsx
describe("RinkBoard line editing: removing bends", () => {
    it("removes a bend with a double-click", () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(10_000);
        const ctx = setup({ playData: withLines(line(BENT)) });
        ctx.click(60, 30);
        ctx.click(80, 20);
        vi.setSystemTime(10_200);
        ctx.click(80, 20);
        expect(ctx.onPlayDataChange).toHaveBeenCalledTimes(1);
        expect(ctx.last().drawings[0].points).toEqual([{ x: 40, y: 40 }, { x: 120, y: 40 }]);
    });

    it("keeps the bend for two slow clicks", () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(10_000);
        const ctx = setup({ playData: withLines(line(BENT)) });
        ctx.click(60, 30);
        ctx.click(80, 20);
        vi.setSystemTime(10_400);
        ctx.click(80, 20);
        expect(ctx.onPlayDataChange).not.toHaveBeenCalled();
    });

    it("removes a bend with a double-tap", () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(10_000);
        const ctx = setup({ playData: withLines(line(BENT)) });
        const tap = (x: number, y: number) => {
            fireEvent.touchStart(ctx.canvas, { touches: [ctx.at(x, y)] });
            fireEvent.touchEnd(ctx.canvas, { touches: [] });
        };
        tap(60, 30);
        tap(80, 20);
        vi.setSystemTime(10_250);
        tap(80, 20);
        expect(ctx.last().drawings[0].points).toHaveLength(2);
    });

    it("never removes an end", () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(10_000);
        const ctx = setup({ playData: withLines(line(BENT)) });
        ctx.click(60, 30);
        ctx.click(40, 40);
        vi.setSystemTime(10_100);
        ctx.click(40, 40);
        expect(ctx.onPlayDataChange).not.toHaveBeenCalled();
    });

    it("undoes a removed bend", () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(10_000);
        const start = withLines(line(BENT));
        const ctx = setup({ playData: start });
        ctx.click(60, 30);
        ctx.click(80, 20);
        vi.setSystemTime(10_100);
        ctx.click(80, 20);
        ctx.rerender(ctx.last());
        act(() => ctx.ref.current!.undo());
        expect(ctx.last().drawings[0].points).toEqual(BENT);
    });

    it("straightens through the handle as one undoable step", () => {
        const start = withLines(line(BENT));
        const ctx = setup({ playData: start });
        act(() => ctx.ref.current!.updateElement("l", { path: "straight", points: [BENT[0], BENT[2]] }));
        expect(ctx.last().drawings[0].points).toEqual([BENT[0], BENT[2]]);
        ctx.rerender(ctx.last());
        act(() => ctx.ref.current!.undo());
        expect(ctx.last().drawings[0].points).toEqual(BENT);
    });
});
```

Append to `__tests__/components/features/practice-planner/ElementInspector.test.tsx`:

```tsx
describe("Straighten (line editing R3)", () => {
    const drawing = (path: "straight" | "freehand", points: { x: number; y: number }[]): SelectedElement => ({
        kind: "drawing",
        element: { id: "d", action: "skate", path, end: "arrow", points, color: "#212121", strokeWidth: 2 },
    });

    it("removes a straight line's bends and keeps its ends", async () => {
        const onChange = wrap(drawing("straight", [{ x: 0, y: 0 }, { x: 5, y: 9 }, { x: 10, y: 0 }]));
        const button = screen.getByRole("button", { name: "Straighten" });
        expect(button).toHaveStyle({ minHeight: "44px" });
        await userEvent.click(button);
        expect(onChange).toHaveBeenCalledWith({ path: "straight", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] });
    });

    it("offers Make straight for a freehand line", async () => {
        const onChange = wrap(drawing("freehand", [{ x: 0, y: 0 }, { x: 4, y: 3 }, { x: 8, y: 1 }]));
        expect(screen.queryByRole("button", { name: "Straighten" })).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Make straight" }));
        expect(onChange).toHaveBeenCalledWith({ path: "straight", points: [{ x: 0, y: 0 }, { x: 8, y: 1 }] });
    });

    it("offers neither for a straight line without bends", () => {
        wrap(stroke);
        expect(screen.queryByRole("button", { name: "Straighten" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Make straight" })).not.toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `bun run test __tests__/components/features/practice-planner/RinkBoard.line-editing.test.tsx __tests__/components/features/practice-planner/ElementInspector.test.tsx`
Expected: FAIL. The double-click and double-tap tests see no removal; the inspector finds no `Straighten` or `Make straight` button. ("keeps the bend for two slow clicks", "never removes an end" and "straightens through the handle" already pass.)

- [ ] **Step 3: Recognize the double-tap in `useStrokeEditing.ts`**

Replace the whole file with:

```ts
"use client";

/**
 * Gesture state for editing the selected line on the rink board (line
 * editing spec R3, R5): drag the whole line, an end, a bend or a freehand
 * anchor, or a "+" handle to add a bend; double-tap a bend to remove it.
 * The geometry is pure (lib/utils/canvas/line-editing.ts); this hook holds
 * the gesture between press and release, exposes the live preview, and
 * commits one history entry per edit.
 */
import React, { useCallback, useRef, useState } from "react";
import type { DrawingElement, PlayData, Position, RinkRect } from "@/types/practice-planner";
import { findElement, replaceDrawing } from "@/lib/utils/canvas/element-ops";
import { drawingHitRadius, hitTestDrawing, pastDragThreshold } from "@/lib/utils/canvas/interaction-utils";
import {
    hitTestLineHandle,
    insertBend,
    isDoubleTap,
    lineHandles,
    moveLine,
    moveLinePoint,
    removeBend,
    type LineHandle,
    type TapRecord,
} from "@/lib/utils/canvas/line-editing";

export interface LinePress {
    /** The board's selected element (null = none); only a selected line has handles */
    selectedId: string | null;
    /** Pointer in rink feet, clamped to the rink */
    point: Position;
    /** The board's minimum hit radius in feet (MIN_HIT_RADIUS_PX at the current zoom) */
    hitRadiusFt: number;
    /** When the press happened, in milliseconds (for the double-tap) */
    time: number;
}

export interface LineMove {
    /** The drill's ice area: every edited point stays inside it */
    area: RinkRect;
    /** DRAG_THRESHOLD_PX in feet: until the pointer passes it, a press edits nothing */
    thresholdFt: number;
}

export interface StrokeEditingOptions {
    /** The board's latest play data */
    playDataRef: React.RefObject<PlayData>;
    /** Records one history entry (RinkBoard's updatePlayData) */
    commit: (next: PlayData) => void;
}

export interface StrokeEditing {
    /** A Select press on the selected line's handles or body starts a gesture (or removes a double-tapped bend); false (and nothing) otherwise */
    press: (press: LinePress) => boolean;
    /** Starts a whole-line move on a line a press has just selected */
    grab: (stroke: DrawingElement, point: Position) => void;
    /** Updates the preview; false when no gesture is in progress */
    move: (pointer: Position, move: LineMove) => boolean;
    /** Commits the preview as one history entry, or nothing if it changed nothing */
    release: () => void;
    /** Drops the gesture without committing */
    cancel: () => void;
    /** The edited line while a gesture has moved it (null = none) */
    preview: DrawingElement | null;
    /** True from press to release or cancel */
    active: boolean;
}

interface Gesture {
    /** The line as it was at the press */
    stroke: DrawingElement;
    /** The handle pressed, or null for the line's body (a whole-line move) */
    handle: LineHandle | null;
    /** Where the press landed (rink feet) */
    grab: Position;
    /** True once the pointer passed the drag threshold */
    started: boolean;
}

/** The gesture's line with the pointer applied; a handle keeps its offset from the press. */
function editedStroke(g: Gesture, pointer: Position, area: RinkRect): DrawingElement {
    const delta = { x: pointer.x - g.grab.x, y: pointer.y - g.grab.y };
    if (!g.handle) return moveLine(g.stroke, delta, area);
    const target = { x: g.handle.position.x + delta.x, y: g.handle.position.y + delta.y };
    return g.handle.kind === "add"
        ? insertBend(g.stroke, g.handle.segment, target, area)
        : moveLinePoint(g.stroke, g.handle.index, target, area);
}

export function useStrokeEditing({ playDataRef, commit }: StrokeEditingOptions): StrokeEditing {
    const gestureRef = useRef<Gesture | null>(null);
    // The preview in a ref too, so a release in the same frame as the last move reads it
    const previewRef = useRef<DrawingElement | null>(null);
    // The last press on a bend that did not become a drag (for the double-tap)
    const lastTapRef = useRef<TapRecord | null>(null);
    const [preview, setPreviewState] = useState<DrawingElement | null>(null);
    const [active, setActive] = useState(false);

    const setPreview = useCallback((stroke: DrawingElement | null) => {
        previewRef.current = stroke;
        setPreviewState(stroke);
    }, []);

    const begin = useCallback(
        (stroke: DrawingElement, handle: LineHandle | null, point: Position) => {
            gestureRef.current = { stroke, handle, grab: point, started: false };
            setPreview(null);
            setActive(true);
        },
        [setPreview]
    );

    const press = useCallback(
        ({ selectedId, point, hitRadiusFt, time }: LinePress): boolean => {
            if (!selectedId) return false;
            const data = playDataRef.current;
            const found = findElement(data, selectedId);
            if (!found || found.kind !== "drawing") return false;
            const stroke = found.element;
            // Handles first, then the line's body (R3)
            const handle = hitTestLineHandle(lineHandles(stroke), point, hitRadiusFt);
            if (handle?.kind === "bend") {
                const tap: TapRecord = { id: stroke.id, index: handle.index, position: point, time };
                if (isDoubleTap(lastTapRef.current, tap, hitRadiusFt)) {
                    // A double-tap removes the bend: one history entry, no drag (R3)
                    lastTapRef.current = null;
                    const next = replaceDrawing(data, removeBend(stroke, handle.index));
                    if (next !== data) commit(next);
                    return true;
                }
                lastTapRef.current = tap;
            } else {
                lastTapRef.current = null;
            }
            if (handle) {
                begin(stroke, handle, point);
                return true;
            }
            if (hitTestDrawing(point, stroke, drawingHitRadius(hitRadiusFt))) {
                begin(stroke, null, point);
                return true;
            }
            return false;
        },
        [playDataRef, begin, commit]
    );

    const grab = useCallback((stroke: DrawingElement, point: Position) => begin(stroke, null, point), [begin]);

    const move = useCallback(
        (pointer: Position, { area, thresholdFt }: LineMove): boolean => {
            const g = gestureRef.current;
            if (!g) return false;
            // A press that never travels the drag threshold is a tap: it edits nothing
            if (!g.started) {
                if (!pastDragThreshold(g.grab, pointer, thresholdFt)) return true;
                g.started = true;
            }
            setPreview(editedStroke(g, pointer, area));
            return true;
        },
        [setPreview]
    );

    const release = useCallback(() => {
        const g = gestureRef.current;
        const edited = previewRef.current;
        gestureRef.current = null;
        setPreview(null);
        setActive(false);
        // A drag is not a tap: the next press on the bend starts a new double-tap
        if (g?.started) lastTapRef.current = null;
        if (!g?.started || !edited || edited === g.stroke) return;
        const current = playDataRef.current;
        const next = replaceDrawing(current, edited);
        if (next !== current) commit(next);
    }, [playDataRef, commit, setPreview]);

    const cancel = useCallback(() => {
        gestureRef.current = null;
        setPreview(null);
        setActive(false);
    }, [setPreview]);

    return { press, grab, move, release, cancel, preview, active };
}
```

In `components/features/practice-planner/RinkBoard.tsx`, change the press call in `case "select":` to

```ts
                    if (pressLine({ selectedId: selectedElementIdRef.current, point: hitPos, hitRadiusFt: minHitRadiusFt(), time: Date.now() })) break;
```

- [ ] **Step 4: Add Straighten / Make straight to the inspector**

In `components/features/practice-planner/ElementInspector.tsx`:

- change the MUI import to `import { Box, Button, Paper, Stack, TextField, Typography, ButtonBase } from "@mui/material";`;
- add `import { straighten } from "@/lib/utils/canvas/line-editing";` and `import type { DrawingElement } from "@/types/practice-planner";`;
- add above `export interface ElementInspectorProps`:

```tsx
/**
 * Straighten removes a straight line's bends; Make straight turns a freehand
 * line into a straight one. Both keep the first and last points and are one
 * undoable update (line editing R3). Nothing to offer for a 2-point line.
 */
function StraightenButton({ stroke, onChange }: { stroke: DrawingElement; onChange: (patch: ElementPatch) => void }) {
    const label = stroke.path === "freehand" ? "Make straight" : stroke.points.length > 2 ? "Straighten" : null;
    if (!label) return null;
    return (
        <Button
            variant="outlined"
            sx={{ minHeight: 44, minWidth: 44 }}
            onClick={() => {
                const next = straighten(stroke);
                if (next !== stroke) onChange({ path: next.path, points: next.points });
            }}
        >
            {label}
        </Button>
    );
}
```

- in the `selected.kind === "drawing"` fragment, add after the `ColorRow`:

```tsx
                        <StraightenButton stroke={selected.element} onChange={onChange} />
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `bun run test __tests__/components/features/practice-planner __tests__/lib/utils/canvas`
Expected: PASS.

Run: `bun run type-check && bun run lint`
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add components/features/practice-planner/useStrokeEditing.ts components/features/practice-planner/RinkBoard.tsx \
  components/features/practice-planner/ElementInspector.tsx \
  __tests__/components/features/practice-planner/RinkBoard.line-editing.test.tsx \
  __tests__/components/features/practice-planner/ElementInspector.test.tsx
/usr/bin/git commit -m "feat(practice-planner): remove bends by double-tap and straighten lines from the inspector" -m "$SESSION_TRAILER"
```

---

### Task 6: Snapping line ends, with a ring and an Alt bypass

A new line's start (on press) and end (on release) snap to player centres, equipment centres and other lines' ends; so does a dragged end handle. A ring marks the target while a snap is active, and Alt/Option on the gesture turns snapping off (success criterion 5; spec R4). Bends, anchors and whole-line moves don't snap.

**Files:**
- Modify: `components/features/practice-planner/useStrokeEditing.ts` (snap state, `snapLineEnd`, `currentSnap`, `clearSnap`, `snapRing`; end snapping in `move`; `LineMove` fields)
- Modify: `components/features/practice-planner/RinkBoard.tsx` (imports; the hook's destructuring; `render`; `case "stroke"`; `handleMouseMove`; `handleMouseUp`)
- Modify: `lib/utils/canvas/drawing-utils.ts` (add `SNAP_RING_RADIUS_PX`, `drawSnapRing`)
- Test (create): `__tests__/components/features/practice-planner/useStrokeEditing.test.ts`
- Test (modify): `__tests__/components/features/practice-planner/RinkBoard.line-editing.test.tsx`, `__tests__/lib/utils/canvas/drawing-utils.test.ts`

**Interfaces:**
- Consumes (Task 2): `findSnapTarget`, `snapRadiusFt`, `SnapOptions`.
- Changes: `LineMove` gains `snapRadiusFt: number` and `bypassSnap: boolean`.
- Produces, on `StrokeEditing`: `snapLineEnd(point: Position, options: SnapOptions): Position | null` (sets the ring), `currentSnap(): Position | null`, `clearSnap(): void`, `snapRing: Position | null`. `release` and `cancel` clear the ring.
- Produces, from `lib/utils/canvas/drawing-utils.ts`: `SNAP_RING_RADIUS_PX = 14`, `drawSnapRing(ctx, position: Position, transform: TransformContext, color: string, zoom?: number): void`.

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/components/features/practice-planner/RinkBoard.line-editing.test.tsx`:

```tsx
describe("RinkBoard line editing: snapping", () => {
    const targets = (): PlayData => ({
        ...createEmptyPlayData(),
        players: [{ id: "p", position: { x: 50, y: 40 }, role: "X", label: "", color: "#1976D2" }],
        equipment: [{ id: "c", kind: "cone", position: { x: 100, y: 40 }, rotation: 0 }],
    });
    const straightTool = { selectedTool: "stroke" as const, strokeOptions: { action: "skate" as const, path: "straight" as const, end: "arrow" as const } };

    it("snaps a new line's start and end to a player and a cone", () => {
        const ctx = setup({ playData: targets(), ...straightTool });
        fireEvent.mouseDown(ctx.canvas, ctx.at(52, 42));
        fireEvent.mouseMove(ctx.canvas, ctx.at(80, 41));
        fireEvent.mouseMove(ctx.canvas, ctx.at(102, 41));
        fireEvent.mouseUp(ctx.canvas);
        expect(ctx.last().drawings[0].points).toEqual([{ x: 50, y: 40 }, { x: 100, y: 40 }]);
    });

    it("skips snapping while Alt/Option is held", () => {
        const ctx = setup({ playData: targets(), ...straightTool });
        fireEvent.mouseDown(ctx.canvas, { ...ctx.at(52, 42), altKey: true });
        fireEvent.mouseMove(ctx.canvas, { ...ctx.at(102, 41), altKey: true });
        fireEvent.mouseUp(ctx.canvas);
        const [start, end] = ctx.last().drawings[0].points;
        expectPoint(start, 52, 42);
        expectPoint(end, 102, 41);
        expect(start).not.toEqual({ x: 50, y: 40 });
    });

    it("snaps only a freehand line's first and last points", () => {
        const ctx = setup({ playData: targets(), selectedTool: "stroke", strokeOptions: { action: "skate", path: "freehand", end: "arrow" } });
        fireEvent.mouseDown(ctx.canvas, ctx.at(52, 42));
        fireEvent.mouseMove(ctx.canvas, ctx.at(65, 30));
        fireEvent.mouseMove(ctx.canvas, ctx.at(80, 50));
        fireEvent.mouseMove(ctx.canvas, ctx.at(101, 42));
        fireEvent.mouseUp(ctx.canvas);
        const points = ctx.last().drawings[0].points;
        expect(points[0]).toEqual({ x: 50, y: 40 });
        expect(points[points.length - 1]).toEqual({ x: 100, y: 40 });
        expect(points.slice(1, -1).some((p) => p.x === 50 || p.x === 100)).toBe(false);
    });

    it("snaps a dragged end to another line's end, never to its own", () => {
        const other = line([{ x: 60, y: 70 }, { x: 140, y: 60 }], "straight", "m");
        const ctx = setup({ playData: withLines(line(STRAIGHT), other) });
        ctx.click(60, 40);
        ctx.drag([120, 40], [138, 58]);
        expect(ctx.last().drawings[0].points[1]).toEqual({ x: 140, y: 60 });

        const own = setup({ playData: withLines(line(STRAIGHT)) });
        own.click(60, 40);
        own.drag([120, 40], [42, 41]);
        const end = own.last().drawings[0].points[1];
        expectPoint(end, 42, 41);
        expect(end).not.toEqual({ x: 40, y: 40 });
    });

    it("never snaps a bend or a whole-line move", () => {
        const ctx = setup({ playData: { ...targets(), drawings: [line([{ x: 40, y: 60 }, { x: 120, y: 60 }])] } });
        ctx.click(60, 60);
        ctx.drag([80, 60], [99, 41]);
        expectPoint(ctx.last().drawings[0].points[1], 99, 41);
    });

    it("ignores a target outside the drill's area", () => {
        const ctx = setup({
            playData: { ...createEmptyPlayData(), area: CUSTOM, players: [{ id: "p", position: { x: 98, y: 40 }, role: "X", label: "", color: "#1976D2" }] },
            ...straightTool,
        });
        fireEvent.mouseDown(ctx.canvas, ctx.at(99.5, 40));
        fireEvent.mouseMove(ctx.canvas, ctx.at(110, 40));
        fireEvent.mouseUp(ctx.canvas);
        expectPoint(ctx.last().drawings[0].points[0], 100, 40);
    });
});
```

(In the custom-area board the scale is 12 px/ft, so the snap radius is the 3 ft floor; the player at x = 98 is 2 ft from the clamped start at x = 100 but outside the area.)

Create `__tests__/components/features/practice-planner/useStrokeEditing.test.ts`:

```ts
/** The snap ring's state in useStrokeEditing (line editing spec R4). */
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useStrokeEditing } from "@/components/features/practice-planner/useStrokeEditing";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import type { PlayData } from "@/types/practice-planner";

const RINK = { x: 0, y: 0, w: 200, h: 85 };
const data: PlayData = {
    ...createEmptyPlayData(),
    players: [{ id: "p", position: { x: 50, y: 40 }, role: "X", label: "", color: "#1976D2" }],
    drawings: [{ id: "l", action: "skate", path: "straight", end: "arrow", points: [{ x: 10, y: 10 }, { x: 40, y: 30 }], color: "#212121", strokeWidth: 2 }],
};

function setup() {
    const commit = vi.fn();
    const { result } = renderHook(() => useStrokeEditing({ playDataRef: { current: data }, commit }));
    return { result, commit };
}

describe("useStrokeEditing snap ring", () => {
    it("rings the target while a line end snaps, and clears it", () => {
        const { result } = setup();
        let snapped: unknown;
        act(() => { snapped = result.current.snapLineEnd({ x: 52, y: 41 }, { radiusFt: 3 }); });
        expect(snapped).toEqual({ x: 50, y: 40 });
        expect(result.current.snapRing).toEqual({ x: 50, y: 40 });
        expect(result.current.currentSnap()).toEqual({ x: 50, y: 40 });
        act(() => { result.current.snapLineEnd({ x: 60, y: 41 }, { radiusFt: 3 }); });
        expect(result.current.snapRing).toBeNull();
        act(() => { result.current.snapLineEnd({ x: 52, y: 41 }, { radiusFt: 3, bypass: true }); });
        expect(result.current.snapRing).toBeNull();
        act(() => { result.current.snapLineEnd({ x: 52, y: 41 }, { radiusFt: 3 }); });
        act(() => result.current.clearSnap());
        expect(result.current.currentSnap()).toBeNull();
        expect(result.current.snapRing).toBeNull();
    });

    it("rings the target of a dragged end, commits the snapped end once, and clears the ring", () => {
        const { result, commit } = setup();
        act(() => { result.current.press({ selectedId: "l", point: { x: 40, y: 30 }, hitRadiusFt: 3, time: 0 }); });
        act(() => { result.current.move({ x: 51, y: 39 }, { area: RINK, thresholdFt: 1, snapRadiusFt: 3, bypassSnap: false }); });
        expect(result.current.snapRing).toEqual({ x: 50, y: 40 });
        act(() => result.current.release());
        expect(commit).toHaveBeenCalledTimes(1);
        expect(commit.mock.calls[0][0].drawings[0].points[1]).toEqual({ x: 50, y: 40 });
        expect(result.current.snapRing).toBeNull();
    });
});
```

In `__tests__/lib/utils/canvas/drawing-utils.test.ts`, extend the `drawing-utils` import with `drawSnapRing, SNAP_RING_RADIUS_PX` and append:

```ts
describe("drawSnapRing", () => {
    it("rings the target 14 px on screen in the given colour", () => {
        for (const zoom of [1, 2]) {
            const calls: Call[] = [];
            const ctx = recordingCtx(calls);
            drawSnapRing(ctx, { x: 50, y: 40 }, transform, LINE_EDIT_COLORS.snapRing, zoom);
            const arc = calls.find((c) => c.name === "arc")!;
            const c = rinkToCanvas({ x: 50, y: 40 }, transform);
            expect(arc.args.slice(0, 3)).toEqual([c.x, c.y, SNAP_RING_RADIUS_PX / zoom]);
            expect((ctx as unknown as Record<string, unknown>).strokeStyle).toBe(LINE_EDIT_COLORS.snapRing);
        }
    });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `bun run test __tests__/components/features/practice-planner/RinkBoard.line-editing.test.tsx __tests__/components/features/practice-planner/useStrokeEditing.test.ts __tests__/lib/utils/canvas/drawing-utils.test.ts`
Expected: FAIL. New lines keep their raw ends (e.g. `{ x: 52, … }` instead of `{ x: 50, y: 40 }`); the dragged end stops at (138, 58); `snapLineEnd` is not a function; `drawSnapRing` is not exported. ("skips snapping while Alt", "never snaps a bend…" and "ignores a target outside the drill's area" already pass.)

- [ ] **Step 3: The ring painter**

In `lib/utils/canvas/drawing-utils.ts`, add after `drawLineHandles`:

```ts
/** The snap ring's radius on screen, at any zoom (line editing R4). */
export const SNAP_RING_RADIUS_PX = 14;

/** Rings a snap target (rink feet) while a line end is snapping (line editing R4). */
export function drawSnapRing(
    ctx: CanvasRenderingContext2D,
    position: Position,
    transform: TransformContext,
    color: string,
    zoom: number = 1
): void {
    const c = rinkToCanvas(position, transform);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 / zoom;
    ctx.beginPath();
    ctx.arc(c.x, c.y, SNAP_RING_RADIUS_PX / zoom, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}
```

- [ ] **Step 4: Snap state in `useStrokeEditing.ts`**

Replace the whole file with:

```ts
"use client";

/**
 * Gesture state for editing lines on the rink board (line editing spec R3,
 * R4, R5): drag the whole selected line, an end, a bend or a freehand
 * anchor, or a "+" handle to add a bend; double-tap a bend to remove it;
 * snap a line end (drawn or dragged) to a player, equipment or another
 * line's end, with a ring on the target. The geometry is pure
 * (lib/utils/canvas/line-editing.ts); this hook holds the gesture between
 * press and release, exposes the live preview and the ring, and commits one
 * history entry per edit.
 */
import React, { useCallback, useRef, useState } from "react";
import type { DrawingElement, PlayData, Position, RinkRect } from "@/types/practice-planner";
import { findElement, replaceDrawing } from "@/lib/utils/canvas/element-ops";
import { drawingHitRadius, hitTestDrawing, pastDragThreshold } from "@/lib/utils/canvas/interaction-utils";
import {
    findSnapTarget,
    hitTestLineHandle,
    insertBend,
    isDoubleTap,
    lineHandles,
    moveLine,
    moveLinePoint,
    removeBend,
    type LineHandle,
    type SnapOptions,
    type TapRecord,
} from "@/lib/utils/canvas/line-editing";

export interface LinePress {
    /** The board's selected element (null = none); only a selected line has handles */
    selectedId: string | null;
    /** Pointer in rink feet, clamped to the rink */
    point: Position;
    /** The board's minimum hit radius in feet (MIN_HIT_RADIUS_PX at the current zoom) */
    hitRadiusFt: number;
    /** When the press happened, in milliseconds (for the double-tap) */
    time: number;
}

export interface LineMove {
    /** The drill's ice area: every edited point stays inside it */
    area: RinkRect;
    /** DRAG_THRESHOLD_PX in feet: until the pointer passes it, a press edits nothing */
    thresholdFt: number;
    /** Snap radius in feet for a dragged end (snapRadiusFt) */
    snapRadiusFt: number;
    /** Alt/Option held on this move: no snapping */
    bypassSnap: boolean;
}

export interface StrokeEditingOptions {
    /** The board's latest play data */
    playDataRef: React.RefObject<PlayData>;
    /** Records one history entry (RinkBoard's updatePlayData) */
    commit: (next: PlayData) => void;
}

export interface StrokeEditing {
    /** A Select press on the selected line's handles or body starts a gesture (or removes a double-tapped bend); false (and nothing) otherwise */
    press: (press: LinePress) => boolean;
    /** Starts a whole-line move on a line a press has just selected */
    grab: (stroke: DrawingElement, point: Position) => void;
    /** Updates the preview; false when no gesture is in progress */
    move: (pointer: Position, move: LineMove) => boolean;
    /** Commits the preview as one history entry, or nothing if it changed nothing */
    release: () => void;
    /** Drops the gesture and the ring without committing */
    cancel: () => void;
    /** Snaps a line end being drawn: the target (shown with the ring) or null */
    snapLineEnd: (point: Position, options: SnapOptions) => Position | null;
    /** The last snap target (null = none), read when a drawn line is released */
    currentSnap: () => Position | null;
    /** Hides the ring */
    clearSnap: () => void;
    /** The edited line while a gesture has moved it (null = none) */
    preview: DrawingElement | null;
    /** True from press to release or cancel */
    active: boolean;
    /** The target a line end is snapping to (null = none) */
    snapRing: Position | null;
}

interface Gesture {
    /** The line as it was at the press */
    stroke: DrawingElement;
    /** The handle pressed, or null for the line's body (a whole-line move) */
    handle: LineHandle | null;
    /** Where the press landed (rink feet) */
    grab: Position;
    /** True once the pointer passed the drag threshold */
    started: boolean;
}

/** The gesture's line with the pointer applied; a handle keeps its offset from the press. */
function editedStroke(g: Gesture, pointer: Position, area: RinkRect): DrawingElement {
    const delta = { x: pointer.x - g.grab.x, y: pointer.y - g.grab.y };
    if (!g.handle) return moveLine(g.stroke, delta, area);
    const target = { x: g.handle.position.x + delta.x, y: g.handle.position.y + delta.y };
    return g.handle.kind === "add"
        ? insertBend(g.stroke, g.handle.segment, target, area)
        : moveLinePoint(g.stroke, g.handle.index, target, area);
}

const samePosition = (a: Position | null, b: Position | null) =>
    a === b || (a !== null && b !== null && a.x === b.x && a.y === b.y);

export function useStrokeEditing({ playDataRef, commit }: StrokeEditingOptions): StrokeEditing {
    const gestureRef = useRef<Gesture | null>(null);
    // The preview and the snap in refs too, so a release in the same frame as the last move reads them
    const previewRef = useRef<DrawingElement | null>(null);
    const snapRef = useRef<Position | null>(null);
    // The last press on a bend that did not become a drag (for the double-tap)
    const lastTapRef = useRef<TapRecord | null>(null);
    const [preview, setPreviewState] = useState<DrawingElement | null>(null);
    const [active, setActive] = useState(false);
    const [snapRing, setSnapRing] = useState<Position | null>(null);

    const setPreview = useCallback((stroke: DrawingElement | null) => {
        previewRef.current = stroke;
        setPreviewState(stroke);
    }, []);

    const setSnap = useCallback((target: Position | null) => {
        snapRef.current = target;
        setSnapRing((current) => (samePosition(current, target) ? current : target));
    }, []);

    const snapLineEnd = useCallback(
        (point: Position, options: SnapOptions): Position | null => {
            const target = findSnapTarget(playDataRef.current, point, options);
            setSnap(target);
            return target;
        },
        [playDataRef, setSnap]
    );

    const currentSnap = useCallback(() => snapRef.current, []);
    const clearSnap = useCallback(() => setSnap(null), [setSnap]);

    const begin = useCallback(
        (stroke: DrawingElement, handle: LineHandle | null, point: Position) => {
            gestureRef.current = { stroke, handle, grab: point, started: false };
            setPreview(null);
            setActive(true);
        },
        [setPreview]
    );

    const press = useCallback(
        ({ selectedId, point, hitRadiusFt, time }: LinePress): boolean => {
            if (!selectedId) return false;
            const data = playDataRef.current;
            const found = findElement(data, selectedId);
            if (!found || found.kind !== "drawing") return false;
            const stroke = found.element;
            // Handles first, then the line's body (R3)
            const handle = hitTestLineHandle(lineHandles(stroke), point, hitRadiusFt);
            if (handle?.kind === "bend") {
                const tap: TapRecord = { id: stroke.id, index: handle.index, position: point, time };
                if (isDoubleTap(lastTapRef.current, tap, hitRadiusFt)) {
                    // A double-tap removes the bend: one history entry, no drag (R3)
                    lastTapRef.current = null;
                    const next = replaceDrawing(data, removeBend(stroke, handle.index));
                    if (next !== data) commit(next);
                    return true;
                }
                lastTapRef.current = tap;
            } else {
                lastTapRef.current = null;
            }
            if (handle) {
                begin(stroke, handle, point);
                return true;
            }
            if (hitTestDrawing(point, stroke, drawingHitRadius(hitRadiusFt))) {
                begin(stroke, null, point);
                return true;
            }
            return false;
        },
        [playDataRef, begin, commit]
    );

    const grab = useCallback((stroke: DrawingElement, point: Position) => begin(stroke, null, point), [begin]);

    const move = useCallback(
        (pointer: Position, { area, thresholdFt, snapRadiusFt, bypassSnap }: LineMove): boolean => {
            const g = gestureRef.current;
            if (!g) return false;
            // A press that never travels the drag threshold is a tap: it edits nothing
            if (!g.started) {
                if (!pastDragThreshold(g.grab, pointer, thresholdFt)) return true;
                g.started = true;
            }
            const handle = g.handle;
            if (handle && handle.kind === "end") {
                // A dragged end snaps (R4); bends, anchors and whole-line moves don't
                const target = { x: handle.position.x + pointer.x - g.grab.x, y: handle.position.y + pointer.y - g.grab.y };
                const snap = snapLineEnd(target, { radiusFt: snapRadiusFt, excludeId: g.stroke.id, bypass: bypassSnap, rect: area });
                setPreview(moveLinePoint(g.stroke, handle.index, snap ?? target, area));
                return true;
            }
            setPreview(editedStroke(g, pointer, area));
            return true;
        },
        [setPreview, snapLineEnd]
    );

    const release = useCallback(() => {
        const g = gestureRef.current;
        const edited = previewRef.current;
        gestureRef.current = null;
        setPreview(null);
        setActive(false);
        setSnap(null);
        // A drag is not a tap: the next press on the bend starts a new double-tap
        if (g?.started) lastTapRef.current = null;
        if (!g?.started || !edited || edited === g.stroke) return;
        const current = playDataRef.current;
        const next = replaceDrawing(current, edited);
        if (next !== current) commit(next);
    }, [playDataRef, commit, setPreview, setSnap]);

    const cancel = useCallback(() => {
        gestureRef.current = null;
        setPreview(null);
        setActive(false);
        setSnap(null);
    }, [setPreview, setSnap]);

    return { press, grab, move, release, cancel, snapLineEnd, currentSnap, clearSnap, preview, active, snapRing };
}
```

- [ ] **Step 5: Snap in RinkBoard**

In `components/features/practice-planner/RinkBoard.tsx`:

1. Imports: change the `drawing-utils` import to `import { drawBoardFrame, drawLineHandles, drawSnapRing, drawStroke } from "@/lib/utils/canvas/drawing-utils";` and the `line-editing` import to `import { lineHandles, snapRadiusFt } from "@/lib/utils/canvas/line-editing";`.

2. Add `snapLineEnd, currentSnap, clearSnap, snapRing,` to the `useStrokeEditing` destructuring.

3. In `render`, replace the in-progress stroke block

```ts
        if (isDrawing && currentDrawingPoints.length > 1) {
            const previewPoints = strokeOptions.path === "straight"
                ? [currentDrawingPoints[0], currentDrawingPoints[currentDrawingPoints.length - 1]]
                : currentDrawingPoints;
            drawStroke(ctx, { ...strokeOptions, points: previewPoints, color: selectedColor, strokeWidth: 2 }, transform);
        }
```

with

```ts
        if (isDrawing && currentDrawingPoints.length > 1) {
            // A snapped end previews where release will put it (line editing R4)
            const tail = snapRing ?? currentDrawingPoints[currentDrawingPoints.length - 1];
            const previewPoints = strokeOptions.path === "straight"
                ? [currentDrawingPoints[0], tail]
                : [...currentDrawingPoints.slice(0, -1), tail];
            drawStroke(ctx, { ...strokeOptions, points: previewPoints, color: selectedColor, strokeWidth: 2 }, transform);
        }
        if (snapRing) drawSnapRing(ctx, snapRing, transform, LINE_EDIT_COLORS.snapRing, scale);
```

and add `snapRing,` to `render`'s dependency list.

4. In `handleMouseDown`, replace the `case "stroke":` clause with

```ts
                case "stroke": {
                    // Start drawing; the limit is checked when the stroke finishes.
                    // The start snaps to a player, equipment or a line end (line editing R4).
                    // Requirements: 1.3, 5.1, 5.2
                    const start = snapLineEnd(clampedPos, {
                        radiusFt: snapRadiusFt(minHitRadiusFt()),
                        rect: areaRect(playData.area),
                        bypass: event.nativeEvent.altKey,
                    });
                    setIsDrawing(true);
                    setCurrentDrawingPoints([start ?? clampedPos]);
                    break;
                }
```

and add `snapLineEnd` to `handleMouseDown`'s dependency list.

5. In `handleMouseMove`, replace

```ts
            if (isDrawing && selectedTool === "stroke") {
                setCurrentDrawingPoints((prev) => [...prev, clampToRect(rinkPos, area)]);
            }
```

with

```ts
            if (isDrawing && selectedTool === "stroke") {
                const point = clampToRect(rinkPos, area);
                setCurrentDrawingPoints((prev) => [...prev, point]);
                // The end being drawn snaps on release; the ring shows where (line editing R4)
                snapLineEnd(point, { radiusFt: snapRadiusFt(minHitRadiusFt()), rect: area, bypass: event.nativeEvent.altKey });
            }
```

change the line-gesture call above it to

```ts
            if (moveLineGesture(clampToRect(rinkPos, FULL_RINK), {
                area,
                thresholdFt: pxToRinkFt(DRAG_THRESHOLD_PX, transform, scaleRef.current),
                snapRadiusFt: snapRadiusFt(minHitRadiusFt()),
                bypassSnap: event.nativeEvent.altKey,
            })) return;
```

and add `snapLineEnd, minHitRadiusFt` to its dependency list.

6. In `handleMouseUp`, replace

```ts
            if (isDrawing && selectedTool === "stroke") {
                const finished = finishStroke(playData, currentDrawingPoints, strokeOptions, selectedColor, generateId());
```

with

```ts
            if (isDrawing && selectedTool === "stroke") {
                // The end snaps to the target the last move found (line editing R4)
                const snapEnd = currentSnap();
                const points = snapEnd && currentDrawingPoints.length > 1
                    ? [...currentDrawingPoints.slice(0, -1), snapEnd]
                    : currentDrawingPoints;
                const finished = finishStroke(playData, points, strokeOptions, selectedColor, generateId());
```

add `clearSnap();` after `setCurrentDrawingPoints([]);` in the `// Reset drawing state` section, and add `currentSnap, clearSnap` to its dependency list.

- [ ] **Step 6: Run the tests to see them pass**

Run: `bun run test __tests__/components/features/practice-planner __tests__/lib/utils/canvas`
Expected: PASS. The earlier "drags an end of the selected line" test still lands at (130, 60): no target lies within the snap radius there.

Run: `wc -l components/features/practice-planner/RinkBoard.tsx && bun run type-check && bun run lint`
Expected: about 1000 lines (≤ 1057); type-check and lint exit 0.

- [ ] **Step 7: Commit**

```bash
/usr/bin/git add components/features/practice-planner/useStrokeEditing.ts components/features/practice-planner/RinkBoard.tsx \
  lib/utils/canvas/drawing-utils.ts __tests__/components/features/practice-planner/useStrokeEditing.test.ts \
  __tests__/components/features/practice-planner/RinkBoard.line-editing.test.tsx __tests__/lib/utils/canvas/drawing-utils.test.ts
/usr/bin/git commit -m "feat(practice-planner): snap line ends to players, equipment and other lines" -m "$SESSION_TRAILER"
```

---

### Task 7: Gates and visual check

Every repository gate, then screenshots of the real board. Fix forward in the task that owns a failure; never skip a gate or weaken a test, and never update the legacy geometry snapshot.

**Files:** none new in the repository. The screenshot script lives outside it; its PNGs go to `.cache/line-editing/` (git-ignored).

- [ ] **Step 1: Type-check and lint**

```bash
bun run type-check
bun run lint
```

Expected: both exit 0. A Zod v4 deprecation hint (★) in an IDE is not an error; the CLI result is what counts.

- [ ] **Step 2: Run the full suite**

Run: `bun run test`
Expected: PASS, with `stroke-geometry.legacy.test.ts` reporting 16 passed and no snapshot written, updated or obsolete. If an unrelated test fails, check `gh run list --branch main --limit 5` first: a red `main` is not this branch's regression. A failure that names a date is clock rot; pin it with `vi.setSystemTime`, never by editing fixture dates.

- [ ] **Step 3: Build both deployables**

```bash
bun run build
bun run planner:build
bun run planner:check
```

Expected: all three succeed. `planner:check` still passes (no Next.js runtime in the static bundle).

- [ ] **Step 4: Policy, portability and budget checks**

```bash
bun run check:raw-sql
bun run adr:lint
bun run adr:check lib/utils/canvas/line-editing.ts components/features/practice-planner/useStrokeEditing.ts \
  components/features/practice-planner/useBoardTouch.ts components/features/practice-planner/RinkBoard.tsx \
  components/features/practice-planner/ElementInspector.tsx lib/data/starter-plays.ts
rg -n 'document\.|window\.|from "react"|@mui|from "next' lib/utils/canvas/line-editing.ts lib/utils/canvas/stroke-geometry.ts
rg -n 'from "next/|@/lib/actions|@/lib/db|@/lib/auth|@prisma/client' \
  components/features/practice-planner/useStrokeEditing.ts components/features/practice-planner/useBoardTouch.ts
wc -l components/features/practice-planner/RinkBoard.tsx
```

Expected:
- `check:raw-sql` and `adr:lint` exit 0;
- `adr:check` lists the ADRs governing these paths (ADR-0020, the static planner, among them) with no violation. No ADR needs amending: the play schema and plan format are unchanged and the new code is portable. If `adr:check` names an ADR this change contradicts, stop and report instead of editing the ADR;
- both `rg` searches print nothing;
- `RinkBoard.tsx` is at or under 1057 lines.

- [ ] **Step 5: Hygiene of the branch**

```bash
/usr/bin/git diff main --name-only | xargs rg -n --no-heading '/Use[r]s/|/priv[a]te/tmp|scratc[h]pad/|sessio[n]_0' || true
/usr/bin/git status --short
```

Expected: the first command prints nothing (no local path or session id in any changed file; commit messages are not files). `git status` is clean. If `CLAUDE.md` shows as modified by `next dev`, leave it out of every commit.

- [ ] **Step 6: Screenshots of the board and the bench sheet**

Build and serve the static planner (Bash `run_in_background: true` for the preview):

```bash
bun run planner:build
bun run planner:preview --port 4199 --strictPort
```

In a local harness folder outside the repository (with `playwright` installed there), write `line-editing.mjs`:

```js
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

// OUT_DIR is the repository's .cache/line-editing (git-ignored)
const OUT = process.env.OUT_DIR;
mkdirSync(OUT, { recursive: true });
const shot = (name) => path.join(OUT, name);
const BASE = "http://localhost:4199/";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });

/** Screen point for rink feet on the drill board: createTransformContext's fit (20 px padding, whole rink). */
async function rink(canvas, x, y) {
  const box = await canvas.boundingBox();
  const scale = Math.min((box.width - 40) / 200, (box.height - 40) / 85);
  return { x: box.x + (box.width - 200 * scale) / 2 + x * scale, y: box.y + (box.height - 85 * scale) / 2 + y * scale };
}
async function press(page, p) { await page.mouse.move(p.x, p.y); await page.mouse.down(); }
async function glide(page, p) { await page.mouse.move(p.x, p.y, { steps: 12 }); }

for (const scheme of ["light", "dark"]) {
  for (const [w, h, tag] of [[1280, 1000, "desktop"], [390, 844, "mobile"]]) {
    const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.log("pageerror", e.message));
    await page.goto(BASE + "#/library/new");
    const canvas = page.locator("canvas").first();
    await canvas.waitFor();

    // A player to snap to
    await page.getByRole("button", { name: "player tool" }).click();
    await canvas.scrollIntoViewIfNeeded();
    const player = await rink(canvas, 60, 30);
    await page.mouse.click(player.x, player.y);

    // A straight line drawn toward the player: the ring marks the snap before release
    await page.getByRole("button", { name: "movement tool" }).click();
    await page.getByRole("button", { name: "Straight", exact: true }).click();
    await canvas.scrollIntoViewIfNeeded();
    await press(page, await rink(canvas, 130, 60));
    await glide(page, await rink(canvas, 63, 32));
    await page.waitForTimeout(200);
    await page.screenshot({ path: shot(`snap-ring-${tag}-${scheme}.png`) });
    await page.mouse.up();

    // Select the line: two end handles and a "+"
    await page.getByRole("button", { name: "select tool" }).click();
    await canvas.scrollIntoViewIfNeeded();
    const body = await rink(canvas, 109, 51);
    await page.mouse.click(body.x, body.y);
    await page.waitForTimeout(200);
    await page.screenshot({ path: shot(`handles-${tag}-${scheme}.png`) });

    // Drag the "+": a bend, drawn as a curve through it
    await press(page, await rink(canvas, 95, 45));
    await glide(page, await rink(canvas, 95, 72));
    await page.mouse.up();
    await page.waitForTimeout(200);
    await page.screenshot({ path: shot(`bent-${tag}-${scheme}.png`) });
    console.log(scheme, tag, "horizontal overflow px:", await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth));

    // A curved starter route (the stickhandling weave) on the printed bench sheet
    await page.goto(BASE + "#/import");
    await page.getByRole("button", { name: "Use template: Skills Stations" }).click();
    await page.getByRole("button", { name: /save to my practices/i }).click();
    await page.waitForURL(/#\/sessions\/[^/]+$/, { timeout: 20000 });
    await page.goto(page.url() + "/print");
    await page.getByRole("button", { name: "Print" }).waitFor({ timeout: 20000 });
    await page.waitForTimeout(1500);
    await page.emulateMedia({ media: "print" });
    await page.screenshot({ path: shot(`bench-${tag}-${scheme}.png`), fullPage: true });
    await ctx.close();
  }
}
await browser.close();
```

Run it from the harness folder with `CHROMIUM_PATH` set to the local Chromium headless shell and `OUT_DIR` set to the repository's `.cache/line-editing`: `node line-editing.mjs`.
Expected output: no `pageerror` line; every overflow is 0.

Read every PNG (`snap-ring-*`, `handles-*`, `bent-*`, `bench-*`, desktop and mobile, light and dark). Check all of these, then fix and re-run until they hold:
- `snap-ring`: a League Blue ring is centred on the player while the line's end is held near it, and the preview's end sits on the player.
- `handles`: two white handles with an Action Blue outline at the ends and a filled Action Blue "+" at the midpoint, each about 14 px across; the gold selection highlight follows the line.
- `bent`: the line is a smooth curve through the dragged bend (no corner), its arrow head points along the curve's end, a bend handle sits on the bend and "+" handles sit on the curve between the points.
- Dark scheme: the ice is still light, and the handles and ring read clearly on it.
- `bench`: the stickhandling drill's weave route is a smooth curve on the printed sheet, and the defensive-zone outline in any drill that shows it keeps its corners.

Stop the preview server.

- [ ] **Step 7: Commit any gate fixes**

Only if Steps 1–6 required changes. Stage the exact files by path:

```bash
/usr/bin/git add <the files you changed>
/usr/bin/git commit -m "fix(practice-planner): <what the gate caught>" -m "$SESSION_TRAILER"
```

---

## Self-Review

**Spec coverage:**

| Spec item | Task |
|---|---|
| Success 1: handles at ends and bends, a "+" at each segment's midpoint | 2 (`lineHandles`), 4 (drawn on the selected line) |
| Success 2: drag the line, an end, a bend; drag a "+" to add a bend | 2 (`moveLine`, `moveLinePoint`, `insertBend`), 4 |
| Success 3: remove a bend by double-click / double-tap; Straighten removes all bends | 2 (`removeBend`, `isDoubleTap`, `straighten`), 5 |
| Success 4: bent lines draw as smooth curves on the board, thumbnails, bench sheet, exports and legend | 1 (`buildStrokeGeometry` is the one path for all of them), 7 (bench sheet screenshot) |
| Success 5: ends snap while drawing and while dragging an end; ring; Alt skips | 2 (`findSnapTarget`), 6 |
| Success 6: one undo step per edit; touch-sized handles; pinch still works | 4 (history, touch, second finger), 5 (double-tap undo, Straighten undo), 3 (pinch unchanged) |
| Success 7: existing plays look the same; no schema or plan-file change | 1 (legacy snapshot), Global Constraints (no schema change); see the ruling on multi-point straight lines below |
| R1: bends are extra points; at most 6 by editing; versions unchanged | 2 (`MAX_LINE_BENDS`, `insertBend`), Global Constraints |
| R2: centripetal Catmull-Rom for ≥ 3 points; 2-point unchanged; freehand unchanged; ends along the final tangent; a 2-point test | 1 |
| R3 handle positions, freehand anchors (DP, ≤ 8, first drag simplifies, moves never do) | 2, 4 |
| R3 hit testing: handles first, then the line body, then other elements; 22 px radius; only the selected line | 4 (`press` before `hitTest`; `lineHandles` only for the selected id) |
| R3 drags: 4 px threshold, kept inside the area, whole-line clamp keeps the shape, live preview, one entry on release | 2 (`moveLine`), 4 |
| R3 remove a bend (300 ms, hit radius, not ends); Straighten / Make straight as one `updateElement` | 2, 5 |
| R3 keyboard: Delete/Backspace still delete a selected line | unchanged code; covered by the existing keyboard tests in `RinkBoard.test.tsx` |
| R4 when, when not, targets, radius, ties, ring, Alt, no attachment | 2, 6 |
| R5 pure helpers in `line-editing.ts`, same reference when unchanged; hook `useStrokeEditing.ts`; RinkBoard ≤ 1057 with a test; handle and ring drawing in `drawing-utils.ts` with passed-in colours | 2, 3, 4, 6 |
| R6 7 px handles, 22 px hit area; second finger cancels; 3:1 colours in both schemes | 4 (radius test, second-finger and touchcancel tests, contrast test), 7 (dark screenshots) |
| Testing: pure helpers list | 2 |
| Testing: rendering (2-point unchanged, 3-point through the middle point, arrow on the end tangent) | 1 |
| Testing: board, mouse and touch (select, drag end, add bend, remove by double-click, move, undo/redo, snap and Alt, second finger, budget) | 3, 4, 5, 6 |
| Testing: inspector (Straighten, Make straight) | 5 |
| Testing: visual (light and dark, desktop and phone; handles, bent line, ring, bench sheet) | 7 |
| Out of scope (attachment, grid, multi-select, nudging, editing in exports/print) | not touched |

**Spec gaps and conflicts, and how this plan rules on them:**
- **R2 against success criterion 7 (existing plays look the same).** The spec's Context says straight lines are stored as exactly 2 points, which holds for every line the editor draws (`finishStroke`). It does not hold for 16 starter strokes (`bo-c-route`, `wv-f1-route`, `wv-f2-route`, `wv-f3-route`, `dz-house`, `rg-c-route`, `ga-g-shuffle`, `pt-wrap`, `ph-rim-pass`, `ph-wall-pass`, `bk-carry`, `bk-deke`, `ec-figure-eight`, `pr-carry`, `sa-f2-carry`, `st-weave`), nor for v1 plays upgraded through `strokeFromV1Type` (a v1 line or arrow may carry any number of points). R2 is explicit that a straight line with ≥ 3 points is a curve, so this plan scopes criterion 7 to lines the editor could produce (2-point straight and freehand), pins those byte for byte, and accepts that multi-point starter routes and upgraded v1 lines now draw as curves. The routes are meant as curves; their sampled curves were checked to stay inside the rink (Task 1 test). Copies of starter plays already saved in hosted libraries, or already seeded into a static planner's library, keep their stored points and will also draw curved.
- **`dz-house`** is a zone outline with real corners, so Task 1 splits it into four 2-point `zoneLine`s, and a starter test keeps any multi-point straight `line` action out of the catalog. Saved copies of the old outline will draw as a rounded shape (accepted; Straighten or redrawing fixes a copy).
- **Lines with more than 8 points** (the starter `ec-figure-eight` has 16; v1 upgrades can have any number): a bend handle on every interior point, no "+" handles, `insertBend` refuses, Straighten works. The 6-bend cap applies to adding bends, not to stored data.
- **Hit testing a bent line** is done against its drawn curve (`strokeCenterline`), not the chords between its points, so a press on the visible curve selects it. Freehand and 2-point lines keep today's hit test.
- **The "+" position** ("at the midpoint of each segment, in both point space and drawn curve"): the handle sits on the drawn curve at the segment's parameter midpoint (`curvePoint(points, i, 0.5)`), which is the plain midpoint for a 2-point line.
- **Freehand lines** get no "+" handles (R3 lists "+" handles under the straight-line positions), and their anchors can't be removed by double-tap (R3 says a *bend* handle). Anchors come from a greedy Douglas–Peucker pass capped at 8 points, which R3 names explicitly over "evenly spaced".
- **Hit order** "handles, then the line body, then other elements" is read as: the selected line's handles, then the selected line's body, then the existing `hitTest` order for everything else. So a press on the selected line moves it even where a player overlaps it.
- **Handle colours "from the theme" with 3:1 in light and dark modes:** the board's ice is drawn `#E8F4F8` in both schemes, so the dark scheme's lightened blues would fail on it (`#42A5F5` is about 2.4:1). `LINE_EDIT_COLORS` uses the light-scheme `secondary.main` and `primary.main`, asserted equal to the theme and checked for contrast in a test.
- **Selection highlight:** it now follows the drawn centerline, which also makes a freehand line's highlight follow its smoothed curve instead of its raw points (a visual improvement, not a data change).
- **Handle drags keep the press offset** (as element drags do), so a press up to 22 px from a handle doesn't make the point jump.
- **Whole-line moves of a line outside or larger than the area:** once a drag starts, the move is clamped so the line ends up inside the area (a tap never moves it); along an axis on which the line is longer than the area it does not move. Snap targets outside the area are skipped, because the snapped point is clamped into the area.
- **Double-click and double-tap** are one rule: two presses on the same bend within 300 ms (`Date.now()`) and the hit radius. The browser's `dblclick` event is not used.
- **Alt/Option** is read from each mouse event of the gesture, so pressing or releasing it mid-gesture takes effect on the next move; touch has no Alt.

**Placeholder scan:** none. Every code step carries the code. Steps that edit `RinkBoard.tsx` quote the exact old text and show the new text. The only `<…>` text is `<N>` in Task 3's commit body (the measured line count) and the gate-fix commit template in Task 7. `SESSION_TRAILER`, `CHROMIUM_PATH` and `OUT_DIR` are read from the environment on purpose.

**Type consistency:**
- `LineHandle` (Task 2) is what `lineHandles` returns, what `hitTestLineHandle` takes and returns, what `drawLineHandles` draws (Task 4) and what the hook's `Gesture.handle` holds (Tasks 4–6).
- `moveLinePoint(stroke, index, to, rect)`, `moveLine(stroke, delta, rect)`, `insertBend(stroke, segment, at, rect)`, `removeBend(stroke, index)`, `straighten(stroke)` (Task 2) are called with those argument orders in `useStrokeEditing.ts` (Tasks 4–6) and `ElementInspector.tsx` (Task 5).
- `findSnapTarget(data, point, SnapOptions)` and `snapRadiusFt(minHitRadiusFt)` (Task 2) are used by `snapLineEnd` and `move` (Task 6) and by RinkBoard's stroke case (Task 6).
- `TapRecord` and `isDoubleTap(previous, next, radiusFt)` (Task 2) are used by `press` (Task 5).
- `LinePress` gains `time` in Task 5 and `LineMove` gains `snapRadiusFt` and `bypassSnap` in Task 6; RinkBoard's calls are updated in the same tasks.
- `drawLineHandles(ctx, handles, transform, colors, zoom)` and `drawSnapRing(ctx, position, transform, color, zoom)` take the colours before the zoom everywhere they are called and tested.
- `replaceDrawing(data, stroke)` (Task 2) is used by the hook's commit paths and RinkBoard's preview render (Task 4).
- `useBoardTouch`'s `onAbandon` (Task 3) is RinkBoard's `abandonTransientInteraction`, which calls the hook's `cancel` from Task 4 on.

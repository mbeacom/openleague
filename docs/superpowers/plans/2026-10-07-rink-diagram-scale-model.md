# Rink Diagram Scale Model (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every size the rink renderer draws (strokes, arrowheads, stop bars, glyph outlines, rink markings, note padding) is proportional to the rink, so a drill looks the same from a sidebar card to a printed page, and the editing board at its usual size looks exactly as it does today.

**Architecture:** One pure module, `lib/utils/canvas/scale.ts`, converts "pixels on the reference board" into pixels at any scale: `refPx(px, pxPerFt) = px × pxPerFt ÷ 3.8`, floored at a small legibility minimum. Every hard-coded pixel size in the renderer goes through it. The reference is 3.8 px/ft, the scale of the 800×400 board, so the board is unchanged (the existing legacy geometry snapshot, which must never be updated, guards this) and every other surface scales in proportion.

**Tech Stack:** TypeScript, Canvas 2D, Vitest (canvas contexts are mocked or recorded; no pixel tests).

**Spec:** `docs/superpowers/specs/2026-10-06-rink-diagram-quality-design.md` §2 (Scale model). Phase 1 (resolution) shipped in #421.

## Global Constraints

- Reference scale: `REFERENCE_PX_PER_FT = 3.8` (an 800×400 board showing the whole rink: (800 − 2·20) ÷ 200). This refines the spec's provisional 4: at 3.8 the board's geometry is byte-identical to today.
- `__tests__/lib/utils/canvas/__snapshots__/stroke-geometry.legacy.test.ts.snap` must not change. Never run Vitest with `-u` on it. A diff there means existing drills look different on the board.
- Legibility floor: `MIN_LINE_PX = 1` (CSS px, so at least 1 device px at every pixel ratio).
- Stored data does not change meaning: `strokeWidth` stays a number in "px on the reference board"; no migration, no schema change.
- No new dependency. `lib/utils/canvas/` stays free of server and Next imports.
- Glyph minimum radius (`MIN_GLYPH_RADIUS_PX = 8`) applies on the board only (it keeps markers grabbable). Thumbnail-style diagrams use `THUMBNAIL_MIN_GLYPH_RADIUS_PX = 1.5`, enough to keep a puck visible.
- Always `bun`. Before each commit: `bun run type-check`, `bun run lint` (no new warnings), and the touched tests.
- Commits end with the session attribution line the harness supplies.

## Review Focus

1. **A drill drawn with a thick stroke (strokeWidth 20, the maximum) on a tiny diagram:** the line must not swallow the rink. Its width scales down with the diagram, like everything else. Pinned in Task 2.
2. **A zoomed-in edit viewport (a drill with a small custom area fills the board, about 13 px/ft):** strokes, arrowheads and outlines grow with the markers. That's the point of the change, not a bug. Pinned in Task 3's proportion test at 9.5 px/ft.
3. **A context without `getTransform` (tests, old browsers):** pixel snapping must skip quietly and draw the line unsnapped. Pinned in Task 5.
4. **A rotated or skewed transform:** snapping must not move the line. Pinned in Task 5.
5. **Legend swatches:** they must show the board's look (dash lengths, wave and tick spacing, arrowheads) at 40×20, not floor-bound stubs. Pinned in Task 2.

---

## File Structure

| File | Responsibility |
|---|---|
| Create `lib/utils/canvas/scale.ts` | `REFERENCE_PX_PER_FT`, `MIN_LINE_PX`, `refPx`, `snapLineX` |
| Modify `lib/utils/canvas/stroke-geometry.ts` | Line width via `refPx`; pattern floors become `MIN_LINE_PX` |
| Modify `lib/utils/canvas/legend-swatch.ts` | Swatches drawn at the reference scale |
| Modify `lib/utils/canvas/drawing-utils.ts` | Arrowhead, stop bar and selection highlight via `refPx`; glyph minimum as an option; note padding via `refPx` |
| Modify `lib/utils/canvas/glyph-metrics.ts` | `glyphRadiusPx` takes the minimum as a parameter |
| Modify `lib/utils/canvas/glyphs.ts` | Outline floors scale; labels size continuously |
| Modify `lib/utils/canvas/thumbnail-generator.ts` | Thumbnail scene passes `THUMBNAIL_MIN_GLYPH_RADIUS_PX` |
| Modify `lib/utils/canvas/rink-renderer.ts` | Boards, circles and creases via `refPx`; vertical lines snapped |
| Modify `docs/superpowers/specs/2026-10-06-rink-diagram-quality-design.md` | §2 updated to the reference-scale rule |

---

### Task 1: The scale module, and the spec's §2 brought up to date

**Files:**
- Create: `lib/utils/canvas/scale.ts`
- Modify: `docs/superpowers/specs/2026-10-06-rink-diagram-quality-design.md` (§2)
- Test: `__tests__/lib/utils/canvas/scale.test.ts`

**Interfaces:**
- Produces:
  - `REFERENCE_PX_PER_FT = 3.8`
  - `MIN_LINE_PX = 1`
  - `refPx(px: number, pxPerFt: number, floorPx: number = MIN_LINE_PX): number`: `max(px × pxPerFt ÷ REFERENCE_PX_PER_FT, floorPx)`, computed as `px * (pxPerFt / REFERENCE_PX_PER_FT)` so the reference scale returns `px` exactly
  - `snapLineX(ctx: CanvasRenderingContext2D, x: number, lineWidth: number): number`: the x (in the context's user space) that puts a vertical line of `lineWidth` on whole device pixels; returns `x` unchanged when the context has no `getTransform`, or the transform rotates or skews

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/lib/utils/canvas/scale.test.ts
import { describe, expect, it } from "vitest";
import { MIN_LINE_PX, REFERENCE_PX_PER_FT, refPx, snapLineX } from "@/lib/utils/canvas/scale";

describe("refPx", () => {
    it("returns the reference size exactly at the reference scale", () => {
        expect(refPx(2, REFERENCE_PX_PER_FT)).toBe(2);
        expect(refPx(3, 3.8)).toBe(3);
        expect(refPx(10, 3.8)).toBe(10);
    });

    it("scales in proportion to px per foot", () => {
        expect(refPx(2, 7.6)).toBeCloseTo(4);
        expect(refPx(4, 1.9)).toBeCloseTo(2);
    });

    it("never goes below the floor", () => {
        expect(refPx(2, 0.38)).toBe(MIN_LINE_PX);
        expect(refPx(10, 0.38, 4)).toBe(4);
    });
});

describe("snapLineX", () => {
    const ctxWith = (m: { a: number; b: number; c: number; d: number; e: number; f: number }) =>
        ({ getTransform: () => m }) as unknown as CanvasRenderingContext2D;

    it("centers an odd-device-width line on a half device pixel", () => {
        // ratio 1: a 1 px line at x = 75.3 snaps to 75.5
        expect(snapLineX(ctxWith({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }), 75.3, 1)).toBeCloseTo(75.5);
    });

    it("centers an even-device-width line on a whole device pixel", () => {
        // ratio 2: a 1 px (2 device px) line at x = 75.3 → device 150.6 → 151 → 75.5
        expect(snapLineX(ctxWith({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 }), 75.3, 1)).toBeCloseTo(75.5);
        // ratio 1, 2 px line at 75.3 → 75
        expect(snapLineX(ctxWith({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }), 75.3, 2)).toBeCloseTo(75);
    });

    it("accounts for the transform's translation", () => {
        // ratio 2 with a 10.25 px pan: device x = 2·75.3 + 10.25 = 160.85 → 161 (even width) → (161 − 10.25) / 2
        expect(snapLineX(ctxWith({ a: 2, b: 0, c: 0, d: 2, e: 10.25, f: 0 }), 75.3, 1)).toBeCloseTo(75.375);
    });

    it("leaves x alone without getTransform, or under a rotation or skew", () => {
        expect(snapLineX({} as CanvasRenderingContext2D, 75.3, 1)).toBe(75.3);
        expect(snapLineX(ctxWith({ a: 1, b: 0.5, c: 0, d: 1, e: 0, f: 0 }), 75.3, 1)).toBe(75.3);
        expect(snapLineX(ctxWith({ a: 1, b: 0, c: 0.5, d: 1, e: 0, f: 0 }), 75.3, 1)).toBe(75.3);
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test __tests__/lib/utils/canvas/scale.test.ts`
Expected: FAIL, cannot resolve `@/lib/utils/canvas/scale`.

- [ ] **Step 3: Implement**

```ts
// lib/utils/canvas/scale.ts
/**
 * The renderer's scale model (rink diagram quality spec §2). Sizes are given
 * as "pixels on the reference board", the 800×400 board showing the whole
 * rink (3.8 px per foot), and drawn in proportion to the rink at any other
 * scale, so a drill looks the same from a sidebar card to a printed page and
 * the board itself is unchanged. No server or Next imports.
 */

/** Pixels per foot on the reference board: (800 − 2·20 padding) ÷ 200 ft. */
export const REFERENCE_PX_PER_FT = 3.8;

/** The thinnest line drawn (CSS px, so at least one device pixel at any ratio). */
export const MIN_LINE_PX = 1;

/** A size that is `px` on the reference board, at `pxPerFt`, never below `floorPx`. Exact at the reference scale. */
export function refPx(px: number, pxPerFt: number, floorPx: number = MIN_LINE_PX): number {
    return Math.max(px * (pxPerFt / REFERENCE_PX_PER_FT), floorPx);
}

/**
 * The x, in the context's user space, that puts a vertical line of `lineWidth`
 * on whole device pixels: an odd device width is centered on a half pixel, an
 * even one on a whole pixel. Unchanged when the context can't report its
 * transform, or the transform rotates or skews.
 */
export function snapLineX(ctx: CanvasRenderingContext2D, x: number, lineWidth: number): number {
    if (typeof ctx.getTransform !== "function") return x;
    const m = ctx.getTransform();
    if (m.b !== 0 || m.c !== 0 || m.a <= 0) return x;
    const deviceX = m.a * x + m.e;
    const deviceWidth = Math.max(1, Math.round(lineWidth * m.a));
    const snapped = deviceWidth % 2 === 1 ? Math.floor(deviceX) + 0.5 : Math.round(deviceX);
    return (snapped - m.e) / m.a;
}
```

- [ ] **Step 4: Run it**

Run: `bun run test __tests__/lib/utils/canvas/scale.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the spec's §2**

In `docs/superpowers/specs/2026-10-06-rink-diagram-quality-design.md`, replace the body of `### 2. Scale model (phase 2)` with:

```markdown
Everything is sized in proportion to the rink, with a 1 px legibility floor. No
stored value changes meaning.

The rule: every size the renderer used to draw in fixed pixels is now "pixels on
the reference board" (`REFERENCE_PX_PER_FT = 3.8`, the 800×400 board showing the
whole rink), converted at the current scale by `refPx(px, pxPerFt) = px ×
pxPerFt ÷ 3.8`. The board at that size is unchanged (the legacy geometry
snapshot guards it); smaller diagrams scale down and print scales up.

- **Strokes.** A stored `strokeWidth` keeps its value and means "px on the
  reference board". A width-2 stroke is 2 px on the board, about 0.74 px
  (floored to 1) on a 300 px thumbnail and about 1.9 px in print.
- **Arrowheads** are `max(refPx(10), 5 × line width)` long, floored at 4 px.
  The stop bar is 1.8 ft each side of the tip (floor 2 px), and the selection
  highlight is the line width plus `refPx(4)`.
- **Patterns** (carry wave, lateral zigzag, pass dashes, shot rails, backskate
  ticks) keep their sizes in feet; their old pixel floors become the 1 px floor.
  Legend swatches draw at the reference scale, so they show the board's look.
- **Rink markings.** The red and blue lines stay 1 ft wide. Boards (3 px),
  circles and creases (2 px) become `refPx(3)` and `refPx(2)`. Vertical lines
  snap to the device pixel grid when the transform allows.
- **Glyphs** keep `PLAYER_RADIUS_FT = 6`. Outline floors scale with `refPx`;
  the 8 px minimum radius stays on the board only, and thumbnail-style diagrams
  use a 1.5 px minimum so a puck stays visible.
- **Text.** Labels size continuously from the marker radius (no integer
  flooring; `fitText` shrinks by 0.5 px steps). Note box padding uses `refPx`.
```

- [ ] **Step 6: Commit**

```bash
git add lib/utils/canvas/scale.ts __tests__/lib/utils/canvas/scale.test.ts docs/superpowers/specs/2026-10-06-rink-diagram-quality-design.md
git commit -m "feat(practice-planner): add the rink renderer's scale model"
```

---

### Task 2: Strokes and their patterns in proportion; legend swatches at the reference scale

**Files:**
- Modify: `lib/utils/canvas/stroke-geometry.ts` (`ft` helper ~line 26; `buildStrokeGeometry` ~157-239)
- Modify: `lib/utils/canvas/legend-swatch.ts` (`SWATCH_PX_PER_FT` ~line 16)
- Test: `__tests__/lib/utils/canvas/stroke-geometry.test.ts`, `__tests__/lib/utils/canvas/legend-swatch.test.ts` (create it if no swatch test file exists: `ls __tests__/lib/utils/canvas | grep -i swatch`), and the unchanged legacy snapshot test

**Interfaces:**
- Consumes: `refPx`, `MIN_LINE_PX`, `REFERENCE_PX_PER_FT` (Task 1)
- Produces: `buildStrokeGeometry(stroke, pxPerFt).lineWidth` is `refPx(strokeWidth, pxPerFt)` (× 0.75 for `line`); signature unchanged

- [ ] **Step 1: Write the failing tests**

Add to `__tests__/lib/utils/canvas/stroke-geometry.test.ts`:

```ts
describe("stroke sizes in proportion to the rink (scale model)", () => {
    const straight = (action: StrokeAction, strokeWidth: number) =>
        ({ action, path: "straight" as const, end: "none" as const, points: [{ x: 0, y: 0 }, { x: 400, y: 0 }], strokeWidth });

    it("keeps a stroke's width on the reference board, and scales it elsewhere", () => {
        expect(buildStrokeGeometry(straight("skate", 2), 3.8).lineWidth).toBe(2);
        expect(buildStrokeGeometry(straight("skate", 2), 7.6).lineWidth).toBeCloseTo(4);
        expect(buildStrokeGeometry(straight("line", 2), 7.6).lineWidth).toBeCloseTo(3);
    });

    it("scales the thickest stroke down on a small diagram instead of swallowing the rink", () => {
        // 300 px thumbnail: (300 − 20) ÷ 200 = 1.4 px/ft; a width-20 stroke is 20 · 1.4/3.8 ≈ 7.4 px, not 20.
        expect(buildStrokeGeometry(straight("skate", 20), 1.4).lineWidth).toBeCloseTo(7.37, 1);
    });

    it("never draws a line thinner than 1 px", () => {
        expect(buildStrokeGeometry(straight("skate", 2), 0.5).lineWidth).toBe(1);
    });

    it("sizes pass dashes in feet, with only the 1 px floor, so a small diagram keeps their rhythm", () => {
        // 1 px/ft: dash 2.5 px, gap 1.5 px (the old floors, 4 and 3 px, would have stretched them).
        const g = buildStrokeGeometry(straight("pass", 2), 1);
        const first = g.polylines[0];
        const dashLength = Math.hypot(first[first.length - 1].x - first[0].x, first[first.length - 1].y - first[0].y);
        expect(dashLength).toBeLessThan(3.5);
        expect(g.polylines.length).toBeGreaterThan(80); // 400 px of 4 px cycles
    });
});
```

Make sure `StrokeAction` is imported in that file (`import type { StrokeAction } from "@/types/practice-planner";`), adding it to an existing import if one exists.

Create or extend the swatch test:

```ts
// __tests__/lib/utils/canvas/legend-swatch.test.ts
import { describe, expect, it, vi } from "vitest";
import { paintLegendSwatch } from "@/lib/utils/canvas/legend-swatch";

function recordingCtx() {
    const calls: Array<{ name: string; args: unknown[] }> = [];
    const target: Record<string, unknown> = {};
    const ctx = new Proxy(target, {
        get: (t, prop) => (typeof prop === "string" && prop in t ? t[prop] : (...args: unknown[]) => { calls.push({ name: String(prop), args }); return { width: 10 }; }),
        set: (t, prop, value) => { if (typeof prop === "string") t[prop] = value; return true; },
    }) as unknown as CanvasRenderingContext2D;
    return { ctx, calls, target };
}

describe("legend swatches", () => {
    it("draw strokes at the reference board's scale: a 2 px pass line in about two dashes, not floor-bound stubs", () => {
        const { ctx, calls, target } = recordingCtx();
        paintLegendSwatch(ctx, { type: "action", action: "pass", label: "Pass" } as never);
        expect(target.lineWidth).toBe(2);
        // 30 px of line at 3.8 px/ft: 9.5 px dashes with 5.7 px gaps, so 2 dashes (the old 0.5 px/ft floors gave 5).
        expect(calls.filter((c) => c.name === "beginPath").length).toBeLessThanOrEqual(4);
    });
});
```

Before running, check `buildLegend`'s entry shape in `lib/utils/canvas/legend.ts` and replace the `as never` literal with a real entry (for example, `buildLegend(playDataWithAPass)[0]`) if the shape differs.

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test __tests__/lib/utils/canvas/stroke-geometry.test.ts __tests__/lib/utils/canvas/legend-swatch.test.ts`
Expected: FAIL (line width equals the stored width at every scale; the floors stretch dashes; swatch is floor-bound).

- [ ] **Step 3: Implement**

In `lib/utils/canvas/stroke-geometry.ts`:

```ts
import { MIN_LINE_PX, refPx } from "./scale";

/** A pattern size in feet at this scale, never below the 1 px floor. */
const ft = (feet: number, pxPerFt: number) => Math.max(feet * pxPerFt, MIN_LINE_PX);
```

Replace the old three-argument `ft` with this, and drop the third argument at every call in `buildStrokeGeometry` (`ft(1.0, pxPerFt, 1.5)` → `ft(1.0, pxPerFt)`, and so on for the wave, zigzag, dashed, double and ticks cases). Then replace the line-width line:

```ts
    // Stored widths are px on the reference board (scale model); drawn in proportion here.
    const width = refPx(stroke.strokeWidth, pxPerFt);
    const lineWidth = pattern === "thin" ? width * 0.75 : width;
```

In `lib/utils/canvas/legend-swatch.ts`:

```ts
import { REFERENCE_PX_PER_FT } from "./scale";

// Swatches are drawn at the reference board's scale, so they show the board's look.
const SWATCH_PX_PER_FT = REFERENCE_PX_PER_FT;
```

- [ ] **Step 4: Run the canvas tests, including the legacy snapshot**

Run: `bun run test __tests__/lib/utils/canvas`
Expected: PASS, and `stroke-geometry.legacy.test.ts` passes **with no snapshot written or obsolete** (at 3.8 px/ft every pattern size is above its old floor, and the width is exact). If the legacy test fails, the change altered the board: fix the code, never the snapshot. Update other existing assertions only where they pinned a floor below the reference scale; ledger each one.

- [ ] **Step 5: Commit**

```bash
git add lib/utils/canvas/stroke-geometry.ts lib/utils/canvas/legend-swatch.ts __tests__/lib/utils/canvas
git commit -m "feat(practice-planner): draw strokes in proportion to the rink"
```

---

### Task 3: Arrowheads, stop bars and the selection highlight in proportion

**Files:**
- Modify: `lib/utils/canvas/drawing-utils.ts` (`paintStrokeGeometry` stop bar ~78-86; `drawArrowHead` ~97-129; `drawElement` selection ~240-244)
- Test: `__tests__/lib/utils/canvas/drawing-utils.test.ts`

**Interfaces:**
- Consumes: `refPx` (Task 1); `buildStrokeGeometry` (Task 2)
- Produces: `ARROW_MIN_PX = 4`; `paintStrokeGeometry(ctx, geometry, color, pxPerFt)` unchanged in signature

- [ ] **Step 1: Write the failing tests**

Add to `__tests__/lib/utils/canvas/drawing-utils.test.ts` (it already has `recordingCtx` and `Call`):

```ts
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
});
```

Import `buildStrokeGeometry` from `@/lib/utils/canvas/stroke-geometry` and `paintStrokeGeometry` from `@/lib/utils/canvas/drawing-utils` if the file doesn't already.

Add a selection-highlight test next to the existing `drawElement` tests:

```ts
it("sizes the selection highlight in proportion: the line plus 4 reference px", () => {
    const ctx = mockCtx();
    const element = { id: "s", action: "skate" as const, path: "straight" as const, end: "none" as const, points: [{ x: 20, y: 40 }, { x: 120, y: 40 }], color: "#000", strokeWidth: 2 };
    const zoomed = createTransformContext(800, 400, 20, { x: 95, y: 25, w: 30, h: 30 }); // well above 3.8 px/ft
    const pxPerFt = Math.min(zoomed.scaleX, zoomed.scaleY);
    const widths: number[] = [];
    Object.defineProperty(ctx, "lineWidth", { set: (v: number) => widths.push(v), get: () => widths.at(-1) ?? 1 });
    drawElement(ctx, element as never, zoomed, true);
    expect(widths[0]).toBeCloseTo((2 + 4) * (pxPerFt / 3.8));
});
```

If `mockCtx()` lacks a method `drawElement` calls (for example `save`), add it as `vi.fn()` inside this test's context object.

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test __tests__/lib/utils/canvas/drawing-utils.test.ts`
Expected: the proportion and floor tests FAIL (the arrowhead is a fixed 10 px minimum; the highlight is `strokeWidth + 4` px). The reference test may already pass.

- [ ] **Step 3: Implement**

In `lib/utils/canvas/drawing-utils.ts`:

```ts
import { refPx } from "./scale";

/** The shortest arrowhead drawn, so a tiny diagram's arrows still read as arrows. */
export const ARROW_MIN_PX = 4;
```

Change the arrow branch in `paintStrokeGeometry` to pass the scale, and the stop bar to a 2 px floor:

```ts
    if (type === "arrow") {
        const from = { x: tip.x - Math.cos(angle), y: tip.y - Math.sin(angle) };
        drawArrowHead(ctx, from, tip, color, geometry.lineWidth, pxPerFt);
    } else {
        const half = Math.max(1.8 * pxPerFt, 2);
```

and in `drawArrowHead` add the `pxPerFt: number` parameter (update the JSDoc) and replace the length line:

```ts
    // 10 px, or 5 line widths, on the reference board; in proportion elsewhere (scale model).
    const headLength = Math.max(refPx(10, pxPerFt, ARROW_MIN_PX), strokeWidth * 5);
```

(`strokeWidth` here is already the scaled `geometry.lineWidth`.)

In `drawElement`, replace `ctx.lineWidth = element.strokeWidth + 4;` with:

```ts
        ctx.lineWidth = refPx(element.strokeWidth + 4, Math.min(transform.scaleX, transform.scaleY));
```

- [ ] **Step 4: Run the canvas and practice-planner tests**

Run: `bun run test __tests__/lib/utils/canvas __tests__/components/features/practice-planner`
Expected: PASS; the legacy snapshot unchanged.

- [ ] **Step 5: Commit**

```bash
git add lib/utils/canvas/drawing-utils.ts __tests__/lib/utils/canvas/drawing-utils.test.ts
git commit -m "feat(practice-planner): size arrowheads, stop bars and selection in proportion"
```

---

### Task 4: Glyphs in proportion: outlines, the minimum radius off the board, continuous labels

**Files:**
- Modify: `lib/utils/canvas/glyph-metrics.ts` (`glyphRadiusPx`)
- Modify: `lib/utils/canvas/glyphs.ts` (`fitText`, `drawPlayerGlyph`, `drawEquipmentGlyph`)
- Modify: `lib/utils/canvas/drawing-utils.ts` (`drawPlayerIcon`, `drawEquipmentItem`, `drawAllElements`, `BoardSceneOptions`, `drawBoardScene`)
- Modify: `lib/utils/canvas/thumbnail-generator.ts` (`drawThumbnailScene`)
- Test: `__tests__/lib/utils/canvas/glyphs.test.ts`, `__tests__/lib/utils/canvas/drawing-utils.test.ts`, `__tests__/lib/utils/canvas/thumbnail-generator.test.ts`

**Interfaces:**
- Consumes: `refPx`, `REFERENCE_PX_PER_FT`, `MIN_LINE_PX` (Task 1)
- Produces:
  - `glyphRadiusPx(radiusFt: number, pxPerFt: number, zoom = 1, minPx = MIN_GLYPH_RADIUS_PX): number`
  - `drawPlayerGlyph(ctx, player, c, r, isSelected, scale = 1)` and `drawEquipmentGlyph(ctx, item, c, r, isSelected, scale = 1)`, where `scale = pxPerFt / REFERENCE_PX_PER_FT`
  - `BoardSceneOptions.minGlyphRadiusPx?: number` (default `MIN_GLYPH_RADIUS_PX`)
  - `THUMBNAIL_MIN_GLYPH_RADIUS_PX = 1.5` (thumbnail-generator.ts)

- [ ] **Step 1: Write the failing tests**

`__tests__/lib/utils/canvas/glyphs.test.ts`, following the file's existing context mock:

```ts
describe("glyph outlines and labels (scale model)", () => {
    const player = { id: "p", role: "F" as const, label: "F1", color: "#1976D2", position: { x: 0, y: 0 } };

    it("keeps today's outline on the reference board", () => {
        const ctx = recordingGlyphCtx();
        drawPlayerGlyph(ctx, player, { x: 50, y: 50 }, 22.8, false, 1);
        expect(ctx.lineWidths[0]).toBeCloseTo(22.8 * 0.12);
    });

    it("scales the outline floor with the diagram, down to 1 px", () => {
        const ctx = recordingGlyphCtx();
        // A 300 px thumbnail: r = 6 ft · 1.4 = 8.4 px; 8.4 · 0.12 ≈ 1.0, and the old 1.5 px floor no longer applies.
        drawPlayerGlyph(ctx, player, { x: 50, y: 50 }, 8.4, false, 1.4 / 3.8);
        expect(ctx.lineWidths[0]).toBeCloseTo(1.008, 2);
    });

    it("sizes the label from the radius without rounding it down to a whole pixel", () => {
        const ctx = recordingGlyphCtx();
        drawPlayerGlyph(ctx, player, { x: 50, y: 50 }, 10, false, 1);
        expect(ctx.fonts[0]).toContain("10.5px");
    });
});
```

where `recordingGlyphCtx` is added at the top of the test file:

```ts
function recordingGlyphCtx() {
    const lineWidths: number[] = [];
    const fonts: string[] = [];
    const ctx = {
        lineWidths,
        fonts,
        beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(), stroke: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(),
        fillRect: vi.fn(), fillText: vi.fn(), save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(), rect: vi.fn(),
        measureText: (text: string) => ({ width: text.length * 4 }),
        set lineWidth(v: number) { lineWidths.push(v); },
        get lineWidth() { return lineWidths.at(-1) ?? 1; },
        set font(v: string) { fonts.push(v); },
        get font() { return fonts.at(-1) ?? ""; },
        fillStyle: "", strokeStyle: "", textAlign: "", textBaseline: "",
    };
    return ctx as unknown as CanvasRenderingContext2D & { lineWidths: number[]; fonts: string[] };
}
```

`__tests__/lib/utils/canvas/drawing-utils.test.ts`:

```ts
describe("glyph minimum radius (scale model)", () => {
    it("keeps the 8 px minimum on the board, and uses the given minimum elsewhere", () => {
        expect(glyphRadiusPx(EQUIPMENT_RADIUS_FT.puck, 1.4)).toBe(8);
        expect(glyphRadiusPx(EQUIPMENT_RADIUS_FT.puck, 1.4, 1, 1.5)).toBe(1.5);
        expect(glyphRadiusPx(PLAYER_RADIUS_FT, 1.4, 1, 1.5)).toBeCloseTo(8.4);
    });
});
```

`__tests__/lib/utils/canvas/thumbnail-generator.test.ts` (it mocks no canvas; use a recording context like the drawing-utils one, copied into this file; import `drawThumbnailScene`, and `createTransformContext`, `rinkToCanvas` from `@/lib/utils/canvas/rink-renderer`, and `createEmptyPlayData` from `@/lib/utils/play-data`). If the equipment glyph draws a puck with something other than `arc` (check `drawEquipmentGlyph`'s `puck` case), filter on that call instead:

```ts
it("draws a thumbnail's puck at its real size, not the board's 8 px minimum", () => {
    const calls: Array<{ name: string; args: unknown[] }> = [];
    const ctx = new Proxy({} as Record<string, unknown>, {
        get: (t, prop) => (typeof prop === "string" && prop in t ? t[prop] : (...args: unknown[]) => { calls.push({ name: String(prop), args }); return { width: 10 }; }),
        set: (t, prop, value) => { if (typeof prop === "string") t[prop] = value; return true; },
    }) as unknown as CanvasRenderingContext2D;
    // Away from every rink dot, so the only arc at this point is the puck's.
    const data = { ...createEmptyPlayData(), equipment: [{ id: "p", kind: "puck" as const, position: { x: 60, y: 30 }, rotation: 0 }] };
    drawThumbnailScene(ctx, data, 300, 128);
    const at = rinkToCanvas({ x: 60, y: 30 }, createTransformContext(300, 128, 10));
    const puckArcs = calls.filter((c) => c.name === "arc" && Math.abs((c.args[0] as number) - at.x) < 0.01 && Math.abs((c.args[1] as number) - at.y) < 0.01);
    expect(puckArcs.length).toBeGreaterThan(0);
    expect(Math.max(...puckArcs.map((c) => c.args[2] as number))).toBeLessThan(2); // 0.75 ft · 1.4 ≈ 1.05, floored to 1.5 — not 8
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test __tests__/lib/utils/canvas/glyphs.test.ts __tests__/lib/utils/canvas/drawing-utils.test.ts __tests__/lib/utils/canvas/thumbnail-generator.test.ts`
Expected: FAIL (no `scale` parameter; label is `10px`; no `minPx`; puck radius 8).

- [ ] **Step 3: Implement**

`lib/utils/canvas/glyph-metrics.ts`:

```ts
/**
 * `zoom` is the canvas scale applied on top of the user-space radius; `minPx`
 * (the board's 8 px by default) is divided by it so a glyph never renders
 * below it on screen. Thumbnail-style diagrams pass a much smaller minimum.
 */
export function glyphRadiusPx(radiusFt: number, pxPerFt: number, zoom: number = 1, minPx: number = MIN_GLYPH_RADIUS_PX): number {
    return Math.max(radiusFt * pxPerFt, minPx / zoom);
}
```

`lib/utils/canvas/glyphs.ts`:

```ts
import { MIN_LINE_PX } from "./scale";

/** An outline: a fraction of the radius, never below `floorPx` on the reference board (× scale) or 1 px. */
const outline = (r: number, fraction: number, floorPx: number, scale: number) => Math.max(r * fraction, floorPx * scale, MIN_LINE_PX);
```

- `fitText`: `size -= 1` → `size -= 0.5`.
- `drawPlayerGlyph(ctx, player, c, r, isSelected, scale = 1)`: `Math.max(1.5, r * 0.12)` → `outline(r, 0.12, 1.5, scale)`; `Math.max(2, r * 0.22)` → `outline(r, 0.22, 2, scale)`; `fitText(ctx, text, r * 1.6, Math.floor(r * 1.05))` → `fitText(ctx, text, r * 1.6, r * 1.05)`.
- `drawEquipmentGlyph(ctx, item, c, r, isSelected, scale = 1)`: `Math.max(1.5, r * 0.15)` → `outline(r, 0.15, 1.5, scale)`; `Math.max(2.5, r * 0.35)` → `outline(r, 0.35, 2.5, scale)`.

`lib/utils/canvas/drawing-utils.ts`:

- Import `MIN_GLYPH_RADIUS_PX` from `./glyph-metrics` and `REFERENCE_PX_PER_FT` from `./scale`.
- `drawPlayerIcon(ctx, player, transform, isSelected = false, zoom = 1, minGlyphRadiusPx = MIN_GLYPH_RADIUS_PX)`: pass `glyphRadiusPx(PLAYER_RADIUS_FT, pxPerFt, zoom, minGlyphRadiusPx)` and `pxPerFt / REFERENCE_PX_PER_FT` as the new last argument of `drawPlayerGlyph`.
- `drawEquipmentItem`: the same, with `EQUIPMENT_RADIUS_FT[item.kind]` and `drawEquipmentGlyph`.
- `drawAllElements(ctx, playData, transform, selectedId, zoom = 1, minGlyphRadiusPx = MIN_GLYPH_RADIUS_PX)`: pass it to both.
- `BoardSceneOptions`: add

```ts
    /** Smallest glyph radius in screen px (default the board's 8, which keeps markers grabbable) */
    minGlyphRadiusPx?: number;
```

  and in `drawBoardScene` pass `options.minGlyphRadiusPx ?? MIN_GLYPH_RADIUS_PX` to `drawAllElements`.

`lib/utils/canvas/thumbnail-generator.ts`:

```ts
/** Thumbnail-style diagrams aren't edited, so markers keep their real size; this only keeps a puck visible. */
export const THUMBNAIL_MIN_GLYPH_RADIUS_PX = 1.5;
```

and in `drawThumbnailScene` add `minGlyphRadiusPx: THUMBNAIL_MIN_GLYPH_RADIUS_PX` to the `drawBoardScene` options.

Hit-testing (`drawing-utils.ts` ~337) keeps the board minimum: leave it.

- [ ] **Step 4: Run the canvas and practice-planner tests**

Run: `bun run test __tests__/lib/utils/canvas __tests__/components/features/practice-planner`
Expected: PASS; legacy snapshot unchanged. Update existing glyph tests only where they pinned the integer label size or the fixed outline floor below the reference scale; ledger each.

- [ ] **Step 5: Commit**

```bash
git add lib/utils/canvas/glyph-metrics.ts lib/utils/canvas/glyphs.ts lib/utils/canvas/drawing-utils.ts lib/utils/canvas/thumbnail-generator.ts __tests__/lib/utils/canvas
git commit -m "feat(practice-planner): draw glyphs in proportion off the board"
```

---

### Task 5: Rink markings and note padding in proportion; straight lines on the pixel grid

**Files:**
- Modify: `lib/utils/canvas/rink-renderer.ts` (`drawBoards` ~361, `drawCenterRedLine` ~371, `drawBlueLines` ~387, `drawGoalLines` ~414, `drawCenterCircle` ~441, `drawFaceoffCircles` ~464, `drawGoalCreases` ~545)
- Modify: `lib/utils/canvas/drawing-utils.ts` (`drawTextAnnotation` padding ~200-215)
- Test: `__tests__/lib/utils/canvas/rink-renderer-markings.test.ts` (new), `__tests__/lib/utils/canvas/drawing-utils.test.ts`

**Interfaces:**
- Consumes: `refPx`, `snapLineX` (Task 1)
- Produces: no new exports

- [ ] **Step 1: Write the failing tests**

```ts
// __tests__/lib/utils/canvas/rink-renderer-markings.test.ts
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
        drawRink(ctx, createTransformContext(300, 128, 10), { cache: false }); // 1.4 px/ft
        const widths = strokeWidths(calls);
        expect(widths.some((w) => Math.abs(w - 3 * (1.4 / 3.8)) < 1e-9)).toBe(true); // boards ≈ 1.1
        expect(widths).not.toContain(3);
        expect(widths).not.toContain(2);
        expect(Math.min(...widths)).toBeGreaterThanOrEqual(1);
    });

    it("puts the vertical lines on the device pixel grid when the transform allows", () => {
        const { ctx, calls } = recordingCtx({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 });
        drawRink(ctx, createTransformContext(800, 400), { cache: false });
        // The 1 ft lines (3.8 px here): center red, two blue, two goal lines; the outline's straight runs are 3 px wide.
        const verticals = calls.filter((c, i) =>
            c.name === "moveTo" && Math.abs(c.lineWidth - 3.8) < 1e-9 &&
            calls[i + 1]?.name === "lineTo" && (calls[i + 1].args[0] as number) === (c.args[0] as number));
        expect(verticals).toHaveLength(5);
        for (const v of verticals) {
            const deviceX = 2 * (v.args[0] as number);
            const offset = Math.round(v.lineWidth * 2) % 2 ? 0.5 : 0; // 7.6 → 8 device px, even: whole pixels
            const onGrid = deviceX - offset;
            expect(Math.abs(onGrid - Math.round(onGrid)), `x ${v.args[0]}`).toBeLessThan(1e-9);
        }
    });

    it("draws unsnapped without getTransform", () => {
        const { ctx, calls } = recordingCtx(null);
        expect(() => drawRink(ctx, createTransformContext(800, 400), { cache: false })).not.toThrow();
        expect(calls.some((c) => c.name === "stroke")).toBe(true);
    });
});
```

Add to `__tests__/lib/utils/canvas/drawing-utils.test.ts`:

```ts
it("pads a note's background in proportion: 2 reference px on the board, less on a thumbnail", () => {
    const pad = (canvasW: number, canvasH: number, padding: number) => {
        const calls: Call[] = [];
        const t = createTransformContext(canvasW, canvasH, padding);
        drawTextAnnotation(recordingCtx(calls), { id: "n", text: "Hi", position: { x: 100, y: 40 }, fontSize: 6, color: "#000" }, t);
        const bg = calls.find((c) => c.name === "fillRect")!;
        const textX = calls.find((c) => c.name === "fillText")!.args[1] as number;
        return textX - (bg.args[0] as number);
    };
    expect(pad(800, 400, 20)).toBeCloseTo(2);
    expect(pad(300, 128, 10)).toBeCloseTo(1); // 2 · 1.4/3.8 ≈ 0.74, floored to 1
});
```

Import `drawTextAnnotation` in that file if it isn't already.

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test __tests__/lib/utils/canvas/rink-renderer-markings.test.ts __tests__/lib/utils/canvas/drawing-utils.test.ts`
Expected: the thumbnail-scale, snapping and padding tests FAIL.

- [ ] **Step 3: Implement**

In `lib/utils/canvas/rink-renderer.ts` import `refPx, snapLineX` from `./scale`, and:

- `drawBoards`: `ctx.lineWidth = 3;` → `ctx.lineWidth = refPx(3, transform.scaleX);`
- `drawCenterCircle`, `drawFaceoffCircles`, `drawGoalCreases`: `ctx.lineWidth = 2;` → `ctx.lineWidth = refPx(2, transform.scaleX);`
- `drawCenterRedLine`: after setting `ctx.lineWidth`, snap the shared x:

```ts
    const x = snapLineX(ctx, top.x, ctx.lineWidth);
    ctx.beginPath();
    ctx.moveTo(x, top.y);
    ctx.lineTo(x, bottom.y);
    ctx.stroke();
```

- `drawBlueLines` and `drawGoalLines`: the same for each line (`const lx = snapLineX(ctx, leftTop.x, ctx.lineWidth)`, and so on), using the snapped x for both `moveTo` and `lineTo`.

In `drawTextAnnotation` (`drawing-utils.ts`), compute the paddings once and use them:

```ts
    const pxPerFt = Math.min(transform.scaleX, transform.scaleY);
    const pad = refPx(2, pxPerFt);
    const selectPad = refPx(4, pxPerFt);
```

then replace the literal `2`/`4`/`8` in the two `fillRect` calls: background `canvasPos.x - pad, canvasPos.y - textHeight - pad, textWidth + 2 * pad, textHeight + 2 * pad`; selection `canvasPos.x - selectPad, canvasPos.y - textHeight - selectPad, textWidth + 2 * selectPad, textHeight + 2 * selectPad`.

- [ ] **Step 4: Run the canvas and app suites**

Run: `bun run test __tests__/lib/utils/canvas __tests__/components/features/practice-planner __tests__/apps/planner`
Expected: PASS; legacy snapshot unchanged.

- [ ] **Step 5: Commit**

```bash
git add lib/utils/canvas/rink-renderer.ts lib/utils/canvas/drawing-utils.ts __tests__/lib/utils/canvas
git commit -m "feat(practice-planner): draw rink markings and notes in proportion, on the pixel grid"
```

---

### Task 6: Verify on real surfaces and open the PR

**Files:** none changed (screenshots are viewed, never committed)

- [ ] **Step 1: Full checks**

Run: `bun run type-check && bun run lint && bun run test && bun run planner:build && bun run planner:check`
Expected: all pass; lint has no new warnings; `git status` shows no change to `__tests__/lib/utils/canvas/__snapshots__/stroke-geometry.legacy.test.ts.snap`.

- [ ] **Step 2: Visual check**

Start `bun run planner:dev`. With the Playwright MCP browser (device scale factor 2), import the "8U Tag, Stops and Battles" template, save it, and look at:
1. the board for a starter drill at its default size (it must look as on `main`),
2. the same drill's library card and sidebar card (lines thinner, arrowheads and outlines in proportion with the markers; pucks now small dots),
3. the session detail preview,
4. the bench sheet (print diagrams with proportionally heavier lines than before).

Compare against `main` by building `main`'s planner in a separate worktree (`git worktree add`), never with `git stash`. Save screenshots under `.playwright-mcp/` and delete them afterwards.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin HEAD
gh pr create --base main --title "feat(practice-planner): draw rink diagrams in proportion at every size" --body-file -
```

The body states the rule (sizes are "px on the 800 px board" scaled by `refPx`), that the board is unchanged (the legacy geometry snapshot is untouched), what changes on thumbnails, previews and print, and the checks run. Attach no local paths. End with the session attribution line.

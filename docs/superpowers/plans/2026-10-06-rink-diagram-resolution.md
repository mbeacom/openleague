# Rink Diagram Resolution (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every rink diagram renders at the screen's pixel ratio (board, live previews, legend), stored thumbnails are 2×, and print never drops below 2×, with no change to how diagrams look.

**Architecture:** One pure backing-store helper (`lib/utils/canvas/backing-store.ts`) sizes canvases at CSS size × ratio. The board's frame drawing takes that ratio into its base transform. A new `PlayDiagram` component draws `playData` live (the StationMap pattern) wherever a surface already has the data, replacing stretched stored PNGs. Stored thumbnails are generated at 2×, and the static planner upgrades old 1× thumbnails once on open.

**Tech Stack:** Next.js 16 / React 19, MUI v7, Canvas 2D, Vitest + Testing Library (jsdom; canvas contexts are mocked), fake-indexeddb for the static store.

**Spec:** `docs/superpowers/specs/2026-10-06-rink-diagram-quality-design.md` (§1 Resolution). Phases 2 (scale model) and 3 (playbook style) get their own plans after this one lands.

## Global Constraints

- Pixel ratio is `window.devicePixelRatio` clamped to [1, 3]; 1 when there is no window or the value is not finite.
- Stored thumbnails: pixelRatio 2 at the existing 300×128 logical size (600×256 PNG). Format stays a PNG data URL within `MAX_THUMBNAIL_SIZE` (1,000,000 characters).
- Print: `printPixelRatio` returns 3 up to 24 readable diagrams and 2 beyond; never 1.
- No new runtime dependency. Everything in `lib/utils/canvas/` stays free of server and Next imports (the static planner shares it).
- Hit-testing stays in CSS pixels; `getMousePosition` does not change.
- `generateThumbnail`'s default pixelRatio stays 1 (its 1× output is pinned by tests); callers that store opt in to 2× through `STORED_THUMBNAIL_PIXEL_RATIO`.
- Always `bun`; run `bun run type-check`, `bun run lint`, and the touched tests before each commit.
- Commits end with the session attribution line the harness supplies.

## Review Focus

1. **Window moved between a 1× and a 2× screen (or browser zoom) while the board is open:** the board must re-size its backing store and stay sharp and correctly hit-tested. Pinned in Task 2 (ratio change triggers a resize).
2. **Board zoomed or panned on a 2× screen:** the white fill and the clear must cover the whole backing store, not the top-left quarter. Pinned in Task 2 (`drawRink` fill uses the backing size; frame clear at ratio 2).
3. **A stored thumbnail that isn't a PNG, or is malformed base64:** the width probe must return null and the static refresh must leave it alone, never throw. Pinned in Task 4.
4. **A static-planner play whose stored playData is unreadable:** the refresh pass must skip it and keep the old thumbnail. Pinned in Task 5.
5. **A `PlayDiagram` container that measures 0 wide (hidden tab, collapsed accordion):** no zero-sized backing store and no draw until it has a size. Pinned in Task 3.

---

## File Structure

| File | Responsibility |
|---|---|
| Create `lib/utils/canvas/backing-store.ts` | `backingPixelRatio`, `sizeBackingStore`, `watchPixelRatio` |
| Modify `components/features/practice-planner/StationMap.tsx` | Use the helper (behavior unchanged) |
| Modify `lib/utils/canvas/drawing-utils.ts` | `BoardFrameOptions.pixelRatio`; ratio-aware clear and base transform |
| Modify `lib/utils/canvas/rink-renderer.ts` | `drawRink({cache:false})` fills the whole backing store |
| Modify `components/features/practice-planner/RinkBoard.tsx` | Size the backing store with the ratio; watch for ratio changes; explicit CSS size |
| Modify `lib/utils/canvas/thumbnail-generator.ts` | Extract `drawThumbnailScene`; add `STORED_THUMBNAIL_PIXEL_RATIO` |
| Create `components/features/practice-planner/PlayDiagram.tsx` | Live, ratio-aware diagram sized to its container |
| Modify `app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx` | Preview uses `PlayDiagram` |
| Modify `components/features/practice-planner/SidebarPlayCard.tsx` | Card image uses `PlayDiagram` |
| Modify `components/features/practice-planner/PlanPreview.tsx` | Row images use `PlayDiagram` |
| Modify `lib/utils/thumbnail-rules.ts` | `thumbnailPixelWidth(dataUrl)` |
| Modify `components/features/practice-planner/PlayEditor.tsx`, `apps/planner/src/main.tsx` | Store thumbnails at 2× |
| Modify `apps/planner/src/store/library.ts`, `types.ts`, `open-store.ts` | `refreshStoredThumbnails` one-time upgrade pass |
| Modify `components/features/practice-planner/print/PrintDiagram.tsx` | New `printPixelRatio` bounds |
| Modify `components/features/practice-planner/PlayLegend.tsx` | Ratio-aware `LegendSwatch` |

---

### Task 1: Backing-store helper, adopted by StationMap

**Files:**
- Create: `lib/utils/canvas/backing-store.ts`
- Modify: `components/features/practice-planner/StationMap.tsx`
- Test: `__tests__/lib/utils/canvas/backing-store.test.ts`; existing `__tests__/components/features/practice-planner/StationMap.test.tsx` must still pass unchanged

**Interfaces:**
- Produces:
  - `MAX_BACKING_PIXEL_RATIO = 3`
  - `backingPixelRatio(): number`
  - `sizeBackingStore(canvas: HTMLCanvasElement, cssWidth: number, cssHeight: number, ratio: number): void` (sets `canvas.width/height` to `Math.round(css × ratio)`)
  - `watchPixelRatio(onChange: () => void): () => void`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/lib/utils/canvas/backing-store.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { backingPixelRatio, sizeBackingStore, watchPixelRatio } from "@/lib/utils/canvas/backing-store";

const setDpr = (value: number) => Object.defineProperty(window, "devicePixelRatio", { value, configurable: true });

describe("backingPixelRatio", () => {
    afterEach(() => setDpr(1));

    it.each([[1, 1], [2, 2], [2.5, 2.5], [4, 3], [0.5, 1], [Number.NaN, 1], [Infinity, 1]])("dpr %s → %s", (dpr, expected) => {
        setDpr(dpr);
        expect(backingPixelRatio()).toBe(expected);
    });
});

describe("sizeBackingStore", () => {
    it("sizes the backing store to css × ratio, rounded", () => {
        const canvas = document.createElement("canvas");
        sizeBackingStore(canvas, 301, 128, 1.5);
        expect([canvas.width, canvas.height]).toEqual([452, 192]);
    });

    it("never sizes below 1 px, so a hidden container doesn't produce an empty canvas error", () => {
        const canvas = document.createElement("canvas");
        sizeBackingStore(canvas, 0, 0, 2);
        expect([canvas.width, canvas.height]).toEqual([1, 1]);
    });
});

describe("watchPixelRatio", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("calls back when the resolution query changes, re-arms for the new ratio, and unsubscribes", () => {
        const listeners = new Map<string, () => void>();
        const queries: string[] = [];
        vi.stubGlobal("matchMedia", (query: string) => {
            queries.push(query);
            return {
                addEventListener: (_: string, fn: () => void) => listeners.set(query, fn),
                removeEventListener: (_: string, _fn: () => void) => listeners.delete(query),
            };
        });
        setDpr(1);
        const onChange = vi.fn();
        const stop = watchPixelRatio(onChange);
        expect(queries).toEqual(["(resolution: 1dppx)"]);
        setDpr(2);
        listeners.get("(resolution: 1dppx)")!();
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(queries).toEqual(["(resolution: 1dppx)", "(resolution: 2dppx)"]);
        stop();
        expect(listeners.size).toBe(0);
    });

    it("is a no-op without matchMedia", () => {
        vi.stubGlobal("matchMedia", undefined);
        expect(() => watchPixelRatio(vi.fn())()).not.toThrow();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test __tests__/lib/utils/canvas/backing-store.test.ts`
Expected: FAIL, cannot resolve `@/lib/utils/canvas/backing-store`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/utils/canvas/backing-store.ts
/**
 * Canvas backing stores at the display's pixel ratio (rink diagram quality
 * spec §1). A canvas is drawn in CSS pixels under setTransform(ratio, …) on a
 * backing store of CSS size × ratio, so it is sharp on high-density screens.
 * No server or Next imports: the static planner shares this module.
 */

/** Bounds the backing store's memory on very dense screens. */
export const MAX_BACKING_PIXEL_RATIO = 3;

/** window.devicePixelRatio clamped to [1, 3]; 1 off the browser or when not finite. */
export function backingPixelRatio(): number {
    const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio;
    return Number.isFinite(dpr) ? Math.min(MAX_BACKING_PIXEL_RATIO, Math.max(1, dpr)) : 1;
}

/** Sizes the backing store to css × ratio (at least 1×1, so an unmeasured container can't make an empty canvas). */
export function sizeBackingStore(canvas: HTMLCanvasElement, cssWidth: number, cssHeight: number, ratio: number): void {
    canvas.width = Math.max(1, Math.round(cssWidth * ratio));
    canvas.height = Math.max(1, Math.round(cssHeight * ratio));
}

/**
 * Calls onChange when the pixel ratio changes (browser zoom, or the window
 * moving to another screen). A resolution query matches only the ratio it was
 * made for, so it is re-armed for the new ratio after every change. Returns
 * the unsubscribe.
 */
export function watchPixelRatio(onChange: () => void): () => void {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => undefined;
    let query: MediaQueryList | null = null;
    const arm = () => {
        query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
        query.addEventListener("change", fire);
    };
    const fire = () => {
        query?.removeEventListener("change", fire);
        arm();
        onChange();
    };
    arm();
    return () => query?.removeEventListener("change", fire);
}
```

- [ ] **Step 4: Move StationMap onto the helper**

In `components/features/practice-planner/StationMap.tsx`:
- Delete `MAX_PIXEL_RATIO` and the local `backingPixelRatio` function.
- Add `import { backingPixelRatio, sizeBackingStore, watchPixelRatio } from "@/lib/utils/canvas/backing-store";`
- Replace the matchMedia effect with:

```tsx
    // Browser zoom or moving the window to another display changes the ratio;
    // the redraw below depends on it so the backing store is resized.
    useEffect(() => watchPixelRatio(() => setPixelRatio(window.devicePixelRatio)), []);
```

- In the draw effect replace the two `canvas.width/height` lines with `sizeBackingStore(canvas, MAP_WIDTH, MAP_HEIGHT, ratio);`.

- [ ] **Step 5: Run the tests**

Run: `bun run test __tests__/lib/utils/canvas/backing-store.test.ts __tests__/components/features/practice-planner/StationMap.test.tsx`
Expected: PASS. If the StationMap re-arm test asserts the old per-effect listener lifecycle, keep its expectations about backing-store sizes and the redraw after a change, and update only the listener bookkeeping to the new single subscription.

- [ ] **Step 6: Commit**

```bash
git add lib/utils/canvas/backing-store.ts __tests__/lib/utils/canvas/backing-store.test.ts components/features/practice-planner/StationMap.tsx __tests__/components/features/practice-planner/StationMap.test.tsx
git commit -m "refactor(practice-planner): share the canvas backing-store helper"
```

---

### Task 2: The rink board draws at the screen's pixel ratio

**Files:**
- Modify: `lib/utils/canvas/drawing-utils.ts` (`BoardFrameOptions`, `drawBoardFrame`, ~lines 440-470)
- Modify: `lib/utils/canvas/rink-renderer.ts` (`drawRink`, ~lines 239-247)
- Modify: `components/features/practice-planner/RinkBoard.tsx` (state ~111, resize ~231-241, render ~340-360, JSX ~990-1010)
- Test: `__tests__/lib/utils/canvas/drawing-utils.test.ts` (extend the `drawBoardFrame` describe), `__tests__/lib/utils/canvas/rink-renderer.test.ts` (or the file that already covers `drawRink`), a new `__tests__/components/features/practice-planner/RinkBoard.pixel-ratio.test.tsx`

**Interfaces:**
- Consumes: `backingPixelRatio`, `sizeBackingStore`, `watchPixelRatio` (Task 1)
- Produces: `BoardFrameOptions.pixelRatio?: number` (default 1)

Design notes for the implementer:
- At ratio > 1 the board draws the rink as vectors (`cachedRink: false`), exactly as thumbnails above 1× already do. This keeps the single-slot rink cache as is: the board only uses it at ratio 1, unzoomed, unpanned. (This is simpler than the spec's keyed cache and gives the same result; the spec's goal, no eviction of a high-ratio board rink, holds because there is no high-ratio cached rink.)
- `drawRink({cache:false})` currently fills white under an identity transform over `transform.canvasWidth × canvasHeight`. On a 2× backing store that covers a quarter. It must fill the context's real backing size when the context has one.

- [ ] **Step 1: Write the failing frame tests**

Append inside `describe("drawBoardFrame", …)` in `__tests__/lib/utils/canvas/drawing-utils.test.ts`:

```ts
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
```

- [ ] **Step 2: Write the failing `drawRink` fill test**

In the test file that covers `drawRink` (find it with `rtk proxy grep -rln "drawRink(" __tests__/lib/utils/canvas`), add:

```ts
it("with cache:false, fills white over the whole backing store, not just the CSS-size rectangle", () => {
    const fills: number[][] = [];
    const ctx = {
        canvas: { width: 1600, height: 800 },
        save: vi.fn(), restore: vi.fn(), setTransform: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
        arc: vi.fn(), arcTo: vi.fn(), roundRect: vi.fn(), rect: vi.fn(), closePath: vi.fn(), fill: vi.fn(), stroke: vi.fn(), clip: vi.fn(),
        fillRect: vi.fn((...args: number[]) => fills.push(args)), strokeRect: vi.fn(), fillText: vi.fn(), setLineDash: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    drawRink(ctx, createTransformContext(800, 400), { cache: false });
    expect(fills[0]).toEqual([0, 0, 1600, 800]);
});
```

If `drawRinkMarkings` calls a context method missing from this stub, add that method as `vi.fn()` to the stub; the assertion is only about the first `fillRect`.

- [ ] **Step 3: Run them to verify they fail**

Run: `bun run test __tests__/lib/utils/canvas/drawing-utils.test.ts __tests__/lib/utils/canvas/rink-renderer.test.ts`
Expected: the three new tests FAIL (unknown option has no effect; fill is 800×400).

- [ ] **Step 4: Implement the frame and fill changes**

In `lib/utils/canvas/drawing-utils.ts`:

```ts
export interface BoardFrameOptions extends BoardSceneOptions {
    /** Board pan in screen pixels, applied with `zoom` (default none) */
    pan?: Position;
    /** Backing-store pixels per CSS pixel (backing-store.ts); default 1 */
    pixelRatio?: number;
}
```

and in `drawBoardFrame` replace the body from `const zoom` through `drawBoardScene(...)` with:

```ts
    const zoom = options.zoom ?? 1;
    const pan = options.pan ?? { x: 0, y: 0 };
    const ratio = options.pixelRatio ?? 1;
    ctx.save();
    // Clear in CSS pixels under the ratio alone: the whole canvas, whatever the zoom or pan.
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, transform.canvasWidth, transform.canvasHeight);
    ctx.restore();
    ctx.setTransform(zoom * ratio, 0, 0, zoom * ratio, pan.x * ratio, pan.y * ratio);
    const shifted = zoom !== 1 || pan.x !== 0 || pan.y !== 0;
    // The cached rink is a CSS-size bitmap: use it only where it maps 1:1 onto the backing store.
    drawBoardScene(ctx, transform, playData, { ...options, zoom, cachedRink: !shifted && ratio === 1 });
```

Update the doc comment above `drawBoardFrame` to say the clear runs under the pixel-ratio transform and the cache is used only at ratio 1, zoom 1, no pan.

In `lib/utils/canvas/rink-renderer.ts`, inside `drawRink`'s `cache === false` branch replace the `fillRect` line with:

```ts
        // Identity transform: fill the real backing store (a high-ratio canvas is larger than the CSS size).
        const backing = ctx.canvas;
        const fullW = typeof backing?.width === "number" ? backing.width : transform.canvasWidth;
        const fullH = typeof backing?.height === "number" ? backing.height : transform.canvasHeight;
        ctx.fillRect(0, 0, fullW, fullH);
```

- [ ] **Step 5: Run the canvas tests**

Run: `bun run test __tests__/lib/utils/canvas`
Expected: PASS (existing ratio-1 tests are unchanged because the defaults reproduce the old calls).

- [ ] **Step 6: Write the failing RinkBoard test**

```tsx
// __tests__/components/features/practice-planner/RinkBoard.pixel-ratio.test.tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { RinkBoard } from "@/components/features/practice-planner/RinkBoard";
import { createEmptyPlayData } from "@/lib/utils/play-data";

const setDpr = (value: number) => Object.defineProperty(window, "devicePixelRatio", { value, configurable: true });

describe("RinkBoard pixel ratio", () => {
    afterEach(() => {
        setDpr(1);
        vi.unstubAllGlobals();
    });

    it("sizes the backing store at the screen's ratio and the CSS box at the container size", () => {
        setDpr(2);
        const { container } = render(<RinkBoard playData={createEmptyPlayData()} mode="view" height={400} />);
        const canvas = container.querySelector("canvas")!;
        // jsdom measures clientWidth as 0, so the board falls back to its default width (800).
        expect([canvas.width, canvas.height]).toEqual([1600, 800]);
        expect(canvas.style.width).toBe("800px");
        expect(canvas.style.height).toBe("400px");
    });

    it("re-sizes when the ratio changes (window moved to another screen)", () => {
        let fire: (() => void) | undefined;
        vi.stubGlobal("matchMedia", () => ({ addEventListener: (_: string, fn: () => void) => (fire = fn), removeEventListener: vi.fn() }));
        setDpr(1);
        const { container } = render(<RinkBoard playData={createEmptyPlayData()} mode="view" height={400} />);
        const canvas = container.querySelector("canvas")!;
        expect(canvas.width).toBe(800);
        setDpr(2);
        act(() => fire!());
        expect(canvas.width).toBe(1600);
    });
});
```

Before running, open `RinkBoard.tsx` and confirm the required props: if `RinkBoard` needs more than `playData`, `mode` and `height` (for example an `onChange` in edit mode), add the minimum extra props the existing RinkBoard tests use (`rtk proxy grep -rln "<RinkBoard" __tests__`). If `clientWidth` of 0 makes the board size to 0 rather than the 800 default, assert against whatever `handleResize` produces and keep the 2× relationship as the point of the test.

- [ ] **Step 7: Run it to verify it fails**

Run: `bun run test __tests__/components/features/practice-planner/RinkBoard.pixel-ratio.test.tsx`
Expected: FAIL (backing store equals CSS size).

- [ ] **Step 8: Implement in RinkBoard**

In `components/features/practice-planner/RinkBoard.tsx`:

1. Import: `import { backingPixelRatio, sizeBackingStore, watchPixelRatio } from "@/lib/utils/canvas/backing-store";`
2. Next to `canvasSize` state add:

```tsx
    // Backing-store pixels per CSS pixel; changes with browser zoom or another screen.
    const [pixelRatio, setPixelRatio] = useState(1);
    useEffect(() => {
        setPixelRatio(backingPixelRatio());
        return watchPixelRatio(() => setPixelRatio(backingPixelRatio()));
    }, []);
```

3. Size the backing store in an effect (not through JSX `width`/`height`, which React would re-apply at CSS size):

```tsx
    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas) sizeBackingStore(canvas, canvasSize.width, canvasSize.height, pixelRatio);
    }, [canvasSize, pixelRatio]);
```

4. In `render`, pass `pixelRatio` to `drawBoardFrame` and add `pixelRatio` to the `useCallback` dependency list:

```tsx
        drawBoardFrame(ctx, transform, renderData, {
            selectedId: selectedElementId || undefined,
            zoom: scale,
            pan: viewPan,
            maskRect: areaMaskRect(areaDrag, playData.area),
            pixelRatio,
        });
```

5. In the JSX remove `width={canvasSize.width}` and `height={canvasSize.height}` from `<canvas>`, and set the CSS size explicitly with a border-box so the 1 px border no longer overflows:

```tsx
                style={{
                    display: "block",
                    width: canvasSize.width,
                    height: canvasSize.height,
                    boxSizing: "border-box",
                    cursor: mode === "edit" ? "crosshair" : "default",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                }}
```

The later strokes in `render` (`drawLineHandles`, the in-progress `drawStroke`, `drawSnapRing`) draw under the transform `drawBoardFrame` leaves applied, which now includes the ratio; they need no change.

- [ ] **Step 9: Run the board tests and the full practice-planner suite**

Run: `bun run test __tests__/components/features/practice-planner __tests__/lib/utils/canvas`
Expected: PASS. Existing RinkBoard tests that read `canvas.width` at ratio 1 still see the CSS size because `devicePixelRatio` is 1 in jsdom.

- [ ] **Step 10: Commit**

```bash
git add lib/utils/canvas/drawing-utils.ts lib/utils/canvas/rink-renderer.ts components/features/practice-planner/RinkBoard.tsx __tests__/lib/utils/canvas __tests__/components/features/practice-planner/RinkBoard.pixel-ratio.test.tsx
git commit -m "feat(practice-planner): draw the rink board at the screen's pixel ratio"
```

---

### Task 3: A live, ratio-aware `PlayDiagram`, used wherever the drill data is at hand

**Files:**
- Modify: `lib/utils/canvas/thumbnail-generator.ts` (extract the scene from `generateThumbnail`)
- Create: `components/features/practice-planner/PlayDiagram.tsx`
- Modify: `app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx` (~567-595)
- Modify: `components/features/practice-planner/SidebarPlayCard.tsx`
- Modify: `components/features/practice-planner/PlanPreview.tsx`
- Test: `__tests__/components/features/practice-planner/PlayDiagram.test.tsx`; existing `PlanPreview.test.tsx`, SidebarPlayCard and SessionDetailView tests

**Interfaces:**
- Consumes: `backingPixelRatio`, `sizeBackingStore`, `watchPixelRatio` (Task 1)
- Produces:
  - `THUMBNAIL_PADDING = 10` and `drawThumbnailScene(ctx: CanvasRenderingContext2D, playData: PlayData, width: number, height: number, options?: { backgroundColor?: string; cachedRink?: boolean }): void` in `thumbnail-generator.ts`
  - `THUMBNAIL_ASPECT = THUMBNAIL_DIMENSIONS.width / THUMBNAIL_DIMENSIONS.height`
  - `<PlayDiagram playData={PlayData} label={string} sx?={SxProps} />`: fills its container's width at the thumbnail aspect ratio, or fits a fixed-height box when `sx` gives a height

- [ ] **Step 1: Extract the scene (refactor, tests stay green)**

In `lib/utils/canvas/thumbnail-generator.ts` add above `generateThumbnail`:

```ts
/** Padding around the rink in every thumbnail-style diagram (logical px). */
export const THUMBNAIL_PADDING = 10;

/** Width ÷ height of a thumbnail; live diagrams keep the same shape. */
export const THUMBNAIL_ASPECT = THUMBNAIL_DIMENSIONS.width / THUMBNAIL_DIMENSIONS.height;

/**
 * The thumbnail scene in logical px on a context already scaled to its
 * backing store: background, the whole rink, and everything outside the
 * drill's area shaded. Shared by stored thumbnails, print and PlayDiagram.
 */
export function drawThumbnailScene(
    ctx: CanvasRenderingContext2D,
    playData: PlayData,
    width: number,
    height: number,
    options: { backgroundColor?: string; cachedRink?: boolean } = {}
): void {
    ctx.fillStyle = options.backgroundColor ?? "#FFFFFF";
    ctx.fillRect(0, 0, width, height);
    const transform = createTransformContext(width, height, THUMBNAIL_PADDING);
    drawBoardScene(ctx, transform, playData, { maskRect: areaRect(playData.area), cachedRink: options.cachedRink ?? false });
}
```

and in `generateThumbnail` replace everything from `// Fill background` through the `drawBoardScene(...)` call with:

```ts
    // The cached rink is a logical-size bitmap that would print blurry under scale(),
    // so a scaled thumbnail draws the rink as vectors.
    drawThumbnailScene(ctx, playData, width, height, { backgroundColor, cachedRink: !scaled });
```

Run: `bun run test __tests__/lib/utils/canvas`
Expected: PASS with no test changes (same calls, same order).

- [ ] **Step 2: Write the failing PlayDiagram test**

```tsx
// __tests__/components/features/practice-planner/PlayDiagram.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { PlayDiagram } from "@/components/features/practice-planner/PlayDiagram";
import * as thumbs from "@/lib/utils/canvas/thumbnail-generator";
import { createEmptyPlayData } from "@/lib/utils/play-data";

const setDpr = (value: number) => Object.defineProperty(window, "devicePixelRatio", { value, configurable: true });

let resize: ((entries: Array<{ contentRect: { width: number; height: number } }>) => void) | undefined;
class FakeResizeObserver {
    constructor(cb: typeof resize) { resize = cb; }
    observe() {}
    unobserve() {}
    disconnect() {}
}

describe("PlayDiagram", () => {
    beforeEach(() => vi.stubGlobal("ResizeObserver", FakeResizeObserver));
    afterEach(() => {
        setDpr(1);
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("draws at the measured size × the screen's ratio, as vectors", () => {
        setDpr(2);
        const scene = vi.spyOn(thumbs, "drawThumbnailScene");
        render(<PlayDiagram playData={createEmptyPlayData()} label="Backward Tag" />);
        act(() => resize!([{ contentRect: { width: 600, height: 256 } }]));
        const canvas = screen.getByRole("img", { name: "Backward Tag diagram" }) as HTMLCanvasElement;
        expect([canvas.width, canvas.height]).toEqual([1200, 512]);
        expect(scene).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), 600, 256, { cachedRink: false });
    });

    it("draws nothing until the container has a size", () => {
        const scene = vi.spyOn(thumbs, "drawThumbnailScene");
        render(<PlayDiagram playData={createEmptyPlayData()} label="Hidden" />);
        act(() => resize!([{ contentRect: { width: 0, height: 0 } }]));
        expect(scene).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `bun run test __tests__/components/features/practice-planner/PlayDiagram.test.tsx`
Expected: FAIL, module not found.

- [ ] **Step 4: Implement PlayDiagram**

```tsx
// components/features/practice-planner/PlayDiagram.tsx
"use client";

/**
 * A drill's diagram drawn live at its displayed size × the screen's pixel ratio
 * (rink diagram quality spec §1), for surfaces that already hold the play
 * data; a stored PNG would be upscaled there. Same scene as a thumbnail.
 */
import { useEffect, useRef, useState } from "react";
import { Box, type SxProps, type Theme } from "@mui/material";
import type { PlayData } from "@/types/practice-planner";
import { THUMBNAIL_ASPECT, drawThumbnailScene } from "@/lib/utils/canvas/thumbnail-generator";
import { backingPixelRatio, sizeBackingStore, watchPixelRatio } from "@/lib/utils/canvas/backing-store";

export interface PlayDiagramProps {
    playData: PlayData;
    /** The drill's name; the canvas is announced as "<label> diagram". */
    label: string;
    sx?: SxProps<Theme>;
}

export function PlayDiagram({ playData, label, sx }: PlayDiagramProps) {
    const boxRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [size, setSize] = useState({ width: 0, height: 0 });
    const [ratio, setRatio] = useState(1);

    useEffect(() => {
        setRatio(backingPixelRatio());
        return watchPixelRatio(() => setRatio(backingPixelRatio()));
    }, []);

    useEffect(() => {
        const box = boxRef.current;
        if (!box) return;
        const observer = new ResizeObserver((entries) => {
            const rect = entries[0]?.contentRect;
            if (rect) setSize({ width: Math.round(rect.width), height: Math.round(rect.height) });
        });
        observer.observe(box);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || size.width === 0 || size.height === 0) return;
        sizeBackingStore(canvas, size.width, size.height, ratio);
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        try {
            drawThumbnailScene(ctx, playData, size.width, size.height, { cachedRink: false });
        } catch (error) {
            console.warn(`Couldn't draw the diagram for "${label}":`, error);
        }
    }, [playData, label, size, ratio]);

    return (
        <Box ref={boxRef} sx={[{ width: "100%", aspectRatio: `${THUMBNAIL_ASPECT}`, maxWidth: "100%" }, ...(Array.isArray(sx) ? sx : [sx])]}>
            <canvas ref={canvasRef} role="img" aria-label={`${label} diagram`} style={{ display: "block", width: "100%", height: "100%" }} />
        </Box>
    );
}
```

- [ ] **Step 5: Run it**

Run: `bun run test __tests__/components/features/practice-planner/PlayDiagram.test.tsx`
Expected: PASS.

- [ ] **Step 6: Adopt it in the session detail preview**

In `SessionDetailView.tsx`, replace the whole `{goaliesHidden ? (…) : activePlay.play.thumbnail ? (…) : (…)}` expression with (the drawn data already accounts for hidden goalies, so one branch serves both):

```tsx
                  {activeDrawn ? (
                    // Fit inside the fixed-height preview, keeping the thumbnail's shape.
                    <PlayDiagram playData={activeDrawn} label={activePlay.play.name} sx={{ height: "100%", width: "auto" }} />
                  ) : activePlay.play.thumbnail ? (
                    <Image src={activePlay.play.thumbnail} alt={activePlay.play.name} fit="contain" />
                  ) : (
                    <Stack alignItems="center" spacing={1}>
                      <HockeyIcon sx={{ fontSize: 48, color: "text.disabled" }} />
                      <Typography variant="body2" color="text.secondary">
                        No preview available
                      </Typography>
                    </Stack>
                  )}
```

Add the import, and remove the `PrintDiagram`/`PRINT_DIAGRAM_SIZE` imports if nothing else in the file uses them. `activeDrawn` is null when the play data is unreadable; the stored thumbnail stays as that fallback.

- [ ] **Step 7: Adopt it in SidebarPlayCard**

In `SidebarPlayCard.tsx` delete `useDrawnThumbnail` and its `generateThumbnail`/`useMounted`/`useMemo` imports. Where the card renders `thumbnail` through `Image` in a 48×32 box, render instead:

```tsx
{drawn ? (
  <PlayDiagram playData={drawn} label={sp.play.name} sx={{ width: 48, height: 32 }} />
) : sp.play.thumbnail ? (
  <Image src={sp.play.thumbnail} alt={sp.play.name} fit="contain" />
) : (
  /* keep the existing no-thumbnail placeholder here unchanged */
)}
```

Keep the existing box styling around it. Run the SidebarPlayCard tests (`rtk proxy grep -rln "SidebarPlayCard" __tests__`) and update assertions that looked for an `<img>` of a live-generated thumbnail to look for the `"<name> diagram"` canvas instead; assertions about the stored-thumbnail fallback stay.

- [ ] **Step 8: Adopt it in PlanPreview**

In `PlanPreview.tsx` delete the `thumbnails` memo and the `generateThumbnail`/`useMounted` imports if unused elsewhere in the file, and replace the `{src ? (<Box component="img" …/>) : (<Box aria-hidden …/>)}` expression with:

```tsx
<PlayDiagram
    playData={play.playData}
    label={play.name}
    sx={{ ...THUMB, flexShrink: 0, borderRadius: 1, border: 1, borderColor: "divider", overflow: "hidden" }}
/>
```

Run `bun run test __tests__/components/features/practice-planner/PlanPreview.test.tsx`; update any assertion on `img[alt="<name> diagram"]` to `getByRole("img", { name: "<name> diagram" })` (the canvas carries the same accessible name).

- [ ] **Step 9: Run the practice-planner and app tests**

Run: `bun run test __tests__/components/features/practice-planner __tests__/app __tests__/apps/planner`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add lib/utils/canvas/thumbnail-generator.ts components/features/practice-planner/PlayDiagram.tsx "app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx" components/features/practice-planner/SidebarPlayCard.tsx components/features/practice-planner/PlanPreview.tsx __tests__
git commit -m "feat(practice-planner): draw drill previews live at the screen's pixel ratio"
```

---

### Task 4: Stored thumbnails at 2×, and a PNG width probe

**Files:**
- Modify: `lib/utils/thumbnail-rules.ts`
- Modify: `lib/utils/canvas/thumbnail-generator.ts`
- Modify: `components/features/practice-planner/PlayEditor.tsx` (~284)
- Modify: `apps/planner/src/main.tsx` (~15)
- Modify: `components/features/practice-planner/PlayLibrary.tsx` (~498-510, starter thumbnails)
- Test: `__tests__/lib/utils/thumbnail-rules.test.ts` (create if missing), `__tests__/lib/utils/canvas/thumbnail-pixel-ratio.test.ts`, `__tests__/apps/planner/main.test.tsx`

**Interfaces:**
- Produces:
  - `STORED_THUMBNAIL_PIXEL_RATIO = 2` (thumbnail-generator.ts)
  - `STORED_THUMBNAIL_MIN_WIDTH = 600` (thumbnail-rules.ts): `THUMBNAIL_DIMENSIONS.width × STORED_THUMBNAIL_PIXEL_RATIO`, written as a literal because thumbnail-rules.ts must stay import-free
  - `thumbnailPixelWidth(dataUrl: string): number | null`: the PNG's width from its IHDR chunk, or null for anything that isn't a readable PNG data URL

- [ ] **Step 1: Write the failing probe test**

```ts
// __tests__/lib/utils/thumbnail-rules.test.ts
import { describe, expect, it } from "vitest";
import { STORED_THUMBNAIL_MIN_WIDTH, thumbnailPixelWidth } from "@/lib/utils/thumbnail-rules";

/** A minimal PNG header: signature, IHDR length and type, width, height. */
function pngHeader(width: number, height: number): string {
    const bytes = new Uint8Array(24);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    new DataView(bytes.buffer).setUint32(16, width);
    new DataView(bytes.buffer).setUint32(20, height);
    return `data:image/png;base64,${btoa(String.fromCharCode(...bytes))}`;
}

describe("thumbnailPixelWidth", () => {
    it("reads a PNG's width from its header", () => {
        expect(thumbnailPixelWidth(pngHeader(300, 128))).toBe(300);
        expect(thumbnailPixelWidth(pngHeader(600, 256))).toBe(600);
    });

    it.each([
        ["a JPEG", "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ=="],
        ["malformed base64", "data:image/png;base64,***"],
        ["too short", "data:image/png;base64,iVBORw0K"],
        ["not a data URL", "https://example.com/x.png"],
        ["wrong signature", `data:image/png;base64,${btoa("x".repeat(24))}`],
    ])("returns null for %s", (_name, value) => {
        expect(thumbnailPixelWidth(value)).toBeNull();
    });

    it("names the stored minimum: 300 px at 2×", () => {
        expect(STORED_THUMBNAIL_MIN_WIDTH).toBe(600);
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test __tests__/lib/utils/thumbnail-rules.test.ts`
Expected: FAIL, exports missing.

- [ ] **Step 3: Implement**

Append to `lib/utils/thumbnail-rules.ts`:

```ts
/** A stored thumbnail narrower than this was made before 2× storage (300 logical px × 2). */
export const STORED_THUMBNAIL_MIN_WIDTH = 600;

const PNG_PREFIX = "data:image/png;base64,";
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** A PNG data URL's pixel width from its IHDR chunk; null for anything else or anything unreadable. */
export function thumbnailPixelWidth(dataUrl: string): number | null {
    if (!dataUrl.startsWith(PNG_PREFIX)) return null;
    let header: string;
    try {
        // 32 base64 characters decode to the 24 bytes holding the signature, IHDR and width.
        header = atob(dataUrl.slice(PNG_PREFIX.length, PNG_PREFIX.length + 32));
    } catch {
        return null;
    }
    if (header.length < 24) return null;
    if (PNG_SIGNATURE.some((byte, i) => header.charCodeAt(i) !== byte)) return null;
    if (header.slice(12, 16) !== "IHDR") return null;
    return ((header.charCodeAt(16) << 24) | (header.charCodeAt(17) << 16) | (header.charCodeAt(18) << 8) | header.charCodeAt(19)) >>> 0;
}
```

In `lib/utils/canvas/thumbnail-generator.ts`, below `MAX_THUMBNAIL_PIXEL_RATIO`:

```ts
/** Thumbnails that are stored (library, static store) are generated at 2×: library cards show them larger than 300×128. */
export const STORED_THUMBNAIL_PIXEL_RATIO = 2;
```

- [ ] **Step 4: Store at 2×**

- `PlayEditor.tsx` ~284: `generateThumbnail(playData)` → `generateThumbnail(playData, { pixelRatio: STORED_THUMBNAIL_PIXEL_RATIO })` (add to the existing import).
- `apps/planner/src/main.tsx` ~15: `makeThumbnail: (playData) => generateThumbnail(playData)` → `makeThumbnail: (playData) => generateThumbnail(playData, { pixelRatio: STORED_THUMBNAIL_PIXEL_RATIO })`.

- `PlayLibrary.tsx` ~504, the starter-card thumbnails drawn on open: `generateThumbnail(starter.playData)` → `generateThumbnail(starter.playData, { pixelRatio: backingPixelRatio() })` (import from `@/lib/utils/canvas/backing-store`). These are never stored, so they use the screen's ratio rather than the stored 2×.

If `__tests__/apps/planner/main.test.tsx` or a PlayEditor test asserts `generateThumbnail` was called with one argument, update it to expect `{ pixelRatio: 2 }`.

Add to `__tests__/lib/utils/canvas/thumbnail-pixel-ratio.test.ts` (it already mocks the canvas; follow its local helpers):

```ts
it("a stored thumbnail is 600×256 and fits the stored-size rule", () => {
    generateThumbnail(createEmptyPlayData(), { pixelRatio: STORED_THUMBNAIL_PIXEL_RATIO });
    // assert the created canvas is 600×256 using the file's existing canvas spy
});
```

Replace the comment with the file's existing canvas-size assertion pattern (it already checks 2160×918 at ratio 3; copy that assertion with 600 and 256).

- [ ] **Step 5: Run the tests**

Run: `bun run test __tests__/lib/utils __tests__/apps/planner __tests__/components/features/practice-planner`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/utils/thumbnail-rules.ts lib/utils/canvas/thumbnail-generator.ts components/features/practice-planner/PlayEditor.tsx apps/planner/src/main.tsx __tests__
git commit -m "feat(practice-planner): store drill thumbnails at 2x"
```

---

### Task 5: The static planner upgrades old 1× thumbnails once

**Files:**
- Modify: `apps/planner/src/store/library.ts` (`LibraryOps` Pick at ~26; new op next to `seedStarterDrills`)
- Modify: `apps/planner/src/store/types.ts` (`LocalPlannerStore`, ~83)
- Modify: `apps/planner/src/store/open-store.ts` (~57-61)
- Test: `__tests__/apps/planner/local-store.library.test.ts`, `__tests__/apps/planner/open-store.test.ts`

**Interfaces:**
- Consumes: `thumbnailPixelWidth`, `STORED_THUMBNAIL_MIN_WIDTH` (Task 4); `ctx.makeThumbnail` (now 2× in the app)
- Produces: `refreshStoredThumbnails: () => Promise<number>` on `LocalPlannerStore` (resolves to how many it replaced)

- [ ] **Step 1: Write the failing tests**

Add to `describe.each(REPOS)("library (%s)", …)` in `__tests__/apps/planner/local-store.library.test.ts`:

```ts
    /** A PNG data URL whose header says `width` px (the probe reads only the header). */
    function pngOfWidth(width: number): string {
        const bytes = new Uint8Array(24);
        bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
        new DataView(bytes.buffer).setUint32(16, width);
        return `data:image/png;base64,${btoa(String.fromCharCode(...bytes))}`;
    }

    it("replaces thumbnails narrower than 600 px once, and leaves 2× ones, non-PNGs and unreadable plays alone", async () => {
        const h = await openHarness(open);
        const fresh = pngOfWidth(600);
        const makeThumbnail = vi.fn(() => fresh);
        const library = createLibraryOps(createStoreContext(h.repo, { ...h.options, makeThumbnail }));
        const base = { description: null, isTemplate: true, sessionId: null, sourcePlayId: null, createdAt: h.clock.now, updatedAt: h.clock.now };
        await h.repo.write(async (tx) => {
            await tx.putPlay({ ...base, id: "old", name: "Old", thumbnail: pngOfWidth(300), playData: createEmptyPlayData() });
            await tx.putPlay({ ...base, id: "new", name: "New", thumbnail: pngOfWidth(600), playData: createEmptyPlayData() });
            await tx.putPlay({ ...base, id: "jpeg", name: "Jpeg", thumbnail: "data:image/jpeg;base64,/9j/4AAQ", playData: createEmptyPlayData() });
            await tx.putPlay({ ...base, id: "bad", name: "Bad", thumbnail: pngOfWidth(300), playData: { version: 99 } as never });
        });

        expect(await library.refreshStoredThumbnails()).toBe(1);
        const thumb = async (id: string) => (await h.repo.read((tx) => tx.getPlay(id)))?.thumbnail;
        expect(await thumb("old")).toBe(fresh);
        expect(await thumb("new")).toBe(pngOfWidth(600));
        expect(await thumb("jpeg")).toBe("data:image/jpeg;base64,/9j/4AAQ");
        expect(await thumb("bad")).toBe(pngOfWidth(300));

        expect(await library.refreshStoredThumbnails()).toBe(0);
        expect(makeThumbnail).toHaveBeenCalledTimes(1);
    });

    it("keeps the old thumbnail when a new one can't be made", async () => {
        const h = await openHarness(open);
        const library = createLibraryOps(createStoreContext(h.repo, { ...h.options, makeThumbnail: () => { throw new Error("no canvas"); } }));
        await h.repo.write((tx) => tx.putPlay({ id: "old", name: "Old", description: null, thumbnail: pngOfWidth(300), playData: createEmptyPlayData(), isTemplate: true, sessionId: null, sourcePlayId: null, createdAt: h.clock.now, updatedAt: h.clock.now }));
        expect(await library.refreshStoredThumbnails()).toBe(0);
        expect((await h.repo.read((tx) => tx.getPlay("old")))?.thumbnail).toBe(pngOfWidth(300));
    });
```

In `__tests__/apps/planner/open-store.test.ts`, add a test that `openPlannerStore` calls `refreshStoredThumbnails` after seeding and that a throw from it is logged, not raised, mirroring the existing seeding-failure test in that file.

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test __tests__/apps/planner/local-store.library.test.ts __tests__/apps/planner/open-store.test.ts`
Expected: FAIL, `refreshStoredThumbnails` is not a function.

- [ ] **Step 3: Implement**

`apps/planner/src/store/types.ts`, in `LocalPlannerStore` below `seedStarterDrills`:

```ts
    /** Replaces stored thumbnails made before 2× storage; resolves to how many it replaced. */
    refreshStoredThumbnails: () => Promise<number>;
```

`apps/planner/src/store/library.ts`: add `"refreshStoredThumbnails"` to the `LibraryOps` Pick, import `STORED_THUMBNAIL_MIN_WIDTH, thumbnailPixelWidth` from `@/lib/utils/thumbnail-rules`, and add next to `seedStarterDrills`:

```ts
        refreshStoredThumbnails: async () => {
            const plays = await ctx.repo.read((tx) => tx.allPlays());
            const stale = plays.filter((play) => {
                const width = play.thumbnail ? thumbnailPixelWidth(play.thumbnail) : null;
                return width !== null && width < STORED_THUMBNAIL_MIN_WIDTH;
            });
            // Thumbnails first: nothing but repo calls may be awaited inside a transaction.
            const replacements = new Map<string, string>();
            for (const play of stale) {
                const parsed = parseStoredPlayData(play.playData);
                if (!parsed.ok) continue;
                const thumbnail = thumbnailOrNull(ctx.makeThumbnail(parsed.data));
                if (thumbnail) replacements.set(play.id, thumbnail);
            }
            if (replacements.size === 0) return 0;
            // Not a user write (ctx.repo.write, not write): no persistence prompt, and updatedAt stays.
            await ctx.repo.write(async (tx) => {
                for (const play of await tx.allPlays()) {
                    const thumbnail = replacements.get(play.id);
                    if (thumbnail) await tx.putPlay({ ...play, thumbnail });
                }
            });
            return replacements.size;
        },
```

`parseStoredPlayData` returns `{ ok: true, data } | { ok: false, error }` (lib/utils/play-data.ts:294); `{ version: 99 }` is the unreadable fixture the existing getPlayById test uses.

`apps/planner/src/store/open-store.ts`, after the seeding try/catch:

```ts
    try {
        await store.refreshStoredThumbnails();
    } catch (error) {
        console.error("Couldn't refresh drill thumbnails:", error);
    }
```

- [ ] **Step 4: Run the static planner tests**

Run: `bun run test __tests__/apps/planner`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/planner/src/store __tests__/apps/planner
git commit -m "feat(planner): upgrade stored drill thumbnails to 2x once"
```

---

### Task 6: Print never below 2×, and a sharp legend

**Files:**
- Modify: `components/features/practice-planner/print/PrintDiagram.tsx` (`printPixelRatio`, ~26-30)
- Modify: `components/features/practice-planner/PlayLegend.tsx` (`LegendSwatch`, ~14-21)
- Test: `__tests__/components/features/practice-planner/print/PrintDiagram.test.tsx` (or wherever `printPixelRatio` is tested: `rtk proxy grep -rln "printPixelRatio" __tests__`), `__tests__/components/features/practice-planner/PlayLegend.test.tsx`

**Interfaces:**
- Consumes: `backingPixelRatio` (Task 1)
- Produces: `printPixelRatio(count)` returns 3 for count ≤ 24, else 2

- [ ] **Step 1: Write the failing tests**

Replace the existing `printPixelRatio` expectations with:

```ts
it.each([[1, 3], [12, 3], [24, 3], [25, 2], [40, 2], [41, 2], [200, 2]])("%s diagrams print at %s×", (count, ratio) => {
    expect(printPixelRatio(count)).toBe(ratio);
});
```

Add to `PlayLegend.test.tsx`:

```tsx
it("draws each swatch at the screen's pixel ratio", () => {
    Object.defineProperty(window, "devicePixelRatio", { value: 2, configurable: true });
    const { container } = render(<LegendSwatch entry={buildLegend(playDataWithASkate)[0]} />);
    const canvas = container.querySelector("canvas")!;
    expect([canvas.width, canvas.height]).toEqual([80, 40]);
    expect([canvas.style.width, canvas.style.height]).toEqual(["40px", "20px"]);
    Object.defineProperty(window, "devicePixelRatio", { value: 1, configurable: true });
});
```

Use the play data and `buildLegend` import the file already uses for its other swatch tests in place of `playDataWithASkate`.

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test __tests__/components/features/practice-planner/PlayLegend.test.tsx` and the printPixelRatio test file.
Expected: FAIL (41 → 1; swatch is 40×20).

- [ ] **Step 3: Implement**

`PrintDiagram.tsx`:

```ts
/**
 * Backing-store scale for a sheet with this many readable diagrams. Each 3×
 * diagram decodes to ~7.6 MiB and each 2× to ~3.4 MiB; big sessions drop to
 * 2×, never lower, so a printed diagram stays above ~190 dpi.
 */
export function printPixelRatio(readableCount: number): number {
    return readableCount <= 24 ? 3 : 2;
}
```

`PlayLegend.tsx`:

```tsx
export function LegendSwatch({ entry }: { entry: LegendEntry }) {
    const ref = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const canvas = ref.current;
        if (!canvas) return;
        const ratio = backingPixelRatio();
        sizeBackingStore(canvas, LEGEND_SWATCH_SIZE.width, LEGEND_SWATCH_SIZE.height, ratio);
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        paintLegendSwatch(ctx, entry);
    }, [entry]);
    return (
        <canvas
            ref={ref}
            width={LEGEND_SWATCH_SIZE.width}
            height={LEGEND_SWATCH_SIZE.height}
            aria-hidden="true"
            style={{ width: LEGEND_SWATCH_SIZE.width, height: LEGEND_SWATCH_SIZE.height }}
        />
    );
}
```

Print uses the screen's ratio here, and browsers print a canvas at its backing resolution, so on a retina Mac the printed legend is 2×. That is enough for a 40×20 symbol.

- [ ] **Step 4: Run the practice-planner tests**

Run: `bun run test __tests__/components/features/practice-planner`
Expected: PASS. If a BenchSheet test pins the 1× case for more than 40 drills, update it to 2×.

- [ ] **Step 5: Commit**

```bash
git add components/features/practice-planner/print/PrintDiagram.tsx components/features/practice-planner/PlayLegend.tsx __tests__/components/features/practice-planner
git commit -m "feat(practice-planner): print diagrams at 2x or better and draw sharp legends"
```

---

### Task 7: Verify on real screens and open the PR

**Files:** none changed (screenshots go in the PR, never in the repo)

- [ ] **Step 1: Full checks**

Run: `bun run type-check && bun run lint && bun run test && bun run planner:build && bun run planner:check`
Expected: all pass (lint warnings that existed before are fine; no new ones).

- [ ] **Step 2: Visual check at 1× and 2×**

Start `bun run planner:dev`. With the Playwright MCP browser, for device scale factor 1 and 2 (`browser_resize` plus a page reload with `deviceScaleFactor` through `browser_run_code_unsafe`, or the CDP emulation the browser-validation memory describes):
1. Library page: a starter card.
2. Edit a drill: the rink board, zoomed in once.
3. A practice's detail view: the preview and the sidebar cards.
4. The bench sheet print preview (`page.pdf` or print emulation) for a practice.

Save screenshots under `.playwright-mcp/` (git-ignored) and compare against `main`. Expected: identical layout and colors, visibly sharper lines and text at 2×.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin HEAD
gh pr create --base main --title "feat(practice-planner): draw rink diagrams at the screen's pixel ratio" --body-file -
```

The body lists the six surfaces changed, the 2× stored thumbnails and the one-time static refresh, the print floor, and that hosted library cards keep a 1× thumbnail until the drill is next saved (spec §1). Attach the 2× screenshots. End with the session attribution line.

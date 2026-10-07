# Rink Diagram Playbook Style (Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rink diagrams look like a polished playbook in the Digital Playbook palette (soft ice, double-line boards, faceoff hash marks, ringed and shadowed markers, netted goals, swept arrowheads, chip notes in Cabinet Grotesk), with every color, weight and font coming from one theme object.

**Architecture:** A new `lib/utils/canvas/diagram-theme.ts` holds every color and font the renderer uses; the renderer reads nothing hard-coded (a source-scan test guards it). The first task only moves today's values into the theme; later tasks change the look one area at a time. A small `diagram-fonts.ts` waits for Cabinet Grotesk before anything is stored or printed, and live canvases redraw once when it arrives.

**Tech Stack:** TypeScript, Canvas 2D, React 19 (hooks), Vitest (recorded or mocked contexts; no pixel tests), Playwright MCP for the visual check.

**Spec:** `docs/superpowers/specs/2026-10-06-rink-diagram-quality-design.md` §3 (Playbook style). Phases 1 (#421) and 2 (#423) are merged.

## Global Constraints

- Every color, weight and font the renderer draws with comes from `DIAGRAM_THEME` (`lib/utils/canvas/diagram-theme.ts`). Scope of the guard: `rink-renderer.ts`, `glyphs.ts`, `drawing-utils.ts`, `legend-swatch.ts`, `station-map.ts`.
- Meaning stays carried by `action` and `role`, never by color alone. Stored play data is not touched: element colors stored in plays are drawn as stored. (This is why the spec's darker stroke ink is not adopted: skate lines keep their stored `#212121`; re-coloring stored plays would need a migration for a barely visible change.)
- Sizes keep using the scale model: `refPx(px, pxPerFt)` for "px on the reference board", feet × `pxPerFt` for real dimensions. The legacy snapshot `__tests__/lib/utils/canvas/__snapshots__/stroke-geometry.legacy.test.ts.snap` must not change (it pins stroke geometry, which this phase does not touch). Never run Vitest with `-u` on it.
- Diagram font: `"Cabinet Grotesk", system-ui, sans-serif` (both apps already load Cabinet Grotesk: `app/globals.css`, `apps/planner/index.html`). Marker labels weight 800; notes weight 600.
- Font wait: before generating anything stored or printed, await `waitForDiagramFont()` (resolves on load, failure or after 1500 ms; never rejects), the pattern `waitForCrestFont` (`lib/utils/canvas/crest-png.ts`) already uses.
- Gradients are optional: a context whose `createRadialGradient` is missing or returns an object without `addColorStop` (recorded and mocked test contexts) gets the flat ice color.
- `lib/utils/canvas/` stays free of server and Next imports. No new dependency.
- Always `bun`. Before each commit: `bun run type-check` (check its exit code, not piped), `bun run lint` (no new warnings), and the touched tests.
- Updating an existing test because it pinned an old color or call sequence is expected in tasks 3–5; ledger each such update.
- Commits end with the session attribution line the harness supplies.

## Review Focus

1. **Cabinet Grotesk fails to load (offline, blocked font CDN):** stored and printed diagrams still render, with the system-ui fallback, after at most 1.5 s; nothing hangs. Pinned in Task 2.
2. **A context without gradient support:** the ice is filled flat instead of throwing. Pinned in Task 3.
3. **A player with a custom stored color (any hex):** the marker uses it; the white ring and shadow don't hide it, and the label keeps contrast. Pinned in Task 4.
4. **Dark mode:** the board stays light (the ice is light in both schemes); the new theme must not read `prefers-color-scheme`. Pinned in Task 1 (the theme is a static object).
5. **A net rotated 90° or 270° (small-area nets):** the frame and mesh rotate with it. Pinned in Task 4.

---

## File Structure

| File | Responsibility |
|---|---|
| Create `lib/utils/canvas/diagram-theme.ts` | `DIAGRAM_THEME`: every color and font the renderer uses |
| Create `lib/utils/canvas/diagram-fonts.ts` | `DIAGRAM_FONT_FAMILY`, `diagramFont(weight, px)`, `waitForDiagramFont`, `onDiagramFontLoaded` |
| Create `lib/hooks/useDiagramFontVersion.ts` | A number that changes when the diagram font finishes loading, for live canvases' redraw deps |
| Modify `lib/utils/canvas/rink-renderer.ts` | Ice, boards, markings, hash marks, creases from the theme |
| Modify `lib/utils/canvas/glyphs.ts` | Markers and equipment from the theme; label font |
| Modify `lib/utils/canvas/drawing-utils.ts` | Arrowheads, notes, mask, selection from the theme |
| Modify `lib/utils/canvas/legend-swatch.ts`, `station-map.ts` | Theme colors and font |
| Modify `components/features/practice-planner/RinkBoard.tsx`, `PlayDiagram.tsx`, `StationMap.tsx`, `PlayLegend.tsx` | Redraw when the font arrives |
| Modify `components/features/practice-planner/PlayEditor.tsx`, `PlayLibrary.tsx`, `print/PrintDiagram.tsx`, `export/export-bench-sheet.ts`, `apps/planner/src/main.tsx` | Wait for the font before stored or printed drawing |

---

### Task 1: The theme object, with today's values, and a guard against hard-coded colors

**Files:**
- Create: `lib/utils/canvas/diagram-theme.ts`
- Modify: `lib/utils/canvas/rink-renderer.ts`, `glyphs.ts`, `drawing-utils.ts`, `legend-swatch.ts`, `station-map.ts` (every color/font literal)
- Test: `__tests__/lib/utils/canvas/diagram-theme.test.ts`

**Interfaces:**
- Produces: `DIAGRAM_THEME` (a frozen `as const` object). Keys introduced here (values = today's, so this task changes nothing visible):

```ts
// lib/utils/canvas/diagram-theme.ts
/**
 * Every color and font the rink renderer uses (rink diagram quality spec §3).
 * The board is drawn light in both color schemes, so this is a static object:
 * it never reads prefers-color-scheme. No server or Next imports.
 */
import { BOARD_COLORS } from "./notation";

export const DIAGRAM_THEME = {
    /** Canvas outside the rink */
    surround: "#FFFFFF",
    ice: "#E8F4F8",
    boards: "#000000",
    redLine: "#C8102E",
    blueLine: "#003087",
    creaseFill: "rgba(200, 16, 46, 0.1)",
    /** Ink for pucks, outlines and the default text color */
    ink: BOARD_COLORS.ink,
    /** Shading over ice outside a drill's area */
    areaMask: "rgba(33, 33, 33, 0.35)",
    selection: "#FFD700",
    selectionFill: "rgba(255, 215, 0, 0.3)",
    noteChip: "rgba(255, 255, 255, 0.8)",
    snapRingHalo: "#FFFFFF",
    cone: "#F57C00",
    net: BOARD_COLORS.penaltyRed,
    /** Marker label text on a light fill */
    labelOnLight: BOARD_COLORS.ink,
    /** Marker label text on a dark fill */
    labelOnDark: "#FFFFFF",
    /** The ring player's (opponent's) fill */
    ringFill: "#FFFFFF",
    labelFont: `"Source Sans 3", system-ui, sans-serif`,
    noteFont: "Arial",
} as const;
```

  Add any further literal you find in the five files under a descriptive key (for example station-map's label colors and fonts) with its current value. `ICE_COLOR` in `rink-renderer.ts` stays exported as `export const ICE_COLOR = DIAGRAM_THEME.ice;` (the line-editing color notes refer to it).

- [ ] **Step 1: Write the failing guard test**

```ts
// __tests__/lib/utils/canvas/diagram-theme.test.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DIAGRAM_THEME } from "@/lib/utils/canvas/diagram-theme";

const RENDERER_FILES = ["rink-renderer.ts", "glyphs.ts", "drawing-utils.ts", "legend-swatch.ts", "station-map.ts"];

/** Source with comments removed, so documentation may still name colors. */
function code(file: string): string {
    return readFileSync(join(process.cwd(), "lib/utils/canvas", file), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("diagram theme", () => {
    it.each(RENDERER_FILES)("%s draws with theme colors only: no hex or rgb literals", (file) => {
        expect(code(file).match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) ?? []).toEqual([]);
    });

    it.each(RENDERER_FILES)("%s takes its fonts from the theme", (file) => {
        expect(code(file).match(/"Source Sans 3"|\bArial\b|sans-serif/g) ?? []).toEqual([]);
    });

    it("is a static object: the board is light in both color schemes", () => {
        expect(JSON.stringify(DIAGRAM_THEME)).not.toMatch(/prefers-color-scheme|var\(--/);
        expect(DIAGRAM_THEME.ice).toMatch(/^#/);
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test __tests__/lib/utils/canvas/diagram-theme.test.ts`
Expected: FAIL (module missing; then literal matches in the renderer files).

- [ ] **Step 3: Create the theme and move every literal into it**

Create `diagram-theme.ts` as above. In each of the five files, replace each literal with its theme key: for example `ctx.fillStyle = "#FFFFFF";` (the surround fills in `drawRink` and `drawRinkBackground`) → `DIAGRAM_THEME.surround`; `ICE_COLOR` → `DIAGRAM_THEME.ice`; `"#000000"` → `DIAGRAM_THEME.boards`; `"#C8102E"` → `DIAGRAM_THEME.redLine`; `"#003087"` → `DIAGRAM_THEME.blueLine`; `"rgba(200, 16, 46, 0.1)"` → `DIAGRAM_THEME.creaseFill`; `SELECTION_COLOR` constants → `DIAGRAM_THEME.selection`; `"rgba(255, 215, 0, 0.3)"` → `DIAGRAM_THEME.selectionFill`; `"rgba(255, 255, 255, 0.8)"` → `DIAGRAM_THEME.noteChip`; `SNAP_RING_HALO` → `DIAGRAM_THEME.snapRingHalo`; `AREA_MASK_FILL` → `DIAGRAM_THEME.areaMask`; `"#F57C00"` → `DIAGRAM_THEME.cone`; the net's `BOARD_COLORS.penaltyRed` → `DIAGRAM_THEME.net`; `contrastText`'s `"#FFFFFF"` → `DIAGRAM_THEME.labelOnDark` and its ink → `DIAGRAM_THEME.labelOnLight`; the ring's `"#FFFFFF"` fill → `DIAGRAM_THEME.ringFill`; `FONT_FAMILY` → `DIAGRAM_THEME.labelFont`; `` `${scaledFontSize}px Arial` `` → `` `${scaledFontSize}px ${DIAGRAM_THEME.noteFont}` ``. Keep `BOARD_COLORS` references (role colors, ink) where they are role vocabulary, not literals.

- [ ] **Step 4: Run the canvas and practice-planner tests**

Run: `bun run test __tests__/lib/utils/canvas __tests__/components/features/practice-planner`
Expected: PASS with no other test changes (every value is unchanged).

- [ ] **Step 5: Commit**

```bash
git add lib/utils/canvas __tests__/lib/utils/canvas/diagram-theme.test.ts
git commit -m "refactor(practice-planner): draw rink diagrams from one theme object"
```

---

### Task 2: Cabinet Grotesk for labels and notes, waited for before anything is stored or printed

**Files:**
- Create: `lib/utils/canvas/diagram-fonts.ts`, `lib/hooks/useDiagramFontVersion.ts`
- Modify: `lib/utils/canvas/diagram-theme.ts` (fonts), `glyphs.ts` and `drawing-utils.ts` (use `diagramFont`)
- Modify: `components/features/practice-planner/PlayEditor.tsx` (~283), `PlayLibrary.tsx` (`handleAddStarter`), `print/PrintDiagram.tsx`, `export/export-bench-sheet.ts` (~38), `apps/planner/src/main.tsx` (`boot`)
- Modify: `components/features/practice-planner/RinkBoard.tsx`, `PlayDiagram.tsx`, `StationMap.tsx`, `PlayLegend.tsx` (redraw deps)
- Test: `__tests__/lib/utils/canvas/diagram-fonts.test.ts`, `__tests__/lib/hooks/useDiagramFontVersion.test.tsx`, plus one assertion each in the PlayEditor and PrintDiagram tests

**Interfaces:**
- Produces:
  - `DIAGRAM_FONT_FAMILY = '"Cabinet Grotesk", system-ui, sans-serif'`
  - `diagramFont(weight: 600 | 800, px: number): string` → `` `${weight} ${px}px ${DIAGRAM_FONT_FAMILY}` ``
  - `DIAGRAM_FONT_WAIT_MS = 1500`
  - `waitForDiagramFont(timeoutMs = DIAGRAM_FONT_WAIT_MS): Promise<void>` (loads both weights; resolves on load, failure or timeout; never rejects; resolves at once without the Font Loading API)
  - `onDiagramFontLoaded(listener: () => void): () => void` (subscribes to `document.fonts` `loadingdone`; no-op without the API)
  - `useDiagramFontVersion(): number`

- [ ] **Step 1: Write the failing tests**

```ts
// __tests__/lib/utils/canvas/diagram-fonts.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { DIAGRAM_FONT_FAMILY, diagramFont, onDiagramFontLoaded, waitForDiagramFont } from "@/lib/utils/canvas/diagram-fonts";

const setFonts = (fonts: unknown) => Object.defineProperty(document, "fonts", { value: fonts, configurable: true });

describe("diagram fonts", () => {
    afterEach(() => {
        vi.useRealTimers();
        setFonts(undefined);
    });

    it("names Cabinet Grotesk with a system fallback", () => {
        expect(DIAGRAM_FONT_FAMILY).toBe('"Cabinet Grotesk", system-ui, sans-serif');
        expect(diagramFont(800, 10.5)).toBe('800 10.5px "Cabinet Grotesk", system-ui, sans-serif');
    });

    it("loads both weights and resolves when they arrive", async () => {
        const load = vi.fn(() => Promise.resolve([]));
        setFonts({ load });
        await waitForDiagramFont();
        expect(load.mock.calls.map((c) => c[0])).toEqual([diagramFont(800, 16), diagramFont(600, 16)]);
    });

    it("resolves, never rejects, when the font fails to load", async () => {
        setFonts({ load: () => Promise.reject(new Error("blocked")) });
        await expect(waitForDiagramFont()).resolves.toBeUndefined();
    });

    it("gives up after the timeout so a blocked font CDN never hangs a print", async () => {
        vi.useFakeTimers();
        setFonts({ load: () => new Promise(() => undefined) });
        const done = vi.fn();
        void waitForDiagramFont(1500).then(done);
        await vi.advanceTimersByTimeAsync(1499);
        expect(done).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(done).toHaveBeenCalled();
    });

    it("resolves at once without the Font Loading API", async () => {
        setFonts(undefined);
        await expect(waitForDiagramFont()).resolves.toBeUndefined();
    });

    it("tells live canvases when fonts finish loading, and unsubscribes", () => {
        const listeners = new Set<() => void>();
        setFonts({ load: vi.fn(), addEventListener: (_: string, fn: () => void) => listeners.add(fn), removeEventListener: (_: string, fn: () => void) => listeners.delete(fn) });
        const onLoaded = vi.fn();
        const stop = onDiagramFontLoaded(onLoaded);
        for (const fn of listeners) fn();
        expect(onLoaded).toHaveBeenCalledTimes(1);
        stop();
        expect(listeners.size).toBe(0);
    });
});
```

```tsx
// __tests__/lib/hooks/useDiagramFontVersion.test.tsx
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useDiagramFontVersion } from "@/lib/hooks/useDiagramFontVersion";

describe("useDiagramFontVersion", () => {
    it("changes when the diagram font finishes loading", () => {
        const listeners = new Set<() => void>();
        Object.defineProperty(document, "fonts", {
            value: { load: () => Promise.resolve([]), addEventListener: (_: string, fn: () => void) => listeners.add(fn), removeEventListener: (_: string, fn: () => void) => listeners.delete(fn) },
            configurable: true,
        });
        const { result } = renderHook(() => useDiagramFontVersion());
        const before = result.current;
        act(() => { for (const fn of listeners) fn(); });
        expect(result.current).not.toBe(before);
        Object.defineProperty(document, "fonts", { value: undefined, configurable: true });
    });
});
```

In the existing PlayEditor test that saves a play (`__tests__/components/features/practice-planner/PlayEditor.test.tsx`, "calls onSave with correct data…"), add a mock of `@/lib/utils/canvas/diagram-fonts` with `waitForDiagramFont: vi.fn(() => Promise.resolve())` (keep the module's other exports via `importOriginal`) and assert it was called before `generateThumbnail`:

```ts
expect(vi.mocked(waitForDiagramFont).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(generateThumbnail).mock.invocationCallOrder[0]);
```

In `__tests__/components/features/practice-planner/print/PrintDiagram.test.tsx`, add a test that, with `waitForDiagramFont` mocked to a pending promise, the component shows the busy "Rendering diagram…" box and does not call `generateThumbnail`; after resolving it (inside `act`), the image renders.

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test __tests__/lib/utils/canvas/diagram-fonts.test.ts __tests__/lib/hooks/useDiagramFontVersion.test.tsx __tests__/components/features/practice-planner/PlayEditor.test.tsx __tests__/components/features/practice-planner/print/PrintDiagram.test.tsx`
Expected: FAIL (modules missing; no wait before generation).

- [ ] **Step 3: Implement the font module and hook**

```ts
// lib/utils/canvas/diagram-fonts.ts
/**
 * The diagram font (rink diagram quality spec §3). A canvas draws with
 * whatever face is ready, so anything stored or printed waits for Cabinet
 * Grotesk first, and live canvases redraw once when it arrives. No server or
 * Next imports.
 */

export const DIAGRAM_FONT_FAMILY = '"Cabinet Grotesk", system-ui, sans-serif';

/** How long stored or printed drawing waits for the font before using the fallback. */
export const DIAGRAM_FONT_WAIT_MS = 1500;

export function diagramFont(weight: 600 | 800, px: number): string {
    return `${weight} ${px}px ${DIAGRAM_FONT_FAMILY}`;
}

type FontFaces = { load?: (font: string) => Promise<unknown>; addEventListener?: (type: string, fn: () => void) => void; removeEventListener?: (type: string, fn: () => void) => void };

function faces(): FontFaces | undefined {
    return typeof document === "undefined" ? undefined : (document.fonts as unknown as FontFaces | undefined);
}

/** Resolves once both weights have loaded, failed, or taken longer than `timeoutMs`; never rejects. */
export function waitForDiagramFont(timeoutMs: number = DIAGRAM_FONT_WAIT_MS): Promise<void> {
    const fonts = faces();
    if (typeof fonts?.load !== "function") return Promise.resolve();
    return new Promise((resolve) => {
        const done = () => {
            clearTimeout(timer);
            resolve();
        };
        const timer = setTimeout(done, timeoutMs);
        try {
            Promise.all([fonts.load!(diagramFont(800, 16)), fonts.load!(diagramFont(600, 16))]).then(done, done);
        } catch {
            done();
        }
    });
}

/** Calls `listener` whenever the page finishes loading fonts; returns the unsubscribe. */
export function onDiagramFontLoaded(listener: () => void): () => void {
    const fonts = faces();
    if (typeof fonts?.addEventListener !== "function") return () => undefined;
    fonts.addEventListener("loadingdone", listener);
    return () => fonts.removeEventListener?.("loadingdone", listener);
}
```

```ts
// lib/hooks/useDiagramFontVersion.ts
"use client";

import { useEffect, useState } from "react";
import { onDiagramFontLoaded } from "@/lib/utils/canvas/diagram-fonts";

/** A number that changes when the diagram font finishes loading: add it to a live canvas's redraw deps. */
export function useDiagramFontVersion(): number {
    const [version, setVersion] = useState(0);
    useEffect(() => onDiagramFontLoaded(() => setVersion((v) => v + 1)), []);
    return version;
}
```

- [ ] **Step 4: Use the font in the renderer**

- `diagram-theme.ts`: replace `labelFont` and `noteFont` with `font: DIAGRAM_FONT_FAMILY` (import it from `./diagram-fonts`); update Task 1's font-guard test expectation if needed (it already forbids the old names).
- `glyphs.ts` `fitText`: `ctx.font = \`800 ${size}px ${FONT_FAMILY}\`` → `ctx.font = diagramFont(800, size)` (both places).
- `drawing-utils.ts` `drawTextAnnotation`: `ctx.font = \`${scaledFontSize}px ${...}\`` → `ctx.font = diagramFont(600, scaledFontSize)` (both places).
- `station-map.ts`: its label fonts use `diagramFont` with their current weights mapped to 600 (body) and 800 (bold).

- [ ] **Step 5: Wait before stored or printed drawing**

- `PlayEditor.tsx`, inside the save `try` before `generateThumbnail`: `await waitForDiagramFont();`
- `PlayLibrary.tsx` `handleAddStarter`: `await waitForDiagramFont();` before `store.createPlay({ ... thumbnail: storedStarterThumbnail(starter) ... })`.
- `export/export-bench-sheet.ts`, next to the crest wait: `await waitForDiagramFont();` before `buildBenchSheetModel(...)`.
- `apps/planner/src/main.tsx` `boot`: `await waitForDiagramFont();` before `openPlannerStore(...)` (seeding and the thumbnail refresh draw stored thumbnails).
- `print/PrintDiagram.tsx`: hold the diagram until the font is ready:

```tsx
    const mounted = useMounted();
    const [fontReady, setFontReady] = useState(false);
    useEffect(() => {
        let live = true;
        void waitForDiagramFont().then(() => { if (live) setFontReady(true); });
        return () => { live = false; };
    }, []);
    const diagram = useMemo(
        () => (mounted && fontReady && playData ? renderDiagram(playData, name, pixelRatio) : null),
        [mounted, fontReady, playData, name, pixelRatio]
    );
```

- [ ] **Step 6: Redraw live canvases when the font arrives**

Add `const fontVersion = useDiagramFontVersion();` and include `fontVersion` in the draw effect's dependency list in `PlayDiagram.tsx`, `StationMap.tsx` and `PlayLegend.tsx`'s `LegendSwatch`, and in `RinkBoard.tsx`'s `render` `useCallback` deps.

- [ ] **Step 7: Run the tests**

Run: `bun run test __tests__/lib __tests__/components/features/practice-planner __tests__/apps/planner __tests__/app`
Expected: PASS. Glyph and note tests that pinned the old font string are updated to `diagramFont(...)` (ledger them). The bench sheet's diagrams now appear one tick later (after the font wait, which resolves at once in jsdom): print and export tests that expected the `<img>` synchronously switch to `await screen.findBy…` (ledger them).

- [ ] **Step 8: Commit**

```bash
git add lib components apps __tests__
git commit -m "feat(practice-planner): draw diagram labels and notes in Cabinet Grotesk"
```

---

### Task 3: Ice, boards and markings

**Files:**
- Modify: `lib/utils/canvas/diagram-theme.ts` (values), `lib/utils/canvas/rink-renderer.ts` (`drawIceSurface`, `drawBoards`, `drawFaceoffCircles`, `drawGoalCreases`, line colors)
- Test: `__tests__/lib/utils/canvas/rink-renderer-style.test.ts` (new); update color assertions in existing rink-renderer tests

**Interfaces:**
- Consumes: `DIAGRAM_THEME` (Task 1), `refPx` (`./scale`)
- Produces: theme values and new keys:

```ts
    ice: "#F4F9FC",
    iceCenter: "#FFFFFF",
    /** Inner shadow along the boards, 1.5 ft wide */
    iceEdgeShadow: "rgba(13, 71, 161, 0.08)",
    boards: BOARD_COLORS.leagueBlue,
    /** The lighter inner kick plate inside the boards line */
    kickPlate: "#B3C7E6",
    redLine: "#C8102E",
    blueLine: BOARD_COLORS.leagueBlue,
    creaseFill: "rgba(155, 198, 232, 0.6)",
```

- [ ] **Step 1: Write the failing tests**

```ts
// __tests__/lib/utils/canvas/rink-renderer-style.test.ts
import { describe, expect, it, vi } from "vitest";
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

    it("adds hash marks to the four end-zone faceoff circles", () => {
        const { ctx, calls } = recordingCtx(false);
        drawRink(ctx, board, { cache: false });
        // Two marks on each side of each circle: 4 circles × 2 sides × 2 marks.
        const hashes = calls.filter((c, i) => c.name === "moveTo" && c.state.strokeStyle === DIAGRAM_THEME.redLine && calls[i + 1]?.name === "lineTo"
            && Math.abs((calls[i + 1].args[1] as number) - (c.args[1] as number)) < 1e-9 && Math.abs((calls[i + 1].args[0] as number) - (c.args[0] as number)) < 2 * 3.8 + 1e-9);
        expect(hashes.length).toBe(16);
    });

    it("fills the creases light blue", () => {
        const { ctx, calls } = recordingCtx(false);
        drawRink(ctx, board, { cache: false });
        expect(calls.some((c) => c.name === "fill" && c.state.fillStyle === DIAGRAM_THEME.creaseFill)).toBe(true);
    });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test __tests__/lib/utils/canvas/rink-renderer-style.test.ts`
Expected: FAIL (no gradient, single boards line, no shadow, no hash marks; theme keys missing).

- [ ] **Step 3: Implement**

Update the theme values and add the keys above. In `rink-renderer.ts`:

```ts
/** A radial fill when the context supports it; otherwise null (recorded and mocked test contexts). */
function radialFill(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, inner: string, outer: string): CanvasGradient | null {
    if (typeof ctx.createRadialGradient !== "function") return null;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r) as CanvasGradient | undefined;
    if (!g || typeof g.addColorStop !== "function") return null;
    g.addColorStop(0, inner);
    g.addColorStop(1, outer);
    return g;
}

function drawIceSurface(ctx: CanvasRenderingContext2D, transform: TransformContext): void {
    const o = rinkOutline(transform);
    const center = { x: o.x + o.width / 2, y: o.y + o.height / 2 };
    ctx.fillStyle = radialFill(ctx, center.x, center.y, o.width / 2, DIAGRAM_THEME.iceCenter, DIAGRAM_THEME.ice) ?? DIAGRAM_THEME.ice;
    traceRinkOutline(ctx, transform);
    ctx.fill();
    // A soft inner shadow along the boards: a wide stroke of the outline, clipped to the ice.
    ctx.save();
    traceRinkOutline(ctx, transform);
    ctx.clip();
    ctx.strokeStyle = DIAGRAM_THEME.iceEdgeShadow;
    ctx.lineWidth = 3 * transform.scaleX; // 1.5 ft inside the clip
    traceRinkOutline(ctx, transform);
    ctx.stroke();
    ctx.restore();
}

function drawBoards(ctx: CanvasRenderingContext2D, transform: TransformContext): void {
    const outer = refPx(3, transform.scaleX);
    ctx.strokeStyle = DIAGRAM_THEME.boards;
    ctx.lineWidth = outer;
    traceRinkOutline(ctx, transform);
    ctx.stroke();
    // The kick plate: a lighter line just inside the boards.
    const inset = outer / 2 + refPx(1, transform.scaleX) / 2;
    const o = rinkOutline(transform);
    ctx.strokeStyle = DIAGRAM_THEME.kickPlate;
    ctx.lineWidth = refPx(1, transform.scaleX);
    ctx.beginPath();
    ctx.roundRect(o.x + inset, o.y + inset, o.width - 2 * inset, o.height - 2 * inset, Math.max(0, o.radius - inset));
    ctx.stroke();
}
```

Hash marks, at the end of `drawFaceoffCircles` for each of the four circle centers (`radius` = the faceoff radius in px, `ft = transform.scaleX`):

```ts
    // Hash marks: two 2 ft marks on each side of each circle, 1.5 ft above and below its center line.
    for (const center of centers) {
        for (const side of [-1, 1]) {
            for (const dy of [-1.5, 1.5]) {
                const x0 = center.x + side * radius;
                ctx.beginPath();
                ctx.moveTo(x0, center.y + dy * ft);
                ctx.lineTo(x0 + side * 2 * ft, center.y + dy * ft);
                ctx.stroke();
            }
        }
    }
```

(Use the function's existing list of the four end-zone circle centers; if it computes them inline, gather them into `centers` first.) The creases already fill with `DIAGRAM_THEME.creaseFill`; the new value makes them light blue.

- [ ] **Step 4: Run the canvas tests**

Run: `bun run test __tests__/lib/utils/canvas __tests__/components/features/practice-planner`
Expected: PASS after updating existing assertions that pinned old colors or call counts (for example a count of `stroke` calls in `drawRink`); ledger each. The legacy snapshot is unchanged.

- [ ] **Step 5: Commit**

```bash
git add lib/utils/canvas __tests__/lib/utils/canvas
git commit -m "feat(practice-planner): playbook ice, boards and markings"
```

---

### Task 4: Player markers and equipment

**Files:**
- Modify: `lib/utils/canvas/diagram-theme.ts`, `lib/utils/canvas/glyphs.ts`
- Test: `__tests__/lib/utils/canvas/glyphs.test.ts`

**Interfaces:**
- Consumes: `DIAGRAM_THEME` (Task 1)
- Produces: theme keys

```ts
    /** The white inner ring on a filled marker */
    markerRing: "#FFFFFF",
    /** A marker's soft drop shadow */
    markerShadow: "rgba(26, 36, 51, 0.2)",
    coneShade: "#FFB74D",
    netMesh: "rgba(211, 47, 47, 0.35)",
    puckRim: "#616161",
```

- [ ] **Step 1: Write the failing tests**

Add to `__tests__/lib/utils/canvas/glyphs.test.ts`, with a recording context that records each call with the style in effect (copy `recordingCtx` from Task 3's test into this file, without the gradient option):

```ts
describe("playbook markers (spec §3)", () => {
    const at = { x: 100, y: 100 };
    const player = (color: string, role: "F" | "O" | "G" = "F") => ({ id: "p", role, label: "F1", color, position: { x: 0, y: 0 } });

    it("draws a soft shadow below and offset from the marker, before the marker", () => {
        const { ctx, calls } = recordingCtx();
        drawPlayerGlyph(ctx, player("#1976D2"), at, 20, false, 1);
        const shadow = calls.findIndex((c) => c.name === "fill" && c.state.fillStyle === DIAGRAM_THEME.markerShadow);
        const body = calls.findIndex((c) => c.name === "fill" && c.state.fillStyle === "#1976D2");
        expect(shadow).toBeGreaterThanOrEqual(0);
        expect(shadow).toBeLessThan(body);
        const shadowArc = calls.slice(0, shadow).reverse().find((c) => c.name === "arc")!;
        expect(shadowArc.args[0] as number).toBeGreaterThan(at.x);
        expect(shadowArc.args[1] as number).toBeGreaterThan(at.y);
    });

    it("rings a filled marker in white inside its outline, keeping a custom color visible", () => {
        const { ctx, calls } = recordingCtx();
        drawPlayerGlyph(ctx, player("#7B1FA2"), at, 20, false, 1);
        expect(calls.some((c) => c.name === "fill" && c.state.fillStyle === "#7B1FA2")).toBe(true);
        const ring = calls.find((c) => c.name === "stroke" && c.state.strokeStyle === DIAGRAM_THEME.markerRing);
        expect(ring).toBeDefined();
        expect(ring!.state.lineWidth).toBeCloseTo(20 * 0.08);
    });

    it("keeps the label readable on a custom color", () => {
        const { ctx, calls } = recordingCtx();
        drawPlayerGlyph(ctx, player("#FFEB3B"), at, 20, false, 1); // a light fill
        expect(calls.find((c) => c.name === "fillText")!.state.fillStyle).toBe(DIAGRAM_THEME.labelOnLight);
    });

    it("draws a net as a frame with a mesh, rotated with the net", () => {
        for (const rotation of [0, 90, 180, 270]) {
            const { ctx, calls } = recordingCtx();
            drawEquipmentGlyph(ctx, { kind: "net", rotation }, at, 12, false, 1);
            expect(calls.find((c) => c.name === "rotate")!.args[0]).toBeCloseTo((rotation * Math.PI) / 180);
            expect(calls.some((c) => c.name === "stroke" && c.state.strokeStyle === DIAGRAM_THEME.net)).toBe(true);
            expect(calls.filter((c) => c.name === "stroke" && c.state.strokeStyle === DIAGRAM_THEME.netMesh).length).toBeGreaterThanOrEqual(3);
        }
    });

    it("shades a cone and rims a puck", () => {
        const cone = recordingCtx();
        drawEquipmentGlyph(cone.ctx, { kind: "cone", rotation: 0 }, at, 12, false, 1);
        expect(cone.calls.some((c) => c.name === "fill" && c.state.fillStyle === DIAGRAM_THEME.coneShade)).toBe(true);
        const puck = recordingCtx();
        drawEquipmentGlyph(puck.ctx, { kind: "puck", rotation: 0 }, at, 12, false, 1);
        expect(puck.calls.some((c) => c.name === "stroke" && c.state.strokeStyle === DIAGRAM_THEME.puckRim)).toBe(true);
    });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test __tests__/lib/utils/canvas/glyphs.test.ts`
Expected: FAIL (no shadow, ring, mesh, shade or rim).

- [ ] **Step 3: Implement**

Add the theme keys. In `glyphs.ts` `drawPlayerGlyph`, before the shape switch:

```ts
    // A soft drop shadow: the marker's silhouette, offset down and right by 0.4 ft (≈ 0.07 r).
    const off = r * 0.07;
    ctx.fillStyle = DIAGRAM_THEME.markerShadow;
    ctx.beginPath();
    ctx.arc(c.x + off, c.y + off, r, 0, Math.PI * 2);
    ctx.fill();
```

In the `disc`/`goalie` case, after `ctx.fill(); ctx.stroke();`, draw the inner ring:

```ts
            ctx.strokeStyle = DIAGRAM_THEME.markerRing;
            ctx.lineWidth = r * 0.08;
            ctx.beginPath();
            ctx.arc(c.x, c.y, r * 0.86, 0, Math.PI * 2);
            ctx.stroke();
```

(The triangle coach and the ring opponent keep their shapes; the shadow applies to all.) Keep `contrastText` for the label color.

In `drawEquipmentGlyph`:

- `puck`: after the fill, `ctx.strokeStyle = DIAGRAM_THEME.puckRim; ctx.lineWidth = outline(r, 0.1, 1, scale); ctx.stroke();` on the same arc.
- `cone`/`pylon`: after the body fill, fill the left half lighter:

```ts
            ctx.fillStyle = DIAGRAM_THEME.coneShade;
            ctx.beginPath();
            ctx.moveTo(c.x, c.y - r);
            ctx.lineTo(c.x, c.y + r * 0.8);
            ctx.lineTo(c.x - w, c.y + r * 0.8);
            ctx.closePath();
            ctx.fill();
```

- `net`: keep the rotation; draw the frame (posts and back) in `DIAGRAM_THEME.net`, then three mesh lines across the inside in `DIAGRAM_THEME.netMesh` with a thinner width:

```ts
        case "net":
            ctx.save();
            ctx.translate(c.x, c.y);
            ctx.rotate((item.rotation * Math.PI) / 180);
            ctx.strokeStyle = DIAGRAM_THEME.net;
            ctx.beginPath();
            ctx.moveTo(-r * 0.4, -r);
            ctx.lineTo(r * 0.4, -r);
            ctx.lineTo(r * 0.4, r);
            ctx.lineTo(-r * 0.4, r);
            ctx.stroke();
            ctx.strokeStyle = DIAGRAM_THEME.netMesh;
            ctx.lineWidth = outline(r, 0.06, 0.75, scale);
            for (const t of [-0.5, 0, 0.5]) {
                ctx.beginPath();
                ctx.moveTo(-r * 0.4, t * r);
                ctx.lineTo(r * 0.4, t * r);
                ctx.stroke();
            }
            ctx.restore();
            break;
```

- [ ] **Step 4: Run the canvas and practice-planner tests**

Run: `bun run test __tests__/lib/utils/canvas __tests__/components/features/practice-planner`
Expected: PASS after updating existing glyph assertions that pinned the old call sequence (first `fill` color, `arc` counts); ledger each. Legacy snapshot unchanged.

- [ ] **Step 5: Commit**

```bash
git add lib/utils/canvas __tests__/lib/utils/canvas
git commit -m "feat(practice-planner): playbook markers and equipment"
```

---

### Task 5: Swept arrowheads, chip notes and a softer area mask

**Files:**
- Modify: `lib/utils/canvas/diagram-theme.ts`, `lib/utils/canvas/drawing-utils.ts` (`drawArrowHead`, `drawTextAnnotation`, area mask)
- Test: `__tests__/lib/utils/canvas/drawing-utils.test.ts`

**Interfaces:**
- Consumes: `DIAGRAM_THEME`, `diagramFont` (Tasks 1–2), `refPx`
- Produces: theme values `noteChip: "rgba(255, 255, 255, 0.9)"`, `areaMask: "rgba(33, 33, 33, 0.22)"`; `ARROW_NOTCH = 0.7` (the notch's distance from the tip, as a fraction of the head length)

- [ ] **Step 1: Write the failing tests**

Add to `__tests__/lib/utils/canvas/drawing-utils.test.ts`:

```ts
describe("playbook strokes and notes (spec §3)", () => {
    it("draws a swept arrowhead: tip, corner, a notch on the line, corner", () => {
        const calls: Call[] = [];
        const geometry = buildStrokeGeometry({ action: "skate", path: "straight", end: "arrow", points: [{ x: 0, y: 0 }, { x: 200, y: 0 }], strokeWidth: 2 }, 3.8);
        paintStrokeGeometry(recordingCtx(calls), geometry, "#000", 3.8);
        const head = calls.findIndex((c, i) => c.name === "moveTo" && calls[i + 4]?.name === "closePath");
        expect(head).toBeGreaterThanOrEqual(0);
        const [tip, left, notch, right] = [0, 1, 2, 3].map((k) => calls[head + k].args as number[]);
        expect(notch[1]).toBeCloseTo(0); // on the line
        expect(tip[0] - notch[0]).toBeCloseTo(10 * 0.7); // 10 px head at the reference scale
        expect(left[1]).toBeCloseTo(-right[1]); // symmetric
    });

    it("draws a note on a rounded white chip in the diagram font", () => {
        const calls: Call[] = [];
        const ctx = recordingCtx(calls);
        drawTextAnnotation(ctx, { id: "n", text: "Hi", position: { x: 100, y: 40 }, fontSize: 6, color: "#000" }, createTransformContext(800, 400));
        expect(calls.some((c) => c.name === "roundRect")).toBe(true);
        expect((ctx as unknown as { font: string }).font).toBe(diagramFont(600, 6 * 3.8));
    });

    it("shades outside a drill's area more softly", () => {
        expect(DIAGRAM_THEME.areaMask).toBe("rgba(33, 33, 33, 0.22)");
    });
});
```

Import `diagramFont` from `@/lib/utils/canvas/diagram-fonts` and `DIAGRAM_THEME` from `@/lib/utils/canvas/diagram-theme`. Update the arrowhead-finding helpers in the phase 2 tests in this file (`arrowLength` in "stroke ends in proportion" and `measure` in "board minimums") to the new path shape: the head is `moveTo` followed by three `lineTo` and a `closePath`; the corner is still the call right after `moveTo`, so only the detection condition changes (`calls[i + 4]?.name === "closePath"`). Ledger it.

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test __tests__/lib/utils/canvas/drawing-utils.test.ts`
Expected: the three new tests FAIL.

- [ ] **Step 3: Implement**

Theme values as above. `drawArrowHead`, replacing the triangle:

```ts
/** The notch of a swept arrowhead, as a fraction of its length back from the tip. */
export const ARROW_NOTCH = 0.7;
```

```ts
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - headLength * Math.cos(angle - Math.PI / 6), to.y - headLength * Math.sin(angle - Math.PI / 6));
    // Swept back: the head's base dips toward the tip along the line.
    ctx.lineTo(to.x - headLength * ARROW_NOTCH * Math.cos(angle), to.y - headLength * ARROW_NOTCH * Math.sin(angle));
    ctx.lineTo(to.x - headLength * Math.cos(angle + Math.PI / 6), to.y - headLength * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
```

`drawTextAnnotation`: draw the background with a rounded rectangle of radius 0.3 ft:

```ts
    ctx.fillStyle = DIAGRAM_THEME.noteChip;
    ctx.beginPath();
    ctx.roundRect(canvasPos.x - pad, canvasPos.y - textHeight - pad, textWidth + 2 * pad, textHeight + 2 * pad, 0.3 * pxPerFt);
    ctx.fill();
```

(The selection highlight `fillRect` stays a rectangle.) The note font is already `diagramFont(600, …)` from Task 2.

- [ ] **Step 4: Run the canvas and practice-planner tests**

Run: `bun run test __tests__/lib/utils/canvas __tests__/components/features/practice-planner`
Expected: PASS; legacy snapshot unchanged. The phase 2 note-padding test reads the background from `fillRect`; update it to read the `roundRect` arguments (ledger it).

- [ ] **Step 5: Commit**

```bash
git add lib/utils/canvas __tests__/lib/utils/canvas
git commit -m "feat(practice-planner): swept arrowheads, chip notes and a softer area mask"
```

---

### Task 6: Tune by eye against main, then open the PR

**Files:** `lib/utils/canvas/diagram-theme.ts` only (values), if tuning calls for it

- [ ] **Step 1: Full checks**

Run: `bun run type-check; echo $?` (expect 0), `bun run lint` (no new warnings), `bun run test`, `bun run planner:build && bun run planner:check`. `git diff --stat main -- __tests__/lib/utils/canvas/__snapshots__` is empty.

- [ ] **Step 2: Side-by-side visual check**

Build `main` in a worktree (`git worktree add <scratch>/main-wt main`, symlink `node_modules`, run `bunx vite --config apps/planner/vite.config.ts --port 5174 --strictPort` there) and run `bun run planner:dev` on the branch. Never use `git stash`. With the Playwright MCP browser at device scale factor 2, for both, import the "8U Tag, Stops and Battles" template, save it, and capture: the editing board for Backward Tag, a library card, the session detail preview, the sidebar, a legend (expanded), the station map, and a bench sheet diagram. Save under `.playwright-mcp/`, view each pair, and delete them afterwards.

Check: markers read clearly against the ice; the shadow is subtle (not muddy at 48 px); hash marks and the kick plate don't clutter thumbnails; arrowheads read at phone width; notes are legible; print still looks clean in grayscale (emulate print media). If a value needs tuning, change it in `diagram-theme.ts` only, re-run the tests, and record the change in the ledger with before and after values.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin HEAD
gh pr create --base main --title "feat(practice-planner): playbook style for rink diagrams" --body-file -
```

The body lists the look changes by area (ice and boards, markings, markers, equipment, strokes, notes, fonts), states that every color and font now comes from `DIAGRAM_THEME` (guarded by a test), that stored data is unchanged and stroke geometry is identical (legacy snapshot untouched), the font wait for stored and printed diagrams, and the checks run. No local paths. End with the session attribution line.

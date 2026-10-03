# Practice Drills: Ice Area Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a coach mark where on the ice a drill runs (full ice, a half, a zone, or a custom rectangle). The edit board zooms to that area and keeps new and dragged elements inside it. Thumbnails, the legend, and the session view show the area at a glance.

**Architecture:** An optional `PlayData.area` (no version bump, no Prisma change) is validated by `playDataSchema`. On read, an invalid area is dropped and logged in `upgradePlayData`. A pure resolver, `lib/utils/ice-area.ts`, turns an area into a `RinkRect` in rink feet. That resolver is also phase 2b's contract. Rendering gains a viewport-aware `createTransformContext`, zoom/pan screen mapping, `drawAreaMask`, and a shared `drawBoardScene` that the board and thumbnails both use. Interaction gains `clampToRect`, `dragTarget`, and `rectFromDrag`. `RinkBoard` (912 lines) only wires these in. `PlayEditor` adds an "Ice area" select, an area tool, and an outside-elements alert. `PlayLegend` adds an area chip.

**Tech Stack:** TypeScript (strict), Next.js 16 App Router, React 19, MUI v7, Zod v4.6, Vitest 4 + Testing Library (jsdom), Bun.

**Spec:** `docs/superpowers/specs/2026-10-03-practice-drill-ice-area-design.md` (roadmap: `docs/superpowers/specs/2026-10-03-practice-planner-roadmap.md`)

## Global Constraints

- Branch `feat/practice-ice-area`, stacked on `feat/practice-session-ownership` (PR #373). Every line number below is from this branch at commit `c8ba0a1`. Locate each edit by its quoted anchor text if lines have shifted.
- Use `bun` for everything (`bun run test <file>`, `bun run type-check`, `bun run lint`, `bun run build`). Never npm/yarn. Call git as `/usr/bin/git` (a shell hook rewrites `git`). Never `git stash`.
- **No Prisma schema change and no migration.** `area` lives inside the `playData` JSON.
- Zod v4 behavior, verified on this tree (zod 4.6.5):
  - `z.object` strips unknown keys.
  - `z.number()` rejects `NaN` and `±Infinity`.
  - **An optional key whose input value is `undefined` is kept in the output** (`{a: undefined}` parses to an object with key `a`). So "drop the area" always means *delete the key*, never assign `undefined`.
  - Tests that assert absence use `"area" in x` or `toStrictEqual`, never `toEqual`.
- Values, copied verbatim from the spec:
  - presets `full`, `half-left`, `half-right`, `zone-left`, `zone-neutral`, `zone-right`;
  - `MIN_AREA_FT = 20`; snapping 5 ft (UI only); edit margin 5 ft;
  - blue lines x=75 / x=125, derived from `ZONE_DIMENSIONS` (`lib/utils/canvas/rink-renderer.ts:24-29`).
- Labels, verbatim: `Full ice`, `Half ice (left)`, `Half ice (right)`, `Left end zone`, `Neutral zone`, `Right end zone`, `Custom area`. The select's custom option reads `Custom area…` (with a Unicode ellipsis).
- UI copy, verbatim:
  - the select's label: `Ice area`;
  - the area tool hint: `Drag on the rink to draw the ice area.`;
  - the outside alert: `N elements are outside the ice area.` (singular form: `1 element is outside the ice area.`; see Spec deviation 9).
- Colors: the mask is `rgba(33, 33, 33, 0.35)` (ink `#212121` at 35%). The outline is `BOARD_COLORS.actionBlue` (`#1976D2`), 2 px, dash `[8, 6]`.
- ADRs (`bun run adr:explain`):
  - **0004** (MUI) governs `components/**`.
  - Nothing governs `lib/utils/play-data.ts` or `lib/utils/canvas/*`.
  - **ADR-0012** (venue segments are display-only) is why areas never reuse segment geometry. Nothing here touches venues.
- RinkBoard tests stub `HTMLElement.prototype.clientWidth/clientHeight` to 800×400 (`__tests__/components/features/practice-planner/RinkBoard.test.tsx:229-239`). `requestAnimationFrame` is stubbed and never runs its callback (`:54-60`), so **RinkBoard tests can never observe drawing**. Draw order is therefore tested on the pure `drawBoardScene` (Task 2).
- In RinkBoard tests, pointer helpers must map rink feet through the *same viewport* the board uses: `createTransformContext(800, 400, 20, editViewport(area))`. With the area tool on, they use `FULL_RINK`.
- Commit messages: conventional commits, ending with the line
  `Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX`.
- `bun run type-check` and each task's own Vitest files must be green at the end of every task.

## Product-owner decisions

None were taken during planning. Four items need a product-owner decision; each is marked **(PO)** in the Spec deviations below (1, 2, 3, and the last bullet of 7). The plan implements the recommended choice for each, and each one is a single localized change if the product owner decides otherwise.

## Spec deviations (decided during planning — fold into the spec in Task 7)

1. **(PO) Starter-play areas follow their data.**
   - Breakout (5-Man) gets `half-left`, not `zone-left`. Its routes reach x=85 and x=95 (`lib/data/starter-plays.ts:91-92`), so `zone-left` would flag two elements as outside on a starter drill.
   - The other defensive-zone set plays get `zone-left`: Penalty-Kill Box (max x 70) and D-Zone Coverage (max x 72).
   - The offensive set plays get `zone-right`: Power-Play Umbrella, Low Cycle, Point Shot with Screen (min x 128).
   - 1-2-2 Forecheck (D at x=92), Neutral-Zone Regroup (x 58–138) and 3-Man Weave stay unset (full ice).
   - A test pins the list and that no starter has an element outside its own area.
2. **(PO) Clear keeps the ice area.** `RinkBoard.handleClear` (`:386-403`) resets to `createEmptyPlayData()`, which would silently drop the area. The area is set by its own control, and Clear erases the drawing, not the drill's setup. Undo still restores everything.
3. **(PO) The mask is drawn after the elements.** Elements outside the area are dimmed along with the ice, which is the visual half of "remain and are flagged" (the info alert is the other half). The mask is drawn in edit mode too, as the spec says. If the product owner prefers outside elements at full strength, move `drawAreaMask` above `drawAllElements` in `drawBoardScene` (Task 2), which is one line.
4. **There is no legend rink swatch.** The spec's rendering list says "View board, thumbnails, legend swatch: … plus the mask", but legend swatches are 40×20 symbol glyphs (`components/features/practice-planner/PlayLegend.tsx:14-49`) with no rink. The legend shows only the chip. The chip sits above the collapsible accordion, so it shows while the legend is collapsed. It is not counted in `Legend (N)`. No view-mode `RinkBoard` is mounted anywhere today: the session view shows the stored thumbnail plus `PlayLegend` (`app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx:565-586`). The view-mode wiring (full-rink viewport plus the mask) is still implemented for any future caller.
5. **The area tool works over the whole rink.**
   - While it is on, the viewport is `FULL_RINK`, and its pointer is clamped to the rink, not the current area. Otherwise a drill already set to an end zone could never be given a larger or different custom area.
   - `RinkBoard` gains `onAreaDrawn?: () => void` besides the spec's `areaTool?: boolean`, so `PlayEditor` can turn the tool off after one rectangle.
   - MUI `Select` fires no `onChange` when the current value is picked again. A drill that already has a custom area therefore gets a `Redraw custom area` button, and the hint gets a `Cancel` action.
6. **"Full ice" removes the key.** Choosing Full ice calls `setArea(undefined)`, so a reset drill is byte-identical to a pre-2a drill. `withArea` returns the same object when the area is unchanged, so re-picking the current preset records no undo step (the same rule as `updateElement`, `lib/utils/canvas/element-ops.ts:59-62`).
7. **Hit tests ignore the area; placement and drag respect it.**
   - Today select and eraser hit-test the *clamped* pointer (`RinkBoard.tsx:467`, `:481`, `:550`). Clamping that to the area would make outside elements unselectable. Hit tests now use the pointer clamped to `FULL_RINK`.
   - Placement and stroke points use `clampToRect(pointer, areaRect)`.
   - A drag lands at `dragTarget(pointer, grabOffset, areaRect)`: the pointer minus the grab offset, then clamped. Clamping the pointer to the area first would stop the element `offset` feet short of the edge. Dragging an outside element pulls it into the area, as the spec requires of dragged elements.
   - **(PO) Reach is limited to what is visible.** "Selectable and erasable" holds for any element the coach can see: inside the area, in the 5 ft margin, or anywhere after a pinch zoom-out. The edit viewport is the area plus 5 ft, and zoom-out exists only as a two-finger pinch (`RinkBoard.tsx:809-831`, floor 0.5). So on desktop, an element beyond the margin can be reached only by widening the area (or choosing Full ice). That follows from the spec's crop, not from the hit test. The outside alert tells the coach such elements exist.
8. **Lenient read deletes the key on both paths.** Zod keeps an `undefined` optional key, so `dropInvalidArea` returns the raw object without `area` rather than setting it to `undefined`. The v1 path parses with `v1Schema`, which strips unknown keys. A valid area on a v1 object is therefore carried across explicitly, and an invalid one is logged and dropped.
9. **The alert's singular form.** One element reads `1 element is outside the ice area.`, and any other count reads `N elements are outside the ice area.` "Outside" means:
   - players, equipment and annotations: the position is outside the rectangle (edges count as inside);
   - drawings: any point is outside.
10. **A new viewport resets pinch-zoom and pan** to 1 and (0, 0). A zoom made for the full rink would misframe an end zone.
11. **Helper locations and extra helpers.**
    - `FULL_RINK` and `BLUE_LINES` are exported from `rink-renderer.ts`, because `createTransformContext`'s default needs `FULL_RINK` and `ice-area.ts` already imports the renderer (putting them in `ice-area.ts` would make a cycle).
    - `MIN_AREA_FT` and `AREA_SNAP_FT` live in `types/practice-planner.ts`, so the schema (`play-data.ts`) and `rectFromDrag` (`element-ops.ts`) share them without `play-data.ts` importing `canvas/*`.
    - New pure helpers, each defined and tested in the task that adds it:
      - `rinkToScreen` and `screenToRink` (zoom/pan mapping, replacing RinkBoard's inline inverse at `:194-201`);
      - `drawBoardScene` (the board's draw sequence, shared with thumbnails);
      - `dragTarget`;
      - `editViewport`, `isFullIce`, `sameArea`, `withArea`, `rectContains`, `countElementsOutside`;
      - `iceAreaLabel`.
12. **The toolbar is unchanged.** The area tool is a board mode, not a `DrawingTool`, so `DrawingToolbar` gets no change.
13. **How `rectFromDrag` enforces the minimum.** It snaps both edges to 5 ft and clamps them to the rink. If a side is under 20 ft, it extends from the low edge, and shifts back inside the rink if that overflows. The result is always a valid custom rectangle, which a test asserts against the schema.

## Review Focus

1. **The pointer under a cropped viewport combined with pinch-zoom and pan.** A tap must land on the rink point drawn under the finger at any zoom and pan, including points outside the viewport after zooming out. Owned by Task 2 (`screenToRink`/`rinkToScreen` round-trip under `zone-neutral` with zoom 2.3 and pan, including x=150) and Task 4 (a board click at an off-center point of a `zone-neutral` viewport places at that point; full-rink mapping would miss by about 1 ft).
2. **Clamping during a drag at the area edge.** An element grabbed off-center and dragged past the edge must stop exactly on the edge, not short of it. Owned by Task 3 (`dragTarget` reaches x=75 exactly) and Task 4 (board drag in a custom area commits x=120 exactly).
3. **The rink cache colliding across viewports.** `half-left` and `half-right` have the same scale and canvas size but different offsets; they must not share a cached background. Owned by Task 2 (keys differ; alternating draws rebuild).
4. **An invalid stored area making a drill unreadable.** An area that is out of the rink, under 20 ft, `NaN`, `null`, of an unknown kind, or a bare string must read as full ice, be logged, and leave no `area` key, on the v2 and v1 paths. The same values must be rejected on write. Owned by Task 1.
5. **Elements outside a newly narrowed area.** Any such element that is visible on the board must stay selectable, erasable and deletable by key, even though placement clamps. Reach beyond the margin is a PO item (Spec deviation 7). Owned by Task 4 (custom area; a cone 3 ft outside the area, in the visible margin, is selected, erased, and deleted with Backspace; an area-clamped hit test would miss it).

---

### Task 1: Ice-area types, schema, lenient read, and the resolver

**Files:**
- Modify: `types/practice-planner.ts` (insert before `export interface PlayData` at :84; add `area?` to `PlayData` :84-90)
- Modify: `lib/utils/canvas/rink-renderer.ts` (export `BLUE_LINES`, `FULL_RINK` after `ZONE_DIMENSIONS` :24-29; `drawBlueLines` :301-303 reads `BLUE_LINES`)
- Modify: `lib/utils/play-data.ts` (imports :11-22; schema :80-91; `upgradePlayData` :199-246)
- Modify: `lib/utils/canvas/notation.ts` (append labels)
- Create: `lib/utils/ice-area.ts`
- Test: `__tests__/lib/utils/ice-area.test.ts` (create), `__tests__/lib/utils/play-data.test.ts` (append)

**Interfaces:**
- Consumes: `RINK_DIMENSIONS`, `ZONE_DIMENSIONS` (renderer); `RINK_WIDTH_FT`, `RINK_HEIGHT_FT`, `playDataSchema`, `upgradePlayData`, `parseStoredPlayData`, `sanitizePlayDataForWrite`, `createEmptyPlayData` (play-data).
- Produces (`types/practice-planner.ts`):
  - `ICE_AREA_PRESETS` (readonly tuple) and `type IceAreaPreset`
  - `interface RinkRect { x: number; y: number; w: number; h: number }`
  - `type IceArea = { kind: IceAreaPreset } | { kind: "custom"; rect: RinkRect }`
  - `MIN_AREA_FT = 20`, `AREA_SNAP_FT = 5`, and `PlayData.area?: IceArea`
- Produces (`rink-renderer.ts`): `BLUE_LINES: { readonly left: 75; readonly right: 125 }`, `FULL_RINK: Readonly<RinkRect>` (`{0, 0, 200, 85}`).
- Produces (`play-data.ts`): `iceAreaSchema` (Zod), and `playDataSchema` with `area` optional.
- Produces (`lib/utils/ice-area.ts`):
  - `AREA_EDIT_MARGIN_FT = 5`
  - `isFullIce(area?: IceArea): boolean`
  - `areaRect(area?: IceArea): RinkRect`
  - `editViewport(area?: IceArea, marginFt?: number): RinkRect`
  - `rectContains(rect: RinkRect, p: Position): boolean`
  - `countElementsOutside(data: PlayData, rect: RinkRect): number`
  - `sameArea(a?: IceArea, b?: IceArea): boolean`
  - `withArea(data: PlayData, area: IceArea | undefined): PlayData` (returns `data` itself when unchanged; never leaves an `area` key for full ice)
- Produces (`notation.ts`): `ICE_AREA_LABELS: Record<IceAreaPreset | "custom", string>`, `iceAreaLabel(area?: IceArea): string`.

- [ ] **Step 1: Write the failing resolver tests**

Create `__tests__/lib/utils/ice-area.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
    AREA_EDIT_MARGIN_FT,
    areaRect,
    countElementsOutside,
    editViewport,
    isFullIce,
    rectContains,
    sameArea,
    withArea,
} from "@/lib/utils/ice-area";
import { BLUE_LINES, FULL_RINK, RINK_DIMENSIONS } from "@/lib/utils/canvas/rink-renderer";
import { ICE_AREA_LABELS, iceAreaLabel } from "@/lib/utils/canvas/notation";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { ICE_AREA_PRESETS, MIN_AREA_FT, type IceArea, type PlayData } from "@/types/practice-planner";

describe("BLUE_LINES / FULL_RINK", () => {
    it("derive from the renderer's zone widths", () => {
        expect(BLUE_LINES).toEqual({ left: 75, right: 125 });
        expect(FULL_RINK).toEqual({ x: 0, y: 0, w: RINK_DIMENSIONS.width, h: RINK_DIMENSIONS.height });
        expect(MIN_AREA_FT).toBe(20);
        expect(AREA_EDIT_MARGIN_FT).toBe(5);
    });
});

describe("areaRect", () => {
    it.each([
        ["full", 0, 200],
        ["half-left", 0, 100],
        ["half-right", 100, 200],
        ["zone-left", 0, 75],
        ["zone-neutral", 75, 125],
        ["zone-right", 125, 200],
    ] as const)("%s spans x %d-%d over the full height", (kind, x0, x1) => {
        expect(areaRect({ kind })).toEqual({ x: x0, y: 0, w: x1 - x0, h: 85 });
    });

    it("uses the renderer's blue lines for the zones", () => {
        expect(areaRect({ kind: "zone-left" }).w).toBe(BLUE_LINES.left);
        expect(areaRect({ kind: "zone-neutral" })).toMatchObject({ x: BLUE_LINES.left, w: BLUE_LINES.right - BLUE_LINES.left });
        expect(areaRect({ kind: "zone-right" }).x).toBe(BLUE_LINES.right);
    });

    it("treats a missing area as full ice", () => {
        expect(areaRect(undefined)).toEqual(FULL_RINK);
        expect(isFullIce(undefined)).toBe(true);
        expect(isFullIce({ kind: "full" })).toBe(true);
        expect(isFullIce({ kind: "zone-left" })).toBe(false);
    });

    it("returns a copy of a custom rectangle", () => {
        const area: IceArea = { kind: "custom", rect: { x: 100, y: 30, w: 20, h: 20 } };
        const rect = areaRect(area);
        rect.x = 0;
        expect(area.rect.x).toBe(100);
    });
});

describe("editViewport", () => {
    it("is the whole rink for full ice", () => {
        expect(editViewport(undefined)).toEqual(FULL_RINK);
        expect(editViewport({ kind: "full" })).toEqual(FULL_RINK);
    });

    it("adds a 5 ft margin clamped to the rink", () => {
        expect(editViewport({ kind: "zone-left" })).toEqual({ x: 0, y: 0, w: 80, h: 85 });
        expect(editViewport({ kind: "zone-neutral" })).toEqual({ x: 70, y: 0, w: 60, h: 85 });
        expect(editViewport({ kind: "half-right" })).toEqual({ x: 95, y: 0, w: 105, h: 85 });
        expect(editViewport({ kind: "custom", rect: { x: 100, y: 30, w: 20, h: 20 } })).toEqual({ x: 95, y: 25, w: 30, h: 30 });
    });
});

describe("countElementsOutside", () => {
    const data: PlayData = {
        ...createEmptyPlayData(),
        players: [
            { id: "in", position: { x: 75, y: 40 }, role: "X", label: "", color: "#1976D2" },
            { id: "out", position: { x: 150, y: 40 }, role: "X", label: "", color: "#1976D2" },
        ],
        drawings: [
            { id: "cross", action: "skate", path: "straight", end: "arrow", points: [{ x: 60, y: 40 }, { x: 90, y: 40 }], color: "#212121", strokeWidth: 2 },
            { id: "inside", action: "pass", path: "straight", end: "arrow", points: [{ x: 10, y: 10 }, { x: 70, y: 70 }], color: "#212121", strokeWidth: 2 },
        ],
        equipment: [{ id: "net", kind: "net", position: { x: 189, y: 42.5 }, rotation: 0 }],
        annotations: [{ id: "a", text: "Go", position: { x: 20, y: 20 }, fontSize: 8, color: "#000000" }],
    };

    it("counts positions outside and strokes with any point outside; edges are inside", () => {
        expect(countElementsOutside(data, areaRect({ kind: "zone-left" }))).toBe(3);
        expect(countElementsOutside(data, FULL_RINK)).toBe(0);
        expect(rectContains(areaRect({ kind: "zone-left" }), { x: 75, y: 85 })).toBe(true);
    });
});

describe("withArea / sameArea", () => {
    it("sets an area as a copy", () => {
        const rect = { x: 100, y: 30, w: 20, h: 20 };
        const next = withArea(createEmptyPlayData(), { kind: "custom", rect });
        expect(next.area).toEqual({ kind: "custom", rect });
        rect.x = 0;
        expect(next.area).toEqual({ kind: "custom", rect: { x: 100, y: 30, w: 20, h: 20 } });
    });

    it("removes the key for full ice and keeps the reference when nothing changes", () => {
        const zoned = withArea(createEmptyPlayData(), { kind: "zone-left" });
        const cleared = withArea(zoned, undefined);
        expect("area" in cleared).toBe(false);
        expect("area" in withArea(zoned, { kind: "full" })).toBe(false);
        expect(withArea(zoned, { kind: "zone-left" })).toBe(zoned);
        const empty = createEmptyPlayData();
        expect(withArea(empty, undefined)).toBe(empty);
    });

    it("compares custom rectangles by value", () => {
        const a: IceArea = { kind: "custom", rect: { x: 0, y: 0, w: 20, h: 20 } };
        expect(sameArea(a, { kind: "custom", rect: { x: 0, y: 0, w: 20, h: 20 } })).toBe(true);
        expect(sameArea(a, { kind: "custom", rect: { x: 5, y: 0, w: 20, h: 20 } })).toBe(false);
        expect(sameArea(undefined, { kind: "full" })).toBe(true);
        expect(sameArea({ kind: "zone-left" }, { kind: "zone-right" })).toBe(false);
    });
});

describe("ICE_AREA_LABELS", () => {
    it("labels every preset and custom", () => {
        expect(ICE_AREA_PRESETS.map((p) => ICE_AREA_LABELS[p])).toEqual([
            "Full ice", "Half ice (left)", "Half ice (right)", "Left end zone", "Neutral zone", "Right end zone",
        ]);
        expect(ICE_AREA_LABELS.custom).toBe("Custom area");
        expect(iceAreaLabel(undefined)).toBe("Full ice");
        expect(iceAreaLabel({ kind: "zone-neutral" })).toBe("Neutral zone");
    });
});
```

- [ ] **Step 2: Write the failing schema and lenient-read tests**

Append to `__tests__/lib/utils/play-data.test.ts`. Add `vi` to the vitest import on line 1, and `type IceArea` to the `@/types/practice-planner` import on line 15. Then append:

```ts
describe("ice area", () => {
    const zone: IceArea = { kind: "zone-neutral" };
    const custom: IceArea = { kind: "custom", rect: { x: 100, y: 30, w: 20, h: 20 } };
    const invalidAreas: Array<[string, unknown]> = [
        ["outside the rink", { kind: "custom", rect: { x: 190, y: 0, w: 20, h: 20 } }],
        ["under 20 ft", { kind: "custom", rect: { x: 0, y: 0, w: 10, h: 85 } }],
        ["NaN", { kind: "custom", rect: { x: Number.NaN, y: 0, w: 20, h: 20 } }],
        ["negative", { kind: "custom", rect: { x: -5, y: 0, w: 20, h: 20 } }],
        ["an unknown kind", { kind: "middle" }],
        ["custom without a rect", { kind: "custom" }],
        ["null", null],
        ["a bare string", "zone-left"],
    ];

    it("round-trips a valid preset and custom area", () => {
        for (const area of [zone, custom]) {
            const stored = { ...createEmptyPlayData(), area };
            expect(upgradePlayData(stored)).toStrictEqual(stored);
            expect(playDataSchema.safeParse(stored).success).toBe(true);
        }
    });

    it("keeps a missing area missing", () => {
        const result = upgradePlayData(createEmptyPlayData());
        expect("area" in result).toBe(false);
        expect("area" in upgradePlayData(v1Play)).toBe(false);
    });

    it.each(invalidAreas)("drops and logs an area that is %s on read (v2)", (_label, area) => {
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        const parsed = parseStoredPlayData({ ...createEmptyPlayData(), area });
        expect(parsed.ok).toBe(true);
        expect(parsed.ok && "area" in parsed.data).toBe(false);
        expect(errorSpy).toHaveBeenCalledWith("Dropping invalid ice area from play data:", area);
        errorSpy.mockRestore();
    });

    it.each(invalidAreas)("rejects an area that is %s on write", (_label, area) => {
        expect(playDataSchema.safeParse({ ...createEmptyPlayData(), area }).success).toBe(false);
    });

    it("drops an explicitly undefined area without logging", () => {
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        const result = upgradePlayData({ ...createEmptyPlayData(), area: undefined });
        expect("area" in result).toBe(false);
        expect(errorSpy).not.toHaveBeenCalled();
        errorSpy.mockRestore();
    });

    it("carries a valid area across the v1 upgrade and drops an invalid one", () => {
        expect(upgradePlayData({ ...v1Play, area: zone }).area).toEqual(zone);
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        expect("area" in upgradePlayData({ ...v1Play, area: { kind: "custom", rect: { x: 0, y: 0, w: 5, h: 5 } } })).toBe(false);
        expect(errorSpy).toHaveBeenCalledTimes(1);
        errorSpy.mockRestore();
    });

    it("is idempotent with an area", () => {
        const once = upgradePlayData({ ...createEmptyPlayData(), area: custom });
        expect(upgradePlayData(once)).toStrictEqual(once);
    });

    it("keeps the area through write sanitizing", () => {
        const result = sanitizePlayDataForWrite({ ...createEmptyPlayData(), area: custom });
        expect(result.ok && result.data.area).toEqual(custom);
    });
});
```

- [ ] **Step 3: Run both test files to verify they fail**

Run: `bun run test __tests__/lib/utils/ice-area.test.ts __tests__/lib/utils/play-data.test.ts`
Expected: FAIL. `ice-area.test.ts` cannot resolve `@/lib/utils/ice-area`. In `play-data.test.ts`, the "ice area" cases fail because the area is stripped and nothing is logged.

- [ ] **Step 4: Add the types**

In `types/practice-planner.ts`, insert directly above `export interface PlayData {` (:84):

```ts
// ============================================================================
// Ice area (practice planner 2a)
// ============================================================================

export const ICE_AREA_PRESETS = ["full", "half-left", "half-right", "zone-left", "zone-neutral", "zone-right"] as const;
export type IceAreaPreset = (typeof ICE_AREA_PRESETS)[number];

/** Axis-aligned rectangle in rink feet. */
export interface RinkRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

export type IceArea = { kind: IceAreaPreset } | { kind: "custom"; rect: RinkRect };

/** Smallest custom-area side in feet (schema and area tool). */
export const MIN_AREA_FT = 20;
/** Grid the area tool snaps custom rectangles to, in feet. UI only: the server does not require it. */
export const AREA_SNAP_FT = 5;

```

Then replace the `PlayData` interface (:84-90) with:

```ts
export interface PlayData {
    version: typeof PLAY_DATA_VERSION;
    players: PlayerIcon[];
    drawings: DrawingElement[];
    equipment: EquipmentItem[];
    annotations: TextAnnotation[];
    /** Where on the ice the drill runs. Absent = full ice. */
    area?: IceArea;
}
```

- [ ] **Step 5: Export the renderer constants**

In `lib/utils/canvas/rink-renderer.ts`, change line 11 to:

```ts
import type { Position, RinkRect } from "@/types/practice-planner";
```

Insert directly after the `ZONE_DIMENSIONS` block (after :29):

```ts

/** Blue-line x positions in rink feet, derived from the zone widths. */
export const BLUE_LINES = {
    left: ZONE_DIMENSIONS.defensiveZoneWidth,
    right: RINK_DIMENSIONS.width - ZONE_DIMENSIONS.offensiveZoneWidth,
} as const;

/** The whole rink as a rectangle in rink feet. */
export const FULL_RINK: Readonly<RinkRect> = Object.freeze({
    x: 0,
    y: 0,
    w: RINK_DIMENSIONS.width,
    h: RINK_DIMENSIONS.height,
});
```

In `drawBlueLines` (:301-303), replace the two `const` lines with:

```ts
    const leftBlueLineX = BLUE_LINES.left;
    const rightBlueLineX = BLUE_LINES.right;
```

- [ ] **Step 6: Extend the schema and the lenient read**

In `lib/utils/play-data.ts`, replace the import block (:11-22) with:

```ts
import {
    EQUIPMENT_KINDS,
    ICE_AREA_PRESETS,
    MIN_AREA_FT,
    PLAY_DATA_VERSION,
    PLAYER_ROLES,
    STROKE_ACTIONS,
    STROKE_ENDS,
    STROKE_PATHS,
    VALIDATION_CONSTRAINTS as C,
    type IceArea,
    type PlayData,
    type Position,
    type StrokeOptions,
} from "@/types/practice-planner";
```

Insert directly above `export const playDataSchema = z` (:80):

```ts
/** A custom area: finite numbers, inside the rink, at least MIN_AREA_FT on each side. */
const rinkRectSchema = z
    .object({
        x: z.number().min(0),
        y: z.number().min(0),
        w: z.number().min(MIN_AREA_FT),
        h: z.number().min(MIN_AREA_FT),
    })
    .refine((r) => r.x + r.w <= RINK_WIDTH_FT && r.y + r.h <= RINK_HEIGHT_FT, {
        message: "Custom ice area must lie inside the rink",
    });

export const iceAreaSchema = z.union([
    z.object({ kind: z.enum(ICE_AREA_PRESETS) }),
    z.object({ kind: z.literal("custom"), rect: rinkRectSchema }),
]);

```

In the `playDataSchema` object (:82-86), add after the `annotations` line:

```ts
        area: iceAreaSchema.optional(),
```

Insert directly above `/** Converts stored play data of any supported version to v2. Throws PlayDataError. */` (:198):

```ts
/**
 * An unreadable ice area must never make the drill unreadable: it is dropped
 * (the drill reads as full ice) and logged. The key is deleted rather than set
 * to undefined, because Zod keeps an undefined optional key. Returns `raw`
 * itself when there is nothing to drop.
 */
function dropInvalidArea(raw: object): object {
    if (!("area" in raw)) return raw;
    const { area, ...rest } = raw as { area: unknown } & Record<string, unknown>;
    if (area !== undefined && iceAreaSchema.safeParse(area).success) return raw;
    if (area !== undefined) console.error("Dropping invalid ice area from play data:", area);
    return rest;
}

```

In `upgradePlayData`, replace the v2 branch's last two lines (:206-207):

```ts
        const readable = dropInvalidArea(raw);
        const annotations = (readable as { annotations?: unknown }).annotations;
        return parseV2(Array.isArray(annotations) ? { ...readable, annotations: annotations.filter(isNotBlankAnnotation) } : readable);
```

In the v1 branch, insert directly after `if (!v1.success) throw new PlayDataError("Unrecognized play data", v1.error);` (:211):

```ts
    // v1Schema strips unknown keys, so a valid area is carried across explicitly.
    const area = (dropInvalidArea(raw) as { area?: IceArea }).area;
```

Then in the `parseV2({ ... })` call of the v1 branch, replace the closing `.filter(isNotBlankAnnotation),` line of `annotations` (:244) with:

```ts
            .filter(isNotBlankAnnotation),
        ...(area ? { area } : {}),
```

- [ ] **Step 7: Add the labels**

In `lib/utils/canvas/notation.ts`, replace line 5 with:

```ts
import type { EquipmentKind, IceArea, IceAreaPreset, PlayerRole, StrokeAction, StrokeEnd } from "@/types/practice-planner";
```

Append:

```ts

export const ICE_AREA_LABELS: Record<IceAreaPreset | "custom", string> = {
    full: "Full ice",
    "half-left": "Half ice (left)",
    "half-right": "Half ice (right)",
    "zone-left": "Left end zone",
    "zone-neutral": "Neutral zone",
    "zone-right": "Right end zone",
    custom: "Custom area",
};

/** Display label for a drill's ice area; a missing area is full ice. */
export function iceAreaLabel(area?: IceArea): string {
    return ICE_AREA_LABELS[area?.kind ?? "full"];
}
```

- [ ] **Step 8: Write the resolver**

Create `lib/utils/ice-area.ts`:

```ts
/**
 * Ice-area resolver for the practice planner (phase 2a). Pure: safe to import
 * from Server Actions and Client Components. Phase 2b reads
 * `areaRect(playData.area)` for station layout and overlap checks, so this
 * module is that contract.
 */
import type { IceArea, IceAreaPreset, PlayData, Position, RinkRect } from "@/types/practice-planner";
import { BLUE_LINES, FULL_RINK, RINK_DIMENSIONS } from "@/lib/utils/canvas/rink-renderer";

/** Margin the edit board shows around a drill's area, in feet. */
export const AREA_EDIT_MARGIN_FT = 5;

const RINK_W = RINK_DIMENSIONS.width;
const RINK_H = RINK_DIMENSIONS.height;

const PRESET_X: Record<IceAreaPreset, readonly [number, number]> = {
    full: [0, RINK_W],
    "half-left": [0, RINK_W / 2],
    "half-right": [RINK_W / 2, RINK_W],
    "zone-left": [0, BLUE_LINES.left],
    "zone-neutral": [BLUE_LINES.left, BLUE_LINES.right],
    "zone-right": [BLUE_LINES.right, RINK_W],
};

/** True for a missing area and for an explicit `{ kind: "full" }`. */
export function isFullIce(area?: IceArea): boolean {
    return area === undefined || area.kind === "full";
}

/** The area's rectangle in rink feet (a fresh object). Presets span the full rink height. */
export function areaRect(area?: IceArea): RinkRect {
    if (!area) return { ...FULL_RINK };
    if (area.kind === "custom") return { ...area.rect };
    const [x0, x1] = PRESET_X[area.kind];
    return { x: x0, y: 0, w: x1 - x0, h: RINK_H };
}

/** What the edit board fits: the area plus a margin, clamped to the rink; the whole rink for full ice. */
export function editViewport(area?: IceArea, marginFt: number = AREA_EDIT_MARGIN_FT): RinkRect {
    if (isFullIce(area)) return { ...FULL_RINK };
    const r = areaRect(area);
    const x0 = Math.max(0, r.x - marginFt);
    const y0 = Math.max(0, r.y - marginFt);
    const x1 = Math.min(RINK_W, r.x + r.w + marginFt);
    const y1 = Math.min(RINK_H, r.y + r.h + marginFt);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Edges count as inside. */
export function rectContains(rect: RinkRect, p: Position): boolean {
    return p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h;
}

/**
 * Elements lying outside `rect`: players, equipment and annotations by
 * position; a drawing if any of its points is outside.
 */
export function countElementsOutside(data: PlayData, rect: RinkRect): number {
    const outside = (p: Position) => !rectContains(rect, p);
    return (
        data.players.filter((e) => outside(e.position)).length +
        data.equipment.filter((e) => outside(e.position)).length +
        data.annotations.filter((e) => outside(e.position)).length +
        data.drawings.filter((d) => d.points.some(outside)).length
    );
}

/** Value equality; every full-ice form (missing, `{ kind: "full" }`) is equal. */
export function sameArea(a?: IceArea, b?: IceArea): boolean {
    if (isFullIce(a) || isFullIce(b)) return isFullIce(a) && isFullIce(b);
    if (!a || !b || a.kind !== b.kind) return false;
    if (a.kind === "custom" && b.kind === "custom") {
        return a.rect.x === b.rect.x && a.rect.y === b.rect.y && a.rect.w === b.rect.w && a.rect.h === b.rect.h;
    }
    return true;
}

/**
 * Sets a drill's area. Full ice removes the key, so a reset drill matches a
 * pre-2a one. Returns `data` itself when nothing changes, so callers can skip
 * recording an undo step.
 */
export function withArea(data: PlayData, area: IceArea | undefined): PlayData {
    if (sameArea(data.area, area)) return data;
    const next: PlayData = { ...data };
    delete next.area;
    if (!area || isFullIce(area)) return next;
    next.area = area.kind === "custom" ? { kind: "custom", rect: { ...area.rect } } : { kind: area.kind };
    return next;
}
```

- [ ] **Step 9: Run the tests and type-check**

Run: `bun run test __tests__/lib/utils/ice-area.test.ts __tests__/lib/utils/play-data.test.ts __tests__/lib/utils/canvas __tests__/lib/data/starter-plays.test.ts`
Expected: PASS.
Run: `bun run type-check`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
/usr/bin/git add types/practice-planner.ts lib/utils/canvas/rink-renderer.ts lib/utils/play-data.ts lib/utils/canvas/notation.ts lib/utils/ice-area.ts __tests__/lib/utils/ice-area.test.ts __tests__/lib/utils/play-data.test.ts
/usr/bin/git commit -m "feat(practice-planner): optional drill ice area with a lenient read and resolver

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 2: Viewport transform, zoom/pan mapping, area mask, shared scene, thumbnails

**Files:**
- Modify: `lib/utils/canvas/rink-renderer.ts` (`createTransformContext` :79-106; add `rinkToScreen`/`screenToRink` after `canvasToRink` :129-134)
- Modify: `lib/utils/canvas/drawing-utils.ts` (imports :12-24; append `drawAreaMask`, `drawBoardScene`)
- Modify: `lib/utils/canvas/thumbnail-generator.ts` (imports :11-13; drawing :72-79)
- Test: `__tests__/lib/utils/canvas/rink-renderer.test.ts` (append), `__tests__/lib/utils/canvas/rink-renderer-cache.test.ts` (append), `__tests__/lib/utils/canvas/drawing-utils.test.ts` (append), `__tests__/lib/utils/canvas/thumbnail-area.test.ts` (create)

**Interfaces:**
- Consumes (Task 1): `FULL_RINK`, `RinkRect`, `editViewport`, `areaRect`, `BOARD_COLORS`.
- Produces (`rink-renderer.ts`):
  - `createTransformContext(canvasWidth: number, canvasHeight: number, padding?: number /* 20 */, viewport?: RinkRect /* FULL_RINK */): TransformContext`
  - `rinkToScreen(p: Position, transform: TransformContext, zoom: number, pan: Position): Position`
  - `screenToRink(p: Position, transform: TransformContext, zoom: number, pan: Position): Position`
- Produces (`drawing-utils.ts`):
  - `drawAreaMask(ctx: CanvasRenderingContext2D, rect: RinkRect, transform: TransformContext): void` (no-op when `rect` covers the rink)
  - `interface BoardSceneOptions { selectedId?: string; zoom?: number; maskRect?: RinkRect }`
  - `drawBoardScene(ctx, transform, playData: PlayData, options?: BoardSceneOptions): void` (rink, then elements, then mask)
- `generateThumbnail(playData, options)` keeps its signature; it now draws the full rink plus the mask for `areaRect(playData.area)`.

- [ ] **Step 1: Write the failing transform and mapping tests**

Append to `__tests__/lib/utils/canvas/rink-renderer.test.ts`. Extend the renderer import (:13-18) to also import `FULL_RINK`, `rinkToScreen` and `screenToRink`, and add `import { editViewport } from "@/lib/utils/ice-area";` below it. Then append:

```ts
describe("createTransformContext with a viewport", () => {
  it("defaults to the whole rink", () => {
    expect(createTransformContext(800, 400, 20, FULL_RINK)).toEqual(createTransformContext(800, 400));
  });

  it("fits a tall viewport to the height and centers it", () => {
    const vp = editViewport({ kind: "zone-left" }); // { x: 0, y: 0, w: 80, h: 85 }
    const t = createTransformContext(800, 400, 20, vp);
    expect(t.scaleX).toBeCloseTo(360 / 85, 10);
    const center = rinkToCanvas({ x: vp.x + vp.w / 2, y: vp.y + vp.h / 2 }, t);
    expect(center.x).toBeCloseTo(400, 9);
    expect(center.y).toBeCloseTo(200, 9);
    expect(rinkToCanvas({ x: 0, y: 0 }, t).y).toBeCloseTo(20, 9);
    expect(rinkToCanvas({ x: 0, y: 85 }, t).y).toBeCloseTo(380, 9);
  });

  it("fits a wide viewport to the width", () => {
    const vp = editViewport({ kind: "custom", rect: { x: 20, y: 30, w: 160, h: 20 } }); // { 15, 25, 170, 30 }
    const t = createTransformContext(800, 400, 20, vp);
    expect(t.scaleX).toBeCloseTo(760 / 170, 10);
    expect(rinkToCanvas({ x: 15, y: 25 }, t).x).toBeCloseTo(20, 9);
    expect(rinkToCanvas({ x: 185, y: 25 }, t).x).toBeCloseTo(780, 9);
  });

  it.each([
    [{ x: 100, y: 40 }],
    [{ x: 150, y: 40 }], // outside a zone-neutral viewport
    [{ x: 0, y: 85 }],
  ])("round-trips %o through a cropped viewport", (p) => {
    const t = createTransformContext(800, 400, 20, editViewport({ kind: "zone-neutral" }));
    const back = canvasToRink(rinkToCanvas(p, t), t);
    expect(back.x).toBeCloseTo(p.x, 9);
    expect(back.y).toBeCloseTo(p.y, 9);
  });
});

describe("screen mapping under zoom and pan", () => {
  const t = createTransformContext(800, 400, 20, editViewport({ kind: "zone-neutral" }));
  const zoom = 2.3;
  const pan = { x: -137.5, y: 41.25 };

  it("matches ctx.setTransform(zoom, 0, 0, zoom, pan.x, pan.y) applied to rinkToCanvas", () => {
    const p = { x: 90, y: 20 };
    const c = rinkToCanvas(p, t);
    expect(rinkToScreen(p, t, zoom, pan)).toEqual({ x: c.x * zoom + pan.x, y: c.y * zoom + pan.y });
  });

  it.each([
    [{ x: 90, y: 20 }],
    [{ x: 150, y: 40 }], // outside the viewport, visible only after zooming out
    [{ x: 75, y: 0 }],
  ])("round-trips %o", (p) => {
    const back = screenToRink(rinkToScreen(p, t, zoom, pan), t, zoom, pan);
    expect(back.x).toBeCloseTo(p.x, 9);
    expect(back.y).toBeCloseTo(p.y, 9);
  });

  it("is the plain canvas mapping at zoom 1 and no pan", () => {
    const p = { x: 110, y: 60 };
    expect(screenToRink(rinkToCanvas(p, t), t, 1, { x: 0, y: 0 }).x).toBeCloseTo(110, 9);
  });
});
```

Append to `__tests__/lib/utils/canvas/rink-renderer-cache.test.ts` (inside the `describe("drawRink cache", …)` block, after the last `it`), and add `import { editViewport } from "@/lib/utils/ice-area";` to its imports:

```ts
  it("keys same-size viewports at different places apart", () => {
    const left = createTransformContext(800, 400, 20, editViewport({ kind: "half-left" }));
    const right = createTransformContext(800, 400, 20, editViewport({ kind: "half-right" }));
    expect(left.scaleX).toBe(right.scaleX);
    expect(left.offsetY).toBe(right.offsetY);
    expect(rinkCacheKey(left)).not.toBe(rinkCacheKey(right));
    expect(rinkCacheKey(createTransformContext(800, 400, 20, editViewport({ kind: "zone-left" })))).not.toBe(
      rinkCacheKey(createTransformContext(800, 400, 20)),
    );
  });

  it("never reuses one viewport's background for another", () => {
    const out = fakeCtx();
    const left = createTransformContext(800, 400, 20, editViewport({ kind: "half-left" }));
    const right = createTransformContext(800, 400, 20, editViewport({ kind: "half-right" }));
    drawRink(out, left);
    drawRink(out, right);
    drawRink(out, left);
    expect(built).toHaveLength(3);
  });
```

- [ ] **Step 2: Write the failing mask and scene tests**

Append to `__tests__/lib/utils/canvas/drawing-utils.test.ts`. Change line 1 to `import { describe, it, expect, vi, afterEach } from "vitest";`, change line 2 to `import { drawStroke, drawAreaMask, drawBoardScene } from "@/lib/utils/canvas/drawing-utils";`, change line 3 to `import { clearRinkCache, createTransformContext, FULL_RINK, rinkToCanvas } from "@/lib/utils/canvas/rink-renderer";`, and add `import { createEmptyPlayData } from "@/lib/utils/play-data";` and `import { areaRect } from "@/lib/utils/ice-area";`. Then append:

```ts
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
});
```

(The last test has no `createElement` stub, so `drawRink` falls back to drawing the rink directly. That fallback logs a `console.warn`, which is harmless here.)

Create `__tests__/lib/utils/canvas/thumbnail-area.test.ts`:

```ts
/** Thumbnails show the whole rink, with everything outside the drill's area shaded. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateThumbnail, THUMBNAIL_DIMENSIONS } from "@/lib/utils/canvas/thumbnail-generator";
import { clearRinkCache, createTransformContext, rinkToCanvas } from "@/lib/utils/canvas/rink-renderer";
import { createEmptyPlayData } from "@/lib/utils/play-data";

type Call = { name: string; args: unknown[] };

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

describe("generateThumbnail with an ice area", () => {
    let canvases: Call[][];

    beforeEach(() => {
        clearRinkCache();
        canvases = [];
        const real = document.createElement.bind(document);
        vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
            if (tag !== "canvas") return real(tag);
            const calls: Call[] = [];
            canvases.push(calls);
            const ctx = recordingCtx(calls);
            return { width: 0, height: 0, getContext: () => ctx, toDataURL: () => "data:image/png;base64,AA==" } as unknown as HTMLCanvasElement;
        }) as typeof document.createElement);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        clearRinkCache();
    });

    it("outlines the area on the full-rink transform", () => {
        generateThumbnail({ ...createEmptyPlayData(), area: { kind: "zone-right" } });
        const thumb = canvases[0]; // the thumbnail canvas is created first, the rink cache second
        const t = createTransformContext(THUMBNAIL_DIMENSIONS.width, THUMBNAIL_DIMENSIONS.height, 10);
        const outline = thumb.find((c) => c.name === "strokeRect");
        expect(outline?.args[0]).toBeCloseTo(rinkToCanvas({ x: 125, y: 0 }, t).x, 9);
        expect(thumb.some((c) => c.name === "fill" && c.args[0] === "evenodd")).toBe(true);
    });

    it("draws no mask for a full-ice drill", () => {
        generateThumbnail(createEmptyPlayData());
        expect(canvases[0].some((c) => c.name === "setLineDash")).toBe(false);
    });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bun run test __tests__/lib/utils/canvas/rink-renderer.test.ts __tests__/lib/utils/canvas/rink-renderer-cache.test.ts __tests__/lib/utils/canvas/drawing-utils.test.ts __tests__/lib/utils/canvas/thumbnail-area.test.ts`
Expected: FAIL. `rinkToScreen`, `screenToRink`, `drawAreaMask` and `drawBoardScene` are not exported, and `createTransformContext` ignores its fourth argument.

- [ ] **Step 4: Implement the viewport and screen mapping**

In `lib/utils/canvas/rink-renderer.ts`, replace `createTransformContext` (:70-106, including its doc comment) with:

```ts
/**
 * Creates a transformation context that fits `viewport` (rink feet; default
 * the whole rink) into the canvas, preserving aspect ratio and centering it.
 * rinkToCanvas/canvasToRink read only scale and offsets, so they work
 * unchanged for any viewport; shapes outside it are clipped by the canvas.
 *
 * @param canvasWidth - Width of the canvas element in pixels
 * @param canvasHeight - Height of the canvas element in pixels
 * @param padding - Padding around the viewport in pixels (default: 20)
 * @param viewport - Rink rectangle to fit (default: FULL_RINK)
 * @returns Transformation context for coordinate conversions
 */
export function createTransformContext(
    canvasWidth: number,
    canvasHeight: number,
    padding: number = 20,
    viewport: RinkRect = FULL_RINK
): TransformContext {
    const availableWidth = canvasWidth - padding * 2;
    const availableHeight = canvasHeight - padding * 2;

    // Scale that fits the viewport in the available space at its aspect ratio
    const scale = Math.min(availableWidth / viewport.w, availableHeight / viewport.h);

    // Center the viewport: rink x=viewport.x sits at the left of the fitted box
    const offsetX = (canvasWidth - viewport.w * scale) / 2 - viewport.x * scale;
    const offsetY = (canvasHeight - viewport.h * scale) / 2 - viewport.y * scale;

    return {
        canvasWidth,
        canvasHeight,
        scaleX: scale,
        scaleY: scale,
        offsetX,
        offsetY,
    };
}
```

Insert directly after `canvasToRink` (after :134):

```ts

/**
 * Board zoom/pan sits on top of the transform: RinkBoard calls
 * ctx.setTransform(zoom, 0, 0, zoom, pan.x, pan.y) before drawing, so a rink
 * point appears on screen at zoom * rinkToCanvas(p) + pan.
 */
export function rinkToScreen(p: Position, transform: TransformContext, zoom: number, pan: Position): Position {
    const c = rinkToCanvas(p, transform);
    return { x: c.x * zoom + pan.x, y: c.y * zoom + pan.y };
}

/** Inverse of rinkToScreen: undo pan and zoom, then the viewport transform. */
export function screenToRink(p: Position, transform: TransformContext, zoom: number, pan: Position): Position {
    return canvasToRink({ x: (p.x - pan.x) / zoom, y: (p.y - pan.y) / zoom }, transform);
}
```

- [ ] **Step 5: Implement the mask and the shared scene**

In `lib/utils/canvas/drawing-utils.ts`, replace the imports (:12-24) with:

```ts
import {
    Position,
    PlayerIcon,
    DrawingElement,
    TextAnnotation,
    EquipmentItem,
    PlayData,
} from "@/types/practice-planner";
import type { RinkRect, StrokeOptions } from "@/types/practice-planner";
import { FULL_RINK, TransformContext, drawRink, rinkToCanvas } from "./rink-renderer";
import { buildStrokeGeometry, type StrokeGeometry } from "./stroke-geometry";
import { drawPlayerGlyph, drawEquipmentGlyph } from "./glyphs";
import { EQUIPMENT_RADIUS_FT, PLAYER_RADIUS_FT, glyphRadiusPx } from "./glyph-metrics";
import { BOARD_COLORS } from "./notation";
```

Append at the end of the file:

```ts

/** Ink (#212121) at 35%: shades the ice outside a drill's area. */
const AREA_MASK_FILL = "rgba(33, 33, 33, 0.35)";
const AREA_OUTLINE_DASH = [8, 6];

function coversRink(rect: RinkRect): boolean {
    return rect.x <= 0 && rect.y <= 0 && rect.x + rect.w >= FULL_RINK.w && rect.y + rect.h >= FULL_RINK.h;
}

/**
 * Shades the rink outside `rect` (even-odd fill of the rink rectangle minus
 * the area) and outlines the area, dashed, in Action Blue. Draws nothing when
 * `rect` covers the whole rink.
 */
export function drawAreaMask(ctx: CanvasRenderingContext2D, rect: RinkRect, transform: TransformContext): void {
    if (coversRink(rect)) return;
    const rinkTopLeft = rinkToCanvas({ x: 0, y: 0 }, transform);
    const rinkBottomRight = rinkToCanvas({ x: FULL_RINK.w, y: FULL_RINK.h }, transform);
    const topLeft = rinkToCanvas({ x: rect.x, y: rect.y }, transform);
    const bottomRight = rinkToCanvas({ x: rect.x + rect.w, y: rect.y + rect.h }, transform);

    ctx.save();
    ctx.fillStyle = AREA_MASK_FILL;
    ctx.beginPath();
    ctx.rect(rinkTopLeft.x, rinkTopLeft.y, rinkBottomRight.x - rinkTopLeft.x, rinkBottomRight.y - rinkTopLeft.y);
    ctx.rect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
    ctx.fill("evenodd");
    ctx.strokeStyle = BOARD_COLORS.actionBlue;
    ctx.lineWidth = 2;
    ctx.setLineDash(AREA_OUTLINE_DASH);
    ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
    ctx.restore();
}

export interface BoardSceneOptions {
    /** Element drawn with the selection highlight */
    selectedId?: string;
    /** Canvas zoom applied by the caller (keeps minimum glyph size on screen) */
    zoom?: number;
    /** Rectangle left unshaded; omitted, or covering the rink, means no mask */
    maskRect?: RinkRect;
}

/**
 * The board's draw sequence, shared by RinkBoard and thumbnails: rink, then
 * elements, then the area mask on top, so elements outside the area are
 * dimmed with the ice they sit on.
 */
export function drawBoardScene(
    ctx: CanvasRenderingContext2D,
    transform: TransformContext,
    playData: PlayData,
    options: BoardSceneOptions = {}
): void {
    drawRink(ctx, transform);
    drawAllElements(ctx, playData, transform, options.selectedId, options.zoom ?? 1);
    if (options.maskRect) drawAreaMask(ctx, options.maskRect, transform);
}
```

- [ ] **Step 6: Draw thumbnails through the scene**

In `lib/utils/canvas/thumbnail-generator.ts`, replace lines 11-13 with:

```ts
import { PlayData } from "@/types/practice-planner";
import { createTransformContext } from "./rink-renderer";
import { drawBoardScene } from "./drawing-utils";
import { areaRect } from "@/lib/utils/ice-area";
```

Replace the block from `// Create transform context for thumbnail size` through `drawAllElements(ctx, playData, transform);` (:72-79) with:

```ts
    // Thumbnails always show the whole rink, so card sizes stay consistent;
    // the drill's area is shown by shading everything outside it.
    const transform = createTransformContext(width, height, 10);
    drawBoardScene(ctx, transform, playData, { maskRect: areaRect(playData.area) });
```

- [ ] **Step 7: Run the tests and type-check**

Run: `bun run test __tests__/lib/utils/canvas`
Expected: PASS (all existing canvas tests unchanged, plus the new ones).
Run: `bun run type-check`
Expected: no errors. RinkBoard still calls `createTransformContext(w, h)`, `drawRink` and `drawAllElements`, which are unchanged.

- [ ] **Step 8: Commit**

```bash
/usr/bin/git add lib/utils/canvas/rink-renderer.ts lib/utils/canvas/drawing-utils.ts lib/utils/canvas/thumbnail-generator.ts __tests__/lib/utils/canvas/rink-renderer.test.ts __tests__/lib/utils/canvas/rink-renderer-cache.test.ts __tests__/lib/utils/canvas/drawing-utils.test.ts __tests__/lib/utils/canvas/thumbnail-area.test.ts
/usr/bin/git commit -m "feat(practice-planner): viewport transform, area mask, and masked thumbnails

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 3: Clamp, drag and area-rectangle helpers

**Files:**
- Modify: `lib/utils/canvas/interaction-utils.ts` (imports :12-21; `clampToRinkBounds` :437-454)
- Modify: `lib/utils/canvas/element-ops.ts` (imports :2-15; append `rectFromDrag`)
- Test: `__tests__/lib/utils/canvas/interaction-utils.test.ts` (append), `__tests__/lib/utils/canvas/element-ops.test.ts` (append)

**Interfaces:**
- Consumes (Task 1): `RinkRect`, `FULL_RINK`, `MIN_AREA_FT`, `AREA_SNAP_FT`, `iceAreaSchema`, `areaRect`.
- Produces (`interaction-utils.ts`):
  - `clampToRect(position: Position, rect: RinkRect): Position`
  - `clampToRinkBounds(position, rinkWidth = 200, rinkHeight = 85)`, which keeps its signature and now delegates to `clampToRect`
  - `dragTarget(pointer: Position, grabOffset: Position, rect: RinkRect): Position`
- Produces (`element-ops.ts`): `rectFromDrag(start: Position, end: Position, snapFt?: number /* AREA_SNAP_FT */, minFt?: number /* MIN_AREA_FT */): RinkRect`.

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/lib/utils/canvas/interaction-utils.test.ts`. Add `clampToRect` and `dragTarget` to the interaction-utils import (:11-19), and add `import { areaRect } from "@/lib/utils/ice-area";` and `import { FULL_RINK } from "@/lib/utils/canvas/rink-renderer";`. Then append:

```ts
describe("clampToRect", () => {
  const zoneLeft = areaRect({ kind: "zone-left" });

  it("keeps a point inside, including on the edge", () => {
    expect(clampToRect({ x: 75, y: 85 }, zoneLeft)).toEqual({ x: 75, y: 85 });
    expect(clampToRect({ x: 30, y: 40 }, zoneLeft)).toEqual({ x: 30, y: 40 });
  });

  it("clamps each axis to the rectangle", () => {
    expect(clampToRect({ x: 150, y: 40 }, zoneLeft)).toEqual({ x: 75, y: 40 });
    expect(clampToRect({ x: -3, y: 99 }, { x: 100, y: 30, w: 20, h: 20 })).toEqual({ x: 100, y: 50 });
  });

  it("is what clampToRinkBounds does for the whole rink", () => {
    const p = { x: 250, y: -4 };
    expect(clampToRinkBounds(p)).toEqual(clampToRect(p, FULL_RINK));
  });
});

describe("dragTarget", () => {
  const zoneLeft = areaRect({ kind: "zone-left" });

  it("moves the element with the pointer, keeping the grab offset", () => {
    expect(dragTarget({ x: 50, y: 40 }, { x: 2, y: -1 }, zoneLeft)).toEqual({ x: 48, y: 41 });
  });

  it("lets an element grabbed off-center reach the area edge exactly", () => {
    // Clamping the pointer to the area first would stop the element at 73.
    expect(dragTarget({ x: 77, y: 40 }, { x: 2, y: 0 }, zoneLeft)).toEqual({ x: 75, y: 40 });
  });

  it("clamps an element dragged far past the edge", () => {
    expect(dragTarget({ x: 160, y: 90 }, { x: -3, y: 0 }, zoneLeft)).toEqual({ x: 75, y: 85 });
  });
});
```

Append to `__tests__/lib/utils/canvas/element-ops.test.ts`. Add `rectFromDrag` to the element-ops import (line 2), and add `import { iceAreaSchema } from "@/lib/utils/play-data";`. Then append:

```ts
describe("rectFromDrag", () => {
    it("snaps both corners to 5 ft", () => {
        expect(rectFromDrag({ x: 12, y: 7 }, { x: 48, y: 33 })).toEqual({ x: 10, y: 5, w: 40, h: 30 });
    });

    it("gives the same rectangle for a reversed drag", () => {
        expect(rectFromDrag({ x: 48, y: 33 }, { x: 12, y: 7 })).toEqual({ x: 10, y: 5, w: 40, h: 30 });
    });

    it("grows a short drag to the 20 ft minimum", () => {
        expect(rectFromDrag({ x: 100, y: 40 }, { x: 101, y: 41 })).toEqual({ x: 100, y: 40, w: 20, h: 20 });
    });

    it("keeps a minimum-size rectangle inside the rink at the far corner", () => {
        expect(rectFromDrag({ x: 199, y: 84 }, { x: 197, y: 83 })).toEqual({ x: 180, y: 65, w: 20, h: 20 });
    });

    it("clamps a drag that leaves the rink", () => {
        expect(rectFromDrag({ x: -10, y: -10 }, { x: 300, y: 100 })).toEqual({ x: 0, y: 0, w: 200, h: 85 });
    });

    it("always yields a custom area the schema accepts", () => {
        for (let x = -10; x <= 210; x += 17) {
            for (let y = -10; y <= 95; y += 13) {
                const rect = rectFromDrag({ x, y }, { x: 200 - x / 2, y: 85 - y / 3 });
                expect(iceAreaSchema.safeParse({ kind: "custom", rect }).success).toBe(true);
            }
        }
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test __tests__/lib/utils/canvas/interaction-utils.test.ts __tests__/lib/utils/canvas/element-ops.test.ts`
Expected: FAIL. `clampToRect`, `dragTarget` and `rectFromDrag` are not exported.

- [ ] **Step 3: Implement the clamp and drag helpers**

In `lib/utils/canvas/interaction-utils.ts`, add `RinkRect,` to the `@/types/practice-planner` import list (:12-19). Leave the `./rink-renderer` import on line 20 unchanged. Replace `clampToRinkBounds` and its doc comment (:437-454) with:

```ts
/**
 * Clamps a position to an axis-aligned rectangle in rink feet.
 */
export function clampToRect(position: Position, rect: RinkRect): Position {
    return {
        x: Math.max(rect.x, Math.min(rect.x + rect.w, position.x)),
        y: Math.max(rect.y, Math.min(rect.y + rect.h, position.y)),
    };
}

/**
 * Clamps a position to stay within rink bounds: `clampToRect` over the rink.
 *
 * @param position - Position to clamp
 * @param rinkWidth - Rink width (default: 200)
 * @param rinkHeight - Rink height (default: 85)
 * @returns Clamped position
 */
export function clampToRinkBounds(
    position: Position,
    rinkWidth: number = 200,
    rinkHeight: number = 85
): Position {
    return clampToRect(position, { x: 0, y: 0, w: rinkWidth, h: rinkHeight });
}

/**
 * Where a dragged element lands: the pointer (clamped only to the rink by the
 * caller) minus the grab offset, then clamped to `rect`. Clamping the pointer
 * to `rect` first would stop the element `grabOffset` feet short of the edge.
 */
export function dragTarget(pointer: Position, grabOffset: Position, rect: RinkRect): Position {
    return clampToRect({ x: pointer.x - grabOffset.x, y: pointer.y - grabOffset.y }, rect);
}
```

- [ ] **Step 4: Implement `rectFromDrag`**

In `lib/utils/canvas/element-ops.ts`, replace the imports (:2-15) with:

```ts
import {
    AREA_SNAP_FT,
    MIN_AREA_FT,
    VALIDATION_CONSTRAINTS as C,
    type DrawingElement,
    type EquipmentItem,
    type EquipmentKind,
    type PlayData,
    type PlayerIcon,
    type PlayerRole,
    type Position,
    type RinkRect,
    type StrokeOptions,
    type TextAnnotation,
} from "@/types/practice-planner";
import { RINK_HEIGHT_FT, RINK_WIDTH_FT, simplifyPoints } from "@/lib/utils/play-data";
import { ROLE_DEFAULT_COLORS } from "@/lib/utils/canvas/notation";
```

Append at the end of the file:

```ts

// ============================================================================
// Custom ice area (area tool)
// ============================================================================

const snapTo = (value: number, step: number) => Math.round(value / step) * step;

/**
 * One axis of a dragged rectangle: both edges snapped and clamped to
 * [0, max]; a span under `minFt` grows from its low edge, shifted back
 * inside the rink if that overflows.
 */
function snappedSpan(a: number, b: number, snapFt: number, minFt: number, max: number): [number, number] {
    let lo = Math.min(max, Math.max(0, snapTo(Math.min(a, b), snapFt)));
    let hi = Math.min(max, Math.max(0, snapTo(Math.max(a, b), snapFt)));
    if (hi - lo < minFt) {
        hi = lo + minFt;
        if (hi > max) {
            hi = max;
            lo = max - minFt;
        }
    }
    return [lo, hi];
}

/**
 * The custom area a drag from `start` to `end` (rink feet, either direction)
 * describes: snapped to `snapFt`, at least `minFt` on each side, inside the
 * rink. Always valid for `iceAreaSchema`.
 */
export function rectFromDrag(
    start: Position,
    end: Position,
    snapFt: number = AREA_SNAP_FT,
    minFt: number = MIN_AREA_FT
): RinkRect {
    const [x0, x1] = snappedSpan(start.x, end.x, snapFt, minFt, RINK_WIDTH_FT);
    const [y0, y1] = snappedSpan(start.y, end.y, snapFt, minFt, RINK_HEIGHT_FT);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
```

- [ ] **Step 5: Run the tests and type-check**

Run: `bun run test __tests__/lib/utils/canvas/interaction-utils.test.ts __tests__/lib/utils/canvas/element-ops.test.ts`
Expected: PASS.
Run: `bun run type-check`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add lib/utils/canvas/interaction-utils.ts lib/utils/canvas/element-ops.ts __tests__/lib/utils/canvas/interaction-utils.test.ts __tests__/lib/utils/canvas/element-ops.test.ts
/usr/bin/git commit -m "feat(practice-planner): clamp, drag, and custom-area rectangle helpers

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 4: Wire the area into RinkBoard (viewport, mask, clamp, `setArea`)

**Files:**
- Modify: `components/features/practice-planner/RinkBoard.tsx`. Edits, with current line ranges:
  - imports :13-48
  - `RinkBoardHandle` :78-84
  - `getTransformedRinkPosition` :176-204
  - transform effect :239-245
  - `render` :261-298
  - `handleClear` :386-403
  - imperative handle :409-418
  - `handleMouseDown` :452-572
  - `handleMouseMove` :582-611
- Test: `__tests__/components/features/practice-planner/RinkBoard.ice-area.test.tsx` (create)

**Interfaces:**
- Consumes:
  - Task 1: `areaRect`, `editViewport`, `withArea`, `FULL_RINK`, `IceArea`
  - Task 2: `screenToRink`, `drawBoardScene`, `createTransformContext(w, h, padding, viewport)`
  - Task 3: `clampToRect`, `dragTarget`
- Produces: `RinkBoardHandle.setArea(area: IceArea | undefined): void`. It goes through `updatePlayData`, so it is undoable, and it records nothing when the area is unchanged.
- Board behavior (no new props in this task):
  - edit-mode viewport = `editViewport(playData.area)`; view mode = `FULL_RINK`
  - mask = `areaRect(playData.area)`
  - placement and stroke points clamp to the area; drags land at `dragTarget`
  - hit tests use the rink-clamped pointer
  - Clear keeps the area
  - zoom and pan reset when the viewport changes

- [ ] **Step 1: Write the failing board tests**

Create `__tests__/components/features/practice-planner/RinkBoard.ice-area.test.tsx`:

```tsx
/**
 * RinkBoard + drill ice area: the edit board fits the area (plus a 5 ft
 * margin), clamps what is placed or dragged to it, keeps elements outside it
 * selectable and erasable, and sets the area through undoable history.
 */
import React from "react";
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { RinkBoard, type RinkBoardHandle, type RinkBoardProps } from "@/components/features/practice-planner/RinkBoard";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { createTransformContext, rinkToCanvas } from "@/lib/utils/canvas/rink-renderer";
import { editViewport } from "@/lib/utils/ice-area";
import type { IceArea, PlayData } from "@/types/practice-planner";

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
    // Never runs the callback: rendering is tested on drawBoardScene instead.
    global.requestAnimationFrame = vi.fn(() => 1) as unknown as typeof requestAnimationFrame;
    global.cancelAnimationFrame = vi.fn();
    HTMLCanvasElement.prototype.getContext = vi.fn(() => mockCanvasContext) as unknown as HTMLCanvasElement["getContext"];
});

const CUSTOM: IceArea = { kind: "custom", rect: { x: 100, y: 30, w: 20, h: 20 } }; // viewport { 95, 25, 30, 30 }

const cone = (x: number, y = 40) => ({ id: "c", kind: "cone" as const, position: { x, y }, rotation: 0 });

describe("RinkBoard ice area", () => {
    let widthSpy: ReturnType<typeof vi.spyOn>;
    let heightSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
        widthSpy = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800);
        heightSpy = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(400);
    });
    afterEach(() => {
        widthSpy.mockRestore();
        heightSpy.mockRestore();
    });

    function setup(props: Partial<RinkBoardProps> = {}) {
        const onPlayDataChange = vi.fn();
        const onSelectionChange = vi.fn();
        const ref = React.createRef<RinkBoardHandle>();
        const playData: PlayData = props.playData ?? createEmptyPlayData();
        const utils = render(
            <RinkBoard
                ref={ref}
                mode="edit"
                width={800}
                height={400}
                onPlayDataChange={onPlayDataChange}
                onSelectionChange={onSelectionChange}
                {...props}
                playData={playData}
            />
        );
        const canvas = utils.container.querySelector("canvas")!;
        canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 400, right: 800, bottom: 400, x: 0, y: 0, toJSON: () => ({}) });
        // Pointer for a rink point, through the viewport the board uses for this drill's area.
        const transform = createTransformContext(800, 400, 20, editViewport(playData.area));
        const at = (x: number, y: number) => {
            const p = rinkToCanvas({ x, y }, transform);
            return { clientX: p.x, clientY: p.y };
        };
        return { ...utils, canvas, at, ref, onPlayDataChange, onSelectionChange };
    }

    it("clamps a placement to the area (zone-left, click near x=150)", () => {
        const { canvas, at, onPlayDataChange } = setup({
            playData: { ...createEmptyPlayData(), area: { kind: "zone-left" } },
            selectedTool: "player",
        });
        fireEvent.mouseDown(canvas, at(150, 40));
        const placed = onPlayDataChange.mock.calls[0][0].players[0].position;
        expect(placed.x).toBe(75);
        expect(placed.y).toBeCloseTo(40, 6);
    });

    it("maps the pointer through the zoomed viewport", () => {
        // Under the whole-rink transform this pixel is about (88.9, 17.4).
        const { canvas, at, onPlayDataChange } = setup({
            playData: { ...createEmptyPlayData(), area: { kind: "zone-neutral" } },
            selectedTool: "equipment",
        });
        fireEvent.mouseDown(canvas, at(90, 20));
        const placed = onPlayDataChange.mock.calls[0][0].equipment[0].position;
        expect(placed.x).toBeCloseTo(90, 6);
        expect(placed.y).toBeCloseTo(20, 6);
    });

    it("keeps an element outside a narrowed area selectable", () => {
        // 3 ft outside the area, inside the 5 ft margin; the 22 px hit radius is 1.83 ft here,
        // so a hit test at the area-clamped point (100, 40) would miss it.
        const { canvas, at, onSelectionChange } = setup({
            playData: { ...createEmptyPlayData(), area: CUSTOM, equipment: [cone(97)] },
            selectedTool: "select",
        });
        fireEvent.mouseDown(canvas, at(97, 40));
        fireEvent.mouseUp(canvas);
        expect(onSelectionChange).toHaveBeenLastCalledWith("c");
    });

    it("keeps an element outside a narrowed area erasable", () => {
        const { canvas, at, onPlayDataChange } = setup({
            playData: { ...createEmptyPlayData(), area: CUSTOM, equipment: [cone(97)] },
            selectedTool: "eraser",
        });
        fireEvent.mouseDown(canvas, at(97, 40));
        expect(onPlayDataChange.mock.calls[0][0].equipment).toHaveLength(0);
    });

    it("deletes a selected outside element with Backspace", () => {
        const { canvas, at, onPlayDataChange } = setup({
            playData: { ...createEmptyPlayData(), area: CUSTOM, equipment: [cone(97)] },
            selectedTool: "select",
        });
        fireEvent.mouseDown(canvas, at(97, 40));
        fireEvent.mouseUp(canvas);
        fireEvent.keyDown(document.body, { key: "Backspace" });
        expect(onPlayDataChange.mock.calls.at(-1)![0].equipment).toHaveLength(0);
    });

    it("drags an element grabbed off-center exactly to the area edge", () => {
        const { canvas, at, onPlayDataChange } = setup({
            playData: { ...createEmptyPlayData(), area: CUSTOM, equipment: [cone(115)] },
            selectedTool: "select",
        });
        fireEvent.mouseDown(canvas, at(116, 40)); // grab 1 ft right of center
        fireEvent.mouseMove(canvas, at(124, 40)); // past the edge, inside the margin
        fireEvent.mouseUp(canvas);
        expect(onPlayDataChange).toHaveBeenCalledTimes(1);
        expect(onPlayDataChange.mock.calls[0][0].equipment[0].position.x).toBe(120);
    });

    it("sets the area through undoable history", () => {
        const { ref, onPlayDataChange, rerender } = setup();
        act(() => ref.current!.setArea({ kind: "zone-left" }));
        const zoned = onPlayDataChange.mock.calls.at(-1)![0];
        expect(zoned.area).toEqual({ kind: "zone-left" });
        rerender(<RinkBoard ref={ref} mode="edit" width={800} height={400} playData={zoned} onPlayDataChange={onPlayDataChange} />);
        act(() => ref.current!.undo());
        expect("area" in onPlayDataChange.mock.calls.at(-1)![0]).toBe(false);
    });

    it("records nothing when the area is unchanged, and removes the key for full ice", () => {
        const { ref, onPlayDataChange } = setup({ playData: { ...createEmptyPlayData(), area: { kind: "zone-left" } } });
        act(() => ref.current!.setArea({ kind: "zone-left" }));
        expect(onPlayDataChange).not.toHaveBeenCalled();
        act(() => ref.current!.setArea(undefined));
        expect("area" in onPlayDataChange.mock.calls.at(-1)![0]).toBe(false);
    });

    it("keeps the area when the board is cleared", () => {
        const { ref, onPlayDataChange } = setup({
            playData: { ...createEmptyPlayData(), area: { kind: "zone-left" }, equipment: [cone(40)] },
        });
        act(() => ref.current!.clear());
        const cleared = onPlayDataChange.mock.calls.at(-1)![0];
        expect(cleared.equipment).toHaveLength(0);
        expect(cleared.area).toEqual({ kind: "zone-left" });
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test __tests__/components/features/practice-planner/RinkBoard.ice-area.test.tsx`
Expected: FAIL: placements are not clamped to the area, the pointer maps through the whole-rink transform, `setArea` is not a function, and the area is dropped on Clear. The "selectable"/"erasable" cases may pass or fail at this point. That depends on mapping, not on the hit-test fix, so do not rely on them as the red signal; they pin the fix in Step 4.

- [ ] **Step 3: Update imports and the handle**

Replace the imports (:14-48) with:

```tsx
import type {
    IceArea,
    PlayData,
    DrawingTool,
    EquipmentKind,
    PlayerRole,
    Position,
    StrokeOptions,
    TextAnnotation,
} from "@/types/practice-planner";
import {
    createTransformContext,
    FULL_RINK,
    TransformContext,
    rinkToCanvas,
    screenToRink,
} from "@/lib/utils/canvas/rink-renderer";
import { drawBoardScene, drawStroke } from "@/lib/utils/canvas/drawing-utils";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { areaRect, editViewport, withArea } from "@/lib/utils/ice-area";
import {
    findElement,
    finishStroke,
    limitMessage,
    moveElement,
    placeEquipment,
    placePlayer,
    removeElement,
    updateElement as applyElementPatch,
    type ElementPatch,
} from "@/lib/utils/canvas/element-ops";
import {
    HistoryManager,
    hitTest,
    getMousePosition,
    clampToRect,
    dragTarget,
} from "@/lib/utils/canvas/interaction-utils";
```

(`rinkToCanvas` was already imported and unused. It is kept so this diff stays minimal; delete it if lint flags it.)

Replace `RinkBoardHandle` (:78-84) with:

```tsx
export interface RinkBoardHandle {
    undo: () => void;
    redo: () => void;
    clear: () => void;
    /** Patches an element's editable fields; recorded in undo history */
    updateElement: (id: string, patch: ElementPatch) => void;
    /** Sets the drill's ice area (undefined = full ice); recorded in undo history */
    setArea: (area: IceArea | undefined) => void;
}
```

- [ ] **Step 4: Wire the viewport, scene, mapping, clear and handle**

In `getTransformedRinkPosition`, replace everything from `if (!canvasPos) return null;` to the end of the callback body (:192-201) with:

```tsx
            if (!canvasPos) return null;

            // Undo zoom/pan, then the viewport transform
            return screenToRink(canvasPos, transformCtx, scaleRef.current, panOffsetRef.current);
```

Replace the transform effect (:239-245, `/** Update transform context when canvas size changes */` and its `useEffect`) with:

```tsx
    /**
     * Viewport: in edit mode, the drill's ice area plus a 5 ft margin (the
     * whole rink for full ice); in view mode, always the whole rink. Keyed on
     * the four numbers, not the area object, which is new on every edit.
     */
    const viewport = mode === "edit" ? editViewport(playData.area) : FULL_RINK;
    const { x: viewX, y: viewY, w: viewW, h: viewH } = viewport;
    useEffect(() => {
        setTransform(
            createTransformContext(canvasSize.width, canvasSize.height, 20, { x: viewX, y: viewY, w: viewW, h: viewH })
        );
    }, [canvasSize, viewX, viewY, viewW, viewH]);

    // A new viewport starts unzoomed: a pinch-zoom/pan made for the old one would misframe it.
    useEffect(() => {
        setScale(1);
        setPanOffset({ x: 0, y: 0 });
    }, [viewX, viewY, viewW, viewH]);
```

In `render`, replace from `// Draw rink background` through the `drawAllElements(...)` line (:271-278) with:

```tsx
        // Drag preview is visual only; the move is committed on mouseUp
        const renderData = isDragging && selectedElementId && dragPreviewPosition
            ? moveElement(playData, selectedElementId, dragPreviewPosition)
            : playData;
        drawBoardScene(ctx, transform, renderData, {
            selectedId: selectedElementId || undefined,
            zoom: scale,
            maskRect: areaRect(playData.area),
        });
```

In `handleClear`, replace `const clearedData: PlayData = createEmptyPlayData();` (:389) with:

```tsx
        // Clear removes the drawing, not the drill's setup: the ice area stays
        const clearedData: PlayData = withArea(createEmptyPlayData(), playDataRef.current.area);
```

Replace the `useImperativeHandle` block (:409-418) with:

```tsx
    useImperativeHandle(ref, () => ({
        undo: handleUndo,
        redo: handleRedo,
        clear: handleClear,
        updateElement: (id: string, patch: ElementPatch) => {
            const current = playDataRef.current;
            const next = applyElementPatch(current, id, patch);
            if (next !== current) updatePlayData(next);
        },
        setArea: (area: IceArea | undefined) => {
            const current = playDataRef.current;
            const next = withArea(current, area);
            if (next !== current) updatePlayData(next);
        },
    }), [handleUndo, handleRedo, handleClear, updatePlayData]);
```

- [ ] **Step 5: Separate hit testing from placement in the pointer handlers**

Replace `handleMouseDown` (:448-572, from its doc comment through the closing `);` of its `useCallback`) with:

```tsx
    /**
     * Handle mouse down event
     * Requirements: 1.2, 1.3, 1.4, 5.1, 5.2, 5.4
     */
    const handleMouseDown = useCallback(
        (event: React.MouseEvent<HTMLCanvasElement>) => {
            if (mode === "view" || !transform || !canvasRef.current) return;

            // Touch taps never move focus off a text field (touchend is
            // preventDefault-ed), so blur it here: its blur commit then lands
            // on the element selected *before* this press changes the selection.
            const active = document.activeElement;
            if (active instanceof HTMLElement && isEditableTarget(active) && !canvasRef.current.contains(active)) {
                active.blur();
            }

            const rinkPos = getTransformedRinkPosition(event.nativeEvent, canvasRef.current, transform);
            if (!rinkPos) return;

            // Hit tests use the pointer clamped only to the rink, so an element
            // outside the drill's ice area stays selectable and erasable.
            // Anything placed is clamped to the area.
            const hitPos = clampToRect(rinkPos, FULL_RINK);
            const clampedPos = clampToRect(rinkPos, areaRect(playData.area));

            // Handle different tools
            switch (selectedTool) {
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
                    const hitResult = hitTest(hitPos, playData, minHitRadiusFt());
                    if (hitResult.hit && hitResult.elementId) {
                        setSelectedElementId(hitResult.elementId);
                        setIsDragging(true);

                        // Drag offset keeps the grab point under the pointer.
                        // Strokes have no position and are not draggable.
                        const found = findElement(playData, hitResult.elementId);
                        if (found && found.kind !== "drawing") {
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

                case "player": {
                    // Place player icon
                    // Requirements: 1.2
                    const blocked = limitMessage(playData, "player");
                    if (blocked) { onLimitReached?.(blocked); break; }
                    updatePlayData(placePlayer(playData, clampedPos, playerRole, generateId()));
                    break;
                }

                case "equipment": {
                    const blocked = limitMessage(playData, "equipment");
                    if (blocked) { onLimitReached?.(blocked); break; }
                    updatePlayData(placeEquipment(playData, clampedPos, equipmentKind, generateId()));
                    break;
                }

                case "stroke": {
                    // Start drawing; the limit is checked when the stroke finishes
                    // Requirements: 1.3, 5.1, 5.2
                    setIsDrawing(true);
                    setCurrentDrawingPoints([clampedPos]);
                    break;
                }

                case "text": {
                    // Add text annotation
                    // Requirements: 1.4
                    const blocked = limitMessage(playData, "annotation");
                    if (blocked) { onLimitReached?.(blocked); break; }
                    const text = prompt("Enter text annotation:");
                    if (text && text.trim()) {
                        const newAnnotation: TextAnnotation = {
                            id: generateId(),
                            text: text.trim(),
                            position: clampedPos,
                            fontSize: 14,
                            color: selectedColor,
                        };
                        updatePlayData({
                            ...playData,
                            annotations: [...playData.annotations, newAnnotation],
                        });
                    }
                    break;
                }

                case "eraser": {
                    // Erase element
                    // Requirements: 5.4
                    const eraserHitResult = hitTest(hitPos, playData, minHitRadiusFt());
                    if (eraserHitResult.hit && eraserHitResult.elementId) {
                        updatePlayData(removeElement(playData, eraserHitResult.elementId));
                    }
                    break;
                }
            }
        },
        [
            mode,
            transform,
            selectedTool,
            selectedColor,
            playData,
            playerRole,
            equipmentKind,
            onLimitReached,
            updatePlayData,
            generateId,
            getTransformedRinkPosition,
            minHitRadiusFt,
        ]
    );
```

Replace `handleMouseMove` (:574-611, from its doc comment through the closing `);`) with:

```tsx
    /**
     * Handle mouse move event
     * Requirements: 1.3, 5.1, 5.2
     *
     * Uses refs for drag-related state to avoid stale closures.
     * During dragging, only updates the preview position (visual feedback).
     * The actual data change is committed on mouseUp for performance.
     */
    const handleMouseMove = useCallback(
        (event: React.MouseEvent<HTMLCanvasElement>) => {
            if (mode === "view" || !transform || !canvasRef.current) return;

            const rinkPos = getTransformedRinkPosition(event.nativeEvent, canvasRef.current, transform);
            if (!rinkPos) return;

            const area = areaRect(playDataRef.current.area);

            // Continue drawing if in drawing mode; stroke points stay in the area
            if (isDrawing && selectedTool === "stroke") {
                setCurrentDrawingPoints((prev) => [...prev, clampToRect(rinkPos, area)]);
            }

            // Drag preview: pointer clamped only to the rink, minus the grab
            // offset, then clamped to the area, so the element can reach the
            // area's edge exactly. Committed on mouseUp.
            // Requirements: 5.4
            if (isDraggingRef.current && selectedElementIdRef.current && dragOffsetRef.current) {
                setDragPreviewPosition(dragTarget(clampToRect(rinkPos, FULL_RINK), dragOffsetRef.current, area));
            }
        },
        [mode, transform, isDrawing, selectedTool, getTransformedRinkPosition]
    );
```

- [ ] **Step 6: Run the board tests, then the neighbors**

Run: `bun run test __tests__/components/features/practice-planner/RinkBoard.ice-area.test.tsx __tests__/components/features/practice-planner/RinkBoard.test.tsx`
Expected: PASS. The existing RinkBoard tests use no area, so their viewport is `FULL_RINK` and their `at()` helper still matches.
Run: `bun run test __tests__/components/features/practice-planner`
Expected: PASS.
Run: `bun run type-check && bun run lint`
Expected: no errors. If lint reports `rinkToCanvas` unused, remove it from the import.

- [ ] **Step 7: Commit**

```bash
/usr/bin/git add components/features/practice-planner/RinkBoard.tsx __tests__/components/features/practice-planner/RinkBoard.ice-area.test.tsx
/usr/bin/git commit -m "feat(practice-planner): edit board zooms to and clamps within the drill's ice area

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 5: PlayEditor "Ice area" select, the area tool, and the outside-elements alert

**Files:**
- Modify: `components/features/practice-planner/RinkBoard.tsx`:
  - props :53-72 and destructuring :113-127
  - interaction state after :145
  - viewport (from Task 4)
  - `render` (from Task 4)
  - tool-change effect :429-433
  - `handleMouseDown`, `handleMouseMove`, `handleMouseUp` :620-664
  - window mouseup effect :671-679
- Modify: `components/features/practice-planner/PlayEditor.tsx` (imports :13-37; state after :98; metadata JSX :314-351; board Paper :377-398)
- Test: `__tests__/components/features/practice-planner/RinkBoard.ice-area.test.tsx` (append), `__tests__/components/features/practice-planner/PlayEditor.ice-area.test.tsx` (create)

**Interfaces:**
- Consumes:
  - Task 1: `ICE_AREA_PRESETS`, `IceAreaPreset`, `ICE_AREA_LABELS`, `areaRect`, `isFullIce`, `countElementsOutside`, `withArea`, `FULL_RINK`
  - Task 3: `rectFromDrag`, `clampToRect`
  - Task 4: `RinkBoardHandle.setArea`
- Produces:
  - `RinkBoardProps.areaTool?: boolean`: while true, the viewport is `FULL_RINK` and a drag draws a custom area instead of using `selectedTool`.
  - `RinkBoardProps.onAreaDrawn?: () => void`: fires once per finished area drag.
  - `export function outsideAreaMessage(count: number): string` (`PlayEditor.tsx`).
- `SessionDrillDialog` hosts `PlayEditor` and needs no change.

- [ ] **Step 1: Write the failing tests**

Append inside the `describe("RinkBoard ice area", …)` block of `__tests__/components/features/practice-planner/RinkBoard.ice-area.test.tsx`. Add `FULL_RINK` to that file's rink-renderer import first:

```tsx
    it("draws a snapped custom area over the whole rink with the area tool", () => {
        const onAreaDrawn = vi.fn();
        const { canvas, onPlayDataChange } = setup({
            playData: { ...createEmptyPlayData(), area: { kind: "zone-left" } },
            selectedTool: "player",
            areaTool: true,
            onAreaDrawn,
        });
        // The area tool shows the whole rink, whatever the current area.
        const full = createTransformContext(800, 400, 20, FULL_RINK);
        const atFull = (x: number, y: number) => {
            const p = rinkToCanvas({ x, y }, full);
            return { clientX: p.x, clientY: p.y };
        };
        fireEvent.mouseDown(canvas, atFull(122, 33));
        fireEvent.mouseMove(canvas, atFull(148, 61));
        fireEvent.mouseUp(canvas);

        expect(onPlayDataChange).toHaveBeenCalledTimes(1);
        const drawn = onPlayDataChange.mock.calls[0][0];
        expect(drawn.area).toEqual({ kind: "custom", rect: { x: 120, y: 35, w: 30, h: 25 } });
        expect(drawn.players).toHaveLength(0);
        expect(onAreaDrawn).toHaveBeenCalledTimes(1);
    });

    it("finishes an area drag released outside the canvas", () => {
        const onAreaDrawn = vi.fn();
        const { canvas, onPlayDataChange } = setup({ areaTool: true, onAreaDrawn });
        const full = createTransformContext(800, 400, 20, FULL_RINK);
        const p = rinkToCanvas({ x: 10, y: 10 }, full);
        fireEvent.mouseDown(canvas, { clientX: p.x, clientY: p.y });
        fireEvent.mouseUp(window);
        expect(onPlayDataChange.mock.calls[0][0].area).toEqual({ kind: "custom", rect: { x: 10, y: 10, w: 20, h: 20 } });
        expect(onAreaDrawn).toHaveBeenCalledTimes(1);
    });
```

Create `__tests__/components/features/practice-planner/PlayEditor.ice-area.test.tsx`:

```tsx
/**
 * PlayEditor ↔ ice area: the select sets the area through the board handle,
 * Custom turns the area tool on until a rectangle is drawn, and elements
 * outside the area are flagged inline.
 */
import React, { forwardRef, useImperativeHandle } from "react";
import { describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import type { RinkBoardProps } from "@/components/features/practice-planner/RinkBoard";
import { withArea } from "@/lib/utils/ice-area";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import type { IceArea, PlayData } from "@/types/practice-planner";

const boardProps: { current: RinkBoardProps | null } = { current: null };

vi.mock("@/lib/utils/canvas/thumbnail-generator", () => ({ generateThumbnail: () => "" }));
vi.mock("@/components/features/practice-planner/RinkBoard", () => ({
    RinkBoard: forwardRef(function MockBoard(props: RinkBoardProps, ref) {
        boardProps.current = props;
        useImperativeHandle(ref, () => ({
            undo: () => {}, redo: () => {}, clear: () => {}, updateElement: () => {},
            setArea: (area: IceArea | undefined) => {
                const next = withArea(props.playData, area);
                if (next !== props.playData) props.onPlayDataChange?.(next);
            },
        }));
        return <div data-testid="board" />;
    }),
}));

import { PlayEditor, outsideAreaMessage } from "@/components/features/practice-planner/PlayEditor";

function renderEditor(playData: PlayData = createEmptyPlayData()) {
    return render(
        <ThemeProvider theme={createTheme()}>
            <PlayEditor teamId="t" initialData={{ name: "Drill", playData }} />
        </ThemeProvider>
    );
}

async function chooseArea(label: string) {
    fireEvent.mouseDown(screen.getByRole("combobox", { name: /Ice area/ }));
    fireEvent.click(await screen.findByRole("option", { name: label }));
}

describe("PlayEditor ice area", () => {
    it("sets a preset and clears it back to full ice", async () => {
        renderEditor();
        await chooseArea("Neutral zone");
        expect(boardProps.current!.playData.area).toEqual({ kind: "zone-neutral" });
        await chooseArea("Full ice");
        expect("area" in boardProps.current!.playData).toBe(false);
    });

    it("flags elements outside the area, and clears the flag when they fit", async () => {
        renderEditor({
            ...createEmptyPlayData(),
            players: [{ id: "p", position: { x: 150, y: 40 }, role: "X", label: "", color: "#1976D2" }],
        });
        expect(screen.queryByText(/outside the ice area/)).not.toBeInTheDocument();
        await chooseArea("Left end zone");
        expect(screen.getByText("1 element is outside the ice area.")).toBeInTheDocument();
        await chooseArea("Half ice (right)");
        expect(screen.queryByText(/outside the ice area/)).not.toBeInTheDocument();
    });

    it("turns the area tool on for Custom area… and off once a rectangle is drawn", async () => {
        renderEditor();
        await chooseArea("Custom area…");
        expect(boardProps.current!.areaTool).toBe(true);
        expect(screen.getByText("Drag on the rink to draw the ice area.")).toBeInTheDocument();
        act(() => boardProps.current!.onAreaDrawn!());
        expect(boardProps.current!.areaTool).toBe(false);
        expect(screen.queryByText("Drag on the rink to draw the ice area.")).not.toBeInTheDocument();
    });

    it("cancels the area tool without changing the area", async () => {
        renderEditor();
        await chooseArea("Custom area…");
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(boardProps.current!.areaTool).toBe(false);
        expect("area" in boardProps.current!.playData).toBe(false);
    });

    it("offers a redraw for a drill that already has a custom area", () => {
        renderEditor({ ...createEmptyPlayData(), area: { kind: "custom", rect: { x: 100, y: 30, w: 20, h: 20 } } });
        fireEvent.click(screen.getByRole("button", { name: "Redraw custom area" }));
        expect(boardProps.current!.areaTool).toBe(true);
    });

    it("words the alert for one and for many elements", () => {
        expect(outsideAreaMessage(1)).toBe("1 element is outside the ice area.");
        expect(outsideAreaMessage(3)).toBe("3 elements are outside the ice area.");
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test __tests__/components/features/practice-planner/RinkBoard.ice-area.test.tsx __tests__/components/features/practice-planner/PlayEditor.ice-area.test.tsx`
Expected: FAIL. `areaTool`/`onAreaDrawn` are not props (the test file does not type-check against them), there is no "Ice area" combobox, and `outsideAreaMessage` is not exported.

- [ ] **Step 3: Add the area tool to RinkBoard**

In `RinkBoardProps`, add after `onLimitReached` (:71):

```tsx
    /** While true, a drag draws the drill's custom ice area over the whole rink */
    areaTool?: boolean;
    /** Fires once each time the area tool finishes a rectangle */
    onAreaDrawn?: () => void;
```

In the component's destructuring (:113-127), add `areaTool = false,` and `onAreaDrawn,` after `onLimitReached,`.

In the element-ops import block, add `rectFromDrag,` after `placePlayer,`.

After `const [dragPreviewPosition, setDragPreviewPosition] = useState<Position | null>(null);` (:145), add:

```tsx

    // Area-tool drag in progress (rink feet, clamped to the rink)
    const [areaDrag, setAreaDrag] = useState<{ start: Position; end: Position } | null>(null);
```

Change the viewport line added in Task 4 to:

```tsx
    const viewport = mode === "edit" && !areaTool ? editViewport(playData.area) : FULL_RINK;
```

and add `areaTool` to the doc comment above it: "…in view mode, and while the area tool is on, always the whole rink."

In `render`, change the `drawBoardScene` call's `maskRect` to:

```tsx
            maskRect: areaDrag ? rectFromDrag(areaDrag.start, areaDrag.end) : areaRect(playData.area),
```

and add `areaDrag,` to `render`'s dependency array.

Replace the tool-change effect (:429-433):

```tsx
    useEffect(() => {
        if (selectedTool !== "select" || areaTool) setSelectedElementId(null);
        setIsDrawing(false);
        setCurrentDrawingPoints([]);
        setAreaDrag(null);
    }, [selectedTool, areaTool]);
```

In `handleMouseDown`, insert directly after the two `const hitPos` / `const clampedPos` lines (before `// Handle different tools`):

```tsx

            if (areaTool) {
                // The area tool works over the whole rink, whatever the current area
                setAreaDrag({ start: hitPos, end: hitPos });
                return;
            }
```

and add `areaTool,` to its dependency array.

In `handleMouseMove`, insert directly after `const area = areaRect(playDataRef.current.area);`:

```tsx

            if (areaDrag) {
                setAreaDrag({ start: areaDrag.start, end: clampToRect(rinkPos, FULL_RINK) });
                return;
            }
```

and change its dependency array to `[mode, transform, isDrawing, selectedTool, areaDrag, getTransformedRinkPosition]`.

Replace `handleMouseUp` (:613-664, from its doc comment through the closing `);`) with:

```tsx
    /**
     * Handle mouse up event
     * Requirements: 1.3, 5.1, 5.2
     *
     * Commits drag changes to playData on mouseUp (performance optimization).
     * During drag, only the preview position is updated for visual feedback.
     * An area-tool drag commits the custom area (undoable) and reports it.
     */
    const handleMouseUp = useCallback(
        () => {
            if (mode === "view" || !transform) return;

            if (areaDrag) {
                const current = playDataRef.current;
                const next = withArea(current, { kind: "custom", rect: rectFromDrag(areaDrag.start, areaDrag.end) });
                if (next !== current) updatePlayData(next);
                setAreaDrag(null);
                onAreaDrawn?.();
                return;
            }

            // Finish drawing (taps shorter than 1 ft come back unchanged and are dropped)
            if (isDrawing && selectedTool === "stroke") {
                const finished = finishStroke(playData, currentDrawingPoints, strokeOptions, selectedColor, generateId());
                if (finished !== playData) {
                    const blocked = limitMessage(playData, "drawing");
                    if (blocked) onLimitReached?.(blocked);
                    else updatePlayData(finished);
                }
            }

            // Commit drag changes to playData (single history entry)
            if (isDragging && selectedElementId && dragPreviewPosition) {
                updatePlayData(moveElement(playDataRef.current, selectedElementId, dragPreviewPosition));
            }

            // Reset drawing state
            setIsDrawing(false);
            setCurrentDrawingPoints([]);

            // Reset dragging state
            setIsDragging(false);
            setDragOffset(null);
            setDragPreviewPosition(null);
        },
        [
            mode,
            transform,
            areaDrag,
            isDrawing,
            isDragging,
            selectedElementId,
            dragPreviewPosition,
            currentDrawingPoints,
            selectedTool,
            selectedColor,
            strokeOptions,
            playData,
            onLimitReached,
            onAreaDrawn,
            updatePlayData,
            generateId,
        ]
    );
```

In the window-mouseup effect (:671-679), change both the guard and the dependency array to include the area drag:

```tsx
    useEffect(() => {
        if (!isDragging && !isDrawing && !areaDrag) return;
        const onWindowMouseUp = (event: MouseEvent) => {
            if (event.target instanceof Node && canvasRef.current?.contains(event.target)) return;
            handleMouseUp();
        };
        window.addEventListener("mouseup", onWindowMouseUp);
        return () => window.removeEventListener("mouseup", onWindowMouseUp);
    }, [isDragging, isDrawing, areaDrag, handleMouseUp]);
```

- [ ] **Step 4: Add the select, tool, and alert to PlayEditor**

Replace the MUI import (:13-25) with:

```tsx
import {
    Box,
    Paper,
    TextField,
    Typography,
    Button,
    CircularProgress,
    Alert,
    Checkbox,
    FormControl,
    FormControlLabel,
    InputLabel,
    MenuItem,
    Select,
    Stack,
    Snackbar,
    type SelectChangeEvent,
} from "@mui/material";
```

Replace line 35 (the `@/types/practice-planner` import) with:

```tsx
import {
    ICE_AREA_PRESETS,
    type DrawingTool,
    type EquipmentKind,
    type IceAreaPreset,
    type PlayData,
    type PlayerRole,
    type SavedPlay,
    type StrokeOptions,
} from "@/types/practice-planner";
import { areaRect, countElementsOutside, isFullIce } from "@/lib/utils/ice-area";
import { ICE_AREA_LABELS } from "@/lib/utils/canvas/notation";
```

Insert directly above `/**\n * PlayEditor Component\n *\n * Requirements: 1.1, 1.2, 1.3, 1.4 - Integrate…` (:59):

```tsx
type IceAreaChoice = IceAreaPreset | "custom";

/** Inline flag for elements outside the drill's ice area. */
export function outsideAreaMessage(count: number): string {
    return count === 1 ? "1 element is outside the ice area." : `${count} elements are outside the ice area.`;
}

```

After `const [canRedo, setCanRedo] = useState(false);` (:98), add:

```tsx

    // Ice area (2a): the custom-area tool stays on until one rectangle is drawn or it is cancelled
    const [areaTool, setAreaTool] = useState(false);
    const areaChoice: IceAreaChoice = playData.area?.kind ?? "full";
    const outsideCount = isFullIce(playData.area) ? 0 : countElementsOutside(playData, areaRect(playData.area));
    const handleAreaChange = (event: SelectChangeEvent<IceAreaChoice>) => {
        const value = event.target.value as IceAreaChoice;
        if (value === "custom") {
            setAreaTool(true);
            return;
        }
        setAreaTool(false);
        // Through the board so the change is undoable; full ice removes the key
        rinkBoardRef.current?.setArea(value === "full" ? undefined : { kind: value });
    };
    const handleAreaDrawn = useCallback(() => setAreaTool(false), []);
```

In the metadata `<Stack spacing={2}>`, insert directly after the Description `<TextField … />` (after :336) and before `{/* Save to Library Checkbox */}`:

```tsx

                    {/* Ice area (2a) */}
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
                        <FormControl sx={{ minWidth: 220 }}>
                            <InputLabel id="play-ice-area-label">Ice area</InputLabel>
                            <Select<IceAreaChoice>
                                labelId="play-ice-area-label"
                                id="play-ice-area"
                                label="Ice area"
                                value={areaTool ? "custom" : areaChoice}
                                onChange={handleAreaChange}
                            >
                                {ICE_AREA_PRESETS.map((preset) => (
                                    <MenuItem key={preset} value={preset}>
                                        {ICE_AREA_LABELS[preset]}
                                    </MenuItem>
                                ))}
                                <MenuItem value="custom">Custom area…</MenuItem>
                            </Select>
                        </FormControl>
                        {areaChoice === "custom" && !areaTool && (
                            <Button variant="text" onClick={() => setAreaTool(true)} sx={{ minHeight: 44 }}>
                                Redraw custom area
                            </Button>
                        )}
                    </Stack>
```

In the Rink Board `<Paper>` (:377), insert directly before `<RinkBoardErrorBoundary`:

```tsx
                {areaTool && (
                    <Alert
                        severity="info"
                        role="status"
                        sx={{ mb: 2 }}
                        action={
                            <Button color="inherit" size="small" onClick={() => setAreaTool(false)}>
                                Cancel
                            </Button>
                        }
                    >
                        Drag on the rink to draw the ice area.
                    </Alert>
                )}
                {outsideCount > 0 && (
                    <Alert severity="info" role="status" sx={{ mb: 2 }}>
                        {outsideAreaMessage(outsideCount)}
                    </Alert>
                )}
```

(`role="status"` keeps both off the `alert` role, which `PlayEditor.board-wiring.test.tsx:48` queries for the limit snackbar.)

In the `<RinkBoard … />` props, add after `onLimitReached={setLimitNotice}`:

```tsx
                        areaTool={areaTool}
                        onAreaDrawn={handleAreaDrawn}
```

- [ ] **Step 5: Run the tests**

Run: `bun run test __tests__/components/features/practice-planner`
Expected: PASS, including the existing `PlayEditor*.test.tsx`, `SessionDrillDialog.test.tsx`, and `RinkBoard.test.tsx`.
Run: `bun run type-check && bun run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add components/features/practice-planner/RinkBoard.tsx components/features/practice-planner/PlayEditor.tsx __tests__/components/features/practice-planner/RinkBoard.ice-area.test.tsx __tests__/components/features/practice-planner/PlayEditor.ice-area.test.tsx
/usr/bin/git commit -m "feat(practice-planner): ice-area select, custom-area tool, and outside-elements alert

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 6: Legend area chip and starter-play areas

**Files:**
- Modify: `components/features/practice-planner/PlayLegend.tsx` (imports :4-12; `PlayLegend` :51-72)
- Modify: `lib/data/starter-plays.ts` (six `playData` objects)
- Test: `__tests__/components/features/practice-planner/PlayLegend.test.tsx` (append), `__tests__/lib/data/starter-plays.test.ts` (append)

**Interfaces:**
- Consumes (Task 1): `isFullIce`, `iceAreaLabel`, `areaRect`, `countElementsOutside`.
- Produces: `PlayLegend` keeps its props. It renders a chip (MUI `Chip`, label from `ICE_AREA_LABELS`) above the accordion when the area is not full ice, and renders only the chip when the drill has an area but no symbols. `SessionDetailView` (`:585`) and `PlayEditor` (`:396`) pick this up with no change.

- [ ] **Step 1: Write the failing tests**

Append inside `describe("PlayLegend", …)` in `__tests__/components/features/practice-planner/PlayLegend.test.tsx`:

```tsx
    it("shows the area chip above the symbols", () => {
        const data = {
            ...createEmptyPlayData(),
            area: { kind: "zone-neutral" as const },
            equipment: [{ id: "n", kind: "net" as const, position: { x: 100, y: 40 }, rotation: 0 }],
        };
        wrap(<PlayLegend playData={data} />);
        const chip = screen.getByText("Neutral zone");
        const heading = screen.getByText("Legend (1)");
        expect(chip.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("renders just the chip for a drill with an area and no symbols", () => {
        wrap(<PlayLegend playData={{ ...createEmptyPlayData(), area: { kind: "custom", rect: { x: 0, y: 0, w: 40, h: 40 } } }} />);
        expect(screen.getByText("Custom area")).toBeInTheDocument();
        expect(screen.queryByText(/^Legend/)).not.toBeInTheDocument();
    });

    it("shows no chip for full ice", () => {
        const { container } = wrap(<PlayLegend playData={{ ...createEmptyPlayData(), area: { kind: "full" } }} />);
        expect(container).toBeEmptyDOMElement();
    });
```

Append to `__tests__/lib/data/starter-plays.test.ts`. Add these imports at the top:

```ts
import { areaRect, countElementsOutside } from "@/lib/utils/ice-area";
import type { IceAreaPreset } from "@/types/practice-planner";
```

then append after the final `});`:

```ts

describe("Starter play ice areas", () => {
    const EXPECTED: Record<string, IceAreaPreset | undefined> = {
        "starter-breakout-5man": "half-left",
        "starter-3man-weave": undefined,
        "starter-pp-umbrella": "zone-right",
        "starter-pk-box": "zone-left",
        "starter-122-forecheck": undefined,
        "starter-low-cycle": "zone-right",
        "starter-point-shot-screen": "zone-right",
        "starter-dzone-coverage": "zone-left",
        "starter-nz-regroup": undefined,
    };

    it("gives the obvious set plays an explicit area and leaves full-ice drills unset", () => {
        const actual = Object.fromEntries(STARTER_PLAYS.map((p) => [p.id, p.playData.area?.kind]));
        expect(actual).toEqual(EXPECTED);
    });

    it.each(STARTER_PLAYS.map((p) => [p.name, p] as const))("%s has no element outside its area", (_name, play) => {
        expect(countElementsOutside(play.playData, areaRect(play.playData.area))).toBe(0);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test __tests__/components/features/practice-planner/PlayLegend.test.tsx __tests__/lib/data/starter-plays.test.ts`
Expected: FAIL. There is no chip, and no starter has an area.

- [ ] **Step 3: Implement the chip**

In `components/features/practice-planner/PlayLegend.tsx`, replace line 5 with:

```tsx
import { Accordion, AccordionDetails, AccordionSummary, Box, Chip, Stack, Typography } from "@mui/material";
```

and line 12 with:

```tsx
import { BOARD_COLORS, ROLE_DEFAULT_COLORS, iceAreaLabel } from "@/lib/utils/canvas/notation";
import { isFullIce } from "@/lib/utils/ice-area";
```

Replace `PlayLegend` (:51-72) with:

```tsx
export function PlayLegend({ playData, defaultExpanded = false }: { playData: PlayData | null; defaultExpanded?: boolean }) {
    if (!playData) return null;
    const entries = buildLegend(playData);
    const showArea = !isFullIce(playData.area);
    if (entries.length === 0 && !showArea) return null;
    return (
        <Stack spacing={1}>
            {/* Outside the accordion so the area shows while the legend is collapsed */}
            {showArea && (
                <Box>
                    <Chip size="small" color="primary" variant="outlined" label={iceAreaLabel(playData.area)} />
                </Box>
            )}
            {entries.length > 0 && (
                <Accordion defaultExpanded={defaultExpanded} disableGutters elevation={0} sx={{ border: 1, borderColor: "divider" }}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>{`Legend (${entries.length})`}</Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                        <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 1 }}>
                            {entries.map((entry) => (
                                <Box component="li" key={entry.key} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                    <Swatch entry={entry} />
                                    <Typography variant="body2">{entry.label}</Typography>
                                </Box>
                            ))}
                        </Box>
                    </AccordionDetails>
                </Accordion>
            )}
        </Stack>
    );
}
```

- [ ] **Step 4: Give the starter plays their areas**

In `lib/data/starter-plays.ts`, add an `area` line as the last property of each of these six `playData` objects, directly after its `annotations: …,` line:

- `starter-breakout-5man` (after :96): `area: { kind: "half-left" },` (routes reach x=95, so this is not `zone-left`; see Spec deviation 1)
- `starter-pp-umbrella` (after :145): `area: { kind: "zone-right" },`
- `starter-pk-box` (after :170): `area: { kind: "zone-left" },`
- `starter-low-cycle` (after :218): `area: { kind: "zone-right" },`
- `starter-point-shot-screen` (after :244): `area: { kind: "zone-right" },`
- `starter-dzone-coverage` (after :271): `area: { kind: "zone-left" },`

Leave `starter-3man-weave`, `starter-122-forecheck`, and `starter-nz-regroup` unchanged. Update the header comment's "Diagram conventions" list (:12-16) by adding:

```ts
 * - Set plays confined to one end carry an explicit ice area (practice
 *   planner 2a); drills that span the ice leave it unset (full ice)
```

- [ ] **Step 5: Run the tests**

Run: `bun run test __tests__/components/features/practice-planner/PlayLegend.test.tsx __tests__/lib/data/starter-plays.test.ts __tests__/components/features/practice-planner`
Expected: PASS. Each starter play still passes `playDataSchema`, which now accepts `area`.
Run: `bun run type-check`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add components/features/practice-planner/PlayLegend.tsx lib/data/starter-plays.ts __tests__/components/features/practice-planner/PlayLegend.test.tsx __tests__/lib/data/starter-plays.test.ts
/usr/bin/git commit -m "feat(practice-planner): ice-area chip in the legend and areas on starter set plays

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 7: Barrel exports, spec amendments, full gates

**Files:**
- Modify: `lib/utils/canvas/index.ts` (:12-50)
- Modify: `docs/superpowers/specs/2026-10-03-practice-drill-ice-area-design.md`

**Interfaces:**
- Consumes: everything above. Produces no new code interface. The barrel re-exports the new canvas helpers for parity with its existing entries.

- [ ] **Step 1: Re-export the new canvas helpers**

In `lib/utils/canvas/index.ts`, replace the "Rink rendering", "Drawing utilities" and "Interaction utilities" blocks (:12-50) with:

```ts
// Rink rendering
export {
    RINK_DIMENSIONS,
    BLUE_LINES,
    FULL_RINK,
    type TransformContext,
    createTransformContext,
    rinkToCanvas,
    canvasToRink,
    rinkToScreen,
    screenToRink,
    clearRinkCache,
    drawRink,
} from "./rink-renderer";

// Drawing utilities
export {
    drawStroke,
    drawPlayerIcon,
    drawEquipmentItem,
    drawTextAnnotation,
    drawElement,
    drawAllElements,
    drawAreaMask,
    drawBoardScene,
    type BoardSceneOptions,
} from "./drawing-utils";

// Interaction utilities
export {
    type SelectableElement,
    type HitTestResult,
    type HistoryState,
    HistoryManager,
    getMousePosition,
    getTouchPosition,
    getEventRinkPosition,
    hitTestPlayer,
    hitTestDrawing,
    hitTestAnnotation,
    hitTest,
    isWithinRinkBounds,
    clampToRect,
    clampToRinkBounds,
    dragTarget,
    debounce,
    preventDefaultAndStop,
} from "./interaction-utils";
```

- [ ] **Step 2: Amend the spec**

In `docs/superpowers/specs/2026-10-03-practice-drill-ice-area-design.md`:

- Set the Status line to `Implemented (2a)`.
- Fold the thirteen "Spec deviations" at the top of this plan into the relevant sections:
  - **Data model:**
    - `MIN_AREA_FT`/`AREA_SNAP_FT` live in `types/practice-planner.ts`; `FULL_RINK`/`BLUE_LINES` are exported from `rink-renderer.ts`;
    - the lenient read deletes the key on both paths;
    - Full ice removes the key; `withArea` is a no-op for an unchanged area.
  - **Rendering:**
    - `rinkToScreen`/`screenToRink` and `drawBoardScene`;
    - the mask is drawn over the elements (PO item);
    - a new viewport resets zoom/pan;
    - there is no legend rink swatch, and the chip sits above the accordion.
  - **Components:**
    - hit tests use the rink-clamped pointer; drags use `dragTarget`;
    - the area tool shows the whole rink; `onAreaDrawn`, `Redraw custom area` and `Cancel`;
    - Clear keeps the area (PO item);
    - the singular alert copy;
    - `rectFromDrag`'s minimum rule;
    - `DrawingToolbar` is unchanged.
  - **Starter plays:** the final area list, including Breakout → `half-left` (PO item).
- Under **Risks**, add one line: "Four choices await product-owner confirmation: Breakout uses half-left; Clear keeps the area; the mask dims outside elements; and on desktop, elements beyond the 5 ft margin are reachable only by widening the area."

- [ ] **Step 3: Run every gate**

Run: `bun run type-check && bun run lint && bun run test && bun run build`
Expected: all green. `bun run build` catches Next route and RSC issues that type-check misses. Report any failure verbatim. If a failure is outside the practice planner, check `gh run list --branch main --limit 3` before attributing it to this branch, since date-rot failures have happened on main before.
Run: `wc -l components/features/practice-planner/RinkBoard.tsx`
Expected: about 960 lines (912 + wiring). Report the number. Every piece of new logic lives in `lib/utils/canvas/*` or `lib/utils/ice-area.ts`.

Manual check: the dev database is far behind on migrations, so do not click through live pages against it. If a migrated database is available (e.g. a CI preview), do the following and report which of these you did:
- open a library drill and set "Left end zone": the board zooms; a click past the blue line places on it;
- choose "Custom area…" and drag: the area snaps; Undo restores the old area;
- save, and check that the library thumbnail shows the full rink with the outside shaded;
- open a session drill dialog: the same select works there.

- [ ] **Step 4: Commit**

```bash
/usr/bin/git add lib/utils/canvas/index.ts docs/superpowers/specs/2026-10-03-practice-drill-ice-area-design.md
/usr/bin/git commit -m "docs(practice-planner): fold 2a planning deviations into the ice-area spec

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

## Self-Review

**1. Spec coverage.**

| Spec requirement | Task |
|---|---|
| `ICE_AREA_PRESETS`, `IceAreaPreset`, `RinkRect`, `IceArea`, `PlayData.area?`; no version bump | 1 |
| Schema: optional area; custom rect inside the rink, ≥ 20×20, finite | 1 |
| Lenient read (drop and log, v1 and v2), missing stays missing, idempotence | 1 |
| `areaRect` resolver with the x-range table; `BLUE_LINES` derived from `ZONE_DIMENSIONS` | 1 |
| `ICE_AREA_LABELS` in `notation.ts` | 1 |
| Viewport `createTransformContext`; cache key per viewport (regression test) | 2 |
| `drawAreaMask` (overlay plus dashed Action Blue outline; nothing for full ice) | 2 |
| Thumbnails: whole rink plus mask | 2 |
| `clampToRect`; `clampToRinkBounds` = `clampToRect` over the rink | 3 |
| `rectFromDrag(start, end, snapFt=5, minFt=20)` in `element-ops.ts` | 3 |
| Edit board: viewport = area + 5 ft margin, mask, pinch-zoom/pan on top, placement and drag clamp, hit radius from the zoomed transform | 4 (the hit radius already reads `transform` at `RinkBoard.tsx:436-439`, so it shrinks in feet automatically) |
| View board: whole rink plus mask | 4 |
| `RinkBoardHandle.setArea` via `updatePlayData` (undoable) | 4 |
| `areaTool` prop; area tool drawing a custom rectangle (undoable) | 5 |
| PlayEditor "Ice area" select (6 presets plus Custom); outside-elements info alert | 5 |
| `SessionDrillDialog` works with no extra code | 5 (it hosts `PlayEditor`; the existing `SessionDrillDialog.test.tsx` runs in Step 5) |
| Legend chip, including the chip-only drill | 6 |
| Starter plays: explicit areas; every starter validated | 6 (existing schema test plus new area and inside-area tests) |
| Error handling: invalid stored area dropped; write rejects; outside elements valid | 1, 5 |
| Testing list and gates | 1–7 |
| Risks (rollback strips area; library edits detach; 2b contract) | No code needed. `areaRect` is exported for 2b (Task 1); detach-on-write is 3a's existing behavior |

No gaps.

**2. Placeholder scan.** There is no "TBD", "TODO", or "similar to Task N". Edits to existing large functions (`handleMouseDown`, `handleMouseMove`, `handleMouseUp`) are given as complete replacement functions. Smaller edits quote their anchor line and give the full new code.

**3. Type consistency.**
- `RinkRect`/`IceArea` (Task 1) are used unchanged by:
  - `createTransformContext`'s `viewport` and `drawAreaMask`/`BoardSceneOptions.maskRect` (Task 2);
  - `clampToRect`/`dragTarget`/`rectFromDrag` (Task 3);
  - `RinkBoardHandle.setArea` (Task 4);
  - the PlayEditor mock board (Task 5).
- `withArea` returns the same reference when unchanged. That is relied on by `setArea` (Task 4), the area-tool commit (Task 5), and the PlayEditor test mock (Task 5).
- `editViewport` is used by the board (Task 4) and by every RinkBoard test helper (Tasks 4 and 5); the area-tool tests use `FULL_RINK`.
- `outsideAreaMessage` (Task 5) matches the Global Constraints copy.
- `iceAreaLabel` (Task 1) is used by `PlayLegend` (Task 6).

**4. Review Focus.** Each of the five lines has its test in its owning task:
1. Task 2: "screen mapping under zoom and pan" round-trips, including x=150. Task 4: "maps the pointer through the zoomed viewport".
2. Task 3: "lets an element grabbed off-center reach the area edge exactly". Task 4: "drags an element grabbed off-center exactly to the area edge".
3. Task 2: "keys same-size viewports at different places apart" and "never reuses one viewport's background for another".
4. Task 1: the `invalidAreas` table on read (v2), on write, the v1 path, and the undefined key.
5. Task 4: "keeps an element outside a narrowed area selectable", "…erasable", and "deletes a selected outside element with Backspace".

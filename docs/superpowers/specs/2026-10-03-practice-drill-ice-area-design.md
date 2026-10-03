# Practice Drills: Ice Area — Design

**Date:** 2026-10-03
**Status:** Implemented (2a)
**Phase:** 2a of the practice-planner iteration. Build order: hotfix ✓ → 3a (PR #373) → **2a** → 2b → 3b.
**Depends on:**
- Phase 1, board notation (PlayData v2). Merged.
- 3a, session-owned drills. Drill data, including the area, travels with each session's copy.

The accepted decisions are recorded in `2026-10-03-practice-planner-roadmap.md`. This spec makes them concrete.

## Context

Every drill is drawn on the whole 200×85 ft rink, but most practice drills use only part of the ice: one end, one zone, or a corner. The board currently has no way to say so. As a result:

- Coaches drawing a zone drill work at full-rink scale. On a phone, an end zone is small.
- Thumbnails and the session view can't show where on the ice a drill runs.
- Phase 2b (stations) needs each drill's area to lay several drills side by side on one rink.

What the code already provides:

- Rink coordinates are feet (`lib/utils/canvas/rink-renderer.ts`, `RINK_DIMENSIONS` 200×85).
- The blue lines are derived from the private `ZONE_DIMENSIONS`: `defensiveZoneWidth` 75 and `offensiveZoneWidth` 75. The left blue line sits at x=75 and the right at x=125.
- `createTransformContext(width, height, padding)` always fits the whole rink.
- `drawRink` caches the background keyed on the full transform (`rinkCacheKey`).
- Placing and dragging elements clamps to the whole rink via `clampToRinkBounds` (`lib/utils/canvas/interaction-utils.ts:445`).
- Every read of stored play data goes through `parseStoredPlayData` / `upgradePlayData` in `lib/utils/play-data.ts`.

## Goal

A coach marks where on the ice a drill runs. The editor zooms to that area and keeps the drawing inside it. Thumbnails, the legend, and the session view show the area at a glance.

### Success criteria

- A drill can be set to one of these areas:
  - Full ice
  - Half ice: left end or right end
  - A zone: left end zone, neutral zone, or right end zone
  - A custom rectangle
- Existing drills read as Full ice, with no data change.
- With a smaller area, the edit board shows that area enlarged, with a 5 ft margin. New and dragged elements stay inside the area.
- In view mode, and in thumbnails, the board shows the whole rink with everything outside the area shaded.
- The legend shows an area chip, e.g. "Neutral zone", whenever the area is not full ice.
- Changing the area never deletes elements. Elements outside a new, smaller area remain and are flagged.
- A bad stored area never makes a drill unreadable.

### Non-goals

- Stations and showing several drills on one rink (2b).
- Mapping venue surface segments onto the rink. Areas stay independent of segments; see the roadmap and ADR-0012.
- Moving or mirroring a drill to a different area per session.
- Any Prisma schema change.

## Approach

**An optional `area` field in `PlayData`.** It lives with the rest of the drill data, so it needs no migration. It is copied into session-owned copies automatically (3a) and validated by the same schema.

Rejected alternatives:

- **A column on `Play`.** It would need a migration, a separate save path, and to be kept in sync with `playData`.
- **Reusing venue `SurfaceSegment` geometry.** That geometry lives on an unmarked 2:1 schematic, where the ice preset's "half" is a lengthwise strip. It is also display-only under ADR-0012.

## Data model

```ts
// types/practice-planner.ts
export const ICE_AREA_PRESETS = [
  "full", "half-left", "half-right", "zone-left", "zone-neutral", "zone-right",
] as const;
export type IceAreaPreset = (typeof ICE_AREA_PRESETS)[number];

/** Axis-aligned rectangle in rink feet. */
export interface RinkRect { x: number; y: number; w: number; h: number }

export type IceArea =
  | { kind: IceAreaPreset }
  | { kind: "custom"; rect: RinkRect };

export interface PlayData {
  // …phase-1 fields unchanged (version: 2, players, drawings, equipment, annotations)…
  /** Where on the ice the drill runs. Absent = full ice. */
  area?: IceArea;
}
```

- **No version bump.** The field is optional, and absent means full ice. `upgradePlayData` stays total and idempotent.
- **Constants.** `MIN_AREA_FT` and `AREA_SNAP_FT` live in `types/practice-planner.ts`, so the schema and `rectFromDrag` share them without `play-data.ts` importing `canvas/*`. `FULL_RINK` and `BLUE_LINES` are exported from `rink-renderer.ts`, because `createTransformContext`'s default needs `FULL_RINK` and `ice-area.ts` already imports the renderer.
- **Schema** (`lib/utils/play-data.ts`, `playDataSchema`): `area` is optional. A custom rectangle must:
  - lie entirely inside the rink;
  - be at least 20×20 ft (`MIN_AREA_FT = 20`);
  - have finite numbers.
- **Lenient read.** In `upgradePlayData`, an `area` that fails validation is dropped and logged with `console.error` before the strict parse, on both the v1 and v2 paths. The drill renders as full ice. This is the same pattern already used to drop blank annotations. Zod keeps an optional key whose value is `undefined`, so dropping means deleting the key on both paths. The v1 path parses with a schema that strips unknown keys, so a valid area is carried across explicitly and an invalid one is logged and dropped.
- **Full ice removes the key.** Choosing Full ice calls `setArea(undefined)`, so a reset drill is byte-identical to a pre-2a drill. `withArea` returns the same object for an unchanged area, so re-picking the current area records no undo step.
- **Helpers.** `ice-area.ts` also exports `editViewport`, `isFullIce`, `sameArea`, `withArea`, `rectContains`, `countElementsOutside` and `iceAreaLabel`.
- **Resolver.** `lib/utils/ice-area.ts` (new, pure) exports `areaRect(area?: IceArea): RinkRect`. `y` is always 0–85. The x-ranges are:

  | Area | x-range |
  |---|---|
  | full | 0–200 |
  | half-left | 0–100 |
  | half-right | 100–200 |
  | zone-left | 0–blue-line-left (75) |
  | zone-neutral | 75–125 |
  | zone-right | 125–200 |

  The blue-line values come from the renderer. Export a `BLUE_LINES = { left, right }` constant from `rink-renderer.ts`, derived from `ZONE_DIMENSIONS`, rather than repeating the numbers.
- **Labels.** `ICE_AREA_LABELS` in `lib/utils/canvas/notation.ts`: "Full ice", "Half ice (left)", "Half ice (right)", "Left end zone", "Neutral zone", "Right end zone", "Custom area".
- **Snapping.** The UI snaps custom rectangles to 5 ft. The server does not require snapping.

## Rendering

- **Viewport transform.** `createTransformContext(width, height, padding, viewport: RinkRect = FULL_RINK)` fits the given rectangle instead of the whole rink.
  - `rinkToCanvas` and `canvasToRink` are unchanged; they already read the transform's scale and offsets.
  - `rinkCacheKey` already keys on scale and offsets, so different viewports cache separately. Add a regression test.
  - Shapes outside the viewport are clipped by the canvas.
  - `rinkToScreen` and `screenToRink` map between rink feet and screen pixels under the viewport, zoom and pan. The board's draw sequence is the pure `drawBoardScene`, shared with thumbnails.
  - A new viewport resets pinch-zoom and pan to 1 and (0, 0), since a zoom made for the full rink would misframe an end zone.
- **`drawAreaMask(ctx, rect, transform)`** (new, in `drawing-utils.ts`):
  - shades the rink outside the rectangle with a semi-transparent ink overlay;
  - outlines the rectangle in Action Blue, dashed.
  - It draws nothing for full ice.
  - It is drawn after the elements, so elements outside the area are dimmed with the ice. It is drawn in edit mode too.
  - The outline's line width and dash are divided by zoom, so they look constant on screen. Thumbnails render at zoom 1.
- **Edit board** (`RinkBoard`, edit mode):
  - When the area is not full ice, the transform viewport is the area plus a 5 ft margin, clamped to the rink. The mask is drawn.
  - Pinch-zoom and pan still apply on top.
  - Hit tests (select, eraser) use the pointer clamped to the whole rink, so elements outside a narrowed area stay selectable, erasable and deletable by key. Placement and stroke points clamp to the area. A drag lands at `dragTarget(pointer, grabOffset, rect)`: the pointer minus the grab offset, then clamped, so an element grabbed off-center reaches the area edge exactly.
  - On desktop, an element beyond the 5 ft margin is reachable only by widening the area (zoom-out exists only as a two-finger pinch). The outside-elements alert tells the coach such elements exist.
  - Placement and drag clamp to the area through a new `clampToRect(position, rect)` in `interaction-utils.ts`, which generalizes `clampToRinkBounds` (the latter becomes `clampToRect(p, FULL_RINK)`).
  - The touch hit radius (22 px / pxPerFt) uses the zoomed transform, so it automatically shrinks in feet as the board zooms in.
  - **Tap vs drag (final-review fix).** A press on an element becomes a drag only once the pointer is `DRAG_THRESHOLD_PX` (4 screen px, converted to feet through the transform and zoom by `pxToRinkFt`) from the grab point. Screen pixels, not the area tool's 1 ft click test, because 1 ft is ~12 px on a zoomed-in area but ~4 px on full ice. A tap, including the zero-distance touchmove that touch devices fire on most taps, therefore selects an element outside the area without clamping it in. Once started, the drag follows the pointer even back inside the threshold. `moveElement` returns the same reference when nothing moves, so a drag that ends where the element already is records no history entry.
  - **Frame drawing under zoom/pan (final-review fix).** Each frame is `drawBoardFrame`: clear the whole canvas under an identity transform, then set the zoom/pan transform (every frame, so a resize's context reset cannot drop it) and draw the scene once. With zoom ≠ 1 or a pan, the rink is drawn directly (`drawRink(…, { cache: false })`: white base under identity, markings through the transform), because the cached background covers only a canvas-sized rectangle at the origin. Before this, the uncovered region was never cleared and the 35% mask stacked toward opaque. At zoom 1 with no pan, and for thumbnails, the cached path is unchanged.
- **View board and thumbnails:** the whole rink plus the mask. There is no legend rink swatch, because legend swatches are 40×20 symbol glyphs with no rink. Thumbnail card sizes therefore stay consistent. Stored thumbnails regenerate on the next save, as in earlier phases.
- **Legend.** `PlayLegend` shows an area chip (an MUI `Chip`, label from `ICE_AREA_LABELS`) above the collapsible accordion, so it shows while the legend is collapsed and is not counted in `Legend (N)`. It shows when the area is not full ice. If the drill has no symbols but has an area, the legend renders just the chip.

## Components

- **`PlayEditor`.** Add an "Ice area" select next to the name and description fields, listing the six presets plus "Custom area…".
  - Choosing a preset sets `playData.area` through the board history, so it can be undone.
  - Choosing Custom enables an **area tool** on the board. Dragging draws a rectangle, snapped to 5 ft with a 20 ft minimum, which becomes `{ kind: "custom", rect }`. Also undoable.
  - While the area tool is on, the board shows the whole rink and clamps the pointer to the rink, so an already-narrowed drill can still be given a larger or different area. A click that moves less than 1 ft does nothing, and the preview appears only once the drag is not a click (`areaMaskRect`). A second touch during an area drag cancels it. `RinkBoard` has an `onAreaDrawn` callback so `PlayEditor` turns the tool off after one rectangle. The hint reads "Drag on the rink to draw the ice area." and has a `Cancel` action; its button reads "Stop drawing area". MUI `Select` fires no `onChange` for the current value, so a drill with a custom area also gets a `Redraw custom area` button.
  - Keyboard path (`CustomAreaFields`): choosing "Custom area…" applies a custom area immediately (the current preset's rectangle, or the left end zone from full ice), so it is savable without the drag tool. While the area is custom, four numeric fields ("Area left/top/width/height (ft)", 44px targets) edit it; each commits on blur or Enter, keeps the rectangle inside the rink, snaps it through `rectFromDrag`, and applies it with the undoable `setArea`. The fields are keyed on the stored rectangle, so undo/redo resets them.
  - If any element lies outside the area, an inline MUI `Alert severity="info"` reads "N elements are outside the ice area." (singular: "1 element is outside the ice area."). Players, equipment and annotations are outside when their position is outside the rectangle (edges count as inside); drawings are outside when any point is.
- **`RinkBoard`.**
  - Reads `playData.area` and applies the viewport, mask and clamp described above.
  - New prop `areaTool?: boolean` turns on rectangle drawing for the area.
  - Rectangle math goes in a pure helper, `rectFromDrag(start, end, snapFt=5, minFt=20): RinkRect`, in `element-ops.ts`. It snaps both edges to 5 ft and clamps them to the rink. If a side is under 20 ft it extends from the low edge, shifting back inside the rink on overflow, so the result is always a valid custom rectangle. The component only wires it in; it is already over 900 lines.
  - Clear keeps the area: the area is set by its own control, and Clear erases the drawing, not the drill's setup. Undo restores everything.
  - `DrawingToolbar` is unchanged; the area tool is a board mode, not a `DrawingTool`.
  - The handle gains `setArea(area: IceArea | undefined)`, which goes through `updatePlayData` so it is undoable.
- **`SessionDrillDialog` (3a)** hosts `PlayEditor`, so the ice area works inside sessions with no extra code.
- **Starter plays.** Areas follow each drill's data:
  - Breakout (5-Man) → `half-left` (its routes reach x≈95, so `zone-left` would flag elements).
  - Penalty-Kill Box and D-Zone Coverage → `zone-left`.
  - Power-Play Umbrella, Low Cycle and Point Shot with Screen → `zone-right`.
  - 1-2-2 Forecheck, Neutral-Zone Regroup and 3-Man Weave stay unset (full ice).
  - A test pins this list and that no starter has an element outside its own area.

## Error handling

- An invalid stored area is dropped on read and logged; the drill renders as full ice.
- Server writes go through `playDataSchema`. An invalid custom rectangle is rejected as "Invalid play data", which is the existing behavior. The UI never sends one, because snapping and the minimum are applied while drawing.
- Elements outside the area are valid data. Only the info alert flags them.

## Testing

- **`ice-area`:** each preset's rectangle, and that the blue lines match the renderer; `areaRect(undefined)` is full ice.
- **`play-data`:**
  - a valid area round-trips;
  - an invalid area (outside the rink, under 20 ft, NaN) is dropped and logged on read and rejected on write;
  - a missing area stays missing;
  - idempotence still holds.
- **Renderer** (mocked 2D context):
  - a viewport transform round-trips `rinkToCanvas`/`canvasToRink`;
  - the cache key differs per viewport;
  - `drawAreaMask` draws nothing for full ice, and an overlay plus outline otherwise.
- **Pure helpers:** `clampToRect`; `rectFromDrag` (snapping, minimum size, reversed drag direction).
- **RinkBoard** (clientWidth/clientHeight stubbed, as in phase 1):
  - with `zone-left`, a click near x=150 places the element clamped to ≤ 75;
  - `setArea` is undoable;
  - the area tool produces a custom rectangle.
- **PlayEditor:** the select sets the area; the outside-elements alert appears and disappears.
- **PlayLegend:** chip shown or hidden.
- **Starter plays:** pass the schema; areas are as listed.
- **Gates:** `bun run type-check`, `lint`, `test`, `build`.

## Risks

- **Rollback:** a build without 2a strips `area` on save, because `z.object` drops unknown keys. Accepted, and documented here.
- **Changing a library drill's area** detaches the sessions that use it, as any library edit does (3a). Their copies keep the old area.
- **Board complexity:** all new logic lives in `lib/utils/canvas/*` and `ice-area.ts`. The only changes to RinkBoard are wiring.
- **Phase 2b** reads `areaRect(playData.area)` for station layout and overlap checks. This spec's resolver is that contract.
- **Open product choices:** four choices await product-owner confirmation: Breakout uses half-left; Clear keeps the area; the mask dims outside elements; and on desktop, elements beyond the 5 ft margin are reachable only by widening the area.

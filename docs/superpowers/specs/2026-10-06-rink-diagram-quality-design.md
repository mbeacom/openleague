# Rink Diagrams: Resolution and Playbook Styling — Design

**Date:** 2026-10-06
**Status:** Proposed
**Builds on:** `2026-10-02-practice-board-notation-design.md` (notation),
`2026-10-03-practice-session-timeline-bench-sheet-design.md` (print pixel ratio)

## Context

Every rink diagram in the practice planner is drawn by the Canvas 2D renderer in
`lib/utils/canvas/`, and every surface shows it soft or crude in a different way:

| Surface | Today | Why it looks bad |
|---|---|---|
| Rink board (`RinkBoard.tsx`) | Backing store = CSS size | Ignores `devicePixelRatio`: half resolution on every retina screen |
| Stored thumbnails (`thumbnail-generator.ts`) | 300×128 PNG at 1× | Shown at up to ~2.8× CSS size (session detail, library card), ~3–6× device pixels |
| Bench sheet print (`PrintDiagram.tsx`) | 720×306 at 3× | Drops to 2× above 12 drills and 1× (~96 dpi) above 40 |
| Legend swatches (`PlayLegend.tsx`) | 40×20 canvas at 1× | No pixel-ratio handling on screen or in print |
| Strokes and arrowheads | `strokeWidth` in px; arrowhead `max(10, w·5)` px | Heavy on thumbnails, thin in print; px floors distort patterns at small sizes |
| Rink markings | Lines in feet, boards/circles/creases in fixed px | Line hierarchy inverts on thumbnails; nothing pixel-snapped |
| Text | Labels ask for "Source Sans 3" (never loaded); notes use Arial | Labels fall back to system-ui; type doesn't match the app |

The station map (`StationMap.tsx`) already handles the pixel ratio correctly and
is the pattern to follow.

The look itself is also plain: a flat ice fill, single-weight lines, flat
markers. Coaches compare it against published drill diagrams.

## Goal

Every diagram is crisp at its displayed size on any screen and in print, keeps
the same proportions from a 48 px sidebar card to a printed page, and looks like
a polished playbook in the Digital Playbook palette.

### Success criteria

1. The board, every thumbnail at its displayed size, the station map, legend
   swatches and printed diagrams render at least at the screen's pixel ratio
   (capped at 3), and print never goes below 2× (≥ 190 dpi at the 85 mm cap).
2. A drill's strokes, arrowheads, markers and rink lines keep the same
   proportions relative to the rink on every surface (within the legibility
   floors in §3).
3. Labels and notes render in Cabinet Grotesk on every surface, including stored
   PNGs, with a correct fallback when the font fails to load.
4. The refreshed style (§4) applies everywhere through one theme object; meaning
   stays carried by `action` and `role`, never by color alone.
5. No stored data migrates. Existing plays, plan files and thumbnails keep
   working; old stored thumbnails are replaced the next time they are rendered
   or saved.

### Non-goals

- No SVG rewrite. The notation spec weighed it and rejected it to keep about
  1.3k lines of tested canvas behavior; nothing here changes that trade-off.
- No server-side rendering or PDF generation. Print stays `window.print()`.
- No new runtime dependency (ADR-0020 amendment: `docx` is the only one).
- No illustrated player figures or equipment art.

## Approaches considered

**A. Keep canvas and fix it in three layers: resolution, a scale model, a theme
(chosen).** Each layer is shippable on its own and the visible win (sharpness)
comes first with no design risk. Works inside the existing call-sequence tests.

**B. An SVG renderer for display and print, keeping canvas for editing.** True
vector print and free sharpness, but it means two renderers that must agree
pixel for pixel, the rewrite the notation spec rejected, and new thumbnail
storage. Too much for the gain over A.

**C. Render everything at a fixed high resolution and let CSS scale it down.**
Simple, but memory grows with every card, downscaled text and hairlines still
blur, and it fixes none of the styling problems.

## Design

Three phases, each its own PR.

### 1. Resolution (phase 1)

**One backing-store helper.** Add `lib/utils/canvas/backing-store.ts`:

```ts
/** The device pixel ratio to draw at: window.devicePixelRatio clamped to [1, 3], 1 off the browser. */
export function backingPixelRatio(): number;
/** Size the canvas backing store to css × ratio and return ratio, so callers can set the base transform. */
export function sizeBackingStore(canvas: HTMLCanvasElement, cssWidth: number, cssHeight: number, ratio: number): number;
/** Calls `onChange` when the ratio changes (window moved between screens, zoom); returns an unsubscribe. */
export function watchPixelRatio(onChange: () => void): () => void;
```

`StationMap.tsx` moves onto it (behavior unchanged) so there is one implementation.

**Rink board.** `RinkBoard` sizes its backing store with the helper and sets the
canvas CSS size explicitly (which also fixes the 2 px border overflow). Every
transform the board sets becomes ratio-aware:

- `drawBoardFrame` clears under `setTransform(ratio, 0, 0, ratio, 0, 0)` and
  draws under `setTransform(zoom·ratio, 0, 0, zoom·ratio, pan.x·ratio, pan.y·ratio)`.
- `drawRink`'s identity fill and `getCachedRinkCanvas` take the ratio; the rink
  cache key gains it, and the cache sizes its offscreen canvas in device pixels.
- Hit-testing stays in CSS pixels (`getMousePosition` is unchanged).
- The rink cache becomes a small keyed map (board, thumbnail, print) instead of
  one module slot, so thumbnail generation stops evicting the board's rink.

**A live diagram component.** Add `components/features/practice-planner/PlayDiagram.tsx`:
a canvas that draws `playData` at its CSS size × pixel ratio (the StationMap
pattern), redrawing on resize (`ResizeObserver`) and ratio change. Surfaces that
have `playData` in hand use it instead of a stored PNG: the session detail
preview, `PlanPreview`, and `SidebarPlayCard`. The goalies-hidden branch of the
session detail view, which already renders sharp through `PrintDiagram`, uses it
too, so both branches look the same.

**Stored thumbnails.** Lists that only have the stored PNG (the library grid)
keep using it, so the stored image gets better:

- `generateThumbnail` stores at pixelRatio 2 by default (600×256 device px,
  about 60–120 KB, well inside the 1,000,000-character limit).
- Starter cards already draw from `playData`; they render at the screen's ratio.
- The static planner regenerates any stored thumbnail narrower than 600 px when
  it opens the library (a one-time, local, idempotent pass; the width is read
  from the PNG header in the data URL).
- Hosted saved plays: the library list query returns the thumbnail but not
  `playData`, and canvas is client-only (ADR-0020), so there is no server
  backfill. An old 1× thumbnail is replaced the next time its play is saved.
  Accepted: the board, detail views and print are sharp regardless, and the
  library grid is the only place an old thumbnail still shows.

The 1×-output byte-identical rule from the bench-sheet spec is retired: it
protected stored thumbnails from churn, and this spec changes them on purpose.

**Print and export.** `printPixelRatio` becomes 3× up to 24 diagrams and 2×
beyond, never 1×. The legend swatch (`PlayLegend.tsx`) sizes its backing store
with the helper, so on-screen and printed legends are sharp; HTML/DOCX exports
keep their 2× swatches.

### 2. Scale model (phase 2)

Everything is sized in rink feet, with small floors in device pixels for
legibility only. No stored value changes meaning on the board.

- **Strokes.** A stored `strokeWidth` keeps its value and is read as "pixels at
  the board's reference scale" (`REFERENCE_PX_PER_FT = 4`, close to today's
  800 px board). Rendered width = `strokeWidth / 4` ft × px/ft, floored at
  1 device px. A width-2 stroke is 0.5 ft wide everywhere.
- **Arrowheads** are `3 ft + 1.5 × stroke width` long (floor 5 device px) and
  filled, replacing the fixed 10 px minimum. The stop bar and selection
  highlight follow the same rule.
- **Patterns** (carry wave, lateral zigzag, pass dashes, shot rails, backskate
  ticks) drop their px floors except a 1 device px minimum. A thumbnail shows the
  same pattern as the board, just smaller.
- **Rink markings** are all in feet, using real proportions with a 1 device px
  floor: center red line and blue lines 1 ft, goal lines and circles 2 in (shown
  at 0.35 ft so they stay visible), boards 0.6 ft. Straight lines snap to the
  device pixel grid when the scale makes that possible.
- **Glyphs** keep `PLAYER_RADIUS_FT = 6`. Outline widths become a fraction of the
  radius with a 1 device px floor; the 8 px minimum radius stays on the board
  only (where it keeps markers grabbable), not in thumbnails or print.
- **Text.** Labels size continuously from the marker radius (no integer
  flooring; `fitText` shrinks by 0.5 px steps). Note box padding is in feet.

### 3. Playbook style (phase 3)

A single theme object, `lib/utils/canvas/diagram-theme.ts`, owns every color,
weight and font the renderer uses; the renderer reads nothing hard-coded.
Values below are the starting point, tuned during implementation against the
board, a library card and a printed page side by side.

- **Ice.** "Fresh Ice" base `#F4F9FC` with a faint radial lightening toward
  center ice and a 1.5 ft inner shadow along the boards. Off-ice areas outside
  the drill's area keep today's gray mask, softened to 55 % opacity.
- **Boards.** A double line: a 0.6 ft League Blue (`#0D47A1`) outer edge and a
  0.25 ft lighter inner kick plate, corners at the real 28 ft radius.
- **Markings.** Red `#C8102E` center and goal lines, blue `#0D47A1` blue lines;
  faceoff circles with hash marks; creases filled `#9BC6E8` at 60 %;
  center-ice dot and end-zone dots solid.
- **Player markers.** A filled disc in the role color with a 0.08 r white inner
  ring, a 0.06 r darker outline, and a soft drop shadow (0.4 ft offset, 20 %
  ink). Goalie markers keep their glove-line mark. Labels in Cabinet Grotesk 800,
  white, optically centered.
- **Equipment.** Nets as a goal frame with a mesh hatch; cones as a shaded
  triangle; pucks as a solid ink disc with a lighter rim.
- **Strokes.** Round caps and joins. Skates in ink `#1A2433`; passes Action Blue
  `#1976D2` dashed; shots Penalty Box Red `#D32F2F` double rail; opponent routes
  in red. Arrowheads are filled and slightly concave (a swept back edge).
- **Notes.** Cabinet Grotesk 600 on a white chip with a 0.3 ft radius and 90 %
  opacity, so they read over lines.
- **Type loading.** Before drawing anything that is stored or printed
  (thumbnails, print, exports), the renderer awaits
  `document.fonts.load('800 16px "Cabinet Grotesk"')` with a 1.5 s timeout, the
  pattern `waitForCrestFont` already uses, and falls back to system-ui. The live
  board redraws once when the font arrives.

### Boundaries

- Everything new stays in `lib/utils/canvas/` with no server or Next imports
  (planner-store spec), so the static planner shares it unchanged.
- Hit-testing, play-data schema, plan-document format and stored thumbnail
  format (PNG data URL) do not change.

## Testing

- **Unit (call-sequence, existing style).** The backing-store helper (clamping,
  sizing, change subscription); the board's transforms at ratio 1, 2 and 3;
  the rink cache keyed by ratio and purpose; `printPixelRatio`'s new bounds;
  stroke, arrowhead and rink-line widths in feet with their floors at a small and
  a large px/ft; the font wait with a load, a timeout and a failure.
- **Proportion invariant.** For one drill rendered at thumbnail, board and print
  scale, every recorded line width and arrowhead length divided by px/ft is equal
  across the three (above the floors).
- **Updated snapshots.** The recorded-context snapshots change in phases 2 and 3;
  each phase regenerates them in its own commit so the diff is reviewable.
- **Visual check.** Each phase ends with screenshots of the board, a library
  card, the session detail preview and a printed bench sheet page at 1× and 2×
  (the Playwright harness used for the static planner), attached to its PR.

## Rollout

| Phase | PR | Visible change | Risk |
|---|---|---|---|
| 1. Resolution | backing-store helper, board, `PlayDiagram`, 2× thumbnails, print floor, legend | Everything sharp; no style change | Low: transforms and sizes only |
| 2. Scale model | widths, arrowheads, patterns, rink lines, text sizing in feet | Same look, consistent proportions | Medium: snapshot churn |
| 3. Playbook style | `diagram-theme.ts`, ice, boards, markers, equipment, strokes, fonts | The new look | Medium: design tuning |

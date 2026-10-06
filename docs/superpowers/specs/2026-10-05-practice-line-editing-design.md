# Line Editing on the Rink Board — Design

**Date:** 2026-10-05
**Status:** Approved (design); implementation plan to follow in `../plans/2026-10-05-practice-line-editing.md`
**Applies to:** the shared rink board (`components/features/practice-planner/RinkBoard.tsx`, via `PlayEditor`), used by the hosted planner and the static Vite planner (`apps/planner/`).
**Depends on:** the board notation model (`DrawingElement`, `buildStrokeGeometry`), the element drag and history (`element-ops.ts`, `HistoryManager`), touch hit radii (`MIN_HIT_RADIUS_PX`), the portable plan document (ADR-0020).

## Context

What exists (verified):
- **Lines.** A line (`DrawingElement`) has an `action`, a `path` of `straight` or `freehand`, an `end`, and `points` in rink feet (200 × 85).
  - A straight line the editor draws is stored as exactly 2 points (`finishStroke`, `element-ops.ts`).
  - A straight line with more points is a polyline with sharp corners. Such lines exist in older data: 16 starter strokes (for example the 16-point `ec-figure-eight` and the 5-point `dz-house` zone outline) and plays upgraded from v1, whose lines and arrows can carry any number of points.
  - A freehand line is simplified when drawn, then smoothed at render time by `buildStrokeGeometry` (`stroke-geometry.ts`).
  - The schema allows 2 to `MAX_STROKE_POINTS` (1000) points, each inside the rink, and validates `path` against `STROKE_PATHS`.
- **Selection.** The Select tool selects one element at a time.
  - Players, equipment and text can be dragged. The drag starts after 4 px, is kept inside the ice area, and is one history entry.
  - Lines can be selected (shown with a highlight) and deleted, but not moved or reshaped. `moveElement` ignores them.
- **Snapping.** None for lines or objects. Only the ice-area rectangle snaps.
- **Input.** Mouse and touch handlers. Pinch zooms and pans. Hit radii have a minimum of 22 px.
- **Size.** `RinkBoard.tsx` is 1057 lines.

## Goal

A coach can fix a line without redrawing it: move it, drag its ends, and bend it into a curve. New and dragged line ends snap to players, equipment and the ends of other lines.

### Success criteria

1. A selected line shows handles. Each end and each interior point has a handle, and each segment has a "+" handle at its midpoint.
2. **Moving:**
   - Dragging the line moves it as a whole.
   - Dragging an end or an interior point moves that point.
   - Dragging a "+" handle adds a point: a bend that curves a drawn straight line, or a corner on an older polyline.
3. A bend or corner can be removed by double-click or double-tap. **Straighten** in the inspector removes all of them.
4. Bent lines draw as smooth curves through their bend points everywhere a line is drawn: the board, thumbnails, the bench sheet, the exports and the legend.
5. Line ends snap to targets while drawing a new line and while dragging an end. A ring marks the target. Alt/Option skips snapping for that gesture.
6. Every edit is one undo step. Touch editing works with touch-sized handles. Pinch zoom and pan still work.
7. Existing plays look exactly as before, including multi-point straight lines. The play schema gains one `path` value, `curve`; `PlayData.version` and `PLAN_VERSION` don't change.

## Rulings

### R1. A new path value, `curve`; no version change

- **`curve`.** `STROKE_PATHS` gains `"curve"`. A `curve` line is a bent line: its points are, in order, its start, its bends and its end. The play schema accepts it through the existing `z.enum(STROKE_PATHS)`; nothing else in the schema changes.
- **`straight`** keeps its meaning: a polyline through its points, unsmoothed. A multi-point straight line keeps its sharp corners, whether it was stored that way or edited.
- **`freehand`** is unchanged.
- **How a line becomes a curve.** Only by editing: adding a bend to a 2-point straight line (R3). The drawing tools still offer Straight and Freehand only; `curve` is never a drawing choice.
- **Limit.** At most **6 bends or corners** (8 points) can be added by editing, on either path (`MAX_LINE_BENDS = 6`).
- **Versions.** `PlayData.version` (2) and `PLAN_VERSION` (1) stay as they are. The change is additive, so plan files written from now on can contain `curve` (an ADR-0020 amendment records this).
- **Older builds (exact behaviour).** A reader built before this change validates `path` against `straight` and `freehand` only, so a diagram that contains a `curve` fails validation as a whole. The play is unreadable; the stroke is not dropped.
  - **Static planner tab on an older build** (it shares this browser's IndexedDB with an updated tab):
    - opening that drill from the library shows "This play's diagram couldn't be read." and the editor does not open;
    - the session page and the bench sheet show the drill without its diagram, and the session editor shows it with an empty board;
    - the stored drill is not changed, unless the coach opens that drill's diagram in the old tab and saves it, which replaces it with what was saved. Reloading the tab loads the new build and reads the curve.
  - **Plan files.** An older reader refuses the whole file with "This practice plan has problems and can't be opened." (issue "The diagram can't be read"), not with the newer-version message, because `PLAN_VERSION` stays 1. This applies to the static import, a hosted import page left open from before the deploy, and a plan link.
  - **Hosted.** The server and its client ship together, and the server validates every read and write, so an up-to-date hosted planner reads curves everywhere. A hosted tab opened before the deploy keeps its old bundle until it is reloaded; its in-browser plan reader refuses a file with a curve as above. Plays still reach it through the new server, so it never refuses them: it draws a `curve` as a sharp polyline through its bends, and saving from it keeps `path: "curve"`.

### R2. Rendering

`buildStrokeGeometry` is the one place lines become drawable geometry:
- `straight`, any number of points: unchanged (a polyline through its points).
- `curve` with 3 or more points: a **centripetal Catmull-Rom** curve through every point, sampled into a polyline. The curve passes through each bend handle. Arrow and stop ends are oriented along the final tangent. A `curve` with 2 points draws as its segment.
- `freehand`: unchanged.

Because every renderer goes through `buildStrokeGeometry`, this covers the board, thumbnails, print and the exports. A test pins that 2-point straight lines, multi-point straight lines (such as `ec-figure-eight`) and freehand lines produce exactly the same geometry as before.

The selection highlight and line hit-testing follow the drawn curve for a `curve` line. For `straight` and `freehand` lines they stay as they are (along the stored points).

### R3. Handles and gestures (Select tool)

- **Handle positions.** Handles come from a pure helper, `lineHandles(stroke)`:
  - **end handles:** at the first and last points;
  - **bend handles:** at the interior points of a `curve` line;
  - **corner handles:** at the interior points of a `straight` line (an older polyline). They are drawn square, so a sharp corner reads differently from a curve's bend;
  - **"+" handles:** one per segment, shown only while fewer than 6 bends or corners exist. On a `curve` line it sits on the drawn curve at the segment's midpoint; on a `straight` line at the segment's midpoint.
- **Adding with "+".**
  - On a 2-point straight line, the new point is a bend and the line becomes a `curve`.
  - On a multi-point straight line, the new point is a corner and the line stays `straight`, so its shape stays sharp.
  - On a `curve`, the new point is another bend.
  - A line that already has 6 or more bends or corners (an older line can have more than 8 points) shows no "+" and refuses a new one; every interior point still has a handle.
- **Freehand lines.** Their handles are their two ends, plus up to 6 interior anchor points. They have no "+" handles.
  - Anchors are chosen from the stored points by a Douglas–Peucker pass capped at 8 points in total.
  - The first drag of an end or anchor replaces the line's points with those ≤ 8 points. The path stays `freehand`, so it is still smoothed.
  - Moving the whole line never simplifies it.
- **Hit testing.**
  - The selected line's handles are hit first, then its body, then other elements in today's order.
  - The handle hit radius is the board's minimum hit radius (`MIN_HIT_RADIUS_PX = 22` converted to feet).
  - Only the selected line has handles.
- **Drags.**
  - Every drag uses the existing 4 px threshold.
  - Points are kept inside the ice area. When a whole-line move would leave it, the move is clamped as a whole, so the shape is never distorted.
  - The preview renders live, and one history entry is committed on release.
- **Remove a bend or corner.** Double-click or double-tap its handle. A double-tap is two taps within 300 ms and the hit radius. End handles and freehand anchors can't be removed. A `curve` left with 2 points becomes `straight` again.
- **Straighten.**
  - The inspector shows a **Straighten** button for a `curve` line and for a `straight` line with more than 2 points. It keeps the first and last points and sets `path: "straight"`.
  - For a freehand line, the button becomes **Make straight**. It sets `path: "straight"` and keeps the ends.
  - Either way, it is one undoable `updateElement`.
- **Keyboard.** Delete and Backspace still delete the selected line. No new shortcuts.

### R4. Snapping

- **When.**
  - Drawing a new line: its start, on press, and its end, on release. For a freehand line, only the start and end points snap.
  - Dragging an end handle.
- **When not.** Bends, corners, freehand anchors and whole-line moves don't snap.
- **Targets.**
  - player centres;
  - equipment centres;
  - the first and last points of other lines.

  A line never snaps to itself. Text annotations are not targets. Targets outside the drill's ice area are skipped.
- **Radius.** The larger of **3 ft** and the board's minimum hit radius in feet. The nearest target inside the radius wins; ties go to the first in that order.
- **Feedback.** While a snap is active, a ring is drawn around the target: 5 px on screen outside a player's or an equipment item's drawn glyph and its outline, and never smaller than a 14 px radius (a line end's ring). It is a League Blue ring over a white halo.
- **Never onto its own other end.** A drawn line's end never snaps to the target its start snapped to, and a dragged end of a 2-point line never snaps onto the line's other end. A drawn line shorter than 1 ft between its raw press and release points is a tap and creates nothing, whatever it would have snapped to.
- **Off switch.** Holding Alt/Option during the gesture disables snapping. There is no persistent toggle.
- **No attachment.** Snapping only sets coordinates. Nothing links a line to an object.

### R5. Code structure

- **Pure helpers** live in `lib/utils/canvas/line-editing.ts` and are portable (no DOM, no React):
  - `lineHandles`
  - `hitTestLineHandle`
  - `findSnapTarget`
  - `moveLinePoint`
  - `moveLine`
  - `insertBend`
  - `removeBend`
  - `straighten`
  - `anchorPoints`

  Each returns the same reference when nothing changes. `insertBend` and `removeBend` own the `straight` ↔ `curve` changes of R3.
- **Board hook.** The gesture state for line editing lives in `components/features/practice-planner/useStrokeEditing.ts`. `RinkBoard.tsx` must not grow: the plan first extracts enough existing code to keep it at or under its current length, and a line-budget test pins **1057 lines** or fewer.
- **Rendering.** Handle and snap-ring drawing goes in `drawing-utils.ts`, using palette colours passed in like the existing highlight.
- **Path lists.** `STROKE_PATHS` (every stored value) and the drawing choices (Straight, Freehand) are separate lists, so adding `curve` doesn't add a toolbar option.

### R6. Accessibility and touch

- **Size.** Handles draw at 7 px radius (corner squares 14 px across) on screen; their hit area is the 22 px touch radius.
- **Pinch and pan.** A second finger cancels an in-progress handle drag without committing, matching the existing element drag.
- **Contrast.** Handle colours come from the theme and meet 3:1 contrast against the ice in light and dark modes.

## Testing

- **Schema and documents:**
  - the play schema accepts `curve` and still rejects unknown paths;
  - a plan file with a `curve` line round-trips at version 1;
  - the drawing toolbar offers Straight and Freehand only.
- **Pure helpers:**
  - handle positions for straight lines (2 points, older polylines, more than 8 points), curves with 0 and 6 bends, and freehand lines;
  - path changes: "+" on a 2-point straight line makes a `curve`, "+" on a multi-point straight line keeps `straight`, removing a curve's last bend makes it `straight`;
  - insert and remove at the limits;
  - anchor simplification capped at 8 points, keeping the ends;
  - moves clamped to the ice area, with a whole-line move keeping its shape;
  - snapping: inside and outside the radius, nearest wins, self excluded, the Alt bypass;
  - unchanged input returns the same reference.
- **Rendering:**
  - 2-point straight, multi-point straight and freehand geometry is unchanged;
  - a 3-point curve passes through its middle point;
  - arrow direction follows the end tangent.
- **Board component** (mouse and touch):
  - select a line, drag an end, add a bend, remove a bend by double-click, move the line;
  - edit an older polyline and keep its corners sharp;
  - undo and redo each edit;
  - a snap during drawing, and Alt skipping it;
  - a second finger cancels a drag;
  - the RinkBoard line budget.
- **Inspector:** Straighten and Make straight.
- **Visual:** light and dark, desktop and phone screenshots of handles, a bent line, the snap ring, and a bent line on the printed bench sheet.

## Out of scope

- Attaching line ends to objects so they follow moves.
- A grid, or snapping bends and whole lines.
- Selecting several elements, and nudging with arrow keys.
- Editing lines in exports or print.
- Turning older polylines into curves automatically. A coach can Straighten one and bend it again.
- A curve drawing tool.

# Line Editing on the Rink Board — Design

**Date:** 2026-10-05
**Status:** Approved (design); implementation plan to follow in `../plans/2026-10-05-practice-line-editing.md`
**Applies to:** the shared rink board (`components/features/practice-planner/RinkBoard.tsx`, via `PlayEditor`), used by the hosted planner and the static Vite planner (`apps/planner/`).
**Depends on:** the board notation model (`DrawingElement`, `buildStrokeGeometry`), the element drag and history (`element-ops.ts`, `HistoryManager`), touch hit radii (`MIN_HIT_RADIUS_PX`).

## Context

What exists (verified):
- **Lines.** A line (`DrawingElement`) has an `action`, a `path` of `straight` or `freehand`, an `end`, and `points` in rink feet (200 × 85).
  - A straight line is stored as exactly 2 points (`finishStroke`, `element-ops.ts`).
  - A freehand line is simplified when drawn, then smoothed at render time by `buildStrokeGeometry` (`stroke-geometry.ts`).
  - The schema allows 2 to `MAX_STROKE_POINTS` (1000) points, each inside the rink.
- **Selection.** The Select tool selects one element at a time.
  - Players, equipment and text can be dragged. The drag starts after 4 px, is kept inside the ice area, and is one history entry.
  - Lines can be selected (shown with a highlight) and deleted, but not moved or reshaped. `moveElement` ignores them.
- **Snapping.** None for lines or objects. Only the ice-area rectangle snaps.
- **Input.** Mouse and touch handlers. Pinch zooms and pans. Hit radii have a minimum of 22 px.
- **Size.** `RinkBoard.tsx` is 1057 lines.

## Goal

A coach can fix a line without redrawing it: move it, drag its ends, and bend it into a curve. New and dragged line ends snap to players, equipment and the ends of other lines.

### Success criteria

1. A selected line shows handles. Each end and each bend has a handle, and each segment has a "+" handle at its midpoint.
2. **Moving:**
   - Dragging the line moves it as a whole.
   - Dragging an end or a bend moves that point.
   - Dragging a "+" handle adds a bend.
3. A bend can be removed by double-click or double-tap. **Straighten** in the inspector removes all bends.
4. Bent lines draw as smooth curves through their bend points everywhere a line is drawn: the board, thumbnails, the bench sheet, the exports and the legend.
5. Line ends snap to targets while drawing a new line and while dragging an end. A ring marks the target. Alt/Option skips snapping for that gesture.
6. Every edit is one undo step. Touch editing works with touch-sized handles. Pinch zoom and pan still work.
7. Existing plays look exactly as before. Plan files and the play schema don't change.

## Rulings

### R1. No schema change; bends are extra points

- **Straight lines.** A `straight` line with more than 2 points is a bent line. The points are, in order: its start, its bends, and its end.
- **Freehand lines.** A freehand line keeps `freehand`.
- **Limit.** At most **6 bends** (8 points) can be added to a straight line by editing (`MAX_LINE_BENDS = 6`).
- **Old builds.** `PLAN_VERSION` and `PlayData.version` stay as they are. An older build draws a bent straight line through the same points with sharp corners. This is acceptable.

### R2. Rendering

`buildStrokeGeometry` is the one place lines become drawable geometry:
- A `straight` line with 2 points: unchanged (a segment).
- A `straight` line with 3 or more points: a **centripetal Catmull-Rom** curve through every point, sampled into a polyline. The curve passes through each bend handle. Arrow and stop ends are oriented along the final tangent.
- `freehand`: unchanged.

Because every renderer goes through `buildStrokeGeometry`, this covers the board, thumbnails, print and the exports. A test pins that a 2-point line produces exactly the same geometry as before.

### R3. Handles and gestures (Select tool)

- **Handle positions.** Handles come from a pure helper, `lineHandles(stroke)`:
  - **end handles:** at the first and last points;
  - **bend handles:** at the interior points of a straight line;
  - **"+" handles:** at the midpoint of each segment, in both point space and drawn curve. A "+" handle is shown only while fewer than 6 bends exist.
- **Freehand lines.** Their handles are their two ends, plus up to 6 evenly spaced interior anchor points.
  - Anchors are chosen from the stored points by a Douglas–Peucker pass capped at 8 points in total.
  - The first drag of an end or anchor replaces the line's points with those ≤ 8 points. The path stays `freehand`, so it is still smoothed.
  - Moving the whole line never simplifies it.
- **Hit testing.**
  - Handles are hit first, then the line body, then other elements.
  - The handle hit radius is the board's minimum hit radius (`MIN_HIT_RADIUS_PX = 22` converted to feet).
  - Only the selected line has handles.
- **Drags.**
  - Every drag uses the existing 4 px threshold.
  - Points are kept inside the ice area. When a whole-line move would leave it, the move is clamped as a whole, so the shape is never distorted.
  - The preview renders live, and one history entry is committed on release.
- **Remove a bend.** Double-click or double-tap a bend handle. A double-tap is two taps within 300 ms and the hit radius. End handles can't be removed.
- **Straighten.**
  - The inspector shows a **Straighten** button for a straight line with bends. It keeps the first and last points.
  - For a freehand line, the button becomes **Make straight**. It sets `path: "straight"` and keeps the ends.
  - Either way, it is one undoable `updateElement`.
- **Keyboard.** Delete and Backspace still delete the selected line. No new shortcuts.

### R4. Snapping

- **When.**
  - Drawing a new line: its start, on press, and its end, on release. For a freehand line, only the start and end points snap.
  - Dragging an end handle.
- **When not.** Bends, freehand anchors and whole-line moves don't snap.
- **Targets.**
  - player centres;
  - equipment centres;
  - the first and last points of other lines.

  A line never snaps to itself. Text annotations are not targets.
- **Radius.** The larger of **3 ft** and the board's minimum hit radius in feet. The nearest target inside the radius wins; ties go to the first in that order.
- **Feedback.** While a snap is active, a ring is drawn around the target point.
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

  Each returns the same reference when nothing changes.
- **Board hook.** The gesture state for line editing lives in `components/features/practice-planner/useStrokeEditing.ts`. `RinkBoard.tsx` must not grow: the plan first extracts enough existing drag code to keep it at or under its current length, and a line-budget test pins **1057 lines** or fewer.
- **Rendering.** Handle and snap-ring drawing goes in `drawing-utils.ts`, using palette colours passed in like the existing highlight.

### R6. Accessibility and touch

- **Size.** Handles draw at 7 px radius on screen; their hit area is the 22 px touch radius.
- **Pinch and pan.** A second finger cancels an in-progress handle drag without committing, matching the existing element drag.
- **Contrast.** Handle colours come from the theme and meet 3:1 contrast against the ice in light and dark modes.

## Testing

- **Pure helpers:**
  - handle positions for straight lines with 0 and 6 bends and for freehand lines;
  - insert and remove at the limits;
  - anchor simplification capped at 8 points, keeping the ends;
  - moves clamped to the ice area, with a whole-line move keeping its shape;
  - snapping: inside and outside the radius, nearest wins, self excluded, the Alt bypass;
  - unchanged input returns the same reference.
- **Rendering:**
  - a 2-point straight line's geometry is unchanged;
  - a 3-point line passes through its middle point;
  - arrow direction follows the end tangent.
- **Board component** (mouse and touch):
  - select a line, drag an end, add a bend, remove a bend by double-click, move the line;
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

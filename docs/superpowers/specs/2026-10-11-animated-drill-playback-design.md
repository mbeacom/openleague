# Animated Drill Playback — Design

**Date:** 2026-10-11
**Status:** Draft (design); implementation plan to follow in `../plans/2026-10-11-animated-drill-playback.md`
**Applies to:** drill diagrams in the hosted planner and the static Vite planner (`apps/planner/`): the drill detail view, the session viewer, and the drill editor (`PlayEditor` / `RinkBoard`).
**Depends on:** the board notation model (`DrawingElement`, `buildStrokeGeometry`), line editing and snapping (`line-editing.ts`, `useStrokeEditing.ts`), the shared board renderer (`drawBoardScene`), the portable plan document (ADR-0020) and its additive-amendment pattern.

## Context

What exists (verified):

- **The diagram model.** `PlayData` v2 (`types/practice-planner.ts:283-293`) holds `players`, `drawings`, `equipment`, `annotations`, and optional `area` and `equipmentNeeds`. Coordinates are rink feet on a 200 × 85 rink (`lib/utils/play-data.ts:28-29`).
  - `PlayerIcon` (`types/practice-planner.ts:167-174`): `id`, `position`, `role` (`X O F D G C`), `label`, `color`.
  - `DrawingElement` (`:176-184`): `id`, `action`, `path`, `end`, `points`, `color`, `strokeWidth`. Actions are `skate | backskate | carry | pass | shot | lateral | line` (`:34`), paths `straight | freehand | curve` (`:42`), ends `arrow | stop | none` (`:49`).
  - `EquipmentItem` (`:188-194`): `id`, `kind` (`puck | puckPile | cone | net | tire | pylon`, `:52`), `position`, `rotation`.
  - Caps: 100 drawings, 1000 points per stroke, 100 elements per play (`:520-529`).
- **Parsing.** Every stored diagram goes through `upgradePlayData` / `parseStoredPlayData` (`lib/utils/play-data.ts:253-324`). `drawingSchema` (`:59-67`) is a plain `z.object`, so **unknown keys on a drawing are stripped**, but an invalid value on a *known* key fails the whole diagram. Advisory fields are pre-filtered so they can never make a drill unreadable: `dropInvalidArea` (`:228-234`) and `readableEquipmentNeeds` (`:241-251`). Writes go through `sanitizePlayDataForWrite` (`:349-368`), used by `lib/actions/plays.ts:45`.
- **Stroke geometry.** `strokeCenterline` (`lib/utils/canvas/stroke-geometry.ts:102-106`) is the one definition of the line a stroke follows: freehand is smoothed (`smoothPath`, `:30-44`), a curve of 3+ points is a centripetal Catmull-Rom curve (`catmullRomPath`, `:89-97`), anything else is its stored points. `resampleByArcLength` (`:115-141`) gives evenly spaced samples. Both are pure and unit-agnostic: smoothing is affine and the centripetal knots scale uniformly, so the centerline can be computed in feet and matches the drawn line.
- **Rendering.** `drawBoardScene` (`lib/utils/canvas/drawing-utils.ts:485-502`) draws rink, then `drawAllElements`, then the area mask. `drawAllElements` (`:410-423`) draws in a fixed z-order: drawings, equipment, players, annotations. `drawBoardFrame` (`:522-546`) wraps it for the editing board (clear, zoom/pan, pixel ratio). The rink background cache is a single module-level canvas keyed by transform (`rink-renderer.ts:170-212`), usable only at pixel ratio 1 with no zoom (`drawing-utils.ts:513-516`).
- **The editing board loop.** `RinkBoard` renders every animation frame unconditionally, idle or not (`components/features/practice-planner/RinkBoard.tsx:410-425`). It is the editor (1028 lines), with a `mode: "edit" | "view"` prop (`:71`).
- **Static diagrams.** `PlayDiagram` (`PlayDiagram.tsx`) draws a drill once per size/ratio/font change through `drawThumbnailScene` (`thumbnail-generator.ts:73-88`). It is used by the drill detail view (`DrillDetailView.tsx:210`), the session viewer's preview box (`app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx:585-588`, fed by `displayPlayData`, which can hide goalie markers, `lib/utils/drill-tags.ts:59-85`), and the import preview (`PlanPreview.tsx:120`). Print uses a PNG at 720 × 306 (`print/PrintDiagram.tsx:20`). The drill detail view already has **Download diagram** (`DrillDetailView.tsx:199-201`) and a `downloadBlob` helper (`export/download.ts`).
- **Snapping.** `findSnapTarget` (`lib/utils/canvas/line-editing.ts:225-249`) snaps a line end to the nearest player centre, equipment centre, or another line's first/last point within `SNAP_RADIUS_FT = 3` (`:22`). It returns `{ position, radiusFt }` only (`:212-217`, `:248`): **which element was hit is discarded.** `useStrokeEditing.snapLineEnd` (`useStrokeEditing.ts:132-139`) returns only the position; `RinkBoard` keeps the start snap as a `Position` (`RinkBoard.tsx:197`, `:636-642`) and `finishStroke` (`element-ops.ts:143-157`) stores only points.
- **Moving elements.** `moveElement` moves players, equipment and text and ignores drawings (`element-ops.ts:90-100`). Line ends do not follow a moved player.
- **Element ids** are `"<ms timestamp>-<9 base-36 chars>"`, about 23 characters (`RinkBoard.tsx:540-542`). Duplicating a drill copies `playData` verbatim, so ids inside one diagram stay consistent.
- **Real drawings rarely touch their players.** The starter drills (`lib/data/starter-plays.ts`) begin strokes 4–7 ft from the player centre (Breakout: D1 at (16, 56), its pass starts at (20, 51), 6.4 ft away; LW at (40, 12), its route starts at (46, 11), 6.1 ft). Several passes start part-way along a teammate's route (Breakout `bo-pass2` at (58, 14), on LW's (46, 11)→(72, 9) route). Most drills have no `puck` item; pucks are implied by pass and shot lines.
- **Notation vocabulary.** `ACTION_LABELS` and `ROLE_LABELS` (`lib/utils/canvas/notation.ts`) name every action and role; `buildLegend` (`legend.ts`) lists the ones a drill uses.
- **Plan document and links.** The plan document (`lib/plan-document/document.ts`) strips unknown keys and runs every diagram through `parseStoredPlayData` (`:110-116`). A plan link (`#plan=`) refuses JSON over `MAX_PLAN_LINK_BYTES = 65_536` **before** compression (`document.ts:51`, `link.ts:102-106`). ADR-0020's amendments (goalie tags, timing, staff, curves, quarter areas, equipment) record additive fields with no version bump and state exactly what an older reader does.
- **Static store.** IndexedDB `DB_VERSION = 6` (`apps/planner/src/store/idb-repo.ts:24`); earlier additive amendments bumped it with no data change so older tabs reload before saving.
- **CSP.** Static: `default-src 'self'; script-src 'self'; img-src 'self' data: blob:`, no `media-src` or `worker-src` (`apps/planner/build-config.ts:34-48`). Hosted: `worker-src 'self'`, no `media-src` (`next.config.ts:153-166`). So a same-origin bundled worker is allowed in both (static falls back to `script-src 'self'`), a `blob:` download link is allowed (already used for plan files), and a `<video src="blob:…">` preview is **not** allowed in either.
- **Reduced motion.** Respected in CSS only (`components/ui/SkipLink.tsx:40` and marketing components); no JavaScript check exists yet.

## Goal

A coach can press **Play** on any drill and watch it run: skaters move along their lines, the puck travels along passes and shots, one step at a time. It is slow enough, and clear enough, to explain the drill to a group of 8-year-olds on a tablet at the boards. Coaches can fix the order when the automatic one is wrong, and can download the animation as a video to send to families.

### Success criteria

1. Every drill with at least one non-`line` stroke shows **Play** wherever its diagram is shown on the drill detail view and the session viewer, with no authoring needed.
2. Playback offers play/pause, scrub, step back/forward, speed 0.5× / 1× / 2×, and loop. Every control is at least 44 × 44 px and works by touch, mouse and keyboard.
3. The animation is derived from the strokes already drawn. The first frame shows the players where the diagram has them; the last frame shows every stroke in full.
4. With `prefers-reduced-motion: reduce`, playback opens in step mode: each tap of **Next step** shows the end of that step, with no tweening.
5. A coach can set the order in a **Steps** mode in the editor by tapping lines in order. Numbered badges show the order, and every change is one undo step.
6. New lines record which player, item or line they were snapped to, so the right skater moves even after the diagram is rearranged.
7. Existing drills, plan files and plan links read exactly as before. `PlayData.version` (2) and `PLAN_VERSION` (1) don't change.
8. Playback holds at least 30 fps on a low-end phone for a 100-stroke drill, and draws nothing while paused or off screen.
9. A coach can download the animation as MP4 or WebM with no new dependency, and (last phase) as a GIF.

## Rulings

### R1. Derive the animation from the strokes; no keyframes

Animation is computed from the diagram, never authored as keyframes or a second set of positions.

- **Movement strokes** (`skate`, `backskate`, `carry`, `lateral`) move one player, the stroke's **actor**, along the stroke's `strokeCenterline`.
- **Puck strokes** (`pass`, `shot`) move a puck along the centerline. A `carry` moves its actor and a puck together.
- **`line` strokes** (zone outlines, lanes) never animate. They are drawn in full in every frame.
- Equipment other than pucks never moves. A `puckPile` is never picked up.
- Text annotations never move.

Rejected: hand-authored keyframes per player. They double the data, go stale on every line edit, and are a second editor to learn. Coaches already draw the routes; the routes are the animation.

### R2. One pure function feeds the existing renderer

New module `lib/utils/canvas/playback.ts`, pure (no DOM, no canvas):

```ts
compilePlayback(playData: PlayData, options?: { speeds?: Partial<Record<StrokeAction, number>> }): Playback
poseAt(playback: Playback, tMs: number): PlaybackFrame
// convenience for tests and one-off frames
posePlayData(playData: PlayData, tMs: number): PlayData

interface Playback {
  durationMs: number;
  steps: { startMs: number; endMs: number; strokeIds: string[] }[];
  strokes: Map<string, { startMs: number; endMs: number; actorId: string | null; puckId: string | null }>;
  // plus precomputed arc-length tables, private
}
interface PlaybackFrame {
  data: PlayData;            // what drawBoardScene draws
  stepIndex: number;         // 0-based; -1 before the first stroke starts
  activeStrokeIds: string[];
}
```

- `compilePlayback` runs once per diagram (memoized on the `PlayData` reference). It resolves actors and pucks (R4), schedules every stroke (R3, R5), and precomputes each stroke's centerline in feet resampled at 0.5 ft with a cumulative arc-length table. The table is capped at `MAX_ARC_SAMPLES` (4,000): spacing is 0.5 ft or length ÷ 4,000, whichever is larger. Every stroke shorter than 2,000 ft keeps 0.5 ft, and the longest valid stroke (1,000 points zig-zagging corner to corner, about 217,000 ft) stays at 4,000 samples instead of about 434,000. On that extreme input the animation cuts corners; ordinary strokes are unaffected.
- `poseAt` is cheap per frame: it clamps `t` to `[0, durationMs]`, and for each active stroke binary-searches its arc-length table. It is deterministic: the same `Playback` and `t` give the same frame.
- **The frame is ordinary `PlayData`,** so `drawBoardScene` draws it unchanged:
  - players and pucks at their posed positions;
  - **completed** strokes as stored;
  - the **active** stroke truncated to the part already travelled (as a `straight` path through the resampled centerline points, so smoothing isn't applied twice). Its arrow rides at the tip; a `stop` end appears only when the stroke completes;
  - **upcoming** strokes "ghosted": their colour mixed 70% toward `DIAGRAM_THEME.ice` (`#F4F9FC`). Tinting is data, so the renderer needs no opacity option;
  - a puck that the diagram doesn't contain (R4) as a synthetic `EquipmentItem` with id `playback-puck-<strokeId>`.
- A frame is never saved. The playback component is read-only and never passes a frame to `onPlayDataChange`, a Server Action or the store. Synthetic ids carry the `playback-` prefix so a test can assert none reach a write path.

### R3. The automatic order (no steps authored)

With no `step` on any stroke, strokes are scheduled from the drawing itself. Rules are applied in drawing order, and a stroke only ever waits for an **earlier-drawn** stroke, so the schedule is always acyclic and stable.

A stroke starts at time 0 unless one of these makes it wait (the latest wins):

1. **Same actor, one route at a time.** It waits for the end of the actor's previous stroke. A route drawn as several strokes (each starting within `SNAP_RADIUS_FT` of the previous one's end) is one skater's continuous route.
2. **Receive before you go.** A movement stroke waits for the end of an earlier pass whose `toId` names its actor. Failing that, it waits for an earlier pass whose last point is within `ATTACH_RADIUS_FT` of its actor (the actor's position at that time).
3. **Pass on the move.** A pass or shot whose `fromId` names an earlier movement stroke starts when that skater reaches the point on it nearest the pass's first point. Failing that, a pass or shot that doesn't start at a resting player, but starts within `ATTACH_RADIUS_FT` of an earlier movement stroke's centerline, starts when that skater reaches the nearest point on it. (Breakout: LW skates up the wall and passes at (58, 14).)

**Recorded attachments come first.** In rules 2 and 3, a valid `toId` or `fromId` (R6, R7) decides the dependency, so a rearranged diagram keeps the pass the coach drew to that skater. Proximity is the fallback when the id is absent, names no element, or names a stroke drawn later; the later-drawn case is ignored rather than followed, so the schedule stays acyclic. Without ids (phase 1, or Alt/Option strokes) the rules are proximity only.

Constants: `ATTACH_RADIUS_FT = PLAYER_RADIUS_FT + SNAP_RADIUS_FT` (6 + 3 = 9 ft; `glyph-metrics.ts:4`, `line-editing.ts:22`). This catches strokes drawn from the edge of a marker (the starter drills start 4–7 ft out) without reaching the next player in a typical lane (12–15 ft apart).

**Steps in automatic order** are the distinct stroke start times, in order. They drive step forward/back and the scrubber's tick marks.

Rejected:
- *Pure drawing order, one stroke at a time.* Predictable, but a drill with six skaters leaving together plays as six separate moves, which misrepresents the drill.
- *Everything at once.* A receiver skates away before the pass arrives.

### R4. Who moves, and which puck

**Actor of a movement stroke**, first match:
1. `fromId` names a player in the diagram (R6): that player.
2. `fromId` names an earlier drawing: that drawing's actor.
3. The player nearest the stroke's first point, by their posed position when the stroke starts, within `ATTACH_RADIUS_FT`. Ties go to the earlier player in `players` (the same tie rule as `findSnapTarget`).
4. The actor of an earlier stroke whose last point is within `SNAP_RADIUS_FT` of this first point.
5. None: the stroke still "draws itself" over its duration, but no marker moves.

If the actor isn't exactly at the stroke's first point (up to 9 ft away, or anywhere when attached by id after a move), its path begins at its current position, so motion is continuous.

**Puck of a pass, shot or carry**, first match:
1. `fromId` names a `puck` item: that puck.
2. The `puck` (including a synthetic one already created) nearest the first point, by posed position, within `ATTACH_RADIUS_FT`.
3. Otherwise a synthetic puck appears at the first point when the stroke starts.

After the stroke the puck stays at its last point, where a later stroke can pick it up by rule 2. A carried puck rides 2 ft ahead of the actor along the path's tangent and is left at the end of the carry, unless a pass or shot on the move (R3 rule 3) branches from the carry first: that stroke takes the carried puck at the release point, at the time the skater reaches it.

**Hidden goalies.** The session viewer plays `displayPlayData`. A stroke whose actor was a hidden goalie has no actor and draws itself (rule 5).

### R5. Timing

**Speeds**, in rink feet per second at 1×, chosen to be followable by young players rather than realistic:

| Action | ft/s | Easing |
|---|---|---|
| skate | 12 | ease in-out |
| carry | 10 | ease in-out |
| lateral | 9 | ease in-out |
| backskate | 8 | ease in-out |
| pass | 30 | linear |
| shot | 45 | linear |

- Duration = centerline length ÷ speed, at least **600 ms** and at most **10 s** per stroke (a full-ice lap would otherwise run over 30 s).
- A `speed` field (R6) scales one stroke: `slow` ×0.6, `fast` ×1.5.
- **A 400 ms beat** is inserted before each step after the first, so the step boundaries are visible.
- **Hold frames:** playback starts on the first frame and holds the last frame; loop waits 1.5 s on the last frame before restarting.
- Playback speed (0.5× / 1× / 2×) scales the clock only, never the schedule, so scrub positions and step ticks don't move when the speed changes.

### R6. Optional additive fields on `DrawingElement`

```ts
interface DrawingElement {
  // …existing fields
  /** Playback step, 1–100. Same number = runs together. Absent = automatic order. */
  step?: number;
  /** The player, item or line this stroke starts from (recorded at snap time). */
  fromId?: string;
  /** The player, item or line this stroke ends at (recorded at snap time). */
  toId?: string;
  /** Pace for this stroke only. Absent = normal. */
  speed?: "slow" | "fast";
}
```

- **`speed` instead of `durationMs`.** A duration goes wrong as soon as the line is reshaped; a relative pace survives line edits, is smaller, and is the choice a coach actually makes. Rejected: `durationMs`.
- **Authored steps are barriers.** When any stroke has a `step`, all strokes of an authored step start after every stroke of the previous authored step has finished (plus the beat). "Previous" means the next lower step number that has strokes, so with steps 1, 3 and 7, step 3 waits for step 1 and step 7 for step 3. **Within a step the R3 rules still apply**, so a pass on the move or a chained route behaves the same as in automatic order. Consequently "everything in step 1" plays exactly like automatic order.
- **Strokes without a step in a drill that has steps** (drawn after the order was set) run after the last authored step, in automatic order. The Steps mode flags them (R8).
- Step numbers are stored as given; gaps are shown compacted (steps 1, 3, 7 display as 1, 2, 3).
- **Reading is advisory**, like `area` and `equipmentNeeds`: a new pre-filter in `upgradePlayData` drops an invalid `step` (not an integer 1–100), `fromId`/`toId` (not a valid id string) or `speed` (not `slow`/`fast`) from that drawing and logs it. It never makes the diagram unreadable. An id that names no element, or the stroke itself, is ignored at compile time.
- **Writing:** `sanitizePlayDataForWrite` drops dangling or self-referencing `fromId`/`toId`. Writers emit each field only when set.

### R7. Attachment recorded at snap time

- `SnapTarget` gains the element it hit: `ref: { kind: "player" | "equipment" | "line"; id: string }` (for a line end, the other line's id). `findSnapTarget` already iterates the candidates with their source element (`line-editing.ts:227-233`); it keeps the id instead of discarding it.
- `useStrokeEditing` exposes the current snap's `ref` alongside `currentSnap()`; `RinkBoard` stores the start snap as a `SnapTarget`, not a `Position`.
- `finishStroke` takes optional `{ fromId, toId }` and stores them on the new stroke.
- **Line editing keeps them honest:** dragging an end onto a target re-records that end's id; dragging it off any target removes it; moving the whole line removes both (it no longer touches either target). Straighten and bend edits keep them.
- Moving a player keeps the ids. That is the point: the right skater still runs the route. Making line ends follow a moved player is out of scope.
- Alt/Option (no snap) records nothing; that stroke falls back to R4 inference.

### R8. Authoring: Steps mode

- **Entry.** A **Steps** toggle in `DrawingToolbar`. In Steps mode the board edits nothing but order: no drawing, dragging or line handles.
- **Badges.** Every non-`line` stroke shows a numbered circular badge near its first point (offset so it doesn't cover the marker), drawn as a board overlay like the line handles (`drawLineHandles`), never in thumbnails. Authored numbers are filled League Blue; automatic ones are outlined grey with the derived number; unstepped strokes in an authored drill show a small "–".
- **Assigning.** A chip shows **"Tapping assigns step 2"** with **New step** (+1) and **Same step** controls. Tapping a stroke assigns it the current number; tapping it again removes its step. The first tap in a drill with no steps starts at 1.
- **Shortcuts.** **Number in drawing order** (each stroke its own step) and **Use automatic order** (remove every `step`). Both are one undo entry.
- **Pace.** With one stroke selected in Steps mode, a three-way **Slow / Normal / Fast** control sets `speed`.
- **Preview.** A **Preview** button plays the current (unsaved) diagram in place, using the playback component (R10).
- Every assignment is one history entry through the existing history manager. Tap targets use the board's touch hit radius (22 px minimum).

### R9. Playback controls

- **Layout (mobile first).** Under the board: row 1 is the scrubber, full width, with a tick per step; row 2 is **Step back**, **Play/Pause**, **Step forward**, then **Speed** (a 3-way toggle 0.5× / 1× / 2×) and **Loop**. At ≥ 600 px both rows merge into one. All targets are ≥ 44 × 44 px; the slider thumb has a 44 px hit area.
- **Step back/forward** jump to the start of the previous or next step and pause.
- **Caption.** Under the controls: "Step 2 of 4 · LW: Puck carry · D1: Pass", from the actor labels (`label`, else `ROLE_LABELS`) and `ACTION_LABELS` of every stroke assigned to the current playback step, in start order. That includes a stroke that starts partway through the step (a pass on the move), so the one announcement covers it. It is also an `aria-live="polite"` region, updated on step changes only, never per frame.
- **Keyboard** (when the board has focus): Space play/pause, ←/→ step, Home/End first/last frame.
- **No autoplay**, anywhere, and loop is off by default. Moving content starts only on a tap (WCAG 2.2.2).
- **Reduced motion.** With `prefers-reduced-motion: reduce` (read with MUI `useMediaQuery`), Play is replaced by **Next step**, which shows the end state of the next step with no tweening, and the scrubber snaps to steps. An **Animate** switch beside it turns tweening on for that viewer on request.
- **Full screen.** A full-screen button (Fullscreen API) for showing a group on a tablet; hidden where unsupported.
- Accessible name: the canvas keeps "`<drill>` diagram"; the slider's `aria-valuetext` reads "Step 2 of 4".

### R10. The playback component and where it appears

New client component `PlaybackBoard` (separate from `RinkBoard`, which is the editor and renders continuously):

- **Drill detail** (hosted `DrillDetailView`, and the static planner's drill screen through it): a **Play** button over the diagram swaps `PlayDiagram` for `PlaybackBoard` in the same box.
- **Session viewer** (`SessionDetailView` preview box, and the static session screen through it): the same Play button, playing the displayed data.
- **Editor**: **Preview** in Steps mode (R8). In phase 1, before Steps mode exists, a **Preview animation** toolbar button.
- **Not** in library cards, sidebar cards, the import preview, print, the bench sheet or Word exports.
- **Print** may show step numbers instead: the printed diagram draws the R8 badges when the drill has authored steps (phase 2). Automatic numbers are not printed (see Open questions).

### R11. Performance on low-end phones

- **Draw only while playing.** The component's own `requestAnimationFrame` loop runs while playing and stops on pause, at the end, when the document is hidden, or when an `IntersectionObserver` reports the board off screen. The clock comes from `performance.now()`, so a slow device drops frames instead of slowing the drill.
- **Two layers.** A static layer canvas holds the rink plus every completed and ghosted stroke. It is redrawn only when a stroke changes state (each stroke does so at most twice per run). Each frame blits it, then draws the active strokes, equipment, players, annotations and the area mask, which keeps `drawAllElements`' z-order (drawings below everything). The board keeps its own layer rather than the module-level rink cache, which would thrash against other diagrams on the page.
- **Pixel ratio capped at 2** while playing.
- **Budgets** (checked on a mid-range Android profile in the browser pass): `compilePlayback` < 5 ms for a 100-stroke drill; per-frame script < 4 ms; ≥ 30 fps for 100 strokes. Input size is bounded too: no stroke's arc-length table exceeds `MAX_ARC_SAMPLES` (R2), whatever its length.

### R12. Video export (no dependency)

- **API.** `canvas.captureStream(30)` into `MediaRecorder`. The format is chosen by `MediaRecorder.isTypeSupported` in order: `video/mp4;codecs=avc1`, `video/mp4`, `video/webm;codecs=vp9`, `video/webm;codecs=vp8`, `video/webm`. The file is `<drill name>.mp4` or `.webm`.
- **Frame.** 1280 × 640: the diagram at 1280 × 546 (the thumbnail aspect, even dimensions for H.264) above a 94 px band with the drill name and "Step n of m" in the diagram font (awaiting `waitForDiagramFont`). `videoBitsPerSecond: 2_000_000`.
- **Recording runs in real time** at the chosen playback speed, with a 1 s hold at the start and 2 s at the end. A dialog shows progress and Cancel. Over 60 s of output is refused with "Choose a faster speed to export this drill."
- **The tab must stay visible.** `requestAnimationFrame` stops in a background tab, so recording aborts on `visibilitychange` with "Recording stopped because the tab was hidden."
- **The export canvas** is attached to the document, visually hidden (not `display: none`), because capture from a detached canvas is unreliable in some engines.
- **Feature detection.** The **Video** option is shown only when `HTMLCanvasElement.prototype.captureStream` and `MediaRecorder` exist and one listed type is supported.
- **Where.** **Download diagram** on the drill detail view becomes a menu: Image (PNG), Video, and later GIF.
- **No preview player.** A `<video src="blob:…">` would need `media-src blob:` in both CSPs; download only keeps both policies unchanged.
- **Size estimate:** ≤ 2 Mbit/s, so at most about 5 MB for 20 s; flat diagram frames usually encode well below the cap.
- **Known limitation:** browser-recorded WebM files often lack a duration in their header, so some players can't seek them. Fixing that needs a remuxing step (see Open questions).

### R13. GIF export (last phase, one small lazy dependency)

- **Encoder:** `gifenc` (MIT, v1.0.3; about 170 KB unpacked on npm including sources; the shipped module is far smaller). The gzipped chunk size is measured at implementation and budgeted in `scripts/check-planner-build.ts`.
- **Loaded lazily** (dynamic `import()`) inside a same-origin module worker (`new Worker(new URL(…, import.meta.url), { type: "module" })`). Hosted `worker-src 'self'` and static `script-src 'self'` both allow it; no CSP change.
- **Rendered offline, not in real time:** frames at `t = i / 12 s` through `poseAt`, 640 × 320 (the R12 layout at half size), 12 fps. One palette is quantized from the first and last frames and applied to every frame.
- Capped at 30 s of output. Estimated 1–3 MB for 15 s.

### R14. Share links and file size

- **Bytes per stroke, worst case:** `step` ~10, `fromId` ~34, `toId` ~32, `speed` ~15 bytes, about 91 bytes. A typical drill (6–10 strokes) grows by 0.5–0.9 KB, roughly 5–15% (freehand points dominate a diagram's size). The worst case, 100 fully attached strokes, adds about 9 KB.
- **Plan links** count JSON bytes before compression (64 KB). If a plan fits only without the new fields, the link writer omits `fromId`, `toId` and `speed` (never `step`) and the share dialog says "Animation details were left out of the link; download the file to keep them." The receiver's playback falls back to inference for those strokes.
- **Plan files** (900 KB cap) are unaffected in practice.

### R15. Compatibility (`PlayData.version` stays 2, `PLAN_VERSION` stays 1)

An ADR-0020 amendment, "Animated playback (additive drawing fields, versions stay 1 and 2)", records:

- **Older readers strip the fields** (`drawingSchema` is a plain `z.object`), so every file stays readable in both directions. Unlike curves, nothing becomes unreadable.
- **A round trip through an older build drops them.** A drill saved from an older static tab, or imported and re-exported by an older build, loses its steps, attachments and pace, and plays in automatic order.
- **Static store:** `DB_VERSION` goes to the next free number (7 is taken by the storage connectors, so 8 or later) with no data change, so an older tab reloads before it can save a drill without its steps.
- **Hosted:** server and client ship together. A tab opened before the deploy may drop the fields when it saves; accepted, as for earlier amendments.
- Drills without the fields play in automatic order, so every existing drill animates on day one.

## Phasing

Each PR ships on its own and leaves main releasable.

1. **Playback with automatic order.** `playback.ts` (`compilePlayback`, `poseAt`, `posePlayData`), `PlaybackBoard` with the R9 controls, reduced-motion step mode, Play on drill detail and the session viewer, **Preview animation** in the editor. No schema change.
2. **Steps and attachment.** The R6 fields with lenient reading and write cleanup; `findSnapTarget` returns `ref`; `finishStroke` and line-end drags record and clear ids; Steps mode with badges, pace and undo; print badges for authored steps; the link-writer fallback; the `DB_VERSION` bump; the ADR-0020 amendment.
3. **Video export.** R12 behind feature detection; the Download menu on drill detail.
4. **GIF export** (optional). R13, with the bundle budget.

## Testing

- **`playback.ts` (node project, pure):** small hand-built fixtures, one rule per test:
  - actor inference: nearest within 9 ft, the tie rule, none beyond 9 ft, `fromId` beats proximity, a chained route keeps its actor;
  - scheduling: concurrent independent skaters, receive-before-go, pass on the move starting at the nearest arc point, same-actor queueing, only earlier-drawn strokes are waited on; with ids, `toId` picks the receiver and `fromId` the carrier route over a nearer stroke, and a dangling or later-drawn id falls back to proximity;
  - pucks: existing puck picked up, synthetic puck created and later picked up, carry moves both, `puckPile` never moves;
  - authored steps as barriers, including gaps (steps 1, 3, 7 each wait for the previous existing step), the R3 rules within a step, unstepped strokes after the last step, gaps compacted, dangling and self ids ignored;
  - size: the longest valid stroke (1,000 points, corner to corner) compiles with a table of at most `MAX_ARC_SAMPLES` samples and ends at its last point; an ordinary stroke keeps 0.5 ft spacing;
  - timing: speed table, 600 ms floor, 10 s cap, `slow`/`fast`, the 400 ms beat, the playback-speed multiplier leaves the schedule alone;
  - frames: `t` clamped; the first frame equals the diagram with every non-`line` stroke ghosted; the last frame's strokes equal the stored strokes; `line` strokes never ghost; the truncated stroke's last point lies on the centerline; same input, same frame; no synthetic id survives `sanitizePlayDataForWrite`.
- **Golden schedules.** For every starter play, a snapshot of each stroke's actor, puck, start and end (ms), and the poses at each step boundary rounded to 0.1 ft. Reviewed by eye once when phase 1 lands; afterwards a change to the rules shows as a snapshot diff.
- **Schema (phase 2):** the fields round-trip; each invalid value is dropped with the rest of the diagram intact; an older-reader schema (today's `drawingSchema`) strips them; the plan document round-trips them; the link fallback drops only `fromId`/`toId`/`speed`.
- **Snapping (phase 2):** `findSnapTarget` returns the hit element's id for player, equipment and line-end targets; `finishStroke` stores `fromId`/`toId`; an end dragged off a target clears its id; a whole-line move clears both.
- **Components (jsdom):**
  - `PlaybackBoard`: controls and keyboard, step ticks, the caption's live region updates per step only and names every stroke in the step (including one that starts partway through), no autoplay;
  - reduced motion via a `matchMedia` stub: Next step replaces Play, Animate opts in;
  - the rAF loop stops on pause, end and hidden, using fake timers and a rAF stub;
  - Steps mode: assign, same/new step, remove, both shortcuts, one undo entry each.
- **Export detection:** with `MediaRecorder` and `captureStream` stubbed, the type preference order and the hidden option when unsupported (jsdom has neither, so the default is hidden); aborting on `visibilitychange`; the 60 s refusal.
- **Browser pass** (static planner, 360 px and 1280 px, light and dark): play a starter drill, scrub, step, loop, 0.5×; reduced motion emulated; a 100-stroke drill under a 4× CPU throttle holds 30 fps; record a video in Chromium and Firefox and confirm it plays; check Safari's MP4 by hand.

## Out of scope

- Line ends following a moved player.
- Per-frame keyframes, easing editors, or arbitrary timing.
- Animating text, nets, cones or other equipment.
- Sound, voice-over or captions burned into the video beyond the drill name and step.
- An in-page video preview (needs a CSP change).
- Animating library cards or thumbnails.

## Open questions for the owner

1. **Automatic order everywhere?** This spec shows Play on every drill, using inferred order when none is authored. The alternative is Play only on drills whose order a coach has set, which avoids a wrong-looking animation but hides the feature from almost every existing drill.
2. **Speeds.** Are the R5 defaults right for youth players, and should they scale with the drill's age groups (slower for U8)?
3. **Printed step numbers.** Only authored steps are printed. Should automatic numbers print too?
4. **GIF.** Is phase 4 worth one dependency, given video covers sharing? GIFs autoplay in group chats, which is the case for it.
5. **WebM duration.** Accept seek-less WebM from some browsers, or add a small remuxing step (a dependency)?
6. **Video branding.** Should the export band show the team's crest (the static "Your team" profile, or the hosted team logo) next to the drill name?
7. **Link fallback.** Is dropping attachments and pace from an oversized plan link (keeping steps) acceptable, or should the link refuse instead?
8. **Older hosted tabs** may drop steps on save until reloaded. Accept, as for earlier amendments?
9. **Loop default.** Off here. Coaches projecting a drill on a tablet may prefer it on.

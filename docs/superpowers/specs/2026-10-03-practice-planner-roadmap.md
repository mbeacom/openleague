# Practice Planner Iteration — Roadmap & Accepted Decisions

**Date:** 2026-10-03

Each phase gets its own spec, then a plan, then implementation, in this order:

| Order | Phase | Status |
|---|---|---|
| 1 | Phase 1: hockey-native board notation | Implemented, PR #369 |
| 2 | Hotfix: live session bugs | Branch `fix/practice-planner-session-bugs` |
| 3 | 3a: drill ownership, inline editing, duplication | Spec `2026-10-03-practice-session-drill-ownership-design.md` |
| 4 | 2a: drill ice area | Spec to write |
| 5 | 2b: stations | Merged, PR #379 |
| 6 | 3b: timeline and bench sheet | Implemented on `feat/practice-bench-sheet` |

The hotfix covers three bugs that exist today:
- Shared sessions email the team only on an explicit Save, not on every autosave.
- The edit query normalizes drill sequences, so a sequence gap no longer blocks saving.
- The rink-background cache is keyed on the full transform, which fixes thumbnails being misaligned with the rink.

## Phase 2a: drill ice area (accepted decisions)

- **Where it's stored.** An optional `PlayData.area`, inside the drill data. It is either `{ kind: preset }` or `{ kind: "custom", rect }`, in rink feet. A missing area means full ice. No version bump is needed.
  - Presets: `full`, `half-left`, `half-right`, `zone-left`, `zone-neutral`, `zone-right`.
  - Preset rectangles are derived from the renderer's blue-line constants.
  - A custom rectangle must be at least 20×20 ft and inside the rink. The UI snaps it to 5 ft.
- **Reading old or bad data.** An invalid stored area is dropped on read and logged. It never makes a drill unreadable.
- **Independent of venue segments.** Drill areas do not reuse venue surface segments: segment geometry is an unmarked schematic and display-only under ADR-0012. The only coupling is an advisory fit check against the booked segment's `SegmentKind`.
- **Fixed where it's drawn.** A drill's area is fixed where it was drawn, never moved or mirrored per session. Duplicate the drill to use it at the other end.
- **Rendering:**
  - `createTransformContext` gains a viewport.
  - The edit board crops to the area plus a 5 ft margin, and placement and drag are clamped to the area.
  - Thumbnails show the full rink with everything outside the area shaded; they are not cropped.
  - The legend gets an area chip.

## Phase 2b: stations (accepted decisions)

- **Data.** `PracticeSessionPlay.runsWithPrevious Boolean @default(false)`, added with a hand-written additive migration. `sequence` stays unique and total.
- **Grouping.**
  - Consecutive drills with the flag set form one station group with the drill before them.
  - A group lasts as long as its longest drill (wall time).
  - At most 4 stations per group. The first drill can't run with a previous one.
- **Server validation** checks the session's wall time against its duration, instead of the sum of all drill durations.
- **One shared module**, `lib/utils/session-timeline.ts`, used by the client, the server, and 3b. It provides `groupStations`, `sessionWallMinutes`, `moveItem`, `toggleRunsWithPrevious`, `removeItem`, `normalizeGroups`, and `stationWarnings`.
- **Warnings never block a save.** The coach is warned about overlapping station areas and about drills larger than the booked segment kind.
- **Display.** The session detail view shows a station map: one rink, with each station's drawing clipped to its area and labeled.
- **Deferred:** player-group assignment to stations, and rotation scheduling.
- **Columns on `PracticeSessionPlay` and duplicate (from 3a).** Duplicating a session copies every `PracticeSessionPlay` scalar column automatically (`copySessionPlayScalars` in `lib/services/practice-session-drills.ts` walks the generated scalar-field enum), so a plain column like `runsWithPrevious` needs no change there. Any foreign-key column added to `PracticeSessionPlay` in phase 2 (or later) must be added to `SESSION_PLAY_FIELDS_NOT_COPIED` in the same file, and to the `CopiedSessionPlayFields` type beside it, so a duplicate does not copy a reference that belongs to the original session.

## Phase 3b: timeline and bench sheet (accepted decisions)

- **Timeline.**
  - Built on the shared `session-timeline` module.
  - Shows computed start times (no live countdown) and planned versus booked minutes.
  - Clock times use the venue's timezone when the session is booked, and the viewer's timezone otherwise.
  - No break or transition rows.
- **Bench sheet.**
  - A dedicated print route `app/(print)/practice-planner/[sessionId]/print`, using `window.print()` and print CSS. No new dependencies and no server-side PDF.
  - Access follows the session detail page: admins, plus members once the session is shared. No public link (ADR-0011).
  - Layout: page 1 has the header, timeline, and one combined legend, then two drills per page.
  - A drill prints its instructions, or its description when there are no instructions.
- **Print quality.** `generateThumbnail` gains a `pixelRatio` option so stroke widths scale. Diagrams render at about 720×306 logical pixels with a pixel ratio of 3.

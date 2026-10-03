# Practice Sessions: Stations — Design

**Date:** 2026-10-03
**Status:** Draft for review
**Phase:** 2b of the practice-planner iteration. Build order: hotfix ✓ → 3a ✓ → 2a ✓ → **2b** → 3b.
**Depends on:**
- 2a ice area: `areaRect(playData.area)` is the station layout contract.
- 3a session-owned drills: each session row points at an owned copy, and the drill's area travels with it.

The accepted decisions are recorded in `2026-10-03-practice-planner-roadmap.md`. This spec makes them concrete.

## Context

A practice session is a strictly sequential list of drills:

- `PracticeSessionPlay` has `sequence`, `duration`, `instructions` and `playId`, with `@@unique([sessionId, sequence])`.
- The server requires `sequence` to be unique and consecutive from 0 (`validatePlaySequence`).
- The server also requires the sum of drill durations to be at most the session duration (`validateTotalDuration`).

Real practices often run **stations**: for example, three drills at once, each in its own zone, with players rotating. Under the sum rule, three 15-minute stations count as 45 minutes, so a 20-minute block of stations can't be saved.

3a's `duplicatePracticeSession` copies every session-play scalar through `Prisma.PracticeSessionPlayScalarFieldEnum` (minus `SESSION_PLAY_FIELDS_NOT_COPIED`). A new column is therefore copied automatically. The roadmap notes that FK columns must instead be excluded.

## Goal

A coach can mark drills as running at the same time as the drill before them. The session shows them as one station block whose length is its longest drill. A station map shows how the stations share the rink.

### Success criteria

- In the session editor, any drill after the first can be toggled with "Run as a station with the previous drill".
- Consecutive toggled drills form one station group together with the untoggled drill before them. A group holds at most 4 drills.
- A group renders as one outlined block headed "Stations · N · M min". M is the longest drill's duration.
- The session total is the sum of each block's wall time, and the server validates that total against the session duration.
- The editor warns, without blocking the save, when:
  - two stations' areas overlap;
  - a drill is larger than the booked ice segment's kind.
- The session detail view groups stations in its sidebar. When the active drill is part of a group, it shows a **station map**: one rink with each station's drawing clipped to its area, outlined, and labeled "1 · Drill name".
- Duplicate copies the grouping.
- Every existing session opens unchanged, with all drills sequential.

### Non-goals

- Rotation scheduling, assigning player groups to stations, and running clock times. Clock times are 3b.
- Moving or mirroring a drill per station. A drill's area is fixed where it was drawn; duplicate the drill to use it at the other end.
- Any change to venue segments or reservations (ADR-0007, ADR-0012).

## Approach

**A `runsWithPrevious` flag on `PracticeSessionPlay` (recommended).**

- Groups are contiguous by construction.
- `sequence` and its unique index don't change.
- Duplicate copies the flag automatically.
- One additive column.

Rejected alternatives:

- **A `PracticeSessionBlock` table.** It needs a new model and relation, rewrites of the nested writes, and a backfill. The flag expresses the same thing for contiguous groups.
- **A per-session area choice, so a drill can be placed in a slot.** The zones differ in width (75/50/75), so translating a drill distorts it, and every renderer would need a per-placement transform.

## Data model

```prisma
model PracticeSessionPlay {
  // …existing…
  /// Station grouping: true = runs at the same time as the previous drill
  /// (by sequence). Consecutive true rows form one group with the nearest
  /// preceding false row. sequence stays unique and total.
  runsWithPrevious Boolean @default(false)
}
```

Hand-written migration. The dev database is about 30 migrations behind.

```sql
-- prisma/migrations/<timestamp>_practice_session_play_runs_with_previous/migration.sql
-- Station grouping for practice sessions. Additive; existing rows stay sequential.
ALTER TABLE "practice_session_plays"
  ADD COLUMN "runsWithPrevious" BOOLEAN NOT NULL DEFAULT false;
```

It is a Boolean scalar, not an FK, so 3a's duplicate copies it with no change to `SESSION_PLAY_FIELDS_NOT_COPIED`. A test asserts this.

Server-side invariants:

- The first drill (sequence 0) has `runsWithPrevious = false`.
- No group has more than `MAX_STATIONS_PER_GROUP = 4` drills.

## Shared timeline module

`lib/utils/session-timeline.ts` is new and pure. It is used by the client, by server validation, and by 3b:

```ts
export interface TimelinePlay { sequence: number; duration: number; runsWithPrevious: boolean }
export interface StationGroup<T extends TimelinePlay> {
  index: number;          // 0-based block index
  startMinute: number;    // offset from session start
  wallMinutes: number;    // max duration in the group
  stations: T[];          // ≥1; length > 1 means a station block
}
export function groupStations<T extends TimelinePlay>(plays: T[]): StationGroup<T>[];
export function sessionWallMinutes(plays: TimelinePlay[]): number;
export function normalizeGroups<T extends TimelinePlay>(plays: T[]): T[];   // sequence = index; first flag false
export function toggleRunsWithPrevious<T extends TimelinePlay>(plays: T[], index: number): T[];
export function moveItem<T extends TimelinePlay>(plays: T[], index: number, dir: -1 | 1): T[];
export function removeItem<T extends TimelinePlay>(plays: T[], index: number): T[];
export function stationWarnings(
  groups: StationGroup<TimelinePlay & { area?: IceArea }>[],
  bookedSegmentKind: SegmentKind | null,
): { overlaps: Array<[number, number, number]>; tooBig: number[] };   // [groupIndex, a, b], sequences
```

Rules:

- **`toggleRunsWithPrevious`:**
  - It never sets the flag on index 0.
  - It refuses (returns the input unchanged) when turning the flag on would push a group past 4.
- **`moveItem`:**
  - Moving the first drill of a group moves the whole group.
  - Moving a station inside a group reorders it within the group.
  - A standalone drill hops over whole groups.
  - The result is always normalized.
- **`removeItem`:** removing the first drill of a group clears the next drill's flag, so the remaining drills stay a group and don't join the group before them.
- **`stationWarnings`:**
  - **Overlap:** two areas intersect by more than 1 ft (via `areaRect`). Full ice overlaps everything.
  - **Too big:** compared against the booked segment kind:
    - whole ice (`null`): nothing is too big;
    - `HALF`: full ice is too big;
    - `CROSS`: full ice and half ice are too big;
    - `CUSTOM`: nothing is flagged.

## Server actions

- **Validation:** extract one shared `practiceSessionPlayInputSchema`; the create and update schemas currently duplicate it. Add `runsWithPrevious: z.boolean().default(false)`.
- **`createPracticeSession` / `updatePracticeSession`:**
  - Keep `validatePlaySequence` as it is.
  - Add a group check: the first drill can't run with the previous one, and the group cap is enforced.
  - Replace `validateTotalDuration` with `sessionWallMinutes`. The error reads "Practice timeline (X min) exceeds session duration (Y min)".
  - Pass `runsWithPrevious` through the nested creates.
  - Ownership (3a's materialize) and the reservation code are unchanged.
- **Reads:** add `runsWithPrevious` to every session-play select. The plan must re-grep `practiceSessionPlay` and `plays: {` selects. Also add `segment.kind` where the segment is selected.
- **Wrappers** (new and edit) map the field.
- Overlap and too-big warnings are client-side only and never block a write.

## Components

- **PracticeSessionEditor (≤ 900 lines; put new logic in `SessionDrillList`, `SessionDrillCard` or a small hook):**
  - `PlayInSession` gains `runsWithPrevious: boolean`.
  - Every card after the first gets a "Run as a station with the previous drill" switch.
    - It is disabled (with a tooltip) when it would exceed 4.
    - It has a 44px touch target.
  - Grouped cards render inside one outlined block, "Stations · N · M min", with the warnings shown inline.
  - Move up/down and delete use the `session-timeline` helpers.
  - The duration summary uses `sessionWallMinutes`.
  - The booked segment's `kind` comes from the booking options (`venue-booking-options.ts`).
- **`StationMap.tsx` (new, client canvas):**
  - Draws the whole rink.
  - For each station: clip to its `areaRect`, call `drawAllElements`, outline the area, and add a numbered label.
  - The active station is highlighted.
  - The legend combines the stations' symbols.
  - It reuses 2a's `drawBoardScene` pieces.
- **SessionDetailView:**
  - The sidebar groups stations under a "Stations" header.
  - When the active drill is in a group, the `StationMap` renders above the thumbnail with that station highlighted.
  - Previous/Next still step through drills one at a time.
  - The fit warning shows as a chip next to the booking line.

## Error handling

- An invalid group structure, or a wall time over the session duration, returns an `ActionResult` error with Zod `details` (the existing pattern). The client prevents both before the request.
- Warnings never block.
- If a drill in a group can't be read (`playData` is null), its station renders as an empty outlined area with the existing "unreadable" message, and the map still renders.

## Testing

- **`session-timeline`** (exhaustive):
  - grouping, wall time and start minutes;
  - every `moveItem`, `toggleRunsWithPrevious`, `removeItem` and `normalizeGroups` rule, including the cap;
  - the overlap and too-big tables for each `SegmentKind`.
- **Actions (Prisma mocked):**
  - Wall-time validation: 3×15 accepted in a 20-minute session as one group, and rejected when sequential.
  - The first drill can't be grouped; the cap is enforced.
  - `runsWithPrevious` is persisted and read back; old rows read as false.
  - Duplicate copies the flag (3a's enum guard covers it, plus an explicit assertion).
- **Components (Testing Library):**
  - Toggle grouping, including disabled at the cap.
  - Block header and wall-time display.
  - Warnings.
  - Moves within and across groups.
  - The detail view shows the station map for grouped drills.
- **`StationMap`** (mocked context): one clip region per station, plus labels.
- **Migration:** applies on a migrated database (CI, ADR-0019).
- **Gates:** `bun run type-check`, `lint`, `test`, `build`.

## Risks

- **What "Total minutes" means changes**, from the sum of drills to wall time. Existing sessions are sequential, so the two numbers are equal for them.
- **Editor size.** `PracticeSessionEditor.tsx` is about 890 lines; grouping UI goes into the list and card components.
- **Rotations aren't modeled.** A coach who wants "3 groups × 8 min" writes it in the instructions for now. It is a natural 3b bench-sheet addition.

# Practice Sessions: Stations — Design

**Date:** 2026-10-03
**Status:** Implemented (2b)
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
-- prisma/migrations/20261003130000_practice_session_play_runs_with_previous/migration.sql
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
  groups: StationGroup<TimelinePlay & { area?: IceArea | null }>[],
  bookedSegmentKind: SegmentKind | null,
): { overlaps: Array<[number, number, number]>; tooBig: number[] };   // [groupIndex, a, b], sequences
```

Beyond the list above, the module exports `MAX_STATIONS_PER_GROUP`, `stationBlockLabel`, `groupRange`, `canToggleRunsWithPrevious`, `canMove`, `stationGroupError` (with `FIRST_DRILL_STATION_ERROR` and `STATION_GROUP_CAP_ERROR`), `drillFootprint`, `SEGMENT_KIND_FIT_LABELS`, `STATION_OVERLAP_TOLERANCE_FT` and `StationArea`.

Ordering: `groupStations`, `sessionWallMinutes` and `stationGroupError` sort by `sequence`, because the server does not trust a payload's array order. `normalizeGroups`, `toggleRunsWithPrevious`, `moveItem` and `removeItem` work on array order. The editor keeps array order equal to sequence order, because every edit ends in `normalizeGroups`.

Rules:

- **`toggleRunsWithPrevious`:**
  - It never sets the flag on index 0.
  - It refuses (returns the input unchanged) when turning the flag on would push a group past 4.
- **`moveItem`:**
  - Moving the first drill of a group moves the whole group.
  - Moving a station inside a group reorders it within the group.
  - Moving the second drill of a block up makes it the block's first drill, and the old first drill becomes a station.
  - Moving the last drill of a block down is a no-op. To leave the block, the coach turns off the drill's switch, so a move never silently ungroups a station.
  - A standalone drill hops over whole groups.
  - The result is always normalized, and an input that can't move is returned unchanged.
- **`removeItem`:** removing the first drill of a group clears the next drill's flag, so the remaining drills stay a group and don't join the group before them.
- **`stationWarnings`:**
  - **Unreadable drills:** `area` is `IceArea | null`. `null` means the drill's data couldn't be read, and the drill is skipped by both checks. Treating it as full ice would make it overlap every other station.
  - **Overlap:** two areas overlap only when their intersection (via `areaRect`) is wider and taller than 1 ft (`STATION_OVERLAP_TOLERANCE_FT`). Zones that only share a blue line don't overlap. Full ice overlaps everything. Overlaps can only occur inside a block.
  - **Footprint (`drillFootprint`):** a drill's area is classified by its width: wider than 100 ft (half the rink) is `full`; wider than 75 ft (a zone) is `half`; anything narrower is `zone`. Presets fall where expected: full = 200, half = 100, end zone = 75, neutral zone = 50.
  - **Too big:** compared against the booked segment kind. The check covers every drill, not only stations, because a standalone full-ice drill in a half-ice booking doesn't fit either.
    - whole ice (`null`): nothing is too big;
    - `HALF`: `full` is too big;
    - `CROSS`: `full` and `half` are too big;
    - `CUSTOM`: nothing is flagged.

## Server actions

- **Validation:** the create and update schemas already share `practiceSessionPlayItemsSchema` (array plus unique-`clientKey` refine). Its item object is extracted as the exported `practiceSessionPlayInputSchema`, which gains `runsWithPrevious: z.boolean().default(false)`.
- **`createPracticeSession` / `updatePracticeSession`:**
  - Keep `validatePlaySequence` as it is.
  - Add a group check by sequence: the first drill can't run with the previous one, and the group cap is enforced. The errors are `The first drill can't run as a station with a previous drill` and `A station block can hold at most 4 drills`.
  - Replace the sum-based duration check with wall time (`sessionWallMinutes`). The error reads `Practice timeline (X min) exceeds session duration (Y min)`.
  - These errors follow the sibling `validatePlaySequence`: `{ success: false, error }` with no Zod `details`.
  - Pass `runsWithPrevious` through the nested creates.
  - Ownership (3a's materialize) and the reservation code are unchanged.
- **`validatePlayDurations` is deleted.** It was the sum-based validator in `types/practice-planner.ts` and had no production caller. A sum-based validator exported next to a wall-time server rule would be a trap.
- **Reads:**
  - `getPracticeSessionDetail` and `getPracticeSessionForEdit` use `include`, so the column arrives without a select change; only their return mappings change.
  - `getPracticeSessionById` uses `select` and gains `runsWithPrevious: true`.
  - The list query (first thumbnail only) needs nothing.
  - `segment.kind` is added in `getPracticeSessionById`, `getPracticeSessionDetail` and `getVenueBookingOptions` (which reads it for both reservations and the segments list).
  - `getPracticeSessionForEdit` runs `normalizeGroups`, so a stored first drill with the flag set loads as a standalone drill.
- **Wrappers** (new and edit) map the field.
- Overlap and too-big warnings are client-side only and never block a write.

## Components

- **PracticeSessionEditor (≤ 900 lines; put new logic in `SessionDrillList`, `SessionDrillCard` or a small hook):**
  - `PlayInSession` gains `runsWithPrevious: boolean`.
  - Every card after the first gets a "Run as a station with the previous drill" switch.
    - It is disabled when it would exceed 4, with the tooltip `A station block holds at most 4 drills`.
    - It has a 44px touch target.
  - Grouped cards render inside one outlined block, "Stations · N · M min", with the warnings shown inline.
  - Move up/down and delete use the `session-timeline` helpers.
  - The duration summary uses `sessionWallMinutes`. The editor keeps its `Total Play Time: X minutes` and `Total play time (X min) exceeds session duration (Y min)` copy, where X is now wall time. For sequential sessions the numbers are unchanged.
  - Overlap warning: `Stations A and B overlap on the ice` (A and B are 1-based positions inside the block).
  - Fit chip on a drill: `Larger than the booked half ice` or `Larger than the booked cross ice`.
  - The booked segment's `kind` comes from the booking options (`venue-booking-options.ts`). The editor's booking types gain it as an optional field (`SegmentBookingOption.kind?`, `VenueReservationBookingOption.segmentKind?`), so a missing kind means no fit warning. These types change only for the practice editor.
- **`StationMap.tsx` (new, client canvas):**
  - Draws the whole rink.
  - For each station: clip to its `areaRect`, call `drawAllElements`, outline the area, and add a numbered label.
  - The active station is highlighted.
  - The legend combines the stations' symbols.
  - It is the pure `drawStationMap` (`lib/utils/canvas/station-map.ts`, testable with a recording context) plus `PlayLegend`. It uses `drawRink` and a clipped `drawAllElements` rather than `drawBoardScene`, which draws every element unclipped and adds a mask. The rink is drawn uncached, because the map renders once per selection.
  - Each station's label and unreadable message are clipped to that station's area, and the active station's outline is drawn last, so neighbouring outlines can't paint over it.
  - The canvas label names every station and marks the current one, for example "Station map: 1 · Breakout (current), 2 · Regroup". An empty station list renders nothing.
- **SessionDetailView:**
  - The sidebar groups stations under a "Stations" header.
  - When the active drill is in a group, the `StationMap` renders above the thumbnail with that station highlighted.
  - Previous/Next still step through drills one at a time.
  - The fit warning shows as a chip next to the booking line: `1 drill larger than the booked half ice`, or `N drills larger than the booked half ice`.

## Error handling

- An invalid group structure, or a wall time over the session duration, returns an `ActionResult` error with no `details`.
- The client prevents an invalid group structure: the switch refuses past the cap and never appears on the first drill. A wall time over the session duration is warned inline in the editor and rejected by the server, with its message shown on save. It is not blocked before the request, because `validateForm` can only show a generic message and autosave would become a silent no-op.
- Warnings never block.
- If a drill in a group can't be read (`playData` is null), its station is outlined over the whole rink with the "This play's diagram couldn't be read." message, and the map still renders. Such a drill is skipped by the overlap and fit warnings.

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

## Open questions (defaults shipped)

Three product-owner questions came up during planning. The build proceeds with these defaults.

1. **Last station moving down.** Should the last drill of a block leave the block and become standalone, or do nothing? *Default: nothing.* The coach turns off its switch instead.
2. **Unreadable drill inside a block.** Should it be skipped by the overlap and fit warnings, or treated as full ice? *Default: skipped.*
3. **Size classes for custom areas.** Is "wider than 100 ft = full ice, wider than 75 ft = half ice" the right rule, both for the fit warning and for "too big for cross ice"? *Default: yes.*

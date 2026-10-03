# Practice Sessions: Stations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a coach mark drills as running at the same time as the drill before them. Those drills form a station block whose length is its longest drill. The server validates the session's wall time instead of the sum of its drills. The editor warns about overlapping or oversized stations. The session page shows a station map: one rink, with each station clipped to its own area.

**Architecture:** `PracticeSessionPlay` gains one additive Boolean column, `runsWithPrevious`, added by a hand-written migration. A new pure module, `lib/utils/session-timeline.ts`, owns:
- grouping and wall time;
- the server's group check;
- the editor's move, toggle and remove rules;
- the advisory warnings.

The actions, the edit query, the editor list and the detail view all go through it. The editor stays inside its 900-line budget because it only calls the timeline helpers. The grouping UI lives in `SessionDrillList` and `SessionDrillCard`. A pure canvas function, `drawStationMap`, draws the map, and a thin `StationMap` component hosts it.

**Tech Stack:** TypeScript (strict), Next.js 16 App Router, React 19, MUI v7, Prisma 7 (PostgreSQL), Zod v4, Vitest 4 + Testing Library (jsdom), Bun.

**Spec:** `docs/superpowers/specs/2026-10-03-practice-session-stations-design.md` (accepted decisions: `docs/superpowers/specs/2026-10-03-practice-planner-roadmap.md`, "Phase 2b").

## Global Constraints

- **Base.** Branch `feat/practice-stations` is cut from `main`. `main` already contains phase 1, 3a (#373), the 3a follow-ups (#375) and 2a (#376). Line numbers in this plan are taken at commit `71e1523`. If a line has shifted, find the edit by its quoted anchor text.
- Use `bun` for everything: `bun run test <file>`, `bun run type-check`, `bun run lint`, `bun run build`. Never use npm or yarn. Never use `git stash`.
- **The migration is hand-written:** `prisma/migrations/20261003130000_practice_session_play_runs_with_previous/migration.sql`. Its folder sorts after the latest one, `20261003120000_session_owned_plays`.
  - The dev database is about 30 migrations behind. Never run `bun run db:migrate`, `db:push` or `db:migrate:reset` against it.
  - `bun run db:generate` is fine, because it only generates the client.
  - CI applies migrations with `bun run db:migrate:deploy` (ADR-0019).
- **ADRs** (from `bun run adr:explain` on the touched paths):
  - **0002:** mutations are Server Actions returning `ActionResult`. `lib/utils/session-timeline.ts` is plain shared code, with no `"use server"`.
  - **0003:** Prisma only; no raw SQL in TypeScript (`bun run check:raw-sql`). The migration `.sql` file is the only SQL.
  - **0004:** the UI is MUI.
  - **0007:** venue reservations and booking logic are unchanged. The segment's `kind` is only read.
  - **0012:** segment geometry is display-only. The fit check uses `SegmentKind` alone, never segment geometry.
  - **0005:** Bun toolchain.
  - **0019:** type-check, lint and the full suite gate the PR against a migrated database.
- **`MAX_STATIONS_PER_GROUP = 4`.**
- **Copy, verbatim:**
  - switch label: `Run as a station with the previous drill`
  - block header: `Stations · N · M min` (U+00B7 middle dot, with a space on each side), e.g. `Stations · 3 · 15 min`
  - server wall-time error: `Practice timeline (X min) exceeds session duration (Y min)`
  - server first-drill error: `The first drill can't run as a station with a previous drill`
  - server cap error: `A station block can hold at most 4 drills`
  - disabled-switch tooltip: `A station block holds at most 4 drills`
  - overlap warning: `Stations A and B overlap on the ice` (A and B are 1-based positions inside the block)
  - editor fit chip: `Larger than the booked half ice` or `Larger than the booked cross ice`
  - detail-view fit chip: `1 drill larger than the booked half ice`, or `N drills larger than the booked half ice`
  - station-map label: `1 · Drill name`
  - unreadable drill on the map: `PLAY_DATA_UNREADABLE_MESSAGE` (`This play's diagram couldn't be read.`, `lib/utils/play-data.ts:288`)
- **Warnings never block a save.** Overlap and fit warnings exist only on the client.
- **`components/features/practice-planner/PracticeSessionEditor.tsx` must stay at or under 900 lines.** It was 893 at planning time. From Task 4 on, a Vitest test enforces this.
- Zod v4 (`z.object` strips unknown keys; errors are in `.issues`).
- IDs that pass through a Zod schema in tests must satisfy `z.string().cuid()`. That means they start with `c`, have at least 9 characters, and contain no `-`. Example: `csessionxxxxxxxxxxxxxxxxx`.
- Never use `component={Link}` from a Server Component. Every UI file touched here is already `"use client"`.
- Commit messages are conventional commits ending with the line
  `Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX`.
- At the end of every task, `bun run type-check` and that task's own Vitest files must be green.

## Spec deviations (decided during planning — fold into the spec in Task 8)

1. **The shared play schema already exists.**
   - The spec says the create and update schemas duplicate the play item, but `lib/utils/validation.ts:1349` already shares `practiceSessionPlayItemsSchema` (array + unique-`clientKey` refine).
   - Task 1 extracts its item object as an exported `practiceSessionPlayInputSchema` and adds `runsWithPrevious: z.boolean().default(false)` there.
2. **Group errors carry no `details`.**
   - The spec's error section says to return "Zod `details` (the existing pattern)". The sibling check `validatePlaySequence` (`lib/actions/practice-sessions.ts:465-471`) returns `{ success: false, error }` with no `details`.
   - The group check and the wall-time check follow that sibling. The error copy is listed in Global Constraints and exported from `session-timeline.ts` as `FIRST_DRILL_STATION_ERROR` and `STATION_GROUP_CAP_ERROR`.
3. **The server groups by `sequence`; the editor's helpers use array order.**
   - `groupStations`, `sessionWallMinutes` and `stationGroupError` sort by `sequence`, because a payload's array order is not trusted.
   - `normalizeGroups`, `toggleRunsWithPrevious`, `moveItem` and `removeItem` work on array order. The editor keeps array order equal to sequence order, because every edit ends in `normalizeGroups`.
4. **Extra exports** beyond the spec's list, which the UI needs:
   - `MAX_STATIONS_PER_GROUP`
   - `stationBlockLabel`
   - `groupRange`
   - `canToggleRunsWithPrevious`
   - `canMove`
   - `stationGroupError` with its two error constants
   - `drillFootprint`
   - `SEGMENT_KIND_FIT_LABELS`
   - `STATION_OVERLAP_TOLERANCE_FT`
   - `StationArea`
5. **`moveItem` edge rules the spec leaves open:**
   - The second drill of a block moving up becomes the block's first drill, and the old first drill becomes a station.
   - The last drill of a block moving down does nothing; to leave the block, the coach turns off its switch. (PO question 1.)
6. **What counts as "full ice" and "half ice" for a custom area.** A drill's footprint is classified by its area's width:
   - wider than 100 ft (half the rink) is `full`;
   - wider than 75 ft (a zone) is `half`;
   - anything narrower is `zone`.

   Presets fall where expected: full = 200, half = 100, end zone = 75, neutral zone = 50. (PO question 3.)
7. **Overlap means the intersection is more than 1 ft in both directions.** Two areas overlap only when their intersection rectangle is wider *and* taller than 1 ft (`STATION_OVERLAP_TOLERANCE_FT`). Zones that only share a blue line don't overlap.
8. **Unreadable drills raise no warnings.**
   - `stationWarnings` takes `area?: IceArea | null`. `null` means the drill's data couldn't be read, so it is skipped by both checks. Treating it as full ice would make it overlap every other station.
   - On the map, an unreadable station is outlined over the whole rink, with the unreadable message. (PO question 2.)
9. **The fit check covers every drill, not only stations.** A standalone full-ice drill in a half-ice booking doesn't fit either. `stationWarnings` scans every group, but overlaps can only occur inside a block.
10. **"The client prevents both before the request":**
    - An invalid group structure is impossible to build: the switch refuses past the cap and never appears on the first drill.
    - Wall time over the session duration keeps today's inline warning, and the server's message is shown on save. A new pre-save block was not added for three reasons:
      - `validateForm` can only show the generic "Please fix the validation errors";
      - autosave would turn into a silent no-op;
      - the editor has 7 lines of headroom.
11. **The client keeps its existing summary copy.** It still reads `Total Play Time: X minutes` and `Total play time (X min) exceeds session duration (Y min)`, but X is now wall time. For sequential sessions the numbers are unchanged, so the characterization tests stay as they are.
12. **`StationMap` uses `drawRink` and a clipped `drawAllElements`, not `drawBoardScene`.** `drawBoardScene` draws every element unclipped and adds a mask. The drawing is a pure `drawStationMap` in `lib/utils/canvas/station-map.ts`, which can be tested with a recording context. The rink is drawn uncached, because the map renders once per selection.
13. **`validatePlayDurations` is deleted.** It is the sum-based validator in `types/practice-planner.ts:247-271` and has no production caller. Its two `describe` blocks in `__tests__/types/practice-planner.test.ts` go with it. A sum-based validator exported next to a wall-time server rule would be a trap. Switching it to wall time would make `types/` import `lib/utils/session-timeline.ts`, which imports back into `types/`.
14. **Which reads change:**
    - `getPracticeSessionDetail` and `getPracticeSessionForEdit` use `include`, so the new column arrives without a select change. Only their return mappings change.
    - `getPracticeSessionById` uses `select` and gains `runsWithPrevious: true`.
    - The list query (`practice-session-queries.ts:48`, first thumbnail only) needs nothing.
    - `segment.kind` is added in four places: `getPracticeSessionById`, `getPracticeSessionDetail`, and `getVenueBookingOptions`, which reads it for both reservations and the segments list.
15. **`getPracticeSessionForEdit` normalizes the station flags as well as the sequences.** It runs `normalizeGroups`, so a stored first drill with the flag set loads as a standalone drill.
16. **The editor's booking types gain an optional kind.** `SegmentBookingOption` is `{ id, name, kind?: SegmentKind }`, and `VenueReservationBookingOption` gains `segmentKind?: SegmentKind | null`. They are optional so the existing editor test fixtures still type-check. A missing kind means "no fit warning".
    - These types change only for the practice editor.
    - `GameForm`, `GameScheduler` and `SeasonDetail` keep their own `{ id, name }` shapes.

## Product-owner questions (the plan proceeds with the stated default)

1. **Last station moving down.** When the last drill of a station block is moved down, should it leave the block and become standalone, or do nothing? *Default: nothing.* The coach turns off its switch instead, so a move never silently ungroups a station.
2. **Unreadable drill inside a block.** Should a station whose diagram can't be read be skipped by the overlap and fit warnings, or treated as full ice? *Default: skipped.* If treated as full ice, it would warn against every other station.
3. **Size classes for custom areas.** Is "wider than 100 ft = full ice, wider than 75 ft = half ice" the right rule for a custom area, both for the fit warning and for "too big for cross ice"? *Default: yes.*

## Review Focus

1. **Existing sequential sessions must open, total and save exactly as before.**
   - With every flag false, wall time equals the sum. The server accepts 3×15 drills in a 45-minute session and reads old rows as `false`.
   - The editor's characterization tests pass with no change to their assertions.
   - Owned by Task 2 (`sessionWallMinutes` equals the sum when nothing is grouped), Task 3 (`keeps an existing sequential session valid…`, old-client payload without the field) and Task 4 (the characterization suite run unchanged).
2. **Removing the first drill of a block.**
   - The next drill must become the head of what is left of the block. It must not join the block or drill before it.
   - Owned by Task 2 (`removeItem` "keeps the rest of a block together after a preceding block") and Task 4 (editor test "keeps the rest of a block together when its first drill is deleted").
3. **Moving across blocks.**
   - A standalone drill hops over a whole block.
   - The first drill of a block moves the whole block.
   - A station moves only inside its block and stops at the block's edge.
   - Owned by Task 2 (`moveItem` table) and Task 4 (three editor move tests).
4. **Wall time against the sum at the server boundary.** The server must group by `sequence`, not by payload order.
   - 3×15 grouped in a 20-minute session is accepted, and the same drills sequential are rejected with the new message.
   - A block sent last-first is still accepted.
   - A first drill that is flagged by sequence is rejected even when it isn't first in the array.
   - Owned by Task 3 (`practice-sessions-stations.test.ts`).
5. **The flag survives every write path without breaking 3a ownership.**
   - Create and update persist the flag, and duplicate copies it.
   - 3a's clone mapping, its orphan-cleanup order and its I2 guarantee stay intact.
   - Owned by Task 3:
     - the `practice-sessions-ownership.test.ts` expectation gains `runsWithPrevious: false` and must otherwise pass unchanged;
     - the duplicate test "copies each drill's station flag";
     - the stations test's persist assertions for create and update.

---

### Task 1: Column, migration, and shared play input schema

**Files:**
- Modify: `prisma/schema.prisma` (`PracticeSessionPlay` :1636-1661; insert after `instructions` :1640)
- Create: `prisma/migrations/20261003130000_practice_session_play_runs_with_previous/migration.sql`
- Modify: `lib/utils/validation.ts` (`practiceSessionPlayItemsSchema` :1347-1362)
- Test: `__tests__/lib/utils/validation-practice-session.test.ts` (create)

**Interfaces:**
- Produces (Prisma client):
  - `PracticeSessionPlay.runsWithPrevious: boolean`, with database default `false`;
  - `Prisma.PracticeSessionPlayScalarFieldEnum.runsWithPrevious`;
  - `Prisma.PracticeSessionPlayCreateManyInput.runsWithPrevious?: boolean`.
- Produces (`lib/utils/validation.ts`):
  - `export const practiceSessionPlayInputSchema`, a `z.object` with `{ playId, clientKey, sequence, duration, instructions, runsWithPrevious: z.boolean().default(false) }`.
  - `createPracticeSessionSchema` and `updatePracticeSessionSchema` use it as their `plays` item. On output each item has `runsWithPrevious: boolean`; on input the field is optional (`CreatePracticeSessionInput` and `UpdatePracticeSessionInput` are `z.input`).

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/utils/validation-practice-session.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
    createPracticeSessionSchema,
    practiceSessionPlayInputSchema,
    updatePracticeSessionSchema,
} from "@/lib/utils/validation";

const TEAM = "cteamxxxxxxxxxxxxxxxxxxxx";
const SESSION = "csessionxxxxxxxxxxxxxxxxx";
const PLAY = "cplayxxxxxxxxxxxxxxxxxxxx";

function item(overrides: Record<string, unknown> = {}) {
    return { playId: PLAY, clientKey: "k1", sequence: 0, duration: 15, instructions: "", ...overrides };
}

const session = { title: "Tuesday", date: "2026-04-07T22:00:00.000Z", duration: 20, teamId: TEAM };

describe("practiceSessionPlayInputSchema (2b)", () => {
    it("defaults runsWithPrevious to false, so older clients keep sequential drills", () => {
        expect(practiceSessionPlayInputSchema.parse(item()).runsWithPrevious).toBe(false);
    });

    it("keeps an explicit station flag", () => {
        expect(practiceSessionPlayInputSchema.parse(item({ runsWithPrevious: true })).runsWithPrevious).toBe(true);
    });

    it("rejects a non-boolean flag", () => {
        expect(practiceSessionPlayInputSchema.safeParse(item({ runsWithPrevious: "yes" })).success).toBe(false);
    });

    it("is the play item of both the create and the update payloads", () => {
        const plays = [item(), item({ clientKey: "k2", sequence: 1, runsWithPrevious: true })];
        const created = createPracticeSessionSchema.parse({ ...session, plays });
        const updated = updatePracticeSessionSchema.parse({ ...session, id: SESSION, plays });
        expect(created.plays.map((play) => play.runsWithPrevious)).toEqual([false, true]);
        expect(updated.plays.map((play) => play.runsWithPrevious)).toEqual([false, true]);
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test __tests__/lib/utils/validation-practice-session.test.ts`
Expected: FAIL. `practiceSessionPlayInputSchema` is undefined: "Cannot read properties of undefined (reading 'parse')".

- [ ] **Step 3: Add the column to the schema**

In `prisma/schema.prisma`, `model PracticeSessionPlay`, replace

```prisma
  instructions String? // Specific instructions for this instance
  createdAt    DateTime @default(now())
```

with

```prisma
  instructions String? // Specific instructions for this instance
  /// Station grouping: true = runs at the same time as the previous drill
  /// (by sequence). Consecutive true rows form one group with the nearest
  /// preceding false row. sequence stays unique and total.
  runsWithPrevious Boolean @default(false)
  createdAt    DateTime @default(now())
```

- [ ] **Step 4: Write the migration**

Create `prisma/migrations/20261003130000_practice_session_play_runs_with_previous/migration.sql`:

```sql
-- Station grouping for practice sessions (practice planner 2b).
-- Hand-written and additive: the dev database is behind on migrations, so
-- `migrate dev` cannot be used. Existing rows stay sequential (false).
ALTER TABLE "practice_session_plays"
  ADD COLUMN "runsWithPrevious" BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 5: Export the shared play item schema with the flag**

In `lib/utils/validation.ts`, replace

```ts
// One drill in a practice-session save. clientKey is the editor's stable
// per-card key (PlayInSession.id); the save returns clientKey → owned playId.
const practiceSessionPlayItemsSchema = z
  .array(z.object({
    playId: z.string().cuid("Invalid play ID format"),
    clientKey: z.string().min(1, "Drill key is required").max(64, "Drill key is too long"),
    sequence: z.number().int().min(0),
    duration: z.number().int().min(1, "Play duration must be at least 1 minute").max(300, "Play duration must be less than 300 minutes"),
    instructions: optionalSanitizedString(2000),
  }))
  .refine(
```

with

```ts
// One drill in a practice-session save. clientKey is the editor's stable
// per-card key (PlayInSession.id); the save returns clientKey → owned playId.
// runsWithPrevious (2b): the drill runs at the same time as the previous drill
// by sequence (a station). Absent means sequential, so older clients still work.
export const practiceSessionPlayInputSchema = z.object({
  playId: z.string().cuid("Invalid play ID format"),
  clientKey: z.string().min(1, "Drill key is required").max(64, "Drill key is too long"),
  sequence: z.number().int().min(0),
  duration: z.number().int().min(1, "Play duration must be at least 1 minute").max(300, "Play duration must be less than 300 minutes"),
  instructions: optionalSanitizedString(2000),
  runsWithPrevious: z.boolean().default(false),
});

const practiceSessionPlayItemsSchema = z
  .array(practiceSessionPlayInputSchema)
  .refine(
```

The `.refine(…)`, `.optional()` and `.default([])` after it stay as they are.

- [ ] **Step 6: Validate, generate, and cross-check against Prisma's own diff**

Run: `bunx prisma validate && bun run db:generate`
Expected: "The schema … is valid", and the client generates.

Run:

```bash
OLD_SCHEMA="$(mktemp).prisma"
git show HEAD:prisma/schema.prisma > "$OLD_SCHEMA"
bunx prisma migrate diff --from-schema "$OLD_SCHEMA" --to-schema prisma/schema.prisma --script
```

Expected: a single `ALTER TABLE "practice_session_plays" ADD COLUMN "runsWithPrevious" BOOLEAN NOT NULL DEFAULT false;`. In 3a's planning environment this command printed nothing and exited 0. If it does the same here, say so in the commit body and rely on CI's `db:migrate:deploy` (ADR-0019).

- [ ] **Step 7: Run the test, type-check, and the practice-planner suites**

Run: `bun run test __tests__/lib/utils/validation-practice-session.test.ts`
Expected: PASS (4 tests).

Run: `bun run type-check && bun run test __tests__/lib/actions __tests__/lib/services __tests__/components/features/practice-planner`
Expected: PASS. Two facts keep the rest green:
- The new column has a database default, and no create passes it yet.
- 3a's duplicate guard (`__tests__/lib/actions/practice-session-drills.test.ts:177-188`) builds its fixture from `Prisma.PracticeSessionPlayScalarFieldEnum`. It now includes `runsWithPrevious` and passes without any edit, which is the guard doing its job.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261003130000_practice_session_play_runs_with_previous lib/utils/validation.ts __tests__/lib/utils/validation-practice-session.test.ts
git commit -m "feat(practice-planner): runsWithPrevious column and shared session-play input schema

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 2: `session-timeline` — grouping, wall time, and the editor's list rules

**Files:**
- Create: `lib/utils/session-timeline.ts`
- Test: `__tests__/lib/utils/session-timeline.test.ts` (create)

**Interfaces:**
- Consumes: nothing; the module is pure.
- Produces (`lib/utils/session-timeline.ts`):

| Export | Signature or value | Notes |
|---|---|---|
| `MAX_STATIONS_PER_GROUP` | `4` | |
| `FIRST_DRILL_STATION_ERROR` | `"The first drill can't run as a station with a previous drill"` | |
| `STATION_GROUP_CAP_ERROR` | `"A station block can hold at most 4 drills"` | |
| `TimelinePlay` | `interface { sequence: number; duration: number; runsWithPrevious: boolean }` | |
| `StationGroup<T extends TimelinePlay>` | `interface { index: number; startMinute: number; wallMinutes: number; stations: T[] }` | `stations` holds the caller's own objects, in sequence order |
| `stationBlockLabel` | `(count: number, minutes: number) => string` | returns `"Stations · 3 · 15 min"` |
| `groupStations` | `<T extends TimelinePlay>(plays: readonly T[]) => StationGroup<T>[]` | sorts by sequence |
| `sessionWallMinutes` | `(plays: readonly TimelinePlay[]) => number` | |
| `stationGroupError` | `(plays: readonly TimelinePlay[]) => string \| null` | by sequence |
| `normalizeGroups` | `<T extends TimelinePlay>(plays: readonly T[]) => T[]` | sequence = index; first flag false; keeps unchanged objects |
| `groupRange` | `(plays: readonly TimelinePlay[], index: number) => { start: number; end: number }` | half-open range of the block holding `index`, by array position |
| `canToggleRunsWithPrevious` | `(plays: readonly TimelinePlay[], index: number) => boolean` | |
| `toggleRunsWithPrevious` | `<T extends TimelinePlay>(plays: T[], index: number) => T[]` | returns `plays` itself when refused |
| `moveItem` | `<T extends TimelinePlay>(plays: T[], index: number, dir: -1 \| 1) => T[]` | returns `plays` itself when nothing moves |
| `canMove` | `(plays: TimelinePlay[], index: number, dir: -1 \| 1) => boolean` | |
| `removeItem` | `<T extends TimelinePlay>(plays: T[], index: number) => T[]` | returns `plays` itself for an out-of-range index |

  `stationWarnings` and its helpers are added to this module in Task 5.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/lib/utils/session-timeline.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
    FIRST_DRILL_STATION_ERROR,
    MAX_STATIONS_PER_GROUP,
    STATION_GROUP_CAP_ERROR,
    canMove,
    canToggleRunsWithPrevious,
    groupRange,
    groupStations,
    moveItem,
    normalizeGroups,
    removeItem,
    sessionWallMinutes,
    stationBlockLabel,
    stationGroupError,
    toggleRunsWithPrevious,
    type TimelinePlay,
} from "@/lib/utils/session-timeline";

type Card = TimelinePlay & { id: string };

/**
 * Cards from a compact spec: "a b+ c+ d" is a, then b and c running with the
 * drill before them (one block of three), then d on its own. Sequence is the
 * position; durations default to 10.
 */
function cards(spec: string, durations: number[] = []): Card[] {
    return spec.split(" ").map((token, sequence) => ({
        id: token.replace("+", ""),
        sequence,
        duration: durations[sequence] ?? 10,
        runsWithPrevious: token.endsWith("+"),
    }));
}

/** The inverse of `cards`, ignoring durations. */
function show(plays: Card[]): string {
    return plays.map((play) => `${play.id}${play.runsWithPrevious ? "+" : ""}`).join(" ");
}

function expectNormalized(plays: Card[]) {
    expect(plays.map((play) => play.sequence)).toEqual(plays.map((_, index) => index));
    expect(plays[0]?.runsWithPrevious ?? false).toBe(false);
}

describe("stationBlockLabel", () => {
    it("formats the block header", () => {
        expect(stationBlockLabel(3, 15)).toBe("Stations · 3 · 15 min");
    });
});

describe("groupStations", () => {
    it("returns no groups for no drills", () => {
        expect(groupStations([])).toEqual([]);
    });

    it("gives every unflagged drill its own group with cumulative start minutes", () => {
        const groups = groupStations(cards("a b c", [10, 15, 5]));
        expect(groups.map((g) => [g.index, g.startMinute, g.wallMinutes, g.stations.length])).toEqual([
            [0, 0, 10, 1],
            [1, 10, 15, 1],
            [2, 25, 5, 1],
        ]);
    });

    it("times a station block by its longest drill", () => {
        const groups = groupStations(cards("a b+ c+ d", [10, 15, 5, 8]));
        expect(groups.map((g) => [g.startMinute, g.wallMinutes, g.stations.map((s) => s.id)])).toEqual([
            [0, 15, ["a", "b", "c"]],
            [15, 8, ["d"]],
        ]);
    });

    it("orders by sequence, not by array position", () => {
        const [a, b, c] = cards("a b+ c");
        expect(groupStations([c, b, a]).map((g) => g.stations.map((s) => s.id))).toEqual([["a", "b"], ["c"]]);
    });

    it("returns the caller's own objects", () => {
        const plays = cards("a b+");
        expect(groupStations(plays)[0].stations[1]).toBe(plays[1]);
    });

    it("starts a group at a flagged first drill instead of dropping it", () => {
        expect(groupStations(cards("a+ b+")).map((g) => g.stations.length)).toEqual([2]);
    });
});

describe("sessionWallMinutes", () => {
    it("equals the sum of durations when nothing is grouped (existing sessions)", () => {
        expect(sessionWallMinutes(cards("a b c", [15, 15, 15]))).toBe(45);
    });

    it("counts a station block once, for its longest drill", () => {
        expect(sessionWallMinutes(cards("a b+ c+", [15, 15, 15]))).toBe(15);
    });

    it("adds blocks and standalone drills", () => {
        expect(sessionWallMinutes(cards("a b c+ d", [10, 15, 20, 5]))).toBe(35);
    });
});

describe("stationGroupError", () => {
    it("accepts sequential drills and blocks of up to four", () => {
        expect(stationGroupError(cards("a b c"))).toBeNull();
        expect(stationGroupError(cards("a b+ c+ d+ e"))).toBeNull();
        expect(MAX_STATIONS_PER_GROUP).toBe(4);
    });

    it("rejects a first drill that runs with a previous one", () => {
        expect(stationGroupError(cards("a+ b"))).toBe(FIRST_DRILL_STATION_ERROR);
    });

    it("finds the first drill by sequence, not by array position", () => {
        const [a, b] = cards("a b+");
        expect(stationGroupError([b, a])).toBeNull();
        expect(stationGroupError([{ ...a, runsWithPrevious: true }, { ...b, runsWithPrevious: false }])).toBe(FIRST_DRILL_STATION_ERROR);
    });

    it("rejects a block of five", () => {
        expect(stationGroupError(cards("a b+ c+ d+ e+"))).toBe(STATION_GROUP_CAP_ERROR);
    });

    it("accepts no drills", () => {
        expect(stationGroupError([])).toBeNull();
    });
});

describe("normalizeGroups", () => {
    it("renumbers sequences to positions and clears the first drill's flag", () => {
        const plays = cards("a+ b+ c").map((play, index) => ({ ...play, sequence: index * 2 + 1 }));
        const normalized = normalizeGroups(plays);
        expectNormalized(normalized);
        expect(show(normalized)).toBe("a b+ c");
    });

    it("keeps an already-normal drill as the same object", () => {
        const plays = cards("a b+");
        const normalized = normalizeGroups(plays);
        expect(normalized[0]).toBe(plays[0]);
        expect(normalized[1]).toBe(plays[1]);
    });
});

describe("groupRange", () => {
    it("finds the block around any of its drills", () => {
        const plays = cards("x a b+ c+ y");
        expect(groupRange(plays, 0)).toEqual({ start: 0, end: 1 });
        expect(groupRange(plays, 1)).toEqual({ start: 1, end: 4 });
        expect(groupRange(plays, 3)).toEqual({ start: 1, end: 4 });
        expect(groupRange(plays, 4)).toEqual({ start: 4, end: 5 });
    });
});

describe("toggleRunsWithPrevious", () => {
    it("never flags the first drill", () => {
        const plays = cards("a b");
        expect(toggleRunsWithPrevious(plays, 0)).toBe(plays);
        expect(canToggleRunsWithPrevious(plays, 0)).toBe(false);
    });

    it("joins a drill to the drill before it", () => {
        expect(show(toggleRunsWithPrevious(cards("a b c"), 1))).toBe("a b+ c");
    });

    it("brings the drill's own stations along when it joins", () => {
        expect(show(toggleRunsWithPrevious(cards("a b c+"), 1))).toBe("a b+ c+");
    });

    it("splits a block when a station is turned off; later stations stay with it", () => {
        const toggled = toggleRunsWithPrevious(cards("a b+ c+"), 1);
        expect(show(toggled)).toBe("a b c+");
        expectNormalized(toggled);
    });

    it("refuses to make a fifth station, returning the input unchanged", () => {
        const four = cards("a b+ c+ d+ e");
        expect(toggleRunsWithPrevious(four, 4)).toBe(four);
        expect(canToggleRunsWithPrevious(four, 4)).toBe(false);
    });

    it("refuses to merge two blocks past the cap", () => {
        const plays = cards("a b+ c+ d e+");
        expect(toggleRunsWithPrevious(plays, 3)).toBe(plays);
    });

    it("always allows turning a station off", () => {
        expect(canToggleRunsWithPrevious(cards("a b+ c+ d+"), 3)).toBe(true);
    });

    it("ignores an index past the end", () => {
        const plays = cards("a b");
        expect(toggleRunsWithPrevious(plays, 5)).toBe(plays);
    });
});

describe("moveItem", () => {
    it("swaps two standalone drills", () => {
        const moved = moveItem(cards("a b c"), 0, 1);
        expect(show(moved)).toBe("b a c");
        expectNormalized(moved);
    });

    it("hops a standalone drill down over a whole block", () => {
        expect(show(moveItem(cards("s a b+"), 0, 1))).toBe("a b+ s");
    });

    it("hops a standalone drill up over a whole block", () => {
        expect(show(moveItem(cards("a b+ s"), 2, -1))).toBe("s a b+");
    });

    it("moves a whole block when its first drill moves", () => {
        expect(show(moveItem(cards("x a b+"), 1, -1))).toBe("a b+ x");
        expect(show(moveItem(cards("a b+ x"), 0, 1))).toBe("x a b+");
    });

    it("hops a block over another block", () => {
        expect(show(moveItem(cards("a b+ c d+ e+"), 0, 1))).toBe("c d+ e+ a b+");
    });

    it("reorders a station within its block", () => {
        expect(show(moveItem(cards("a b+ c+"), 2, -1))).toBe("a c+ b+");
    });

    it("makes the second drill the block's first when it moves up", () => {
        const moved = moveItem(cards("x a b+"), 2, -1);
        expect(show(moved)).toBe("x b a+");
        expectNormalized(moved);
    });

    it("does nothing when the last station of a block moves down", () => {
        const plays = cards("a b+ s");
        expect(moveItem(plays, 1, 1)).toBe(plays);
        expect(canMove(plays, 1, 1)).toBe(false);
    });

    it("does nothing past either end of the list", () => {
        const plays = cards("a b+ c");
        expect(moveItem(plays, 0, -1)).toBe(plays);
        expect(moveItem(plays, 2, 1)).toBe(plays);
        expect(moveItem(plays, 9, 1)).toBe(plays);
        expect(canMove(plays, 0, 1)).toBe(true);
    });
});

describe("removeItem", () => {
    it("removes a standalone drill and renumbers", () => {
        const removed = removeItem(cards("a b c"), 1);
        expect(show(removed)).toBe("a c");
        expectNormalized(removed);
    });

    it("makes the next station the head when a block's first drill is removed", () => {
        expect(show(removeItem(cards("a b+ c+"), 0))).toBe("b c+");
    });

    it("keeps the rest of a block together after a preceding block", () => {
        expect(show(removeItem(cards("x y+ a b+ c+"), 2))).toBe("x y+ b c+");
    });

    it("removes a station from the middle of a block", () => {
        expect(show(removeItem(cards("a b+ c+"), 1))).toBe("a c+");
    });

    it("leaves a following standalone drill alone", () => {
        expect(show(removeItem(cards("a b c"), 0))).toBe("b c");
    });

    it("returns the input for an index that isn't there", () => {
        const plays = cards("a b");
        expect(removeItem(plays, -1)).toBe(plays);
        expect(removeItem(plays, 2)).toBe(plays);
    });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test __tests__/lib/utils/session-timeline.test.ts`
Expected: FAIL. The module `@/lib/utils/session-timeline` can't be resolved.

- [ ] **Step 3: Write the module**

Create `lib/utils/session-timeline.ts`:

```ts
/**
 * Practice-session timeline (practice planner 2b): station groups, wall time,
 * the server's group check, and the editor's reorder / toggle / remove rules.
 * Pure, so the session editor, the session actions, the detail view and 3b's
 * timeline all share it.
 *
 * A drill with `runsWithPrevious` runs at the same time as the drill before it
 * (by sequence). Consecutive flagged drills form one group with the nearest
 * preceding unflagged drill. A group lasts as long as its longest drill.
 *
 * `groupStations`, `sessionWallMinutes` and `stationGroupError` order by
 * `sequence`, because a payload's array order is not trusted. The list helpers
 * (`normalizeGroups`, `toggleRunsWithPrevious`, `moveItem`, `removeItem`) work
 * on array order, which the editor keeps equal to sequence order: every edit
 * ends in `normalizeGroups`.
 */

/** The most drills one station group may hold. */
export const MAX_STATIONS_PER_GROUP = 4;

export const FIRST_DRILL_STATION_ERROR = "The first drill can't run as a station with a previous drill";
export const STATION_GROUP_CAP_ERROR = `A station block can hold at most ${MAX_STATIONS_PER_GROUP} drills`;

export interface TimelinePlay {
    sequence: number;
    duration: number;
    runsWithPrevious: boolean;
}

export interface StationGroup<T extends TimelinePlay> {
    /** 0-based block index */
    index: number;
    /** Offset from the session start, in minutes */
    startMinute: number;
    /** The group's longest drill, in minutes */
    wallMinutes: number;
    /** At least one drill, in sequence order (the caller's objects); more than one is a station block */
    stations: T[];
}

/** Header of a station block: "Stations · 3 · 15 min". */
export function stationBlockLabel(count: number, minutes: number): string {
    return `Stations · ${count} · ${minutes} min`;
}

function bySequence<T extends TimelinePlay>(plays: readonly T[]): T[] {
    return [...plays].sort((a, b) => a.sequence - b.sequence);
}

/**
 * Groups drills by sequence. A flagged first drill (bad stored data) starts a
 * group rather than being dropped; `stationGroupError` rejects it on save.
 */
export function groupStations<T extends TimelinePlay>(plays: readonly T[]): StationGroup<T>[] {
    const groups: StationGroup<T>[] = [];
    for (const play of bySequence(plays)) {
        const current = groups[groups.length - 1];
        if (current && play.runsWithPrevious) {
            current.stations.push(play);
            current.wallMinutes = Math.max(current.wallMinutes, play.duration);
        } else {
            const startMinute = current ? current.startMinute + current.wallMinutes : 0;
            groups.push({ index: groups.length, startMinute, wallMinutes: play.duration, stations: [play] });
        }
    }
    return groups;
}

/** The session's planned length: each group counts once, for its longest drill. */
export function sessionWallMinutes(plays: readonly TimelinePlay[]): number {
    return groupStations(plays).reduce((total, group) => total + group.wallMinutes, 0);
}

/** The server's group check: the first drill runs on its own, and no group passes the cap. */
export function stationGroupError(plays: readonly TimelinePlay[]): string | null {
    const groups = groupStations(plays);
    if (groups[0]?.stations[0].runsWithPrevious) return FIRST_DRILL_STATION_ERROR;
    return groups.some((group) => group.stations.length > MAX_STATIONS_PER_GROUP)
        ? STATION_GROUP_CAP_ERROR
        : null;
}

/** Sequence = position, and the first drill never runs with a previous one. Unchanged drills keep their object. */
export function normalizeGroups<T extends TimelinePlay>(plays: readonly T[]): T[] {
    return plays.map((play, index) => {
        const runsWithPrevious = index === 0 ? false : play.runsWithPrevious;
        return play.sequence === index && play.runsWithPrevious === runsWithPrevious
            ? play
            : { ...play, sequence: index, runsWithPrevious };
    });
}

/** The half-open range [start, end) of the block holding `index`, by array position. */
export function groupRange(plays: readonly TimelinePlay[], index: number): { start: number; end: number } {
    let start = index;
    while (start > 0 && plays[start].runsWithPrevious) start--;
    let end = index + 1;
    while (end < plays.length && plays[end].runsWithPrevious) end++;
    return { start, end };
}

/**
 * Whether the drill at `index` may flip its flag. Turning it off is always
 * allowed. Turning it on merges its block into the block before it, so the
 * two together must fit the cap.
 */
export function canToggleRunsWithPrevious(plays: readonly TimelinePlay[], index: number): boolean {
    if (index <= 0 || index >= plays.length) return false;
    if (plays[index].runsWithPrevious) return true;
    const before = groupRange(plays, index - 1);
    const after = groupRange(plays, index);
    return before.end - before.start + (after.end - after.start) <= MAX_STATIONS_PER_GROUP;
}

/** Flips the drill's flag; returns `plays` itself when that isn't allowed. */
export function toggleRunsWithPrevious<T extends TimelinePlay>(plays: T[], index: number): T[] {
    if (!canToggleRunsWithPrevious(plays, index)) return plays;
    return normalizeGroups(
        plays.map((play, i) => (i === index ? { ...play, runsWithPrevious: !play.runsWithPrevious } : play)),
    );
}

/**
 * Moves the drill at `index` one step. Returns `plays` itself when nothing moves.
 * - A block's first drill, or a standalone drill, moves as a unit and hops
 *   over the neighboring unit (a standalone drill or a whole block).
 * - Any other station reorders inside its block. Moving the second station
 *   up makes it the block's first drill. The last station can't move down.
 */
export function moveItem<T extends TimelinePlay>(plays: T[], index: number, dir: -1 | 1): T[] {
    if (index < 0 || index >= plays.length) return plays;
    const group = groupRange(plays, index);

    if (index !== group.start) {
        const target = index + dir;
        if (target < group.start || target >= group.end) return plays;
        const next = [...plays];
        [next[index], next[target]] = [next[target], next[index]];
        // Flags are positional inside a block: its first drill runs on its own.
        for (let i = group.start; i < group.end; i++) {
            const runsWithPrevious = i !== group.start;
            if (next[i].runsWithPrevious !== runsWithPrevious) next[i] = { ...next[i], runsWithPrevious };
        }
        return normalizeGroups(next);
    }

    if (dir === -1 ? group.start === 0 : group.end === plays.length) return plays;
    const neighbor = groupRange(plays, dir === -1 ? group.start - 1 : group.end);
    const [first, second] = dir === -1 ? [neighbor, group] : [group, neighbor];
    return normalizeGroups([
        ...plays.slice(0, first.start),
        ...plays.slice(second.start, second.end),
        ...plays.slice(first.start, first.end),
        ...plays.slice(second.end),
    ]);
}

/** Whether `moveItem` would change the order. */
export function canMove(plays: TimelinePlay[], index: number, dir: -1 | 1): boolean {
    return moveItem(plays, index, dir) !== plays;
}

/**
 * Removes the drill at `index`. Removing a block's first drill makes the next
 * station the head of what is left, so it never joins the block before it.
 */
export function removeItem<T extends TimelinePlay>(plays: T[], index: number): T[] {
    if (index < 0 || index >= plays.length) return plays;
    const removedHead = index === 0 || !plays[index].runsWithPrevious;
    const next = plays.filter((_, i) => i !== index);
    const follower = next[index];
    if (removedHead && follower?.runsWithPrevious) next[index] = { ...follower, runsWithPrevious: false };
    return normalizeGroups(next);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test __tests__/lib/utils/session-timeline.test.ts`
Expected: PASS (every test in the file).

Run: `bun run type-check`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/utils/session-timeline.ts __tests__/lib/utils/session-timeline.test.ts
git commit -m "feat(practice-planner): session-timeline module for station groups and wall time

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---
### Task 3: Server — wall-time validation, the group check, persist and read the flag

**Files:**
- Modify: `lib/actions/practice-sessions.ts`:
  - imports :11 and :41;
  - `validateTotalDuration` :381-400;
  - create checks :473 and `createMany` :584-595;
  - update checks :755 and nested create :939-947;
  - `getPracticeSessionById` :1175-1305.
- Modify: `lib/actions/practice-session-queries.ts`:
  - imports :1-6;
  - `getPracticeSessionDetail` type :88-109, include :143, mapping :172-191;
  - `getPracticeSessionForEdit` type :214-224, mapping :269-282.
- Modify: `types/practice-planner.ts` (`PlayInSession` :134-146; delete `validatePlayDurations` :246-271)
- Modify: `components/features/practice-planner/PracticeSessionEditor.tsx` (`handleAddPlayFromLibrary` :545)
- Modify: `lib/utils/session-drill-ids.ts` (`upsertSessionDrill` :69)
- Modify: `app/(dashboard)/practice-planner/new/PracticeSessionEditorWrapper.tsx` (:33-39), `app/(dashboard)/practice-planner/[sessionId]/edit/EditSessionWrapper.tsx` (:43-49)
- Modify tests:
  - `__tests__/lib/actions/practice-sessions-ownership.test.ts` (:99);
  - `__tests__/lib/actions/practice-session-queries.test.ts`;
  - `__tests__/lib/actions/practice-session-drills.test.ts` (duplicate block :127-204);
  - `__tests__/types/practice-planner.test.ts`;
  - the `PlayInSession` fixtures listed in Step 7.
- Test: `__tests__/lib/actions/practice-sessions-stations.test.ts` (create)

**Interfaces:**
- Consumes:
  - Task 1: `runsWithPrevious` on the Prisma model and on the validated `plays` items.
  - Task 2: `sessionWallMinutes`, `stationGroupError`, `normalizeGroups`, `TimelinePlay`, `FIRST_DRILL_STATION_ERROR`, `STATION_GROUP_CAP_ERROR`.
- Produces:
  - `PlayInSession.runsWithPrevious: boolean` (required).
  - `getPracticeSessionDetail(sessionId)` → `session.segmentKind: SegmentKind | null` and `session.plays[].runsWithPrevious: boolean`.
  - `getPracticeSessionForEdit(sessionId)` → `initialData.plays[].runsWithPrevious: boolean`, with groups normalized.
  - `getPracticeSessionById(input)` → `data.segmentKind: SegmentKind | null` and `data.plays[].runsWithPrevious: boolean`.
  - The new and edit wrappers send `runsWithPrevious` for each play.
  - Create and update reject an invalid group with `FIRST_DRILL_STATION_ERROR` or `STATION_GROUP_CAP_ERROR`, and an over-long timeline with `Practice timeline (X min) exceeds session duration (Y min)`. All three come back as `{ success: false, error }`.

- [ ] **Step 1: Write the failing action tests**

Create `__tests__/lib/actions/practice-sessions-stations.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

// Clone ids are generated before insert; a per-test counter keeps them readable.
const playIds = vi.hoisted(() => ({ next: 0 }));
vi.mock("@/lib/services/play-ids", () => ({ newPlayId: () => `cclone${playIds.next++}xxxxxxxxxxxxxxxxxx` }));

const { mockAuth, models, mockPrisma } = vi.hoisted(() => {
    const models = {
        play: { findMany: vi.fn(), createManyAndReturn: vi.fn(), deleteMany: vi.fn() },
        practiceSession: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
        practiceSessionPlay: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
        teamMember: { findFirst: vi.fn() },
        event: { findUnique: vi.fn(), delete: vi.fn() },
    };
    return {
        models,
        mockAuth: {
            requireTeamAdmin: vi.fn(),
            requireTeamMember: vi.fn(),
            requireLeagueRole: vi.fn(),
        },
        mockPrisma: {
            $transaction: vi.fn(async (fn: (tx: typeof models) => unknown) => fn(models)),
            ...models,
        },
    };
});

vi.mock("@/lib/auth/session", () => mockAuth);
vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/email/templates", () => ({ sendPracticePlanNotifications: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/services/venue-reservations", () => ({
    assignVenueReservation: vi.fn(),
    createVenueReservation: vi.fn(),
    VenueReservationConflictError: class VenueReservationConflictError extends Error {
        conflicts: unknown[] = [];
    },
    VenueReservationLifecycleError: class VenueReservationLifecycleError extends Error {},
}));

import { createPracticeSession, getPracticeSessionById, updatePracticeSession } from "@/lib/actions/practice-sessions";
import { FIRST_DRILL_STATION_ERROR, STATION_GROUP_CAP_ERROR } from "@/lib/utils/session-timeline";
import { createEmptyPlayData } from "@/lib/utils/play-data";

const TEAM = "cteamxxxxxxxxxxxxxxxxxxxx";
const USER = "cuserxxxxxxxxxxxxxxxxxxxx";
const SESSION = "csessionxxxxxxxxxxxxxxxxx";
const LIB = "clibraryxxxxxxxxxxxxxxxxx";

type Drill = { duration?: number; runsWithPrevious?: boolean; sequence?: number };

/** A session payload; a drill without runsWithPrevious is sent the way a pre-2b client sends it. */
function input(duration: number, drills: Drill[]) {
    return {
        title: "Tuesday",
        date: new Date("2026-04-07T22:00:00.000Z"),
        duration,
        teamId: TEAM,
        plays: drills.map((drill, index) => ({
            playId: LIB,
            clientKey: `k${index}`,
            sequence: drill.sequence ?? index,
            duration: drill.duration ?? 15,
            instructions: "",
            ...(drill.runsWithPrevious === undefined ? {} : { runsWithPrevious: drill.runsWithPrevious }),
        })),
    };
}

const STATIONS: Drill[] = [{ runsWithPrevious: false }, { runsWithPrevious: true }, { runsWithPrevious: true }];
const SEQUENTIAL: Drill[] = [{}, {}, {}];

type Row = { sequence: number; runsWithPrevious: boolean };

beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.requireTeamAdmin.mockResolvedValue(USER);
    models.teamMember.findFirst.mockResolvedValue({ id: "cmemberxxxxxxxxxxxxxxxxxx" });
    models.practiceSession.create.mockResolvedValue({ id: SESSION, title: "Tuesday", date: new Date() });
    models.practiceSession.findUnique.mockResolvedValue({ id: SESSION, teamId: TEAM, isShared: false, venueReservationId: null });
    models.practiceSession.update.mockResolvedValue({ id: SESSION, title: "Tuesday", date: new Date() });
    models.practiceSessionPlay.findMany.mockResolvedValue([]);
    models.practiceSessionPlay.deleteMany.mockResolvedValue({ count: 0 });
    models.practiceSessionPlay.createMany.mockResolvedValue({ count: 0 });
    models.play.deleteMany.mockResolvedValue({ count: 0 });
    models.play.findMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.includes(LIB)
            ? [{ id: LIB, teamId: TEAM, name: "Library drill", isTemplate: true, sessionId: null, sourcePlayId: null, description: null, thumbnail: null, playData: {} }]
            : []);
    playIds.next = 0;
    models.play.createManyAndReturn.mockImplementation(async ({ data }: { data: Array<{ id: string; name: string; sourcePlayId: string; sessionId: string }> }) =>
        data.map((d) => ({ id: d.id, name: d.name, sourcePlayId: d.sourcePlayId, sessionId: d.sessionId })));
});

describe("createPracticeSession with stations (2b)", () => {
    it("accepts three 15-minute stations in a 20-minute session and persists the flags", async () => {
        const result = await createPracticeSession(input(20, STATIONS));

        expect(result.success).toBe(true);
        const rows: Row[] = models.practiceSessionPlay.createMany.mock.calls[0][0].data;
        expect(rows.map((row) => [row.sequence, row.runsWithPrevious])).toEqual([[0, false], [1, true], [2, true]]);
    });

    it("rejects the same three drills run one after another", async () => {
        const result = await createPracticeSession(input(20, SEQUENTIAL));

        expect(result).toEqual({ success: false, error: "Practice timeline (45 min) exceeds session duration (20 min)" });
        expect(models.practiceSession.create).not.toHaveBeenCalled();
    });

    it("keeps an existing sequential session valid: wall time equals the sum, and an old client's drills save as sequential", async () => {
        const result = await createPracticeSession(input(45, SEQUENTIAL));

        expect(result.success).toBe(true);
        const rows: Row[] = models.practiceSessionPlay.createMany.mock.calls[0][0].data;
        expect(rows.map((row) => row.runsWithPrevious)).toEqual([false, false, false]);
    });

    it("groups by sequence, not by payload order", async () => {
        const result = await createPracticeSession(input(20, [
            { sequence: 2, runsWithPrevious: true },
            { sequence: 1, runsWithPrevious: true },
            { sequence: 0, runsWithPrevious: false },
        ]));

        expect(result.success).toBe(true);
    });

    it("rejects a first drill (by sequence) that runs with a previous one", async () => {
        const result = await createPracticeSession(input(60, [
            { sequence: 1, runsWithPrevious: false },
            { sequence: 0, runsWithPrevious: true },
        ]));

        expect(result).toEqual({ success: false, error: FIRST_DRILL_STATION_ERROR });
        expect(models.practiceSession.create).not.toHaveBeenCalled();
    });

    it("accepts a block of four and rejects a fifth station", async () => {
        const four: Drill[] = [{}, { runsWithPrevious: true }, { runsWithPrevious: true }, { runsWithPrevious: true }];
        expect((await createPracticeSession(input(60, four))).success).toBe(true);

        const result = await createPracticeSession(input(60, [...four, { runsWithPrevious: true }]));
        expect(result).toEqual({ success: false, error: STATION_GROUP_CAP_ERROR });
    });
});

describe("updatePracticeSession with stations (2b)", () => {
    it("writes runsWithPrevious through the nested create", async () => {
        const result = await updatePracticeSession({ id: SESSION, ...input(20, STATIONS) });

        expect(result.success).toBe(true);
        const created: Row[] = models.practiceSession.update.mock.calls[0][0].data.plays.create;
        expect(created.map((row) => row.runsWithPrevious)).toEqual([false, true, true]);
    });

    it("rejects an over-long sequential timeline before any write", async () => {
        const result = await updatePracticeSession({ id: SESSION, ...input(20, SEQUENTIAL) });

        expect(result).toEqual({ success: false, error: "Practice timeline (45 min) exceeds session duration (20 min)" });
        expect(models.practiceSessionPlay.deleteMany).not.toHaveBeenCalled();
        expect(models.practiceSession.update).not.toHaveBeenCalled();
    });
});

describe("getPracticeSessionById (2b)", () => {
    it("reads each drill's station flag and the booked segment's kind", async () => {
        models.practiceSession.findUnique.mockResolvedValue({
            id: SESSION, title: "Tuesday", date: new Date(), duration: 20, isShared: false, teamId: TEAM,
            createdAt: new Date(), updatedAt: new Date(),
            venueId: null, venue: null, surfaceId: null, surface: null,
            segmentId: "csegmentxxxxxxxxxxxxxxxxx", segment: { name: "Half A", kind: "HALF" }, startAt: null,
            plays: [
                { id: "r0", sequence: 0, duration: 15, instructions: null, runsWithPrevious: false, play: { id: LIB, name: "A", description: null, thumbnail: null, playData: createEmptyPlayData() } },
                { id: "r1", sequence: 1, duration: 15, instructions: null, runsWithPrevious: true, play: { id: LIB, name: "B", description: null, thumbnail: null, playData: createEmptyPlayData() } },
            ],
        });

        const result = await getPracticeSessionById({ id: SESSION, teamId: TEAM });

        expect(result).toMatchObject({
            success: true,
            data: { segmentKind: "HALF", plays: [{ runsWithPrevious: false }, { runsWithPrevious: true }] },
        });
        const select = models.practiceSession.findUnique.mock.calls[0][0].select;
        expect(select.plays.select.runsWithPrevious).toBe(true);
        expect(select.segment).toEqual({ select: { name: true, kind: true } });
    });
});
```

- [ ] **Step 2: Add the read, duplicate and ownership expectations**

In `__tests__/lib/actions/practice-session-queries.test.ts`:

1. Change the import to `import { getPracticeSessionDetail, getPracticeSessionForEdit } from "@/lib/actions/practice-session-queries";`.
2. Replace the `row` helper with:

```ts
function row(id: string, sequence: number, runsWithPrevious = false) {
  return {
    id,
    sequence,
    duration: 10,
    instructions: null,
    runsWithPrevious,
    play: { id: `play-${id}`, name: id, description: null, thumbnail: null, playData: null },
  };
}
```

3. Inside `describe("getPracticeSessionForEdit", …)`, after the last `it`, add:

```ts
  it("normalizes station flags with the sequences: the first drill never runs with a previous one", async () => {
    // A pre-3a cascade could delete a block's first drill and leave its stations behind.
    mockPrisma.practiceSession.findUnique.mockResolvedValue({
      id: "s1", teamId: "t1", title: "T", date: new Date("2026-01-01T00:00:00Z"), duration: 60, isShared: false,
      venueId: null, surfaceId: null, segmentId: null, startAt: null,
      plays: [row("a", 1, true), row("b", 2, true), row("c", 3, false)],
    });

    const result = await getPracticeSessionForEdit("s1");

    expect(result?.initialData.plays.map((p) => [p.id, p.sequence, p.runsWithPrevious])).toEqual([
      ["a", 0, false],
      ["b", 1, true],
      ["c", 2, false],
    ]);
  });
```

4. At the end of the file, add:

```ts
describe("getPracticeSessionDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.teamMember.findFirst.mockResolvedValue({ id: "m", role: "ADMIN" });
  });

  it("returns each drill's station flag and the booked segment's kind", async () => {
    mockPrisma.practiceSession.findUnique.mockResolvedValue({
      id: "s1", teamId: "t1", title: "T", date: new Date("2026-01-01T00:00:00Z"), duration: 60, isShared: false,
      createdBy: { name: "Coach" }, team: { id: "t1", name: "Team" },
      venueId: "v1", venue: { name: "Rink" }, surfaceId: "sf1", surface: { name: "Main" },
      segmentId: "sg1", segment: { name: "Half A", kind: "HALF" }, startAt: null,
      plays: [row("a", 0, false), row("b", 1, true)],
    });

    const result = await getPracticeSessionDetail("s1");

    expect(result?.session.segmentKind).toBe("HALF");
    expect(result?.session.plays.map((p) => p.runsWithPrevious)).toEqual([false, true]);
    expect(mockPrisma.practiceSession.findUnique.mock.calls[0][0].include.segment).toEqual({ select: { name: true, kind: true } });
  });

  it("reads an unbooked session's segment kind as null", async () => {
    mockPrisma.practiceSession.findUnique.mockResolvedValue({
      id: "s1", teamId: "t1", title: "T", date: new Date("2026-01-01T00:00:00Z"), duration: 60, isShared: false,
      createdBy: { name: "Coach" }, team: { id: "t1", name: "Team" },
      venueId: null, venue: null, surfaceId: null, surface: null, segmentId: null, segment: null, startAt: null,
      plays: [],
    });

    expect((await getPracticeSessionDetail("s1"))?.session.segmentKind).toBeNull();
  });
});
```

In `__tests__/lib/actions/practice-session-drills.test.ts`, inside `describe("duplicatePracticeSession", …)` and directly before `it("refuses a session of another team"`, add:

```ts
    it("copies each drill's station flag (runsWithPrevious)", async () => {
        mockPrisma.practiceSession.findUnique.mockResolvedValue({
            teamId: TEAM, title: "Tuesday", duration: 75,
            plays: [{ ...sourceRow(0), runsWithPrevious: false }, { ...sourceRow(1), runsWithPrevious: true }],
        });

        await duplicatePracticeSession({ id: SOURCE, teamId: TEAM, date: DATE });

        const copied: Array<{ runsWithPrevious: boolean }> = tx.practiceSessionPlay.createMany.mock.calls[0][0].data;
        expect(copied.map((row) => row.runsWithPrevious)).toEqual([false, true]);
    });
```

In `__tests__/lib/actions/practice-sessions-ownership.test.ts:99`, replace

```ts
            { sessionId: SESSION, playId: "cclone0xxxxxxxxxxxxxxxxxx", sequence: 0, duration: 10, instructions: null },
```

with

```ts
            { sessionId: SESSION, playId: "cclone0xxxxxxxxxxxxxxxxxx", sequence: 0, runsWithPrevious: false, duration: 10, instructions: null },
```

This is the only change allowed in that file. Every other ownership assertion must pass untouched (Review Focus 5).

- [ ] **Step 3: Run them to verify they fail**

Run: `bun run test __tests__/lib/actions/practice-sessions-stations.test.ts __tests__/lib/actions/practice-session-queries.test.ts __tests__/lib/actions/practice-sessions-ownership.test.ts __tests__/lib/actions/practice-session-drills.test.ts`
Expected: FAIL in four places:
- the stations file: no flags in the writes, and the old sum-based error copy;
- the new query tests: `runsWithPrevious` and `segmentKind` are undefined, and the first flag isn't normalized;
- the ownership `toEqual`: the flag is missing from the write.

The duplicate test already PASSES, because 3a's scalar copy is enum-driven. That is expected: it is a guard, not new behavior.

- [ ] **Step 4: Switch the actions to wall time, add the group check, persist and read the flag**

In `lib/actions/practice-sessions.ts`:

1. Replace `import type { Prisma } from "@prisma/client";` with `import type { Prisma, SegmentKind } from "@prisma/client";`, and after `import { FALLBACK_TIME_ZONE } from "@/lib/utils/date";` add:

```ts
import {
    sessionWallMinutes,
    stationGroupError,
    type TimelinePlay,
} from "@/lib/utils/session-timeline";
```

2. Replace the whole `validateTotalDuration` function and its doc comment (:381-400, from `/**` above ` * Validate total duration against session duration` through the function's closing `}`) with:

```ts
/**
 * Validate the practice timeline against the session duration (2b). Station
 * groups run at the same time, so each group counts once, for its longest
 * drill. For a session with no stations this is the sum of drill durations.
 */
function validateWallTime(
    sessionDuration: number,
    plays: TimelinePlay[]
): { valid: boolean; error?: string } {
    const wallMinutes = sessionWallMinutes(plays);
    if (wallMinutes > sessionDuration) {
        return {
            valid: false,
            error: `Practice timeline (${wallMinutes} min) exceeds session duration (${sessionDuration} min)`,
        };
    }
    return { valid: true };
}
```

3. The line below occurs twice, in `createPracticeSession` (:473) and in `updatePracticeSession` (:755). Replace both occurrences (`replace_all`):

```ts
            const durationValidation = validateTotalDuration(validated.duration, validated.plays);
```

with

```ts
            const groupError = stationGroupError(validated.plays);
            if (groupError) {
                return { success: false, error: groupError };
            }

            const durationValidation = validateWallTime(validated.duration, validated.plays);
```

4. In `createPracticeSession`'s `tx.practiceSessionPlay.createMany`, replace

```ts
                        sequence: play.sequence,
                        duration: play.duration,
                        instructions: play.instructions
                            ? sanitizeText(play.instructions, 2000)
                            : null,
```

with

```ts
                        sequence: play.sequence,
                        runsWithPrevious: play.runsWithPrevious,
                        duration: play.duration,
                        instructions: play.instructions
                            ? sanitizeText(play.instructions, 2000)
                            : null,
```

5. In `updatePracticeSession`'s nested `plays: { create: … }`, replace

```ts
                            sequence: play.sequence,
                            duration: play.duration,
                            instructions: play.instructions ? sanitizeText(play.instructions, 2000) : null,
```

with

```ts
                            sequence: play.sequence,
                            runsWithPrevious: play.runsWithPrevious,
                            duration: play.duration,
                            instructions: play.instructions ? sanitizeText(play.instructions, 2000) : null,
```

The 3a calls stay exactly where they are: `materializeSessionDrills` before the session plays are written, and `deleteOrphanedSessionDrills` after them. The reservation code is unchanged too.

6. In `getPracticeSessionById`:

   - In the return type, after `    segmentName: string | null;`, add `    segmentKind: SegmentKind | null;`. In the `plays: Array<{ … }>` item type, after `        instructions: string | null;`, add `        runsWithPrevious: boolean;`.
   - In the `select`, replace `                segment: { select: { name: true } },` with `                segment: { select: { name: true, kind: true } },`. In the `plays.select`, after `                        instructions: true,`, add `                        runsWithPrevious: true,`.
   - In the returned `data`, after `                segmentName: session.segment?.name ?? null,`, add `                segmentKind: session.segment?.kind ?? null,`. In the plays mapping, after `                    instructions: p.instructions,`, add `                    runsWithPrevious: p.runsWithPrevious,`.

- [ ] **Step 5: Return the flag and the segment kind from the page queries**

In `lib/actions/practice-session-queries.ts`:

1. After `import { parseStoredPlayData, playDataOrEmpty } from "@/lib/utils/play-data";` add:

```ts
import type { SegmentKind } from "@prisma/client";
import { normalizeGroups } from "@/lib/utils/session-timeline";
```

2. In `getPracticeSessionDetail`'s return type:
   - After `    segmentName: string | null;` add `    segmentKind: SegmentKind | null;`.
   - In its `plays` item type, after `      instructions: string | null;` add `      runsWithPrevious: boolean;`.
3. In its `include`, replace `      segment: { select: { name: true } },` with `      segment: { select: { name: true, kind: true } },`.
4. In its mapping:
   - After `      segmentName: session.segment?.name ?? null,` add `      segmentKind: session.segment?.kind ?? null,`.
   - In `plays: session.plays.map((sp) => ({`, after `        instructions: sp.instructions,` add `        runsWithPrevious: sp.runsWithPrevious,`.
5. In `getPracticeSessionForEdit`'s return type, in the `plays` item type, after `      sequence: number;` add `      runsWithPrevious: boolean;`.
6. Replace its plays mapping (:269-282):

```ts
      // Plays are ordered by sequence asc. Deleting a library play cascades
      // its PracticeSessionPlay row away and leaves gaps (e.g. 0,2), which the
      // save validator rejects — so renumber to consecutive 0-based indices.
      plays: session.plays.map((sp, index) => ({
        id: sp.id,
        playId: sp.play.id,
        name: sp.play.name,
        description: sp.play.description ?? "",
        sequence: index,
        duration: sp.duration ?? 0,
        instructions: sp.instructions || "",
        playData: playDataOrEmpty(sp.play.playData, `play ${sp.play.id}`),
        thumbnail: sp.play.thumbnail || "",
      })),
```

with

```ts
      // Plays are ordered by sequence asc. Before 3a, deleting a library play
      // cascaded its PracticeSessionPlay row away and could leave gaps (e.g.
      // 0,2), which the save validator rejects, or a block's stations without
      // their first drill. normalizeGroups renumbers to consecutive 0-based
      // indices and clears the first drill's station flag (2b).
      plays: normalizeGroups(session.plays.map((sp) => ({
        id: sp.id,
        playId: sp.play.id,
        name: sp.play.name,
        description: sp.play.description ?? "",
        sequence: sp.sequence,
        runsWithPrevious: sp.runsWithPrevious,
        duration: sp.duration ?? 0,
        instructions: sp.instructions || "",
        playData: playDataOrEmpty(sp.play.playData, `play ${sp.play.id}`),
        thumbnail: sp.play.thumbnail || "",
      }))),
```

The list query (`getPracticePlannerListData`, :40-55) reads only the first drill's thumbnail and the count, so it doesn't change.

- [ ] **Step 6: Give `PlayInSession` the flag and send it from the wrappers**

First, while `types/practice-planner.ts` still has its original line numbers, delete the sum-based `validatePlayDurations` (Spec deviation 13). It runs from the blank line at :246 through the end of the file at :271:

```bash
sed -i '' '246,271d' types/practice-planner.ts
grep -c "validatePlayDurations" types/practice-planner.ts
tail -n 3 types/practice-planner.ts
```

Expected: the `grep` prints `0`, and the `tail` shows `validateSessionDuration`'s closing `    };` and `}`. This deletion must run before the `PlayInSession` edit below, because that edit adds two lines above :246 and would shift the range.

Then, in `types/practice-planner.ts`, `interface PlayInSession`, replace

```ts
    sequence: number;
    duration: number; // minutes
```

with

```ts
    sequence: number;
    /** Runs at the same time as the previous drill: a station (2b). */
    runsWithPrevious: boolean;
    duration: number; // minutes
```

In `components/features/practice-planner/PracticeSessionEditor.tsx`, `handleAddPlayFromLibrary`, replace

```ts
            sequence: 0, // Assigned below from the current list (max + 1) so gaps cannot collide
```

with

```ts
            sequence: 0, // Assigned below from the current list (max + 1) so gaps cannot collide
            runsWithPrevious: false, // Runs on its own until the coach groups it (2b)
```

In `lib/utils/session-drill-ids.ts`, replace

```ts
    return [...plays, { id: clientKey, ...patch, sequence, duration: 10, instructions: "" }];
```

with

```ts
    return [...plays, { id: clientKey, ...patch, sequence, runsWithPrevious: false, duration: 10, instructions: "" }];
```

In both `app/(dashboard)/practice-planner/new/PracticeSessionEditorWrapper.tsx` and `app/(dashboard)/practice-planner/[sessionId]/edit/EditSessionWrapper.tsx`, replace

```ts
          sequence: play.sequence,
          duration: play.duration,
```

with

```ts
          sequence: play.sequence,
          runsWithPrevious: play.runsWithPrevious,
          duration: play.duration,
```

- [ ] **Step 7: Update the test fixtures for the required field, and drop the deleted validator's tests**

`__tests__/types/practice-planner.test.ts` needs four deletions:
- the `describe("Play Durations Validation", …)` block (:77-153, plus the blank line at :76);
- the `describe("Edge Cases & Error Handling", …)` block (:286-320, plus the blank line at :285);
- the `validatePlayDurations,` import (:22);
- the `PlayInSession,` import (:16), which has no other use.

One `sed` makes all four, because every address refers to the original line numbers:

```bash
sed -i '' -e '285,320d' -e '76,153d' -e '22d' -e '16d' __tests__/types/practice-planner.test.ts
grep -c "validatePlayDurations\|PlayInSession\[\]" __tests__/types/practice-planner.test.ts
```

Expected: `0`.

Add the field to the remaining `PlayInSession` fixtures:

```bash
perl -pi -e 's/(sequence: \d+, duration: 10,)/$1 runsWithPrevious: false,/' \
  __tests__/components/features/practice-planner/PracticeSessionEditor.drill-ids.test.tsx \
  __tests__/components/features/practice-planner/PracticeSessionEditor.drill-dialog.test.tsx \
  __tests__/components/features/practice-planner/PracticeSessionEditor.stale-drill.test.tsx \
  __tests__/components/features/practice-planner/PracticeSessionEditor.create-lock.test.tsx \
  __tests__/components/features/practice-planner/SessionDrillList.busy.test.tsx
perl -pi -e 's/name: id, sequence, duration: 10,/name: id, sequence, runsWithPrevious: false, duration: 10,/' \
  __tests__/lib/utils/session-drill-ids.test.ts
perl -pi -e 's/^(\s+)sequence,\n/$1sequence,\n$1runsWithPrevious: false,\n/' \
  __tests__/components/features/practice-planner/PracticeSessionEditor.characterization.test.tsx
grep -c "runsWithPrevious: false" \
  __tests__/components/features/practice-planner/PracticeSessionEditor.drill-ids.test.tsx \
  __tests__/components/features/practice-planner/PracticeSessionEditor.drill-dialog.test.tsx \
  __tests__/components/features/practice-planner/PracticeSessionEditor.stale-drill.test.tsx \
  __tests__/components/features/practice-planner/PracticeSessionEditor.create-lock.test.tsx \
  __tests__/components/features/practice-planner/SessionDrillList.busy.test.tsx \
  __tests__/lib/utils/session-drill-ids.test.ts \
  __tests__/components/features/practice-planner/PracticeSessionEditor.characterization.test.tsx
```

Expected counts: 1, 1, 1, 2, 1, 1, 1. Then run `bun run type-check`. If it reports `Property 'runsWithPrevious' is missing` for any other test fixture, add `runsWithPrevious: false,` right after that literal's `sequence` property, and run it again. Nothing else changes in those files.

- [ ] **Step 8: Run the tests and type-check**

Run: `bun run test __tests__/lib/actions/practice-sessions-stations.test.ts __tests__/lib/actions/practice-session-queries.test.ts __tests__/lib/actions/practice-sessions-ownership.test.ts __tests__/lib/actions/practice-session-drills.test.ts __tests__/lib/actions/practice-sessions.test.ts __tests__/types/practice-planner.test.ts __tests__/lib/utils/session-drill-ids.test.ts __tests__/components/features/practice-planner`
Expected: PASS.

Run: `bun run type-check && bun run check:raw-sql`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add lib/actions/practice-sessions.ts lib/actions/practice-session-queries.ts types/practice-planner.ts lib/utils/session-drill-ids.ts components/features/practice-planner/PracticeSessionEditor.tsx "app/(dashboard)/practice-planner/new/PracticeSessionEditorWrapper.tsx" "app/(dashboard)/practice-planner/[sessionId]/edit/EditSessionWrapper.tsx" __tests__
git commit -m "feat(practice-planner): validate session wall time and persist station grouping

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 4: Editor — station switch, station blocks, timeline-driven move and delete

**Files:**
- Modify (full replacement): `components/features/practice-planner/SessionDrillCard.tsx`
- Modify (full replacement): `components/features/practice-planner/SessionDrillList.tsx`
- Modify: `components/features/practice-planner/PracticeSessionEditor.tsx`:
  - imports :38;
  - `handleDeletePlay` :489-497;
  - `handleMovePlayUp` and `handleMovePlayDown` :575-614;
  - `<SessionDrillList>` props :736-737.
- Modify: `__tests__/components/features/practice-planner/SessionDrillList.busy.test.tsx` (:15-19 props)
- Test: `__tests__/components/features/practice-planner/PracticeSessionEditor.stations.test.tsx` (create)
- Test: `__tests__/components/features/practice-planner/PracticeSessionEditor.line-budget.test.ts` (create)

**Interfaces:**
- Consumes:
  - Task 2: `groupStations`, `sessionWallMinutes`, `stationBlockLabel`, `canMove`, `canToggleRunsWithPrevious`, `moveItem`, `removeItem`, `toggleRunsWithPrevious`, `MAX_STATIONS_PER_GROUP`.
  - Task 3: `PlayInSession.runsWithPrevious`.
- Produces (`SessionDrillCard.tsx`):
  - `export const STATION_SWITCH_LABEL = "Run as a station with the previous drill"` and `export const STATION_CAP_TOOLTIP = "A station block holds at most 4 drills"`.
  - `SessionDrillCardProps` loses `totalPlays` and gains these props:
    - `canMoveUp: boolean`
    - `canMoveDown: boolean`
    - `station: { checked: boolean; canToggle: boolean } | null` (null for the first drill)
    - `onToggleStation(index: number): void`
  - `index` stays the drill's position in the whole list.
- Produces (`SessionDrillList.tsx`): `SessionDrillListProps` gains `onToggleStation(index: number): void`. A block of more than one drill renders as `role="group"` with `aria-label` and a visible header equal to `stationBlockLabel(n, m)`.
- Produces (`PracticeSessionEditor.tsx`): `handleMovePlay(index: number, dir: -1 | 1)` and `handleToggleStation(index: number)`. The `onMoveUp` and `onMoveDown` props of `SessionDrillList` are unchanged.

- [ ] **Step 1: Write the failing editor tests and the line-budget guard**

Create `__tests__/components/features/practice-planner/PracticeSessionEditor.stations.test.tsx`:

```tsx
/** Station grouping in the session editor (practice planner 2b). */
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import {
    PracticeSessionEditor,
    type PracticeSessionEditorProps,
    type PracticeSessionSaveResult,
    type PracticeSessionSubmitData,
} from "@/components/features/practice-planner/PracticeSessionEditor";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import type { PlayInSession } from "@/types/practice-planner";

vi.mock("@/lib/actions/plays", () => ({
    getPlaysByTeam: vi.fn().mockResolvedValue({ success: true, data: { plays: [], total: 0 } }),
    getPlayById: vi.fn(),
    deletePlay: vi.fn(),
    createPlay: vi.fn(),
}));
// The drill dialog's actions import the auth stack; the editor tests never call them.
vi.mock("@/lib/actions/practice-session-drills", () => ({ saveSessionDrill: vi.fn(), copySessionDrillToLibrary: vi.fn() }));

type SaveFn = (data: PracticeSessionSubmitData) => Promise<PracticeSessionSaveResult>;

const TEAM = "cteamxxxxxxxxxxxxxxxxxxxx";
const START = new Date("2026-04-07T22:00:00.000Z");
const SWITCH = "Run as a station with the previous drill";

function drill(id: string, sequence: number, runsWithPrevious: boolean, duration = 15): PlayInSession {
    return {
        id,
        playId: `clib${id}xxxxxxxxxxxxxxxxxxxx`,
        name: `Drill ${id}`,
        sequence,
        runsWithPrevious,
        duration,
        instructions: "",
        playData: createEmptyPlayData(),
        thumbnail: "",
    };
}

/** "a b+ c+ d": a, then b and c running with the drill before them, then d. */
function drills(spec: string): PlayInSession[] {
    return spec.split(" ").map((token, sequence) => drill(token.replace("+", ""), sequence, token.endsWith("+")));
}

function renderEditor(
    plays: PlayInSession[],
    { initialData, ...props }: Partial<PracticeSessionEditorProps> = {},
    duration = 60,
) {
    const onSave = vi.fn<SaveFn>().mockResolvedValue({ success: true });
    render(
        <ThemeProvider theme={createTheme()}>
            <LocalizationProvider dateAdapter={AdapterDateFns}>
                <PracticeSessionEditor
                    teamId={TEAM}
                    initialData={{ title: "Practice", duration, date: START, plays, ...initialData }}
                    onSave={onSave}
                    {...props}
                />
            </LocalizationProvider>
        </ThemeProvider>,
    );
    return { onSave };
}

/** Clicks Save session and returns the saved order in the same "a b+" notation. */
async function savedOrder(onSave: ReturnType<typeof vi.fn<SaveFn>>): Promise<string> {
    await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /^save session/i }));
    });
    const sent = onSave.mock.calls[0][0].plays;
    expect(sent.map((play) => play.sequence)).toEqual(sent.map((_, index) => index));
    return sent.map((play) => `${play.id}${play.runsWithPrevious ? "+" : ""}`).join(" ");
}

describe("PracticeSessionEditor stations (2b)", () => {
    it("offers the station switch on every drill after the first", () => {
        renderEditor(drills("a b c"));
        expect(screen.getAllByLabelText(SWITCH)).toHaveLength(2);
    });

    it("groups toggled drills into one block timed by its longest drill, and saves the flags", async () => {
        const { onSave } = renderEditor(drills("a b c"), {}, 20);
        fireEvent.click(screen.getAllByLabelText(SWITCH)[0]);
        fireEvent.click(screen.getAllByLabelText(SWITCH)[1]);

        expect(screen.getByRole("group", { name: "Stations · 3 · 15 min" })).toBeInTheDocument();
        expect(screen.getByText("Stations · 3 · 15 min")).toBeInTheDocument();
        expect(screen.getByText("Total Play Time: 15 minutes")).toBeInTheDocument();
        expect(screen.queryByText(/exceeds/)).not.toBeInTheDocument();
        expect(await savedOrder(onSave)).toBe("a b+ c+");
    });

    it("disables the switch that would make a fifth station, but not one that leaves the block", () => {
        renderEditor(drills("a b+ c+ d+ e"));
        const switches = screen.getAllByLabelText(SWITCH);
        expect(switches[3]).toBeDisabled(); // e
        expect(switches[2]).toBeEnabled(); // d
    });

    it("keeps the rest of a block together when its first drill is deleted", async () => {
        const { onSave } = renderEditor(drills("x y+ a b+ c+"));
        fireEvent.click(screen.getByRole("button", { name: "Delete play 3" }));
        expect(await savedOrder(onSave)).toBe("x y+ b c+");
    });

    it("moves a standalone drill over a whole block", async () => {
        const { onSave } = renderEditor(drills("s a b+"));
        fireEvent.click(screen.getByRole("button", { name: "Move play 1 down" }));
        expect(await savedOrder(onSave)).toBe("a b+ s");
    });

    it("moves a whole block when its first drill moves", async () => {
        const { onSave } = renderEditor(drills("x a b+"));
        fireEvent.click(screen.getByRole("button", { name: "Move play 2 up" }));
        expect(await savedOrder(onSave)).toBe("a b+ x");
    });

    it("reorders a station within its block, and stops at the block's edge", async () => {
        const { onSave } = renderEditor(drills("a b+ c+ s"));
        expect(screen.getByRole("button", { name: "Move play 3 down" })).toBeDisabled();
        fireEvent.click(screen.getByRole("button", { name: "Move play 3 up" }));
        expect(await savedOrder(onSave)).toBe("a c+ b+ s");
    });
});
```

Create `__tests__/components/features/practice-planner/PracticeSessionEditor.line-budget.test.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const EDITOR = path.join(process.cwd(), "components/features/practice-planner/PracticeSessionEditor.tsx");

describe("PracticeSessionEditor line budget", () => {
    it("stays at or under 900 lines (new session logic belongs in the list, the card, or a hook)", () => {
        const lines = readFileSync(EDITOR, "utf8").trimEnd().split("\n").length;
        expect(lines).toBeLessThanOrEqual(900);
    });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test __tests__/components/features/practice-planner/PracticeSessionEditor.stations.test.tsx __tests__/components/features/practice-planner/PracticeSessionEditor.line-budget.test.ts`
Expected: the stations tests FAIL because no element is labelled `Run as a station with the previous drill`. The line-budget test PASSES at 893 lines; it is a guard.

- [ ] **Step 3: Replace `SessionDrillCard.tsx`**

Replace the contents of `components/features/practice-planner/SessionDrillCard.tsx` with:

```tsx
"use client";

/**
 * One drill in a practice session: thumbnail, duration, instructions, the
 * station switch (2b), and the reorder / edit / delete controls. Extracted
 * from PracticeSessionEditor.
 */

import { useState } from "react";
import {
    Box,
    Button,
    Card,
    CardActions,
    CardContent,
    CardMedia,
    Chip,
    FormControlLabel,
    IconButton,
    Stack,
    Switch,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import {
    ArrowDownward as ArrowDownwardIcon,
    ArrowUpward as ArrowUpwardIcon,
    Delete as DeleteIcon,
    Draw as DrawIcon,
    Edit as EditIcon,
} from "@mui/icons-material";
import Image from "next/image";
import { VALIDATION_CONSTRAINTS, type PlayInSession } from "@/types/practice-planner";
import { MAX_STATIONS_PER_GROUP } from "@/lib/utils/session-timeline";

export const STATION_SWITCH_LABEL = "Run as a station with the previous drill";
export const STATION_CAP_TOOLTIP = `A station block holds at most ${MAX_STATIONS_PER_GROUP} drills`;

/**
 * Props for the SessionDrillCard component
 */
export interface SessionDrillCardProps {
    play: PlayInSession;
    /** Position in the whole session (not within a station block). */
    index: number;
    /** Whether Move up / Move down would change the order (station-aware, 2b). */
    canMoveUp: boolean;
    canMoveDown: boolean;
    /** The station switch; null for the first drill, which always runs on its own. */
    station: { checked: boolean; canToggle: boolean } | null;
    onToggleStation: (index: number) => void;
    isEditing: boolean;
    onDelete: (playId: string) => void;
    onEdit: (playId: string) => void;
    onUpdate: (playId: string, updates: Partial<PlayInSession>) => void;
    onCancelEdit: () => void;
    onMoveUp: (index: number) => void;
    onMoveDown: (index: number) => void;
    /** Diagram editing needs a saved session. */
    canEditDiagram: boolean;
    /** The list is busy (saving or sharing). */
    disabled?: boolean;
    /** The session is being created: nothing on the card may change. */
    locked?: boolean;
    onEditDiagram: (clientKey: string) => void;
}

/**
 * SessionDrillCard Component
 *
 * Individual play card showing thumbnail, duration, and instructions
 * Requirements: 2.2, 2.4, 2.5
 */
export function SessionDrillCard({
    play,
    index,
    canMoveUp,
    canMoveDown,
    station,
    onToggleStation,
    isEditing,
    onDelete,
    onEdit,
    onUpdate,
    onCancelEdit,
    onMoveUp,
    onMoveDown,
    canEditDiagram,
    disabled = false,
    locked = false,
    onEditDiagram,
}: SessionDrillCardProps) {
    // Local state for editing
    const [editDuration, setEditDuration] = useState(play.duration);
    const [editInstructions, setEditInstructions] = useState(play.instructions);

    // Get thumbnail from play instance (copied from library play when added)
    const thumbnail = play.thumbnail || "";

    /**
     * Handle save edits
     * Requirements: 2.4 - Save inline edits
     */
    const handleSaveEdits = () => {
        onUpdate(play.id, {
            duration: editDuration,
            instructions: editInstructions,
        });
    };

    /**
     * Handle cancel edits
     */
    const handleCancelEdits = () => {
        setEditDuration(play.duration);
        setEditInstructions(play.instructions);
        onCancelEdit();
    };

    return (
        <Card
            sx={{
                display: "flex",
                flexDirection: { xs: "column", sm: "row" },
                gap: 2,
            }}
        >
            {/* Thumbnail */}
            <CardMedia
                component="div"
                sx={{
                    width: { xs: "100%", sm: 200 },
                    height: { xs: 150, sm: 120 },
                    bgcolor: "grey.100",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    position: "relative",
                    flexShrink: 0,
                }}
            >
                {thumbnail ? (
                    <Image
                        src={thumbnail}
                        alt={play.name || `Drill ${index + 1}`}
                        fill
                        style={{ objectFit: "contain" }}
                        unoptimized
                    />
                ) : (
                    <Typography variant="body2" color="text.secondary">
                        Play {index + 1}
                    </Typography>
                )}
                <Chip
                    label={`#${index + 1}`}
                    color="primary"
                    size="small"
                    sx={{
                        position: "absolute",
                        top: 8,
                        left: 8,
                    }}
                />
            </CardMedia>

            {/* Content */}
            <CardContent sx={{ flexGrow: 1, py: 1 }}>
                <Stack spacing={1}>
                    <Typography variant="h6" component="h3">
                        {play.name || `Drill ${index + 1}`}
                    </Typography>

                    {/* Duration - Editable */}
                    {/* Requirements: 2.4 - Duration input for each play */}
                    {isEditing ? (
                        <TextField
                            label="Duration (minutes)"
                            type="number"
                            value={editDuration}
                            onChange={(e) => setEditDuration(parseInt(e.target.value, 10) || 0)}
                            size="small"
                            disabled={locked}
                            inputProps={{
                                min: VALIDATION_CONSTRAINTS.MIN_DURATION,
                                max: VALIDATION_CONSTRAINTS.MAX_DURATION,
                            }}
                            fullWidth
                        />
                    ) : (
                        <Stack direction="row" spacing={1} alignItems="center">
                            <Typography variant="body2" color="text.secondary">
                                Duration:
                            </Typography>
                            <Typography variant="body2" fontWeight="medium">
                                {play.duration} minutes
                            </Typography>
                        </Stack>
                    )}

                    {/* Instructions - Editable */}
                    {/* Requirements: 2.4 - Inline editor for play instructions */}
                    {isEditing ? (
                        <TextField
                            label="Instructions"
                            value={editInstructions}
                            onChange={(e) => setEditInstructions(e.target.value)}
                            multiline
                            rows={3}
                            size="small"
                            disabled={locked}
                            fullWidth
                            inputProps={{ maxLength: 2000 }}
                            helperText={`${editInstructions.length}/2000 characters`}
                        />
                    ) : (
                        play.instructions && (
                            <Box>
                                <Typography variant="body2" color="text.secondary" gutterBottom>
                                    Instructions:
                                </Typography>
                                <Typography
                                    variant="body2"
                                    sx={{
                                        display: "-webkit-box",
                                        WebkitLineClamp: 2,
                                        WebkitBoxOrient: "vertical",
                                        overflow: "hidden",
                                    }}
                                >
                                    {play.instructions}
                                </Typography>
                            </Box>
                        )
                    )}

                    {!isEditing && (
                        <Tooltip title={canEditDiagram ? "" : "Save the session first"}>
                            <span>
                                <Button
                                    size="small"
                                    startIcon={<DrawIcon />}
                                    onClick={() => onEditDiagram(play.id)}
                                    disabled={disabled || !canEditDiagram}
                                    aria-label={`Edit diagram for ${play.name || `drill ${index + 1}`}`}
                                    sx={{ minHeight: 44 }}
                                >
                                    Edit diagram
                                </Button>
                            </span>
                        </Tooltip>
                    )}

                    {/* Station grouping (2b): runs at the same time as the drill before it */}
                    {!isEditing && station && (
                        <Tooltip title={station.canToggle ? "" : STATION_CAP_TOOLTIP}>
                            <span>
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={station.checked}
                                            onChange={() => onToggleStation(index)}
                                        />
                                    }
                                    label={STATION_SWITCH_LABEL}
                                    disabled={locked || !station.canToggle}
                                    sx={{ minHeight: 44, ml: 0 }}
                                />
                            </span>
                        </Tooltip>
                    )}

                    {/* Edit Actions */}
                    {isEditing && (
                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                            <Button size="small" onClick={handleCancelEdits}>
                                Cancel
                            </Button>
                            <Button
                                size="small"
                                variant="contained"
                                onClick={handleSaveEdits}
                                disabled={locked}
                            >
                                Save
                            </Button>
                        </Stack>
                    )}
                </Stack>
            </CardContent>

            {/* Actions */}
            {!isEditing && (
                <CardActions sx={{ flexDirection: "column", justifyContent: "center", p: 1, gap: 0.5 }}>
                    {/* Requirements: 2.5 - Reordering controls (station-aware, 2b) */}
                    <IconButton
                        size="small"
                        onClick={() => onMoveUp(index)}
                        disabled={locked || !canMoveUp}
                        aria-label={`Move play ${index + 1} up`}
                    >
                        <ArrowUpwardIcon />
                    </IconButton>
                    <IconButton
                        size="small"
                        onClick={() => onMoveDown(index)}
                        disabled={locked || !canMoveDown}
                        aria-label={`Move play ${index + 1} down`}
                    >
                        <ArrowDownwardIcon />
                    </IconButton>
                    <IconButton
                        size="small"
                        color="primary"
                        onClick={() => onEdit(play.id)}
                        disabled={locked}
                        aria-label={`Edit play ${index + 1}`}
                    >
                        <EditIcon />
                    </IconButton>
                    <IconButton
                        size="small"
                        color="error"
                        onClick={() => onDelete(play.id)}
                        disabled={locked}
                        aria-label={`Delete play ${index + 1}`}
                    >
                        <DeleteIcon />
                    </IconButton>
                </CardActions>
            )}
        </Card>
    );
}
```

- [ ] **Step 4: Replace `SessionDrillList.tsx`**

Replace the contents of `components/features/practice-planner/SessionDrillList.tsx` with:

```tsx
"use client";

import type { ReactNode } from "react";
import { Alert, Box, Button, Paper, Stack, Tooltip, Typography } from "@mui/material";
import { Add as AddIcon, Draw as DrawIcon } from "@mui/icons-material";
import type { PlayInSession } from "@/types/practice-planner";
import {
    canMove,
    canToggleRunsWithPrevious,
    groupStations,
    sessionWallMinutes,
    stationBlockLabel,
} from "@/lib/utils/session-timeline";
import { SessionDrillCard } from "./SessionDrillCard";

export interface SessionDrillListProps {
    plays: PlayInSession[];
    duration: number;
    editingPlayId: string | null;
    disabled: boolean;
    /** The session is being created: every card control is locked. */
    locked?: boolean;
    onOpenLibrary: () => void;
    onDelete: (playId: string) => void;
    onEdit: (playId: string) => void;
    onUpdate: (playId: string, updates: Partial<PlayInSession>) => void;
    onCancelEdit: () => void;
    onMoveUp: (index: number) => void;
    onMoveDown: (index: number) => void;
    /** Flips "Run as a station with the previous drill" on the drill at this position (2b). */
    onToggleStation: (index: number) => void;
    /** Diagram editing and new drills need a saved session. */
    canEditDiagram: boolean;
    onEditDiagram: (clientKey: string) => void;
    onNewDrill: () => void;
}

/** Drills that run at the same time: one outlined block headed "Stations · N · M min" (2b). */
function StationBlock({ label, children }: { label: string; children: ReactNode }) {
    return (
        <Box
            role="group"
            aria-label={label}
            sx={{ border: 2, borderColor: "primary.main", borderRadius: 1, p: 1.5 }}
        >
            <Stack spacing={1.5}>
                <Typography
                    variant="subtitle2"
                    component="p"
                    sx={{ fontWeight: 800, color: "primary.main", textTransform: "uppercase", letterSpacing: 1 }}
                >
                    {label}
                </Typography>
                {children}
            </Stack>
        </Box>
    );
}

/**
 * Plays in Session: totals, empty state, and one card per drill
 * (Requirements 2.2-2.5). Drills that run together render as one station
 * block; the total is the session's wall time (2b).
 */
export function SessionDrillList({
    plays,
    duration,
    editingPlayId,
    disabled,
    locked = false,
    onOpenLibrary,
    onDelete,
    onEdit,
    onUpdate,
    onCancelEdit,
    onMoveUp,
    onMoveDown,
    onToggleStation,
    canEditDiagram,
    onEditDiagram,
    onNewDrill,
}: SessionDrillListProps) {
    const totalPlayTime = sessionWallMinutes(plays);
    const groups = groupStations(plays);

    // The editor keeps array order equal to sequence order, so a drill's
    // position in `plays` is its card number and its move/toggle index.
    const renderCard = (play: PlayInSession) => {
        const index = plays.indexOf(play);
        return (
            <SessionDrillCard
                key={play.id}
                play={play}
                index={index}
                canMoveUp={canMove(plays, index, -1)}
                canMoveDown={canMove(plays, index, 1)}
                station={index === 0 ? null : {
                    checked: play.runsWithPrevious,
                    canToggle: canToggleRunsWithPrevious(plays, index),
                }}
                onToggleStation={onToggleStation}
                isEditing={editingPlayId === play.id}
                onDelete={onDelete}
                onEdit={onEdit}
                onUpdate={onUpdate}
                onCancelEdit={onCancelEdit}
                onMoveUp={onMoveUp}
                onMoveDown={onMoveDown}
                canEditDiagram={canEditDiagram}
                disabled={disabled}
                locked={locked}
                onEditDiagram={onEditDiagram}
            />
        );
    };

    return (
        <Paper elevation={2} sx={{ p: 2 }}>
            <Stack spacing={2}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="h6" component="h2">
                        Plays in Session
                    </Typography>
                    <Stack direction="row" spacing={1}>
                        <Tooltip title={canEditDiagram ? "" : "Save the session first"}>
                            <span>
                                <Button
                                    variant="outlined"
                                    startIcon={<DrawIcon />}
                                    onClick={onNewDrill}
                                    disabled={disabled || !canEditDiagram}
                                    sx={{ minHeight: 44 }}
                                >
                                    New drill
                                </Button>
                            </span>
                        </Tooltip>
                        <Button
                            variant="outlined"
                            startIcon={<AddIcon />}
                            onClick={onOpenLibrary}
                            disabled={disabled}
                            sx={{ minHeight: 44 }}
                        >
                            Add from library
                        </Button>
                    </Stack>
                </Stack>

                {plays.length > 0 && (
                    <Box>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Typography variant="body2" color="text.secondary">
                                Total Play Time: {totalPlayTime} minutes
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Session Duration: {duration} minutes
                            </Typography>
                        </Stack>
                        {totalPlayTime > duration && (
                            <Alert severity="warning" sx={{ mt: 1 }}>
                                Total play time ({totalPlayTime} min) exceeds
                                session duration ({duration} min)
                            </Alert>
                        )}
                    </Box>
                )}

                {plays.length === 0 && (
                    <Box
                        sx={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            minHeight: 200,
                            textAlign: "center",
                            p: 3,
                        }}
                    >
                        <Typography variant="h6" color="text.secondary" gutterBottom>
                            No plays added yet
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Add plays from your library to build your practice session
                        </Typography>
                    </Box>
                )}

                {plays.length > 0 && (
                    <Stack spacing={2}>
                        {groups.map((group) =>
                            group.stations.length > 1 ? (
                                <StationBlock
                                    key={`stations-${group.stations[0].id}`}
                                    label={stationBlockLabel(group.stations.length, group.wallMinutes)}
                                >
                                    {group.stations.map(renderCard)}
                                </StationBlock>
                            ) : (
                                renderCard(group.stations[0])
                            )
                        )}
                    </Stack>
                )}
            </Stack>
        </Paper>
    );
}
```

- [ ] **Step 5: Drive move, delete and the switch through the timeline helpers in the editor**

In `components/features/practice-planner/PracticeSessionEditor.tsx`:

1. After `import { applySavedPlayIds, describeSaveError, type SavedDrillId } from "@/lib/utils/session-drill-ids";` add:

```ts
import { moveItem, removeItem, toggleRunsWithPrevious } from "@/lib/utils/session-timeline";
```

2. In `handleDeletePlay`, replace

```ts
        setPlays((prevPlays) =>
            prevPlays
                .filter((p) => p.id !== playId)
                .map((play, idx) => ({ ...play, sequence: idx }))
        );
```

with

```ts
        // Removing a block's first drill keeps its stations grouped (2b).
        setPlays((prevPlays) => removeItem(prevPlays, prevPlays.findIndex((p) => p.id === playId)));
```

3. Replace both move handlers (:575-614). The replaced span starts at

```ts
    /**
     * Handle move play up
     * Requirements: 2.5 - Reorder plays, update sequence numbers
     */
    const handleMovePlayUp = useCallback((index: number) => {
```

and ends at `handleMovePlayDown`'s closing `}, [markDirty, creating]);`. Its replacement:

```ts
    /**
     * Reorder (Requirements 2.5) and station grouping (2b) through the shared
     * timeline rules: a block's first drill moves the whole block, a station
     * moves within its block, and a standalone drill hops over whole blocks.
     */
    const handleMovePlay = useCallback((index: number, dir: -1 | 1) => {
        if (creating) return;
        setPlays((prevPlays) => moveItem(prevPlays, index, dir));
        markDirty();
    }, [markDirty, creating]);

    const handleToggleStation = useCallback((index: number) => {
        if (creating) return;
        setPlays((prevPlays) => toggleRunsWithPrevious(prevPlays, index));
        markDirty();
    }, [markDirty, creating]);
```

4. In the `<SessionDrillList … />` JSX, replace

```tsx
                onMoveUp={handleMovePlayUp}
                onMoveDown={handleMovePlayDown}
```

with

```tsx
                onMoveUp={(index) => handleMovePlay(index, -1)}
                onMoveDown={(index) => handleMovePlay(index, 1)}
                onToggleStation={handleToggleStation}
```

In `__tests__/components/features/practice-planner/SessionDrillList.busy.test.tsx`, replace `onCancelEdit={vi.fn()} onMoveUp={vi.fn()} onMoveDown={vi.fn()}` with `onCancelEdit={vi.fn()} onMoveUp={vi.fn()} onMoveDown={vi.fn()} onToggleStation={vi.fn()}`.

- [ ] **Step 6: Run the editor suites, type-check, lint, and measure**

Run: `bun run test __tests__/components/features/practice-planner`
Expected: PASS. This includes the new stations and line-budget tests. It also includes `PracticeSessionEditor.characterization.test.tsx`, whose assertions are unchanged; that is Review Focus 1. With every drill sequential, "Total Play Time: 35 minutes", "Move play 1 down" and "Delete play 1" behave exactly as before.

Run: `bun run type-check && bun run lint`
Expected: no errors.

Run: `wc -l components/features/practice-planner/PracticeSessionEditor.tsx`
Expected: about 869 lines (894 after Task 3, then -25 here), and in any case at most 900.

- [ ] **Step 7: Commit**

```bash
git add components/features/practice-planner/SessionDrillCard.tsx components/features/practice-planner/SessionDrillList.tsx components/features/practice-planner/PracticeSessionEditor.tsx __tests__/components/features/practice-planner
git commit -m "feat(practice-planner): group session drills into station blocks in the editor

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 5: Station warnings and the booked segment's kind

**Files:**
- Modify: `lib/utils/session-timeline.ts` (imports at the top; warnings appended)
- Modify: `__tests__/lib/utils/session-timeline.test.ts` (import block; warnings appended)
- Modify: `components/features/practice-planner/useVenueBooking.ts`:
  - imports :10-16;
  - `VenueReservationBookingOption` :28-40;
  - `UseVenueBookingOptions.segmentsBySurface` :87;
  - option lists :237-240;
  - return :242-265.
- Modify: `app/(dashboard)/practice-planner/venue-booking-options.ts`:
  - imports :1-7;
  - `segmentsBySurface` type :22;
  - reservation select :109 and mapping :124;
  - segments :145-155.
- Modify: `components/features/practice-planner/PracticeSessionEditor.tsx` (import :46-51, prop type :100, `<SessionDrillList>` :725-727)
- Modify (full replacement): `components/features/practice-planner/SessionDrillList.tsx`
- Modify: `components/features/practice-planner/SessionDrillCard.tsx` (props, destructuring, chip under the heading)
- Test: `__tests__/components/features/practice-planner/PracticeSessionEditor.stations.test.tsx` (warnings appended)

**Interfaces:**
- Consumes:
  - Task 2: `StationGroup`, `TimelinePlay`, `groupStations`.
  - Task 4: `SessionDrillList`, `SessionDrillCard`, and the stations test helpers `drill`, `drills`, `renderEditor` and `savedOrder`.
- Produces (`lib/utils/session-timeline.ts`):

| Export | Signature or value |
|---|---|
| `STATION_OVERLAP_TOLERANCE_FT` | `1` |
| `StationArea` | `interface { area?: IceArea \| null }` (`null` = unreadable, never flagged) |
| `DrillFootprint` | `"full" \| "half" \| "zone"` |
| `drillFootprint` | `(area?: IceArea) => DrillFootprint` |
| `SEGMENT_KIND_FIT_LABELS` | `Record<SegmentKind, string>` = `{ HALF: "half ice", CROSS: "cross ice", CUSTOM: "ice segment" }` |
| `stationWarnings` | `(groups: StationGroup<TimelinePlay & StationArea>[], bookedSegmentKind: SegmentKind \| null) => { overlaps: Array<[number, number, number]>; tooBig: number[] }` |

  - In `overlaps`, each entry is `[groupIndex, sequenceA, sequenceB]`. `tooBig` holds sequences.
- Produces (`useVenueBooking.ts`):
  - `export interface SegmentBookingOption { id: string; name: string; kind?: SegmentKind }`.
  - `VenueReservationBookingOption.segmentKind?: SegmentKind | null`.
  - The hook's return gains `segmentKind: SegmentKind | null`. It is `null` when nothing is booked, when the whole surface is booked, or when the kind is unknown.
- Produces (`venue-booking-options.ts`):
  - `VenueBookingOptions.segmentsBySurface: Record<string, SegmentBookingOption[]>`, with `kind` filled in.
  - Each reservation carries `segmentKind`.
- Produces (`SessionDrillList`): an optional prop `segmentKind?: SegmentKind | null`.
- Produces (`SessionDrillCard`): an optional prop `fitWarning?: string | null`.

- [ ] **Step 1: Write the failing warning tests**

In `__tests__/lib/utils/session-timeline.test.ts`, replace the import block at the top of the file with:

```ts
import { describe, expect, it } from "vitest";
import type { SegmentKind } from "@prisma/client";
import type { IceArea } from "@/types/practice-planner";
import {
    FIRST_DRILL_STATION_ERROR,
    MAX_STATIONS_PER_GROUP,
    SEGMENT_KIND_FIT_LABELS,
    STATION_GROUP_CAP_ERROR,
    STATION_OVERLAP_TOLERANCE_FT,
    canMove,
    canToggleRunsWithPrevious,
    drillFootprint,
    groupRange,
    groupStations,
    moveItem,
    normalizeGroups,
    removeItem,
    sessionWallMinutes,
    stationBlockLabel,
    stationGroupError,
    stationWarnings,
    toggleRunsWithPrevious,
    type StationArea,
    type TimelinePlay,
} from "@/lib/utils/session-timeline";
```

and append to the end of the file:

```ts
describe("drillFootprint", () => {
    it.each([
        ["missing (full ice)", undefined, "full"],
        ["full", { kind: "full" }, "full"],
        ["half-left", { kind: "half-left" }, "half"],
        ["half-right", { kind: "half-right" }, "half"],
        ["zone-left", { kind: "zone-left" }, "zone"],
        ["zone-neutral", { kind: "zone-neutral" }, "zone"],
        ["zone-right", { kind: "zone-right" }, "zone"],
        ["custom 101 ft wide", { kind: "custom", rect: { x: 0, y: 0, w: 101, h: 20 } }, "full"],
        ["custom 100 ft wide", { kind: "custom", rect: { x: 0, y: 0, w: 100, h: 85 } }, "half"],
        ["custom 76 ft wide", { kind: "custom", rect: { x: 0, y: 0, w: 76, h: 40 } }, "half"],
        ["custom 75 ft wide", { kind: "custom", rect: { x: 0, y: 0, w: 75, h: 85 } }, "zone"],
    ] as Array<[string, IceArea | undefined, string]>)("classifies %s as %s", (_name, area, footprint) => {
        expect(drillFootprint(area)).toBe(footprint);
    });
});

describe("stationWarnings", () => {
    type Placed = TimelinePlay & StationArea;

    /** One drill per area; `flags` defaults to a single block holding all of them. */
    function placed(areas: Array<IceArea | undefined | null>, flags = areas.map((_, index) => index > 0)): Placed[] {
        return areas.map((area, sequence) => ({ sequence, duration: 10, runsWithPrevious: flags[sequence], area }));
    }

    function warn(plays: Placed[], kind: SegmentKind | null = null) {
        return stationWarnings(groupStations(plays), kind);
    }

    it("flags two stations whose areas overlap", () => {
        expect(warn(placed([{ kind: "half-left" }, { kind: "zone-neutral" }])).overlaps).toEqual([[0, 0, 1]]);
    });

    it("doesn't flag zones that only share a blue line", () => {
        expect(warn(placed([{ kind: "zone-left" }, { kind: "zone-neutral" }, { kind: "zone-right" }])).overlaps).toEqual([]);
    });

    it("treats a full-ice drill as overlapping every other station", () => {
        expect(warn(placed([undefined, { kind: "zone-right" }, { kind: "zone-left" }])).overlaps).toEqual([
            [0, 0, 1],
            [0, 0, 2],
        ]);
    });

    it("tolerates up to 1 ft of overlap", () => {
        expect(STATION_OVERLAP_TOLERANCE_FT).toBe(1);
        const touching: IceArea = { kind: "custom", rect: { x: 74, y: 0, w: 20, h: 20 } };
        const overlapping: IceArea = { kind: "custom", rect: { x: 73, y: 0, w: 20, h: 20 } };
        expect(warn(placed([{ kind: "zone-left" }, touching])).overlaps).toEqual([]);
        expect(warn(placed([{ kind: "zone-left" }, overlapping])).overlaps).toEqual([[0, 0, 1]]);
    });

    it("only compares drills in the same block, and reports the block's index", () => {
        const plays = placed([{ kind: "half-left" }, { kind: "half-left" }, { kind: "half-left" }, { kind: "zone-left" }], [false, false, false, true]);
        expect(warn(plays).overlaps).toEqual([[2, 2, 3]]);
    });

    it("skips an unreadable drill in both checks", () => {
        expect(warn(placed([null, { kind: "zone-left" }]), "CROSS")).toEqual({ overlaps: [], tooBig: [] });
    });

    const AREAS: Record<string, IceArea | undefined> = {
        "missing (full ice)": undefined,
        full: { kind: "full" },
        "half-left": { kind: "half-left" },
        "zone-left": { kind: "zone-left" },
        "zone-neutral": { kind: "zone-neutral" },
        "custom 150x85": { kind: "custom", rect: { x: 0, y: 0, w: 150, h: 85 } },
        "custom 90x40": { kind: "custom", rect: { x: 0, y: 0, w: 90, h: 40 } },
        "custom 60x85": { kind: "custom", rect: { x: 0, y: 0, w: 60, h: 85 } },
    };
    const TOO_BIG: Record<"whole" | SegmentKind, string[]> = {
        whole: [],
        HALF: ["missing (full ice)", "full", "custom 150x85"],
        CROSS: ["missing (full ice)", "full", "half-left", "custom 150x85", "custom 90x40"],
        CUSTOM: [],
    };

    it.each(Object.keys(TOO_BIG) as Array<keyof typeof TOO_BIG>)("flags the drills too big for a %s booking", (kind) => {
        const names = Object.keys(AREAS);
        // One drill per block, so only the size check can fire.
        const plays = placed(names.map((name) => AREAS[name]), names.map(() => false));
        const { tooBig, overlaps } = warn(plays, kind === "whole" ? null : kind);
        expect(tooBig.map((sequence) => names[sequence])).toEqual(TOO_BIG[kind]);
        expect(overlaps).toEqual([]);
    });

    it("names booked segment kinds for the fit warning", () => {
        expect(SEGMENT_KIND_FIT_LABELS).toEqual({ HALF: "half ice", CROSS: "cross ice", CUSTOM: "ice segment" });
    });
});
```

In `__tests__/components/features/practice-planner/PracticeSessionEditor.stations.test.tsx`, change `import type { PlayInSession } from "@/types/practice-planner";` to `import type { IceArea, PlayInSession } from "@/types/practice-planner";` and append:

```tsx
describe("PracticeSessionEditor station warnings (2b)", () => {
    const VENUE = "cvenuexxxxxxxxxxxxxxxxxxx";
    const SURFACE = "csurfacexxxxxxxxxxxxxxxxx";
    const SEGMENT = "csegmentxxxxxxxxxxxxxxxxx";
    const booking: Partial<PracticeSessionEditorProps> = {
        venues: [{ id: VENUE, name: "Test Rink", timezone: "America/New_York" }],
        surfacesByVenue: { [VENUE]: [{ id: SURFACE, name: "Main" }] },
        segmentsBySurface: { [SURFACE]: [{ id: SEGMENT, name: "Half A", kind: "HALF" }] },
    };

    function withArea(play: PlayInSession, area?: IceArea): PlayInSession {
        return { ...play, playData: { ...createEmptyPlayData(), ...(area ? { area } : {}) } };
    }

    it("warns, without blocking the save, when two stations' areas overlap", async () => {
        const [a, b] = drills("a b+");
        const { onSave } = renderEditor([withArea(a, { kind: "half-left" }), withArea(b, { kind: "zone-neutral" })]);

        expect(screen.getByText("Stations 1 and 2 overlap on the ice")).toBeInTheDocument();
        expect(await savedOrder(onSave)).toBe("a b+");
    });

    it("doesn't warn for stations that only share a blue line", () => {
        const [a, b, c] = drills("a b+ c+");
        renderEditor([
            withArea(a, { kind: "zone-left" }),
            withArea(b, { kind: "zone-neutral" }),
            withArea(c, { kind: "zone-right" }),
        ]);
        expect(screen.queryByText(/overlap on the ice/)).not.toBeInTheDocument();
    });

    it("flags a drill larger than the booked half-ice segment", () => {
        const [a, b] = drills("a b");
        renderEditor([withArea(a), withArea(b, { kind: "half-left" })], {
            ...booking,
            initialData: { venueId: VENUE, surfaceId: SURFACE, segmentId: SEGMENT, startAt: START },
        });
        expect(screen.getAllByText("Larger than the booked half ice")).toHaveLength(1);
    });

    it("flags nothing when the whole surface is booked", () => {
        const [a] = drills("a");
        renderEditor([withArea(a)], {
            ...booking,
            initialData: { venueId: VENUE, surfaceId: SURFACE, startAt: START },
        });
        expect(screen.queryByText(/Larger than the booked/)).not.toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test __tests__/lib/utils/session-timeline.test.ts __tests__/components/features/practice-planner/PracticeSessionEditor.stations.test.tsx`
Expected: FAIL. The new exports are undefined (`drillFootprint is not a function`), the editor shows no warning text, and `type-check` would flag `kind` on the segment option.

- [ ] **Step 3: Add the warnings to `session-timeline.ts`**

In `lib/utils/session-timeline.ts`, between the module doc comment and `/** The most drills one station group may hold. */`, add:

```ts
import type { SegmentKind } from "@prisma/client";
import type { IceArea } from "@/types/practice-planner";
import { areaRect, isFullIce } from "@/lib/utils/ice-area";
import { BLUE_LINES, RINK_DIMENSIONS } from "@/lib/utils/canvas/rink-renderer";
```

Then append to the end of the file:

```ts
// ---------------------------------------------------------------------------
// Advisory warnings (client-only; they never block a save)
// ---------------------------------------------------------------------------

/** Areas that share an edge, or overlap by at most this much, don't count as overlapping. */
export const STATION_OVERLAP_TOLERANCE_FT = 1;

/** A drill's ice area for the warnings. null = the drill couldn't be read, so it is never flagged. */
export interface StationArea {
    area?: IceArea | null;
}

/** How much ice a drill needs, judged by its area's width against the rink's halves and zones. */
export type DrillFootprint = "full" | "half" | "zone";

export function drillFootprint(area?: IceArea): DrillFootprint {
    if (isFullIce(area)) return "full";
    const { w } = areaRect(area);
    if (w > RINK_DIMENSIONS.width / 2) return "full";
    if (w > BLUE_LINES.left) return "half";
    return "zone";
}

const TOO_BIG_FOR: Record<SegmentKind, readonly DrillFootprint[]> = {
    HALF: ["full"],
    CROSS: ["full", "half"],
    CUSTOM: [],
};

/** How the fit warning names a booked segment kind. */
export const SEGMENT_KIND_FIT_LABELS: Record<SegmentKind, string> = {
    HALF: "half ice",
    CROSS: "cross ice",
    CUSTOM: "ice segment",
};

function areasOverlap(a: IceArea | undefined, b: IceArea | undefined): boolean {
    const r = areaRect(a);
    const s = areaRect(b);
    const width = Math.min(r.x + r.w, s.x + s.w) - Math.max(r.x, s.x);
    const height = Math.min(r.y + r.h, s.y + s.h) - Math.max(r.y, s.y);
    return width > STATION_OVERLAP_TOLERANCE_FT && height > STATION_OVERLAP_TOLERANCE_FT;
}

/**
 * Overlapping stations within each block ([groupIndex, sequenceA, sequenceB])
 * and drills larger than the booked segment's kind (sequences). A whole-
 * surface or unbooked session (`null`) and a CUSTOM segment flag nothing for
 * size; HALF flags full-ice drills; CROSS flags full- and half-ice drills.
 */
export function stationWarnings(
    groups: StationGroup<TimelinePlay & StationArea>[],
    bookedSegmentKind: SegmentKind | null,
): { overlaps: Array<[number, number, number]>; tooBig: number[] } {
    const overlaps: Array<[number, number, number]> = [];
    const tooBig: number[] = [];
    const tooBigFootprints: readonly DrillFootprint[] = bookedSegmentKind ? TOO_BIG_FOR[bookedSegmentKind] : [];
    for (const group of groups) {
        const readable = group.stations.filter((station) => station.area !== null);
        readable.forEach((station, i) => {
            const area = station.area ?? undefined;
            if (tooBigFootprints.includes(drillFootprint(area))) tooBig.push(station.sequence);
            for (const other of readable.slice(i + 1)) {
                if (areasOverlap(area, other.area ?? undefined)) {
                    overlaps.push([group.index, station.sequence, other.sequence]);
                }
            }
        });
    }
    return { overlaps, tooBig };
}
```

- [ ] **Step 4: Carry the segment kind through the booking options and the hook**

In `components/features/practice-planner/useVenueBooking.ts`:

1. Below `import { useState, type ChangeEvent } from "react";` add `import type { SegmentKind } from "@prisma/client";`.
2. After `interface VenueBookingOption { … }`, add:

```ts
/**
 * A bookable segment of a surface. `kind` feeds the drills' advisory fit
 * check (2b); when it is absent the check treats the segment as unknown.
 */
export interface SegmentBookingOption {
    id: string;
    name: string;
    kind?: SegmentKind;
}
```

3. In `VenueReservationBookingOption`, after `    segmentName: string | null;` add `    segmentKind?: SegmentKind | null;`.
4. In `UseVenueBookingOptions`, replace `    segmentsBySurface: Record<string, Array<{ id: string; name: string }>>;` with `    segmentsBySurface: Record<string, SegmentBookingOption[]>;`.
5. After `    const wholeSurfaceLabel = (surfaceId && wholeLabelBySurface[surfaceId]) || "Whole surface";`, add:

```ts
    // The booked segment's kind for the drills' fit warning (2b). null means
    // unbooked, the whole surface, or a segment whose kind wasn't loaded.
    const segmentKind: SegmentKind | null = !venueId
        ? null
        : selectedReservation
            ? selectedReservation.segmentKind ?? null
            : surfaceSegments.find((segment) => segment.id === segmentId)?.kind ?? null;
```

6. In the returned object, after `        wholeSurfaceLabel,` add `        segmentKind,`.

In `app/(dashboard)/practice-planner/venue-booking-options.ts`:

1. After the existing `import type { VenueBookingOption, VenueReservationBookingOption } from "@/components/features/practice-planner/PracticeSessionEditor";` block, add `import type { SegmentBookingOption } from "@/components/features/practice-planner/useVenueBooking";`.
2. In `interface VenueBookingOptions`, replace `  segmentsBySurface: Record<string, Array<{ id: string; name: string }>>;` with `  segmentsBySurface: Record<string, SegmentBookingOption[]>;`.
3. In the reservation `select`, replace `      segment: { select: { name: true } },` with `      segment: { select: { name: true, kind: true } },`. In the mapping, after `      segmentName: reservation.segment?.name ?? null,` add `      segmentKind: reservation.segment?.kind ?? null,`.
4. Replace

```ts
        select: { id: true, name: true, surfaceId: true },
        orderBy: { name: "asc" },
      })
    : [];
  const segmentsBySurface: Record<string, Array<{ id: string; name: string }>> = {};
  for (const segment of segments) {
    (segmentsBySurface[segment.surfaceId] ??= []).push({ id: segment.id, name: segment.name });
  }
```

with

```ts
        select: { id: true, name: true, surfaceId: true, kind: true },
        orderBy: { name: "asc" },
      })
    : [];
  const segmentsBySurface: Record<string, SegmentBookingOption[]> = {};
  for (const segment of segments) {
    (segmentsBySurface[segment.surfaceId] ??= []).push({ id: segment.id, name: segment.name, kind: segment.kind });
  }
```

In `components/features/practice-planner/PracticeSessionEditor.tsx`:

1. In the `import { useVenueBooking, … } from "./useVenueBooking";` block (:46-51), after `    type PracticeVenueAttachment,` add `    type SegmentBookingOption,`. Leave the `export { … } from "./useVenueBooking";` block below it (:53-58) unchanged; it has the same line.
2. Replace `    segmentsBySurface?: Record<string, Array<{ id: string; name: string }>>;` with `    segmentsBySurface?: Record<string, SegmentBookingOption[]>;`.
3. In `<SessionDrillList`, after `                duration={duration}` add `                segmentKind={booking.segmentKind}`.

- [ ] **Step 5: Show the warnings in the list and on the cards**

In `components/features/practice-planner/SessionDrillCard.tsx`:

1. In `SessionDrillCardProps`, after `    onToggleStation: (index: number) => void;` add:

```ts
    /** Advisory: the drill is larger than the booked ice segment (2b). Never blocks a save. */
    fitWarning?: string | null;
```

2. In the destructuring, after `    onToggleStation,` add `    fitWarning = null,`.
3. Replace

```tsx
                    <Typography variant="h6" component="h3">
                        {play.name || `Drill ${index + 1}`}
                    </Typography>
```

with

```tsx
                    <Typography variant="h6" component="h3">
                        {play.name || `Drill ${index + 1}`}
                    </Typography>

                    {fitWarning && (
                        <Chip
                            label={fitWarning}
                            color="warning"
                            size="small"
                            variant="outlined"
                            sx={{ alignSelf: "flex-start" }}
                        />
                    )}
```

Replace the contents of `components/features/practice-planner/SessionDrillList.tsx` with:

```tsx
"use client";

import type { ReactNode } from "react";
import type { SegmentKind } from "@prisma/client";
import { Alert, Box, Button, Paper, Stack, Tooltip, Typography } from "@mui/material";
import { Add as AddIcon, Draw as DrawIcon } from "@mui/icons-material";
import type { PlayInSession } from "@/types/practice-planner";
import {
    SEGMENT_KIND_FIT_LABELS,
    canMove,
    canToggleRunsWithPrevious,
    groupStations,
    sessionWallMinutes,
    stationBlockLabel,
    stationWarnings,
    type StationGroup,
} from "@/lib/utils/session-timeline";
import { SessionDrillCard } from "./SessionDrillCard";

export interface SessionDrillListProps {
    plays: PlayInSession[];
    duration: number;
    /** The booked segment's kind, for the fit warning (2b); null = unbooked or the whole surface. */
    segmentKind?: SegmentKind | null;
    editingPlayId: string | null;
    disabled: boolean;
    /** The session is being created: every card control is locked. */
    locked?: boolean;
    onOpenLibrary: () => void;
    onDelete: (playId: string) => void;
    onEdit: (playId: string) => void;
    onUpdate: (playId: string, updates: Partial<PlayInSession>) => void;
    onCancelEdit: () => void;
    onMoveUp: (index: number) => void;
    onMoveDown: (index: number) => void;
    /** Flips "Run as a station with the previous drill" on the drill at this position (2b). */
    onToggleStation: (index: number) => void;
    /** Diagram editing and new drills need a saved session. */
    canEditDiagram: boolean;
    onEditDiagram: (clientKey: string) => void;
    onNewDrill: () => void;
}

/** Drills that run at the same time: one outlined block headed "Stations · N · M min" (2b). */
function StationBlock({ label, warnings, children }: { label: string; warnings: string[]; children: ReactNode }) {
    return (
        <Box
            role="group"
            aria-label={label}
            sx={{ border: 2, borderColor: "primary.main", borderRadius: 1, p: 1.5 }}
        >
            <Stack spacing={1.5}>
                <Typography
                    variant="subtitle2"
                    component="p"
                    sx={{ fontWeight: 800, color: "primary.main", textTransform: "uppercase", letterSpacing: 1 }}
                >
                    {label}
                </Typography>
                {warnings.map((warning) => (
                    <Alert key={warning} severity="warning">
                        {warning}
                    </Alert>
                ))}
                {children}
            </Stack>
        </Box>
    );
}

/** "Stations 1 and 2 overlap on the ice", numbering stations by their place in the block. */
function overlapMessages(
    group: StationGroup<PlayInSession>,
    overlaps: Array<[number, number, number]>,
): string[] {
    const position = (sequence: number) => group.stations.findIndex((station) => station.sequence === sequence) + 1;
    return overlaps
        .filter(([groupIndex]) => groupIndex === group.index)
        .map(([, a, b]) => `Stations ${position(a)} and ${position(b)} overlap on the ice`);
}

/**
 * Plays in Session: totals, empty state, and one card per drill
 * (Requirements 2.2-2.5). Drills that run together render as one station
 * block; the total is the session's wall time; overlap and fit warnings are
 * advisory (2b).
 */
export function SessionDrillList({
    plays,
    duration,
    segmentKind = null,
    editingPlayId,
    disabled,
    locked = false,
    onOpenLibrary,
    onDelete,
    onEdit,
    onUpdate,
    onCancelEdit,
    onMoveUp,
    onMoveDown,
    onToggleStation,
    canEditDiagram,
    onEditDiagram,
    onNewDrill,
}: SessionDrillListProps) {
    const totalPlayTime = sessionWallMinutes(plays);
    const groups = groupStations(plays);
    const warnings = stationWarnings(
        groupStations(plays.map((play) => ({ ...play, area: play.playData.area }))),
        segmentKind,
    );
    const fitLabel = segmentKind ? SEGMENT_KIND_FIT_LABELS[segmentKind] : null;

    // The editor keeps array order equal to sequence order, so a drill's
    // position in `plays` is its card number and its move/toggle index.
    const renderCard = (play: PlayInSession) => {
        const index = plays.indexOf(play);
        return (
            <SessionDrillCard
                key={play.id}
                play={play}
                index={index}
                canMoveUp={canMove(plays, index, -1)}
                canMoveDown={canMove(plays, index, 1)}
                station={index === 0 ? null : {
                    checked: play.runsWithPrevious,
                    canToggle: canToggleRunsWithPrevious(plays, index),
                }}
                onToggleStation={onToggleStation}
                fitWarning={fitLabel && warnings.tooBig.includes(play.sequence) ? `Larger than the booked ${fitLabel}` : null}
                isEditing={editingPlayId === play.id}
                onDelete={onDelete}
                onEdit={onEdit}
                onUpdate={onUpdate}
                onCancelEdit={onCancelEdit}
                onMoveUp={onMoveUp}
                onMoveDown={onMoveDown}
                canEditDiagram={canEditDiagram}
                disabled={disabled}
                locked={locked}
                onEditDiagram={onEditDiagram}
            />
        );
    };

    return (
        <Paper elevation={2} sx={{ p: 2 }}>
            <Stack spacing={2}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="h6" component="h2">
                        Plays in Session
                    </Typography>
                    <Stack direction="row" spacing={1}>
                        <Tooltip title={canEditDiagram ? "" : "Save the session first"}>
                            <span>
                                <Button
                                    variant="outlined"
                                    startIcon={<DrawIcon />}
                                    onClick={onNewDrill}
                                    disabled={disabled || !canEditDiagram}
                                    sx={{ minHeight: 44 }}
                                >
                                    New drill
                                </Button>
                            </span>
                        </Tooltip>
                        <Button
                            variant="outlined"
                            startIcon={<AddIcon />}
                            onClick={onOpenLibrary}
                            disabled={disabled}
                            sx={{ minHeight: 44 }}
                        >
                            Add from library
                        </Button>
                    </Stack>
                </Stack>

                {plays.length > 0 && (
                    <Box>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Typography variant="body2" color="text.secondary">
                                Total Play Time: {totalPlayTime} minutes
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Session Duration: {duration} minutes
                            </Typography>
                        </Stack>
                        {totalPlayTime > duration && (
                            <Alert severity="warning" sx={{ mt: 1 }}>
                                Total play time ({totalPlayTime} min) exceeds
                                session duration ({duration} min)
                            </Alert>
                        )}
                    </Box>
                )}

                {plays.length === 0 && (
                    <Box
                        sx={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            minHeight: 200,
                            textAlign: "center",
                            p: 3,
                        }}
                    >
                        <Typography variant="h6" color="text.secondary" gutterBottom>
                            No plays added yet
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Add plays from your library to build your practice session
                        </Typography>
                    </Box>
                )}

                {plays.length > 0 && (
                    <Stack spacing={2}>
                        {groups.map((group) =>
                            group.stations.length > 1 ? (
                                <StationBlock
                                    key={`stations-${group.stations[0].id}`}
                                    label={stationBlockLabel(group.stations.length, group.wallMinutes)}
                                    warnings={overlapMessages(group, warnings.overlaps)}
                                >
                                    {group.stations.map(renderCard)}
                                </StationBlock>
                            ) : (
                                renderCard(group.stations[0])
                            )
                        )}
                    </Stack>
                )}
            </Stack>
        </Paper>
    );
}
```

- [ ] **Step 6: Run the tests, type-check, lint, and measure**

Run: `bun run test __tests__/lib/utils/session-timeline.test.ts __tests__/components/features/practice-planner`
Expected: PASS. That covers the warning tables, the editor warning tests, the earlier station tests, the characterization suite and the line budget.

Run: `bun run type-check && bun run lint`
Expected: no errors.

Run: `wc -l components/features/practice-planner/PracticeSessionEditor.tsx`
Expected: about 871 lines, and at most 900.

- [ ] **Step 7: Commit**

```bash
git add lib/utils/session-timeline.ts components/features/practice-planner/useVenueBooking.ts "app/(dashboard)/practice-planner/venue-booking-options.ts" components/features/practice-planner/PracticeSessionEditor.tsx components/features/practice-planner/SessionDrillList.tsx components/features/practice-planner/SessionDrillCard.tsx __tests__/lib/utils/session-timeline.test.ts __tests__/components/features/practice-planner/PracticeSessionEditor.stations.test.tsx
git commit -m "feat(practice-planner): warn about overlapping stations and drills larger than the booked ice

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 6: `StationMap` — one rink, each station clipped to its area

**Files:**
- Create: `lib/utils/canvas/station-map.ts`
- Create: `components/features/practice-planner/StationMap.tsx`
- Test: `__tests__/lib/utils/canvas/station-map.test.ts` (create)
- Test: `__tests__/components/features/practice-planner/StationMap.test.tsx` (create)

**Interfaces:**
- Consumes (2a):
  - `areaRect` (`lib/utils/ice-area.ts:32`);
  - `drawRink(ctx, transform, { cache: false })` (`rink-renderer.ts:239`);
  - `rinkToCanvas`, `createTransformContext`;
  - `drawAllElements(ctx, playData, transform)` (`drawing-utils.ts:272`);
  - `BOARD_COLORS` (`notation.ts:7`);
  - `PLAY_DATA_UNREADABLE_MESSAGE` (`play-data.ts:288`);
  - `PlayLegend` (`PlayLegend.tsx:52`).
- Produces (`lib/utils/canvas/station-map.ts`):
  - `interface StationMapStation { name: string; playData: PlayData | null }`
  - `stationLabel(position: number, name: string): string`, which returns `"1 · Breakout"`
  - `drawStationMap(ctx: CanvasRenderingContext2D, transform: TransformContext, stations: StationMapStation[], activeIndex: number): void`
  - `combinedLegendData(stations: StationMapStation[]): PlayData | null`
- Produces (`StationMap.tsx`):
  - `StationMap(props: { stations: StationMapStation[]; activeIndex: number })`.
  - It renders a `<canvas role="img" aria-label="Station map: 1 · A, 2 · B">` and one combined `PlayLegend`.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/lib/utils/canvas/station-map.test.ts`:

```ts
/** Station map (2b): each station's drawing clipped to its area, outlined, and labelled. */
import { beforeEach, describe, expect, it } from "vitest";
import { combinedLegendData, drawStationMap, stationLabel, type StationMapStation } from "@/lib/utils/canvas/station-map";
import { clearRinkCache, createTransformContext, rinkToCanvas } from "@/lib/utils/canvas/rink-renderer";
import { createEmptyPlayData, PLAY_DATA_UNREADABLE_MESSAGE } from "@/lib/utils/play-data";
import type { PlayData } from "@/types/practice-planner";

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

const t = createTransformContext(960, 420, 12);

const breakout: PlayData = {
    ...createEmptyPlayData(),
    area: { kind: "zone-left" },
    players: [{ id: "p1", role: "F", label: "", color: "#1976D2", position: { x: 30, y: 40 } }],
};
const regroup: PlayData = {
    ...createEmptyPlayData(),
    area: { kind: "zone-right" },
    equipment: [{ id: "n1", kind: "net", position: { x: 180, y: 42 }, rotation: 0 }],
};

function draw(stations: StationMapStation[], activeIndex = 0): Call[] {
    const calls: Call[] = [];
    drawStationMap(recordingCtx(calls), t, stations, activeIndex);
    return calls;
}

const texts = (calls: Call[]) => calls.filter((c) => c.name === "fillText").map((c) => c.args[0]);

describe("stationLabel", () => {
    it("numbers a station and names its drill", () => {
        expect(stationLabel(1, "Breakout")).toBe("1 · Breakout");
    });
});

describe("drawStationMap", () => {
    beforeEach(() => clearRinkCache());

    it("clips each station's drawing to its own area", () => {
        const calls = draw([{ name: "Breakout", playData: breakout }, { name: "Regroup", playData: regroup }]);

        expect(calls.filter((c) => c.name === "clip")).toHaveLength(2);
        const clipRects = calls.filter((c, i) => c.name === "rect" && calls[i + 1]?.name === "clip");
        const origin = rinkToCanvas({ x: 0, y: 0 }, t);
        expect(clipRects[0].args[0]).toBeCloseTo(origin.x, 9);
        expect(clipRects[0].args[2]).toBeCloseTo(rinkToCanvas({ x: 75, y: 0 }, t).x - origin.x, 9);
        expect(clipRects[1].args[0]).toBeCloseTo(rinkToCanvas({ x: 125, y: 0 }, t).x, 9);
    });

    it("draws a station's elements between its clip and the restore", () => {
        const calls = draw([{ name: "Breakout", playData: breakout }, { name: "Empty", playData: createEmptyPlayData() }]);
        const clips = calls.flatMap((c, i) => (c.name === "clip" ? [i] : []));
        const nextRestore = (from: number) => calls.findIndex((c, i) => i > from && c.name === "restore");

        expect(nextRestore(clips[0]) - clips[0]).toBeGreaterThan(1);
        expect(nextRestore(clips[1]) - clips[1]).toBe(1);
    });

    it("labels every station '<n> · <name>' and highlights the active one", () => {
        const calls = draw([{ name: "Breakout", playData: breakout }, { name: "Regroup", playData: regroup }], 1);

        expect(texts(calls)).toEqual(expect.arrayContaining(["1 · Breakout", "2 · Regroup"]));
        // The dash set just before each outline: dashed for the others, solid for the active station.
        const outlineDashes = calls.flatMap((c, i) => (c.name === "strokeRect" ? [calls[i - 1].args[0]] : []));
        expect(outlineDashes).toEqual([[8, 6], []]);
    });

    it("still outlines and labels an unreadable station, with the unreadable message", () => {
        const calls = draw([{ name: "Breakout", playData: breakout }, { name: "Lost", playData: null }]);

        expect(calls.filter((c) => c.name === "clip")).toHaveLength(2);
        expect(calls.filter((c) => c.name === "strokeRect")).toHaveLength(2);
        expect(texts(calls)).toEqual(expect.arrayContaining(["2 · Lost", PLAY_DATA_UNREADABLE_MESSAGE]));
    });

    it("stacks the labels of stations that share a corner", () => {
        const calls = draw([
            { name: "Full", playData: createEmptyPlayData() },
            { name: "Half", playData: { ...createEmptyPlayData(), area: { kind: "half-left" } } },
        ]);
        const ys = calls.filter((c) => c.name === "fillText").map((c) => c.args[2] as number);

        expect(ys).toHaveLength(2);
        expect(ys[1]).toBeGreaterThan(ys[0]);
    });
});

describe("combinedLegendData", () => {
    it("merges every readable station's symbols, without an area", () => {
        const merged = combinedLegendData([
            { name: "Breakout", playData: breakout },
            { name: "Lost", playData: null },
            { name: "Regroup", playData: regroup },
        ]);

        expect(merged?.players).toEqual(breakout.players);
        expect(merged?.equipment).toEqual(regroup.equipment);
        expect(merged).not.toHaveProperty("area");
    });

    it("is null when no station can be read", () => {
        expect(combinedLegendData([{ name: "Lost", playData: null }])).toBeNull();
    });
});
```

Create `__tests__/components/features/practice-planner/StationMap.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { StationMap } from "@/components/features/practice-planner/StationMap";
import { clearRinkCache } from "@/lib/utils/canvas/rink-renderer";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import type { PlayData } from "@/types/practice-planner";

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

const breakout: PlayData = {
    ...createEmptyPlayData(),
    area: { kind: "zone-left" },
    players: [{ id: "p1", role: "F", label: "", color: "#1976D2", position: { x: 30, y: 40 } }],
};
const regroup: PlayData = {
    ...createEmptyPlayData(),
    area: { kind: "zone-right" },
    equipment: [{ id: "n1", kind: "net", position: { x: 180, y: 42 }, rotation: 0 }],
};

let byCanvas: Map<HTMLCanvasElement, Call[]>;

beforeEach(() => {
    clearRinkCache();
    byCanvas = new Map();
    // One recording context per canvas, so the map is told apart from the legend's swatches.
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
        const calls: Call[] = [];
        byCanvas.set(this, calls);
        return recordingCtx(calls);
    } as unknown as HTMLCanvasElement["getContext"]);
});

afterEach(() => {
    vi.restoreAllMocks();
});

function renderMap() {
    render(
        <ThemeProvider theme={createTheme()}>
            <StationMap
                stations={[{ name: "Breakout", playData: breakout }, { name: "Regroup", playData: regroup }]}
                activeIndex={0}
            />
        </ThemeProvider>,
    );
}

describe("StationMap", () => {
    it("draws one clipped region per station and names the stations for screen readers", () => {
        renderMap();
        const map = screen.getByRole("img", { name: "Station map: 1 · Breakout, 2 · Regroup" });
        const calls = byCanvas.get(map as HTMLCanvasElement) ?? [];

        expect(calls.filter((c) => c.name === "clip")).toHaveLength(2);
        expect(calls.filter((c) => c.name === "fillText").map((c) => c.args[0])).toEqual(
            expect.arrayContaining(["1 · Breakout", "2 · Regroup"]),
        );
    });

    it("shows one legend combining every station's symbols", () => {
        renderMap();
        expect(screen.getByText("Legend (2)")).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test __tests__/lib/utils/canvas/station-map.test.ts __tests__/components/features/practice-planner/StationMap.test.tsx`
Expected: FAIL. The modules `@/lib/utils/canvas/station-map` and `@/components/features/practice-planner/StationMap` can't be resolved.

- [ ] **Step 3: Write `drawStationMap`**

Create `lib/utils/canvas/station-map.ts`:

```ts
/**
 * Station map (practice planner 2b): one rink with each station's drawing
 * clipped to its own ice area, outlined, and labelled "1 · Drill name". Uses
 * drawBoardScene's pieces (drawRink, drawAllElements) rather than
 * drawBoardScene itself, which draws every element unclipped and adds a mask.
 * Pure canvas calls, so it is tested with a recording context; StationMap.tsx
 * hosts it.
 */
import type { PlayData } from "@/types/practice-planner";
import { areaRect } from "@/lib/utils/ice-area";
import { PLAY_DATA_UNREADABLE_MESSAGE } from "@/lib/utils/play-data";
import { drawRink, rinkToCanvas, type TransformContext } from "./rink-renderer";
import { drawAllElements } from "./drawing-utils";
import { BOARD_COLORS } from "./notation";

export interface StationMapStation {
    /** The drill's name, shown in the station's label. */
    name: string;
    /** null = the drill's stored data couldn't be read: outlined over the whole rink and labelled, nothing drawn. */
    playData: PlayData | null;
}

const LABEL_FONT = "700 14px sans-serif";
const MESSAGE_FONT = "400 12px sans-serif";
const LABEL_INSET_PX = 6;
const LABEL_LINE_PX = 18;
const LABEL_BACKING = "rgba(255, 255, 255, 0.85)";
const OUTLINE_PX = 2;
const ACTIVE_OUTLINE_PX = 4;
const OUTLINE_DASH = [8, 6];

/** "1 · Breakout": a station's number in its block, then its drill's name. */
export function stationLabel(position: number, name: string): string {
    return `${position} · ${name}`;
}

function drawLabelLine(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, font: string, color: string): void {
    ctx.font = font;
    const width = ctx.measureText(text).width;
    ctx.fillStyle = LABEL_BACKING;
    ctx.fillRect(x - 2, y - 2, width + 4, LABEL_LINE_PX);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
}

/**
 * Draws the whole rink, then each station: its elements clipped to its area,
 * a dashed outline (solid and thicker for the active station), and its label.
 * Labels of stations that share a top-left corner stack instead of overlapping.
 */
export function drawStationMap(
    ctx: CanvasRenderingContext2D,
    transform: TransformContext,
    stations: StationMapStation[],
    activeIndex: number,
): void {
    drawRink(ctx, transform, { cache: false });
    const labelOffsets = new Map<string, number>();

    stations.forEach((station, i) => {
        const rect = areaRect(station.playData?.area);
        const topLeft = rinkToCanvas({ x: rect.x, y: rect.y }, transform);
        const bottomRight = rinkToCanvas({ x: rect.x + rect.w, y: rect.y + rect.h }, transform);
        const width = bottomRight.x - topLeft.x;
        const height = bottomRight.y - topLeft.y;

        ctx.save();
        ctx.beginPath();
        ctx.rect(topLeft.x, topLeft.y, width, height);
        ctx.clip();
        if (station.playData) drawAllElements(ctx, station.playData, transform);
        ctx.restore();

        const active = i === activeIndex;
        const color = active ? BOARD_COLORS.actionBlue : BOARD_COLORS.ink;
        const corner = `${rect.x},${rect.y}`;
        const offset = labelOffsets.get(corner) ?? 0;
        labelOffsets.set(corner, offset + (station.playData ? 1 : 2) * LABEL_LINE_PX);
        const textX = topLeft.x + LABEL_INSET_PX;
        const textY = topLeft.y + LABEL_INSET_PX + offset;

        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = active ? ACTIVE_OUTLINE_PX : OUTLINE_PX;
        ctx.setLineDash(active ? [] : OUTLINE_DASH);
        ctx.strokeRect(topLeft.x, topLeft.y, width, height);
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        drawLabelLine(ctx, stationLabel(i + 1, station.name), textX, textY, LABEL_FONT, color);
        if (!station.playData) {
            drawLabelLine(ctx, PLAY_DATA_UNREADABLE_MESSAGE, textX, textY + LABEL_LINE_PX, MESSAGE_FONT, color);
        }
        ctx.restore();
    });
}

/** One PlayData holding every readable station's symbols, for a single legend; null when none can be read. */
export function combinedLegendData(stations: StationMapStation[]): PlayData | null {
    const readable = stations.flatMap((station) => (station.playData ? [station.playData] : []));
    if (readable.length === 0) return null;
    return {
        version: readable[0].version,
        players: readable.flatMap((data) => data.players),
        drawings: readable.flatMap((data) => data.drawings),
        equipment: readable.flatMap((data) => data.equipment),
        annotations: readable.flatMap((data) => data.annotations),
    };
}
```

- [ ] **Step 4: Write the component**

Create `components/features/practice-planner/StationMap.tsx`:

```tsx
"use client";

/**
 * Station map (practice planner 2b): every station of a block on one rink,
 * each clipped to its own area, the active one highlighted, and one legend
 * combining the stations' symbols.
 */

import { useEffect, useRef } from "react";
import { Stack } from "@mui/material";
import { createTransformContext } from "@/lib/utils/canvas/rink-renderer";
import {
    combinedLegendData,
    drawStationMap,
    stationLabel,
    type StationMapStation,
} from "@/lib/utils/canvas/station-map";
import { PlayLegend } from "./PlayLegend";

// Intrinsic canvas size; CSS scales it to the container's width.
const MAP_WIDTH = 960;
const MAP_HEIGHT = 420;
const MAP_PADDING = 12;

export interface StationMapProps {
    stations: StationMapStation[];
    /** Index into `stations` of the drill being viewed. */
    activeIndex: number;
}

export function StationMap({ stations, activeIndex }: StationMapProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const ctx = canvasRef.current?.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
        drawStationMap(ctx, createTransformContext(MAP_WIDTH, MAP_HEIGHT, MAP_PADDING), stations, activeIndex);
    }, [stations, activeIndex]);

    const description = stations.map((station, index) => stationLabel(index + 1, station.name)).join(", ");

    return (
        <Stack spacing={1}>
            <canvas
                ref={canvasRef}
                width={MAP_WIDTH}
                height={MAP_HEIGHT}
                role="img"
                aria-label={`Station map: ${description}`}
                style={{ width: "100%", height: "auto", display: "block" }}
            />
            <PlayLegend playData={combinedLegendData(stations)} />
        </Stack>
    );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun run test __tests__/lib/utils/canvas/station-map.test.ts __tests__/components/features/practice-planner/StationMap.test.tsx __tests__/lib/utils/canvas`
Expected: PASS.

Run: `bun run type-check && bun run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/utils/canvas/station-map.ts components/features/practice-planner/StationMap.tsx __tests__/lib/utils/canvas/station-map.test.ts __tests__/components/features/practice-planner/StationMap.test.tsx
git commit -m "feat(practice-planner): station map with each station clipped to its ice area

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 7: Session detail view — station blocks, station map, wall time, fit chip

**Files:**
- Modify: `app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx`:
  - imports :3 and :45-52;
  - `SessionPlay` :54-66 and `SessionData` :68-86;
  - totals :152-159;
  - booking line :263-279;
  - sidebar list :398-508;
  - viewer :554;
  - a new `SidebarPlayCard` at the end of the file.
- Test: `__tests__/app/practice-session-detail-stations.test.tsx` (create)

**Interfaces:**
- Consumes:
  - Task 2: `groupStations`, `sessionWallMinutes`, `stationBlockLabel`.
  - Task 3: `getPracticeSessionDetail`'s `segmentKind` and `plays[].runsWithPrevious`. The page passes `data.session` straight through, so `[sessionId]/page.tsx` is unchanged.
  - Task 5: `stationWarnings`, `SEGMENT_KIND_FIT_LABELS`.
  - Task 6: `StationMap`.
- Produces:
  - `SessionPlay.runsWithPrevious: boolean` and `SessionData.segmentKind?: SegmentKind | null`.
  - A local `SidebarPlayCard({ sp, index, active, onSelect })`.
  - Previous and Next still step one drill at a time.

- [ ] **Step 1: Write the failing test**

Create `__tests__/app/practice-session-detail-stations.test.tsx`:

```tsx
/** Session detail view with station blocks (practice planner 2b). */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import type { IceArea } from "@/types/practice-planner";

vi.mock("@/lib/actions/practice-sessions", () => ({ deletePracticeSession: vi.fn(), sharePracticeSession: vi.fn() }));
vi.mock("@/lib/actions/practice-session-drills", () => ({ duplicatePracticeSession: vi.fn() }));
// The map's canvas drawing is tested in StationMap.test.tsx; here, only what it is given.
vi.mock("@/components/features/practice-planner/StationMap", () => ({
    StationMap: ({ stations, activeIndex }: { stations: Array<{ name: string }>; activeIndex: number }) => (
        <div data-testid="station-map">{`${activeIndex}:${stations.map((station) => station.name).join("|")}`}</div>
    ),
}));

import { SessionDetailView } from "@/app/(dashboard)/practice-planner/[sessionId]/SessionDetailView";

function sessionPlay(name: string, sequence: number, runsWithPrevious: boolean, duration: number, area?: IceArea) {
    return {
        id: `row-${name}`,
        sequence,
        duration,
        runsWithPrevious,
        instructions: null,
        play: {
            id: `play-${name}`,
            name,
            description: null,
            thumbnail: null,
            playData: { ...createEmptyPlayData(), ...(area ? { area } : {}) },
        },
    };
}

const SESSION = {
    id: "csessionxxxxxxxxxxxxxxxxx",
    title: "Tuesday",
    date: "2026-04-07T22:00:00.000Z",
    duration: 60,
    isShared: false,
    createdByName: "Coach",
    teamId: "cteamxxxxxxxxxxxxxxxxxxxx",
    teamName: "Team",
    venueName: "Test Rink",
    surfaceName: "Main",
    segmentName: "Half A",
    segmentKind: "HALF" as const,
    startAt: null,
    plays: [
        sessionPlay("Breakout", 0, false, 15), // full ice: too big for a half-ice booking
        sessionPlay("Regroup", 1, true, 10, { kind: "zone-left" }),
        sessionPlay("Shooting", 2, false, 10, { kind: "half-right" }),
    ],
};

function renderView() {
    render(
        <ThemeProvider theme={createTheme()}>
            <SessionDetailView session={SESSION} isAdmin={false} />
        </ThemeProvider>,
    );
}

describe("SessionDetailView stations (2b)", () => {
    it("groups stations in the sidebar under one header", () => {
        renderView();
        const block = screen.getByRole("group", { name: "Stations · 2 · 15 min" });

        expect(within(block).getByText("Stations · 2 · 15 min")).toBeInTheDocument();
        expect(within(block).getByText("Breakout")).toBeInTheDocument();
        expect(within(block).getByText("Regroup")).toBeInTheDocument();
        expect(within(block).queryByText("Shooting")).not.toBeInTheDocument();
    });

    it("shows the station map for a grouped drill, highlighting it, while Next steps one drill at a time", () => {
        renderView();
        expect(screen.getByTestId("station-map")).toHaveTextContent("0:Breakout|Regroup");

        fireEvent.click(screen.getByRole("button", { name: "Next play" }));
        expect(screen.getByTestId("station-map")).toHaveTextContent("1:Breakout|Regroup");

        fireEvent.click(screen.getByRole("button", { name: "Next play" }));
        expect(screen.getByText("Play 3 of 3")).toBeInTheDocument();
        expect(screen.queryByTestId("station-map")).not.toBeInTheDocument();
    });

    it("opens a grouped drill from the sidebar with its station highlighted", () => {
        renderView();
        fireEvent.click(within(screen.getByRole("group", { name: "Stations · 2 · 15 min" })).getByText("Regroup"));
        expect(screen.getByTestId("station-map")).toHaveTextContent("1:Breakout|Regroup");
    });

    it("measures time allocation by wall time", () => {
        renderView();
        expect(screen.getByText("25 / 60 min")).toBeInTheDocument();
    });

    it("shows the fit warning next to the booking line", () => {
        renderView();
        expect(screen.getByText("1 drill larger than the booked half ice")).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test __tests__/app/practice-session-detail-stations.test.tsx`
Expected: FAIL. There is no `group` named `Stations · 2 · 15 min` and no station map, the time reads `35 / 60 min`, and there is no fit chip.

- [ ] **Step 3: Wire the timeline into `SessionDetailView.tsx`**

1. Replace `import { useState, useCallback } from "react";` with `import { useState, useCallback, useMemo } from "react";`.
2. After `import { PlayLegend } from "@/components/features/practice-planner/PlayLegend";` add `import { StationMap } from "@/components/features/practice-planner/StationMap";`.
3. After `import type { PlayData } from "@/types/practice-planner";` add:

```ts
import type { SegmentKind } from "@prisma/client";
import {
  SEGMENT_KIND_FIT_LABELS,
  groupStations,
  sessionWallMinutes,
  stationBlockLabel,
  stationWarnings,
} from "@/lib/utils/session-timeline";
```

4. In `interface SessionPlay`, after `  instructions: string | null;` add `  runsWithPrevious: boolean;`. In `interface SessionData`, after `  segmentName?: string | null;` add `  segmentKind?: SegmentKind | null;`.
5. Replace `  const totalPlayTime = session.plays.reduce((sum, p) => sum + p.duration, 0);` with:

```ts
  // Station blocks run at the same time, so time allocation is wall time (2b).
  const totalPlayTime = sessionWallMinutes(session.plays);
```

6. Replace `  const activePlay = session.plays[activePlayIndex] ?? null;` with:

```ts
  const activePlay = session.plays[activePlayIndex] ?? null;
  const groups = useMemo(() => groupStations(session.plays), [session.plays]);
  const activeGroup = activePlay
    ? groups.find((group) => group.stations.includes(activePlay)) ?? null
    : null;
  const stationMapStations = useMemo(
    () =>
      activeGroup && activeGroup.stations.length > 1
        ? activeGroup.stations.map((sp) => ({ name: sp.play.name, playData: sp.play.playData }))
        : null,
    [activeGroup]
  );
  // Advisory fit check against the booked segment's kind (2b); unreadable drills are skipped.
  const fitLabel = session.segmentKind ? SEGMENT_KIND_FIT_LABELS[session.segmentKind] : null;
  const tooBigCount = useMemo(
    () =>
      stationWarnings(
        groupStations(
          session.plays.map((sp) => ({ ...sp, area: sp.play.playData ? sp.play.playData.area : null }))
        ),
        session.segmentKind ?? null
      ).tooBig.length,
    [session.plays, session.segmentKind]
  );
```

7. In the booking line, replace

```tsx
                      .filter(Boolean)
                      .join(" · ")}
                  </Typography>
```

with

```tsx
                      .filter(Boolean)
                      .join(" · ")}
                  </Typography>
                  {fitLabel && tooBigCount > 0 && (
                    <Chip
                      size="small"
                      color="warning"
                      variant="outlined"
                      label={`${tooBigCount} drill${tooBigCount === 1 ? "" : "s"} larger than the booked ${fitLabel}`}
                    />
                  )}
```

8. Replace the sidebar list (:398-508). It runs from the `<Stack spacing={1}>` right after the "Play Sequence" `</Typography>` through that Stack's closing `</Stack>`, which sits directly before the sidebar's `</Box>` and `{/* Main play viewer */}`. Its first lines are

```tsx
            <Stack spacing={1}>
              {session.plays.map((sp, index) => (
                <Card
                  key={sp.id}
                  onClick={() => setActivePlayIndex(index)}
```

Replace the whole span with:

```tsx
            <Stack spacing={1}>
              {groups.map((group) => {
                const cards = group.stations.map((sp) => {
                  const index = session.plays.indexOf(sp);
                  return (
                    <SidebarPlayCard
                      key={sp.id}
                      sp={sp}
                      index={index}
                      active={index === activePlayIndex}
                      onSelect={() => setActivePlayIndex(index)}
                    />
                  );
                });
                if (group.stations.length === 1) return cards[0];
                const label = stationBlockLabel(group.stations.length, group.wallMinutes);
                return (
                  <Box
                    key={`stations-${group.stations[0].id}`}
                    role="group"
                    aria-label={label}
                    sx={{ border: 2, borderColor: "primary.main", borderRadius: 1, p: 1 }}
                  >
                    <Typography
                      variant="caption"
                      component="p"
                      sx={{
                        mb: 1,
                        fontWeight: 800,
                        color: "primary.main",
                        textTransform: "uppercase",
                        letterSpacing: 1,
                      }}
                    >
                      {label}
                    </Typography>
                    <Stack spacing={1}>{cards}</Stack>
                  </Box>
                );
              })}
            </Stack>
```

9. Directly before `                {/* Thumbnail / rink preview */}` insert:

```tsx
                {/* Station map (2b): the active drill's whole block, this station highlighted */}
                {stationMapStations && activeGroup && (
                  <Box sx={{ px: 3, pt: 2 }}>
                    <StationMap
                      stations={stationMapStations}
                      activeIndex={activeGroup.stations.indexOf(activePlay)}
                    />
                  </Box>
                )}

```

10. At the end of the file, after `SessionDetailView`'s closing `}`, add the sidebar card. Its JSX is the old list item, with `index === activePlayIndex` replaced by `active`:

```tsx
interface SidebarPlayCardProps {
  sp: SessionPlay;
  index: number;
  active: boolean;
  onSelect: () => void;
}

/** One drill in the sidebar's play sequence; standalone or inside a station block (2b). */
function SidebarPlayCard({ sp, index, active, onSelect }: SidebarPlayCardProps) {
  return (
    <Card
      onClick={onSelect}
      sx={{
        cursor: "pointer",
        border: "2px solid",
        borderColor: active ? "primary.main" : "transparent",
        bgcolor: active ? "rgba(25, 118, 210, 0.04)" : "background.paper",
        boxShadow: active ? 2 : 0,
        transition: "all 0.15s ease",
        "&:hover": {
          borderColor: active ? "primary.main" : "primary.light",
          bgcolor: "rgba(25, 118, 210, 0.04)",
        },
      }}
    >
      <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          {/* Play number */}
          <Box
            sx={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              bgcolor: active ? "primary.main" : "grey.200",
              color: active ? "primary.contrastText" : "text.secondary",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              fontSize: "0.75rem",
              fontWeight: 700,
            }}
          >
            {index + 1}
          </Box>

          {/* Thumbnail */}
          <Box
            sx={{
              width: 48,
              height: 32,
              borderRadius: 1,
              bgcolor: "grey.100",
              overflow: "hidden",
              position: "relative",
              flexShrink: 0,
            }}
          >
            {sp.play.thumbnail ? (
              <Image
                src={sp.play.thumbnail}
                alt=""
                fill
                style={{ objectFit: "cover" }}
                unoptimized
              />
            ) : (
              <Box
                sx={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <HockeyIcon sx={{ fontSize: 14, color: "grey.400" }} />
              </Box>
            )}
          </Box>

          {/* Name & duration */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="body2"
              fontWeight={600}
              noWrap
              sx={{ fontSize: "0.8rem" }}
            >
              {sp.play.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {sp.duration} min
            </Typography>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run the tests, type-check, lint**

Run: `bun run test __tests__/app/practice-session-detail-stations.test.tsx __tests__/rsc-boundary-guard.test.ts`
Expected: PASS.

Run: `bun run type-check && bun run lint`
Expected: no errors. If lint flags an unused import, it is the result of a missed edit; re-check Step 3 rather than deleting the import.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx" __tests__/app/practice-session-detail-stations.test.tsx
git commit -m "feat(practice-planner): station blocks and station map on the session page

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 8: Spec amendments and full gates

**Files:**
- Modify: `docs/superpowers/specs/2026-10-03-practice-session-stations-design.md`
- Modify: `docs/superpowers/specs/2026-10-03-practice-planner-roadmap.md` (phase table row 5)

**Interfaces:**
- Consumes: everything from Tasks 1-7.
- Produces: the spec matches what shipped; every gate is green.

- [ ] **Step 1: Amend the spec**

In `docs/superpowers/specs/2026-10-03-practice-session-stations-design.md`:

1. Set the Status line to `**Status:** Implemented (2b)`.
2. **Data model:** name the migration folder `20261003130000_practice_session_play_runs_with_previous`.
3. **Shared timeline module:**
   - Add the extra exports (Spec deviation 4).
   - Add the server/editor ordering rule (deviation 3).
   - Change the `stationWarnings` input to `area?: IceArea | null`, where `null` means unreadable and is skipped (deviation 8).
   - Add the `moveItem` edge rules (deviation 5), the footprint classification (deviation 6) and the 1 ft overlap rule (deviation 7).
   - State that the fit check covers every drill (deviation 9).
4. **Server actions:**
   - The shared item schema already existed (deviation 1).
   - Errors carry no `details`, with their verbatim copy (deviation 2).
   - Which reads changed (deviation 14) and the edit-load normalization (deviation 15).
   - `validatePlayDurations` was removed (deviation 13).
5. **Components:**
   - The disabled-switch tooltip copy.
   - The editor keeps its `Total Play Time` copy, now measuring wall time (deviation 11).
   - The overlap and fit copy.
   - The optional `kind` on booking types (deviation 16).
   - `StationMap` = `drawStationMap` + `PlayLegend` (deviation 12).
   - The detail view's fit chip copy.
6. **Error handling:** wall time over the duration is warned in the editor and rejected by the server, not blocked before the request (deviation 10).
7. Add a section **Open questions (defaults shipped)** listing the three product-owner questions from this plan, each with its default.

In `docs/superpowers/specs/2026-10-03-practice-planner-roadmap.md`, change row 5 of the phase table from `| 5 | 2b: stations | Spec to write |` to `| 5 | 2b: stations | Spec \`2026-10-03-practice-session-stations-design.md\`; implemented on \`feat/practice-stations\` |`.

- [ ] **Step 2: Run every gate**

Run: `bun run type-check && bun run lint && bun run check:raw-sql && bun run test && bun run build`
Expected: all green. `bun run build` catches Next route and RSC problems that `type-check` misses.
- Report any failure verbatim.
- If a failure is outside the practice planner, check `gh run list --branch main --limit 3` before blaming this branch. On this repo, absolute-date fixtures have rotted on `main` before.

Run: `wc -l components/features/practice-planner/PracticeSessionEditor.tsx`
Expected: at most 900 (about 871). Report the number.

Run: `bun run adr:check prisma/schema.prisma lib/actions/practice-sessions.ts lib/actions/practice-session-queries.ts lib/utils/session-timeline.ts "app/(dashboard)/practice-planner/venue-booking-options.ts"`
Expected: it lists 0002, 0003, 0007 (and 0012 where segment paths match), with no violations to act on.

**Manual check.** The dev database is far behind on migrations, so don't click through live pages against it. If a migrated database is available (for example a CI preview), check the following:
- An existing session opens with every drill sequential and its total unchanged.
- In the editor, turn on "Run as a station with the previous drill" on drills 2 and 3 of a 20-minute session with three 15-minute drills. The block reads "Stations · 3 · 15 min" and saves.
- Reload: still grouped.
- Duplicate the session: the copy is still grouped.
- Open the session page: the sidebar block and the station map show.

Report which of these you did.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-10-03-practice-session-stations-design.md docs/superpowers/specs/2026-10-03-practice-planner-roadmap.md
git commit -m "docs(practice-planner): fold 2b planning decisions into the stations spec

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

## Self-Review

**1. Spec coverage.**

| Spec requirement | Task |
|---|---|
| `runsWithPrevious Boolean @default(false)`, hand-written additive migration | 1 |
| Duplicate copies the flag with no change to `SESSION_PLAY_FIELDS_NOT_COPIED`, plus an explicit assertion | 1 (enum guard passes untouched), 3 (explicit test) |
| `session-timeline.ts`: `groupStations`, `sessionWallMinutes`, `normalizeGroups`, `toggleRunsWithPrevious`, `moveItem`, `removeItem` and their rules, including the cap | 2 |
| `stationWarnings`: overlap > 1 ft via `areaRect`, full ice overlaps everything, too-big table per `SegmentKind` | 5 |
| Shared `practiceSessionPlayInputSchema` with `runsWithPrevious: z.boolean().default(false)` | 1 |
| Create/update: group check (first drill, cap); wall time replaces the sum with the specified message; flag in nested creates; 3a materialize and reservation code unchanged | 3 |
| Reads: the flag on every session-play read; `segment.kind` wherever the segment is selected (re-grepped: `practice-sessions.ts:1229`, `practice-session-queries.ts:143`, `venue-booking-options.ts:109,148`) | 3, 5 |
| Wrappers map the field | 3 |
| Warnings client-only, never blocking | 5 (overlap test saves anyway) |
| `PlayInSession.runsWithPrevious` | 3 |
| Switch on every card after the first, disabled with a tooltip at the cap, 44px target | 4 |
| Outlined block "Stations · N · M min", warnings inline | 4, 5 |
| Move/delete through the timeline helpers; summary uses `sessionWallMinutes` | 4 |
| Booked segment kind from the booking options | 5 |
| Editor ≤ 900 lines, new logic in list/card | 4 (guard test), 5, 8 (`wc -l`) |
| `StationMap`: whole rink, per-station clip + `drawAllElements` + outline + numbered label, active highlighted, combined legend | 6 |
| Detail view: sidebar "Stations" grouping, map above the thumbnail for grouped drills, Previous/Next one drill at a time, fit chip next to the booking line | 7 |
| Error handling: invalid group / over-long timeline return `ActionResult` errors; unreadable drill renders outlined with the unreadable message | 3, 6 |
| Every existing session opens unchanged | 2, 3, 4 (Review Focus 1) |
| Testing list (timeline exhaustive, actions, components, `StationMap` mocked context, migration via CI, gates) | 2-8 |

No gaps.

**2. Placeholder scan.** There is no "TBD", "TODO" or "similar to Task N". Every code step carries complete code: full files for new modules and for the two components that are replaced whole, and exact before-and-after snippets for edits. Two kinds of step are mechanical by design and come with a verification command:
- line-range deletions (`sed`, Task 3 Steps 6-7);
- fixture insertions (`perl`, Task 3 Step 7).

Task 7 Step 3.10 re-states the moved sidebar card in full rather than pointing at a line range.

**3. Type consistency.**

| Name | Defined in | Used by |
|---|---|---|
| `TimelinePlay`, `StationGroup<T>` | Task 2 | Tasks 3 (`validateWallTime`), 4, 5 and 7 |
| `stationBlockLabel` | Task 2 | Task 4 (editor block), Task 7 (sidebar block) |
| `FIRST_DRILL_STATION_ERROR`, `STATION_GROUP_CAP_ERROR` | Task 2 | Task 3's tests |
| `StationArea`, `stationWarnings`, `SEGMENT_KIND_FIT_LABELS` | Task 5 | Task 5 (`SessionDrillList`), Task 7 |
| `SegmentBookingOption` | Task 5 (`useVenueBooking.ts`) | `venue-booking-options.ts`, `PracticeSessionEditor.tsx` |
| `booking.segmentKind` | Task 5 | `SessionDrillList`'s `segmentKind` prop |
| `StationMapStation` | Task 6 | Task 7 (`{ name, playData }`) |
| `SessionDrillCardProps` (`canMoveUp`, `canMoveDown`, `station`, `onToggleStation`) | Task 4 | `SessionDrillList` (Task 4) |
| `fitWarning` | Task 5 | `SessionDrillList` (Task 5) |
| `SessionDrillListProps.onToggleStation` | Task 4 | the editor (Task 4), the busy test (Task 4) |
| `segmentKind` (optional prop) | Task 5 | the editor (Task 5) |

`getPracticeSessionDetail`'s `segmentKind` and `plays[].runsWithPrevious` (Task 3) match `SessionData`/`SessionPlay` (Task 7).

**4. Review Focus.** Each of the five lines has its test in the task that owns the code:

| # | Failure mode | Tests |
|---|---|---|
| 1 | Existing sequential sessions unchanged | Task 2 `sessionWallMinutes` "equals the sum…"; Task 3 "keeps an existing sequential session valid…"; Task 4 runs the characterization suite unchanged |
| 2 | Removing a group head | Task 2 `removeItem` "keeps the rest of a block together after a preceding block"; Task 4 editor delete test |
| 3 | Moving across groups | Task 2 `moveItem` table, including both block-edge rules; Task 4's three editor move tests |
| 4 | Wall time vs sum at the server, by sequence | Task 3 "accepts three 15-minute stations…", "rejects the same three drills…", "groups by sequence, not by payload order", "rejects a first drill (by sequence)…" |
| 5 | The flag on every write path without a 3a regression | Task 3: the ownership expectation gains only `runsWithPrevious: false`, the duplicate test copies `[false, true]`, and the create/update persist assertions |

**5. Dry run.** At planning time, the code blocks of Tasks 1-7 were applied in order to a scratch worktree at `71e1523` and then thrown away. Results:
- `bun run type-check`: 0 errors.
- `eslint` on every touched path: 0 errors. Its only two warnings are pre-existing, in `PlayLibrary.tsx`.
- `bun run check:raw-sql`: OK.
- The touched suites passed: 45 files and 578 tests, plus the detail-view test and `rsc-boundary-guard`.
- `PracticeSessionEditor.tsx` ended at 871 lines.

The dry run also turned up three fixes, all folded into this plan:
- The new editor test needs the `@/lib/actions/practice-session-drills` mock that the other editor tests use.
- The editor's `type PracticeVenueAttachment,` line appears in both its `import` and `export` blocks from `./useVenueBooking`, so the Task 5 edit now names the `import` block.
- Task 3 Step 6 now deletes `validatePlayDurations` by line range *before* the `PlayInSession` edit shifts those lines. In the dry run the shifted range happened to produce the same file, because both functions end in an identical `return { valid, errors }; }` tail.

`bun run build` and the migration were not run. CI covers the migration (ADR-0019); `build` is a Task 8 gate.

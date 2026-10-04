# Practice Timing: Blocks, Station Rotations and Transition Buffers — Design

**Date:** 2026-10-04
**Status:** Approved (design); implementation plan to follow in `../plans/2026-10-04-practice-timing.md`
**Applies to:** the hosted Next.js planner and the static Vite planner (`apps/planner/`). Both render the shared components in `components/features/practice-planner/`.
**Depends on:** stations (2b), session-owned drills (3a), bench sheet (3b, which excluded break/transition rows; this design reverses that), plan document (ADR-0020), goaltender-aware drills (#403).

## Context

A practice is an ordered list of drills (`PracticeSessionPlay`), each with its own minutes:
- `runsWithPrevious` groups drills into a station block that shares one time slot. The longest station sets the block's length.
- `lib/utils/session-timeline.ts` (pure, 356 lines) builds the schedule, wall time and station groups.
- The timeline, the session page, the bench sheet (`buildBenchSheetModel`) and the HTML/Word exports all read that one list.

What a coach can't express today:
- **Non-drill time:** warm-up, water breaks, transitions and cool-down. Coaches either leave it out, so start times drift, or fake it with a drill.
- **Rotations:** the station templates say "skater groups rotate every 5 minutes" in free text. The planner doesn't compute the block's length or show who is where.
- **Changeover time:** moving between drills takes a minute or two. Start times assume zero.

Verified facts about the code:
- Every `PracticeSessionPlay` row has a required `playId`. The FK is `NO ACTION DEFERRABLE INITIALLY DEFERRED` (migration `20261003120000_session_owned_plays`).
- 35 non-test files under `lib`, `components`, `app` and `apps/planner/src` read `sp.play.*` or `playId`.
- `copySessionPlayScalars` (`lib/services/practice-session-drills.ts:330`) is the single copy point for session-play columns.
- `PracticeSessionEditor.tsx` is 885 lines and `SessionDetailView.tsx` is 727, against a 900-line budget test.
- Practice-plan shared and updated emails (`lib/email/templates.ts`) show a drill count, not names.

## Goal

A coach plans the whole practice clock, not just the drills:
- warm-up, water-break, transition and cool-down rows on the timeline;
- station blocks that rotate groups through stations on a fixed interval, with a computed length and a rotation grid;
- an optional gap between blocks.

All of it appears on the timeline, the session page, the bench sheet, the HTML/Word exports and plan files, in both apps.

### Success criteria

1. A coach adds a Warm-up, Water break, Transition or Cool-down row in the session editor. Each has editable minutes, a label and an optional note. The row shows on the timeline and every output with no diagram.
2. A station block of 2 or more drills can rotate "every M min":
   - Stations marked **stays** (typically the goalie station) don't rotate.
   - The block lasts `M × rotating stations`.
   - Groups A, B, C… visit each rotating station once, and the grid appears in the editor, on the session page and on the bench sheet.
3. A practice can set **Between blocks** to 0–5 minutes. Start times include the gap. No gap is added inside a station block or after the last block.
4. Wall time, "Planned X of Y min" and goalie warnings account for blocks, rotations and gaps.
5. Existing practices, drills and plan files behave exactly as before.
6. The station templates use real rotation, and Skills Stations fills its 60 minutes.

## Rulings

### R1. One timeline list with a row kind

`PracticeSessionPlay` stays the single ordered list. Each row gets a `kind`:

| kind | Default label | Default minutes |
|---|---|---|
| `drill` | — (the drill's name) | as today |
| `warmup` | Warm-up | 8 |
| `break` | Water break | 2 |
| `transition` | Transition | 2 |
| `cooldown` | Cool-down | 5 |

**Why:**
- The rejected "separate block table" design would make two lists share one sequence, so every reorder, group, export and import would have to merge them.
- The rejected "breaks as hidden drills" design would put fake drills in the library, in copies and in plan files.

In TypeScript, rows are a discriminated union: `SessionRow = DrillRow | BlockRow`. A `BlockRow` has no `play`. Reading `play` without narrowing on `kind` is a type error. That is how the 35 call sites are found and fixed.

### R2. Columns and constraints (hand-written, additive migration)

**On `practice_session_plays`:**
- `kind` TEXT NOT NULL, default `'drill'`. CHECK: `kind IN ('drill','warmup','break','transition','cooldown')`.
- `playId` becomes nullable. CHECK: `(kind = 'drill') = ("playId" IS NOT NULL)`. The existing deferred FK is kept by hand, as the schema comment requires.
- `label` TEXT NULL. CHECK: `label IS NULL OR char_length(label) <= 60`. Only for non-drill rows. Empty or null means the kind's default label.
- `stays` BOOLEAN NOT NULL, default false.
- `rotateEveryMinutes` INTEGER NULL. CHECK: `"rotateEveryMinutes" IS NULL OR "rotateEveryMinutes" BETWEEN 1 AND 30`.

**On `practice_sessions`:**
- `transitionMinutes` INTEGER NOT NULL, default 0. CHECK: `"transitionMinutes" BETWEEN 0 AND 5`.

Existing rows become `drill`, `stays = false`, `rotateEveryMinutes = null` and `transitionMinutes = 0`. The dev DB is behind, so the migration is hand-written, and a test checks it against `schema.prisma`.

### R3. Row rules (Zod on input and import; normalization in the editor)

- A non-drill row always has `runsWithPrevious = false`, `stays = false` and `rotateEveryMinutes = null`. Normalization forces this. The server and the importer reject a violation.
- `rotateEveryMinutes` is meaningful only on the first row of a station block of 2 or more drills (`runsWithPrevious = false` followed by `true` rows).
  - On any other row it is cleared by normalization and rejected by the server.
  - A block with fewer than 2 rotating stations (rows with `stays = false`) can't rotate. The editor explains why, and save clears `rotateEveryMinutes`.
- `stays` is meaningful only inside a rotating block. Elsewhere it is ignored and normalized to false.
- In a rotating block every rotating station's `duration` is `M`, and normalization writes it. A **stays** station's `duration` is the block length.
- Minutes per row: 1–300, as today.
- Updates follow the existing rule: a missing field is unchanged, and an explicit `null` clears.

### R4. Timeline maths (pure, in `lib/utils/session-timeline.ts`)

- `blockMinutes(group)` returns:
  - for a drill or non-drill row on its own, its `duration`;
  - for a non-rotating station block, the max station `duration` (today's behavior);
  - for a rotating block, `M × rotatingStations`.
- `rotationGrid(group)` returns `null` for a block that doesn't rotate. Otherwise it returns `{ minutes: M, groups: ["A","B",…], rounds: [{ start: offsetMinutes, stations: [{ row, group: "A" | … | "all" }] }] }`.
  - There are as many groups as rotating stations.
  - In round `r`, group `g` is at rotating station `(g + r) mod n`.
  - **stays** stations show `all` in every round.
- `buildSchedule(rows, start, transitionMinutes)` returns:
  - a start time for each top-level row or block;
  - a gap of `transitionMinutes` between consecutive top-level blocks, none after the last;
  - a start time for each rotation round.
- `sessionWallMinutes(rows, transitionMinutes)` is the sum of the blocks plus the gaps.
- Goalie demand (`goalieDemand` / `goalieWarnings`) ignores non-drill rows. In a rotating block:
  - a **stays** station needing a goalie needs one for the whole block;
  - a rotating station needing a goalie needs one in every round.

  This gives the same per-block count as today's rule.

### R5. Copy paths

Every path that copies session rows carries `kind`, `label`, `stays` and `rotateEveryMinutes`:
- duplicate session;
- detach-on-write;
- materialize;
- plan export and import, in both apps;
- static store copies.

`copySessionPlayScalars` stays the single copy point. A guard test builds its input from the select, as with `CLONE_SOURCE_SELECT`. Non-drill rows have no `playId`, so they never go through the drill clone (`cloneDrillsIntoSessions`).

### R6. Plan document (PLAN_VERSION stays 1)

**Optional fields, read leniently with `z.preprocess` like the goalie fields:**
- Per entry: `kind` (`drill` when missing or null; any other unknown kind is an error, never read as a drill), `label`, `stays` (default false), `rotateEveryMinutes` (default null).
- Per session: `transitionMinutes` (default 0).

**Shape of a non-drill entry:** it carries `sequence`, `duration`, `kind`, `label` and `instructions`, and no `name`, `description`, `playData` or tags. It still counts toward `MAX_PLAN_DRILLS`: a plan holds at most 50 rows, drills and blocks together.

**Compatibility:**
- Files written before this change import unchanged, as all drills with a 0-minute gap.
- A new file that contains a non-drill row is rejected by an older cached planner with its normal "can't read this file" message. That is accepted for v1.
- ADR-0020 gets an amendment.

### R7. Static store

IndexedDB session records add the same fields:
- Older records read with the defaults.
- Updates keep "missing is unchanged".
- No IndexedDB version bump is needed.
- Both repositories (memory and IndexedDB) run the same tests.

### R8. Editor UI (shared)

- **Add block** menu next to "New drill" and "Add from library": Warm-up, Water break, Transition, Cool-down. Each new row starts with its default minutes and is appended at the end.
- **Block row card:** compact, with no diagram. It has:
  - a kind icon (outline icon set);
  - an editable label;
  - a minutes stepper;
  - an optional note;
  - move up/down and delete.

  It has no "runs with previous" toggle and no goalie badge.
- **Station block header:**
  - a **Rotate** switch; when it's on, "every [M] min";
  - the computed summary, e.g. "3 stations × 5 min = 15 min · groups A–C";
  - a collapsible rotation grid.

  When rotation is on, each station card shows a **Stays** checkbox ("doesn't rotate, e.g. goalie station") in place of its minutes field. An inline note explains when the block can't rotate.
- **Practice settings:** a **Between blocks** select (None, 1–5 min) beside Duration and Goalies attending.
- Touch targets are at least 44px and only palette tokens are used. Copy is plain coaching language.
- If `PracticeSessionEditor.tsx` would go past 900 lines, the block card and the station header move into their own components first.

### R9. Session page

- The timeline shows block rows with start, minutes, label and note, and no drill link.
- Gaps are folded into the next row's start time; they are not separate rows.
- Rotating blocks list their stations with a "rotates every M min" chip, and **stays** stations are marked. The grid sits under the block.
- The play sequence and live diagram skip block rows.
- "Planned X of Y min" uses `sessionWallMinutes`.

### R10. Bench sheet, HTML and Word

`buildBenchSheetModel` emits three row kinds:
- **drill:** unchanged;
- **block:** start, minutes, label and note on a single line, with no diagram;
- **rotation block:** a header ("Stations · rotate every 5 min · 15 min"), the station drills with **stays** marked, then the grid as a table. The table has a Start column plus one column per station, with A/B/C or "all" in each cell.

If the gap is non-zero, the header adds "N min between blocks". HTML escapes everything, as the exports already do. Word renders the grid as a real table.

### R11. Emails and other readers

Practice-plan shared and updated emails count drill rows only and add one line listing the block rows by label and minutes (e.g. "Also planned: Warm-up · 8 min, Water break · 2 min"). Every reader of `sp.play` narrows on `kind` first. Nothing may crash on a row without a drill.

### R12. Templates

- `lib/data/starter-templates.ts` uses `rotateEveryMinutes` and `stays` in place of the "rotate every N minutes" instruction text.
- Each template opens with a warm-up block, or a warm-up drill block, and closes with a cool-down. The rest of each practice stays as it is.
- Skills Stations fills 60 of 60 minutes.
- The template invariant tests are updated: wall time (including blocks and rotation) is at most the duration, and each rotating block is at least 2 rotating stations with an M inside each drill's stated range.

## Testing

- **Pure unit tests:** `blockMinutes`, `rotationGrid` (3 and 4 stations, with and without a stays station), `buildSchedule` with blocks, rotation and gaps, `sessionWallMinutes`, normalization of the R3 rules, and goalie demand with rotation.
- **Zod and plan document:** round-trips; files from before this change; the rules rejected on import; non-drill entries carrying no drill fields.
- **Migration:** checked against `schema.prisma`, including the drill/`playId` CHECK.
- **Server actions:** create, update, duplicate and detach carry the new fields; a non-drill row is never cloned as a drill; a guard test on the copy select.
- **Static store:** on both repositories, defaults for legacy records and "missing is unchanged".
- **Components:**
  - Add block;
  - block card editing;
  - the Rotate switch and the M select;
  - the Stays checkbox;
  - the "can't rotate" note;
  - the Between blocks select;
  - an untouched editor keeps every stored value.
- **Bench sheet model, HTML and Word:** block rows and the grid table.
- **Emails:** a session with blocks renders.
- **Visual:** before the PR, light and dark screenshots on desktop and mobile of:
  - the editor;
  - the session page;
  - the bench sheet print view;
  - the import preview.

## Known limitations

- Per-group rosters (which players are in group A) are not modelled.
- A new plan file that contains block rows can't be opened by an older cached static planner until the page reloads.

## Out of scope

- Staff assignments to stations and blocks (the next roadmap item).
- Custom row kinds beyond the five.
- A gap inside a station block, or per-gap overrides.
- Uneven rotations (more groups than stations, or different minutes per station within one rotation).

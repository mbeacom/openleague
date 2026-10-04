# Practice Timing: Blocks, Station Rotations and Transition Buffers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A practice's single row list carries warm-up, water-break, transition and cool-down rows, station blocks that rotate groups on a fixed interval (with **stays** stations and a rotation grid), and an optional 0–5 minute gap between blocks, through the editor, the session page, the bench sheet, the HTML/Word exports, plan files and emails, in both planners.

**Architecture:**
- `PracticeSessionPlay` stays the one ordered list. Each row gets a `kind`; a non-drill ("block") row has no `playId`. In TypeScript the rows become discriminated unions: `SessionRow = DrillRow | BlockRow` on the read-only views and `SessionItem = PlayInSession | BlockInSession` in the editor. A block row has no `play`, so reading one without narrowing is a type error.
- All timing maths stays pure in `lib/utils/session-timeline.ts`; row helpers live in a new pure `lib/utils/session-rows.ts`. Both deployables, the server actions, the static store and the plan document share them.
- Hosted persists four new columns on `practice_session_plays` and one on `practice_sessions` (hand-written migration). The static app adds the same optional fields to its IndexedDB records and reads older records with defaults. The plan document gains optional fields (`PLAN_VERSION` stays 1), amended in ADR-0020.
- Shared, portable components (`components/features/practice-planner/`) render blocks, the rotation controls and the grid. Both apps render them.

**Tech Stack:** TypeScript (strict), Next.js 16 App Router, React 19, MUI v7, Prisma 7 (Neon/PostgreSQL), Zod v4, Vite (static planner), Vitest + Testing Library, fake-indexeddb, `docx`, Playwright (screenshots only, from the scratchpad), Bun.

**Spec:** `docs/superpowers/specs/2026-10-04-practice-timing-design.md`. Its rulings R1–R12 are referenced below.

## Global Constraints

- Use `bun` for every script (`bun run …`), never npm or yarn.
- Use `/usr/bin/git`. Never `git stash`. Never switch branches (work on `feat/practice-timing`). Stage files by path, never `git add -A` or `git add .`, because `next dev` can rewrite `CLAUDE.md`.
- Never run `prisma migrate dev`, `db:migrate`, `db:push` or `db:migrate:reset`. The migration is hand-written; `bun run db:generate` is the only Prisma command used locally.
- Migration folder: `prisma/migrations/20261004120000_practice_session_timing/`. It never touches `practice_session_plays_playId_fkey` (deferrable, from `20261003120000_session_owned_plays`).
- Row kinds, exactly: `drill | warmup | break | transition | cooldown`. Defaults (spec R1): `warmup` "Warm-up" 8 min, `break` "Water break" 2 min, `transition` "Transition" 2 min, `cooldown` "Cool-down" 5 min.
- Limits: label ≤ 60 characters (empty or null = the kind's default label); `rotateEveryMinutes` an integer 1–30 or null; `transitionMinutes` an integer 0–5 (default 0); a rotating block needs at least 2 rotating stations (`MIN_ROTATING_STATIONS = 2`).
- Row minutes keep today's range, 1–300, as the spec says (`VALIDATION_CONSTRAINTS.MAX_DURATION`, the Zod row schema and the plan document all say 300). This plan changes no limit.
- **Absent = unchanged, explicit null clears**, on every update path (hosted `updatePracticeSession`, static `updateSession`):
  - a session save without `transitionMinutes` keeps the stored gap;
  - a drill row without `stays` or `rotateEveryMinutes` keeps the stored values of the row with the same `playId` (`withStoredTiming`), and only then is validated;
  - a create fills the defaults.
  Never write `?? null` / `?? false` / `?? 0` for a field the code path does not own; reading a legacy record with defaults is the only place a default is filled.
- Raw versus display data: goalie warnings and timing maths always read stored rows, never `sessionForDisplay`'s copy.
- Every copy path carries `kind`, `label`, `stays`, `rotateEveryMinutes` and the session's `transitionMinutes` (spec R5): duplicate, detach-on-write, materialize, plan export and import (both apps), static copies. Block rows never reach `cloneDrillsIntoSessions`. Rows are matched to their drill copies by `clientKey`, row id or (plan import) `sequence`, never by array index.
- Stored timing is the one lookup keyed by `playId`: on update, `withStoredTiming` gives a drill row that omits `stays` / `rotateEveryMinutes` the values of the stored row with the same `playId` (first match wins). This rests on an **accepted invariant**: a session's stored drill rows each point at their own Play copy, so a `playId` is unique per stored session row (3a: `materializeSessionDrills` and the static `materialize` clone a repeated play; their "clones a second occurrence" / "clones a second card on the same copy" tests enforce it). Task 1 has a test that documents the invariant. If 3a ever lets two stored rows share a play, `withStoredTiming` must key by row id instead, or timing could cross rows.
- A task that changes a type or a written shape lists, narrows and stages every existing test the change breaks (named in its Files list and its `git add`), narrowing with `isDrillRow`/`drillRows`, never with a cast. Every task ends with `bun run type-check` and its test suites green (`tsconfig.json` includes `__tests__`, so type-check covers the tests).
- `components/features/practice-planner/PracticeSessionEditor.tsx` and `app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx` each stay at or under 900 lines (their line-budget tests).
- Portable components: no `next/*`, `lib/actions/*` or `@prisma/client` import in anything under `components/features/practice-planner/` or `lib/utils/` (the static app renders them). Only palette tokens (`primary.main`, `secondary.main`, `text.secondary`, `divider`, `action.hover`, `action.selected`, `background.paper`, `warning.main`…) in new on-screen components, so dark mode works. Print/export markup keeps its existing black-on-white classes. Every new interactive control is at least 44×44 px. MUI selects get the `GoaliesAttendingField` height fix (`"& .MuiSelect-select.MuiInputBase-input": { minHeight: "1.4375em" }`).
- Copy, exactly (plain coaching language):
  - editor: button `Add block`; menu items `Warm-up`, `Water break`, `Transition`, `Cool-down`; block card fields `Label`, `Note`; minutes buttons `Fewer minutes for <title>` / `More minutes for <title>`; move/delete `Move <title> up` / `Move <title> down` / `Delete <title>`;
  - practice settings: select `Between blocks`, options `None`, `1 min` … `5 min`;
  - station header: switch `Rotate`; select `Every`, options `1 min` … `30 min`; summary `rotationSummary()` ("3 stations × 5 min = 15 min · groups A–C"); toggle `Show rotation grid` / `Hide rotation grid`; note `CANT_ROTATE_MESSAGE` = `To rotate, at least 2 stations must rotate. Untick Stays on a station.`;
  - station card: checkbox `Stays`, helper `Doesn't rotate, e.g. goalie station`;
  - session page chip `rotatesEveryLabel(5)` = `Rotates every 5 min`; stays marker `STAYS_MARK` = `stays`, after a station's name as `staysSuffix(true)` = ` · stays`;
  - bench sheet rotation header `rotationBlockLabel(5, 15)` = `Stations · rotate every 5 min · 15 min`; gap line `betweenBlocksLabel(2)` = `2 min between blocks`;
  - email line `Also planned: Warm-up · 8 min, Water break · 2 min`;
  - errors (exported constants, Task 1): `BLOCK_STATION_ERROR` = `A warm-up, break, transition or cool-down can't be part of a station block`; `BLOCK_ROW_FIELDS_ERROR` = `A warm-up, break, transition or cool-down can't rotate or stay`; `ROTATION_PLACEMENT_ERROR` = `Only the first drill of a station block can set a rotation`; `ROTATION_TOO_FEW_ERROR` = `A rotating station block needs at least 2 stations that rotate`; `ROTATE_MINUTES_MESSAGE` = `Rotation must be a whole number of minutes from 1 to 30`; `TRANSITION_MINUTES_MESSAGE` = `Between blocks must be a whole number of minutes from 0 to 5`; `BLOCK_LABEL_MESSAGE` = `Label must be at most 60 characters`; `BLOCK_HAS_NO_DRILL_MESSAGE` = `A warm-up, break, transition or cool-down has no drill`; `DRILL_NEEDS_PLAY_MESSAGE` = `A drill needs a play`.
- **Transitional seams.** Task 2 switches every reader to the unions before any writer can create a block row (the Add block menu arrives in Task 6, block-carrying plan files in Task 5). Exactly four call sites pass drill rows only until their owner task, and each owner task replaces the call and adds a test that a block row passes through:
  - S1 `EditSessionWrapper.tsx` and `PracticeSessionEditorWrapper.tsx`: `drillRows(session.plays).map(toDrillRowInput)` → Task 3 `toSessionRowInputs(session.plays)`;
  - S2 `apps/planner/src/screens/SessionEditorScreen.tsx` `toLocalSessionSave`: same call → Task 4;
  - S3 `ExportPlanMenu.tsx` `buildPlanDocument`: `drillRows(session.plays)` → Task 5 `toPlanRows`;
  - S4 `apps/planner/src/store/sessions.ts` `assertExportable`: serializes drill rows only (introduced by Task 4, the first task in which the static store holds block rows) → Task 5.
  No other interim code. Comments at the seams say what they hold back, never "Task N".
- No new runtime dependencies. No raw SQL outside the migration file (ADR-0003, `bun run check:raw-sql`). MUI is the only component library (ADR-0004).
- Screenshots (UI tasks): build and serve the static planner, drive it with headless Playwright from the scratchpad harness, and write PNGs to `/private/tmp/claude-501/-Users-markbeacom-github-mbeacom-openleague/3436f415-4c2f-4d80-8aa7-d860be0c7ad8/scratchpad/pwcheck/` (it has `node_modules/playwright`; the Chromium executable is `/Users/markbeacom/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell`). Name files `timing-taskN-<view>-<desktop|mobile>-<light|dark>.png`. Read every PNG before committing.
- Commit trailer, on its own paragraph: `Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX`

## Review Focus

1. **An untouched editor, and a save from an older client,** must keep every stored value: blocks and their labels and notes, `stays`, `rotateEveryMinutes` and `transitionMinutes`. Tests: Task 3 (hosted update omitting the fields), Task 4 (static update omitting them), Task 6 (editor loaded with all of them, an unrelated edit, the payload keeps them).
2. **A block row between two drills** (warm-up, drill, break, drill) must keep each drill on its own copy: create, update, duplicate and both imports map rows to copies by `clientKey` or row id, never by index. Tests: Tasks 3, 4 and 5.
3. **A practice that opens with a warm-up** must still show the first drill's thumbnail in the hosted list, count only drills in the list, the email, the dashboard schedule and the session header, number drills 1, 2, 3 on the bench sheet, and open the session page on the first drill. Tests: Task 2 (detail view, bench sheet) and Task 3 (list query, email, dashboard).
4. **A rotating block that drops below 2 rotating stations** (a station ticked Stays, or removed) keeps the coach's settings on screen with the "can't rotate" note, saves without the rotation, and a payload that still carries it is rejected by the server, the static store and the importer. Tests: Task 1 (`settleRotations`, `sessionRowsError`), Task 7 (editor), Tasks 3–5 (rejections).
5. **A plan file written before this change** opens unchanged, as drills with a 0-minute gap; a file with an unknown row kind is rejected with a readable "Drill N" issue rather than read as a drill. Test: Task 5.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `types/practice-planner.ts` | row kinds, block defaults, limits; `BlockInSession`, `SessionItem`, `PracticeSessionViewBlock`, `DrillRow`, `BlockRow`, `SessionRow`; `transitionMinutes` on the session types | 1 (definitions), 2 (switch `plays`) |
| `lib/utils/session-rows.ts` (new) | kind guards, `drillRows`, block titles, lenient readers, `newBlockItem`, `applyRowEdit`, row inputs, `withStoredTiming`, messages, the shared `CONTROL_CHARS` | 1 |
| `lib/utils/session-timeline.ts` | `blockMinutes`, `rotationGrid`, `rotationTable`, gaps in `groupStations` / `buildSchedule` / `sessionWallMinutes`, R3 normalization, list edits that keep a block's rotation, `settleRotations`, `sessionRowsError`, labels (incl. `staysSuffix`), goalie skip | 1 |
| `lib/utils/drill-tags.ts`, `lib/utils/session-drill-ids.ts`, `components/features/practice-planner/{useSessionDrillDialog,useSessionGoalies}.ts` | union-aware helpers | 2 |
| `components/features/practice-planner/BlockRowCard.tsx` (new), `SessionDrillList.tsx`, `PracticeSessionEditor.tsx` | editor renders and edits block rows | 2 |
| `components/features/practice-planner/SessionTimeline.tsx`, `app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx`, `print/BenchSheet.tsx`, `export/bench-sheet-{model,html,docx}.ts`, `ExportPlanMenu.tsx` | read side: block lines, gaps, drills-only sequence and pages | 2 |
| hosted wrappers, `apps/planner/src/screens/SessionEditorScreen.tsx` | seams S1, S2 | 2 |
| `prisma/schema.prisma`, migration, `__tests__/prisma/practice-timing-migration.test.ts` | hosted columns and CHECKs | 3 |
| `lib/utils/validation.ts`, `lib/services/practice-session-drills.ts`, `lib/actions/{practice-sessions,practice-session-drills,practice-session-queries}.ts`, `lib/email/templates.ts`, `lib/data/dashboard.ts`, hosted wrappers | hosted writes, reads, copies, emails, the dashboard's play count | 3 |
| `apps/planner/src/store/{records,types,sessions}.ts`, `SessionEditorScreen.tsx` | static store | 4 |
| `lib/plan-document/document.ts`, `lib/actions/practice-plan-import.ts`, `apps/planner/src/store/sessions.ts` (`importPlan`, `assertExportable`), `ExportPlanMenu.tsx`, `PlanPreview.tsx`, `docs/adr/0020-…md` | plan files | 5 |
| `components/features/practice-planner/{SessionDetailsFields,BetweenBlocksField,AddBlockMenu}.tsx`, `{useSessionRowEdits,useBetweenBlocks}.ts` (new), editor, list | Add block, Between blocks | 6 |
| `__tests__/helpers/session-editor.tsx` (new) | the shared editor test harness (`drill`, `renderEditor`, `save`) | 6 (created), 7 |
| `components/features/practice-planner/{StationBlockHeader,RotationGridTable}.tsx` (new), `SessionDrillCard.tsx`, list, hook | rotation controls, Stays, grid | 7 |
| `SessionTimeline.tsx`, `SessionDetailView.tsx`, `print/BenchSheet.tsx` | rotation on the session page and live bench sheet | 8 |
| `export/bench-sheet-{model,html,docx}.ts` | rotation grid tables and the gap line in the exports | 9 |
| `PlanPreview.tsx`, `lib/data/starter-templates.ts`, template tests | previews and templates | 10 |

---

### Task 1: Row vocabulary, union types and timeline maths

The pure layer every later task imports. No component, action or store changes behaviour yet: the new type definitions are exported but not wired, and every existing caller of the timeline functions keeps its current results (block rows, rotation and gaps are all absent in today's data).

**Files:**
- Modify: `types/practice-planner.ts` (after the drill-tag constants; `PlayInSession`, `PracticeSessionData`, `PracticeSessionViewPlay`, `PracticeSessionView`)
- Create: `lib/utils/session-rows.ts`
- Modify: `lib/utils/session-timeline.ts` (imports, `TimelinePlay`, `StationGroup`, `groupStations`, `sessionWallMinutes`, `ScheduleRow`, `buildSchedule`, `normalizeGroups`, `canToggleRunsWithPrevious`, `toggleRunsWithPrevious`, `moveItem`, `removeItem`, `GoalieNeeds`, `goalieWarnings`; new functions appended)
- Test (create): `__tests__/lib/utils/session-rows.test.ts`
- Test (append): `__tests__/lib/utils/session-timeline.test.ts`

**Interfaces:**
- Produces, from `types/practice-planner.ts`:
  - `SESSION_ROW_KINDS`, `SessionRowKind`, `BLOCK_KINDS`, `BlockKind`, `BLOCK_DEFAULTS: Record<BlockKind, { label: string; minutes: number }>`;
  - `MAX_BLOCK_LABEL_LENGTH = 60`, `MIN_ROTATE_MINUTES = 1`, `MAX_ROTATE_MINUTES = 30`, `MAX_TRANSITION_MINUTES = 5`;
  - on `PlayInSession` and `PracticeSessionViewPlay`: `kind?: "drill"; stays?: boolean; rotateEveryMinutes?: number | null`;
  - `BlockInSession { id; kind: BlockKind; label: string; sequence; duration; instructions: string; runsWithPrevious: boolean }`, `SessionItem = PlayInSession | BlockInSession`;
  - `PracticeSessionViewBlock { id; kind: BlockKind; label: string | null; sequence; duration; instructions: string | null; runsWithPrevious: boolean }`, `DrillRow = PracticeSessionViewPlay`, `BlockRow = PracticeSessionViewBlock`, `SessionRow = DrillRow | BlockRow`;
  - `transitionMinutes?: number` on `PracticeSessionData` and `PracticeSessionView`.
- Produces, from `lib/utils/session-rows.ts`:
  - `isBlockKind(value: unknown): value is BlockKind`, `toRowKind(value: unknown): SessionRowKind`;
  - `isDrillRow<T extends { kind?: SessionRowKind }>(row: T): row is Exclude<T, { kind: BlockKind }>`, `isBlockRow<T …>(row: T): row is Extract<T, { kind: BlockKind }>`, `drillRows<T …>(rows: readonly T[]): Array<Exclude<T, { kind: BlockKind }>>`;
  - `blockTitle(kind: BlockKind, label: string | null | undefined): string`;
  - `toBlockLabel(value: unknown): string | null`, `toRotateEveryMinutes(value: unknown): number | null`, `toTransitionMinutes(value: unknown): number`;
  - `newBlockItem(kind: BlockKind, sequence: number, id: string): BlockInSession`;
  - `RowEdit { duration?: number; instructions?: string; label?: string }`, `applyRowEdit<T extends SessionItem>(item: T, edit: RowEdit): T`;
  - `DrillRowInput { kind?: "drill"; playId: string; clientKey; sequence; runsWithPrevious; duration; instructions: string; stays?: boolean; rotateEveryMinutes?: number | null }`, `BlockRowInput { kind: BlockKind; clientKey; sequence; duration; instructions: string; label: string | null }`, `SessionRowInput = DrillRowInput | BlockRowInput`;
  - `toDrillRowInput(item: PlayInSession): DrillRowInput`, `toSessionRowInputs(items: readonly SessionItem[]): SessionRowInput[]`;
  - `StoredTiming { playId: string | null; stays: boolean; rotateEveryMinutes: number | null }`, `needsStoredTiming(rows): boolean`, `withStoredTiming<R>(rows: readonly R[], stored: readonly StoredTiming[]): Array<R & { stays: boolean; rotateEveryMinutes: number | null }>`;
  - message constants `ROTATE_MINUTES_MESSAGE`, `TRANSITION_MINUTES_MESSAGE`, `BLOCK_LABEL_MESSAGE`, `BLOCK_HAS_NO_DRILL_MESSAGE`, `DRILL_NEEDS_PLAY_MESSAGE`;
  - `CONTROL_CHARS` (the control-character pattern the repo's text hygiene strips): the one copy the practice-timing code uses. Task 3's `blockLabelSchema` imports it instead of inlining the regex, and Tasks 4 and 5 replace the private copies in `apps/planner/src/store/sessions.ts` and `lib/plan-document/document.ts` with this import.
- Produces, from `lib/utils/session-timeline.ts`:
  - `TimelinePlay` gains `kind?: SessionRowKind; stays?: boolean; rotateEveryMinutes?: number | null`; `StationGroup<T>` gains `rotation: RotationGrid<T> | null`; `ScheduleRow<T>` gains `roundStarts: Date[]`;
  - `groupStations(plays, transitionMinutes = 0)`, `sessionWallMinutes(plays, transitionMinutes = 0)`, `buildSchedule(plays, sessionStart, transitionMinutes = 0)`;
  - `MIN_ROTATING_STATIONS = 2`, `ROTATION_ALL = "all"`, `RotationCell<T> { row: T; group: string }`, `RotationRound<T> { start: number; stations: RotationCell<T>[] }`, `RotationGrid<T> { minutes: number; groups: string[]; rounds: RotationRound<T>[] }`, `RotationTable { columns: string[]; rows: Array<{ start: string; cells: string[] }> }`;
  - `rotatingStations(stations)`, `rotationMinutes(stations): number | null`, `blockMinutes(stations): number`, `rotationGrid(stations): RotationGrid<T> | null`, `rotationTable(grid, name, start): RotationTable`, `defaultRotationMinutes(stations): number`;
  - `settleRotations<T>(plays: T[]): T[]`, `sessionRowsError(plays): string | null` and its four error constants;
  - labels `rotationBlockLabel(rotateEvery, minutes)`, `rotationSummary(rotating, rotateEvery)`, `rotatesEveryLabel(minutes)`, `betweenBlocksLabel(minutes)`, `rotationRoundLabel(start, minutes)`, `STAYS_MARK = "stays"`, `staysSuffix(stays): string` (` · stays` or ""; the one place the suffix is written, used by Tasks 8, 9 and 10);
  - `moveItem`, `removeItem` and `toggleRunsWithPrevious` keep a block's rotation with the block (ruling R4): the rotation lives on the block's first drill, so when an edit gives the block a new first drill (a station moved up to the top, the first drill deleted, a block joined onto the one before it) that drill takes the rotation, and the stays ticks stay because the block still rotates. Turning a station's flag off splits the block: the original first drill keeps the rotation, and the split-off stations start a block with no rotation (so, by R3, nothing in it stays);
  - `GoalieNeeds.playData` becomes optional; `goalieWarnings` skips block rows.

- [ ] **Step 1: Write the failing row-helper tests**

Create `__tests__/lib/utils/session-rows.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
    BLOCK_DEFAULTS,
    BLOCK_KINDS,
    SESSION_ROW_KINDS,
    type BlockInSession,
    type PlayInSession,
    type SessionItem,
} from "@/types/practice-planner";
import {
    applyRowEdit,
    blockTitle,
    drillRows,
    isBlockKind,
    isBlockRow,
    isDrillRow,
    needsStoredTiming,
    newBlockItem,
    toBlockLabel,
    toDrillRowInput,
    toRotateEveryMinutes,
    toRowKind,
    toSessionRowInputs,
    toTransitionMinutes,
    withStoredTiming,
} from "@/lib/utils/session-rows";
import { createEmptyPlayData } from "@/lib/utils/play-data";

const DRILL: PlayInSession = {
    id: "k1", playId: "cplayxxxxxxxxxxxxxxxxxxxx", name: "Breakout", sequence: 0, runsWithPrevious: false,
    duration: 10, instructions: "Hard", playData: createEmptyPlayData(),
};
const BLOCK: BlockInSession = { id: "k2", kind: "break", label: "", sequence: 1, duration: 2, instructions: "", runsWithPrevious: false };

describe("row kinds", () => {
    it("lists the five kinds, with a default label and minutes for each block kind", () => {
        expect(SESSION_ROW_KINDS).toEqual(["drill", "warmup", "break", "transition", "cooldown"]);
        expect(BLOCK_KINDS).toEqual(["warmup", "break", "transition", "cooldown"]);
        expect(BLOCK_DEFAULTS).toEqual({
            warmup: { label: "Warm-up", minutes: 8 },
            break: { label: "Water break", minutes: 2 },
            transition: { label: "Transition", minutes: 2 },
            cooldown: { label: "Cool-down", minutes: 5 },
        });
    });

    it("reads an unknown or missing kind as a drill", () => {
        for (const kind of SESSION_ROW_KINDS) expect(toRowKind(kind)).toBe(kind);
        expect([undefined, null, "stretch", 3].map(toRowKind)).toEqual(["drill", "drill", "drill", "drill"]);
        expect(BLOCK_KINDS.every(isBlockKind)).toBe(true);
        expect(["drill", undefined, "stretch"].some(isBlockKind)).toBe(false);
    });

    it("narrows rows: a row without a kind is a drill", () => {
        const rows: SessionItem[] = [DRILL, BLOCK, { ...DRILL, id: "k3", kind: "drill" }];
        expect(rows.filter(isDrillRow).map((row) => row.id)).toEqual(["k1", "k3"]);
        expect(rows.filter(isBlockRow).map((row) => row.id)).toEqual(["k2"]);
        expect(drillRows(rows).map((row) => row.playId)).toEqual([DRILL.playId, DRILL.playId]);
    });
});

describe("block text and lenient readers", () => {
    it("titles a block by its label, else its kind's default", () => {
        expect(blockTitle("break", "")).toBe("Water break");
        expect(blockTitle("break", null)).toBe("Water break");
        expect(blockTitle("break", "  Fill bottles  ")).toBe("Fill bottles");
    });

    it("reads labels, rotation and the gap leniently", () => {
        expect(toBlockLabel("  Stretch\u0007 ")).toBe("Stretch");
        expect(toBlockLabel("")).toBeNull();
        expect(toBlockLabel(7)).toBeNull();
        expect(toBlockLabel("x".repeat(70))).toHaveLength(60);
        expect([1, 30, 5].map(toRotateEveryMinutes)).toEqual([1, 30, 5]);
        expect([0, 31, 2.5, "5", null, undefined].map(toRotateEveryMinutes)).toEqual([null, null, null, null, null, null]);
        expect([0, 5, 3].map(toTransitionMinutes)).toEqual([0, 5, 3]);
        expect([-1, 6, 1.5, "2", null, undefined].map(toTransitionMinutes)).toEqual([0, 0, 0, 0, 0, 0]);
    });

    it("makes a new block with its kind's default minutes and an empty label", () => {
        expect(newBlockItem("warmup", 4, "block-1")).toEqual({
            id: "block-1", kind: "warmup", label: "", sequence: 4, duration: 8, instructions: "", runsWithPrevious: false,
        });
    });
});

describe("applyRowEdit", () => {
    it("changes only what the edit names, and a label only on a block", () => {
        expect(applyRowEdit(BLOCK, { label: "Water", duration: 3 })).toEqual({ ...BLOCK, label: "Water", duration: 3 });
        const drill = applyRowEdit(DRILL, { label: "ignored", instructions: "Soft" });
        expect(drill).toEqual({ ...DRILL, instructions: "Soft" });
        expect(drill).not.toHaveProperty("label");
    });
});

describe("row inputs", () => {
    it("sends a drill's timing only when the editor holds it (absent = unchanged)", () => {
        expect(toDrillRowInput(DRILL)).toEqual({
            kind: "drill", playId: DRILL.playId, clientKey: "k1", sequence: 0, runsWithPrevious: false, duration: 10, instructions: "Hard",
        });
        expect(toDrillRowInput({ ...DRILL, stays: true, rotateEveryMinutes: null })).toMatchObject({ stays: true, rotateEveryMinutes: null });
    });

    it("sends a block with no drill fields, and an empty label as null", () => {
        expect(toSessionRowInputs([DRILL, BLOCK])[1]).toEqual({ kind: "break", clientKey: "k2", sequence: 1, duration: 2, instructions: "", label: null });
        expect(toSessionRowInputs([{ ...BLOCK, label: " Fill bottles " }])[0]).toMatchObject({ label: "Fill bottles" });
    });
});

describe("withStoredTiming", () => {
    const stored = [{ playId: "cowned", stays: true, rotateEveryMinutes: 5 }];

    it("keeps a stored drill's timing when the save omits it, and takes what is sent", () => {
        const rows = [
            { kind: "drill" as const, playId: "cowned" },
            { kind: "drill" as const, playId: "cowned", stays: false, rotateEveryMinutes: null },
            { kind: "drill" as const, playId: "clibrary" },
        ];
        expect(needsStoredTiming(rows)).toBe(true);
        expect(needsStoredTiming([rows[1]])).toBe(false);
        const [kept, sent, fresh] = withStoredTiming(rows, stored);
        expect([kept.stays, kept.rotateEveryMinutes]).toEqual([true, 5]);
        expect([sent.stays, sent.rotateEveryMinutes]).toEqual([false, null]);
        expect([fresh.stays, fresh.rotateEveryMinutes]).toEqual([false, null]);
    });

    it("gives a block row no timing and never asks for stored rows for it", () => {
        const rows = [{ kind: "warmup" as const }];
        expect(needsStoredTiming(rows)).toBe(false);
        const [block] = withStoredTiming(rows, stored);
        expect([block.stays, block.rotateEveryMinutes]).toEqual([false, null]);
    });

    it("keys stored timing by play id, which is unique per stored row (accepted invariant, Global Constraints)", () => {
        // 3a: a save gives every drill row its own copy (materializeSessionDrills and the static
        // materialize clone a repeated play), so a session never stores two rows on one play id.
        // Should two ever share one, the first stored row wins for both: key by row id then.
        const shared = [
            { playId: "cowned", stays: true, rotateEveryMinutes: 5 },
            { playId: "cowned", stays: false, rotateEveryMinutes: null },
        ];
        const [first, second] = withStoredTiming([{ kind: "drill" as const, playId: "cowned" }, { kind: "drill" as const, playId: "cowned" }], shared);
        expect([first.stays, first.rotateEveryMinutes, second.stays, second.rotateEveryMinutes]).toEqual([true, 5, true, 5]);
    });
});
```

- [ ] **Step 2: Write the failing timeline tests**

Append to `__tests__/lib/utils/session-timeline.test.ts`.
- Add to the existing `@/lib/utils/session-timeline` import: `BLOCK_ROW_FIELDS_ERROR, BLOCK_STATION_ERROR, ROTATION_PLACEMENT_ERROR, ROTATION_TOO_FEW_ERROR, STAYS_MARK, betweenBlocksLabel, blockMinutes, buildSchedule, defaultRotationMinutes, rotatesEveryLabel, rotationBlockLabel, rotationGrid, rotationMinutes, rotationRoundLabel, rotationSummary, rotationTable, sessionRowsError, settleRotations, staysSuffix` (`moveItem`, `removeItem`, `toggleRunsWithPrevious`, `canToggleRunsWithPrevious` and `normalizeGroups` are already imported).
- Extend the existing `@/types/practice-planner` type import with `BlockKind`.

```ts
type Row = TimelinePlay & { id: string };

const solo = (id: string, sequence: number, duration = 10, extra: Partial<TimelinePlay> = {}): Row =>
    ({ id, sequence, duration, runsWithPrevious: false, ...extra });
const block = (id: string, sequence: number, kind: BlockKind, duration: number, extra: Partial<TimelinePlay> = {}): Row =>
    ({ id, sequence, duration, runsWithPrevious: false, kind, ...extra });
/** One station block starting at `start`: its first drill carries the rotation. */
function stations(start: number, specs: Array<{ id: string; duration?: number; stays?: boolean }>, rotateEveryMinutes: number | null = null): Row[] {
    return specs.map((spec, k) => ({
        id: spec.id,
        sequence: start + k,
        duration: spec.duration ?? 10,
        runsWithPrevious: k > 0,
        stays: spec.stays ?? false,
        rotateEveryMinutes: k === 0 ? rotateEveryMinutes : null,
    }));
}
const groupsOf = (grid: ReturnType<typeof rotationGrid<Row>>) => grid?.rounds.map((round) => round.stations.map((cell) => cell.group));

describe("blockMinutes and rotationGrid (spec R4)", () => {
    it("a lone row lasts its minutes; a block that doesn't rotate lasts its longest station", () => {
        expect(blockMinutes([solo("a", 0, 12)])).toBe(12);
        expect(blockMinutes([block("w", 0, "warmup", 8)])).toBe(8);
        expect(blockMinutes(stations(0, [{ id: "a", duration: 15 }, { id: "b", duration: 10 }]))).toBe(15);
        expect(rotationGrid(stations(0, [{ id: "a" }, { id: "b" }]))).toBeNull();
    });

    it("rotates 3 stations: M × 3, group g at station (g + r) mod 3", () => {
        const rows = stations(0, [{ id: "a" }, { id: "b" }, { id: "c" }], 5);
        expect(blockMinutes(rows)).toBe(15);
        const grid = rotationGrid(rows);
        expect(grid?.minutes).toBe(5);
        expect(grid?.groups).toEqual(["A", "B", "C"]);
        expect(grid?.rounds.map((round) => round.start)).toEqual([0, 5, 10]);
        expect(groupsOf(grid)).toEqual([["A", "B", "C"], ["C", "A", "B"], ["B", "C", "A"]]);
        expect(grid?.rounds[1].stations.map((cell) => cell.row.id)).toEqual(["a", "b", "c"]);
    });

    it("rotates 4 stations", () => {
        const rows = stations(0, [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }], 4);
        expect(blockMinutes(rows)).toBe(16);
        expect(groupsOf(rotationGrid(rows))?.[1]).toEqual(["D", "A", "B", "C"]);
    });

    it("keeps a stays station out of the rotation: it shows all in every round", () => {
        const rows = stations(0, [{ id: "g", stays: true }, { id: "b" }, { id: "c" }], 5);
        expect(blockMinutes(rows)).toBe(10);
        expect(rotationGrid(rows)?.groups).toEqual(["A", "B"]);
        expect(groupsOf(rotationGrid(rows))).toEqual([["all", "A", "B"], ["all", "B", "A"]]);
        const four = stations(0, [{ id: "g", stays: true }, { id: "a" }, { id: "b" }, { id: "c" }], 6);
        expect([blockMinutes(four), rotationGrid(four)?.groups.join("")]).toEqual([18, "ABC"]);
    });

    it("doesn't rotate with fewer than 2 rotating stations, or on a lone drill", () => {
        const rows = stations(0, [{ id: "g", stays: true, duration: 12 }, { id: "b", duration: 5 }], 5);
        expect(rotationMinutes(rows)).toBeNull();
        expect(blockMinutes(rows)).toBe(12);
        expect(rotationGrid([solo("a", 0, 10, { rotateEveryMinutes: 5 })])).toBeNull();
    });

    it("lays the grid out as a table: one column per station, one row per round", () => {
        const rows = stations(0, [{ id: "g", stays: true }, { id: "b" }, { id: "c" }], 5);
        const grid = rotationGrid(rows);
        expect(grid && rotationTable(grid, (row) => row.id.toUpperCase(), (start) => rotationRoundLabel(start, 5))).toEqual({
            columns: ["G", "B", "C"],
            rows: [
                { start: "0–5 min", cells: ["all", "A", "B"] },
                { start: "5–10 min", cells: ["all", "B", "A"] },
            ],
        });
    });
});

describe("groupStations, buildSchedule and sessionWallMinutes with blocks and gaps (spec R4)", () => {
    const START = new Date("2026-10-06T23:00:00.000Z");
    const rows = [
        block("w", 0, "warmup", 8),
        ...stations(1, [{ id: "a" }, { id: "b" }], 5),
        block("c", 3, "cooldown", 5),
    ];

    it("never joins a block row to a station block, even with a stray flag", () => {
        const groups = groupStations([solo("a", 0), block("w", 1, "warmup", 8, { runsWithPrevious: true }), solo("b", 2, 10, { runsWithPrevious: true })]);
        expect(groups.map((group) => group.stations.map((row) => row.id))).toEqual([["a"], ["w"], ["b"]]);
    });

    it("adds the gap between blocks, never after the last one", () => {
        expect(groupStations(rows, 2).map((group) => [group.startMinute, group.wallMinutes])).toEqual([[0, 8], [10, 10], [22, 5]]);
        expect(sessionWallMinutes(rows, 2)).toBe(27);
        expect(sessionWallMinutes(rows)).toBe(23);
        expect(sessionWallMinutes([], 3)).toBe(0);
    });

    it("schedules each block and each rotation round", () => {
        const minutes = (date: Date) => (date.getTime() - START.getTime()) / 60_000;
        const schedule = buildSchedule(rows, START, 2);
        expect(schedule.map((row) => [minutes(row.startsAt), minutes(row.endsAt)])).toEqual([[0, 8], [10, 20], [22, 27]]);
        expect(schedule.map((row) => row.roundStarts.map(minutes))).toEqual([[], [10, 15], []]);
    });
});

describe("normalizeGroups: row rules (spec R3)", () => {
    it("a block row never runs with, stays or rotates, and the drill after it starts a new block", () => {
        const [, w, b] = normalizeGroups([
            solo("a", 0),
            block("w", 1, "warmup", 8, { runsWithPrevious: true, stays: true, rotateEveryMinutes: 5 }),
            solo("b", 2, 10, { runsWithPrevious: true }),
        ]);
        expect([w.runsWithPrevious, w.stays, w.rotateEveryMinutes]).toEqual([false, false, null]);
        expect(b.runsWithPrevious).toBe(false);
    });

    it("keeps a rotation only on the first drill of a block of 2 or more", () => {
        expect(normalizeGroups([solo("a", 0, 10, { rotateEveryMinutes: 5 })])[0].rotateEveryMinutes).toBeNull();
        const rows = stations(0, [{ id: "a" }, { id: "b" }]);
        rows[1] = { ...rows[1], rotateEveryMinutes: 5 };
        expect(normalizeGroups(rows).map((row) => row.rotateEveryMinutes)).toEqual([null, null]);
    });

    it("clears stays outside a rotating block", () => {
        expect(normalizeGroups(stations(0, [{ id: "a" }, { id: "b", stays: true }]))[1].stays).toBe(false);
    });

    it("writes the minutes of a rotating block: M per rotating station, the block's length for a stays station", () => {
        const rows = normalizeGroups(stations(0, [{ id: "g", stays: true, duration: 7 }, { id: "a", duration: 7 }, { id: "b", duration: 9 }], 6));
        expect(rows.map((row) => row.duration)).toEqual([12, 6, 6]);
    });

    it("leaves a block that can't rotate as the coach set it, and unchanged rows as the same objects", () => {
        const cantRotate = stations(0, [{ id: "g", stays: true, duration: 12 }, { id: "a", duration: 5 }], 5);
        const normalized = normalizeGroups(cantRotate);
        expect(normalized[0]).toBe(cantRotate[0]);
        expect(normalized[1]).toBe(cantRotate[1]);
        // Normalized once over the whole list (an inner call would renumber the stations from 0).
        const valid = normalizeGroups([block("w", 0, "warmup", 8), ...stations(1, [{ id: "a" }, { id: "b" }], 5)]);
        normalizeGroups(valid).forEach((row, index) => expect(row).toBe(valid[index]));
    });
});

describe("settleRotations", () => {
    it("clears a rotation that can't run (fewer than 2 rotating stations) and its stays flags", () => {
        const rows = stations(0, [{ id: "g", stays: true }, { id: "a" }], 5);
        const settled = settleRotations(rows);
        expect(settled.map((row) => [row.rotateEveryMinutes, row.stays])).toEqual([[null, false], [null, false]]);
    });

    it("returns the list itself when every rotation can run", () => {
        const rows = normalizeGroups(stations(0, [{ id: "a" }, { id: "b" }], 5));
        expect(settleRotations(rows)).toBe(rows);
    });
});

describe("sessionRowsError (server, static store and importer)", () => {
    it("accepts blocks, rotation and stays where they belong, whatever the array order", () => {
        const rows = [block("w", 0, "warmup", 8), ...stations(1, [{ id: "g", stays: true }, { id: "a" }, { id: "b" }], 5)];
        expect(sessionRowsError([...rows].reverse())).toBeNull();
    });

    it("keeps the station rules", () => {
        expect(sessionRowsError([solo("a", 0, 10, { runsWithPrevious: true })])).toBe(FIRST_DRILL_STATION_ERROR);
    });

    it("rejects a block in a station block, before or after", () => {
        expect(sessionRowsError([solo("a", 0), block("w", 1, "warmup", 8, { runsWithPrevious: true })])).toBe(BLOCK_STATION_ERROR);
        expect(sessionRowsError([block("w", 0, "warmup", 8), solo("a", 1, 10, { runsWithPrevious: true })])).toBe(BLOCK_STATION_ERROR);
    });

    it("rejects a block that stays or rotates", () => {
        expect(sessionRowsError([block("w", 0, "warmup", 8, { stays: true })])).toBe(BLOCK_ROW_FIELDS_ERROR);
        expect(sessionRowsError([block("w", 0, "warmup", 8, { rotateEveryMinutes: 5 })])).toBe(BLOCK_ROW_FIELDS_ERROR);
    });

    it("rejects a rotation anywhere but the first drill of a block of 2 or more", () => {
        expect(sessionRowsError([solo("a", 0, 10, { rotateEveryMinutes: 5 })])).toBe(ROTATION_PLACEMENT_ERROR);
        const rows = stations(0, [{ id: "a" }, { id: "b" }]);
        rows[1] = { ...rows[1], rotateEveryMinutes: 5 };
        expect(sessionRowsError(rows)).toBe(ROTATION_PLACEMENT_ERROR);
    });

    it("rejects a rotation with fewer than 2 rotating stations, and ignores stays outside a rotation", () => {
        expect(sessionRowsError(stations(0, [{ id: "g", stays: true }, { id: "a" }], 5))).toBe(ROTATION_TOO_FEW_ERROR);
        expect(sessionRowsError(stations(0, [{ id: "a" }, { id: "b", stays: true }]))).toBeNull();
    });
});

describe("list edits around block rows", () => {
    it("a block can't join a station block, and a drill can't join a block", () => {
        const rows = [solo("a", 0), block("w", 1, "warmup", 8), solo("b", 2)];
        expect(canToggleRunsWithPrevious(rows, 1)).toBe(false);
        expect(canToggleRunsWithPrevious(rows, 2)).toBe(false);
        expect(toggleRunsWithPrevious(rows, 2)).toBe(rows);
    });

    it("a block moves as one unit over a whole station block", () => {
        const rows = [block("w", 0, "warmup", 8), ...stations(1, [{ id: "a" }, { id: "b" }])];
        expect(moveItem(rows, 0, 1).map((row) => `${row.id}${row.runsWithPrevious ? "+" : ""}`)).toEqual(["a", "b+", "w"]);
    });
});

describe("list edits keep a block's rotation on its first drill (ruling R4)", () => {
    const shape = (rows: Row[]) => rows.map((row) => [row.id, row.runsWithPrevious, row.rotateEveryMinutes, Boolean(row.stays)]);
    // g stays, a and b rotate every 5 minutes; g holds the rotation.
    const rotating = () => normalizeGroups(stations(0, [{ id: "g", stays: true }, { id: "a" }, { id: "b" }], 5));

    it("a station moved up to the top takes the rotation, and the stays tick stays", () => {
        expect(shape(moveItem(rotating(), 1, -1))).toEqual([
            ["a", false, 5, false],
            ["g", true, null, true],
            ["b", true, null, false],
        ]);
    });

    it("deleting the first drill hands the rotation to the next station", () => {
        expect(shape(removeItem(rotating(), 0))).toEqual([
            ["a", false, 5, false],
            ["b", true, null, false],
        ]);
    });

    it("a rotating block joined onto a drill gives the merged block its rotation", () => {
        const rows = normalizeGroups([solo("x", 0), ...stations(1, [{ id: "a" }, { id: "b" }], 5)]);
        expect(shape(toggleRunsWithPrevious(rows, 1))).toEqual([
            ["x", false, 5, false],
            ["a", true, null, false],
            ["b", true, null, false],
        ]);
    });

    it("splitting a block leaves the rotation on its first drill; the split-off station starts a block that doesn't rotate", () => {
        const rows = normalizeGroups(stations(0, [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d", stays: true }], 4));
        expect(shape(toggleRunsWithPrevious(rows, 3))).toEqual([
            ["a", false, 4, false],
            ["b", true, null, false],
            ["c", true, null, false],
            ["d", false, null, false],
        ]);
    });
});

describe("goalieWarnings with blocks and rotation", () => {
    const G: PlayData = {
        ...createEmptyPlayData(),
        players: [{ id: "g", role: "G", label: "G", position: { x: 14, y: 42.5 }, color: "#212121" }],
    };

    it("skips block rows", () => {
        const rows = [block("w", 0, "warmup", 8), { ...solo("a", 1), goalies: "required" as const, playData: G }];
        expect(goalieWarnings(groupStations(rows), 0).short).toEqual([{ groupIndex: 1, sequences: [1], needed: 1 }]);
        expect(goalieWarnings(groupStations([block("w", 0, "warmup", 8)]), 2)).toEqual({ short: [], unused: false });
    });

    it("counts a rotating block like any block: a stays goalie station plus each rotating station that needs one", () => {
        const [g, a, b] = stations(0, [{ id: "g", stays: true }, { id: "a" }, { id: "b" }], 5);
        const rows = [{ ...g, goalies: "required" as const, playData: G }, { ...a, goalies: "required" as const, playData: G }, { ...b, goalies: "optional" as const, playData: G }];
        expect(goalieWarnings(groupStations(rows), 1).short).toEqual([{ groupIndex: 0, sequences: [0, 1], needed: 2 }]);
    });
});

describe("rotation labels", () => {
    it("words the block header, the summary, the chip, the gap and a round", () => {
        expect(rotationBlockLabel(5, 15)).toBe("Stations · rotate every 5 min · 15 min");
        expect(rotationSummary(3, 5)).toBe("3 stations × 5 min = 15 min · groups A–C");
        expect(rotationSummary(2, 6)).toBe("2 stations × 6 min = 12 min · groups A–B");
        expect(rotatesEveryLabel(5)).toBe("Rotates every 5 min");
        expect(betweenBlocksLabel(1)).toBe("1 min between blocks");
        expect(rotationRoundLabel(5, 5)).toBe("5–10 min");
        expect([STAYS_MARK, staysSuffix(true), staysSuffix(false), staysSuffix(undefined)]).toEqual(["stays", " · stays", "", ""]);
    });

    it("suggests an interval that keeps the block about as long as it was", () => {
        const at = (...durations: number[]) => defaultRotationMinutes(durations.map((duration, k) => solo(`s${k}`, k, duration)));
        expect([at(15, 15, 15), at(10, 10), at(40, 10), at(90, 90), at(1, 1, 1)]).toEqual([5, 5, 20, 30, 1]);
    });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bun run test __tests__/lib/utils/session-rows.test.ts __tests__/lib/utils/session-timeline.test.ts`
Expected: FAIL, because `@/lib/utils/session-rows` can't be resolved and the new timeline exports are missing.

- [ ] **Step 4: Add the vocabulary and union types to `types/practice-planner.ts`**

After the `MAX_GOALIES_ATTENDING` constant, add:

```ts
// ============================================================================
// Session rows: drills and blocks (practice timing)
// ============================================================================

export const SESSION_ROW_KINDS = ["drill", "warmup", "break", "transition", "cooldown"] as const;
/** What a row on the practice timeline is: a drill, or a block of non-drill time (spec R1). */
export type SessionRowKind = (typeof SESSION_ROW_KINDS)[number];

export const BLOCK_KINDS = ["warmup", "break", "transition", "cooldown"] as const;
/** A row with no drill and no diagram. */
export type BlockKind = (typeof BLOCK_KINDS)[number];

/** Each block kind's label when the coach leaves it empty, and its starting minutes. */
export const BLOCK_DEFAULTS: Record<BlockKind, { label: string; minutes: number }> = {
    warmup: { label: "Warm-up", minutes: 8 },
    break: { label: "Water break", minutes: 2 },
    transition: { label: "Transition", minutes: 2 },
    cooldown: { label: "Cool-down", minutes: 5 },
};

export const MAX_BLOCK_LABEL_LENGTH = 60;
/** A station block rotates groups every 1–30 minutes. */
export const MIN_ROTATE_MINUTES = 1;
export const MAX_ROTATE_MINUTES = 30;
/** The gap between blocks: 0–5 minutes. */
export const MAX_TRANSITION_MINUTES = 5;
```

In `PlayInSession`, after `runsWithPrevious: boolean;`:

```ts
    /** Absent = a drill: every row saved before practice timing. */
    kind?: "drill";
    /** In a rotating station block: this station's group doesn't rotate (spec R3). */
    stays?: boolean;
    /** On the first drill of a station block: groups rotate every this many minutes. */
    rotateEveryMinutes?: number | null;
```

After the `PlayInSession` interface, add:

```ts
/**
 * A warm-up, water break, transition or cool-down in the session editor
 * (spec R1, R8). No drill, no diagram; `instructions` is its note.
 */
export interface BlockInSession {
    /** Stable client-side key; sent to the server as clientKey. */
    id: string;
    kind: BlockKind;
    /** "" = the kind's default label. */
    label: string;
    sequence: number;
    duration: number; // minutes
    instructions: string;
    /** Always false: a block never runs as a station (spec R3). */
    runsWithPrevious: boolean;
}

/** One row in the session editor. Narrow with isDrillRow before reading drill fields. */
export type SessionItem = PlayInSession | BlockInSession;
```

In `PracticeSessionData`, after `goaliesAttending?: number | null;`:

```ts
    /** Minutes between blocks (0–5). Absent = unchanged on save; reads as 0. */
    transitionMinutes?: number;
```

In `PracticeSessionViewPlay`, after `runsWithPrevious: boolean;`:

```ts
    kind?: "drill";
    stays?: boolean;
    rotateEveryMinutes?: number | null;
```

After the `PracticeSessionViewPlay` interface, add:

```ts
/** A block row on the read-only session views: a label and minutes, no drill. */
export interface PracticeSessionViewBlock {
    id: string;
    kind: BlockKind;
    /** null = the kind's default label */
    label: string | null;
    sequence: number;
    duration: number;
    /** The block's note */
    instructions: string | null;
    runsWithPrevious: boolean;
}

export type DrillRow = PracticeSessionViewPlay;
export type BlockRow = PracticeSessionViewBlock;
/** One row on the read-only views. A BlockRow has no `play`: narrow on `kind` first. */
export type SessionRow = DrillRow | BlockRow;
```

In `PracticeSessionView`, after `goaliesAttending?: number | null;`:

```ts
    /** Minutes between blocks (0–5); absent reads as 0. */
    transitionMinutes?: number;
```

Do **not** change the `plays` fields yet (Task 2 switches them).

- [ ] **Step 5: Create `lib/utils/session-rows.ts`**

```ts
/**
 * Session rows (practice timing, spec R1–R3): the drill / block distinction,
 * lenient readers for the new fields, editor row edits, and the save payload's
 * row inputs. Pure: no React, server or DOM imports, so both deployables, the
 * server actions, the static store and the plan document share it.
 */
import {
    BLOCK_DEFAULTS,
    BLOCK_KINDS,
    MAX_BLOCK_LABEL_LENGTH,
    MAX_ROTATE_MINUTES,
    MAX_TRANSITION_MINUTES,
    MIN_ROTATE_MINUTES,
    SESSION_ROW_KINDS,
    type BlockInSession,
    type BlockKind,
    type PlayInSession,
    type SessionItem,
    type SessionRowKind,
} from "@/types/practice-planner";

export const ROTATE_MINUTES_MESSAGE = `Rotation must be a whole number of minutes from ${MIN_ROTATE_MINUTES} to ${MAX_ROTATE_MINUTES}`;
export const TRANSITION_MINUTES_MESSAGE = `Between blocks must be a whole number of minutes from 0 to ${MAX_TRANSITION_MINUTES}`;
export const BLOCK_LABEL_MESSAGE = `Label must be at most ${MAX_BLOCK_LABEL_LENGTH} characters`;
export const BLOCK_HAS_NO_DRILL_MESSAGE = "A warm-up, break, transition or cool-down has no drill";
export const DRILL_NEEDS_PLAY_MESSAGE = "A drill needs a play";

export function isBlockKind(value: unknown): value is BlockKind {
    return (BLOCK_KINDS as readonly unknown[]).includes(value);
}

/** A known kind, else "drill": rows stored before practice timing have none. */
export function toRowKind(value: unknown): SessionRowKind {
    return (SESSION_ROW_KINDS as readonly unknown[]).includes(value) ? (value as SessionRowKind) : "drill";
}

type Kinded = { kind?: SessionRowKind };

/** A row is a drill unless its kind names a block. */
export function isDrillRow<T extends Kinded>(row: T): row is Exclude<T, { kind: BlockKind }> {
    return !isBlockKind(row.kind);
}

export function isBlockRow<T extends Kinded>(row: T): row is Extract<T, { kind: BlockKind }> {
    return isBlockKind(row.kind);
}

/** The drill rows, in order (the play sequence, diagrams, bench-sheet drill pages). */
export function drillRows<T extends Kinded>(rows: readonly T[]): Array<Exclude<T, { kind: BlockKind }>> {
    return rows.filter((row): row is Exclude<T, { kind: BlockKind }> => isDrillRow(row));
}

/** A block's name on screen and paper: its label, else its kind's default. */
export function blockTitle(kind: BlockKind, label: string | null | undefined): string {
    return label?.trim() || BLOCK_DEFAULTS[kind].label;
}

/**
 * Control characters the write paths strip (the same pattern as validation.ts's
 * sanitizedString and play-data's cleanText). The one copy the practice-timing
 * code shares: validation.ts, the plan document and the static store import it.
 * Global: use it with `replace` only, never `test` (a global regex keeps lastIndex).
 */
export const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

/** Cleaned and cut to 60 characters; empty or not text reads as null (the default label). */
export function toBlockLabel(value: unknown): string | null {
    if (typeof value !== "string") return null;
    return value.replace(CONTROL_CHARS, "").trim().slice(0, MAX_BLOCK_LABEL_LENGTH).trim() || null;
}

/** A whole number of minutes from 1 to 30, else null (no rotation). */
export function toRotateEveryMinutes(value: unknown): number | null {
    return typeof value === "number" && Number.isInteger(value) && value >= MIN_ROTATE_MINUTES && value <= MAX_ROTATE_MINUTES
        ? value
        : null;
}

/** A whole number of minutes from 0 to 5, else 0 (no gap). */
export function toTransitionMinutes(value: unknown): number {
    return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_TRANSITION_MINUTES ? value : 0;
}

/** A new block row with its kind's default minutes; the empty label shows the default. */
export function newBlockItem(kind: BlockKind, sequence: number, id: string): BlockInSession {
    return { id, kind, label: "", sequence, duration: BLOCK_DEFAULTS[kind].minutes, instructions: "", runsWithPrevious: false };
}

/** What a card may change in place. A label applies to a block row only. */
export interface RowEdit {
    duration?: number;
    instructions?: string;
    label?: string;
}

export function applyRowEdit<T extends SessionItem>(item: T, edit: RowEdit): T {
    const next = {
        ...item,
        ...(edit.duration !== undefined && { duration: edit.duration }),
        ...(edit.instructions !== undefined && { instructions: edit.instructions }),
    };
    return edit.label !== undefined && isBlockKind(item.kind) ? { ...next, label: edit.label } : next;
}

/** One drill row in a session save (hosted actions and the static store share the shape). */
export interface DrillRowInput {
    /** Absent = a drill (older clients). */
    kind?: "drill";
    playId: string;
    clientKey: string;
    sequence: number;
    runsWithPrevious: boolean;
    duration: number;
    instructions: string;
    /** Absent = unchanged (the stored row's value; false for a new row). */
    stays?: boolean;
    /** Absent = unchanged; null clears. */
    rotateEveryMinutes?: number | null;
}

/** One block row in a session save: no drill fields. */
export interface BlockRowInput {
    kind: BlockKind;
    clientKey: string;
    sequence: number;
    duration: number;
    instructions: string;
    /** null = the kind's default label */
    label: string | null;
}

export type SessionRowInput = DrillRowInput | BlockRowInput;

/** A drill card as a save row. Timing is sent only when the editor holds it, so a missing value never clears a stored one. */
export function toDrillRowInput(item: PlayInSession): DrillRowInput {
    return {
        kind: "drill",
        playId: item.playId,
        clientKey: item.id,
        sequence: item.sequence,
        runsWithPrevious: item.runsWithPrevious,
        duration: item.duration,
        instructions: item.instructions || "",
        ...(item.stays !== undefined && { stays: item.stays }),
        ...(item.rotateEveryMinutes !== undefined && { rotateEveryMinutes: item.rotateEveryMinutes }),
    };
}

/** Every editor row as a save row: what all three editor wrappers send. */
export function toSessionRowInputs(items: readonly SessionItem[]): SessionRowInput[] {
    return items.map((item) =>
        isBlockRow(item)
            ? {
                  kind: item.kind,
                  clientKey: item.id,
                  sequence: item.sequence,
                  duration: item.duration,
                  instructions: item.instructions || "",
                  label: toBlockLabel(item.label),
              }
            : toDrillRowInput(item),
    );
}

/** A stored row's timing, keyed by the drill copy it shows. */
export interface StoredTiming {
    playId: string | null;
    stays: boolean;
    rotateEveryMinutes: number | null;
}

type TimedRow = { kind?: SessionRowKind; playId?: string | null; stays?: boolean; rotateEveryMinutes?: number | null };

/** Whether a save left any drill's timing out, so the stored rows must be read first. */
export function needsStoredTiming(rows: readonly TimedRow[]): boolean {
    return rows.some((row) => !isBlockKind(row.kind) && (row.stays === undefined || row.rotateEveryMinutes === undefined));
}

/**
 * Absent = unchanged (spec R3): a drill row that omits `stays` or
 * `rotateEveryMinutes` keeps the stored row's value for the same play, and a
 * row with nothing stored takes the default. Explicit values, null included,
 * always win. Block rows never stay or rotate.
 */
export function withStoredTiming<R extends TimedRow>(
    rows: readonly R[],
    stored: readonly StoredTiming[],
): Array<R & { stays: boolean; rotateEveryMinutes: number | null }> {
    const byPlay = new Map<string, StoredTiming>();
    for (const row of stored) if (row.playId && !byPlay.has(row.playId)) byPlay.set(row.playId, row);
    return rows.map((row) => {
        if (isBlockKind(row.kind)) return { ...row, stays: false, rotateEveryMinutes: null };
        const before = row.playId ? byPlay.get(row.playId) : undefined;
        return {
            ...row,
            stays: row.stays ?? before?.stays ?? false,
            rotateEveryMinutes: row.rotateEveryMinutes !== undefined ? row.rotateEveryMinutes : (before?.rotateEveryMinutes ?? null),
        };
    });
}
```

- [ ] **Step 6: Extend `lib/utils/session-timeline.ts`**

Imports: replace the `@/types/practice-planner` import line and add the session-rows import:

```ts
import {
    MAX_ROTATE_MINUTES,
    MIN_ROTATE_MINUTES,
    type IceArea,
    type PlayData,
    type PlayFocus,
    type PlayGoalies,
    type SessionRowKind,
} from "@/types/practice-planner";
import { isBlockKind } from "@/lib/utils/session-rows";
```

Replace `TimelinePlay` and `StationGroup`:

```ts
export interface TimelinePlay {
    sequence: number;
    duration: number;
    runsWithPrevious: boolean;
    /** Absent = a drill (rows saved before practice timing). A block row never joins a station block. */
    kind?: SessionRowKind;
    /** In a rotating block: this station's group stays all block (spec R3). Ignored elsewhere. */
    stays?: boolean;
    /** On the first drill of a station block of 2 or more: groups rotate every this many minutes (spec R4). */
    rotateEveryMinutes?: number | null;
}

export interface StationGroup<T extends TimelinePlay> {
    /** 0-based block index */
    index: number;
    /** Offset from the session start, in minutes, gaps between blocks included */
    startMinute: number;
    /** The block's length: its longest drill, or M × rotating stations when it rotates */
    wallMinutes: number;
    /** At least one row, in sequence order (the caller's objects); more than one is a station block */
    stations: T[];
    /** The block's rotation, or null when it doesn't rotate */
    rotation: RotationGrid<T> | null;
}
```

Replace `groupStations` and `sessionWallMinutes`:

```ts
/** A row may join the block in progress only when both are drills. */
function joinsBlock(head: TimelinePlay, row: TimelinePlay): boolean {
    return row.runsWithPrevious && !isBlockKind(head.kind) && !isBlockKind(row.kind);
}

/**
 * Groups rows by sequence. A flagged first row (bad stored data) starts a
 * group rather than being dropped; sessionRowsError rejects it on save. A
 * block row is always its own group. `transitionMinutes` separates
 * consecutive groups (never after the last).
 */
export function groupStations<T extends TimelinePlay>(plays: readonly T[], transitionMinutes = 0): StationGroup<T>[] {
    const blocks: T[][] = [];
    for (const play of bySequence(plays)) {
        const current = blocks[blocks.length - 1];
        if (current && joinsBlock(current[0], play)) current.push(play);
        else blocks.push([play]);
    }
    let startMinute = 0;
    return blocks.map((stations, index) => {
        const group = { index, startMinute, wallMinutes: blockMinutes(stations), stations, rotation: rotationGrid(stations) };
        startMinute += group.wallMinutes + transitionMinutes;
        return group;
    });
}

/** The session's planned length: each block once, plus the gaps between blocks. */
export function sessionWallMinutes(plays: readonly TimelinePlay[], transitionMinutes = 0): number {
    const groups = groupStations(plays, transitionMinutes);
    const last = groups[groups.length - 1];
    return last ? last.startMinute + last.wallMinutes : 0;
}
```

Replace `ScheduleRow` and `buildSchedule`:

```ts
export interface ScheduleRow<T extends TimelinePlay> {
    group: StationGroup<T>;
    /** sessionStart + group.startMinute */
    startsAt: Date;
    /** startsAt + group.wallMinutes */
    endsAt: Date;
    /** Each rotation round's start; empty when the block doesn't rotate */
    roundStarts: Date[];
}

/**
 * Each block's start and end instant, and each rotation round's start (3b,
 * spec R4). Instants only: formatting, and so the timezone, belong to the
 * caller (lib/utils/date.ts), which keeps this module zone-free.
 */
export function buildSchedule<T extends TimelinePlay>(plays: readonly T[], sessionStart: Date, transitionMinutes = 0): ScheduleRow<T>[] {
    const base = sessionStart.getTime();
    return groupStations(plays, transitionMinutes).map((group) => {
        const startsAt = new Date(base + group.startMinute * MS_PER_MINUTE);
        return {
            group,
            startsAt,
            endsAt: new Date(startsAt.getTime() + group.wallMinutes * MS_PER_MINUTE),
            roundStarts: (group.rotation?.rounds ?? []).map((round) => new Date(startsAt.getTime() + round.start * MS_PER_MINUTE)),
        };
    });
}
```

Replace `normalizeGroups`:

```ts
/** The row itself when every change is already true of it, else a copy with the changes. */
function withChanges<T extends TimelinePlay>(row: T, changes: Partial<TimelinePlay>): T {
    const keys = Object.keys(changes) as Array<keyof TimelinePlay>;
    return keys.every((key) => row[key] === changes[key]) ? row : { ...row, ...changes };
}

/**
 * The editor's list rules, applied after every edit (2b, spec R3), by array order:
 * - sequence = position;
 * - the first row, a block row, and a drill right after a block row never run with a previous row;
 * - a block row never stays or rotates;
 * - only the first drill of a block of 2 or more keeps a rotation;
 * - in a rotating block, each rotating station lasts M and each stays station the whole block;
 * - outside a rotating block nothing stays.
 * A block set to rotate with fewer than 2 rotating stations keeps the coach's
 * settings while editing (the editor explains why); settleRotations clears it on save.
 * Unchanged rows keep their object.
 */
export function normalizeGroups<T extends TimelinePlay>(plays: readonly T[]): T[] {
    const next = plays.map((play, index) => {
        const block = isBlockKind(play.kind);
        const afterBlock = index > 0 && isBlockKind(plays[index - 1].kind);
        return withChanges(play, {
            sequence: index,
            runsWithPrevious: index > 0 && !block && !afterBlock && play.runsWithPrevious,
            ...(block && play.stays && { stays: false }),
            ...(block && play.rotateEveryMinutes != null && { rotateEveryMinutes: null }),
        });
    });
    for (let start = 0; start < next.length; ) {
        const { end } = groupRange(next, start);
        const stations = next.slice(start, end);
        const head = stations[0];
        const setToRotate = !isBlockKind(head.kind) && stations.length >= MIN_ROTATING_STATIONS && head.rotateEveryMinutes != null;
        const minutes = rotationMinutes(stations);
        const rotating = rotatingStations(stations).length;
        stations.forEach((row, k) => {
            const changes: Partial<TimelinePlay> = {};
            if ((k > 0 || !setToRotate) && row.rotateEveryMinutes != null) changes.rotateEveryMinutes = null;
            if (!setToRotate && row.stays) changes.stays = false;
            if (minutes !== null) changes.duration = row.stays ? minutes * rotating : minutes;
            next[start + k] = withChanges(row, changes);
        });
        start = end;
    }
    return next;
}
```

In `canToggleRunsWithPrevious`, after the first `if`:

```ts
    // A block row never joins, and is never joined by, a station block (spec R3).
    if (isBlockKind(plays[index].kind) || isBlockKind(plays[index - 1].kind)) return false;
```

Keep a block's rotation with the block when a list edit gives it a new first drill (ruling R4: a reorder or delete must never silently drop the coach's rotation and Stays ticks). Add, above `toggleRunsWithPrevious`:

```ts
/**
 * A block's rotation lives on its first drill (spec R3). After an edit that
 * gives the block a new first drill, that drill takes the rotation; the old
 * holder, now a later station, loses it in normalizeGroups. The block still
 * rotates, so its stays ticks stay. A no-op for a block row or no rotation.
 */
function carryRotation<T extends TimelinePlay>(rows: T[], head: number, rotateEveryMinutes: number | null | undefined): T[] {
    const row = rows[head];
    if (rotateEveryMinutes == null || !row || isBlockKind(row.kind) || row.rotateEveryMinutes === rotateEveryMinutes) return rows;
    const next = [...rows];
    next[head] = { ...row, rotateEveryMinutes };
    return next;
}
```

Replace `toggleRunsWithPrevious`:

```ts
/**
 * Flips the drill's flag; returns `plays` itself when that isn't allowed.
 * Joining the block before: the merged block keeps that block's rotation, else
 * takes the joining block's. Leaving a block: the block keeps its rotation on
 * its first drill; the drill that left starts a block with none (so nothing in
 * it stays, R3).
 */
export function toggleRunsWithPrevious<T extends TimelinePlay>(plays: T[], index: number): T[] {
    if (!canToggleRunsWithPrevious(plays, index)) return plays;
    const joining = !plays[index].runsWithPrevious;
    const next = plays.map((play, i) => (i === index ? { ...play, runsWithPrevious: !play.runsWithPrevious } : play));
    if (!joining) return normalizeGroups(next);
    const head = groupRange(plays, index - 1).start;
    return normalizeGroups(plays[head].rotateEveryMinutes != null ? next : carryRotation(next, head, plays[index].rotateEveryMinutes));
}
```

In `moveItem`, the within-block branch keeps the rotation on whichever station now heads the block:

```ts
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
        // A station moved up to the top takes the block's rotation.
        return normalizeGroups(carryRotation(next, group.start, plays[group.start].rotateEveryMinutes));
    }
```

(The unit-move branch below it is unchanged: a block that hops over its neighbour keeps its first drill.)

Replace `removeItem`:

```ts
/**
 * Removes the drill at `index`. Removing a block's first drill makes the next
 * station the head of what is left, so it never joins the block before it, and
 * hands it the block's rotation.
 */
export function removeItem<T extends TimelinePlay>(plays: T[], index: number): T[] {
    if (index < 0 || index >= plays.length) return plays;
    const removedHead = index === 0 || !plays[index].runsWithPrevious;
    const next = plays.filter((_, i) => i !== index);
    const follower = next[index];
    if (removedHead && follower?.runsWithPrevious) {
        next[index] = { ...follower, runsWithPrevious: false };
        return normalizeGroups(carryRotation(next, index, plays[index].rotateEveryMinutes));
    }
    return normalizeGroups(next);
}
```

Make `GoalieNeeds.playData` optional and skip block rows in `goalieWarnings`:

```ts
export interface GoalieNeeds {
    focus?: PlayFocus;
    goalies?: PlayGoalies;
    /** null = unreadable (needs one goalie if required); absent on a block row */
    playData?: PlayData | null;
}
```

```ts
        for (const station of group.stations) {
            // A block row has no drill: it neither needs nor uses a goalie.
            if (isBlockKind(station.kind)) continue;
            drills++;
            const demand = goalieDemand({ focus: station.focus, goalies: station.goalies, playData: station.playData ?? null });
```

(Keep the rest of the loop body as it is.) A rotating block needs no special case: each stays station needs its goalie for the whole block and each rotating station needs one in every round, which is the per-block sum the loop already takes (spec R4).

Append at the end of the file:

```ts
// ---------------------------------------------------------------------------
// Station rotation (practice timing, spec R4)
// ---------------------------------------------------------------------------

/** A rotating block needs at least this many stations that rotate. */
export const MIN_ROTATING_STATIONS = 2;
/** A stays station's cell in every round. */
export const ROTATION_ALL = "all";

export const BLOCK_STATION_ERROR = "A warm-up, break, transition or cool-down can't be part of a station block";
export const BLOCK_ROW_FIELDS_ERROR = "A warm-up, break, transition or cool-down can't rotate or stay";
export const ROTATION_PLACEMENT_ERROR = "Only the first drill of a station block can set a rotation";
export const ROTATION_TOO_FEW_ERROR = `A rotating station block needs at least ${MIN_ROTATING_STATIONS} stations that rotate`;

export interface RotationCell<T> {
    row: T;
    /** "A", "B", … or ROTATION_ALL */
    group: string;
}

export interface RotationRound<T> {
    /** Minutes from the block's start */
    start: number;
    /** One cell per station, in station order */
    stations: RotationCell<T>[];
}

export interface RotationGrid<T> {
    minutes: number;
    /** One group per rotating station: "A", "B", … */
    groups: string[];
    rounds: RotationRound<T>[];
}

/** The grid as rows of text: a Start column plus one column per station. */
export interface RotationTable {
    columns: string[];
    rows: Array<{ start: string; cells: string[] }>;
}

/** The stations that rotate (not marked stays). */
export function rotatingStations<T extends TimelinePlay>(stations: readonly T[]): T[] {
    return stations.filter((station) => !station.stays);
}

/** M when the block rotates: set on its first drill, with at least 2 rotating stations; else null. */
export function rotationMinutes(stations: readonly TimelinePlay[]): number | null {
    const head = stations[0];
    if (!head || isBlockKind(head.kind) || stations.length < MIN_ROTATING_STATIONS || head.rotateEveryMinutes == null) return null;
    return rotatingStations(stations).length >= MIN_ROTATING_STATIONS ? head.rotateEveryMinutes : null;
}

/** A lone row's minutes; a station block's longest station; a rotating block's M × rotating stations. */
export function blockMinutes(stations: readonly TimelinePlay[]): number {
    const minutes = rotationMinutes(stations);
    if (minutes !== null) return minutes * rotatingStations(stations).length;
    return stations.reduce((longest, station) => Math.max(longest, station.duration), 0);
}

function groupLetter(index: number): string {
    return String.fromCharCode(65 + index);
}

/**
 * Who is where in a rotating block: one group per rotating station, and in
 * round r group g is at rotating station (g + r) mod n, so every group visits
 * every rotating station once. A stays station shows ROTATION_ALL.
 */
export function rotationGrid<T extends TimelinePlay>(stations: readonly T[]): RotationGrid<T> | null {
    const minutes = rotationMinutes(stations);
    if (minutes === null) return null;
    const rotating = rotatingStations(stations);
    const n = rotating.length;
    const groups = rotating.map((_, g) => groupLetter(g));
    const rounds = Array.from({ length: n }, (_, r) => ({
        start: r * minutes,
        stations: stations.map((row) => {
            if (row.stays) return { row, group: ROTATION_ALL };
            // Station s holds the group g with (g + r) mod n = s.
            return { row, group: groups[(rotating.indexOf(row) - r + n) % n] };
        }),
    }));
    return { minutes, groups, rounds };
}

export function rotationTable<T extends TimelinePlay>(
    grid: RotationGrid<T>,
    name: (row: T) => string,
    start: (offsetMinutes: number, round: number) => string,
): RotationTable {
    return {
        columns: (grid.rounds[0]?.stations ?? []).map((cell) => name(cell.row)),
        rows: grid.rounds.map((round, index) => ({ start: start(round.start, index), cells: round.stations.map((cell) => cell.group) })),
    };
}

/** The interval offered when Rotate is switched on: the block keeps about its length. */
export function defaultRotationMinutes(stations: readonly TimelinePlay[]): number {
    const longest = stations.reduce((max, station) => Math.max(max, station.duration), 0);
    const each = Math.round(longest / Math.max(1, stations.length));
    return Math.min(MAX_ROTATE_MINUTES, Math.max(MIN_ROTATE_MINUTES, each));
}

/**
 * On save (spec R3): a block set to rotate that can't (fewer than 2 rotating
 * stations) loses its rotation and its stays flags. Returns `plays` itself
 * when nothing changes.
 */
export function settleRotations<T extends TimelinePlay>(plays: T[]): T[] {
    let changed = false;
    const next = [...plays];
    for (let start = 0; start < next.length; ) {
        const { end } = groupRange(next, start);
        const head = next[start];
        if (head.rotateEveryMinutes != null && rotationMinutes(next.slice(start, end)) === null) {
            changed = true;
            next[start] = { ...head, rotateEveryMinutes: null };
        }
        start = end;
    }
    return changed ? normalizeGroups(next) : plays;
}

/**
 * The save and import rules (spec R3), by sequence: the station rules, then
 * block rows outside station blocks with no timing, and rotation only on the
 * first drill of a block with at least 2 rotating stations. `stays` outside a
 * rotating block is ignored, not rejected.
 */
export function sessionRowsError(plays: readonly TimelinePlay[]): string | null {
    const rows = bySequence(plays);
    const stationError = stationGroupError(rows);
    if (stationError) return stationError;
    for (const [index, row] of rows.entries()) {
        const previous = rows[index - 1];
        if (isBlockKind(row.kind)) {
            if (row.runsWithPrevious) return BLOCK_STATION_ERROR;
            if (row.stays || row.rotateEveryMinutes != null) return BLOCK_ROW_FIELDS_ERROR;
        } else if (row.runsWithPrevious && previous && isBlockKind(previous.kind)) {
            return BLOCK_STATION_ERROR;
        }
    }
    for (const group of groupStations(rows)) {
        const [head, ...rest] = group.stations;
        if (rest.some((row) => row.rotateEveryMinutes != null)) return ROTATION_PLACEMENT_ERROR;
        if (head.rotateEveryMinutes == null) continue;
        if (group.stations.length < MIN_ROTATING_STATIONS) return ROTATION_PLACEMENT_ERROR;
        if (rotatingStations(group.stations).length < MIN_ROTATING_STATIONS) return ROTATION_TOO_FEW_ERROR;
    }
    return null;
}

/** The bench sheet's rotation header: "Stations · rotate every 5 min · 15 min". */
export function rotationBlockLabel(rotateEvery: number, minutes: number): string {
    return `Stations · rotate every ${rotateEvery} min · ${minutes} min`;
}

/** The editor's summary: "3 stations × 5 min = 15 min · groups A–C". */
export function rotationSummary(rotating: number, rotateEvery: number): string {
    return `${rotating} stations × ${rotateEvery} min = ${rotating * rotateEvery} min · groups A–${groupLetter(rotating - 1)}`;
}

/** The session page's chip: "Rotates every 5 min". */
export function rotatesEveryLabel(minutes: number): string {
    return `Rotates every ${minutes} min`;
}

/** "2 min between blocks". */
export function betweenBlocksLabel(minutes: number): string {
    return `${minutes} min between blocks`;
}

/** A round's minutes within its block, where no clock time is known: "5–10 min". */
export function rotationRoundLabel(start: number, minutes: number): string {
    return `${start}–${start + minutes} min`;
}

/** The mark of a station whose group doesn't rotate (session page, bench sheet, import preview). */
export const STAYS_MARK = "stays";

/** What follows a station's name in a rotating block: " · stays", or nothing (its minutes are the rotation's). */
export function staysSuffix(stays: boolean | undefined): string {
    return stays ? ` · ${STAYS_MARK}` : "";
}
```

`MIN_ROTATING_STATIONS` is read by `normalizeGroups` and `rotationMinutes`, and the rotation types by `StationGroup`, all above their declarations. That is fine: interfaces are type-only, and a module-scope `const` is initialized when the module loads, before any of these functions runs. `ROTATION_ALL` is read only by `rotationGrid`, below it.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `bun run test __tests__/lib/utils/session-rows.test.ts __tests__/lib/utils/session-timeline.test.ts __tests__/lib/data/starter-templates.test.ts __tests__/lib/plan-document`
Expected: PASS. The starter-template and plan-document suites use `groupStations` and `sessionWallMinutes`; they must be unchanged. The existing `moveItem` / `removeItem` / `toggleRunsWithPrevious` tests pass unchanged: their rows carry no rotation, so `carryRotation` is a no-op.

Run: `bun run test`
Expected: PASS (the whole suite: today's data has no block rows, rotation or gaps, so every caller's results are unchanged).

Run: `bun run type-check`
Expected: PASS. Nothing reads the new types yet.

- [ ] **Step 8: Commit**

```bash
/usr/bin/git add types/practice-planner.ts lib/utils/session-rows.ts lib/utils/session-timeline.ts \
  __tests__/lib/utils/session-rows.test.ts __tests__/lib/utils/session-timeline.test.ts
/usr/bin/git commit -m "feat(practice-planner): row kinds, station rotation and gap maths" -m "Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 2: The row union across every reader

Switch the two session types' `plays` to the unions and make every reader narrow on `kind`. After this task every surface shows a block row correctly (the editor, the session page, the bench sheet and its exports), the session page and the bench sheet fold the gap into start times, and nothing writes a block row yet: hosted actions, the static store and the plan document keep their current input shapes. The four seams in Global Constraints hold the writers back.

**Files:**
- Modify: `types/practice-planner.ts` (`PracticeSessionData.plays`, `PracticeSessionView.plays`)
- Modify: `lib/utils/drill-tags.ts` (`sessionForDisplay`)
- Modify: `lib/utils/session-drill-ids.ts` (`applySavedPlayIds`, `upsertSessionDrill`)
- Modify: `components/features/practice-planner/useSessionDrillDialog.ts`, `useSessionGoalies.ts`
- Create: `components/features/practice-planner/BlockRowCard.tsx`
- Modify: `components/features/practice-planner/SessionDrillList.tsx`, `SessionDrillCard.tsx` (`onUpdate` type), `PracticeSessionEditor.tsx` (state type, `sentPlayIds`, `handleUpdatePlayInSession`)
- Modify (replace whole file): `components/features/practice-planner/SessionTimeline.tsx`
- Modify: `app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx`
- Modify: `components/features/practice-planner/print/BenchSheet.tsx`
- Modify: `components/features/practice-planner/export/bench-sheet-model.ts`, `bench-sheet-html.ts`, `bench-sheet-docx.ts`
- Modify: `components/features/practice-planner/ExportPlanMenu.tsx` (seam S3)
- Modify: `app/(dashboard)/practice-planner/[sessionId]/edit/EditSessionWrapper.tsx`, `app/(dashboard)/practice-planner/new/PracticeSessionEditorWrapper.tsx` (seam S1), `apps/planner/src/screens/SessionEditorScreen.tsx` (seam S2)
- Test (create): `__tests__/components/features/practice-planner/BlockRowCard.test.tsx`, `__tests__/components/features/practice-planner/PracticeSessionEditor.blocks.test.tsx`, `__tests__/app/practice-session-detail-blocks.test.tsx`
- Test (append): `__tests__/lib/utils/drill-tags.test.ts`, `__tests__/lib/utils/session-drill-ids.test.ts`, `__tests__/components/features/practice-planner/SessionTimeline.test.tsx`, `__tests__/components/features/practice-planner/print/BenchSheet.test.tsx`, `__tests__/components/features/practice-planner/export/bench-sheet-model.test.ts`, `bench-sheet-html.test.ts`, `bench-sheet-docx.test.ts`
- Test (modify): `__tests__/apps/planner/editor-screens.test.tsx` (the `toLocalSessionSave` expectation)
- Test (narrow, ruling R1; they read drill-only fields off the new unions and fail type-check otherwise): `__tests__/lib/utils/session-drill-ids.test.ts` (lines 15, 22, 43), `__tests__/components/features/practice-planner/PracticeSessionEditor.drill-dialog.test.tsx` (lines 91, 113, 122, 145, 175, 227), `__tests__/components/features/practice-planner/PracticeSessionEditor.drill-ids.test.tsx` (lines 64, 67), `__tests__/apps/planner/local-store.sessions.test.ts` (lines 38, 178, 202, 241, 266, 277, 279, 284), `__tests__/apps/planner/import-screen.test.tsx` (lines 175–213)

**Interfaces:**
- Consumes (Task 1): `SessionItem`, `BlockInSession`, `SessionRow`, `BlockKind`, `isDrillRow`, `isBlockRow`, `drillRows`, `blockTitle`, `RowEdit`, `applyRowEdit`, `toDrillRowInput`, `groupStations(plays, transitionMinutes)`, `buildSchedule(plays, start, transitionMinutes)`, `sessionWallMinutes(plays, transitionMinutes)`.
- Produces:
  - `PracticeSessionData.plays: SessionItem[]`, `PracticeSessionView.plays: SessionRow[]`;
  - `BlockRowCard` props `{ item: BlockInSession; index: number; canMoveUp: boolean; canMoveDown: boolean; locked?: boolean; onUpdate(id: string, edit: RowEdit): void; onDelete(id: string): void; onMoveUp(index: number): void; onMoveDown(index: number): void }` and `BLOCK_ICONS: Record<BlockKind, SvgIconComponent>`;
  - `SessionDrillListProps.plays: SessionItem[]`, `onUpdate: (id: string, edit: RowEdit) => void` (same on `SessionDrillCardProps`);
  - `SessionTimelineDrill`, `SessionTimelineBlock`, `SessionTimelinePlay = SessionTimelineDrill | SessionTimelineBlock`; `SessionTimelineProps.transitionMinutes?: number`;
  - `ExportSessionPlay` (drill, `kind?: "drill"`, `stays?`, `rotateEveryMinutes?`), `ExportSessionBlock`, `ExportSessionRow`; `ExportSession.plays: ExportSessionRow[]`, `ExportSession.transitionMinutes?: number`;
  - `BenchSheetTimelineRow = { kind?: "drill"; start; minutes; label; stations: string[] | null } | { kind: "block"; start: string; minutes: number; label: string; note: string | null; stations: null }`.

- [ ] **Step 1: Write the failing tests for the shared helpers**

Append to `__tests__/lib/utils/drill-tags.test.ts` (add `import { isDrillRow } from "@/lib/utils/session-rows";` at the top):

```ts
describe("sessionForDisplay with block rows", () => {
    it("passes block rows through untouched and still hides markers on drills", () => {
        const breakRow = { id: "b", kind: "break" as const, label: null, sequence: 1, duration: 2, instructions: null, runsWithPrevious: false };
        const session = { goaliesAttending: 0, plays: [{ play: { goalies: "optional" as const, playData: BOARD } }, breakRow] };
        const shown = sessionForDisplay(session);
        expect(shown.plays[1]).toBe(breakRow);
        const [drill] = shown.plays;
        if (!isDrillRow(drill)) throw new Error("expected a drill row");
        expect(drill.play.playData?.players).toHaveLength(1);
    });
});
```

Append to `__tests__/lib/utils/session-drill-ids.test.ts` (merge `BlockInSession, SessionItem` into its `@/types/practice-planner` type import, and import `createEmptyPlayData` from `@/lib/utils/play-data` if the file doesn't already):

```ts
describe("session-drill-ids with block rows", () => {
    const BLOCK: BlockInSession = { id: "kb", kind: "warmup", label: "", sequence: 0, duration: 8, instructions: "", runsWithPrevious: false };
    const patch = { playId: "cx", name: "X", description: "", thumbnail: "", playData: createEmptyPlayData() };

    it("never gives a block row a play id", () => {
        const plays: SessionItem[] = [BLOCK];
        expect(applySavedPlayIds(plays, new Map(), [{ clientKey: "kb", playId: "cx" }])).toBe(plays);
        expect(upsertSessionDrill(plays, "kb", patch)[0]).toBe(BLOCK);
    });

    it("appends a new drill after a block with the next sequence", () => {
        expect(upsertSessionDrill([BLOCK], "kd", patch)[1]).toMatchObject({ id: "kd", sequence: 1, runsWithPrevious: false, playId: "cx" });
    });
});
```

In the same file (it already imports `createEmptyPlayData`), add `import { drillRows } from "@/lib/utils/session-rows";` and narrow the three existing reads of drill-only fields off the returned `SessionItem[]`:
- line 15: `expect(drillRows(next).map((p) => p.playId)).toEqual(["copy", "owned"]);`
- line 22: `expect(drillRows(next)[0].playId).toBe("forked-by-dialog");`
- line 43: `expect(drillRows(next)[0].playDataUnreadable).toBeFalsy();`

The editor's save payload is `SessionItem[]` now, so the two editor test files narrow their `playId` reads the same way (add `import { drillRows } from "@/lib/utils/session-rows";` to each):
- `__tests__/components/features/practice-planner/PracticeSessionEditor.drill-dialog.test.tsx`: line 91 becomes `expect(drillRows(onSave.mock.calls[0][0].plays).map((p) => p.playId)).toEqual([FORK]);`, and lines 113, 122, 145, 175 and 227, each `expect(onSave.mock.calls[N][0].plays[0].playId)…`, become `expect(drillRows(onSave.mock.calls[N][0].plays)[0].playId)…` with the same `N` and matcher;
- `__tests__/components/features/practice-planner/PracticeSessionEditor.drill-ids.test.tsx`: lines 64 and 67 likewise (`drillRows(onSave.mock.calls[0][0].plays)[0].playId`, `drillRows(onSave.mock.calls[1][0].plays)[0].playId`).

`PracticeSessionView.plays` becomes `SessionRow[]`, so `__tests__/apps/planner/local-store.sessions.test.ts` narrows its `.play` reads (add `import { drillRows } from "@/lib/utils/session-rows";`; Tasks 4 and 5 merge their session-rows names into this import):
- line 38: `return view.success ? drillRows(view.data.plays).map((p) => p.play.id) : [];`
- line 178: `expect(view.success && drillRows(view.data.plays)[0].play.id).not.toBe(original);`
- line 202: `expect(view.success && drillRows(view.data.plays)[0].play.playData).toBeNull();`
- line 241: `expect(view.success && drillRows(view.data.plays).map((p) => [p.play.name, p.runsWithPrevious, p.instructions])).toEqual([`
- line 266: `expect(drillRows(view.plays)[0].play).toMatchObject({ focus: "goalies", goalies: "required" });`
- line 277: `const owned = drillRows(view.plays)[0].play.id;`
- line 279: `expect(drillRows(data(await store.getSessionView(session.id)).plays)[0].play).toMatchObject({ focus: "goalies", goalies: "optional" });`
- line 284: `expect(drillRows(copy.plays)[0].play).toMatchObject({ focus: "goalies", goalies: "optional" });`

`__tests__/apps/planner/import-screen.test.tsx` ("stores fresh drills…", lines 175–213) reads `.playId`, `.name` and `.playData` on every editor row and rebuilds each row as a drill. Narrow it, and keep each row's minutes (Task 10 makes Skills Stations fill 60 of 60 minutes, so a `+ 1` on every row would no longer fit the session). Add `import { drillRows, toDrillRowInput } from "@/lib/utils/session-rows";` and:
- line 189: `for (const play of drillRows(initialData.plays)) {`
- replace the `plays: initialData.plays.map((play) => ({ … duration: play.duration + 1, instructions: "Changed" })),` argument (lines 204–211) with:

```ts
            // The static store doesn't take block rows yet, so the update carries the drill rows.
            plays: drillRows(initialData.plays).map((play) => ({ ...toDrillRowInput(play), instructions: "Changed" })),
```

- [ ] **Step 2: Write the failing editor tests**

Create `__tests__/components/features/practice-planner/BlockRowCard.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { BlockRowCard } from "@/components/features/practice-planner/BlockRowCard";
import type { BlockInSession } from "@/types/practice-planner";

const BREAK: BlockInSession = { id: "kb", kind: "break", label: "", sequence: 2, duration: 2, instructions: "", runsWithPrevious: false };

function renderCard(item: BlockInSession = BREAK, extra: Partial<React.ComponentProps<typeof BlockRowCard>> = {}) {
    const props = {
        item, index: 2, canMoveUp: true, canMoveDown: false,
        onUpdate: vi.fn(), onDelete: vi.fn(), onMoveUp: vi.fn(), onMoveDown: vi.fn(),
        ...extra,
    };
    render(
        <ThemeProvider theme={createTheme({ palette: { mode: "dark" } })}>
            <BlockRowCard {...props} />
        </ThemeProvider>,
    );
    return props;
}

describe("BlockRowCard", () => {
    it("titles the block by its kind's default label until the coach names it, with no diagram or station switch", () => {
        renderCard();
        expect(screen.getByRole("heading", { name: "Water break" })).toBeInTheDocument();
        expect(screen.getByRole("textbox", { name: "Label" })).toHaveAttribute("placeholder", "Water break");
        expect(screen.queryByRole("img")).toBeNull();
        expect(screen.queryByRole("switch")).toBeNull();
        expect(screen.queryByRole("checkbox")).toBeNull();
    });

    it("edits the label, the note and the minutes in place", () => {
        const { onUpdate } = renderCard({ ...BREAK, label: "Fill bottles" });
        expect(screen.getByRole("heading", { name: "Fill bottles" })).toBeInTheDocument();
        fireEvent.change(screen.getByRole("textbox", { name: "Label" }), { target: { value: "Water" } });
        expect(onUpdate).toHaveBeenLastCalledWith("kb", { label: "Water" });
        fireEvent.change(screen.getByRole("textbox", { name: "Note" }), { target: { value: "Tape sticks" } });
        expect(onUpdate).toHaveBeenLastCalledWith("kb", { instructions: "Tape sticks" });
        fireEvent.click(screen.getByRole("button", { name: "More minutes for Fill bottles" }));
        expect(onUpdate).toHaveBeenLastCalledWith("kb", { duration: 3 });
        fireEvent.click(screen.getByRole("button", { name: "Fewer minutes for Fill bottles" }));
        expect(onUpdate).toHaveBeenLastCalledWith("kb", { duration: 1 });
        expect(screen.getByText("2 min")).toBeInTheDocument();
    });

    it("stops the minutes at 1", () => {
        renderCard({ ...BREAK, duration: 1 });
        expect(screen.getByRole("button", { name: "Fewer minutes for Water break" })).toBeDisabled();
    });

    it("moves and deletes by its position", () => {
        const { onMoveUp, onDelete } = renderCard();
        fireEvent.click(screen.getByRole("button", { name: "Move Water break up" }));
        expect(onMoveUp).toHaveBeenCalledWith(2);
        expect(screen.getByRole("button", { name: "Move Water break down" })).toBeDisabled();
        fireEvent.click(screen.getByRole("button", { name: "Delete Water break" }));
        expect(onDelete).toHaveBeenCalledWith("kb");
    });

    it("locks every control while the session is being created", () => {
        renderCard(BREAK, { locked: true });
        expect(screen.getByRole("textbox", { name: "Label" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Delete Water break" })).toBeDisabled();
    });
});
```

Create `__tests__/components/features/practice-planner/PracticeSessionEditor.blocks.test.tsx`:

```tsx
import { beforeAll, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { renderWithPlanner } from "@/__tests__/helpers/planner";
import { PracticeSessionEditor } from "@/components/features/practice-planner/PracticeSessionEditor";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import type { SessionItem } from "@/types/practice-planner";

beforeAll(() => {
    global.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver;
});

const TEAM = "cteamxxxxxxxxxxxxxxxxxxxx";
const PLAYS: SessionItem[] = [
    { id: "kw", kind: "warmup", label: "", sequence: 0, duration: 8, instructions: "Easy laps", runsWithPrevious: false },
    { id: "k1", playId: "cplayaxxxxxxxxxxxxxxxxxxx", name: "Breakout", sequence: 1, runsWithPrevious: false, duration: 10, instructions: "", playData: createEmptyPlayData(), thumbnail: "" },
    { id: "kb", kind: "break", label: "Water", sequence: 2, duration: 2, instructions: "", runsWithPrevious: false },
];

function renderEditor(onSave = vi.fn().mockResolvedValue({ success: true })) {
    renderWithPlanner(
        <ThemeProvider theme={createTheme()}>
            <LocalizationProvider dateAdapter={AdapterDateFns}>
                <PracticeSessionEditor
                    teamId={TEAM}
                    initialData={{ title: "Practice", duration: 60, date: new Date("2026-04-07T22:00:00.000Z"), plays: PLAYS }}
                    onSave={onSave}
                />
            </LocalizationProvider>
        </ThemeProvider>,
    );
    return onSave;
}

async function save() {
    await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /^save session/i }));
    });
}

describe("PracticeSessionEditor: block rows", () => {
    it("shows block rows as block cards between the drills, and counts their minutes", () => {
        renderEditor();
        expect(screen.getByRole("heading", { name: "Warm-up" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Water" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Breakout" })).toBeInTheDocument();
        expect(screen.getByText("Total Play Time: 20 minutes")).toBeInTheDocument();
    });

    it("saves the block rows it loaded, unchanged and in order", async () => {
        const onSave = renderEditor();
        await save();
        expect(onSave.mock.calls[0][0].plays).toEqual(PLAYS);
    });

    it("edits a block in place and moves it like any row", async () => {
        const onSave = renderEditor();
        fireEvent.click(screen.getByRole("button", { name: "More minutes for Water" }));
        fireEvent.click(screen.getByRole("button", { name: "Move Water up" }));
        await save();
        const plays = onSave.mock.calls[0][0].plays as SessionItem[];
        expect(plays.map((play) => play.id)).toEqual(["kw", "kb", "k1"]);
        expect(plays[1]).toMatchObject({ kind: "break", duration: 3, sequence: 1, runsWithPrevious: false });
    });
});
```

- [ ] **Step 3: Write the failing read-side tests**

Append to `__tests__/components/features/practice-planner/SessionTimeline.test.tsx`:

```tsx
describe("SessionTimeline: block rows and the gap between blocks", () => {
    const ROWS = [
        { id: "row-w", sequence: 0, duration: 8, runsWithPrevious: false, kind: "warmup" as const, label: null, instructions: "Easy laps" },
        play("Breakout", 1, 15),
        { id: "row-c", sequence: 2, duration: 5, runsWithPrevious: false, kind: "cooldown" as const, label: "Stretch", instructions: null },
    ];

    it("shows a block by its label and note, never as a link, and folds the gap into start times", () => {
        render(
            <ThemeProvider theme={createTheme()}>
                <SessionTimeline plays={ROWS} sessionStart={START} timeZone="America/New_York" showZone durationMinutes={60} transitionMinutes={2} onSelectPlay={vi.fn()} />
            </ThemeProvider>,
        );
        const [warmup, breakout, cooldown] = bodyRows();
        expect(within(warmup).getByText("Warm-up")).toBeInTheDocument();
        expect(within(warmup).getByText(/Easy laps/)).toBeInTheDocument();
        expect(within(warmup).queryByRole("button")).toBeNull();
        expect(within(breakout).getByText("6:10 PM EDT")).toBeInTheDocument();
        expect(within(breakout).getByRole("button", { name: "Breakout" })).toBeInTheDocument();
        expect(within(cooldown).getByText("6:27 PM EDT")).toBeInTheDocument();
        expect(within(cooldown).getByText("Stretch")).toBeInTheDocument();
        expect(screen.getByText("Planned 32 of 60 min")).toBeInTheDocument();
    });

    it("prints a block as plain text", () => {
        const html = renderToStaticMarkup(
            <SessionTimeline variant="print" plays={ROWS} sessionStart={START} timeZone="America/New_York" showZone durationMinutes={60} transitionMinutes={2} />,
        );
        expect(html).toContain("Warm-up · Easy laps");
        expect(html).toContain("Planned 32 of 60 min");
    });
});
```

Create `__tests__/app/practice-session-detail-blocks.test.tsx`:

```tsx
/** Session detail (spec R9): block rows on the timeline only; the sequence, the viewer and the counts are drills. */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { renderWithPlanner } from "@/__tests__/helpers/planner";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import type { PracticeSessionView } from "@/types/practice-planner";

vi.mock("@/lib/utils/canvas/thumbnail-generator", () => ({ generateThumbnail: () => "data:image/png;base64,LIVE" }));
vi.mock("@/components/features/practice-planner/StationMap", () => ({ StationMap: () => null }));
vi.mock("@/components/features/practice-planner/PlayLegend", () => ({ PlayLegend: () => null, LegendSwatch: () => null }));

import { SessionDetailView } from "@/app/(dashboard)/practice-planner/[sessionId]/SessionDetailView";

const drill = (id: string, name: string, sequence: number) => ({
    id, sequence, duration: 10, runsWithPrevious: false, instructions: null,
    play: { id: `play-${id}`, name, description: null, thumbnail: null, playData: createEmptyPlayData() },
});

const SESSION: PracticeSessionView = {
    id: "csessionxxxxxxxxxxxxxxxxx", title: "Tuesday", date: "2026-04-07T22:00:00.000Z", duration: 60, isShared: false,
    createdByName: "Coach", teamId: "cteamxxxxxxxxxxxxxxxxxxxx", teamName: "Team", startAt: null, transitionMinutes: 2,
    plays: [
        { id: "row-w", kind: "warmup", label: null, sequence: 0, duration: 8, instructions: "Easy laps", runsWithPrevious: false },
        drill("row-a", "Breakout", 1),
        { id: "row-b", kind: "break", label: "Water", sequence: 2, duration: 2, instructions: null, runsWithPrevious: false },
        drill("row-c", "Shooting", 3),
    ],
};

function renderView() {
    renderWithPlanner(
        <ThemeProvider theme={createTheme()}>
            <SessionDetailView session={SESSION} isAdmin={false} />
        </ThemeProvider>,
    );
}

describe("SessionDetailView: block rows", () => {
    it("counts and pages through drills only, starting on the first drill", () => {
        renderView();
        expect(screen.getByText("2 plays")).toBeInTheDocument();
        expect(screen.getByText("Play 1 of 2")).toBeInTheDocument();
        expect(screen.getByRole("heading", { level: 5, name: "Breakout" })).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Next play" }));
        expect(screen.getByRole("heading", { level: 5, name: "Shooting" })).toBeInTheDocument();
    });

    it("lists blocks on the timeline, with the gap folded into the next start, and not in the play sequence", () => {
        renderView();
        const timeline = screen.getByRole("table", { name: "Session timeline" });
        expect(within(timeline).getByText("Warm-up")).toBeInTheDocument();
        expect(within(timeline).getByText("Water")).toBeInTheDocument();
        expect(screen.getAllByText("Warm-up")).toHaveLength(1);
        // 8 + 2 + 10 + 2 + 2 + 2 + 10 = 36
        expect(screen.getByText("Planned 36 of 60 min")).toBeInTheDocument();
    });

    it("selects a drill from the timeline by its place among the drills", () => {
        renderView();
        fireEvent.click(within(screen.getByRole("table", { name: "Session timeline" })).getByRole("button", { name: "Shooting" }));
        expect(screen.getByText("Play 2 of 2")).toBeInTheDocument();
    });
});
```

Append to `__tests__/components/features/practice-planner/print/BenchSheet.test.tsx`:

```tsx
describe("BenchSheet: block rows", () => {
    const WITH_BLOCKS: BenchSheetSession = {
        ...SESSION,
        transitionMinutes: 1,
        plays: [
            { id: "row-w", kind: "warmup", label: null, sequence: 0, duration: 8, instructions: "Easy laps", runsWithPrevious: false },
            sessionPlay("Breakout", 1, false, 15, { playData: withPass("d1") }),
            { id: "row-c", kind: "cooldown", label: null, sequence: 2, duration: 5, instructions: null, runsWithPrevious: false },
        ],
    };

    it("puts blocks on the timeline but gives only drills a page, numbered from 1", async () => {
        renderSheet(WITH_BLOCKS);
        const timeline = screen.getByRole("table", { name: "Session timeline" });
        expect(within(timeline).getByText(/Warm-up · Easy laps/)).toBeInTheDocument();
        expect(within(timeline).getByText("Cool-down")).toBeInTheDocument();
        expect(drills().map((article) => article.getAttribute("aria-label"))).toEqual(["Drill 1: Breakout"]);
    });

    it("prints the timeline for a practice with only blocks", () => {
        renderSheet({ ...WITH_BLOCKS, plays: [WITH_BLOCKS.plays[0]] });
        expect(screen.queryByText("No drills planned")).toBeNull();
        expect(screen.getByRole("table", { name: "Session timeline" })).toBeInTheDocument();
        expect(drills()).toHaveLength(0);
        expect(screen.getByRole("button", { name: "Print" })).toBeEnabled();
    });
});
```

Append to `__tests__/components/features/practice-planner/export/bench-sheet-model.test.ts` (merge `BlockKind` into its type imports from `@/types/practice-planner`; it already imports `buildLegend` and has `withPass` and `renderers()`, whose images are `data:image/png;base64,SWAT`):

```ts
describe("buildBenchSheetModel: block rows and the gap", () => {
    const blockRow = (kind: BlockKind, sequence: number, duration: number, label: string | null = null, instructions: string | null = null) =>
        ({ kind, sequence, duration, label, instructions, runsWithPrevious: false });
    const WITH_BLOCKS: ExportSession = {
        ...UNBOOKED,
        transitionMinutes: 2,
        plays: [
            blockRow("warmup", 0, 8, null, "Easy laps"),
            play("Breakout", 1, 10, false, { playData: withPass("a") }),
            blockRow("break", 2, 2, "Water"),
            play("Shooting", 3, 15, false, { playData: withPass("b") }),
        ],
    };

    it("lists blocks on the timeline by label and note, with the gap in the start times", () => {
        const model = buildBenchSheetModel(WITH_BLOCKS, renderers());
        const start = new Date(WITH_BLOCKS.date);
        const at = (minutes: number) => formatClockTime(new Date(start.getTime() + minutes * 60_000), undefined, false);
        expect(model.timeline).toEqual([
            { kind: "block", start: at(0), minutes: 8, label: "Warm-up", note: "Easy laps", stations: null },
            { start: at(10), minutes: 10, label: "Breakout", stations: null },
            { kind: "block", start: at(22), minutes: 2, label: "Water", note: null, stations: null },
            { start: at(26), minutes: 15, label: "Shooting", stations: null },
        ]);
        expect(model.planned).toBe("Planned 41 of 60 min");
    });

    it("numbers and draws drills only", () => {
        const model = buildBenchSheetModel(WITH_BLOCKS, renderers());
        expect(model.drills.map((d) => [d.number, d.name])).toEqual([[1, "Breakout"], [2, "Shooting"]]);
        // Both drills draw one pass: one legend entry, from the drills alone.
        expect(model.legend).toEqual(buildLegend(withPass("x")).map((entry) => ({ label: entry.label, image: "data:image/png;base64,SWAT" })));
    });
});
```

(If the file's `UNBOOKED` fixture is not in an outer scope at the append point, use `BOOKED` with `startAt: null, venueTimezone: null` inline. `formatClockTime(date, timeZone, withZone)` with `undefined` is the viewer's zone, which is what an unbooked session uses.)

Append to `__tests__/components/features/practice-planner/export/bench-sheet-html.test.ts`:

```ts
describe("renderBenchSheetHtml: block rows", () => {
    it("prints a block as its label and note on one line, escaped", () => {
        const doc = parse(renderBenchSheetHtml({
            ...MODEL,
            timeline: [{ kind: "block", start: "5:50 PM", minutes: 8, label: "Warm-up <fast>", note: "Laps & stretch", stations: null }, ...MODEL.timeline],
        }));
        const first = doc.querySelectorAll("tbody tr")[0];
        expect(first.textContent).toContain("Warm-up <fast> · Laps & stretch");
        expect(first.querySelector("ul")).toBeNull();
    });

    it("prints the timeline for a practice with only blocks", () => {
        const doc = parse(renderBenchSheetHtml({ ...MODEL, legend: [], drills: [], timeline: [{ kind: "block", start: "6:00 PM", minutes: 5, label: "Cool-down", note: null, stations: null }] }));
        expect(doc.querySelector(".empty")).toBeNull();
        expect(doc.querySelector("table")?.textContent).toContain("Cool-down");
    });
});
```

Append to `__tests__/components/features/practice-planner/export/bench-sheet-docx.test.ts`:

```ts
describe("renderBenchSheetDocx: block rows", () => {
    it("writes a block as its label and note in the timeline", async () => {
        const xml = await documentXml({
            ...MODEL,
            timeline: [{ kind: "block", start: "5:50 PM", minutes: 8, label: "Warm-up", note: "Easy laps", stations: null }, ...MODEL.timeline],
        });
        expect(xml).toContain("Warm-up · Easy laps");
    });
});
```

In `__tests__/apps/planner/editor-screens.test.tsx`, the `toLocalSessionSave` expectation gains the row kind (the static store ignores it until Task 4):

```ts
            plays: [{ kind: "drill", playId: "p1", clientKey: "k1", sequence: 0, runsWithPrevious: false, duration: 10, instructions: "" }],
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `bun run test __tests__/lib/utils/drill-tags.test.ts __tests__/lib/utils/session-drill-ids.test.ts __tests__/components/features/practice-planner/BlockRowCard.test.tsx __tests__/components/features/practice-planner/PracticeSessionEditor.blocks.test.tsx __tests__/components/features/practice-planner/SessionTimeline.test.tsx __tests__/app/practice-session-detail-blocks.test.tsx __tests__/components/features/practice-planner/print/BenchSheet.test.tsx __tests__/components/features/practice-planner/export __tests__/apps/planner/editor-screens.test.tsx`
Expected: FAIL. `BlockRowCard` doesn't exist, block rows crash the readers (`sp.play` is undefined), and the gap is ignored.

- [ ] **Step 5: Switch the session types and the shared helpers**

In `types/practice-planner.ts`:
- `PracticeSessionData.plays: PlayInSession[];` becomes `plays: SessionItem[];`
- `PracticeSessionView.plays: PracticeSessionViewPlay[];` becomes `plays: SessionRow[];`

In `lib/utils/drill-tags.ts`, import `BlockKind` with the other types and `isDrillRow` from `@/lib/utils/session-rows`, then replace `DisplayablePlay` and `sessionForDisplay`:

```ts
interface DisplayablePlay {
    kind?: "drill";
    play: { focus?: PlayFocus; goalies?: PlayGoalies; playData: PlayData | null };
}

/** A block row (practice timing): no drill, nothing to draw. */
interface DisplayableBlock {
    kind: BlockKind;
}

/**
 * The session with every drill's diagram passed through displayPlayData.
 * Render-time only (spec R7): never stored, never exported as plan JSON.
 * Block rows pass through as they are. Returns the session itself when
 * nothing is hidden, so memos stay stable.
 */
export function sessionForDisplay<S extends { goaliesAttending?: number | null; plays: ReadonlyArray<DisplayablePlay | DisplayableBlock> }>(session: S): S {
    let changed = false;
    const plays = session.plays.map((sp) => {
        if (!isDrillRow(sp)) return sp;
        const shown = displayPlayData(sp.play.playData, sp.play.goalies, session.goaliesAttending, sp.play.focus);
        if (shown === sp.play.playData) return sp;
        changed = true;
        return { ...sp, play: { ...sp.play, playData: shown } };
    });
    return changed ? ({ ...session, plays } as S) : session;
}
```

In `lib/utils/session-drill-ids.ts`, replace `PlayInSession` with `SessionItem` in the import, import `isDrillRow` from `@/lib/utils/session-rows`, and change the two functions:

```ts
export function applySavedPlayIds(
    plays: SessionItem[],
    sentPlayIds: ReadonlyMap<string, string>,
    saved: readonly SavedDrillId[] | undefined,
): SessionItem[] {
    if (!saved || saved.length === 0) return plays;
    const byKey = new Map(saved.map((entry) => [entry.clientKey, entry.playId]));
    let changed = false;
    const next = plays.map((play) => {
        if (!isDrillRow(play)) return play;
        const ownedId = byKey.get(play.id);
        if (!ownedId || ownedId === play.playId || sentPlayIds.get(play.id) !== play.playId) return play;
        changed = true;
        return { ...play, playId: ownedId };
    });
    return changed ? next : plays;
}

/** Updates the card's drill after a dialog save, or appends a new drill card. A block row is never a drill card. */
export function upsertSessionDrill(plays: SessionItem[], clientKey: string, patch: SessionDrillPatch): SessionItem[] {
    if (plays.some((play) => play.id === clientKey)) {
        // A freshly saved diagram is readable, whatever the drill loaded with.
        return plays.map((play) => (play.id === clientKey && isDrillRow(play) ? { ...play, ...patch, playDataUnreadable: undefined } : play));
    }
    const sequence = plays.reduce((max, play) => Math.max(max, play.sequence), -1) + 1;
    return [...plays, { id: clientKey, ...patch, sequence, runsWithPrevious: false, duration: 10, instructions: "" }];
}
```

In `components/features/practice-planner/useSessionDrillDialog.ts`:
- import `SessionItem` instead of `PlayInSession`, and `isDrillRow` from `@/lib/utils/session-rows`;
- the hook's parameters become `plays: SessionItem[]` and `setPlays: Dispatch<SetStateAction<SessionItem[]>>`;
- in `editDiagram`: `if (!play || !isDrillRow(play)) return;`
- in `onSaved`: `if (previous && isDrillRow(previous) && previous.playId === patch.playId) return { ok: true };`

In `components/features/practice-planner/useSessionGoalies.ts`, import `isDrillRow` and map only drills to their tags (block rows pass through and `goalieWarnings` skips them):

```ts
        const warnings = goalieWarnings(
            groupStations(
                session.plays.map((sp) =>
                    isDrillRow(sp) ? { ...sp, focus: sp.play.focus, goalies: sp.play.goalies, playData: sp.play.playData } : sp,
                ),
            ),
            attending,
        );
```

- [ ] **Step 6: Create `components/features/practice-planner/BlockRowCard.tsx`**

```tsx
"use client";

/**
 * A warm-up, water break, transition or cool-down in the session editor
 * (practice timing, spec R8): its kind icon, an editable label, a minutes
 * stepper, an optional note, and the move / delete controls. No diagram, no
 * station switch and no goalie badge. Edits apply as they are made.
 */
import { useId } from "react";
import { Box, Card, IconButton, Stack, TextField, Typography } from "@mui/material";
import {
    AcUnitOutlined,
    Add as AddIcon,
    ArrowDownward as ArrowDownwardIcon,
    ArrowUpward as ArrowUpwardIcon,
    Delete as DeleteIcon,
    DirectionsRunOutlined,
    LocalDrinkOutlined,
    Remove as RemoveIcon,
    SwapHorizOutlined,
    type SvgIconComponent,
} from "@mui/icons-material";
import { BLOCK_DEFAULTS, MAX_BLOCK_LABEL_LENGTH, VALIDATION_CONSTRAINTS, type BlockInSession, type BlockKind } from "@/types/practice-planner";
import { blockTitle, type RowEdit } from "@/lib/utils/session-rows";

/** One outline icon per block kind (the Add block menu uses them too). */
export const BLOCK_ICONS: Record<BlockKind, SvgIconComponent> = {
    warmup: DirectionsRunOutlined,
    break: LocalDrinkOutlined,
    transition: SwapHorizOutlined,
    cooldown: AcUnitOutlined,
};

const TARGET = { minWidth: 44, minHeight: 44 } as const;

export interface BlockRowCardProps {
    item: BlockInSession;
    /** Position in the whole session */
    index: number;
    canMoveUp: boolean;
    canMoveDown: boolean;
    /** The session is being created: nothing on the card may change. */
    locked?: boolean;
    onUpdate: (id: string, edit: RowEdit) => void;
    onDelete: (id: string) => void;
    onMoveUp: (index: number) => void;
    onMoveDown: (index: number) => void;
}

export function BlockRowCard({ item, index, canMoveUp, canMoveDown, locked = false, onUpdate, onDelete, onMoveUp, onMoveDown }: BlockRowCardProps) {
    const titleId = useId();
    const Icon = BLOCK_ICONS[item.kind];
    const title = blockTitle(item.kind, item.label);
    const setMinutes = (minutes: number) =>
        onUpdate(item.id, { duration: Math.min(VALIDATION_CONSTRAINTS.MAX_DURATION, Math.max(VALIDATION_CONSTRAINTS.MIN_DURATION, minutes)) });

    return (
        <Card
            variant="outlined"
            component="section"
            aria-labelledby={titleId}
            sx={{ borderLeft: 4, borderLeftColor: "secondary.main", bgcolor: "background.paper" }}
        >
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ xs: "stretch", sm: "center" }} sx={{ p: 2 }}>
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flex: 1, minWidth: 0 }}>
                    <Box
                        aria-hidden
                        sx={{
                            width: 44,
                            height: 44,
                            flexShrink: 0,
                            borderRadius: "50%",
                            display: "grid",
                            placeItems: "center",
                            bgcolor: "action.selected",
                            color: "secondary.main",
                        }}
                    >
                        <Icon />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography id={titleId} variant="subtitle1" component="h3" sx={{ fontWeight: 800 }} noWrap>
                            {title}
                        </Typography>
                        <TextField
                            label="Label"
                            size="small"
                            fullWidth
                            value={item.label}
                            placeholder={BLOCK_DEFAULTS[item.kind].label}
                            onChange={(event) => onUpdate(item.id, { label: event.target.value })}
                            disabled={locked}
                            slotProps={{ htmlInput: { maxLength: MAX_BLOCK_LABEL_LENGTH } }}
                            sx={{ mt: 1, "& .MuiInputBase-root": { minHeight: 44 } }}
                        />
                    </Box>
                </Stack>

                <Stack direction="row" alignItems="center" justifyContent="center" role="group" aria-label={`Minutes for ${title}`}>
                    <IconButton
                        aria-label={`Fewer minutes for ${title}`}
                        onClick={() => setMinutes(item.duration - 1)}
                        disabled={locked || item.duration <= VALIDATION_CONSTRAINTS.MIN_DURATION}
                        sx={TARGET}
                    >
                        <RemoveIcon />
                    </IconButton>
                    <Typography sx={{ minWidth: 64, textAlign: "center", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                        {`${item.duration} min`}
                    </Typography>
                    <IconButton
                        aria-label={`More minutes for ${title}`}
                        onClick={() => setMinutes(item.duration + 1)}
                        disabled={locked || item.duration >= VALIDATION_CONSTRAINTS.MAX_DURATION}
                        sx={TARGET}
                    >
                        <AddIcon />
                    </IconButton>
                </Stack>

                <Stack direction="row" justifyContent={{ xs: "space-between", sm: "flex-end" }}>
                    <IconButton aria-label={`Move ${title} up`} onClick={() => onMoveUp(index)} disabled={locked || !canMoveUp} sx={TARGET}>
                        <ArrowUpwardIcon />
                    </IconButton>
                    <IconButton aria-label={`Move ${title} down`} onClick={() => onMoveDown(index)} disabled={locked || !canMoveDown} sx={TARGET}>
                        <ArrowDownwardIcon />
                    </IconButton>
                    <IconButton aria-label={`Delete ${title}`} color="error" onClick={() => onDelete(item.id)} disabled={locked} sx={TARGET}>
                        <DeleteIcon />
                    </IconButton>
                </Stack>
            </Stack>
            <Box sx={{ px: 2, pb: 2 }}>
                <TextField
                    label="Note"
                    size="small"
                    fullWidth
                    multiline
                    minRows={1}
                    value={item.instructions}
                    placeholder="Optional"
                    onChange={(event) => onUpdate(item.id, { instructions: event.target.value })}
                    disabled={locked}
                    slotProps={{ htmlInput: { maxLength: 2000 } }}
                />
            </Box>
        </Card>
    );
}
```

- [ ] **Step 7: Render block rows in `SessionDrillList` and keep them in the editor**

In `components/features/practice-planner/SessionDrillList.tsx`:
- imports: replace `import type { PlayInSession } from "@/types/practice-planner";` with `import type { BlockInSession, PlayInSession, SessionItem } from "@/types/practice-planner";`, add `import { drillRows, isDrillRow, type RowEdit } from "@/lib/utils/session-rows";` and `import { BlockRowCard } from "./BlockRowCard";`;
- in `SessionDrillListProps`: `plays: SessionItem[];` and `onUpdate: (playId: string, edit: RowEdit) => void;`;
- `overlapMessages` takes `group: StationGroup<SessionItem>`;
- replace the `warnings`, `goalieAlerts` and `goalieMessage` computations:

```tsx
    // An unreadable drill (area null) is skipped by the warnings, not read as full ice; a block has no area.
    const warnings = stationWarnings(
        groupStations(plays.map((play) => (isDrillRow(play) ? { ...play, area: play.playDataUnreadable ? null : play.playData.area } : { ...play, area: null }))),
        segmentKind,
    );
    // Raw diagrams (never the display copy): hidden markers must not hide a shortfall.
    // An unreadable drill (playData null) needs one goalie if it is tagged so, never zero by accident.
    const goalieAlerts = goalieWarnings(
        groupStations(plays.map((play) => (isDrillRow(play) ? { ...play, playData: play.playDataUnreadable ? null : play.playData } : play))),
        goaliesAttending,
    );
    const goalieMessage = (group: StationGroup<SessionItem>): string | null => {
```

(the body of `goalieMessage` is unchanged);
- after `renderCard`, add:

```tsx
    const renderBlock = (item: BlockInSession) => {
        const index = plays.indexOf(item);
        return (
            <BlockRowCard
                key={item.id}
                item={item}
                index={index}
                canMoveUp={canMove(plays, index, -1)}
                canMoveDown={canMove(plays, index, 1)}
                locked={locked}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onMoveUp={onMoveUp}
                onMoveDown={onMoveDown}
            />
        );
    };
```

- in the `groups.flatMap` render, a lone row is a drill or a block, and a station block's stations are drills (a block row never joins one):

```tsx
                        {groups.flatMap((group): ReactNode[] => {
                            const only = group.stations[0];
                            if (group.stations.length === 1) {
                                return [isDrillRow(only) ? renderCard(only, undefined, goalieMessage(group)) : renderBlock(only)];
                            }
                            const stations = drillRows(group.stations);
                            const blockGoalieMessage = goalieMessage(group);
                            const headerId = `station-block-${only.id}`;
                            return [
                                <StationBlockHeader
                                    key={`header-${only.id}`}
                                    id={headerId}
                                    label={stationBlockLabel(stations.length, group.wallMinutes)}
                                    warnings={[
                                        ...overlapMessages(group, warnings.overlaps),
                                        ...(blockGoalieMessage ? [blockGoalieMessage] : []),
                                    ]}
                                />,
                                ...stations.map((play, slot) => renderCard(play, { position: slot + 1, count: stations.length })),
                            ];
                        })}
```

In `components/features/practice-planner/SessionDrillCard.tsx`, import `type RowEdit` from `@/lib/utils/session-rows` and change the prop to `onUpdate: (playId: string, edit: RowEdit) => void;` (its one call already passes `{ duration, instructions }`).

In `components/features/practice-planner/PracticeSessionEditor.tsx`:
- in the `@/types/practice-planner` import, add `SessionItem` (keep `PlayInSession`; `handleAddPlayFromLibrary` still builds one);
- add `import { applyRowEdit, drillRows, type RowEdit } from "@/lib/utils/session-rows";` after the session-timeline import;
- `useState<PlayInSession[]>(initialData?.plays || [])` becomes `useState<SessionItem[]>(initialData?.plays || [])`;
- `const sentPlayIds = new Map(plays.map((play) => [play.id, play.playId]));` becomes `const sentPlayIds = new Map(drillRows(plays).map((play) => [play.id, play.playId]));`
- `applyListEdit`'s parameter becomes `next: SessionItem[]`;
- `handleUpdatePlayInSession` becomes:

```tsx
    const handleUpdatePlayInSession = useCallback(
        (playId: string, edit: RowEdit) => {
            if (creating) return;
            setPlays((prevPlays) => prevPlays.map((play) => (play.id === playId ? applyRowEdit(play, edit) : play)));
            markDirty();
            setEditingPlayId(null);
        },
        [markDirty, creating]
    );
```

Run `bun run test __tests__/components/features/practice-planner/PracticeSessionEditor.line-budget.test.ts`. Expected: PASS (≤ 900).

- [ ] **Step 8: Replace `components/features/practice-planner/SessionTimeline.tsx`**

```tsx
"use client";

/**
 * Session timeline (practice planner 3b, practice timing): one row per block
 * (a standalone drill, a station group, or a warm-up / break / transition /
 * cool-down) with its start clock time, its minutes and its contents, and a
 * "Planned X of Y min" footer. The gap between blocks is folded into the next
 * block's start; it is never a row (spec R9). The screen variant is a compact
 * MUI table whose drill names select the drill. The print variant is a plain
 * table for the bench sheet, styled by app/(print)/print.css.
 */
import { Box, Link, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import type { BlockKind } from "@/types/practice-planner";
import { buildSchedule, sessionWallMinutes, type TimelinePlay } from "@/lib/utils/session-timeline";
import { blockTitle, drillRows, isBlockRow } from "@/lib/utils/session-rows";
import { useClockText } from "@/lib/hooks/useClockText";

/** A drill row: its name selects it on screen. */
export interface SessionTimelineDrill extends TimelinePlay {
    /** The session-play row id */
    id: string;
    kind?: "drill";
    play: { name: string };
}

/** A block row: its label and note, never a link. */
export interface SessionTimelineBlock extends TimelinePlay {
    id: string;
    kind: BlockKind;
    label: string | null;
    instructions: string | null;
}

export type SessionTimelinePlay = SessionTimelineDrill | SessionTimelineBlock;

export interface SessionTimelineProps<T extends SessionTimelinePlay> {
    plays: readonly T[];
    /** startAt when booked, else date (lib/utils/date `sessionStart`) */
    sessionStart: Date;
    /** The venue's zone; undefined means the viewer's */
    timeZone?: string;
    /** Append the short zone name ("EDT"); true only with a venue zone */
    showZone: boolean;
    /** The session's booked length */
    durationMinutes: number;
    /** Minutes between blocks (0–5), folded into each later block's start */
    transitionMinutes?: number;
    /** Session-play id of the drill on screen; its block is highlighted */
    activePlayId?: string;
    /** Screen only: called with a session-play id when a drill name is clicked */
    onSelectPlay?: (playId: string) => void;
    variant?: "screen" | "print";
}

/** "Stations · 3": a station group's label in the timeline. */
export function stationsLabel(count: number): string {
    return `Stations · ${count}`;
}

/** "Planned 25 of 60 min", with " (over time!)" when the plan runs past the booking. */
export function plannedLabel(planned: number, booked: number): string {
    return `Planned ${planned} of ${booked} min${planned > booked ? " (over time!)" : ""}`;
}

/** "Warm-up · Easy laps": a block's label, and its note when it has one. */
export function blockLine(row: SessionTimelineBlock): string {
    const note = row.instructions?.trim();
    return `${blockTitle(row.kind, row.label)}${note ? ` · ${note}` : ""}`;
}

function DrillName({ id, name, onSelect }: { id: string; name: string; onSelect?: (id: string) => void }) {
    if (!onSelect) return <>{name}</>;
    return (
        <Link
            component="button"
            type="button"
            variant="body2"
            underline="hover"
            onClick={() => onSelect(id)}
            sx={{ textAlign: "left", fontWeight: 600 }}
        >
            {name}
        </Link>
    );
}

function BlockText({ row }: { row: SessionTimelineBlock }) {
    const note = row.instructions?.trim();
    return (
        <>
            <Typography component="span" variant="body2" sx={{ fontWeight: 600 }}>
                {blockTitle(row.kind, row.label)}
            </Typography>
            {note && (
                <Typography component="span" variant="caption" color="text.secondary">
                    {` · ${note}`}
                </Typography>
            )}
        </>
    );
}

export function SessionTimeline<T extends SessionTimelinePlay>({
    plays,
    sessionStart,
    timeZone,
    showZone,
    durationMinutes,
    transitionMinutes = 0,
    activePlayId,
    onSelectPlay,
    variant = "screen",
}: SessionTimelineProps<T>) {
    const clock = useClockText(timeZone, showZone);
    const rows = buildSchedule(plays, sessionStart, transitionMinutes);
    const planned = sessionWallMinutes(plays, transitionMinutes);
    const overTime = planned > durationMinutes;
    const footer = plannedLabel(planned, durationMinutes);

    if (variant === "print") {
        return (
            <div className="bench-timeline">
                <table aria-label="Session timeline">
                    <thead>
                        <tr>
                            <th scope="col">Start</th>
                            <th scope="col">Min</th>
                            <th scope="col">Drill</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(({ group, startsAt }) => {
                            // Upcast: narrowing works on the concrete union, not on T.
                            const stations: readonly SessionTimelinePlay[] = group.stations;
                            const head = stations[0];
                            const drills = drillRows(stations);
                            return (
                                <tr key={head.id}>
                                    <td>{clock.time(startsAt)}</td>
                                    <td>{group.wallMinutes}</td>
                                    <td>
                                        {isBlockRow(head) ? (
                                            blockLine(head)
                                        ) : drills.length > 1 ? (
                                            <>
                                                <strong>{stationsLabel(drills.length)}</strong>
                                                <ul>
                                                    {drills.map((sp) => (
                                                        <li key={sp.id}>{`${sp.play.name} · ${sp.duration} min`}</li>
                                                    ))}
                                                </ul>
                                            </>
                                        ) : (
                                            drills[0].play.name
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                <p className={overTime ? "bench-over-time" : undefined}>{footer}</p>
            </div>
        );
    }

    return (
        <Stack spacing={1}>
            <Table size="small" aria-label="Session timeline">
                <TableHead>
                    <TableRow>
                        <TableCell sx={{ width: 120 }}>Start</TableCell>
                        <TableCell sx={{ width: 56 }} align="right">
                            Min
                        </TableCell>
                        <TableCell>Drill</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {rows.map(({ group, startsAt }) => {
                        const stations: readonly SessionTimelinePlay[] = group.stations;
                        const head = stations[0];
                        const drills = drillRows(stations);
                        return (
                            <TableRow key={head.id} selected={stations.some((sp) => sp.id === activePlayId)}>
                                <TableCell sx={{ whiteSpace: "nowrap", fontFamily: "var(--font-mono), monospace" }}>
                                    {clock.time(startsAt)}
                                </TableCell>
                                <TableCell align="right">{group.wallMinutes}</TableCell>
                                <TableCell>
                                    {isBlockRow(head) ? (
                                        <BlockText row={head} />
                                    ) : drills.length > 1 ? (
                                        <>
                                            <Typography
                                                variant="caption"
                                                component="p"
                                                sx={{ fontWeight: 800, color: "primary.main", textTransform: "uppercase", letterSpacing: 1 }}
                                            >
                                                {stationsLabel(drills.length)}
                                            </Typography>
                                            <Box component="ul" sx={{ m: 0, pl: 2 }}>
                                                {drills.map((sp) => (
                                                    <li key={sp.id}>
                                                        <DrillName id={sp.id} name={sp.play.name} onSelect={onSelectPlay} />
                                                        <Typography component="span" variant="caption" color="text.secondary">
                                                            {` · ${sp.duration} min`}
                                                        </Typography>
                                                    </li>
                                                ))}
                                            </Box>
                                        </>
                                    ) : (
                                        <DrillName id={head.id} name={drills[0].play.name} onSelect={onSelectPlay} />
                                    )}
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
            <Typography
                variant="caption"
                color={overTime ? "error.main" : "text.secondary"}
                fontWeight={overTime ? 700 : 400}
                sx={{ alignSelf: "flex-end" }}
            >
                {footer}
            </Typography>
        </Stack>
    );
}
```

- [ ] **Step 9: Narrow the session page and the bench sheet**

In `app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx`:
- add `import { drillRows } from "@/lib/utils/session-rows";`;
- right after the `useState` declarations, add:

```tsx
  // The play sequence, the viewer and the counts are drills; blocks show on the timeline only (spec R9).
  const drills = useMemo(() => drillRows(session.plays), [session.plays]);
  const gap = session.transitionMinutes ?? 0;
```

- `handleNextPlay`: `Math.min(drills.length - 1, prev + 1)`, with `[drills.length]` as its dependencies;
- `const totalPlayTime = sessionWallMinutes(session.plays, gap);`
- `const activePlay = drills[activePlayIndex] ?? null;`
- replace `drawnAt` (the display copy keeps the row order, so its drills line up with `drills`):

```tsx
  const shownDrills = useMemo(() => drillRows(shown.plays), [shown]);
  const drawnAt = (index: number) => shownDrills[index]?.play.playData ?? drills[index]?.play.playData ?? null;
```

- `const groups = useMemo(() => groupStations(drills), [drills]);`
- in `stationMapStations`: `playData: shownDrills[drills.indexOf(sp)]?.play.playData ?? sp.play.playData`, with dependencies `[activeGroup, shownDrills, drills]`;
- in `tooBigCount`: `groupStations(drills.map((sp) => ({ ...sp, area: sp.play.playData ? sp.play.playData.area : null })))`, with dependencies `[drills, session.segmentKind]`;
- in the metadata row: `{drills.length} play{drills.length !== 1 ? "s" : ""}`;
- on `<SessionTimeline …>`: add `transitionMinutes={gap}` and select by the drill's place among the drills: `onSelectPlay={(id) => setActivePlayIndex(Math.max(0, drills.findIndex((sp) => sp.id === id)))}`;
- the content area's empty test becomes `{drills.length === 0 ? (` and the play-navigation header reads `Play {activePlayIndex + 1} of {drills.length}`, with `disabled={activePlayIndex === drills.length - 1}` on Next;
- in the sidebar, `const index = drills.indexOf(sp);` replaces `session.plays.indexOf(sp)`.

Run `bun run test __tests__/app/SessionDetailView.line-budget.test.ts`. Expected: PASS.

In `components/features/practice-planner/print/BenchSheet.tsx`, import `drillRows` from `@/lib/utils/session-rows`, then replace the `legend` and `drills` computations:

```tsx
    const gap = session.transitionMinutes ?? 0;
    const legend = combinedLegendData(drillRows(session.plays).map((sp) => ({ name: sp.play.name, playData: sp.play.playData })));
    // One page per drill; a block (warm-up, break…) is a timeline row only.
    const drills = buildSchedule(session.plays, start, gap).flatMap((row) => {
        const stations = drillRows(row.group.stations);
        return stations.map((sp, k) => ({
            sp,
            startsAt: row.startsAt,
            station: stations.length > 1 ? { position: k + 1, count: stations.length } : null,
        }));
    });
```

and in the JSX:
- the empty test becomes `{session.plays.length === 0 ? (`;
- pass `transitionMinutes={gap}` to the print `SessionTimeline`;
- wrap the drills `<Box component="section" aria-label="Drills" …>` in `{drills.length > 0 && ( … )}`.

- [ ] **Step 10: Narrow the export model, HTML, Word and the plan export**

In `components/features/practice-planner/export/bench-sheet-model.ts`:
- imports: add `BlockKind` to the `@/types/practice-planner` type import; add `import { blockTitle, drillRows, isBlockRow } from "@/lib/utils/session-rows";`;
- replace `ExportSessionPlay`, `ExportSession` and `BenchSheetTimelineRow`:

```ts
export interface ExportSessionPlay {
    kind?: "drill";
    sequence: number;
    duration: number;
    instructions: string | null;
    runsWithPrevious: boolean;
    stays?: boolean;
    rotateEveryMinutes?: number | null;
    play: { name: string; description: string | null; playData: PlayData | null; focus?: PlayFocus; goalies?: PlayGoalies };
}

/** A warm-up, break, transition or cool-down: a timeline row with no drill. */
export interface ExportSessionBlock {
    kind: BlockKind;
    sequence: number;
    duration: number;
    /** The block's note */
    instructions: string | null;
    runsWithPrevious: boolean;
    label: string | null;
}

export type ExportSessionRow = ExportSessionPlay | ExportSessionBlock;

/** What the session page hands the Export menu (a PracticeSessionView fits). */
export interface ExportSession {
    title: string;
    date: string;
    duration: number;
    startAt?: string | null;
    venueTimezone?: string | null;
    teamName?: string | null;
    venueName?: string | null;
    surfaceName?: string | null;
    segmentName?: string | null;
    goaliesAttending?: number | null;
    /** Minutes between blocks; absent reads as 0 */
    transitionMinutes?: number;
    plays: ExportSessionRow[];
}

export type BenchSheetTimelineRow =
    | {
          kind?: "drill";
          start: string;
          minutes: number;
          /** The drill's name, or "Stations · N" for a station block */
          label: string;
          /** "Name · N min" per station, or null for a lone drill */
          stations: string[] | null;
      }
    | {
          kind: "block";
          start: string;
          minutes: number;
          /** The block's label, else its kind's default */
          label: string;
          note: string | null;
          stations: null;
      };
```

- in `buildBenchSheetModel`, replace from `const rows = buildSchedule(…)` through `const planned = …`:

```ts
    const gap = session.transitionMinutes ?? 0;
    const rows = buildSchedule(session.plays, start, gap);
    const ordered = rows.flatMap((row) => {
        const stations = drillRows(row.group.stations);
        return stations.map((sp, k) => ({
            sp,
            startsAt: row.startsAt,
            station: stations.length > 1 ? stationTag(k + 1, stations.length) : null,
        }));
    });
    const pixelRatio = printPixelRatio(ordered.filter(({ sp }) => sp.play.playData !== null).length);
    const legendData = combinedLegendData(drillRows(session.plays).map((sp) => ({ name: sp.play.name, playData: sp.play.playData })));
    const planned = sessionWallMinutes(session.plays, gap);
```

- replace the `timeline:` mapping:

```ts
        timeline: rows.map(({ group, startsAt }): BenchSheetTimelineRow => {
            const head = group.stations[0];
            if (isBlockRow(head)) {
                return { kind: "block", start: time(startsAt), minutes: group.wallMinutes, label: blockTitle(head.kind, head.label), note: head.instructions?.trim() || null, stations: null };
            }
            const stations = drillRows(group.stations);
            const block = stations.length > 1;
            return {
                start: time(startsAt),
                minutes: group.wallMinutes,
                label: block ? stationsLabel(stations.length) : stations[0].play.name,
                stations: block ? stations.map((sp) => `${sp.play.name} · ${sp.duration} min`) : null,
            };
        }),
```

In `components/features/practice-planner/export/bench-sheet-html.ts`:
- in `timeline()`, the third cell becomes:

```ts
            html`<tr><td class="time">${row.start}</td><td>${row.minutes}</td><td>${
                row.stations
                    ? html`<strong>${row.label}</strong><ul>${row.stations.map((station) => html`<li>${station}</li>`)}</ul>`
                    : html`${row.label}${row.kind === "block" && row.note ? html` · ${row.note}` : null}`
            }</td></tr>
`,
```

- in `renderBenchSheetHtml`, the empty test becomes `model.timeline.length === 0`.

In `components/features/practice-planner/export/bench-sheet-docx.ts`:
- the timeline's third cell's lone-row branch becomes `[new Paragraph({ children: textRuns(row.kind === "block" && row.note ? `${row.label} · ${row.note}` : row.label) })]`;
- in `benchSheetDocument`, the empty test becomes `model.timeline.length === 0`.

In `components/features/practice-planner/ExportPlanMenu.tsx` (seam S3), import `drillRows` from `@/lib/utils/session-rows` and:

```ts
            // The plan document has no block entries yet, so a plan carries the drill rows.
            drills: drillRows(session.plays).map((sp) => ({
```

(the mapping body is unchanged), and in the menu body:

```ts
    const unreadable = unreadableDiagramNotice(drillRows(session.plays).filter((sp) => sp.play.playData === null).length);
```

- [ ] **Step 11: Hold the three editor wrappers at drill rows (seams S1, S2)**

In `app/(dashboard)/practice-planner/[sessionId]/edit/EditSessionWrapper.tsx` and `app/(dashboard)/practice-planner/new/PracticeSessionEditorWrapper.tsx`, import `drillRows` and `toDrillRowInput` from `@/lib/utils/session-rows` and replace each `plays: session.plays.map((play) => ({ … })),` with:

```tsx
        // The session actions don't take block rows yet, so a save carries the drill rows.
        plays: drillRows(session.plays).map(toDrillRowInput),
```

In `apps/planner/src/screens/SessionEditorScreen.tsx`, the same imports, and in `toLocalSessionSave`:

```ts
        // The local store doesn't take block rows yet, so a save carries the drill rows.
        plays: drillRows(session.plays).map(toDrillRowInput),
```

- [ ] **Step 12: Run the tests to verify they pass**

Run the Step 4 command again. Expected: PASS.
Then: `bun run test && bun run type-check && bun run lint`
Expected: PASS, including both line-budget tests and the five narrowed test files. A type error that names `.play` or `playId` on a union is a reader (or a test) this task missed: narrow it with `isDrillRow`/`drillRows`, never with a cast, and stage it.

- [ ] **Step 13: Commit**

```bash
/usr/bin/git add types/practice-planner.ts lib/utils/drill-tags.ts lib/utils/session-drill-ids.ts \
  components/features/practice-planner/useSessionDrillDialog.ts components/features/practice-planner/useSessionGoalies.ts \
  components/features/practice-planner/BlockRowCard.tsx components/features/practice-planner/SessionDrillList.tsx \
  components/features/practice-planner/SessionDrillCard.tsx components/features/practice-planner/PracticeSessionEditor.tsx \
  components/features/practice-planner/SessionTimeline.tsx "app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx" \
  components/features/practice-planner/print/BenchSheet.tsx components/features/practice-planner/export/bench-sheet-model.ts \
  components/features/practice-planner/export/bench-sheet-html.ts components/features/practice-planner/export/bench-sheet-docx.ts \
  components/features/practice-planner/ExportPlanMenu.tsx "app/(dashboard)/practice-planner/[sessionId]/edit/EditSessionWrapper.tsx" \
  "app/(dashboard)/practice-planner/new/PracticeSessionEditorWrapper.tsx" apps/planner/src/screens/SessionEditorScreen.tsx \
  __tests__/lib/utils/drill-tags.test.ts __tests__/lib/utils/session-drill-ids.test.ts \
  __tests__/components/features/practice-planner/BlockRowCard.test.tsx __tests__/components/features/practice-planner/PracticeSessionEditor.blocks.test.tsx \
  __tests__/components/features/practice-planner/SessionTimeline.test.tsx __tests__/app/practice-session-detail-blocks.test.tsx \
  __tests__/components/features/practice-planner/print/BenchSheet.test.tsx __tests__/components/features/practice-planner/export/bench-sheet-model.test.ts \
  __tests__/components/features/practice-planner/export/bench-sheet-html.test.ts __tests__/components/features/practice-planner/export/bench-sheet-docx.test.ts \
  __tests__/apps/planner/editor-screens.test.tsx \
  __tests__/components/features/practice-planner/PracticeSessionEditor.drill-dialog.test.tsx \
  __tests__/components/features/practice-planner/PracticeSessionEditor.drill-ids.test.tsx \
  __tests__/apps/planner/local-store.sessions.test.ts __tests__/apps/planner/import-screen.test.tsx
/usr/bin/git commit -m "feat(practice-planner): every session reader handles block rows" -m "Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 3: Hosted storage: columns, migration, schemas, actions, queries and emails

Every hosted path from spec R2, R3, R5 and R11. After this task the hosted app stores block rows, rotation, stays and the gap; create, update, duplicate, the detail and edit queries and the list all carry them; and seam S1 is gone, so the hosted editor sends block rows.

**Files:**
- Modify: `prisma/schema.prisma` (`model PracticeSession`, `model PracticeSessionPlay`)
- Create: `prisma/migrations/20261004120000_practice_session_timing/migration.sql`
- Modify: `lib/utils/validation.ts` (imports, `practiceSessionPlayInputSchema`, `createPracticeSessionSchema`, `updatePracticeSessionSchema`; new `PracticeSessionRowInput` type)
- Modify: `lib/services/practice-session-drills.ts` (`materializeSessionDrills`: previous play ids)
- Modify: `lib/actions/practice-sessions.ts` (imports, `validateWallTime`, `drillItems`, new `rowsError`/`sessionPlayData`, `createPracticeSession`, `updatePracticeSession`, `getPracticeSessionById`)
- Modify: `lib/actions/practice-session-drills.ts` (`duplicatePracticeSession`)
- Modify: `lib/actions/practice-session-queries.ts` (`getPracticePlannerListData`, `getPracticeSessionDetail`, `getPracticeSessionForEdit`)
- Modify: `lib/email/templates.ts` (`PracticePlanSharedEmailData`, `PracticePlanUpdatedEmailData`, both senders, `sendPracticePlanNotifications`)
- Modify: `app/(dashboard)/practice-planner/[sessionId]/edit/EditSessionWrapper.tsx`, `app/(dashboard)/practice-planner/new/PracticeSessionEditorWrapper.tsx` (remove seam S1)
- Modify: `lib/data/dashboard.ts` (`getUpcomingSchedule`: the practice's play count reads drill rows only, ruling R8)
- Test (create): `__tests__/prisma/practice-timing-migration.test.ts`, `__tests__/lib/email/practice-plan-blocks.test.ts`, `__tests__/lib/data/dashboard-schedule.test.ts`
- Test (append or modify): `__tests__/lib/utils/validation-practice-session.test.ts`, `__tests__/lib/actions/practice-sessions-ownership.test.ts`, `__tests__/lib/actions/practice-sessions.test.ts`, `__tests__/lib/actions/practice-session-drills.test.ts`, `__tests__/lib/actions/practice-session-queries.test.ts` (new tests, plus narrowing lines 96, 214 and 222), `__tests__/lib/email/templates-preferences-scope.test.ts`, `__tests__/app/practice-planner-hosted-wrappers.test.tsx`, `__tests__/lib/services/practice-session-drills.test.ts` (detach carries the new fields, ruling R12)

**Interfaces:**
- Consumes (Task 1): `withStoredTiming`, `needsStoredTiming`, `toBlockLabel`, `toRowKind`, `isBlockKind`, `blockTitle`, `toSessionRowInputs`, `sessionRowsError`, `sessionWallMinutes(rows, transitionMinutes)`, `normalizeGroups`, the message constants. (Task 2): `SessionRow`, `SessionItem`.
- Produces:
  - Prisma `PracticeSessionPlay.kind: string`, `label: string | null`, `stays: boolean`, `rotateEveryMinutes: number | null`, `playId: string | null`, `play: Play | null`; `PracticeSession.transitionMinutes: number`;
  - `practiceSessionPlayInputSchema` output `PracticeSessionRowInput = { kind: SessionRowKind; playId?: string; clientKey; sequence; duration; instructions?: string; runsWithPrevious: boolean; label?: string | null; stays?: boolean; rotateEveryMinutes?: number | null }`; `transitionMinutes?: number` on both session schemas;
  - `getPracticeSessionDetail(...).session.plays: SessionRow[]` and `.transitionMinutes: number`; `getPracticeSessionForEdit(...).initialData.plays: SessionItem[]` and `.transitionMinutes: number`;
  - `getUpcomingSchedule(...)`'s `UpcomingPracticeItem.playCount` counts drill rows only (the type is unchanged).

- [ ] **Step 1: Write the failing migration test**

Create `__tests__/prisma/practice-timing-migration.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
    MAX_BLOCK_LABEL_LENGTH,
    MAX_ROTATE_MINUTES,
    MAX_TRANSITION_MINUTES,
    MIN_ROTATE_MINUTES,
    SESSION_ROW_KINDS,
} from "@/types/practice-planner";

const sql = readFileSync(join(process.cwd(), "prisma/migrations/20261004120000_practice_session_timing/migration.sql"), "utf8");
const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
const model = (name: string) => schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? "";

describe("practice timing migration", () => {
    it("adds the columns with defaults, so existing rows read as drills that don't rotate and sessions have no gap", () => {
        expect(sql).toContain(`ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'drill'`);
        expect(sql).toContain(`ADD COLUMN "label" TEXT;`);
        expect(sql).toContain(`ADD COLUMN "stays" BOOLEAN NOT NULL DEFAULT false`);
        expect(sql).toContain(`ADD COLUMN "rotateEveryMinutes" INTEGER;`);
        expect(sql).toContain(`ADD COLUMN "transitionMinutes" INTEGER NOT NULL DEFAULT 0`);
    });

    it("lets a block row, and only a block row, have no play", () => {
        expect(sql).toContain(`ALTER COLUMN "playId" DROP NOT NULL`);
        expect(sql).toContain(`CHECK (("kind" = 'drill') = ("playId" IS NOT NULL))`);
    });

    it("constrains the values at the database, in step with the code vocabulary", () => {
        expect(sql).toContain(`CHECK ("kind" IN (${SESSION_ROW_KINDS.map((kind) => `'${kind}'`).join(", ")}))`);
        expect(sql).toContain(`CHECK ("label" IS NULL OR char_length("label") <= ${MAX_BLOCK_LABEL_LENGTH})`);
        expect(sql).toContain(`CHECK ("rotateEveryMinutes" IS NULL OR "rotateEveryMinutes" BETWEEN ${MIN_ROTATE_MINUTES} AND ${MAX_ROTATE_MINUTES})`);
        expect(sql).toContain(`CHECK ("transitionMinutes" BETWEEN 0 AND ${MAX_TRANSITION_MINUTES})`);
    });

    it("is additive and leaves the deferrable play foreign key exactly as it is", () => {
        expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX)/i);
        expect(sql).not.toMatch(/\bUPDATE\b|\bDELETE\b/i);
        expect(sql).not.toContain("practice_session_plays_playId_fkey");
    });

    it("matches the Prisma schema, which keeps the deferrable foreign key's note", () => {
        const row = model("PracticeSessionPlay");
        expect(row).toMatch(/kind\s+String\s+@default\("drill"\)/);
        expect(row).toMatch(/label\s+String\?/);
        expect(row).toMatch(/stays\s+Boolean\s+@default\(false\)/);
        expect(row).toMatch(/rotateEveryMinutes\s+Int\?/);
        expect(row).toMatch(/playId\s+String\?/);
        expect(row).toMatch(/play\s+Play\?\s+@relation\(fields: \[playId\], references: \[id\], onDelete: NoAction\)/);
        expect(row).toContain("DEFERRABLE INITIALLY DEFERRED");
        expect(model("PracticeSession")).toMatch(/transitionMinutes\s+Int\s+@default\(0\)/);
    });
});
```

Run: `bun run test __tests__/prisma/practice-timing-migration.test.ts`
Expected: FAIL with ENOENT for the migration file.

- [ ] **Step 2: Add the columns and the hand-written migration**

In `prisma/schema.prisma`, in `model PracticeSession`, after `goaliesAttending Int?`:

```prisma
  // Minutes between blocks (0-5; practice timing). Folded into start times
  // between top-level blocks, never inside a station block or after the last.
  // CHECK in migration 20261004120000_practice_session_timing.
  transitionMinutes Int @default(0)
```

In `model PracticeSessionPlay`, after the `runsWithPrevious` line, add:

```prisma
  // Row kind (practice timing): drill | warmup | break | transition | cooldown.
  // A non-drill row has no play. CHECKs in migration
  // 20261004120000_practice_session_timing keep the vocabulary,
  // (kind = 'drill') = (playId IS NOT NULL), label <= 60 and rotation 1-30.
  // Prisma can't model CHECK constraints: keep them by hand if regenerated.
  kind               String  @default("drill")
  /// A non-drill row's label; null = the kind's default ("Warm-up"...).
  label              String?
  /// In a rotating station block: this station's group doesn't rotate.
  stays              Boolean @default(false)
  /// On the first drill of a station block: groups rotate every N minutes.
  rotateEveryMinutes Int?
```

and change the play relation's two lines (keep the comment block between them):

```prisma
  playId String?
  ...
  play   Play?  @relation(fields: [playId], references: [id], onDelete: NoAction)
```

Create `prisma/migrations/20261004120000_practice_session_timing/migration.sql`:

```sql
-- Practice timing: block rows (warm-up, water break, transition, cool-down),
-- station rotation, and a gap between blocks.
-- Hand-written and additive: the dev database is behind on migrations, so
-- `migrate dev` cannot be used. Existing rows read as drills that don't
-- rotate and existing sessions have no gap; constant DEFAULTs are
-- metadata-only on PostgreSQL 11+, so no table is rewritten. Prisma does not
-- model CHECK constraints: keep them by hand if these columns are ever
-- regenerated.
-- The play foreign key stays exactly as migration
-- 20261003120000_session_owned_plays left it (DEFERRABLE INITIALLY
-- DEFERRED): making the column nullable doesn't touch the constraint, and a
-- regenerated one would lose its deferrability.

-- AlterTable
ALTER TABLE "practice_session_plays" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'drill';
ALTER TABLE "practice_session_plays" ADD COLUMN "label" TEXT;
ALTER TABLE "practice_session_plays" ADD COLUMN "stays" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "practice_session_plays" ADD COLUMN "rotateEveryMinutes" INTEGER;
ALTER TABLE "practice_session_plays" ALTER COLUMN "playId" DROP NOT NULL;
ALTER TABLE "practice_session_plays" ADD CONSTRAINT "practice_session_plays_kind_check"
  CHECK ("kind" IN ('drill', 'warmup', 'break', 'transition', 'cooldown'));
ALTER TABLE "practice_session_plays" ADD CONSTRAINT "practice_session_plays_kind_play_check"
  CHECK (("kind" = 'drill') = ("playId" IS NOT NULL));
ALTER TABLE "practice_session_plays" ADD CONSTRAINT "practice_session_plays_label_check"
  CHECK ("label" IS NULL OR char_length("label") <= 60);
ALTER TABLE "practice_session_plays" ADD CONSTRAINT "practice_session_plays_rotateEveryMinutes_check"
  CHECK ("rotateEveryMinutes" IS NULL OR "rotateEveryMinutes" BETWEEN 1 AND 30);

-- AlterTable
ALTER TABLE "practice_sessions" ADD COLUMN "transitionMinutes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_transitionMinutes_check"
  CHECK ("transitionMinutes" BETWEEN 0 AND 5);
```

Run: `bun run db:generate && bun run test __tests__/prisma/practice-timing-migration.test.ts`
Expected: the client generates; the test passes. Do **not** run any migrate command; CI applies the migration with `db:migrate:deploy`.

Run: `bun run type-check`
Expected: FAIL only in `lib/services/practice-session-drills.ts`, `lib/actions/practice-sessions.ts`, `lib/actions/practice-session-drills.ts` and `lib/actions/practice-session-queries.ts`, where `playId` and `play` are now nullable. Steps 5–8 fix each.

- [ ] **Step 3: Write the failing schema tests**

Append to `__tests__/lib/utils/validation-practice-session.test.ts`. Merge `createPracticeSessionSchema` and `practiceSessionPlayInputSchema` into its `@/lib/utils/validation` import, and add:

```ts
import {
    BLOCK_HAS_NO_DRILL_MESSAGE,
    BLOCK_LABEL_MESSAGE,
    DRILL_NEEDS_PLAY_MESSAGE,
    ROTATE_MINUTES_MESSAGE,
    TRANSITION_MINUTES_MESSAGE,
} from "@/lib/utils/session-rows";
import { BLOCK_ROW_FIELDS_ERROR, BLOCK_STATION_ERROR } from "@/lib/utils/session-timeline";

describe("practice timing fields (spec R2, R3)", () => {
    const CUID = "cjld2cjxh0000qzrmn831i7rn";
    const base = { title: "Practice", date: "2026-10-06T23:00:00.000Z", duration: 60, teamId: CUID };
    const drillRow = { playId: CUID, clientKey: "k1", sequence: 0, duration: 10, instructions: "" };
    const blockRow = { kind: "break", clientKey: "k2", sequence: 1, duration: 2, instructions: "", label: "Water" };
    const issues = (input: unknown) => {
        const result = practiceSessionPlayInputSchema.safeParse(input);
        return result.success ? [] : result.error.issues.map((issue) => issue.message);
    };

    it("reads a row without a kind as a drill, leaving its timing undefined (unchanged)", () => {
        const parsed = practiceSessionPlayInputSchema.parse(drillRow);
        expect(parsed).toMatchObject({ kind: "drill", runsWithPrevious: false });
        expect(parsed.stays).toBeUndefined();
        expect(parsed.rotateEveryMinutes).toBeUndefined();
    });

    it("takes a block row with no play", () => {
        expect(practiceSessionPlayInputSchema.parse(blockRow)).toMatchObject({ kind: "break", label: "Water" });
    });

    it("rejects a drill without a play, and a block with one or with station fields", () => {
        expect(issues({ ...drillRow, playId: undefined })).toEqual([DRILL_NEEDS_PLAY_MESSAGE]);
        expect(issues({ ...blockRow, playId: CUID })).toEqual([BLOCK_HAS_NO_DRILL_MESSAGE]);
        expect(issues({ ...blockRow, runsWithPrevious: true })).toEqual([BLOCK_STATION_ERROR]);
        expect(issues({ ...blockRow, stays: true })).toEqual([BLOCK_ROW_FIELDS_ERROR]);
        expect(issues({ ...blockRow, kind: "stretch" })).toHaveLength(1);
    });

    it("limits the label and the rotation, and lets null clear a rotation", () => {
        expect(issues({ ...blockRow, label: "x".repeat(61) })).toEqual([BLOCK_LABEL_MESSAGE]);
        for (const bad of [0, 31, 2.5]) expect(issues({ ...drillRow, rotateEveryMinutes: bad })).toEqual([ROTATE_MINUTES_MESSAGE]);
        expect(practiceSessionPlayInputSchema.parse({ ...drillRow, rotateEveryMinutes: null }).rotateEveryMinutes).toBeNull();
    });

    it("takes a gap of 0–5 minutes; absent means unchanged on update", () => {
        expect(createPracticeSessionSchema.parse({ ...base, transitionMinutes: 5 }).transitionMinutes).toBe(5);
        expect(updatePracticeSessionSchema.parse({ ...base, id: CUID }).transitionMinutes).toBeUndefined();
        for (const bad of [-1, 6, 1.5]) {
            const result = updatePracticeSessionSchema.safeParse({ ...base, id: CUID, transitionMinutes: bad });
            expect(result.success ? [] : result.error.issues.map((issue) => issue.message)).toEqual([TRANSITION_MINUTES_MESSAGE]);
        }
    });
});
```

- [ ] **Step 4: Write the failing action, query and email tests**

Append to `__tests__/lib/actions/practice-sessions-ownership.test.ts` (it reuses the file's `input`, `models`, constants and harness; add `import { ROTATION_TOO_FEW_ERROR } from "@/lib/utils/session-timeline";`):

```ts
describe("practice timing rows (spec R2, R3, R5)", () => {
    const save = (plays: unknown[], extra: Record<string, unknown> = {}) => ({ ...input([]), plays, ...extra });
    const ROWS = [
        { kind: "warmup", clientKey: "kw", sequence: 0, duration: 8, instructions: "Laps", label: "" },
        { playId: LIB, clientKey: "k1", sequence: 1, duration: 10, instructions: "", stays: false, rotateEveryMinutes: null },
        { kind: "break", clientKey: "kb", sequence: 2, duration: 2, instructions: "", label: "Water" },
        { playId: LIB, clientKey: "k2", sequence: 3, duration: 10, instructions: "", stays: false, rotateEveryMinutes: null },
    ];
    type Written = { kind: string; playId: string | null; label: string | null };

    it("create writes block rows with no play, and maps each drill row to its own copy by key", async () => {
        const result = await createPracticeSession(save(ROWS, { transitionMinutes: 1 }));
        expect(result).toMatchObject({ success: true, data: { plays: [{ clientKey: "k1" }, { clientKey: "k2" }] } });
        expect(models.practiceSession.create.mock.calls[0][0].data.transitionMinutes).toBe(1);
        const written: Written[] = models.practiceSessionPlay.createMany.mock.calls[0][0].data;
        expect(written.map((row) => [row.kind, row.playId])).toEqual([
            ["warmup", null],
            ["drill", "cclone0xxxxxxxxxxxxxxxxxx"],
            ["break", null],
            ["drill", "cclone1xxxxxxxxxxxxxxxxxx"],
        ]);
        expect(written[0]).toMatchObject({ label: null, instructions: "Laps", stays: false, rotateEveryMinutes: null, runsWithPrevious: false });
        expect(written[2]).toMatchObject({ label: "Water" });
    });

    it("create writes a session with only blocks, and defaults the gap to 0", async () => {
        await createPracticeSession(save([ROWS[0]]));
        expect(models.practiceSession.create.mock.calls[0][0].data.transitionMinutes).toBe(0);
        expect(models.practiceSessionPlay.createMany.mock.calls[0][0].data).toHaveLength(1);
    });

    it("update writes the gap only when it is sent", async () => {
        await updatePracticeSession({ id: SESSION, ...save([], { transitionMinutes: 3 }) });
        expect(models.practiceSession.update.mock.calls[0][0].data.transitionMinutes).toBe(3);
        await updatePracticeSession({ id: SESSION, ...save([]) });
        expect(models.practiceSession.update.mock.calls[1][0].data).not.toHaveProperty("transitionMinutes");
    });

    it("update keeps a drill's stored rotation and stays when an older client leaves them out", async () => {
        models.practiceSessionPlay.findMany.mockResolvedValue([{ playId: OWNED, stays: false, rotateEveryMinutes: 5 }]);
        const result = await updatePracticeSession({
            id: SESSION,
            ...save([
                { playId: OWNED, clientKey: "k1", sequence: 0, duration: 5, instructions: "" },
                { playId: LIB, clientKey: "k2", sequence: 1, duration: 5, instructions: "", runsWithPrevious: true },
            ]),
        });
        expect(result.success).toBe(true);
        expect(models.practiceSessionPlay.findMany.mock.calls[0][0]).toMatchObject({
            where: { sessionId: SESSION },
            select: { playId: true, stays: true, rotateEveryMinutes: true },
        });
        const created: Array<{ rotateEveryMinutes: number | null; stays: boolean }> = models.practiceSession.update.mock.calls[0][0].data.plays.create;
        expect(created.map((row) => [row.rotateEveryMinutes, row.stays])).toEqual([[5, false], [null, false]]);
    });

    it("update checks the plan against the stored gap when the save leaves the gap out", async () => {
        models.practiceSession.findUnique.mockResolvedValue({ id: SESSION, teamId: TEAM, isShared: false, venueReservationId: null, transitionMinutes: 5 });
        const tight = [0, 1, 2].map((sequence) => ({ playId: LIB, clientKey: `k${sequence}`, sequence, duration: 18, instructions: "", stays: false, rotateEveryMinutes: null }));
        // 3 × 18 = 54, plus two 5-minute gaps = 64
        expect(await updatePracticeSession({ id: SESSION, ...save(tight) })).toEqual({
            success: false,
            error: "Practice timeline (64 min) exceeds session duration (60 min)",
        });
        expect(models.practiceSession.update).not.toHaveBeenCalled();
    });

    it("rejects a rotation that can't run and a block inside a station block, writing nothing", async () => {
        const rotation = await createPracticeSession(save([
            { playId: LIB, clientKey: "k1", sequence: 0, duration: 10, instructions: "", stays: false, rotateEveryMinutes: 5 },
            { playId: LIB, clientKey: "k2", sequence: 1, duration: 10, instructions: "", runsWithPrevious: true, stays: true, rotateEveryMinutes: null },
        ]));
        expect(rotation).toEqual({ success: false, error: ROTATION_TOO_FEW_ERROR });
        const block = await createPracticeSession(save([
            { playId: LIB, clientKey: "k1", sequence: 0, duration: 10, instructions: "" },
            { kind: "break", clientKey: "kb", sequence: 1, duration: 2, instructions: "", runsWithPrevious: true },
        ]));
        expect(block.success).toBe(false);
        expect(models.practiceSession.create).not.toHaveBeenCalled();
    });

    it("never treats a stored block row as an orphaned drill", async () => {
        models.practiceSessionPlay.findMany.mockResolvedValue([{ playId: null }, { playId: OWNED }]);
        await updatePracticeSession({ id: SESSION, ...save([]) });
        expect(models.play.deleteMany.mock.calls[0][0].where.id).toEqual({ in: [OWNED] });
    });
});
```

In the same file, the one existing exact-shape expectation of a written session-play row (line 99, in "createPracticeSession owns its drills"; `rg -n "runsWithPrevious: (true|false), duration" __tests__/lib/actions` finds no other) gains the four new keys:

```ts
            { sessionId: SESSION, playId: "cclone0xxxxxxxxxxxxxxxxxx", kind: "drill", label: null, sequence: 0, runsWithPrevious: false, stays: false, rotateEveryMinutes: null, duration: 10, instructions: null },
```

(`__tests__/lib/actions/practice-sessions-stations.test.ts` reads single fields off the written rows, so it needs no change.)

The existing ownership test "reads previous references before deleting session plays" (line 146) would now pass vacuously: its save omits `stays` / `rotateEveryMinutes`, so the first `practiceSessionPlay.findMany` is the new stored-timing read, not `materializeSessionDrills`'s. Pin it to the reference read, whose `select` is exactly `{ playId: true }`:

```ts
    it("reads previous references before deleting session plays", async () => {
        await updatePracticeSession({ id: SESSION, ...input([{ playId: OWNED, clientKey: "k1" }]) });
        // The stored-timing read comes first now; pin materializeSessionDrills's own read.
        const references = models.practiceSessionPlay.findMany.mock.calls.findIndex(
            ([args]) => Object.keys(args.select).join(",") === "playId",
        );
        expect(references).toBeGreaterThanOrEqual(0);
        expect(models.practiceSessionPlay.findMany.mock.invocationCallOrder[references])
            .toBeLessThan(models.practiceSessionPlay.deleteMany.mock.invocationCallOrder[0]);
    });
```

Append to `__tests__/lib/actions/practice-session-drills.test.ts`, inside `describe("duplicatePracticeSession", …)`:

```ts
    it("copies block rows without cloning them, keeps each drill on its own copy, and copies the gap", async () => {
        const blockRow = { ...sourceRow(1), kind: "break", label: "Water", playId: null, play: null };
        mockPrisma.practiceSession.findUnique.mockResolvedValue({
            teamId: TEAM, title: "Tuesday", duration: 75, transitionMinutes: 2, plays: [sourceRow(0), blockRow, sourceRow(2)],
        });
        await duplicatePracticeSession({ id: SOURCE, teamId: TEAM, date: DATE });

        expect(mockPrisma.practiceSession.findUnique.mock.calls[0][0].select).toMatchObject({ transitionMinutes: true });
        expect(tx.practiceSession.create.mock.calls[0][0].data.transitionMinutes).toBe(2);
        expect(tx.play.createManyAndReturn.mock.calls[0][0].data.map((d: { name: string }) => d.name)).toEqual(["Drill 0", "Drill 2"]);
        const copied: Array<Record<string, unknown>> = tx.practiceSessionPlay.createMany.mock.calls[0][0].data;
        expect(copied.map((row) => row.playId)).toEqual(["cclone0xxxxxxxxxxxxxxxxxx", null, "cclone1xxxxxxxxxxxxxxxxxx"]);
        expect(copied[1]).toMatchObject({ kind: "break", label: "Water", sessionId: COPY });
    });
```

(The file's existing "copies every session-play column except ids and foreign keys" guard builds `sourceRow()` from `Prisma.PracticeSessionPlayScalarFieldEnum`, so after `db:generate` it already covers `kind`, `label`, `stays` and `rotateEveryMinutes`.)

Append to `__tests__/lib/actions/practice-sessions.test.ts`:

```ts
describe("getPracticeSessionById: block rows", () => {
    it("returns a block row with its kind and no play", async () => {
        const TEAM_CUID = "cjld2cjxh0000qzrmn831i7rn";
        const SESSION_CUID = "cjld2cyuq0000t3rmniod1foy";
        mockAuth.requireTeamMember.mockResolvedValue(undefined);
        mockPrisma.practiceSession.findUnique.mockResolvedValue({
            id: SESSION_CUID, title: "T", date: new Date("2026-10-06T23:00:00Z"), duration: 60, isShared: false, teamId: TEAM_CUID,
            createdAt: new Date(), updatedAt: new Date(), venueId: null, venue: null, surfaceId: null, surface: null,
            segmentId: null, segment: null, startAt: null,
            plays: [{ id: "w", sequence: 0, duration: 8, instructions: null, runsWithPrevious: false, kind: "warmup", label: null, stays: false, rotateEveryMinutes: null, play: null }],
        });
        const result = await getPracticeSessionById({ id: SESSION_CUID, teamId: TEAM_CUID });
        expect(result.success && result.data.plays[0]).toMatchObject({ kind: "warmup", label: null, play: null });
    });
});
```

(Import `getPracticeSessionById` alongside the file's existing imports from `@/lib/actions/practice-sessions` if it isn't already.)

In `__tests__/lib/actions/practice-session-queries.test.ts`:
- add `findMany: vi.fn()` to the hoisted `mockPrisma.practiceSession`;
- add `getPracticePlannerListData` to the import from `@/lib/actions/practice-session-queries` and `import { drillRows, isDrillRow } from "@/lib/utils/session-rows";`;
- the query return types become `SessionItem[]` / `SessionRow[]`, so narrow the existing drill-only reads:
  - line 96: `const [unreadable, ok] = drillRows(result!.initialData.plays);` (lines 97–99 then read drill fields as before);
  - line 214: `expect(drillRows(result!.initialData.plays).map((p) => [p.focus, p.goalies])).toEqual([["goalies", "required"], ["team", "optional"]]);`
  - line 222: `expect(drillRows(result!.session.plays).map((p) => [p.play.focus, p.play.goalies])).toEqual([["goalies", "required"], ["team", "optional"]]);`
- append:

```ts
describe("practice timing in the session queries", () => {
    const blockRow = {
        id: "w", sequence: 0, duration: 8, instructions: "Easy laps", runsWithPrevious: false,
        kind: "warmup", label: null, stays: false, rotateEveryMinutes: null, play: null,
    };
    const base = {
        id: "s1", teamId: "t1", title: "T", date: new Date("2026-01-01T00:00:00Z"), duration: 60, isShared: true,
        venueId: null, surfaceId: null, segmentId: null, startAt: null, goaliesAttending: null, transitionMinutes: 2,
        createdBy: { name: "Coach" }, team: { id: "t1", name: "Team" }, venue: null, surface: null, segment: null,
        plays: [
            blockRow,
            { ...row("a", 1), kind: "drill", label: null, stays: false, rotateEveryMinutes: 5 },
            { ...row("b", 2, true), kind: "drill", label: null, stays: false, rotateEveryMinutes: null },
        ],
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockPrisma.teamMember.findFirst.mockResolvedValue({ id: "m", role: "ADMIN", teamId: "t1", team: { id: "t1", name: "Team" } });
        mockPrisma.practiceSession.findUnique.mockResolvedValue(base);
    });

    it("getPracticeSessionDetail returns block rows, each drill's timing and the gap", async () => {
        const result = await getPracticeSessionDetail("s1");
        expect(result?.session.transitionMinutes).toBe(2);
        expect(result?.session.plays[0]).toEqual({
            id: "w", kind: "warmup", label: null, sequence: 0, duration: 8, instructions: "Easy laps", runsWithPrevious: false,
        });
        expect(result?.session.plays.slice(1).map((p) => isDrillRow(p) && [p.stays, p.rotateEveryMinutes])).toEqual([[false, 5], [false, null]]);
    });

    it("getPracticeSessionForEdit returns block items and each drill's stored timing, so an untouched editor saves them back", async () => {
        const result = await getPracticeSessionForEdit("s1");
        expect(result?.initialData.transitionMinutes).toBe(2);
        expect(result?.initialData.plays[0]).toEqual({
            id: "w", kind: "warmup", label: "", sequence: 0, duration: 8, instructions: "Easy laps", runsWithPrevious: false,
        });
        expect(result?.initialData.plays[1]).toMatchObject({ playId: "play-a", stays: false, rotateEveryMinutes: 5 });
    });

    it("getPracticePlannerListData pictures and counts drills only", async () => {
        mockPrisma.practiceSession.findMany.mockResolvedValue([]);
        await getPracticePlannerListData();
        const include = mockPrisma.practiceSession.findMany.mock.calls[0][0].include;
        expect(include.plays).toMatchObject({ where: { kind: "drill" }, take: 1 });
        expect(include._count).toEqual({ select: { plays: { where: { kind: "drill" } } } });
    });
});
```

Create `__tests__/lib/email/practice-plan-blocks.test.ts`:

```ts
/** Practice-plan emails (spec R11): drills are counted, block rows are listed by label with minutes. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSendEmail, mockPrisma } = vi.hoisted(() => ({
    mockSendEmail: vi.fn(),
    mockPrisma: { practiceSession: { findUnique: vi.fn() } },
}));

vi.mock("@/lib/email/client", () => ({ sendEmail: mockSendEmail }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/utils/date", () => ({ FALLBACK_TIME_ZONE: "America/New_York", formatDateTime: vi.fn(() => "Jan 1, 2026, 10:00 AM") }));
vi.mock("@/lib/env", () => ({ getBaseUrl: () => "http://localhost:3000" }));
vi.mock("@/lib/services/notification", () => ({ notificationService: {} }));

import { sendPracticePlanNotifications } from "@/lib/email/templates";

function session(plays: Array<{ kind: string; label: string | null; duration: number }>) {
    return {
        id: "sess1", title: "Skills", date: new Date("2026-01-01T15:00:00Z"), duration: 60, teamId: "team1",
        team: { name: "Sharks", leagueId: null, members: [{ user: { id: "u1", email: "u1@example.com", notificationPreferences: [] } }] },
        _count: { plays: 2 },
        plays,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    mockSendEmail.mockResolvedValue(undefined);
});

describe("practice-plan emails with block rows", () => {
    it("counts drills only and lists blocks by label with minutes, escaped in HTML", async () => {
        mockPrisma.practiceSession.findUnique.mockResolvedValue(session([
            { kind: "warmup", label: null, duration: 8 },
            { kind: "break", label: "<Water>", duration: 2 },
        ]));
        await sendPracticePlanNotifications("sess1", "team1", "shared");
        const message = mockSendEmail.mock.calls[0][0];
        expect(message.text).toContain("Number of Drills: 2");
        expect(message.text).toContain("Also planned: Warm-up · 8 min, <Water> · 2 min");
        expect(message.html).toContain("Warm-up · 8 min, &lt;Water&gt; · 2 min");
        const query = mockPrisma.practiceSession.findUnique.mock.calls[0][0];
        expect(query.include._count).toEqual({ select: { plays: { where: { kind: "drill" } } } });
        expect(query.include.plays).toMatchObject({ where: { kind: { not: "drill" } }, orderBy: { sequence: "asc" } });
    });

    it("adds no line for a plan without blocks, in the updated email too", async () => {
        mockPrisma.practiceSession.findUnique.mockResolvedValue(session([]));
        await sendPracticePlanNotifications("sess1", "team1", "updated");
        expect(mockSendEmail.mock.calls[0][0].text).not.toContain("Also planned");
    });
});
```

In `__tests__/lib/email/templates-preferences-scope.test.ts`, the `buildSession` fixture gains `plays: []` next to `_count`.

Append to `__tests__/app/practice-planner-hosted-wrappers.test.tsx` (it reuses the file's `captured`, `actions`, `TEAM`, `SESSION`, `BOOKING` and `submitted`; render each wrapper the way the file's existing tests do):

```tsx
describe("hosted wrappers: block rows and the gap", () => {
    const ROWS = [
        { id: "kw", kind: "warmup", label: " Laps ", sequence: 0, duration: 8, instructions: "", runsWithPrevious: false },
        { id: "k1", playId: "cplayxxxxxxxxxxxxxxxxxxxx", name: "A", sequence: 1, runsWithPrevious: false, duration: 10, instructions: "", playData: createEmptyPlayData(), stays: false, rotateEveryMinutes: null },
    ];
    const SENT = [
        { kind: "warmup", clientKey: "kw", sequence: 0, duration: 8, instructions: "", label: "Laps" },
        { kind: "drill", playId: "cplayxxxxxxxxxxxxxxxxxxxx", clientKey: "k1", sequence: 1, runsWithPrevious: false, duration: 10, instructions: "", stays: false, rotateEveryMinutes: null },
    ];

    it("EditSessionWrapper sends every row and the gap", async () => {
        render(<EditSessionWrapper sessionId={SESSION} teamId={TEAM} initialData={{}} bookingOptions={BOOKING} />);
        await captured.props!.onSave({ ...submitted, plays: ROWS, transitionMinutes: 2 });
        const sent = actions.updatePracticeSession.mock.calls[0][0];
        expect(sent.plays).toEqual(SENT);
        expect(sent.transitionMinutes).toBe(2);
    });

    it("EditSessionWrapper leaves the gap out when the editor holds none, so the stored gap stays", async () => {
        render(<EditSessionWrapper sessionId={SESSION} teamId={TEAM} initialData={{}} bookingOptions={BOOKING} />);
        await captured.props!.onSave({ ...submitted });
        expect(actions.updatePracticeSession.mock.calls[0][0]).not.toHaveProperty("transitionMinutes");
    });

    it("PracticeSessionEditorWrapper sends every row on create", async () => {
        render(<PracticeSessionEditorWrapper teamId={TEAM} bookingOptions={BOOKING} />);
        await captured.props!.onSave({ ...submitted, plays: ROWS, transitionMinutes: 1 });
        const sent = actions.createPracticeSession.mock.calls[0][0];
        expect(sent.plays).toEqual(SENT);
        expect(sent.transitionMinutes).toBe(1);
    });
});
```

Detach-on-write (spec R5, Testing "detach carries the new fields"; ruling R12). `detachLibraryPlay` repoints rows with `updateMany({ data: { playId } })`, so a drill row keeps its `kind`, `label`, `stays` and `rotateEveryMinutes`, and a block row (no play) never matches the lookup. In `__tests__/lib/services/practice-session-drills.test.ts`, widen `fakeTx`'s second parameter so rows can carry the new columns and a block row's null play:

```ts
function fakeTx(plays: Row[], referencing: Array<{ sessionId: string; playId: string | null } & Record<string, unknown>> = []) {
```

(`refs()` still fits it), and append inside `describe("detachLibraryPlay", …)`:

```ts
    it("repoints only the play id, so a row keeps its kind, stays and rotation, and never touches a block row", async () => {
        const { mocks, tx } = fakeTx([LIB], [
            { sessionId: "sA", playId: null, kind: "warmup", label: "Laps", stays: false, rotateEveryMinutes: null },
            { sessionId: "sA", playId: "lib", kind: "drill", label: null, stays: true, rotateEveryMinutes: 5 },
        ]);
        await expect(detachLibraryPlay(tx, { playId: "lib", teamId: TEAM, userId: USER })).resolves.toBe(1);
        expect(mocks.practiceSessionPlay.findMany.mock.calls[0][0].where).toEqual({ playId: "lib", session: { teamId: TEAM } });
        // The update writes the play id and nothing else: every other column stays as stored.
        expect(mocks.practiceSessionPlay.updateMany.mock.calls).toEqual([
            [{ where: { sessionId: "sA", playId: "lib" }, data: { playId: "clone-0" } }],
        ]);
    });
```

(This documents behaviour that is already right, so it passes before Step 6; it guards the copy path R5 names.)

The dashboard's upcoming schedule shows "N plays" per practice from `_count.plays` (`lib/data/dashboard.ts:176`, read by `UpcomingScheduleWidget`), which would count block rows (ruling R8). Create `__tests__/lib/data/dashboard-schedule.test.ts`:

```ts
/** Dashboard upcoming schedule (practice timing, spec R11): a practice's play count is its drill rows. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
    mockPrisma: {
        teamMember: { findMany: vi.fn() },
        leagueUser: { findMany: vi.fn() },
        event: { findMany: vi.fn() },
        practiceSession: { findMany: vi.fn() },
    },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));

import { getUpcomingSchedule } from "@/lib/data/dashboard";

describe("getUpcomingSchedule: practice play counts", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockPrisma.teamMember.findMany.mockResolvedValue([{ role: "ADMIN", team: { id: "t1", name: "Lions" } }]);
        mockPrisma.leagueUser.findMany.mockResolvedValue([]);
        mockPrisma.event.findMany.mockResolvedValue([]);
        mockPrisma.practiceSession.findMany.mockResolvedValue([
            { id: "s1", title: "Skills", date: new Date("2026-10-06T23:00:00.000Z"), duration: 60, teamId: "t1", team: { name: "Lions" }, _count: { plays: 2 } },
        ]);
    });

    it("counts drill rows only, so a warm-up or a break is not a play", async () => {
        const items = await getUpcomingSchedule("u1");
        expect(mockPrisma.practiceSession.findMany.mock.calls[0][0].select._count).toEqual({ select: { plays: { where: { kind: "drill" } } } });
        expect(items).toEqual([expect.objectContaining({ kind: "practice", id: "s1", playCount: 2 })]);
    });
});
```

(`getViewerMemberships` is wrapped in React's `cache`; the client build Vitest loads calls straight through, so no mock of `react` is needed.)

Run: `bun run test __tests__/lib/utils/validation-practice-session.test.ts __tests__/lib/actions __tests__/lib/email __tests__/app/practice-planner-hosted-wrappers.test.tsx __tests__/lib/services/practice-session-drills.test.ts __tests__/lib/data/dashboard-schedule.test.ts`
Expected: FAIL. The schema has no row kinds or gap; the actions, queries, duplicate, emails and the dashboard count don't know block rows. (The new detach test passes already.)

- [ ] **Step 5: Extend the session schemas**

In `lib/utils/validation.ts`:
- extend the `@/types/practice-planner` import with `MAX_BLOCK_LABEL_LENGTH, MAX_ROTATE_MINUTES, MAX_TRANSITION_MINUTES, MIN_ROTATE_MINUTES, SESSION_ROW_KINDS`;
- add:

```ts
import {
  BLOCK_HAS_NO_DRILL_MESSAGE,
  BLOCK_LABEL_MESSAGE,
  CONTROL_CHARS,
  DRILL_NEEDS_PLAY_MESSAGE,
  ROTATE_MINUTES_MESSAGE,
  TRANSITION_MINUTES_MESSAGE,
} from "@/lib/utils/session-rows";
import { BLOCK_ROW_FIELDS_ERROR, BLOCK_STATION_ERROR } from "@/lib/utils/session-timeline";
```

- replace `practiceSessionPlayInputSchema` (keep its comment, extended; the label strips the shared `CONTROL_CHARS`, not a new inline copy of the pattern):

```ts
// One row in a practice-session save. clientKey is the editor's stable
// per-card key; the save returns clientKey → owned playId for drill rows.
// runsWithPrevious (2b): the drill runs at the same time as the previous drill
// by sequence (a station). Absent means sequential, so older clients still work.
// Practice timing (spec R1–R3): `kind` is drill (the default, for older
// clients) or a block (warm-up, break, transition, cool-down). A block row has
// no play and never runs as a station, stays or rotates. Absent stays /
// rotateEveryMinutes = unchanged on update (the action reads the stored row);
// null clears a rotation.
const blockLabelSchema = z
  .string()
  .transform((value) => value.replace(CONTROL_CHARS, "").trim())
  .pipe(z.string().max(MAX_BLOCK_LABEL_LENGTH, BLOCK_LABEL_MESSAGE));

const rotateEveryMinutesSchema = z
  .number({ message: ROTATE_MINUTES_MESSAGE })
  .int(ROTATE_MINUTES_MESSAGE)
  .min(MIN_ROTATE_MINUTES, ROTATE_MINUTES_MESSAGE)
  .max(MAX_ROTATE_MINUTES, ROTATE_MINUTES_MESSAGE);

export const practiceSessionPlayInputSchema = z
  .object({
    kind: z.enum(SESSION_ROW_KINDS).default("drill"),
    playId: z.string().cuid("Invalid play ID format").optional(),
    clientKey: z.string().min(1, "Drill key is required").max(64, "Drill key is too long"),
    sequence: z.number().int().min(0),
    duration: z.number().int().min(1, "Play duration must be at least 1 minute").max(300, "Play duration must be less than 300 minutes"),
    instructions: optionalSanitizedString(2000),
    runsWithPrevious: z.boolean().default(false),
    label: blockLabelSchema.nullable().optional(),
    stays: z.boolean().optional(),
    rotateEveryMinutes: rotateEveryMinutesSchema.nullable().optional(),
  })
  .superRefine((row, ctx) => {
    if (row.kind === "drill") {
      if (!row.playId) ctx.addIssue({ code: "custom", path: ["playId"], message: DRILL_NEEDS_PLAY_MESSAGE });
      return;
    }
    if (row.playId) ctx.addIssue({ code: "custom", path: ["playId"], message: BLOCK_HAS_NO_DRILL_MESSAGE });
    if (row.runsWithPrevious) ctx.addIssue({ code: "custom", path: ["runsWithPrevious"], message: BLOCK_STATION_ERROR });
    if (row.stays || row.rotateEveryMinutes != null) ctx.addIssue({ code: "custom", path: ["kind"], message: BLOCK_ROW_FIELDS_ERROR });
  });

export type PracticeSessionRowInput = z.output<typeof practiceSessionPlayInputSchema>;

// The gap between blocks (practice timing, spec R2). Absent = unchanged on
// update; a create without it stores 0.
const transitionMinutesSchema = z
  .number({ message: TRANSITION_MINUTES_MESSAGE })
  .int(TRANSITION_MINUTES_MESSAGE)
  .min(0, TRANSITION_MINUTES_MESSAGE)
  .max(MAX_TRANSITION_MINUTES, TRANSITION_MINUTES_MESSAGE);
```

- in both `createPracticeSessionSchema` and `updatePracticeSessionSchema`, after `goaliesAttending: …`, add `transitionMinutes: transitionMinutesSchema.optional(),`.

- [ ] **Step 6: Write block rows in `createPracticeSession` and `updatePracticeSession`**

In `lib/services/practice-session-drills.ts`, `materializeSessionDrills`: a stored block row has no play.

```ts
    const previousPlayIds = [...new Set(previous.flatMap((row) => (row.playId ? [row.playId] : [])))];
```

In `lib/actions/practice-sessions.ts`:
- imports: replace `stationGroupError` with `sessionRowsError` in the session-timeline import; add `import { needsStoredTiming, toBlockLabel, withStoredTiming } from "@/lib/utils/session-rows";` and `type PracticeSessionRowInput` to the `@/lib/utils/validation` import;
- `validateWallTime` gains the gap:

```ts
/**
 * Validate the practice timeline against the session duration (2b, practice
 * timing). Each block counts once (station blocks for their longest drill or
 * M × rotating stations), plus the gap between blocks.
 */
function validateWallTime(
    sessionDuration: number,
    plays: TimelinePlay[],
    transitionMinutes: number,
): { valid: boolean; error?: string } {
    const wallMinutes = sessionWallMinutes(plays, transitionMinutes);
```

(the rest of the function is unchanged);
- replace `drillItems` and add the row helpers below `toSavedDrills`:

```ts
/** A save row with its timing resolved: sent, else stored (update), else the default. */
type ResolvedRow = PracticeSessionRowInput & { stays: boolean; rotateEveryMinutes: number | null };

/** The drill rows' play ids and keys, for materializeSessionDrills. Block rows have no play. */
function drillItems(rows: ResolvedRow[]) {
    return rows.flatMap((row) => (row.kind === "drill" && row.playId ? [{ playId: row.playId, clientKey: row.clientKey, sequence: row.sequence }] : []));
}

/** The rows' first problem: sequences, the station / block / rotation rules, then the wall time with the gap. */
function rowsError(rows: ResolvedRow[], duration: number, transitionMinutes: number): string | null {
    if (rows.length === 0) return null;
    const sequence = validatePlaySequence(rows);
    if (!sequence.valid) return sequence.error || "Invalid play sequence";
    const ruleError = sessionRowsError(rows);
    if (ruleError) return ruleError;
    const wall = validateWallTime(duration, rows, transitionMinutes);
    return wall.valid ? null : wall.error || "Practice timeline exceeds session duration";
}

/**
 * One session-play row to write. A block row has no play; a drill row points
 * at its owned copy, found by clientKey (never by position: block rows sit
 * between drills).
 */
function sessionPlayData(row: ResolvedRow, ownedByKey: ReadonlyMap<string, string>) {
    const block = row.kind !== "drill";
    const playId = block ? null : ownedByKey.get(row.clientKey);
    if (playId === undefined) throw new Error(`No drill copy for row ${row.clientKey}`);
    return {
        playId,
        kind: row.kind,
        label: block ? toBlockLabel(row.label) : null,
        sequence: row.sequence,
        runsWithPrevious: block ? false : row.runsWithPrevious,
        stays: row.stays,
        rotateEveryMinutes: row.rotateEveryMinutes,
        duration: row.duration,
        instructions: row.instructions ? sanitizeText(row.instructions, 2000) : null,
    };
}
```

In `createPracticeSession`:
- replace the whole `if (validated.plays && validated.plays.length > 0) { … }` validation block with:

```ts
        // A create has nothing stored: absent timing takes the defaults.
        const rows = withStoredTiming(validated.plays, []);
        const rowError = rowsError(rows, validated.duration, validated.transitionMinutes ?? 0);
        if (rowError) {
            return { success: false, error: rowError };
        }
```

- in `tx.practiceSession.create`'s data, after `goaliesAttending: …`: `transitionMinutes: validated.transitionMinutes ?? 0,`
- replace the materialize call's `items: drillItems(validated.plays),` with `items: drillItems(rows),`, and the `if (mapping.length > 0) { … createMany … }` block with:

```ts
            const ownedByKey = new Map(mapping.map((entry) => [entry.clientKey, entry.playId]));
            if (rows.length > 0) {
                await tx.practiceSessionPlay.createMany({
                    data: rows.map((row) => ({ sessionId: createdSession.id, ...sessionPlayData(row, ownedByKey) })),
                });
            }
```

In `updatePracticeSession`:
- add `transitionMinutes: true,` to the `existingSession` select;
- replace the `if (validated.plays && validated.plays.length > 0) { … }` validation block with:

```ts
        // Absent = unchanged (spec R3): a drill row without stays or
        // rotateEveryMinutes (an older client) keeps the stored row's values,
        // read before validating; the gap likewise keeps the stored gap.
        const stored = needsStoredTiming(validated.plays)
            ? await prisma.practiceSessionPlay.findMany({
                where: { sessionId: validated.id },
                select: { playId: true, stays: true, rotateEveryMinutes: true },
            })
            : [];
        const rows = withStoredTiming(validated.plays, stored);
        const transitionMinutes = validated.transitionMinutes ?? existingSession.transitionMinutes ?? 0;
        const rowError = rowsError(rows, validated.duration, transitionMinutes);
        if (rowError) {
            return { success: false, error: rowError };
        }
```

- the materialize call's items become `drillItems(rows)`;
- in `tx.practiceSession.update`'s data, after the `goaliesAttending` spread:

```ts
                    // Absent = unchanged: an editor that never loaded or set the gap sends none.
                    ...(validated.transitionMinutes !== undefined && { transitionMinutes: validated.transitionMinutes }),
```

- replace the `plays: validated.plays.length > 0 ? { create: … } : undefined,` entry with:

```ts
                    plays: rows.length > 0 ? { create: rows.map((row) => sessionPlayData(row, ownedByKey)) } : undefined,
```

and define `const ownedByKey = new Map(mapping.map((entry) => [entry.clientKey, entry.playId]));` right after the materialize call.

In `getPracticeSessionById`:
- in the return type's `plays` element, add `kind: SessionRowKind; label: string | null; stays: boolean; rotateEveryMinutes: number | null;` and make `play` `{ … } | null` (import `type SessionRowKind` from `@/types/practice-planner`);
- in the `plays.select`, add `kind: true, label: true, stays: true, rotateEveryMinutes: true,`;
- in the mapping, add `kind: toRowKind(p.kind), label: p.label, stays: p.stays, rotateEveryMinutes: p.rotateEveryMinutes,` (import `toRowKind`) and make `play: p.play ? { …existing fields… } : null`.

- [ ] **Step 7: Copy block rows and the gap in `duplicatePracticeSession`**

In `lib/actions/practice-session-drills.ts`:
- add `transitionMinutes: true,` to the source select, and `transitionMinutes: source.transitionMinutes,` to the new session's data after `goaliesAttending`;
- replace the clone and `createMany` part of the transaction:

```ts
            // Block rows have no drill: only drill rows are cloned, each matched back by its row id.
            const drills = source.plays.flatMap((row) => (row.play ? [{ rowId: row.id, play: row.play }] : []));
            const playIds = await cloneDrillsIntoSession(tx, {
                sessionId: session.id,
                teamId: validated.teamId,
                userId,
                sources: drills.map((entry) => entry.play),
            });
            const copyByRow = new Map(drills.map((entry, index) => [entry.rowId, playIds[index]]));
            if (source.plays.length > 0) {
                await tx.practiceSessionPlay.createMany({
                    data: source.plays.map((row) => ({
                        ...copySessionPlayScalars(row),
                        sessionId: session.id,
                        // A block row has no copy: no play.
                        playId: copyByRow.get(row.id) ?? null,
                    })),
                });
            }
```

`copySessionPlayScalars` copies `kind`, `label`, `stays` and `rotateEveryMinutes` with every other scalar (spec R5); nothing else changes.

- [ ] **Step 8: Read block rows, timing and the gap in the queries**

In `lib/actions/practice-session-queries.ts`:
- imports: `import type { PlayData, SessionItem, SessionRow } from "@/types/practice-planner";` (drop `PlayFocus`/`PlayGoalies` if unused after this step), and `import { isBlockKind, toRowKind } from "@/lib/utils/session-rows";`;
- `getPracticePlannerListData`: the first-thumbnail and the count read drills only (a practice may open with a warm-up):

```ts
      plays: {
        where: { kind: "drill" },
        select: { play: { select: { thumbnail: true } } },
        orderBy: { sequence: "asc" },
        take: 1,
      },
      _count: { select: { plays: { where: { kind: "drill" } } } },
```

- `getPracticeSessionDetail`: in the return type, replace the `plays: Array<{ … }>;` member with `plays: SessionRow[];` and add `transitionMinutes: number;` after `goaliesAttending`; in the returned object add `transitionMinutes: session.transitionMinutes ?? 0,` and replace the `plays:` mapping:

```ts
      plays: session.plays.flatMap((sp): SessionRow[] => {
        const kind = toRowKind(sp.kind);
        if (isBlockKind(kind)) {
          return [{ id: sp.id, kind, label: sp.label ?? null, sequence: sp.sequence, duration: sp.duration ?? 0, instructions: sp.instructions, runsWithPrevious: false }];
        }
        // Every drill row has its play (CHECK practice_session_plays_kind_play_check).
        if (!sp.play) return [];
        const play = sp.play;
        return [{
          id: sp.id,
          sequence: sp.sequence,
          duration: sp.duration ?? 0,
          instructions: sp.instructions,
          runsWithPrevious: sp.runsWithPrevious,
          stays: sp.stays ?? false,
          rotateEveryMinutes: sp.rotateEveryMinutes ?? null,
          play: {
            id: play.id,
            name: play.name,
            description: play.description,
            thumbnail: play.thumbnail,
            ...drillTags(play),
            playData: (() => {
              const parsed = parseStoredPlayData(play.playData);
              if (!parsed.ok) console.error(`Unreadable playData (play ${play.id}):`, parsed.error);
              return parsed.ok ? parsed.data : null;
            })(),
          },
        }];
      }),
```

- `getPracticeSessionForEdit`: in the return type, replace the `plays: Array<{ … }>;` member with `plays: SessionItem[];` and add `transitionMinutes: number;`; in the returned object add `transitionMinutes: session.transitionMinutes ?? 0,` and replace the mapping inside `normalizeGroups(…)`:

```ts
      plays: normalizeGroups(session.plays.flatMap((sp): SessionItem[] => {
        const kind = toRowKind(sp.kind);
        if (isBlockKind(kind)) {
          return [{ id: sp.id, kind, label: sp.label ?? "", sequence: sp.sequence, duration: sp.duration ?? 0, instructions: sp.instructions || "", runsWithPrevious: false }];
        }
        if (!sp.play) return [];
        return [{
          id: sp.id,
          playId: sp.play.id,
          name: sp.play.name,
          description: sp.play.description ?? "",
          sequence: sp.sequence,
          runsWithPrevious: sp.runsWithPrevious,
          duration: sp.duration ?? 0,
          instructions: sp.instructions || "",
          // Loaded so an untouched editor saves them back unchanged.
          stays: sp.stays ?? false,
          rotateEveryMinutes: sp.rotateEveryMinutes ?? null,
          ...drillTags(sp.play),
          ...editorPlayData(sp.play.playData, sp.play.id),
          thumbnail: sp.play.thumbnail || "",
        }];
      })),
```

(`?? false` / `?? null` here read a legacy or partial row with defaults; they never write.)

- [ ] **Step 9: List block rows in the practice-plan emails, and count drills on the dashboard**

In `lib/email/templates.ts`:
- add `import { blockTitle, isBlockKind, toRowKind } from "@/lib/utils/session-rows";`;
- add `blocks: Array<{ title: string; minutes: number }>;` to both `PracticePlanSharedEmailData` and `PracticePlanUpdatedEmailData`;
- above `sendPracticePlanSharedEmail`, add:

```ts
/** "Warm-up · 8 min, Water break · 2 min": a plan's block rows (spec R11). */
function plannedBlocks(blocks: ReadonlyArray<{ title: string; minutes: number }>): string {
  return blocks.map((block) => `${block.title} · ${block.minutes} min`).join(", ");
}
```

- in both senders, after the `Number of Drills` HTML paragraph add:

```ts
          ${data.blocks.length > 0 ? `<p style="margin: 10px 0;"><strong>Also planned:</strong> ${escapeHtml(plannedBlocks(data.blocks))}</p>` : ""}
```

and in both text bodies, after the `Number of Drills: ${data.playCount}` line, add `${data.blocks.length > 0 ? `\nAlso planned: ${plannedBlocks(data.blocks)}` : ""}` on the same line (so a plan without blocks keeps today's text exactly);
- in `sendPracticePlanNotifications`, replace the `_count` include and add the block rows:

```ts
      // Drills only: block rows are listed by label instead (spec R11).
      _count: { select: { plays: { where: { kind: "drill" } } } },
      plays: {
        where: { kind: { not: "drill" } },
        orderBy: { sequence: "asc" },
        select: { kind: true, label: true, duration: true },
      },
```

and add to `sessionData`:

```ts
    blocks: session.plays.flatMap((row) => {
      const kind = toRowKind(row.kind);
      return isBlockKind(kind) ? [{ title: blockTitle(kind, row.label), minutes: row.duration }] : [];
    }),
```

In `lib/data/dashboard.ts`, `getUpcomingSchedule`'s practice query counts drills only (its "N plays" line must not count a warm-up or a break):

```ts
        // Drills only: block rows (warm-up, break…) are not plays (practice timing).
        _count: { select: { plays: { where: { kind: "drill" } } } },
```

- [ ] **Step 10: Send block rows from the hosted editors (remove seam S1)**

In `EditSessionWrapper.tsx` and `PracticeSessionEditorWrapper.tsx`, import `toSessionRowInputs` (drop `drillRows`/`toDrillRowInput`) and replace the seam with:

```tsx
        plays: toSessionRowInputs(session.plays),
        // Absent = unchanged: an editor that never loaded or set the gap sends none.
        ...(session.transitionMinutes !== undefined && { transitionMinutes: session.transitionMinutes }),
```

- [ ] **Step 11: Run the tests to verify they pass**

Run the Step 4 command again, plus `bun run test __tests__/prisma __tests__/lib/services __tests__/integration`.
Expected: PASS.
Run: `bun run test && bun run type-check && bun run lint && bun run check:raw-sql`
Expected: PASS (the narrowed `practice-session-queries.test.ts` included).

- [ ] **Step 12: Commit**

```bash
/usr/bin/git add prisma/schema.prisma prisma/migrations/20261004120000_practice_session_timing/migration.sql \
  lib/utils/validation.ts lib/services/practice-session-drills.ts lib/actions/practice-sessions.ts \
  lib/actions/practice-session-drills.ts lib/actions/practice-session-queries.ts lib/email/templates.ts lib/data/dashboard.ts \
  "app/(dashboard)/practice-planner/[sessionId]/edit/EditSessionWrapper.tsx" "app/(dashboard)/practice-planner/new/PracticeSessionEditorWrapper.tsx" \
  __tests__/prisma/practice-timing-migration.test.ts __tests__/lib/email/practice-plan-blocks.test.ts \
  __tests__/lib/utils/validation-practice-session.test.ts __tests__/lib/actions/practice-sessions-ownership.test.ts \
  __tests__/lib/actions/practice-sessions.test.ts \
  __tests__/lib/actions/practice-session-drills.test.ts __tests__/lib/actions/practice-session-queries.test.ts \
  __tests__/lib/email/templates-preferences-scope.test.ts __tests__/app/practice-planner-hosted-wrappers.test.tsx \
  __tests__/lib/services/practice-session-drills.test.ts __tests__/lib/data/dashboard-schedule.test.ts
/usr/bin/git commit -m "feat(practice-planner): store block rows, rotation and the gap between blocks" -m "Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 4: Static store: block rows, rotation and the gap

The static planner stores what hosted stores (spec R7). IndexedDB records gain optional fields, so there is no IndexedDB version bump; a record written before this change reads as drills that don't rotate and a 0-minute gap. Updates keep "absent is unchanged". Seam S2 goes, so the static editor sends block rows. Every test runs against both repositories (memory and IndexedDB).

**Files:**
- Modify: `apps/planner/src/store/records.ts` (`StoredSessionRow`, `StoredSession`)
- Modify: `apps/planner/src/store/types.ts` (`LocalSessionDrill`, `LocalSessionSave`)
- Modify: `apps/planner/src/store/sessions.ts` (imports, the private `CONTROL_CHARS` → the shared import, `checkDrills` → `checkRows`, new `checkTimeline`/`checkedTransition`/`storedTiming`, `assertExportable` seam S4, `materialize`, `listSessions`, `getSessionView`, `getSessionForEdit`, `createSession`, `updateSession`, `duplicatePracticeSession`)
- Modify: `apps/planner/src/screens/SessionEditorScreen.tsx` (remove seam S2)
- Test (append or modify): `__tests__/apps/planner/local-store.sessions.test.ts`, `__tests__/apps/planner/editor-screens.test.tsx`, `__tests__/apps/planner/import-screen.test.tsx` (the update sends every row once the store takes block rows)

**Interfaces:**
- Consumes (Task 1): `SessionRowInput`, `DrillRowInput`, `withStoredTiming`, `toBlockLabel`, `toRowKind`, `isBlockKind`, `isBlockRow`, `toRotateEveryMinutes`, `toTransitionMinutes`, the message constants (incl. `BLOCK_HAS_NO_DRILL_MESSAGE` and `DRILL_NEEDS_PLAY_MESSAGE`, so the static store rejects the row shapes hosted's schema rejects, ruling R7), `CONTROL_CHARS`, `sessionRowsError`, `sessionWallMinutes`, `toSessionRowInputs`. (Task 2): `SessionRow`, `SessionItem`.
- Produces:
  - `StoredSessionRow.playId: string | null` plus optional `kind`, `label`, `stays`, `rotateEveryMinutes`; `StoredSession.transitionMinutes?: number`;
  - `LocalSessionDrill = SessionRowInput`; `LocalSessionSave.transitionMinutes?: number` (absent = unchanged on update, 0 on create).

- [ ] **Step 1: Write the failing store tests**

In `__tests__/apps/planner/local-store.sessions.test.ts`:
- imports: merge `BLOCK_HAS_NO_DRILL_MESSAGE, BLOCK_LABEL_MESSAGE, DRILL_NEEDS_PLAY_MESSAGE, isDrillRow, TRANSITION_MINUTES_MESSAGE, type DrillRowInput` into the `@/lib/utils/session-rows` import Task 2 added (one import per module), and add `import { BLOCK_STATION_ERROR, ROTATION_TOO_FEW_ERROR } from "@/lib/utils/session-timeline";`;
- the `drill` helper builds drill rows only, so its overrides are drill fields:

```ts
function drill(playId: string, clientKey: string, sequence: number, overrides: Partial<DrillRowInput> = {}): DrillRowInput {
    return { playId, clientKey, sequence, runsWithPrevious: false, duration: 10, instructions: "", ...overrides };
}
```

- append inside `describe.each(REPOS)`:

```ts
    it("saves block rows, rotation, stays and the gap, and reads them back in the view, the editor and the list", async () => {
        const { store } = await setup();
        const a = await addLibraryPlay(store, "A");
        const b = await addLibraryPlay(store, "B");
        const { id } = data(await store.createSession(save([
            { kind: "warmup", clientKey: "kw", sequence: 0, duration: 8, instructions: "Laps", label: null },
            drill(a, "ka", 1, { stays: false, rotateEveryMinutes: 5, duration: 5 }),
            drill(b, "kb", 2, { runsWithPrevious: true, stays: false, rotateEveryMinutes: null, duration: 5 }),
            { kind: "cooldown", clientKey: "kc", sequence: 3, duration: 5, instructions: "", label: "Stretch" },
        ], { transitionMinutes: 2 })));

        const view = data(await store.getSessionView(id));
        expect(view.transitionMinutes).toBe(2);
        expect(view.plays.map((row) => (isDrillRow(row) ? row.play.name : row.kind))).toEqual(["warmup", "A", "B", "cooldown"]);
        expect(view.plays[3]).toEqual({ id: "kc", kind: "cooldown", label: "Stretch", sequence: 3, duration: 5, instructions: null, runsWithPrevious: false });
        expect(view.plays.slice(1, 3).map((row) => isDrillRow(row) && [row.rotateEveryMinutes, row.stays])).toEqual([[5, false], [null, false]]);

        const edit = data(await store.getSessionForEdit(id));
        expect(edit.initialData.transitionMinutes).toBe(2);
        expect(edit.initialData.plays[0]).toEqual({ id: "kw", kind: "warmup", label: "", sequence: 0, duration: 8, instructions: "Laps", runsWithPrevious: false });
        expect(edit.initialData.plays[1]).toMatchObject({ stays: false, rotateEveryMinutes: 5 });

        expect(data(await store.listSessions())[0].drillCount).toBe(2);
    });

    it("keeps the gap and each drill's rotation and stays when an update leaves them out, and clears them when told", async () => {
        const { store } = await setup();
        const a = await addLibraryPlay(store, "A");
        const b = await addLibraryPlay(store, "B");
        const created = data(await store.createSession(save([
            drill(a, "ka", 0, { stays: false, rotateEveryMinutes: 5 }),
            drill(b, "kb", 1, { runsWithPrevious: true, stays: false, rotateEveryMinutes: null }),
        ], { transitionMinutes: 3 })));
        const [ownedA, ownedB] = created.plays.map((p) => p.playId);

        data(await store.updateSession(created.id, save([drill(ownedA, "ka", 0), drill(ownedB, "kb", 1, { runsWithPrevious: true })])));
        const kept = data(await store.getSessionView(created.id));
        expect(kept.transitionMinutes).toBe(3);
        expect(kept.plays.map((row) => isDrillRow(row) && row.rotateEveryMinutes)).toEqual([5, null]);

        data(await store.updateSession(created.id, save([drill(ownedA, "ka", 0, { rotateEveryMinutes: null })], { transitionMinutes: 0 })));
        const cleared = data(await store.getSessionView(created.id));
        expect(cleared.transitionMinutes).toBe(0);
        expect(cleared.plays.map((row) => isDrillRow(row) && row.rotateEveryMinutes)).toEqual([null]);
    });

    it("refuses what hosted refuses, writing nothing", async () => {
        const { store } = await setup();
        const a = await addLibraryPlay(store, "A");
        expect(await store.createSession(save([
            drill(a, "k1", 0, { stays: false, rotateEveryMinutes: 5 }),
            drill(a, "k2", 1, { runsWithPrevious: true, stays: true }),
        ]))).toEqual({ success: false, error: ROTATION_TOO_FEW_ERROR });
        expect(await store.createSession(save([
            { kind: "break", clientKey: "kb", sequence: 0, duration: 2, instructions: "", label: null },
            drill(a, "k1", 1, { runsWithPrevious: true }),
        ]))).toEqual({ success: false, error: BLOCK_STATION_ERROR });
        // 30 + 1 + 30 = 61
        expect(await store.createSession(save([drill(a, "k1", 0, { duration: 30 }), drill(a, "k2", 1, { duration: 30 })], { transitionMinutes: 1 })))
            .toEqual({ success: false, error: "Practice timeline (61 min) exceeds session duration (60 min)" });
        expect(await store.createSession(save([], { transitionMinutes: 6 }))).toEqual({ success: false, error: TRANSITION_MINUTES_MESSAGE });
        expect(await store.createSession(save([{ kind: "break", clientKey: "kb", sequence: 0, duration: 2, instructions: "", label: "x".repeat(61) }])))
            .toEqual({ success: false, error: BLOCK_LABEL_MESSAGE });
        // The row shapes hosted's schema rejects (ruling R7), with the same words: a drill with no
        // play, and a block that names one (built outside a literal, as an older or hand-made payload).
        expect(await store.createSession(save([drill("", "k1", 0)]))).toEqual({ success: false, error: DRILL_NEEDS_PLAY_MESSAGE });
        const blockWithDrill = { kind: "break" as const, clientKey: "kb", sequence: 0, duration: 2, instructions: "", label: null, playId: a };
        expect(await store.createSession(save([blockWithDrill]))).toEqual({ success: false, error: BLOCK_HAS_NO_DRILL_MESSAGE });
        expect(data(await store.listSessions())).toEqual([]);
    });

    it("duplicates block rows as they are, each drill to its own clone, and the gap", async () => {
        const { store } = await setup();
        const a = await addLibraryPlay(store, "A");
        const b = await addLibraryPlay(store, "B");
        const source = data(await store.createSession(save([
            { kind: "warmup", clientKey: "kw", sequence: 0, duration: 8, instructions: "", label: "Laps" },
            drill(a, "k1", 1),
            { kind: "break", clientKey: "kb", sequence: 2, duration: 2, instructions: "", label: null },
            drill(b, "k2", 3),
        ], { transitionMinutes: 1 })));
        const copy = data(await store.duplicatePracticeSession({ id: source.id, teamId: T, date: new Date("2026-10-13T19:00:00") }));
        const view = data(await store.getSessionView(copy.id));
        expect(view.transitionMinutes).toBe(1);
        expect(view.plays.map((row) => (isDrillRow(row) ? row.play.name : row.kind))).toEqual(["warmup", "A", "break", "B"]);
        expect(view.plays[0]).toMatchObject({ kind: "warmup", label: "Laps" });
        const copiedIds = view.plays.flatMap((row) => (isDrillRow(row) ? [row.play.id] : []));
        expect(copiedIds).toHaveLength(2);
        for (const id of copiedIds) expect(source.plays.map((p) => p.playId)).not.toContain(id);
    });

    it("reads a session stored before practice timing as drills with no gap", async () => {
        const { repo, store } = await setup();
        const a = await addLibraryPlay(store, "A");
        const { id, plays } = data(await store.createSession(save([drill(a, "k1", 0)])));
        await repo.write(async (tx) => {
            const stored = await tx.getSession(id);
            if (!stored) throw new Error("session missing");
            await tx.putSession({
                id: stored.id, title: stored.title, date: stored.date, duration: stored.duration, createdAt: stored.createdAt, updatedAt: stored.updatedAt,
                rows: stored.rows.map((row) => ({ id: row.id, playId: row.playId, sequence: row.sequence, duration: row.duration, instructions: row.instructions, runsWithPrevious: row.runsWithPrevious })),
            });
        });
        const view = data(await store.getSessionView(id));
        expect(view.transitionMinutes).toBe(0);
        expect(view.plays[0]).toMatchObject({ stays: false, rotateEveryMinutes: null, play: { id: plays[0].playId } });
        expect(data(await store.getSessionForEdit(id)).initialData.plays[0]).toMatchObject({ stays: false, rotateEveryMinutes: null });
    });
```

Append to `__tests__/apps/planner/editor-screens.test.tsx`, next to the other `toLocalSessionSave` tests:

```ts
    it("sends block rows and the gap, and leaves the gap out when the editor holds none", () => {
        const submitted = {
            title: "T", date: new Date("2026-10-06T19:00:00"), duration: 60, isShared: false, transitionMinutes: 2,
            plays: [{ id: "kw", kind: "warmup", label: "", sequence: 0, duration: 8, instructions: "", runsWithPrevious: false }],
        } as unknown as PracticeSessionSubmitData;
        expect(toLocalSessionSave(submitted)).toMatchObject({ transitionMinutes: 2, plays: [{ kind: "warmup", clientKey: "kw", label: null }] });
        expect(toLocalSessionSave({ ...submitted, transitionMinutes: undefined })).not.toHaveProperty("transitionMinutes");
    });
```

Run: `bun run test __tests__/apps/planner/local-store.sessions.test.ts __tests__/apps/planner/editor-screens.test.tsx`
Expected: FAIL. The store drops block rows and the gap, and the editor screen still sends drill rows only.

- [ ] **Step 2: Extend the records and the store types**

In `apps/planner/src/store/records.ts`, import `SessionRowKind` with the other types and replace `StoredSessionRow`, then add the gap to `StoredSession`:

```ts
/** One row in a session. `id` is the editor's clientKey, so card keys survive reloads. */
export interface StoredSessionRow {
    id: string;
    /** The session's own drill copy; null for a block row (warm-up, break, transition, cool-down). */
    playId: string | null;
    sequence: number;
    duration: number;
    instructions: string;
    runsWithPrevious: boolean;
    /** Practice timing. Absent on rows stored before it: read through toRowKind (a drill that doesn't rotate). */
    kind?: SessionRowKind;
    /** A block row's label; null or absent = the kind's default. */
    label?: string | null;
    stays?: boolean;
    rotateEveryMinutes?: number | null;
}
```

```ts
    /** Minutes between blocks (0–5). Absent on sessions stored before practice timing: 0. */
    transitionMinutes?: number;
```

In `apps/planner/src/store/types.ts`, import `type SessionRowInput` from `@/lib/utils/session-rows` and:

```ts
/** One row in a session save: the editor's card, as toSessionRowInputs maps it (hosted sends the same). */
export type LocalSessionDrill = SessionRowInput;
```

and in `LocalSessionSave`, after `goaliesAttending`:

```ts
    /** Minutes between blocks. Absent = unchanged on update (0 on create). */
    transitionMinutes?: number;
```

- [ ] **Step 3: Store, read and copy block rows in `apps/planner/src/store/sessions.ts`**

Imports:

```ts
import type { PracticeSessionView, SessionItem, SessionRow } from "@/types/practice-planner";
import { MAX_BLOCK_LABEL_LENGTH } from "@/types/practice-planner";
import { normalizeGroups, sessionRowsError, sessionWallMinutes } from "@/lib/utils/session-timeline";
import {
    BLOCK_HAS_NO_DRILL_MESSAGE,
    BLOCK_LABEL_MESSAGE,
    CONTROL_CHARS,
    DRILL_NEEDS_PLAY_MESSAGE,
    ROTATE_MINUTES_MESSAGE,
    TRANSITION_MINUTES_MESSAGE,
    isBlockKind,
    isBlockRow,
    toBlockLabel,
    toRotateEveryMinutes,
    toRowKind,
    toTransitionMinutes,
    withStoredTiming,
    type SessionRowInput,
    type StoredTiming,
} from "@/lib/utils/session-rows";
```

(`stationGroupError` and `PlayInSession` are no longer imported.) Delete the module's private `const CONTROL_CHARS = …` (line 34): `sessionMeta` now strips the title with the shared import, which is the same pattern.

Replace `checkDrills` with the shape check, and add the timeline check and the readers:

```ts
/** A save row with its timing resolved: sent, else stored (update), else the default. */
type ResolvedRow = SessionRowInput & { stays: boolean; rotateEveryMinutes: number | null };

/** Checks the payload's shape before the transaction starts. */
function checkRows(plays: LocalSessionDrill[]): void {
    if (new Set(plays.map((p) => p.clientKey)).size !== plays.length) throw new StoreRefusal("Each drill needs a unique key");
    const sequences = plays.map((p) => p.sequence).sort((a, b) => a - b);
    if (sequences.some((sequence, index) => sequence !== index)) {
        throw new StoreRefusal("Drill sequences must run 0, 1, 2… with no gaps or repeats");
    }
    // Hosted's row schema, rule for rule and in its words (practiceSessionPlayInputSchema).
    for (const row of plays) {
        if (isBlockRow(row)) {
            // A payload built outside the editor may still name a play on a block row.
            if ("playId" in row && row.playId != null) throw new StoreRefusal(BLOCK_HAS_NO_DRILL_MESSAGE);
            if ((row.label ?? "").replace(CONTROL_CHARS, "").trim().length > MAX_BLOCK_LABEL_LENGTH) throw new StoreRefusal(BLOCK_LABEL_MESSAGE);
        } else {
            if (!row.playId) throw new StoreRefusal(DRILL_NEEDS_PLAY_MESSAGE);
            if (row.rotateEveryMinutes != null && toRotateEveryMinutes(row.rotateEveryMinutes) === null) {
                throw new StoreRefusal(ROTATE_MINUTES_MESSAGE);
            }
        }
    }
}

/** Hosted's rules on the resolved rows (updatePracticeSession): station, block and rotation rules, then the wall time with the gap. */
function checkTimeline(rows: ResolvedRow[], duration: number, transitionMinutes: number): void {
    const timeline = rows.map((row) => ({ ...row, runsWithPrevious: isBlockRow(row) ? false : row.runsWithPrevious }));
    const ruleError = sessionRowsError(timeline);
    if (ruleError) throw new StoreRefusal(ruleError);
    const wall = sessionWallMinutes(timeline, transitionMinutes);
    if (wall > duration) throw new StoreRefusal(`Practice timeline (${wall} min) exceeds session duration (${duration} min)`);
}

/** Hosted's rule: 0–5 whole minutes; undefined passes through, meaning unchanged. */
function checkedTransition(value: number | undefined): number | undefined {
    if (value === undefined) return undefined;
    if (toTransitionMinutes(value) !== value) throw new StoreRefusal(TRANSITION_MINUTES_MESSAGE);
    return value;
}

/** A stored session's drill timing, for withStoredTiming (absent = unchanged). */
function storedTiming(session: StoredSession): StoredTiming[] {
    return session.rows.map((row) => ({ playId: row.playId, stays: row.stays ?? false, rotateEveryMinutes: row.rotateEveryMinutes ?? null }));
}
```

Seam S4: `assertExportable` gains the gap in its `meta` type (`transitionMinutes?: number`, unused until the plan document carries it) and serializes drill rows only:

```ts
            // The plan document has no block entries yet, so the export check covers the drill rows.
            drills: rows.filter((row) => !isBlockKind(row.kind)).map((row) => {
                const play = row.playId ? plays.get(row.playId) : undefined;
```

(the rest of that mapping is unchanged). `checkTimeline` already enforces the rules and the wall time, blocks and gap included.

`materialize` takes resolved rows and writes block rows as they are:

```ts
async function materialize(tx: RepoTx, ctx: StoreContext, sessionId: string, items: ResolvedRow[], at: Date) {
    const kept = new Set<string>();
    const plays = new Map<string, StoredPlay>();
    const rows: StoredSessionRow[] = [];
    const mapping: SavedDrillId[] = [];
    for (const item of items) {
        if (isBlockRow(item)) {
            rows.push({
                id: item.clientKey,
                playId: null,
                kind: item.kind,
                label: toBlockLabel(item.label),
                sequence: item.sequence,
                duration: item.duration,
                instructions: item.instructions,
                runsWithPrevious: false,
                stays: false,
                rotateEveryMinutes: null,
            });
            continue;
        }
        const play = await tx.getPlay(item.playId);
```

and the drill row it pushes gains the timing:

```ts
        rows.push({
            id: item.clientKey,
            playId: owned.id,
            kind: "drill",
            label: null,
            sequence: item.sequence,
            duration: item.duration,
            instructions: item.instructions,
            runsWithPrevious: item.runsWithPrevious,
            stays: item.stays,
            rotateEveryMinutes: item.rotateEveryMinutes,
        });
```

`listSessions` counts drills only: `drillCount: s.rows.filter((row) => !isBlockKind(row.kind)).length`.

`getSessionView`: add `transitionMinutes: session.transitionMinutes ?? 0,` after `goaliesAttending`, and replace the `plays:` mapping:

```ts
                    plays: sortedRows(session).flatMap((row): SessionRow[] => {
                        const kind = toRowKind(row.kind);
                        if (isBlockKind(kind)) {
                            return [{ id: row.id, kind, label: row.label ?? null, sequence: row.sequence, duration: row.duration, instructions: row.instructions || null, runsWithPrevious: false }];
                        }
                        const play = row.playId ? plays.get(row.playId) : undefined;
                        if (!play) return [];
                        const parsed = parseStoredPlayData(play.playData);
                        if (!parsed.ok) console.error(`Unreadable playData (play ${play.id}):`, parsed.error);
                        return [
                            {
                                id: row.id,
                                sequence: row.sequence,
                                duration: row.duration,
                                instructions: row.instructions || null,
                                runsWithPrevious: row.runsWithPrevious,
                                // Legacy rows read as not rotating (spec R7).
                                stays: row.stays ?? false,
                                rotateEveryMinutes: row.rotateEveryMinutes ?? null,
                                play: {
                                    id: play.id,
                                    name: play.name,
                                    description: play.description,
                                    thumbnail: play.thumbnail,
                                    ...drillTags(play),
                                    playData: parsed.ok ? parsed.data : null,
                                },
                            },
                        ];
                    }),
```

`getSessionForEdit`: `const editorPlays: SessionItem[] = sortedRows(session).flatMap((row): SessionItem[] => { … })` with the same block branch (`label: row.label ?? ""`, `instructions: row.instructions`), the drill branch gaining `stays: row.stays ?? false, rotateEveryMinutes: row.rotateEveryMinutes ?? null,` and looking the play up with `row.playId ? plays.get(row.playId) : undefined`; and `transitionMinutes: session.transitionMinutes ?? 0,` in `initialData`.

`createSession`:

```ts
            attempt("Failed to create practice session. Please try again.", async () => {
                const meta = sessionMeta(input);
                checkRows(input.plays);
                const goaliesAttending = checkedGoalieCount(input.goaliesAttending) ?? null;
                const transitionMinutes = checkedTransition(input.transitionMinutes) ?? 0;
                // A create has nothing stored: absent timing takes the defaults.
                const resolved = withStoredTiming(input.plays, []);
                checkTimeline(resolved, meta.duration, transitionMinutes);
                const saved = await write(ctx, async (tx) => {
                    const at = ctx.now();
                    const id = ctx.newId();
                    const { rows, plays, mapping } = await materialize(tx, ctx, id, resolved, at);
                    assertExportable({ ...meta, goaliesAttending, transitionMinutes }, rows, plays, at);
                    await tx.putSession({ id, ...meta, goaliesAttending, transitionMinutes, rows, createdAt: at, updatedAt: at });
                    return { id, plays: mapping };
                });
                return ok(saved);
            }),
```

`updateSession`:

```ts
            attempt("Failed to update practice session. Please try again.", async () => {
                const meta = sessionMeta(input);
                checkRows(input.plays);
                const count = checkedGoalieCount(input.goaliesAttending);
                const sentGap = checkedTransition(input.transitionMinutes);
                const saved = await write(ctx, async (tx) => {
                    const existing = await tx.getSession(id);
                    if (!existing) throw new StoreRefusal(SESSION_NOT_FOUND);
                    // Absent = unchanged: an editor opened before a field existed autosaves without it.
                    const goaliesAttending = count === undefined ? (existing.goaliesAttending ?? null) : count;
                    const transitionMinutes = sentGap ?? existing.transitionMinutes ?? 0;
                    const resolved = withStoredTiming(input.plays, storedTiming(existing));
                    checkTimeline(resolved, meta.duration, transitionMinutes);
                    const at = ctx.now();
                    const { rows, plays, mapping } = await materialize(tx, ctx, id, resolved, at);
                    assertExportable({ ...meta, goaliesAttending, transitionMinutes }, rows, plays, at);
                    await tx.putSession({ ...existing, ...meta, goaliesAttending, transitionMinutes, rows, updatedAt: at });
                    // Drop-only cleanup: copies this session referenced before and no longer does.
                    // A copy the drill dialog made but the editor hasn't sent is never touched here.
                    const referenced = new Set(rows.flatMap((row) => (row.playId ? [row.playId] : [])));
                    for (const playId of new Set(existing.rows.flatMap((row) => (row.playId ? [row.playId] : [])))) {
                        if (referenced.has(playId)) continue;
                        const play = await tx.getPlay(playId);
                        if (play?.sessionId === id) await tx.deletePlay(playId);
                    }
                    return { id, plays: mapping };
                });
                return ok(saved);
            }),
```

`duplicatePracticeSession`: a block row is copied as it is; only drill rows are cloned; the gap is copied:

```ts
                    for (const row of sortedRows(source)) {
                        if (!row.playId) {
                            // A block row has no drill to clone.
                            rows.push({ ...row, id: ctx.newId() });
                            continue;
                        }
                        const play = await tx.getPlay(row.playId);
```

(the rest of the loop is unchanged), and

```ts
                    const meta = {
                        title: duplicateSessionTitle(source.title),
                        date,
                        duration: source.duration,
                        goaliesAttending: source.goaliesAttending ?? null,
                        transitionMinutes: source.transitionMinutes ?? 0,
                    };
```

`importPlan` is unchanged here: the plan document carries no block entries until Task 5. Its pushed rows add `kind: "drill", label: null, stays: false, rotateEveryMinutes: null`.

- [ ] **Step 4: Send block rows from the static editor (remove seam S2)**

In `apps/planner/src/screens/SessionEditorScreen.tsx`, import `toSessionRowInputs` (drop `drillRows`/`toDrillRowInput`) and in `toLocalSessionSave`:

```ts
        plays: toSessionRowInputs(session.plays),
        // Absent = unchanged (as EditSessionWrapper): an editor that never loaded or set the gap sends none.
        ...(session.transitionMinutes !== undefined && { transitionMinutes: session.transitionMinutes }),
```

In `__tests__/apps/planner/import-screen.test.tsx`, the update Task 2 narrowed now sends every row, so a template's block rows (Task 10 adds a cool-down) round-trip as blocks: change the import to `import { drillRows, toSessionRowInputs } from "@/lib/utils/session-rows";` and the payload to

```ts
            plays: toSessionRowInputs(initialData.plays).map((row) => ({ ...row, instructions: "Changed" })),
```

- [ ] **Step 5: Run the tests to verify they pass**

Run the Step 1 command again. Expected: PASS.
Run: `bun run test && bun run type-check && bun run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add apps/planner/src/store/records.ts apps/planner/src/store/types.ts apps/planner/src/store/sessions.ts \
  apps/planner/src/screens/SessionEditorScreen.tsx \
  __tests__/apps/planner/local-store.sessions.test.ts __tests__/apps/planner/editor-screens.test.tsx \
  __tests__/apps/planner/import-screen.test.tsx
/usr/bin/git commit -m "feat(planner): store block rows, rotation and the gap in the static planner" -m "Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 5: Plan document, imports and export

The plan document carries block rows, rotation, stays and the gap (spec R6) without a version bump. Both importers write them, the Export menu writes them (seam S3 goes), the static store's export check covers them (seam S4 goes), the import preview shows block rows, and ADR-0020 gets its amendment.

**Files:**
- Modify: `lib/plan-document/document.ts` (imports, entry schemas, `planSessionSchema`, types, `PlanSessionInput`, `serializePlan`, `PlanEditorDrill`/`PlanEditorBlock`/`PlanEditorSession`, `planToEditorSession`)
- Modify: `lib/actions/practice-plan-import.ts`
- Modify: `apps/planner/src/store/sessions.ts` (`importPlan`, `assertExportable`)
- Modify: `components/features/practice-planner/ExportPlanMenu.tsx` (new `toPlanRows`, `buildPlanDocument`)
- Modify: `components/features/practice-planner/PlanPreview.tsx`
- Modify: `docs/adr/0020-exchange-practice-plans-as-a-portable-versioned-document-and-ship-a-static-local.md`
- Test (append or modify): `__tests__/lib/plan-document/document.test.ts` (new tests, plus narrowing lines 118, 125, 138, 157, 179–180, 185, 199, 290, 338, 356, 369), `__tests__/lib/actions/practice-plan-import.test.ts` (new tests, plus the exact `create` and row shapes at lines 128–139 and 162–164), `__tests__/apps/planner/local-store.sessions.test.ts` (new test, plus line 312), `__tests__/components/features/practice-planner/ExportPlanMenu.test.tsx` (new test, plus lines 80, 319, 320), `__tests__/components/features/practice-planner/PlanImportView.test.tsx` (new test, plus `within` in its import), `__tests__/lib/data/starter-templates.test.ts` (narrowing only), `__tests__/components/features/practice-planner/StarterTemplatePicker.test.tsx` (narrowing lines 49–53)

**Interfaces:**
- Consumes (Task 1): `isBlockKind`, `isBlockRow`, `toBlockLabel`, `toRotateEveryMinutes`, `toTransitionMinutes`, `CONTROL_CHARS`, `blockTitle`, `drillRows`, `normalizeGroups`, `settleRotations`, `sessionRowsError`, `sessionWallMinutes(rows, transitionMinutes)`, `groupStations(rows, transitionMinutes)`. (Task 2): `ExportSessionRow`, `BLOCK_ICONS`.
- Produces:
  - `ROW_KIND_MESSAGE`; `PlanEntry = PlanDrill | PlanBlock` (`PlanDrill` is now the drill entry: `kind: "drill"`, `stays: boolean`, `rotateEveryMinutes: number | null`, `drill`; `PlanBlock`: `kind: BlockKind`, `sequence`, `durationMinutes`, `instructions`, `label: string | null`); `PlanDocument["session"].transitionMinutes: number`;
  - `PlanDrillInput` (with optional `kind?: "drill"`, `stays?`, `rotateEveryMinutes?`), `PlanBlockInput { kind: BlockKind; sequence; duration; runsWithPrevious: false; instructions: string | null; label: string | null }`, `PlanSessionInput.transitionMinutes?: number` and `drills: Array<PlanDrillInput | PlanBlockInput>`;
  - `PlanEditorDrill` gains `kind: "drill"`, `stays`, `rotateEveryMinutes`; `PlanEditorBlock { key; kind: BlockKind; sequence; duration; runsWithPrevious: false; instructions: string; label: string | null }`; `PlanEditorSession.transitionMinutes: number`, `plays: Array<PlanEditorDrill | PlanEditorBlock>`;
  - `toPlanRows(rows: readonly ExportSessionRow[]): PlanSessionInput["drills"]` (ExportPlanMenu).

- [ ] **Step 1: Write the failing plan-document tests**

Append to `__tests__/lib/plan-document/document.test.ts` (add `ROW_KIND_MESSAGE` to its `@/lib/plan-document` import and `import { BLOCK_STATION_ERROR, ROTATION_PLACEMENT_ERROR } from "@/lib/utils/session-timeline";`):

```ts
describe("practice timing fields (additive, version 1)", () => {
    function timingInput(extra: Partial<PlanSessionInput> = {}): PlanSessionInput {
        return {
            title: "Timed practice",
            durationMinutes: 60,
            date: null,
            startTime: null,
            transitionMinutes: 2,
            drills: [
                { kind: "warmup", sequence: 0, duration: 8, instructions: "Laps", label: null, runsWithPrevious: false },
                { sequence: 1, duration: 5, runsWithPrevious: false, instructions: null, name: "Goalie", description: null, playData: null, stays: true, rotateEveryMinutes: 5 },
                { sequence: 2, duration: 5, runsWithPrevious: true, instructions: null, name: "Skate A", description: null, playData: null },
                { sequence: 3, duration: 5, runsWithPrevious: true, instructions: null, name: "Skate B", description: null, playData: null },
                { kind: "cooldown", sequence: 4, duration: 5, instructions: null, label: "Stretch", runsWithPrevious: false },
            ],
            ...extra,
        };
    }
    const raw = (extra: Partial<PlanSessionInput> = {}) => JSON.parse(JSON.stringify(serializePlan(timingInput(extra), "openleague-static", NOW)));

    it("writes block entries without drill fields, drill entries with their timing, and the gap", () => {
        const doc = serializePlan(timingInput(), "openleague-static", NOW);
        expect(doc.session.transitionMinutes).toBe(2);
        expect(doc.session.drills[0]).toEqual({ kind: "warmup", sequence: 0, durationMinutes: 8, instructions: "Laps", label: null });
        expect(doc.session.drills[4]).toEqual({ kind: "cooldown", sequence: 4, durationMinutes: 5, instructions: "", label: "Stretch" });
        // The rotation's minutes are written as the editor would: a stays station lasts the block.
        expect(doc.session.drills[1]).toMatchObject({ kind: "drill", stays: true, rotateEveryMinutes: 5, durationMinutes: 10 });
        expect(doc.session.drills[2]).toMatchObject({ kind: "drill", stays: false, rotateEveryMinutes: null, runsWithPrevious: true, durationMinutes: 5 });
    });

    it("round-trips through parsePlan", () => {
        const doc = serializePlan(timingInput(), "openleague-hosted", NOW);
        expect(parsePlan(JSON.parse(JSON.stringify(doc)))).toEqual({ ok: true, plan: doc });
    });

    it("reads a file written before practice timing as drills with no gap", () => {
        const old = JSON.parse(JSON.stringify(serializePlan(
            { title: "Old", durationMinutes: 30, date: null, startTime: null, drills: [{ sequence: 0, duration: 10, runsWithPrevious: false, instructions: null, name: "A", description: null, playData: null }] },
            "openleague-static",
            NOW,
        )));
        delete old.session.transitionMinutes;
        for (const entry of old.session.drills) {
            delete entry.kind;
            delete entry.stays;
            delete entry.rotateEveryMinutes;
        }
        const result = parsePlan(old);
        expect(result.ok && result.plan.session.transitionMinutes).toBe(0);
        expect(result.ok && result.plan.session.drills[0]).toMatchObject({ kind: "drill", stays: false, rotateEveryMinutes: null });
    });

    it("rejects an unknown row kind with a readable issue, never reading it as a drill", () => {
        const file = raw();
        file.session.drills[0].kind = "stretch";
        const result = parsePlan(file);
        expect(result.ok).toBe(false);
        expect(!result.ok && result.error.issues?.[0]).toBe(`Drill 1: ${ROW_KIND_MESSAGE}`);
    });

    it("rejects the row rules the hosted save rejects", () => {
        const misplaced = raw();
        misplaced.session.drills[2].rotateEveryMinutes = 5;
        const result = parsePlan(misplaced);
        expect(!result.ok && result.error.issues).toContain(ROTATION_PLACEMENT_ERROR);
        const afterBlock = raw();
        afterBlock.session.drills[1].runsWithPrevious = true;
        const blocked = parsePlan(afterBlock);
        expect(!blocked.ok && blocked.error.issues).toContain(BLOCK_STATION_ERROR);
    });

    it("counts blocks and gaps toward the session length, and blocks toward the row limit", () => {
        // 8 + 2 + 10 + 2 + 5 = 27
        const tight = raw();
        tight.session.durationMinutes = 26;
        const result = parsePlan(tight);
        expect(!result.ok && result.error.issues).toContain("Practice timeline (27 min) exceeds session duration (26 min)");
        const many = serializePlan(
            { title: "Breaks", durationMinutes: 300, date: null, startTime: null, drills: Array.from({ length: 51 }, (_, sequence) => ({ kind: "break" as const, sequence, duration: 1, instructions: null, label: null, runsWithPrevious: false as const })) },
            "openleague-static",
            NOW,
        );
        const tooMany = parsePlan(JSON.parse(JSON.stringify(many)));
        expect(!tooMany.ok && tooMany.error.issues?.[0]).toMatch(/at most 50/);
    });

    it("reads the new fields leniently and strips drill fields from a block entry", () => {
        const file = raw();
        file.session.transitionMinutes = 9;
        file.session.drills[0].label = "x".repeat(80);
        file.session.drills[0].drill = { name: "Sneaky", description: "", playData: {} };
        file.session.drills[1].stays = "yes";
        const result = parsePlan(file);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.plan.session.transitionMinutes).toBe(0);
        expect(result.plan.session.drills[0]).not.toHaveProperty("drill");
        expect(result.plan.session.drills[0]).toMatchObject({ label: "x".repeat(60) });
        expect(result.plan.session.drills[1]).toMatchObject({ stays: false });
    });

    it("maps block rows and the gap into the import preview's session", () => {
        const editor = planToEditorSession(serializePlan(timingInput(), "openleague-static", NOW));
        expect(editor.transitionMinutes).toBe(2);
        expect(editor.plays[0]).toEqual({ key: "plan-row-0", kind: "warmup", sequence: 0, duration: 8, runsWithPrevious: false, instructions: "Laps", label: null });
        expect(editor.plays[1]).toMatchObject({ key: "plan-row-1", kind: "drill", stays: true, rotateEveryMinutes: 5, name: "Goalie" });
    });
});
```

In the same file, update the existing test `carries no ids, thumbnails or other extra fields`: the session gains `transitionMinutes`, and a drill entry gains `kind`, `rotateEveryMinutes` and `stays`:

```ts
        expect(Object.keys(doc.session).sort()).toEqual(["date", "drills", "durationMinutes", "goaliesAttending", "startTime", "title", "transitionMinutes"]);
        expect(Object.keys(doc.session.drills[0]).sort()).toEqual(["drill", "durationMinutes", "instructions", "kind", "rotateEveryMinutes", "runsWithPrevious", "sequence", "stays"]);
```

`PlanEntry` and the editor rows become unions, so the existing typed reads of drill fields narrow with `drillRows` (it accepts any rows with a `kind`; add `import { drillRows } from "@/lib/utils/session-rows";`). The `RawDoc` mutations (`raw.session.drills[0].drill.focus = …`) are untyped and need nothing. Exactly:
- line 118: `expect(drillRows(doc.session.drills).map((d) => [d.sequence, d.drill.name, d.runsWithPrevious])).toEqual([`
- line 125: `const regroup = drillRows(serializePlan(input(), "openleague-hosted", NOW).session.drills)[2];`
- line 138: `expect(Object.keys(drillRows(doc.session.drills)[0].drill).sort()).toEqual(["description", "focus", "goalies", "name", "playData"]);`
- line 157: `const board = drillRows(result.plan.session.drills)[0].drill.playData;`
- lines 179–180: `expect(drillRows(result.plan.session.drills)[0].drill).not.toHaveProperty("thumbnail");` and the same for `"id"`;
- line 185: `expect(result.ok && drillRows(result.plan.session.drills).map((d) => d.drill.name)).toEqual(["Warmup Laps", "Breakout", "Regroup"]);`
- line 199: `expect([result.plan.session.drills[0].instructions, drillRows(result.plan.session.drills)[0].drill.description]).toEqual(["", ""]);`
- line 290: `expect(groups.map((g) => drillRows(g.stations).map((p) => p.name))).toEqual([["Warmup Laps"], ["Breakout", "Regroup"]]);`
- line 338: `expect(drillRows(doc.session.drills).map((d) => [d.drill.focus, d.drill.goalies])).toEqual([["goalies", "required"], ["team", "optional"]]);`
- line 356: `expect(result.ok && drillRows(result.plan.session.drills).map((d) => [d.drill.focus, d.drill.goalies])).toEqual([`
- line 369: `expect(result.ok && [result.plan.session.goaliesAttending, drillRows(result.plan.session.drills)[0].drill.focus, drillRows(result.plan.session.drills)[0].drill.goalies])`

No existing test indexes a `plan-drill-` key (the rows' keys become `plan-row-N`).

Append to `__tests__/lib/actions/practice-plan-import.test.ts`:

```ts
describe("importPracticePlan: block rows, rotation and the gap", () => {
    const TIMED = () => doc({
        transitionMinutes: 2,
        drills: [
            { kind: "warmup", sequence: 0, duration: 8, instructions: "Laps", label: null, runsWithPrevious: false },
            { sequence: 1, duration: 5, runsWithPrevious: false, instructions: "", name: "Breakout", description: "", playData: BOARD, rotateEveryMinutes: 5 },
            { sequence: 2, duration: 5, runsWithPrevious: true, instructions: "", name: "Regroup", description: "", playData: BOARD },
            { kind: "break", sequence: 3, duration: 2, instructions: null, label: "Water", runsWithPrevious: false },
            { sequence: 4, duration: 10, runsWithPrevious: false, instructions: "", name: "Shooting", description: "", playData: BOARD },
        ],
    });

    it("writes block rows with no play, each drill row on its own copy, and the gap", async () => {
        const result = await call({ document: TIMED() });
        expect(result).toEqual({ success: true, data: { sessionId: SESSION } });
        expect(models.practiceSession.create.mock.calls[0][0].data.transitionMinutes).toBe(2);
        expect(models.play.createMany.mock.calls[0][0].data.map((d: { name: string }) => d.name)).toEqual(["Breakout", "Regroup", "Shooting"]);
        const rows = models.practiceSessionPlay.createMany.mock.calls[0][0].data;
        expect(rows.map((row: { kind: string; playId: string | null }) => [row.kind, row.playId])).toEqual([
            ["warmup", null],
            ["drill", "cowned0xxxxxxxxxxxxxxxxxx"],
            ["drill", "cowned1xxxxxxxxxxxxxxxxxx"],
            ["break", null],
            ["drill", "cowned2xxxxxxxxxxxxxxxxxx"],
        ]);
        expect(rows[1]).toMatchObject({ rotateEveryMinutes: 5, stays: false });
        expect(rows[3]).toMatchObject({ label: "Water", runsWithPrevious: false });
    });

    it("copies only drills into the library", async () => {
        await call({ document: TIMED(), addToLibrary: true });
        expect(models.play.createMany.mock.calls[1][0].data.map((d: { name: string; isTemplate: boolean }) => [d.name, d.isTemplate])).toEqual([
            ["Breakout", true],
            ["Regroup", true],
            ["Shooting", true],
        ]);
    });
});
```

In the same file, the existing "creates the session, its owned drills and the ordered rows in one transaction" test pins two exact shapes the importer now extends:
- the `practiceSession.create` data (lines 128–139) gains `transitionMinutes: 0,` after `goaliesAttending: null,` (a plan without a gap reads as 0, and the importer writes it);
- each of the three written rows (lines 162–164) gains `kind: "drill", label: null, stays: false, rotateEveryMinutes: null`, for example `{ sessionId: SESSION, playId: "cowned0xxxxxxxxxxxxxxxxxx", kind: "drill", label: null, sequence: 0, duration: 10, instructions: "Two laps", runsWithPrevious: false, stays: false, rotateEveryMinutes: null },`.

Append to `__tests__/apps/planner/local-store.sessions.test.ts`, inside `describe.each(REPOS)`:

```ts
    it("imports a plan's block rows, rotation and gap, and exports them back", async () => {
        const { store } = await setup();
        const document = serializePlan(
            {
                title: "Timed", durationMinutes: 60, date: null, startTime: null, transitionMinutes: 1,
                drills: [
                    { kind: "warmup", sequence: 0, duration: 8, instructions: "Laps", label: null, runsWithPrevious: false },
                    { sequence: 1, duration: 5, runsWithPrevious: false, instructions: "", name: "A", description: "", playData: createEmptyPlayData(), rotateEveryMinutes: 5 },
                    { sequence: 2, duration: 5, runsWithPrevious: true, instructions: "", name: "B", description: "", playData: createEmptyPlayData() },
                ],
            },
            "openleague-static",
        );
        const { sessionId } = data(await store.importPlan(document, { date: new Date("2026-10-06T19:00:00"), addToLibrary: false }));
        const view = data(await store.getSessionView(sessionId));
        expect(view.transitionMinutes).toBe(1);
        expect(view.plays.map((row) => row.kind ?? "drill")).toEqual(["warmup", "drill", "drill"]);
        const exported = buildPlanDocument(view, new Date(), "openleague-static");
        expect(exported.session.transitionMinutes).toBe(1);
        expect(exported.session.drills.map((entry) => entry.kind)).toEqual(["warmup", "drill", "drill"]);
        expect(exported.session.drills[1]).toMatchObject({ rotateEveryMinutes: 5 });
    });

```

Append to `__tests__/components/features/practice-planner/ExportPlanMenu.test.tsx`:

```ts
describe("buildPlanDocument: block rows, rotation and the gap", () => {
    it("writes every row in order, each drill's timing, and the gap", () => {
        const session: ExportableSession = {
            ...SESSION,
            transitionMinutes: 2,
            plays: [
                { kind: "warmup", sequence: 0, duration: 8, instructions: "Laps", runsWithPrevious: false, label: null },
                { ...sessionPlay("A", 1), rotateEveryMinutes: 5, stays: false },
                { ...sessionPlay("B", 2), runsWithPrevious: true, stays: false, rotateEveryMinutes: null },
            ],
        };
        const doc = buildPlanDocument(session, NOW);
        expect(doc.session.transitionMinutes).toBe(2);
        expect(doc.session.drills.map((entry) => entry.kind)).toEqual(["warmup", "drill", "drill"]);
        expect(doc.session.drills[0]).toEqual({ kind: "warmup", sequence: 0, durationMinutes: 8, instructions: "Laps", label: null });
        expect(doc.session.drills[1]).toMatchObject({ rotateEveryMinutes: 5, stays: false });
    });
});
```

(`sessionPlay(name, sequence)` is the file's existing drill-row helper; if its signature differs, build the two drill rows the way the file's other `buildPlanDocument` tests do.)

Append to `__tests__/components/features/practice-planner/PlanImportView.test.tsx`:

```tsx
describe("PlanImportView: block rows in the preview", () => {
    it("lists block rows by label and minutes, with no diagram, and counts the gap in the planned minutes", async () => {
        const timed = serializePlan(
            {
                title: "Timed", durationMinutes: 60, date: "2026-10-06", startTime: "19:00", transitionMinutes: 2,
                drills: [
                    { kind: "warmup", sequence: 0, duration: 8, instructions: "Laps", label: null, runsWithPrevious: false },
                    { sequence: 1, duration: 10, runsWithPrevious: false, instructions: "", name: "Breakout", description: "", playData: createEmptyPlayData() },
                ],
            },
            "openleague-static",
        );
        render(<PlanImportView teams={[LIONS]} />);
        upload(JSON.stringify(timed));
        const list = await screen.findByRole("list", { name: "Drills in this plan" });
        expect(within(list).getByText("Warm-up")).toBeInTheDocument();
        expect(within(list).getByText("8 min · Laps")).toBeInTheDocument();
        expect(within(list).queryByRole("img", { name: /Warm-up/ })).toBeNull();
        expect(screen.getByText(/Planned 20 of 60 min/)).toBeInTheDocument();
    });
});
```

(`render`, `upload`, `LIONS`, `serializePlan` and `createEmptyPlayData` are the file's own. It does not import `within` yet: add it to its `@testing-library/react` import, which becomes `import { fireEvent, screen, waitFor, within } from "@testing-library/react";`.)

The existing readers of a plan's drill entries narrow with `drillRows` (each file adds `import { drillRows } from "@/lib/utils/session-rows";`, or merges it into the session-rows import it already has):
- `__tests__/components/features/practice-planner/ExportPlanMenu.test.tsx`: line 80 `expect(drillRows(doc.session.drills)[0].drill.playData).toEqual(createEmptyPlayData());`, line 319 `expect(drillRows(doc.session.drills)[0].drill).toMatchObject({ focus: "goalies", goalies: "optional" });`, line 320 `expect(drillRows(doc.session.drills)[0].drill.playData.players.map((p) => p.role)).toEqual(["G"]);`;
- `__tests__/apps/planner/local-store.sessions.test.ts` line 312: `expect(drillRows(exported.session.drills)[0].drill).toMatchObject({ focus: "goalies", goalies: "required" });`;
- `__tests__/components/features/practice-planner/StarterTemplatePicker.test.tsx` ("never shares a diagram…", line 49): `for (const drill of drillRows(result.plan.session.drills)) {` (it would also throw at runtime once Task 10's templates carry a cool-down, which has no `drill`).

`PlanSessionInput["drills"]` becomes a union of drill and block rows, so `__tests__/lib/data/starter-templates.test.ts` must narrow before reading drill fields (its behaviour is unchanged; Task 10 rewrites its timing checks). Add `import { drillRows } from "@/lib/utils/session-rows";` and:
- in "has station blocks of 2–4 drills…": `expect(drillRows(block.stations).some((station) => station.goalies === "required")).toBe(true);`
- in "puts stations on ice that doesn't overlap": `const withAreas = drills.map((d) => ({ ...d, area: isDrillRow(d) ? d.playData?.area : null }));` (import `isDrillRow` too);
- in the three per-drill loops ("never sends skaters…", "gives each drill the time…", "uses starter drills verbatim"): `for (const drill of drillRows(drills))`.

Run: `bun run test __tests__/lib/plan-document __tests__/lib/actions/practice-plan-import.test.ts __tests__/apps/planner/local-store.sessions.test.ts __tests__/components/features/practice-planner/ExportPlanMenu.test.tsx __tests__/components/features/practice-planner/PlanImportView.test.tsx`
Expected: FAIL. The document has no row kinds, timing or gap.

- [ ] **Step 2: Add the fields to `lib/plan-document/document.ts`**

Imports:

```ts
import { BLOCK_KINDS, PLAY_FOCUS, PLAY_GOALIES, type BlockKind, type PlayData, type PlayFocus, type PlayGoalies } from "@/types/practice-planner";
import { drillTags, toGoaliesAttending, toPlayFocus, toPlayGoalies } from "@/lib/utils/drill-tags";
import { createEmptyPlayData, parseStoredPlayData } from "@/lib/utils/play-data";
import { CONTROL_CHARS, isBlockRow, toBlockLabel, toRotateEveryMinutes, toTransitionMinutes } from "@/lib/utils/session-rows";
import { normalizeGroups, sessionRowsError, sessionWallMinutes, settleRotations } from "@/lib/utils/session-timeline";
```

and delete the module's private `const CONTROL_CHARS = …` (line 45); `clean` keeps using the name, now the shared import (the same pattern).

After `NEWER_VERSION_MESSAGE` / `INVALID_PLAN_MESSAGE`:

```ts
export const ROW_KIND_MESSAGE = "Row kind must be drill, warmup, break, transition or cooldown";
```

After `goaliesAttendingSchema`, add the lenient readers (spec R6):

```ts
// Practice timing (spec R6): read leniently like the goalie fields, so a stray
// value never makes a plan unreadable. A rotation on the wrong row is still a
// rule violation (superRefine below), not a value problem.
const staysSchema = z.preprocess((value) => value === true, z.boolean());
const rotateEveryMinutesSchema = z.preprocess(toRotateEveryMinutes, z.number().int().nullable());
const blockLabelSchema = z.preprocess(toBlockLabel, z.string().nullable());
const transitionMinutesSchema = z.preprocess(toTransitionMinutes, z.number().int());
```

Replace `planDrillSchema` with the two entry schemas and the entry union:

```ts
const sequenceSchema = z.number({ message: "Sequence must be a number" }).int("Sequence must be a whole number").min(0, "Sequence can't be negative");

const planDrillSchema = z.object({
    kind: z.literal("drill"),
    sequence: sequenceSchema,
    durationMinutes: minutes("Drill length"),
    runsWithPrevious: z.boolean({ message: "runsWithPrevious must be true or false" }).nullish().transform((value) => value ?? false),
    instructions: optionalText(MAX_INSTRUCTIONS_LENGTH, "Instructions"),
    stays: staysSchema,
    rotateEveryMinutes: rotateEveryMinutesSchema,
    drill: z.object({
        name: requiredText(MAX_DRILL_NAME_LENGTH, "Drill name"),
        description: optionalText(MAX_DRILL_DESCRIPTION_LENGTH, "Description"),
        focus: focusSchema,
        goalies: goaliesSchema,
        playData: diagramSchema,
    }),
});

/** A warm-up, break, transition or cool-down: no drill, no diagram, no tags (unknown keys are stripped). */
const planBlockSchema = z.object({
    kind: z.enum(BLOCK_KINDS),
    sequence: sequenceSchema,
    durationMinutes: minutes("Block length"),
    instructions: optionalText(MAX_INSTRUCTIONS_LENGTH, "Note"),
    label: blockLabelSchema,
});

/** A row without a kind is a drill: every file written before practice timing. */
function withDefaultKind(raw: unknown): unknown {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
    const kind = (raw as { kind?: unknown }).kind;
    return kind === undefined || kind === null ? { ...(raw as object), kind: "drill" } : raw;
}

const planEntrySchema = z.preprocess(
    withDefaultKind,
    z.discriminatedUnion("kind", [planDrillSchema, planBlockSchema], { message: ROW_KIND_MESSAGE }),
);
```

In `planSessionSchema`: add `transitionMinutes: transitionMinutesSchema,` after `goaliesAttending`, change `z.array(planDrillSchema)` to `z.array(planEntrySchema)`, and replace the body of `superRefine`:

```ts
    .superRefine((session, ctx) => {
        // The same rules the hosted save enforces (createPracticeSession).
        const timeline = session.drills.map((entry) => ({
            sequence: entry.sequence,
            duration: entry.durationMinutes,
            kind: entry.kind,
            runsWithPrevious: entry.kind === "drill" ? entry.runsWithPrevious : false,
            stays: entry.kind === "drill" ? entry.stays : false,
            rotateEveryMinutes: entry.kind === "drill" ? entry.rotateEveryMinutes : null,
        }));
        const sequences = timeline.map((t) => t.sequence).sort((a, b) => a - b);
        if (sequences.some((sequence, index) => sequence !== index)) {
            ctx.addIssue({ code: "custom", path: ["drills"], message: "Drill sequences must run 0, 1, 2… with no gaps or repeats" });
            return;
        }
        const ruleError = sessionRowsError(timeline);
        if (ruleError) ctx.addIssue({ code: "custom", path: ["drills"], message: ruleError });
        const wall = sessionWallMinutes(timeline, session.transitionMinutes);
        if (wall > session.durationMinutes) {
            ctx.addIssue({
                code: "custom",
                path: ["durationMinutes"],
                message: `Practice timeline (${wall} min) exceeds session duration (${session.durationMinutes} min)`,
            });
        }
    })
```

Replace the type exports:

```ts
export type PlanDocument = z.output<typeof planDocumentSchema>;
/** One row of a plan: a drill or a block. */
export type PlanEntry = PlanDocument["session"]["drills"][number];
export type PlanDrill = Extract<PlanEntry, { kind: "drill" }>;
export type PlanBlock = Extract<PlanEntry, { kind: BlockKind }>;
```

Replace `PlanSessionInput`:

```ts
/** A drill row an exporter supplies. */
export interface PlanDrillInput {
    kind?: "drill";
    sequence: number;
    duration: number;
    runsWithPrevious: boolean;
    instructions: string | null;
    name: string;
    description: string | null;
    /** Absent = the default tag */
    focus?: PlayFocus;
    goalies?: PlayGoalies;
    /** Absent = false / null */
    stays?: boolean;
    rotateEveryMinutes?: number | null;
    /** null = unreadable; exported as an empty board */
    playData: PlayData | null;
}

/** A block row an exporter supplies: no drill fields. */
export interface PlanBlockInput {
    kind: BlockKind;
    sequence: number;
    duration: number;
    /** Always false (spec R3); present so a plan's rows are timeline rows. Never written to the document. */
    runsWithPrevious: false;
    /** The block's note */
    instructions: string | null;
    label: string | null;
}

/** The minimal session view an exporter supplies (hosted detail page, static store). */
export interface PlanSessionInput {
    title: string;
    durationMinutes: number;
    /** YYYY-MM-DD, local calendar date */
    date: string | null;
    /** HH:mm, local wall clock */
    startTime: string | null;
    /** null or absent = not set */
    goaliesAttending?: number | null;
    /** Minutes between blocks; absent = 0 */
    transitionMinutes?: number;
    drills: Array<PlanDrillInput | PlanBlockInput>;
}
```

Replace `serializePlan`:

```ts
/**
 * Builds a document from a session. Picks fields explicitly, so ids and
 * thumbnails on the input never leak. Sorts and renumbers, and applies the
 * editor's row rules (the first row and a row after a block never run with a
 * previous one; a rotation that can't run is dropped), so every export imports.
 */
export function serializePlan(input: PlanSessionInput, generator: PlanGenerator, now: Date = new Date()): PlanDocument {
    const rows = settleRotations(normalizeGroups([...input.drills].sort((a, b) => a.sequence - b.sequence)));
    const drills = rows.map((row, index): PlanEntry => {
        if (isBlockRow(row)) {
            return { kind: row.kind, sequence: index, durationMinutes: row.duration, instructions: row.instructions ?? "", label: toBlockLabel(row.label) };
        }
        return {
            kind: "drill",
            sequence: index,
            durationMinutes: row.duration,
            runsWithPrevious: row.runsWithPrevious,
            instructions: row.instructions ?? "",
            stays: row.stays ?? false,
            rotateEveryMinutes: row.rotateEveryMinutes ?? null,
            drill: {
                name: row.name,
                description: row.description ?? "",
                ...drillTags(row),
                playData: row.playData ?? createEmptyPlayData(),
            },
        };
    });
    return {
        format: PLAN_FORMAT,
        version: PLAN_VERSION,
        exportedAt: now.toISOString(),
        generator,
        session: {
            title: input.title,
            durationMinutes: input.durationMinutes,
            date: input.date,
            startTime: input.startTime,
            goaliesAttending: toGoaliesAttending(input.goaliesAttending),
            transitionMinutes: toTransitionMinutes(input.transitionMinutes),
            drills,
        },
    };
}
```

Replace the editor mapping types and `planToEditorSession`:

```ts
export interface PlanEditorDrill {
    /** Stable per-row key for React lists */
    key: string;
    kind: "drill";
    sequence: number;
    duration: number;
    runsWithPrevious: boolean;
    instructions: string;
    name: string;
    description: string;
    focus: PlayFocus;
    goalies: PlayGoalies;
    stays: boolean;
    rotateEveryMinutes: number | null;
    playData: PlayData;
}

export interface PlanEditorBlock {
    key: string;
    kind: BlockKind;
    sequence: number;
    duration: number;
    runsWithPrevious: false;
    instructions: string;
    label: string | null;
}

export interface PlanEditorSession {
    title: string;
    duration: number;
    date: string | null;
    startTime: string | null;
    goaliesAttending: number | null;
    transitionMinutes: number;
    plays: Array<PlanEditorDrill | PlanEditorBlock>;
}

/** The plan as timeline rows (TimelinePlay-compatible), for the import preview. */
export function planToEditorSession(plan: PlanDocument): PlanEditorSession {
    return {
        title: plan.session.title,
        duration: plan.session.durationMinutes,
        date: plan.session.date,
        startTime: plan.session.startTime,
        goaliesAttending: plan.session.goaliesAttending,
        transitionMinutes: plan.session.transitionMinutes,
        plays: plan.session.drills.map((entry): PlanEditorDrill | PlanEditorBlock =>
            entry.kind === "drill"
                ? {
                      key: `plan-row-${entry.sequence}`,
                      kind: "drill",
                      sequence: entry.sequence,
                      duration: entry.durationMinutes,
                      runsWithPrevious: entry.runsWithPrevious,
                      instructions: entry.instructions,
                      name: entry.drill.name,
                      description: entry.drill.description,
                      focus: entry.drill.focus,
                      goalies: entry.drill.goalies,
                      stays: entry.stays,
                      rotateEveryMinutes: entry.rotateEveryMinutes,
                      playData: entry.drill.playData,
                  }
                : {
                      key: `plan-row-${entry.sequence}`,
                      kind: entry.kind,
                      sequence: entry.sequence,
                      duration: entry.durationMinutes,
                      runsWithPrevious: false,
                      instructions: entry.instructions,
                      label: entry.label,
                  },
        ),
    };
}
```

`lib/plan-document/index.ts` re-exports `document.ts` with `export *`, so the new names (`ROW_KIND_MESSAGE`, `PlanEntry`, `PlanBlock`, `PlanDrillInput`, `PlanBlockInput`, `PlanEditorBlock`) need no change there.

- [ ] **Step 3: Write block rows in both importers**

In `lib/actions/practice-plan-import.ts`, import `type PlanDrill` from `@/lib/plan-document` and replace from `const diagrams: PlayData[] = [];` to the end of the transaction callback:

```ts
        // Only drill rows have diagrams and copies; block rows are written as they are.
        const drillEntries = planSession.drills.filter((entry): entry is PlanDrill => entry.kind === "drill");
        const diagrams = new Map<number, PlayData>();
        for (const entry of drillEntries) {
            const clean = sanitizePlayDataForWrite(entry.drill.playData);
            if (!clean.ok) {
                return {
                    success: false,
                    error: `Drill ${entry.sequence + 1} ("${entry.drill.name}") has a diagram that can't be saved.`,
                    details: clean.issues,
                };
            }
            diagrams.set(entry.sequence, clean.data);
        }

        const sessionId = await prisma.$transaction(async (tx) => {
            const session = await tx.practiceSession.create({
                data: {
                    title: planSession.title,
                    date: new Date(validated.data.date),
                    duration: planSession.durationMinutes,
                    goaliesAttending: planSession.goaliesAttending,
                    transitionMinutes: planSession.transitionMinutes,
                    isShared: false,
                    teamId,
                    createdById: userId,
                },
                select: { id: true },
            });
            if (planSession.drills.length === 0) return session.id;

            const drillFields = drillEntries.map((entry) => ({
                name: entry.drill.name,
                description: entry.drill.description || null,
                thumbnail: null,
                playData: diagrams.get(entry.sequence) as unknown as Prisma.InputJsonValue,
                focus: entry.drill.focus,
                goalies: entry.drill.goalies,
                teamId,
                createdById: userId,
                sourcePlayId: null,
            }));

            // Ids first, so the rows can point at their copies; matched by sequence, never by position.
            const ownedIds = drillEntries.map(() => newPlayId());
            const ownedBySequence = new Map(drillEntries.map((entry, index) => [entry.sequence, ownedIds[index]]));
            if (drillEntries.length > 0) {
                await tx.play.createMany({
                    data: drillFields.map((fields, index) => ({ id: ownedIds[index], ...fields, isTemplate: false, sessionId: session.id })),
                });
            }
            await tx.practiceSessionPlay.createMany({
                data: planSession.drills.map((entry) =>
                    entry.kind === "drill"
                        ? {
                              sessionId: session.id,
                              playId: ownedBySequence.get(entry.sequence),
                              kind: "drill",
                              label: null,
                              sequence: entry.sequence,
                              duration: entry.durationMinutes,
                              instructions: entry.instructions || null,
                              runsWithPrevious: entry.runsWithPrevious,
                              stays: entry.stays,
                              rotateEveryMinutes: entry.rotateEveryMinutes,
                          }
                        : {
                              sessionId: session.id,
                              playId: null,
                              kind: entry.kind,
                              label: entry.label,
                              sequence: entry.sequence,
                              duration: entry.durationMinutes,
                              instructions: entry.instructions || null,
                              runsWithPrevious: false,
                              stays: false,
                              rotateEveryMinutes: null,
                          },
                ),
            });
            if (addToLibrary && drillFields.length > 0) {
                await tx.play.createMany({
                    data: drillFields.map((fields) => ({ ...fields, isTemplate: true, sessionId: null })),
                });
            }
            return session.id;
        });
```

In `apps/planner/src/store/sessions.ts`, `importPlan`:
- replace the `drills` preparation:

```ts
                // Diagrams are cleaned and drawn before the transaction (IndexedDB can't wait on other work), keyed by row.
                const prepared = new Map<number, { playData: PlayData; thumbnail: string | null }>();
                for (const entry of parsed.plan.session.drills) {
                    if (entry.kind !== "drill") continue;
                    const playData = writablePlayData(entry.drill.playData);
                    prepared.set(entry.sequence, { playData, thumbnail: ctx.makeThumbnail(playData) });
                }
```

- replace the loop inside the transaction:

```ts
                    for (const entry of parsed.plan.session.drills) {
                        if (entry.kind !== "drill") {
                            rows.push({
                                id: ctx.newId(), playId: null, kind: entry.kind, label: entry.label, sequence: entry.sequence,
                                duration: entry.durationMinutes, instructions: entry.instructions, runsWithPrevious: false, stays: false, rotateEveryMinutes: null,
                            });
                            continue;
                        }
                        const ready = prepared.get(entry.sequence);
                        if (!ready) throw new Error(`No prepared diagram for row ${entry.sequence}`);
                        const base = {
                            name: entry.drill.name,
                            description: entry.drill.description || null,
                            thumbnail: ready.thumbnail,
                            playData: ready.playData,
                            focus: entry.drill.focus,
                            goalies: entry.drill.goalies,
                            sourcePlayId: null,
                            createdAt: at,
                            updatedAt: at,
                        };
                        const owned: StoredPlay = { id: ctx.newId(), ...base, isTemplate: false, sessionId: id };
                        await tx.putPlay(owned);
                        rows.push({
                            id: ctx.newId(), playId: owned.id, kind: "drill", label: null, sequence: entry.sequence, duration: entry.durationMinutes,
                            instructions: entry.instructions, runsWithPrevious: entry.runsWithPrevious, stays: entry.stays, rotateEveryMinutes: entry.rotateEveryMinutes,
                        });
                        if (options.addToLibrary) {
                            await tx.putPlay({ id: ctx.newId(), ...base, isTemplate: true, sessionId: null });
                        }
                    }
```

- add `transitionMinutes: parsed.plan.session.transitionMinutes,` to the stored session (import `PlayData` as a type).

Remove seam S4 in `assertExportable`: serialize every row (import `type PlanBlockInput, type PlanDrillInput` from `@/lib/plan-document`):

```ts
    const doc = serializePlan(
        {
            title: meta.title,
            durationMinutes: meta.duration,
            date: null,
            startTime: null,
            goaliesAttending: meta.goaliesAttending ?? null,
            transitionMinutes: meta.transitionMinutes ?? 0,
            drills: rows.map((row): PlanDrillInput | PlanBlockInput => {
                const kind = toRowKind(row.kind);
                if (isBlockKind(kind)) {
                    return { kind, sequence: row.sequence, duration: row.duration, runsWithPrevious: false, instructions: row.instructions, label: row.label ?? null };
                }
                const play = row.playId ? plays.get(row.playId) : undefined;
                const parsed = parseStoredPlayData(play?.playData);
                return {
                    sequence: row.sequence,
                    duration: row.duration,
                    runsWithPrevious: row.runsWithPrevious,
                    instructions: row.instructions,
                    name: play?.name ?? "",
                    description: play?.description ?? null,
                    ...drillTags(play),
                    stays: row.stays ?? false,
                    rotateEveryMinutes: row.rotateEveryMinutes ?? null,
                    playData: parsed.ok ? parsed.data : null,
                };
            }),
        },
        "openleague-static",
        at,
    );
```

- [ ] **Step 4: Export every row (remove seam S3) and preview block rows**

In `components/features/practice-planner/ExportPlanMenu.tsx`, import `isBlockRow` (drop `drillRows` if now unused except for the unreadable count, which keeps it), `type PlanSessionInput` from `@/lib/plan-document`, and `type ExportSessionRow` from `./export/bench-sheet-model`. Add, above `buildPlanDocument`:

```ts
/** The session's rows as plan rows: drills with their tags and timing, blocks with their label and note. */
export function toPlanRows(rows: readonly ExportSessionRow[]): PlanSessionInput["drills"] {
    return rows.map((row) =>
        isBlockRow(row)
            ? { kind: row.kind, sequence: row.sequence, duration: row.duration, runsWithPrevious: false, instructions: row.instructions, label: row.label }
            : {
                  sequence: row.sequence,
                  duration: row.duration,
                  runsWithPrevious: row.runsWithPrevious,
                  instructions: row.instructions,
                  name: row.play.name,
                  description: row.play.description,
                  focus: row.play.focus,
                  goalies: row.play.goalies,
                  stays: row.stays,
                  rotateEveryMinutes: row.rotateEveryMinutes,
                  playData: row.play.playData,
              },
    );
}
```

In `buildPlanDocument`, replace the `drills:` mapping (and its seam comment) with:

```ts
            transitionMinutes: session.transitionMinutes ?? 0,
            drills: toPlanRows(session.plays),
```

In `components/features/practice-planner/PlanPreview.tsx`:
- imports: add `import { blockTitle, drillRows, isBlockRow } from "@/lib/utils/session-rows";` and `import { BLOCK_ICONS } from "@/components/features/practice-planner/BlockRowCard";`;
- `const groups = useMemo(() => groupStations(session.plays, session.transitionMinutes), [session]);`
- thumbnails only for drills: `for (const play of drillRows(session.plays)) {`
- the planned text: `plannedLabel(sessionWallMinutes(session.plays, session.transitionMinutes), session.duration)`;
- the empty text stays "No drills in this plan" (shown only when the plan has no rows at all);
- in the group render, a lone block row is a line with its kind icon in the thumbnail slot:

```tsx
                    {groups.map((group) => {
                        const head = group.stations[0];
                        if (isBlockRow(head)) {
                            const Icon = BLOCK_ICONS[head.kind];
                            return (
                                <Stack component="li" key={head.key} direction="row" spacing={1.5} alignItems="center">
                                    <Box aria-hidden sx={{ ...THUMB, flexShrink: 0, borderRadius: 1, bgcolor: "action.hover", display: "grid", placeItems: "center", color: "secondary.main" }}>
                                        <Icon />
                                    </Box>
                                    <Box sx={{ minWidth: 0 }}>
                                        <Typography fontWeight={600}>{blockTitle(head.kind, head.label)}</Typography>
                                        <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-line" }}>
                                            {head.instructions ? `${head.duration} min · ${head.instructions}` : `${head.duration} min`}
                                        </Typography>
                                    </Box>
                                </Stack>
                            );
                        }
                        const stations = drillRows(group.stations);
                        return (
                            <Box component="li" key={group.index}>
                                {stations.length > 1 && (
                                    <Typography variant="overline" color="secondary.main">
                                        {stationBlockLabel(stations.length, group.wallMinutes)}
                                    </Typography>
                                )}
                                <Stack spacing={1}>
                                    {stations.map((play) => {
```

(the drill row JSX inside is unchanged; close the extra braces accordingly).

- [ ] **Step 5: Amend ADR-0020**

Append to `docs/adr/0020-exchange-practice-plans-as-a-portable-versioned-document-and-ship-a-static-local.md`, under `## Amendments`:

```markdown
### 2026-10-04: Practice timing (additive fields, version stays 1)

The document gains, without a version bump:
- per row: `kind` (`drill` | `warmup` | `break` | `transition` | `cooldown`); on a drill row `stays` (boolean) and `rotateEveryMinutes` (an integer 1–30, or `null`); on a block row `label` (at most 60 characters, or `null` for the kind's default);
- per session: `transitionMinutes` (an integer 0–5, the gap between blocks).

**Rules:**
- A row without a `kind` is a drill, so every earlier file reads as before, with a 0-minute gap.
- A block row carries `sequence`, `durationMinutes`, `kind`, `label` and `instructions` (its note) and nothing else: no drill, diagram or tags. It counts toward `MAX_PLAN_DRILLS`.
- `stays`, `rotateEveryMinutes`, `label` and `transitionMinutes` read leniently (an unrecognized value takes its default). An unknown `kind` is an error, never read as a drill. The row rules (a block never runs as a station; a rotation only on the first drill of a block with at least 2 rotating stations) are enforced as the hosted save enforces them.
- Writers always emit every field.

**Compatibility:** a reader built before this amendment strips the drill rows' new keys and reads such a file as before, but rejects a file that contains a block row (it has no `drill`) with its normal "can't open this plan" message. That one-way break is accepted: a bump would make older readers reject every new file, including those without blocks.

Spec: `docs/superpowers/specs/2026-10-04-practice-timing-design.md`.
```

Run: `bun run adr:lint && bun run adr:check-integrity`
Expected: PASS.

- [ ] **Step 6: Run the tests to verify they pass**

Run the Step 1 command again, then `bun run test`.
Expected: PASS, the narrowed tests and the importer's extended exact shapes included.
Run: `bun run type-check && bun run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
/usr/bin/git add lib/plan-document/document.ts lib/actions/practice-plan-import.ts \
  apps/planner/src/store/sessions.ts components/features/practice-planner/ExportPlanMenu.tsx \
  components/features/practice-planner/PlanPreview.tsx \
  docs/adr/0020-exchange-practice-plans-as-a-portable-versioned-document-and-ship-a-static-local.md \
  __tests__/lib/plan-document/document.test.ts __tests__/lib/actions/practice-plan-import.test.ts \
  __tests__/apps/planner/local-store.sessions.test.ts __tests__/components/features/practice-planner/ExportPlanMenu.test.tsx \
  __tests__/components/features/practice-planner/PlanImportView.test.tsx __tests__/lib/data/starter-templates.test.ts \
  __tests__/components/features/practice-planner/StarterTemplatePicker.test.tsx
/usr/bin/git commit -m "feat(practice-planner): plan files carry block rows, rotation and the gap" -m "Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```


---

### Task 6: Editor, part 1: Add block, Between blocks, and the untouched-editor guarantee

The coach can add a block row and set the gap (spec R8). The editor is at 885 of its 900 lines, so two extractions come first: the "Session Details" form moves into `SessionDetailsFields`, and the list edits (delete, move, station toggle, add block) move into a `useSessionRowEdits` hook.

**Files:**
- Create: `components/features/practice-planner/SessionDetailsFields.tsx`, `BetweenBlocksField.tsx`, `AddBlockMenu.tsx`, `useSessionRowEdits.ts`, `useBetweenBlocks.ts`
- Modify: `components/features/practice-planner/PracticeSessionEditor.tsx`, `SessionDrillList.tsx`
- Test (create): `__tests__/helpers/session-editor.tsx` (the shared editor harness), `__tests__/components/features/practice-planner/PracticeSessionEditor.timing.test.tsx`
- Test (modify): `__tests__/components/features/practice-planner/SessionDrillList.busy.test.tsx` (the new required `onAddBlock` prop, ruling R2)
- Screenshot script (scratchpad, not committed): `pwcheck/timing-task6.mjs`

**Interfaces:**
- Consumes (Task 1): `BLOCK_KINDS`, `BLOCK_DEFAULTS`, `MAX_TRANSITION_MINUTES`, `newBlockItem`, `moveItem`, `removeItem`, `toggleRunsWithPrevious`, `sessionWallMinutes(rows, transitionMinutes)`. (Task 2): `BLOCK_ICONS`, `SessionItem`.
- Produces:
  - `useSessionRowEdits({ plays, setPlays, markDirty, locked }): { deleteRow(id: string): void; moveRow(index: number, dir: -1 | 1): void; toggleStation(index: number): void; addBlock(kind: BlockKind): void }` (Task 7 adds `setRotation` and `setStays`);
  - `useBetweenBlocks(initial: number | undefined, markDirty): { transitionMinutes: number | undefined; setTransitionMinutes(next: number): void }`;
  - `BetweenBlocksField({ value: number; onChange(next: number): void; disabled?: boolean })`;
  - `AddBlockMenu({ onAdd(kind: BlockKind): void; disabled?: boolean })`;
  - `SessionDetailsFields` (props below);
  - `SessionDrillListProps.transitionMinutes?: number` and `onAddBlock: (kind: BlockKind) => void`.

- [ ] **Step 1: Write the failing editor tests**

The practice-timing editor tests (this task and Task 7) share one harness instead of copying it (ruling R14). Create `__tests__/helpers/session-editor.tsx` (not a `*.test.*` file, so Vitest doesn't collect it):

```tsx
/** Shared harness for the PracticeSessionEditor practice-timing tests (Add block, Between blocks, rotation). */
import { vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { renderWithPlanner } from "@/__tests__/helpers/planner";
import { PracticeSessionEditor } from "@/components/features/practice-planner/PracticeSessionEditor";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import type { PlayInSession, PracticeSessionData, SessionItem } from "@/types/practice-planner";

export const TEAM = "cteamxxxxxxxxxxxxxxxxxxxx";
export const SESSION = "csessionxxxxxxxxxxxxxxxxx";

/** jsdom has no ResizeObserver, which the editor's board uses: call from beforeAll. */
export function stubResizeObserver(): void {
    global.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver;
}

export function drill(id: string, sequence: number, extra: Partial<PlayInSession> = {}): PlayInSession {
    return {
        id, playId: `cplay${id}xxxxxxxxxxxxxxxxxxx`, name: `Drill ${id}`, sequence, runsWithPrevious: false,
        duration: 10, instructions: "", playData: createEmptyPlayData(), thumbnail: "", ...extra,
    };
}

/** A saved session's editor; returns its onSave mock. */
export function renderEditor(plays: SessionItem[], extra: Partial<PracticeSessionData> = {}, onSave = vi.fn().mockResolvedValue({ success: true })) {
    renderWithPlanner(
        <ThemeProvider theme={createTheme()}>
            <LocalizationProvider dateAdapter={AdapterDateFns}>
                <PracticeSessionEditor
                    sessionId={SESSION}
                    teamId={TEAM}
                    initialData={{ title: "Practice", duration: 60, date: new Date("2026-04-07T22:00:00.000Z"), plays, ...extra }}
                    onSave={onSave}
                />
            </LocalizationProvider>
        </ThemeProvider>,
    );
    return onSave;
}

export async function save(): Promise<void> {
    await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /^save session/i }));
    });
}
```

Create `__tests__/components/features/practice-planner/PracticeSessionEditor.timing.test.tsx`:

```tsx
import { beforeAll, describe, expect, it } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { renderWithPlanner } from "@/__tests__/helpers/planner";
import { TEAM, drill, renderEditor, save, stubResizeObserver } from "@/__tests__/helpers/session-editor";
import { PracticeSessionEditor } from "@/components/features/practice-planner/PracticeSessionEditor";
import type { SessionItem } from "@/types/practice-planner";

beforeAll(stubResizeObserver);

/** As getPracticeSessionForEdit returns it: normalized, every timing field loaded. */
const STORED: SessionItem[] = [
    { id: "kw", kind: "warmup", label: "Laps", sequence: 0, duration: 8, instructions: "Easy", runsWithPrevious: false },
    drill("ka", 1, { stays: true, rotateEveryMinutes: 5, duration: 10 }),
    drill("kb", 2, { runsWithPrevious: true, stays: false, rotateEveryMinutes: null, duration: 5 }),
    drill("kc", 3, { runsWithPrevious: true, stays: false, rotateEveryMinutes: null, duration: 5 }),
    { id: "kd", kind: "cooldown", label: "", sequence: 4, duration: 5, instructions: "", runsWithPrevious: false },
];

describe("PracticeSessionEditor: Add block", () => {
    it("adds each block kind at the end with its default label and minutes", async () => {
        const onSave = renderEditor([drill("k1", 0)]);
        for (const name of ["Warm-up", "Water break", "Transition", "Cool-down"]) {
            fireEvent.click(screen.getByRole("button", { name: "Add block" }));
            fireEvent.click(await screen.findByRole("menuitem", { name: new RegExp(`^${name}`) }));
        }
        expect(screen.getByRole("heading", { name: "Cool-down" })).toBeInTheDocument();
        await save();
        const plays = onSave.mock.calls[0][0].plays as SessionItem[];
        expect(plays.map((row) => [row.kind ?? "drill", row.duration, row.sequence])).toEqual([
            ["drill", 10, 0], ["warmup", 8, 1], ["break", 2, 2], ["transition", 2, 3], ["cooldown", 5, 4],
        ]);
        expect(plays.slice(1).every((row) => "label" in row && row.label === "")).toBe(true);
    });

    it("keeps Add block out of reach while the session is being saved for the first time", async () => {
        renderWithPlanner(
            <ThemeProvider theme={createTheme()}>
                <LocalizationProvider dateAdapter={AdapterDateFns}>
                    <PracticeSessionEditor teamId={TEAM} initialData={{ title: "Practice", duration: 60, date: new Date(), plays: [] }} onSave={() => new Promise(() => undefined)} />
                </LocalizationProvider>
            </ThemeProvider>,
        );
        await save();
        expect(screen.getByRole("button", { name: "Add block" })).toBeDisabled();
    });
});

describe("PracticeSessionEditor: Between blocks", () => {
    it("offers None and 1–5 minutes, counts the gap in the total, and saves the choice", async () => {
        const onSave = renderEditor([drill("k1", 0), drill("k2", 1)]);
        const field = screen.getByRole("combobox", { name: /^Between blocks/ });
        expect(field).toHaveTextContent("None");
        fireEvent.mouseDown(field);
        const options = await screen.findAllByRole("option");
        expect(options.map((option) => option.textContent)).toEqual(["None", "1 min", "2 min", "3 min", "4 min", "5 min"]);
        fireEvent.click(screen.getByRole("option", { name: "2 min" }));
        expect(screen.getByText("Total Play Time: 22 minutes")).toBeInTheDocument();
        await save();
        expect(onSave.mock.calls[0][0].transitionMinutes).toBe(2);
    });

    it("sends no gap when none was loaded and the coach didn't pick one (absent = unchanged)", async () => {
        const onSave = renderEditor([drill("k1", 0)]);
        await save();
        expect(onSave.mock.calls[0][0].transitionMinutes).toBeUndefined();
    });
});

describe("PracticeSessionEditor: an untouched editor", () => {
    it("saves every stored value back: block rows, labels, notes, stays, rotation and the gap", async () => {
        const onSave = renderEditor(STORED, { transitionMinutes: 3 });
        expect(screen.getByRole("combobox", { name: /^Between blocks/ })).toHaveTextContent("3 min");
        fireEvent.change(screen.getByLabelText(/^Session Title/), { target: { value: "Renamed" } });
        await save();
        const sent = onSave.mock.calls[0][0];
        expect(sent.title).toBe("Renamed");
        expect(sent.plays).toEqual(STORED);
        expect(sent.transitionMinutes).toBe(3);
    });

    it("shows the block cards between the drills", () => {
        renderEditor(STORED, { transitionMinutes: 3 });
        const laps = screen.getByRole("region", { name: "Laps" });
        expect(within(laps).getByText("8 min")).toBeInTheDocument();
        expect(screen.getByRole("region", { name: "Cool-down" })).toBeInTheDocument();
    });
});
```

Run: `bun run test __tests__/components/features/practice-planner/PracticeSessionEditor.timing.test.tsx`
Expected: FAIL. There is no Add block button and no Between blocks field.

- [ ] **Step 2: Create the two small fields and the two hooks**

Create `components/features/practice-planner/BetweenBlocksField.tsx`:

```tsx
"use client";

import { MenuItem, TextField } from "@mui/material";
import { MAX_TRANSITION_MINUTES } from "@/types/practice-planner";

/** "Between blocks": None, or 1–5 minutes to change drills between top-level blocks (spec R8). */
export function BetweenBlocksField({ value, onChange, disabled = false }: { value: number; onChange: (next: number) => void; disabled?: boolean }) {
    return (
        <TextField
            select
            fullWidth
            label="Between blocks"
            value={String(value)}
            onChange={(event) => onChange(Number(event.target.value))}
            disabled={disabled}
            helperText="Time to change drills between blocks. Not added inside a station block or after the last block."
            slotProps={{ inputLabel: { shrink: true } }}
            // Same fix as GoaliesAttendingField: the theme's select min-height would make this field 81px tall.
            sx={{ "& .MuiSelect-select.MuiInputBase-input": { minHeight: "1.4375em" } }}
        >
            {Array.from({ length: MAX_TRANSITION_MINUTES + 1 }, (_, minutes) => (
                <MenuItem key={minutes} value={String(minutes)} sx={{ minHeight: 44 }}>
                    {minutes === 0 ? "None" : `${minutes} min`}
                </MenuItem>
            ))}
        </TextField>
    );
}
```

Create `components/features/practice-planner/AddBlockMenu.tsx`:

```tsx
"use client";

import { useId, useState } from "react";
import { Button, ListItemIcon, ListItemText, Menu, MenuItem } from "@mui/material";
import { MoreTimeOutlined as AddBlockIcon } from "@mui/icons-material";
import { BLOCK_DEFAULTS, BLOCK_KINDS, type BlockKind } from "@/types/practice-planner";
import { BLOCK_ICONS } from "./BlockRowCard";

/** "Add block": a warm-up, water break, transition or cool-down, appended at the end (spec R8). */
export function AddBlockMenu({ onAdd, disabled = false }: { onAdd: (kind: BlockKind) => void; disabled?: boolean }) {
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const menuId = useId();
    return (
        <>
            <Button
                variant="outlined"
                startIcon={<AddBlockIcon />}
                onClick={(event) => setAnchor(event.currentTarget)}
                disabled={disabled}
                aria-haspopup="menu"
                aria-controls={anchor ? menuId : undefined}
                aria-expanded={anchor ? "true" : undefined}
                sx={{ minHeight: 44 }}
            >
                Add block
            </Button>
            <Menu id={menuId} anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
                {BLOCK_KINDS.map((kind) => {
                    const Icon = BLOCK_ICONS[kind];
                    return (
                        <MenuItem
                            key={kind}
                            sx={{ minHeight: 44 }}
                            onClick={() => {
                                setAnchor(null);
                                onAdd(kind);
                            }}
                        >
                            <ListItemIcon>
                                <Icon fontSize="small" />
                            </ListItemIcon>
                            <ListItemText primary={BLOCK_DEFAULTS[kind].label} secondary={`${BLOCK_DEFAULTS[kind].minutes} min`} />
                        </MenuItem>
                    );
                })}
            </Menu>
        </>
    );
}
```

Create `components/features/practice-planner/useBetweenBlocks.ts`:

```ts
"use client";

import { useCallback, useState } from "react";

/**
 * The gap between blocks in the editor (spec R8), 0–5 minutes. Undefined until
 * the session loads one or the coach picks one, so a save never sends a gap
 * the editor didn't hold (absent = unchanged). Its own hook so
 * PracticeSessionEditor stays under its line budget.
 */
export function useBetweenBlocks(initial: number | undefined, markDirty: () => void) {
    const [transitionMinutes, setValue] = useState<number | undefined>(initial);
    const setTransitionMinutes = useCallback(
        (next: number) => {
            setValue(next);
            markDirty();
        },
        [markDirty],
    );
    return { transitionMinutes, setTransitionMinutes };
}
```

Create `components/features/practice-planner/useSessionRowEdits.ts`:

```ts
"use client";

/**
 * The session editor's list edits (2b, practice timing): delete, move, the
 * station toggle and Add block, through the shared timeline rules. A refused
 * edit (the helpers return the list itself) changes nothing and never marks
 * the editor dirty. Kept out of PracticeSessionEditor for its line budget.
 */
import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { BlockKind, SessionItem } from "@/types/practice-planner";
import { moveItem, removeItem, toggleRunsWithPrevious } from "@/lib/utils/session-timeline";
import { newBlockItem } from "@/lib/utils/session-rows";

export function useSessionRowEdits({
    plays,
    setPlays,
    markDirty,
    locked,
}: {
    plays: SessionItem[];
    setPlays: Dispatch<SetStateAction<SessionItem[]>>;
    markDirty: () => void;
    /** A create in flight: it redirects, so any edit would be lost. */
    locked: boolean;
}) {
    // Computed from the rendered list; React renders between discrete clicks.
    const applyListEdit = useCallback(
        (next: SessionItem[]) => {
            if (locked || next === plays) return;
            setPlays(next);
            markDirty();
        },
        [locked, plays, setPlays, markDirty],
    );

    // Removing a block's first drill keeps its stations grouped (2b).
    const deleteRow = useCallback((id: string) => applyListEdit(removeItem(plays, plays.findIndex((p) => p.id === id))), [applyListEdit, plays]);
    const moveRow = useCallback((index: number, dir: -1 | 1) => applyListEdit(moveItem(plays, index, dir)), [applyListEdit, plays]);
    const toggleStation = useCallback((index: number) => applyListEdit(toggleRunsWithPrevious(plays, index)), [applyListEdit, plays]);

    const addBlock = useCallback(
        (kind: BlockKind) => {
            if (locked) return;
            setPlays((prev) => [
                ...prev,
                newBlockItem(kind, prev.reduce((max, p) => Math.max(max, p.sequence), -1) + 1, `block-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`),
            ]);
            markDirty();
        },
        [locked, setPlays, markDirty],
    );

    return { deleteRow, moveRow, toggleStation, addBlock };
}
```

- [ ] **Step 3: Extract the Session Details form**

Create `components/features/practice-planner/SessionDetailsFields.tsx` with the editor's current "Session Details" `Paper` moved verbatim (title, date, duration, goalies, shared notice), plus the Between blocks field after the goalie field:

```tsx
"use client";

/** The editor's "Session Details" card: title, date, length, goalies attending, the gap between blocks. */
import type { ChangeEvent } from "react";
import { Alert, Paper, Stack, TextField, Typography } from "@mui/material";
import { DateTimePicker } from "@mui/x-date-pickers/DateTimePicker";
import { VALIDATION_CONSTRAINTS } from "@/types/practice-planner";
import { GoaliesAttendingField } from "./GoaliesAttendingField";
import { BetweenBlocksField } from "./BetweenBlocksField";

export interface SessionDetailsFieldsProps {
    title: string;
    onTitleChange: (event: ChangeEvent<HTMLInputElement>) => void;
    date: Date | null;
    onDateChange: (date: Date | null) => void;
    duration: number;
    onDurationChange: (event: ChangeEvent<HTMLInputElement>) => void;
    goaliesAttending: number | null;
    onGoaliesAttendingChange: (next: number | null) => void;
    /** Shown as 0 ("None") until loaded or picked */
    transitionMinutes: number;
    onTransitionMinutesChange: (next: number) => void;
    isShared: boolean;
    /** A create in flight: every field is locked. */
    creating: boolean;
    /** A reservation fixes the date and the length. */
    scheduleLocked: boolean;
    validationErrors: Record<string, string>;
}

export function SessionDetailsFields({
    title,
    onTitleChange,
    date,
    onDateChange,
    duration,
    onDurationChange,
    goaliesAttending,
    onGoaliesAttendingChange,
    transitionMinutes,
    onTransitionMinutesChange,
    isShared,
    creating,
    scheduleLocked,
    validationErrors,
}: SessionDetailsFieldsProps) {
    return (
        <Paper elevation={2} sx={{ p: 2 }}>
            <Stack spacing={2}>
                <Typography variant="h6" component="h2">
                    Session Details
                </Typography>
                <TextField
                    label="Session Title"
                    value={title}
                    onChange={onTitleChange}
                    fullWidth
                    required
                    disabled={creating}
                    placeholder="Enter session title"
                    inputProps={{ maxLength: 100 }}
                    helperText={validationErrors.title || `${title.length}/100 characters`}
                    error={!!validationErrors.title}
                />
                <DateTimePicker
                    label="Practice Date & Time"
                    value={date}
                    onChange={onDateChange}
                    disabled={creating || scheduleLocked}
                    slotProps={{
                        textField: {
                            fullWidth: true,
                            required: true,
                            sx: { "& .MuiInputBase-root": { minHeight: 44 } },
                            error: !!validationErrors.date,
                            helperText: validationErrors.date,
                        },
                    }}
                />
                <TextField
                    label="Session Duration (minutes)"
                    type="number"
                    value={duration}
                    onChange={onDurationChange}
                    fullWidth
                    required
                    disabled={creating || scheduleLocked}
                    sx={{ "& .MuiInputBase-root": { minHeight: 44 } }}
                    inputProps={{ min: VALIDATION_CONSTRAINTS.MIN_DURATION, max: VALIDATION_CONSTRAINTS.MAX_DURATION }}
                    helperText={
                        validationErrors.duration ||
                        `Duration must be between ${VALIDATION_CONSTRAINTS.MIN_DURATION} and ${VALIDATION_CONSTRAINTS.MAX_DURATION} minutes`
                    }
                    error={!!validationErrors.duration}
                />
                <GoaliesAttendingField value={goaliesAttending} onChange={onGoaliesAttendingChange} disabled={creating} />
                <BetweenBlocksField value={transitionMinutes} onChange={onTransitionMinutesChange} disabled={creating} />
                {isShared && <Alert severity="info">This session is shared with your team members</Alert>}
            </Stack>
        </Paper>
    );
}
```

In `PracticeSessionEditor.tsx`:
- replace the whole "Session Metadata Form" `<Paper …>…</Paper>` with:

```tsx
            <SessionDetailsFields
                title={title}
                onTitleChange={handleTitleChange}
                date={date}
                onDateChange={handleDateChange}
                duration={duration}
                onDurationChange={handleDurationChange}
                goaliesAttending={goalies.goaliesAttending}
                onGoaliesAttendingChange={goalies.setGoaliesAttending}
                transitionMinutes={betweenBlocks.transitionMinutes ?? 0}
                onTransitionMinutesChange={betweenBlocks.setTransitionMinutes}
                isShared={isShared}
                creating={creating}
                scheduleLocked={Boolean(booking.selectedReservation)}
                validationErrors={validationErrors}
            />
```

- after `const goalies = useGoaliesAttending(…);` add:

```tsx
    const betweenBlocks = useBetweenBlocks(initialData?.transitionMinutes, markDirty);
    const rowEdits = useSessionRowEdits({ plays, setPlays, markDirty, locked: creating });
```

- in `sessionData`, after `goaliesAttending: …`: `transitionMinutes: betweenBlocks.transitionMinutes,`; add `betweenBlocks.transitionMinutes` to `handleSave`'s dependencies;
- delete `applyListEdit`, `handleDeletePlay`, `handleMovePlay` and `handleToggleStation` with their comments;
- on `<SessionDrillList …>`: `transitionMinutes={betweenBlocks.transitionMinutes ?? 0}`, `onDelete={rowEdits.deleteRow}`, `onMoveUp={(index) => rowEdits.moveRow(index, -1)}`, `onMoveDown={(index) => rowEdits.moveRow(index, 1)}`, `onToggleStation={rowEdits.toggleStation}`, `onAddBlock={rowEdits.addBlock}`;
- imports: add `SessionDetailsFields`, `useBetweenBlocks`, `useSessionRowEdits`; remove the now-unused `TextField`, `DateTimePicker`, `VALIDATION_CONSTRAINTS`, `GoaliesAttendingField` and the `moveItem, removeItem, toggleRunsWithPrevious` import (lint flags any leftover).

- [ ] **Step 4: Offer Add block and count the gap in `SessionDrillList`**

In `components/features/practice-planner/SessionDrillList.tsx`:
- props: add

```tsx
    /** Minutes between blocks, counted in the total (spec R4). */
    transitionMinutes?: number;
    /** Appends a warm-up, water break, transition or cool-down. */
    onAddBlock: (kind: BlockKind) => void;
```

  (import `BlockKind`, and `import { AddBlockMenu } from "./AddBlockMenu";`), destructured as `transitionMinutes = 0` and `onAddBlock`;
- `const totalPlayTime = sessionWallMinutes(plays, transitionMinutes);`
- the header's button `Stack` becomes `<Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" justifyContent="flex-end">`, with `<AddBlockMenu onAdd={onAddBlock} disabled={disabled || locked} />` between "New drill" and "Add from library"; the outer header `Stack` gets `flexWrap="wrap" useFlexGap spacing={1}` so the three buttons wrap under the heading on a phone.

`onAddBlock` is a required prop, so `__tests__/components/features/practice-planner/SessionDrillList.busy.test.tsx` passes it: in `renderList`, after `onNewDrill={vi.fn()}`, add `onAddBlock={vi.fn()}`.

Run: `bun run test __tests__/components/features/practice-planner/PracticeSessionEditor.line-budget.test.ts && wc -l components/features/practice-planner/PracticeSessionEditor.tsx`
Expected: PASS, about 790 lines (the Session Details form and the four list-edit handlers leave the editor).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun run test __tests__/components/features/practice-planner/PracticeSessionEditor.timing.test.tsx && bun run test`
Expected: PASS (every existing editor test included: the extraction is behaviour-preserving).
Run: `bun run type-check && bun run lint`
Expected: PASS (the busy test passes `onAddBlock`).

- [ ] **Step 6: Screenshots (light and dark, desktop and mobile)**

Run `bun run planner:build`, then start the preview in the background (Bash `run_in_background: true`): `bun run planner:preview --port 4199 --strictPort`.

Write `/private/tmp/claude-501/-Users-markbeacom-github-mbeacom-openleague/3436f415-4c2f-4d80-8aa7-d860be0c7ad8/scratchpad/pwcheck/timing-task6.mjs`:

```js
import { chromium } from "playwright";
const exe = "/Users/markbeacom/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const browser = await chromium.launch({ executablePath: exe });
const BASE = "http://localhost:4199/";
for (const scheme of ["light", "dark"]) {
  for (const [w, h, tag] of [[1280, 1000, "desktop"], [390, 844, "mobile"]]) {
    const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.log("pageerror", e.message));
    await page.goto(BASE + "#/import");
    await page.getByRole("button", { name: "Use template: Skills Stations" }).click();
    await page.getByRole("button", { name: /save to my practices/i }).click();
    await page.waitForURL(/#\/sessions\/[^/]+$/, { timeout: 20000 });
    await page.goto(page.url() + "/edit");
    await page.getByRole("button", { name: "Add block" }).waitFor({ timeout: 20000 });
    await page.getByRole("button", { name: "Add block" }).click();
    await page.getByRole("menuitem", { name: /^Water break/ }).click();
    await page.getByRole("combobox", { name: /^Between blocks/ }).click();
    await page.getByRole("option", { name: "2 min", exact: true }).click();
    for (const name of [/^Between blocks/, /^Goalies attending/]) {
      const box = await page.getByRole("combobox", { name }).boundingBox();
      console.log(scheme, tag, String(name), "height", box?.height);
    }
    const card = page.getByRole("region", { name: "Water break" });
    const small = await card.locator("button").evaluateAll((els) =>
      els.filter((el) => { const r = el.getBoundingClientRect(); return r.height < 44 || r.width < 44; }).map((el) => el.getAttribute("aria-label")));
    console.log(scheme, tag, "block-card buttons under 44px:", small);
    await page.getByRole("combobox", { name: /^Between blocks/ }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `timing-task6-settings-${tag}-${scheme}.png` });
    await page.getByRole("button", { name: "Add block" }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `timing-task6-list-${tag}-${scheme}.png` });
    await card.scrollIntoViewIfNeeded();
    await card.screenshot({ path: `timing-task6-block-${tag}-${scheme}.png` });
    await ctx.close();
  }
}
await browser.close();
```

Run: `cd /private/tmp/claude-501/-Users-markbeacom-github-mbeacom-openleague/3436f415-4c2f-4d80-8aa7-d860be0c7ad8/scratchpad/pwcheck && node timing-task6.mjs`
Expected output: no `pageerror`; both selects about 56 px tall (never 81); "block-card buttons under 44px: []".

Read every `timing-task6-*.png`. Check: the Between blocks field sits under Goalies attending with its helper text; the header's three buttons wrap cleanly at 390 px; the block card shows its icon, label, `2 min` stepper, note, and move/delete; in dark mode no surface is white and every text is readable. Fix and re-run until they do. Stop the preview server.

- [ ] **Step 7: Commit**

```bash
/usr/bin/git add components/features/practice-planner/SessionDetailsFields.tsx components/features/practice-planner/BetweenBlocksField.tsx \
  components/features/practice-planner/AddBlockMenu.tsx components/features/practice-planner/useSessionRowEdits.ts \
  components/features/practice-planner/useBetweenBlocks.ts components/features/practice-planner/PracticeSessionEditor.tsx \
  components/features/practice-planner/SessionDrillList.tsx __tests__/components/features/practice-planner/PracticeSessionEditor.timing.test.tsx \
  __tests__/helpers/session-editor.tsx __tests__/components/features/practice-planner/SessionDrillList.busy.test.tsx
/usr/bin/git commit -m "feat(practice-planner): add warm-up, break, transition and cool-down blocks and a gap between blocks" -m "Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 7: Editor, part 2: station rotation

A station block of 2 or more drills gets a **Rotate** switch, an "every M min" select, the computed summary and a collapsible rotation grid; each station card shows **Stays** in place of its minutes while the block rotates; and the editor explains when the block can't rotate (spec R3, R8). The save sends `settleRotations(plays)`, so a block that can't rotate is saved without its rotation.

**Files:**
- Create: `components/features/practice-planner/RotationGridTable.tsx`, `StationBlockHeader.tsx`
- Modify: `components/features/practice-planner/SessionDrillList.tsx` (the header moves out; rotation and Stays wiring)
- Modify: `components/features/practice-planner/SessionDrillCard.tsx` (the `stays` prop)
- Modify: `components/features/practice-planner/useSessionRowEdits.ts` (`setRotation`, `setStays`)
- Modify: `components/features/practice-planner/PracticeSessionEditor.tsx` (two props, `settleRotations` in the payload)
- Test (create): `__tests__/components/features/practice-planner/PracticeSessionEditor.rotation.test.tsx` (on the Task 6 harness), `__tests__/components/features/practice-planner/RotationGridTable.test.tsx`
- Test (modify): `__tests__/components/features/practice-planner/SessionDrillList.busy.test.tsx` (the new required `onSetRotation` / `onSetStays` props, ruling R2)
- Screenshot script (scratchpad): `pwcheck/timing-task7.mjs`

**Interfaces:**
- Consumes (Task 1): `rotatingStations`, `rotationTable`, `rotationRoundLabel`, `rotationSummary`, `defaultRotationMinutes`, `normalizeGroups`, `settleRotations`, `MIN_ROTATING_STATIONS`, `MAX_ROTATE_MINUTES`, `RotationTable`. (Task 6): `useSessionRowEdits`.
- Produces:
  - `RotationGridTable({ table: RotationTable; caption: string; variant?: "screen" | "print" })` (Tasks 8 reuse it; the table's accessible name is `caption`);
  - `StationBlockHeader({ id; label; warnings: string[]; rotation: StationRotationControls })`, `StationRotationControls { rotateEveryMinutes: number | null; rotatingCount: number; table: RotationTable | null; onRotateChange(on: boolean): void; onMinutesChange(minutes: number): void; disabled: boolean }`, `CANT_ROTATE_MESSAGE`;
  - `SessionDrillCardProps.stays?: { checked: boolean; onToggle(): void } | null`, `STAYS_LABEL = "Stays"`, `STAYS_HELP = "Doesn't rotate, e.g. goalie station"`;
  - `useSessionRowEdits` gains `setRotation(headIndex: number, minutes: number | null)` and `setStays(index: number, stays: boolean)`;
  - `SessionDrillListProps.onSetRotation(headIndex: number, minutes: number | null)` and `onSetStays(index: number, stays: boolean)`.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/components/features/practice-planner/RotationGridTable.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { RotationGridTable } from "@/components/features/practice-planner/RotationGridTable";

const TABLE = {
    columns: ["Goalie", "Skate A", "Skate B"],
    rows: [
        { start: "6:00 PM", cells: ["all", "A", "B"] },
        { start: "6:05 PM", cells: ["all", "B", "A"] },
    ],
};

describe("RotationGridTable", () => {
    it("is a named table: a Start column, one column per station, a group or all in each cell", () => {
        render(
            <ThemeProvider theme={createTheme({ palette: { mode: "dark" } })}>
                <RotationGridTable table={TABLE} caption="Rotation grid: Stations · 3 · 10 min" />
            </ThemeProvider>,
        );
        const table = screen.getByRole("table", { name: "Rotation grid: Stations · 3 · 10 min" });
        expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Start", "Goalie", "Skate A", "Skate B"]);
        expect(within(table).getAllByRole("row").slice(1).map((row) => row.textContent)).toEqual(["6:00 PMallAB", "6:05 PMallBA"]);
    });

    it("prints as a plain table", () => {
        const html = renderToStaticMarkup(<RotationGridTable table={TABLE} caption="Rotation grid" variant="print" />);
        expect(html).toContain('class="bench-rotation"');
        expect(html).toContain("<th scope=\"col\">Skate A</th>");
        expect(html).toMatch(/<td>all<\/td>/);
    });
});
```

Create `__tests__/components/features/practice-planner/PracticeSessionEditor.rotation.test.tsx` on the shared harness (Task 6), not a copy of it:

```tsx
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { drill, renderEditor, save, stubResizeObserver } from "@/__tests__/helpers/session-editor";
import { CANT_ROTATE_MESSAGE } from "@/components/features/practice-planner/StationBlockHeader";
import type { PlayInSession, SessionItem } from "@/types/practice-planner";

beforeAll(stubResizeObserver);

/** As getPracticeSessionForEdit loads a block that doesn't rotate: every timing field present. */
const STATIONS: SessionItem[] = [
    drill("ka", 0, { duration: 15, stays: false, rotateEveryMinutes: null }),
    drill("kb", 1, { runsWithPrevious: true, duration: 15, stays: false, rotateEveryMinutes: null }),
    drill("kc", 2, { runsWithPrevious: true, duration: 15, stays: false, rotateEveryMinutes: null }),
];
const ROTATING: SessionItem[] = [
    drill("ka", 0, { stays: false, rotateEveryMinutes: 5, duration: 5 }),
    drill("kb", 1, { runsWithPrevious: true, stays: false, rotateEveryMinutes: null, duration: 5 }),
    drill("kc", 2, { runsWithPrevious: true, stays: false, rotateEveryMinutes: null, duration: 5 }),
];
const WITH_STAYS: SessionItem[] = [
    drill("ka", 0, { stays: true, rotateEveryMinutes: 5, duration: 10 }),
    drill("kb", 1, { runsWithPrevious: true, stays: false, rotateEveryMinutes: null, duration: 5 }),
    drill("kc", 2, { runsWithPrevious: true, stays: false, rotateEveryMinutes: null, duration: 5 }),
];
const station = (name: RegExp) => screen.getByRole("group", { name });
const sent = (onSave: ReturnType<typeof vi.fn>) => onSave.mock.calls[0][0].plays as PlayInSession[];

describe("PracticeSessionEditor: station rotation (spec R8)", () => {
    it("turns rotation on with an interval that keeps the block about as long, and summarizes it", async () => {
        const onSave = renderEditor(STATIONS);
        // Every block's switch is "Rotate": its description names the block it belongs to.
        expect(screen.getByLabelText("Rotate")).toHaveAccessibleDescription("Stations · 3 · 15 min");
        fireEvent.click(screen.getByLabelText("Rotate"));
        expect(screen.getByRole("combobox", { name: /^Every/ })).toHaveTextContent("5 min");
        expect(screen.getByText("3 stations × 5 min = 15 min · groups A–C")).toBeInTheDocument();
        await save();
        expect(sent(onSave).map((p) => [p.rotateEveryMinutes, p.duration])).toEqual([[5, 5], [null, 5], [null, 5]]);
    });

    it("changes the interval and writes every rotating station's minutes", async () => {
        const onSave = renderEditor(ROTATING);
        fireEvent.mouseDown(screen.getByRole("combobox", { name: /^Every/ }));
        fireEvent.click(await screen.findByRole("option", { name: "6 min" }));
        expect(screen.getByText("3 stations × 6 min = 18 min · groups A–C")).toBeInTheDocument();
        await save();
        expect(sent(onSave).map((p) => p.duration)).toEqual([6, 6, 6]);
    });

    it("shows Stays in place of the minutes while the block rotates", () => {
        renderEditor(ROTATING);
        const card = station(/Drill kb/);
        expect(within(card).getByLabelText("Stays")).not.toBeChecked();
        expect(within(card).getByText("Doesn't rotate, e.g. goalie station")).toBeInTheDocument();
        expect(within(card).queryByText(/^Duration:/)).toBeNull();
    });

    it("keeps a stays station for the whole block while the others rotate", async () => {
        const onSave = renderEditor(ROTATING);
        fireEvent.click(within(station(/Drill ka/)).getByLabelText("Stays"));
        expect(screen.getByText("2 stations × 5 min = 10 min · groups A–B")).toBeInTheDocument();
        await save();
        expect(sent(onSave).map((p) => [p.stays, p.duration])).toEqual([[true, 10], [false, 5], [false, 5]]);
    });

    it("explains when the block can't rotate, keeps the coach's ticks, and saves without the rotation", async () => {
        const onSave = renderEditor(ROTATING.slice(0, 2).map((row) => ({ ...row })));
        fireEvent.click(within(station(/Drill ka/)).getByLabelText("Stays"));
        expect(screen.getByText(CANT_ROTATE_MESSAGE)).toBeInTheDocument();
        expect(within(station(/Drill ka/)).getByLabelText("Stays")).toBeChecked();
        await save();
        expect(sent(onSave).map((p) => [p.rotateEveryMinutes, p.stays])).toEqual([[null, false], [null, false]]);
    });

    it("shows and hides the rotation grid", async () => {
        renderEditor(WITH_STAYS);
        expect(screen.queryByRole("table", { name: /^Rotation grid/ })).toBeNull();
        // aria-controls only while the grid it names is in the document (the collapse unmounts it).
        expect(screen.getByRole("button", { name: "Show rotation grid" })).not.toHaveAttribute("aria-controls");
        fireEvent.click(screen.getByRole("button", { name: "Show rotation grid" }));
        const table = screen.getByRole("table", { name: /^Rotation grid/ });
        const controls = screen.getByRole("button", { name: "Hide rotation grid" }).getAttribute("aria-controls");
        expect(controls && document.getElementById(controls)?.contains(table)).toBe(true);
        expect(within(table).getAllByRole("row").map((row) => row.textContent)).toEqual([
            "StartDrill kaDrill kbDrill kc",
            "0–5 minallAB",
            "5–10 minallBA",
        ]);
        fireEvent.click(screen.getByRole("button", { name: "Hide rotation grid" }));
        // The grid unmounts when its collapse transition ends.
        await waitFor(() => expect(screen.queryByRole("table", { name: /^Rotation grid/ })).toBeNull());
    });

    it("turning rotation off clears it and every Stays mark", async () => {
        const onSave = renderEditor(WITH_STAYS);
        fireEvent.click(screen.getByLabelText("Rotate"));
        expect(screen.queryByLabelText("Stays")).toBeNull();
        await save();
        expect(sent(onSave).map((p) => [p.rotateEveryMinutes, p.stays])).toEqual([[null, false], [null, false], [null, false]]);
    });

    it("offers no rotation on a drill that runs on its own", () => {
        renderEditor([drill("ka", 0)]);
        expect(screen.queryByLabelText("Rotate")).toBeNull();
    });
});
```

Run: `bun run test __tests__/components/features/practice-planner/RotationGridTable.test.tsx __tests__/components/features/practice-planner/PracticeSessionEditor.rotation.test.tsx`
Expected: FAIL. Neither component exists and the station header has no Rotate switch.

- [ ] **Step 2: Create `components/features/practice-planner/RotationGridTable.tsx`**

```tsx
"use client";

/**
 * Who is where in a rotating station block (spec R4, R9, R10): a Start column
 * plus one column per station, each cell a group (A, B, C…) or "all" for a
 * stays station. The screen variant is a compact MUI table; the print variant
 * is a plain table for the bench sheet (app/(print)/print.css, .bench-rotation).
 * Rows are keyed by round, never by their start text, which can repeat (the
 * clock shows "—" for every round until it mounts).
 */
import { Table, TableBody, TableCell, TableHead, TableRow } from "@mui/material";
import { ROTATION_ALL, type RotationTable } from "@/lib/utils/session-timeline";

export function RotationGridTable({ table, caption, variant = "screen" }: { table: RotationTable; caption: string; variant?: "screen" | "print" }) {
    if (variant === "print") {
        return (
            <div className="bench-rotation">
                <table aria-label={caption}>
                    <thead>
                        <tr>
                            <th scope="col">Start</th>
                            {table.columns.map((column, index) => (
                                <th scope="col" key={index}>{column}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {table.rows.map((row, round) => (
                            <tr key={round}>
                                <td>{row.start}</td>
                                {row.cells.map((cell, index) => (
                                    <td key={index}>{cell}</td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    }
    return (
        <Table size="small" aria-label={caption} sx={{ mt: 1, "& td, & th": { textAlign: "center", px: 1 } }}>
            <TableHead>
                <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Start</TableCell>
                    {table.columns.map((column, index) => (
                        <TableCell key={index} sx={{ fontWeight: 700 }}>
                            {column}
                        </TableCell>
                    ))}
                </TableRow>
            </TableHead>
            <TableBody>
                {table.rows.map((row, round) => (
                    <TableRow key={round}>
                        <TableCell sx={{ whiteSpace: "nowrap", fontFamily: "var(--font-mono), monospace" }}>{row.start}</TableCell>
                        {row.cells.map((cell, index) => (
                            <TableCell key={index} sx={cell === ROTATION_ALL ? { color: "text.secondary" } : { fontWeight: 800, color: "secondary.main" }}>
                                {cell}
                            </TableCell>
                        ))}
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}
```

- [ ] **Step 3: Create `components/features/practice-planner/StationBlockHeader.tsx`**

Move `StationBlockHeader` out of `SessionDrillList.tsx` (keep its doc comment) and add the rotation controls:

```tsx
"use client";

import { useId, useState } from "react";
import { Alert, Box, Button, Collapse, FormControlLabel, MenuItem, Stack, Switch, TextField, Typography } from "@mui/material";
import { GridOnOutlined as GridIcon } from "@mui/icons-material";
import { MAX_ROTATE_MINUTES } from "@/types/practice-planner";
import { MIN_ROTATING_STATIONS, rotationSummary, type RotationTable } from "@/lib/utils/session-timeline";
import { RotationGridTable } from "./RotationGridTable";

export const CANT_ROTATE_MESSAGE = "To rotate, at least 2 stations must rotate. Untick Stays on a station.";

export interface StationRotationControls {
    /** The block's interval, or null when Rotate is off */
    rotateEveryMinutes: number | null;
    /** Stations not marked Stays */
    rotatingCount: number;
    /** The grid when the block rotates, else null */
    table: RotationTable | null;
    onRotateChange: (on: boolean) => void;
    onMinutesChange: (minutes: number) => void;
    disabled: boolean;
}

/**
 * The header of a station block, "Stations · N · M min", with its warnings
 * (2b) and its rotation (practice timing, spec R8): a Rotate switch, "every M
 * min", the summary, and a collapsible rotation grid. It is a sibling of the
 * block's cards, not their parent: the list renders flat so a drill joining,
 * leaving or heading a block never remounts its card. It is an h3 like a
 * standalone card's title; each grouped card is a role="group" named
 * "Station k of N: <title>" (its own h4).
 */
export function StationBlockHeader({ id, label, warnings, rotation }: { id: string; label: string; warnings: string[]; rotation: StationRotationControls }) {
    const [showGrid, setShowGrid] = useState(false);
    const gridId = useId();
    const minutes = rotation.rotateEveryMinutes;
    const canRotate = rotation.rotatingCount >= MIN_ROTATING_STATIONS;
    return (
        <Box sx={{ borderLeft: 4, borderColor: "primary.main", pl: 1.5 }}>
            <Typography
                id={id}
                variant="subtitle2"
                component="h3"
                sx={{ fontWeight: 800, color: "primary.main", textTransform: "uppercase", letterSpacing: 1 }}
            >
                {label}
            </Typography>
            <Stack direction="row" spacing={2} alignItems="center" useFlexGap flexWrap="wrap" sx={{ mt: 0.5 }}>
                <FormControlLabel
                    control={
                        <Switch
                            checked={minutes !== null}
                            onChange={(event) => rotation.onRotateChange(event.target.checked)}
                            // Every block's switch is labelled "Rotate": the header names which block.
                            slotProps={{ input: { "aria-describedby": id } }}
                        />
                    }
                    label="Rotate"
                    disabled={rotation.disabled}
                    sx={{ minHeight: 44, ml: 0 }}
                />
                {minutes !== null && (
                    <TextField
                        select
                        size="small"
                        label="Every"
                        value={String(minutes)}
                        onChange={(event) => rotation.onMinutesChange(Number(event.target.value))}
                        disabled={rotation.disabled}
                        sx={{ minWidth: 120, "& .MuiInputBase-root": { minHeight: 44 }, "& .MuiSelect-select.MuiInputBase-input": { minHeight: "1.4375em" } }}
                    >
                        {Array.from({ length: MAX_ROTATE_MINUTES }, (_, index) => index + 1).map((option) => (
                            <MenuItem key={option} value={String(option)} sx={{ minHeight: 44 }}>
                                {`${option} min`}
                            </MenuItem>
                        ))}
                    </TextField>
                )}
                {minutes !== null && canRotate && (
                    <Typography variant="body2" color="text.secondary">
                        {rotationSummary(rotation.rotatingCount, minutes)}
                    </Typography>
                )}
            </Stack>
            {minutes !== null && !canRotate && (
                <Alert severity="info" sx={{ mt: 1 }}>
                    {CANT_ROTATE_MESSAGE}
                </Alert>
            )}
            {rotation.table && (
                <>
                    <Button
                        size="small"
                        startIcon={<GridIcon />}
                        onClick={() => setShowGrid((shown) => !shown)}
                        aria-expanded={showGrid}
                        // The collapsed grid is unmounted: point at it only while it exists.
                        aria-controls={showGrid ? gridId : undefined}
                        sx={{ minHeight: 44 }}
                    >
                        {showGrid ? "Hide rotation grid" : "Show rotation grid"}
                    </Button>
                    <Collapse in={showGrid} id={gridId} unmountOnExit>
                        <RotationGridTable table={rotation.table} caption={`Rotation grid: ${label}`} />
                    </Collapse>
                </>
            )}
            {warnings.map((warning) => (
                <Alert key={warning} severity="warning" sx={{ mt: 1 }}>
                    {warning}
                </Alert>
            ))}
        </Box>
    );
}
```

- [ ] **Step 4: Wire rotation and Stays through the list, the card, the hook and the editor**

In `components/features/practice-planner/useSessionRowEdits.ts`, import `normalizeGroups` and `isDrillRow`, and add before the `return`:

```ts
    // The rotation lives on the block's first drill; normalizeGroups writes the stations' minutes (spec R3).
    const setRotation = useCallback(
        (headIndex: number, minutes: number | null) =>
            applyListEdit(normalizeGroups(plays.map((row, i) => (i === headIndex && isDrillRow(row) ? { ...row, rotateEveryMinutes: minutes } : row)))),
        [applyListEdit, plays],
    );
    const setStays = useCallback(
        (index: number, stays: boolean) =>
            applyListEdit(normalizeGroups(plays.map((row, i) => (i === index && isDrillRow(row) ? { ...row, stays } : row)))),
        [applyListEdit, plays],
    );
```

and return `{ deleteRow, moveRow, toggleStation, addBlock, setRotation, setStays }`.

In `components/features/practice-planner/SessionDrillCard.tsx`:
- import `Checkbox` from `@mui/material`;
- export `STAYS_LABEL = "Stays"` and `STAYS_HELP = "Doesn't rotate, e.g. goalie station"`;
- add the prop:

```tsx
    /**
     * Set while this drill's station block rotates (spec R8): the Stays
     * checkbox replaces the minutes, which the rotation sets.
     */
    stays?: { checked: boolean; onToggle: () => void } | null;
```

  destructured as `stays = null`, with `const staysHelpId = useId();`;
- `handleSaveEdits` leaves the minutes alone while the block rotates:

```tsx
        onUpdate(play.id, { ...(stays ? {} : { duration: editDuration }), instructions: editInstructions });
```

- the duration section becomes three-way:

```tsx
                    {stays ? (
                        <Box>
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={stays.checked}
                                        onChange={stays.onToggle}
                                        slotProps={{ input: { "aria-describedby": `${titleId} ${staysHelpId}` } }}
                                    />
                                }
                                label={STAYS_LABEL}
                                disabled={locked}
                                sx={{ minHeight: 44, ml: 0 }}
                            />
                            <FormHelperText id={staysHelpId} sx={{ mt: 0 }}>
                                {STAYS_HELP}
                            </FormHelperText>
                        </Box>
                    ) : isEditing ? (
```

  (the existing `TextField` and the read-only "Duration:" `Stack` follow unchanged).

In `components/features/practice-planner/SessionDrillList.tsx`:
- delete the local `StationBlockHeader` and import it, with `type StationRotationControls`, from `./StationBlockHeader`;
- import `defaultRotationMinutes, rotatingStations, rotationRoundLabel, rotationTable` from the timeline module;
- props: add

```tsx
    /** Sets or clears (null) the rotation on the block whose first drill is at this position. */
    onSetRotation: (headIndex: number, minutes: number | null) => void;
    /** Marks the drill at this position as staying put in its rotating block. */
    onSetStays: (index: number, stays: boolean) => void;
```

- `renderCard` gains a fourth parameter `stays: { checked: boolean; onToggle: () => void } | null = null` and passes `stays={stays}` to `SessionDrillCard`;
- in the station-block branch of `groups.flatMap`:

```tsx
                            const stations = drillRows(group.stations);
                            const head = stations[0];
                            const headIndex = plays.indexOf(head);
                            const grid = group.rotation;
                            const rotateOn = head.rotateEveryMinutes != null;
                            const rotation: StationRotationControls = {
                                rotateEveryMinutes: head.rotateEveryMinutes ?? null,
                                rotatingCount: rotatingStations(stations).length,
                                table: grid
                                    ? rotationTable(grid, (row) => (isDrillRow(row) ? row.name || "Drill" : ""), (start) => rotationRoundLabel(start, grid.minutes))
                                    : null,
                                onRotateChange: (on) => onSetRotation(headIndex, on ? defaultRotationMinutes(stations) : null),
                                onMinutesChange: (minutes) => onSetRotation(headIndex, minutes),
                                disabled: locked,
                            };
```

  pass `rotation={rotation}` to `StationBlockHeader`, and render the cards with

```tsx
                                ...stations.map((play, slot) =>
                                    renderCard(
                                        play,
                                        { position: slot + 1, count: stations.length },
                                        null,
                                        rotateOn ? { checked: Boolean(play.stays), onToggle: () => onSetStays(plays.indexOf(play), !play.stays) } : null,
                                    )),
```

In `PracticeSessionEditor.tsx`:
- pass `onSetRotation={rowEdits.setRotation}` and `onSetStays={rowEdits.setStays}` to `SessionDrillList`;
- import `settleRotations` from `@/lib/utils/session-timeline`, and in `sessionData` send `plays: settleRotations(plays),` (a block that can't rotate saves without its rotation; the screen keeps the coach's ticks and the note).

`onSetRotation` and `onSetStays` are required props, so `__tests__/components/features/practice-planner/SessionDrillList.busy.test.tsx` passes them: in `renderList`, after `onAddBlock={vi.fn()}` (Task 6), add `onSetRotation={vi.fn()} onSetStays={vi.fn()}`.

Run: `bun run test __tests__/components/features/practice-planner/PracticeSessionEditor.line-budget.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the tests to verify they pass**

Run the Step 1 command again, then `bun run test && bun run type-check && bun run lint`.
Expected: PASS.

- [ ] **Step 6: Screenshots (light and dark, desktop and mobile)**

Rebuild and serve as in Task 6 Step 6 (`bun run planner:build`, then `bun run planner:preview --port 4199 --strictPort` in the background).

Write `pwcheck/timing-task7.mjs` (same scratchpad directory):

```js
import { chromium } from "playwright";
const exe = "/Users/markbeacom/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const browser = await chromium.launch({ executablePath: exe });
const BASE = "http://localhost:4199/";
for (const scheme of ["light", "dark"]) {
  for (const [w, h, tag] of [[1280, 1000, "desktop"], [390, 844, "mobile"]]) {
    const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.log("pageerror", e.message));
    await page.goto(BASE + "#/import");
    await page.getByRole("button", { name: "Use template: Skills Stations" }).click();
    await page.getByRole("button", { name: /save to my practices/i }).click();
    await page.waitForURL(/#\/sessions\/[^/]+$/, { timeout: 20000 });
    await page.goto(page.url() + "/edit");
    const rotate = page.getByLabel("Rotate", { exact: true }).nth(1); // the three-station block
    await rotate.waitFor({ timeout: 20000 });
    await rotate.check();
    const goalie = page.getByRole("group", { name: /Angles & Depth/ });
    await goalie.getByLabel("Stays", { exact: true }).check();
    await page.getByRole("button", { name: "Show rotation grid" }).click();
    const every = page.getByRole("combobox", { name: /^Every/ });
    console.log(scheme, tag, "Every height", (await every.boundingBox())?.height);
    const header = page.locator("h3", { hasText: "Stations · 3" }).locator("..");
    const small = await header.locator("button, input").evaluateAll((els) =>
      els.filter((el) => el.offsetParent && el.getBoundingClientRect().height > 0 && el.getBoundingClientRect().height < 44 && el.type !== "checkbox").map((el) => el.getAttribute("aria-label") || el.textContent?.trim()));
    console.log(scheme, tag, "header targets under 44px:", small);
    await header.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `timing-task7-rotation-${tag}-${scheme}.png` });
    await goalie.scrollIntoViewIfNeeded();
    await goalie.screenshot({ path: `timing-task7-stays-${tag}-${scheme}.png` });
    await ctx.close();
  }
}
await browser.close();
```

(Skills Stations' second block is its three-station block until Task 10 changes the templates; if the drill names differ, pick the block by its "Stations · 3" header.)

Run: `cd …/scratchpad/pwcheck && node timing-task7.mjs`
Expected output: no `pageerror`; the Every select about 40–56 px (never 81); "header targets under 44px: []".

Read every `timing-task7-*.png`. Check: the Rotate switch, "Every 5 min", the summary "2 stations × 5 min = 10 min · groups A–B" and the grid read clearly, and wrap without horizontal scroll at 390 px; the goalie card shows Stays with its helper in place of its minutes; the grid's letters use the accent colour and "all" is muted; dark mode has no white surfaces. Stop the preview server.

- [ ] **Step 7: Commit**

```bash
/usr/bin/git add components/features/practice-planner/RotationGridTable.tsx components/features/practice-planner/StationBlockHeader.tsx \
  components/features/practice-planner/SessionDrillList.tsx components/features/practice-planner/SessionDrillCard.tsx \
  components/features/practice-planner/useSessionRowEdits.ts components/features/practice-planner/PracticeSessionEditor.tsx \
  __tests__/components/features/practice-planner/RotationGridTable.test.tsx __tests__/components/features/practice-planner/PracticeSessionEditor.rotation.test.tsx \
  __tests__/components/features/practice-planner/SessionDrillList.busy.test.tsx
/usr/bin/git commit -m "feat(practice-planner): rotate station blocks, with stays stations and a rotation grid" -m "Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 8: Session page and live bench sheet: rotation chips, stays and the grid

The shared `SessionTimeline` shows a rotating block with a "Rotates every M min" chip, its stays stations marked, and the grid under the block, with each round's clock time (spec R9). The same component prints it on the live bench sheet, whose header also says the gap (spec R10). The session page's play-sequence label names the rotation.

**Files:**
- Modify: `components/features/practice-planner/SessionTimeline.tsx`
- Modify: `app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx` (the sidebar block label)
- Modify: `components/features/practice-planner/print/BenchSheet.tsx` (the gap line)
- Modify: `app/(print)/print.css` (`.bench-rotation`)
- Test (append): `__tests__/components/features/practice-planner/SessionTimeline.test.tsx`, `__tests__/app/practice-session-detail-blocks.test.tsx`, `__tests__/components/features/practice-planner/print/BenchSheet.test.tsx`
- Screenshot script (scratchpad): `pwcheck/timing-task8.mjs`

**Interfaces:**
- Consumes (Task 1): `rotationTable`, `rotationBlockLabel`, `rotatesEveryLabel`, `betweenBlocksLabel`, `staysSuffix`, `RotationGrid`. (Task 2): `SessionTimelinePlay`. (Task 7): `RotationGridTable`.
- Produces: nothing new for later tasks; the screen and print timelines render rotation.

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/components/features/practice-planner/SessionTimeline.test.tsx`:

```tsx
describe("SessionTimeline: a rotating station block (spec R9)", () => {
    const ROTATING = [
        { ...play("Goalie", 0, 10), stays: true, rotateEveryMinutes: 5 },
        { ...play("Skate A", 1, 5, true), stays: false, rotateEveryMinutes: null },
        { ...play("Skate B", 2, 5, true), stays: false, rotateEveryMinutes: null },
    ];

    it("chips the interval, marks the stays station, and puts the grid with clock times under the block", () => {
        render(ui({ plays: ROTATING }));
        const [block, gridRow] = bodyRows();
        expect(within(block).getByText("Rotates every 5 min")).toBeInTheDocument();
        // The chip is a div: its caption line must not be a <p> (invalid nesting, a React 19 hydration error).
        expect(block.querySelector("p .MuiChip-root")).toBeNull();
        expect(within(block).getByText(/stays/)).toBeInTheDocument();
        expect(within(block).getByText("10")).toBeInTheDocument();
        const grid = within(gridRow).getByRole("table", { name: /^Rotation grid/ });
        expect(within(grid).getAllByRole("row").map((row) => row.textContent)).toEqual([
            "StartGoalieSkate ASkate B",
            "6:00 PM EDTallAB",
            "6:05 PM EDTallBA",
        ]);
    });

    it("prints the rotation header, the stays mark and the grid", () => {
        const html = renderToStaticMarkup(ui({ plays: ROTATING, variant: "print" }));
        expect(html).toContain("Stations · rotate every 5 min · 10 min");
        expect(html).toContain("Goalie · stays");
        expect(html).toContain('class="bench-rotation"');
        expect(html).toMatch(/<td>all<\/td>/);
    });
});
```

Append to `__tests__/app/practice-session-detail-blocks.test.tsx`:

```tsx
describe("SessionDetailView: a rotating station block", () => {
    it("names the rotation in the play sequence and shows the grid on the timeline", () => {
        const rotating: PracticeSessionView = {
            ...SESSION,
            plays: [
                { ...drill("row-g", "Goalie", 0), stays: true, rotateEveryMinutes: 5 },
                { ...drill("row-a", "Skate A", 1), runsWithPrevious: true, stays: false, rotateEveryMinutes: null },
                { ...drill("row-b", "Skate B", 2), runsWithPrevious: true, stays: false, rotateEveryMinutes: null },
            ],
        };
        renderWithPlanner(
            <ThemeProvider theme={createTheme()}>
                <SessionDetailView session={rotating} isAdmin={false} />
            </ThemeProvider>,
        );
        expect(screen.getByRole("group", { name: "Stations · rotate every 5 min · 10 min" })).toBeInTheDocument();
        expect(screen.getByRole("table", { name: /^Rotation grid/ })).toBeInTheDocument();
    });
});
```

Append to `__tests__/components/features/practice-planner/print/BenchSheet.test.tsx`:

```tsx
describe("BenchSheet: rotation and the gap", () => {
    it("says the gap in the header and prints the rotation grid on the timeline", () => {
        renderSheet({
            ...SESSION,
            transitionMinutes: 2,
            plays: [
                { ...sessionPlay("Goalie", 0, false, 10), stays: true, rotateEveryMinutes: 5 },
                { ...sessionPlay("Skate A", 1, true, 5), stays: false, rotateEveryMinutes: null },
                { ...sessionPlay("Skate B", 2, true, 5), stays: false, rotateEveryMinutes: null },
            ],
        });
        expect(screen.getByText("2 min between blocks")).toBeInTheDocument();
        expect(screen.getByRole("table", { name: /^Rotation grid/ })).toBeInTheDocument();
    });

    it("says nothing about a gap when there is none", () => {
        renderSheet();
        expect(screen.queryByText(/between blocks/)).toBeNull();
    });
});
```

Run: `bun run test __tests__/components/features/practice-planner/SessionTimeline.test.tsx __tests__/app/practice-session-detail-blocks.test.tsx __tests__/components/features/practice-planner/print/BenchSheet.test.tsx`
Expected: FAIL. No chip, grid, rotation label or gap line yet.

- [ ] **Step 2: Render rotation in `SessionTimeline`**

In `components/features/practice-planner/SessionTimeline.tsx`:
- imports: add `Chip` and `Fragment` (`import { Fragment } from "react";`), `rotationBlockLabel, rotatesEveryLabel, rotationTable, type RotationGrid` from the timeline module, and `import { RotationGridTable } from "./RotationGridTable";`;
- add a helper above the component:

```tsx
/** The grid as a table, each round at its clock time (spec R9). */
function gridTable(grid: RotationGrid<SessionTimelinePlay>, roundStarts: Date[], time: (date: Date) => string) {
    return rotationTable(grid, (row) => (isBlockRow(row) ? blockTitle(row.kind, row.label) : row.play.name), (_, round) => time(roundStarts[round]));
}
```

- in both variants, read the row's `roundStarts` (`rows.map(({ group, startsAt, roundStarts }) => …)`) and the upcast grid (`const grid: RotationGrid<SessionTimelinePlay> | null = group.rotation;`), wrap each block's output in `<Fragment key={head.id}>…</Fragment>` (moving only the `key` off the row; the screen `TableRow` keeps its `selected` prop), and after the block's row add the grid row when the block rotates:
  - print:

```tsx
                                    {grid && (
                                        <tr>
                                            <td colSpan={3}>
                                                <RotationGridTable
                                                    variant="print"
                                                    table={gridTable(grid, roundStarts, (date) => clock.time(date))}
                                                    caption={`Rotation grid: ${rotationBlockLabel(grid.minutes, group.wallMinutes)}`}
                                                />
                                            </td>
                                        </tr>
                                    )}
```

  - screen: the same inside `<TableRow><TableCell colSpan={3} sx={{ pt: 0 }}>…</TableCell></TableRow>` with the screen variant;
- a rotating block's station list (both variants): the label is `rotationBlockLabel(grid.minutes, group.wallMinutes)` in print, and on screen `stationsLabel(drills.length)` followed by `<Chip size="small" variant="outlined" color="secondary" label={rotatesEveryLabel(grid.minutes)} />` in the caption's line. A `Chip` renders a `div`, which can't sit inside a `p` (ruling R10), so the screen caption `Typography` that Task 2 wrote as `component="p"` becomes `component="div"`, with `sx` gaining `display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1` (the chip needs no margin of its own);
- each station shows `staysSuffix(sp.stays)` (Task 1; ` · stays` or nothing) in a rotating block, and nothing else (its minutes are the rotation's); import `staysSuffix` with the other timeline names:
  - print `li`: `` {`${sp.play.name}${grid ? staysSuffix(sp.stays) : ` · ${sp.duration} min`}`} ``
  - screen caption span: `{grid ? staysSuffix(sp.stays) : ` · ${sp.duration} min`}`

In `app/(print)/print.css`, after the `.bench-timeline ul` rule:

```css
/* A rotation grid under its station block (practice timing). */
.bench-timeline .bench-rotation table {
  width: auto;
  margin: 4px 0 2px;
}

.bench-timeline .bench-rotation th,
.bench-timeline .bench-rotation td {
  border: 1px solid #999;
  text-align: center;
}
```

- [ ] **Step 3: Name the rotation on the session page and the gap on the bench sheet**

In `app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx`, import `rotationBlockLabel` and make the sidebar's block label:

```tsx
                const label = group.rotation
                  ? rotationBlockLabel(group.rotation.minutes, group.wallMinutes)
                  : stationBlockLabel(group.stations.length, group.wallMinutes);
```

In `components/features/practice-planner/print/BenchSheet.tsx`, import `betweenBlocksLabel` and add after the `place` line in the header:

```tsx
                {gap > 0 && <Typography variant="body1">{betweenBlocksLabel(gap)}</Typography>}
```

Run: `bun run test __tests__/app/SessionDetailView.line-budget.test.ts`. Expected: PASS.

- [ ] **Step 4: Run the tests to verify they pass**

Run the Step 1 command again, then `bun run test && bun run type-check && bun run lint`.
Expected: PASS.

- [ ] **Step 5: Screenshots: session page and bench sheet print view**

Rebuild and serve as in Task 6 Step 6. Write `pwcheck/timing-task8.mjs`:

```js
import { chromium } from "playwright";
const exe = "/Users/markbeacom/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const browser = await chromium.launch({ executablePath: exe });
const BASE = "http://localhost:4199/";
for (const scheme of ["light", "dark"]) {
  for (const [w, h, tag] of [[1280, 1000, "desktop"], [390, 844, "mobile"]]) {
    const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.log("pageerror", e.message));
    await page.goto(BASE + "#/import");
    await page.getByRole("button", { name: "Use template: Skills Stations" }).click();
    await page.getByRole("button", { name: /save to my practices/i }).click();
    await page.waitForURL(/#\/sessions\/[^/]+$/, { timeout: 20000 });
    const session = page.url();
    await page.goto(session + "/edit");
    await page.getByLabel("Rotate", { exact: true }).nth(1).check();
    await page.getByRole("group", { name: /Angles & Depth/ }).getByLabel("Stays", { exact: true }).check();
    await page.getByRole("button", { name: "Add block" }).click();
    await page.getByRole("menuitem", { name: /^Cool-down/ }).click();
    await page.getByRole("combobox", { name: /^Between blocks/ }).click();
    await page.getByRole("option", { name: "1 min", exact: true }).click();
    await page.getByRole("button", { name: /^save session/i }).click();
    await page.waitForTimeout(1500);
    await page.goto(session);
    await page.getByRole("table", { name: "Session timeline" }).waitFor({ timeout: 20000 });
    await page.getByRole("table", { name: "Session timeline" }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `timing-task8-session-${tag}-${scheme}.png`, fullPage: true });
    // The bench sheet print view on desktop and mobile (spec "Visual"): on screen, then as printed.
    await page.goto(session + "/print");
    await page.getByRole("button", { name: "Print" }).waitFor({ timeout: 20000 });
    await page.waitForTimeout(1500);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    console.log(scheme, tag, "bench sheet horizontal overflow px:", overflow);
    await page.screenshot({ path: `timing-task8-bench-${tag}-${scheme}.png`, fullPage: true });
    await page.emulateMedia({ media: "print" });
    await page.screenshot({ path: `timing-task8-bench-print-${tag}-${scheme}.png`, fullPage: true });
    if (tag === "desktop" && scheme === "light") await page.pdf({ path: "timing-task8-bench.pdf", format: "Letter", preferCSSPageSize: true });
    await ctx.close();
  }
}
await browser.close();
```

Run it from the pwcheck directory. Expected: no `pageerror`; "bench sheet horizontal overflow px: 0" (or less) for every scheme and size.

Read every `timing-task8-*.png` and `timing-task8-bench.pdf`. Check: the timeline's start times include the 1-minute gaps; the rotating block shows its chip, "stays" on the goalie station, and the grid's clock times under it; the cool-down row has no link; the session page's sequence names "Stations · rotate every 5 min · 10 min"; the bench sheet header says "1 min between blocks", and the printed grid has borders and fits the page width; at 390 px the bench sheet (`timing-task8-bench-mobile-*` and `timing-task8-bench-print-mobile-*`) shows the header, the timeline and the grid without clipping or sideways scroll; the print-media shots are black on white in both schemes; dark mode reads cleanly on screen. Stop the preview server.

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add components/features/practice-planner/SessionTimeline.tsx "app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx" \
  components/features/practice-planner/print/BenchSheet.tsx "app/(print)/print.css" \
  __tests__/components/features/practice-planner/SessionTimeline.test.tsx __tests__/app/practice-session-detail-blocks.test.tsx \
  __tests__/components/features/practice-planner/print/BenchSheet.test.tsx
/usr/bin/git commit -m "feat(practice-planner): rotation chips, stays and grids on the session page and bench sheet" -m "Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 9: Bench sheet exports: rotation rows, grid tables and the gap

`buildBenchSheetModel` emits the third timeline row kind, a rotation block (header, stations with stays marked, then the grid), and a gap line for the header (spec R10). The HTML export prints the grid as an escaped table; the Word export writes it as a real table.

**Files:**
- Modify: `components/features/practice-planner/export/bench-sheet-model.ts` (`BenchSheetTimelineRow`, `BenchSheetModel.gap`, the timeline mapping)
- Modify: `components/features/practice-planner/export/bench-sheet-html.ts` (styles, `header`, `timeline`, new `rotationGrid`)
- Modify: `components/features/practice-planner/export/bench-sheet-docx.ts` (`header`, `cell`, `timeline`, new `gridTable`)
- Test (append or modify): `__tests__/components/features/practice-planner/export/bench-sheet-model.test.ts`, `bench-sheet-html.test.ts`, `bench-sheet-docx.test.ts`
- Screenshot script (scratchpad): `pwcheck/timing-task9.mjs`

**Interfaces:**
- Consumes (Task 1): `rotationTable`, `rotationBlockLabel`, `betweenBlocksLabel`, `staysSuffix`, `RotationTable`, `ROTATION_ALL` (the Word grid compares cells with it, never with a literal "all"); `buildSchedule(...).roundStarts`.
- Produces: `BenchSheetTimelineRow` gains `{ kind: "rotation"; start: string; minutes: number; label: string; stations: string[]; grid: RotationTable }`; `BenchSheetModel.gap: string | null`.

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/components/features/practice-planner/export/bench-sheet-model.test.ts`:

```ts
describe("buildBenchSheetModel: rotation and the gap (spec R10)", () => {
    const ROTATING: ExportSession = {
        ...UNBOOKED,
        transitionMinutes: 2,
        plays: [
            { ...play("Goalie", 0, 10, false, { playData: withPass("g") }), stays: true, rotateEveryMinutes: 5 },
            { ...play("Skate A", 1, 5, true), stays: false, rotateEveryMinutes: null },
            { ...play("Skate B", 2, 5, true), stays: false, rotateEveryMinutes: null },
        ],
    };
    const at = (minutes: number) => formatClockTime(new Date(new Date(ROTATING.date).getTime() + minutes * 60_000), undefined, false);

    it("emits a rotation row: its header, the stations with stays marked, and the grid at clock times", () => {
        const model = buildBenchSheetModel(ROTATING, renderers());
        expect(model.timeline).toEqual([
            {
                kind: "rotation",
                start: at(0),
                minutes: 10,
                label: "Stations · rotate every 5 min · 10 min",
                stations: ["Goalie · stays", "Skate A", "Skate B"],
                grid: {
                    columns: ["Goalie", "Skate A", "Skate B"],
                    rows: [
                        { start: at(0), cells: ["all", "A", "B"] },
                        { start: at(5), cells: ["all", "B", "A"] },
                    ],
                },
            },
        ]);
        expect(model.drills.map((d) => d.station)).toEqual(["Station 1 of 3", "Station 2 of 3", "Station 3 of 3"]);
    });

    it("says the gap for the header only when there is one", () => {
        expect(buildBenchSheetModel(ROTATING, renderers()).gap).toBe("2 min between blocks");
        expect(buildBenchSheetModel(UNBOOKED, renderers()).gap).toBeNull();
    });
});
```

In `__tests__/components/features/practice-planner/export/bench-sheet-html.test.ts` and `bench-sheet-docx.test.ts`, add `gap: null,` to the `MODEL` fixture, then append to the HTML test:

```ts
describe("renderBenchSheetHtml: rotation and the gap (spec R10)", () => {
    const ROTATION = {
        kind: "rotation" as const,
        start: "6:00 PM",
        minutes: 10,
        label: "Stations · rotate every 5 min · 10 min",
        stations: ["Goalie <G> · stays", "Skate A", "Skate B"],
        grid: {
            columns: ["Goalie <G>", "Skate A", "Skate B"],
            rows: [
                { start: "6:00 PM", cells: ["all", "A", "B"] },
                { start: "6:05 PM", cells: ["all", "B", "A"] },
            ],
        },
    };

    it("says the gap in the header", () => {
        const doc = parse(renderBenchSheetHtml({ ...MODEL, gap: "2 min between blocks" }));
        expect(doc.querySelector("header .gap")?.textContent).toBe("2 min between blocks");
        expect(parse(renderBenchSheetHtml(MODEL)).querySelector("header .gap")).toBeNull();
    });

    it("prints a rotation block's header, its stations and its grid as a table, every name escaped", () => {
        const doc = parse(renderBenchSheetHtml({ ...MODEL, timeline: [ROTATION] }));
        const cell = doc.querySelector("tbody td:nth-child(3)");
        expect(cell?.querySelector("strong")?.textContent).toBe("Stations · rotate every 5 min · 10 min");
        expect([...(cell?.querySelectorAll("li") ?? [])].map((li) => li.textContent)).toEqual(["Goalie <G> · stays", "Skate A", "Skate B"]);
        const grid = cell?.querySelector("table.rotation");
        expect([...(grid?.querySelectorAll("tr") ?? [])].map((tr) => tr.textContent)).toEqual([
            "StartGoalie <G>Skate ASkate B",
            "6:00 PMallAB",
            "6:05 PMallBA",
        ]);
        expect(doc.querySelector("g")).toBeNull();
    });
});
```

Append to the Word test:

```ts
describe("renderBenchSheetDocx: rotation and the gap (spec R10)", () => {
    it("writes the gap in the header and a rotation block's grid as a real table", async () => {
        const xml = await documentXml({
            ...MODEL,
            gap: "2 min between blocks",
            timeline: [{
                kind: "rotation",
                start: "6:00 PM",
                minutes: 10,
                label: "Stations · rotate every 5 min · 10 min",
                stations: ["Goalie · stays", "Skate A", "Skate B"],
                grid: { columns: ["Goalie", "Skate A", "Skate B"], rows: [{ start: "6:00 PM", cells: ["all", "A", "B"] }, { start: "6:05 PM", cells: ["all", "B", "A"] }] },
            }],
        });
        expect(xml).toContain("2 min between blocks");
        expect(xml).toContain("Stations · rotate every 5 min · 10 min");
        expect(xml).toContain("Goalie · stays");
        // The timeline table, plus the grid nested in its third cell.
        expect(xml.match(/<w:tbl>/g)).toHaveLength(2);
        expect(xml).toMatch(/>all</);
    });
});
```

Run: `bun run test __tests__/components/features/practice-planner/export`
Expected: FAIL. The model has no rotation row or gap, and neither export renders one.

- [ ] **Step 2: Emit rotation rows and the gap in the model**

In `components/features/practice-planner/export/bench-sheet-model.ts`:
- imports: add `betweenBlocksLabel, rotationBlockLabel, rotationTable, staysSuffix, type RotationGrid, type RotationTable` from the timeline module;
- add the third member to `BenchSheetTimelineRow`:

```ts
    | {
          kind: "rotation";
          start: string;
          minutes: number;
          /** "Stations · rotate every 5 min · 15 min" */
          label: string;
          /** "Name", or "Name · stays" for a station that doesn't rotate */
          stations: string[];
          /** A Start column (each round's clock time) plus one column per station */
          grid: RotationTable;
      };
```

- add to `BenchSheetModel`, after `place`:

```ts
    /** "2 min between blocks", or null when there is no gap */
    gap: string | null;
```

- in `buildBenchSheetModel`, the timeline mapping reads `roundStarts` and handles a rotating block before the plain station block:

```ts
        timeline: rows.map(({ group, startsAt, roundStarts }): BenchSheetTimelineRow => {
            const head = group.stations[0];
            if (isBlockRow(head)) {
                return { kind: "block", start: time(startsAt), minutes: group.wallMinutes, label: blockTitle(head.kind, head.label), note: head.instructions?.trim() || null, stations: null };
            }
            const stations = drillRows(group.stations);
            const grid: RotationGrid<ExportSessionRow> | null = group.rotation;
            if (grid) {
                return {
                    kind: "rotation",
                    start: time(startsAt),
                    minutes: group.wallMinutes,
                    label: rotationBlockLabel(grid.minutes, group.wallMinutes),
                    stations: stations.map((sp) => `${sp.play.name}${staysSuffix(sp.stays)}`),
                    grid: rotationTable(grid, (row) => (isBlockRow(row) ? blockTitle(row.kind, row.label) : row.play.name), (_, round) => time(roundStarts[round])),
                };
            }
            const block = stations.length > 1;
            return {
                start: time(startsAt),
                minutes: group.wallMinutes,
                label: block ? stationsLabel(stations.length) : stations[0].play.name,
                stations: block ? stations.map((sp) => `${sp.play.name} · ${sp.duration} min`) : null,
            };
        }),
```

- in the returned object, after `place`: `gap: gap > 0 ? betweenBlocksLabel(gap) : null,`

- [ ] **Step 3: Print the grid in the HTML export**

In `components/features/practice-planner/export/bench-sheet-html.ts`:
- import `type RotationTable` from `@/lib/utils/session-timeline`;
- in `STYLES`, after the `td ul` rule:

```css
.rotation { width: auto; margin: 6px 0 2px; }
.rotation th, .rotation td { text-align: center; }
.gap { color: #37474F; }
```

- `header()` gains the gap line after the place line:

```ts
${model.gap ? html`<p class="gap">${model.gap}</p>` : null}
```

- add, above `timeline()`, the station list both station rows share (a plain station block and a rotation block print the same header and list; only the rotation adds its grid) and the grid:

```ts
/** A station block's header and its stations: a plain block's and a rotation block's alike. */
function stationList(label: string, stations: readonly string[]): Trusted {
    return html`<strong>${label}</strong><ul>${stations.map((station) => html`<li>${station}</li>`)}</ul>`;
}

/** A rotation block's grid: a Start column plus one column per station, a group or "all" in each cell. */
function rotationGrid(grid: RotationTable): Trusted {
    return html`<table class="rotation" border="1" cellpadding="3" cellspacing="0">
<thead><tr><th scope="col">Start</th>${grid.columns.map((column) => html`<th scope="col">${column}</th>`)}</tr></thead>
<tbody>${grid.rows.map((row) => html`<tr><td class="time">${row.start}</td>${row.cells.map((value) => html`<td>${value}</td>`)}</tr>`)}</tbody>
</table>`;
}
```

- `timeline()`'s third cell prints any station list once, and a rotation's grid after it:

```ts
            html`<tr><td class="time">${row.start}</td><td>${row.minutes}</td><td>${
                row.stations
                    ? html`${stationList(row.label, row.stations)}${row.kind === "rotation" ? rotationGrid(row.grid) : null}`
                    : html`${row.label}${row.kind === "block" && row.note ? html` · ${row.note}` : null}`
            }</td></tr>
`,
```

- [ ] **Step 4: Write the grid as a Word table**

In `components/features/practice-planner/export/bench-sheet-docx.ts`:
- import `ROTATION_ALL, type RotationTable` from `@/lib/utils/session-timeline`;
- `header()` adds `...(model.gap ? [new Paragraph({ children: textRuns(model.gap) })] : []),` after the place paragraph;
- `cell()` takes `children: Array<Paragraph | Table>`;
- add, above `timeline()`, the station paragraphs both station rows share, and the grid:

```ts
/** A station block's header and its stations: a plain block's and a rotation block's alike. */
function stationParagraphs(label: string, stations: readonly string[]): Paragraph[] {
    return [
        new Paragraph({ children: textRuns(label, { bold: true }) }),
        ...stations.map((station) => new Paragraph({ children: textRuns(`• ${station}`) })),
    ];
}

/** A rotation block's grid as a real table (spec R10): Start plus one column per station. */
function gridTable(grid: RotationTable): Table {
    const head = new TableRow({
        tableHeader: true,
        children: ["Start", ...grid.columns].map((label) => cell([new Paragraph({ children: textRuns(label, { bold: true, color: LEAGUE_BLUE }) })], true)),
    });
    const rows = grid.rows.map(
        (row) =>
            new TableRow({
                cantSplit: true,
                children: [
                    cell([new Paragraph({ children: textRuns(row.start, { font: MONO }) })]),
                    ...row.cells.map((value) => cell([new Paragraph({ children: textRuns(value, value === ROTATION_ALL ? {} : { bold: true }) })])),
                ],
            }),
    );
    return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [head, ...rows] });
}
```

- the timeline's third cell writes any station list once, and a rotation's grid after it; Word wants a paragraph after a table in a cell:

```ts
                    cell(
                        row.stations
                            ? [
                                  ...stationParagraphs(row.label, row.stations),
                                  ...(row.kind === "rotation" ? [gridTable(row.grid), new Paragraph({ children: [] })] : []),
                              ]
                            : [new Paragraph({ children: textRuns(row.kind === "block" && row.note ? `${row.label} · ${row.note}` : row.label) })],
                    ),
```

- [ ] **Step 5: Run the tests to verify they pass**

Run the Step 1 command again, then `bun run test && bun run type-check && bun run lint`.
Expected: PASS.

- [ ] **Step 6: Open both exports**

Rebuild and serve as in Task 6 Step 6. Write `pwcheck/timing-task9.mjs`, which repeats Task 8's setup (Skills Stations, Rotate on the three-station block, the goalie station Stays, a Cool-down, 1 min between blocks, save), then downloads both exports from the session page and renders the HTML one:

```js
import { chromium } from "playwright";
const exe = "/Users/markbeacom/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const browser = await chromium.launch({ executablePath: exe });
const BASE = "http://localhost:4199/";
const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 1000 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("pageerror", e.message));
await page.goto(BASE + "#/import");
await page.getByRole("button", { name: "Use template: Skills Stations" }).click();
await page.getByRole("button", { name: /save to my practices/i }).click();
await page.waitForURL(/#\/sessions\/[^/]+$/, { timeout: 20000 });
const session = page.url();
await page.goto(session + "/edit");
await page.getByLabel("Rotate", { exact: true }).nth(1).check();
await page.getByRole("group", { name: /Angles & Depth/ }).getByLabel("Stays", { exact: true }).check();
await page.getByRole("button", { name: "Add block" }).click();
await page.getByRole("menuitem", { name: /^Cool-down/ }).click();
await page.getByRole("combobox", { name: /^Between blocks/ }).click();
await page.getByRole("option", { name: "1 min", exact: true }).click();
await page.getByRole("button", { name: /^save session/i }).click();
await page.waitForTimeout(1500);
await page.goto(session);
for (const [item, file] of [[/bench sheet \(HTML\)/, "timing-task9.html"], [/Word document/, "timing-task9.docx"]]) {
  await page.getByRole("button", { name: "Export plan" }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: item }).click()]);
  await download.saveAs(file);
  await page.waitForTimeout(500);
}
await page.goto("file://" + process.cwd() + "/timing-task9.html");
await page.screenshot({ path: "timing-task9-html-desktop-light.png", fullPage: true });
await browser.close();
```

Run it from the pwcheck directory, then `unzip -p timing-task9.docx word/document.xml | grep -o "<w:tbl>" | wc -l`.
Expected: no `pageerror`; at least 2 tables in the Word document (the timeline and the grid).

Read `timing-task9-html-desktop-light.png`. Check: the header says "1 min between blocks"; the rotation block shows "Stations · rotate every 5 min · 10 min", "Angles & Depth: Five-Spot Shooting · stays", and a bordered grid with clock times; the cool-down row reads "Cool-down". Open `timing-task9.docx` once in a Word-compatible viewer if one is available (`qlmanage -p timing-task9.docx` on macOS) and confirm the grid is a table. Stop the preview server.

- [ ] **Step 7: Commit**

```bash
/usr/bin/git add components/features/practice-planner/export/bench-sheet-model.ts components/features/practice-planner/export/bench-sheet-html.ts \
  components/features/practice-planner/export/bench-sheet-docx.ts \
  __tests__/components/features/practice-planner/export/bench-sheet-model.test.ts __tests__/components/features/practice-planner/export/bench-sheet-html.test.ts \
  __tests__/components/features/practice-planner/export/bench-sheet-docx.test.ts
/usr/bin/git commit -m "feat(practice-planner): rotation grids and the gap in the bench sheet exports" -m "Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 10: Import previews and the starter templates

The import preview (one shared `PlanPreview`, so both apps) names a rotation, marks stays stations and says the gap. The three starter templates use real rotation (`rotateEveryMinutes`, `stays`) in place of "rotate every N minutes" text, each closes with a cool-down after opening with its warm-up drill block, and Skills Stations fills 60 of 60 minutes (spec R12).

Template arithmetic (each rotating block: M × rotating stations; a stays station lasts the block):

| Template | Rows (minutes) | Gap | Total |
|---|---|---|---|
| Skills Stations (60) | warm-up drills 8 · rotate 6: Angles & Depth stays 12, Stickhandling 6, Wrist-Shot Lanes 6 → 12 · Passing 8 · Small-area 12 · Stops & starts 5 · Cool-down 5 | 2 × 5 | 50 + 10 = **60** |
| Goalie & Skater Rotation (45) | warm-up drills 8 · rotate 6: Angles & Depth stays 12, Stickhandling 6, Puck protection 6 → 12 · Breakaways 10 · Small-area 12 · Cool-down 3 | 0 | **45** |
| Team Practice with Stations (60) | 3-Man Weave 8 · rotate 5: Angles & Depth stays 10, Transitions 5, Puck protection 5 → 10 · rotate 6: Rebound control stays 12, Stickhandling 6, Wrist-Shot Lanes 6 → 12 · Point shot 10 · Breakout 10 · Cool-down 5 | 1 × 5 | 55 + 5 = **60** |

Every station's time sits in its drill's stated range: Angles & Depth 10–15, Rebound control 10–15, Stickhandling 5–6, Wrist-Shot Lanes 5–8, Puck protection 5–6, Transitions 5–8, Goalie Warm-Up 5–8, Edges 6–8, Passing 8, Small-area 10–12, Stops & starts 4–5, Breakaways 8–10.

Accepted deviation from R12's "the rest of each practice stays as it is" (ruling R9; recorded under Self-Review, spec gaps): the station blocks get shorter, Skills Stations 15 → 12 and Team Practice 15 → 10 and 15 → 12, because a stays goalie station lasts the block and only the two skater stations rotate (2 × M). The totals are verified above: 60 of 60, 45 of 45, 60 of 60.

**Files:**
- Modify: `components/features/practice-planner/PlanPreview.tsx`
- Modify (replace the builder and the data): `lib/data/starter-templates.ts`
- Modify: `components/features/practice-planner/StarterTemplatePicker.tsx` (the drill count)
- Modify (replace whole file): `__tests__/lib/data/starter-templates.test.ts`
- Test (create): `__tests__/components/features/practice-planner/PlanPreview.test.tsx`
- Test (append): `__tests__/components/features/practice-planner/StarterTemplatePicker.test.tsx`
- Screenshot script (scratchpad): `pwcheck/timing-task10.mjs`

**Interfaces:**
- Consumes (Task 1): `rotationBlockLabel`, `rotatesEveryLabel`, `betweenBlocksLabel`, `STAYS_MARK`, `rotatingStations`, `MIN_ROTATING_STATIONS`, `sessionRowsError`, `drillRows`, `isDrillRow`. (Task 5): `PlanDrillInput`, `PlanBlockInput`, `PlanSessionInput.transitionMinutes`.
- Produces: the three templates' new data; nothing new for other tasks.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/components/features/practice-planner/PlanPreview.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

vi.mock("@/lib/utils/canvas/thumbnail-generator", () => ({ generateThumbnail: () => "data:image/png;base64,AA==" }));

import { PlanPreview } from "@/components/features/practice-planner/PlanPreview";
import { STARTER_TEMPLATES, starterTemplatePlan } from "@/lib/data/starter-templates";

const NOW = new Date("2026-10-04T18:00:00.000Z");

describe("PlanPreview: rotation and the gap", () => {
    it("names the rotation, marks the stays station, lists the cool-down and says the gap", () => {
        const skills = STARTER_TEMPLATES.find((template) => template.id === "template-skills-stations");
        if (!skills) throw new Error("Skills Stations is missing");
        render(
            <ThemeProvider theme={createTheme({ palette: { mode: "dark" } })}>
                <PlanPreview plan={starterTemplatePlan(skills, "openleague-static", NOW)} />
            </ThemeProvider>,
        );
        expect(screen.getByText("Stations · rotate every 6 min · 12 min")).toBeInTheDocument();
        expect(screen.getByText("stays")).toBeInTheDocument();
        expect(screen.getByText("Rotates every 6 min")).toBeInTheDocument();
        expect(screen.getByText("Cool-down")).toBeInTheDocument();
        expect(screen.getByText(/2 min between blocks/)).toBeInTheDocument();
        expect(screen.getByText(/Planned 60 of 60 min/)).toBeInTheDocument();
    });
});
```

Append to `__tests__/components/features/practice-planner/StarterTemplatePicker.test.tsx`:

```tsx
describe("StarterTemplatePicker: counts", () => {
    it("counts each template's drills, never its cool-down row", () => {
        render(<StarterTemplatePicker onUse={vi.fn()} />);
        const chips = STARTER_TEMPLATES.map((template) => {
            const card = screen.getByRole("heading", { name: template.name }).closest(".MuiCard-root");
            if (!(card instanceof HTMLElement)) throw new Error(`No card for ${template.name}`);
            return within(card).getByText(/^\d+ drills$/).textContent;
        });
        // Skills Stations 2 + 3 + 1 + 1 + 1 drills, Goalie & Skater 3 + 3 + 1 + 1, Team Practice 1 + 3 + 3 + 1 + 1;
        // each also has one cool-down row, which would make 9, 9 and 10 if rows were counted.
        expect(chips).toEqual(["8 drills", "8 drills", "9 drills"]);
    });
});
```

(Add `within` to the file's `@testing-library/react` import.)

Replace `__tests__/lib/data/starter-templates.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { STARTER_TEMPLATES, starterTemplatePlan } from "@/lib/data/starter-templates";
import { STARTER_PLAYS } from "@/lib/data/starter-plays";
import { parsePlan } from "@/lib/plan-document";
import { goalieMarkerCount } from "@/lib/utils/drill-tags";
import { drillRows, isDrillRow } from "@/lib/utils/session-rows";
import {
    MAX_STATIONS_PER_GROUP,
    MIN_ROTATING_STATIONS,
    goalieWarnings,
    groupStations,
    rotatingStations,
    sessionRowsError,
    sessionWallMinutes,
    stationWarnings,
} from "@/lib/utils/session-timeline";

const NOW = new Date("2026-10-03T18:00:00.000Z");

describe("starter templates", () => {
    it("ships three templates with stable unique ids and names", () => {
        expect(STARTER_TEMPLATES.map((t) => t.id)).toEqual([
            "template-skills-stations",
            "template-goalie-skater-rotation",
            "template-team-stations",
        ]);
        expect(new Set(STARTER_TEMPLATES.map((t) => t.name)).size).toBe(3);
    });

    it("Skills Stations fills its 60 minutes exactly (spec R12)", () => {
        const skills = STARTER_TEMPLATES.find((t) => t.id === "template-skills-stations");
        if (!skills) throw new Error("Skills Stations is missing");
        expect(sessionWallMinutes(skills.session.drills, skills.session.transitionMinutes)).toBe(60);
        expect(skills.session.durationMinutes).toBe(60);
    });

    describe.each(STARTER_TEMPLATES.map((t) => [t.name, t] as const))("%s", (_name, template) => {
        const rows = template.session.drills;
        const gap = template.session.transitionMinutes ?? 0;
        const groups = groupStations(rows, gap);

        it("serializes to a valid plan document for either app, stamped at use time, that round-trips unchanged", () => {
            for (const generator of ["openleague-static", "openleague-hosted"] as const) {
                const doc = starterTemplatePlan(template, generator, NOW);
                expect(doc.generator).toBe(generator);
                expect(doc.exportedAt).toBe(NOW.toISOString());
                const parsed = parsePlan(JSON.parse(JSON.stringify(doc)));
                expect(parsed.ok ? [] : parsed.error.issues).toEqual([]);
                expect(parsed.ok && parsed.plan).toEqual(doc);
            }
        });

        it("has a coaching description, fits its duration with blocks, rotation and gaps, and breaks no row rule", () => {
            expect(template.description.length).toBeGreaterThan(40);
            expect(sessionWallMinutes(rows, gap)).toBeLessThanOrEqual(template.session.durationMinutes);
            expect(sessionRowsError(rows)).toBeNull();
        });

        it("opens with a warm-up and closes with a cool-down", () => {
            const first = rows[0];
            expect(isDrillRow(first) ? `${first.name} ${first.instructions ?? ""}` : first.kind).toMatch(/warm/i);
            expect(rows[rows.length - 1].kind).toBe("cooldown");
        });

        it("has station blocks of 2–4 drills, each with a goalie station", () => {
            const blocks = groups.filter((group) => group.stations.length > 1);
            expect(blocks.length).toBeGreaterThan(0);
            for (const block of blocks) {
                expect(block.stations.length).toBeLessThanOrEqual(MAX_STATIONS_PER_GROUP);
                expect(drillRows(block.stations).some((station) => station.goalies === "required")).toBe(true);
            }
        });

        it("rotates with real rotation, never with instruction text", () => {
            const rotating = groups.filter((group) => group.rotation);
            expect(rotating.length).toBeGreaterThan(0);
            for (const group of rotating) expect(rotatingStations(group.stations).length).toBeGreaterThanOrEqual(MIN_ROTATING_STATIONS);
            for (const drill of drillRows(rows)) expect(drill.instructions ?? "", drill.name).not.toMatch(/rotate every|switch with .* at \d+ minutes/i);
        });

        it("puts stations on ice that doesn't overlap", () => {
            const withAreas = rows.map((row) => ({ ...row, area: isDrillRow(row) ? row.playData?.area : null }));
            expect(stationWarnings(groupStations(withAreas), null).overlaps).toEqual([]);
        });

        it("is built for one goalie and says so, so warnings work right after import", () => {
            expect(template.session.goaliesAttending).toBe(1);
            expect(goalieWarnings(groupStations(rows), template.session.goaliesAttending ?? null).short).toEqual([]);
        });

        it("never sends skaters to an empty net that the diagram shows a goalie in, without the second-goalie option", () => {
            for (const drill of drillRows(rows)) {
                if (!drill.playData || goalieMarkerCount(drill.playData) === 0) continue;
                const instructions = drill.instructions ?? "";
                if (instructions.includes("empty net")) expect(instructions, drill.name).toMatch(/second goalie/);
            }
        });

        it("gives each drill the time its own description states", () => {
            // One group's time on a drill: a stays station runs the whole block; a rotating
            // station runs the rotation's minutes; any other drill runs its own minutes.
            for (const group of groups) {
                for (const drill of drillRows(group.stations)) {
                    const stated = (drill.description ?? "").match(/(\d+)(?:–(\d+))? min\b/);
                    if (!stated) continue;
                    const [lo, hi] = [Number(stated[1]), Number(stated[2] ?? stated[1])];
                    const minutes = group.rotation ? (drill.stays ? group.wallMinutes : group.rotation.minutes) : drill.duration;
                    expect(minutes, drill.name).toBeGreaterThanOrEqual(lo);
                    expect(minutes, drill.name).toBeLessThanOrEqual(hi);
                }
            }
        });

        it("writes each rotating block's minutes as the editor would (M per rotating station, the block for a stays station)", () => {
            for (const group of groups.filter((g) => g.rotation)) {
                for (const drill of drillRows(group.stations)) {
                    expect(drill.duration, drill.name).toBe(drill.stays ? group.wallMinutes : group.rotation?.minutes);
                }
            }
        });

        it("uses starter drills verbatim", () => {
            for (const drill of drillRows(rows)) {
                const starter = STARTER_PLAYS.find((p) => p.name === drill.name);
                expect(starter, drill.name).toBeDefined();
                expect(drill).toMatchObject({
                    description: starter!.description,
                    focus: starter!.focus,
                    goalies: starter!.goalies,
                    playData: starter!.playData,
                });
            }
        });
    });
});
```

Run: `bun run test __tests__/lib/data/starter-templates.test.ts __tests__/components/features/practice-planner/PlanPreview.test.tsx __tests__/components/features/practice-planner/StarterTemplatePicker.test.tsx`
Expected: FAIL. The templates have no rotation, gap or cool-down, Skills Stations plans 48 minutes, and the preview shows no rotation.

- [ ] **Step 2: Rebuild the templates with rotation and cool-downs**

In `lib/data/starter-templates.ts`, replace the module's doc comment, imports, `Station`, `practice`, the two rotation-text constants and `STARTER_TEMPLATES` (keep `StarterTemplate`, `starter` and `starterTemplatePlan`):

```ts
/**
 * Starter practice templates (goaltender-aware drills, spec R10; practice
 * timing, spec R12): station practices built from starter drills. Each opens
 * with a warm-up drill block, closes with a cool-down, and rotates its skater
 * groups through station blocks while the goalie station stays put.
 *
 * Plain plan-document inputs. A template becomes a PlanDocument only when a
 * coach uses it (starterTemplatePlan), so the generator is the running app's
 * and exportedAt is "now". Both import flows then re-parse it like any file.
 */
import {
    serializePlan,
    type PlanBlockInput,
    type PlanDocument,
    type PlanDrillInput,
    type PlanGenerator,
    type PlanSessionInput,
} from "@/lib/plan-document";
import { STARTER_PLAYS, type StarterPlay } from "@/lib/data/starter-plays";
import type { BlockKind } from "@/types/practice-planner";

export interface StarterTemplate {
    /** Stable slug */
    id: string;
    name: string;
    description: string;
    session: PlanSessionInput;
}

interface Station {
    /** A starter drill id */
    drill: string;
    /** In a rotating block: the rotation's minutes, or the whole block for a stays station */
    minutes: number;
    instructions?: string;
    /** Doesn't rotate: the goalie station */
    stays?: boolean;
}

/** One block: its first drill runs on its own, the rest run with it as stations, rotating every N minutes when set. */
interface DrillBlock {
    stations: Station[];
    rotateEveryMinutes?: number;
}

/** A warm-up, water break, transition or cool-down row. */
interface TimeBlock {
    block: BlockKind;
    minutes: number;
    note?: string;
}

function starter(id: string): StarterPlay {
    const found = STARTER_PLAYS.find((play) => play.id === id);
    if (!found) throw new Error(`Unknown starter drill "${id}" in a starter template`);
    return found;
}

/**
 * Every template is built for one goalie, so goalies attending starts at 1 and
 * the goalie warnings work as soon as it is imported; the coach can change it in Edit.
 */
function practice(title: string, durationMinutes: number, transitionMinutes: number, rows: Array<DrillBlock | TimeBlock>): PlanSessionInput {
    let sequence = 0;
    const drills = rows.flatMap((row): Array<PlanDrillInput | PlanBlockInput> => {
        if ("block" in row) {
            return [{ kind: row.block, sequence: sequence++, duration: row.minutes, runsWithPrevious: false, instructions: row.note ?? null, label: null }];
        }
        return row.stations.map((station, slot): PlanDrillInput => {
            const play = starter(station.drill);
            return {
                sequence: sequence++,
                duration: station.minutes,
                runsWithPrevious: slot > 0,
                instructions: station.instructions ?? "",
                name: play.name,
                description: play.description,
                focus: play.focus,
                goalies: play.goalies,
                stays: station.stays ?? false,
                rotateEveryMinutes: slot === 0 ? (row.rotateEveryMinutes ?? null) : null,
                playData: play.playData,
            };
        });
    });
    return { title, durationMinutes, date: null, startTime: null, goaliesAttending: 1, transitionMinutes, drills };
}

const EMPTY_NET = "If a second goalie is free, put them in net; otherwise shoot at the empty net or targets.";
const SMALL_AREA = "Goalie in net; 30–40 second shifts.";

export const STARTER_TEMPLATES: readonly StarterTemplate[] = [
    {
        id: "template-skills-stations",
        name: "Skills Stations",
        description:
            "A 60-minute skills practice for one goalie and any number of skaters: a goalie warm-up alongside skater edge work, a station block where the goalie stays on angles while two skater groups rotate between stickhandling and shooting every 6 minutes, then passing, small-area battles, a conditioning finish and a cool-down, with 2 minutes between blocks.",
        session: practice("Skills Stations", 60, 2, [
            {
                stations: [
                    { drill: "starter-goalie-warmup", minutes: 8, instructions: "A coach warms up the goalies while the skaters work edges." },
                    { drill: "starter-skate-edges-crossovers", minutes: 8 },
                ],
            },
            {
                rotateEveryMinutes: 6,
                stations: [
                    { drill: "starter-goalie-angles-depth", minutes: 12, stays: true },
                    { drill: "starter-skate-stickhandling", minutes: 6 },
                    { drill: "starter-skate-wrist-shots", minutes: 6, instructions: EMPTY_NET },
                ],
            },
            { stations: [{ drill: "starter-skate-passing-lanes", minutes: 8 }] },
            { stations: [{ drill: "starter-skate-small-area-2v2", minutes: 12, instructions: SMALL_AREA }] },
            { stations: [{ drill: "starter-skate-stops-starts", minutes: 5 }] },
            { block: "cooldown", minutes: 5, note: "Easy laps, then stretch." },
        ]),
    },
    {
        id: "template-goalie-skater-rotation",
        name: "Goalie & Skater Rotation",
        description:
            "A 45-minute practice that keeps the goalie working the whole time: a goalie warm-up beside two skating stations, then goalie angles while two skater groups rotate between stickhandling and puck protection every 6 minutes, then breakaways, a small-area game and a short cool-down.",
        session: practice("Goalie & Skater Rotation", 45, 0, [
            {
                stations: [
                    { drill: "starter-goalie-warmup", minutes: 8, instructions: "A coach warms up the goalies." },
                    { drill: "starter-skate-transitions", minutes: 8, instructions: "Half the skaters; the other half work edges." },
                    { drill: "starter-skate-edges-crossovers", minutes: 8, instructions: "Half the skaters; the other half work pivots." },
                ],
            },
            {
                rotateEveryMinutes: 6,
                stations: [
                    { drill: "starter-goalie-angles-depth", minutes: 12, stays: true, instructions: "A coach shoots from the five spots." },
                    { drill: "starter-skate-stickhandling", minutes: 6 },
                    { drill: "starter-skate-puck-protection", minutes: 6 },
                ],
            },
            { stations: [{ drill: "starter-goalie-breakaways", minutes: 10 }] },
            { stations: [{ drill: "starter-skate-small-area-2v2", minutes: 12, instructions: SMALL_AREA }] },
            { block: "cooldown", minutes: 3, note: "Easy laps." },
        ]),
    },
    {
        id: "template-team-stations",
        name: "Team Practice with Stations",
        description:
            "A 60-minute team practice: the 3-man weave to warm up skaters and goalie, two rotating station blocks with the goalie staying on angles and then on rebounds, the full team on point shots with a screen and breakouts, and a cool-down, with a minute between blocks.",
        session: practice("Team Practice with Stations", 60, 1, [
            { stations: [{ drill: "starter-3man-weave", minutes: 8, instructions: "Finish on the goalie to warm everyone up." }] },
            {
                rotateEveryMinutes: 5,
                stations: [
                    { drill: "starter-goalie-angles-depth", minutes: 10, stays: true },
                    { drill: "starter-skate-transitions", minutes: 5 },
                    { drill: "starter-skate-puck-protection", minutes: 5 },
                ],
            },
            {
                rotateEveryMinutes: 6,
                stations: [
                    { drill: "starter-goalie-rebound-control", minutes: 12, stays: true },
                    { drill: "starter-skate-stickhandling", minutes: 6 },
                    { drill: "starter-skate-wrist-shots", minutes: 6, instructions: EMPTY_NET },
                ],
            },
            { stations: [{ drill: "starter-point-shot-screen", minutes: 10 }] },
            { stations: [{ drill: "starter-breakout-5man", minutes: 10 }] },
            { block: "cooldown", minutes: 5, note: "Easy laps, then stretch." },
        ]),
    },
];
```

In `components/features/practice-planner/StarterTemplatePicker.tsx`, import `drillRows` and count drills only: `` label={`${drillRows(template.session.drills).length} drills`} ``.

- [ ] **Step 3: Show rotation and the gap in `PlanPreview`**

In `components/features/practice-planner/PlanPreview.tsx`:
- import `STAYS_MARK, betweenBlocksLabel, rotatesEveryLabel, rotationBlockLabel` from the timeline module;
- the subtitle says the gap when there is one:

```tsx
                {[
                    `${session.duration} min`,
                    ...(session.transitionMinutes > 0 ? [betweenBlocksLabel(session.transitionMinutes)] : []),
                    plannedLabel(sessionWallMinutes(session.plays, session.transitionMinutes), session.duration),
                ].join(" · ")}
```

- in the station-block branch, the overline names a rotation:

```tsx
                                {stations.length > 1 && (
                                    <Typography variant="overline" color="secondary.main">
                                        {group.rotation
                                            ? rotationBlockLabel(group.rotation.minutes, group.wallMinutes)
                                            : stationBlockLabel(stations.length, group.wallMinutes)}
                                    </Typography>
                                )}
```

- and a station's minutes line reads its rotation (`const rotation = group.rotation;` before the `stations.map`):

```tsx
                                        const timing = rotation ? (play.stays ? STAYS_MARK : rotatesEveryLabel(rotation.minutes)) : `${play.duration} min`;
```

  with the secondary text `{play.instructions ? `${timing} · ${play.instructions}` : timing}`.

- [ ] **Step 4: Run the tests to verify they pass**

Run the Step 1 command again, then `bun run test && bun run type-check && bun run lint`.
Expected: PASS. The template-reading tests already handle the cool-down and rotation: `import-screen.test.tsx` walks `drillRows` and sends `toSessionRowInputs` with each row's own minutes (Tasks 2 and 4), `StarterTemplatePicker.test.tsx` walks `drillRows` (Task 5), and `PlanImportView.test.tsx`'s `.some(…goalies === "required")` meets the required goalie warm-up before the cool-down.

- [ ] **Step 5: Screenshots: the import preview**

Rebuild and serve as in Task 6 Step 6. Write `pwcheck/timing-task10.mjs`:

```js
import { chromium } from "playwright";
const exe = "/Users/markbeacom/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const browser = await chromium.launch({ executablePath: exe });
const BASE = "http://localhost:4199/";
for (const scheme of ["light", "dark"]) {
  for (const [w, h, tag] of [[1280, 1000, "desktop"], [390, 844, "mobile"]]) {
    const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.log("pageerror", e.message));
    await page.goto(BASE + "#/import");
    await page.getByRole("button", { name: "Use template: Team Practice with Stations" }).click();
    await page.getByRole("list", { name: "Drills in this plan" }).waitFor({ timeout: 20000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `timing-task10-preview-${tag}-${scheme}.png`, fullPage: true });
    await page.getByRole("button", { name: /save to my practices/i }).click();
    await page.waitForURL(/#\/sessions\/[^/]+$/, { timeout: 20000 });
    await page.getByRole("table", { name: "Session timeline" }).waitFor({ timeout: 20000 });
    await page.screenshot({ path: `timing-task10-session-${tag}-${scheme}.png`, fullPage: true });
    await ctx.close();
  }
}
await browser.close();
```

Run it from the pwcheck directory. Expected: no `pageerror`.

Read every `timing-task10-*.png`. Check: the preview's subtitle reads "60 min · 1 min between blocks · Planned 60 of 60 min"; both station blocks say "Stations · rotate every … min · … min", each goalie station says "stays" and the others "Rotates every … min"; the cool-down row has its icon and "5 min · Easy laps, then stretch."; the saved session's timeline shows the same with the grids; nothing overflows at 390 px; dark mode reads cleanly. Stop the preview server.

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add components/features/practice-planner/PlanPreview.tsx lib/data/starter-templates.ts \
  components/features/practice-planner/StarterTemplatePicker.tsx __tests__/lib/data/starter-templates.test.ts \
  __tests__/components/features/practice-planner/PlanPreview.test.tsx __tests__/components/features/practice-planner/StarterTemplatePicker.test.tsx
/usr/bin/git commit -m "feat(practice-planner): rotating station templates with cool-downs, and rotation in the import preview" -m "Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 11: Gates

Every repository gate, run in CI order. Fix forward in the task that owns a failure; never skip a gate or weaken a test.

**Files:** none new. This task changes code only if a gate fails.

- [ ] **Step 1: Regenerate the Prisma client, then type-check and lint**

```bash
bun run db:generate
bun run type-check
bun run lint
```

Expected: all three exit 0. A Zod v4 deprecation hint (★) in an IDE is not an error; the CLI result is what counts.

- [ ] **Step 2: Run the full suite**

Run: `bun run test`
Expected: PASS. If an unrelated test fails, check `gh run list --branch main --limit 5` first: a red `main` is not this branch's regression. A failure that names a date is clock rot; pin it with `vi.setSystemTime`, never by editing fixtures' dates.

- [ ] **Step 3: Build both deployables**

```bash
bun run build
bun run planner:build && bun run planner:check
```

Expected: both succeed.
- `next build` catches route and RSC-boundary errors that type-check misses.
- `planner:check` (`scripts/check-planner-build.ts`) confirms the static bundle still carries the plan format, loads `docx` only lazily, and has no Next.js runtime, telemetry or analytics. The new shared modules (`lib/utils/session-rows.ts`, `BlockRowCard`, `AddBlockMenu`, `BetweenBlocksField`, `SessionDetailsFields`, `StationBlockHeader`, `RotationGridTable`, `useSessionRowEdits`, `useBetweenBlocks`) must keep it that way. If the Vite build fails on a server-only import, the offending import is in a shared module and must move out of it.

- [ ] **Step 4: Check portability, palette tokens and the seams**

```bash
rg -n 'from "next/|@/lib/actions|@prisma/client' lib/utils/session-rows.ts \
  components/features/practice-planner/{BlockRowCard,AddBlockMenu,BetweenBlocksField,SessionDetailsFields,StationBlockHeader,RotationGridTable}.tsx \
  components/features/practice-planner/{useSessionRowEdits,useBetweenBlocks}.ts
rg -n '#[0-9A-Fa-f]{3,6}\b' components/features/practice-planner/{BlockRowCard,AddBlockMenu,BetweenBlocksField,SessionDetailsFields,StationBlockHeader,RotationGridTable}.tsx
rg -n 'drillRows\(session\.plays\)\.map\(toDrillRowInput\)|export check covers the drill rows|has no block entries yet' app apps components lib
```

Expected: no output from any of the three (no server or Next import in a portable module, no hard-coded colour in an on-screen component, and every seam from Global Constraints removed).

- [ ] **Step 5: Run the ADR and SQL policy checks**

```bash
bun run adr:lint
bun run adr:check-integrity
bun run check:raw-sql
bun run adr:check prisma/schema.prisma prisma/migrations/20261004120000_practice_session_timing/migration.sql \
  lib/plan-document/document.ts lib/data/starter-templates.ts apps/planner/src/store/sessions.ts \
  components/features/practice-planner/PracticeSessionEditor.tsx
```

Expected:
- the first three exit 0;
- `adr:check` lists ADR-0003 (Prisma only: the migration is the sanctioned place for SQL), ADR-0004 (MUI) and ADR-0020 (amended in Task 5) as governing, with no violation.

- [ ] **Step 6: Check the line budgets and the working tree**

```bash
wc -l components/features/practice-planner/PracticeSessionEditor.tsx "app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx"
/usr/bin/git status --short
```

Expected:
- both files are ≤ 900 lines (the editor about 790 after Task 6, the session page about 750);
- `git status` shows nothing. If `CLAUDE.md` appears modified by `next dev`, leave it out of every commit.

- [ ] **Step 7: Final screenshots for the PR**

With the static planner served as in Task 6 Step 6, re-run `timing-task6.mjs`, `timing-task7.mjs`, `timing-task8.mjs` and `timing-task10.mjs` against the final build and read every PNG once more: the editor, the session page, the bench sheet print view and the import preview, light and dark, desktop and mobile (spec "Visual"). Stop the preview server.

- [ ] **Step 8: Commit any gate fixes**

Only if Steps 1–7 required changes. Stage the exact files by path:

```bash
/usr/bin/git add <the files you changed>
/usr/bin/git commit -m "fix(practice-planner): <what the gate caught>" -m "Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

## Self-Review

**Spec coverage:**

| Spec item | Task |
|---|---|
| R1 one list with a row kind; kinds and defaults; `SessionRow = DrillRow \| BlockRow` | 1 (vocabulary, types), 2 (switch, every reader) |
| R2 columns, CHECKs incl. `(kind = 'drill') = ("playId" IS NOT NULL)`, deferred FK kept, migration test against the schema | 3 |
| R3 row rules: block flags, rotation placement, < 2 rotating stations, stays, minutes, absent = unchanged | 1 (`normalizeGroups`, `settleRotations`, `sessionRowsError`, `withStoredTiming`), 3 (Zod, server), 4 (static), 5 (import), 7 (editor save) |
| R4 `blockMinutes`, `rotationGrid`, `buildSchedule` with gaps and rounds, `sessionWallMinutes`, goalie demand | 1 |
| R5 copy paths: duplicate, detach, materialize, export/import both apps, static copies; guard from the select | 3 (duplicate, materialize; detach repoints by `playId` only, so a row keeps its new columns and block rows never match, with a test), 4 (static), 5 (plan files) |
| R6 plan document fields, lenient reads, block entry shape, `MAX_PLAN_DRILLS`, compatibility, ADR-0020 amendment | 5 |
| R7 static records, legacy defaults, absent = unchanged, no IndexedDB bump, both repos | 4 |
| R8 editor: Add block, block card, Rotate / M / summary / grid, Stays, can't-rotate note, Between blocks, 44 px, palette, extraction first | 2 (block card), 6 (Add block, Between blocks, extraction), 7 (rotation) |
| R9 session page: block rows, gaps folded, rotation chip, stays, grid, sequence and diagram skip blocks, Planned X of Y | 2 (blocks, gaps, skips), 8 (rotation) |
| R10 bench sheet: three row kinds, rotation header, grid as a table, gap in the header, HTML escaping, Word table | 2 (block rows), 8 (live print), 9 (model, HTML, Word) |
| R11 emails list blocks; every `sp.play` reader narrows | 2 (readers), 3 (emails, list query, dashboard count) |
| R12 templates: rotation fields, warm-up/cool-down, Skills Stations 60/60, invariant tests | 10 |
| Success criteria 1–6 | 6 (1), 7 (2), 6/8 (3), 1/2/8 (4), 3/4/5 (5: legacy rows and files read as before), 10 (6) |
| Testing: pure, Zod/plan, migration, actions, static, components, exports, emails, visual | 1, 3/5, 3, 3, 4, 2/6/7/8/10, 9, 3, 6/7/8/9/10/11 |

**Spec gaps and conflicts, and how this plan resolves them:**
- Row minutes (1–300, as today) and the practice-plan emails (a drill count plus one "Also planned: Warm-up · 8 min, …" line, R11) match the amended spec; nothing to resolve. The emails, the hosted list and the dashboard schedule count drill rows only (Task 3).
- A drill flagged `runsWithPrevious` directly after a block row is not covered by R3. Ruling: normalization clears it, and `sessionRowsError` rejects it with `BLOCK_STATION_ERROR` (a block row neither joins nor is joined by a station block).
- R3 says a block with fewer than 2 rotating stations is "cleared on save" by the editor; the plan also has the server, the static store and the importer reject it (`ROTATION_TOO_FEW_ERROR`), so all three stores agree. `stays` outside a rotating block is ignored, as R3 says, never rejected; the server and the static store store it as sent and don't rewrite minutes (they reject rather than normalize), and only the editor's `normalizeGroups` clears it and writes M.
- The spec's success criterion "3 stations × 5 min" uses three rotating stations; a stays goalie station is not one of them. The templates (Task 10) mark the goalie station stays, so their blocks are 2 × M; the table in Task 10 shows the arithmetic.
- **R12 deviation, accepted (ruling R9):** R12 says "the rest of each practice stays as it is", but with a stays goalie station each template's station block becomes 2 × M, so the blocks get shorter: Skills Stations 15 → 12 min, Team Practice 15 → 10 and 15 → 12 min. The practices still fill 60 of 60, 45 of 45 and 60 of 60 minutes (the Task 10 table, checked by its tests).
- Absent = unchanged for per-row fields in a whole-list save: the server and the static store resolve a drill row's missing `stays` / `rotateEveryMinutes` from the stored row with the same play (`withStoredTiming`) before validating, so an older client never wipes them. Keying by `playId` relies on the accepted invariant in Global Constraints (one stored row per play copy, ruling R5).
- A list edit that gives a rotating block a new first drill (a reorder, a delete, a join) is not covered by R3. Ruling R4: the block's new first drill takes the rotation, so its stays ticks stay (Task 1); a split leaves the rotation with the original first drill.

**Placeholder scan:** none. Every code step carries the code; steps that edit large existing files name the block and show the new lines. The only `<…>` text is the gate-fix commit template in Task 11, which by design names what a gate caught.

**Type consistency:**
- `isDrillRow` / `isBlockRow` / `drillRows`, `blockTitle`, `toSessionRowInputs`, `toDrillRowInput`, `withStoredTiming`, `applyRowEdit` and `newBlockItem` (Task 1) are used with the same signatures in Tasks 2–10.
- `groupStations(plays, transitionMinutes)`, `buildSchedule(plays, start, transitionMinutes)` (with `roundStarts`), `sessionWallMinutes(plays, transitionMinutes)`, `rotationGrid` / `rotationTable(grid, name, start)` and the label helpers are defined once (Task 1).
- `SessionItem` (editor) and `SessionRow` (views) are switched in Task 2; `ExportSessionRow`, `SessionTimelinePlay`, `PlanDrillInput | PlanBlockInput` and `PlanEditorDrill | PlanEditorBlock` are their structural counterparts, each with `kind?: "drill"` on the drill member so older fixtures still type-check.
- `PlanBlockInput.runsWithPrevious: false` keeps plan rows assignable to `TimelinePlay`; `BlockRowInput` (the save payload) has no `runsWithPrevious` and the stores force it false.
- `useSessionRowEdits` grows from four functions (Task 6) to six (Task 7); `SessionDrillList`'s `onAddBlock`, `onSetRotation`, `onSetStays` and `transitionMinutes` props match the hook's names.
- `BenchSheetTimelineRow` grows from two members (Task 2) to three (Task 9); `BenchSheetModel.gap` arrives in Task 9 with the fixtures updated in the same task.

**Review Focus coverage:** item 1 → Tasks 3, 4 and 6; item 2 → Tasks 3, 4 and 5; item 3 → Tasks 2 and 3; item 4 → Tasks 1, 3, 4, 5 and 7; item 5 → Task 5.

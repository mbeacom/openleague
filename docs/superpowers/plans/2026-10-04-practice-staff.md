# Practice Staff Assignments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A coach lists a practice's staff (team officials, team admins and typed volunteer names) and assigns 0–4 of them to any row; the names show on the editor, the session page, the bench sheet and its HTML/Word exports, the import preview and plan files, and linked officials and admins see "Your stations" in the practice emails, in both planners.

**Architecture:**
- Two new hosted tables: `practice_session_staff` (the per-practice list, optionally linked to a `TeamOfficial` or an admin `User`) and `practice_session_play_staff` (row → staff, ordered). Rows never store names: every reader resolves a row's staff keys against the session's list (spec R11).
- All rules and labels live in one pure module, `lib/utils/session-staff.ts`, shared by the server actions, the static store, the plan document, the email templates and the portable components. Database work that runs inside a save's transaction lives in `lib/services/practice-session-staff.ts`.
- Saves carry `staff` beside `plays`. Present: the list is replaced whole (keys that are stored ids keep their id) and each row's keys become assignments. Absent: the stored staff is untouched and each row's assignments are carried across `updatePracticeSession`'s delete-and-recreate of the rows by a defined row identity (Global Constraints, "Row identity").
- The static store keeps typed names in its IndexedDB records (database version 3, a no-op upgrade). The plan document gains optional name lists (`PLAN_VERSION` stays 1), amended in ADR-0020.

**Tech Stack:** TypeScript (strict), Next.js 16 App Router, React 19, MUI v7, Prisma 7 (Neon/PostgreSQL), Zod v4, Vite (static planner), Vitest + Testing Library, fake-indexeddb, `docx`, Playwright (screenshots only, from the scratchpad), Bun.

**Spec:** `docs/superpowers/specs/2026-10-04-practice-staff-design.md`. Its rulings R1–R11 are referenced below.

## Global Constraints

- Use `bun` for every script (`bun run …`), never npm or yarn.
- Use `/usr/bin/git`. Never `git stash`. Never switch branches (work on `feat/practice-staff`). Stage files by path, never `git add -A` or `git add .`, because `next dev` can rewrite `CLAUDE.md`.
- Never run `prisma migrate dev`, `db:migrate`, `db:push` or `db:migrate:reset`. The migration is hand-written; `bun run db:generate` is the only Prisma command used locally.
- Migration folder: `prisma/migrations/20261005120000_practice_session_staff/` (it sorts after `20261004120000_practice_session_timing`, the latest). It only creates; it never alters an existing table, column or constraint.
- Limits (spec R2), exported from `types/practice-planner.ts`: `MAX_SESSION_STAFF = 12`, `MAX_ROW_STAFF = 4`, `STAFF_NAME_MAX = 60`; and `STAFF_KEY_MAX = 64` from `lib/utils/session-staff.ts` (a key is a stored id or an editor key, like `clientKey`).
- A staff name is stored as `cleanStaffName(name)` (control characters removed, trimmed), 1–60 characters. A longer name is refused, never cut, except where a name is *offered* (the hosted picker, `toStaffName`). Names are unique per practice ignoring case (`staffNameKey` = cleaned, `toLowerCase()`, the database's `lower("name")` index). A unique-index violation (`P2002`) on the staff insert is refused with `STAFF_NAME_TAKEN_MESSAGE`, never a generic error.
- **Absent = unchanged, explicit `[]` clears**, on every update path (hosted `updatePracticeSession`, static `updateSession`):
  - a save without `staff` keeps the stored staff and every row's assignments, even though the rows are rewritten; any `staff` keys on its rows are ignored;
  - a save with `staff` replaces the list; a row without `staff` then has nobody; `staff: []` clears the list and every assignment;
  - a create without `staff` stores none.
  Never write `?? []` / `?? null` for a field the code path does not own; reading a legacy record or file with defaults is the only place a default is filled.
- **Row identity (spec R3), verified against the code:**
  - *Hosted.* `updatePracticeSession` deletes every row (`practiceSessionPlay.deleteMany`) and creates them again, so row ids never survive a save, and `practice_session_play_staff.playRowId` cascades, so the delete removes every assignment. When `staff` is absent the action reads the stored assignments **before** that delete (`readCarriedRowStaff`) and writes them to the new rows (`carryRowStaff`, then `writeRowStaff`):
    - a drill row is identified by its owned play id. Evidence: `getPracticeSessionForEdit` loads `playId: sp.play.id`; `applySavedPlayIds` swaps the editor to the owned id after a save; `materializeSessionDrills` keeps an owned copy's id for its first row (`play.sessionId === input.sessionId && !kept.has(play.id)` → `keptId: play.id`) and `sessionPlayData` writes it. A session's stored drill rows each point at their own copy: the accepted invariant `withStoredTiming` already rests on (first match wins), documented by its test in `__tests__/lib/utils/session-rows.test.ts`;
    - a block row is identified by its place among the stored block rows (the k-th warm-up, break, transition or cool-down), and is carried only when the new k-th block row is the same kind. Accepted loss: an older editor that reorders, inserts or deletes block rows can drop (never move to another kind of block) a block's assignments. Every editor built with this change sends `staff`, so the identity is never used for it.
    - New row ids are read back by `sequence` after the rows are written (`@@unique([sessionId, sequence])`), never matched by position.
  - *Static.* A stored row's `id` is the editor's `clientKey` and survives every save, so `updateSession` carries a row's staff by row id.
- **Staff ids (spec R3).** Hosted: a sent key that is a stored staff id of this practice keeps that id; any other key gets a new id (`newPlayId()`, the repository's cuid-shaped pre-insert id). The save returns no key → id mapping: a person added in this sitting gets a new id on every save until the editor reloads (accepted; the editor's keys stay consistent within its own payloads). Static: the key is the stored id.
- Links (spec R4): a `teamOfficialId` must be an `ACTIVE` or `INVITED` official of the practice's team, a `userId` an `ADMIN` member of it, never both (CHECK). Checked inside the save's transaction, after authentication and authorization. The edit loader unlinks a stale link (a `REMOVED` official, an admin no longer `ADMIN`), so an open editor's autosave isn't refused forever. Plan files, exports and the static store hold names only; the static store refuses any link with the hosted message.
- Picker privacy (spec R4): `getPracticeStaffOptions` selects explicit columns; no query result, prop or payload in this feature carries an email.
- Hosted/static parity: the static store refuses everything hosted refuses, with the same message constants from `lib/utils/session-staff.ts`, checked on the payload as sent (before any carry or normalization).
- Copy paths (spec R5): duplicate (hosted and static) copies staff and assignments, links kept within the same team; detach (`detachLibraryPlay`) repoints rows in place and so keeps assignments (tested); materialize maps play ids only (identity above); plan export writes names; plan import (both apps) creates typed staff from names. The duplicate's columns come from `PRACTICE_STAFF_COPY_SELECT` and `ROW_STAFF_COPY_SELECT`, and a guard test built from those selects and the Prisma scalar-field enums fails when a column is added but not copied.
- A task that changes a type or a written shape lists, narrows and stages every existing test the change breaks (named in its Files list and its `git add`). Every task ends with `bun run type-check` and its test suites green (`tsconfig.json` includes `__tests__`, so type-check covers the tests).
- `components/features/practice-planner/PracticeSessionEditor.tsx` and `app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx` each stay at or under 900 lines (their line-budget tests). The editor is 799 lines today; Task 7 measures it before and after and extracts the Play Library dialog first (Step 1) so new code never pushes it past the budget.
- Portable components: no `next/*`, `lib/actions/*` or `@prisma/client` import in anything under `components/features/practice-planner/` or `lib/utils/` (the static app renders them). `types/practice-planner.ts` holds `SessionStaffMember` and `StaffOption`. Only palette tokens (`primary.main`, `secondary.main`, `text.secondary`, `divider`, `action.hover`, `action.selected`, `background.paper`, `error.main`…) in new on-screen components, so dark mode works. Print/export markup keeps its black-on-white classes. Every new interactive control is at least 44×44 px; chips in the Run by field have no delete icon (removal is through the list or Backspace), so no target is smaller than 44 px. A MUI select gets the `GoaliesAttendingField` height fix (`"& .MuiSelect-select.MuiInputBase-input": { minHeight: "1.4375em" }`); the Autocomplete input gets `"& .MuiInputBase-root": { minHeight: 44 }`.
- HTML: every name passes through the escaping already in place (`escapeHtml` in the emails, the `html` template in the HTML export, React elsewhere). Word: every string passes through `xmlSafe` (`textRuns`).
- Copy, exactly (plain coaching language):
  - Staff section: heading `Staff`; empty text `No staff yet. Add a coach or a volunteer to show who runs each part.`; button `Add staff`; menu items `<name>` with secondary text `<role label>` (`Head Coach`, `Assistant Coach`, … from `TEAM_OFFICIAL_ROLE_LABELS`, or `Team admin`), then `Type a name`; a typed person's field `Name`, helper `Not saved until it has a name` while empty, `STAFF_NAME_TAKEN_MESSAGE` when another person has the name; badges `Team official` / `Team admin`; remove button `Remove <name>` (`Remove unnamed staff member` while empty); confirm dialog title `Remove staff member`, text `removeStaffPrompt(name, n)` = `Remove Sam? They run 2 rows.` (`1 row`), buttons `Cancel` / `Remove`;
  - row cards: field `Run by`, accessible name `Run by for <title>`, helper `At most 4 people per row` once 4 are picked; shown only when the practice has at least one named person;
  - session page timeline suffix `runBySuffix(names)` = ` · run by Coach Lee, Sam`; sidebar line `runByLabel(names)` = `Run by Coach Lee, Sam`;
  - bench sheet (live, HTML, Word) header `staffHeaderLabel(staff)` = `Staff: Coach Lee, Sam, Alex`; rows ` · run by …` as on the timeline;
  - import preview: `Staff: …` under the subtitle, ` · run by …` per row;
  - emails: text line `Your stations: Breakout (6:10 PM), Water break (6:25 PM)`; HTML `<strong>Your stations:</strong> Breakout (6:10 PM), …`;
  - errors (exported constants, Task 1): `STAFF_KEY_MESSAGE` = `A staff key must be 1 to 64 characters`; `STAFF_NAME_REQUIRED_MESSAGE` = `Staff name is required`; `STAFF_NAME_LENGTH_MESSAGE` = `Staff name must be at most 60 characters`; `STAFF_LIMIT_MESSAGE` = `A practice can list at most 12 staff`; `STAFF_KEY_DUPLICATE_MESSAGE` = `Each staff member needs a unique key`; `STAFF_NAME_TAKEN_MESSAGE` = `Two staff members can't share a name`; `STAFF_ONE_LINK_MESSAGE` = `A staff member can be a team official or a team admin, not both`; `STAFF_OFFICIAL_MESSAGE` = `That team official isn't active on this team`; `STAFF_ADMIN_MESSAGE` = `That person isn't an admin of this team`; `ROW_STAFF_LIMIT_MESSAGE` = `A row can be run by at most 4 staff`; `ROW_STAFF_DUPLICATE_MESSAGE` = `A row lists the same staff member twice`; `ROW_STAFF_UNKNOWN_MESSAGE` = `A row is run by someone who isn't on the practice's staff`.
- Email times (spec R10): the venue's zone when the practice is booked at a venue with a valid zone, else `FALLBACK_TIME_ZONE` (`America/New_York`, `lib/utils/date.ts`), the zone `lib/email/templates.ts` already falls back to (`terms?.venue?.timezone || FALLBACK_TIME_ZONE` in the game-proposal email). `Team` has no zone column. The emails' existing Date line is not changed.
- No new runtime dependencies. No raw SQL outside the migration file (ADR-0003, `bun run check:raw-sql`). MUI is the only component library (ADR-0004).
- Screenshots (UI tasks 7–10): build and serve the static planner, drive it with headless Playwright from the scratchpad harness, and write PNGs to `<scratchpad>/pwcheck/` (it has `node_modules/playwright`; launch with `executablePath: process.env.CHROMIUM_PATH`, the local Chromium headless shell). Name files `staff-taskN-<view>-<desktop|mobile>-<light|dark>.png`. Read every PNG before committing. The hosted picker (officials and admins) is not reachable from the static build: its rendering is covered by component tests only.
- Commit trailer, on its own paragraph: `Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX`

## Review Focus

1. **An untouched editor, and a save from an older client,** keep the staff list and every row's assignments: an older hosted editor's save (no `staff`) across the row rewrite, including a drill whose play id is unchanged and a warm-up still first among the blocks; a static update without `staff`; an editor loaded with staff and assignments, an unrelated edit, the payload carries them unchanged. Tests: Task 3 (hosted carry), Task 6 (static), Task 7 (editor).
2. **A link that goes stale while an editor is open** (an official set to `REMOVED`, an admin demoted) never locks autosave into a generic failure: the edit loader returns the person unlinked, and a save that still sends the link is refused with `STAFF_OFFICIAL_MESSAGE` / `STAFF_ADMIN_MESSAGE`. Tests: Task 3 (refusal), Task 4 (loader unlinks).
3. **Two names that differ only in case, or that JavaScript and PostgreSQL lower differently,** are refused with `STAFF_NAME_TAKEN_MESSAGE` everywhere: the editor's helper text, hosted (the pure check, and a `P2002` from the expression index mapped to the same message), the static store and the plan file. Tests: Tasks 1, 2, 3, 6 and 7.
4. **Removing someone who runs rows** removes their key from every row before the next save, so no payload names a person the list no longer has; with no assignments it removes at once, without a dialog. Tests: Task 1 (`withoutStaffMember`), Task 7 (editor).
5. **Autosave while a typed person's name is still empty** saves without that person (and without their keys on rows) instead of failing every two seconds. Tests: Task 1 (`namedStaffPayload`), Task 7 (editor).

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `types/practice-planner.ts` | limits; `SessionStaffMember`, `StaffOption`; `staff?` on `PlayInSession`, `BlockInSession`, `PracticeSessionData`, `PracticeSessionViewPlay`, `PracticeSessionViewBlock`, `PracticeSessionView` | 1 |
| `lib/utils/session-staff.ts` (new) | messages, `cleanStaffName`, `staffNameKey`, `toStaffName`, list/row/session checks, names and labels, editor list edits, `namedStaffPayload`, save inputs, hosted row-identity carry, "Your stations" | 1 |
| `lib/utils/session-rows.ts` | rows carry `staff` keys into the save payload | 1 |
| `lib/utils/validation.ts` | `staff` on the row and session schemas | 2 |
| `lib/plan-document/document.ts`, `components/features/practice-planner/ExportPlanMenu.tsx`, `export/bench-sheet-model.ts` (types only), `docs/adr/0020-…md` | plan files carry names; export writes them; ADR amendment | 2 |
| `prisma/schema.prisma`, migration, `__tests__/prisma/practice-staff-migration.test.ts` | the two tables, CHECKs, expression index, FKs | 3 |
| `lib/services/practice-session-staff.ts` (new), `lib/actions/practice-sessions.ts` | link checks, staff replace, assignment read/carry/write in create and update | 3 |
| `lib/actions/practice-session-queries.ts`, `lib/actions/practice-session-drills.ts`, `lib/actions/practice-plan-import.ts` | reads (detail, edit with stale-link unlinking), the picker read, duplicate, import | 4 |
| `lib/email/templates.ts` | per-recipient "Your stations" | 5 |
| `apps/planner/src/store/{records,types,sessions,idb-repo}.ts` | static staff, carry by row id, copies, import, IndexedDB version 3 | 6 |
| `components/features/practice-planner/{useSessionStaff.ts,SessionStaffSection.tsx,PlayLibraryDialog.tsx}` (new), `PracticeSessionEditor.tsx`, hosted pages and wrappers, `SessionEditorScreen.tsx` | Staff section, picker plumbing, save payloads | 7 |
| `components/features/practice-planner/RunByField.tsx` (new), `SessionDrillCard.tsx`, `BlockRowCard.tsx`, `SessionDrillList.tsx` | Run by on every row card | 8 |
| `SessionTimeline.tsx`, `SidebarPlayCard.tsx`, `SessionDetailView.tsx`, `print/BenchSheet.tsx` | names on the session page and the live bench sheet | 9 |
| `export/bench-sheet-{model,html,docx}.ts`, `PlanPreview.tsx` | names in the exports and the import preview | 10 |

---

### Task 1: Staff vocabulary, types and pure helpers

The pure layer every later task imports. No component, action or store changes behaviour: the new fields are optional and nothing sends them yet.

**Files:**
- Modify: `types/practice-planner.ts` (after `MAX_TRANSITION_MINUTES`; `PlayInSession`, `BlockInSession`, `PracticeSessionData`, `PracticeSessionViewPlay`, `PracticeSessionViewBlock`, `PracticeSessionView`)
- Create: `lib/utils/session-staff.ts`
- Modify: `lib/utils/session-rows.ts` (`DrillRowInput`, `BlockRowInput`, `toDrillRowInput`, `toSessionRowInputs`)
- Test (create): `__tests__/lib/utils/session-staff.test.ts`
- Test (append): `__tests__/lib/utils/session-rows.test.ts`

**Interfaces:**
- Produces, from `types/practice-planner.ts`:
  - `MAX_SESSION_STAFF = 12`, `MAX_ROW_STAFF = 4`, `STAFF_NAME_MAX = 60`;
  - `SessionStaffMember { id: string; name: string; teamOfficialId?: string | null; userId?: string | null }`;
  - `StaffOption { kind: "official" | "admin"; id: string; name: string; roleLabel: string }`;
  - `staff?: string[]` on `PlayInSession`, `BlockInSession`, `PracticeSessionViewPlay`, `PracticeSessionViewBlock`; `staff?: SessionStaffMember[]` on `PracticeSessionData` and `PracticeSessionView`.
- Produces, from `lib/utils/session-staff.ts`:
  - `STAFF_KEY_MAX = 64` and the twelve message constants (Global Constraints);
  - `cleanStaffName(name: string): string`, `staffNameKey(name: string): string`, `toStaffName(value: string): string`;
  - `staffListError(staff: ReadonlyArray<{ key: string; name: string }>): string | null`, `rowStaffError(keys: readonly string[], known: ReadonlySet<string>): string | null`, `sessionStaffError(staff, rows: ReadonlyArray<{ staff?: readonly string[] }>): string | null`;
  - `staffNames(keys: readonly string[] | undefined, staff: ReadonlyArray<{ id: string; name: string }> | undefined): string[]`, `runByText(names): string | null`, `runBySuffix(names): string`, `runByLabel(names): string | null`, `staffHeaderLabel(staff: ReadonlyArray<{ name: string }> | undefined): string | null`, `removeStaffPrompt(name: string, rows: number): string`;
  - `assignmentCount(rows, key): number`, `withoutStaffMember<T extends { staff?: string[] }>(rows: readonly T[], key: string): T[]`, `namedStaffPayload<T>(staff, rows): { staff: SessionStaffMember[]; rows: T[] }`;
  - `SessionStaffInput { key: string; name: string; teamOfficialId?: string | null; userId?: string | null }`, `toSessionStaffInputs(staff: readonly SessionStaffMember[]): SessionStaffInput[]`;
  - `StoredRowStaff { playId: string | null; kind: SessionRowKind; sequence: number; staffIds: string[] }`, `carryRowStaff(stored, storedBlockSequences: readonly number[], next: ReadonlyArray<{ kind: SessionRowKind; playId: string | null; sequence: number }>): Array<{ sequence: number; staffIds: string[] }>`;
  - `StationStart { title: string; startsAt: Date }`, `yourStations<T>(rows, options: { start: Date; transitionMinutes: number; staffIds: ReadonlySet<string>; title: (row: T) => string }): StationStart[]`, `yourStationsText(stations: readonly StationStart[], timeZone: string): string | null`, `YOUR_STATIONS_LABEL = "Your stations"`.
- Produces, from `lib/utils/session-rows.ts`: `staff?: string[]` on `DrillRowInput` and `BlockRowInput`, sent only when the editor row holds it.

- [ ] **Step 1: Write the failing staff-helper tests**

Create `__tests__/lib/utils/session-staff.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MAX_ROW_STAFF, MAX_SESSION_STAFF, STAFF_NAME_MAX, type BlockKind, type SessionStaffMember } from "@/types/practice-planner";
import {
    ROW_STAFF_DUPLICATE_MESSAGE,
    ROW_STAFF_LIMIT_MESSAGE,
    ROW_STAFF_UNKNOWN_MESSAGE,
    STAFF_KEY_DUPLICATE_MESSAGE,
    STAFF_KEY_MESSAGE,
    STAFF_LIMIT_MESSAGE,
    STAFF_NAME_LENGTH_MESSAGE,
    STAFF_NAME_REQUIRED_MESSAGE,
    STAFF_NAME_TAKEN_MESSAGE,
    assignmentCount,
    carryRowStaff,
    cleanStaffName,
    namedStaffPayload,
    removeStaffPrompt,
    rowStaffError,
    runByLabel,
    runBySuffix,
    runByText,
    sessionStaffError,
    staffHeaderLabel,
    staffListError,
    staffNameKey,
    staffNames,
    toSessionStaffInputs,
    toStaffName,
    withoutStaffMember,
    yourStations,
    yourStationsText,
} from "@/lib/utils/session-staff";
import { blockTitle, isBlockRow } from "@/lib/utils/session-rows";
import type { TimelinePlay } from "@/lib/utils/session-timeline";

const member = (key: string, name: string) => ({ key, name });

describe("staff names", () => {
    it("cleans a name and compares names ignoring case", () => {
        expect(cleanStaffName("  Coach\u0007 Lee ")).toBe("Coach Lee");
        expect(staffNameKey(" Sam ")).toBe(staffNameKey("SAM"));
        expect(STAFF_NAME_MAX).toBe(60);
    });

    it("offers a long official's name cut to 60, never half an emoji", () => {
        expect(toStaffName("x".repeat(70))).toHaveLength(60);
        expect(toStaffName(`${"x".repeat(59)}😀`)).toBe("x".repeat(59));
        expect(toStaffName("  Pat\u0000  ")).toBe("Pat");
    });
});

describe("staffListError and rowStaffError (spec R2, R3)", () => {
    it("accepts up to 12 people with distinct names and keys", () => {
        expect(staffListError(Array.from({ length: MAX_SESSION_STAFF }, (_, i) => member(`k${i}`, `Coach ${i}`)))).toBeNull();
    });

    it("refuses each broken rule with its message", () => {
        expect(staffListError(Array.from({ length: MAX_SESSION_STAFF + 1 }, (_, i) => member(`k${i}`, `Coach ${i}`)))).toBe(STAFF_LIMIT_MESSAGE);
        expect(staffListError([member("", "Sam")])).toBe(STAFF_KEY_MESSAGE);
        expect(staffListError([member("k".repeat(65), "Sam")])).toBe(STAFF_KEY_MESSAGE);
        expect(staffListError([member("k1", " \u0007 ")])).toBe(STAFF_NAME_REQUIRED_MESSAGE);
        expect(staffListError([member("k1", "x".repeat(61))])).toBe(STAFF_NAME_LENGTH_MESSAGE);
        expect(staffListError([member("k1", "Sam"), member("k1", "Lee")])).toBe(STAFF_KEY_DUPLICATE_MESSAGE);
        expect(staffListError([member("k1", "Sam"), member("k2", " sAM ")])).toBe(STAFF_NAME_TAKEN_MESSAGE);
    });

    it("limits a row to 4 known, distinct people", () => {
        const known = new Set(["a", "b", "c", "d", "e"]);
        expect(rowStaffError(["a", "b", "c", "d"], known)).toBeNull();
        expect(rowStaffError(["a", "b", "c", "d", "e"], known)).toBe(ROW_STAFF_LIMIT_MESSAGE);
        expect(MAX_ROW_STAFF).toBe(4);
        expect(rowStaffError(["a", "a"], known)).toBe(ROW_STAFF_DUPLICATE_MESSAGE);
        expect(rowStaffError(["z"], known)).toBe(ROW_STAFF_UNKNOWN_MESSAGE);
    });

    it("checks the list, then each row; a row without staff has nobody", () => {
        const staff = [member("k1", "Sam")];
        expect(sessionStaffError(staff, [{ staff: ["k1"] }, {}])).toBeNull();
        expect(sessionStaffError(staff, [{}, { staff: ["k2"] }])).toBe(ROW_STAFF_UNKNOWN_MESSAGE);
        expect(sessionStaffError([...staff, member("k2", "sam")], [{ staff: ["k9"] }])).toBe(STAFF_NAME_TAKEN_MESSAGE);
    });
});

describe("names and labels (spec R9, R11)", () => {
    const staff: SessionStaffMember[] = [{ id: "s1", name: "Coach Lee" }, { id: "s2", name: "Sam" }];

    it("reads a row's names from the list by key, in the row's order, skipping unknown keys", () => {
        expect(staffNames(["s2", "gone", "s1"], staff)).toEqual(["Sam", "Coach Lee"]);
        expect(staffNames(undefined, staff)).toEqual([]);
        expect(staffNames(["s1"], undefined)).toEqual([]);
    });

    it("labels the run-by text, suffix, sidebar line and bench sheet header", () => {
        expect(runByText(["Coach Lee", "Sam"])).toBe("run by Coach Lee, Sam");
        expect(runBySuffix(["Coach Lee", "Sam"])).toBe(" · run by Coach Lee, Sam");
        expect(runByLabel(["Coach Lee"])).toBe("Run by Coach Lee");
        expect([runByText([]), runBySuffix([]), runByLabel([])]).toEqual([null, "", null]);
        expect(staffHeaderLabel([...staff, { name: "Alex" }])).toBe("Staff: Coach Lee, Sam, Alex");
        expect([staffHeaderLabel([]), staffHeaderLabel(undefined)]).toEqual([null, null]);
    });

    it("asks before removing someone who runs rows, with the right count", () => {
        expect(removeStaffPrompt("Sam", 2)).toBe("Remove Sam? They run 2 rows.");
        expect(removeStaffPrompt("Sam", 1)).toBe("Remove Sam? They run 1 row.");
    });
});

describe("editor list edits (Review Focus 4, 5)", () => {
    const rows = [{ id: "r1", staff: ["s1", "s2"] }, { id: "r2", staff: ["s2"] }, { id: "r3" }];

    it("counts a person's rows and removes their key from every row, keeping untouched rows", () => {
        expect(assignmentCount(rows, "s2")).toBe(2);
        expect(assignmentCount(rows, "s9")).toBe(0);
        const next = withoutStaffMember(rows, "s1");
        expect(next.map((row) => row.staff)).toEqual([["s2"], ["s2"], undefined]);
        expect(next[1]).toBe(rows[1]);
        expect(next[2]).toBe(rows[2]);
    });

    it("sends only named people, and no row keeps the key of someone unnamed", () => {
        const staff: SessionStaffMember[] = [{ id: "s1", name: "Sam" }, { id: "s2", name: "  " }];
        const payload = namedStaffPayload(staff, rows);
        expect(payload.staff).toEqual([{ id: "s1", name: "Sam" }]);
        expect(payload.rows.map((row) => row.staff)).toEqual([["s1"], [], undefined]);
        expect(payload.rows[2]).toBe(rows[2]);
        const all = namedStaffPayload([{ id: "s1", name: "Sam" }], rows);
        expect(all.rows).toEqual(rows);
    });

    it("turns the list into save inputs, links only when set", () => {
        expect(toSessionStaffInputs([
            { id: "s1", name: "Coach Lee", teamOfficialId: "coff", userId: null },
            { id: "s2", name: "Pat", userId: "cuser" },
            { id: "s3", name: "Sam" },
        ])).toEqual([
            { key: "s1", name: "Coach Lee", teamOfficialId: "coff" },
            { key: "s2", name: "Pat", userId: "cuser" },
            { key: "s3", name: "Sam" },
        ]);
    });
});

describe("carryRowStaff: absent staff across a row rewrite (spec R3, Global Constraints)", () => {
    const stored = [
        { playId: null, kind: "warmup" as const, sequence: 0, staffIds: ["s2"] },
        { playId: "cplaya", kind: "drill" as const, sequence: 1, staffIds: ["s1", "s3"] },
        { playId: null, kind: "break" as const, sequence: 3, staffIds: ["s3"] },
    ];
    const blocks = [0, 3];

    it("carries a drill by its owned play and a block by its place among the blocks", () => {
        expect(carryRowStaff(stored, blocks, [
            { kind: "warmup", playId: null, sequence: 0 },
            { kind: "drill", playId: "cplaya", sequence: 1 },
            { kind: "drill", playId: "cplayb", sequence: 2 },
            { kind: "break", playId: null, sequence: 3 },
        ])).toEqual([
            { sequence: 0, staffIds: ["s2"] },
            { sequence: 1, staffIds: ["s1", "s3"] },
            { sequence: 3, staffIds: ["s3"] },
        ]);
    });

    it("follows a drill that moved, and never hands a block's staff to a different kind of block", () => {
        expect(carryRowStaff(stored, blocks, [
            { kind: "break", playId: null, sequence: 0 },
            { kind: "warmup", playId: null, sequence: 1 },
            { kind: "drill", playId: "cplaya", sequence: 2 },
        ])).toEqual([{ sequence: 2, staffIds: ["s1", "s3"] }]);
    });

    it("carries nothing when nothing was assigned", () => {
        expect(carryRowStaff([], [], [{ kind: "drill", playId: "cplaya", sequence: 0 }])).toEqual([]);
    });
});

describe("yourStations (spec R10)", () => {
    type Row = TimelinePlay & { id: string; kind?: "drill" | BlockKind; name?: string; label?: string | null; staff?: string[] };
    // 6:00 PM EDT on Tuesday, October 6, 2026.
    const START = new Date("2026-10-06T22:00:00.000Z");
    const rows: Row[] = [
        { id: "w", kind: "warmup", label: null, sequence: 0, duration: 8, runsWithPrevious: false, staff: ["s1"] },
        { id: "a", name: "Breakout", sequence: 1, duration: 10, runsWithPrevious: false, staff: ["s2"] },
        { id: "b", name: "Pass & Shoot", sequence: 2, duration: 10, runsWithPrevious: true, staff: ["s1", "s2"] },
        { id: "x", kind: "break", label: "Water", sequence: 3, duration: 2, runsWithPrevious: false, staff: [] },
        { id: "c", name: "Scrimmage", sequence: 4, duration: 5, runsWithPrevious: false, staff: ["s1"] },
    ];
    const title = (row: Row) => (isBlockRow(row) ? blockTitle(row.kind, row.label) : row.name ?? "");

    it("lists the rows a person runs in schedule order, each station at its block's start, with the gap", () => {
        // Blocks start at 0, 10 (8 + gap 2), 22 and 26 minutes.
        const stations = yourStations(rows, { start: START, transitionMinutes: 2, staffIds: new Set(["s1"]), title });
        expect(stations.map((station) => [station.title, (station.startsAt.getTime() - START.getTime()) / 60_000])).toEqual([
            ["Warm-up", 0], ["Pass & Shoot", 10], ["Scrimmage", 26],
        ]);
        expect(yourStationsText(stations, "America/New_York")).toBe("Warm-up (6:00 PM), Pass & Shoot (6:10 PM), Scrimmage (6:26 PM)");
    });

    it("joins several staff ids for one person, and has no text for someone who runs nothing", () => {
        const both = yourStations(rows, { start: START, transitionMinutes: 0, staffIds: new Set(["s2", "s9"]), title });
        expect(both.map((station) => station.title)).toEqual(["Breakout", "Pass & Shoot"]);
        expect(yourStationsText([], "America/New_York")).toBeNull();
        expect(yourStations(rows, { start: START, transitionMinutes: 0, staffIds: new Set(["s9"]), title })).toEqual([]);
    });
});
```

- [ ] **Step 2: Write the failing row-input test**

Append to `__tests__/lib/utils/session-rows.test.ts` (it already imports `toDrillRowInput`, `toSessionRowInputs` and defines `DRILL` and `BLOCK`):

```ts
describe("row inputs carry staff keys (practice staff, spec R3)", () => {
    it("sends a row's staff only when the editor row holds it", () => {
        expect(toDrillRowInput(DRILL)).not.toHaveProperty("staff");
        expect(toDrillRowInput({ ...DRILL, staff: ["s1", "s2"] }).staff).toEqual(["s1", "s2"]);
        expect(toDrillRowInput({ ...DRILL, staff: [] }).staff).toEqual([]);
        const [, block] = toSessionRowInputs([DRILL, { ...BLOCK, staff: ["s3"] }]);
        expect(block).toMatchObject({ kind: "break", staff: ["s3"] });
        expect(toSessionRowInputs([BLOCK])[0]).not.toHaveProperty("staff");
    });

    it("copies the keys, so a later editor edit never changes a payload in flight", () => {
        const staff = ["s1"];
        const sent = toDrillRowInput({ ...DRILL, staff });
        staff.push("s2");
        expect(sent.staff).toEqual(["s1"]);
    });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bun run test __tests__/lib/utils/session-staff.test.ts __tests__/lib/utils/session-rows.test.ts`
Expected: FAIL: `session-staff` cannot be resolved, and the row-input tests fail on the missing `staff` key.

- [ ] **Step 4: Add the limits and types to `types/practice-planner.ts`**

After `export const MAX_TRANSITION_MINUTES = 5;` (before the closing `// ====` line of that section), add:

```ts

// ============================================================================
// Practice staff: who runs each row
// ============================================================================

/** A practice lists at most this many staff (spec R2). */
export const MAX_SESSION_STAFF = 12;
/** A row is run by at most this many of them. */
export const MAX_ROW_STAFF = 4;
/** A staff name is 1–60 characters once cleaned. */
export const STAFF_NAME_MAX = 60;

/**
 * One person on a practice's staff. `id` is the stored id, or the editor's key
 * for someone not saved yet. Hosted only: linked to a team official or a team
 * admin, never both; a typed name has neither. Never carries an email (spec R4).
 */
export interface SessionStaffMember {
    id: string;
    name: string;
    teamOfficialId?: string | null;
    userId?: string | null;
}

/** A team official or team admin the hosted picker offers (spec R4). No email, ever. */
export interface StaffOption {
    kind: "official" | "admin";
    /** The TeamOfficial id, or the admin's User id */
    id: string;
    name: string;
    /** "Head Coach", "Assistant Coach"…, or "Team admin" */
    roleLabel: string;
}
```

In `interface PlayInSession`, after `rotateEveryMinutes?: number | null;`, add:

```ts
    /** Staff keys running this row, in order (spec R3). Sent only with the session's staff list. */
    staff?: string[];
```

In `interface BlockInSession`, after `runsWithPrevious: boolean;`, add the same two lines.

In `interface PracticeSessionData`, after `transitionMinutes?: number;`, add:

```ts
    /** The practice's staff. Absent = unchanged on save (spec R3); reads as none. */
    staff?: SessionStaffMember[];
```

In `interface PracticeSessionViewPlay`, after `rotateEveryMinutes?: number | null;`, and in `interface PracticeSessionViewBlock`, after `runsWithPrevious: boolean;`, add:

```ts
    /** Staff ids running this row, in order; names come from the session's list (spec R11). */
    staff?: string[];
```

In `interface PracticeSessionView`, after `transitionMinutes?: number;`, add:

```ts
    /** The practice's staff, in list order; absent reads as none. */
    staff?: SessionStaffMember[];
```

- [ ] **Step 5: Create `lib/utils/session-staff.ts`**

```ts
/**
 * Practice staff (spec R1–R4, R9–R11): who runs each row. One pure module for
 * the list's rules and messages, the names every reader shows, the editor's
 * list edits, the save inputs, the hosted save's row identity when staff is
 * absent, and the practice emails' "Your stations" line. No React, server or
 * DOM imports: both deployables, the server actions, the static store, the plan
 * document and the email templates share it. Rows hold staff keys, never names.
 */
import { MAX_ROW_STAFF, MAX_SESSION_STAFF, STAFF_NAME_MAX, type SessionRowKind, type SessionStaffMember } from "@/types/practice-planner";
import { CONTROL_CHARS, isBlockKind } from "@/lib/utils/session-rows";
import { buildSchedule, type TimelinePlay } from "@/lib/utils/session-timeline";
import { formatClockTime } from "@/lib/utils/date";

/** A staff key: a stored id or an editor key, as long as a row's clientKey may be. */
export const STAFF_KEY_MAX = 64;

export const STAFF_KEY_MESSAGE = `A staff key must be 1 to ${STAFF_KEY_MAX} characters`;
export const STAFF_NAME_REQUIRED_MESSAGE = "Staff name is required";
export const STAFF_NAME_LENGTH_MESSAGE = `Staff name must be at most ${STAFF_NAME_MAX} characters`;
export const STAFF_LIMIT_MESSAGE = `A practice can list at most ${MAX_SESSION_STAFF} staff`;
export const STAFF_KEY_DUPLICATE_MESSAGE = "Each staff member needs a unique key";
export const STAFF_NAME_TAKEN_MESSAGE = "Two staff members can't share a name";
export const STAFF_ONE_LINK_MESSAGE = "A staff member can be a team official or a team admin, not both";
export const STAFF_OFFICIAL_MESSAGE = "That team official isn't active on this team";
export const STAFF_ADMIN_MESSAGE = "That person isn't an admin of this team";
export const ROW_STAFF_LIMIT_MESSAGE = `A row can be run by at most ${MAX_ROW_STAFF} staff`;
export const ROW_STAFF_DUPLICATE_MESSAGE = "A row lists the same staff member twice";
export const ROW_STAFF_UNKNOWN_MESSAGE = "A row is run by someone who isn't on the practice's staff";

/** A name as every write path stores it: control characters removed, trimmed. Never cut: a long name is refused. */
export function cleanStaffName(name: string): string {
    return name.replace(CONTROL_CHARS, "").trim();
}

/** Names are unique per practice ignoring case, as the database's lower("name") index compares them. */
export function staffNameKey(name: string): string {
    return cleanStaffName(name).toLowerCase();
}

/**
 * A name the hosted picker offers: cleaned and cut to 60 characters (a team
 * official's name may be 100). Counts UTF-16 units, as every name check does,
 * and drops a surrogate pair that doesn't fit whole.
 */
export function toStaffName(value: string): string {
    return cleanStaffName(value).slice(0, STAFF_NAME_MAX).replace(/[\uD800-\uDBFF]$/, "").trim();
}

/** The list's first problem (count, keys, names), or null. */
export function staffListError(staff: ReadonlyArray<{ key: string; name: string }>): string | null {
    if (staff.length > MAX_SESSION_STAFF) return STAFF_LIMIT_MESSAGE;
    const keys = new Set<string>();
    const names = new Set<string>();
    for (const member of staff) {
        if (member.key.length < 1 || member.key.length > STAFF_KEY_MAX) return STAFF_KEY_MESSAGE;
        const name = cleanStaffName(member.name);
        if (name.length === 0) return STAFF_NAME_REQUIRED_MESSAGE;
        if (name.length > STAFF_NAME_MAX) return STAFF_NAME_LENGTH_MESSAGE;
        if (keys.has(member.key)) return STAFF_KEY_DUPLICATE_MESSAGE;
        keys.add(member.key);
        const key = name.toLowerCase();
        if (names.has(key)) return STAFF_NAME_TAKEN_MESSAGE;
        names.add(key);
    }
    return null;
}

/** One row's first problem: at most 4 people, no one twice, everyone on the list. */
export function rowStaffError(keys: readonly string[], known: ReadonlySet<string>): string | null {
    if (keys.length > MAX_ROW_STAFF) return ROW_STAFF_LIMIT_MESSAGE;
    if (new Set(keys).size !== keys.length) return ROW_STAFF_DUPLICATE_MESSAGE;
    return keys.every((key) => known.has(key)) ? null : ROW_STAFF_UNKNOWN_MESSAGE;
}

/**
 * A save's staff problem: the list, then each row in order. Hosted (after Zod)
 * and the static store share it. Only called when the save sends staff: a row
 * without `staff` then has nobody.
 */
export function sessionStaffError(
    staff: ReadonlyArray<{ key: string; name: string }>,
    rows: ReadonlyArray<{ staff?: readonly string[] }>,
): string | null {
    const listError = staffListError(staff);
    if (listError) return listError;
    const known = new Set(staff.map((member) => member.key));
    for (const row of rows) {
        const error = rowStaffError(row.staff ?? [], known);
        if (error) return error;
    }
    return null;
}

/** A row's names from the session's list by key, in the row's order (spec R11). An unknown key is skipped. */
export function staffNames(
    keys: readonly string[] | undefined,
    staff: ReadonlyArray<{ id: string; name: string }> | undefined,
): string[] {
    if (!keys || keys.length === 0 || !staff || staff.length === 0) return [];
    const byId = new Map(staff.map((member) => [member.id, member.name]));
    return keys.flatMap((key) => {
        const name = byId.get(key);
        return name ? [name] : [];
    });
}

/** "run by Coach Lee, Sam", or null when nobody runs the row. */
export function runByText(names: readonly string[]): string | null {
    return names.length > 0 ? `run by ${names.join(", ")}` : null;
}

/** " · run by Coach Lee, Sam" after a row on a timeline, or "". */
export function runBySuffix(names: readonly string[]): string {
    const text = runByText(names);
    return text ? ` · ${text}` : "";
}

/** "Run by Coach Lee, Sam" on a sidebar card, or null. */
export function runByLabel(names: readonly string[]): string | null {
    return names.length > 0 ? `Run by ${names.join(", ")}` : null;
}

/** "Staff: Coach Lee, Sam, Alex" in the bench sheet's header and the import preview, or null. */
export function staffHeaderLabel(staff: ReadonlyArray<{ name: string }> | undefined): string | null {
    return staff && staff.length > 0 ? `Staff: ${staff.map((member) => member.name).join(", ")}` : null;
}

/** The editor's confirm: "Remove Sam? They run 2 rows." */
export function removeStaffPrompt(name: string, rows: number): string {
    return `Remove ${name}? They run ${rows} ${rows === 1 ? "row" : "rows"}.`;
}

type Staffed = { staff?: string[] };

/** How many rows a staff member runs. */
export function assignmentCount(rows: readonly Staffed[], key: string): number {
    return rows.filter((row) => row.staff?.includes(key)).length;
}

/** Every row without this staff member. A row they didn't run keeps its object. */
export function withoutStaffMember<T extends Staffed>(rows: readonly T[], key: string): T[] {
    return rows.map((row) => {
        const keys = row.staff;
        return keys?.includes(key) ? { ...row, staff: keys.filter((other) => other !== key) } : row;
    });
}

/**
 * What the editor sends: the named staff, and each row's keys limited to them.
 * A typed person whose name is still empty isn't saved yet, so no row is sent
 * as run by them (an autosave never fails on a name being typed).
 */
export function namedStaffPayload<T extends Staffed>(
    staff: readonly SessionStaffMember[],
    rows: readonly T[],
): { staff: SessionStaffMember[]; rows: T[] } {
    const named = staff.filter((member) => cleanStaffName(member.name).length > 0);
    if (named.length === staff.length) return { staff: [...staff], rows: [...rows] };
    const kept = new Set(named.map((member) => member.id));
    return {
        staff: named,
        rows: rows.map((row) => {
            const keys = row.staff;
            return keys?.some((key) => !kept.has(key)) ? { ...row, staff: keys.filter((key) => kept.has(key)) } : row;
        }),
    };
}

/** One staff member in a save (spec R3): `key` is the stored id or the editor's key. */
export interface SessionStaffInput {
    key: string;
    name: string;
    teamOfficialId?: string | null;
    userId?: string | null;
}

/** The editor's list as save inputs; a link is sent only when set. */
export function toSessionStaffInputs(staff: readonly SessionStaffMember[]): SessionStaffInput[] {
    return staff.map((member) => ({
        key: member.id,
        name: member.name,
        ...(member.teamOfficialId && { teamOfficialId: member.teamOfficialId }),
        ...(member.userId && { userId: member.userId }),
    }));
}

/** A stored row's assignment, read before updatePracticeSession deletes the rows. */
export interface StoredRowStaff {
    playId: string | null;
    kind: SessionRowKind;
    sequence: number;
    /** In the row's order */
    staffIds: string[];
}

/**
 * Absent staff = unchanged (spec R3) across updatePracticeSession's
 * delete-and-recreate of the rows (row ids don't survive it). The identity:
 * - a drill row: its owned play id (materializeSessionDrills keeps an owned
 *   copy's id, and a session's stored drill rows each have their own copy,
 *   the invariant withStoredTiming rests on);
 * - a block row: its place among the stored block rows, carried only when the
 *   new block row in that place is the same kind (a reorder by an older editor
 *   drops a block's staff rather than giving it to a different kind of block).
 * Returns each new row's staff ids by sequence; rows nobody runs are left out.
 */
export function carryRowStaff(
    stored: readonly StoredRowStaff[],
    storedBlockSequences: readonly number[],
    next: ReadonlyArray<{ kind: SessionRowKind; playId: string | null; sequence: number }>,
): Array<{ sequence: number; staffIds: string[] }> {
    const byPlay = new Map<string, string[]>();
    const byBlock = new Map<number, StoredRowStaff>();
    for (const row of stored) {
        if (isBlockKind(row.kind)) {
            const place = storedBlockSequences.indexOf(row.sequence);
            if (place >= 0) byBlock.set(place, row);
        } else if (row.playId && !byPlay.has(row.playId)) {
            byPlay.set(row.playId, row.staffIds);
        }
    }
    let place = 0;
    return [...next]
        .sort((a, b) => a.sequence - b.sequence)
        .flatMap((row) => {
            if (isBlockKind(row.kind)) {
                const carried = byBlock.get(place++);
                return carried && carried.kind === row.kind && carried.staffIds.length > 0 ? [{ sequence: row.sequence, staffIds: carried.staffIds }] : [];
            }
            const carried = row.playId ? byPlay.get(row.playId) : undefined;
            return carried && carried.length > 0 ? [{ sequence: row.sequence, staffIds: carried }] : [];
        });
}

/** The practice emails' label for the line below. */
export const YOUR_STATIONS_LABEL = "Your stations";

/** One row a recipient runs: its title and its block's start. */
export interface StationStart {
    title: string;
    startsAt: Date;
}

/**
 * The rows these staff ids run (spec R10), in schedule order. Starts come from
 * buildSchedule, as on the bench sheet: a station of a station block starts with
 * its block, and the gap between blocks is counted.
 */
export function yourStations<T extends TimelinePlay & { staff?: readonly string[] }>(
    rows: readonly T[],
    options: { start: Date; transitionMinutes: number; staffIds: ReadonlySet<string>; title: (row: T) => string },
): StationStart[] {
    return buildSchedule(rows, options.start, options.transitionMinutes).flatMap(({ group, startsAt }) =>
        group.stations
            .filter((row) => row.staff?.some((key) => options.staffIds.has(key)))
            .map((row) => ({ title: options.title(row), startsAt })),
    );
}

/** "Breakout (6:10 PM), Water break (6:25 PM)" in `timeZone`, or null when there is nothing to list. */
export function yourStationsText(stations: readonly StationStart[], timeZone: string): string | null {
    if (stations.length === 0) return null;
    return stations.map((station) => `${station.title} (${formatClockTime(station.startsAt, timeZone)})`).join(", ");
}
```

- [ ] **Step 6: Carry staff keys in the row inputs (`lib/utils/session-rows.ts`)**

In `interface DrillRowInput`, after `rotateEveryMinutes?: number | null;`, and in `interface BlockRowInput`, after `label: string | null;`, add:

```ts
    /** Staff keys running this row (spec R3). Read only when the save sends the session's staff. */
    staff?: string[];
```

In `toDrillRowInput`, after the `rotateEveryMinutes` spread, add:

```ts
        ...(item.staff !== undefined && { staff: [...item.staff] }),
```

In `toSessionRowInputs`, in the block branch, after `label: toBlockLabel(item.label),` add the same line.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `bun run test __tests__/lib/utils/session-staff.test.ts __tests__/lib/utils/session-rows.test.ts __tests__/lib/utils/session-timeline.test.ts`
Expected: PASS.

Run: `bun run type-check`
Expected: exit 0 (every new field is optional).

- [ ] **Step 8: Commit**

```bash
/usr/bin/git add types/practice-planner.ts lib/utils/session-staff.ts lib/utils/session-rows.ts \
  __tests__/lib/utils/session-staff.test.ts __tests__/lib/utils/session-rows.test.ts
/usr/bin/git commit -m "feat(practice-planner): practice staff vocabulary, types and pure helpers" -m "Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 2: Save schemas, the plan document and the ADR-0020 amendment

Spec R2, R3 (the shapes), R5 (export writes names) and R6. After this task the hosted save schemas accept `staff` (nothing sends it yet), plan files carry staff names both ways, and the export writes them from a session's list.

**Files:**
- Modify: `lib/utils/validation.ts` (imports, `practiceSessionPlayInputSchema`, `createPracticeSessionSchema`, `updatePracticeSessionSchema`; new `sessionStaffInputSchema`, `SessionStaffSaveInput`)
- Modify: `lib/plan-document/document.ts` (imports, entry and session schemas, `superRefine`, `PlanDrillInput`, `PlanBlockInput`, `PlanSessionInput`, `serializePlan`, `PlanEditorDrill`, `PlanEditorBlock`, `PlanEditorSession`, `planToEditorSession`)
- Modify: `components/features/practice-planner/export/bench-sheet-model.ts` (types only: `ExportSessionPlay`, `ExportSessionBlock`, `ExportSession`)
- Modify: `components/features/practice-planner/ExportPlanMenu.tsx` (`toPlanRows`, `buildPlanDocument`)
- Modify: `docs/adr/0020-exchange-practice-plans-as-a-portable-versioned-document-and-ship-a-static-local.md` (new amendment)
- Test (append): `__tests__/lib/utils/validation-practice-session.test.ts`
- Test (append, and update the key-shape lines 138, 139, 405, 406 and 495 for the new `staff` key): `__tests__/lib/plan-document/document.test.ts`
- Test (append, and update line 339): `__tests__/components/features/practice-planner/ExportPlanMenu.test.tsx`

**Interfaces:**
- Consumes (Task 1): `cleanStaffName`, `staffNameKey`, `rowStaffError`, `staffNames`, `STAFF_KEY_MAX` and the messages; `MAX_SESSION_STAFF`, `MAX_ROW_STAFF`, `STAFF_NAME_MAX`, `SessionStaffMember`.
- Produces:
  - `practiceSessionPlayInputSchema` output gains `staff?: string[]`; both session schemas gain `staff?: SessionStaffSaveInput[]` where `SessionStaffSaveInput = { key: string; name: string; teamOfficialId?: string | null; userId?: string | null }` (name cleaned);
  - plan document: `PlanEntry.staff: string[]` (names, on drills and blocks), `PlanDocument["session"]["staff"]: string[]`; `PlanDrillInput.staff?`, `PlanBlockInput.staff?`, `PlanSessionInput.staff?` (names); `PlanEditorDrill.staff`, `PlanEditorBlock.staff`, `PlanEditorSession.staff` (names);
  - `ExportSessionPlay.staff?: string[]`, `ExportSessionBlock.staff?: string[]` (staff ids), `ExportSession.staff?: SessionStaffMember[]`;
  - `toPlanRows(rows: readonly ExportSessionRow[], staff?: readonly SessionStaffMember[]): PlanSessionInput["drills"]`.
- Writers always emit `staff` on the session and on every entry (`[]` when none), as the timing amendment's writers emit every field.

- [ ] **Step 1: Write the failing schema tests**

Append to `__tests__/lib/utils/validation-practice-session.test.ts`, and add this import:

```ts
import {
    ROW_STAFF_LIMIT_MESSAGE,
    STAFF_KEY_MESSAGE,
    STAFF_LIMIT_MESSAGE,
    STAFF_NAME_LENGTH_MESSAGE,
    STAFF_NAME_REQUIRED_MESSAGE,
    STAFF_ONE_LINK_MESSAGE,
} from "@/lib/utils/session-staff";
```

```ts
describe("practice staff fields (spec R2, R3)", () => {
    const CUID = "cjld2cjxh0000qzrmn831i7rn";
    const base = { title: "Practice", date: "2026-10-06T23:00:00.000Z", duration: 60, teamId: CUID };
    const row = { playId: CUID, clientKey: "k1", sequence: 0, duration: 10, instructions: "" };
    const messages = (result: { success: boolean; error?: { issues: Array<{ message: string }> } }) =>
        result.success ? [] : (result.error?.issues ?? []).map((issue) => issue.message);

    it("leaves staff undefined when a save omits it (absent = unchanged)", () => {
        expect(updatePracticeSessionSchema.parse({ ...base, id: CUID }).staff).toBeUndefined();
        expect(practiceSessionPlayInputSchema.parse(row).staff).toBeUndefined();
        expect(updatePracticeSessionSchema.parse({ ...base, id: CUID, staff: [] }).staff).toEqual([]);
    });

    it("cleans names, keeps a link, and takes a row's keys", () => {
        const parsed = createPracticeSessionSchema.parse({
            ...base,
            staff: [{ key: "k-new", name: "  Sam\u0007 " }, { key: CUID, name: "Coach Lee", teamOfficialId: CUID }],
            plays: [{ ...row, staff: ["k-new", CUID] }],
        });
        expect(parsed.staff).toEqual([{ key: "k-new", name: "Sam" }, { key: CUID, name: "Coach Lee", teamOfficialId: CUID }]);
        expect(parsed.plays[0].staff).toEqual(["k-new", CUID]);
    });

    it("refuses an empty or long name, a bad key, two links, 13 staff and a row run by 5", () => {
        const staffed = (staff: unknown[], plays: unknown[] = []) => messages(createPracticeSessionSchema.safeParse({ ...base, staff, plays }));
        expect(staffed([{ key: "k", name: " \u0007 " }])).toEqual([STAFF_NAME_REQUIRED_MESSAGE]);
        expect(staffed([{ key: "k", name: "x".repeat(61) }])).toEqual([STAFF_NAME_LENGTH_MESSAGE]);
        expect(staffed([{ key: "", name: "Sam" }])).toEqual([STAFF_KEY_MESSAGE]);
        expect(staffed([{ key: "k", name: "Sam", teamOfficialId: CUID, userId: CUID }])).toEqual([STAFF_ONE_LINK_MESSAGE]);
        expect(staffed(Array.from({ length: 13 }, (_, i) => ({ key: `k${i}`, name: `Coach ${i}` })))).toEqual([STAFF_LIMIT_MESSAGE]);
        expect(staffed([], [{ ...row, staff: ["a", "b", "c", "d", "e"] }])).toEqual([ROW_STAFF_LIMIT_MESSAGE]);
    });
});
```

- [ ] **Step 2: Write the failing plan-document tests**

In `__tests__/lib/plan-document/document.test.ts`, add the new key to the existing key-shape assertions (the document now always writes `staff`):
- line 138: `["date", "drills", "durationMinutes", "goaliesAttending", "staff", "startTime", "title", "transitionMinutes"]`;
- line 139: `["drill", "durationMinutes", "instructions", "kind", "rotateEveryMinutes", "runsWithPrevious", "sequence", "staff", "stays"]`;
- lines 405 and 406: add `staff: []` to each expected block entry;
- line 495: add `staff: []` to the expected editor block row.

Add to the `@/lib/utils/session-staff` imports (a new import line):

```ts
import {
    ROW_STAFF_LIMIT_MESSAGE,
    ROW_STAFF_UNKNOWN_MESSAGE,
    STAFF_LIMIT_MESSAGE,
    STAFF_NAME_LENGTH_MESSAGE,
    STAFF_NAME_REQUIRED_MESSAGE,
    STAFF_NAME_TAKEN_MESSAGE,
} from "@/lib/utils/session-staff";
```

Append:

```ts
describe("practice staff in plan files (spec R6)", () => {
    const staffed = (): PlanSessionInput =>
        input({
            staff: ["Coach Lee", " Sam ", "coach lee", "", "x".repeat(61)],
            drills: [
                { kind: "warmup", sequence: 0, duration: 8, instructions: null, label: null, runsWithPrevious: false, staff: ["sam"] },
                { sequence: 1, duration: 10, runsWithPrevious: false, instructions: null, name: "Breakout", description: null, playData: null, staff: ["Coach Lee", "Nobody", "COACH LEE"] },
            ],
        });
    const file = () => JSON.parse(JSON.stringify(serializePlan(staffed(), "openleague-hosted", NOW)));
    const issues = (raw: unknown) => {
        const result = parsePlan(raw);
        return result.ok ? [] : result.error.issues ?? [];
    };

    it("writes the list cleaned and unique ignoring case, and each row's names from the list in its spelling", () => {
        const doc = serializePlan(staffed(), "openleague-hosted", NOW);
        expect(doc.session.staff).toEqual(["Coach Lee", "Sam"]);
        expect(doc.session.drills.map((entry) => entry.staff)).toEqual([["Sam"], ["Coach Lee"]]);
        expect(serializePlan(input(), "openleague-hosted", NOW).session.drills.every((entry) => entry.staff.length === 0)).toBe(true);
    });

    it("round-trips through parsePlan", () => {
        const doc = serializePlan(staffed(), "openleague-static", NOW);
        expect(parsePlan(JSON.parse(JSON.stringify(doc)))).toEqual({ ok: true, plan: doc });
    });

    it("opens a file written before practice staff with no staff", () => {
        const raw = file();
        delete raw.session.staff;
        for (const entry of raw.session.drills) delete entry.staff;
        raw.session.drills[0].staff = null;
        const result = parsePlan(raw);
        expect(result.ok && result.plan.session.staff).toEqual([]);
        expect(result.ok && result.plan.session.drills.map((entry) => entry.staff)).toEqual([[], []]);
    });

    it("matches a row's names to the list ignoring case", () => {
        const raw = file();
        raw.session.drills[1].staff = ["COACH LEE", "sam"];
        expect(issues(raw)).toEqual([]);
    });

    it("rejects a row naming someone not on the list with a readable Drill N issue", () => {
        const raw = file();
        raw.session.drills[1].staff = ["Nobody"];
        raw.session.drills[0].staff = ["Ghost"];
        expect(issues(raw)).toEqual([`Drill 1: ${ROW_STAFF_UNKNOWN_MESSAGE}`, `Drill 2 ("Breakout"): ${ROW_STAFF_UNKNOWN_MESSAGE}`]);
    });

    it("rejects a list with a repeated name, too many names, or a name that is empty or too long", () => {
        const withStaff = (staff: unknown) => {
            const raw = file();
            raw.session.staff = staff;
            for (const entry of raw.session.drills) entry.staff = [];
            return issues(raw);
        };
        expect(withStaff(["Sam", "SAM"])).toEqual([STAFF_NAME_TAKEN_MESSAGE]);
        expect(withStaff(Array.from({ length: 13 }, (_, i) => `Coach ${i}`))).toEqual([STAFF_LIMIT_MESSAGE]);
        expect(withStaff(["x".repeat(61)])).toEqual([STAFF_NAME_LENGTH_MESSAGE]);
        expect(withStaff([" "])).toEqual([STAFF_NAME_REQUIRED_MESSAGE]);
    });

    it("rejects a row run by more than 4 people", () => {
        const raw = file();
        raw.session.staff = ["A", "B", "C", "D", "E"];
        raw.session.drills[0].staff = [];
        raw.session.drills[1].staff = ["A", "B", "C", "D", "E"];
        expect(issues(raw)).toEqual([`Drill 2 ("Breakout"): ${ROW_STAFF_LIMIT_MESSAGE}`]);
    });

    it("gives the import preview the list and each row's names", () => {
        const editor = planToEditorSession(serializePlan(staffed(), "openleague-static", NOW));
        expect(editor.staff).toEqual(["Coach Lee", "Sam"]);
        expect(editor.plays.map((row) => row.staff)).toEqual([["Sam"], ["Coach Lee"]]);
    });
});
```

- [ ] **Step 3: Write the failing export test**

In `__tests__/components/features/practice-planner/ExportPlanMenu.test.tsx`, line 339: add `staff: []` to the expected warm-up entry. Append:

```ts
describe("buildPlanDocument: practice staff (spec R5, R6)", () => {
    it("writes the staff list and each row's staff as names: no ids, no links", () => {
        const session: ExportableSession = {
            ...SESSION,
            staff: [{ id: "s1", name: "Coach Lee", teamOfficialId: "cofficialxxxxxxxxxxxxxxxx" }, { id: "s2", name: "Sam" }],
            plays: [
                { kind: "warmup", sequence: 0, duration: 8, instructions: null, runsWithPrevious: false, label: null, staff: ["s2"] },
                { ...sessionPlay("A", 1), staff: ["s1", "s2", "gone"] },
            ],
        };
        const doc = buildPlanDocument(session, NOW);
        expect(doc.session.staff).toEqual(["Coach Lee", "Sam"]);
        expect(doc.session.drills.map((entry) => entry.staff)).toEqual([["Sam"], ["Coach Lee", "Sam"]]);
        expect(JSON.stringify(doc)).not.toMatch(/cofficial|"s1"|"s2"/);
    });

    it("writes empty lists for a session without staff", () => {
        const doc = buildPlanDocument(SESSION, NOW);
        expect(doc.session.staff).toEqual([]);
        expect(doc.session.drills.every((entry) => entry.staff.length === 0)).toBe(true);
    });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `bun run test __tests__/lib/utils/validation-practice-session.test.ts __tests__/lib/plan-document/document.test.ts __tests__/components/features/practice-planner/ExportPlanMenu.test.tsx`
Expected: FAIL: no `staff` in the schemas, the document or the export.

- [ ] **Step 5: Add `staff` to the save schemas (`lib/utils/validation.ts`)**

Add `MAX_ROW_STAFF`, `MAX_SESSION_STAFF` and `STAFF_NAME_MAX` to the `@/types/practice-planner` import, and add:

```ts
import {
  ROW_STAFF_LIMIT_MESSAGE,
  STAFF_KEY_MAX,
  STAFF_KEY_MESSAGE,
  STAFF_LIMIT_MESSAGE,
  STAFF_NAME_LENGTH_MESSAGE,
  STAFF_NAME_REQUIRED_MESSAGE,
  STAFF_ONE_LINK_MESSAGE,
  cleanStaffName,
} from "@/lib/utils/session-staff";
```

Above `export const practiceSessionPlayInputSchema`, add:

```ts
// Practice staff (spec R2, R3). A key is a stored staff id or the editor's key
// for someone new; the action maps keys to ids. A row's `staff` is read only
// when the save sends the session's `staff` (absent = unchanged).
const staffKeySchema = z.string().min(1, STAFF_KEY_MESSAGE).max(STAFF_KEY_MAX, STAFF_KEY_MESSAGE);
```

In `practiceSessionPlayInputSchema`'s object, after `rotateEveryMinutes: …`, add:

```ts
    staff: z.array(staffKeySchema).max(MAX_ROW_STAFF, ROW_STAFF_LIMIT_MESSAGE).optional(),
```

Below `practiceSessionPlayItemsSchema`, add:

```ts
// One person on the practice's staff. Names are cleaned, then checked (never
// cut). The list's uniqueness, the rows' keys and the links are checked by the
// action after authorization (sessionStaffError, staffLinkError).
export const sessionStaffInputSchema = z
  .object({
    key: staffKeySchema,
    name: z
      .string()
      .transform(cleanStaffName)
      .pipe(z.string().min(1, STAFF_NAME_REQUIRED_MESSAGE).max(STAFF_NAME_MAX, STAFF_NAME_LENGTH_MESSAGE)),
    teamOfficialId: z.string().cuid("Invalid official ID format").nullable().optional(),
    userId: z.string().cuid("Invalid user ID format").nullable().optional(),
  })
  .refine((member) => !(member.teamOfficialId && member.userId), { message: STAFF_ONE_LINK_MESSAGE, path: ["userId"] });

export type SessionStaffSaveInput = z.output<typeof sessionStaffInputSchema>;

// Absent = unchanged on update, none on create; [] clears (spec R3).
const sessionStaffSchema = z.array(sessionStaffInputSchema).max(MAX_SESSION_STAFF, STAFF_LIMIT_MESSAGE).optional();
```

In both `createPracticeSessionSchema` and `updatePracticeSessionSchema`, after `transitionMinutes: transitionMinutesSchema.optional(),`, add:

```ts
  staff: sessionStaffSchema,
```

- [ ] **Step 6: Carry staff names in the plan document (`lib/plan-document/document.ts`)**

Extend the imports:

```ts
import { BLOCK_KINDS, MAX_ROW_STAFF, MAX_SESSION_STAFF, PLAY_FOCUS, PLAY_GOALIES, STAFF_NAME_MAX, type BlockKind, type PlayData, type PlayFocus, type PlayGoalies } from "@/types/practice-planner";
import {
    ROW_STAFF_LIMIT_MESSAGE,
    STAFF_LIMIT_MESSAGE,
    STAFF_NAME_LENGTH_MESSAGE,
    STAFF_NAME_REQUIRED_MESSAGE,
    STAFF_NAME_TAKEN_MESSAGE,
    cleanStaffName,
    rowStaffError,
    staffNameKey,
} from "@/lib/utils/session-staff";
```

After `transitionMinutesSchema`, add:

```ts
// Practice staff (spec R6): names only, never ids or links. Strict, unlike the
// advisory fields: a row naming someone off the list is a broken file.
const planStaffNameSchema = z
    .string({ message: "A staff name must be text" })
    .transform(cleanStaffName)
    .pipe(z.string().min(1, STAFF_NAME_REQUIRED_MESSAGE).max(STAFF_NAME_MAX, STAFF_NAME_LENGTH_MESSAGE));

/** A list of staff names. Missing or null is none: every file written before practice staff. */
function planStaffSchema(max: number, message: string) {
    return z
        .array(planStaffNameSchema, { message: "Staff must be a list of names" })
        .max(max, message)
        .nullish()
        .transform((names) => names ?? []);
}
```

Add `staff: planStaffSchema(MAX_ROW_STAFF, ROW_STAFF_LIMIT_MESSAGE),` to `planDrillSchema` (after `rotateEveryMinutes`) and to `planBlockSchema` (after `label`). Add `staff: planStaffSchema(MAX_SESSION_STAFF, STAFF_LIMIT_MESSAGE),` to `planSessionSchema`'s object (after `transitionMinutes`).

At the top of `planSessionSchema`'s `.superRefine((session, ctx) => {`, before the sequence check (which returns early), add:

```ts
        // Practice staff (spec R6): names unique ignoring case; each row's names on the list.
        const listed = new Set<string>();
        for (const name of session.staff) {
            const key = staffNameKey(name);
            if (listed.has(key)) {
                ctx.addIssue({ code: "custom", path: ["staff"], message: STAFF_NAME_TAKEN_MESSAGE });
                break;
            }
            listed.add(key);
        }
        session.drills.forEach((entry, index) => {
            const error = rowStaffError(entry.staff.map(staffNameKey), listed);
            if (error) ctx.addIssue({ code: "custom", path: ["drills", index, "staff"], message: error });
        });
```

In `PlanDrillInput` (after `rotateEveryMinutes?`) and `PlanBlockInput` (after `label`), add:

```ts
    /** Staff names running this row; absent = none. Names not on the session's list are dropped. */
    staff?: string[];
```

In `PlanSessionInput`, after `transitionMinutes?: number;`, add:

```ts
    /** The practice's staff names; absent = none. */
    staff?: string[];
```

Above `serializePlan`, add:

```ts
/** The staff an export writes: cleaned names, the first spelling wins ignoring case, up to 12 names of 1–60 characters. */
function exportStaff(names: readonly string[] | undefined): string[] {
    const listed = new Set<string>();
    const staff: string[] = [];
    for (const raw of names ?? []) {
        const name = cleanStaffName(raw);
        const key = name.toLowerCase();
        if (!name || name.length > STAFF_NAME_MAX || listed.has(key) || staff.length >= MAX_SESSION_STAFF) continue;
        listed.add(key);
        staff.push(name);
    }
    return staff;
}

/** A row's staff on export: names on the list (in the list's spelling), each once, at most 4. */
function exportRowStaff(names: readonly string[] | undefined, listed: ReadonlyMap<string, string>): string[] {
    const row: string[] = [];
    for (const raw of names ?? []) {
        const name = listed.get(staffNameKey(raw));
        if (name && !row.includes(name) && row.length < MAX_ROW_STAFF) row.push(name);
    }
    return row;
}
```

In `serializePlan`, after `const rows = …`, add:

```ts
    const staff = exportStaff(input.staff);
    const listed = new Map(staff.map((name) => [name.toLowerCase(), name]));
```

add `staff: exportRowStaff(row.staff, listed),` to both returned entries (the block entry after `label`, the drill entry after `rotateEveryMinutes`), and `staff,` to the returned `session` (after `transitionMinutes`). Update the doc comment's last sentence to: "…, and keeps only staff names that fit the plan's rules, so every export imports."

Add `staff: string[];` to `PlanEditorDrill`, `PlanEditorBlock` and `PlanEditorSession`. In `planToEditorSession`, add `staff: plan.session.staff,` to the session and `staff: entry.staff,` to both row shapes.

- [ ] **Step 7: Name staff in the export (`ExportPlanMenu.tsx`, `bench-sheet-model.ts`)**

In `components/features/practice-planner/export/bench-sheet-model.ts`, add `type SessionStaffMember` to the `@/types/practice-planner` import. Add to `ExportSessionPlay` (after `rotateEveryMinutes?`) and `ExportSessionBlock` (after `label`):

```ts
    /** Staff ids running this row; names come from ExportSession.staff. */
    staff?: string[];
```

and to `ExportSession` (after `transitionMinutes?`):

```ts
    /** The practice's staff, in list order; absent reads as none. */
    staff?: SessionStaffMember[];
```

In `ExportPlanMenu.tsx`, add `import { staffNames } from "@/lib/utils/session-staff";` and `type SessionStaffMember` from `@/types/practice-planner`, then replace `toPlanRows`:

```ts
/** A session's rows as plan rows: each row's staff ids become names from the session's list (spec R6). */
export function toPlanRows(rows: readonly ExportSessionRow[], staff?: readonly SessionStaffMember[]): PlanSessionInput["drills"] {
    return rows.map((row) =>
        isBlockRow(row)
            ? {
                  kind: row.kind,
                  sequence: row.sequence,
                  duration: row.duration,
                  runsWithPrevious: false,
                  instructions: row.instructions,
                  label: row.label,
                  staff: staffNames(row.staff, staff),
              }
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
                  staff: staffNames(row.staff, staff),
              },
    );
}
```

In `buildPlanDocument`, pass `staff: session.staff?.map((member) => member.name),` (after `transitionMinutes`) and `drills: toPlanRows(session.plays, session.staff),`. Names only: links and ids never reach the file (spec R5).

- [ ] **Step 8: Amend ADR-0020**

Append to the `## Amendments` section of `docs/adr/0020-exchange-practice-plans-as-a-portable-versioned-document-and-ship-a-static-local.md`:

```markdown
### 2026-10-05: Practice staff (additive fields, version stays 1)

The document gains, without a version bump:
- per session: `staff`, a list of at most 12 names (each 1–60 characters once control characters are removed and it is trimmed, unique ignoring case);
- per row, drill or block: `staff`, at most 4 names, each on the session's list (matched ignoring case).

**Rules:**
- Names only. A plan never carries a staff id, a link to a team official or an account, or an email. An import creates typed names; a hosted importer never links them.
- A missing or `null` list reads as no staff, so every earlier file reads as before.
- Unlike the advisory fields, these are strict: a row naming someone not on the list, a repeated name, an empty or over-long name, or too many names is an error with a readable "Drill N" issue, never silently dropped.
- Writers always emit both lists (`[]` when there is no staff), and only names that pass the rules.

**Compatibility:** a reader built before this amendment strips the new keys and opens the file without staff. Nothing older readers rely on changes, so no bump.

Spec: `docs/superpowers/specs/2026-10-04-practice-staff-design.md`.
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `bun run test __tests__/lib/utils/validation-practice-session.test.ts __tests__/lib/plan-document __tests__/components/features/practice-planner/ExportPlanMenu.test.tsx __tests__/lib/data/starter-templates.test.ts __tests__/components/features/practice-planner/PlanImportView.test.tsx __tests__/apps/planner/import-screen.test.tsx __tests__/lib/actions/practice-plan-import.test.ts`
Expected: PASS (the starter templates and both importers round-trip with empty staff lists).

Run: `bun run type-check && bun run adr:lint`
Expected: both exit 0.

- [ ] **Step 10: Commit**

```bash
/usr/bin/git add lib/utils/validation.ts lib/plan-document/document.ts components/features/practice-planner/export/bench-sheet-model.ts \
  components/features/practice-planner/ExportPlanMenu.tsx docs/adr/0020-exchange-practice-plans-as-a-portable-versioned-document-and-ship-a-static-local.md \
  __tests__/lib/utils/validation-practice-session.test.ts __tests__/lib/plan-document/document.test.ts \
  __tests__/components/features/practice-planner/ExportPlanMenu.test.tsx
/usr/bin/git commit -m "feat(practice-planner): staff in the save schemas and plan files" -m "Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 3: Hosted storage and saves: tables, migration, create and update

Spec R2 and R3. After this task the hosted database has the two tables, and `createPracticeSession` / `updatePracticeSession` write a sent staff list and its assignments, refuse a bad one after authorization, and carry the stored assignments across the row rewrite when `staff` is absent. Nothing sends `staff` yet (the editor arrives in Task 7), so every existing save takes the carry path, which reads one table and writes nothing when nothing was assigned.

**Files:**
- Modify: `prisma/schema.prisma` (`model User`, `model TeamOfficial`, `model PracticeSession`, `model PracticeSessionPlay`; two new models after `PracticeSessionPlay`)
- Create: `prisma/migrations/20261005120000_practice_session_staff/migration.sql`
- Create: `lib/services/practice-session-staff.ts`
- Modify: `lib/actions/practice-sessions.ts` (imports; new `staffSaveError`, `writeSentStaff`; `createPracticeSession`, `updatePracticeSession` and both catch blocks)
- Test (create): `__tests__/prisma/practice-staff-migration.test.ts`, `__tests__/lib/actions/practice-sessions-staff.test.ts`
- Test (modify: the update path now reads `practiceSessionPlayStaff`, so each harness gains the model, resolving `[]`): `__tests__/lib/actions/practice-sessions-ownership.test.ts`, `__tests__/lib/actions/practice-sessions-stations.test.ts`, `__tests__/lib/actions/practice-sessions.test.ts`, `__tests__/integration/reservation-writer-matrix.test.ts`

**Interfaces:**
- Consumes (Task 1): `sessionStaffError`, `carryRowStaff`, `StoredRowStaff`, `STAFF_NAME_TAKEN_MESSAGE`, `STAFF_OFFICIAL_MESSAGE`, `STAFF_ADMIN_MESSAGE`. (Task 2): `SessionStaffSaveInput`, the `staff` fields on the schemas.
- Produces:
  - Prisma `PracticeSessionStaff { id; sessionId; name; position; teamOfficialId: string | null; userId: string | null }` (table `practice_session_staff`), `PracticeSessionPlayStaff { playRowId; staffId; position }` (table `practice_session_play_staff`); relations `PracticeSession.staff`, `PracticeSessionPlay.staff`, `TeamOfficial.practiceStaff`, `User.practiceStaff`;
  - from `lib/services/practice-session-staff.ts`: `StaffNameConflictError`, `staffLinkError(tx, teamId, staff): Promise<string | null>`, `replaceSessionStaff(tx, sessionId, staff): Promise<Map<string, string>>` (key → id), `writeRowStaff(tx, sessionId, assignments: ReadonlyArray<{ sequence: number; staffIds: readonly string[] }>): Promise<void>`, `readCarriedRowStaff(tx, sessionId): Promise<{ stored: StoredRowStaff[]; storedBlockSequences: number[] }>`.

- [ ] **Step 1: Write the failing migration test**

Create `__tests__/prisma/practice-staff-migration.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { STAFF_NAME_MAX } from "@/types/practice-planner";

const sql = readFileSync(join(process.cwd(), "prisma/migrations/20261005120000_practice_session_staff/migration.sql"), "utf8");
const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
const model = (name: string) => schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? "";

describe("practice staff migration", () => {
    it("creates the staff list with its CHECKs, in step with the code's name limit", () => {
        expect(sql).toContain(`CREATE TABLE "practice_session_staff"`);
        expect(sql).toContain(`CHECK (char_length("name") BETWEEN 1 AND ${STAFF_NAME_MAX})`);
        expect(sql).toContain(`CONSTRAINT "practice_session_staff_position_check" CHECK ("position" >= 0)`);
        expect(sql).toContain(`CHECK (num_nonnulls("teamOfficialId", "userId") <= 1)`);
    });

    it("keeps positions and names unique per practice, names ignoring case through a hand-written expression index", () => {
        expect(sql).toContain(`CREATE UNIQUE INDEX "practice_session_staff_sessionId_position_key" ON "practice_session_staff"("sessionId", "position");`);
        expect(sql).toContain(`CREATE UNIQUE INDEX "practice_session_staff_sessionId_lower_name_key" ON "practice_session_staff"("sessionId", lower("name"));`);
    });

    it("creates the row assignments, one per row and person, ordered", () => {
        expect(sql).toContain(`CREATE TABLE "practice_session_play_staff"`);
        expect(sql).toContain(`CONSTRAINT "practice_session_play_staff_pkey" PRIMARY KEY ("playRowId", "staffId")`);
        expect(sql).toContain(`CONSTRAINT "practice_session_play_staff_position_check" CHECK ("position" >= 0)`);
    });

    it("cascades from the practice, the row and the person, and only unlinks when an official or an account goes", () => {
        expect(sql).toContain(`FOREIGN KEY ("sessionId") REFERENCES "practice_sessions"("id") ON DELETE CASCADE`);
        expect(sql).toContain(`FOREIGN KEY ("teamOfficialId") REFERENCES "team_officials"("id") ON DELETE SET NULL`);
        expect(sql).toContain(`FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL`);
        expect(sql).toContain(`FOREIGN KEY ("playRowId") REFERENCES "practice_session_plays"("id") ON DELETE CASCADE`);
        expect(sql).toContain(`FOREIGN KEY ("staffId") REFERENCES "practice_session_staff"("id") ON DELETE CASCADE`);
    });

    it("is additive: it only creates, and alters nothing but the two new tables", () => {
        expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX)/i);
        expect(sql).not.toMatch(/^\s*(UPDATE|DELETE)\s/im);
        const altered = [...sql.matchAll(/ALTER TABLE "([^"]+)"/g)].map((match) => match[1]);
        expect(new Set(altered)).toEqual(new Set(["practice_session_staff", "practice_session_play_staff"]));
    });

    it("matches the Prisma schema", () => {
        const staff = model("PracticeSessionStaff");
        expect(staff).toMatch(/name\s+String/);
        expect(staff).toMatch(/position\s+Int/);
        expect(staff).toMatch(/session\s+PracticeSession\s+@relation\(fields: \[sessionId\], references: \[id\], onDelete: Cascade\)/);
        expect(staff).toMatch(/teamOfficial\s+TeamOfficial\?\s+@relation\(fields: \[teamOfficialId\], references: \[id\], onDelete: SetNull\)/);
        expect(staff).toMatch(/user\s+User\?\s+@relation\(fields: \[userId\], references: \[id\], onDelete: SetNull\)/);
        expect(staff).toContain("@@unique([sessionId, position])");
        expect(staff).toContain(`@@map("practice_session_staff")`);
        const assigned = model("PracticeSessionPlayStaff");
        expect(assigned).toMatch(/playRow\s+PracticeSessionPlay\s+@relation\(fields: \[playRowId\], references: \[id\], onDelete: Cascade\)/);
        expect(assigned).toMatch(/staff\s+PracticeSessionStaff\s+@relation\(fields: \[staffId\], references: \[id\], onDelete: Cascade\)/);
        expect(assigned).toContain("@@id([playRowId, staffId])");
        expect(assigned).toContain(`@@map("practice_session_play_staff")`);
        expect(model("PracticeSession")).toMatch(/staff\s+PracticeSessionStaff\[\]/);
        expect(model("PracticeSessionPlay")).toMatch(/staff\s+PracticeSessionPlayStaff\[\]/);
    });
});
```

Run: `bun run test __tests__/prisma/practice-staff-migration.test.ts`
Expected: FAIL with ENOENT for the migration file.

- [ ] **Step 2: Add the models and the hand-written migration**

In `prisma/schema.prisma`:
- in `model User`, after `practiceSessions             PracticeSession[]`, add `  practiceStaff                PracticeSessionStaff[]`;
- in `model TeamOfficial`, after the `user   User?   @relation(…)` line, add:

```prisma

  // Practice staff entries linked to this official (spec R4). Deleting the
  // official leaves the name, unlinked (onDelete: SetNull on the other side).
  practiceStaff PracticeSessionStaff[]
```

- in `model PracticeSession`, after `ownedPlays Play[] …`, add:

```prisma
  // The practice's staff list (practice staff, spec R2).
  staff      PracticeSessionStaff[]
```

- in `model PracticeSessionPlay`, after the `play   Play?  @relation(…)` line, add:

```prisma
  // Who runs this row (practice staff). Rows are deleted and recreated on
  // every save, which cascades these; updatePracticeSession carries them.
  staff  PracticeSessionPlayStaff[]
```

After `model PracticeSessionPlay { … }`, add:

```prisma
// A person on a practice's staff (practice staff, spec R2): a team official,
// a team admin, or a typed name. Hand-written migration
// 20261005120000_practice_session_staff also adds what Prisma can't model:
// CHECK (char_length("name") BETWEEN 1 AND 60), CHECK ("position" >= 0),
// CHECK (num_nonnulls("teamOfficialId", "userId") <= 1), and the unique index
// on ("sessionId", lower("name")). Keep them by hand if regenerated.
model PracticeSessionStaff {
  id       String @id @default(cuid())
  /// 1-60 characters, cleaned; unique per practice ignoring case.
  name     String
  /// Order in the practice's list, unique per practice.
  position Int

  sessionId String
  session   PracticeSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  /// Linked team official (ACTIVE or INVITED when saved). Never both links.
  teamOfficialId String?
  teamOfficial   TeamOfficial? @relation(fields: [teamOfficialId], references: [id], onDelete: SetNull)

  /// A team admin who isn't an official.
  userId String?
  user   User?   @relation(fields: [userId], references: [id], onDelete: SetNull)

  assignments PracticeSessionPlayStaff[]

  @@unique([sessionId, position])
  @@index([teamOfficialId])
  @@index([userId])
  @@map("practice_session_staff")
}

// One person running one row, in order within the row (practice staff).
// CHECK ("position" >= 0) is in the hand-written migration.
model PracticeSessionPlayStaff {
  playRowId String
  playRow   PracticeSessionPlay @relation(fields: [playRowId], references: [id], onDelete: Cascade)

  staffId String
  staff   PracticeSessionStaff @relation(fields: [staffId], references: [id], onDelete: Cascade)

  position Int

  @@id([playRowId, staffId])
  @@index([staffId])
  @@map("practice_session_play_staff")
}
```

Create `prisma/migrations/20261005120000_practice_session_staff/migration.sql`:

```sql
-- Practice staff: a per-practice staff list and who runs each row.
-- Hand-written and additive: the dev database is behind on migrations, so
-- `migrate dev` cannot be used. It creates two tables and touches nothing else.
-- Prisma models neither the CHECK constraints nor the unique index on
-- lower("name"): keep them by hand if these tables are ever regenerated.

-- CreateTable
CREATE TABLE "practice_session_staff" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "teamOfficialId" TEXT,
    "userId" TEXT,

    CONSTRAINT "practice_session_staff_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "practice_session_staff_name_check" CHECK (char_length("name") BETWEEN 1 AND 60),
    CONSTRAINT "practice_session_staff_position_check" CHECK ("position" >= 0),
    CONSTRAINT "practice_session_staff_link_check" CHECK (num_nonnulls("teamOfficialId", "userId") <= 1)
);

-- CreateTable
CREATE TABLE "practice_session_play_staff" (
    "playRowId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "practice_session_play_staff_pkey" PRIMARY KEY ("playRowId", "staffId"),
    CONSTRAINT "practice_session_play_staff_position_check" CHECK ("position" >= 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "practice_session_staff_sessionId_position_key" ON "practice_session_staff"("sessionId", "position");

-- CreateIndex: names are unique per practice ignoring case (an expression index Prisma can't model)
CREATE UNIQUE INDEX "practice_session_staff_sessionId_lower_name_key" ON "practice_session_staff"("sessionId", lower("name"));

-- CreateIndex
CREATE INDEX "practice_session_staff_teamOfficialId_idx" ON "practice_session_staff"("teamOfficialId");

-- CreateIndex
CREATE INDEX "practice_session_staff_userId_idx" ON "practice_session_staff"("userId");

-- CreateIndex
CREATE INDEX "practice_session_play_staff_staffId_idx" ON "practice_session_play_staff"("staffId");

-- AddForeignKey
ALTER TABLE "practice_session_staff" ADD CONSTRAINT "practice_session_staff_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "practice_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_session_staff" ADD CONSTRAINT "practice_session_staff_teamOfficialId_fkey" FOREIGN KEY ("teamOfficialId") REFERENCES "team_officials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_session_staff" ADD CONSTRAINT "practice_session_staff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_session_play_staff" ADD CONSTRAINT "practice_session_play_staff_playRowId_fkey" FOREIGN KEY ("playRowId") REFERENCES "practice_session_plays"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_session_play_staff" ADD CONSTRAINT "practice_session_play_staff_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "practice_session_staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

Run: `bun run db:generate && bun run test __tests__/prisma/practice-staff-migration.test.ts`
Expected: the client generates; the test passes. Do **not** run any migrate command; CI applies the migration with `db:migrate:deploy`.

Run: `bun run type-check`
Expected: exit 0 (nothing reads the new relations yet).

- [ ] **Step 3: Write the failing save tests**

Create `__tests__/lib/actions/practice-sessions-staff.test.ts`:

```ts
/** Practice staff in createPracticeSession / updatePracticeSession (spec R2, R3, R4). */
import { beforeEach, describe, expect, it, vi } from "vitest";

// Staff ids are generated before insert; a per-test counter keeps them readable.
const playIds = vi.hoisted(() => ({ next: 0 }));
vi.mock("@/lib/services/play-ids", () => ({ newPlayId: () => `cnew${playIds.next++}xxxxxxxxxxxxxxxxxxxx` }));

const { mockAuth, models, mockPrisma } = vi.hoisted(() => {
    const models = {
        play: { findMany: vi.fn(), createManyAndReturn: vi.fn(), deleteMany: vi.fn() },
        practiceSession: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
        practiceSessionPlay: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
        practiceSessionStaff: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
        practiceSessionPlayStaff: { findMany: vi.fn(), createMany: vi.fn() },
        teamOfficial: { findMany: vi.fn() },
        teamMember: { findFirst: vi.fn(), findMany: vi.fn() },
        event: { findUnique: vi.fn(), delete: vi.fn() },
    };
    return {
        models,
        mockAuth: { requireTeamAdmin: vi.fn(), requireTeamMember: vi.fn(), requireLeagueRole: vi.fn() },
        mockPrisma: { $transaction: vi.fn(async (fn: (tx: typeof models) => unknown) => fn(models)), ...models },
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

import { createPracticeSession, updatePracticeSession } from "@/lib/actions/practice-sessions";
import {
    ROW_STAFF_DUPLICATE_MESSAGE,
    ROW_STAFF_UNKNOWN_MESSAGE,
    STAFF_ADMIN_MESSAGE,
    STAFF_NAME_TAKEN_MESSAGE,
    STAFF_OFFICIAL_MESSAGE,
} from "@/lib/utils/session-staff";

const TEAM = "cteamxxxxxxxxxxxxxxxxxxxx";
const USER = "cuserxxxxxxxxxxxxxxxxxxxx";
const SESSION = "csessionxxxxxxxxxxxxxxxxx";
const OWNED = "cownedxxxxxxxxxxxxxxxxxxx";
const OFFICIAL = "cofficialxxxxxxxxxxxxxxxx";
const ADMIN = "cadminxxxxxxxxxxxxxxxxxxx";
const STORED = "cstoredstaffxxxxxxxxxxxxx";
const id = (n: number) => `cnew${n}xxxxxxxxxxxxxxxxxxxx`;

/** A warm-up then an owned drill, as the current editor sends them. */
function rows(staff: [string[]?, string[]?] = []) {
    return [
        { kind: "warmup", clientKey: "kw", sequence: 0, duration: 8, instructions: "", label: null, ...(staff[0] && { staff: staff[0] }) },
        { kind: "drill", playId: OWNED, clientKey: "k1", sequence: 1, duration: 10, instructions: "", runsWithPrevious: false, stays: false, rotateEveryMinutes: null, ...(staff[1] && { staff: staff[1] }) },
    ];
}

type SaveInput = Parameters<typeof createPracticeSession>[0];

/** A save as the client sends it (rows and staff as raw payload, which the action parses). */
function save(extra: Record<string, unknown> = {}): SaveInput {
    return { title: "Tuesday", date: new Date("2026-10-06T22:00:00.000Z"), duration: 60, teamId: TEAM, transitionMinutes: 0, plays: rows(), ...extra } as SaveInput;
}

/** The rows as written, read back by sequence (writeRowStaff). */
const WRITTEN = [{ id: "crow0", sequence: 0 }, { id: "crow1", sequence: 1 }];

beforeEach(() => {
    vi.clearAllMocks();
    playIds.next = 0;
    mockAuth.requireTeamAdmin.mockResolvedValue(USER);
    models.teamMember.findFirst.mockResolvedValue({ id: "cmemberxxxxxxxxxxxxxxxxxx" });
    models.teamMember.findMany.mockResolvedValue([]);
    models.teamOfficial.findMany.mockResolvedValue([]);
    models.practiceSession.create.mockResolvedValue({ id: SESSION, title: "Tuesday", date: new Date() });
    models.practiceSession.findUnique.mockResolvedValue({ id: SESSION, teamId: TEAM, isShared: false, venueReservationId: null, transitionMinutes: 0 });
    models.practiceSession.update.mockResolvedValue({ id: SESSION, title: "Tuesday", date: new Date() });
    models.practiceSessionPlay.deleteMany.mockResolvedValue({ count: 2 });
    models.practiceSessionPlay.createMany.mockResolvedValue({ count: 2 });
    models.practiceSessionPlay.findMany.mockImplementation(async (args: { where: { sequence?: { in: number[] }; kind?: unknown } }) => {
        if (args.where.sequence) return WRITTEN.filter((row) => args.where.sequence?.in.includes(row.sequence));
        if (args.where.kind) return [{ sequence: 0 }];
        return [{ playId: null, kind: "warmup", stays: false, rotateEveryMinutes: null }, { playId: OWNED, kind: "drill", stays: false, rotateEveryMinutes: null }];
    });
    models.practiceSessionStaff.findMany.mockResolvedValue([]);
    models.practiceSessionStaff.deleteMany.mockResolvedValue({ count: 0 });
    models.practiceSessionStaff.createMany.mockResolvedValue({ count: 0 });
    models.practiceSessionPlayStaff.findMany.mockResolvedValue([]);
    models.practiceSessionPlayStaff.createMany.mockResolvedValue({ count: 0 });
    models.play.deleteMany.mockResolvedValue({ count: 0 });
    models.play.findMany.mockResolvedValue([
        { id: OWNED, teamId: TEAM, name: "Breakout", isTemplate: false, sessionId: SESSION, sourcePlayId: null, description: null, thumbnail: null, playData: {} },
    ]);
});

const staffWritten = () => models.practiceSessionStaff.createMany.mock.calls[0]?.[0].data;
const assignmentsWritten = () => models.practiceSessionPlayStaff.createMany.mock.calls[0]?.[0].data;

describe("createPracticeSession with staff (spec R3)", () => {
    it("writes the list in order and each row's assignments, keys mapped to new ids, rows found by sequence", async () => {
        const result = await createPracticeSession(save({
            staff: [{ key: "k-lee", name: "Coach Lee" }, { key: "k-sam", name: " Sam " }],
            plays: rows([["k-sam"], ["k-lee", "k-sam"]]),
        }));
        expect(result.success).toBe(true);
        expect(staffWritten()).toEqual([
            { id: id(0), sessionId: SESSION, name: "Coach Lee", position: 0, teamOfficialId: null, userId: null },
            { id: id(1), sessionId: SESSION, name: "Sam", position: 1, teamOfficialId: null, userId: null },
        ]);
        expect(assignmentsWritten()).toEqual([
            { playRowId: "crow0", staffId: id(1), position: 0 },
            { playRowId: "crow1", staffId: id(0), position: 0 },
            { playRowId: "crow1", staffId: id(1), position: 1 },
        ]);
    });

    it("stores no staff when the create sends none", async () => {
        await createPracticeSession(save());
        expect(models.practiceSessionStaff.createMany).not.toHaveBeenCalled();
        expect(models.practiceSessionPlayStaff.createMany).not.toHaveBeenCalled();
    });
});

describe("updatePracticeSession: checks after authentication and authorization (spec R3, R4)", () => {
    it("checks nothing about staff for a caller who isn't a team admin", async () => {
        mockAuth.requireTeamAdmin.mockRejectedValue(new Error("Unauthorized: Only team admins can perform this action"));
        const result = await updatePracticeSession({ id: SESSION, ...save({ staff: [{ key: OFFICIAL, name: "Coach Lee", teamOfficialId: OFFICIAL }] }) });
        expect(result).toEqual({ success: false, error: "Unauthorized: Only team admins can perform this action" });
        expect(models.teamOfficial.findMany).not.toHaveBeenCalled();
    });

    it("refuses an official who isn't an active or invited official of this team, before rewriting anything", async () => {
        const result = await updatePracticeSession({ id: SESSION, ...save({ staff: [{ key: OFFICIAL, name: "Coach Lee", teamOfficialId: OFFICIAL }] }) });
        expect(result).toEqual({ success: false, error: STAFF_OFFICIAL_MESSAGE });
        expect(models.teamOfficial.findMany).toHaveBeenCalledWith({
            where: { id: { in: [OFFICIAL] }, teamId: TEAM, status: { in: ["ACTIVE", "INVITED"] } },
            select: { id: true },
        });
        expect(models.practiceSessionPlay.deleteMany).not.toHaveBeenCalled();
    });

    it("refuses a user who isn't an admin of this team", async () => {
        const result = await updatePracticeSession({ id: SESSION, ...save({ staff: [{ key: "k", name: "Pat", userId: ADMIN }] }) });
        expect(result).toEqual({ success: false, error: STAFF_ADMIN_MESSAGE });
        expect(models.teamMember.findMany).toHaveBeenCalledWith({
            where: { userId: { in: [ADMIN] }, teamId: TEAM, role: "ADMIN" },
            select: { userId: true },
        });
    });

    it("keeps the links of an active official and an admin", async () => {
        models.teamOfficial.findMany.mockResolvedValue([{ id: OFFICIAL }]);
        models.teamMember.findMany.mockResolvedValue([{ userId: ADMIN }]);
        const result = await updatePracticeSession({ id: SESSION, ...save({
            staff: [{ key: "k-lee", name: "Coach Lee", teamOfficialId: OFFICIAL }, { key: "k-pat", name: "Pat", userId: ADMIN }],
        }) });
        expect(result.success).toBe(true);
        expect(staffWritten().map((row: { teamOfficialId: string | null; userId: string | null }) => [row.teamOfficialId, row.userId])).toEqual([[OFFICIAL, null], [null, ADMIN]]);
    });

    it("refuses names that differ only in case, a row run by someone off the list, and a person twice on a row", async () => {
        const refused = async (extra: Record<string, unknown>) => (await updatePracticeSession({ id: SESSION, ...save(extra) })).success === false;
        const error = async (extra: Record<string, unknown>) => {
            const result = await updatePracticeSession({ id: SESSION, ...save(extra) });
            return result.success ? null : result.error;
        };
        expect(await error({ staff: [{ key: "a", name: "Sam" }, { key: "b", name: "SAM" }] })).toBe(STAFF_NAME_TAKEN_MESSAGE);
        expect(await error({ staff: [{ key: "a", name: "Sam" }], plays: rows([["z"]]) })).toBe(ROW_STAFF_UNKNOWN_MESSAGE);
        expect(await error({ staff: [{ key: "a", name: "Sam" }], plays: rows([["a", "a"]]) })).toBe(ROW_STAFF_DUPLICATE_MESSAGE);
        expect(await refused({ staff: Array.from({ length: 13 }, (_, i) => ({ key: `k${i}`, name: `Coach ${i}` })) })).toBe(true);
        expect(models.practiceSessionPlay.deleteMany).not.toHaveBeenCalled();
    });

    it("shows a name clash the database catches (the lower(name) index) as the name message", async () => {
        models.practiceSessionStaff.createMany.mockRejectedValue(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }));
        const result = await updatePracticeSession({ id: SESSION, ...save({ staff: [{ key: "a", name: "Straße" }] }) });
        expect(result).toEqual({ success: false, error: STAFF_NAME_TAKEN_MESSAGE });
    });
});

describe("updatePracticeSession: writing a sent list (spec R3)", () => {
    it("keeps a stored person's id, gives a new person a new id, and replaces the list whole", async () => {
        models.practiceSessionStaff.findMany.mockResolvedValue([{ id: STORED }]);
        await updatePracticeSession({ id: SESSION, ...save({
            staff: [{ key: STORED, name: "Coach Lee" }, { key: "k-new", name: "Sam" }],
            plays: rows([[STORED], ["k-new"]]),
        }) });
        expect(models.practiceSessionStaff.findMany).toHaveBeenCalledWith({ where: { sessionId: SESSION }, select: { id: true } });
        expect(models.practiceSessionStaff.deleteMany).toHaveBeenCalledWith({ where: { sessionId: SESSION } });
        expect(staffWritten().map((row: { id: string }) => row.id)).toEqual([STORED, id(0)]);
        expect(models.practiceSessionStaff.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(models.practiceSessionStaff.createMany.mock.invocationCallOrder[0]);
        expect(assignmentsWritten()).toEqual([
            { playRowId: "crow0", staffId: STORED, position: 0 },
            { playRowId: "crow1", staffId: id(0), position: 0 },
        ]);
    });

    it("clears the list and every assignment with an explicit []", async () => {
        await updatePracticeSession({ id: SESSION, ...save({ staff: [] }) });
        expect(models.practiceSessionStaff.deleteMany).toHaveBeenCalledWith({ where: { sessionId: SESSION } });
        expect(models.practiceSessionStaff.createMany).not.toHaveBeenCalled();
        expect(models.practiceSessionPlayStaff.createMany).not.toHaveBeenCalled();
        expect(models.practiceSessionPlayStaff.findMany).not.toHaveBeenCalled();
    });

    it("gives a row without staff nobody when the save sends a list", async () => {
        await updatePracticeSession({ id: SESSION, ...save({ staff: [{ key: "a", name: "Sam" }] }) });
        expect(staffWritten()).toHaveLength(1);
        expect(models.practiceSessionPlayStaff.createMany).not.toHaveBeenCalled();
    });
});

describe("updatePracticeSession without staff: unchanged across the row rewrite (spec R3, Review Focus 1)", () => {
    const stored = [
        { staffId: "cstaffsam", playRowId: "cold0", playRow: { playId: null, kind: "warmup", sequence: 0 } },
        { staffId: "cstafflee", playRowId: "cold1", playRow: { playId: OWNED, kind: "drill", sequence: 1 } },
        { staffId: "cstaffsam", playRowId: "cold1", playRow: { playId: OWNED, kind: "drill", sequence: 1 } },
    ];

    it("keeps the stored list and carries each row's assignments to the new rows: a drill by its play, a block by its place", async () => {
        models.practiceSessionPlayStaff.findMany.mockResolvedValue(stored);
        // An editor built before practice staff: no `staff` on the session; stray row keys are ignored.
        const result = await updatePracticeSession({ id: SESSION, ...save({ plays: rows([["stray"]]) }) });
        expect(result.success).toBe(true);
        expect(models.practiceSessionStaff.deleteMany).not.toHaveBeenCalled();
        expect(models.practiceSessionStaff.createMany).not.toHaveBeenCalled();
        expect(models.practiceSessionPlayStaff.findMany).toHaveBeenCalledWith({
            where: { playRow: { sessionId: SESSION } },
            orderBy: { position: "asc" },
            select: { staffId: true, playRowId: true, playRow: { select: { playId: true, kind: true, sequence: true } } },
        });
        expect(assignmentsWritten()).toEqual([
            { playRowId: "crow0", staffId: "cstaffsam", position: 0 },
            { playRowId: "crow1", staffId: "cstafflee", position: 0 },
            { playRowId: "crow1", staffId: "cstaffsam", position: 1 },
        ]);
    });

    it("reads the assignments before the rows are deleted (the delete cascades them)", async () => {
        models.practiceSessionPlayStaff.findMany.mockResolvedValue(stored);
        await updatePracticeSession({ id: SESSION, ...save() });
        expect(models.practiceSessionPlayStaff.findMany.mock.invocationCallOrder[0])
            .toBeLessThan(models.practiceSessionPlay.deleteMany.mock.invocationCallOrder[0]);
        expect(models.practiceSessionPlayStaff.createMany.mock.invocationCallOrder[0])
            .toBeGreaterThan(models.practiceSession.update.mock.invocationCallOrder[0]);
    });

    it("drops a block's staff rather than giving it to a different kind of block", async () => {
        models.practiceSessionPlayStaff.findMany.mockResolvedValue(stored);
        const plays = rows();
        plays[0] = { ...plays[0], kind: "break" };
        await updatePracticeSession({ id: SESSION, ...save({ plays }) });
        expect(assignmentsWritten()).toEqual([
            { playRowId: "crow1", staffId: "cstafflee", position: 0 },
            { playRowId: "crow1", staffId: "cstaffsam", position: 1 },
        ]);
    });

    it("reads one table and writes nothing when nothing was assigned", async () => {
        await updatePracticeSession({ id: SESSION, ...save() });
        expect(models.practiceSessionPlayStaff.createMany).not.toHaveBeenCalled();
        expect(models.practiceSessionPlay.findMany).not.toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ kind: { not: "drill" } }) }));
    });
});
```

In each of these existing harnesses, add the model the update path now reads, resolving `[]`:
- `__tests__/lib/actions/practice-sessions-ownership.test.ts` and `__tests__/lib/actions/practice-sessions-stations.test.ts`: add `practiceSessionPlayStaff: { findMany: vi.fn(), createMany: vi.fn() },` to `models`, and `models.practiceSessionPlayStaff.findMany.mockResolvedValue([]);` to the top-level `beforeEach`;
- `__tests__/lib/actions/practice-sessions.test.ts`: the same in its `models`, and `mockTx.practiceSessionPlayStaff.findMany.mockResolvedValue([]);` in the top-level `beforeEach`;
- `__tests__/integration/reservation-writer-matrix.test.ts`: add `practiceSessionPlayStaff: delegate(),` after `practiceSessionPlay: delegate(),`, and `mockPrisma.practiceSessionPlayStaff.findMany.mockResolvedValue([]);` after `mockPrisma.practiceSessionPlay.findMany.mockResolvedValue([]);`.

- [ ] **Step 4: Run the tests to verify they fail**

Run: `bun run test __tests__/lib/actions/practice-sessions-staff.test.ts`
Expected: FAIL (no staff is written, nothing is refused, nothing is carried).

- [ ] **Step 5: Create `lib/services/practice-session-staff.ts`**

```ts
/**
 * Practice staff database work (spec R2–R5) that runs INSIDE the calling
 * Server Action's transaction; these are not actions (ADR-0002). The rules
 * themselves are pure, in lib/utils/session-staff.ts.
 */
import type { Prisma } from "@prisma/client";
import { newPlayId } from "@/lib/services/play-ids";
import { isBlockKind, toRowKind } from "@/lib/utils/session-rows";
import { STAFF_ADMIN_MESSAGE, STAFF_NAME_TAKEN_MESSAGE, STAFF_OFFICIAL_MESSAGE, type StoredRowStaff } from "@/lib/utils/session-staff";

/** The database refused a name (the unique index on lower("name")): shown as the name message. */
export class StaffNameConflictError extends Error {
    constructor() {
        super(STAFF_NAME_TAKEN_MESSAGE);
        this.name = "StaffNameConflictError";
    }
}

function isUniqueViolation(error: unknown): boolean {
    return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

type StaffLink = { teamOfficialId?: string | null; userId?: string | null };

/**
 * A link the practice's team doesn't allow (spec R3, R4): an official must be
 * ACTIVE or INVITED on the team, a user an ADMIN member of it. Checked after
 * authorization, inside the save's transaction.
 */
export async function staffLinkError(tx: Prisma.TransactionClient, teamId: string, staff: readonly StaffLink[]): Promise<string | null> {
    const officialIds = [...new Set(staff.flatMap((member) => (member.teamOfficialId ? [member.teamOfficialId] : [])))];
    const userIds = [...new Set(staff.flatMap((member) => (member.userId ? [member.userId] : [])))];
    if (officialIds.length > 0) {
        const officials = await tx.teamOfficial.findMany({
            where: { id: { in: officialIds }, teamId, status: { in: ["ACTIVE", "INVITED"] } },
            select: { id: true },
        });
        if (officials.length !== officialIds.length) return STAFF_OFFICIAL_MESSAGE;
    }
    if (userIds.length > 0) {
        const admins = await tx.teamMember.findMany({
            where: { userId: { in: userIds }, teamId, role: "ADMIN" },
            select: { userId: true },
        });
        if (new Set(admins.map((admin) => admin.userId)).size !== userIds.length) return STAFF_ADMIN_MESSAGE;
    }
    return null;
}

/**
 * Replaces the practice's staff list with a sent one (spec R3), in its order.
 * A key that is a stored staff id of this practice keeps that id; any other key
 * gets a new id. Deleting first lets a save swap two names or positions (both
 * unique). The delete cascades the old assignments; the caller writes new ones.
 * Returns key → id.
 */
export async function replaceSessionStaff(
    tx: Prisma.TransactionClient,
    sessionId: string,
    staff: ReadonlyArray<{ key: string; name: string } & StaffLink>,
): Promise<Map<string, string>> {
    const stored = await tx.practiceSessionStaff.findMany({ where: { sessionId }, select: { id: true } });
    const storedIds = new Set(stored.map((member) => member.id));
    const ids = new Map(staff.map((member) => [member.key, storedIds.has(member.key) ? member.key : newPlayId()]));
    await tx.practiceSessionStaff.deleteMany({ where: { sessionId } });
    if (staff.length === 0) return ids;
    try {
        await tx.practiceSessionStaff.createMany({
            data: staff.map((member, position) => ({
                id: ids.get(member.key) as string,
                sessionId,
                name: member.name,
                position,
                teamOfficialId: member.teamOfficialId ?? null,
                userId: member.userId ?? null,
            })),
        });
    } catch (error) {
        if (isUniqueViolation(error)) throw new StaffNameConflictError();
        throw error;
    }
    return ids;
}

/**
 * Writes each row's staff, in order, to the rows just written. Rows are found
 * by sequence (unique per practice), never by position in a returned list.
 * Reads and writes nothing when no row has anyone.
 */
export async function writeRowStaff(
    tx: Prisma.TransactionClient,
    sessionId: string,
    assignments: ReadonlyArray<{ sequence: number; staffIds: readonly string[] }>,
): Promise<void> {
    const wanted = assignments.filter((assignment) => assignment.staffIds.length > 0);
    if (wanted.length === 0) return;
    const written = await tx.practiceSessionPlay.findMany({
        where: { sessionId, sequence: { in: wanted.map((assignment) => assignment.sequence) } },
        select: { id: true, sequence: true },
    });
    const rowIds = new Map(written.map((row) => [row.sequence, row.id]));
    await tx.practiceSessionPlayStaff.createMany({
        data: wanted.flatMap((assignment) => {
            const playRowId = rowIds.get(assignment.sequence);
            if (playRowId === undefined) throw new Error(`No row at sequence ${assignment.sequence}`);
            return assignment.staffIds.map((staffId, position) => ({ playRowId, staffId, position }));
        }),
    });
}

/**
 * The stored assignments, read BEFORE the rows are deleted (spec R3: the delete
 * cascades them), grouped by row in each row's order, with the stored block
 * rows' sequences when a block had anyone (carryRowStaff's block identity).
 */
export async function readCarriedRowStaff(
    tx: Prisma.TransactionClient,
    sessionId: string,
): Promise<{ stored: StoredRowStaff[]; storedBlockSequences: number[] }> {
    const assigned = await tx.practiceSessionPlayStaff.findMany({
        where: { playRow: { sessionId } },
        orderBy: { position: "asc" },
        select: { staffId: true, playRowId: true, playRow: { select: { playId: true, kind: true, sequence: true } } },
    });
    if (assigned.length === 0) return { stored: [], storedBlockSequences: [] };
    const byRow = new Map<string, StoredRowStaff>();
    for (const entry of assigned) {
        const row = byRow.get(entry.playRowId) ?? {
            playId: entry.playRow.playId,
            kind: toRowKind(entry.playRow.kind),
            sequence: entry.playRow.sequence,
            staffIds: [],
        };
        row.staffIds.push(entry.staffId);
        byRow.set(entry.playRowId, row);
    }
    const stored = [...byRow.values()];
    const storedBlockSequences = stored.some((row) => isBlockKind(row.kind))
        ? (
              await tx.practiceSessionPlay.findMany({
                  where: { sessionId, kind: { not: "drill" } },
                  orderBy: { sequence: "asc" },
                  select: { sequence: true },
              })
          ).map((row) => row.sequence)
        : [];
    return { stored, storedBlockSequences };
}
```

- [ ] **Step 6: Write and carry staff in `lib/actions/practice-sessions.ts`**

Add the imports:

```ts
import { carryRowStaff, sessionStaffError } from "@/lib/utils/session-staff";
import {
    StaffNameConflictError,
    readCarriedRowStaff,
    replaceSessionStaff,
    staffLinkError,
    writeRowStaff,
} from "@/lib/services/practice-session-staff";
```

and `type SessionStaffSaveInput,` to the `@/lib/utils/validation` import.

After `class SessionRowsRejected extends Error {}`, add:

```ts
/**
 * A sent staff list's problem (spec R3, R4): the pure rules (limits, names,
 * the rows' keys), then the links. Runs inside the save's transaction, after
 * authentication and authorization.
 */
async function staffSaveError(
    tx: Prisma.TransactionClient,
    teamId: string,
    staff: SessionStaffSaveInput[],
    rows: ResolvedRow[],
): Promise<string | null> {
    return sessionStaffError(staff, rows) ?? (await staffLinkError(tx, teamId, staff));
}

/** Writes a sent list and each row's staff (spec R3): keys become ids; a row without `staff` has nobody. */
async function writeSentStaff(tx: Prisma.TransactionClient, sessionId: string, staff: SessionStaffSaveInput[], rows: ResolvedRow[]): Promise<void> {
    const ids = await replaceSessionStaff(tx, sessionId, staff);
    await writeRowStaff(
        tx,
        sessionId,
        rows.map((row) => ({
            sequence: row.sequence,
            staffIds: (row.staff ?? []).map((key) => {
                const staffId = ids.get(key);
                if (staffId === undefined) throw new Error(`No staff member for key ${key}`);
                return staffId;
            }),
        })),
    );
}
```

In `createPracticeSession`, at the top of the `runVenueReservationTransaction(async (tx) => {` callback, before `let reservation`, add:

```ts
            // A sent staff list is checked here, after authorization and before anything is written.
            if (validated.staff) {
                const staffError = await staffSaveError(tx, validated.teamId, validated.staff, rows);
                if (staffError) throw new SessionRowsRejected(staffError);
            }
```

and after the `if (rows.length > 0) { await tx.practiceSessionPlay.createMany(…) }` block, add:

```ts
            if (validated.staff) await writeSentStaff(tx, createdSession.id, validated.staff, rows);
```

In its `catch`, replace `if (error instanceof SessionDrillError) {` with:

```ts
        if (error instanceof SessionDrillError || error instanceof SessionRowsRejected || error instanceof StaffNameConflictError) {
```

In `updatePracticeSession`, right after `const rows = withRotationMinutes(resolved);`, add:

```ts
            // Practice staff (spec R3). Sent: checked here, after authorization, before anything is
            // rewritten. Absent: unchanged. The rows are deleted and recreated below and the delete
            // cascades their assignments, so they are read now and carried to the new rows.
            if (validated.staff) {
                const staffError = await staffSaveError(tx, validated.teamId, validated.staff, rows);
                if (staffError) throw new SessionRowsRejected(staffError);
            }
            const carried = validated.staff ? null : await readCarriedRowStaff(tx, validated.id);
```

After `await deleteOrphanedSessionDrills(tx, { … });`, add:

```ts
            if (validated.staff) {
                await writeSentStaff(tx, validated.id, validated.staff, rows);
            } else if (carried) {
                // Row identity (Global Constraints): a drill by its owned play id, a block by its place among the blocks.
                await writeRowStaff(
                    tx,
                    validated.id,
                    carryRowStaff(
                        carried.stored,
                        carried.storedBlockSequences,
                        rows.map((row) => ({
                            kind: row.kind,
                            playId: row.kind === "drill" ? ownedByKey.get(row.clientKey) ?? null : null,
                            sequence: row.sequence,
                        })),
                    ),
                );
            }
```

In its `catch`, replace `if (error instanceof SessionDrillError || error instanceof SessionRowsRejected) {` with:

```ts
        if (error instanceof SessionDrillError || error instanceof SessionRowsRejected || error instanceof StaffNameConflictError) {
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `bun run test __tests__/lib/actions/practice-sessions-staff.test.ts __tests__/lib/actions/practice-sessions-ownership.test.ts __tests__/lib/actions/practice-sessions-stations.test.ts __tests__/lib/actions/practice-sessions.test.ts __tests__/integration/reservation-writer-matrix.test.ts __tests__/prisma/practice-staff-migration.test.ts`
Expected: PASS.

Run: `bun run type-check && bun run check:raw-sql`
Expected: both exit 0.

- [ ] **Step 8: Commit**

```bash
/usr/bin/git add prisma/schema.prisma prisma/migrations/20261005120000_practice_session_staff/migration.sql \
  lib/services/practice-session-staff.ts lib/actions/practice-sessions.ts \
  __tests__/prisma/practice-staff-migration.test.ts __tests__/lib/actions/practice-sessions-staff.test.ts \
  __tests__/lib/actions/practice-sessions-ownership.test.ts __tests__/lib/actions/practice-sessions-stations.test.ts \
  __tests__/lib/actions/practice-sessions.test.ts __tests__/integration/reservation-writer-matrix.test.ts
/usr/bin/git commit -m "feat(practice-planner): store practice staff and carry assignments across saves" -m "Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 4: Hosted reads, the picker read and the copy paths

Spec R4, R5 and R9's data. After this task the session page and the editor load the staff list and each row's staff ids, a stale link loads unlinked, the picker has a safe read, and duplicate and import carry staff (detach is proven to keep it).

**Files:**
- Modify: `lib/actions/practice-session-queries.ts` (imports, `getPracticeSessionDetail`, `getPracticeSessionForEdit`; new `getPracticeStaffOptions`)
- Modify: `lib/services/practice-session-staff.ts` (new `PRACTICE_STAFF_COPY_SELECT`, `STAFF_FIELDS_NOT_COPIED`, `ROW_STAFF_COPY_SELECT`, `ROW_STAFF_FIELDS_NOT_COPIED`, `copySessionStaff`)
- Modify: `lib/actions/practice-session-drills.ts` (`duplicatePracticeSession`)
- Modify: `lib/actions/practice-plan-import.ts` (`importPracticePlan`)
- Test (append; and add `staff: []` to `row()`, to `blockRow`, and to every `practiceSession.findUnique` session fixture: the six in `describe("getPracticeSessionForEdit")`, the two in `describe("getPracticeSessionDetail")`, `detailRow()`, and `base` in both the goaltender and the practice-timing describes; add `staff: []` to the two exact `toEqual` block rows near lines 253 and 263; add `teamOfficial: { findMany: vi.fn() }` and `findMany: vi.fn()` on `teamMember` to `mockPrisma`): `__tests__/lib/actions/practice-session-queries.test.ts`
- Test (append; and add `staff: []` to `sourceRow()`'s return and to every source session the duplicate describe resolves: its `beforeEach` and the goalie-count, station-flag, other-team and block-row tests; add `practiceSessionPlay.findMany`, `practiceSessionStaff.createMany` and `practiceSessionPlayStaff.createMany` to `tx`): `__tests__/lib/actions/practice-session-drills.test.ts`
- Test (append; add `findMany: vi.fn()` to `models.practiceSessionPlay` and `practiceSessionStaff: { createMany: vi.fn() }`, `practiceSessionPlayStaff: { createMany: vi.fn() }` to `models`): `__tests__/lib/actions/practice-plan-import.test.ts`
- Test (append): `__tests__/lib/services/practice-session-drills.test.ts` (detach keeps every row)

**Interfaces:**
- Consumes (Task 1): `SessionStaffMember`, `StaffOption`, `toStaffName`, `staffNameKey`, `STAFF_NAME_MAX`. (Task 3): `writeRowStaff`, the Prisma models.
- Produces:
  - `getPracticeSessionDetail(...).session.staff: SessionStaffMember[]` (`{ id, name }`) and each row's `staff: string[]`;
  - `getPracticeSessionForEdit(...).initialData.staff: SessionStaffMember[]` (links only while still valid) and each item's `staff: string[]`;
  - `getPracticeStaffOptions(teamId: string): Promise<StaffOption[]>` (admins only; `[]` otherwise);
  - `PRACTICE_STAFF_COPY_SELECT`, `ROW_STAFF_COPY_SELECT`, `STAFF_FIELDS_NOT_COPIED`, `ROW_STAFF_FIELDS_NOT_COPIED`, `copySessionStaff(tx, sessionId, source): Promise<Map<string, string>>` (old id → new id).

- [ ] **Step 1: Write the failing query tests**

In `__tests__/lib/actions/practice-session-queries.test.ts`, make the fixture edits listed under Files, add `getPracticeStaffOptions` to the `@/lib/actions/practice-session-queries` import, and append:

```ts
describe("practice staff in the session queries (spec R4, R9)", () => {
    const session = {
        id: "s1", teamId: "t1", title: "T", date: new Date("2026-01-01T00:00:00Z"), duration: 60, isShared: true,
        venueId: null, surfaceId: null, segmentId: null, startAt: null, goaliesAttending: null, transitionMinutes: 0,
        createdBy: { name: "Coach" }, team: { id: "t1", name: "Team" }, venue: null, surface: null, segment: null,
        staff: [
            { id: "st1", name: "Coach Lee", teamOfficialId: "off-active", userId: null, teamOfficial: { status: "ACTIVE" } },
            { id: "st2", name: "Pat", teamOfficialId: "off-removed", userId: null, teamOfficial: { status: "REMOVED" } },
            { id: "st3", name: "Alex", teamOfficialId: null, userId: "u-admin", teamOfficial: null },
            { id: "st4", name: "Jo", teamOfficialId: null, userId: "u-demoted", teamOfficial: null },
            { id: "st5", name: "Sam", teamOfficialId: null, userId: null, teamOfficial: null },
        ],
        plays: [
            { ...row("a", 0), kind: "drill", label: null, stays: false, rotateEveryMinutes: null, staff: [{ staffId: "st5" }, { staffId: "st1" }] },
            { id: "w", sequence: 1, duration: 5, instructions: null, runsWithPrevious: false, kind: "cooldown", label: null, stays: false, rotateEveryMinutes: null, play: null, staff: [{ staffId: "st3" }] },
        ],
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockPrisma.teamMember.findFirst.mockResolvedValue({ id: "m", role: "ADMIN", teamId: "t1" });
        mockPrisma.teamMember.findMany.mockResolvedValue([{ userId: "u-admin" }]);
        mockPrisma.practiceSession.findUnique.mockResolvedValue(session);
    });

    it("getPracticeSessionDetail returns the list (names only) and each row's staff ids in order", async () => {
        const result = await getPracticeSessionDetail("s1");
        expect(result?.session.staff).toEqual([
            { id: "st1", name: "Coach Lee" }, { id: "st2", name: "Pat" }, { id: "st3", name: "Alex" }, { id: "st4", name: "Jo" }, { id: "st5", name: "Sam" },
        ]);
        expect(result?.session.plays.map((row) => row.staff)).toEqual([["st5", "st1"], ["st3"]]);
        const include = mockPrisma.practiceSession.findUnique.mock.calls[0][0].include;
        expect(include.staff).toEqual({ orderBy: { position: "asc" }, select: { id: true, name: true } });
        expect(include.plays.include.staff).toEqual({ orderBy: { position: "asc" }, select: { staffId: true } });
    });

    it("getPracticeSessionForEdit keeps valid links and loads a stale one unlinked (Review Focus 2)", async () => {
        const result = await getPracticeSessionForEdit("s1");
        expect(result?.initialData.staff).toEqual([
            { id: "st1", name: "Coach Lee", teamOfficialId: "off-active", userId: null },
            { id: "st2", name: "Pat", teamOfficialId: null, userId: null },
            { id: "st3", name: "Alex", teamOfficialId: null, userId: "u-admin" },
            { id: "st4", name: "Jo", teamOfficialId: null, userId: null },
            { id: "st5", name: "Sam", teamOfficialId: null, userId: null },
        ]);
        expect(mockPrisma.teamMember.findMany).toHaveBeenCalledWith({
            where: { teamId: "t1", role: "ADMIN", userId: { in: ["u-admin", "u-demoted"] } },
            select: { userId: true },
        });
        expect(result?.initialData.plays.map((item) => item.staff)).toEqual([["st5", "st1"], ["st3"]]);
    });

    it("getPracticeSessionForEdit asks for no admins when nobody is linked to an account", async () => {
        mockPrisma.practiceSession.findUnique.mockResolvedValue({ ...session, staff: [session.staff[4]] });
        await getPracticeSessionForEdit("s1");
        expect(mockPrisma.teamMember.findMany).not.toHaveBeenCalled();
    });
});

describe("getPracticeStaffOptions (spec R4)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockPrisma.teamMember.findFirst.mockResolvedValue({ id: "m" });
        mockPrisma.teamOfficial.findMany.mockResolvedValue([
            { id: "o1", name: "Lee Park", role: "HEAD_COACH", userId: "u1" },
            { id: "o2", name: "x".repeat(80), role: "PARENT_VOLUNTEER", userId: null },
        ]);
        mockPrisma.teamMember.findMany.mockResolvedValue([
            { userId: "u1", user: { name: "Lee Park" } },
            { userId: "u2", user: { name: "Alex Admin" } },
            { userId: "u3", user: { name: null } },
        ]);
    });

    it("lists active and invited officials, then admins who aren't officials, never an unnamed admin", async () => {
        const options = await getPracticeStaffOptions("t1");
        expect(options).toEqual([
            { kind: "official", id: "o1", name: "Lee Park", roleLabel: "Head Coach" },
            { kind: "official", id: "o2", name: "x".repeat(60), roleLabel: "Parent Volunteer" },
            { kind: "admin", id: "u2", name: "Alex Admin", roleLabel: "Team admin" },
        ]);
        expect(mockPrisma.teamOfficial.findMany).toHaveBeenCalledWith({
            where: { teamId: "t1", status: { in: ["ACTIVE", "INVITED"] } },
            orderBy: [{ role: "asc" }, { name: "asc" }],
            select: { id: true, name: true, role: true, userId: true },
        });
    });

    it("never selects or returns an email", async () => {
        const options = await getPracticeStaffOptions("t1");
        expect(JSON.stringify(mockPrisma.teamOfficial.findMany.mock.calls)).not.toContain("email");
        expect(JSON.stringify(mockPrisma.teamMember.findMany.mock.calls)).not.toContain("email");
        for (const option of options) expect(Object.keys(option).sort()).toEqual(["id", "kind", "name", "roleLabel"]);
    });

    it("gives a caller who isn't an admin of the team nothing, without reading anyone", async () => {
        mockPrisma.teamMember.findFirst.mockResolvedValue(null);
        expect(await getPracticeStaffOptions("t1")).toEqual([]);
        expect(mockPrisma.teamMember.findFirst).toHaveBeenCalledWith({
            where: { userId: "cuserxxxxxxxxxxxxxxxxxxxx", teamId: "t1", role: "ADMIN" },
            select: { id: true },
        });
        expect(mockPrisma.teamOfficial.findMany).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Write the failing copy-path tests**

In `__tests__/lib/actions/practice-session-drills.test.ts`, make the fixture and `tx` edits listed under Files, and add:

```ts
import {
    PRACTICE_STAFF_COPY_SELECT,
    ROW_STAFF_COPY_SELECT,
    ROW_STAFF_FIELDS_NOT_COPIED,
    STAFF_FIELDS_NOT_COPIED,
} from "@/lib/services/practice-session-staff";
```

Append inside `describe("duplicatePracticeSession", …)` (it reuses `sourceRow`, `SOURCE`, `COPY`, `DATE`):

```ts
    describe("practice staff (spec R5)", () => {
        const OFFICIAL = "cofficialxxxxxxxxxxxxxxxx";
        const sourceStaff = [
            { id: "cstaffa", name: "Coach Lee", position: 0, teamOfficialId: OFFICIAL, userId: null },
            { id: "cstaffb", name: "Sam", position: 1, teamOfficialId: null, userId: null },
        ];

        beforeEach(() => {
            mockPrisma.practiceSession.findUnique.mockResolvedValue({
                teamId: TEAM, title: "Tuesday", duration: 75, staff: sourceStaff,
                plays: [
                    { ...sourceRow(0), staff: [{ staffId: "cstaffb", position: 0 }] },
                    { ...sourceRow(1), staff: [{ staffId: "cstaffa", position: 0 }, { staffId: "cstaffb", position: 1 }] },
                ],
            });
            tx.practiceSessionPlay.findMany.mockResolvedValue([{ id: "ccopyrow0", sequence: 0 }, { id: "ccopyrow1", sequence: 1 }]);
            tx.practiceSessionStaff.createMany.mockResolvedValue({ count: 2 });
            tx.practiceSessionPlayStaff.createMany.mockResolvedValue({ count: 3 });
        });

        it("copies the list with new ids, links kept, and each row's staff onto the copied rows", async () => {
            await duplicatePracticeSession({ id: SOURCE, teamId: TEAM, date: DATE });
            // Two drill clones take cclone0 and cclone1; the staff copies come next.
            expect(tx.practiceSessionStaff.createMany.mock.calls[0][0].data).toEqual([
                { id: "cclone2xxxxxxxxxxxxxxxxxx", sessionId: COPY, name: "Coach Lee", position: 0, teamOfficialId: OFFICIAL, userId: null },
                { id: "cclone3xxxxxxxxxxxxxxxxxx", sessionId: COPY, name: "Sam", position: 1, teamOfficialId: null, userId: null },
            ]);
            expect(tx.practiceSessionPlayStaff.createMany.mock.calls[0][0].data).toEqual([
                { playRowId: "ccopyrow0", staffId: "cclone3xxxxxxxxxxxxxxxxxx", position: 0 },
                { playRowId: "ccopyrow1", staffId: "cclone2xxxxxxxxxxxxxxxxxx", position: 0 },
                { playRowId: "ccopyrow1", staffId: "cclone3xxxxxxxxxxxxxxxxxx", position: 1 },
            ]);
        });

        it("reads and copies every staff and assignment column but ids and owners (guard built from the copy selects)", async () => {
            await duplicatePracticeSession({ id: SOURCE, teamId: TEAM, date: DATE });
            const select = mockPrisma.practiceSession.findUnique.mock.calls[0][0].select;
            expect(select.staff).toEqual({ orderBy: { position: "asc" }, select: PRACTICE_STAFF_COPY_SELECT });
            expect(select.plays.include.staff).toEqual({ orderBy: { position: "asc" }, select: ROW_STAFF_COPY_SELECT });
            const written: Array<Record<string, unknown>> = tx.practiceSessionStaff.createMany.mock.calls[0][0].data;
            for (const field of Object.values(Prisma.PracticeSessionStaffScalarFieldEnum)) {
                if (STAFF_FIELDS_NOT_COPIED.has(field)) continue;
                expect(PRACTICE_STAFF_COPY_SELECT).toHaveProperty(field, true);
                expect(written[0][field]).toEqual((sourceStaff[0] as Record<string, unknown>)[field]);
            }
            for (const field of Object.values(Prisma.PracticeSessionPlayStaffScalarFieldEnum)) {
                if (!ROW_STAFF_FIELDS_NOT_COPIED.has(field)) expect(ROW_STAFF_COPY_SELECT).toHaveProperty(field, true);
            }
        });

        it("writes no staff for a practice without any", async () => {
            mockPrisma.practiceSession.findUnique.mockResolvedValue({ teamId: TEAM, title: "Tuesday", duration: 75, staff: [], plays: [sourceRow(0)] });
            await duplicatePracticeSession({ id: SOURCE, teamId: TEAM, date: DATE });
            expect(tx.practiceSessionStaff.createMany).not.toHaveBeenCalled();
            expect(tx.practiceSessionPlayStaff.createMany).not.toHaveBeenCalled();
        });
    });
```

In `__tests__/lib/actions/practice-plan-import.test.ts`, after the existing tests in `describe("importPracticePlan", …)`, add:

```ts
    it("creates the plan's staff as typed names and each row's staff, matched by name ignoring case (spec R5, R6)", async () => {
        models.practiceSessionPlay.findMany.mockResolvedValue([{ id: "crow0", sequence: 0 }, { id: "crow2", sequence: 2 }]);
        models.practiceSessionStaff.createMany.mockResolvedValue({ count: 2 });
        models.practiceSessionPlayStaff.createMany.mockResolvedValue({ count: 3 });
        const document = doc({
            staff: ["Coach Lee", "Sam"],
            drills: [
                { sequence: 0, duration: 10, runsWithPrevious: false, instructions: "Two laps", name: "Warmup Laps", description: "", playData: BOARD, staff: ["Sam"] },
                { sequence: 1, duration: 15, runsWithPrevious: false, instructions: "", name: "Breakout", description: "D to D", playData: BOARD },
                { sequence: 2, duration: 10, runsWithPrevious: true, instructions: "", name: "Regroup", description: "", playData: createEmptyPlayData(), staff: ["coach lee", "Sam"] },
            ],
        });
        expect(await call({ document })).toEqual({ success: true, data: { sessionId: SESSION } });
        // Staff is created right after the session, so it takes the first two ids.
        expect(models.practiceSessionStaff.createMany.mock.calls[0][0].data).toEqual([
            { id: "cowned0xxxxxxxxxxxxxxxxxx", sessionId: SESSION, name: "Coach Lee", position: 0, teamOfficialId: null, userId: null },
            { id: "cowned1xxxxxxxxxxxxxxxxxx", sessionId: SESSION, name: "Sam", position: 1, teamOfficialId: null, userId: null },
        ]);
        expect(models.practiceSessionPlayStaff.createMany.mock.calls[0][0].data).toEqual([
            { playRowId: "crow0", staffId: "cowned1xxxxxxxxxxxxxxxxxx", position: 0 },
            { playRowId: "crow2", staffId: "cowned0xxxxxxxxxxxxxxxxxx", position: 0 },
            { playRowId: "crow2", staffId: "cowned1xxxxxxxxxxxxxxxxxx", position: 1 },
        ]);
    });

    it("writes no staff for a plan without any", async () => {
        await call();
        expect(models.practiceSessionStaff.createMany).not.toHaveBeenCalled();
        expect(models.practiceSessionPlayStaff.createMany).not.toHaveBeenCalled();
    });
```

Append to `describe("detachLibraryPlay", …)` in `__tests__/lib/services/practice-session-drills.test.ts`:

```ts
    it("keeps every row, so each row's staff stays with it (practice staff, spec R5)", async () => {
        const { mocks } = fakeTx([LIB], [{ sessionId: "sA", playId: "lib" }]);
        const used: string[] = [];
        const watched = new Proxy(mocks, {
            get: (models, model: string) =>
                new Proxy(models[model as keyof typeof models] as object, {
                    get: (methods, method: string) => {
                        used.push(`${model}.${method}`);
                        return (methods as Record<string, unknown>)[method];
                    },
                }),
        }) as unknown as Prisma.TransactionClient;
        await detachLibraryPlay(watched, { playId: "lib", teamId: TEAM, userId: USER });
        // Assignments hang on the row ids: a detach repoints rows in place and never deletes or recreates one.
        expect(used.filter((name) => name.startsWith("practiceSessionPlay"))).toEqual(["practiceSessionPlay.findMany", "practiceSessionPlay.updateMany"]);
    });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bun run test __tests__/lib/actions/practice-session-queries.test.ts __tests__/lib/actions/practice-session-drills.test.ts __tests__/lib/actions/practice-plan-import.test.ts __tests__/lib/services/practice-session-drills.test.ts`
Expected: FAIL in the new tests (no staff read, no picker, no staff copied); the detach test passes already (it pins today's behaviour).

- [ ] **Step 4: Read staff in `lib/actions/practice-session-queries.ts`**

Add the imports:

```ts
import type { SessionStaffMember, StaffOption } from "@/types/practice-planner";
import { TEAM_OFFICIAL_ROLE_LABELS } from "@/lib/utils/validation";
import { toStaffName } from "@/lib/utils/session-staff";
```

(merge the type import into the existing `@/types/practice-planner` import).

In `getPracticeSessionDetail`:
- extend the return type's `session` with `/** The practice's staff (spec R9); rows name them by id. */ staff: SessionStaffMember[];`;
- in the `include`, after `segment: …`, add `staff: { orderBy: { position: "asc" }, select: { id: true, name: true } },`, and inside `plays.include`, after `play: { … }`, add `staff: { orderBy: { position: "asc" }, select: { staffId: true } },`;
- in the returned session, after `transitionMinutes: …`, add `staff: session.staff.map((member) => ({ id: member.id, name: member.name })),`;
- add `staff: sp.staff.map((assignment) => assignment.staffId),` to the block row (after `runsWithPrevious: false`) and to the drill row (after `rotateEveryMinutes`).

In `getPracticeSessionForEdit`:
- extend `initialData`'s type with `/** The practice's staff; a stale link loads unlinked (spec R4). */ staff: SessionStaffMember[];`;
- in the `include`, add:

```ts
      staff: {
        orderBy: { position: "asc" },
        select: { id: true, name: true, teamOfficialId: true, userId: true, teamOfficial: { select: { status: true } } },
      },
```

  and inside `plays.include`, after `play: { … }`, `staff: { orderBy: { position: "asc" }, select: { staffId: true } },`;
- after the `membership` check, add:

```ts
  // A link that went stale (an official removed, an admin demoted) loads unlinked, so this
  // editor's saves aren't refused for it (spec R4); its next save stores the name typed.
  const linkedUsers = session.staff.flatMap((member) => (member.userId ? [member.userId] : []));
  const admins = new Set(
    linkedUsers.length === 0
      ? []
      : (
          await prisma.teamMember.findMany({
            where: { teamId: session.teamId, role: "ADMIN", userId: { in: linkedUsers } },
            select: { userId: true },
          })
        ).map((admin) => admin.userId),
  );
  const activeOfficial = (status: string | undefined) => status === "ACTIVE" || status === "INVITED";
```

- in `initialData`, after `transitionMinutes: …`, add:

```ts
      staff: session.staff.map((member) => ({
        id: member.id,
        name: member.name,
        teamOfficialId: member.teamOfficialId && activeOfficial(member.teamOfficial?.status) ? member.teamOfficialId : null,
        userId: member.userId && admins.has(member.userId) ? member.userId : null,
      })),
```

- add `staff: sp.staff.map((assignment) => assignment.staffId),` to the block item (after `runsWithPrevious: false`) and the drill item (after `rotateEveryMinutes`).

Append the picker read:

```ts
/**
 * The hosted Staff picker (spec R4): the team's active and invited officials,
 * then its admins who aren't officials, by display name and role label. Admin
 * callers only; nothing here selects or returns an email. An official who is
 * also an admin appears once, as the official; an admin with no name is left
 * out (a coach can type one). Names are offered cut to 60 characters.
 */
export async function getPracticeStaffOptions(teamId: string): Promise<StaffOption[]> {
  const userId = await requireUserId();
  const admin = await prisma.teamMember.findFirst({
    where: { userId, teamId, role: "ADMIN" },
    select: { id: true },
  });
  if (!admin) return [];

  const [officials, admins] = await Promise.all([
    prisma.teamOfficial.findMany({
      where: { teamId, status: { in: ["ACTIVE", "INVITED"] } },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: { id: true, name: true, role: true, userId: true },
    }),
    prisma.teamMember.findMany({
      where: { teamId, role: "ADMIN" },
      orderBy: { joinedAt: "asc" },
      select: { userId: true, user: { select: { name: true } } },
    }),
  ]);
  const officialUsers = new Set(officials.flatMap((official) => (official.userId ? [official.userId] : [])));
  return [
    ...officials.map((official): StaffOption => ({
      kind: "official",
      id: official.id,
      name: toStaffName(official.name),
      roleLabel: TEAM_OFFICIAL_ROLE_LABELS[official.role],
    })),
    ...admins.flatMap((member): StaffOption[] => {
      const name = toStaffName(member.user.name ?? "");
      return name && !officialUsers.has(member.userId) ? [{ kind: "admin", id: member.userId, name, roleLabel: "Team admin" }] : [];
    }),
  ];
}
```

- [ ] **Step 5: Copy staff in a duplicate (`lib/services/practice-session-staff.ts`, `lib/actions/practice-session-drills.ts`)**

In the service, change `import type { Prisma } from "@prisma/client";` to `import { Prisma } from "@prisma/client";` and append:

```ts
/** What a duplicate reads of each staff member: every column but the practice (the id maps assignments). */
export const PRACTICE_STAFF_COPY_SELECT = { id: true, name: true, position: true, teamOfficialId: true, userId: true } as const;
/** Staff columns a duplicate never copies: the id (new) and the practice (the copy). */
export const STAFF_FIELDS_NOT_COPIED: ReadonlySet<string> = new Set(["id", "sessionId"]);
/** What a duplicate reads of each assignment: the person (mapped to their copy) and the order. */
export const ROW_STAFF_COPY_SELECT = { staffId: true, position: true } as const;
/** Assignment columns a duplicate never copies: the row (the copy's row, found by sequence). */
export const ROW_STAFF_FIELDS_NOT_COPIED: ReadonlySet<string> = new Set(["playRowId"]);

/** A staff member as PRACTICE_STAFF_COPY_SELECT reads it. */
type StaffCopySource = { id: string; name: string; position: number; teamOfficialId: string | null; userId: string | null };

/**
 * Duplicate (spec R5): a practice's staff into another practice of the same
 * team, new ids, links kept. Every staff column but the id and the practice is
 * copied, driven by the generated scalar-field enum (the guard test fails when
 * a column is added to the model but not to PRACTICE_STAFF_COPY_SELECT).
 * Returns old id → new id.
 */
export async function copySessionStaff(
    tx: Prisma.TransactionClient,
    sessionId: string,
    source: readonly StaffCopySource[],
): Promise<Map<string, string>> {
    const ids = new Map(source.map((member) => [member.id, newPlayId()]));
    if (source.length === 0) return ids;
    await tx.practiceSessionStaff.createMany({
        data: source.map((member) => {
            const copy: Record<string, unknown> = {};
            for (const field of Object.values(Prisma.PracticeSessionStaffScalarFieldEnum)) {
                if (!STAFF_FIELDS_NOT_COPIED.has(field)) copy[field] = (member as Record<string, unknown>)[field];
            }
            return { ...copy, id: ids.get(member.id) as string, sessionId } as Prisma.PracticeSessionStaffCreateManyInput;
        }),
    });
    return ids;
}
```

In `lib/actions/practice-session-drills.ts`, extend the services import with:

```ts
import { PRACTICE_STAFF_COPY_SELECT, ROW_STAFF_COPY_SELECT, copySessionStaff, writeRowStaff } from "@/lib/services/practice-session-staff";
```

In `duplicatePracticeSession`'s `select`, after `transitionMinutes: true,`, add:

```ts
                staff: { orderBy: { position: "asc" }, select: PRACTICE_STAFF_COPY_SELECT },
```

and change the `plays` include to:

```ts
                    include: {
                        play: { select: CLONE_SOURCE_SELECT },
                        staff: { orderBy: { position: "asc" }, select: ROW_STAFF_COPY_SELECT },
                    },
```

After the `if (source.plays.length > 0) { await tx.practiceSessionPlay.createMany(…) }` block, add:

```ts
            // Staff and who runs each row (spec R5): new ids, links kept (same team), rows found by sequence.
            const staffIds = await copySessionStaff(tx, session.id, source.staff);
            await writeRowStaff(
                tx,
                session.id,
                source.plays.map((row) => ({
                    sequence: row.sequence,
                    staffIds: row.staff.map((assignment) => staffIds.get(assignment.staffId) as string),
                })),
            );
```

Update the function's doc comment: "…same per-drill duration/instructions, every other session-play column, and the staff with who runs each row."

- [ ] **Step 6: Create staff in a hosted import (`lib/actions/practice-plan-import.ts`)**

Add the imports:

```ts
import { writeRowStaff } from "@/lib/services/practice-session-staff";
import { staffNameKey } from "@/lib/utils/session-staff";
```

Inside the transaction, right after `const session = await tx.practiceSession.create({ … });` and before `if (planSession.drills.length === 0) return session.id;`, add:

```ts
            // Staff (spec R5, R6): typed names from the file, never linked; ids made here so rows can name them.
            const staffIds = planSession.staff.map(() => newPlayId());
            if (planSession.staff.length > 0) {
                await tx.practiceSessionStaff.createMany({
                    data: planSession.staff.map((name, position) => ({
                        id: staffIds[position],
                        sessionId: session.id,
                        name,
                        position,
                        teamOfficialId: null,
                        userId: null,
                    })),
                });
            }
            const staffByName = new Map(planSession.staff.map((name, index) => [staffNameKey(name), staffIds[index]]));
```

After the rows' `tx.practiceSessionPlay.createMany(…)`, add:

```ts
            // parsePlan checked that every row's names are on the list (ignoring case).
            await writeRowStaff(
                tx,
                session.id,
                planSession.drills.map((entry) => ({
                    sequence: entry.sequence,
                    staffIds: entry.staff.map((name) => {
                        const staffId = staffByName.get(staffNameKey(name));
                        if (staffId === undefined) throw new Error(`No staff member named in row ${entry.sequence}`);
                        return staffId;
                    }),
                })),
            );
```

Update the file's header comment: "…a warm-up, break, transition or cool-down is a row with no play; the plan's staff becomes typed names (never linked)."

- [ ] **Step 7: Run the tests to verify they pass**

Run: `bun run test __tests__/lib/actions/practice-session-queries.test.ts __tests__/lib/actions/practice-session-drills.test.ts __tests__/lib/actions/practice-plan-import.test.ts __tests__/lib/services/practice-session-drills.test.ts __tests__/app __tests__/components/providers/HostedPlannerProvider.test.tsx`
Expected: PASS.

Run: `bun run type-check`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
/usr/bin/git add lib/actions/practice-session-queries.ts lib/services/practice-session-staff.ts lib/actions/practice-session-drills.ts \
  lib/actions/practice-plan-import.ts __tests__/lib/actions/practice-session-queries.test.ts \
  __tests__/lib/actions/practice-session-drills.test.ts __tests__/lib/actions/practice-plan-import.test.ts \
  __tests__/lib/services/practice-session-drills.test.ts
/usr/bin/git commit -m "feat(practice-planner): read, pick, duplicate and import practice staff" -m "Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 5: Practice emails: "Your stations"

Spec R10. The practice-plan emails keep their recipients, preferences and shared content; a recipient whose account is linked to an assigned staff member (a team admin directly, or a team official's account) gets their own send with one more line. Everyone else gets the shared send as today.

**Files:**
- Modify: `lib/email/templates.ts` (imports, `PracticePlanSharedEmailData`, `PracticePlanUpdatedEmailData`, both senders, `sendPracticePlanNotifications`; new `practiceStationLines`)
- Test (create): `__tests__/lib/email/practice-plan-stations.test.ts`
- Test (modify: `templates.ts` now imports more of `@/lib/utils/date` and reads `practiceSessionStaff`, so each mock spreads the real date module and each `mockPrisma` gains `practiceSessionStaff: { findMany: vi.fn() }`, resolving `[]` in `beforeEach`): `__tests__/lib/email/practice-plan-blocks.test.ts`, `__tests__/lib/email/templates-preferences-scope.test.ts`; (date mock only) `__tests__/lib/email/templates-preferences.test.ts`

**Interfaces:**
- Consumes (Task 1): `yourStations`, `yourStationsText`, `YOUR_STATIONS_LABEL`. (Task 3): the `practiceSessionStaff` and `PracticeSessionPlay.staff` relations.
- Produces: `yourStations?: string | null` on both practice-plan email data types (the text after "Your stations: ").

- [ ] **Step 1: Write the failing email tests**

Create `__tests__/lib/email/practice-plan-stations.test.ts`:

```ts
/** Practice-plan emails (spec R10): "Your stations" for a recipient linked to an assigned staff member. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSendEmail, mockPrisma } = vi.hoisted(() => ({
    mockSendEmail: vi.fn(),
    mockPrisma: {
        practiceSession: { findUnique: vi.fn() },
        practiceSessionStaff: { findMany: vi.fn() },
        practiceSessionPlay: { findMany: vi.fn() },
    },
}));

vi.mock("@/lib/email/client", () => ({ sendEmail: mockSendEmail }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/env", () => ({ getBaseUrl: () => "http://localhost:3000" }));
vi.mock("@/lib/services/notification", () => ({ notificationService: {} }));

import { sendPracticePlanNotifications } from "@/lib/email/templates";

type Pref = { leagueId: string | null; practicePlanNotifications: boolean; emailEnabled: boolean };
const member = (id: string, prefs: Pref[] = []) => ({ user: { id, email: `${id}@example.com`, notificationPreferences: prefs } });
const MUTED: Pref[] = [{ leagueId: null, practicePlanNotifications: false, emailEnabled: true }];

/** 6:00 PM EDT on Tuesday, October 6, 2026; a 2-minute gap between blocks. */
function session(extra: Record<string, unknown> = {}) {
    return {
        id: "sess1", title: "Skills", date: new Date("2026-10-06T22:00:00.000Z"), startAt: null, duration: 60, teamId: "team1",
        transitionMinutes: 2, venue: null,
        team: { name: "Sharks", leagueId: null, members: [member("coach"), member("parent"), member("muted", MUTED)] },
        _count: { plays: 2 },
        plays: [{ kind: "warmup", label: null, duration: 8 }],
        ...extra,
    };
}

const ROWS = [
    { sequence: 0, duration: 8, runsWithPrevious: false, kind: "warmup", label: null, stays: false, rotateEveryMinutes: null, play: null, staff: [{ staffId: "st-coach" }] },
    { sequence: 1, duration: 10, runsWithPrevious: false, kind: "drill", label: null, stays: false, rotateEveryMinutes: null, play: { name: "<Breakout>" }, staff: [{ staffId: "st-coach" }, { staffId: "st-other" }] },
    { sequence: 2, duration: 10, runsWithPrevious: false, kind: "drill", label: null, stays: false, rotateEveryMinutes: null, play: { name: "Scrimmage" }, staff: [{ staffId: "st-muted" }] },
];

const to = (call: number) => mockSendEmail.mock.calls[call][0].to.map((recipient: { email: string }) => recipient.email);

beforeEach(() => {
    vi.clearAllMocks();
    mockSendEmail.mockResolvedValue(undefined);
    mockPrisma.practiceSession.findUnique.mockResolvedValue(session());
    mockPrisma.practiceSessionStaff.findMany.mockResolvedValue([]);
    mockPrisma.practiceSessionPlay.findMany.mockResolvedValue(ROWS);
});

describe("sendPracticePlanNotifications: Your stations (spec R10)", () => {
    it("sends an assigned official with an account their own email, rows in schedule order with start times; the rest get the shared email", async () => {
        mockPrisma.practiceSessionStaff.findMany.mockResolvedValue([{ id: "st-coach", userId: null, teamOfficial: { userId: "coach" } }]);
        await sendPracticePlanNotifications("sess1", "team1", "shared");

        expect(mockSendEmail).toHaveBeenCalledTimes(2);
        expect(to(0)).toEqual(["coach@example.com"]);
        const personal = mockSendEmail.mock.calls[0][0];
        expect(personal.text).toContain("Your stations: Warm-up (6:00 PM), <Breakout> (6:10 PM)");
        expect(personal.html).toContain("<strong>Your stations:</strong> Warm-up (6:00 PM), &lt;Breakout&gt; (6:10 PM)");
        expect(to(1)).toEqual(["parent@example.com"]);
        expect(mockSendEmail.mock.calls[1][0].text).not.toContain("Your stations");
        expect(mockPrisma.practiceSessionStaff.findMany).toHaveBeenCalledWith({
            where: { sessionId: "sess1", OR: [{ userId: { in: ["coach", "parent"] } }, { teamOfficial: { userId: { in: ["coach", "parent"] } } }] },
            select: { id: true, userId: true, teamOfficial: { select: { userId: true } } },
        });
    });

    it("links a team admin by their own account, and joins two staff entries for one person into one line", async () => {
        mockPrisma.practiceSessionStaff.findMany.mockResolvedValue([
            { id: "st-coach", userId: "coach", teamOfficial: null },
            { id: "st-other", userId: "coach", teamOfficial: null },
        ]);
        await sendPracticePlanNotifications("sess1", "team1", "updated");
        expect(mockSendEmail.mock.calls[0][0].subject).toBe("Practice Plan Updated: Skills");
        expect(mockSendEmail.mock.calls[0][0].text).toContain("Your stations: Warm-up (6:00 PM), <Breakout> (6:10 PM)\n");
    });

    it("never emails a recipient whose preference is off, even when assigned", async () => {
        await sendPracticePlanNotifications("sess1", "team1", "shared");
        const where = mockPrisma.practiceSessionStaff.findMany.mock.calls[0][0].where;
        expect(where.OR[0].userId.in).not.toContain("muted");
        expect(mockSendEmail.mock.calls.flatMap((_, call) => to(call))).not.toContain("muted@example.com");
    });

    it("sends the shared email exactly as before when nobody is linked (a typed name gets nothing)", async () => {
        await sendPracticePlanNotifications("sess1", "team1", "shared");
        expect(mockSendEmail).toHaveBeenCalledTimes(1);
        expect(to(0)).toEqual(["coach@example.com", "parent@example.com"]);
        expect(mockSendEmail.mock.calls[0][0].text).not.toContain("Your stations");
        expect(mockPrisma.practiceSessionPlay.findMany).not.toHaveBeenCalled();
    });

    it("tells times in the venue's zone when the practice is booked", async () => {
        mockPrisma.practiceSession.findUnique.mockResolvedValue(session({
            venue: { timezone: "America/Denver" },
            startAt: new Date("2026-10-07T00:00:00.000Z"), // 6:00 PM MDT
        }));
        mockPrisma.practiceSessionStaff.findMany.mockResolvedValue([{ id: "st-coach", userId: "coach", teamOfficial: null }]);
        await sendPracticePlanNotifications("sess1", "team1", "shared");
        expect(mockSendEmail.mock.calls[0][0].text).toContain("Your stations: Warm-up (6:00 PM), <Breakout> (6:10 PM)");
        expect(mockPrisma.practiceSessionPlay.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { sessionId: "sess1" }, orderBy: { sequence: "asc" } }));
    });

    it("leaves out a linked person who runs nothing, and keeps going when one personal send fails", async () => {
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
        mockPrisma.practiceSessionStaff.findMany.mockResolvedValue([
            { id: "st-coach", userId: "coach", teamOfficial: null },
            { id: "st-idle", userId: "parent", teamOfficial: null },
        ]);
        mockSendEmail.mockRejectedValueOnce(new Error("provider down"));
        await sendPracticePlanNotifications("sess1", "team1", "shared");
        // coach's own email failed (logged); parent runs nothing, so gets the shared one.
        expect(mockSendEmail).toHaveBeenCalledTimes(2);
        expect(to(1)).toEqual(["parent@example.com"]);
        expect(consoleError).toHaveBeenCalled();
        consoleError.mockRestore();
    });
});
```

In each of `__tests__/lib/email/practice-plan-blocks.test.ts`, `__tests__/lib/email/templates-preferences-scope.test.ts` and `__tests__/lib/email/templates-preferences.test.ts`, replace the `vi.mock("@/lib/utils/date", …)` factory with one that keeps the real module and stubs only the formatted date:

```ts
vi.mock("@/lib/utils/date", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/utils/date")>()),
    formatDateTime: vi.fn(() => "Jan 1, 2026, 10:00 AM"),
}));
```

In the first two, add `practiceSessionStaff: { findMany: vi.fn() },` to `mockPrisma` and `mockPrisma.practiceSessionStaff.findMany.mockResolvedValue([]);` to `beforeEach`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test __tests__/lib/email/practice-plan-stations.test.ts`
Expected: FAIL (one shared email, no "Your stations").

- [ ] **Step 3: Add the line and the per-recipient sends (`lib/email/templates.ts`)**

Replace the date import and extend the session-rows import:

```ts
import { FALLBACK_TIME_ZONE, formatDateTime, isValidTimeZone, sessionStart } from "@/lib/utils/date";
import { blockTitle, isBlockKind, toRowKind } from "@/lib/utils/session-rows";
import { YOUR_STATIONS_LABEL, yourStations, yourStationsText } from "@/lib/utils/session-staff";
```

In `PracticePlanSharedEmailData` and `PracticePlanUpdatedEmailData`, after `blocks: …;`, add:

```ts
  /** This recipient's rows, "Breakout (6:10 PM), …" (spec R10); absent for everyone else. */
  yourStations?: string | null;
```

In both senders, in the HTML box right after the `Also planned` paragraph's `${…}` expression, add:

```ts
          ${data.yourStations ? `<p style="margin: 10px 0;"><strong>${YOUR_STATIONS_LABEL}:</strong> ${escapeHtml(data.yourStations)}</p>` : ""}
```

and in the text body, right after the `Also planned` expression on the `Number of Drills` line, append:

```ts
${data.yourStations ? `\n${YOUR_STATIONS_LABEL}: ${data.yourStations}` : ""}
```

(so the line reads `Number of Drills: ${data.playCount}${…Also planned…}${…Your stations…}`).

Above `sendPracticePlanNotifications`, add:

```ts
/**
 * Each recipient's "Your stations" text (spec R10), by user id: only for a
 * recipient whose account is linked to an assigned staff member, as a team
 * admin (userId) or through a team official (teamOfficial.userId). Rows use
 * the bench sheet's titles and buildSchedule starts; times are in the venue's
 * zone when booked, else FALLBACK_TIME_ZONE (Team has no zone of its own).
 */
async function practiceStationLines(
  session: { id: string; date: Date; startAt: Date | null; transitionMinutes: number; venue: { timezone: string } | null },
  userIds: string[],
): Promise<Map<string, string>> {
  const lines = new Map<string, string>();
  const linked = await prisma.practiceSessionStaff.findMany({
    where: { sessionId: session.id, OR: [{ userId: { in: userIds } }, { teamOfficial: { userId: { in: userIds } } }] },
    select: { id: true, userId: true, teamOfficial: { select: { userId: true } } },
  });
  if (linked.length === 0) return lines;

  const staffByUser = new Map<string, Set<string>>();
  for (const member of linked) {
    const userId = member.userId ?? member.teamOfficial?.userId;
    if (!userId) continue;
    staffByUser.set(userId, (staffByUser.get(userId) ?? new Set<string>()).add(member.id));
  }
  const rows = await prisma.practiceSessionPlay.findMany({
    where: { sessionId: session.id },
    orderBy: { sequence: "asc" },
    select: {
      sequence: true, duration: true, runsWithPrevious: true, kind: true, label: true, stays: true, rotateEveryMinutes: true,
      play: { select: { name: true } },
      staff: { select: { staffId: true } },
    },
  });
  const timeline = rows.map((row) => ({ ...row, kind: toRowKind(row.kind), staff: row.staff.map((assignment) => assignment.staffId) }));
  const venueZone = session.venue?.timezone;
  const timeZone = isValidTimeZone(venueZone) ? venueZone : FALLBACK_TIME_ZONE;
  const start = sessionStart(session);
  for (const [userId, staffIds] of staffByUser) {
    const text = yourStationsText(
      yourStations(timeline, {
        start,
        transitionMinutes: session.transitionMinutes,
        staffIds,
        title: (row) => (isBlockKind(row.kind) ? blockTitle(row.kind, row.label) : row.play?.name ?? "Drill"),
      }),
      timeZone,
    );
    if (text) lines.set(userId, text);
  }
  return lines;
}
```

In `sendPracticePlanNotifications`:
- add `venue: { select: { timezone: true } },` to the `include` (after `team: { … },`);
- replace the `const emails = … .map((member: { user: { email: string } }) => member.user.email);` chain's final `map` with `.map((member: { user: { id: string; email: string } }) => ({ userId: member.user.id, email: member.user.email }))` and rename the variable `recipients`; change the empty check to `if (recipients.length === 0) {`;
- remove `emails,` from `sessionData`, and replace the closing `if (type === "shared") { … } else if (type === "updated") { … }` with:

```ts
  const send = type === "shared" ? sendPracticePlanSharedEmail : sendPracticePlanUpdatedEmail;
  // Practice staff (spec R10): the same message for everyone, plus a "Your stations" line for a
  // recipient linked to an assigned staff member, in their own send. Preferences already applied.
  const stations = await practiceStationLines(session, recipients.map((recipient) => recipient.userId));
  for (const recipient of recipients) {
    const line = stations.get(recipient.userId);
    if (!line) continue;
    try {
      await send({ ...sessionData, emails: [recipient.email], yourStations: line });
    } catch (error) {
      console.error("Error sending a practice plan email with stations:", error);
    }
  }
  const shared = recipients.filter((recipient) => !stations.has(recipient.userId)).map((recipient) => recipient.email);
  if (shared.length > 0) await send({ ...sessionData, emails: shared });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test __tests__/lib/email`
Expected: PASS (the existing block-row and preference tests still see one shared email).

Run: `bun run type-check`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add lib/email/templates.ts __tests__/lib/email/practice-plan-stations.test.ts __tests__/lib/email/practice-plan-blocks.test.ts \
  __tests__/lib/email/templates-preferences-scope.test.ts __tests__/lib/email/templates-preferences.test.ts
/usr/bin/git commit -m "feat(practice-planner): add Your stations to practice emails for assigned staff" -m "Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 6: Static store: staff, carry by row id, copies and IndexedDB version 3

Spec R3, R5, R6 and R7, in `apps/planner/src/store`. After this task the static store saves, reads, carries, duplicates, imports and exports staff exactly as hosted does, with typed names only.

**Files:**
- Modify: `apps/planner/src/store/records.ts` (`StoredStaffMember`; `staff?` on `StoredSessionRow` and `StoredSession`)
- Modify: `apps/planner/src/store/types.ts` (`LocalSessionSave.staff?`)
- Modify: `apps/planner/src/store/sessions.ts` (imports; new `checkStaff`, `withRowStaff`; `assertExportable`, `getSessionView`, `getSessionForEdit`, `createSession`, `updateSession`, `duplicatePracticeSession`, `importPlan`)
- Modify: `apps/planner/src/store/idb-repo.ts` (`DB_VERSION = 3`, the version comment, `upgradeDatabase`)
- Test (append; and add `staff: []` to the exact `toEqual` rows at lines 353 and 358): `__tests__/apps/planner/local-store.sessions.test.ts`
- Test (modify: version 3; generalize the version-1 helpers to any version and add a version-2 case): `__tests__/apps/planner/repos.test.ts`

**Interfaces:**
- Consumes (Task 1): `cleanStaffName`, `staffNameKey`, `staffNames`, `sessionStaffError`, `SessionStaffInput`, the messages, `MAX_ROW_STAFF`, `STAFF_KEY_MAX`. (Task 2): plan `staff` fields.
- Produces: `StoredStaffMember { id: string; name: string }`; `StoredSession.staff?: StoredStaffMember[]`; `StoredSessionRow.staff?: string[]`; `LocalSessionSave.staff?: SessionStaffInput[]`; the view's and editor's `staff` (as hosted, Task 4); `DB_VERSION = 3`.

- [ ] **Step 1: Write the failing store tests**

In `__tests__/apps/planner/local-store.sessions.test.ts`, add `staff: []` to the expected rows at lines 353 and 358, and add the imports:

```ts
import {
    ROW_STAFF_DUPLICATE_MESSAGE,
    ROW_STAFF_LIMIT_MESSAGE,
    ROW_STAFF_UNKNOWN_MESSAGE,
    STAFF_ADMIN_MESSAGE,
    STAFF_LIMIT_MESSAGE,
    STAFF_NAME_LENGTH_MESSAGE,
    STAFF_NAME_REQUIRED_MESSAGE,
    STAFF_NAME_TAKEN_MESSAGE,
    STAFF_OFFICIAL_MESSAGE,
    STAFF_ONE_LINK_MESSAGE,
} from "@/lib/utils/session-staff";
```

Append inside `describe.each(REPOS)(…)`:

```ts
    describe("practice staff (spec R3, R5, R7)", () => {
        const LEE = { key: "st-lee", name: "Coach Lee" };
        const SAM = { key: "st-sam", name: " Sam " };
        const rows = (a: string, b: string, staff: [string[]?, string[]?] = []): LocalSessionDrill[] => [
            { kind: "warmup", clientKey: "kw", sequence: 0, duration: 8, instructions: "", label: null, ...(staff[0] && { staff: staff[0] }) },
            drill(a, "ka", 1, staff[1] ? { staff: staff[1] } : {}),
            drill(b, "kb", 2),
        ];

        async function staffed() {
            const h = await setup();
            const a = await addLibraryPlay(h.store, "A");
            const b = await addLibraryPlay(h.store, "B");
            const { id } = data(await h.store.createSession(save(rows(a, b, [["st-sam"], ["st-lee", "st-sam"]]), { staff: [LEE, SAM] })));
            return { ...h, id };
        }

        it("stores the list (names cleaned) and each row's staff, and reads them in the view and the editor", async () => {
            const { store, id } = await staffed();
            const view = data(await store.getSessionView(id));
            expect(view.staff).toEqual([{ id: "st-lee", name: "Coach Lee" }, { id: "st-sam", name: "Sam" }]);
            expect(view.plays.map((row) => row.staff)).toEqual([["st-sam"], ["st-lee", "st-sam"], []]);
            const edit = data(await store.getSessionForEdit(id));
            expect(edit.initialData.staff).toEqual(view.staff);
            expect(edit.initialData.plays.map((row) => row.staff)).toEqual([["st-sam"], ["st-lee", "st-sam"], []]);
        });

        it("keeps the list and each row's staff when an update omits staff, following rows by id (absent = unchanged)", async () => {
            const { store, id } = await staffed();
            const edit = data(await store.getSessionForEdit(id));
            // An older save: no staff on the session; the rows reordered, and a stray key ignored.
            const plays = toSessionRowInputs(edit.initialData.plays).map((row) => ({ ...row, staff: ["stray"] }));
            const [w, x, y] = plays;
            data(await store.updateSession(id, save([{ ...y, sequence: 0 }, { ...w, sequence: 1 }, { ...x, sequence: 2 }])));
            const view = data(await store.getSessionView(id));
            expect(view.staff?.map((member) => member.name)).toEqual(["Coach Lee", "Sam"]);
            expect(view.plays.map((row) => [row.id, row.staff])).toEqual([["kb", []], ["kw", ["st-sam"]], ["ka", ["st-lee", "st-sam"]]]);
        });

        it("clears the list and every row's staff with [], and gives a row without staff nobody when a list is sent", async () => {
            const { store, id } = await staffed();
            const plays = toSessionRowInputs(data(await store.getSessionForEdit(id)).initialData.plays);
            const unstaffed = plays.map((row) => ({ ...row, staff: undefined }));
            data(await store.updateSession(id, save(unstaffed, { staff: [LEE] })));
            let view = data(await store.getSessionView(id));
            expect(view.staff).toEqual([{ id: "st-lee", name: "Coach Lee" }]);
            expect(view.plays.every((row) => row.staff?.length === 0)).toBe(true);
            data(await store.updateSession(id, save(unstaffed, { staff: [] })));
            view = data(await store.getSessionView(id));
            expect(view.staff).toEqual([]);
        });

        it("refuses what hosted refuses, in hosted's words, before writing anything", async () => {
            const { store } = await setup();
            const a = await addLibraryPlay(store, "A");
            const b = await addLibraryPlay(store, "B");
            const refusal = async (staff: unknown, keys: [string[]?, string[]?] = []) => {
                const result = await store.createSession(save(rows(a, b, keys), { staff } as Partial<LocalSessionSave>));
                return result.success ? null : result.error;
            };
            expect(await refusal([LEE, { key: "x", name: "coach lee" }])).toBe(STAFF_NAME_TAKEN_MESSAGE);
            expect(await refusal([LEE], [["nobody"]])).toBe(ROW_STAFF_UNKNOWN_MESSAGE);
            expect(await refusal([LEE], [["st-lee", "st-lee"]])).toBe(ROW_STAFF_DUPLICATE_MESSAGE);
            expect(await refusal(Array.from({ length: 13 }, (_, i) => ({ key: `k${i}`, name: `Coach ${i}` })))).toBe(STAFF_LIMIT_MESSAGE);
            expect(await refusal([{ key: "k", name: "x".repeat(61) }])).toBe(STAFF_NAME_LENGTH_MESSAGE);
            expect(await refusal([{ key: "k", name: " " }])).toBe(STAFF_NAME_REQUIRED_MESSAGE);
            expect(await refusal([{ ...LEE, teamOfficialId: "cofficialxxxxxxxxxxxxxxxx" }])).toBe(STAFF_OFFICIAL_MESSAGE);
            expect(await refusal([{ ...LEE, userId: "cuserxxxxxxxxxxxxxxxxxxxx" }])).toBe(STAFF_ADMIN_MESSAGE);
            expect(await refusal([{ ...LEE, teamOfficialId: "cofficialxxxxxxxxxxxxxxxx", userId: "cuserxxxxxxxxxxxxxxxxxxxx" }])).toBe(STAFF_ONE_LINK_MESSAGE);
            // A row's keys are shaped even when the save sends no list, as hosted's row schema does.
            expect(await refusal(undefined, [["a", "b", "c", "d", "e"]])).toBe(ROW_STAFF_LIMIT_MESSAGE);
            expect(data(await store.listSessions())).toEqual([]);
        });

        it("reads a session stored before practice staff with no staff", async () => {
            const { repo, store, clock } = await setup();
            await repo.write((tx) => tx.putSession({ id: "old", title: "Old", date: clock.now, duration: 60, rows: [], createdAt: clock.now, updatedAt: clock.now }));
            expect(data(await store.getSessionView("old")).staff).toEqual([]);
            expect(data(await store.getSessionForEdit("old")).initialData.staff).toEqual([]);
        });

        it("duplicates the list with new ids and moves each row's staff onto them", async () => {
            const { store, id } = await staffed();
            const copy = data(await store.duplicatePracticeSession({ id, teamId: T, date: new Date("2026-10-13T19:00:00") }));
            const view = data(await store.getSessionView(copy.id));
            expect(view.staff?.map((member) => member.name)).toEqual(["Coach Lee", "Sam"]);
            expect(view.staff?.some((member) => member.id === "st-lee" || member.id === "st-sam")).toBe(false);
            const [lee, sam] = (view.staff ?? []).map((member) => member.id);
            expect(view.plays.map((row) => row.staff)).toEqual([[sam], [lee, sam], []]);
        });

        it("exports names and imports them back as typed staff, matched ignoring case", async () => {
            const { store, id } = await staffed();
            const doc = buildPlanDocument(data(await store.getSessionView(id)), new Date(), "openleague-static");
            expect(doc.session.staff).toEqual(["Coach Lee", "Sam"]);
            expect(doc.session.drills.map((entry) => entry.staff)).toEqual([["Sam"], ["Coach Lee", "Sam"], []]);
            const raw = JSON.parse(JSON.stringify(doc));
            raw.session.drills[1].staff = ["COACH LEE", "sam"];
            const parsed = parsePlan(raw);
            if (!parsed.ok) throw new Error(parsed.error.message);
            const { sessionId } = data(await store.importPlan(parsed.plan, { date: new Date("2026-10-20T19:00:00"), addToLibrary: false }));
            const view = data(await store.getSessionView(sessionId));
            expect(view.staff?.map((member) => member.name)).toEqual(["Coach Lee", "Sam"]);
            const names = (keys: string[] | undefined) => (keys ?? []).map((key) => view.staff?.find((member) => member.id === key)?.name);
            expect(view.plays.map((row) => names(row.staff))).toEqual([["Sam"], ["Coach Lee", "Sam"], []]);
        });
    });
```

Add `toSessionRowInputs` to the existing `@/lib/utils/session-rows` import.

In `__tests__/apps/planner/repos.test.ts`, in `describe("IndexedDB schema version 2 (practice timing rows)")`:
- rename it `describe("IndexedDB schema versions (practice timing rows, practice staff)")`;
- generalize `openV1(factory, name)` to `openAt(factory: IDBFactory, name: string, version: number)` (it passes `version` to `factory.open`), and update its three callers to `openAt(factory, name, 1)`;
- replace `it("is version 2", …)` with `it("is version 3", () => expect(DB_VERSION).toBe(3));`;
- in "opens a version 1 database at version 2…", rename it "…at the current version…" and change `expect(await versionOf(factory, "v1-upgrade")).toBe(2);` to `.toBe(DB_VERSION)`;
- append:

```ts
    it("makes a tab still open at version 2 (before practice staff) reload before this build writes, keeping its data", async () => {
        const factory = new IDBFactory();
        const v2 = await openAt(factory, "v2-open-tab", 2);
        await seed(v2);
        // A pre-staff build would rewrite a session without its staff: its tab must reload first.
        const reload = vi.fn();
        v2.onversionchange = () => {
            v2.close();
            reload();
        };
        const repo = await openIdbRepo({ factory, name: "v2-open-tab" });
        expect(reload).toHaveBeenCalledTimes(1);
        expect(await repo.read((tx) => tx.getSession("s1"))).toEqual(v1Session);
        expect(await versionOf(factory, "v2-open-tab")).toBe(3);
        repo.close();
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test __tests__/apps/planner/local-store.sessions.test.ts __tests__/apps/planner/repos.test.ts`
Expected: FAIL (no staff stored; version 2).

- [ ] **Step 3: Extend the records and types**

In `apps/planner/src/store/records.ts`, above `StoredSessionRow`, add:

```ts
/** One person on a practice's staff. The static planner keeps typed names only; `id` is the editor's key. */
export interface StoredStaffMember {
    id: string;
    name: string;
}
```

In `StoredSessionRow`, after `rotateEveryMinutes?: number | null;`, add:

```ts
    /** Staff ids running this row, in order. Absent on rows stored before practice staff: nobody. */
    staff?: string[];
```

In `StoredSession`, after `transitionMinutes?: number;`, add:

```ts
    /** The practice's staff, in order. Absent on sessions stored before practice staff: none. */
    staff?: StoredStaffMember[];
```

In `apps/planner/src/store/types.ts`, add `import type { SessionStaffInput } from "@/lib/utils/session-staff";` and, in `LocalSessionSave` after `transitionMinutes?: number;`:

```ts
    /** The practice's staff. Absent = unchanged on update (none on create); a row's `staff` is read only with it. */
    staff?: SessionStaffInput[];
```

- [ ] **Step 4: Store, carry, copy and check staff in `apps/planner/src/store/sessions.ts`**

Add the imports:

```ts
import { MAX_ROW_STAFF } from "@/types/practice-planner";
import {
    ROW_STAFF_LIMIT_MESSAGE,
    STAFF_ADMIN_MESSAGE,
    STAFF_KEY_MAX,
    STAFF_KEY_MESSAGE,
    STAFF_OFFICIAL_MESSAGE,
    STAFF_ONE_LINK_MESSAGE,
    cleanStaffName,
    sessionStaffError,
    staffNameKey,
    staffNames,
} from "@/lib/utils/session-staff";
```

(merge `MAX_ROW_STAFF` into the existing `@/types/practice-planner` value import) and add `StoredStaffMember` to the `./records` type import.

After `checkedTransition`, add:

```ts
/**
 * Hosted's staff rules in its words (the row and staff schemas, then
 * sessionStaffError, then the link check), on the payload as sent. This
 * planner keeps typed names only, so a link is refused as hosted refuses one it
 * can't verify. Returns the list to store, or undefined when the save sends
 * none (absent = unchanged).
 */
function checkStaff(input: LocalSessionSave): StoredStaffMember[] | undefined {
    for (const row of input.plays) {
        if (row.staff && row.staff.length > MAX_ROW_STAFF) throw new StoreRefusal(ROW_STAFF_LIMIT_MESSAGE);
        if (row.staff?.some((key) => key.length < 1 || key.length > STAFF_KEY_MAX)) throw new StoreRefusal(STAFF_KEY_MESSAGE);
    }
    if (input.staff === undefined) return undefined;
    if (input.staff.some((member) => member.teamOfficialId && member.userId)) throw new StoreRefusal(STAFF_ONE_LINK_MESSAGE);
    const error = sessionStaffError(input.staff, input.plays);
    if (error) throw new StoreRefusal(error);
    if (input.staff.some((member) => member.teamOfficialId)) throw new StoreRefusal(STAFF_OFFICIAL_MESSAGE);
    if (input.staff.some((member) => member.userId)) throw new StoreRefusal(STAFF_ADMIN_MESSAGE);
    return input.staff.map((member) => ({ id: member.key, name: cleanStaffName(member.name) }));
}

/**
 * Each row's staff to store (spec R3, R7). A sent list: the row's keys as sent,
 * nobody when it sends none. Absent: the stored row with the same id keeps its
 * staff. A row's id is the editor's clientKey and survives every save, so this
 * follows a row however it moved.
 */
function withRowStaff(rows: StoredSessionRow[], plays: LocalSessionDrill[], sent: StoredStaffMember[] | undefined, existing?: StoredSession): StoredSessionRow[] {
    if (sent) {
        const byKey = new Map(plays.map((row) => [row.clientKey, row.staff]));
        return rows.map((row) => ({ ...row, staff: [...(byKey.get(row.id) ?? [])] }));
    }
    // Legacy records read with defaults: a session or row stored before practice staff has none.
    const listed = new Set((existing?.staff ?? []).map((member) => member.id));
    const stored = new Map((existing?.rows ?? []).map((row) => [row.id, row.staff ?? []]));
    return rows.map((row) => ({ ...row, staff: (stored.get(row.id) ?? []).filter((key) => listed.has(key)) }));
}
```

In `assertExportable`, add `staff?: StoredStaffMember[]` to the `meta` parameter's type, pass `staff: meta.staff?.map((member) => member.name),` to `serializePlan` (after `transitionMinutes`), and add `staff: staffNames(row.staff, meta.staff),` to both returned row shapes (the block after `label`, the drill after `rotateEveryMinutes`).

In `getSessionView`, add after `transitionMinutes: …`:

```ts
                    // Legacy sessions read as no staff (spec R7).
                    staff: (session.staff ?? []).map((member) => ({ id: member.id, name: member.name })),
```

and `staff: row.staff ?? [],` to the block row (after `runsWithPrevious: false`) and the drill row (after `rotateEveryMinutes`).

In `getSessionForEdit`, add `staff: row.staff ?? [],` to both item shapes the same way, and `staff: (session.staff ?? []).map((member) => ({ id: member.id, name: member.name })),` to `initialData` after `transitionMinutes`.

In `createSession`, after `checkRows(input.plays);`, add `const staff = checkStaff(input);`. In the write, replace the three lines from `const { rows, plays, mapping } = await materialize(…)` to `await tx.putSession(…)` with:

```ts
                    const { rows: materialized, plays, mapping } = await materialize(tx, ctx, id, resolved, at);
                    const rows = withRowStaff(materialized, input.plays, staff);
                    // A create without staff stores none.
                    const sessionStaff = staff ?? [];
                    assertExportable({ ...meta, goaliesAttending, transitionMinutes, staff: sessionStaff }, rows, plays, at);
                    await tx.putSession({ id, ...meta, goaliesAttending, transitionMinutes, staff: sessionStaff, rows, createdAt: at, updatedAt: at });
```

In `updateSession`, after `checkRows(input.plays);`, add `const staff = checkStaff(input);`. In the write, replace the three lines from `const { rows, plays, mapping } = await materialize(…)` to `await tx.putSession(…)` with:

```ts
                    const { rows: materialized, plays, mapping } = await materialize(tx, ctx, id, resolved, at);
                    const rows = withRowStaff(materialized, input.plays, staff, existing);
                    // Absent = unchanged: the stored list stays (a legacy session has none).
                    const sessionStaff = staff ?? existing.staff ?? [];
                    assertExportable({ ...meta, goaliesAttending, transitionMinutes, staff: sessionStaff }, rows, plays, at);
                    await tx.putSession({ ...existing, ...meta, goaliesAttending, transitionMinutes, staff: sessionStaff, rows, updatedAt: at });
```

The drop-only cleanup after it reads `rows` (same play ids) and the return reads `mapping`, both unchanged.

In `duplicatePracticeSession`, before the `for (const row of sortedRows(source))` loop, add:

```ts
                    // Staff (spec R5): new ids, each row's staff moved onto them.
                    const staffIds = new Map((source.staff ?? []).map((member) => [member.id, ctx.newId()]));
                    const staff = (source.staff ?? []).map((member) => ({ id: staffIds.get(member.id) as string, name: member.name }));
                    const copiedStaff = (row: StoredSessionRow) => (row.staff ?? []).flatMap((key) => {
                        const copied = staffIds.get(key);
                        return copied ? [copied] : [];
                    });
```

change both `rows.push({ ...row, id: ctx.newId() … })` calls to add `staff: copiedStaff(row)`, add `staff,` to `meta`, and the `putSession` already spreads `meta`.

In `importPlan`, inside the write after `const id = ctx.newId();`, add:

```ts
                    // Staff (spec R5, R6): typed names; parsePlan checked every row's names are on the list.
                    const staff = parsed.plan.session.staff.map((name) => ({ id: ctx.newId(), name }));
                    const staffByName = new Map(staff.map((member) => [staffNameKey(member.name), member.id]));
                    const rowStaff = (names: string[]) => names.map((name) => staffByName.get(staffNameKey(name)) as string);
```

add `staff: rowStaff(entry.staff),` to both `rows.push({ … })` calls, and `staff,` to the `putSession` object (after `transitionMinutes`).

- [ ] **Step 5: Bump IndexedDB to version 3 (`apps/planner/src/store/idb-repo.ts`)**

Change `export const DB_VERSION = 2;` to `export const DB_VERSION = 3;`. In the header comment, after the version 2 sentence, add: `3 = practice staff (sessions and rows gained optional staff fields).`. In `upgradeDatabase`, after the `oldVersion < 2` block, add:

```ts
    if (oldVersion < 3) {
        // Practice staff: sessions and rows only gained optional fields (older records read
        // with no staff), so there is nothing to migrate. The bump is what makes a tab still
        // running an older build reload (onversionchange) before it can rewrite a session
        // without its staff.
    }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bun run test __tests__/apps/planner`
Expected: PASS.

Run: `bun run type-check`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
/usr/bin/git add apps/planner/src/store/records.ts apps/planner/src/store/types.ts apps/planner/src/store/sessions.ts \
  apps/planner/src/store/idb-repo.ts __tests__/apps/planner/local-store.sessions.test.ts __tests__/apps/planner/repos.test.ts
/usr/bin/git commit -m "feat(planner): practice staff in the static store" -m "Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 7: Editor, part 1: the Staff section and the save payloads

Spec R3 (what the editor sends), R4 (the hosted picker) and R8 (the Staff section). After this task a coach lists staff in both planners: officials and admins from a picker on hosted, typed names in both. The editor sends `staff` whenever it holds a list, so a current editor never relies on the carry path.

**Files:**
- Create: `components/features/practice-planner/PlayLibraryDialog.tsx` (extracted first, for the line budget)
- Create: `components/features/practice-planner/useSessionStaff.ts`, `components/features/practice-planner/SessionStaffSection.tsx`
- Modify: `components/features/practice-planner/PracticeSessionEditor.tsx` (imports, props, the hook, the save payload, the section, the library dialog)
- Modify: `app/(dashboard)/practice-planner/[sessionId]/edit/EditSessionWrapper.tsx`, `app/(dashboard)/practice-planner/[sessionId]/edit/page.tsx`, `app/(dashboard)/practice-planner/new/PracticeSessionEditorWrapper.tsx`, `app/(dashboard)/practice-planner/new/page.tsx`
- Modify: `apps/planner/src/screens/SessionEditorScreen.tsx` (`toLocalSessionSave`)
- Modify: `__tests__/helpers/session-editor.tsx` (`renderEditor` takes editor props)
- Test (create): `__tests__/components/features/practice-planner/PracticeSessionEditor.staff.test.tsx`
- Test (modify: `LOADED` gains `staff: []` now that the edit page must load staff; append): `__tests__/app/practice-planner-hosted-wrappers.test.tsx`
- Test (append): `__tests__/apps/planner/editor-screens.test.tsx`

**Interfaces:**
- Consumes (Task 1): `SessionStaffMember`, `StaffOption`, `MAX_SESSION_STAFF`, `STAFF_NAME_MAX`, `assignmentCount`, `withoutStaffMember`, `namedStaffPayload`, `toSessionStaffInputs`, `toStaffName`, `cleanStaffName`, `staffNameKey`, `removeStaffPrompt`, `STAFF_NAME_TAKEN_MESSAGE`. (Task 4): `getPracticeStaffOptions`, `initialData.staff`. (Task 6): `LocalSessionSave.staff`.
- Produces:
  - `PracticeSessionEditorProps.staffOptions?: StaffOption[]`; `PracticeSessionSubmitData.staff?: SessionStaffMember[]` (via `PracticeSessionData`);
  - `useSessionStaff({ initial, plays, setPlays, markDirty, locked })` → `{ staff: SessionStaffMember[] | undefined; addOption(option: StaffOption): void; addTyped(): string; rename(key: string, name: string): void; remove(key: string): void; setRowStaff(rowId: string, keys: string[]): void; assignments(key: string): number }`;
  - `SessionStaffSection` (props in Step 4) and its exported copy constants;
  - `PlayLibraryDialog({ open, teamId, fullScreen, onClose, onSelectPlay })`;
  - `renderEditor(plays, extra?, onSave?, props?: Partial<PracticeSessionEditorProps>)`.

- [ ] **Step 1: Extract the Play Library dialog (line budget first)**

Run: `wc -l components/features/practice-planner/PracticeSessionEditor.tsx`
Expected: `799`.

Create `components/features/practice-planner/PlayLibraryDialog.tsx`:

```tsx
"use client";

/** The editor's "Select Play from Library" dialog. Extracted from PracticeSessionEditor for its line budget. */
import { Button, Dialog, DialogContent, DialogTitle, Stack, Typography } from "@mui/material";
import type { SavedPlay } from "@/types/practice-planner";
import { PlayLibrary } from "./PlayLibrary";

export interface PlayLibraryDialogProps {
    open: boolean;
    teamId: string;
    fullScreen: boolean;
    onClose: () => void;
    onSelectPlay: (play: SavedPlay) => void;
}

/** MUI Dialog for focus trapping, scroll locking and Escape (Requirements 4.3). */
export function PlayLibraryDialog({ open, teamId, fullScreen, onClose, onSelectPlay }: PlayLibraryDialogProps) {
    return (
        <Dialog open={open} onClose={onClose} fullScreen={fullScreen} maxWidth="lg" fullWidth aria-labelledby="play-library-dialog-title">
            <DialogTitle id="play-library-dialog-title">
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="h5" component="span">
                        Select Play from Library
                    </Typography>
                    <Button variant="outlined" onClick={onClose}>
                        Close
                    </Button>
                </Stack>
            </DialogTitle>
            <DialogContent dividers>
                <PlayLibrary teamId={teamId} onSelectPlay={onSelectPlay} mode="select" />
            </DialogContent>
        </Dialog>
    );
}
```

In `PracticeSessionEditor.tsx`: remove `Dialog`, `DialogTitle` and `DialogContent` from the `@mui/material` import, replace `import { PlayLibrary } from "./PlayLibrary";` with `import { PlayLibraryDialog } from "./PlayLibraryDialog";`, and replace the whole `{/* Play Library Dialog */}` block (the comments and `<Dialog open={showLibrary} …>…</Dialog>`) with:

```tsx
            <PlayLibraryDialog
                open={showLibrary}
                teamId={teamId}
                fullScreen={isMobile}
                onClose={handleCloseLibrary}
                onSelectPlay={handleAddPlayFromLibrary}
            />
```

Run: `bun run test __tests__/components/features/practice-planner/PracticeSessionEditor && wc -l components/features/practice-planner/PracticeSessionEditor.tsx`
Expected: PASS (the library tests open the same dialog); about 770 lines.

- [ ] **Step 2: Write the failing editor tests**

In `__tests__/helpers/session-editor.tsx`, import `type PracticeSessionEditorProps` with `PracticeSessionEditor`, give `renderEditor` a fourth parameter `props: Partial<PracticeSessionEditorProps> = {}`, and spread `{...props}` onto `<PracticeSessionEditor … />` after `onSave={onSave}`.

Create `__tests__/components/features/practice-planner/PracticeSessionEditor.staff.test.tsx`:

```tsx
/** The editor's Staff section (practice staff, spec R3, R4, R8). */
import { beforeAll, describe, expect, it } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { drill, renderEditor, save, stubResizeObserver } from "@/__tests__/helpers/session-editor";
import { STAFF_NAME_TAKEN_MESSAGE } from "@/lib/utils/session-staff";
import { MAX_SESSION_STAFF, type SessionItem, type SessionStaffMember, type StaffOption } from "@/types/practice-planner";

beforeAll(stubResizeObserver);

const LEE: SessionStaffMember = { id: "st1", name: "Coach Lee", teamOfficialId: "coff1", userId: null };
const SAM: SessionStaffMember = { id: "st2", name: "Sam", teamOfficialId: null, userId: null };
/** As getPracticeSessionForEdit returns it: every row carries its staff keys. */
const STAFFED: SessionItem[] = [
    drill("k1", 0, { staff: ["st2"] }),
    { id: "kw", kind: "warmup", label: "", sequence: 1, duration: 8, instructions: "", runsWithPrevious: false, staff: ["st2", "st1"] },
    drill("k2", 2, { staff: [] }),
];
const OPTIONS: StaffOption[] = [
    { kind: "official", id: "coff1", name: "Coach Lee", roleLabel: "Head Coach" },
    { kind: "official", id: "coff2", name: "Pat Park", roleLabel: "Assistant Coach" },
    { kind: "admin", id: "cuser3", name: "Alex Admin", roleLabel: "Team admin" },
];

const sent = (onSave: { mock: { calls: unknown[][] } }) => onSave.mock.calls[0][0] as { staff?: SessionStaffMember[]; plays: SessionItem[] };
/** Opens Add staff and returns the live menu (findByRole retries while a closing menu is still mounted). */
const openAddStaff = async () => {
    fireEvent.click(screen.getByRole("button", { name: "Add staff" }));
    return screen.findByRole("menu");
};
const itemTexts = (menu: HTMLElement) => within(menu).getAllByRole("menuitem").map((item) => item.textContent);

describe("PracticeSessionEditor: the Staff section", () => {
    it("offers only Type a name without picker options (the static planner), and saves the typed name", async () => {
        const onSave = renderEditor([drill("k1", 0)]);
        expect(screen.getByText("No staff yet. Add a coach or a volunteer to show who runs each part.")).toBeInTheDocument();
        const menu = await openAddStaff();
        expect(itemTexts(menu)).toEqual(["Type a name"]);
        fireEvent.click(within(menu).getByRole("menuitem", { name: "Type a name" }));
        fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "  Sam  " } });
        await save();
        expect(sent(onSave).staff).toEqual([{ id: expect.any(String), name: "  Sam  " }]);
    });

    it("saves without a typed person whose name is still empty (Review Focus 5)", async () => {
        const onSave = renderEditor([drill("k1", 0)]);
        fireEvent.click(within(await openAddStaff()).getByRole("menuitem", { name: "Type a name" }));
        expect(screen.getByText("Not saved until it has a name")).toBeInTheDocument();
        await save();
        expect(sent(onSave).staff).toEqual([]);
    });

    it("lists the team's officials and admins by name and role (no email), links the pick, and offers it only once", async () => {
        const onSave = renderEditor([drill("k1", 0)], {}, undefined, { staffOptions: OPTIONS });
        const menu = await openAddStaff();
        expect(itemTexts(menu)).toEqual(["Coach LeeHead Coach", "Pat ParkAssistant Coach", "Alex AdminTeam admin", "Type a name"]);
        expect(document.body.textContent).not.toContain("@");
        fireEvent.click(within(menu).getByRole("menuitem", { name: /Pat Park/ }));
        const list = screen.getByRole("list", { name: "Staff" });
        expect(within(list).getByText("Pat Park")).toBeInTheDocument();
        expect(within(list).getByText("Team official")).toBeInTheDocument();
        expect(within(list).queryByRole("textbox")).toBeNull();
        const again = await openAddStaff();
        expect(itemTexts(again)).not.toContain("Pat ParkAssistant Coach");
        fireEvent.click(within(again).getByRole("menuitem", { name: /Alex Admin/ }));
        expect(within(list).getByText("Team admin")).toBeInTheDocument();
        await save();
        expect(sent(onSave).staff).toEqual([
            { id: expect.any(String), name: "Pat Park", teamOfficialId: "coff2" },
            { id: expect.any(String), name: "Alex Admin", userId: "cuser3" },
        ]);
    });

    it("saves an untouched list and every row's staff back unchanged (Review Focus 1)", async () => {
        const onSave = renderEditor(STAFFED, { staff: [LEE, SAM] });
        fireEvent.change(screen.getByLabelText(/^Session Title/), { target: { value: "Renamed" } });
        await save();
        expect(sent(onSave).staff).toEqual([LEE, SAM]);
        expect(sent(onSave).plays).toEqual(STAFFED);
    });

    it("sends no staff when the editor never held a list (absent = unchanged)", async () => {
        const onSave = renderEditor([drill("k1", 0)]);
        await save();
        expect(sent(onSave).staff).toBeUndefined();
    });

    it("removes someone who runs nothing at once, and asks before removing someone who runs rows (Review Focus 4)", async () => {
        const onSave = renderEditor(STAFFED, { staff: [LEE, SAM, { id: "st3", name: "Idle" }] });
        fireEvent.click(screen.getByRole("button", { name: "Remove Idle" }));
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(screen.queryByRole("button", { name: "Remove Idle" })).toBeNull();

        fireEvent.click(screen.getByRole("button", { name: "Remove Sam" }));
        const dialog = await screen.findByRole("dialog", { name: "Remove staff member" });
        expect(dialog).toHaveTextContent("Remove Sam? They run 2 rows.");
        fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
        expect(screen.getByRole("button", { name: "Remove Sam" })).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Remove Sam" }));
        fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Remove" }));
        await save();
        expect(sent(onSave).staff?.map((member) => member.name)).toEqual(["Coach Lee"]);
        expect(sent(onSave).plays.map((row) => row.staff)).toEqual([[], ["st1"], []]);
    });

    it("says when a typed name clashes with another person's, ignoring case", async () => {
        renderEditor([drill("k1", 0)], { staff: [SAM] });
        fireEvent.click(within(await openAddStaff()).getByRole("menuitem", { name: "Type a name" }));
        fireEvent.change(screen.getAllByRole("textbox", { name: "Name" })[1], { target: { value: "SAM" } });
        expect(screen.getAllByText(STAFF_NAME_TAKEN_MESSAGE)).toHaveLength(2);
    });

    it("stops adding at 12 people", () => {
        renderEditor([drill("k1", 0)], { staff: Array.from({ length: MAX_SESSION_STAFF }, (_, i) => ({ id: `s${i}`, name: `Coach ${i}` })) });
        expect(screen.getByRole("button", { name: "Add staff" })).toBeDisabled();
    });
});
```

In `__tests__/app/practice-planner-hosted-wrappers.test.tsx`, change `const LOADED = { transitionMinutes: 0 };` to `const LOADED = { transitionMinutes: 0, staff: [] };` (and its comment: "The edit page always loads the stored gap and staff …"), and append:

```tsx
describe("hosted wrappers: practice staff (spec R3, R4)", () => {
    const STAFF = [{ id: "cstaffxxxxxxxxxxxxxxxxxxx", name: "Coach Lee", teamOfficialId: "cofficialxxxxxxxxxxxxxxxx", userId: null }, { id: "k-new", name: "Sam" }];
    const ROWS = [{ id: "k1", playId: "cplayxxxxxxxxxxxxxxxxxxxx", name: "A", sequence: 0, runsWithPrevious: false, duration: 10, instructions: "", playData: createEmptyPlayData(), staff: ["k-new"] }];
    const OPTIONS = [{ kind: "official", id: "cofficialxxxxxxxxxxxxxxxx", name: "Coach Lee", roleLabel: "Head Coach" }];

    it("EditSessionWrapper sends the list as keys and names (links only when set) and each row's keys", async () => {
        render(<EditSessionWrapper sessionId={SESSION} teamId={TEAM} initialData={LOADED} bookingOptions={BOOKING as never} />);
        await captured.props!.onSave({ ...submitted, plays: ROWS, staff: STAFF });
        const sentSave = actions.updatePracticeSession.mock.calls[0][0];
        expect(sentSave.staff).toEqual([
            { key: "cstaffxxxxxxxxxxxxxxxxxxx", name: "Coach Lee", teamOfficialId: "cofficialxxxxxxxxxxxxxxxx" },
            { key: "k-new", name: "Sam" },
        ]);
        expect(sentSave.plays[0].staff).toEqual(["k-new"]);
    });

    it("EditSessionWrapper and PracticeSessionEditorWrapper leave staff out when the editor holds none", async () => {
        render(<EditSessionWrapper sessionId={SESSION} teamId={TEAM} initialData={LOADED} bookingOptions={BOOKING as never} />);
        await captured.props!.onSave({ ...submitted });
        expect(actions.updatePracticeSession.mock.calls[0][0]).not.toHaveProperty("staff");
        render(<PracticeSessionEditorWrapper teamId={TEAM} bookingOptions={BOOKING as never} />);
        await captured.props!.onSave({ ...submitted });
        expect(actions.createPracticeSession.mock.calls[0][0]).not.toHaveProperty("staff");
    });

    it("both wrappers hand the editor the picker's options", () => {
        render(<EditSessionWrapper sessionId={SESSION} teamId={TEAM} initialData={LOADED} bookingOptions={BOOKING as never} staffOptions={OPTIONS as never} />);
        expect((captured.props as unknown as { staffOptions: unknown }).staffOptions).toEqual(OPTIONS);
        render(<PracticeSessionEditorWrapper teamId={TEAM} bookingOptions={BOOKING as never} staffOptions={OPTIONS as never} />);
        expect((captured.props as unknown as { staffOptions: unknown }).staffOptions).toEqual(OPTIONS);
    });

    it("EditSessionWrapper can't be given a session without its staff (type check)", () => {
        // @ts-expect-error -- the edit page must load staff, so a current editor always sends its list.
        render(<EditSessionWrapper sessionId={SESSION} teamId={TEAM} initialData={{ transitionMinutes: 0 }} bookingOptions={BOOKING as never} />);
        expect(captured.props).not.toBeNull();
    });
});
```

In `__tests__/apps/planner/editor-screens.test.tsx`, append inside `describe("toLocalSessionSave", …)`:

```tsx
    it("sends the staff list as keys and names, and leaves it out when the editor holds none", () => {
        const base = {
            title: "Tuesday", date: new Date("2026-10-06T19:00:00"), duration: 60, isShared: false, plays: [],
            overrideConflicts: false, overrideReason: "", notify: true,
        } as PracticeSessionSubmitData;
        expect(toLocalSessionSave({ ...base, staff: [{ id: "st1", name: "Sam" }] }).staff).toEqual([{ key: "st1", name: "Sam" }]);
        expect(toLocalSessionSave(base)).not.toHaveProperty("staff");
    });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bun run test __tests__/components/features/practice-planner/PracticeSessionEditor.staff.test.tsx __tests__/app/practice-planner-hosted-wrappers.test.tsx __tests__/apps/planner/editor-screens.test.tsx`
Expected: FAIL (no Staff section; the wrappers send no staff).

- [ ] **Step 4: Create the hook and the section**

Create `components/features/practice-planner/useSessionStaff.ts`:

```ts
"use client";

/**
 * The practice's staff in the editor (spec R8, R11): the list; add (a team
 * official or admin from the hosted picker, or a typed name); rename; remove,
 * which takes the person off every row; and each row's Run by keys. Undefined
 * until the session loads a list or the coach adds someone, so a save never
 * sends a list the editor didn't hold (absent = unchanged). Kept out of
 * PracticeSessionEditor for its line budget.
 */
import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import type { SessionItem, SessionStaffMember, StaffOption } from "@/types/practice-planner";
import { assignmentCount, toStaffName, withoutStaffMember } from "@/lib/utils/session-staff";

let lastKey = 0;
/** An editor key for someone not saved yet; a save keeps a stored id and maps a new key to a new one. */
function newStaffKey(): string {
    lastKey += 1;
    return `staff-${Date.now().toString(36)}-${lastKey}`;
}

export function useSessionStaff({
    initial,
    plays,
    setPlays,
    markDirty,
    locked,
}: {
    initial: SessionStaffMember[] | undefined;
    plays: SessionItem[];
    setPlays: Dispatch<SetStateAction<SessionItem[]>>;
    markDirty: () => void;
    /** A create in flight: it redirects, so any edit would be lost. */
    locked: boolean;
}) {
    const [staff, setStaff] = useState<SessionStaffMember[] | undefined>(initial);

    const edit = useCallback(
        (change: (current: SessionStaffMember[]) => SessionStaffMember[]) => {
            if (locked) return;
            setStaff((current) => change(current ?? []));
            markDirty();
        },
        [locked, markDirty],
    );

    const addOption = useCallback(
        (option: StaffOption) =>
            edit((current) => [
                ...current,
                { id: newStaffKey(), name: toStaffName(option.name), ...(option.kind === "official" ? { teamOfficialId: option.id } : { userId: option.id }) },
            ]),
        [edit],
    );

    /** Adds an empty typed name and returns its key, so the section can focus its field. */
    const addTyped = useCallback(() => {
        const key = newStaffKey();
        edit((current) => [...current, { id: key, name: "" }]);
        return key;
    }, [edit]);

    const rename = useCallback(
        (key: string, name: string) => edit((current) => current.map((member) => (member.id === key ? { ...member, name } : member))),
        [edit],
    );

    const remove = useCallback(
        (key: string) => {
            if (locked) return;
            setStaff((current) => current?.filter((member) => member.id !== key));
            setPlays((rows) => withoutStaffMember(rows, key));
            markDirty();
        },
        [locked, markDirty, setPlays],
    );

    const setRowStaff = useCallback(
        (rowId: string, keys: string[]) => {
            if (locked) return;
            setPlays((rows) => rows.map((row) => (row.id === rowId ? { ...row, staff: keys } : row)));
            markDirty();
        },
        [locked, markDirty, setPlays],
    );

    const assignments = useCallback((key: string) => assignmentCount(plays, key), [plays]);

    return { staff, addOption, addTyped, rename, remove, setRowStaff, assignments };
}
```

Create `components/features/practice-planner/SessionStaffSection.tsx`:

```tsx
"use client";

/**
 * The editor's Staff section (spec R8): who runs this practice. One 44px row
 * per person: a typed name is editable; a team official or admin shows their
 * team name, read-only, with a link badge. Add staff offers the team's
 * officials and admins (hosted: the options prop) and Type a name (both
 * planners). Removing someone who runs rows asks first. Portable: no store,
 * action or Next import; everything comes in as props.
 */
import { useId, useState } from "react";
import {
    Box,
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Divider,
    IconButton,
    ListItemText,
    Menu,
    MenuItem,
    Paper,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import { LinkOutlined, PersonAddAlt1Outlined, PersonRemoveOutlined } from "@mui/icons-material";
import { MAX_SESSION_STAFF, STAFF_NAME_MAX, type SessionStaffMember, type StaffOption } from "@/types/practice-planner";
import { STAFF_NAME_TAKEN_MESSAGE, cleanStaffName, removeStaffPrompt, staffNameKey } from "@/lib/utils/session-staff";

export const STAFF_HEADING = "Staff";
export const NO_STAFF_TEXT = "No staff yet. Add a coach or a volunteer to show who runs each part.";
export const ADD_STAFF_LABEL = "Add staff";
export const TYPE_A_NAME_LABEL = "Type a name";
export const UNSAVED_NAME_HELP = "Not saved until it has a name";
export const TEAM_OFFICIAL_BADGE = "Team official";
export const TEAM_ADMIN_BADGE = "Team admin";
export const REMOVE_STAFF_TITLE = "Remove staff member";

const TARGET = { minWidth: 44, minHeight: 44 } as const;

export interface SessionStaffSectionProps {
    staff: readonly SessionStaffMember[];
    /** Hosted: the team's officials and admins. The static planner passes none. */
    options: readonly StaffOption[];
    /** How many rows a person runs. */
    assignments: (key: string) => number;
    disabled: boolean;
    onAddOption: (option: StaffOption) => void;
    /** Adds an empty typed name; returns its key. */
    onAddTyped: () => string;
    onRename: (key: string, name: string) => void;
    onRemove: (key: string) => void;
}

export function SessionStaffSection({ staff, options, assignments, disabled, onAddOption, onAddTyped, onRename, onRemove }: SessionStaffSectionProps) {
    const headingId = useId();
    const menuId = useId();
    const dialogTitleId = useId();
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const [focusKey, setFocusKey] = useState<string | null>(null);
    const [pending, setPending] = useState<{ key: string; name: string; rows: number } | null>(null);

    // An official or admin already on the list isn't offered again.
    const available = options.filter(
        (option) => !staff.some((member) => (option.kind === "official" ? member.teamOfficialId === option.id : member.userId === option.id)),
    );
    const clashes = (member: SessionStaffMember) => {
        const key = staffNameKey(member.name);
        return key !== "" && staff.some((other) => other.id !== member.id && staffNameKey(other.name) === key);
    };
    const remove = (member: SessionStaffMember) => {
        const rows = assignments(member.id);
        if (rows === 0) onRemove(member.id);
        else setPending({ key: member.id, name: cleanStaffName(member.name), rows });
    };

    return (
        <Paper elevation={2} sx={{ p: 2 }}>
            <Stack spacing={2}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                    <Typography id={headingId} variant="h6" component="h2">
                        {STAFF_HEADING}
                    </Typography>
                    <Button
                        variant="outlined"
                        startIcon={<PersonAddAlt1Outlined />}
                        aria-haspopup="menu"
                        aria-controls={anchor ? menuId : undefined}
                        aria-expanded={anchor ? "true" : undefined}
                        onClick={(event) => setAnchor(event.currentTarget)}
                        disabled={disabled || staff.length >= MAX_SESSION_STAFF}
                        sx={{ minHeight: 44 }}
                    >
                        {ADD_STAFF_LABEL}
                    </Button>
                </Stack>
                {staff.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                        {NO_STAFF_TEXT}
                    </Typography>
                ) : (
                    <Stack component="ul" aria-labelledby={headingId} spacing={1} sx={{ listStyle: "none", m: 0, p: 0 }}>
                        {staff.map((member) => {
                            const name = cleanStaffName(member.name);
                            const linked = Boolean(member.teamOfficialId || member.userId);
                            const clash = clashes(member);
                            return (
                                <Stack component="li" key={member.id} direction="row" spacing={1.5} alignItems="center" sx={{ minHeight: 44 }}>
                                    <Box
                                        aria-hidden
                                        sx={{
                                            width: 36,
                                            height: 36,
                                            flexShrink: 0,
                                            borderRadius: "50%",
                                            display: "grid",
                                            placeItems: "center",
                                            bgcolor: "action.selected",
                                            color: "primary.main",
                                            fontWeight: 800,
                                        }}
                                    >
                                        {name.charAt(0).toUpperCase() || "?"}
                                    </Box>
                                    {linked ? (
                                        <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap" sx={{ flex: 1, minWidth: 0 }}>
                                            <Typography sx={{ fontWeight: 700 }} noWrap>
                                                {name}
                                            </Typography>
                                            <Chip
                                                size="small"
                                                variant="outlined"
                                                color="secondary"
                                                icon={<LinkOutlined />}
                                                label={member.teamOfficialId ? TEAM_OFFICIAL_BADGE : TEAM_ADMIN_BADGE}
                                            />
                                        </Stack>
                                    ) : (
                                        <TextField
                                            label="Name"
                                            size="small"
                                            value={member.name}
                                            onChange={(event) => onRename(member.id, event.target.value)}
                                            autoFocus={member.id === focusKey}
                                            disabled={disabled}
                                            error={clash}
                                            helperText={clash ? STAFF_NAME_TAKEN_MESSAGE : name === "" ? UNSAVED_NAME_HELP : undefined}
                                            slotProps={{ htmlInput: { maxLength: STAFF_NAME_MAX } }}
                                            sx={{ flex: 1, "& .MuiInputBase-root": { minHeight: 44 } }}
                                        />
                                    )}
                                    <IconButton
                                        aria-label={name ? `Remove ${name}` : "Remove unnamed staff member"}
                                        onClick={() => remove(member)}
                                        disabled={disabled}
                                        sx={TARGET}
                                    >
                                        <PersonRemoveOutlined />
                                    </IconButton>
                                </Stack>
                            );
                        })}
                    </Stack>
                )}
            </Stack>

            <Menu
                id={menuId}
                anchorEl={anchor}
                open={anchor !== null}
                onClose={() => setAnchor(null)}
                // The typed name's field takes focus (autoFocus); the menu must not pull it back to the button.
                disableRestoreFocus
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                transformOrigin={{ vertical: "top", horizontal: "right" }}
            >
                {available.map((option) => (
                    <MenuItem
                        key={`${option.kind}-${option.id}`}
                        onClick={() => {
                            setAnchor(null);
                            onAddOption(option);
                        }}
                        sx={{ minHeight: 44 }}
                    >
                        <ListItemText primary={option.name} secondary={option.roleLabel} />
                    </MenuItem>
                ))}
                {available.length > 0 && <Divider />}
                <MenuItem
                    onClick={() => {
                        setAnchor(null);
                        setFocusKey(onAddTyped());
                    }}
                    sx={{ minHeight: 44 }}
                >
                    {TYPE_A_NAME_LABEL}
                </MenuItem>
            </Menu>

            <Dialog open={pending !== null} onClose={() => setPending(null)} aria-labelledby={dialogTitleId}>
                <DialogTitle id={dialogTitleId}>{REMOVE_STAFF_TITLE}</DialogTitle>
                <DialogContent>
                    <DialogContentText>{pending ? removeStaffPrompt(pending.name, pending.rows) : ""}</DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setPending(null)} sx={{ minHeight: 44 }}>
                        Cancel
                    </Button>
                    <Button
                        color="error"
                        variant="contained"
                        onClick={() => {
                            if (pending) onRemove(pending.key);
                            setPending(null);
                        }}
                        sx={{ minHeight: 44 }}
                    >
                        Remove
                    </Button>
                </DialogActions>
            </Dialog>
        </Paper>
    );
}
```

- [ ] **Step 5: Wire the section and the payload into `PracticeSessionEditor.tsx`**

- Imports: add `StaffOption` to the `@/types/practice-planner` import; add `import { namedStaffPayload } from "@/lib/utils/session-staff";`, `import { SessionStaffSection } from "./SessionStaffSection";` and `import { useSessionStaff } from "./useSessionStaff";`.
- In `PracticeSessionEditorProps`, after `wholeLabelBySurface?`, add:

```ts
    /** Hosted: the team's officials and admins for the Staff picker (spec R4). The static planner passes none. */
    staffOptions?: StaffOption[];
```

- Destructure `staffOptions = [],` after `wholeLabelBySurface = {},`.
- After `const rowEdits = useSessionRowEdits(…);`, add:

```ts
    const staff = useSessionStaff({ initial: initialData?.staff, plays, setPlays, markDirty, locked: creating });
```

- In `handleSave`, before `const sessionData`, add:

```ts
            // Named staff only, and no row run by someone unnamed; absent when the editor holds no list (spec R3).
            const settled = settleRotations(plays);
            const staffed = staff.staff === undefined ? null : namedStaffPayload(staff.staff, settled);
```

  and in `sessionData` replace `plays: settleRotations(plays),` with:

```ts
                plays: staffed ? staffed.rows : settled,
                staff: staffed?.staff,
```

  and add `staff.staff` to `handleSave`'s dependency list.
- After `<SessionDetailsFields … />`, add:

```tsx
            <SessionStaffSection
                staff={staff.staff ?? []}
                options={staffOptions}
                assignments={staff.assignments}
                disabled={busy}
                onAddOption={staff.addOption}
                onAddTyped={staff.addTyped}
                onRename={staff.rename}
                onRemove={staff.remove}
            />
```

- [ ] **Step 6: Send staff from all three editor wrappers, and load the picker on both hosted pages**

In `EditSessionWrapper.tsx`:
- add `import { toSessionStaffInputs } from "@/lib/utils/session-staff";` and `import type { PracticeSessionData, SessionStaffMember, StaffOption } from "@/types/practice-planner";`;
- change the `initialData` prop type and its comment to:

```ts
  /**
   * transitionMinutes and staff are required: the editor sends what it loaded
   * on every save. The gap tells updatePracticeSession the payload comes from
   * an editor that knows block rows; the staff list means a current editor
   * never relies on the server carrying assignments across the row rewrite.
   */
  initialData: Partial<PracticeSessionData> & Partial<PracticeVenueAttachment> & { transitionMinutes: number; staff: SessionStaffMember[] };
  /** The team's officials and admins for the Staff picker (spec R4). */
  staffOptions?: StaffOption[];
```

- destructure `staffOptions = []`, pass `staffOptions={staffOptions}` to `<PracticeSessionEditor>`, and in `handleSave`, after the `transitionMinutes` spread, add:

```ts
        // Absent = unchanged: an editor that holds no list sends none.
        ...(session.staff !== undefined && { staff: toSessionStaffInputs(session.staff) }),
```

In `edit/page.tsx`, import `getPracticeStaffOptions` from `@/lib/actions/practice-session-queries`, add `const staffOptions = await getPracticeStaffOptions(data.teamId);` after `bookingOptions`, and pass `staffOptions={staffOptions}` to `<EditSessionWrapper>`.

In `PracticeSessionEditorWrapper.tsx`, add the same `toSessionStaffInputs` import and `StaffOption` type import, a `staffOptions?: StaffOption[]` prop (destructured with `= []`, passed to the editor), and the same `staff` spread in `createPracticeSession({ … })`. In `new/page.tsx`, import `getPracticeStaffOptions`, add `const staffOptions = await getPracticeStaffOptions(context.teamId);`, and pass `staffOptions={staffOptions}`.

In `apps/planner/src/screens/SessionEditorScreen.tsx`, add `import { toSessionStaffInputs } from "@/lib/utils/session-staff";` and, in `toLocalSessionSave` after the `transitionMinutes` spread:

```ts
        // Absent = unchanged (as EditSessionWrapper): an editor that holds no list sends none.
        ...(session.staff !== undefined && { staff: toSessionStaffInputs(session.staff) }),
```

The static editor passes no `staffOptions`, so it offers Type a name only (spec R7).

- [ ] **Step 7: Run the tests to verify they pass**

Run: `bun run test __tests__/components/features/practice-planner __tests__/app __tests__/apps/planner`
Expected: PASS, including both line-budget tests.

Run: `bun run type-check && wc -l components/features/practice-planner/PracticeSessionEditor.tsx`
Expected: exit 0; the editor is about 795 lines (≤ 900).

- [ ] **Step 8: Screenshots (light and dark, desktop and mobile)**

Run `bun run planner:build`, then start the preview in the background (Bash `run_in_background: true`): `bun run planner:preview --port 4199 --strictPort`.

Write `<scratchpad>/pwcheck/staff-task7.mjs`:

```js
import { chromium } from "playwright";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
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
    const add = page.getByRole("button", { name: "Add staff" });
    await add.waitFor({ timeout: 20000 });
    await add.scrollIntoViewIfNeeded();
    await add.click();
    await page.getByRole("menuitem", { name: "Type a name" }).waitFor();
    await page.screenshot({ path: `staff-task7-menu-${tag}-${scheme}.png` });
    await page.getByRole("menuitem", { name: "Type a name" }).click();
    await page.getByRole("textbox", { name: "Name" }).last().fill("Coach Lee");
    await add.click();
    await page.getByRole("menuitem", { name: "Type a name" }).click();
    await page.getByRole("textbox", { name: "Name" }).last().fill("coach lee");
    const section = page.getByRole("heading", { name: "Staff", exact: true }).locator("xpath=ancestor::div[contains(@class,'MuiPaper-root')][1]");
    await section.screenshot({ path: `staff-task7-clash-${tag}-${scheme}.png` });
    await page.getByRole("textbox", { name: "Name" }).last().fill("Sam");
    const small = await section.locator("button").evaluateAll((els) =>
      els.filter((el) => { const r = el.getBoundingClientRect(); return r.height < 44 || r.width < 44; }).map((el) => el.getAttribute("aria-label") || el.textContent));
    console.log(scheme, tag, "staff buttons under 44px:", small);
    await page.getByRole("button", { name: /^save session/i }).click();
    await page.waitForTimeout(2000);
    console.log(scheme, tag, "alerts:", await page.getByRole("alert").allTextContents());
    await section.screenshot({ path: `staff-task7-section-${tag}-${scheme}.png` });
    console.log(scheme, tag, "horizontal overflow px:", await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth));
    await page.reload();
    await page.getByRole("button", { name: "Add staff" }).waitFor({ timeout: 20000 });
    console.log(scheme, tag, "names after reload:", await page.getByRole("textbox", { name: "Name" }).evaluateAll((els) => els.map((el) => el.value)));
    await ctx.close();
  }
}
await browser.close();
```

Run: `cd <scratchpad>/pwcheck && CHROMIUM_PATH=<the local Chromium headless shell> node staff-task7.mjs`
Expected output: no `pageerror`; "staff buttons under 44px: []"; the alerts include "Session saved successfully!"; overflow 0; "names after reload: [ 'Coach Lee', 'Sam' ]".

Read every `staff-task7-*.png`. Check: the Staff card sits under Session Details; the menu shows Type a name; the clash shot shows the error helper on the second field; at 390 px the name field, the avatar and the 44 px remove button share one row without overflow; in dark mode no surface is white and every text is readable. Fix and re-run until they do. Stop the preview server.

- [ ] **Step 9: Commit**

```bash
/usr/bin/git add components/features/practice-planner/PlayLibraryDialog.tsx components/features/practice-planner/useSessionStaff.ts \
  components/features/practice-planner/SessionStaffSection.tsx components/features/practice-planner/PracticeSessionEditor.tsx \
  "app/(dashboard)/practice-planner/[sessionId]/edit/EditSessionWrapper.tsx" "app/(dashboard)/practice-planner/[sessionId]/edit/page.tsx" \
  "app/(dashboard)/practice-planner/new/PracticeSessionEditorWrapper.tsx" "app/(dashboard)/practice-planner/new/page.tsx" \
  apps/planner/src/screens/SessionEditorScreen.tsx __tests__/helpers/session-editor.tsx \
  __tests__/components/features/practice-planner/PracticeSessionEditor.staff.test.tsx \
  __tests__/app/practice-planner-hosted-wrappers.test.tsx __tests__/apps/planner/editor-screens.test.tsx
/usr/bin/git commit -m "feat(practice-planner): staff section in the session editor" -m "Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 8: Editor, part 2: Run by on every row card

Spec R8's row picker. After this task each drill card and block card has a Run by field for 0–4 people from the practice's list, once the list has a named person.

**Files:**
- Create: `components/features/practice-planner/RunByField.tsx`
- Modify: `components/features/practice-planner/SessionDrillCard.tsx` (`runBy` prop and field), `components/features/practice-planner/BlockRowCard.tsx` (`runBy` prop and field), `components/features/practice-planner/SessionDrillList.tsx` (`staff` and `onSetRowStaff` props), `components/features/practice-planner/PracticeSessionEditor.tsx` (two props on the list)
- Test (create): `__tests__/components/features/practice-planner/RunByField.test.tsx`
- Test (append): `__tests__/components/features/practice-planner/PracticeSessionEditor.staff.test.tsx`

**Interfaces:**
- Consumes (Task 1): `MAX_ROW_STAFF`, `cleanStaffName`. (Task 7): `useSessionStaff().staff`, `.setRowStaff`.
- Produces: `RunByField({ staff, value, onChange, title, disabled? })`, `RUN_BY_LABEL = "Run by"`, `RUN_BY_FULL_HELP = "At most 4 people per row"`; `RowRunBy = { staff: readonly SessionStaffMember[]; value: readonly string[]; onChange: (keys: string[]) => void }` exported from `RunByField.tsx`; `runBy?: RowRunBy | null` on `SessionDrillCardProps` and `BlockRowCardProps`; `staff?: SessionStaffMember[]`, `onSetRowStaff?: (rowId: string, keys: string[]) => void` on `SessionDrillListProps` (optional, so existing list renders keep compiling).

- [ ] **Step 1: Write the failing tests**

Create `__tests__/components/features/practice-planner/RunByField.test.tsx`:

```tsx
/** Run by (practice staff, spec R8): 0–4 people from the practice's staff, chips without delete icons. */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { RUN_BY_FULL_HELP, RunByField } from "@/components/features/practice-planner/RunByField";
import type { SessionStaffMember } from "@/types/practice-planner";

const STAFF: SessionStaffMember[] = ["Coach Lee", "Sam", "Alex", "Jo", "Pat"].map((name, i) => ({ id: `s${i}`, name }));

function renderField(value: string[], onChange = vi.fn(), staff: SessionStaffMember[] = STAFF) {
    render(
        <ThemeProvider theme={createTheme({ palette: { mode: "dark" } })}>
            <RunByField staff={staff} value={value} onChange={onChange} title="Breakout" />
        </ThemeProvider>,
    );
    return onChange;
}

const open = () => fireEvent.keyDown(screen.getByRole("combobox", { name: "Run by for Breakout" }), { key: "ArrowDown" });

describe("RunByField", () => {
    it("offers the named staff in list order and adds a pick after the ones already chosen", () => {
        const onChange = renderField(["s1"], vi.fn(), [...STAFF, { id: "s9", name: "  " }]);
        open();
        expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["Coach Lee", "Sam", "Alex", "Jo", "Pat"]);
        fireEvent.click(screen.getByRole("option", { name: "Coach Lee" }));
        expect(onChange).toHaveBeenCalledWith(["s1", "s0"]);
    });

    it("takes a person off when their option is picked again", () => {
        const onChange = renderField(["s1", "s0"]);
        open();
        fireEvent.click(screen.getByRole("option", { name: "Sam" }));
        expect(onChange).toHaveBeenCalledWith(["s0"]);
    });

    it("allows at most 4: the others are disabled and the helper says why", () => {
        renderField(["s0", "s1", "s2", "s3"]);
        expect(screen.getByText(RUN_BY_FULL_HELP)).toBeInTheDocument();
        open();
        expect(screen.getByRole("option", { name: "Pat" })).toHaveAttribute("aria-disabled", "true");
        expect(screen.getByRole("option", { name: "Sam" })).not.toHaveAttribute("aria-disabled", "true");
    });

    it("shows the picks as chips with no delete icon (every target 44px or more), and skips a key no longer on the list", () => {
        renderField(["s1", "gone"]);
        expect(screen.getByText("Sam").closest(".MuiChip-root")).not.toBeNull();
        expect(document.querySelectorAll(".MuiChip-deleteIcon")).toHaveLength(0);
        expect(screen.queryByText("gone")).toBeNull();
    });
});
```

Append to `__tests__/components/features/practice-planner/PracticeSessionEditor.staff.test.tsx`:

```tsx
describe("PracticeSessionEditor: Run by on the row cards", () => {
    it("shows Run by on every drill and block card once someone is named, and saves the picks in order", async () => {
        const onSave = renderEditor(STAFFED, { staff: [LEE, SAM] });
        expect(screen.getAllByRole("combobox", { name: /^Run by for / }).map((field) => field.getAttribute("aria-label"))).toEqual([
            "Run by for Drill k1", "Run by for Warm-up", "Run by for Drill k2",
        ]);
        const k2 = screen.getByRole("combobox", { name: "Run by for Drill k2" });
        fireEvent.keyDown(k2, { key: "ArrowDown" });
        fireEvent.click(screen.getByRole("option", { name: "Sam" }));
        fireEvent.click(screen.getByRole("option", { name: "Coach Lee" }));
        await save();
        expect(sent(onSave).plays.map((row) => row.staff)).toEqual([["st2"], ["st2", "st1"], ["st2", "st1"]]);
    });

    it("hides Run by while nobody on the list has a name", () => {
        renderEditor([drill("k1", 0)], { staff: [{ id: "st9", name: "" }] });
        expect(screen.queryByRole("combobox", { name: /^Run by for / })).toBeNull();
    });

    it("drops a removed person's chips from the cards at once", async () => {
        renderEditor(STAFFED, { staff: [LEE, SAM] });
        expect(screen.getAllByText("Sam").length).toBeGreaterThan(1);
        fireEvent.click(screen.getByRole("button", { name: "Remove Sam" }));
        fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Remove" }));
        expect(screen.queryByText("Sam")).toBeNull();
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test __tests__/components/features/practice-planner/RunByField.test.tsx __tests__/components/features/practice-planner/PracticeSessionEditor.staff.test.tsx`
Expected: FAIL (`RunByField` cannot be resolved; no Run by on the cards).

- [ ] **Step 3: Create `components/features/practice-planner/RunByField.tsx`**

```tsx
"use client";

/**
 * "Run by" on a row card (spec R8): 0–4 people from the practice's staff,
 * shown as chips. No control smaller than 44px: chips have no delete icon (a
 * person comes off by picking their option again, or with Backspace) and the
 * field has no popup arrow (the 44px field itself opens the list on focus).
 * Portable: no store, action or Next import.
 */
import { Autocomplete, Chip, TextField } from "@mui/material";
import { MAX_ROW_STAFF, type SessionStaffMember } from "@/types/practice-planner";
import { cleanStaffName } from "@/lib/utils/session-staff";

export const RUN_BY_LABEL = "Run by";
export const RUN_BY_FULL_HELP = `At most ${MAX_ROW_STAFF} people per row`;

/** What a row card needs to show Run by: the list, the row's keys, and where a change goes. */
export interface RowRunBy {
    staff: readonly SessionStaffMember[];
    value: readonly string[];
    onChange: (keys: string[]) => void;
}

export interface RunByFieldProps extends RowRunBy {
    /** The row's title, for the field's accessible name */
    title: string;
    disabled?: boolean;
}

export function RunByField({ staff, value, onChange, title, disabled = false }: RunByFieldProps) {
    // Only named people are offered; a key no longer on the list is skipped (spec R11).
    const named = staff.filter((member) => cleanStaffName(member.name).length > 0);
    const selected = value.flatMap((key) => named.filter((member) => member.id === key));
    const full = selected.length >= MAX_ROW_STAFF;
    return (
        <Autocomplete
            multiple
            size="small"
            options={named}
            value={selected}
            onChange={(_, next) => onChange(next.slice(0, MAX_ROW_STAFF).map((member) => member.id))}
            getOptionLabel={(member) => member.name}
            isOptionEqualToValue={(option, picked) => option.id === picked.id}
            getOptionDisabled={(member) => full && !value.includes(member.id)}
            disableCloseOnSelect
            disableClearable
            forcePopupIcon={false}
            openOnFocus
            disabled={disabled}
            renderValue={(members, getItemProps) =>
                members.map((member, index) => {
                    const { key, ...itemProps } = getItemProps({ index });
                    return <Chip key={key} {...itemProps} onDelete={undefined} size="small" label={member.name} sx={{ maxWidth: 160 }} />;
                })
            }
            renderInput={(params) => (
                <TextField
                    {...params}
                    label={RUN_BY_LABEL}
                    helperText={full ? RUN_BY_FULL_HELP : undefined}
                    inputProps={{ ...params.inputProps, "aria-label": `${RUN_BY_LABEL} for ${title}` }}
                    sx={{ "& .MuiInputBase-root": { minHeight: 44 } }}
                />
            )}
            slotProps={{ listbox: { sx: { "& .MuiAutocomplete-option": { minHeight: 44 } } } }}
            sx={{ minWidth: 0 }}
        />
    );
}
```

- [ ] **Step 4: Add the field to both cards and thread it through the list**

In `SessionDrillCard.tsx`:
- import `{ RunByField, type RowRunBy } from "./RunByField";`;
- add to `SessionDrillCardProps`, after `stays?`:

```ts
    /** Who runs this drill (practice staff, spec R8); null hides the field (nobody on the list is named). */
    runBy?: RowRunBy | null;
```

- destructure `runBy = null,` after `stays = null,`;
- right before the `{!isEditing && (<Tooltip title={canEditDiagram ? "" : "Save the session first"}>` block, add:

```tsx
                    {runBy && <RunByField {...runBy} title={play.name || `Drill ${number}`} disabled={locked} />}
```

In `BlockRowCard.tsx`:
- import `{ RunByField, type RowRunBy } from "./RunByField";`;
- add `/** Who runs this block (practice staff, spec R8); null hides the field. */ runBy?: RowRunBy | null;` to `BlockRowCardProps` and destructure `runBy = null`;
- replace the closing note `<Box sx={{ px: 2, pb: 2 }}>` wrapper with `<Stack spacing={1.5} sx={{ px: 2, pb: 2 }}>`, keep the Note `TextField` inside it, then add `{runBy && <RunByField {...runBy} title={title} disabled={locked} />}` and close with `</Stack>`.

In `SessionDrillList.tsx`:
- import `type SessionStaffMember` with the other `@/types/practice-planner` types, `import { cleanStaffName } from "@/lib/utils/session-staff";` and `import type { RowRunBy } from "./RunByField";`;
- add to `SessionDrillListProps`, after `onSetStays`:

```ts
    /** The practice's staff (practice staff, spec R8); absent or unnamed hides Run by. */
    staff?: SessionStaffMember[];
    /** Sets who runs the row with this id. */
    onSetRowStaff?: (rowId: string, keys: string[]) => void;
```

- destructure `staff, onSetRowStaff,` and, before `renderCard`, add:

```ts
    // Run by appears on every card once the practice has a named person (spec R8).
    const staffed = Boolean(staff?.some((member) => cleanStaffName(member.name).length > 0));
    const runByFor = (row: SessionItem): RowRunBy | null =>
        staffed && staff && onSetRowStaff ? { staff, value: row.staff ?? [], onChange: (keys) => onSetRowStaff(row.id, keys) } : null;
```

- pass `runBy={runByFor(play)}` to `<SessionDrillCard>` and `runBy={runByFor(item)}` to `<BlockRowCard>`.

In `PracticeSessionEditor.tsx`, add to `<SessionDrillList …>` after `onSetStays={rowEdits.setStays}`:

```tsx
                staff={staff.staff}
                onSetRowStaff={staff.setRowStaff}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun run test __tests__/components/features/practice-planner`
Expected: PASS, including `SessionDrillList.busy.test.tsx` (the new list props are optional) and the line-budget test.

Run: `bun run type-check`
Expected: exit 0.

- [ ] **Step 6: Screenshots (light and dark, desktop and mobile)**

With the static planner built and served as in Task 7 Step 8, write `<scratchpad>/pwcheck/staff-task8.mjs`:

```js
import { chromium } from "playwright";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const BASE = "http://localhost:4199/";
for (const scheme of ["light", "dark"]) {
  for (const [w, h, tag] of [[1280, 1000, "desktop"], [390, 844, "mobile"]]) {
    const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.log("pageerror", e.message));
    await page.goto(BASE + "#/import");
    await page.getByRole("button", { name: "Use template: Team Practice with Stations" }).click();
    await page.getByRole("button", { name: /save to my practices/i }).click();
    await page.waitForURL(/#\/sessions\/[^/]+$/, { timeout: 20000 });
    await page.goto(page.url() + "/edit");
    const add = page.getByRole("button", { name: "Add staff" });
    await add.waitFor({ timeout: 20000 });
    for (const name of ["Coach Lee", "Sam", "Alex", "Jo", "Pat"]) {
      await add.click();
      await page.getByRole("menuitem", { name: "Type a name" }).click();
      await page.getByRole("textbox", { name: "Name" }).last().fill(name);
    }
    const fields = page.getByRole("combobox", { name: /^Run by for / });
    console.log(scheme, tag, "Run by fields:", await fields.count());
    const first = fields.first();
    await first.scrollIntoViewIfNeeded();
    await first.click();
    for (const name of ["Coach Lee", "Sam", "Alex", "Jo"]) await page.getByRole("option", { name, exact: true }).click();
    await page.screenshot({ path: `staff-task8-picker-${tag}-${scheme}.png` });
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Add block" }).click();
    await page.getByRole("menuitem", { name: /^Warm-up/ }).click();
    const block = page.getByRole("region", { name: "Warm-up" }).last();
    await block.getByRole("combobox", { name: /^Run by for / }).click();
    await page.getByRole("option", { name: "Sam", exact: true }).click();
    await page.keyboard.press("Escape");
    await block.scrollIntoViewIfNeeded();
    await block.screenshot({ path: `staff-task8-block-${tag}-${scheme}.png` });
    const card = first.locator("xpath=ancestor::div[contains(@class,'MuiCard-root')][1]");
    await card.screenshot({ path: `staff-task8-drill-${tag}-${scheme}.png` });
    const small = await page.locator(".MuiAutocomplete-root button, .MuiAutocomplete-root svg.MuiChip-deleteIcon").evaluateAll((els) =>
      els.filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.height < 44 || r.width < 44); }).map((el) => el.className.toString().slice(0, 40)));
    console.log(scheme, tag, "Run by targets under 44px:", small);
    await page.getByRole("button", { name: /^save session/i }).click();
    await page.waitForTimeout(2000);
    console.log(scheme, tag, "alerts:", await page.getByRole("alert").allTextContents());
    console.log(scheme, tag, "horizontal overflow px:", await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth));
    await ctx.close();
  }
}
await browser.close();
```

Run: `cd <scratchpad>/pwcheck && CHROMIUM_PATH=<the local Chromium headless shell> node staff-task8.mjs`
Expected output: no `pageerror`; one Run by field per row; "Run by targets under 44px: []" (no popup arrow, no chip delete icon); the save alert; overflow 0.

Read every `staff-task8-*.png`. Check: chips read clearly in both schemes with no delete icons; the fifth option shows disabled with the helper "At most 4 people per row"; on mobile the chips wrap inside the card without overflow; the block card's Run by sits under its Note. Fix and re-run until they do. Stop the preview server.

- [ ] **Step 7: Commit**

```bash
/usr/bin/git add components/features/practice-planner/RunByField.tsx components/features/practice-planner/SessionDrillCard.tsx \
  components/features/practice-planner/BlockRowCard.tsx components/features/practice-planner/SessionDrillList.tsx \
  components/features/practice-planner/PracticeSessionEditor.tsx __tests__/components/features/practice-planner/RunByField.test.tsx \
  __tests__/components/features/practice-planner/PracticeSessionEditor.staff.test.tsx
/usr/bin/git commit -m "feat(practice-planner): run by picker on every row card" -m "Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 9: Session page and live bench sheet: who runs each row

Spec R9 (screen and live print). After this task the session page's timeline shows " · run by …" after each row and station, its sidebar cards a "Run by" line, and the live bench sheet a staff line in its header and names per row. The view reads names from the session's list by key (R11).

**Files:**
- Modify: `components/features/practice-planner/SessionTimeline.tsx` (imports, row types, `staff` prop, both variants)
- Modify: `components/features/practice-planner/SidebarPlayCard.tsx` (`runBy` prop)
- Modify: `app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx` (imports, two props)
- Modify: `components/features/practice-planner/print/BenchSheet.tsx` (header staff line, timeline `staff`)
- Test (append): `__tests__/components/features/practice-planner/SessionTimeline.test.tsx`, `__tests__/components/features/practice-planner/print/BenchSheet.test.tsx`
- Test (create): `__tests__/app/practice-session-detail-staff.test.tsx`

**Interfaces:**
- Consumes (Task 1): `staffNames`, `runBySuffix`, `runByLabel`, `staffHeaderLabel`, `SessionStaffMember`. (Tasks 4, 6): `PracticeSessionView.staff`, each row's `staff`.
- Produces: `SessionTimelineProps.staff?: readonly SessionStaffMember[]`; `staff?: readonly string[]` on `SessionTimelineDrill` and `SessionTimelineBlock`; `SidebarPlayCard`'s `runBy?: string | null`.

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/components/features/practice-planner/SessionTimeline.test.tsx`:

```tsx
describe("SessionTimeline: who runs each row (practice staff, spec R9)", () => {
    const STAFF = [{ id: "s1", name: "Coach Lee" }, { id: "s2", name: "Sam" }];
    const ROWS = [
        { ...play("Breakout", 0, 15), staff: ["s1", "s2"] },
        { ...play("Regroup", 1, 10, true), staff: ["s2"] },
        { id: "row-w", kind: "break" as const, label: null, instructions: null, sequence: 2, duration: 2, runsWithPrevious: false, staff: ["s1", "gone"] },
        play("Shooting", 3, 10),
    ];

    function renderRows(variant: "screen" | "print") {
        render(
            <ThemeProvider theme={createTheme({ palette: { mode: "dark" } })}>
                <SessionTimeline plays={ROWS} sessionStart={START} timeZone="America/New_York" showZone durationMinutes={60} staff={STAFF} variant={variant} />
            </ThemeProvider>,
        );
    }

    it("screen: adds the names after each station, block and lone drill, from the list by key, and nothing for nobody", () => {
        renderRows("screen");
        const [stations, block, shooting] = bodyRows();
        expect(within(stations).getByText("· 15 min · run by Coach Lee, Sam")).toBeInTheDocument();
        expect(within(stations).getByText("· 10 min · run by Sam")).toBeInTheDocument();
        expect(within(block).getByText("· run by Coach Lee")).toBeInTheDocument();
        expect(within(shooting).queryByText(/run by/)).toBeNull();
    });

    it("print: the same names in the bench sheet's plain table", () => {
        renderRows("print");
        const table = screen.getByRole("table", { name: "Session timeline" });
        expect(table).toHaveTextContent("Breakout · 15 min · run by Coach Lee, Sam");
        expect(table).toHaveTextContent("Regroup · 10 min · run by Sam");
        expect(table).toHaveTextContent("Water break · run by Coach Lee");
        expect(table.textContent).not.toMatch(/Shooting · run by/);
    });

    it("shows no names without a staff list", () => {
        render(ui());
        expect(screen.queryByText(/run by/)).toBeNull();
    });
});
```

Create `__tests__/app/practice-session-detail-staff.test.tsx`:

```tsx
/** Session detail (practice staff, spec R9): names on the timeline and a "Run by" line on the sidebar cards. */
import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { renderWithPlanner } from "@/__tests__/helpers/planner";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import type { PracticeSessionView } from "@/types/practice-planner";

vi.mock("@/lib/utils/canvas/thumbnail-generator", () => ({ generateThumbnail: () => "data:image/png;base64,LIVE" }));
vi.mock("@/components/features/practice-planner/StationMap", () => ({ StationMap: () => null }));
vi.mock("@/components/features/practice-planner/PlayLegend", () => ({ PlayLegend: () => null, LegendSwatch: () => null }));

import { SessionDetailView } from "@/app/(dashboard)/practice-planner/[sessionId]/SessionDetailView";

const drill = (id: string, name: string, sequence: number, staff?: string[]) => ({
    id, sequence, duration: 10, runsWithPrevious: false, instructions: null, ...(staff && { staff }),
    play: { id: `play-${id}`, name, description: null, thumbnail: null, playData: createEmptyPlayData() },
});

const SESSION: PracticeSessionView = {
    id: "csessionxxxxxxxxxxxxxxxxx", title: "Tuesday", date: "2026-04-07T22:00:00.000Z", duration: 60, isShared: false,
    createdByName: "Coach", teamId: "cteamxxxxxxxxxxxxxxxxxxxx", teamName: "Team", startAt: null, transitionMinutes: 0,
    staff: [{ id: "s1", name: "Coach Lee" }, { id: "s2", name: "Sam" }],
    plays: [
        { id: "row-w", kind: "warmup", label: null, sequence: 0, duration: 8, instructions: null, runsWithPrevious: false, staff: ["s2"] },
        drill("row-a", "Breakout", 1, ["s1", "s2"]),
        drill("row-c", "Shooting", 2),
    ],
};

describe("SessionDetailView: practice staff", () => {
    it("names who runs each row on the timeline, and on each drill's sidebar card", () => {
        renderWithPlanner(
            <ThemeProvider theme={createTheme()}>
                <SessionDetailView session={SESSION} isAdmin={false} />
            </ThemeProvider>,
        );
        const timeline = screen.getByRole("table", { name: "Session timeline" });
        expect(within(timeline).getByText("· run by Sam")).toBeInTheDocument();
        expect(within(timeline).getByText("· run by Coach Lee, Sam")).toBeInTheDocument();
        expect(screen.getByText("Run by Coach Lee, Sam")).toBeInTheDocument();
        // The warm-up has no sidebar card, and Shooting has nobody.
        expect(screen.getAllByText(/^Run by /)).toHaveLength(1);
    });
});
```

Append to `__tests__/components/features/practice-planner/print/BenchSheet.test.tsx`:

```tsx
describe("BenchSheet: practice staff (spec R9)", () => {
    it("prints the staff line in the header and who runs each timeline row", () => {
        const [breakout, regroup, shooting, lost, cooldown] = SESSION.plays;
        renderSheet({
            ...SESSION,
            staff: [{ id: "s1", name: "Coach Lee" }, { id: "s2", name: "Sam" }],
            plays: [{ ...breakout, staff: ["s1", "s2"] }, regroup, shooting, { ...lost, staff: ["s2"] }, cooldown],
        });
        expect(screen.getByText("Staff: Coach Lee, Sam")).toBeInTheDocument();
        const timeline = screen.getByRole("table", { name: "Session timeline" });
        expect(timeline).toHaveTextContent("Breakout · 15 min · run by Coach Lee, Sam");
        expect(timeline).toHaveTextContent("Lost · run by Sam");
    });

    it("prints no staff line for a practice without staff", () => {
        renderSheet();
        expect(screen.queryByText(/^Staff:/)).toBeNull();
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test __tests__/components/features/practice-planner/SessionTimeline.test.tsx __tests__/app/practice-session-detail-staff.test.tsx __tests__/components/features/practice-planner/print/BenchSheet.test.tsx`
Expected: FAIL (no names anywhere).

- [ ] **Step 3: Name staff in `SessionTimeline.tsx`**

- Change the type import to `import type { BlockKind, SessionStaffMember } from "@/types/practice-planner";` and add `import { runBySuffix, staffNames } from "@/lib/utils/session-staff";`.
- Add to both `SessionTimelineDrill` and `SessionTimelineBlock`:

```ts
    /** Staff ids running this row (practice staff); names come from the `staff` prop. */
    staff?: readonly string[];
```

- Add to `SessionTimelineProps`, after `transitionMinutes?`:

```ts
    /** The practice's staff: each row shows " · run by …" from it, by key (spec R9, R11). */
    staff?: readonly SessionStaffMember[];
```

- Destructure `staff,` and, after `const footer = …`, add:

```tsx
    // " · run by Coach Lee, Sam" after a row or a station (spec R9).
    const runBy = (row: SessionTimelinePlay) => runBySuffix(staffNames(row.staff, staff));
    const runByCaption = (row: SessionTimelinePlay) => {
        const text = runBy(row);
        return text ? (
            <Typography component="span" variant="caption" color="text.secondary">
                {text}
            </Typography>
        ) : null;
    };
```

- Print variant: replace `blockLine(head)` with `` `${blockLine(head)}${runBy(head)}` ``; the station `<li>` text with `` {`${sp.play.name}${grid ? staysSuffix(sp.stays) : ` · ${sp.duration} min`}${runBy(sp)}`} ``; and the lone drill's `drills[0].play.name` with `` `${drills[0].play.name}${runBy(drills[0])}` ``.
- Screen variant: replace `<BlockText row={head} />` with `<><BlockText row={head} />{runByCaption(head)}</>`; in each station's caption `<Typography component="span" variant="caption" color="text.secondary">`, change its child to `` {`${grid ? staysSuffix(sp.stays) : ` · ${sp.duration} min`}${runBy(sp)}`} ``; and replace the lone drill's `<DrillName id={head.id} … />` with `<><DrillName id={head.id} name={drills[0].play.name} onSelect={onSelectPlay} />{runByCaption(drills[0])}</>`.

- [ ] **Step 4: The sidebar line, the session page and the live bench sheet**

In `SidebarPlayCard.tsx`, add to `SidebarPlayCardProps`:

```ts
  /** "Run by Coach Lee, Sam" (practice staff, spec R9), or null when nobody runs this drill */
  runBy?: string | null;
```

destructure `runBy = null`, and right after the timing `<Typography variant="caption" color="text.secondary">{timing}</Typography>`, add:

```tsx
            {runBy && (
              <Typography variant="caption" color="text.secondary" component="div" noWrap>
                {runBy}
              </Typography>
            )}
```

In `SessionDetailView.tsx`, add `import { runByLabel, staffNames } from "@/lib/utils/session-staff";`, pass `staff={session.staff}` to `<SessionTimeline …>`, and `runBy={runByLabel(staffNames(sp.staff, session.staff))}` to `<SidebarPlayCard …>`.

In `print/BenchSheet.tsx`, add `import { staffHeaderLabel } from "@/lib/utils/session-staff";`, then `const staffLine = staffHeaderLabel(session.staff);` after `const gap = …`; in the header, after the place line, add `{staffLine && <Typography variant="body1">{staffLine}</Typography>}`; and pass `staff={session.staff}` to the print `<SessionTimeline …>`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun run test __tests__/components/features/practice-planner __tests__/app`
Expected: PASS, including `SessionDetailView.line-budget.test.ts` (about 740 lines).

Run: `bun run type-check`
Expected: exit 0.

- [ ] **Step 6: Screenshots: session page and bench sheet print view**

With the static planner built and served as in Task 7 Step 8, write `<scratchpad>/pwcheck/staff-task9.mjs`:

```js
import { chromium } from "playwright";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
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
    const add = page.getByRole("button", { name: "Add staff" });
    await add.waitFor({ timeout: 20000 });
    for (const name of ["Coach Lee", "Sam", "Alex"]) {
      await add.click();
      await page.getByRole("menuitem", { name: "Type a name" }).click();
      await page.getByRole("textbox", { name: "Name" }).last().fill(name);
    }
    const fields = page.getByRole("combobox", { name: /^Run by for / });
    for (const [index, names] of [[0, ["Coach Lee", "Sam"]], [1, ["Alex"]], [2, ["Sam"]]]) {
      await fields.nth(index).click();
      for (const name of names) await page.getByRole("option", { name, exact: true }).click();
      await page.keyboard.press("Escape");
    }
    await page.getByRole("button", { name: /^save session/i }).click();
    await page.waitForTimeout(2000);
    await page.goto(session);
    await page.getByRole("table", { name: "Session timeline" }).waitFor({ timeout: 20000 });
    await page.waitForTimeout(1000);
    console.log(scheme, tag, "timeline run-by lines:", await page.getByRole("table", { name: "Session timeline" }).getByText(/run by/).count());
    console.log(scheme, tag, "session page horizontal overflow px:", await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth));
    await page.screenshot({ path: `staff-task9-session-${tag}-${scheme}.png`, fullPage: true });
    await page.getByRole("table", { name: "Session timeline" }).screenshot({ path: `staff-task9-timeline-${tag}-${scheme}.png` });
    await page.goto(session + "/print");
    await page.getByRole("button", { name: "Print" }).waitFor({ timeout: 20000 });
    await page.waitForTimeout(1500);
    console.log(scheme, tag, "bench sheet staff line:", await page.getByText(/^Staff: /).textContent());
    await page.emulateMedia({ media: "print" });
    await page.screenshot({ path: `staff-task9-bench-print-${tag}-${scheme}.png`, fullPage: true });
    if (tag === "desktop" && scheme === "light") await page.pdf({ path: "staff-task9-bench.pdf", format: "Letter", preferCSSPageSize: true });
    await ctx.close();
  }
}
await browser.close();
```

Run: `cd <scratchpad>/pwcheck && CHROMIUM_PATH=<the local Chromium headless shell> node staff-task9.mjs`
Expected output: no `pageerror`; at least 3 timeline run-by lines; overflow 0; "bench sheet staff line: Staff: Coach Lee, Sam, Alex".

Read every `staff-task9-*.png` and the PDF's first page. Check: the run-by text is secondary (dimmer) and wraps cleanly at 390 px; sidebar cards show a "Run by" line under the timing; the bench sheet header has the staff line and each timeline row its names, black on white in print in both schemes. Fix and re-run until they do. Stop the preview server.

- [ ] **Step 7: Commit**

```bash
/usr/bin/git add components/features/practice-planner/SessionTimeline.tsx components/features/practice-planner/SidebarPlayCard.tsx \
  "app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx" components/features/practice-planner/print/BenchSheet.tsx \
  __tests__/components/features/practice-planner/SessionTimeline.test.tsx __tests__/components/features/practice-planner/print/BenchSheet.test.tsx \
  __tests__/app/practice-session-detail-staff.test.tsx
/usr/bin/git commit -m "feat(practice-planner): show who runs each row on the session page and bench sheet" -m "Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 10: Bench sheet exports and the import preview

Spec R9 (HTML and Word) and the import preview. After this task the HTML and Word bench sheets carry the staff line and each row's names (escaped and `xmlSafe`), and the import preview shows the plan's staff and who runs each row, in both apps.

**Files:**
- Modify: `components/features/practice-planner/export/bench-sheet-model.ts` (imports, `BenchSheetTimelineRow`, `BenchSheetModel.staff`, `buildBenchSheetModel`)
- Modify: `components/features/practice-planner/export/bench-sheet-html.ts` (styles, `header`, `timeline`)
- Modify: `components/features/practice-planner/export/bench-sheet-docx.ts` (`header`, `timeline`)
- Modify: `components/features/practice-planner/PlanPreview.tsx`
- Test (append; and add `staff: null` to `MODEL` in the HTML and Word tests): `__tests__/components/features/practice-planner/export/bench-sheet-model.test.ts`, `__tests__/components/features/practice-planner/export/bench-sheet-html.test.ts`, `__tests__/components/features/practice-planner/export/bench-sheet-docx.test.ts`
- Test (append): `__tests__/components/features/practice-planner/PlanPreview.test.tsx`

**Interfaces:**
- Consumes (Task 1): `staffNames`, `runByText`, `runBySuffix`, `staffHeaderLabel`. (Task 2): `ExportSession.staff`, the rows' `staff`, `PlanEditorSession.staff`, the editor rows' `staff`.
- Produces: `BenchSheetModel.staff: string | null`; `runBy?: string` on every `BenchSheetTimelineRow` member (set on a lone drill or a block run by someone; a station's names are in its `stations` string).

- [ ] **Step 1: Write the failing tests**

In `bench-sheet-html.test.ts` and `bench-sheet-docx.test.ts`, add `staff: null,` to `MODEL` after `gap: null,`.

Append to `__tests__/components/features/practice-planner/export/bench-sheet-model.test.ts`:

```ts
describe("buildBenchSheetModel: practice staff (spec R9)", () => {
    const STAFFED: ExportSession = {
        ...BOOKED,
        staff: [{ id: "s1", name: "Coach Lee" }, { id: "s2", name: "Sam" }],
        plays: [
            { ...play("Breakout", 0, 10, false, { playData: withPass("a") }), staff: ["s1"] },
            { ...play("Regroup", 1, 8, true, { playData: withPass("b") }), staff: ["s2", "s1"] },
            { ...play("Shooting", 2, 15, false, { playData: null }), staff: ["s2"] },
            { kind: "break", sequence: 3, duration: 2, instructions: null, runsWithPrevious: false, label: null, staff: ["s1", "gone"] },
        ],
    };

    it("names the staff in the header and who runs each row: in a station's line, or as the row's runBy", () => {
        const model = buildBenchSheetModel(STAFFED, renderers());
        expect(model.staff).toBe("Staff: Coach Lee, Sam");
        expect(model.timeline).toMatchObject([
            { label: "Stations · 2", stations: ["Breakout · 10 min · run by Coach Lee", "Regroup · 8 min · run by Sam, Coach Lee"] },
            { label: "Shooting", stations: null, runBy: "run by Sam" },
            { kind: "block", label: "Water break", runBy: "run by Coach Lee" },
        ]);
        expect(model.timeline[0]).not.toHaveProperty("runBy");
    });

    it("has no staff line and no runBy without a staff list", () => {
        const model = buildBenchSheetModel(BOOKED, renderers());
        expect(model.staff).toBeNull();
        expect(model.timeline.some((row) => "runBy" in row)).toBe(false);
    });
});
```

Append to `__tests__/components/features/practice-planner/export/bench-sheet-html.test.ts`:

```ts
describe("renderBenchSheetHtml: practice staff (spec R9)", () => {
    it("prints the staff line and each row's names, escaped", () => {
        const out = renderBenchSheetHtml({
            ...MODEL,
            staff: "Staff: <Coach> & Sam",
            timeline: [
                { start: "6:00 PM MDT", minutes: 10, label: "Stations · 2", stations: ["Breakout · 10 min · run by <Sam>", "Regroup · 8 min"] },
                { start: "6:10 PM MDT", minutes: 15, label: "Shooting", stations: null, runBy: "run by <Sam>" },
                { kind: "block", start: "6:25 PM MDT", minutes: 2, label: "Water", note: "Fill up", stations: null, runBy: "run by Coach Lee" },
            ],
        });
        const doc = parse(out);
        expect(doc.querySelector(".staff")?.textContent).toBe("Staff: <Coach> & Sam");
        expect(out).toContain("Staff: &lt;Coach&gt; &amp; Sam");
        const rows = Array.from(doc.querySelectorAll(".timeline tbody tr"));
        expect(rows[0].querySelector("li")?.textContent).toBe("Breakout · 10 min · run by <Sam>");
        expect(rows[1].querySelectorAll("td")[2].textContent).toBe("Shooting · run by <Sam>");
        expect(rows[2].querySelectorAll("td")[2].textContent).toBe("Water · Fill up · run by Coach Lee");
        expect(out).not.toContain("<Sam>");
    });

    it("prints no staff line when there is none", () => {
        expect(parse(renderBenchSheetHtml(MODEL)).querySelector(".staff")).toBeNull();
    });
});
```

Append to `__tests__/components/features/practice-planner/export/bench-sheet-docx.test.ts`:

```ts
describe("renderBenchSheetDocx: practice staff (spec R9)", () => {
    it("writes the staff line and each row's names as safe text", async () => {
        const xml = await documentXml({
            ...MODEL,
            staff: "Staff: <Coach> & Sam\u0007",
            timeline: [
                ...MODEL.timeline,
                { start: "6:10 PM MDT", minutes: 15, label: "Shooting", stations: null, runBy: "run by <Sam>" },
                { kind: "block", start: "6:25 PM MDT", minutes: 2, label: "Water", note: "Fill up", stations: null, runBy: "run by Coach Lee" },
            ],
        });
        expect(xml).toContain("Staff: &lt;Coach&gt; &amp; Sam");
        expect(xml).not.toContain("\u0007");
        expect(xml).toContain("Shooting · run by &lt;Sam&gt;");
        expect(xml).toContain("Water · Fill up · run by Coach Lee");
    });
});
```

Append to `__tests__/components/features/practice-planner/PlanPreview.test.tsx` (add `import { serializePlan } from "@/lib/plan-document";`):

```tsx
describe("PlanPreview: practice staff (spec R9)", () => {
    it("lists the plan's staff under the subtitle and who runs each row", () => {
        const plan = serializePlan(
            {
                title: "Staffed",
                durationMinutes: 60,
                date: null,
                startTime: null,
                staff: ["Coach Lee", "Sam"],
                drills: [
                    { kind: "warmup", sequence: 0, duration: 8, instructions: null, label: null, runsWithPrevious: false, staff: ["Sam"] },
                    { sequence: 1, duration: 10, runsWithPrevious: false, instructions: "Hard", name: "Breakout", description: null, playData: null, staff: ["Coach Lee", "Sam"] },
                    { sequence: 2, duration: 10, runsWithPrevious: false, instructions: null, name: "Shooting", description: null, playData: null },
                ],
            },
            "openleague-static",
            NOW,
        );
        render(
            <ThemeProvider theme={createTheme({ palette: { mode: "dark" } })}>
                <PlanPreview plan={plan} />
            </ThemeProvider>,
        );
        expect(screen.getByText("Staff: Coach Lee, Sam")).toBeInTheDocument();
        expect(screen.getByText("8 min · run by Sam")).toBeInTheDocument();
        expect(screen.getByText("10 min · Hard · run by Coach Lee, Sam")).toBeInTheDocument();
        expect(screen.getByText("10 min")).toBeInTheDocument();
    });

    it("shows no staff line for a plan without staff", () => {
        const rotation = STARTER_TEMPLATES.find((template) => template.id === "template-goalie-skater-rotation");
        if (!rotation) throw new Error("Goalie & Skater Rotation is missing");
        render(
            <ThemeProvider theme={createTheme()}>
                <PlanPreview plan={starterTemplatePlan(rotation, "openleague-static", NOW)} />
            </ThemeProvider>,
        );
        expect(screen.queryByText(/^Staff:/)).toBeNull();
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test __tests__/components/features/practice-planner/export __tests__/components/features/practice-planner/PlanPreview.test.tsx`
Expected: FAIL (type-check of the fixtures aside, the model has no staff and nothing prints names).

- [ ] **Step 3: Carry names in the model (`bench-sheet-model.ts`)**

Add `import { runBySuffix, runByText, staffHeaderLabel, staffNames } from "@/lib/utils/session-staff";`.

Add to each of the three `BenchSheetTimelineRow` members:

```ts
          /** "run by Coach Lee, Sam" for a lone drill or a block; absent when nobody runs it (a station's names are in its line) */
          runBy?: string;
```

Add to `BenchSheetModel`, after `gap`:

```ts
    /** "Staff: Coach Lee, Sam, Alex", or null when the practice lists none */
    staff: string | null;
```

In `buildBenchSheetModel`, after `const team = …`, add:

```ts
    // Names from the practice's list by key (spec R9, R11); a row only says runBy when someone runs it.
    const names = (row: ExportSessionRow) => staffNames(row.staff, session.staff);
    const runBy = (row: ExportSessionRow): { runBy?: string } => {
        const text = runByText(names(row));
        return text ? { runBy: text } : {};
    };
```

In the returned object add `staff: staffHeaderLabel(session.staff),` after `gap: …`, and in `timeline`:
- the block row: append `...runBy(head)` after `stations: null`;
- the rotation row's `stations`: `stations.map((sp) => `${sp.play.name}${staysSuffix(sp.stays)}${runBySuffix(names(sp))}`)`;
- the plain row: `stations: block ? stations.map((sp) => `${sp.play.name} · ${sp.duration} min${runBySuffix(names(sp))}`) : null,` and append `...(block ? {} : runBy(stations[0])),`.

- [ ] **Step 4: Print the names in the HTML and Word exports**

In `bench-sheet-html.ts`:
- add to `STYLES` after `.gap { … }`: `.staff { font-weight: 700; }` and `.run-by { color: #37474F; }`;
- in `header`, after the place line: `${model.staff ? html`<p class="staff">${model.staff}</p>` : null}`;
- in `timeline`, replace the non-station branch with:

```ts
                    : html`${row.label}${row.kind === "block" && row.note ? html` · ${row.note}` : null}${row.runBy ? html`<span class="run-by"> · ${row.runBy}</span>` : null}`
```

In `bench-sheet-docx.ts`:
- in `header`, after the place paragraph: `...(model.staff ? [new Paragraph({ children: textRuns(model.staff, { bold: true }) })] : []),`;
- in `timeline`, replace the non-station cell's paragraph with:

```ts
                            : [new Paragraph({ children: textRuns([row.label, row.kind === "block" ? row.note : null, row.runBy].filter(Boolean).join(" · ")) })],
```

(`textRuns` passes every string through `xmlSafe`.)

- [ ] **Step 5: Show staff in the import preview (`PlanPreview.tsx`)**

Add `import { runBySuffix, staffHeaderLabel } from "@/lib/utils/session-staff";`. After `const mounted = useMounted();`, add:

```tsx
    const staffLine = staffHeaderLabel(session.staff.map((name) => ({ name })));
```

Change the subtitle's `sx={{ mb: 2 }}` to `sx={{ mb: staffLine ? 0.5 : 2 }}` and add after it:

```tsx
            {staffLine && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {staffLine}
                </Typography>
            )}
```

In the block row's secondary text, append `${runBySuffix(head.staff)}`:

```tsx
                                            {`${head.instructions ? `${head.duration} min · ${head.instructions}` : `${head.duration} min`}${runBySuffix(head.staff)}`}
```

and in each drill's secondary text:

```tsx
                                                        {`${play.instructions ? `${timing} · ${play.instructions}` : timing}${runBySuffix(play.staff)}`}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bun run test __tests__/components/features/practice-planner __tests__/apps/planner`
Expected: PASS.

Run: `bun run type-check`
Expected: exit 0.

- [ ] **Step 7: Screenshots and both exports**

With the static planner built and served as in Task 7 Step 8, write `<scratchpad>/pwcheck/staff-task10.mjs`:

```js
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const BASE = "http://localhost:4199/";
const ctx0 = await browser.newContext();
const setup = await ctx0.newPage();
await setup.goto(BASE + "#/import");
await setup.getByRole("button", { name: "Use template: Skills Stations" }).click();
await setup.getByRole("button", { name: /save to my practices/i }).click();
await setup.waitForURL(/#\/sessions\/[^/]+$/, { timeout: 20000 });
const session = setup.url();
await setup.goto(session + "/edit");
const add = setup.getByRole("button", { name: "Add staff" });
await add.waitFor({ timeout: 20000 });
for (const name of ["Coach <Lee>", "Sam & Co"]) {
  await add.click();
  await setup.getByRole("menuitem", { name: "Type a name" }).click();
  await setup.getByRole("textbox", { name: "Name" }).last().fill(name);
}
await setup.getByRole("combobox", { name: /^Run by for / }).first().click();
await setup.getByRole("option", { name: "Coach <Lee>", exact: true }).click();
await setup.getByRole("option", { name: "Sam & Co", exact: true }).click();
await setup.keyboard.press("Escape");
await setup.getByRole("button", { name: /^save session/i }).click();
await setup.waitForTimeout(2000);
await setup.goto(session);
await setup.getByRole("table", { name: "Session timeline" }).waitFor({ timeout: 20000 });
for (const [item, file] of [["Download plan file", "staff-plan.olplan.json"], ["Download bench sheet (HTML)", "staff-bench.html"], ["Download Word document (.docx)", "staff-bench.docx"]]) {
  await setup.getByRole("button", { name: "Export plan" }).click();
  const [download] = await Promise.all([setup.waitForEvent("download"), setup.getByRole("menuitem", { name: item }).click()]);
  await download.saveAs(file);
}
await ctx0.close();
for (const scheme of ["light", "dark"]) {
  for (const [w, h, tag] of [[1280, 1000, "desktop"], [390, 844, "mobile"]]) {
    const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.log("pageerror", e.message));
    await page.goto(BASE + "#/import");
    await page.locator('[data-testid="plan-file-input"]').setInputFiles("staff-plan.olplan.json");
    await page.getByText(/^Staff: /).waitFor({ timeout: 20000 });
    console.log(scheme, tag, "preview:", await page.getByText(/^Staff: /).textContent(), "| rows with names:", await page.getByText(/run by/).count());
    console.log(scheme, tag, "horizontal overflow px:", await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth));
    await page.screenshot({ path: `staff-task10-preview-${tag}-${scheme}.png`, fullPage: true });
    await page.goto(pathToFileURL("staff-bench.html").href);
    await page.screenshot({ path: `staff-task10-html-${tag}-${scheme}.png`, fullPage: true });
    await ctx.close();
  }
}
await browser.close();
```

Run: `cd <scratchpad>/pwcheck && CHROMIUM_PATH=<the local Chromium headless shell> node staff-task10.mjs && unzip -p staff-bench.docx word/document.xml | grep -o 'Staff: [^<]*' && grep -c 'run by' staff-bench.html`
Expected output: no `pageerror`; "preview: Staff: Coach <Lee>, Sam & Co | rows with names: 1" (or more); overflow 0; the Word document's XML holds `Staff: Coach &lt;Lee&gt;, Sam &amp; Co`; the HTML file has at least one "run by".

Read every `staff-task10-*.png`. Check: the preview lists the staff under its subtitle and the names after the first row; the HTML export shows the staff line in its header and the names in the row, with `<Lee>` shown as text, not markup. Open `staff-bench.docx` in a Word-compatible viewer (Quick Look is enough) and check the header line and the row. Fix and re-run until they do. Stop the preview server.

- [ ] **Step 8: Commit**

```bash
/usr/bin/git add components/features/practice-planner/export/bench-sheet-model.ts components/features/practice-planner/export/bench-sheet-html.ts \
  components/features/practice-planner/export/bench-sheet-docx.ts components/features/practice-planner/PlanPreview.tsx \
  __tests__/components/features/practice-planner/export/bench-sheet-model.test.ts __tests__/components/features/practice-planner/export/bench-sheet-html.test.ts \
  __tests__/components/features/practice-planner/export/bench-sheet-docx.test.ts __tests__/components/features/practice-planner/PlanPreview.test.tsx
/usr/bin/git commit -m "feat(practice-planner): staff in the bench sheet exports and the import preview" -m "Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 11: Gates

Every repository gate, in CI order. Fix forward in the task that owns a failure; never skip a gate or weaken a test.

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
- `next build` catches route and RSC-boundary errors that type-check misses (the edit and new pages now load the picker).
- `planner:check` confirms the static bundle still carries the plan format, loads `docx` only lazily, and has no Next.js runtime, telemetry or analytics. The new shared modules (`lib/utils/session-staff.ts`, `SessionStaffSection`, `RunByField`, `useSessionStaff`, `PlayLibraryDialog`) must keep it that way.

- [ ] **Step 4: Check portability, palette tokens and privacy**

```bash
rg -n 'from "next/|@/lib/actions|@prisma/client|@/lib/services' lib/utils/session-staff.ts \
  components/features/practice-planner/{SessionStaffSection,RunByField,PlayLibraryDialog}.tsx components/features/practice-planner/useSessionStaff.ts
rg -n '#[0-9A-Fa-f]{3,6}\b' components/features/practice-planner/{SessionStaffSection,RunByField,PlayLibraryDialog}.tsx
rg -n 'email' lib/actions/practice-session-queries.ts lib/services/practice-session-staff.ts components/features/practice-planner/{SessionStaffSection,RunByField}.tsx
```

Expected: no output from any of the three (no server or Next import in a portable module, no hard-coded colour in an on-screen component, and no email anywhere in the picker's read or the staff UI).

- [ ] **Step 5: Run the ADR and SQL policy checks**

```bash
bun run adr:lint
bun run adr:check-integrity
bun run check:raw-sql
bun run adr:check prisma/schema.prisma prisma/migrations/20261005120000_practice_session_staff/migration.sql \
  lib/plan-document/document.ts lib/actions/practice-sessions.ts apps/planner/src/store/sessions.ts \
  components/features/practice-planner/PracticeSessionEditor.tsx lib/email/templates.ts
```

Expected:
- the first three exit 0;
- `adr:check` lists ADR-0002 (Server Actions), ADR-0003 (Prisma only: the migration is the sanctioned place for SQL), ADR-0004 (MUI) and ADR-0020 (amended in Task 2) as governing, with no violation.

- [ ] **Step 6: Check the line budgets and the working tree**

```bash
wc -l components/features/practice-planner/PracticeSessionEditor.tsx "app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx"
/usr/bin/git status --short
```

Expected:
- both files are ≤ 900 lines (the editor about 795 after Task 8, the session page about 740);
- `git status` shows nothing. If `CLAUDE.md` appears modified by `next dev`, leave it out of every commit.

- [ ] **Step 7: Final screenshots for the PR**

With the static planner served as in Task 7 Step 8, re-run `staff-task7.mjs`, `staff-task8.mjs`, `staff-task9.mjs` and `staff-task10.mjs` against the final build and read every PNG once more: the editor's Staff section and Run by, the session page, the bench sheet print view and the import preview, light and dark, desktop and mobile (spec "Visual"). Stop the preview server.

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
| R1 per-practice list, assignments per row | 1 (types), 3 (tables), 7, 8 (editor) |
| R2 tables, CHECKs (name 1–60, position ≥ 0, one link), unique `(sessionId, lower(name))` expression index, FKs and cascades, limits 12 / 4 / 60 as exported constants | 1 (constants), 3 (schema, migration, migration test) |
| R3 save shape (`staff` with keys, each row's keys), keys mapped to ids, absent = unchanged across the row rewrite with a defined and verified row identity, `[]` clears, a row without `staff` gets none, server checks after authorization, no new stale rule | 1 (`carryRowStaff`, `sessionStaffError`), 2 (schemas), 3 (actions, carry, refusals), 6 (static, by row id), 7 (editor and wrappers send the list) |
| R4 hosted picker of active/invited officials and admins, by name and role, no email, official-and-admin once; names only in files, exports and the static store; typed names never linked | 4 (`getPracticeStaffOptions`, stale links unlinked), 6 (static refuses links), 7 (picker UI, wrappers) |
| R5 copy paths: duplicate (links kept), detach, materialize, import; links dropped on export; guard from the copied select | 2 (export names), 3 (materialize identity), 4 (duplicate, import, detach test, guard), 6 (static duplicate and import) |
| R6 plan document fields, limits, case-insensitive membership, older files, "Drill N" issue, ADR-0020 amendment | 2 |
| R7 static records, legacy reads, absent = unchanged, same limits and messages, IndexedDB version 3 with a no-op upgrade and the versionchange reload | 6 |
| R8 Staff section (44px rows, editable typed names, read-only officials with a badge, Add staff with picker and Type a name, remove with the counted confirm), Run by (Autocomplete chips, max 4), palette tokens, 44px, portable, editor ≤ 900 (extraction first) | 7, 8 |
| R9 timeline " · run by", sidebar "Run by" line, bench sheet staff line and names per row (live, HTML escaped, Word `xmlSafe`), import preview | 9 (session page, live bench sheet), 10 (exports, preview) |
| R10 per-recipient "Your stations" in schedule order with bench-sheet titles and `buildSchedule` starts, venue zone else the fallback, own send per recipient with lines, recipients and preferences unchanged, escaped | 1 (`yourStations`, `yourStationsText`), 5 |
| R11 names read from the list by key everywhere; staff kept in `useSessionStaff` | 1 (`staffNames`), 7 (hook), 9, 10 |
| Success criteria 1–7 | 7 (1), 8 (2), 9/10 (3), 2 (4), 5 (5), 6/7 (6), 3/4/6 and the untouched-editor tests (7) |
| Testing: pure; Zod and plan document; migration; actions (auth first, cross-team, absent across rewrite, `[]`, older editor, duplicate/detach/import, guard); emails; static (both repos); components (Staff section, Run by max 4, untouched editor, picker without emails); bench sheet model/HTML/Word; visual | 1; 2; 3; 3/4; 5; 6; 7/8; 9/10; 7–11 |

**Spec gaps and conflicts, and how this plan resolves them:**
- **R3 row identity** (the spec asks the plan to define and verify it): a drill row by its owned play id (verified in `materializeSessionDrills`, `sessionPlayData` and the editor's `applySavedPlayIds`; the same accepted invariant as `withStoredTiming`), a block row by its place among the stored block rows, carried only to a block of the same kind. Accepted loss: an editor built before this change that reorders, inserts or deletes block rows can drop a block's staff (never hand it to another kind of block). Every current editor sends `staff`, so the identity never applies to it. New row ids are read back by `sequence`. Static rows keep their ids, so the static store carries by row id.
- **Staff ids:** keys that are stored ids keep them; new keys get new ids on every save, and the save returns no key → id mapping (the editor's keys stay self-consistent until it reloads). Accepted: nothing reads a staff id across saves.
- **Linked names:** the server stores the name sent (the picker offers the team name, cut to 60). A later rename of the official doesn't change a saved practice.
- **Stale links:** R4 allows only active or invited officials and current admins. The edit loader unlinks a stale one (Task 4), so an open editor's autosave isn't refused forever; a save that still sends it gets the specific message.
- **Admins without a name** are not offered (there's nothing to show but an email, which is never shown); a coach can type the name.
- **Email time zone:** the venue's zone when booked, else `FALLBACK_TIME_ZONE` (`America/New_York`), the zone `lib/email/templates.ts` already falls back to. `Team` has no zone, and the emails' existing Date line (formatted without a zone) is unchanged.
- **Email sends:** each recipient with a line gets their own send first (a failure is logged and the others continue), then everyone else gets the shared send (it throws on failure, as today). When every recipient has a line there is no shared send.
- **Row keys without a list:** a save without `staff` ignores its rows' `staff` keys (absent = unchanged), but both stores still check their shape (at most 4, key length), as hosted's row schema does.
- **"Names per row" on the bench sheet** means the timeline rows (a station's names in its line); the per-drill pages are unchanged.
- **Run by on "every row card"** appears once the practice has at least one named person; with no staff there is nothing to pick.
- **Hosted picker visuals** aren't reachable from the static build: the picker is covered by component tests (Task 7); every other view is screenshotted.

**Placeholder scan:** none. Every code step carries the code; steps that edit large existing files name the block and show the new lines. The only `<…>` text is the gate-fix commit template in Task 11 and the screenshot commands' `<scratchpad>` / `<the local Chromium headless shell>`, which stand for this machine's paths and are kept out of the repository on purpose.

**Type consistency:**
- `SessionStaffMember`, `StaffOption`, `MAX_SESSION_STAFF`, `MAX_ROW_STAFF`, `STAFF_NAME_MAX` (Task 1) are used with the same shapes in Tasks 2–10.
- `staff?: string[]` (keys) on editor items, view rows, row inputs and export rows; `staff?: SessionStaffMember[]` on `PracticeSessionData`, `PracticeSessionView` and `ExportSession`; `staff: string[]` (names) only in the plan document and its editor session.
- `SessionStaffInput { key, name, teamOfficialId?, userId? }` (Task 1) is what `toSessionStaffInputs` produces, what `sessionStaffInputSchema` (Task 2) parses into `SessionStaffSaveInput`, and what `LocalSessionSave.staff` (Task 6) carries.
- `writeRowStaff(tx, sessionId, Array<{ sequence, staffIds }>)` and `replaceSessionStaff` (Task 3) are reused by duplicate and import (Task 4); `carryRowStaff`'s `StoredRowStaff` is what `readCarriedRowStaff` returns.
- `useSessionStaff`'s `staff`, `setRowStaff` (Task 7) feed `SessionDrillList`'s `staff`, `onSetRowStaff` (Task 8); `RowRunBy` is the cards' `runBy` prop.
- `BenchSheetModel.staff` and the rows' optional `runBy` (Task 10) are read by both exporters in the same task.

**Review Focus coverage:** item 1 → Tasks 3, 6 and 7; item 2 → Tasks 3 and 4; item 3 → Tasks 1, 2, 3, 6 and 7; item 4 → Tasks 1 and 7 (and 8, the chips); item 5 → Tasks 1 and 7.

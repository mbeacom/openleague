# Tasks: USA Hockey Readiness — Jersey Numbers, Association IDs & CSV Roster Export

**Input**: Design documents from `/specs/001-usah-jersey-roster-export/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓, quickstart.md ✓

**Organization**: Tasks grouped by user story — each story is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no shared dependencies)
- **[Story]**: User story this task belongs to (US1, US2, US3)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: DB schema and Prisma migration — must be complete before any user story work begins.

- [x] T001 Add `jerseyNumber Int?` and `usahMemberId String? @db.VarChar(20)` to `Player` model in `prisma/schema.prisma`
- [x] T002 Add `usahMemberId String? @db.VarChar(20)` to `TeamMember` model in `prisma/schema.prisma`
- [x] T003 Run `bun run db:migrate` (name: `add_jersey_number_usah_member_id`) and `bun run db:generate` to apply migration and regenerate Prisma client
- [x] T004 Add `jerseyNumber: number | null` and `usahMemberId: string | null` fields to the base `Player` type in `types/roster.ts`
- [x] T005 Add new `TeamMemberWithUser` type (id, role, usahMemberId, user.name, user.email) to `types/roster.ts`

**Checkpoint**: Schema migrated, Prisma client generated, TypeScript types updated. Run `bun run type-check` — must pass.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Validation schemas and updated Server Actions that all user stories depend on.

- [x] T006 Extend `addPlayerSchema` in `lib/utils/validation.ts` to accept optional `jerseyNumber` (int, 1–99, nullable) and `usahMemberId` (alphanumeric string ≤20 chars, trims whitespace, nullable)
- [x] T007 Export new `UpdateTeamMemberUsahIdInput` type and `updateTeamMemberUsahIdSchema` (teamMemberId cuid, teamId cuid, usahMemberId nullable string ≤20 alphanumeric) in `lib/utils/validation.ts`
- [x] T008 Update `addPlayer` Server Action in `lib/actions/roster.ts` to pass `jerseyNumber` and `usahMemberId` to `prisma.player.create()`, and after create query the team for a duplicate jersey number (same teamId, same number, different playerId) — include `warning?: string` in the success response when a duplicate is found
- [x] T009 Update `updatePlayer` Server Action in `lib/actions/roster.ts` to pass `jerseyNumber` and `usahMemberId` to `prisma.player.update()`, and perform the same duplicate jersey check (excluding the current player's id) — include `warning?: string` in the success response when a duplicate is found
- [x] T010 Add new `updateTeamMemberUsahId` Server Action to `lib/actions/roster.ts`: validate with `updateTeamMemberUsahIdSchema`, call `requireTeamAdmin(teamId)`, verify TeamMember belongs to the team, update via `prisma.teamMember.update()`, call `revalidatePath('/roster')`, return `{ success: true, data: { id, usahMemberId } }`

**Checkpoint**: All validation schemas and server actions compile. Run `bun run type-check` — must pass before starting US phases.

---

## Phase 3: User Story 1 — Jersey Numbers on Players (Priority: P1) 🎯 MVP

**Goal**: Team admins can assign jersey numbers (1–99) to players; numbers display throughout the roster UI.

**Independent Test**: Add a player with jersey number 17 → roster list shows "#17 — [name]". Edit the player, change to 22 → display updates. Enter 0 → error shown. Assign same number to two players → success with warning toast.

### Implementation for User Story 1

- [x] T011 [P] [US1] Update the `AddPlayerDialog` form state and `useEffect` reset in `components/features/roster/AddPlayerDialog.tsx` to include `jerseyNumber` (number | null) — initialize from `player.jerseyNumber` when editing, blank when adding
- [x] T012 [P] [US1] Add a jersey number `TextField` (type="number", inputProps min=1 max=99 step=1) to the form in `components/features/roster/AddPlayerDialog.tsx`, with client-side validation displaying an error if the value is out of range
- [x] T013 [US1] Wire the `warning` field from the `addPlayer` / `updatePlayer` Server Action response in `components/features/roster/AddPlayerDialog.tsx` — show the warning message via `showError` or a distinct `showWarning` toast after a successful save that includes a duplicate warning
- [x] T014 [US1] Display the jersey number as a `#NN` chip or badge next to the player name in `components/features/roster/PlayerCard.tsx` — render only when `jerseyNumber` is non-null
- [x] T015 [US1] Update the roster page data fetch (in `app/(dashboard)/roster/page.tsx` or wherever `prisma.player.findMany` is called) to include `jerseyNumber` in the non-admin `select` projection so it reaches `PlayerCard`

**Checkpoint**: Jersey numbers are visible on the roster. Add player with #7 → shows "#7". Edit to clear → badge disappears. Duplicate # → success with warning toast.

---

## Phase 4: User Story 2 — USA Hockey Member IDs (Priority: P2)

**Goal**: Team admins can record USA Hockey Member IDs for players and team officials; IDs are admin-only.

**Independent Test**: Open player edit dialog as admin → USAH ID field present → enter "A12345" → saved. Re-open → shows "A12345". View same roster as non-admin → USAH ID not visible anywhere. Edit a team official (admin user) from the team management view → USAH ID field present → save works.

### Implementation for User Story 2

- [x] T016 [P] [US2] Add a "USA Hockey Member ID" `TextField` (text, max 20, alphanumeric hint) to `components/features/roster/AddPlayerDialog.tsx` — visible only when caller is admin (`isAdmin` prop or derive from context); initialize from `player.usahMemberId` when editing
- [x] T017 [P] [US2] Update the admin roster data fetch in `app/(dashboard)/roster/page.tsx` (or the admin query path) to include `usahMemberId` in the admin-only `select` projection — must not appear in the non-admin projection
- [x] T018 [US2] Display the USAH Member ID in `components/features/roster/PlayerCard.tsx` in the admin-only section (below emergency contact or in a similar admin-only block) — render only when `isAdmin` is true and `usahMemberId` is non-null
- [x] T019 [US2] Add a USA Hockey Member ID edit field for team officials to the appropriate admin team management UI — identify where coaches/managers are currently listed/edited (check `app/(dashboard)/roster/page.tsx` or admin components), add an inline edit or dialog that calls `updateTeamMemberUsahId` Server Action
- [x] T020 [US2] Ensure `updateTeamMemberUsahId` is imported and called correctly in the team official edit UI (T019), with optimistic UI disabled (simple form submit pattern) and `revalidatePath` handling the refresh

**Checkpoint**: Admin can enter USAH IDs for players and officials. Non-admin roster view shows no USAH ID fields or values anywhere in the DOM.

---

## Phase 5: User Story 3 — CSV Roster Export (Priority: P3)

**Goal**: Team admins can download a complete RFC 4180 CSV roster with one click.

**Independent Test**: As admin on the roster page, click "Export Roster (CSV)" → browser downloads a `.csv` file. Open in spreadsheet: columns are Full Name, Role, Jersey Number, USA Hockey Member ID, Email. Team official rows appear first, then players sorted by jersey number. Names with commas are properly quoted. Non-admin user sees no export button.

### Implementation for User Story 3

- [x] T021 [P] [US3] Create CSV utility functions in `lib/utils/csv.ts`: `escapeCsvField(value: string | null | number): string` (quotes fields containing commas/quotes/newlines, escapes embedded double-quotes per RFC 4180), `toCsvRow(fields: (string | null | number)[]): string`, and `toCsvContent(headers: string[], rows: (string | null | number)[][]): string` (prepends UTF-8 BOM `\uFEFF` for Excel compatibility)
- [x] T022 [US3] Create Route Handler at `app/api/roster/export/route.ts` with a `GET` handler: read `teamId` from `request.nextUrl.searchParams`, validate it is a non-empty string; call `requireTeamAdmin(teamId)` — catch any thrown error/redirect and return `new Response('Forbidden', { status: 403 })`; return `new Response('Bad Request', { status: 400 })` if teamId missing; return 404 if team not found
- [x] T023 [US3] In the Route Handler (`app/api/roster/export/route.ts`), query players via `prisma.player.findMany({ where: { teamId }, select: { name, email, jerseyNumber, usahMemberId }, orderBy: [{ jerseyNumber: 'asc' }, { name: 'asc' }] })` — note: Prisma `orderBy` on nullable Int puts NULLs last with `asc` by default in PostgreSQL
- [x] T024 [US3] In the Route Handler, query team officials via `prisma.teamMember.findMany({ where: { teamId, role: 'ADMIN' }, select: { usahMemberId, user: { select: { name, email } } }, orderBy: { user: { name: 'asc' } } })`
- [x] T025 [US3] In the Route Handler, build CSV rows: officials first (Role = "Team Official"), then players (Role = "Player"); use `toCsvContent` from `lib/utils/csv.ts`; return `new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="roster-${teamName}-${date}.csv"` } })`
- [x] T026 [US3] Add an admin-only "Export Roster (CSV)" `Button` (with download icon) to `components/features/roster/RosterList.tsx` — render only when `isAdmin` prop is true; implement as an `<a>` tag with `href="/api/roster/export?teamId={teamId}"` and `download` attribute so the browser triggers a native file download without client-side JS

**Checkpoint**: Download CSV from a roster with 3 players and 1 admin. Open file: correct headers, 4 rows, officials first, players sorted by jersey number, commas in names are quoted, UTF-8 BOM present (Excel opens without encoding prompt).

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validation tests, type safety clean-up, and integration verification.

- [ ] T027 [P] Add Vitest test cases to `__tests__/lib/utils/validation.test.ts` covering: jerseyNumber valid (1, 50, 99), invalid (0, 100, -1, 1.5, "seven"); usahMemberId valid ("ABC123", trimmed whitespace), invalid (21-char string, string with special chars like "#")
- [ ] T028 [P] Add Vitest test cases to `__tests__/lib/actions/roster.test.ts` covering: `addPlayer` with jerseyNumber saved correctly; `addPlayer` with duplicate jersey number returns success + `warning`; `updatePlayer` with `jerseyNumber: null` saves null; `updateTeamMemberUsahId` happy path; `updateTeamMemberUsahId` returns error when TeamMember not on team
- [ ] T029 [P] Create `__tests__/api/roster/export.test.ts` covering: unauthenticated GET → 401 or 403; non-admin GET → 403; missing teamId → 400; empty roster → valid CSV with header row only; player name containing comma → field is double-quoted in output; player name containing double-quote → double-quote is escaped as `""` in output
- [x] T030 [P] Add `__tests__/lib/utils/csv.test.ts` for the `escapeCsvField` and `toCsvContent` utility: plain string passes through, comma triggers quoting, embedded quote is escaped, null/undefined renders as empty string, BOM present in output
- [x] T031 Run `bun run type-check` and resolve any TypeScript errors introduced by the new fields across all modified files
- [x] T032 Run `bun run lint` and fix any ESLint warnings in modified files
- [x] T033 Run `bun run test` and confirm all new and existing tests pass (pre-existing failures in `theme-marketing.test.ts` and `DragDropTeams.test.tsx` are known and acceptable)
- [ ] T034 Manual smoke test per quickstart.md: migrate DB → assign jersey numbers to 3 players → set USAH IDs for 2 players and 1 official → export CSV → verify file in spreadsheet app

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 completion (T001–T005)
- **Phase 3 (US1 — Jersey Numbers)**: Depends on Phase 2 completion
- **Phase 4 (US2 — USAH IDs)**: Depends on Phase 2 completion; can run in parallel with Phase 3
- **Phase 5 (US3 — CSV Export)**: Depends on Phase 2 completion; benefits from US1+US2 being done for full export content, but the route handler itself is independent
- **Phase 6 (Polish)**: Depends on all story phases complete

### User Story Dependencies

- **US1 (Jersey Numbers — P1)**: Independent after Phase 2 ✓
- **US2 (USAH IDs — P2)**: Independent after Phase 2 ✓
- **US3 (CSV Export — P3)**: Independent after Phase 2 ✓ (export works even before US1/US2 UI is built — it reads from DB directly)

### Within Each Story

- Schema/types (Phase 1) before server actions (Phase 2)
- Server actions (Phase 2) before UI components (Phase 3–5)
- UI components before polish/tests (Phase 6)

### Parallel Opportunities

- T001 and T002 (schema edits): same file — sequential
- T004 and T005 (types): same file — sequential
- T006 and T007 (validation schemas): same file — sequential
- T008, T009, T010 (server actions): same file — sequential
- **T011, T012 (AddPlayerDialog state + field)**: same file — sequential within US1
- **T016, T017 (USAH field + data fetch)**: different files — parallel within US2
- **T021 (CSV utility) and T022–T025 (route handler)**: T021 must complete before T025
- **T027, T028, T029, T030 (test files)**: all different files — fully parallel

---

## Parallel Execution Examples

```bash
# Phase 3 (US1) — sequential (same file work)
T011 → T012 → T013 → T014 → T015

# Phase 4 (US2) — T016 and T017 can run in parallel (different files)
T016 (AddPlayerDialog USAH field)  ||  T017 (admin query projection)
T018 (PlayerCard USAH display)         ↓ (depends on T016)
T019 → T020 (team official edit)

# Phase 5 (US3) — T021 runs in parallel with T022-T024
T021 (csv utility)  ||  T022 (route handler skeleton) → T023 (player query) → T024 (official query)
T025 (build + return CSV) — depends on T021 + T022-T024
T026 (export button) — independent of T021-T025

# Phase 6 (Polish) — all test files parallel
T027  ||  T028  ||  T029  ||  T030
T031 → T032 → T033 → T034
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Schema + types
2. Complete Phase 2: Validation + Server Actions
3. Complete Phase 3: Jersey Numbers UI
4. **STOP and VALIDATE**: Jersey numbers display on roster, duplicate warning works
5. Demo-ready for USA Hockey pitch (jersey numbers alone are high-value)

### Incremental Delivery

1. Phase 1 + Phase 2 → Foundation ready (shared infra)
2. Phase 3 → Jersey numbers live (MVP — demo-ready)
3. Phase 4 → USAH IDs stored and visible to admins
4. Phase 5 → One-click CSV export (pitch closer)
5. Phase 6 → Tests pass, type-check clean

### Total Task Count

| Phase | Tasks | Notes |
| --- | --- | --- |
| Phase 1 (Setup) | 5 | Sequential (schema + types) |
| Phase 2 (Foundational) | 5 | Sequential (same file) |
| Phase 3 (US1) | 5 | Mostly sequential (same component) |
| Phase 4 (US2) | 5 | T016+T017 parallel |
| Phase 5 (US3) | 6 | T021 parallel with T022 |
| Phase 6 (Polish) | 8 | T027–T030 fully parallel |
| **Total** | **34** | |

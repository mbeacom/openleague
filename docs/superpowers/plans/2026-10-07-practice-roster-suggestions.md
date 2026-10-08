# Practice Roster and Drill Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, test first. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A coach lists a practice's tentative roster by position (Skater/Goalie for the youngest ages, Forward/Defense/Goalie and custom positions for older ones), and a "Suggested drills" panel ranks library and starter drills that fit the skater and goalie counts, in both planners, with names kept off plan links and opt-in on exported files.

**Spec:** `docs/superpowers/specs/2026-10-07-practice-roster-suggestions-design.md` (rulings R1–R16).

**Architecture:**
- One portable rules module, `lib/utils/practice-roster.ts` (types, limits, normalization, labels, the paste parser, the Zod schema), and one portable ranker, `lib/utils/drill-suggestions.ts`. Both import only `zod`, the age-group module and the drill-tag helpers, so the static app, the server actions and the plan document share them.
- Hosted: two `PracticeSession` columns and a `practice_session_roster_players` table (hand-written migration), with database work in `lib/services/practice-session-roster.ts`.
- Static: `StoredSession.roster`, IndexedDB version 5.
- Plan document: `session.roster`, `PLAN_VERSION` stays 1, names only when the exporter asks.
- UI: `useSessionRoster` (state), `SessionRosterSection` (positions, players, paste, team picker), `DrillSuggestionsPanel` (ranked list, Add). The editor gains one hook call and two mounts.

**Tech Stack:** TypeScript (strict), Next.js 16 App Router, React 19, MUI v7, Prisma 7, Zod v4, Vite, Vitest + Testing Library, fake-indexeddb, Playwright (browser check only), Bun.

## Global Constraints

- `bun` for every script. Never `prisma migrate dev`, `db:migrate`, `db:push` or `db:migrate:reset`: the migration is hand-written, and `bun run db:generate` is the only Prisma command run locally.
- Migration folder: `prisma/migrations/20261007160000_practice_session_roster/`. It only adds: two columns with defaults and one new table.
- Limits (exported from `lib/utils/practice-roster.ts`): `MAX_ROSTER_PLAYERS = 40`, `ROSTER_NAME_MAX = 40`, `ROSTER_NUMBER_MAX_DIGITS = 3`, `MAX_CUSTOM_ROSTER_ROLES = 3`, `CUSTOM_ROSTER_ROLE_MAX = 12`.
- **Absent = unchanged, `null` clears** on hosted `updatePracticeSession` and static `updateSession`. A create without `roster` stores none.
- Fixtures use fictional names only (for example "Alex", "Sam", "Pat", "Jordan", "Riley") and fictional teams (9xx Riverside, Lakeview, …). No real people, teams or rinks.
- Portable components: no `next/*`, `lib/actions/*` or `@prisma/client` import under `components/features/practice-planner/` or `lib/utils/`. Palette tokens only; every control at least 44×44 px.
- `PracticeSessionEditor.tsx` and `SessionDetailView.tsx` stay at or under 900 lines.
- No new runtime dependencies. No raw SQL outside the migration (ADR-0003).
- Copy, exactly:
  - section heading `Roster`; helper `Who you expect at this practice. Names are optional: a number or initials work.`;
  - `Age group` select with `Not set`; `Positions` toggles; `Add position` (custom), field `Position name`;
  - buttons `Add player`, `Paste a list`, `Add from team` (hosted);
  - player fields `Name`, `No.`, `Position`; remove `Remove <label>`;
  - counts `rosterCountsLabel` = `7 skaters · 1 goalie` / `4 forwards · 3 defense · 1 goalie` / `No players yet`;
  - goalie mismatch `Goalies attending is 2; this roster has 1.` with `Use 1`;
  - suggestions heading `Suggested drills`; empty `Add players to see drills that fit.`; none `No drills fit this roster yet.`; button `Add`;
  - export checkbox `Include player names`; helper `Names and numbers go into downloaded files only. Plan links never include them.`.

## Tasks

### Task 1: Roster rules (`lib/utils/practice-roster.ts`)
- [ ] Tests first: `__tests__/lib/utils/practice-roster.test.ts` — default roles by age; `normalizeRosterRoles` (order, Goalie always on, at least one skater position, custom limits and clashes); `remapRosterPlayers` on toggle; counts and labels; `rosterPlayerLabel`; `parseRosterPaste`; `rolesFromTeamPosition`; `practiceRosterSchema` (limits, numbers, names, duplicate `playerId`); `rosterWithoutNames`.
- [ ] Implement; `bun run test` on the file; `bun run type-check`.

### Task 2: Ranker (`lib/utils/drill-suggestions.ts`)
- [ ] Tests first: `__tests__/lib/utils/drill-suggestions.test.ts` — implied skater minimum from markers; each exclusion; each score and reason; tie-breaks; `compare` seam; deterministic for shuffled input; `suggestionCandidates` merges library and starters by name; station count from rows.
- [ ] Implement.

### Task 3: Plan document and ADR
- [ ] Tests first (append to `__tests__/lib/plan-document/*.test.ts`): round trip with and without names; older file; repaired values; strict issues; `serializePlan` drops names unless `includeRosterNames`; a link built by `buildPlanDocument` for a link never holds names.
- [ ] `session.roster` in `document.ts`; `PlanSessionInput.roster`; `serializePlan(input, generator, now, { includeRosterNames })`; `planToEditorSession` carries it; ADR-0020 amendment.

### Task 4: Static store
- [ ] Tests first (`apps/planner` store tests): create/update with and without `roster`, `null` clears, legacy record, a `playerId` refused, duplicate copies, import creates typed players, `getSessionView`/`getSessionForEdit` return it; `DB_VERSION` is 5.
- [ ] `records.ts`, `types.ts`, `sessions.ts`, `idb-repo.ts`.

### Task 5: Shared UI and editor wiring
- [ ] Tests first: `SessionRosterSection` (age changes default positions, toggles remap, add/remove/rename, paste dialog preview and add, team picker hidden without options), `DrillSuggestionsPanel` (reasons, Add on library and on starter), editor payload carries `roster` only once touched or loaded.
- [ ] `useSessionRoster.ts`, `SessionRosterSection.tsx`, `RosterPasteDialog.tsx`, `RosterTeamDialog.tsx`, `DrillSuggestionsPanel.tsx`; mount in `PracticeSessionEditor.tsx`; static `SessionEditorScreen.tsx` passes `roster` to the store.

### Task 6: Views, bench sheet and exports
- [ ] Tests first: bench-sheet model counts line always and names only when included; HTML escapes; Word via `xmlSafe`; Export menu checkbox appears only with names and sets the option for file and sheets, never for the link.
- [ ] `export/bench-sheet-{model,html,docx}.ts`, `export/export-bench-sheet.ts`, `print/BenchSheet.tsx`, `ExportPlanMenu.tsx`, a shared `RosterSummary` for the session pages.

### Task 7: Hosted
- [ ] Tests first: migration matches `schema.prisma`; `createPracticeSession`/`updatePracticeSession` (auth first, absent unchanged, `null` clears, cross-team `playerId` refused); duplicate copies; import creates typed players; `getPracticeRosterOptions` selects safe columns only and is admin-only; detail and edit loaders resolve linked names live.
- [ ] `prisma/schema.prisma`, migration, `lib/utils/validation.ts`, `lib/services/practice-session-roster.ts`, `lib/actions/practice-sessions.ts`, `practice-session-drills.ts`, `practice-plan-import.ts`, `practice-session-queries.ts`, the new/edit wrappers and pages.

### Task 8: Gates and browser check
- [ ] `bun run type-check`, `bun run lint`, `bun run test`, `bun run build`, `bun run planner:build && bun run planner:check`, `bun run check:raw-sql`, `bun run adr:lint`.
- [ ] Playwright on the static build: 7 skaters + 1 goalie for 8U, suggestions update, switch to 12U positions, bench sheet, export with and without names, plan link; 360 px and 1280 px, light and dark. Stop the servers.

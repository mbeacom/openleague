# Tasks: Sport-Aware Season & Game Scheduling via Events

**Input**: Design documents from `/specs/005-season-scheduling/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/server-actions.md, quickstart.md

**Tests**: Unit tests for pure logic (sport catalog, round-robin, standings, conflicts, validation) are included per repo practice; heavy integration tests are not.

**Organization**: Tasks grouped by user story. Note: legacy removal (US6/FR-035) executes in Phase 2 because dropping `GameSchedule`/`ScheduleGame` models and their consumers must land in one migration + one type-checkable commit; the US6 phase then only verifies the removal.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [ ] T001 Create shared types skeleton in `types/seasons.ts` (Season/SeasonPhase/SeasonGame/GameProposal/PlacementDecision view types, generation input/preview types)

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Legacy removal (FR-035 — must precede the migration that drops the tables)

- [ ] T002 [P] Delete `lib/actions/game-schedules.ts` and remove `gameScheduleSchema`/`generateScheduleGamesSchema`/`updateScheduleGameSchema` (and their type exports) from `lib/utils/validation.ts`
- [ ] T003 [P] Delete `components/features/schedules/` (ScheduleBuilder.tsx, ScheduleDetail.tsx, ScheduleList.tsx) and `app/(dashboard)/schedules/` route directory
- [ ] T004 Remove `/schedules` navigation entries and breadcrumbs: `components/features/dashboard/DashboardNav.tsx`, `components/features/navigation/MobileNavigation.tsx`, `components/providers/LeagueProvider.tsx` (getBreadcrumbs) — repoint to `/seasons`; grep for remaining `game-schedules`/`/schedules` imports (including any tests) and delete/update them

### Schema & migration

- [ ] T005 Edit `prisma/schema.prisma` per data-model.md: add enums (ScheduleFormat, SeasonPhaseType, SeasonGameStatus, GameProposalStatus, GameProposalEntryKind), models (Season, SeasonPhase, SeasonGame, GameProposal, GameProposalEntry, PlacementDecision), `Division.ageClassification AgeClassification?`, back-relations on Team/League/Event/Venue/IceSurface/User; REMOVE GameSchedule + ScheduleGame models, `Event.scheduleGame` relation, and ScheduleStatus enum
- [ ] T006 Create migration with `bun run db:migrate` (name: `season_scheduling`), append raw SQL CHECK constraints (seasons owner XOR; season_games home≠away) following the SignupEvent migration pattern, verify drops of `game_schedules`/`schedule_games`, then `bun run db:generate`

### Pure logic & validation (parallel after T005/T006)

- [ ] T007 [P] Implement sport capability catalog in `lib/utils/sport-catalog.ts`: `getSportCapabilities(sport)` returning labels/ageClassifications/surfaceUsageOptions/suggestedFormats; hockey fully populated (IceUsage options, USA Hockey age set, ROUND_ROBIN+ suggestions); neutral default with `surfaceUsageOptions: undefined` (hidden) for unpopulated sports (FR-031/032/033)
- [ ] T008 [P] Implement unified conflict checker in `lib/utils/game-conflicts.ts`: candidate (venueId, surfaceId?, startAt, endAt, excludeGameId?/excludeEventId?) vs calendar Events at venue, SeasonGames, and PUBLISHED VenueScheduleBlocks (venue-wide + same-surface); returns typed conflict descriptions (FR-012)
- [ ] T009 [P] Add Zod schemas to `lib/utils/validation.ts`: season create/update, phase create/update, season game create/update, generation input, proposal create/counter/decide, placement record, score record (rules per data-model.md Validation Rules)
- [ ] T010 [P] Unit tests for sport catalog in `__tests__/lib/utils/sport-catalog.test.ts` (hockey populated; unknown sport → neutral + hidden surface usage; every Sport enum value resolves)
- [ ] T011 [P] Unit tests for validation schemas in `__tests__/lib/utils/season-validation.test.ts` (date-range refinements, home≠away, rounds bounds, surface-usage catalog membership)

**Checkpoint**: Schema live, legacy gone, pure utilities tested — user stories can begin.

---

## Phase 3: User Story 1 — Schedule season games without declaring a format (Priority: P1) 🎯 MVP

**Goal**: Seasons CRUD + manual game scheduling with calendar/RSVP fan-out and recorded conflict overrides; zero format inputs on this path.

**Independent Test**: Create a season (name + dates only), add three games, verify calendar entries + RSVPs for both rosters, conflict warning on an overlapping venue booking, reschedule keeps RSVPs and notifies, cancel marks canceled.

### Implementation for User Story 1

- [ ] T012 [US1] Implement `lib/actions/seasons.ts`: createSeason/updateSeason/archiveSeason/unarchiveSeason/createPhase/updatePhase/deletePhase/getSeasons/getSeasonDetail per contracts (owner XOR authorization: requireLeagueRole LEAGUE_ADMIN or requireTeamAdmin)
- [ ] T013 [US1] Implement Event/RSVP fan-out helper `createGameEventWithRsvps(tx, game)` in `lib/actions/season-games.ts` (or `lib/utils/season-game-event.ts` if shared): one Event (type GAME, home-team anchored, homeTeamId/awayTeamId, leagueId, venue timezone fallback) + RSVPs for deduped union of both rosters — mirroring legacy generator transaction (FR-009)
- [ ] T014 [US1] Implement `lib/actions/season-games.ts`: createSeasonGame (draft or publish, conflict check + overrideConflicts recording), updateSeasonGame (reschedule → update Event, keep RSVPs, notify), cancelSeasonGame (status + Event marking + notify), deleteDraftGame, publishSeasonGames, recordGameScore (FR-040 age gate via divisions + `isStatsEligible`), getSeasonGames, checkGameConflicts (FR-008–014, FR-039 flagging on team departure handled as validation at read time)
- [ ] T015 [US1] Add reschedule/cancel notification emails to `lib/email/templates.ts` (`sendGameRescheduledEmail`, `sendGameCanceledEmail`) wired through existing notification preferences
- [ ] T016 [P] [US1] Build `components/features/seasons/SeasonForm.tsx` (create/edit: name, description, dates — NO format field) and `components/features/seasons/SeasonList.tsx` (cards on mobile, table on desktop; archived hidden toggle)
- [ ] T017 [P] [US1] Build `components/features/seasons/GameForm.tsx`: team pickers (league teams, or administered teams for team-owned seasons), date/time (venue-timezone aware per existing event forms), venue select, surface select (ACTIVE surfaces only — FR-014), sport-conditional surface-usage select via `getSportCapabilities`, zone/location text; inline conflict warnings from `checkGameConflicts` with explicit "Schedule anyway" override
- [ ] T018 [P] [US1] Build `components/features/seasons/GamesTable.tsx` (list/edit/cancel games; status chips; mobile card layout) and `components/features/seasons/SeasonDetail.tsx` (header, phases strip placeholder, games)
- [ ] T019 [US1] Create routes: `app/(dashboard)/seasons/page.tsx` (list, league/team context aware), `app/(dashboard)/seasons/new/page.tsx`, `app/(dashboard)/seasons/[seasonId]/page.tsx` (Server Components fetching via actions; revalidatePath wiring)
- [ ] T020 [US1] Verify nav repoint from T004 renders (sidebar + mobile + breadcrumbs show "Seasons"), and add `revalidatePath` coverage for `/seasons` and `/calendar` in all US1 mutations

**Checkpoint**: MVP — manual season scheduling fully replaces the legacy builder's manual value.

---

## Phase 4: User Story 2 — Opt-in generated round-robin, honestly (Priority: P2)

**Goal**: Draft-based round-robin generation with preview fidelity, review/edit, publish; format labels for non-generated formats; standings.

**Independent Test**: 4 teams × 2 rounds → preview shows 12, generates 12 drafts; edit one, delete one, publish 11; calendars match; select SINGLE_ELIMINATION → recorded as label, no generation claimed; standings ranked by 2/1 points.

### Implementation for User Story 2

- [ ] T021 [P] [US2] Implement `lib/utils/round-robin.ts`: circle-method pairings × rounds, home/away balancing, slot assignment from (dateRange, eligibleDays, startTime, gameDurationMinutes), optional defaultVenueId (FR-015); deterministic output shared by preview and creation
- [ ] T022 [P] [US2] Unit tests `__tests__/lib/utils/round-robin.test.ts`: counts (n(n−1)/2×R for n=2..8, R=1..4), odd team counts (byes), home/away balance, slot exhaustion behavior, determinism
- [ ] T023 [US2] Implement `lib/actions/season-generation.ts`: previewRoundRobin (pure + per-game conflict flags via game-conflicts; no writes) and generateRoundRobin (persists DRAFT games, sets format/formatRounds on target season/phase) (FR-015–018)
- [ ] T024 [US2] Build `components/features/seasons/GenerationWizard.tsx`: opt-in entry ("Generate games…"), format select (ROUND_ROBIN functional; others clearly "label only — games scheduled manually" per FR-006/007), team multi-select defaulting to division members (FR-018), parameters, preview table with conflict flags (FR-016), generate → draft review
- [ ] T025 [US2] Add draft review/publish UI to `SeasonDetail`/`GamesTable` (draft chip, bulk publish via publishSeasonGames, draft delete) (FR-017)
- [ ] T026 [P] [US2] Implement `lib/utils/season-standings.ts` (adapted from `lib/utils/event-standings.ts`: 2/1 points, GD/GF tiebreaks, grouping by phase/division) + unit tests `__tests__/lib/utils/season-standings.test.ts`
- [ ] T027 [US2] Build `components/features/seasons/SeasonStandingsTable.tsx` and wire into season detail, age-gated via FR-040 derivation (no standings below threshold)

**Checkpoint**: Generation is honest and reviewable; standings live.

---

## Phase 5: User Story 3 — Team-to-team game proposals (Priority: P3)

**Goal**: Propose/counter/accept/decline/withdraw threads with expiry, race-safe acceptance, and full game creation on accept.

**Independent Test**: A proposes → B counters → A accepts → game on both calendars with RSVPs; decline and withdraw notify; proposal past latest proposed start shows expired.

### Implementation for User Story 3

- [ ] T028 [US3] Implement `lib/actions/game-proposals.ts` per contracts: createGameProposal, counterProposal, acceptProposal (guarded `updateMany WHERE status='PENDING'` first-decision-wins + expiry check vs latest terms; creates SCHEDULED game via US1 fan-out helper; season/phase resolved from proposed date per FR-021), declineProposal, withdrawProposal, getProposalsForTeam, getProposalsForLeague (lazy EXPIRED marking) (FR-019–024)
- [ ] T029 [P] [US3] Add proposal email templates to `lib/email/templates.ts` (`sendGameProposalEmail`, `sendProposalDecisionEmail`) respecting notification preferences
- [ ] T030 [P] [US3] Build `components/features/seasons/ProposalForm.tsx` (opponent picker from same-league teams, terms, note; venue optional/TBD) and `components/features/seasons/ProposalThread.tsx` (entry history, current terms, accept/counter/decline/withdraw actions, expired state)
- [ ] T031 [US3] Build `components/features/seasons/ProposalInbox.tsx` + route `app/(dashboard)/seasons/proposals/page.tsx` (incoming/outgoing tabs for team admins; league-wide view for league admins per FR-024)

**Checkpoint**: Coach-to-coach scheduling works end to end without league admins.

---

## Phase 6: User Story 4 — Qualifying pre-season & placement (Priority: P4)

**Goal**: Season phases UI, placement board (records where age-eligible, manual rank + private notes below threshold), division assignment with history, division-default team sets.

**Independent Test**: Season with PRE_SEASON + REGULAR_SEASON phases; three pre-season games recorded; placement board assigns 4 teams into 2 divisions; generation wizard defaults to a division's teams; reassignment preserves history.

### Implementation for User Story 4

- [ ] T032 [P] [US4] Build `components/features/seasons/PhaseEditor.tsx` (add/edit/reorder phases with type + dates within season range; optional format label) wired to phase actions from T012 (FR-002)
- [ ] T033 [US4] Implement `lib/actions/placements.ts`: getPlacementBoard (per-team GP/opponents/W-L-T where eligible; unevaluated flag; manual ranks + private notes below threshold per FR-025/026), recordPlacement (PlacementDecision append + Team.divisionId update in one transaction, FR-027/028), createDivisionInline
- [ ] T034 [US4] Build `components/features/seasons/PlacementBoard.tsx` + route `app/(dashboard)/seasons/[seasonId]/placement/page.tsx` (league-admin only; division assignment UI; age-gated display; private notes admin-only)
- [ ] T035 [US4] Add `ageClassification` select (from sport catalog age set) to division create/edit forms in the existing league admin UI (locate via `components/features/` division management + `lib/actions/league.ts` division actions) and to `createDivisionInline` (FR-040 data source)
- [ ] T036 [US4] Wire division-default team selection into GenerationWizard and GameForm pickers post-placement (FR-029, FR-018 integration)

**Checkpoint**: Pre-season → placement → regular season completable in-platform.

---

## Phase 7: User Story 5 — Sport-aware terminology, hockey first-class (Priority: P5)

**Goal**: All scheduling flows resolve labels/options through the sport catalog; hockey rich, others neutral with undefined fields hidden.

### Implementation for User Story 5

- [ ] T037 [US5] Sweep US1–US4 components to source every sport-touchable label/option from `getSportCapabilities` (surface usage select hidden when undefined; age labels; suggested formats ordering in GenerationWizard) — resolve host sport from season owner (league.sport / team.sport) server-side and pass down (FR-031/033/034)
- [ ] T038 [P] [US5] Component test `__tests__/components/features/seasons/sport-awareness.test.tsx`: hockey league renders ice-usage options + USA Hockey age names; OTHER-sport league renders no hockey vocabulary and no surface-usage field (SC-007)

**Checkpoint**: Sport field is no longer decorative.

---

## Phase 8: User Story 6 — Legacy removal verification (Priority: P6)

**Goal**: Confirm the Phase 2 removal left no residue.

### Implementation for User Story 6

- [ ] T039 [US6] Repo-wide verification: grep for `GameSchedule`, `ScheduleGame`, `roundRobin`, `game-schedules`, `/schedules` — remaining hits only in specs/history; confirm `app/(dashboard)/schedules` 404s and nav/breadcrumbs contain no schedules entries; delete any orphaned legacy tests

**Checkpoint**: Single scheduling experience.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [ ] T040 [P] Unit tests for `lib/utils/game-conflicts.ts` in `__tests__/lib/utils/game-conflicts.test.ts` (venue-wide vs surface-specific overlap, published-only blocks, exclusions)
- [ ] T041 [P] Component tests for SeasonForm/GameForm happy paths in `__tests__/components/features/seasons/`
- [ ] T042 Update `CLAUDE.md` project-structure section: replace `schedules/` entries with `seasons/` (components, app routes, `lib/actions/game-schedules.ts` → new action modules)
- [ ] T043 Full verification: `bun run type-check && bun run lint && bun run test` then `bun run build` (route additions/removals — Next route collisions are only caught by build)

---

## Dependencies & Execution Order

- **Phase 1 → Phase 2**: T001 anytime; T002–T004 (legacy code removal) MUST precede T006 (migration) or type-check breaks against dropped models; T005 → T006 → T007–T011.
- **Phase 3 (US1)**: blocked by Phase 2. T012/T013 → T014 → T015; T016–T018 [P] after T009; T019–T020 last.
- **Phase 4 (US2)**: blocked by Phase 2; integrates with US1's SeasonDetail/GamesTable (T024–T025 after T018). T021/T022/T026 [P] immediately after Phase 2.
- **Phase 5 (US3)**: blocked by T013/T014 (fan-out helper). T029/T030 [P].
- **Phase 6 (US4)**: T032 after T012; T033–T036 after US1; T036 touches US2's wizard (after T024).
- **Phase 7 (US5)**: after US1–US4 components exist (sweep task).
- **Phase 8–9**: last.

## Parallel Example: after Phase 2 completes

```text
Track A (US1 backend): T012 → T013 → T014 → T015
Track B (US1 UI):      T016 | T017 | T018 (parallel)
Track C (US2 pure):    T021 | T022 | T026 (parallel)
```

## Implementation Strategy

MVP = Phases 1–3 (US1). Incremental delivery per story with the checkpoint tests; each story leaves `type-check`/`lint`/`test` green. Commit per phase or logical group on branch `005-season-scheduling`.

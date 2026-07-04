# Research: Sport-Aware Season & Game Scheduling

**Feature**: 005-season-scheduling | **Date**: 2026-07-04

All unknowns were resolved by a verified six-agent audit of the codebase (2026-07-04, main @ 8345095) plus product-owner decisions. No open NEEDS CLARIFICATION items remain.

## R1. What the legacy feature actually does (and why it's replaced, not fixed)

**Decision**: Delete `GameSchedule`/`ScheduleGame` and rebuild on season/game models.

**Rationale** (audit findings):

- `GameSchedule.roundRobin` is stored ([schema.prisma:1312]) but never read — `generateRoundRobinGames` runs unconditionally ([lib/actions/game-schedules.ts:106]); unchecking the UI box shows a 0-game preview ([ScheduleBuilder.tsx:107-109]) while the server generates `n(n−1)/2 × rounds` games anyway.
- Schedules are create-only: only `createGameSchedule`, `publishSchedule`, `archiveSchedule`, `deleteSchedule` exist; the per-game edit schemas in validation.ts are orphaned (no consumers).
- Venue conflicts are detected during generation and then discarded (comment "Still create the game but note the conflict"; conflicts never returned to the caller).
- Generated games auto-create one calendar `Event` per game (home-team anchored, `homeTeamId`/`awayTeamId` set) with RSVPs for the union of both rosters inside a per-game transaction ([game-schedules.ts:246-268]) — this fan-out pattern is sound and is retained.
- The feature has no spec in `specs/`; product owner confirmed pre-launch (no production schedule data), so deletion needs no migration.

**Alternatives considered**: (a) Patch `roundRobin` handling + add update actions — rejected: leaves no season/phase concept, no proposals, no placement, and format still conflated with generation. (b) Migrate data — rejected by product owner: no data exists to migrate.

## R2. Where game machinery should live: signup-event models vs. new models

**Decision**: New `SeasonGame` model referencing real `Team` records, patterned on `EventGame`, with a 1:1 nullable link to calendar `Event`.

**Rationale**: Signup-event `EventGame` references `EventTeam` (ad-hoc teams formed from event registrants), not league `Team` rows, and hangs off a `SignupEvent`. Reusing those tables would force a polymorphic home/away reference and entangle signup-event lifecycle (visibility tiers, registration phases) with league scheduling. Copying the *pattern* (status enum, surface + usage + zoneLabel, age-gated scores, `@@index([surfaceId, startAt])`) onto a Team-referencing model keeps both features clean. The calendar `Event` model already supports inter-team games (`homeTeamId`, `awayTeamId`, dual-roster RSVPs) and is the system of record for calendars/RSVPs — `SeasonGame.eventId @unique` mirrors the legacy `ScheduleGame.eventId` linkage users already rely on.

**Alternatives considered**: (a) Extend `EventGame` with polymorphic team refs — rejected (XOR creep, mixed lifecycles). (b) Games as bare calendar Events with extra fields — rejected (no draft state, no phase/standings home, scores don't belong on Event).

## R3. Sport capability catalog shape

**Decision**: Typed TS module (`lib/utils/sport-catalog.ts`) keyed by the existing Prisma `Sport` enum; entries define terminology labels, age-classification options, surface-usage options, and suggested formats; a neutral default is used for sports without entries, and fields with no defined options (e.g., surface usage) are hidden.

**Rationale**: `Sport` already exists on `Team.sport` and `League.sport` (`@default(HOCKEY)`, required at creation) but is display-only today. A code catalog is type-safe, testable, requires no admin UI or seeding, and matches the near-term goal (hockey first-class, graceful degradation). `IceUsage` (FULL/HALF/CROSS) and USA Hockey `AgeClassification` + `isStatsEligible` gating already exist and become the hockey entry's content.

**Alternatives considered**: (a) Database-driven catalog — rejected for now (admin surface, seeding, and caching complexity with zero near-term benefit; can be lifted to DB later without changing call sites). (b) Per-league overrides — out of scope.

## R4. Proposal thread modeling

**Decision**: `GameProposal` (status + parties + resulting game) with append-only `GameProposalEntry` rows (PROPOSE/COUNTER/ACCEPT/DECLINE/WITHDRAW, each carrying terms).

**Rationale**: The spec requires a visible negotiation history (FR-020) and expiry pegged to the *latest* proposed start (FR-022); an entry log gives both for free and makes the accept race (edge case) a single guarded status transition. Notifications reuse the existing notification-preferences machinery.

**Alternatives considered**: Mutable single-row proposal with `counterCount` — rejected: loses history, complicates expiry semantics.

## R5. Age-level derivation for score/standings gating

**Decision**: Add nullable `ageClassification AgeClassification?` to `Division`; a game's level = the more restrictive (younger) of the two teams' division classifications; unset → score-eligible. Reuse `isStatsEligible` ([lib/utils/age-level.ts]) and the mite-safe messaging pattern from event-teams.

**Rationale**: `Division.ageGroup` is free text today ("U8, U10, Adult, etc.") and cannot drive gating; the platform's existing gating enum (`AgeClassification`) is already ranked and env-configurable (`STATS_MIN_AGE_LEVEL`). Division is the right anchor because placement (FR-025–029) is division-centric; teams inherit via `Team.divisionId`.

**Alternatives considered**: (a) Season-level classification — rejected: real leagues mix age levels in one season. (b) Team-level field — rejected: duplicates division data and drifts.

## R6. Conflict detection unification (scope for this feature)

**Decision**: New `lib/utils/game-conflicts.ts` checking a candidate (venueId, optional surfaceId, startAt–endAt) against: calendar Events at the venue (existing `findVenueConflicts` semantics), other SeasonGames, and PUBLISHED `VenueScheduleBlock`s (venue-wide or same-surface). Warnings, not hard blocks; saving with conflicts requires an explicit recorded override.

**Rationale**: The audit found three conflict systems that cannot see each other (blocks↔blocks surface-aware; team events venue-level only; signup-event games checked against nothing). This feature unifies the *game-scheduling* side at venue/whole-surface granularity; sub-surface segment math is spec 006's keystone and is explicitly deferred.

**Alternatives considered**: Full occupancy ledger across all subsystems now — rejected: belongs with segmentation (006) where concurrent half-ice math changes the model.

## R7. Round-robin generation mechanics

**Decision**: Pure function in `lib/utils/round-robin.ts`: inputs (teamIds, rounds, dateRange, eligibleDays/times, gameDuration, optional defaultVenueId) → ordered proposed games; the same output backs the preview and the draft-creation action; drafts have no calendar presence until publish.

**Rationale**: FR-016 (preview fidelity) is guaranteed by construction when preview and creation share one deterministic function. The legacy `generateTimeSlots` logic is a starting point but moves out of the action layer for unit testing. Circle-method pairing gives balanced home/away alternation across rounds.

**Alternatives considered**: Constraint-solver scheduling (venue capacity, rest days) — out of scope; the review/edit step (FR-017) is the pressure valve.

## R8. Latent bugs adjacent to this feature (fixed in passing)

- Surface pickers must filter `isActive` (audit: `getEventTeamsBoard` passes all venue surfaces) — new pickers filter; signup-events picker fix included since the shared pattern is touched. *(FR-014)*
- `SignupEventSurfaces` dead M2M and GameScheduler default mismatch are signup-events concerns — noted for a follow-up, not this feature's scope.

## R9. Navigation & information architecture

**Decision**: `/seasons` replaces `/schedules` in `DashboardNav`, mobile navigation, and breadcrumbs (`LeagueProvider.getBreadcrumbs`). Proposals surface as a tab/inbox under seasons plus notification links.

**Rationale**: Matches existing nav patterns (audit: sidebar + mobile More menu + breadcrumb map); "Seasons" is the honest name for the container users manage.

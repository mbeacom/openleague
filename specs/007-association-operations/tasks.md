---

description: "Dependency-ordered implementation backlog for association operations"
---

# Tasks: Association Operations

**Input**: Design documents from `specs/007-association-operations/`  
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Test tasks are required because the specification defines concurrency, privacy, deduplication, migration, and portability outcomes that cannot be accepted through manual inspection alone.

**Organization**: Tasks are grouped by user story. User Story 1 is the MVP and critical-path gate for venue-based scheduling.

**Implementation Base**: Begin from `main` after merged gear PRs #331-#335. Existing `GearReservation`, inventory, needs, custody, wishlist/pledge, ledger, notification outbox, routes, and tests are prerequisites to integrate—not tasks to recreate.

## Phase 1: Setup and Governance

**Purpose**: Record architectural constraints and prepare additive implementation surfaces.

- [x] T001 Review and ratify the canonical venue-reservation draft ADR in `docs/adr/0007-use-canonical-venue-reservations-for-occupancy.md`
- [x] T002 [P] Review and ratify the free/provider-portable core association draft ADR in `docs/adr/0008-keep-core-association-operations-free-and-provider-portable.md`
- [x] T003 [P] After T001 and T002, add venue-reservation, profile, responsibility, volunteer, content, gear-integration, and utilization validation schemas to `lib/utils/validation.ts`
- [x] T004 [P] After T001 and T002, add explicit venue-reservation and association-operation view types that cannot collide with `types/gear.ts` to `types/association-operations.ts`

---

## Phase 2: Foundational Reservation Infrastructure

**Purpose**: Establish additive data and transaction primitives required by every venue-based story.

**CRITICAL**: No code or schema work begins until T001 and T002 are accepted, and no venue-based user-story work begins until the reservation transaction and dual-read compatibility layer are complete.

- [x] T005 Add `VenueReservation`, transition, override, status/usage enums, schedule-block intent, request approval fields, and nullable activity links to `prisma/schema.prisma`
- [x] T006 Create the additive canonical-reservation migration with ownership, interval, ancestry, and lifecycle checks in `prisma/migrations/<timestamp>_add_canonical_venue_reservations/migration.sql`
- [x] T007 Regenerate the Prisma client after the reservation schema migration with `bun run db:generate`
- [x] T008 [P] Add serializable venue-reservation retry tests plus gear/non-gear outbox namespace-isolation tests in `__tests__/lib/services/venue-reservation-transaction.test.ts` and `__tests__/lib/services/notification-outbox-worker.test.ts`
- [x] T009 [P] Add venue-reservation interval, surface, segment, coexistence, offering, public-redaction, and venue-wide-claim conflicts against every surface/segment tests in `__tests__/lib/services/venue-reservation-availability.test.ts`
- [x] T010 Implement bounded serializable retry and friendly contention errors in `lib/services/venue-reservation-transaction.ts`
- [x] T011 Implement transaction-client venue-reservation conflict detection and offering/occupancy separation in `lib/services/venue-reservation-availability.ts`
- [x] T012 Implement venue-reservation lifecycle, assignment, override, ancestry, audit, minimal request/practice notification registry, and registry-filtered association outbox worker while preserving gear-worker ownership in `lib/services/venue-reservations.ts`, `lib/services/association-operations-notification-registry.ts`, `lib/services/association-operations-outbox-worker.ts`, and `lib/services/notification-outbox-lease.ts`
- [x] T013 Add canonical schedule identity and reservation deduplication helpers to `lib/data/schedule-items.ts`
- [x] T014 Add idempotent venue-reservation backfill scaffolding and dry-run reporting to `scripts/backfill-venue-reservations.ts`
- [x] T015 Add idempotent backfill, linked-alias deduplication, preserved-overlap, reconciliation, and dual-read rollback tests to `__tests__/scripts/backfill-venue-reservations.test.ts` and `scripts/verify-venue-reservation-cutover.ts`
- [x] T016 Add dual-read reservation plus unlinked-legacy behavior to `lib/utils/availability.ts`

**Checkpoint**: Reservation writes are atomic; requestable offerings do not occupy inventory; legacy commitments remain visible.

---

## Phase 3: User Story 1 - Secure and Allocate Ice (Priority: P1) MVP

**Goal**: Deliver offer → request → venue approval → confirmed reservation → practice assignment → Event/RSVP → one canonical schedule item.

**Independent Test**: Approve part of a requestable block, assign the reservation to a planned practice, and verify one reservation, one linked practice/Event pair, participant RSVPs, deduplicated schedules, and rejection of conflicting concurrent approval.

### Tests

- [x] T017 [P] [US1] Add full, partial, declined, canceled, idempotent approval, durable notification-ID, and registry-validation contract tests to `__tests__/lib/actions/venue-requests.test.ts`
- [x] T018 [P] [US1] Add simultaneous overlapping approval and documented-scale p95 performance tests to `__tests__/integration/venue-reservation-concurrency.test.ts` and `__tests__/performance/venue-reservation-availability.test.ts`
- [x] T019 [P] [US1] Add venue-reservation assignment and lifecycle action tests to `__tests__/lib/actions/venue-reservations.test.ts`
- [x] T020 [P] [US1] Add practice reservation, Event/RSVP linkage, and override tests to `__tests__/lib/actions/practice-sessions.test.ts`
- [x] T021 [P] [US1] Add canonical schedule deduplication tests to `__tests__/lib/data/schedule-items.test.ts`
- [x] T022 [P] [US1] Add venue request decision-control component tests to `__tests__/components/features/venue-admin/IceTimeRequestQueue.test.tsx`

### Implementation

- [x] T023 [US1] Make `decideIceTimeRequest` atomically create one confirmed full or partial venue reservation and enqueue typed notification intent in `lib/actions/venue-requests.ts`
- [x] T024 [US1] Propagate accepted-request cancellation and expiration into reservation lifecycle in `lib/actions/venue-requests.ts`
- [x] T025 [US1] Add assign, unassign, release, cancel, complete, unused, reschedule, and availability Server Actions to `lib/actions/venue-reservations.ts`
- [x] T026 [US1] Add venue manager approve/partial/decline/cancel/expire/annotate controls and approved-space display to `components/features/venue-admin/IceTimeRequestQueue.tsx`
- [x] T027 [US1] Add remaining-slice and offering-versus-occupancy display to `components/features/venue-admin/AvailableIceBrowser.tsx`
- [x] T028 [US1] Revalidate venue request, venue schedule, association operations, and affected team paths from `lib/actions/venue-requests.ts`
- [x] T029 [US1] Add association ice-reservation inventory and filters to `components/features/association-operations/VenueReservationInventory.tsx`
- [x] T030 [US1] Add venue-reservation-to-practice assignment workflow to `components/features/association-operations/VenueReservationAssignmentDialog.tsx`
- [x] T031 [US1] Create Venue Reservations inventory route and server data loading in `app/(dashboard)/league/[leagueId]/venue-reservations/page.tsx`
- [x] T032 [US1] Update practice creation/editing to select confirmed venue-reservation inventory, atomically link/create its Event/RSVPs, and enqueue typed notification intent in `lib/actions/practice-sessions.ts`
- [x] T033 [US1] Update practice editor reservation selection, venue-local time, and reasoned override UI in `components/features/practice-planner/PracticeSessionEditor.tsx`
- [x] T034 [US1] Make signed-in calendar and venue schedule readers deduplicate linked practice/Event aliases via `lib/data/calendar.ts` and `lib/data/schedule-items.ts`

**Checkpoint**: User Story 1 is deployable as the first useful association MVP.

---

## Phase 4: User Story 2 - Run a Complete Association Season (Priority: P1)

**Goal**: Make placement, generation, manual games, proposals, practices, calendars, and exports consume the canonical reservation inventory.

**Independent Test**: Configure pre-season and regular-season phases, place teams, generate games from confirmed ice, introduce a publication-time conflict, resolve it, publish, and verify one commitment across schedules/RSVPs/ICS.

### Tests

- [X] T035 [P] [US2] Add season-specific placement and historical-preservation tests to `__tests__/lib/actions/placements.test.ts`
- [X] T036 [P] [US2] Add reservation-driven generation and publication-time recheck tests to `__tests__/lib/actions/season-generation.test.ts`
- [X] T037 [P] [US2] Add shared SeasonGame/Event reservation and RSVP fan-out tests to `__tests__/lib/actions/season-games.test.ts`
- [X] T038 [P] [US2] Add reservation-backed proposal acceptance tests to `__tests__/lib/actions/game-proposals.test.ts`
- [X] T039 [P] [US2] Add EventGame/parent-signup publication tests and a complete writer-by-conflicting-source matrix to `__tests__/lib/actions/event-teams.test.ts` and `__tests__/integration/reservation-writer-matrix.test.ts`
- [X] T040 [P] [US2] Add venue activity/closure occurrence materialization tests to `__tests__/lib/actions/venue-schedules.test.ts`
- [X] T041 [P] [US2] Add canonical association schedule, privacy, contents, and slug-based ICS contract tests to `__tests__/api/public-association-ics.test.ts`

### Data and Services

- [X] T042 [US2] Add `SeasonTeamPlacement` and schedule visibility to `prisma/schema.prisma`
- [X] T043 [US2] Create season-placement migration and constraints, then regenerate Prisma before dependent actions, in `prisma/migrations/<timestamp>_add_season_team_placements/migration.sql` with `bun run db:generate`
- [X] T044 [US2] Add idempotent placement backfill and snapshots to `scripts/backfill-season-placements.ts`
- [X] T045 [US2] Update placement actions to append history and upsert season-specific placement atomically in `lib/actions/placements.ts`
- [X] T046 [US2] Make standings, generation, and season detail read season-specific placement in `lib/utils/season-standings.ts`, `lib/actions/season-generation.ts`, and `lib/actions/seasons.ts`

### Writer Cutover

- [X] T047 [US2] Route manual game create/update/delete/publish through reservations and share one reservation with the generated Event in `lib/actions/season-games.ts`
- [X] T048 [US2] Generate draft games from confirmed unassigned reservations and recheck every item during bulk publication in `lib/actions/season-generation.ts`
- [X] T049 [US2] Carry and atomically assign reservation inventory during proposal acceptance in `lib/actions/game-proposals.ts`
- [X] T050 [US2] Route team Events, EventGames, signup publication, venue activities/closures, specialty events, and surface archival checks through reservation services in `lib/actions/events.ts`, `lib/actions/event-teams.ts`, `lib/actions/signup-events.ts`, `lib/actions/venue-schedules.ts`, `lib/actions/venue-content.ts`, and `lib/actions/venue-surfaces.ts`
- [X] T051 [US2] Move league/team/venue calendar, report, and ICS readers to `lib/data/schedule-items.ts` in `lib/data/calendar.ts`, `lib/actions/league-context.ts`, `lib/services/league-reporting.ts`, `app/api/leagues/[leagueId]/schedule.ics/route.ts`, and `app/api/associations/[slug]/schedule.ics/route.ts`
- [X] T052 [US2] Implement and privacy-test the tenant-safe operations read model for pending requests, unassigned venue reservations, stale drafts, conflicts, migration overrides, unscheduled teams, urgent gear needs, overdue gear custody, gear outbox health, and upcoming changes in `lib/data/association-operations.ts`, `__tests__/lib/data/association-operations.test.ts`, `app/(dashboard)/league/[leagueId]/operations/page.tsx`, and `components/features/association-operations/OperationalDashboard.tsx`
- [X] T053 [US2] Add Operations and Venue Reservations destinations without regressing merged Gear navigation in `components/features/navigation/DashboardNav.tsx` and `components/features/navigation/MobileNavigation.tsx`

**Checkpoint**: Association pre-season and in-season scheduling no longer requires external ice spreadsheets.

---

## Phase 5: User Story 3 - Delegate Team and Volunteer Operations (Priority: P2)

**Goal**: Add least-privilege scoped responsibilities and season-wide volunteer fulfillment.

**Independent Test**: Invite a new team manager and volunteer coordinator, grant bounded scopes, staff a game need, and verify that neither person can access unrelated association administration or private household data.

### Tests

- [x] T054 [P] [US3] Add least-privilege workflow matrix tests for coach, team manager, scheduler, registrar, treasurer, communications lead, volunteer coordinator, event manager, and equipment manager, including the association/division/team/unsupported gear scope matrix and mandatory `teamId`, to `__tests__/lib/auth/capabilities.test.ts` and `__tests__/lib/utils/permissions-gear.test.ts`
- [x] T055 [P] [US3] Add grant, revoke, ancestry, invitation-acceptance, and equipment-manager scope tests to `__tests__/lib/actions/association-roles.test.ts`
- [x] T056 [P] [US3] Add volunteer capacity/response and per-child guardian authorization/privacy tests to `__tests__/lib/actions/volunteers.test.ts` and `__tests__/lib/actions/rsvp-guardians.test.ts`
- [x] T057 [P] [US3] Add simultaneous final volunteer-slot acceptance tests to `__tests__/integration/volunteer-capacity-concurrency.test.ts`
- [x] T058 [P] [US3] Add workforce role and volunteer board component tests to `__tests__/components/features/workforce/VolunteerBoard.test.tsx`

### Implementation

- [x] T059 [US3] Add `AssociationRoleGrant` with `EQUIPMENT_MANAGER`, `VolunteerNeed`, `VolunteerAssignment`, related enums, and invitation payload fields without altering existing gear entities in `prisma/schema.prisma`
- [x] T060 [US3] Create scoped-role and volunteer migration constraints, then regenerate Prisma before capability/actions work, in `prisma/migrations/<timestamp>_add_association_roles_and_volunteers/migration.sql` with `bun run db:generate`
- [x] T061 [US3] Implement capability mapping, scoped ancestry, legacy-admin compatibility, and equipment-manager delegation through existing gear `Permission` checks in `lib/auth/capabilities.ts` and `lib/utils/permissions.ts`
- [x] T062 [US3] Implement grant/revoke/list/invite actions and acceptance application in `lib/actions/association-roles.ts` and `lib/actions/invitations.ts`
- [x] T063 [US3] Backfill association-admin grants from league admins without inferring permissions from officials in `scripts/backfill-association-role-grants.ts`
- [x] T064 [US3] Implement volunteer need/assignment/fulfillment actions and harden per-child guardian response privacy in `lib/actions/volunteers.ts`, `lib/actions/rsvp.ts`, and `lib/actions/guardians.ts`
- [x] T065 [US3] Add role grant manager with equipment-manager guidance and volunteer board components to `components/features/workforce/RoleGrantManager.tsx` and `components/features/workforce/VolunteerBoard.tsx`
- [x] T066 [US3] Add workforce management route and feed volunteer shortages plus safe gear-attention summaries into the operations dashboard in `app/(dashboard)/league/[leagueId]/workforce/page.tsx` and `app/(dashboard)/league/[leagueId]/operations/page.tsx`
- [x] T067 [US3] Mount existing permission-management surfaces within the scoped workforce route via `components/features/admin/UserPermissionManager.tsx` and `components/features/admin/TeamPermissionManager.tsx`

**Checkpoint**: Season work can be distributed without broad administrator grants.

---

## Phase 6: User Story 4 - Publish an Association Home and Team Directory (Priority: P2)

**Goal**: Publish stable, privacy-safe association and team identity, schedules, events, and news.

**Independent Test**: Publish an association with divisions, teams, one public event, and one news item; navigate to a team page; rename a slug; verify redirects and zero private-field disclosure.

### Tests

- [x] T068 [P] [US4] Add association/team profile validation and slug redirect action tests to `__tests__/lib/actions/association-profile.test.ts`
- [x] T069 [P] [US4] Add content lifecycle and scheduled-publication tests to `__tests__/lib/actions/public-content.test.ts`
- [x] T070 [P] [US4] Add public association/team privacy tests including gear token, donor/custodian PII, location, inventory, and outbox exclusions to `__tests__/app/public-association-privacy.test.tsx` and `__tests__/app/public-team-privacy.test.tsx`
- [x] T071 [P] [US4] Add public association profile/wishlist tests and automated no-more-than-three-activation navigation coverage for every published team, schedule, signup event, announcement, and active wishlist in `__tests__/components/features/association-profile/PublicAssociationProfile.test.tsx` and `__tests__/app/public-association-navigation.test.tsx`

### Implementation

- [x] T072 [US4] Add publishable League/Team profile fields, redirect models, `PublicContentItem`, and enums to `prisma/schema.prisma`
- [x] T073 [US4] Create public profile/content migration and uniqueness constraints, then regenerate Prisma before profile/content actions, in `prisma/migrations/<timestamp>_add_association_public_profiles/migration.sql` with `bun run db:generate`
- [x] T074 [US4] Implement profile update/publish/unpublish/slug actions with dedicated public selectors and a safe published-wishlist link derived through existing gear selectors in `lib/actions/association-profile.ts` and `lib/actions/gear-wishlist.ts`
- [x] T075 [US4] Implement content draft/schedule/publish/archive actions and safe selectors in `lib/actions/public-content.ts`
- [x] T076 [US4] Add association profile and content editors to `components/features/association-profile/AssociationProfileEditor.tsx` and `components/features/association-profile/ContentEditor.tsx`
- [x] T077 [US4] Add public association home with published gear-wishlist navigation and team directory routes in `app/(marketing)/associations/[slug]/page.tsx` and `app/(marketing)/associations/[slug]/teams/page.tsx`
- [x] T078 [US4] Add public team and news routes in `app/(marketing)/associations/[slug]/teams/[teamSlug]/page.tsx` and `app/(marketing)/associations/[slug]/news/[contentSlug]/page.tsx`
- [x] T079 [US4] Add canonical public association schedule in `app/(marketing)/associations/[slug]/schedule/page.tsx`
- [x] T080 [US4] Retain and integrate existing event rollup in `app/(marketing)/associations/[slug]/events/page.tsx`
- [x] T081 [US4] Add public profile/content management routes in `app/(dashboard)/league/[leagueId]/settings/public/page.tsx` and `app/(dashboard)/league/[leagueId]/content/page.tsx`
- [x] T082 [US4] Add published association/team/content discovery to `app/sitemap.ts`

**Checkpoint**: Families and partners have one public association source without private roster exposure.

---

## Phase 7: User Story 5 - Communicate and Coordinate Work (Priority: P2)

**Goal**: Target association operations accurately and distinguish queued, batched, suppressed, sent, delivered, and failed outcomes.

**Independent Test**: Send an urgent division schedule change, suppress a non-urgent team message through preferences, schedule a public post, and verify truthful delivery/publication state.

### Tests

- [ ] T083 [P] [US5] Add separate gear/association worker ownership, terminal-outcome, preference-suppression, provider-failure, and existing gear at-least-once compatibility tests to `__tests__/lib/services/notification-outbox-worker.test.ts`, `__tests__/lib/services/notification.test.ts`, and `__tests__/lib/services/gear-outbox-worker.test.ts`
- [ ] T084 [P] [US5] Add association/division/team/role/volunteer/equipment targeting, volunteer lifecycle enqueue, and bounded-registry tests to `__tests__/lib/actions/communication-association.test.ts`, `__tests__/lib/actions/volunteers.test.ts`, and `__tests__/lib/services/association-operations-notification-registry.test.ts`
- [ ] T085 [P] [US5] Add scheduled content cron authorization and idempotency tests to `__tests__/api/public-content-publish.test.ts`

### Implementation

- [ ] T086 [US5] Add backward-compatible terminal delivery-outcome metadata to the existing `NotificationOutbox`, create/apply its migration, and regenerate Prisma without changing gear lifecycle statuses in `prisma/schema.prisma` and `prisma/migrations/<timestamp>_add_notification_outbox_outcome/migration.sql`
- [ ] T087 [US5] Keep `lib/services/gear-outbox-worker.ts` authoritative for `gear.*`, implement non-gear claim/retry in `lib/services/association-operations-outbox-worker.ts`, share only lease/retry helpers in `lib/services/notification-outbox-lease.ts`, and persist truthful provider-accepted/batched/suppressed/stale/failed outcomes through `lib/services/notification.ts`
- [ ] T088 [US5] Add scoped operational audiences and volunteer recipients to `components/features/communication/LeagueMessagesView.tsx`
- [ ] T089 [US5] Extend typed association-operations registry entries and enqueue urgent venue-reservation, schedule, and volunteer lifecycle changes in their domain transactions in `lib/services/association-operations-notification-registry.ts`, `lib/services/venue-reservations.ts`, `lib/actions/volunteers.ts`, and `lib/actions/communication.ts`
- [ ] T090 [US5] Add secured scheduled-content publisher in `app/api/cron/public-content/route.ts`

**Checkpoint**: Messages and public posts report what actually happened instead of success-shaped delivery.

---

## Phase 8: User Story 6 - Track Utilization, Compliance, and Portability (Priority: P3)

**Goal**: Reconcile ice usage, review consequential actions, and export complete association-owned operational data without optional providers.

**Independent Test**: Complete, release, cancel, and leave reservations unused; reconcile totals; review audit entries; export the association with payment/media disabled; verify portable completeness and secret exclusion.

### Tests

- [ ] T091 [P] [US6] Add utilization funnel, duration, and scope tests to `__tests__/lib/services/association-utilization.test.ts`
- [ ] T092 [P] [US6] Add transaction-coupled venue-reservation/scheduling/communication/payment/refund/export audit tests plus federated GearActivity/Handoff/Movement and VenueActivity projections to `__tests__/lib/actions/audit-association.test.ts`
- [ ] T093 [P] [US6] Add complete export, gear projection/ledger inclusion, donor/custodian PII redaction, tenant isolation, and secret/token exclusion tests to `__tests__/lib/services/association-export.test.ts`
- [ ] T094 [P] [US6] Add association export route tests plus email/media/storage provider-absence and failure injection, persisted-record integrity, visible degraded outcomes, no-entitlement, no-commission, and self-hosted core workflow tests to `__tests__/api/association-export.test.ts` and `__tests__/integration/core-provider-absence.test.ts`
- [ ] T095 [P] [US6] Add utilization dashboard component tests to `__tests__/components/features/association-operations/UtilizationDashboard.test.tsx`

### Implementation

- [ ] T096 [US6] Implement reservation utilization aggregation and bounded date filters in `lib/services/association-utilization.ts`
- [ ] T097 [US6] Add utilization action, route, and dashboard in `lib/actions/association-utilization.ts`, `app/(dashboard)/league/[leagueId]/utilization/page.tsx`, and `components/features/association-operations/UtilizationDashboard.tsx`
- [ ] T098 [US6] Couple venue-reservation, scheduling, role, volunteer, communication, payment, refund, and export audit writes to domain transactions while preserving gear ledger authority in `lib/services/venue-reservations.ts`, `lib/actions/association-roles.ts`, `lib/actions/volunteers.ts`, `lib/actions/communication.ts`, `lib/actions/event-registrations.ts`, `lib/actions/venue-payments.ts`, `lib/actions/league-payments.ts`, and `app/api/webhooks/stripe/route.ts`
- [ ] T099 [US6] Add league-authorized federated audit route over general, venue, and gear ledger sources using the existing viewer in `app/(dashboard)/league/[leagueId]/audit/page.tsx`
- [ ] T100 [US6] Implement one complete schema-versioned association JSON export using bounded internal cursor pagination and streaming, including safe gear projections and append-only ledger references, in `lib/services/association-export.ts`
- [ ] T101 [US6] Add authenticated file response and success/failure audit in `app/api/leagues/[leagueId]/export/route.ts`
- [ ] T102 [US6] Add association export page and controls in `app/(dashboard)/league/[leagueId]/data-export/page.tsx`

**Checkpoint**: Boards and venue partners can reconcile operations and leave with their data.

---

## Phase 9: Cutover, Documentation, and Quality Gates

**Purpose**: Complete migration, remove ambiguity, and prove the end-to-end operating path.

- [ ] T103 Validate all new migrations and regenerate Prisma with `bun run db:migrate` and `bun run db:generate` before any production-like backfill
- [ ] T104 Run venue-reservation, placement, and role backfills in dry-run mode; verify idempotency and dual-read rollback with `scripts/backfill-venue-reservations.ts`, `scripts/backfill-season-placements.ts`, `scripts/backfill-association-role-grants.ts`, and `scripts/verify-venue-reservation-cutover.ts`
- [ ] T105 Execute approved backfills, preserve explicit legacy-overlap overrides, and resolve every missing-end-time reconciliation item using `scripts/verify-venue-reservation-cutover.ts`
- [ ] T106 [P] Update roadmap, association, rink, season, practice, gear-integration, notification, free-service, and self-hosting guidance in `app/docs/roadmap/page.tsx`, `README.md`, `SETUP.md`, `DEPLOYMENT.md`, `docs/RINK_MANAGEMENT.md`, and `docs/GEAR_NOTIFICATIONS.md`
- [ ] T107 Run architecture and raw-SQL checks with `bun run adr:lint`, `bun run adr:check-integrity`, and `bun run check:raw-sql`
- [ ] T108 Run focused suites including all merged gear regressions with `bun run test __tests__/lib/services __tests__/lib/actions __tests__/lib/utils/permissions-gear.test.ts __tests__/components/features/gear __tests__/integration __tests__/performance __tests__/components/features/association-operations __tests__/components/features/association-profile __tests__/components/features/workforce __tests__/api __tests__/scripts`
- [ ] T109 Run repository quality gates with `bun run type-check`, `bun run lint`, and `bun run test`
- [ ] T110 Execute `specs/007-association-operations/quickstart.md`, including gear integration/outbox reuse, the timed assignment protocol, the 10-person role/operator study, the three-action public navigation assertions, provider failure injection, and the self-hosted provider-absence smoke test; record unresolved gaps in `specs/007-association-operations/tasks.md`

### Deferred Post-Release Cleanup

Removing legacy five-source availability reads is not part of this implementation. It requires a separate reviewed change after two stable releases and a clean cutover verification report, as required by ADR-0007.

---

## Dependencies and Execution Order

### Phase Dependencies

- **Phase 1** starts immediately.
- **Phase 2** depends on accepted T001 and T002 decisions and blocks venue-based story work.
- **User Story 1** depends on Phase 2 and is the MVP.
- **User Story 2** depends on User Story 1 because it expands reservation use to every scheduling writer.
- **User Story 3** depends on serialized completion of T042-T043 and T059-T060; after Prisma regeneration, non-schema work can proceed in parallel with remaining User Story 2 work.
- **User Story 4** depends on serialized completion of T072-T073 after T059-T060; after Prisma regeneration, non-schema work can proceed in parallel with User Stories 2 and 3.
- **User Story 5** depends on scoped recipients from User Story 3 and content lifecycle from User Story 4.
- **User Story 6** depends on canonical reservation data from User Stories 1 and 2; export includes completed P2/P3 domains.
- **Phase 9** follows the desired story scope and is mandatory before declaring the feature complete.

### User Story Dependency Graph

```text
Foundation -> US1 -> US2 -> US6 -> Cutover
                 \-> US3 -\
                  \-> US4 -> US5
```

### Parallel Opportunities

- T001 and T002 can proceed in parallel; T003 and T004 can proceed in parallel after both decisions are accepted.
- T008-T009 can run while schema/migration work proceeds.
- Each story's test tasks marked `[P]` can be authored in parallel.
- After US1, serialize shared schema slices T042-T043 → T059-T060 → T072-T073 → T086; season writer migration, workforce, public profiles, and notification implementation can then use separate files and proceed concurrently.
- US6 utilization tests can begin after reservation lifecycle stabilizes while later association domains are still being built.

## Parallel Example: User Story 1

```text
Task: T017 venue request approval contract tests
Task: T018 reservation concurrency integration tests
Task: T019 reservation action tests
Task: T020 practice reservation/Event linkage tests
Task: T021 canonical schedule deduplication tests
Task: T022 request queue component tests
```

## Parallel Example: User Stories 2-4

```text
Shared schema lane: T042-T043 → T059-T060 → T072-T073 → T086
Developer A after schema gate: season and scheduling cutover
Developer B after schema gate: scoped responsibilities and volunteers
Developer C after schema gate: public profiles, teams, content, and schedules
```

## Implementation Strategy

### MVP First

1. Complete governance and reservation foundation.
2. Complete User Story 1 only.
3. Stop and validate the request-to-practice quickstart plus concurrency guarantees.
4. Deploy behind dual-read compatibility if operational validation is clean.

### Incremental Delivery

1. **P1a**: accepted ice becomes an assignable practice reservation.
2. **P1b**: every scheduling writer and calendar uses reservations; seasons are complete.
3. **P2a**: officials and volunteers operate with scoped access.
4. **P2b**: associations and teams publish trusted public pages and communications.
5. **P3**: utilization, audit access, export, and final canonical cutover.

## Format Validation

All implementation items use the required checkbox, sequential task ID, optional `[P]`, required story label within story phases, actionable description, and explicit file path or command.

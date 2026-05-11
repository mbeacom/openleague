# Tasks: Ice Rink Management

**Input**: Design documents from `/specs/002-ice-rink-management/`  
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Test tasks are included because the plan and quickstart require validation schemas, Server Actions, schedule helpers, and component workflows to be covered by existing Vitest/Testing Library patterns.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4, US5, US6)
- All tasks include exact file paths

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare schema, validation, and shared folders for venue organization management.

- [X] T001 Create feature folder structure in `components/features/venue-admin/`
- [X] T002 [P] Create shared venue management type exports in `types/venue-management.ts`
- [X] T003 [P] Create deterministic schedule helper module shell in `lib/utils/venue-schedule.ts`
- [X] T004 [P] Create Server Action file shells in `lib/actions/venue-organizations.ts`, `lib/actions/venue-schedules.ts`, `lib/actions/venue-requests.ts`, `lib/actions/venue-content.ts`, and `lib/actions/venue-relationships.ts`
- [X] T005 [P] Create dashboard route group shell in `app/(dashboard)/venue-admin/page.tsx`
- [X] T006 [P] Create public rink route shell in `app/(marketing)/rinks/page.tsx`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core data model, authorization, validation, and migration work that must be complete before any user story can be safely implemented.

**CRITICAL**: No user story work can begin until this phase is complete.

- [X] T007 Extend Prisma enums and models for venue organizations, staff, profile status, ice surfaces, operating hours, schedule blocks, requests, lesson offerings, content posts, relationships, skill levels, and activity logs in `prisma/schema.prisma`
- [X] T008 Create and review the generated migration for rink management schema changes in `prisma/migrations/`
- [X] T009 Regenerate Prisma Client after schema changes in `node_modules/.prisma/client/`
- [X] T010 Add venue role and permission helpers in `lib/auth/session.ts`
- [X] T011 Add venue organization/profile/staff validation schemas in `lib/utils/validation.ts`
- [X] T012 Add schedule/surface/operating-hour validation schemas in `lib/utils/validation.ts`
- [X] T013 Add request/content/relationship/skill-level validation schemas in `lib/utils/validation.ts`
- [X] T014 [P] Add validation tests for venue organization/profile/staff schemas in `__tests__/lib/utils/validation-venue-management.test.ts`
- [X] T015 [P] Add validation tests for schedule/surface/request/content/relationship schemas in `__tests__/lib/utils/validation-venue-schedule.test.ts`
- [X] T016 [P] Add schedule helper tests for recurrence windows, overlapping blocks, midnight spans, and closure conflicts in `__tests__/lib/utils/venue-schedule.test.ts`
- [X] T017 Implement recurrence expansion and conflict detection helpers in `lib/utils/venue-schedule.ts`
- [X] T018 Add shared public-safe venue select helpers in `lib/actions/venue-organizations.ts`
- [X] T019 Add venue activity logging helper in `lib/actions/venue-organizations.ts`

**Checkpoint**: Foundation ready - user story implementation can now begin in priority order or in parallel where capacity allows.

---

## Phase 3: User Story 1 - Rink owner creates branded venue profile (Priority: P1) MVP

**Goal**: A rink owner can create a venue organization, complete a branded venue profile, upload or set a logo reference, choose brand colors, save drafts, publish complete profiles, and expose a public-safe rink page.

**Independent Test**: Create a new rink organization, complete required venue profile fields, upload/set a logo reference, select brand colors, publish the profile, and confirm the public-facing profile displays the same public information without private manager data.

### Tests for User Story 1

- [X] T020 [P] [US1] Add Server Action tests for create/update/publish venue profile flows in `__tests__/lib/actions/venue-organizations.test.ts`
- [X] T021 [P] [US1] Add public profile data-boundary tests in `__tests__/lib/actions/venue-organizations-public.test.ts`
- [X] T022 [P] [US1] Add onboarding/profile component tests in `__tests__/components/features/venue-admin/VenueProfileEditor.test.tsx`

### Implementation for User Story 1

- [X] T023 [US1] Implement createVenueOrganization, updateVenueProfile, publishVenueProfile, logo reference handling, and profile-publication validation in `lib/actions/venue-organizations.ts`
- [X] T024 [US1] Implement venue staff owner bootstrap and owner/manager authorization checks in `lib/actions/venue-organizations.ts`
- [X] T025 [US1] Extend existing venue create/edit compatibility for organization-owned profiles in `lib/actions/venues.ts`
- [X] T026 [P] [US1] Create venue organization onboarding form in `components/features/venue-admin/VenueOrganizationOnboarding.tsx`
- [X] T027 [P] [US1] Create branded venue profile editor in `components/features/venue-admin/VenueProfileEditor.tsx`
- [X] T028 [P] [US1] Create logo and brand color editor in `components/features/venue-admin/VenueBrandingEditor.tsx`
- [X] T029 [US1] Create venue admin onboarding route in `app/(dashboard)/venue-admin/new/page.tsx`
- [X] T030 [US1] Create venue profile management route in `app/(dashboard)/venue-admin/[organizationId]/venues/[venueId]/profile/page.tsx`
- [X] T031 [US1] Create public rink listing query and page in `app/(marketing)/rinks/page.tsx`
- [X] T032 [US1] Create public rink profile query and page in `app/(marketing)/rinks/[slug]/page.tsx`
- [X] T033 [US1] Add public-safe rink profile card and detail components in `components/features/venue-admin/PublicRinkProfile.tsx`
- [X] T034 [US1] Update dashboard navigation to expose venue admin entry points in `components/features/dashboard/DashboardNav.tsx`

**Checkpoint**: US1 should be fully functional and testable independently as the MVP.

---

## Phase 4: User Story 2 - Rink manager defines operating schedules and recurring programs (Priority: P1)

**Goal**: A rink manager can define surfaces, operating hours, closures, and recurring or one-time schedule blocks with pricing, capacity, audience, visibility, and conflict messaging.

**Independent Test**: Create weekly operating hours, add recurring event/program blocks with prices and capacities, publish them, and confirm the generated schedule is visible to the intended audience while conflicts are prevented or clearly flagged.

### Tests for User Story 2

- [X] T035 [P] [US2] Add Server Action tests for ice surface CRUD and operating hours in `__tests__/lib/actions/venue-schedules-surfaces.test.ts`
- [X] T036 [P] [US2] Add Server Action tests for schedule block draft/publish/conflict flows in `__tests__/lib/actions/venue-schedules.test.ts`
- [X] T037 [P] [US2] Add schedule management component tests in `__tests__/components/features/venue-admin/VenueScheduleManager.test.tsx`

### Implementation for User Story 2

- [X] T038 [US2] Implement create/update/archive ice surface actions in `lib/actions/venue-schedules.ts`
- [X] T039 [US2] Implement set/update/delete operating hours actions in `lib/actions/venue-schedules.ts`
- [X] T040 [US2] Implement create/update/publish/cancel schedule block actions with conflict checks in `lib/actions/venue-schedules.ts`
- [X] T041 [US2] Implement public schedule query with visibility filtering in `lib/actions/venue-schedules.ts`
- [X] T042 [P] [US2] Create surface manager component in `components/features/venue-admin/IceSurfaceManager.tsx`
- [X] T043 [P] [US2] Create operating hours editor component in `components/features/venue-admin/OperatingHoursEditor.tsx`
- [X] T044 [P] [US2] Create schedule block editor component in `components/features/venue-admin/ScheduleBlockEditor.tsx`
- [X] T045 [P] [US2] Create venue schedule calendar/list component in `components/features/venue-admin/VenueScheduleCalendar.tsx`
- [X] T046 [US2] Create surfaces admin route in `app/(dashboard)/venue-admin/[organizationId]/venues/[venueId]/surfaces/page.tsx`
- [X] T047 [US2] Create schedule admin route in `app/(dashboard)/venue-admin/[organizationId]/venues/[venueId]/schedule/page.tsx`
- [X] T048 [US2] Create public rink schedule route in `app/(marketing)/rinks/[slug]/schedule/page.tsx`
- [X] T049 [US2] Add schedule teaser sections to public rink profile in `components/features/venue-admin/PublicRinkProfile.tsx`

**Checkpoint**: US2 should work independently for profile-owned schedule publishing after US1/foundation.

---

## Phase 5: User Story 3 - Teams, coaches, and organizations request available ice time (Priority: P2)

**Goal**: Teams, coaches, and organizations can browse published available ice time, submit requests, and rink managers can review, accept, decline, cancel, or expire requests.

**Independent Test**: Publish available ice time, browse it as a team admin or coach, submit a request, and confirm the rink manager can view and respond to the request while both sides see status changes.

### Tests for User Story 3

- [X] T050 [P] [US3] Add request lifecycle Server Action tests in `__tests__/lib/actions/venue-requests.test.ts`
- [X] T051 [P] [US3] Add requester authorization and double-booking tests in `__tests__/lib/actions/venue-requests-auth.test.ts`
- [X] T052 [P] [US3] Add available ice request component tests in `__tests__/components/features/venue-admin/IceTimeRequestForm.test.tsx`

### Implementation for User Story 3

- [X] T053 [US3] Implement submitIceTimeRequest and requester team/league authorization in `lib/actions/venue-requests.ts`
- [X] T054 [US3] Implement decideIceTimeRequest, cancelIceTimeRequest, and expireIceTimeRequest in `lib/actions/venue-requests.ts`
- [X] T055 [US3] Implement request notifications using existing email/template patterns in `lib/actions/venue-requests.ts`
- [X] T056 [US3] Implement manager request inbox query with private requester details in `lib/actions/venue-requests.ts`
- [X] T057 [P] [US3] Create public available ice browser component in `components/features/venue-admin/AvailableIceBrowser.tsx`
- [X] T058 [P] [US3] Create ice-time request form component in `components/features/venue-admin/IceTimeRequestForm.tsx`
- [X] T059 [P] [US3] Create manager request queue component in `components/features/venue-admin/IceTimeRequestQueue.tsx`
- [X] T060 [US3] Add request form integration to public rink schedule in `app/(marketing)/rinks/[slug]/schedule/page.tsx`
- [X] T061 [US3] Create venue requests admin route in `app/(dashboard)/venue-admin/[organizationId]/venues/[venueId]/requests/page.tsx`

**Checkpoint**: US3 should allow a complete request/decision loop without direct payments.

---

## Phase 6: User Story 4 - Rink publishes lessons, events, and venue content (Priority: P3)

**Goal**: Authorized rink staff can create lesson offerings, specialty events, announcements, posts, and blog-style content and publish them to the public rink profile.

**Independent Test**: Create a lesson offering, publish a specialty event, add a venue post, and confirm each appears in the correct public and manager views.

### Tests for User Story 4

- [X] T062 [P] [US4] Add lesson offering and specialty event action tests in `__tests__/lib/actions/venue-content-lessons.test.ts`
- [X] T063 [P] [US4] Add venue post lifecycle action tests in `__tests__/lib/actions/venue-content-posts.test.ts`
- [X] T064 [P] [US4] Add content manager component tests in `__tests__/components/features/venue-admin/VenueContentManager.test.tsx`

### Implementation for User Story 4

- [X] T065 [US4] Implement create/update/publish/archive lesson offering actions in `lib/actions/venue-content.ts`
- [X] T066 [US4] Implement specialty event publishing by linking event-like schedule blocks in `lib/actions/venue-content.ts`
- [X] T067 [US4] Implement create/update/publish/schedule/unpublish/archive venue post actions in `lib/actions/venue-content.ts`
- [X] T068 [US4] Implement public content and lesson queries in `lib/actions/venue-content.ts`
- [X] T069 [P] [US4] Create lesson offering editor component in `components/features/venue-admin/LessonOfferingEditor.tsx`
- [X] T070 [P] [US4] Create specialty event editor component in `components/features/venue-admin/SpecialtyEventEditor.tsx`
- [X] T071 [P] [US4] Create venue content manager component in `components/features/venue-admin/VenueContentManager.tsx`
- [X] T072 [P] [US4] Create public lessons/events/posts section component in `components/features/venue-admin/PublicRinkContent.tsx`
- [X] T073 [US4] Create content admin route in `app/(dashboard)/venue-admin/[organizationId]/venues/[venueId]/content/page.tsx`
- [X] T074 [US4] Add lessons, events, and posts to public rink profile in `app/(marketing)/rinks/[slug]/page.tsx`

**Checkpoint**: US4 should publish venue marketing/program content independently of request workflows.

---

## Phase 7: User Story 5 - Rink builds preferred and home venue relationships (Priority: P3)

**Goal**: A rink owner can invite teams, coaches, leagues, or organizations to designate the venue as preferred or home rink, and authorized recipients can accept, reject, remove, or view the relationship.

**Independent Test**: Send a preferred/home venue invitation from a rink to a team, accept it as a team admin, and confirm both rink and team surfaces show the relationship.

### Tests for User Story 5

- [X] T075 [P] [US5] Add venue relationship invitation and response action tests in `__tests__/lib/actions/venue-relationships.test.ts`
- [X] T076 [P] [US5] Add target authority and relationship removal tests in `__tests__/lib/actions/venue-relationships-auth.test.ts`
- [X] T077 [P] [US5] Add relationship manager component tests in `__tests__/components/features/venue-admin/VenueRelationshipManager.test.tsx`

### Implementation for User Story 5

- [X] T078 [US5] Implement inviteVenueRelationship action with team/league/organization target validation in `lib/actions/venue-relationships.ts`
- [X] T079 [US5] Implement respondToVenueRelationship and removeVenueRelationship actions in `lib/actions/venue-relationships.ts`
- [X] T080 [US5] Implement relationship history and public-safe relationship queries in `lib/actions/venue-relationships.ts`
- [X] T081 [US5] Implement relationship invitation notifications using existing email/template patterns in `lib/actions/venue-relationships.ts`
- [X] T082 [P] [US5] Create venue relationship manager component in `components/features/venue-admin/VenueRelationshipManager.tsx`
- [X] T083 [P] [US5] Create relationship invitation response component in `components/features/venue-admin/VenueRelationshipInvitation.tsx`
- [X] T084 [US5] Create relationships admin route in `app/(dashboard)/venue-admin/[organizationId]/venues/[venueId]/relationships/page.tsx`
- [X] T085 [US5] Add team-facing preferred/home rink display to team dashboard in `app/(dashboard)/page.tsx`
- [X] T086 [US5] Add public preferred/home team relationship section to public rink profile in `components/features/venue-admin/PublicRinkProfile.tsx`

**Checkpoint**: US5 should complete invitation, acceptance, removal, and profile display flows.

---

## Phase 8: User Story 6 - Rink tracks skating and hockey levels for programs (Priority: P4)

**Goal**: Rink managers can define or select skating and hockey level labels for lessons, schedule blocks, and events, and visitors can filter programs by those levels.

**Independent Test**: Add level labels to lesson offerings and schedule blocks, then confirm users can filter or read program eligibility by level.

### Tests for User Story 6

- [X] T087 [P] [US6] Add skill-level validation and reference query tests in `__tests__/lib/actions/venue-skill-levels.test.ts`
- [X] T088 [P] [US6] Add level-filtering tests for public schedule and lesson queries in `__tests__/lib/actions/venue-skill-level-filters.test.ts`
- [X] T089 [P] [US6] Add skill-level selector component tests in `__tests__/components/features/venue-admin/SkillLevelSelector.test.tsx`

### Implementation for User Story 6

- [X] T090 [US6] Implement skill level seed/reference helpers in `lib/actions/venue-content.ts`
- [X] T091 [US6] Implement skill-level assignment for lessons and schedule blocks in `lib/actions/venue-content.ts`
- [X] T092 [US6] Extend public schedule and lesson filters for level labels in `lib/actions/venue-schedules.ts`
- [X] T093 [P] [US6] Create skill-level selector component in `components/features/venue-admin/SkillLevelSelector.tsx`
- [X] T094 [P] [US6] Create public level filter component in `components/features/venue-admin/PublicRinkFilters.tsx`
- [X] T095 [US6] Integrate level selectors into lesson and schedule editors in `components/features/venue-admin/LessonOfferingEditor.tsx` and `components/features/venue-admin/ScheduleBlockEditor.tsx`
- [X] T096 [US6] Integrate level filters into public rink schedule page in `app/(marketing)/rinks/[slug]/schedule/page.tsx`

**Checkpoint**: US6 should make level guidance optional, filterable, and non-blocking for publication.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Hardening, compatibility, documentation, and validation across all desired stories.

- [X] T097 [P] Add migration backfill for default ice surfaces on existing venues in `prisma/migrations/`
- [X] T098 [P] Update venue management documentation in `docs/`
- [X] T099 Audit public/private data boundaries across rink pages and actions in `lib/actions/venue-organizations.ts`, `lib/actions/venue-schedules.ts`, `lib/actions/venue-requests.ts`, `lib/actions/venue-content.ts`, and `lib/actions/venue-relationships.ts`
- [X] T100 Validate legacy `/venues` and event venue selection compatibility in `app/(dashboard)/venues/page.tsx`, `components/features/venues/VenueForm.tsx`, and `components/features/events/EventForm.tsx`
- [X] T101 Run focused validation for rink management tests using `__tests__/lib/actions/` and `__tests__/components/features/venue-admin/`
- [X] T102 Run `bun run lint`, `bun run type-check`, and selected stable focused tests before PR validation in `package.json`
- [X] T103 Update quickstart outcomes and known baseline notes after implementation in `specs/002-ice-rink-management/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion - blocks all user stories.
- **US1 (Phase 3)**: Depends on Foundational - MVP.
- **US2 (Phase 4)**: Depends on Foundational and benefits from US1 profile ownership routes; schedule actions can be developed after foundation.
- **US3 (Phase 5)**: Depends on US2 schedule blocks and requestable available-ice blocks.
- **US4 (Phase 6)**: Depends on US1 profile ownership; lesson/event schedule integration benefits from US2.
- **US5 (Phase 7)**: Depends on US1 venue profile and staff permissions.
- **US6 (Phase 8)**: Depends on US2 schedule blocks and US4 lesson offerings.
- **Polish (Phase 9)**: Depends on all desired user stories being complete.

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational - no dependency on other stories.
- **User Story 2 (P1)**: Can start after Foundational; public schedule display is strongest once US1 public profiles exist.
- **User Story 3 (P2)**: Requires US2 schedule blocks.
- **User Story 4 (P3)**: Can start after US1; specialty-event integration uses US2 schedule blocks.
- **User Story 5 (P3)**: Can start after US1.
- **User Story 6 (P4)**: Requires US2 and US4 targets for assignment/filtering.

### Within Each User Story

- Tests should be written before or alongside implementation and must fail before the corresponding implementation is completed when following TDD.
- Validation schemas and Prisma types before Server Actions.
- Server Actions before interactive components.
- Components before route integration.
- Route integration before manual quickstart validation.

### Parallel Opportunities

- Setup shells T002-T006 can run in parallel.
- Foundational validation tests T014-T016 can run in parallel after schema design T007.
- US1 component tasks T026-T028 can run in parallel after action contracts are clear.
- US2 component tasks T042-T045 can run in parallel after schedule action shapes are clear.
- US3 component tasks T057-T059 can run in parallel after request action shapes are clear.
- US4 component tasks T069-T072 can run in parallel after content action shapes are clear.
- US5 component tasks T082-T083 can run in parallel after relationship action shapes are clear.
- US6 component tasks T093-T094 can run in parallel after level query shapes are clear.

---

## Parallel Example: User Story 1

```bash
Task: "Add public profile data-boundary tests in __tests__/lib/actions/venue-organizations-public.test.ts"
Task: "Create venue organization onboarding form in components/features/venue-admin/VenueOrganizationOnboarding.tsx"
Task: "Create branded venue profile editor in components/features/venue-admin/VenueProfileEditor.tsx"
Task: "Create logo and brand color editor in components/features/venue-admin/VenueBrandingEditor.tsx"
```

## Parallel Example: User Story 2

```bash
Task: "Add Server Action tests for ice surface CRUD and operating hours in __tests__/lib/actions/venue-schedules-surfaces.test.ts"
Task: "Create surface manager component in components/features/venue-admin/IceSurfaceManager.tsx"
Task: "Create operating hours editor component in components/features/venue-admin/OperatingHoursEditor.tsx"
Task: "Create schedule block editor component in components/features/venue-admin/ScheduleBlockEditor.tsx"
```

## Parallel Example: User Story 3

```bash
Task: "Add request lifecycle Server Action tests in __tests__/lib/actions/venue-requests.test.ts"
Task: "Create public available ice browser component in components/features/venue-admin/AvailableIceBrowser.tsx"
Task: "Create ice-time request form component in components/features/venue-admin/IceTimeRequestForm.tsx"
Task: "Create manager request queue component in components/features/venue-admin/IceTimeRequestQueue.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 setup.
2. Complete Phase 2 foundation.
3. Complete Phase 3 User Story 1.
4. Validate that a rink owner can create, brand, publish, and publicly view a venue profile.
5. Stop for review/demo before adding scheduling.

### Incremental Delivery

1. Setup + Foundational -> schema, validation, permissions, helpers.
2. US1 -> branded rink profile MVP.
3. US2 -> surfaces, operating hours, schedule blocks, public schedule.
4. US3 -> available ice request lifecycle.
5. US4 -> lessons, events, posts.
6. US5 -> preferred/home rink relationships.
7. US6 -> skill-level labels and filters.
8. Polish -> backfill, docs, compatibility, validation.

### Parallel Team Strategy

With multiple developers:

1. Complete Setup + Foundational together.
2. Start US1 and US2 in parallel after foundation, with route/profile integration coordinated.
3. Start US4 and US5 after US1.
4. Start US3 after US2 requestable blocks exist.
5. Start US6 after lesson and schedule targets exist.

---

## Notes

- Each task is scoped to a concrete file or directory.
- Tasks marked [P] touch separate files and can run in parallel after their phase prerequisites.
- Preserve existing `/venues` and team event scheduling behavior throughout implementation.
- Do not implement direct payment collection in this feature iteration.
- Do not add external USA Hockey or US Figure Skating verification in this feature iteration.

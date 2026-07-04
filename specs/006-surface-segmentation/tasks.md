# Tasks: Venue Surface Segmentation & Spatial Layout

**Input**: Design documents from `/specs/006-surface-segmentation/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/server-actions.md, quickstart.md

**Tests**: Unit tests for pure logic (presets, geometry, availability matrix incl. SC-004/SC-008) per repo practice; component tests for the editors' review flow and pickers.

**Organization**: Tasks grouped by user story. Note: the legacy field removal (FR-014 — dropping `IceUsage`/`surfaceUsage`/`zoneLabel`) executes in Phase 2 because the schema drop breaks every consumer at once; the sweep must land in one type-checkable commit (same rationale as 005's legacy removal).

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [ ] T001 Create shared types in `types/segments.ts` (SegmentView, SegmentGeometry, CoexistencePair, VenueLayoutData, BookingConflict/source union, VenueBookingView for the schedule board)

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Schema & migration

- [ ] T002 Edit `prisma/schema.prisma` per data-model.md: add `SegmentKind`, `SurfaceSegment`, `SegmentCoexistence`; `segmentId` on SeasonGame/EventGame/VenueScheduleBlock; `conflictOverriddenById/At` on EventGame and Event (unified override recording, FR-011); PracticeSession `venueId/surfaceId/segmentId/startAt` + indexes; `Venue.layout Json?`; `IceSurface.wholeLabel`; REMOVE `IceUsage` enum, `SeasonGame.surfaceUsage/zoneLabel`, `EventGame.iceUsage/zoneLabel`; back-relations
- [ ] T003 Author migration via `prisma migrate diff --config prisma/prisma.config.ts` (from git HEAD schema to new), create `prisma/migrations/<ts>_surface_segmentation/migration.sql` (+ CHECK: `segment_coexistences."segmentAId" < "segmentBId"`), apply to dev via `bun run db:push -- --accept-data-loss` + `prisma db execute` for the CHECK, then `bun run db:generate`

### Legacy field sweep (must land with T002 for green type-check)

- [ ] T004 Remove `ICE_USAGES` and `surfaceUsage`/`iceUsage`/`zoneLabel` from `lib/utils/validation.ts` game schemas (season + signup-event), replacing with optional `segmentId` cuid fields; update `lib/utils/sport-catalog.ts` to drop `surfaceUsageOptions` (keep sportLabel/surfaceLabel/ages/formats) and fix its tests
- [ ] T005 Sweep consumers to segment-based display/input stubs (compiling, picker wiring arrives in US3): `lib/actions/season-games.ts`, `lib/actions/event-teams.ts`, `components/features/seasons/GameForm.tsx` + `GamesTable.tsx`, `components/features/signup-events/GameScheduler.tsx` + `PublicEventView.tsx`, `app/(marketing)/rinks/[slug]/schedule/page.tsx`; update 005 tests (`__tests__/components/features/seasons/sport-awareness.test.tsx` → segment-name assertions, `__tests__/lib/utils/season-validation.test.ts` → segmentId field)

### Pure logic (parallel after T003)

- [ ] T006 [P] Implement `lib/utils/segment-presets.ts` per data-model (ICE: HALF_A/B + CROSS_1-4 with standard normalized geometry + coexistence matrix; COURT halves; others none; whole-surface default labels by type) + unit tests `__tests__/lib/utils/segment-presets.test.ts` (matrix correctness: halves coexist; cross zones mutually coexist + opposite half; cross conflicts containing half; idempotent role sets)
- [ ] T007 [P] Implement `lib/utils/segment-geometry.ts` (normalized-rect overlap with rotation-aware AABB or SAT for rotated rects — keep simple: axis-aligned after rotation snap to 0/90; suggestion output = non-overlapping pairs) + unit tests `__tests__/lib/utils/segment-geometry.test.ts` (overlap/touching/contained/rotated cases; suggestion polarity)
- [ ] T008 Implement `lib/utils/availability.ts` per contracts: `findBookingConflicts` (five sources, segment math per data-model semantics, recurrence via `expandRecurrenceWindow`, exclusions) + `getVenueBookings`; absorb and delete `lib/utils/game-conflicts.ts` (port its tests); unit tests `__tests__/lib/utils/availability.test.ts` covering the full SC-004 source×segment matrix, boundary touching, DRAFT/CANCELED exclusion, recurrence expansion, and the SC-008 perf fixture (1,000 bookings, p95 ≤ 500ms)
- [ ] T009 [P] Add Zod schemas to `lib/utils/validation.ts`: segment create/update (geometry bounds), coexistence confirmation pairs, preset apply, whole-label, layout save (surface refs, ≤ 20 labels), practice attachment (startAt required with venue), block segmentId

**Checkpoint**: schema live, engine tested, repo type-checks green.

---

## Phase 3: User Story 1 — Manage surfaces and segmentation schemes (Priority: P1) 🎯 MVP

**Goal**: Editable surface admin (CRUD + hours) and drawn segmentation with confirm-before-save coexistence.

**Independent Test**: Staff creates an ice surface, applies the preset (pre-drawn halves + cross zones), draws a custom zone, reviews suggested relationships, saves; deactivating a segment with future bookings is refused with the list.

- [ ] T010 [US1] Implement `lib/actions/venue-surfaces.ts` per contracts: applySegmentationPreset (role-idempotent upsert + pairs), createSegment (confirmed pairs only), updateSegment (geometry free; coexistence changes need `confirm` with `details.newlyConflicting`), suggestCoexistence, setSegmentActive (FR-007 future-bookings guard via availability engine), setWholeSurfaceLabel, getSurfaceSegmentation; VenueActivityLog entries; VENUE_SCHEDULE_ROLES authorization
- [ ] T011 [US1] Add FR-007 future-bookings guard to `archiveIceSurface` in `lib/actions/venue-schedules.ts` (list affected bookings across all five sources)
- [ ] T012 [P] [US1] Build `components/features/venue-admin/SegmentationEditor.tsx`: SVG surface schematic (normalized coords), preset segments pre-drawn, draw/drag/resize custom zones (pointer events, touch-capable), suggestion review step (list of suggested coexist/conflict pairs with toggles + "geometry proposes, declarations decide" helper text), rename, deactivate with guard errors surfaced
- [ ] T013 [US1] Replace read-only `components/features/venue-admin/IceSurfaceManager.tsx` with `SurfaceManager.tsx`: surface CRUD (existing createIceSurface/updateIceSurface/archiveIceSurface actions), whole-surface label, per-surface + venue-wide operating hours editing (existing setOperatingHours action), embeds SegmentationEditor; update the venue-admin surfaces route `app/(dashboard)/venue-admin/[organizationId]/venues/[venueId]/surfaces/page.tsx`

**Checkpoint**: venues self-serve surfaces + segmentation end to end.

---

## Phase 4: User Story 2 — One availability answer, segment-aware (Priority: P2)

**Goal**: Every flow warns from the unified engine with recorded overrides; venue staff see all demand.

**Independent Test**: North-half block + South-half season game same hour → no warnings; full-ice signup-event game → warned citing both; team event at venue warns and requires override; schedule board lists all five sources.

- [ ] T014 [US2] Rewire `lib/actions/season-games.ts` + `lib/actions/season-generation.ts` from `findGameConflicts` to `findBookingConflicts` (same warn/override contract; segmentId in candidates)
- [ ] T015 [P] [US2] Rewire `lib/actions/venue-schedules.ts` block create/update/publish conflicts to the engine (replacing `getScheduleConflicts`), including block `segmentId` support and recurrence-aware candidate expansion
- [ ] T016 [P] [US2] Rewire `lib/actions/events.ts` (team events + inter-team games) from `findVenueConflicts` to the engine with warn + recorded override (`Event.conflictOverriddenById/At`); keep league-admin override semantics for inter-team games
- [ ] T017 [US2] Add engine warnings + recorded override to signup-event game scheduling in `lib/actions/event-teams.ts` (`EventGame.conflictOverriddenById/At`), and surface the warning/override flow in `components/features/signup-events/GameScheduler.tsx` (mirroring seasons GameForm)
- [ ] T018 [US2] Implement `getVenueBookings` consumers: build `components/features/venue-admin/VenueScheduleBoard.tsx` (by-surface/day board, source-type chips, block CRUD dialogs with segment picker — closing the missing block UI gap) and upgrade `app/(dashboard)/venue-admin/[organizationId]/venues/[venueId]/schedule/page.tsx` (FR-021, SC-006)

**Checkpoint**: no booking source is blind to any other.

---

## Phase 5: User Story 3 — Book segments from every scheduling flow (Priority: P3)

**Goal**: Structured segment pickers everywhere; segment names in every display.

- [ ] T019 [P] [US3] Season `GameForm.tsx`: segment picker (whole-surface default from wholeLabel; active segments of selected surface); `GamesTable.tsx` shows segment names; `[seasonId]/page.tsx` supplies `segmentsBySurface`
- [ ] T020 [P] [US3] Signup-event `GameScheduler.tsx`: segment picker replacing the removed iceUsage/zoneLabel inputs; `PublicEventView.tsx` + `app/(dashboard)/signup-events/[eventId]/page.tsx` display segment names; `lib/actions/event-teams.ts` board data includes segments
- [ ] T021 [US3] Public displays: `app/(marketing)/rinks/[slug]/schedule/page.tsx` shows block/game segment names; verify zero remaining free-text zone inputs repo-wide (SC-003 grep)

**Checkpoint**: partial-surface intent is structured data everywhere.

---

## Phase 6: User Story 4 — Spatial layout editor and public map (Priority: P4)

- [ ] T022 [P] [US4] Implement `lib/actions/venue-layout.ts` (saveVenueLayout/clearVenueLayout, VENUE_PROFILE_ROLES, surface-ref validation, activity log) per contracts
- [ ] T023 [US4] Build `components/features/venue-admin/VenueLayoutEditor.tsx` (SVG canvas: place/drag/resize/rotate active surfaces, landmark labels, visual-overlap warnings, archived-surface flagging) + a shared read-only geometry renderer; add layout route/tab in venue admin
- [ ] T024 [US4] Build `components/features/venues/PublicVenueMap.tsx` and render on the public rink profile (`app/(marketing)/rinks/[slug]/page.tsx`) when a layout exists; list fallback otherwise (FR-017)

---

## Phase 7: User Story 5 — Practice sessions join availability (Priority: P5)

- [ ] T025 [US5] Extend `lib/actions/practice-sessions.ts` (+ queries): venue/surface/segment/startAt attachment with startAt-required-with-venue validation, engine warnings + recorded override on save (practice override recorded via notes/audit — add nullable override fields if trivial), detach support
- [ ] T026 [US5] Practice planner UI: attachment section (venue select → surface → segment, start time) in the session editor (`components/features/practice-planner/PracticeSessionEditor.tsx` or equivalent — locate exact form), conflict warning + "Book anyway" flow

---

## Phase 8: Polish & Cross-Cutting

- [ ] T027 [P] Component tests: SegmentationEditor suggestion review flow, segment picker in GameForm, VenueScheduleBoard source chips (`__tests__/components/features/venue-admin/`, extend seasons tests)
- [ ] T028 Update `CLAUDE.md` structure section (venue-admin components, new lib/utils + actions modules); update memory roadmap
- [ ] T029 Full verification: `bun run type-check && bun run test && bun run build`; feature-file eslint; SC-003 residue grep (`zoneLabel|iceUsage|ICE_USAGES|surfaceUsage` only in specs/migrations)

---

## Dependencies & Execution Order

- Phase 2 is strictly ordered T002 → T003 → (T004+T005 same commit window) → T006/T007/T009 [P] → T008 (needs schema + presets types).
- US1 (T010-T013) blocked by Phase 2; T012 parallel with T010 after contracts fixed.
- US2 (T014-T018) blocked by T008; T014/T015/T016 parallel (different files); T017 after T005's GameScheduler stub; T018 last (needs block segment support from T015).
- US3 (T019-T021) blocked by US1 (segments exist) + relevant US2 rewiring; T019/T020 parallel.
- US4 (T022-T024) independent after Phase 2; T023 after T022.
- US5 (T025-T026) blocked by T008.
- Phase 8 last.

## Implementation Strategy

MVP = Phases 1-3. Waves: A = Phases 1-2; B = US1 backend + US2 backend rewiring (parallel agents, disjoint files); C = UI (SurfaceManager/SegmentationEditor, ScheduleBoard, pickers, layout, practices — parallel agents with explicit file ownership); D = polish + verification. Commit per wave on branch `006-surface-segmentation`.

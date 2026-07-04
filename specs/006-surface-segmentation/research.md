# Research: Venue Surface Segmentation & Spatial Layout

**Feature**: 006-surface-segmentation | **Date**: 2026-07-04

Grounded in the verified 2026-07-04 audit (see 005 research) plus targeted checks on this branch. No open NEEDS CLARIFICATION items.

## R1. Conflict model: declared vs geometric vs hybrid

**Decision**: Hybrid — "geometry proposes, declarations decide." Zones are drawn on a surface schematic; drawn geometry generates *suggested* coexistence pairs (non-overlapping → coexist, overlapping → conflict); staff confirm/override; stored explicit symmetric pair rows are the only input to conflict math.

**Rationale**: Product-owner decision (2026-07-04) prioritizing mapping-first UX. Pure declarations force abstract checkbox authoring; pure geometry is intuitively authored but wrong as law — physical coexistence isn't strictly spatial (noise, shared boards, skater flow), and edge tolerances make geometric adjudication brittle. The hybrid keeps authoring visual and math deterministic/testable.

**Alternatives considered**: (a) declarations-only — rejected for UX; (b) geometry-as-law — rejected for correctness/testability; (c) capacity-fraction model (surface = 1.0, bookings consume fractions) — rejected: cannot express "these two thirds coexist but not those two".

## R2. Whole-surface representation

**Decision**: `segmentId: null` on a booking means whole surface; no WHOLE segment rows. `IceSurface.wholeLabel String?` supplies the renameable display name ("Full ice").

**Rationale**: Avoids backfilling a row per existing surface, a "cannot deactivate" special case, and duplicate whole-surface picker entries (spec review finding). Conflict rule "null conflicts with everything on the surface" is one line of logic.

**Alternatives considered**: explicit WHOLE rows — rejected (backfill + protection + duplication complexity for zero expressiveness gain).

## R3. Coexistence storage

**Decision**: `SegmentCoexistence` presence-only rows with canonical ordering (`segmentAId < segmentBId`, `@@unique`). Row exists ⇒ pair coexists; absent ⇒ conflicts.

**Rationale**: Safe default (conflict) requires storing nothing; symmetry is structural (FR-005); the availability engine loads one small set per surface. Preset application writes the preset's pair matrix in the same transaction as its segments.

## R4. Availability engine & recurrence

**Decision**: New `lib/utils/availability.ts` — `findBookingConflicts({venueId, surfaceId?, segmentId?, startAt, endAt, exclude…})` querying five sources in parallel and applying segment math; venue schedule blocks with `recurrenceRule` are expanded through the existing `expandRecurrenceWindow` (lib/utils/venue-schedule.ts:56) over the candidate window.

**Rationale**: `expandRecurrenceWindow` already parses/expands the platform's recurrence format — reuse, don't reinvent. `game-conflicts.ts` (005) already unified three sources with the right overlap semantics; it becomes the engine's core and is retired as a separate module. "Published signup-event game" = parent `SignupEvent.status = PUBLISHED` and game not CANCELED (spec FR-008 wording verified against schema: EventGame has no own publish state).

**Call sites to rewire (FR-010)**: season-games (create/update/check), venue-schedules (block create/update/publish conflicts), events.ts (team events + inter-team games, replacing `findVenueConflicts` checks), event-teams.ts game scheduling (currently checks nothing — gains warnings + override fields), practice-sessions (new).

## R5. 002 admin UI gaps confirmed

**Decision**: SurfaceManager (CRUD + hours) and VenueScheduleBoard (block CRUD + all-source schedule view) are in scope.

**Rationale**: Verified on this branch: `createIceSurface`/`updateIceSurface`/`archiveIceSurface`/`setOperatingHours`/`createScheduleBlock`/`updateScheduleBlock` have zero UI call sites; `IceSurfaceManager.tsx` is display-only; the venue-admin schedule page is a 1.9K read-only page. FR-013 (segment-aware blocks) and FR-021 (schedule view) are unreachable without these screens.

## R6. Editors: SVG, not the practice-planner canvas stack

**Decision**: Both the SegmentationEditor (zones on a surface) and VenueLayoutEditor (surfaces on a venue) are controlled SVG components with pointer-event drag/resize on normalized (0–1) coordinates; no canvas, no new dependencies.

**Rationale**: Requirements are axis-aligned rects + rotation + labels — far below the practice-planner canvas's freehand/undo/thumbnail machinery. SVG gives DOM accessibility, trivial hit-testing, and server-renderable public maps (PublicVenueMap reuses the same geometry renderer read-only). Normalized coordinates make schematics resolution-independent and mobile-safe.

**Alternatives considered**: reusing `lib/utils/canvas/*` — rejected (wrong abstraction level, heavier); drag-and-drop libraries — rejected (deps for trivial interactions).

## R7. Sport catalog vs segment presets

**Decision**: Segmentation presets key off `SurfaceType` (ICE/COURT/…) in new `lib/utils/segment-presets.ts`; `sport-catalog.ts` drops `surfaceUsageOptions` (its consumers move to segment pickers) but keeps sport labels/ages/formats.

**Rationale**: Segmentation is a property of the physical surface, not the sport (a soccer club renting a turf FIELD gets field presets regardless of league sport). SC-007 (no ice vocabulary on non-ice surfaces) becomes structural. 005's sport-awareness tests are updated: the hockey assertion moves from "usage select shows Full/Half/Cross ice" to "ice surface segments show ice preset names; non-ice surfaces never do".

## R8. Practice sessions

**Decision**: Add nullable `venueId`, `surfaceId`, `segmentId`, `startAt` to PracticeSession; server enforces startAt-required-with-venue; slot end = `startAt + duration` minutes; the planner's existing date/duration flow is unchanged when unattached.

**Rationale**: Verified: PracticeSession has only `date` + `duration` today. `startAt` as a full instant (rather than a time-of-day string) matches every other booking source and feeds the engine directly.

## R9. Legacy field removal blast radius (FR-014)

Verified consumers of `iceUsage`/`zoneLabel`/`ICE_USAGES` to be reworked: `prisma/schema.prisma` (EventGame, SeasonGame, IceUsage enum), `lib/utils/validation.ts` (ICE_USAGES + game schemas), `lib/utils/sport-catalog.ts` (+ its tests), `lib/actions/event-teams.ts`, `lib/actions/season-games.ts`, `components/features/signup-events/GameScheduler.tsx` + `PublicEventView.tsx`, `components/features/seasons/GameForm.tsx` + `GamesTable.tsx`, `app/(marketing)/rinks/[slug]/schedule/page.tsx` (zoneLabel display), 005 tests (`sport-awareness.test.tsx`, `season-validation.test.ts`). Pre-launch: fields dropped in the migration, no data preserved.

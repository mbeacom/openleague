# Server Action Contracts: Surface Segmentation & Layout

**Feature**: 006-surface-segmentation | All actions return `ActionResult<T>`, authenticate first, validate with Zod, then authorize (venue staff tiers: `VENUE_SCHEDULE_ROLES` = OWNER/MANAGER/SCHEDULER for surfaces/segments/hours/blocks; `VENUE_PROFILE_ROLES` = OWNER/MANAGER for layout). Paths revalidated after mutations. Segmentation and layout mutations write `VenueActivityLog` entries.

## lib/actions/venue-surfaces.ts (NEW)

| Action | Input | Behavior |
| ------ | ----- | -------- |
| `applySegmentationPreset` | `{ surfaceId }` | Looks up preset by the surface's type; upserts segments by `(surfaceId, presetRole)` + missing coexistence rows in one transaction; no-ops for types without presets (FR-004) |
| `createSegment` | `{ surfaceId, name, geometry, confirmedCoexistence: pairIds[] }` | Creates CUSTOM segment; persists only staff-confirmed coexistence pairs (canonicalized); undeclared ⇒ conflict (FR-005) |
| `updateSegment` | `{ segmentId, name?, geometry?, confirmedCoexistence?, confirm?: boolean }` | Geometry/name edits free; coexistence changes return `details.newlyConflicting` bookings unless `confirm` (FR-007) |
| `suggestCoexistence` | `{ surfaceId, geometry, excludeSegmentId? }` | Pure read: runs `segment-geometry` overlap vs existing active segments → suggested pair list for the editor review step |
| `setSegmentActive` | `{ segmentId, isActive }` | Deactivation refused with `details.futureBookings` when any exist (FR-007) |
| `setWholeSurfaceLabel` | `{ surfaceId, wholeLabel? }` | Renames the implicit whole-surface segment (R2) |
| `getSurfaceSegmentation` | `{ surfaceId }` | Segments + coexistence pairs + geometry for editors and pickers |

Surface CRUD + operating hours reuse the existing (previously UI-less) actions in `lib/actions/venue-schedules.ts` (`createIceSurface`, `updateIceSurface`, `archiveIceSurface`, `setOperatingHours`) — `archiveIceSurface` gains the FR-007 future-bookings guard.

## lib/actions/venue-layout.ts (NEW)

| Action | Input | Behavior |
| ------ | ----- | -------- |
| `saveVenueLayout` | `{ venueId, layout }` | Profile rights; validates surface references; activity-logged (FR-016) |
| `clearVenueLayout` | `{ venueId }` | Removes layout → public profile falls back to list (FR-017) |

## lib/utils/availability.ts (NEW, pure + prisma reads; no auth)

`findBookingConflicts(candidate: { venueId, surfaceId?, segmentId?, startAt, endAt, excludeSeasonGameId?, excludeEventGameId?, excludeBlockId?, excludeEventId?, excludePracticeId? }) => BookingConflict[]` where `BookingConflict = { source: "event"|"seasonGame"|"eventGame"|"scheduleBlock"|"practice", title, startAt, endAt, surfaceId, segmentName? }`. Implements the five-source, segment-aware semantics in data-model.md; expands block recurrence via `expandRecurrenceWindow`. Also `getVenueBookings({venueId, from, to})` powering the schedule board (FR-021).

## Rewired existing actions (FR-010/013)

| Module | Change |
| ------ | ------ |
| `lib/actions/season-games.ts` | `findGameConflicts` → `findBookingConflicts`; `surfaceUsage/zoneLabel` inputs → `segmentId` (validated active + belongs to surface) |
| `lib/actions/event-teams.ts` | Game create/update gains conflict warnings + recorded override (new fields on EventGame? No — override recorded via existing pattern: add `conflictOverriddenById/At` to EventGame in schema? Kept minimal: warnings returned; override recorded on the game via new nullable fields mirroring SeasonGame) and `iceUsage/zoneLabel` → `segmentId` |
| `lib/actions/venue-schedules.ts` | Block create/update/publish conflict checks → engine (replacing `getScheduleConflicts`); `segmentId` support; block CRUD exposed to the new UI |
| `lib/actions/events.ts` | `findVenueConflicts` call sites → engine (team events + inter-team games), warn + recorded override per FR-011 (Event gains override fields or override recorded in audit log — decide in tasks; prefer new nullable fields for consistency) |
| `lib/actions/practice-sessions.ts` | Attachment fields (venue/surface/segment/startAt required-with-venue), engine warnings + override (FR-019) |

## UI data contracts

- Pickers receive `segmentsBySurface: Record<surfaceId, {id, name, kind}[]>` (active only) + `wholeLabel` per surface.
- `VenueScheduleBoard` receives `getVenueBookings` output grouped by surface/day with source-type chips (FR-021, SC-006).
- `PublicVenueMap` + editors share a read-only SVG geometry renderer component.

## Tests (contract level)

- Availability matrix test: all 5×5 ordered source pairs × (coexisting segments, conflicting segments, whole-surface, venue-wide, different surfaces) — SC-004.
- Performance fixture: 1,000 bookings/venue/month, p95 ≤ 500ms — SC-008.
- Preset idempotency, geometry suggestion, canonical pair handling, FR-007 guards.

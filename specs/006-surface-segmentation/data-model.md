# Data Model: Venue Surface Segmentation & Spatial Layout

**Feature**: 006-surface-segmentation | **Date**: 2026-07-04

## New Enums

```prisma
enum SegmentKind {
  HALF
  CROSS
  CUSTOM
}
// NOTE: no WHOLE value — whole-surface bookings use segmentId: null (research R2).
```

## New Models

```prisma
// A named, bookable subdivision of a surface, authored by drawing on the
// surface schematic. Geometry is authoring input + display only; the
// SegmentCoexistence rows are the sole source of conflict truth (R1).
model SurfaceSegment {
  id         String      @id @default(cuid())
  name       String
  kind       SegmentKind @default(CUSTOM)
  // Stable preset identity ("HALF_A", "CROSS_3"); null for custom zones.
  // Preset re-application matches by role, so renames never duplicate (FR-004).
  presetRole String?
  isActive   Boolean     @default(true)
  // Normalized (0-1) rect on the surface schematic: {x, y, w, h, rotation}.
  geometry   Json

  surfaceId String
  surface   IceSurface @relation(fields: [surfaceId], references: [id], onDelete: Cascade)

  coexistenceA SegmentCoexistence[] @relation("CoexistA")
  coexistenceB SegmentCoexistence[] @relation("CoexistB")

  seasonGames      SeasonGame[]
  eventGames       EventGame[]
  scheduleBlocks   VenueScheduleBlock[]
  practiceSessions PracticeSession[]

  @@unique([surfaceId, name])
  @@unique([surfaceId, presetRole])
  @@index([surfaceId, isActive])
  @@map("surface_segments")
}

// Presence-only symmetric coexistence: row exists => the pair may operate
// simultaneously; absent => conflict (safe default). Canonical ordering
// segmentAId < segmentBId enforced in application code + CHECK constraint.
model SegmentCoexistence {
  id String @id @default(cuid())

  segmentAId String
  segmentA   SurfaceSegment @relation("CoexistA", fields: [segmentAId], references: [id], onDelete: Cascade)
  segmentBId String
  segmentB   SurfaceSegment @relation("CoexistB", fields: [segmentBId], references: [id], onDelete: Cascade)

  @@unique([segmentAId, segmentBId])
  @@map("segment_coexistences")
}
```

## Changed Models

```prisma
model IceSurface {
  // NEW: renameable display name for the implicit whole-surface segment
  // ("Full ice"); null => preset/type default label.
  wholeLabel String?
  segments   SurfaceSegment[]
}

model Venue {
  // NEW: optional schematic layout (FR-016-018):
  // { surfaces: [{surfaceId, x, y, w, h, rotation}], labels: [{text, x, y}] }
  layout Json?
}

model SeasonGame {
  // REMOVED: surfaceUsage IceUsage?, zoneLabel String?
  // NEW:
  segmentId String?
  segment   SurfaceSegment? @relation(fields: [segmentId], references: [id], onDelete: SetNull)
}

model EventGame {
  // REMOVED: iceUsage IceUsage, zoneLabel String?
  // NEW:
  segmentId String?
  segment   SurfaceSegment? @relation(fields: [segmentId], references: [id], onDelete: SetNull)
}

model VenueScheduleBlock {
  // NEW (blocks could already target a surface; now optionally a segment):
  segmentId String?
  segment   SurfaceSegment? @relation(fields: [segmentId], references: [id], onDelete: SetNull)
}

model PracticeSession {
  // NEW (FR-019): all nullable; startAt REQUIRED when venueId is set
  // (application invariant); slot = startAt .. startAt + duration minutes.
  venueId   String?
  venue     Venue?          @relation(fields: [venueId], references: [id], onDelete: SetNull)
  surfaceId String?
  surface   IceSurface?     @relation(fields: [surfaceId], references: [id], onDelete: SetNull)
  segmentId String?
  segment   SurfaceSegment? @relation(fields: [segmentId], references: [id], onDelete: SetNull)
  startAt   DateTime?

  @@index([venueId, startAt])
  @@index([surfaceId, startAt])
}
```

## Removed

- `enum IceUsage` (FULL_ICE/HALF_ICE/CROSS_ICE) — superseded by segments.
- `SeasonGame.surfaceUsage`, `SeasonGame.zoneLabel`, `EventGame.iceUsage`, `EventGame.zoneLabel` — pre-launch, dropped without data migration (FR-014).

## Conflict Semantics (availability engine, R4)

Two bookings at overlapping times conflict when:

1. Either has no `venueId` in common scope → not comparable (different venues never conflict).
2. Either is **venue-wide** (calendar Event, or any booking with `surfaceId: null`) → conflict with everything at the venue.
3. Same surface and either has `segmentId: null` (whole surface) → conflict.
4. Same surface, both have segments → conflict **unless** a `SegmentCoexistence` row exists for the canonical pair. Same segment twice → conflict (no self-coexistence rows allowed).
5. Different surfaces of the same venue → no conflict.

Time overlap: `existing.start < candidate.end AND existing.end > candidate.start` (touching boundaries never conflict). Sources and their inclusion filters: Events (all; venue-wide), SeasonGames (SCHEDULED/COMPLETED), EventGames (parent SignupEvent PUBLISHED, game not CANCELED), VenueScheduleBlocks (PUBLISHED; recurrence expanded per occurrence via `expandRecurrenceWindow`), PracticeSessions (`venueId` + `startAt` set; end = startAt + duration).

## Preset Definitions (`lib/utils/segment-presets.ts`, R7)

| SurfaceType | Segments (role → default name, geometry) | Coexistence pairs |
| ----------- | ---------------------------------------- | ----------------- |
| ICE | HALF_A "North half" (top half), HALF_B "South half" (bottom half), CROSS_1..CROSS_4 (quarter rects) | HALF_A↔HALF_B; CROSS_i↔CROSS_j (all pairs); CROSS_1/2↔HALF_B; CROSS_3/4↔HALF_A |
| COURT | HALF_A "Half court A", HALF_B "Half court B" | HALF_A↔HALF_B |
| all others | none (whole surface only) | — |

Whole-surface label defaults: ICE → "Full ice", COURT → "Full court", others → "Whole surface" (overridable via `IceSurface.wholeLabel`).

## Validation Rules (Zod)

- Segment: name 1–80 chars; geometry object with x/y/w/h ∈ [0,1], rotation ∈ [0,360); kind enum; unique-name errors surfaced friendly.
- Coexistence confirmation input: array of `{segmentAId, segmentBId}` pairs, canonicalized server-side; pairs must belong to the same surface.
- Layout: surfaces entries reference the venue's surfaces; labels ≤ 40 chars, ≤ 20 labels; coordinates ∈ [0,1].
- Practice attachment: `startAt` required when `venueId` present; segment must belong to surface, surface to venue.
- Block/game segment: segment must be active and belong to the selected surface.

## State/Lifecycle Rules

- Deactivating a segment (or archiving a surface) with future bookings → refused with the list (FR-007); the availability engine ignores `isActive` for historical display but pickers filter to active.
- Editing coexistence declarations → server returns newly conflicting future bookings; save requires `confirm: true` (FR-007); nothing auto-invalidated.
- Preset application → upsert by `(surfaceId, presetRole)`: creates missing segments + missing coexistence rows only (FR-004).

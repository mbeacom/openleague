# Quickstart: Surface Segmentation & Spatial Layout (006)

## What this feature is

Surfaces divide into bookable segments (halves, cross zones, custom drawn zones) with staff-confirmed coexistence rules — two half-ice bookings share a sheet; full ice blocks everything. One availability engine covers venue blocks, signup-event games, season games, team events, and venue-attached practices. Venue staff finally get working surface/hours/block management, a drawn segmentation editor, a venue layout map (shown on public rink profiles), and a schedule board showing every booking source.

## Try it (after implementation)

```bash
bun run dev:wake
```

1. **Segmentation (US1)**: Venue Admin → venue → Surfaces → create/edit a surface → "Apply preset" (ice: halves + cross zones appear pre-drawn) → add a custom zone by drawing → review suggested coexistence → save.
2. **Unified availability (US2)**: book "North half" via a schedule block and "South half" via a season game same hour — no warnings; attempt full-ice — warned against both; venue Schedule board lists all sources.
3. **Segment booking (US3)**: season GameForm / signup-event GameScheduler / block form show a segment picker after choosing a surface; public pages display segment names.
4. **Layout (US4)**: Venue Admin → Layout → drag surfaces onto the canvas, add "Main entrance" label → public rink profile shows the map.
5. **Practices (US5)**: Practice planner → attach venue/surface/segment + start time → occupies availability both ways.

## Key files

| Area | Path |
| ---- | ---- |
| Schema | `prisma/schema.prisma` (SurfaceSegment, SegmentCoexistence, booking segmentId fields, PracticeSession attachment, Venue.layout) |
| Engine | `lib/utils/availability.ts` (+ `segment-presets.ts`, `segment-geometry.ts`) |
| Actions | `lib/actions/{venue-surfaces,venue-layout}.ts` + rewired season-games / event-teams / venue-schedules / events / practice-sessions |
| UI | `components/features/venue-admin/{SurfaceManager,SegmentationEditor,VenueLayoutEditor,VenueScheduleBoard}.tsx`, `components/features/venues/PublicVenueMap.tsx`, segment pickers in seasons/signup-events/practice-planner |

## Verify

```bash
bun run type-check && bun run test && bun run build
```

Availability matrix + p95 performance tests live in `__tests__/lib/utils/availability.test.ts`. Database: migration authored via `prisma migrate diff`; dev applied with `bun run db:push` (established workflow — see 005).

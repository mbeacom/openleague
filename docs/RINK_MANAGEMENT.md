# Ice Rink Management

OpenLeague rink management lets authorized venue staff publish a public rink profile, manage ice surfaces and schedules, accept ice-time requests, publish lessons and rink content, maintain preferred/home venue relationships, and tag programs with optional skill levels.

## Manager workflow

1. Create a venue organization from `/venue-admin/new`, then manage the venue profile at `/venue-admin/[organizationId]/venues/[venueId]/profile`.
2. Add active ice surfaces before publishing schedule blocks. Existing legacy venues receive a default `Main Surface` through the backfill migration.
3. Publish public schedule blocks from `/schedule`; overlapping published blocks are rejected, while drafts can be prepared independently.
4. Review ice-time requests from `/requests`; accepted requests prevent double-booking within the same schedule block.
5. Publish lessons, specialty events, and venue posts from `/content`; only published public content is rendered on public rink pages.
6. Manage preferred/home rink relationships from `/relationships`; target team or league admins must accept invitations before public/team surfaces display them.
7. Use skill-level labels as optional guidance for lessons and schedule blocks. Public visitors can filter schedules by level.

## Public surfaces

- `/rinks` lists published public rink profiles.
- `/rinks/[slug]` shows public-safe profile details, upcoming schedule, lessons, posts, specialty events, and accepted relationships.
- `/rinks/[slug]/schedule` shows published public future schedule blocks, requestable ice blocks, and optional skill-level filters.

Private manager notes, unpublished profiles, draft content, staff-only schedule blocks, emergency-style sensitive fields, and pending/removed relationships are not exposed on public rink pages.

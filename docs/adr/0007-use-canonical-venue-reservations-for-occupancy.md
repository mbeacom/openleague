---
schemaVersion: 0.1.0
id: "0007"
title: "Use canonical venue reservations for occupancy"
status: accepted
date: 2026-08-16
created: 2026-08-16
deciders: ["@mbeacom"]
tags: [architecture, scheduling, venues, reservations, associations]
scope: org
reversibility: two-way-door
blastRadius: org
relatesTo: ["0002", "0003", "0006"]
affects:
  - type: path
    pattern: "prisma/**"
    note: Defines reservation ownership, lifecycle, links, and migration history.
  - type: path
    pattern: "lib/actions/**"
    note: Venue-occupying mutations must commit through the reservation boundary.
  - type: path
    pattern: "lib/services/venue-reservation*.ts"
    note: Central transaction, availability, and lifecycle invariants.
  - type: path
    pattern: "lib/utils/availability.ts"
    note: Compatibility reader during cutover and eventual reservation-only availability.
  - type: path
    pattern: "lib/data/calendar.ts"
    note: Calendar items deduplicate linked domain records by reservation identity.
  - type: path
    pattern: "app/**/schedule/**"
    note: Private and public schedule readers consume canonical reservation-backed items.
  - type: path
    pattern: "specs/007-association-operations/**"
provenance:
  authoredBy: agent-drafted
  ratifiedBy: "@mbeacom"
  sourceArtifact: specs/007-association-operations/plan.md
review:
  tier: async
  tierReason: >-
    The decision changes the ownership boundary for every venue-based scheduling
    flow and requires an additive migration before the old readers can be removed.
reviewBy: 2027-02-16
---

# ADR-0007: Use canonical venue reservations for occupancy

## Context

OpenLeague currently infers venue occupancy from five independent domain
sources: team Events, SeasonGames, signup-event EventGames, published
VenueScheduleBlocks, and venue-attached PracticeSessions. These records serve
different user workflows, but they compete for the same physical venue,
surface, segment, and interval.

That design now creates three correctness failures:

1. linked aliases can count twice, such as a published SeasonGame and its
   participant-facing Event;
2. a requestable schedule block is treated as occupied even though it is an
   offer of available inventory, while approving an IceTimeRequest creates no
   occupancy record at all; and
3. conflict checks are not a single commit boundary, so publication and
   concurrent writers can create commitments after an earlier advisory check.

Association operations make these failures load-bearing. A venue must retain
authority over its inventory, an association must be able to own approved ice,
and games, practices, events, attendance, calendars, and utilization must refer
to that same commitment without duplicating it.

ADR-0006 already defines a separate `GearReservation` for association-owned
equipment custody. The venue-time concept must therefore remain explicitly
named `VenueReservation` in models, services, actions, tests, routes, and user
labels so the two reservation domains cannot be confused.

ADR-0002 requires mutations to remain Server Actions, and ADR-0003 requires
application database access through Prisma rather than raw locking SQL. The
decision therefore must provide an authoritative occupancy boundary within
those constraints and must preserve existing schedules during migration.

## Decision

We will represent every confirmed claim on venue space and time as a canonical
`VenueReservation`.

Venue offerings and informational schedule blocks will not be occupancy.
Approving an ice request will atomically create or confirm a reservation.
Venue-based games, practices, Events, signup-event games, and venue-operated
activities will reference the reservation that authorizes their use. Multiple
linked user-facing records may share one reservation, but availability,
calendars, and utilization will count that reservation once.

All reservation-sensitive writes will:

1. run in a short Prisma transaction at serializable isolation with bounded
   retry for write conflicts;
2. reload authorization and venue/surface/segment ancestry inside the
   transaction;
3. check conflicts immediately before commitment;
4. require an authorized actor and recorded reason for any override; and
5. write lifecycle history and audit state in the same transaction.

External notifications will run after commit. They will never hold the
reservation transaction open. Notification intent will use the durable
`NotificationOutbox` established by ADR-0006 with a venue/association-operations
event registry; it will not introduce a second outbox or delivery state machine.
ADR-0006 remains authoritative for `gear.*` delivery: `gear-outbox-worker.ts`
continues to own claiming and retry for gear events. A separate registry-filtered
worker may claim non-gear association events, and low-level lease/retry helpers
may be shared, but neither worker may claim the other's event namespace.

Migration will use expand, dual-read, idempotent backfill, reconciliation,
writer cutover, reader cutover, and delayed cleanup. Existing overlaps will be
preserved as explicit migration overrides rather than silently dropped.

## Options considered

### Option A: Canonical venue reservations

| Dimension | Assessment |
|---|---|
| Correctness | One occupancy identity, atomic conflict boundary, and explicit lifecycle |
| Association workflow | Approved ice becomes owned, assignable inventory |
| Venue authority | Venue approval remains the source of confirmed external inventory |
| Migration | Additive dual-read rollout with reconciliation and rollback |
| Cost | Broad schema, writer, calendar, report, and test migration |

### Option B: Keep activity records authoritative and coordinate them

**Pros:**

- Fewer schema additions.
- Existing activity queries remain familiar.

**Cons:**

- Aliases continue to need fragile deduplication rules.
- Approved-but-unassigned ice still has no natural record.
- Every new activity type expands the conflict union.
- Atomic conflict checks remain difficult across separate writers.

### Option C: Treat venue schedule blocks as reservations

**Pros:**

- Reuses an existing venue-owned model and public schedule UI.
- Avoids a new top-level occupancy entity.

**Cons:**

- Conflates inventory offers, informational listings, closures, venue
  activities, and association-owned commitments.
- Partial approvals and assignment lifecycle do not fit the block model.
- Team/league ownership and linked activity identity remain indirect.

### Option D: Do nothing

Continue unioning activity records and leave accepted requests as status-only
records.

This avoids migration work, but preserves false occupancy, duplicate schedule
items, publication races, and the missing request-to-season path. It cannot
support the association workflow in feature 007.

## Trade-offs

- Every venue-occupying writer and reader must migrate; partial adoption would
  be worse than the current explicitly fragmented design.
- Serializable transactions can retry under contention and require clear user
  feedback.
- Existing data needs an idempotent backfill and human reconciliation for
  genuine legacy overlaps.
- Domain records retain schedule snapshots for search/display, so invariant
  tests are required to prevent drift from their reservation.
- Finite venue activities can materialize reservation occurrences; unbounded
  occupying recurrence is not supported.
- The additive rollout temporarily maintains dual readers and compatibility
  authorization, increasing short-term complexity.

## Consequences

- Easier: turn venue approval into association inventory; assign ice to games,
  practices, or events; prevent cross-domain conflicts; deduplicate calendars;
  report utilization; preserve a single audit history for occupancy.
- Harder: migrate and test every writer, reconcile existing overlaps, and keep
  transactions short enough for interactive scheduling.
- **How we would know this was wrong:** reservation contention causes more than
  1% of normal scheduling operations to exhaust retries, cutover verification
  cannot reconcile every active legacy commitment, or a domain repeatedly
  needs occupancy that cannot be represented as venue/surface/segment/time.
- Revisit if: Prisma can no longer provide the required transaction semantics;
  the platform adopts a scheduling store with stronger native temporal
  constraints without violating portability; or measured scale makes
  reservation queries unable to meet interactive scheduling needs.

## Action items

1. [ ] Implement the reservation MVP in feature 007 User Story 1.
2. [ ] Backfill and reconcile all existing venue occupancy before reader cutover.
3. [ ] Migrate every writer named in `specs/007-association-operations/plan.md`.
4. [ ] Remove the legacy five-source availability union only after two stable
   releases and a clean cutover report.

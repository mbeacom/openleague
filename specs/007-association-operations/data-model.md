# Data Model: Association Operations

## 1. Canonical Reservation

### `VenueReservation`

Authoritative claim on venue space and time.

| Field | Rule |
| --- | --- |
| `id` | Stable identifier |
| `status` | `HELD`, `CONFIRMED`, `RELEASED`, `CANCELED`, `COMPLETED` |
| `usageStatus` | `PENDING`, `USED`, `UNUSED` |
| `startsAt`, `endsAt` | `endsAt > startsAt` |
| `timezone` | Valid venue-local IANA timezone snapshot |
| `venueId` | Required |
| `surfaceId` | Required for normal reservations; nullable only for explicit venue-wide claims |
| `segmentId` | Optional; must belong to `surfaceId` |
| `ownerLeagueId` | Optional association owner |
| `ownerTeamId` | Optional team owner |
| `ownerVenueOrganizationId` | Optional venue-program/closure owner |
| `sourceRequestId` | Optional and unique |
| `offeringBlockId` | Optional source offering |
| `heldUntil` | Required for expiring holds |
| lifecycle timestamps | Match status transitions |
| `createdById`, `assignedById` | Actor references |
| timestamps | Created/updated |

Exactly one association, team, or venue-organization owner must be present. Active `HELD`, `CONFIRMED`, and historical `COMPLETED` reservations own their intervals; expired holds, released, and canceled reservations do not block new work.

### `VenueReservationTransition`

Append-only lifecycle history: previous status, next status, actor, reason, timestamp, and relevant snapshot.

### `VenueReservationOverride`

Append-only reasoned conflict override: actor, reason, timestamp, candidate snapshot, and conflicting reservation IDs.

### Existing activity links

Add optional `venueReservationId` relations to:

- `Event`
- `SeasonGame`
- `EventGame`
- `SignupEvent` for single-session venue use
- `PracticeSession`
- `GameProposalEntry` while inventory is earmarked

A `SeasonGame` and its participant-facing `Event` may share one reservation only when the records are linked. The same invariant applies to `PracticeSession` and its participant-facing `Event`. Schedule identity is `reservation:<id>`.

## 2. Venue Offerings

Add `intent` to `VenueScheduleBlock`:

- `OFFERING` — advertises requestable or registrable inventory; never occupancy.
- `VENUE_ACTIVITY` — venue-operated activity; materializes reservation occurrences.
- `CLOSURE` — blocked inventory; materializes reservation occurrences.
- `INFORMATION` — public information only; never occupancy.

Occupying recurring blocks must have a finite end date. Accepted requests reference the offering and create reservations for the approved interval/surface/segment.

Extend `IceTimeRequest` with approved interval, approved surface, approved segment, and optional one-to-one reservation. Add partial approval status.

## 3. Season Placement

### `SeasonTeamPlacement`

Current season-specific team placement:

- season, team, optional division;
- team and division name snapshots;
- rank and private note;
- placing actor and timestamps;
- unique season/team pair.

`PlacementDecision` remains append-only history. Scheduling and standings read `SeasonTeamPlacement`; `Team.divisionId` remains a compatibility default during rollout.

## 4. Association and Team Profiles

Extend `League` with timezone, profile status, public description, mission, branding, public contacts/links, and publication timestamp. Existing `slug` remains stable.

Extend `Team` with association-scoped slug, profile status, public name/description, branding, public contacts/links, and publication timestamp.

### Redirects

- `AssociationSlugRedirect`: old unique slug → league.
- `TeamSlugRedirect`: old slug within league → team.

## 5. Public Content

### `PublicContentItem`

- association owner and optional team scope;
- announcement/news type;
- public/member audience;
- draft/scheduled/published/archived state;
- title, stable slug, excerpt, sanitized body;
- scheduled/published/archived timestamps;
- author and audit timestamps.

Public queries return only published public items whose publication time has arrived.

## 6. Scoped Responsibilities

### `AssociationRoleGrant`

- role: association admin, scheduler, registrar, treasurer, communications lead, team manager, coach, volunteer coordinator, event manager, or equipment manager;
- role also includes equipment manager, which maps to existing gear permissions instead of owning duplicate gear authorization rules;
- association owner;
- one explicit scope: association, division, team, season, Event, or SignupEvent;
- user, grantor, revoker, state, and timestamps;
- unique user/role/scope key.

Compatibility rules:

- existing league admins receive implicit full capabilities until backfill completes;
- existing team admins retain team management;
- `TeamOfficial` never grants capability automatically;
- invitations can carry a pending scoped grant for new or existing users.
- venue staff authorization remains in the existing venue organization/staff model and is not duplicated as an association grant.

Equipment-manager grants map to existing gear permissions:

| Scope | Allowed |
| --- | --- |
| Association | `MANAGE_GEAR_INVENTORY`, `MANAGE_GEAR_WISHLIST`, and team-scoped need/request permissions for any association team |
| Division | Team-scoped need/request permissions for teams currently in the division |
| Team | Team-scoped need/request permissions for the exact required `teamId` |
| Season/Event | None; authorization fails closed |

Capability families and default role ownership:

| Capability family | Default roles |
| --- | --- |
| Association administration, audit, export, conflict override | Association admin |
| Venue reservations, schedules, games, proposals | Association admin, scheduler |
| Rosters, placements, registration eligibility/reporting | Association admin, registrar; team manager within exact team |
| Payments, refunds, financial reports | Association admin, treasurer |
| Public content and operational communications | Association admin, communications lead |
| Team administration | Association admin, team manager within exact team |
| Practice plans and participation | Association admin, scheduler, team manager, coach within team/season |
| Volunteer needs and assignments | Association admin, volunteer coordinator; team manager within exact team |
| Exact Event/SignupEvent management | Association admin, event manager for exact event |
| Gear | Association admin; equipment manager under the explicit gear scope matrix; team manager for `CREATE_TEAM_GEAR_NEED` and `REQUEST_TEAM_GEAR` on the exact required `teamId` only |

Unlisted role/capability/scope combinations fail closed. Guardian and participant
rights derive from existing membership and guardian relationships, not role
grants.

## 7. Volunteers

### `VolunteerNeed`

Association-owned need with optional division/team/activity scope, role label, description, capacity, start/end/timezone, open/closed/canceled/completed state, creator, and timestamps.

### `VolunteerAssignment`

Need, user or normalized invited email, invited/accepted/declined/canceled/completed/missed state, assigner, response/completion timestamps, and notes. Capacity acceptance is serialized.

## 8. Existing Gear Domain Integration

No new gear inventory or custody entities are introduced. Feature 007 consumes:

- `GearCatalogItem`, `GearStorageLocation`, `GearPoolStock`, and `GearUnit`;
- `TeamGearNeed` and lines;
- `GearReservation`, lines, allocations, handoffs, and inventory movements;
- `GearWishlist`, items, pledges, and pledge receipts;
- `GearActivity` and the durable `NotificationOutbox`.

`VenueReservation` and `GearReservation` are unrelated bounded-context entities. Gear custody dates never participate in venue occupancy. An equipment-manager grant maps to the existing gear `Permission` values according to association/team scope.

The association operations read model may include urgent team gear needs, overdue custody, inventory attention, and outbox health. The public profile may link only an existing published wishlist through its hardened token route.

## 9. Notification Outcomes

Reuse the existing `NotificationOutbox` lifecycle (`PENDING`, `PROCESSING`, `SENT`, `FAILED`, `CANCELED`) and `NotificationService`. Add:

- a bounded association-operations notification registry alongside the gear registry;
- an association-operations worker that claims only registered non-gear event types;
- optional shared low-level lease/retry helpers that do not transfer gear-event ownership from `gear-outbox-worker.ts`;
- an optional terminal outcome field that distinguishes provider-accepted, batched, suppressed, stale/canceled, and failed results without conflating worker state with mailbox delivery.

Notification intent is inserted within the domain transaction. Provider delivery occurs after commit. Existing gear events, dedupe keys, retention, reminders, and at-least-once semantics remain unchanged.

## 10. Audit

Use a federated association audit read model over:

- general `AuditLog` for reservation, scheduling, role, volunteer, communication, payment/refund, and export actions;
- `VenueActivityLog` for venue administration;
- append-only `GearActivity`, `GearHandoff`, and `GearInventoryMovement` for equipment history.

Do not duplicate authoritative gear ledger events into mutable general audit rows. The federated view normalizes actor, time, scope, action, outcome, and source identity while preserving source-specific detail and authorization.

## 11. Export

The association export is a schema-versioned JSON document with:

- manifest and generation metadata;
- association profile and links;
- divisions, teams, memberships, officials, guardianship references without unrelated private data;
- seasons, placements, games, practices, events, registrations, volunteer records;
- venue relationships, requests, reservations, and utilization facts;
- gear catalog, storage, stock projections, tagged units, needs, custody reservations, allocations, handoffs, movements, public wishlist, and redacted pledge/receipt records;
- communications/content metadata;
- general, venue, and gear ledger references plus optional-provider asset references.

Secrets, password hashes, raw invitation/share tokens, payment credentials, private storage notes, donor/custodian contact data outside authorized retention rules, outbox recipient snapshots, and unrelated tenant records are always excluded.

Source reads may use bounded internal cursor pagination, but the route streams one complete schema-versioned document. Pagination is not exposed as a partial external export contract.

## State Transitions

### Reservation

```text
HELD -> CONFIRMED -> COMPLETED
HELD -> RELEASED
HELD -> CANCELED
CONFIRMED -> RELEASED
CONFIRMED -> CANCELED
```

Completed reservations are historical and immutable except for corrected usage classification with an audited reason.

### Volunteer Need

```text
OPEN -> CLOSED -> COMPLETED
OPEN -> CANCELED
CLOSED -> OPEN
```

### Volunteer Assignment

```text
INVITED -> ACCEPTED -> COMPLETED
INVITED -> DECLINED
INVITED -> CANCELED
ACCEPTED -> CANCELED
ACCEPTED -> MISSED
```

### Public Content

```text
DRAFT -> SCHEDULED -> PUBLISHED -> ARCHIVED
DRAFT -> PUBLISHED
SCHEDULED -> DRAFT
PUBLISHED -> ARCHIVED
```

## Migration Order

1. Add nullable reservation entities/links and block intent.
2. Create reservations for linked season game/Event pairs.
3. Create reservations and participant Events for attached practices.
4. Backfill event games, standalone Events, accepted requests, and finite occupying venue blocks.
5. Preserve legacy overlaps as explicit migration override history.
6. Backfill current season placement from latest placement decisions, then team defaults.
7. Backfill association-admin grants from league admins only.
8. Verify every active legacy occupancy either links to one reservation or appears in the reconciliation report.
9. Do not migrate existing gear records; add compatibility tests proving new grants, audit federation, public links, notifications, and export preserve ADR-0006 invariants.

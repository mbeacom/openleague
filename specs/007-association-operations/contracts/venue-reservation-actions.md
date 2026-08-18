# Contract: Venue Reservation and Ice Allocation Actions

All mutations authenticate the current user, validate input, authorize exact resources, execute reservation-sensitive writes atomically, revalidate affected pages, and return a typed result.

## Decide Ice Request

`decideIceTimeRequest(input)`

Input:

- request ID;
- decision: approve, partially approve, or decline;
- approved start/end, optional surface, and optional segment for approval; a null surface is allowed only for an intentional venue-wide claim and requires venue-manager authority;
- decision message;
- optional conflict override and required reason.

Approval result:

- updated request;
- one confirmed reservation;
- conflicts considered;
- queued notification identifiers.

Decline result contains no reservation.

Venue request management must expose approve, partial approval, decline, cancel, expire, and decision annotation to authorized venue staff.

## Assign Venue Reservation

`assignVenueReservation(input)`

Input:

- reservation ID;
- target type: season game, practice, Event, signup event, or event game;
- target creation details or existing draft target ID;
- optional override and required reason.

Result:

- reservation;
- primary activity;
- participant-facing Event when applicable;
- RSVP count when applicable;
- canonical schedule ID.

Rules:

- reservation must be confirmed and owned by an eligible association/team;
- target interval and venue must match the reservation;
- a surface-bound reservation requires the exact surface and compatible segment;
- a venue-wide reservation may authorize one surface-specific target within the venue, but remains venue-wide occupancy, blocks every surface/segment for the interval, and cannot be reused for another target unless it is explicitly split into non-overlapping replacement reservations;
- linked aliases share the reservation;
- operation is idempotent for the same reservation/target pair.

## Reservation Lifecycle

- `releaseVenueReservation`
- `cancelVenueReservation`
- `completeVenueReservation`
- `markVenueReservationUnused`
- `rescheduleVenueReservation`
- `unassignVenueReservation`

Each action returns the updated reservation and affected activity state. Release or cancellation of assigned inventory must require an explicit disposition for the linked activity rather than silently orphaning it.

## Availability Preview

`checkVenueReservationAvailability(input)`

Returns offerings, active occupancy, available slices, conflicts, and whether the current actor may override. Public callers never receive owner-private reservation details.

## Publication Contract

Every venue-based publication action must:

1. load the confirmed reservation inside the committing transaction;
2. verify ownership, interval, venue/surface/segment, and target linkage;
3. recheck conflicts;
4. record a reasoned authorized override or reject;
5. publish the activity and audit record atomically.

Bulk publication returns a per-item outcome and never silently publishes stale conflicts.

# Research: Ice Rink Management

## Decision: Add a VenueOrganization ownership layer

**Decision**: Introduce a first-class venue organization concept that represents a rink, arena operator, skating center, or venue business. A venue organization can own one or more venue profiles and assign staff roles.

**Rationale**: Existing venues are owned by users, teams, or leagues and are primarily scheduling locations. Rink management requires a business owner identity, staff permissions, branding, content, requests, and relationships that are broader than a single team or league.

**Alternatives considered**:

- Extend `Team` or `League` to represent rinks: rejected because rinks are neither teams nor leagues and need different permissions, branding, and public workflows.
- Keep only user-owned venues: rejected because staff delegation, multi-surface venues, and organization-level invitations would be difficult to model cleanly.

## Decision: Preserve and extend existing Venue records

**Decision**: Keep the current `Venue` concept as the physical/location profile and extend it with organization ownership, public profile fields, brand metadata, publication status, and multi-surface support.

**Rationale**: Existing events and schedules already reference `Venue`. Preserving that relationship reduces migration risk and keeps existing team event scheduling compatible while allowing richer rink-specific data to be added.

**Alternatives considered**:

- Replace `Venue` with a new rink-only model: rejected because it would break existing event and schedule references.
- Keep rink profile separate from `Venue`: rejected because it would duplicate address, visibility, amenity, and scheduling identity.

## Decision: Model bookable surfaces separately

**Decision**: Add an ice surface or activity area entity under a venue. A single-surface rink gets a default surface; multi-sheet arenas can configure each sheet independently.

**Rationale**: Schedules, capacity, closures, and availability often differ by sheet or room. Modeling surfaces avoids one venue-level calendar becoming ambiguous for multi-sheet rinks.

**Alternatives considered**:

- Store surface names in each schedule block only: rejected because it prevents consistent capacity, ordering, and surface-specific filtering.
- Require every rink to configure multiple surfaces: rejected because single-surface rinks should remain simple.

## Decision: Use schedule blocks for operating programs and availability

**Decision**: Represent operating hours, closures, open skate, stick and pick, figure skating, lessons, events, and available ice time with schedule-oriented records that can be recurring or one-time.

**Rationale**: Rink calendars include activities that are not team events. Schedule blocks support publishing availability before a team event exists and can later link to accepted requests or generated events.

**Alternatives considered**:

- Use only existing team `Event` records: rejected because public rink programs and available ice blocks do not always belong to a team.
- Generate every recurring instance immediately: rejected for first planning because recurrence edits and exceptions are easier to manage from a parent block plus generated/derived instances where needed.

## Decision: Request/inquiry workflow before payments

**Decision**: The first release tracks ice-time and lesson requests through submitted, accepted, declined, canceled, and expired states. Prices are displayed and captured for context, but payment collection is deferred.

**Rationale**: The user requested variable charges and available ice offers, but direct payment introduces billing, refunds, taxes, PCI/payment processor, and dispute workflows. A request workflow delivers marketplace value sooner and keeps pricing visible without committing to checkout.

**Alternatives considered**:

- Implement direct checkout immediately: deferred because it adds significant compliance and accounting scope.
- Show availability without requests: rejected because rinks need a way to capture demand and respond.

## Decision: Store skill levels as internal reference labels initially

**Decision**: Add optional skill-level references that can label lessons, events, and eligibility. Include source/category fields for USA Hockey, US Figure Skating, custom rink levels, or other systems.

**Rationale**: Level filtering and guidance can be delivered without official external verification. This leaves room for future governing-body integrations while keeping initial implementation testable.

**Alternatives considered**:

- Integrate directly with USA Hockey or US Figure Skating now: deferred because official APIs, data rights, and identity matching require separate discovery.
- Use free-text levels only: rejected because filtering and consistency would be poor.

## Decision: Venue relationships use invitation and status records

**Decision**: Preferred and home rink relationships should have their own invitation/status record that links venues to teams, leagues, coaches, or organizations.

**Rationale**: Relationship invitations require authority checks, acceptance/rejection, expiration, removal, and history. Modeling them separately avoids overloading team or venue visibility fields.

**Alternatives considered**:

- Add `homeVenueId` directly to `Team`: rejected because teams may have preferred and home relationships with multiple venues over time.
- Reuse existing team invitation model: rejected because current invitations are team-membership specific and require a team target.

## Decision: Use existing audit patterns for significant changes

**Decision**: Profile publication, schedule changes, pricing changes, content publication, request decisions, and relationship status changes should create audit/activity entries using the existing audit pattern or a venue-specific activity model where user-facing history is required.

**Rationale**: Rink managers need operational traceability, and the project already has audit logging concepts for administrative actions.

**Alternatives considered**:

- Rely only on timestamps: rejected because they do not explain who changed what or why a request/status changed.

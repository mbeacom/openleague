# Feature Specification: Association Operations

**Feature Branch**: `mbeacom-association-platform-roadmap` (`SPECIFY_FEATURE=007-association-operations` for SpecKit scripts)  
**Created**: 2026-08-16  
**Status**: Draft  
**Input**: User description: "Enable a nonprofit hockey association such as CAHA to schedule, track, and manage events across age levels, divisions, teams, venues, ice time, pre-season and in-season games, practices, volunteers, communications, and public pages while preserving OpenLeague as a free and fully open-source service."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Secure and Allocate Ice to a Practice (Priority: P1)

An association scheduler requests ice from a venue, the venue reviews and approves a specific time and surface, and the association allocates that confirmed reservation to a planned practice without creating a double booking. Games and broader event assignment build on the same reservation in User Story 2.

**Why this priority**: Ice is the scarce resource that every season workflow depends on. Existing schedules, teams, events, and planners cannot operate reliably until venue approval and association use refer to the same reservation.

**Independent Test**: Create a venue offering, request a portion of it, approve the request, assign the reservation to a team practice, and verify that the reservation appears once on association, team, and venue schedules while conflicting uses are rejected.

**Acceptance Scenarios**:

1. **Given** a venue has published requestable ice, **When** an authorized association scheduler submits a valid request and venue staff approve it, **Then** a confirmed reservation is created for the approved interval and owner.
2. **Given** a confirmed but unassigned reservation, **When** an authorized association scheduler assigns it to a planned practice, **Then** the practice plan, attendance event, and reservation become one coordinated activity with no duplicate occupancy.
3. **Given** a conflicting confirmed reservation or activity, **When** any scheduling path attempts to use the same non-coexisting space and time, **Then** the operation is rejected unless the actor has explicit override authority and records a reason.
4. **Given** requestable ice that has not been approved, **When** users view availability, **Then** the offering remains distinguishable from confirmed occupancy.

---

### User Story 2 - Run a Complete Association Season (Priority: P1)

An association administrator configures age classifications, divisions, teams, pre-season phases, placement, regular-season phases, games, and practices, then coordinates team managers through one operational schedule.

**Why this priority**: Associations need one season workflow rather than separate venue, team, event, and planner tools that require manual reconciliation.

**Independent Test**: Configure one pre-season phase and one regular-season phase, place teams into divisions, generate and publish games from confirmed ice, schedule practices, and verify that managers see the correct team schedule and attendance actions.

**Acceptance Scenarios**:

1. **Given** an association with teams at multiple age and skill levels, **When** an administrator creates a season and its phases, **Then** teams can be placed into season-specific divisions without rewriting historical placements.
2. **Given** confirmed association ice, **When** an administrator schedules or generates games and practices, **Then** each activity is linked to an appropriate reservation or clearly identified as not requiring venue space.
3. **Given** a game proposal between teams, **When** both sides agree and valid ice is selected, **Then** the game, reservation, participant schedule, and attendance record become one coordinated commitment.
4. **Given** a published season schedule, **When** an administrator or team manager views or exports it, **Then** linked records are shown once and include venue-local times.

---

### User Story 3 - Delegate Team, Volunteer, and Gear Operations (Priority: P2)

Association administrators delegate defined responsibilities to coaches, team managers, schedulers, treasurers, volunteer coordinators, event managers, and equipment managers without granting unnecessary association-wide access. Equipment managers use the existing association gear inventory, custody, team-needs, wishlist, and pledge workflows rather than a second gear system.

**Why this priority**: A nonprofit season depends on distributed work. Broad administrator access is unsafe and makes it difficult to recruit volunteers for bounded responsibilities.

**Independent Test**: Invite a team manager, volunteer coordinator, and equipment manager; assign limited responsibilities; schedule volunteer shifts; submit a team gear need; and verify that each person can complete only the assigned work.

**Acceptance Scenarios**:

1. **Given** an association or team role, **When** an administrator grants a bounded responsibility, **Then** the recipient can perform that responsibility without receiving unrelated administrative access.
2. **Given** a game, practice, or association event, **When** a coordinator creates volunteer needs and assigns or accepts volunteers, **Then** fulfillment status is visible to authorized organizers and the assigned volunteers.
3. **Given** an invitee without an existing account, **When** the invitee accepts a valid invitation, **Then** the intended association, team, or event responsibility is granted after account creation; venue responsibilities continue through the venue staff invitation and authorization workflow.
4. **Given** a youth participant with multiple guardians, **When** a guardian responds for that participant, **Then** attendance is tracked per child without exposing private family information to unauthorized users.
5. **Given** an equipment manager with an association-scoped grant, **When** the manager reviews team needs, manages inventory/custody, or publishes a gear wishlist, **Then** existing gear permissions authorize that work without granting scheduling, finance, or unrelated administrative capabilities.

---

### User Story 4 - Publish an Association Home and Team Directory (Priority: P2)

An association publishes a branded public landing page with its mission, contact information, teams, divisions, public schedule, signup events, announcements, links to public team pages, and its published gear wishlist when one is active.

**Why this priority**: Families, volunteers, opponents, and venue partners need one trustworthy public source instead of disconnected event links and private dashboards.

**Independent Test**: Publish an association profile with two divisions and three teams, add an announcement and public event, and verify that visitors can navigate from the association page to the correct team and event pages without signing in.

**Acceptance Scenarios**:

1. **Given** an association administrator has completed required profile information, **When** the profile is published, **Then** a stable public address shows approved branding, description, contact details, teams, divisions, and public content.
2. **Given** a team is marked public, **When** a visitor opens the team page, **Then** the visitor sees approved team identity, public schedule, public announcements, and association context without seeing roster-private data.
3. **Given** private or member-only content, **When** an unauthenticated visitor opens an association or team page, **Then** that content is not disclosed.
4. **Given** a renamed association or team, **When** administrators update display information, **Then** existing shared public links remain stable or redirect safely.
5. **Given** an association has a published gear wishlist, **When** a visitor opens the association page, **Then** the visitor can reach the existing token-protected wishlist and pledge flow without donor, custodian, inventory-location, or private team data being exposed.

---

### User Story 5 - Communicate and Coordinate Work (Priority: P2)

Association and team leaders publish announcements, operational messages, and news posts to the appropriate divisions, teams, officials, volunteers, guardians, or participants while respecting notification preferences.

**Why this priority**: Schedules only become operational when the right people receive changes, assignments, and reminders.

**Independent Test**: Publish an association announcement, send an urgent schedule change to one division, and publish a team news post; verify targeting, delivery records, preferences, and public/member visibility.

**Acceptance Scenarios**:

1. **Given** an authorized sender and a defined audience, **When** a message is sent, **Then** only eligible recipients are targeted and durable outcomes distinguish queued, provider-accepted, batched, suppressed, stale/canceled, and failed processing; mailbox delivery is claimed only when provider evidence supports it.
2. **Given** a public association or team news post, **When** it reaches its publication time, **Then** it appears on the intended public page.
3. **Given** an urgent reservation or schedule change, **When** the change is published, **Then** affected managers, officials, volunteers, guardians, and participants receive a clear update.
4. **Given** a recipient's notification preferences, **When** a non-urgent message is distributed, **Then** the preferences are honored without marking a suppressed message as delivered.

---

### User Story 6 - Track Utilization, Compliance, and Portability (Priority: P3)

Association and venue administrators measure reserved, assigned, used, canceled, and unused ice; review a federated operational history that preserves domain ledgers; and export association data—including existing gear inventory and custody records—in documented, portable formats.

**Why this priority**: Nonprofit boards and rink partners need evidence for budgeting, equitable allocation, audits, and migration without becoming dependent on one hosted provider.

**Independent Test**: Complete a week containing used, released, and unused reservations, then generate an utilization report, review the relevant audit history, and export the association's operational data.

**Acceptance Scenarios**:

1. **Given** reservations across teams and venues, **When** an authorized administrator opens utilization reporting, **Then** reserved, assigned, completed, released, canceled, and unused time is summarized by association, team, venue, surface, and date range.
2. **Given** a consequential scheduling, permission, gear, payment, communication, or export action, **When** an authorized reviewer inspects history, **Then** the actor, time, scope, and outcome are available through one reviewable federated timeline without weakening append-only domain ledgers.
3. **Given** an association administrator requests an export, **When** the export completes, **Then** association profile, structure, memberships, teams, seasons, schedules, venue reservations, gear inventory/custody/needs, communications, and audit references are available in documented portable formats.
4. **Given** optional payment, media, or hosted integrations are unavailable, **When** the association operates core scheduling, communication, registration, and export workflows, **Then** those core workflows remain usable.

### Edge Cases

- A venue approves only part of the requested interval or changes the surface or segment.
- Two venue staff members attempt to approve overlapping requests concurrently.
- An association releases confirmed ice after a game or practice has been published.
- A requestable offering spans multiple potential reservations and only part is allocated.
- A full-surface use conflicts with segment uses while explicitly coexisting segments do not.
- A season game and its participant-facing event refer to the same reservation.
- Generated schedules become stale because another reservation is confirmed before publication.
- A team changes divisions between seasons while historical standings remain unchanged.
- A manager, coach, volunteer, or venue staff member loses access after work has been assigned.
- A public association or team address collides with an existing address or is renamed.
- A guardian is associated with players on multiple teams or associations.
- A scheduled public post reaches its publish time during a service interruption.
- An association export is requested while payments or media are stored by optional providers.
- A public gear wishlist is rotated, archived, or absent while an association profile links to it.
- An equipment manager loses access while gear remains checked out to a team.

## Requirements *(mandatory)*

### Functional Requirements

#### Critical Path A - Canonical Reservations

- **FR-001**: The system MUST represent a confirmed venue reservation independently from a venue's offer of available or requestable time.
- **FR-002**: A venue reservation MUST identify its venue, optional surface for an intentional venue-wide claim, optional segment, start, end, status, owning association, team, or venue organization, and source request when applicable; a venue-wide claim conflicts with every surface at that venue for the same interval.
- **FR-003**: A reservation MUST support held, confirmed, released, canceled, and completed lifecycle states with actor and timestamp history.
- **FR-004**: Venue approval of an ice request MUST atomically create or confirm the corresponding reservation.
- **FR-005**: Venue staff MUST be able to approve, partially approve, decline, cancel, expire, and annotate requests from a reachable management workflow.
- **FR-006**: Association schedulers MUST be able to assign a confirmed reservation to a game, practice, general event, or signup-event game.
- **FR-007**: One reservation MAY support linked participant-facing records, but MUST count as occupancy and render on a schedule only once.
- **FR-008**: Every venue-occupying scheduling path MUST evaluate conflicts against the same authoritative reservation and availability rules immediately before commitment.
- **FR-009**: Conflicting non-coexisting reservations MUST be rejected by default.
- **FR-010**: An authorized override MUST require a reason and MUST preserve actor, time, affected resources, and conflicting commitments.
- **FR-011**: Requestable inventory MUST remain distinguishable from confirmed occupancy so an available offer does not block itself.
- **FR-012**: Venue-local time MUST be authoritative for offers, requests, reservations, games, practices, and public schedules.

#### Critical Path B - Association Season Operations

- **FR-013**: An association MUST be able to manage age classifications, divisions, teams, seasons, and pre-season and in-season phases.
- **FR-014**: Team placement MUST be season-specific and MUST preserve historical season and division records.
- **FR-015**: Association schedulers MUST be able to create manual schedules and generate draft schedules from teams, phases, and confirmed reservation inventory.
- **FR-016**: Draft and generated schedules MUST recheck reservation availability at publication time.
- **FR-017**: Cross-team proposals MUST identify or acquire valid reservation inventory before becoming a published venue-based game.
- **FR-018**: Publishing a game MUST coordinate its reservation, participant schedule, attendance records, and notifications without duplicate occupancy.
- **FR-019**: A practice plan MUST be attachable to a scheduled practice that also supports attendance and reservation tracking.
- **FR-020**: Association, division, team, venue, and participant calendar views MUST derive from the same commitments and MUST not show linked records as separate activities.
- **FR-021**: Calendar exports MUST include all eligible association commitments, including games, practices, signup events, and relevant venue reservations.
- **FR-022**: Association operators MUST be able to identify unassigned venue reservations, unscheduled teams, unresolved conflicts, volunteer shortages, urgent gear needs, and overdue gear custody from one operational view.

#### Critical Path C - Roles and Workforce

- **FR-023**: The system MUST support distinct association administrator, scheduler, registrar, treasurer, communications, team manager, coach, volunteer coordinator, event manager, equipment manager, guardian, and participant responsibilities alongside the existing separate venue staff roles.
- **FR-024**: Association responsibilities MUST be scoped to the smallest applicable association, division, team, season, or event boundary; venue responsibilities MUST remain scoped through venue organization and venue staff authorization.
- **FR-025**: Publicly described official or volunteer roles MUST NOT automatically grant administrative permissions.
- **FR-026**: Invitations MUST support both existing and new users and MUST apply the intended responsibility only after verified acceptance.
- **FR-027**: Organizers MUST be able to define volunteer needs for games, practices, signup events, and association operations.
- **FR-028**: Volunteer needs MUST track open, closed, canceled, and completed states; volunteer assignments MUST track invited, accepted, declined, canceled, completed, and missed states.
- **FR-029**: Guardians MUST be able to respond separately for each linked youth participant while private family data remains restricted.

#### Critical Path D - Public Presence and Communications

- **FR-030**: An association MUST be able to configure and publish a stable public profile with name, public address, branding, description, contact details, and approved links.
- **FR-031**: A public association page MUST provide navigation to public divisions, teams, schedules, signup events, announcements, news, and an existing published gear wishlist when available.
- **FR-032**: Each public team page MUST show only administrator-approved identity, association context, schedule, announcements, and news.
- **FR-033**: Public pages MUST exclude private rosters, guardian relationships, attendance responses, internal notes, payment details, invitations, and administrative grants.
- **FR-034**: Association and team publishers MUST be able to create draft, scheduled, published, archived, public, and member-only news or announcement content.
- **FR-035**: Scheduled content MUST publish automatically at the intended local time.
- **FR-036**: Operational messaging MUST target association, division, team, role, event, volunteer, or equipment audiences; persist intent through the existing durable notification outbox; and record meaningful processing and delivery outcomes.
- **FR-037**: Schedule and reservation changes MUST notify affected audiences according to urgency and recipient preferences.

#### Critical Path E - Accountability and Open Service

- **FR-038**: Venue reservation, scheduling, role, volunteer, gear, communication, payment, refund, and export actions MUST be accessible through a consistent federated audit timeline while preserving authoritative append-only domain ledgers such as gear activity, handoffs, and inventory movements.
- **FR-039**: The system MUST report ice utilization by association, team, venue, surface, segment, status, and date range.
- **FR-040**: Utilization reporting MUST distinguish offered, requested, confirmed, assigned, completed, released, canceled, and unused time.
- **FR-041**: Association administrators MUST be able to export association-owned operational data—including gear catalog, inventory, units, needs, custody reservations, allocations, handoffs, movements, wishlists, and redacted pledge records—in documented, non-proprietary formats.
- **FR-042**: Core association scheduling, registration, volunteer, communication, reporting, and export capabilities MUST remain usable without enabling payments or media.
- **FR-043**: Core association capabilities MUST NOT require a per-player fee, transaction commission, or proprietary hosted provider.
- **FR-044**: Optional payment, media, email, and storage integrations MUST fail visibly and MUST NOT corrupt or silently discard core operational records.
- **FR-045**: The project MUST document the infrastructure and operational responsibilities required to self-host the full core association capability.

### Key Entities

- **Association Profile**: The public and operational identity for a league or association, including stable public address, branding, description, contacts, and visibility.
- **Venue Reservation**: The authoritative claim on venue space and time, including lifecycle, owner, source request, and linked activity; it is unrelated to equipment-custody `GearReservation`.
- **Availability Offering**: Time and space a venue advertises as available, requestable, informational, or externally registered; it is not confirmed occupancy by itself.
- **Season Placement**: A season-specific assignment of a team to an age or competitive division while preserving history.
- **Operational Assignment**: A bounded responsibility granted to an official, manager, coordinator, equipment manager, or volunteer for a defined scope.
- **Volunteer Need**: A required role or shift connected to an association activity, with capacity, timing, assignment, and fulfillment status.
- **Public Content Item**: Association or team news and announcements with audience, publication state, scheduling, and author.
- **Utilization Record**: A reportable interpretation of offering, request, reservation, assignment, release, completion, cancellation, or unused time.
- **Association Gear Domain**: The existing League-owned catalog, pooled/tagged inventory, storage, needs, custody reservations, allocations, handoffs, movements, wishlists, pledges, ledger, and notification outbox governed by ADR-0006.
- **Association Export**: A portable package of association-owned profile, structure, membership, team, season, schedule, venue reservation, gear, communication, and audit-reference data.

## Scope, Dependencies, and Assumptions

### In Scope

- Association-level orchestration over existing team, season, event, signup, practice-planner, communication, venue, and gear capabilities.
- Canonical reservation and allocation for both whole and segmented surfaces.
- Public association and team identity pages.
- Delegated officials, managers, and season-wide volunteer assignments.
- Delegated equipment management through the existing gear permission and workflow boundaries.
- Unified scheduling, utilization, audit visibility, and portable export.

### Out of Scope

- Payroll, employee timekeeping, background-check adjudication, or volunteer credential verification.
- Governing-body membership verification or synchronization.
- Tournament bracket formats beyond existing event-team and standings capabilities.
- Accounting ledgers, tax filing, or full bookkeeping.
- A proprietary mobile application or an API program unrelated to the association workflows.
- Mandatory public self-service purchase of ice; venues may continue using requests and optional registration/payment capabilities.

### Dependencies

- Existing venue organizations, surfaces, segments, hours, schedule blocks, and relationships.
- Existing teams, divisions, memberships, officials, guardians, seasons, games, proposals, practices, events, registrations, communications, and notification preferences.
- Existing public venue and signup-event privacy boundaries.
- Existing League-owned gear inventory, custody, needs, wishlist/pledge workflows, append-only ledgers, durable `NotificationOutbox`, and accepted ADR-0006 from merged PRs #331-#335.

### Assumptions

- The existing league concept is the operational association root and is extended rather than duplicated.
- Venue staff retain authority over venue inventory; association staff control allocation only after venue confirmation.
- A confirmed reservation is the authoritative occupancy record even when multiple user-facing records refer to the same activity.
- `VenueReservation` is separate from the existing `GearReservation`; gear remains League-owned and does not become venue inventory.
- New association and venue notification events reuse the durable outbox and `NotificationService` delivery ownership established by the gear domain rather than introducing a second outbox.
- Core functionality remains free to use and self-host; optional third-party services may charge their own direct costs.
- Public pages use administrator-controlled publication and reveal no youth or household-private data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a timed validation beginning when a signed-in scheduler opens an approved reservation and ending when the assigned practice appears on the team schedule, the scheduler can complete assignment in under 5 minutes without re-entering venue, surface, segment, or interval data.
- **SC-002**: In concurrency tests, 100% of overlapping non-coexisting reservation attempts result in at most one confirmed commitment unless an authorized, reasoned override is recorded.
- **SC-003**: Every venue-based association activity appears exactly once on association, team, venue, participant, and exported calendars.
- **SC-004**: An association can configure a pre-season phase, place teams, publish a regular-season schedule, and assign practices using confirmed ice without maintaining an external scheduling spreadsheet.
- **SC-005**: In a moderated validation with at least 10 first-time association operators, at least 90% can identify unassigned ice, scheduling conflicts, volunteer shortages, urgent gear needs, and overdue gear custody without facilitator assistance.
- **SC-006**: Coaches, managers, schedulers, treasurers, communications leads, volunteer coordinators, and equipment managers can complete their assigned workflows without receiving association-wide administrator access.
- **SC-007**: Automated navigation tests confirm that each published team, public schedule, public signup event, public announcement, and active public gear wishlist is reachable from the association landing page in no more than three link or button activations.
- **SC-008**: Public-page privacy tests disclose zero private roster, guardian, attendance, invitation, payment, or administrative-grant fields.
- **SC-009**: Venue reservation, activity, volunteer, and gear changes persist notification intent for 100% of eligible affected audiences, with queued, provider-accepted, batched, suppressed, stale/canceled, and failed outcomes distinguishable.
- **SC-010**: Authorized administrators can reconcile 100% of offered, requested, confirmed, assigned, completed, released, canceled, and unused ice for a selected date range.
- **SC-011**: A complete association export, including gear projections and append-only ledger references with donor/custodian PII excluded or redacted, can be produced without enabling payment or media integrations and can be read using documented non-proprietary formats.
- **SC-012**: A documented self-hosted reference deployment using replaceable database and email transports, with payments and media disabled, can complete every core quickstart workflow without a per-player fee, platform transaction commission, or mandatory proprietary storage provider.

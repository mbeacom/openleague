# Feature Specification: Signup Events & Event Day Management

**Feature Branch**: `004-signup-events`
**Created**: 2026-07-03
**Status**: Draft
**Input**: User description: "Signup events hosted by organizations, rinks, leagues/associations, or teams — a SignUpGenius replacement for hockey associations. Events have capacity-limited role slots (e.g., 4 goalies + 40 skaters + 4 refs + 8 coaches), visibility tiers (private, invite-only, link-accessible, public), priority registration windows with waitlist backfill (association-committed players first, then opt-in list), payment options (Venmo/Zelle/CashApp handles, phone, cash, or Stripe Connect), rollup onto association/organization/rink event pages and calendars per visibility, delegated event management (mite delegate, event coordinators, association president), organizer-driven team formation from signups with rosters and rotations (combined mite 1/mite 2 teams, floating mite 3 players rotating through games, house players on one side of rink), game sub-events tied to rink schedule, photo/video sharing by parents and attendees, and age-gated statistics/outcomes (squirt+/age 8+ only) including tournament events."

## Context & Relationship to Prior Features

Feature `002-ice-rink-management` delivered venue organizations, venue staff roles,
bookable ice surfaces, recurring venue schedule blocks, and public rink profile/schedule
pages. Feature `003-rink-sessions-purchasing` delivered individual end-user opt-in to
schedule blocks and lessons with capacity enforcement (confirmed + actively-held pending
spots, no oversell), Stripe Connect direct-charge purchasing where the rink organization
is the merchant of record, refunds, and confirmation emails. Waitlisting was modeled but
explicitly deferred there.

This feature generalizes those capabilities into **signup events**: one-off or special
events (Mite Night, skills clinics, tryout scrimmages, jamborees, volunteer signups,
tournaments) that any hosting entity — a rink organization, a league/association, or a
team — can create, publish, and manage. It adds what schedule-block registration does not
have: multiple capacity-limited **role slots** per event, **priority registration windows
with waitlist backfill**, **invite-only and link-based access**, **manual payment
options** alongside online payment, **delegated per-event management**, **event-day team
formation with rosters/rotations/games**, **photo/video sharing**, and **age-gated
statistics**. Signup events are distinct from team calendar events (games/practices with
roster RSVPs) and from venue schedule blocks, but roll up onto the same public rink pages
and internal calendars.

The stated business goal: replace the association's current use of SignUpGenius and offer
the capability to local rinks, associations, and leagues.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Organizer creates a signup event with role-limited slots (Priority: P1)

An association coordinator (or rink staff member, or team admin) creates a signup event —
e.g., "Mite Night" — under their hosting entity. They define the event details (title,
description, date/time, venue, age/level classification) and a set of signup slots, each
with its own capacity: 4 goalies, 40 skaters, 4 referees, 8 coaches. They save it as a
draft, review it, and publish it. Published events appear on the host's event pages and
calendars according to the event's visibility setting.

**Why this priority**: Creating and publishing a capacity-limited signup sheet is the core
SignUpGenius-replacement capability. Without it, nothing else in this feature exists.

**Independent Test**: Can be fully tested by creating an event with multiple slots as a
host admin, publishing it, and confirming it renders on the host's event page/calendar
with correct slot capacities — before any registration, payment, or team features exist.

**Acceptance Scenarios**:

1. **Given** a league admin (or venue staff member with scheduling rights, or team admin),
   **When** they create an event with title, description, start/end time, venue, age
   classification, and slots "Goalie ×4, Skater ×40, Referee ×4, Coach ×8", **Then** the
   event is saved as a draft visible only to the host's organizers.
2. **Given** a draft event, **When** the organizer publishes it with visibility "Public",
   **Then** it appears on the host's public event listing and calendar, showing each
   slot's name and remaining capacity.
3. **Given** a published event, **When** the organizer edits slot capacity or event
   details, **Then** changes take effect immediately and registered participants are
   notified of material changes (time, venue, cancellation).
4. **Given** a published event, **When** the organizer cancels it, **Then** all registered
   participants are notified and the event is marked canceled (not deleted) on calendars.
5. **Given** a user with no administrative role in the hosting entity, **When** they
   attempt to create or edit an event for that entity, **Then** the system refuses.

---

### User Story 2 - Participant discovers an event and registers for a slot (Priority: P1)

A parent finds Mite Night on the association's event page (or via a shared link), opens
it, and registers their skater for a "Skater" spot — and their spouse for a "Coach" spot.
Each registration names the actual participant. Capacity is enforced per slot: when the
40th skater confirms, the Skater slot shows full while Goalie spots remain open. The
registrant receives confirmation, sees their registrations in one place, and can cancel
up to the organizer's cutoff.

**Why this priority**: Registration against slot capacity is the other half of the MVP —
an event nobody can sign up for delivers no value.

**Independent Test**: With a published free event, register participants into different
slots until one slot fills; verify per-slot capacity enforcement, confirmation email,
self-service cancellation, and the organizer's live roster view.

**Acceptance Scenarios**:

1. **Given** a published event with open capacity, **When** an authenticated user
   registers a named participant into a slot, **Then** the registration is confirmed,
   counted against that slot only, and a confirmation email is sent.
2. **Given** a slot at capacity, **When** a user attempts to register for it, **Then**
   the registration is blocked (offered the waitlist where enabled) and other slots with
   capacity remain registrable.
3. **Given** two users registering for the last spot in a slot at the same moment,
   **Then** exactly one succeeds and the other is informed the slot just filled — the
   slot is never oversold.
4. **Given** a registrant with a confirmed spot, **When** they cancel before the
   organizer's cancellation cutoff, **Then** the spot is released (and offered to the
   waitlist where one exists).
5. **Given** one account registering multiple participants (e.g., two children), **Then**
   each participant occupies one spot in their chosen slot and appears by name on the
   roster.
6. **Given** the same participant already registered in a slot, **When** a duplicate
   registration for that participant/slot is attempted, **Then** the system prevents it.
7. **Given** an organizer, **When** they open the event roster, **Then** they see
   per-slot lists of participants with registration status, can check participants in on
   event day, and can export the roster as a spreadsheet file.

---

### User Story 3 - Priority registration windows with waitlist backfill (Priority: P2)

The association hosts Mite Night and wants association-committed players to get first
access. The organizer configures a priority window: for the first week, only association
members may register; after that, registration opens to everyone else. People outside the
priority group (or facing a full slot) can join the waitlist/opt-in list. When capacity
frees up or the general window opens, waitlisted entries are offered spots in order, each
with a limited claim window to confirm before the offer passes to the next person.

**Why this priority**: This is the association's flagship scenario ("Mite Night") and the
key differentiator over a plain signup sheet. It depends on P1 registration.

**Independent Test**: Configure a two-phase event (members-only, then open) with a small
slot capacity; verify a non-member can only waitlist during phase 1, that phase 2 opens
automatically at the configured time, and that a cancellation triggers an ordered
waitlist offer with expiry.

**Acceptance Scenarios**:

1. **Given** an event with a members-first window, **When** an association member
   registers during that window, **Then** they are confirmed normally.
2. **Given** the same window, **When** a non-member attempts to register, **Then** they
   are offered the waitlist/opt-in list instead of a confirmed spot.
3. **Given** the general window opens with capacity remaining, **Then** waitlisted
   entries are offered spots in waitlist order before (or as) open registration begins,
   and notified.
4. **Given** a waitlist offer, **When** the recipient does not claim it within the claim
   window, **Then** the offer expires and passes to the next waitlisted entry.
5. **Given** a full slot, **When** a confirmed participant cancels, **Then** the first
   eligible waitlisted entry is automatically offered the spot and notified.
6. **Given** an organizer, **When** they view the waitlist, **Then** they can see order
   and status, manually promote any entry, or remove entries.
7. **Given** a paid event, **When** a waitlisted user claims an offered spot, **Then**
   they must complete payment within the claim window to be confirmed.

---

### User Story 4 - Invite-only and link-accessible distribution (Priority: P2)

An organizer runs a private goalie clinic. They set the event to invite-only and invite
specific people by email: existing platform members are notified in-app and by email;
non-members receive an email invitation to join. Only invitees can view or register.
Separately, for a semi-open scrimmage, the organizer sets link-access: the event is not
listed publicly, but anyone holding the shareable link can view and register.

**Why this priority**: Visibility control determines who can even see events; the four
tiers (private/invite-only/link/public) were explicitly requested and unlock private
association workflows. Public/private ship with P1; this story completes the tiers.

**Independent Test**: Create an invite-only event, invite one address, verify a
non-invited signed-in user cannot view or register while the invitee can; create a
link-access event and verify it is reachable only via its link.

**Acceptance Scenarios**:

1. **Given** an invite-only event, **When** a non-invited user attempts to open it,
   **Then** access is denied and the event does not appear in any listing for them.
2. **Given** an invitation to an email address without an account, **When** the recipient
   follows the invitation, **Then** they can create an account and land on the event
   ready to register.
3. **Given** a link-access event, **When** anyone opens the shareable link, **Then** they
   can view the event and register (after signing in), while the event stays absent from
   public listings and search.
4. **Given** a leaked or stale link, **When** the organizer regenerates the event link,
   **Then** the old link stops working.
5. **Given** an organizer, **When** they view invitations, **Then** they see delivery/
   acceptance status per invitee and can re-send or revoke invitations.

---

### User Story 5 - Collecting payment for paid events (Priority: P3)

The association charges $25 per skater for Mite Night. The organizer sets per-slot
pricing (skaters $25; goalies, coaches, and referees free) and
chooses accepted payment methods: online card payment (when the host has connected its
payment account) and/or manual peer-to-peer payment by displaying the association's
Venmo/Zelle/Cash App handles, a contact phone number, or cash-at-the-door instructions.
Online payers are confirmed automatically on successful payment; manual payers are
confirmed immediately but tracked as unpaid until an organizer marks them paid.

**Why this priority**: Most association events charge something, but free events already
deliver the MVP; payment builds on the established online-payment pipeline and adds the
requested manual options.

**Independent Test**: Configure one slot with a price; verify the online flow confirms
only after payment, the manual flow displays the configured handles and tracks
paid/unpaid on the roster, and organizers can refund an online payment.

**Acceptance Scenarios**:

1. **Given** a priced slot and a host with an onboarded payment account, **When** a user
   registers and chooses online payment, **Then** a pending spot is held, they complete
   secure checkout, and confirmation (with receipt) occurs only after payment succeeds.
2. **Given** a pending online payment that is abandoned, **Then** the held spot is
   released after the hold window and returns to availability/waitlist.
3. **Given** manual payment methods configured (e.g., Venmo handle and cash), **When** a
   user registers, **Then** they are confirmed, shown the payment instructions/handles,
   and appear on the organizer roster as "unpaid" until an organizer marks them paid.
4. **Given** a host without an onboarded payment account, **When** they configure a
   priced slot, **Then** only manual payment methods are offered and online payment is
   clearly unavailable.
5. **Given** a hosting league/association, **When** an authorized admin starts payment
   setup, **Then** they can complete hosted onboarding and accept online payments just as
   rink organizations already can.
6. **Given** a confirmed online payment, **When** an organizer issues a refund (e.g.,
   event canceled), **Then** the charge is reversed and the registration reflects the
   refund; canceling a whole paid event prompts the organizer to process refunds.
7. **Given** any registration, **Then** the price captured at registration time is
   authoritative — later price edits never change what an existing registrant owes.

---

### User Story 6 - Delegated event management (Priority: P3)

The association president creates the event, then delegates day-to-day management: the
mite delegate and two event coordinators are added as event managers. They can edit event
details, manage registrations and the waitlist, record manual payments, run check-in, and
form teams — without holding association-wide admin rights. Host-entity admins always
retain full control, and management actions are recorded for accountability.

**Why this priority**: Explicitly required ("mite delegate, event coordinators,
association presidents") and low-risk to add once events exist; until then host-entity
admins can manage events themselves.

**Independent Test**: Add a regular member as event manager; verify they can manage that
one event but no other entity resources, and that their actions appear in the activity
log.

**Acceptance Scenarios**:

1. **Given** a host-entity admin, **When** they add a platform user as a manager of one
   event, **Then** that user can edit the event, manage registrations/waitlist/check-in/
   teams, and moderate media for that event only.
2. **Given** an event manager without host-entity admin rights, **When** they attempt to
   manage a different event or entity settings (e.g., payment account onboarding),
   **Then** access is denied.
3. **Given** any management action (capacity change, manual promotion, mark-paid, refund,
   removal of a participant), **Then** the action is recorded with actor and timestamp
   and visible to host-entity admins.
4. **Given** a host-entity admin, **When** they remove an event manager, **Then** that
   user immediately loses event management access.

---

### User Story 7 - Team formation, games, and rotations on event day (Priority: P4)

After signups close, the mite delegate organizes 44 confirmed skaters/goalies into
event teams — mixing Mite 1 and Mite 2 players onto combined teams, keeping Mite House
players together on their own teams for one side of the rink, and flagging Mite 3 players
as floaters. They schedule games within the event: Team Red vs Team White on the north
half-ice, House Gold vs House Black on the south half-ice, in timed blocks. Floaters are
assigned to rotate through multiple games. Rosters and game assignments are published to
participants, and the games appear on the venue schedule for the reserved ice.

**Why this priority**: High-value differentiator, but only meaningful after registration
(P1–P2) produces confirmed participants. It is the most novel workflow and benefits from
shipping after the signup core is proven.

**Independent Test**: With a set of confirmed registrations, create teams, assign every
skater/goalie, flag two floaters, create two overlapping games on different surfaces/
zones, assign floaters to both, publish, and verify participants see their team and game
assignments while double-booking of non-floaters is flagged.

**Acceptance Scenarios**:

1. **Given** confirmed registrations, **When** an organizer creates event teams and
   assigns participants, **Then** each participant holds one primary team assignment,
   with position counts (skaters/goalies) visible per team for balancing.
2. **Given** players from different club teams (Mite 1, Mite 2), **When** assigned to the
   same event team, **Then** the roster shows each player's origin (club team/level)
   for organizer reference.
3. **Given** a participant flagged as a floater (e.g., Mite 3), **When** games are
   scheduled, **Then** the floater can be added to multiple games' rotations, including
   games between teams they don't primarily belong to.
4. **Given** two games at overlapping times, **When** a non-floater is assigned to both,
   **Then** the organizer is warned of the conflict.
5. **Given** games assigned to a venue surface (full ice, half ice, or cross-ice zone)
   and time window within the event, **Then** the games appear on the event agenda and,
   where the venue is on the platform, on the venue's schedule.
6. **Given** published teams and games, **When** rosters change (late cancellation,
   waitlist promotion), **Then** organizers can adjust assignments and participants are
   notified of changes to their own assignment.

---

### User Story 8 - Photo and video sharing (Priority: P5)

During and after Mite Night, parents and attendees upload photos and short videos to the
event gallery. By default the gallery is visible only to event participants and
organizers (protecting images of minors); the organizer may open it wider. Organizers can
remove any item or disable the gallery; uploaders can delete their own items.

**Why this priority**: Valued community feature, explicitly requested, but independent of
— and less critical than — the signup, payment, and event-day workflows. It also carries
a new infrastructure dependency (file storage).

**Independent Test**: As a confirmed participant, upload a photo and a video within the
allowed size/types; verify a non-participant cannot view the gallery by default, the
organizer can remove items and disable the gallery, and the uploader can delete their own
upload.

**Acceptance Scenarios**:

1. **Given** a confirmed participant or their registering parent, **When** they upload a
   photo/video meeting size and format limits, **Then** it appears in the event gallery
   attributed to them.
2. **Given** the default gallery visibility, **When** a user with no registration on the
   event opens the gallery, **Then** access is denied; **When** the organizer sets the
   gallery to follow the event's public visibility, **Then** it becomes viewable
   accordingly.
3. **Given** an inappropriate upload, **When** an organizer removes it (or a user reports
   it), **Then** it is no longer visible and the action is logged.
4. **Given** an uploader, **When** they delete their own item, **Then** it is removed.
5. **Given** the organizer disables the gallery for the event, **Then** no uploads or
   views are possible.

---

### User Story 9 - Age-gated statistics, outcomes, and tournaments (Priority: P5)

For a Squirt-and-up scrimmage night or a tournament event, organizers record game scores,
outcomes, and basic player statistics, and the event page shows results/standings. For
mite-level (8-and-under) events, score and statistics capture is disabled entirely, in
line with age-appropriate development guidelines — games exist for scheduling and rosters
only.

**Why this priority**: Depends on event games (P4); valuable for tournaments but not
required to replace the current signup tool.

**Independent Test**: Create one 8U event and one Squirt event with games; verify the 8U
event exposes no score/stat entry anywhere, while the Squirt event supports score entry,
results display, and — when marked as a tournament — standings.

**Acceptance Scenarios**:

1. **Given** an event classified at 8-and-under (mite and below), **Then** no score,
   outcome, or statistic can be recorded or displayed for its games.
2. **Given** an event classified Squirt/age 9+ (or age 8+ per the configured threshold),
   **When** an organizer records game scores and optional basic player stats, **Then**
   results appear on the event page for its audience.
3. **Given** an event designated a tournament, **When** games are completed and scored,
   **Then** standings/results roll up on the event page.
4. **Given** an age classification change on an event with recorded stats, **When** the
   new classification falls below the threshold, **Then** existing stats are hidden and
   further entry is blocked.

---

### Edge Cases

- Two registrants race for the final spot in a slot: exactly one confirmation; the other
  gets a friendly "just filled" message and a waitlist offer where enabled.
- Organizer reduces a slot's capacity below the number already confirmed: existing
  confirmations are never revoked automatically; the slot reports over-capacity and
  blocks new registrations until attrition.
- An online payment succeeds after the hold expired and the slot refilled: the payment is
  automatically refunded and the registrant informed (established behavior, reused).
- Payment processing is not configured on the deployment: online payment is hidden;
  free and manual-payment events work fully.
- Registrant cancels after teams/games were published: their assignments are removed and
  organizers are alerted to rebalance.
- Event visibility is tightened after people registered (public → invite-only): existing
  confirmed registrants keep access; new access follows the stricter rule.
- Waitlist offer is claimed at the same moment an organizer manually promotes someone
  else into the last spot: one wins; the other offer is rescinded with notification.
- Invitee's email invitation is forwarded to someone else: for invite-only events the
  invitation is bound to the invited address/account; a different account cannot use it.
- The event spans a time-zone-sensitive audience: all times display in the event venue's
  local time zone with the zone shown explicitly.
- A minor's parent requests removal of media depicting their child: organizers can remove
  any item; removal takes effect immediately.
- Host entity is deleted or its public profile unpublished: its public events stop being
  listed; registered participants retain access to their registrations and history.
- Duplicate participant names across families (two "Liam S."): registrations are distinct
  records; rosters may show registrant contact to organizers for disambiguation.

## Requirements *(mandatory)*

### Functional Requirements

#### Event creation & lifecycle

- **FR-001**: Authorized representatives of a hosting entity — rink/venue organization
  staff with scheduling rights, league/association admins, or team admins — MUST be able
  to create signup events under that entity. Every signup event belongs to exactly one
  hosting entity.
- **FR-002**: A signup event MUST support: title, description, event category (e.g.,
  clinic, scrimmage/game night, tryout, volunteer, fundraiser, tournament, other), age/
  level classification, start/end date-time in the venue's time zone, location (free text
  or a platform venue, optionally specific surfaces), registration open/close times, an
  optional cancellation cutoff for participants, and organizer contact info.
- **FR-003**: Events MUST move through a lifecycle: draft (organizers only) → published →
  completed or canceled. Cancellation MUST notify all registrants and retain the record.
- **FR-004**: Organizers MUST be able to duplicate an existing event (structure, slots,
  settings — not registrations) to create the next occurrence.
- **FR-005**: Material changes to a published event (time, venue, cancellation) MUST
  trigger notification to all registrants.

#### Role slots & capacity

- **FR-006**: An event MUST contain one or more named signup slots (e.g., Goalie, Skater,
  Referee, Coach, Volunteer), each with its own capacity (a positive number or
  unlimited), optional description/eligibility note, and optional price.
- **FR-007**: Capacity MUST be enforced per slot at confirmation time such that a slot is
  never oversold, including under concurrent registration attempts and pending payment
  holds (confirmed + actively-held pending spots count against capacity).
- **FR-008**: Remaining capacity per slot MUST be visible wherever the event can be
  viewed, and organizers MUST see confirmed/pending/waitlisted counts per slot.

#### Visibility & distribution

- **FR-009**: Events MUST support exactly one of four visibility tiers: Private (host
  organizers only), Invite-only (only invited people can view/register), Link (unlisted;
  anyone with the shareable link can view/register), Public (listed on host pages,
  calendars, and discovery).
- **FR-010**: Public events MUST roll up onto the hosting entity's event listings and
  calendars — the rink's public profile/schedule page, the association/league's event
  page and internal calendar, or the team's calendar — and, when held at a platform
  venue, onto that venue's public schedule.
- **FR-011**: Link-visibility events MUST use an unguessable link that organizers can
  regenerate, immediately invalidating the prior link.
- **FR-012**: Organizers MUST be able to invite people by email: existing members receive
  a notification linking to the event; non-members receive an invitation to create an
  account and land on the event. Invitation status (sent/accepted) MUST be trackable,
  re-sendable, and revocable. For invite-only events, registration MUST be limited to
  invited addresses/accounts (plus host organizers).

#### Registration

- **FR-013**: Authenticated users MUST be able to register one or more named participants
  (self, children, spouse) into specific slots of an event they can access, subject to
  slot capacity, the registration window, and phase eligibility. Each participant
  occupies one spot and appears on the roster by name; the registering account remains
  the contact of record.
- **FR-014**: The system MUST prevent duplicate registration of the same participant into
  the same slot.
- **FR-015**: Registrants MUST be able to view their event registrations in one place and
  cancel them until the event's cancellation cutoff; cancellation frees the spot.
- **FR-016**: Registration confirmations, waitlist notifications, cancellation notices,
  and pre-event reminders MUST be sent by email, respecting notification preferences.
- **FR-017**: Organizers MUST have a live roster per slot with participant details,
  payment status, and check-in state; MUST be able to check participants in on event day;
  MUST be able to remove a registration (with notification); and MUST be able to export
  the roster as a spreadsheet file.
- **FR-018**: Public-facing views of an event MUST NOT expose participant personal
  details; at most a first name and last initial appear publicly, and only when the
  organizer enables a public roster. Organizer views show full details.

#### Priority windows & waitlist

- **FR-019**: An event MAY define ordered registration phases, each with an opening time
  and an audience: (a) members of the hosting entity (e.g., association-rostered
  players), (b) selected divisions/teams within the host, (c) explicitly invited people,
  or (d) everyone with view access. Outside an open phase for which a user qualifies,
  the user is offered the waitlist instead of registration.
- **FR-020**: Each slot MAY have a waitlist. Users MUST be able to join it when the slot
  is full or when no phase they qualify for is open, and see their position.
- **FR-021**: When capacity frees or a new phase opens, the system MUST offer spots to
  eligible waitlisted entries in order, notifying each and holding the spot for a
  configurable claim window (default 24 hours, never extending past event start). For
  priced slots, confirmation requires completing payment within the claim window.
  Unclaimed offers expire and pass to the next entry.
- **FR-022**: Organizers MUST be able to view the waitlist in order, manually promote
  any entry out of order, and remove entries.

#### Payments

- **FR-023**: Each priced event MUST declare its accepted payment methods: online payment
  (host's connected payment account), manual peer-to-peer (displaying organizer-
  configured Venmo/Zelle/Cash App handles and/or a phone number), and/or cash in person
  with instructions. Free events skip payment entirely.
- **FR-024**: Online payment MUST reuse the platform's connected-account model: the
  hosting organization is the merchant of record; payment is collected at registration
  via hosted checkout; confirmation occurs only after verified payment; abandoned
  checkouts release their held spot; prices are snapshotted server-side at registration.
- **FR-025**: League/association hosting entities MUST be able to connect and manage a
  payment account (onboarding, status, payouts) equivalently to rink organizations.
  Team-hosted events are limited to manual payment methods.
- **FR-026**: Manual-payment registrations MUST confirm immediately and carry a payment
  status (unpaid/paid/waived) that event managers can update; rosters and exports MUST
  show payment status.
- **FR-027**: Event managers with payment rights MUST be able to refund online payments
  (full refund at minimum); canceling a paid event MUST prompt the organizer to process
  refunds for online payments and flag manual payments for follow-up.

#### Delegated management

- **FR-028**: Host-entity admins MUST be able to grant and revoke per-event management to
  any platform user, without granting entity-wide rights. Event managers can edit the
  event and manage slots, registrations, waitlists, check-in, manual payment status,
  teams/games, and media moderation for that event only. Entity-level settings (payment
  account onboarding, staff management) remain restricted to entity admins.
- **FR-029**: All management actions (publish, capacity change, removal, promotion,
  mark-paid, refund, media removal) MUST be recorded in an activity log with actor and
  timestamp, viewable by host-entity admins.

#### Team formation, games & rotations

- **FR-030**: Organizers MUST be able to create named event teams and assign confirmed
  participants to them. A participant holds at most one primary team assignment per
  event; assignments show each player's origin club team/level where known; per-team
  position counts (skaters, goalies) are visible for balancing.
- **FR-031**: Organizers MUST be able to flag participants as floaters. Floaters MAY be
  added to any game's rotation regardless of primary team; non-floaters assigned to
  overlapping games MUST trigger a conflict warning.
- **FR-032**: Organizers MUST be able to schedule games within an event: two event teams,
  a time window inside the event, and an optional venue surface with ice-usage designation
  (full ice, half ice, cross-ice zone). Games appear on the event agenda and, when tied
  to a platform venue, on the venue's schedule.
- **FR-033**: Organizers MUST be able to publish team rosters and game assignments to
  participants; subsequent assignment changes notify affected participants.

#### Media sharing

- **FR-034**: Event participants and their registering accounts MUST be able to upload
  photos and videos (within defined size/format/duration limits) to an event gallery.
  Default gallery visibility is participants-and-organizers only; the organizer may widen
  it to the event's visibility tier or disable the gallery entirely.
- **FR-035**: Organizers MUST be able to remove any media item; uploaders MUST be able to
  delete their own; viewers MUST be able to report items for organizer review. Removals
  are logged.

#### Statistics & tournaments

- **FR-036**: Every event MUST carry an age/level classification. For events classified
  at or below the configured youth threshold (default: 8-and-under / mite), the system
  MUST NOT allow recording or displaying scores, outcomes, or player statistics for its
  games. At or above the threshold, organizers MAY record game scores/outcomes and basic
  player statistics, displayed to the event's audience.
- **FR-037**: Events designated as tournaments MUST support results rolling up into
  standings on the event page (subject to the same age gate).

#### Cross-cutting

- **FR-038**: Every mutation MUST enforce authentication and authorization appropriate to
  the actor's role (host staff, event manager, registrant, invitee); registration and
  payment states MUST remain consistent under concurrent access; external payment
  notifications MUST be verified and processed idempotently.
- **FR-039**: When the platform's optional integrations (online payments, file storage)
  are not configured on a deployment, the corresponding features MUST degrade gracefully
  (hidden or clearly disabled) without breaking free registration and event management.

### Key Entities

- **Signup Event**: A hosted, schedulable happening with lifecycle status, visibility
  tier, category, age/level classification, timing, venue linkage, registration windows,
  payment configuration, and settings. Belongs to exactly one hosting entity (venue
  organization, league/association, or team).
- **Signup Slot**: A named, capacity-limited role within an event (goalie, skater,
  referee, coach, volunteer…), with optional price and its own waitlist.
- **Registration Phase**: An ordered access window on an event defining when a given
  audience (host members, selected divisions/teams, invitees, everyone) may register.
- **Event Registration**: One named participant's claim on one slot, made by an
  authenticated registrant; carries lifecycle status (pending/confirmed/waitlisted/
  offered/canceled/expired/refunded), participant snapshot, price snapshot, payment
  status, and check-in state.
- **Waitlist Entry / Offer**: Ordered interest in a full or not-yet-open slot; an offer
  is a time-boxed claim on a freed spot.
- **Event Invitation**: An email-bound invitation to view/register, with status tracking;
  the access mechanism for invite-only events.
- **Event Manager Assignment**: A per-event management grant to a platform user.
- **Payment Method Configuration**: The event's accepted methods and displayed
  peer-to-peer handles/phone/cash instructions.
- **Payment Record**: An online payment tied to a registration (reusing the established
  payment model), or a manual payment status tracked on the registration.
- **Event Team**: An organizer-created team within an event with assigned participants
  (primary assignments) and floater designations.
- **Event Game**: A scheduled matchup of two event teams within the event, with time
  window, optional surface/ice-zone, rotation list (participants beyond primary rosters),
  and — where age-permitted — score/outcome.
- **Player Game Participation**: A participant's inclusion in a specific game's rotation.
- **Media Item**: An uploaded photo/video attached to an event, with uploader,
  visibility, and moderation state.
- **Game Result / Player Stat**: Score/outcome and optional basic per-player statistics
  for age-eligible games; tournament standings derive from results.

## Assumptions

- **Hosting entities** map to the platform's existing structures: venue organizations
  (rinks), leagues (associations), and teams. "Organization representatives" map to
  existing staff/admin roles plus the new per-event manager grant.
- **Association-committed players** (priority-window eligibility) are determined by
  membership in the hosting entity — league-rostered players/members for a league host,
  team members for a team host — with organizers able to invite or manually admit
  exceptions. No external eligibility-list import in this feature.
- **Accounts are required to register.** Invitees without accounts are funneled through
  invitation-based signup (established pattern). No anonymous/guest registration.
- **A registrant may register others** (their children, themselves, a spouse) as named
  participants; participants are not required to have their own accounts. Participant
  records may optionally link to existing roster players for team-formation context.
- **Online payments** reuse the existing connected-account (Stripe Connect direct
  charge) pipeline, extended to league/association hosts. Teams do not become merchants;
  team-hosted paid events use manual methods only. Peer-to-peer handles are displayed
  as payment instructions only — the platform does not verify or reconcile Venmo/Zelle/
  Cash App transfers; organizers mark registrations paid manually.
- **Waitlist ordering** is first-come-first-served within eligibility, with manual
  organizer override; the default claim window is 24 hours, clamped to event start.
- **Media storage** requires introducing the platform's first object/file storage
  integration; the specific provider is selected during planning. Reasonable default
  limits (per-file size caps, common image/video formats, short-video duration cap)
  are set during planning.
- **The age-gate threshold** follows USA Hockey ADM guidance: no scores/stats at 8U
  (mite) and below; enabled for Squirt (9–10) and above. The threshold is a platform
  configuration, defaulting to "8-and-under blocked".
- **Recurring event series** are out of scope; the duplicate-event capability covers
  repeated occurrences. A future enhancement may add true series.
- **Time zones**: events display in the venue's/host's local time zone (existing venue
  time-zone data), shown explicitly.
- **Minor privacy**: public pages never show participant contact details; roster
  publicity is opt-in and limited to first name + last initial; media galleries default
  to participants-only visibility.

## Out of Scope

- Recurring/series signup events (use duplication instead).
- Automated reconciliation of peer-to-peer payments (Venmo/Zelle/Cash App APIs).
- Partial refunds and organizer-side payment plans/installments.
- Automatic team balancing/generation from skill data (manual formation with balancing
  aids only).
- Bracket generation and advanced tournament seeding (standings from recorded results
  only; bracket tooling is a future enhancement).
- In-app chat or comment threads on events.
- Advanced media features (albums, tagging, transcoding pipelines beyond basic playback).
- Cross-platform calendar subscriptions (ICS feeds) — worthwhile follow-up, not required
  to replace the current signup tool.

## Dependencies

- Established capacity-enforced registration and connected-account payment pipeline
  (feature 003) — reused and generalized.
- Venue organizations, staff roles, surfaces, public rink pages (feature 002) — hosts
  and calendar-rollup surfaces.
- League/association and team structures with role hierarchies — hosts and
  priority-window audiences.
- New platform capability: object/file storage for media uploads (first use).
- Email delivery for invitations, confirmations, waitlist offers, and reminders
  (existing service).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An association coordinator can create and publish a multi-slot event
  (4 goalies / 40 skaters / 4 refs / 8 coaches) in under 10 minutes without assistance.
- **SC-002**: A parent can find a public event and complete a free registration for
  their child in under 2 minutes; paid online registration completes in under 4 minutes.
- **SC-003**: Slots are never oversold: across all concurrent-registration tests and
  production events, confirmed registrations never exceed slot capacity.
- **SC-004**: The full "Mite Night" scenario runs end-to-end on the platform: members-
  first window, public backfill from the waitlist with automatic offers, per-slot
  capacity, payment collection, team formation with floaters across simultaneous
  half-ice games, and post-event photo sharing — with no external signup tool involved.
- **SC-005**: Waitlist backfill requires zero organizer intervention in the default
  flow: a freed spot produces an ordered offer and notification within 1 minute.
- **SC-006**: 100% of the hosting association's signup events for a season can be run
  on the platform, fully replacing the current third-party signup tool.
- **SC-007**: Public events appear on the correct host and venue pages/calendars within
  1 minute of publishing; private/link events never appear in public listings.
- **SC-008**: For events below the age threshold, no score or statistic is ever
  displayed or recordable; for eligible events, organizers can record a game result in
  under 1 minute.
- **SC-009**: Event managers can run event-day check-in at a rate of at least 5
  participants per minute using the roster view.

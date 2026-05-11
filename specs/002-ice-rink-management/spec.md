# Feature Specification: Ice Rink Management

**Feature Branch**: `002-ice-rink-management`  
**Created**: 2026-05-10  
**Status**: Draft  
**Input**: User description: "Create ice rink management for rink and venue organizations to sign up, brand their profile, upload a logo, publish venue information and content, define operating hours and recurring schedule blocks for open skate, stick and pick, figure skating, specialty events, lessons, and available ice time, price scheduled events and blocks, offer ice time to teams coaches and organizations, invite teams to designate preferred or home rink status, and optionally track USA skating and hockey levels."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Rink owner creates branded venue profile (Priority: P1)

A rink or venue owner signs up as an organization, creates a public venue profile, uploads a logo, selects brand colors, sets the venue type, and publishes essential information such as name, description, address, contact details, amenities, and policies.

**Why this priority**: The venue profile is the foundation for discovery, scheduling, booking, team relationships, and public communications.

**Independent Test**: Can be fully tested by creating a new rink organization, completing required venue profile fields, uploading a logo, selecting brand colors, publishing the profile, and confirming the public-facing profile displays the same information.

**Acceptance Scenarios**:

1. **Given** a new rink owner account, **When** the owner completes the organization and venue profile setup, **Then** the rink profile is saved as a draft or published profile with name, description, address, logo, brand colors, type, and contact details.
2. **Given** a published rink profile, **When** a visitor views the venue page, **Then** the visitor sees the branded rink information, logo, description, address, and current public contact details.
3. **Given** an incomplete venue profile, **When** the owner attempts to publish it, **Then** the system clearly identifies the missing required fields and keeps the profile unpublished.

---

### User Story 2 - Rink manager defines operating schedules and recurring programs (Priority: P1)

A rink manager defines standard operating hours and recurring schedule blocks for open skate, stick and pick, free skating, figure skating, specialty events, lessons, and available ice time. Each block can have visibility, capacity, eligibility, and pricing details.

**Why this priority**: Scheduling and program availability are the core operational value for rinks and the primary reason teams, coaches, and skaters will interact with the feature.

**Independent Test**: Can be fully tested by creating weekly operating hours, adding recurring event blocks with prices and capacities, and confirming the generated schedule is visible to the intended audience.

**Acceptance Scenarios**:

1. **Given** a rink manager with a venue profile, **When** the manager creates weekly operating hours, **Then** the venue schedule reflects those hours for each selected day.
2. **Given** a weekly schedule, **When** the manager adds a recurring open skate or stick and pick block with price, capacity, and audience, **Then** matching schedule instances appear for the selected recurrence period.
3. **Given** a schedule block with restricted visibility, **When** a user outside the allowed audience views the calendar, **Then** the block is hidden or shown as unavailable according to the manager's visibility setting.
4. **Given** a conflict between a specialty event and normal operating hours, **When** the manager saves the specialty event, **Then** the schedule shows the specialty event as overriding or blocking the normal availability for that time.

---

### User Story 3 - Teams, coaches, and organizations request available ice time (Priority: P2)

A team, coach, or organization browses a rink's available ice time, filters by date, time, activity type, and price, and submits a request or booking inquiry for a selected block.

**Why this priority**: Offering available ice time to teams, coaches, and organizations creates the marketplace-style value that connects rink operations with existing OpenLeague team management.

**Independent Test**: Can be fully tested by publishing available ice time, browsing it as a team admin or coach, submitting a request, and confirming the rink manager can view and respond to the request.

**Acceptance Scenarios**:

1. **Given** a rink has published available ice time, **When** a team admin browses the rink calendar, **Then** the admin can filter and view available blocks with date, time, activity type, price, and request status.
2. **Given** a team admin selects an available block, **When** the admin submits a request with team details and notes, **Then** the rink manager receives the request and the requester sees the request status.
3. **Given** a block is no longer available, **When** a user attempts to request it, **Then** the system prevents the request and explains that the time is unavailable.

---

### User Story 4 - Rink publishes lessons, events, and venue content (Priority: P3)

A rink owner or authorized staff member publishes public lessons, private lesson offerings, specialty events, announcements, posts, and blog-style content to keep skaters, families, teams, and partner organizations informed.

**Why this priority**: Content and event publishing helps rinks promote programs and communicate beyond raw schedule availability, but it can build on the profile and scheduling foundation.

**Independent Test**: Can be fully tested by creating a lesson offering, publishing a specialty event, adding a venue post, and confirming each appears in the correct public and manager views.

**Acceptance Scenarios**:

1. **Given** a rink staff member has content permissions, **When** they publish a rink post or announcement, **Then** it appears on the venue profile with publish date, title, content, and status.
2. **Given** a rink offers public or private lessons, **When** the manager creates lesson offerings with level, instructor, price, and availability, **Then** visitors can view the offering and understand how to request or register.
3. **Given** a specialty event has a date, time, capacity, and price, **When** it is published, **Then** it appears in the venue calendar and event listings.

---

### User Story 5 - Rink builds preferred and home venue relationships (Priority: P3)

A rink owner invites teams, coaches, or organizations to designate the rink as a preferred or home venue, and authorized team or organization admins accept, reject, or manage that relationship.

**Why this priority**: Preferred and home rink relationships tie venue management into team operations and support recurring partnerships.

**Independent Test**: Can be fully tested by sending an invitation from a rink to a team, accepting it as a team admin, and confirming both the rink and team show the resulting relationship.

**Acceptance Scenarios**:

1. **Given** a rink owner has a published rink profile, **When** the owner invites a team to designate the rink as preferred or home venue, **Then** the team admin receives an invitation with the relationship type and rink details.
2. **Given** a team admin receives a venue relationship invitation, **When** the admin accepts it, **Then** the relationship appears on both the team and rink profiles.
3. **Given** an existing preferred or home venue relationship, **When** either authorized party removes it, **Then** the relationship no longer appears as active while preserving a history of the change.

---

### User Story 6 - Rink tracks skating and hockey levels for programs (Priority: P4)

A rink or program manager associates lesson offerings, events, or eligibility requirements with recognized skating and hockey levels so skaters and families can find appropriate programs.

**Why this priority**: Skill-level tracking improves program fit and supports future integration with skating and hockey governing bodies, but it is not required for the initial venue and schedule workflow.

**Independent Test**: Can be fully tested by adding level labels to lesson offerings and confirming users can filter or read program eligibility by level.

**Acceptance Scenarios**:

1. **Given** a rink offers lessons, **When** the manager assigns skating or hockey level guidance to a lesson offering, **Then** the lesson listing shows the required or recommended level.
2. **Given** a skater or parent browses programs, **When** they filter by skating or hockey level, **Then** matching programs are shown and unrelated programs are excluded.
3. **Given** no official level system is selected for a program, **When** the program is displayed, **Then** the level field is optional and does not block publication.

---

### Edge Cases

- A venue has multiple ice sheets, rooms, or activity areas with different schedules, capacities, or pricing.
- A recurring schedule block crosses midnight, spans holidays, or overlaps a closure.
- A rink updates standard hours after future schedule blocks already exist.
- A booking request is submitted while a manager is editing or removing the same availability block.
- A logo upload fails, uses an unsupported file type, or exceeds size limits.
- A rink changes brand colors after publishing; existing public pages and future content should reflect the new branding consistently.
- A team relationship invitation is sent to the wrong contact, expires, is rejected, or is accepted by someone without authority.
- A published price changes after a user has already requested a block or lesson.
- A private lesson offering has instructor-specific availability that differs from general rink availability.
- Public content is drafted, scheduled for later publication, unpublished, or archived.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow a venue owner to create a rink or venue organization profile with name, type, description, address, contact details, amenities, policies, brand colors, and logo.
- **FR-002**: System MUST support draft and published states for venue profiles so incomplete or internal profiles are not publicly visible.
- **FR-003**: System MUST validate required profile fields before publication and show user-readable correction guidance.
- **FR-004**: System MUST allow authorized venue staff to upload, replace, preview, and remove a venue logo.
- **FR-005**: System MUST allow authorized venue staff to select and update brand colors used on public venue surfaces.
- **FR-006**: System MUST allow authorized venue staff to define standard operating hours by day of week, including closures and exceptions.
- **FR-007**: System MUST allow authorized venue staff to create recurring and one-time schedule blocks for open skate, stick and pick, free skating, figure skating, specialty events, private lessons, public lessons, team ice, organization ice, rentals, closures, and other custom activity types.
- **FR-008**: System MUST allow schedule blocks to include start time, end time, recurrence, activity type, visibility, capacity, price, description, and status.
- **FR-009**: System MUST detect and communicate schedule conflicts before publication or booking availability is confirmed.
- **FR-010**: System MUST allow managers to set different prices for different scheduled events, programs, lessons, and ice-time blocks.
- **FR-011**: System MUST allow rinks to mark ice-time blocks as available to teams, coaches, organizations, the public, or invite-only audiences.
- **FR-012**: System MUST allow teams, coaches, and organizations to browse available ice time and submit booking or inquiry requests with relevant organization and contact details.
- **FR-013**: System MUST track the lifecycle of each ice-time request from submitted through accepted, declined, canceled, or expired.
- **FR-014**: System MUST notify relevant rink and requester contacts when an ice-time request changes status.
- **FR-015**: System MUST allow rinks to publish public lesson offerings and private lesson offerings with availability, pricing, instructor or program information, level guidance, and registration or inquiry instructions.
- **FR-016**: System MUST allow rinks to publish specialty events with date, time, capacity, price, description, visibility, and status.
- **FR-017**: System MUST allow authorized venue staff to create, edit, publish, unpublish, schedule, and archive posts or blog-style venue content.
- **FR-018**: System MUST allow rink owners to invite teams, coaches, and organizations to designate the venue as a preferred venue or home venue.
- **FR-019**: System MUST allow authorized recipients to accept, reject, remove, or view preferred and home venue relationships.
- **FR-020**: System MUST preserve a history of venue relationship invitations and status changes.
- **FR-021**: System MUST support optional skating and hockey level labels for lessons, events, and eligibility guidance, including recognized USA skating and hockey level systems where applicable.
- **FR-022**: System MUST allow users to filter venue schedules, lessons, and events by date, activity type, audience, price range, availability, and level when those attributes are present.
- **FR-023**: System MUST enforce role-based permissions so only authorized venue owners and staff can edit venue settings, schedules, pricing, content, invitations, and request decisions.
- **FR-024**: System MUST distinguish public-facing venue information from manager-only operational notes, request details, and private contact information.
- **FR-025**: System MUST provide clear user-facing audit or activity history for significant venue management changes, including profile publication, schedule changes, pricing changes, content publication, and relationship changes.

### Key Entities *(include if feature involves data)*

- **Venue Organization**: A rink, ice facility, skating center, arena, or venue entity that can own one or more public venue profiles and manage staff access.
- **Venue Profile**: Public and administrative information for a specific venue, including name, description, address, logo, brand colors, venue type, contact details, amenities, and publication status.
- **Venue Staff Role**: A permission assignment granting a user authority to manage venue settings, schedules, pricing, content, invitations, or requests.
- **Ice Surface or Activity Area**: A bookable rink sheet, studio, room, or area within a venue with its own schedule and capacity.
- **Operating Hours**: Standard and exception-based hours that describe when the venue or a specific area is open, closed, or restricted.
- **Schedule Block**: A recurring or one-time calendar item representing a program, event, lesson, available ice time, rental, closure, or other venue activity.
- **Pricing Rule**: Price and charge information for a schedule block, lesson, event, or bookable availability.
- **Ice-Time Request**: A request from a team, coach, organization, or individual to use a published available ice-time block.
- **Lesson Offering**: A public or private instruction opportunity with availability, pricing, instructor or program details, and optional skill-level guidance.
- **Venue Event**: A public or private event hosted by the venue, such as competitions, specialty skates, clinics, camps, showcases, or community events.
- **Venue Content Post**: A post, article, announcement, or blog-style content item associated with a venue profile.
- **Venue Relationship**: A preferred or home venue designation between a rink and a team, coach, organization, or league.
- **Skill Level Reference**: A skating or hockey level label used to guide program eligibility, filtering, and communication.

## Assumptions

- The first release focuses on request and inquiry workflows for ice-time and lessons; direct payment collection can be planned separately unless explicitly added later.
- Rinks may have one or more bookable surfaces or activity areas, but a single-surface rink remains easy to configure.
- Venue profiles and public schedules are discoverable by unauthenticated visitors when published, while requests and relationship actions require an authenticated user with the appropriate role.
- USA skating and hockey levels are represented as optional labels and filters first, with deeper external verification or governing-body integrations treated as future enhancements.
- Existing teams, leagues, coaches, and organizations can be connected to venues through invitations and relationship records rather than requiring duplicate accounts.
- Pricing shown to users is informational for the initial request workflow unless a later plan adds checkout, deposits, invoices, or payment processing.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new rink owner can create and publish a complete branded venue profile in under 10 minutes.
- **SC-002**: A rink manager can create a weekly operating schedule with at least 5 recurring program blocks in under 15 minutes.
- **SC-003**: A team admin or coach can find an available ice-time block and submit a request in under 3 minutes.
- **SC-004**: At least 90% of required venue setup errors are shown inline with clear corrective guidance before publication.
- **SC-005**: A public visitor can identify the venue address, contact details, current schedule, and available programs from a published venue profile without signing in.
- **SC-006**: A rink manager can publish or update a lesson offering, specialty event, or venue post in under 5 minutes.
- **SC-007**: A preferred or home venue invitation can be sent, accepted, and reflected on both related profiles without manual support intervention.
- **SC-008**: Users browsing schedules can narrow listings by date and activity type with no more than 2 filtering actions.
- **SC-009**: Schedule conflict messaging prevents accidental double-publication for overlapping blocks in 95% of standard manager workflows.
- **SC-010**: Pilot rink managers report that venue profile, schedule, availability, and relationship management are understandable without training in at least 80% of usability-test sessions.

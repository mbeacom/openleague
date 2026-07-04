# Feature Specification: Venue Surface Segmentation & Spatial Layout

**Feature Branch**: `006-surface-segmentation`
**Created**: 2026-07-04
**Status**: Draft
**Input**: User description: "Venue surface segmentation & spatial layout. Surfaces (rinks, courts, fields, studios) become divisible into first-class bookable segments — full, half, cross (for ice), and custom zones — so two half-ice bookings can coexist on one sheet while a full-ice booking blocks everything, enabling private lessons, custom events, and partial-surface scheduling. Venue staff manage surfaces and their segmentation schemes (finishing the currently read-only surface admin UI from spec 002: create/edit/archive surfaces, operating hours) with sensible presets per surface type and fully custom zones. A single unified availability/occupancy source covers venue schedule blocks, signup-event games, season games, and team calendar events with segment-aware conflict math, replacing today's three fragmented conflict checkers that cannot see each other. Game and event scheduling flows (season games, signup-event games, venue schedule blocks) select structured segments instead of the current display-only ice-usage enum + free-text zone labels (replace outright — pre-launch, no data migration). Venues also get a spatial/visual layout editor: position surfaces on a venue map (where each rink sits, entrances/labels), shown on public rink profiles and used to enrich segment/surface pickers. Practice sessions gain optional venue/surface booking so practice-planner demand participates in availability. Paid/exclusive segment rentals are explicitly out of scope (planned spec 007)."

## Context & Problem

Venues already support multiple surfaces per facility, but a surface is the finest unit anything can book: two half-ice sessions cannot legally share one sheet at the same hour, even though that is how youth hockey actually operates (ADM cross-ice games, private lessons on one end, skills stations). Today's only partial-surface vocabulary — a display-only "ice usage" value and a free-text zone label on games — carries no availability meaning, so it neither prevents double-booking nor permits legitimate sharing.

Availability itself is fragmented into three checkers that cannot see each other: venue schedule blocks check only other blocks, team calendar events check only other events at venue granularity, and season games check blocks and events but nothing checks *them* from the venue side. A rink can sell an open-skate block on the same sheet and hour as a published tournament game with no warning. Practice sessions are not venue-linked at all, so practice demand is invisible everywhere.

Finally, the venue-admin surface screens shipped read-only: staff cannot create or edit surfaces, segmentation, or hours from the UI, and venues have no way to describe their physical layout — which rink is which, and where things are — to visiting families.

This feature makes segments first-class bookable inventory with correct sharing math, unifies availability across every booking source, finishes the surface management UI, adds a spatial layout editor surfaced on public rink profiles, and brings practice sessions into the availability picture. Paid/exclusive segment rentals build on this in the next feature.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Manage surfaces and segmentation schemes (Priority: P1)

A venue staff member with scheduling rights manages the venue's surfaces from the venue admin area — creating, editing, and archiving surfaces and their operating hours (completing the management UI whose data layer already exists). For each surface they define how it may be divided: applying a preset appropriate to the surface type (an ice sheet offers full ice, two halves, and cross-ice zones; a court offers full and half court; other types offer whole-surface only) or defining custom named zones (e.g., "Studio corner", "South third") for private lessons and specialty programming. Each segment can be deactivated when no longer offered.

**Why this priority**: Segments are the inventory everything else in this feature books against; and surface management is a shipped-schema/no-UI gap that blocks venues from self-serving at all today.

**Independent Test**: A venue staff member takes a new or already-existing ice surface, applies the ice preset (full + 2 halves + 4 cross zones), renames "North half" to "Blue end", adds a custom zone, sets operating hours — all from the venue admin UI without developer involvement.

**Acceptance Scenarios**:

1. **Given** a venue with staff scheduling rights, **When** the staff member creates a surface with a name and type, **Then** it appears in the venue's surface list and in scheduling pickers, and its whole-surface segment exists implicitly (the whole-surface segment always exists and can never be deactivated).
2. **Given** an ice-type surface (new or pre-existing), **When** the staff member applies the ice preset, **Then** two half-ice and four cross-ice segments are created with correct coexistence relationships (the two halves coexist with each other; all four cross zones coexist with one another and with the opposite half, but conflict with their containing half; nothing coexists with the whole surface). The preset's "full ice" is the surface's implicit whole-surface segment (renameable), never a duplicate entry.
3. **Given** any surface, **When** the staff member adds a custom zone, **Then** they name it and draw it on a schematic of the surface; the system suggests coexistence relationships from the drawn geometry (zones that don't visually overlap are suggested to coexist; overlapping zones default to conflict), and the staff member confirms or overrides each suggestion before saving — because physical coexistence isn't purely spatial (noise, shared boards, skater flow). Declarations are symmetric pair-level facts — if A coexists with B, B coexists with A — and remain the stored source of truth.
4. **Given** preset segments, **When** the staff member views a surface's segmentation, **Then** each preset segment appears pre-drawn in its standard position on the surface schematic (halves, cross zones), making the scheme visually self-explanatory; dragging or redrawing a zone re-runs the coexistence suggestions for confirmation.
5. **Given** a segment with no future bookings, **When** the staff member deactivates it, **Then** it disappears from booking pickers while historical bookings still display it.
6. **Given** a segment with future bookings, **When** the staff member attempts to deactivate it, **Then** the system lists the affected bookings and requires them to be moved or canceled first.
7. **Given** a surface or the venue as a whole, **When** the staff member edits per-surface or venue-wide operating hours, **Then** bookings outside those hours produce a warning at scheduling time (not a hard block).

---

### User Story 2 - One availability answer, segment-aware (Priority: P2)

Every scheduling flow asks one availability question and gets one answer. When anyone checks or books time on a surface — a venue schedule block, a signup-event game, a season game, a team calendar event, or a venue-attached practice — the system evaluates all of them together with segment-aware math: a whole-surface booking blocks everything on that surface; bookings on segments declared to coexist (the two halves of a sheet) proceed without warnings; bookings on segments that physically overlap (a half and its own cross zones, or anything with the whole surface) warn. Warnings identify the conflicting booking and its source, and proceeding still requires the explicit recorded override introduced in season scheduling. Venue staff also finally *see* everything: the venue schedule view lists bookings from every source on their surfaces, labeled by origin.

**Why this priority**: This is the keystone. Without unified segment-aware availability, segments are just labels again — and the double-booking blind spots between subsystems remain.

**Independent Test**: On one sheet at the same hour: book "North half" via a venue schedule block and "South half" via a season game — no warnings; then attempt a full-ice signup-event game — warned against both, listing each with its source; override records who and when.

**Acceptance Scenarios**:

1. **Given** a published venue schedule block on "North half" from 6–7pm, **When** a season game is scheduled on "South half" 6–7pm on the same sheet, **Then** no conflict warning is raised.
2. **Given** the same block, **When** a season game is scheduled on full ice 6–7pm, **Then** a conflict warning identifies the block, and scheduling proceeds only with an explicit recorded override.
3. **Given** a published signup-event game on a cross-ice zone, **When** a venue schedule block is created over the containing half at the same time, **Then** the block creation flow warns about the game (venue staff finally see event bookings).
4. **Given** a team calendar event at a venue (team events are always venue-wide claims — surface granularity reaches calendars only via linked games), **When** any surface booking is attempted at that venue and time, **Then** a warning is raised.
5. **Given** a draft (unpublished) season game, **When** availability is evaluated, **Then** the draft does not occupy time (consistent with existing draft semantics).
6. **Given** any two bookings that only touch (one ends exactly when the other starts), **When** availability is evaluated, **Then** no conflict is raised.
7. **Given** a published venue schedule block on a surface, **When** a team admin creates a plain team calendar event at that venue and time, **Then** the event creation flow warns citing the block and requires the explicit recorded override to proceed.
8. **Given** bookings from every source on a venue's surfaces, **When** venue staff open the venue schedule view, **Then** all of them are listed for the selected window, each labeled with its source type.

---

### User Story 3 - Book segments from every scheduling flow (Priority: P3)

Organizers pick a structured segment wherever they schedule: season games, signup-event games, and venue schedule blocks offer a segment choice (defaulting to the whole surface) once a surface is selected. The old free-text zone label and display-only usage value are replaced by the segment's name everywhere games and schedules are shown — public event pages, rink schedules, team calendars — so "Cross-ice zone 2" is data, not typing. Sport-aware presentation carries over from season scheduling: ice vocabulary appears only for ice surfaces.

**Why this priority**: This is where segments become useful to organizers day-to-day; it depends on US1 (segments exist) and US2 (picking one means something).

**Independent Test**: Schedule a signup-event mite game on "Cross-ice zone 1" and a season game on "North half" of the same sheet at the same hour — the cross-zone game warns (zone 1 is inside North half) while a "South half" game would not; public event page shows the segment name.

**Acceptance Scenarios**:

1. **Given** a surface with segments, **When** an organizer schedules a season game or signup-event game there, **Then** a segment picker appears (whole surface preselected) listing active segments by name.
2. **Given** a surface with no defined segments beyond the whole surface, **When** an organizer schedules there, **Then** no segment picker appears and the booking is whole-surface.
3. **Given** a booked segment, **When** the game or block is displayed anywhere (admin tables, public event pages, rink schedule pages, calendars), **Then** the segment name is shown in place of the former free-text zone label.
4. **Given** the replacement of the legacy fields, **When** the platform is inspected, **Then** no scheduling flow offers a free-text zone label or a display-only usage value; partial-surface intent is expressed only through segments (pre-launch — replaced outright, no data migration).
5. **Given** a venue schedule block, **When** staff create it for a segment rather than a whole surface, **Then** the same segment-aware availability governs it (enabling half-sheet public programming alongside a lesson on the other half).

---

### User Story 4 - Spatial venue layout editor and public map (Priority: P4)

Venue staff lay out their facility visually: placing each surface on a simple schematic canvas (position, size, rotation), and adding text labels for landmarks (entrances, lobby, locker rooms, parking). The layout appears on the venue's public rink profile so visiting families can see which rink is which and where to go, and scheduling pickers can show the mini-map to disambiguate similarly named surfaces. Venues without a layout keep today's list presentation.

**Why this priority**: High owner-requested value for wayfinding and professionalism, but nothing else in this feature depends on it.

**Independent Test**: Staff arrange a two-rink facility with an entrance label in under five minutes; the public rink profile renders the schematic; deleting the layout falls back to the list view.

**Acceptance Scenarios**:

1. **Given** venue staff with profile rights, **When** they open the layout editor, **Then** each active surface is available to place on a schematic canvas with position, size, and rotation, plus free-text landmark labels.
2. **Given** a saved layout, **When** anyone views the venue's public profile, **Then** the schematic renders with surface names, and works on mobile.
3. **Given** no saved layout, **When** the public profile is viewed, **Then** the existing non-map presentation is used (layout is optional).
4. **Given** a surface archived after being placed, **When** the layout is next viewed or edited, **Then** the archived surface is flagged in the editor and hidden from the public schematic.

---

### User Story 5 - Practice sessions join the availability picture (Priority: P5)

A coach planning practice in the practice planner can optionally attach a venue, surface, and segment (practices are a primary consumer of half-ice and station-based ice). Once attached, the practice occupies that time in unified availability — venue staff see it on their side, and other bookings warn against it — and the practice itself warns the coach when the chosen slot is already taken.

**Why this priority**: Completes availability coverage, but practices function today without venue links, so this is additive.

**Independent Test**: Attach a practice to "North half" 5–6pm; a venue schedule block on full ice 5–6pm now warns citing the practice; the practice planner shows a warning when scheduling over an existing block.

**Acceptance Scenarios**:

1. **Given** a practice session in the planner, **When** the coach sets a venue (and optionally surface and segment) and a start time with duration, **Then** the practice appears in unified availability for that slot.
2. **Given** an existing booking on the same segment and time, **When** the coach attaches that slot to a practice, **Then** the planner warns and allows an explicit override (same policy as games).
3. **Given** a practice with no venue attached, **When** availability is evaluated anywhere, **Then** the practice has no availability footprint (fully backward compatible).

---

### Edge Cases

- **Preset re-application**: Applying a preset to a surface that already has segments adds only missing preset segments (matched by preset role, so renames don't cause duplicates) and never deletes existing ones.
- **Custom zone coexistence edits**: When a zone's coexistence declarations are edited, the editor surfaces any future bookings that become conflicting and requires confirmation (FR-007); subsequent evaluation uses the new declarations; past bookings are untouched and nothing is auto-invalidated.
- **Segment rename**: Renaming a segment updates all displays (it is data, not text on bookings).
- **Surface archive with future bookings**: Archiving a surface follows the same rule as segments — future bookings must be moved or canceled first; historical bookings keep displaying the archived surface.
- **Whole-surface as a segment**: "Whole surface" is always available even when no segmentation is defined, and always conflicts with every segment of that surface.
- **Operating-hours conflicts are warnings, not blocks**: A booking outside operating hours warns (venues host special events); the warning is distinct from a double-booking conflict.
- **Cross-venue no-op**: Segments and layouts are strictly per-surface/per-venue; nothing about one venue's definitions affects another's availability.
- **Layout scale**: The layout is schematic, not to scale; the editor warns on visually overlapping placements but layout geometry never affects availability.
- **Concurrent staff edits**: Segmentation and layout edits follow last-write-wins with the venue activity log recording who changed what (consistent with existing venue admin behavior).
- **Availability performance**: Availability checks span all five booking sources without noticeably slowing scheduling forms (bounded by SC-008).

## Requirements *(mandatory)*

### Functional Requirements

#### Surface management (completing spec 002's UI)

- **FR-001**: Venue staff with scheduling rights MUST be able to create, edit, and archive surfaces (name, type, capacity, notes, display order) from the venue admin UI; archiving follows the future-bookings rule (FR-007).
- **FR-002**: Venue staff MUST be able to manage per-surface and venue-wide operating hours from the venue admin UI; bookings outside operating hours produce a distinct warning at scheduling time.

#### Segmentation

- **FR-003**: Each surface MUST support a set of named segments; the whole surface is always bookable and conflicts with every segment of that surface.
- **FR-004**: The system MUST provide segmentation presets by surface type — ice: two halves and four cross-ice zones (the preset's "full ice" is the implicit whole-surface segment, renameable, never duplicated); court: two halves; all other types: whole surface only — applied in one action to new or existing surfaces and individually renameable afterward. Preset segments retain their preset role, so re-application matches by role (adding only missing segments) regardless of renames.
- **FR-005**: Venue staff MUST be able to define custom named zones on any surface by drawing them on a schematic of that surface. The system MUST derive suggested coexistence relationships from the drawn geometry — non-overlapping zones suggested to coexist, overlapping zones defaulting to conflict — and staff MUST confirm or override each suggestion before saving ("geometry proposes, declarations decide"). Confirmed declarations are symmetric pair-level facts and the stored source of truth for conflict math; relationships never silently follow later geometry edits without reconfirmation. Undeclared relationships default to conflicting (safe default). Preset segments ship pre-drawn in standard positions.
- **FR-006**: Two segments of the same surface either coexist (bookable at overlapping times without conflict) or physically overlap (conflict), as defined by the preset or staff declarations. Ice preset relationships: the two halves coexist with each other; all four cross zones coexist with one another and with the opposite half; every cross zone conflicts with its containing half; the whole-surface segment conflicts with every segment.
- **FR-007**: Deactivating or archiving a segment (or surface) with future bookings MUST be refused with a list of the affected bookings; without future bookings it MUST succeed and hide the segment from pickers while preserving historical display. The whole-surface segment can never be deactivated. Editing a zone's coexistence declarations MUST show any future bookings that become conflicting and require confirmation; saved bookings are never automatically invalidated.

#### Unified availability

- **FR-008**: The system MUST answer availability from a single source covering five booking types: published venue schedule blocks (recurring blocks occupy each expanded occurrence within the evaluated window), non-canceled games of signup events in published status, published season games, team calendar events, and venue-attached practice sessions.
- **FR-009**: Conflict evaluation MUST be segment-aware: whole-surface bookings conflict with everything on the surface; segment bookings conflict only with bookings on physically overlapping segments (per FR-006); venue-wide bookings (no surface) conflict with everything at the venue. Plain team calendar events remain venue-wide claims — surface/segment granularity reaches team calendars only through their linked games.
- **FR-010**: Every scheduling flow (blocks, signup-event games, season games, team events, practices) MUST use the unified availability answer for its conflict warnings, retiring the current per-subsystem checkers.
- **FR-011**: Conflict warnings MUST identify each conflicting booking's title, time, and source type; proceeding despite conflicts MUST require the explicit recorded override (actor and time), consistent with season scheduling.
- **FR-012**: Draft (unpublished) games MUST NOT occupy availability; canceled bookings MUST NOT occupy availability; bookings that merely touch at a boundary instant MUST NOT conflict.
- **FR-021**: The venue admin schedule view MUST display bookings from all five sources on the venue's surfaces for a selected window, labeled by source type (giving venue staff full visibility of event/game demand for the first time).

#### Scheduling integration

- **FR-013**: Season games, signup-event games, and venue schedule blocks MUST offer a segment choice once a surface is selected (whole surface preselected; picker hidden when the surface has no segments); only active segments of the selected surface are offered.
- **FR-014**: The free-text zone label and the display-only surface-usage value on games MUST be removed and replaced by the structured segment reference across all creation flows and all displays (admin, public pages, calendars). Pre-launch: replaced outright, no data migration.
- **FR-015**: Segment presentation MUST follow the sport/surface-type capability catalog: ice vocabulary only for ice surfaces; neutral naming elsewhere; fields with no options hidden.

#### Spatial layout

- **FR-016**: Venue staff with profile rights MUST be able to create and edit a schematic layout: place each active surface (position, size, rotation) and add free-text landmark labels; the layout is optional per venue. The editor warns on visually overlapping placements; layout geometry never affects availability.
- **FR-017**: A saved layout MUST render on the venue's public profile (mobile-friendly); venues without a layout keep the existing presentation.
- **FR-018**: Archived surfaces MUST be flagged in the layout editor and excluded from the public schematic.

#### Practice sessions

- **FR-019**: Practice sessions MUST support an optional venue attachment (with optional surface and segment); attaching a venue REQUIRES a start time, which combines with the practice's existing duration to form its slot (today practices carry only a date and duration). Attached practices participate in unified availability in both directions (they warn others; the planner warns the coach), with the same override policy. Practices without a venue attachment have no availability footprint and behave exactly as today.

#### Permissions & audit

- **FR-020**: Surface, segmentation, and layout management MUST respect existing venue staff roles (scheduling rights for surfaces/segments/hours; profile rights for the public layout); segmentation and layout changes MUST be recorded in the venue activity log.

### Key Entities

- **Surface** (existing): a bookable sheet/court/field/room at a venue; gains manageability from the UI and an optional place in the venue layout.
- **Segment**: a named, bookable subdivision of a surface — preset kinds (half, cross) or custom zones — with declared coexistence relationships to other segments of the same surface, and an active flag. The whole-surface segment always exists implicitly and can never be deactivated.
- **Coexistence relationship**: the symmetric pair-level declaration of which segments can operate simultaneously; undeclared pairs conflict. The basis of conflict math (FR-006/009). Suggested by drawn zone geometry, confirmed by staff.
- **Zone geometry**: each segment's drawn position/shape on its surface's schematic — the authoring input for coexistence suggestions and the visual explanation of the scheme; never itself the source of conflict decisions.
- **Booking source** (conceptual): any of venue schedule block, signup-event game, season game, team calendar event, practice session — all answering to one availability model with a surface/segment reference and a time range.
- **Venue layout**: an optional schematic per venue — placed surfaces (position/size/rotation) and landmark labels — rendered on the public profile.

## Assumptions

- **Geometry proposes, declarations decide**: zones are authored by drawing on a surface schematic, and drawn geometry generates suggested coexistence relationships — but the stored, explicit, symmetric declarations are the sole source of truth for conflict math (physical coexistence isn't purely spatial: noise, shared boards, skater flow). Presets encode correct ice/court relationships with standard pre-drawn geometry. The venue-level layout (US4) remains purely presentational.
- The whole-surface booking remains the default everywhere; segmentation never adds required inputs to any flow.
- Pre-launch replacement: the existing display-only usage enum and free-text zone label fields are removed without data migration (consistent with the 005 decision); signup-events' half/cross display data is superseded by segments.
- Practice sessions gain a start time only when venue-attached (attachment requires it; slot = start time + existing duration); the practice planner's existing non-venue behavior is unchanged.
- The public layout is schematic (not to scale, no floor-plan image import) in this feature.
- Venue staff permission tiers from spec 002 (scheduling vs profile rights) are sufficient; no new roles.
- Performance envelope: availability evaluation spans one venue's bookings for the queried window — indexed per surface/time as today's per-source checks are.

## Out of Scope

- Paid or exclusive segment rentals, pricing, and public self-booking of segments — planned as spec 007 (this feature builds the inventory and availability it requires).
- Fully automatic geometric conflict resolution (drawn geometry only *suggests* relationships; it never decides conflicts without staff confirmation).
- Floor-plan image upload or to-scale facility maps.
- Capacity-based (headcount) booking limits per segment.
- Automatic schedule optimization or slot suggestion.
- Cross-venue or multi-facility composite layouts.
- Changes to how signup-event registration, payments, or waitlists work.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Two half-surface bookings on the same surface and hour save with zero conflict warnings, and a subsequent whole-surface booking attempt warns against both — 100% of the time across all five booking sources.
- **SC-002**: A venue staff member can create a surface, apply a segmentation preset, and set hours in under 2 minutes from the venue admin UI (no developer involvement).
- **SC-009**: A venue staff member can add a custom zone — drawing it, reviewing the suggested relationships, and saving — in under 2 minutes, without ever hand-authoring a relationship matrix from scratch.
- **SC-003**: 100% of partial-surface bookings are expressed through structured segments; zero free-text zone inputs remain in any scheduling flow.
- **SC-004**: Cross-source conflict coverage is complete: every ordered pair of booking sources (blocks, signup-event games, season games, team events, attached practices) produces a warning when overlapping on shared space — verified by an availability test matrix.
- **SC-005**: A staff member can lay out a three-surface facility with landmark labels in under 5 minutes, and the schematic renders on the public profile on mobile.
- **SC-006**: Venue staff can see 100% of event/game bookings on their surfaces from the venue schedule view (today: 0% — games are invisible to block scheduling).
- **SC-007**: Non-ice surfaces surface zero ice-specific vocabulary in segmentation and booking flows.
- **SC-008**: Unified conflict checks complete within 500ms at the 95th percentile on a seeded fixture of 1,000 bookings across all five sources at one venue in the evaluated month — measured in an automated test, so the unified source demonstrably does not regress scheduling-form responsiveness.

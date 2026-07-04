# Feature Specification: Sport-Aware Season & Game Scheduling via Events

**Feature Branch**: `005-season-scheduling`
**Created**: 2026-07-04
**Status**: Draft
**Input**: User description: "Sport-aware season & game scheduling via events. Replace the legacy GameSchedule feature (whose Round Robin/Rounds fields are stored but ignored — the server always generates round-robin) with season scheduling built on the signup-events game machinery (teams, games, surfaces, standings). Sport becomes a first-class capability layer: hockey is the fully-populated first-class citizen (ice usage, USA Hockey age classifications, format presets) and other sports degrade gracefully via a per-sport capability catalog driving terminology, age groups, and suggested formats. Schedule format becomes OPTIONAL — organizers may decline to specify rotation/format/judging entirely; format only appears when they opt into generated games (round-robin is the only generator initially; other formats are labels until generators exist). Support league season phases: qualifying pre-season (teams play placement games; league admins then assign teams to divisions/levels by skill, e.g. Mite White vs Mite Red) followed by regular season scheduling against closest-skill opponents; pre-season requires coach/team-to-team game coordination (propose/accept game flows) rather than central generation. Generated/accepted games must continue to feed team calendars (Events + RSVP fan-out) and respect venue/surface booking. Migrate existing GameSchedule data to the new model."

## Context & Problem

The current schedule builder presents "Round Robin" and "Rounds" as if they were meaningful event attributes, but the round-robin toggle is stored and never honored — the system always generates a round-robin, and unchecking the box shows a misleading "0 games" preview while games are generated anyway. Schedules cannot be edited after creation. There is no notion of a season with phases, no way for two teams to coordinate a game between themselves, and no path from a qualifying pre-season to skill-based division placement — the hardest scheduling work leagues do today happens outside the platform in spreadsheets, emails, and text threads.

Separately, the platform records each team's and league's sport (defaulting to hockey) but never uses it: hockey-specific terminology (ice usage, Squirt/Peewee/Bantam age names) is hard-coded into event flows regardless of sport, and no flow adapts when the sport differs.

This feature replaces the legacy schedule builder with season-based scheduling built on the proven event-game machinery (games with venues/surfaces, standings, age-gated scoring), makes schedule format an honest and entirely optional declaration, introduces team-to-team game proposals, supports the pre-season → placement → regular-season league workflow, and turns sport into a real capability layer with hockey as the fully-populated first-class citizen.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Schedule season games without declaring a format (Priority: P1)

A league administrator (or a standalone team's administrator) creates a season — a named container with a date range, such as "Fall 2026" — and schedules games in it one at a time: opponent matchup, date and time, venue, and optionally a specific playing surface. At no point are they asked to declare a rotation scheme, tournament format, or judging structure. Each scheduled game lands on both teams' calendars, rostered members receive RSVP requests, and the scheduler is warned when the venue or surface is already booked at that time.

**Why this priority**: This is the core replacement for the legacy schedule builder and the direct answer to "organizers who don't want to declare how they rotate teams shouldn't have to." Manual game scheduling with calendar/RSVP integration is the minimum viable product — everything else in this feature layers onto it.

**Independent Test**: Can be fully tested by creating a season, adding three games between league teams, and verifying each appears on both teams' calendars with RSVP requests, without any format field having been shown or required.

**Acceptance Scenarios**:

1. **Given** a league with at least two teams, **When** an admin creates a season with only a name and date range, **Then** the season is created and no format, rotation, or judging input was required or displayed as required.
2. **Given** an existing season, **When** the admin schedules a game (two teams, date/time, venue), **Then** the game appears in the season's schedule and on both teams' calendars, and rostered members of both teams receive RSVP requests.
3. **Given** a venue that already has a booking overlapping the chosen time, **When** the admin schedules a game there, **Then** a conflict warning identifying the existing booking is shown before saving, and the admin may proceed with an explicit override that is recorded.
4. **Given** a scheduled game, **When** the admin changes its time or venue, **Then** both team calendars update, affected members are notified, and existing RSVPs are retained but flagged for re-confirmation.
5. **Given** a scheduled game, **When** the admin cancels it, **Then** it is marked canceled on both calendars (not silently deleted) and members are notified.

---

### User Story 2 - Opt into generated round-robin schedules, honestly (Priority: P2)

A league administrator scheduling a division's regular season chooses to have games generated instead of entering them one by one. Opting into generation is what introduces the format choice (a format may also be attached to a season or phase as a purely descriptive label without generation, but it is never demanded). Round-robin is available as a working generator: they select the participating teams (a division's teams by default), the number of rounds, and a date range, then review the proposed games — with the preview always matching exactly what would be created — edit, add, or remove individual games, and publish. Publication fans games out to team calendars and RSVPs. Formats other than round-robin can be selected as descriptive labels, in which case the system clearly indicates games are scheduled manually.

**Why this priority**: This preserves (and fixes) the one working capability of the legacy builder — bulk generation — while making format an opt-in, truthful concept. It depends on US1's season and game foundation.

**Independent Test**: Generate a round-robin for four teams at two rounds, verify the preview count (12 games) matches the generated count, edit one game and delete another before publishing, and confirm calendars/RSVPs reflect exactly the published set.

**Acceptance Scenarios**:

1. **Given** a season, **When** the admin chooses manual scheduling, **Then** no format selection is presented.
2. **Given** a season, **When** the admin opts into generation and selects round-robin with N teams and R rounds, **Then** the preview shows N×(N−1)/2×R games and the generated set matches the preview exactly.
3. **Given** a generated but unpublished schedule, **When** the admin edits, removes, or adds games, **Then** the working set updates and nothing appears on team calendars until publication.
4. **Given** a published generated schedule, **When** the admin edits or cancels an individual game, **Then** the change propagates to calendars and RSVPs the same way as a manually scheduled game (fixing the legacy create-only limitation).
5. **Given** the format list, **When** the admin selects a format that has no generator (e.g., single elimination), **Then** the format is recorded as a descriptive label, the schedule clearly indicates manual scheduling, and the system does not claim it will generate games.
6. **Given** generation-time venue conflicts on games that have a venue assigned, **When** the preview is shown, **Then** conflicting games are flagged in the review step rather than silently created (fixing the legacy behavior of detecting and discarding conflicts).
7. **Given** a published round-robin phase with recorded scores at an age-eligible level, **When** members view the phase standings, **Then** teams are ranked by the platform's points convention with wins/losses/ties and points visible.

---

### User Story 3 - Team-to-team game proposals (Priority: P3)

A team administrator ("coach") wants a game against another team in the league — typical during pre-season when there is no central schedule. They propose a game to the other team: opponent, proposed date/time, venue (or "to be determined"), and an optional note. The receiving team's administrators are notified and can accept, decline, or counter-propose a different time or venue. On acceptance, the game is created in the relevant season/phase and lands on both calendars with RSVP fan-out, exactly like an admin-scheduled game. Pending proposals expire automatically if the proposed start time passes without a response.

**Why this priority**: This is the coordination mechanism pre-season scheduling actually uses — coach-to-coach negotiation rather than central generation. It stands alone as a useful capability (scrimmages, make-up games) even before the placement workflow exists.

**Independent Test**: As Team A's admin, propose a game to Team B; as Team B's admin, counter-propose a new time; as Team A's admin, accept the counter; verify the game exists on both calendars with RSVPs and the proposal thread shows the negotiation history.

**Acceptance Scenarios**:

1. **Given** two teams in the same league, **When** Team A's admin sends a game proposal, **Then** Team B's admins are notified (respecting notification preferences) and see the proposal with its details and note.
2. **Given** a pending proposal, **When** the receiving admin accepts it, **Then** a scheduled game is created in the appropriate season/phase, appears on both calendars with RSVP requests, and both sides are notified.
3. **Given** a pending proposal, **When** the receiving admin declines, **Then** the proposer is notified with the optional decline reason and no game is created.
4. **Given** a pending proposal, **When** the receiving admin counter-proposes a different time or venue, **Then** the original proposer can accept, decline, or counter again, and the thread records each step.
5. **Given** a proposal whose most recent proposed start time (the latest counter's, if any) has passed without a response, **When** either party views it, **Then** it is shown as expired and can no longer be accepted.
6. **Given** a proposal, **When** either team's admin cancels/withdraws it before acceptance, **Then** the other side is notified and the proposal is closed.

---

### User Story 4 - Qualifying pre-season and skill-based division placement (Priority: P4)

A league runs a qualifying pre-season: teams play placement games (coordinated via proposals or scheduled by admins), and the league administrator then assigns each team to a division/level that matches its demonstrated skill — for example, splitting mite teams into "Mite White" and "Mite Red." The admin creates a season with a pre-season phase and a regular-season phase. During and after the pre-season, they review each team's body of work: games played, opponents, and results where score recording is age-eligible; for age levels below the score-recording threshold, they rank teams manually, optionally with private evaluation notes. They then assign teams to divisions. When regular-season scheduling begins, the team pickers default to division members — the closest-skill opponents the placement just established.

**Why this priority**: This is the highest-pain league workflow named by the product owner, but it composes the machinery of the earlier stories and placement only makes sense once those exist.

**Independent Test**: Create a season with pre-season and regular-season phases, record three pre-season games, assign four teams into two divisions from the placement view, then start a regular-season round-robin and verify the team set defaults to one division's teams.

**Acceptance Scenarios**:

1. **Given** a new season, **When** the admin adds phases, **Then** they can define a pre-season phase and a regular-season phase with their own date ranges within the season (playoffs may also be added as a phase).
2. **Given** completed pre-season games at an age level where score recording is allowed, **When** the admin opens the placement view, **Then** each team shows games played, win/loss/tie record, and opponents faced.
3. **Given** pre-season games at an age level below the score-recording threshold (e.g., mite), **When** the admin opens the placement view, **Then** no scores or standings are shown (consistent with existing age gating), but the admin can order/rank teams manually and attach private notes visible only to league administrators.
4. **Given** the placement view, **When** the admin assigns teams to divisions (existing or newly created ones), **Then** team division membership updates, the placement decision is recorded with who made it and when, and previously played games remain intact and attributed.
5. **Given** completed placement, **When** the admin generates or schedules regular-season games, **Then** team selection defaults to the chosen division's members while still allowing manual additions or removals.
6. **Given** a mid-season skill mismatch, **When** the admin reassigns a team to another division, **Then** history is preserved and future default opponent sets reflect the new division.

---

### User Story 5 - Sport-aware terminology and options, hockey first-class (Priority: P5)

The platform reads the sport already recorded on each league and team and adapts scheduling flows accordingly. A hockey league sees the full hockey experience: ice-usage options (full ice, half ice, cross ice), USA Hockey age classifications (Mite/U8, Squirt/U10, Peewee/U12, Bantam/U14, …), hockey-appropriate format suggestions, and score-recording rules tied to age level. A league whose sport is soccer, basketball, or any sport without a populated catalog sees neutral, sport-agnostic language ("playing surface," generic age groups, the same optional formats) with no hockey vocabulary leaking through. Nothing about a less-populated sport blocks scheduling — every sport can use seasons, games, proposals, and placement.

**Why this priority**: Multi-sport is a near-term goal, but the immediate value is coherence: hockey users get an experience that speaks their language, and the sport field stops being decorative. It is cross-cutting polish over the earlier stories rather than a standalone workflow.

**Independent Test**: Create one hockey league and one soccer league; walk the same season-and-game flow in each and verify the hockey league sees ice-usage and USA Hockey age options while the soccer league sees neutral equivalents and no ice terminology.

**Acceptance Scenarios**:

1. **Given** a league whose sport is hockey, **When** an admin schedules a game with a surface, **Then** ice-usage options (full/half/cross ice) and hockey age classifications are available and labeled in hockey terms.
2. **Given** a league whose sport has no populated catalog, **When** an admin walks the same flows, **Then** terminology is neutral, fields with no defined options for that sport (e.g., surface usage) are hidden, age groups are generic, and no hockey-specific labels appear.
3. **Given** any sport, **When** an organizer schedules games, **Then** all scheduling capabilities (seasons, phases, manual games, proposals, generation) are available regardless of catalog depth.
4. **Given** a team or league whose sport is changed, **When** future scheduling flows are used, **Then** presented options follow the new sport while previously recorded data remains intact and viewable.

---

### User Story 6 - Legacy schedule builder removal (Priority: P6)

The legacy schedule builder is removed outright. The platform is pre-launch with no production schedule data, so no data migration is performed: legacy schedule storage and flows are deleted, and every entry point that offered the old builder leads to the new season scheduling experience instead.

**Why this priority**: Required for cutover to a single way of scheduling, but only matters once the replacement (the first two stories) exists.

**Independent Test**: Verify the legacy schedule builder is unreachable (no navigation entries, routes, or actions), legacy schedule storage no longer exists, and every former entry point leads to the new season scheduling experience.

**Acceptance Scenarios**:

1. **Given** the new season experience is live, **When** a user looks for the old schedule builder (navigation, routes), **Then** they find only the new season scheduling experience.
2. **Given** removal is complete, **When** the data model is inspected, **Then** no legacy schedule storage remains.

---

### Edge Cases

- **Reschedule vs. RSVP integrity**: Rescheduling a game keeps existing RSVPs but flags them for re-confirmation and notifies members; canceling marks the game canceled rather than deleting history.
- **Deleting an unpublished generated set**: Removing a draft schedule removes only draft games; published games require explicit cancellation (with notifications), never bulk silent deletion.
- **Proposal races**: If two admins of the receiving team act simultaneously (one accepts, one declines), the first recorded decision wins and the second actor sees the resolved state, not an error-free double action.
- **Proposal to a team with no active admin**: The proposal is created and visible; expiry handles non-response. League admins can see stalled proposals for their league.
- **Placement with insufficient data**: Teams with zero pre-season games still appear in the placement view, clearly marked as unevaluated; placement is never blocked on data completeness.
- **Score entry below the age threshold**: Attempts to record scores for games below the score-eligible age level are rejected with the same age-gating rules used elsewhere; the placement view's manual ranking is the sanctioned alternative.
- **Team removed from league mid-season**: Its scheduled future games are flagged for admin action (cancel or replace opponent); past games and standings contributions are preserved.
- **Cross-division games**: Allowed — division defaults are conveniences, not fences; standings are computed within the grouping the admin chose for the schedule.
- **Venue conflict overrides**: Overrides are always explicit and recorded (who, when); the same policy applies to manual games, generated games, and accepted proposals.
- **Timezone**: Game times display in the venue's timezone when a venue is set, falling back to the host's default — consistent with existing event behavior.
- **Surface selection on multi-surface venues**: Only active surfaces of the chosen venue are offered (fixing the current inclusion of archived surfaces in pickers).

## Requirements *(mandatory)*

### Functional Requirements

#### Seasons & phases

- **FR-001**: League administrators MUST be able to create, edit, and archive seasons (name, date range, optional description) owned by their league; standalone team administrators MUST be able to do the same for team-owned seasons. Archiving hides a season from default views without altering its games, calendar entries, or history.
- **FR-002**: A season MAY contain ordered phases (e.g., pre-season, regular season, playoffs), each with its own date range within the season; a season with no explicit phases behaves as a single implicit phase.
- **FR-003**: Seasons and phases MUST NOT require any format, rotation, or judging declaration.

#### Optional format

- **FR-004**: Schedule format MUST be optional everywhere it appears; the default is "not specified."
- **FR-005**: Format selection MUST be presented only when an organizer opts into automatic game generation, or explicitly chooses to label a phase/schedule with a format.
- **FR-006**: The format vocabulary MUST include at least: round robin (with a rounds count), single elimination, double elimination, pool play, ladder, and custom; only round robin has a working generator initially, and all other formats MUST be clearly presented as descriptive labels without generation.
- **FR-007**: The system MUST never present a format control whose value it does not honor (the legacy ignored-toggle behavior is explicitly prohibited).

#### Game scheduling & calendar integration

- **FR-008**: Authorized schedulers MUST be able to create individual games within a season/phase specifying home and away teams, start and end time, and optionally venue, playing surface, surface usage, and a free-text zone/location note. In league-owned seasons, eligible opponents are the league's teams; in team-owned seasons, eligible opponents are any teams the scheduler administers (matching legacy team-scoped scheduling).
- **FR-009**: Creating or publishing a game MUST create corresponding calendar entries for both teams and RSVP requests for all rostered members of both teams, consistent with existing team-event behavior.
- **FR-010**: Games MUST be editable and cancelable after creation, including after publication, by authorized users; edits propagate to calendars and notifications, and cancellations preserve history.
- **FR-011**: Rescheduling a game MUST retain existing RSVP responses, flag them for re-confirmation, and notify affected members.
- **FR-012**: The system MUST check venue availability at scheduling time — venue-wide when no surface is selected, surface-specific when one is — against other games, team events, and published venue schedule blocks, and MUST surface any detected conflicts as warnings before saving.
- **FR-013**: Proceeding despite a conflict MUST require an explicit override by an authorized user, and the override MUST be recorded (actor and time).
- **FR-014**: Surface pickers MUST offer only active surfaces of the selected venue.
- **FR-039**: When a team leaves the league mid-season, its future scheduled games MUST be flagged for administrator action (cancel or replace opponent); its past games and their standings contributions MUST be preserved.

#### Generation

- **FR-015**: When round-robin generation is selected, the system MUST generate all pairings among the selected teams multiplied by the selected number of rounds. Scheduling parameters are the date range, eligible game days/times, and an optional default venue; the generator assigns each pairing a proposed date/time within those parameters and assigns the venue when a default is provided, otherwise venue assignment happens during review.
- **FR-016**: The generation preview MUST exactly match the set of games that will be created, including the total count; venue conflict detection applies to previewed games that have a venue assigned.
- **FR-017**: Generated games MUST be created in a draft state; organizers MUST be able to edit, remove, or add games before publishing, and nothing reaches team calendars until publication.
- **FR-018**: Team selection for generation MUST default to a chosen division's teams when a division is selected, while allowing manual inclusion/exclusion of any league teams.

#### Team-to-team proposals

- **FR-019**: Team administrators MUST be able to propose a game to another team in the same league, specifying proposed date/time and optionally venue and a note; venue MAY be left as "to be determined."
- **FR-020**: Receiving team administrators MUST be able to accept, decline (with optional reason), or counter-propose (modified time/venue); each step MUST be recorded in a visible proposal history.
- **FR-021**: Acceptance MUST create a scheduled game with full calendar and RSVP fan-out, attributed to both teams' schedules. The game's season/phase defaults to the phase whose date range contains the proposed start (the proposer may choose among matching seasons); when no season covers the date, the accepted game is created outside any season and appears on team calendars only.
- **FR-022**: Proposals MUST expire automatically when their most recent proposed start time (the latest counter-proposal's, if any) passes without acceptance; expired proposals cannot be accepted.
- **FR-023**: Either side MUST be able to withdraw/cancel a pending proposal; all proposal state changes MUST notify the other side per notification preferences.
- **FR-024**: League administrators MUST be able to view all proposals within their league.

#### Pre-season placement

- **FR-025**: League administrators MUST have a placement view per season phase showing, for each team: games played, opponents faced, and win/loss/tie record where score recording is age-eligible.
- **FR-026**: For age levels below the score-recording threshold, the placement view MUST NOT display scores or standings, and MUST instead support manual ranking of teams with optional private notes visible only to league administrators.
- **FR-027**: League administrators MUST be able to assign and reassign teams to divisions (including creating new divisions) from the placement view; each placement decision MUST record who made it and when.
- **FR-028**: Division reassignment MUST preserve all played-game history and prior placement decisions.
- **FR-029**: Regular-season scheduling flows MUST default opponent/team sets to the relevant division's members after placement.

#### Standings

- **FR-030**: The system MUST compute standings per phase (and per division grouping where applicable) from recorded results for age-eligible levels, using the platform's established points convention, and MUST NOT expose standings below the age-eligibility threshold.
- **FR-040**: A game's age level for score-recording and standings gating derives from the age classification of the participating teams' division(s); when the two sides' levels differ, the more restrictive (younger) gating applies; games with no recorded age level are score-eligible.

#### Sport capability layer

- **FR-031**: Scheduling flows MUST derive terminology, age-classification options, surface-usage options, and suggested formats from the sport recorded on the hosting league or team.
- **FR-032**: The hockey catalog MUST be fully populated: ice-usage options (full, half, cross ice), USA Hockey age classifications, hockey format suggestions, and the existing age-gated score-recording rules.
- **FR-033**: Sports without a populated catalog MUST fall back to neutral terminology and generic options, with no hockey-specific vocabulary displayed, and MUST retain access to all scheduling capabilities; fields whose options are undefined for the sport (e.g., surface usage) are hidden entirely rather than shown with generic values.
- **FR-034**: Changing a league's or team's sport MUST affect only the options presented going forward; previously recorded data remains intact and viewable.

#### Legacy removal

- **FR-035**: The legacy schedule builder MUST be removed entirely — its storage, flows, and navigation entries — with all former entry points leading to the new season scheduling experience. No data migration is performed (pre-launch, no production schedule data).

#### Permissions

- **FR-038**: League administrators MUST be able to manage seasons, phases, generation, placement, and divisions league-wide; team administrators MUST be able to schedule their own team's games and manage proposals involving their team; members MUST be able to view schedules and respond to RSVPs. All scheduling actions MUST enforce these authorization boundaries.

### Key Entities

- **Season**: A named scheduling container with a date range, owned by a league or a standalone team; holds phases and games; carries an optional format label.
- **Season Phase**: An ordered subdivision of a season (pre-season, regular season, playoffs, or custom) with its own date range and optional format label; the unit standings and placement operate on.
- **Season Game**: A scheduled matchup between two teams within a season/phase — date/time, optional venue, optional surface, optional surface usage and zone note, status (draft/scheduled/completed/canceled), age-gated scores; linked to the calendar entries and RSVPs it produces.
- **Game Proposal**: A negotiation thread between two teams for a prospective game — proposed details, ordered history of counters/decisions, status (pending/accepted/declined/withdrawn/expired), and the resulting game when accepted.
- **Placement Decision**: A recorded league-admin action assigning a team to a division for a season — team, division, actor, timestamp, optional private note; supersedes prior decisions without erasing them.
- **Sport Capability Catalog**: Per-sport definition of terminology, age classifications, surface-usage options, suggested formats, and score-eligibility rules; hockey ships fully populated, other sports resolve to neutral defaults.
- **Schedule Format**: An optional descriptive label (round robin + rounds, single/double elimination, pool play, ladder, custom); at most one format has generation behavior initially (round robin).

## Assumptions

- "Coach" maps to the existing team ADMIN role; no new role is introduced for proposals or scheduling.
- Game proposals are limited to teams within the same league in this feature; cross-league and external opponents are out of scope (see below).
- Proposal expiry defaults to the proposed start time passing; no separate configurable expiry window in v1.
- Standings use the platform's existing points convention (2 points for a win, 1 for a tie) and existing tie-breaking behavior; configurable points systems are out of scope.
- The score-recording age threshold and its enforcement reuse the platform's existing age-gating rules (no standings/scores below the configured minimum level, per USA Hockey ADM defaults).
- Divisions gain a structured age classification to drive score/standings gating (today the division age group is free text); the planning phase decides the exact data source and migration of existing values.
- Venue conflict checking covers games, team calendar events, and published venue schedule blocks at venue or whole-surface granularity; sub-surface (half/cross-ice segment) availability math arrives with the venue segmentation feature (planned spec 006) and is not required here.
- The platform is pre-launch with no production schedule data; the legacy schedule builder is deleted rather than migrated.
- Sports beyond hockey receive neutral fallbacks only in this feature; populating additional sport catalogs (soccer, basketball, …) is follow-on content work, not new capability.

## Out of Scope

- Sub-surface segmentation as bookable inventory (half ice, cross ice, custom zones with concurrent-booking math) and the visual venue layout editor — planned as the venue segmentation feature (spec 006).
- Paid/exclusive surface or segment rentals — planned as a follow-on to segmentation (spec 007).
- Working generators for formats other than round robin (elimination brackets, pool play seeding, ladders); these appear as labels only.
- Playoff seeding automation and bracket visualization.
- Cross-league or off-platform opponents for proposals and games.
- Automatic, algorithmic division placement (the system informs; humans decide).
- Officials/referee assignment, scorekeeper workflows, and stats beyond the platform's existing game-score capabilities.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An organizer can create a season and schedule a game end-to-end without encountering a single required format, rotation, or judging input (zero such fields on the manual path).
- **SC-002**: Generation previews match generated games with 100% fidelity — the displayed count and set always equal what is created, across all team-count and rounds combinations.
- **SC-003**: A league administrator can generate, review, and publish a full division round-robin (e.g., 8 teams × 2 rounds = 56 games) in under 10 minutes of active work.
- **SC-004**: Two team administrators can take a game from proposal to both teams' calendars without any league-administrator involvement, in under 5 minutes of combined active effort.
- **SC-005**: A league administrator can complete pre-season placement of 12 teams into 3 divisions — including reviewing results and recording decisions — in a single session of under 15 minutes, with every placement input and decision capturable in-platform.
- **SC-006**: The legacy schedule builder is fully unreachable after cutover — zero navigation entries, routes, or actions remain.
- **SC-007**: A non-hockey league encounters zero hockey-specific terms (ice, rink, Squirt/Peewee/Bantam, etc.) across the season, game, proposal, and placement flows.
- **SC-008**: 100% of venue-conflicting schedule saves either surfaced a warning first or carry a recorded override — no silent double-bookings originate from scheduling flows.
- **SC-009**: Members' game RSVPs behave identically to existing team-event RSVPs (same response options and reminder behavior) for all newly scheduled games.

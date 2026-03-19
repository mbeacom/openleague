# Feature Specification: USA Hockey Readiness — Jersey Numbers, Association IDs & CSV Roster Export

**Feature Branch**: `001-usah-jersey-roster-export`
**Created**: 2026-03-19
**Status**: Draft
**Input**: User description: "Create the single highest-ROI items before a 'USA Hockey' pitch: jersey number and CSV roster export. This should likely allow association with a USA Hockey association ID for players, coaches, and team managers."

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Team Admin Records Jersey Numbers for Players (Priority: P1)

A team admin navigates to the roster and assigns a jersey number to each player. Numbers can be entered during player creation or edited at any time. The number displays alongside the player's name throughout the platform (roster list, event RSVPs, exports).

**Why this priority**: Jersey number is the single most-requested piece of data for any hockey platform. It immediately signals hockey-specific credibility during a USA Hockey pitch and is a prerequisite for a meaningful CSV export.

**Independent Test**: Can be fully tested by adding a player with a jersey number and verifying it displays on the roster page — delivers immediate visible value with zero dependency on other stories.

**Acceptance Scenarios**:

1. **Given** an admin viewing the roster, **When** they add a new player, **Then** they can optionally enter a jersey number (1–99) alongside name and contact info.
2. **Given** an existing player on the roster, **When** the admin edits the player, **Then** they can add, change, or clear the jersey number.
3. **Given** a roster list view, **When** players are displayed, **Then** each player's jersey number appears alongside their name (e.g., "#17 — John Smith").
4. **Given** an admin entering an invalid jersey number (e.g., 0, 100, letters), **When** they attempt to save, **Then** the system rejects the value with a clear error message.
5. **Given** two players on the same team, **When** an admin assigns the same jersey number to a second player, **Then** the system warns that the number is already in use but allows saving (duplicate allowed with warning).

---

### User Story 2 — Record USA Hockey Association IDs for Players, Coaches, and Managers (Priority: P2)

A team admin can record a USA Hockey Member ID (association ID) for any player on the roster and for any coach or team manager (team admin user) on the team. The ID is stored and displayed in admin-only views, and is included in roster exports.

**Why this priority**: USA Hockey requires member registration for all rostered participants — players and team officials alike. Having this field stored makes OpenLeague directly useful for USA Hockey affiliated organizations and makes the pitch credible.

**Independent Test**: Can be fully tested by entering a USA Hockey ID on a player profile and on a team admin's profile, then verifying both are stored and displayed in the roster admin view.

**Acceptance Scenarios**:

1. **Given** an admin editing a player, **When** they enter a USA Hockey Member ID (alphanumeric, up to 20 characters), **Then** it is saved and displayed in the player's admin profile view.
2. **Given** an admin viewing the team's officials list, **When** they edit a coach or manager's team profile, **Then** they can enter and save that person's USA Hockey Member ID.
3. **Given** a team member with a USA Hockey ID on their profile, **When** a non-admin views the roster, **Then** the USA Hockey ID is not visible (admin-only field).
4. **Given** an admin entering a USA Hockey ID, **When** the value exceeds 20 characters or contains disallowed characters, **Then** the system rejects it with a clear error message.
5. **Given** an admin running a CSV export, **When** the export is generated, **Then** each row includes the participant's USA Hockey Member ID (blank if not set).

---

### User Story 3 — Export Full Roster as CSV (Priority: P3)

A team admin can download a CSV file of the complete team roster in a single click. The export includes all roster fields relevant to registration: player name, jersey number, USA Hockey Member ID, email, and role. The file is suitable for import into USA Hockey's TeamConnect system or submission to a league registrar.

**Why this priority**: A downloadable roster export is the closing argument in a hockey association pitch — it proves OpenLeague can replace manual spreadsheet tracking. Admin can hand this file directly to a registrar.

**Independent Test**: Can be fully tested by clicking the export button on a populated roster and verifying the downloaded CSV contains expected columns and correct data for all participants.

**Acceptance Scenarios**:

1. **Given** an admin on the roster management page, **When** they click "Export Roster (CSV)", **Then** a CSV file downloads immediately to their device.
2. **Given** a roster with both players and team officials (coaches/managers), **When** the CSV is downloaded, **Then** each row contains: Full Name, Role, Jersey Number, USA Hockey Member ID, Email.
3. **Given** a player with missing optional fields (no jersey number, no USA Hockey ID), **When** exported, **Then** those columns are blank but the row is still included.
4. **Given** a CSV exported from OpenLeague, **When** opened in a spreadsheet application, **Then** special characters in names are correctly encoded (UTF-8) and the file is fully parseable.
5. **Given** a non-admin team member, **When** they view the roster page, **Then** the "Export Roster (CSV)" action is not visible.
6. **Given** a team with no players or officials yet, **When** an admin exports the roster, **Then** a valid header-only CSV downloads rather than an error.

---

### Edge Cases

- What happens when a jersey number is cleared (deleted) from a player? (Field returns to blank; player displays with no number in roster views.)
- What if a player's name contains a comma or double-quote? (CSV output handles these per RFC 4180 — the field is quoted and internal quotes are escaped.)
- What happens if a USA Hockey Member ID is entered with leading/trailing whitespace? (System trims whitespace before saving.)
- Are jersey numbers unique per team or globally? (Per-team only. Duplicates trigger a warning but are not blocked, to accommodate mid-season number reassignments.)
- What if an admin enters a jersey number of "00"? (Not supported in this iteration; only integers 1–99 are accepted.)

---

## Requirements *(mandatory)*

### Functional Requirements

#### Jersey Numbers

- **FR-001**: The system MUST allow team admins to assign an optional jersey number to any player, accepting integers in the range 1–99.
- **FR-002**: The system MUST validate jersey numbers are integers between 1 and 99 and reject values outside this range with a clear error message.
- **FR-003**: The system MUST display a player's jersey number alongside their name in all roster views visible to team members.
- **FR-004**: The system MUST display a non-blocking warning when a jersey number is assigned that is already in use by another active player on the same team.
- **FR-005**: The system MUST allow team admins to clear a jersey number from a player at any time.

#### USA Hockey Association IDs

- **FR-006**: The system MUST allow team admins to record an optional USA Hockey Member ID for any player on the roster.
- **FR-007**: The system MUST allow team admins to record an optional USA Hockey Member ID for any team official (coach or manager) associated with the team.
- **FR-008**: The system MUST restrict visibility of USA Hockey Member IDs to team admins only — regular members must not see this field in any view.
- **FR-009**: The system MUST accept USA Hockey Member IDs as alphanumeric strings up to 20 characters and trim leading/trailing whitespace before saving.

#### CSV Roster Export

- **FR-010**: The system MUST provide an "Export Roster (CSV)" action on the roster management page, visible only to team admins.
- **FR-011**: The exported CSV MUST include the following columns for every participant (player and team official): Full Name, Role, Jersey Number, USA Hockey Member ID, Email.
- **FR-012**: The exported CSV MUST be UTF-8 encoded and conform to RFC 4180 formatting.
- **FR-013**: The exported CSV MUST include all active roster participants — both players and team officials.
- **FR-014**: The export MUST trigger a file download in the browser without requiring a page reload or navigation.

### Key Entities

- **Player**: Existing roster entry model. Gains two new optional fields: `jerseyNumber` (integer, 1–99, nullable) and `usahMemberId` (alphanumeric string, up to 20 characters, nullable, admin-only).
- **Team Official**: Represented by existing team admin membership records. Gains one new optional field: `usahMemberId` (alphanumeric string, up to 20 characters, nullable, admin-only).
- **Roster Export**: A transient artifact — a CSV file generated on demand from current player and team official records. Not stored server-side; no export history required.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A team admin can assign jersey numbers to all players on a 25-person roster in under 5 minutes.
- **SC-002**: A team admin can record USA Hockey Member IDs for all players and officials on a 30-person roster without navigating away from the roster management page.
- **SC-003**: A complete, correctly formatted CSV roster export downloads in under 3 seconds for any team with up to 50 participants.
- **SC-004**: 100% of exported CSV rows are parseable by standard spreadsheet applications without data loss or corruption (including names with special characters and commas).
- **SC-005**: No USA Hockey Member ID is visible to any non-admin user in any part of the application.
- **SC-006**: A team registrar can capture all data fields required for USA Hockey affiliate paperwork using only OpenLeague, without resorting to a separate spreadsheet.

---

## Assumptions

- **Jersey number range**: USA Hockey rosters use numbers 1–99. The format "00" is excluded from this iteration.
- **Duplicate jersey numbers**: Non-blocking warning only, to handle real-world mid-season reassignments.
- **USA Hockey Member ID format**: Treated as a free-form alphanumeric string (up to 20 characters). No checksum or regex validation against USA Hockey's internal format — this may vary.
- **Team officials**: Coaches and managers are represented by `TeamMember` records with `ADMIN` role. Both appear in the export with an appropriate role label.
- **Export scope**: CSV covers one team's current roster only. League-wide or multi-team exports are out of scope for this iteration.
- **No server-side export storage**: Exports are generated on demand and streamed to the browser. No export history or audit log is required.
- **Player position**: Out of scope for this spec — left for a future roster enhancement.

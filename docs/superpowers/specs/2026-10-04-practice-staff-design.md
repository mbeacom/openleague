# Practice Staff Assignments — Design

**Date:** 2026-10-04
**Status:** Approved (design); implementation plan to follow in `../plans/2026-10-04-practice-staff.md`
**Applies to:** the hosted Next.js planner and the static Vite planner (`apps/planner/`). Both render the shared components in `components/features/practice-planner/`.
**Depends on:** practice timing (#405: the session row union, block rows, station rotation), the plan document (ADR-0020), the bench sheet and exports, the practice-plan emails.

## Context

A practice is run by several people: the head coach, assistants, and often parent volunteers who run a station. The planner shows what happens and when, but not who runs each part.

What exists today (verified):
- **Rows.** A practice's rows (`PracticeSessionPlay`) are drills or blocks (warm-up, break, transition, cool-down). Each row has a stable id. The editor gives each unsaved row a `clientKey`.
- **Officials.** `TeamOfficial` holds a team's coaches and managers. Each has a `name`, an optional `email`, a `role`, a `status` (`ACTIVE | INVITED | REMOVED`) and an optional `userId`, linked when the email matches an account. Team admins are `TeamMember` rows with role `ADMIN`.
- **Emails.** `sendPracticePlanNotifications(sessionId, teamId, type)` (`lib/email/templates.ts`) sends one "shared"/"updated" email to every team member whose preference allows it. Every recipient gets the same content.
- **Saves.** The hosted editor saves the whole practice through `updatePracticeSession`:
  - a missing field is unchanged and an explicit `null` clears it;
  - the stale-editor guard refuses an update from an older editor when the practice has block rows.

  The static store follows the same rules.

## Goal

A coach lists the practice's staff (team officials, team admins and typed volunteer names) and assigns people to any row. Assignments appear on:
- the editor;
- the session page;
- the bench sheet and its HTML/Word exports;
- the import preview;
- plan files, as names.

Officials who have accounts see "Your stations" in the practice emails the team already receives.

### Success criteria

1. The editor has a **Staff** section:
   - add a team official or admin from a picker, or type a name;
   - rename;
   - remove (with a warning when the person has assignments).
2. Every row card has a **Run by** picker for 0–4 staff from that practice's list.
3. Assigned names appear on the session-page timeline and sidebar, the bench sheet (staff list in the header, names per row), the HTML/Word exports and the import preview.
4. Plan files carry the staff list and each row's assignees as names. Older files import with no staff.
5. The practice-plan emails add one line, "Your stations: …", for each recipient whose account belongs to an assigned staff member. Everyone else's email is unchanged.
6. The static planner supports the same staff list with typed names only.
7. Existing practices, plan files and emails behave exactly as before.

## Rulings

### R1. A per-practice staff list, with assignments per row

**Why:**
- Typed names per row (the rejected alternative) can't link to accounts reliably, and a rename would touch every row.
- Rows pointing straight at officials (also rejected) would need two kinds of assignee everywhere, with no single place to rename a volunteer.

### R2. Data (hand-written, additive migration)

**`practice_session_staff`** (`PracticeSessionStaff`):

| Column | Rule |
|---|---|
| `id` | cuid |
| `sessionId` | FK, cascade |
| `name` | TEXT, 1–60 chars after trim; control chars removed |
| `position` | INTEGER ≥ 0, unique per session |
| `teamOfficialId` | FK, nullable, `onDelete: SetNull` |
| `userId` | FK, nullable, `onDelete: SetNull` |

- CHECK: at most one of `teamOfficialId` and `userId` is set. `userId` is used for a team admin who isn't an official.
- Unique: `(sessionId, lower(name))`, as a unique index on an expression, hand-written.

**`practice_session_play_staff`** (`PracticeSessionPlayStaff`):
- `playRowId` (FK to `practice_session_plays`, cascade) and `staffId` (FK to `practice_session_staff`, cascade).
- `position` (order within the row).
- Primary key `(playRowId, staffId)`.

**Limits** (Zod and the static store, with exported constants):
- `MAX_SESSION_STAFF = 12`;
- `MAX_ROW_STAFF = 4`;
- `STAFF_NAME_MAX = 60`.

Removing a staff member removes their assignments, and deleting a practice removes everything. An official deleted from the team leaves the staff name, unlinked.

### R3. Saving

- Staff and assignments travel in the whole-practice save beside the rows:
  - `staff: Array<{ key, name, teamOfficialId?, userId? }>`;
  - each row's `staff: string[]`, the staff keys.
- Keys are client-made (an existing id or a new `clientKey`). The server maps keys to ids. Nothing is matched by array position.
- Absent `staff` means unchanged: stored staff and every row's assignments are kept, even when the rows are rewritten. `updatePracticeSession` deletes and recreates the rows, so row ids don't survive a save. The plan must define the row identity used to carry assignments across the rewrite: a drill row's owned `playId` (unique per session) and a block row's sequence among the stored block rows, or a stable row key added for this purpose. It must verify that identity against the action's code. An explicit `[]` clears.
- If `staff` is sent, rows without `staff` get none.
- **Server checks, after authentication and authorization:**
  - every `teamOfficialId` is an `ACTIVE`/`INVITED` official of the practice's team;
  - every `userId` is an `ADMIN` member of that team;
  - names are unique (case-insensitive);
  - every row assignee key refers to a sent staff member, with no duplicates;
  - the limits hold.
- No new stale-editor rule: an editor from before this change omits `staff`, so absent-means-unchanged keeps the stored staff and assignments. The existing guard still covers editors from before practice timing.

### R4. Picker and privacy

- The picker (hosted only) lists active and invited team officials and team admins, by display name and role label. It never shows or sends emails.
- An official who is also an admin appears once, as the official.
- Plan files, exports and the static store hold names only.
- Typed names are plain text: nobody is invited, linked or emailed.

### R5. Copy paths

- Duplicating, detaching, materializing and importing a practice copy staff and assignments.
- Links (`teamOfficialId`/`userId`) are kept on a hosted duplicate within the same team.
- Links are dropped on plan export and import: names only.
- A guard test builds its expectations from the copied select.

### R6. Plan document (PLAN_VERSION stays 1)

- Optional `staff: string[]` (names, ≤12, ≤60 chars each, unique ignoring case) on the session.
- Optional `staff: string[]` (names, ≤4) on each entry, drill or block. Every entry name must be in the session list.
- Older files import with no staff. A file with an entry naming someone not in the list is rejected with a readable "Drill N" issue.
- ADR-0020 gets an amendment.

### R7. Static store

- IndexedDB session records gain the staff list (typed names, with keys) and the per-row staff keys.
- Older records read with no staff. Updates follow "missing means unchanged".
- The static store checks the same limits and uniqueness as hosted.
- IndexedDB version bump to 3, with a no-op upgrade, as in #405: a tab running the previous build would otherwise rewrite records without staff. The existing versionchange handling makes it reload first.

### R8. Editor UI (shared)

- **Staff section**, beside the practice details:
  - each person on a 44px row with their name (editable for typed people; officials show their team name, read-only), a link badge for team officials, and remove;
  - **Add staff** opens a menu of team officials and admins on hosted, plus **Type a name**. The static planner offers **Type a name** only.
  - removing someone with assignments asks to confirm: "Remove Sam? They run 2 rows." (with the right counts).
- **Run by** on every row card: a compact multi-select chip picker (Autocomplete with chips, max 4) from the practice's staff list.
- Exact copy goes in the plan's Global Constraints.
- Only palette tokens, 44px targets and portable components. Each new component must be portable, and if `PracticeSessionEditor.tsx` would exceed 900 lines, new code is extracted first.

### R9. Session page, bench sheet and exports

- **Timeline:** each row (or each station in a block) shows " · run by Coach Lee, Sam" in secondary text.
- **Sidebar cards:** a "Run by" line.
- **Bench sheet** (live, HTML, Word): a "Staff: Coach Lee, Sam, Alex" line in the header, and names per row. Strings are escaped in HTML and passed through `xmlSafe` in Word.
- **Import preview:** names per row and the staff list.

### R10. Emails

- `sendPracticePlanNotifications` builds the same message for everyone, then adds per-recipient lines.
- For a recipient whose `userId` matches a staff member (`userId` directly, or `teamOfficial.userId`), it adds "Your stations: <row title> (<start time>), …", in schedule order.
- Rows use the same titles and `buildSchedule` start times as the bench sheet. Times are in the venue time zone when there is one, otherwise the team default used by the existing emails.
- Recipients with lines get their own send. Everyone else gets the shared send as today.
- Recipients don't change, and preferences still apply. Names are escaped.

### R11. Editor budget and seams

- Every reader of rows that renders names reads them from the session's staff list by key. There is no denormalized name per row.
- The editor keeps staff in one hook (`useSessionStaff`).

## Testing

- **Pure:** staff-key helpers; the name normalization and uniqueness rules; the "Your stations" line builder (order, times, titles for blocks and stations).
- **Zod and plan document:**
  - limits and uniqueness;
  - unknown assignee key or name;
  - old files;
  - round-trip;
  - links dropped on export.
- **Migration** matches `schema.prisma`, including the CHECK and the expression index.
- **Server actions:**
  - authentication and authorization first;
  - a cross-team official or user is rejected;
  - absent `staff` is unchanged across a row rewrite;
  - `[]` clears;
  - an editor that omits `staff` keeps stored staff and assignments across a row rewrite;
  - duplicate, detach and import carry staff;
  - a guard test from the copy select.
- **Emails:**
  - an assigned official with an account gets their line;
  - others don't;
  - a typed name gets nothing;
  - preferences are respected;
  - escaping.
- **Static store** (both repos): legacy records, limits, "missing means unchanged".
- **Components:**
  - Staff section add, rename and remove (with confirm);
  - Run by picker (max 4);
  - an untouched editor keeps staff and assignments;
  - the hosted picker lists officials and admins without emails.
- **Bench sheet model, HTML and Word:** the staff header and per-row names, escaped.
- **Visual:** light and dark screenshots on desktop and mobile of the editor Staff section and Run by, the session page, the bench sheet and the import preview.

## Out of scope

- A personal "my assignments" view, or a dedicated assignment email.
- Player groups or rosters per station.
- Staff availability, or conflicts across practices.
- Inviting typed volunteers to the team.

# Practice Roster and Drill Suggestions — Design

**Date:** 2026-10-07
**Status:** Approved (design); implementation plan in `../plans/2026-10-07-practice-roster-suggestions.md`
**Applies to:** the hosted Next.js planner and the static Vite planner (`apps/planner/`). Both render the shared components in `components/features/practice-planner/`.
**Depends on:** practice staff (the closest precedent for a per-practice people list), goaltender-aware drills (`focus`, `goalies`, `goaliesAttending`, `goalieDemand`), drill age groups (`lib/utils/age-groups.ts`), practice timing (station blocks), the plan document (ADR-0020), the bench sheet and its exports.

## Context

What exists (verified):
- **No practice age group.** Drills and templates carry age groups; a practice does not (the age-group templates spec put "an age group on practices" out of scope). The age filter is a device-wide `localStorage` choice.
- **Goalies attending.** `PracticeSession.goaliesAttending` (0–10 or null) already drives goalie warnings and hides optional drills' goalie markers at 0.
- **Drill attributes.** A drill has `name`, `description`, `focus` (`team | skaters | goalies`), `goalies` (`none | optional | required`), `ageGroups`, and a diagram (`playData`) whose player markers carry a role (`X`, `O`, `F`, `D`, `G`, `C`) and whose `area` says where on the ice it runs. No drill declares a player count.
- **Library summaries.** `getPlaysByTeam` (hosted and static) returns summaries without `playData`, at most 100 per page.
- **Team roster (hosted).** `Player` has `name`, `jerseyNumber` (1–99), free-text `position`, and admin-only fields (`emergencyContact`, `dateOfBirth`, `usahMemberId`, …). Players are often minors.
- **Staff precedent.** A per-practice list in its own tables, saved whole beside the rows ("absent = unchanged, `null`/`[]` clears"), names only in plan files, a static IndexedDB version bump so an old tab reloads before writing.

## Goal

A coach lists who is expected at a practice, by position, and the planner suggests drills that fit those numbers.

### Success criteria

1. The editor has a **Roster** section on both planners:
   - an age group (default: none) that picks the default positions;
   - position toggles (Skater, Forward, Defense, plus up to 3 custom positions; Goalie is always on);
   - players with an optional name and an optional jersey number, each with a position;
   - add one player, paste a list, and (hosted) pick from the team's roster.
2. A **Suggested drills** panel ranks library and starter drills for the roster's skater and goalie counts and age group, with a reason per drill, and adds one to the practice in one tap.
3. The bench sheet shows the roster counts, and names on screen and in print.
4. Plan files and the HTML and Word exports carry the counts always and names only when the coach opts in. Plan links never carry names.
5. Existing practices, plan files and exports behave exactly as before.

## Rulings

### R1. The roster belongs to the practice, in one key per layer

The roster is one object, `roster`, with its own `ageGroup`, `roles` and `players`:
- hosted: `PracticeSession.rosterAgeGroup`, `PracticeSession.rosterRoles` and a new `practice_session_roster_players` table;
- static: `StoredSession.roster`;
- plan document: `session.roster`;
- editor and views: `roster?: PracticeRoster | null` on `PracticeSessionData` and `PracticeSessionView`.

**Why:** other work (practice equipment, favorites) is changing the same files now. One new key per layer, and new files for the logic and the UI (`lib/utils/practice-roster.ts`, `lib/utils/drill-suggestions.ts`, `SessionRosterSection.tsx`, `DrillSuggestionsPanel.tsx`, `useSessionRoster.ts`, `lib/services/practice-session-roster.ts`), keep every merge to a few added lines.

### R2. The roster carries its own age group

`roster.ageGroup` is an `AgeGroup` or `null`. It sets the default positions (R3) and the age the suggestions rank for (R7).

**Why:** a practice has no age group, and adding one to the session would be a wider change (list views, templates, the plan's session fields) than this feature needs. Keeping it inside the roster means "the age these players are" — exactly what the positions and suggestions need. A session-level age can later read it.

### R3. Positions: built-ins, toggles and custom

- Built-in positions, stored as codes: `S` Skater, `F` Forward, `D` Defense, `G` Goalie.
- `roles` is the list turned on for this practice, in display order: `S`, `F`, `D`, then custom positions in the order added, then `G`.
- **Defaults from the age group:** 6U, 8U and none → Skater and Goalie; 10U and older → Forward, Defense and Goalie.
- **Goalie is always on**, and at least one skater position is always on (turning the last one off is refused in the UI; the normalizer adds `S` back).
- **Custom positions:** up to 3, each 1–12 characters once cleaned, unique ignoring case, never equal to a built-in code or label. A custom position always counts as a skater.
- **Changing the age group** resets the positions to the new age's default only while the coach hasn't changed them (they still equal the previous age's default).
- **Turning a position off** moves its players to the first skater position still on. Goalies stay goalies.

**Why:** the owner asked for a toggle or a per-practice choice. Toggles cover both: the age sets a sensible default, and the coach adjusts per practice. Counting custom positions as skaters keeps the suggestion inputs to two numbers; nothing reads a custom label to guess a goalie.

### R4. Players

| Field | Rule |
|---|---|
| `key` | the editor's key (a stored id on hosted once saved; the stored id on static) |
| `name` | optional; control characters removed, trimmed, at most 40 characters |
| `number` | optional; 1–3 digits (`"00"` allowed) |
| `role` | a position on the list; an unknown position reads as the first skater position |
| `playerId` | hosted only: a `Player` of the practice's team, or none |

- A practice lists at most 40 players. A team player is listed at most once.
- A player with neither a name nor a number shows as the position and its place: "Skater 3".

**Why:** a coach often knows only "7 skaters and a goalie", or uses jersey numbers or initials for minors. Nothing is required beyond the position.

### R5. No attendance state

Players have no expected / maybe / out state. The roster is already tentative: the coach removes a player who won't come.

**Why:** a state is one enum in the table, but it would also run through Zod, the plan file, the static store, the counts, the bench sheet and the exports, and every count would need a rule for "maybe". Not cheap, so skipped as the request allowed.

### R6. Hosted storage (hand-written, additive migration)

- `PracticeSession.rosterAgeGroup TEXT NULL` (CHECK: one of the six age-group values) and `PracticeSession.rosterRoles TEXT[] NOT NULL DEFAULT '{}'`. Empty `rosterRoles` means the practice has no roster.
- **`practice_session_roster_players`** (`PracticeSessionRosterPlayer`):

| Column | Rule |
|---|---|
| `id` | cuid |
| `sessionId` | FK, cascade |
| `position` | INTEGER ≥ 0, unique per session |
| `name` | TEXT NULL, ≤ 40 characters; null for a linked player |
| `number` | TEXT NULL, 1–3 digits; null for a linked player |
| `role` | TEXT, 1–12 characters |
| `playerId` | FK to `Player`, nullable, **`onDelete: Cascade`**; unique per session |

- A linked player's name and number are **read from `Player` at read time** (only `name` and `jerseyNumber` are selected), never copied into the practice.

**Why:**
- Linking by id, with the name read live, means the practice always shows the team's current spelling and number, and stores no second copy of a child's name.
- **Cascade, not SetNull:** when a team removes a player, their entry leaves every practice roster too. A practice is tentative planning; keeping a removed child's name in old practices has no coaching value and is the wrong default for minors' data. The cost (an old practice's count drops by one) is acceptable.
- A table, not a JSON column, so the database enforces the team link and the cascade.

### R7. Saving

- `roster` travels in the whole-practice save beside the rows. **Absent = unchanged; `null` clears;** a create without it stores none.
- A sent roster replaces the stored one whole. Players have no row links, so nothing is carried across the rows' rewrite.
- **Server checks, after authentication and authorization:** the Zod schema (limits, lengths, positions); every `playerId` is a `Player` of the practice's team; no `playerId` twice.
- Static: the store applies the same schema and messages; it refuses any `playerId`.

### R8. Hosted team picker

- `getPracticeRosterOptions(teamId)`, for team admins only (as `getPracticeStaffOptions`), selects `id`, `name`, `jerseyNumber` and `position` only, ordered by jersey number then name. No contact, birth date or membership field reaches the client. A guard test checks the select.
- The position text suggests a role: "goalie", "goaltender", "G" → Goalie; "defense", "defence", "D" → Defense; "forward", "center", "centre", "wing", "F", "C", "LW", "RW" → Forward; otherwise the first skater position. Forward and Defense fall back to the first skater position when turned off. The coach can change it.
- The picker is an "Add from team" dialog with a checkbox per player not yet listed and an "Add all" action.

### R9. Paste a list (both planners)

One player per line (or `;`-separated). On each line:
- the first 1–3 digit token, optionally with `#`, is the number;
- a position word at the start or end, optionally in parentheses or after a dash or comma, is the position: a built-in code or label (`G`, `Goalie`, `Goaltender`, `F`, `Fwd`, `Forward`, `D`, `Def`, `Defense`, `Defence`, `S`, `Skater`) or a custom position on the list;
- the rest is the name.

Blank lines are skipped. A line naming a position that's off is placed by R3's rule. Lines past the 40-player limit are reported, not added. The dialog previews the parsed players before adding.

### R10. Privacy: what leaves the device

| Output | Counts and positions | Names and numbers |
|---|---|---|
| Editor, session page, live bench sheet and print | yes | yes |
| Plan file (`.olplan.json`) | always | **only when "Include player names" is checked** |
| HTML and Word bench sheet exports | always | **only when checked** (the same checkbox) |
| Plan link (`#plan=`) | always | **never** |
| Practice emails | no change | no change |

- The checkbox sits in the Export menu, appears only when the roster has a name or a number, starts unchecked every time the menu mounts, and is never remembered.
- "Names" means both name and number: a jersey number with a team name can identify a child.
- Without names, a plan file carries each player's position only, so the counts and positions survive the round trip.
- Hosted links (`playerId`) never leave the database: plan files, exports and the static store hold typed text only.

**Why:**
- On screen and in print, the viewer is the coach or (hosted, once shared) a member of the same team, who already sees every player's name on the team roster page, so a practice roster shows nothing new; a bench sheet without names is useless on the bench.
- A file is deliberate and kept, so names are a choice the coach makes each time, off by default.
- A link is the most forwardable form: it is pasted into chats, synced in browser history and previewed by messaging apps. A toggle there would be one mis-tap from publishing children's names, so it is not offered.
- Counts alone identify no one and are what another coach needs to reuse a plan.

### R11. Plan document (`PLAN_VERSION` stays 1)

`session.roster`, optional:
```
roster: {
  ageGroup: "u6" | … | "u16plus" | null,
  roles: string[],                      // R3, normalized on read
  players: Array<{ role: string, name?: string, number?: string }>  // ≤ 40
}
```
- Missing or `null` reads as no roster: every earlier file.
- Read like the advisory fields where a value can be repaired (an unknown position becomes the first skater position; an invalid age reads as none; positions are normalized), strict where it can't (not a list, more than 40 players, an over-long name, a number that isn't 1–3 digits) with a readable `Roster: …` issue.
- Writers always emit `roster` (`null` when the practice has none, as the earlier amendments' writers always emit their fields), and emit `name`/`number` only when names are included.
- Import (both apps) creates typed players; a hosted import never links them to team players.
- ADR-0020 gets an amendment.

### R12. Static store

- `StoredSession.roster?: StoredRoster | null` (`{ ageGroup, roles, players: [{ id, name, number, role }] }`). Older records read with no roster. Updates follow "absent = unchanged".
- IndexedDB version 5 → 6 (after practice equipment took 5) with a no-op upgrade, so a tab on the previous build reloads before it can rewrite a session without its roster.

### R13. Suggestions

A pure, deterministic ranker, `rankDrillSuggestions(candidates, context, options)` in `lib/utils/drill-suggestions.ts`.

**Inputs.**
- `context`: `skaters`, `goalies` (R14), `ageGroup`, `stations` (the most stations in one block of the current practice, 0 or 1 when there are none), and the names already in the practice.
- `candidates`: library drills (first 100 library drills for the roster's age, from `getPlaysByTeam`) and starter drills not already in the library (matched by name, ignoring case).
- `options.compare`: an optional comparator, run after the score and before the name tie-break. **This is the seam for favorites** (a later change passes "favorites first"); nothing implements it here.

**Implied player counts, not stored ones.** A drill's minimum skaters is the number of skater markers in its diagram (`F`, `D`, `X`, `O`); its best group is that number up to three times it (one group working, two waiting). Its goalie need is `goalieDemand`.
- Starter drills always have a diagram. A library drill takes its diagram from the starter of the same name; any other library drill has no known count and gets no count reason.
- **No stored min/max attribute for now.** Adding one means a `Play` column, a plan-document drill field, a static drill field, a drill-editor field and a backfill, all in files the equipment work is editing. The implied count covers every starter. A stored override can be added later if coaches find the implied counts wrong.

**Rules (in order).**
1. **Excluded:** a drill already in the practice (by name); a drill tagged for other ages when the roster has an age (an untagged drill suits every age); a drill that needs more goalies than the roster has; a drill whose minimum skaters is more than the roster has.
2. **Score** (higher first):
   - age: tagged for the roster's age +2 (reason "Made for 8U"); untagged +0;
   - goalies: needs goalies and the roster has enough +2 ("Needs a goalie: you have 1", "Needs 2 goalies: you have 2"); goalie optional with goalies on the roster +1 ("Uses your goalie"); no goalie needed with none on the roster +1 ("No goalie needed");
   - skaters, when the count is known: within the best group +3 ("Best with 4–12 skaters"); above it +1 ("Big group: run it as 2 stations", the stations needed to bring each group into range, at most 4); with stations in the practice, and each station's share of skaters at least the minimum, +1 ("Fits a station of 4").
3. **Ties:** `options.compare`, then library before starter, then name (`localeCompare`, `en`), then id.

**Panel.**
- Under the Roster section, titled "Suggested drills", showing the top 6 with their reasons as chips and an **Add** button (44 px).
- Empty roster: "Add players to see drills that fit." No match: "No drills fit this roster yet."
- **Add** on a library drill loads it (`getPlayById`) and adds it as the library dialog does. On a starter drill it first copies it to the library (`createPlay`, as "Add to my library" does), then adds it, so hosted keeps its library-reference model.

### R14. Goalie count precedence

The suggestions read the roster's goalie count when the roster has at least one player, else `goaliesAttending` (when set), else 0. The roster never writes `goaliesAttending` and `goaliesAttending` never edits the roster. When both are set and differ, the Roster section shows "Goalies attending is 2; this roster has 1." with a **Use 1** button that sets `goaliesAttending`.

**Why:** two writers of one number fight; a stated precedence plus a one-tap fix is predictable.

### R15. Bench sheet and session page

- Live bench sheet and print: a header line `Roster: 7 skaters · 1 goalie` (or by position, `Roster: 4 forwards · 3 defense · 1 goalie`), then a compact list by position: `Goalie: #30 Pat` / `Skater: #7 Alex, #9, Sam, Skater 4…`.
- HTML and Word exports: the same counts line always; the list only when names are included. Strings escaped in HTML and passed through `xmlSafe` in Word.
- Session page (both planners): the counts line and the list under the practice details.

### R16. Editor budget and seams

- `PracticeSessionEditor.tsx` gains one hook call (`useSessionRoster`), two mounts and one payload field; it stays under its 900-line budget.
- All roster rules live in `lib/utils/practice-roster.ts` (portable: imports only `zod` and the age-group module).

## Testing

- **Pure:** roster normalization (roles, defaults by age, custom limits, remap on toggle), counts and labels, player labels, the paste parser, the team-position mapping, the Zod save schema, and the ranker (exclusions, each score, the tie-breaks, the comparator seam, determinism).
- **Plan document:** round-trip with and without names; an older file; a link never carries names; repaired values; strict issues.
- **Migration** matches `schema.prisma` (CHECKs, cascade, unique indexes).
- **Server actions:** authentication and authorization first; absent = unchanged; `null` clears; a cross-team `playerId` refused; duplicate copies the roster; import creates typed players; the picker selects only safe columns.
- **Static store:** legacy records, limits, absent = unchanged, duplicate, import, the version bump.
- **Components:** Roster section (age, toggles, add, rename, remove, paste, picker), the suggestions panel (reasons, add), the Export menu's checkbox.
- **Bench sheet model, HTML and Word:** counts always; names only when included; escaping.
- **Visual (static planner):** 7 skaters and 1 goalie for 8U, suggestions update, switch to an older age's positions, bench sheet and export privacy, at 360 px and 1280 px, light and dark.

## Out of scope

- Attendance states (R5) and RSVP integration.
- A stored drill player-count attribute (R13).
- Line combinations, station groups by player, or player development notes.
- Favorites (only the comparator seam).

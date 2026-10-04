# Goaltender-Aware Drills and an Expanded Starter Library — Design

**Date:** 2026-10-03
**Status:** Approved (design); implementation plan `../plans/2026-10-03-goalie-drills.md`
**Applies to:** the hosted Next.js planner and the static Vite planner (`apps/planner/`). Both render the shared components in `components/features/practice-planner/`.
**Depends on:** board notation (PlayData v2, role `G`), ice areas (2a), stations (2b), session-owned drills (3a), bench sheet (3b), plan document (ADR-0020, sub-projects 1–4).

## Context

Goaltenders are part of every hockey practice. The planner doesn't know that:

- A drill can't say whether it trains the team, the skaters, or the goalies, or whether it needs a goalie at all. Coaches can't filter the library for goalie work.
- A session can't say how many goalies are coming. A coach who plans three shooting stations for one goalie gets no hint. A coach whose goalies are out sees `G` markers on every diagram and bench sheet anyway.
- The starter library has 9 team-systems drills and 1 diagram with a goalie marker. There are no goalie drills, no skating or skill fundamentals, and no ready-made station practice.
- The static planner seeds starters once (`META_STARTERS_SEEDED`). A coach who already opened it would never receive new starters.

What the code already provides (verified):

- `PlayerRole` includes `G`, and `ROLE_DEFAULT_COLORS.G` is ink. The starter builders in `lib/data/starter-plays.ts` support `side: "goalie"`.
- Station groups, wall time and advisory `stationWarnings` live in `lib/utils/session-timeline.ts` (pure). `SessionDrillList` and `SessionDetailView` render them.
- The session detail page shows the stored **thumbnail** (a PNG) for the active drill. `StationMap`, `PlayLegend`, `BenchSheet` and the HTML/Word exports (`bench-sheet-model.ts`) render from `playData`.
- `ExportPlanMenu` builds the plan JSON from the same `PracticeSessionView` that the bench sheet exports use. Both apps use it.
- Every Play copy is explicit. `copySessionPlayScalars` covers `PracticeSessionPlay` columns only. `cloneDrillsIntoSessions` copies the fields listed in `CLONE_SOURCE_SELECT`. That one function serves materialize, detach-on-write and duplicate.
- Hosted starter visibility (`PlayLibrary.visibleStarters`) hides a starter whose name matches a play **on the current page** of the library, or one copied during this visit.
- `PracticeSessionEditor.tsx` is 878 lines against a 900-line budget test.

## Goal

A coach tags each drill with what it trains and whether it needs a goalie. The coach filters the library by those tags and tells a session how many goalies are coming. The planner then:

- warns, without blocking, when the plan needs more goalies than are attending;
- hides goalie markers on optional-goalie drills when nobody is in net;
- ships credible goalie and skater drills plus three station practices that work out of the box.

### Success criteria

1. Every drill has `focus` (`team` | `skaters` | `goalies`) and `goalies` (`none` | `optional` | `required`).
   - Existing drills read as `team` / `optional` in both apps, with no data rewrite.
   - The tags survive these operations in both apps: create, edit, save-in-session, fork, add-to-library, duplicate session, detach-on-write, plan export and plan import.
2. The library filters by Focus and by Goalies (chips). Filters compose with search, the date filter and pagination, and they also filter the starter cards.
3. The drill editor sets both tags. Library cards, starter cards and session drill cards show a **G** badge for `required`.
4. A session has an optional goalie count, 0–10. Unset means "not set" and changes nothing anywhere.
   - With a count set, the editor and the detail page show advisory goalie warnings in the same places as station warnings.
   - With a count of 0, `G` markers are hidden on `optional`-goalie drills in the detail view, `StationMap`, the printed bench sheet and the HTML/Word exports. Stored data and the plan JSON keep them.
5. The plan document (still version 1) carries the new fields. Both apps write them and both imports persist them. ADR-0020 records the change.
6. The starter library grows from 9 to 26 drills:
   - 9 new goalie drills;
   - 8 new skater-fundamentals drills;
   - every one of the 26 is tagged, has a real diagram, and passes `playDataSchema`.
   Three station templates are offered as "Use template" in both apps.
7. Static planner upgrades add only starters the device has never received. A starter the coach deleted never comes back.

## Rulings

These close the gaps in the approved design. The justification for each follows its ruling.

### R1. String columns with CHECK constraints, not Prisma enums

`Play.focus String @default("team")`, `Play.goalies String @default("optional")`, `PracticeSession.goaliesAttending Int?`. The hand-written migration adds `CHECK` constraints:

- `focus IN ('team','skaters','goalies')`;
- `goalies IN ('none','optional','required')`;
- `goaliesAttending IS NULL OR goaliesAttending BETWEEN 0 AND 10`.

*Why:*
- The value set belongs to the portable layer: `types/practice-planner.ts`, the plan document, and static IndexedDB records. Like `PLAYER_ROLES`, it is lowercase string literals.
- Every Prisma enum in this schema is UPPERCASE. An enum would need a case-mapping shim at about ten read and write sites, plus `ALTER TYPE` migrations to grow.
- The CHECK constraints still stop a bad write at the database. There is precedent in `20260704140000_season_scheduling` and `20260711120000_identity_graph`.
- Prisma does not model CHECK constraints, so it neither drops them nor reports drift.
- ADR-0016 already prefers typed code modules for vocabularies that change shape.

The single source of truth is `PLAY_FOCUS` / `PLAY_GOALIES` (`as const`) in `types/practice-planner.ts`. Zod builds `z.enum` from them. Readers narrow database strings with `toPlayFocus` / `toPlayGoalies`, which fall back to the defaults.

### R2. Migration

Folder: `prisma/migrations/20261003140000_play_drill_tags_and_session_goalies/migration.sql`.
- The header comment matches the two other 2026-10-03 migrations: hand-written and additive, because the dev database is behind and `migrate dev` cannot be used.
- `ADD COLUMN … NOT NULL DEFAULT '<const>'` is metadata-only on PostgreSQL 11 and later. Existing rows read the defaults with no rewrite.
- No index is added. A library is one team's few hundred rows at most, and the existing `[teamId, isTemplate]` index already narrows the scan.
- `__tests__/prisma/play-drill-tags-migration.test.ts` pins the statements, following the pattern of the existing migration tests.

### R3. Optional in portable types, defaults at read

`focus?` / `goalies?` are optional on:
- `SavedPlay`, `PlayInSession`, `SessionDrillPatch`;
- `LibraryPlaySummary`, `NewLibraryPlay`, `SessionDrillSave`, `LocalPlayUpdate`;
- `PracticeSessionViewPlay.play`, `ExportSessionPlay.play`;
- the plan `PlanSessionInput` drills.

`goaliesAttending?: number | null` is optional on `PracticeSessionData`, `PracticeSessionView`, `ExportSession` and `LocalSessionSave`.

Readers call `drillTags(x)`, which returns `{ focus, goalies }` with the defaults filled in.

On write:
- **Create:** an absent tag means the default.
- **Update** (`updatePlay`, saving an owned drill in place): an absent tag means unchanged.
- **Fork** (`saveSessionDrill` on a library or legacy play): an absent tag means the source's value.

An absent `goaliesAttending` on create means `null`. On update it means unchanged, so an autosave from an older open tab can't wipe it. An explicit `null` clears it.

*Why:* there are hundreds of existing fixtures. Absent-means-default matches what the database and IndexedDB return for legacy rows. The copy-path tests below replace the compiler as the guard.

### R4. Copy paths (the "tags survive" contract)

Each row is a site that writes or reads a Play or a session. Each needs the new fields and a test.

| App | Site | Change |
|---|---|---|
| hosted | `lib/actions/plays.ts` `createPlay` | write `focus`/`goalies` (defaults) |
| hosted | `plays.ts` `updatePlay` | write when present |
| hosted | `plays.ts` `getPlayById`, `getPlaysByTeam` | select and return; `getPlaysByTeam` filters by `focus`/`goalies` |
| hosted | `lib/services/practice-session-drills.ts` `CLONE_SOURCE_SELECT`, `CloneSource`, `cloneDrillsIntoSessions` data | copy both (covers materialize, detach, duplicate) |
| hosted | `lib/actions/practice-session-drills.ts` `saveSessionDrill` | new: default; in place: when present; fork: inherit from source |
| hosted | `practice-session-drills.ts` `copySessionDrillToLibrary` | select and copy |
| hosted | `practice-session-drills.ts` `duplicatePracticeSession` | copy `goaliesAttending` |
| hosted | `lib/actions/practice-sessions.ts` create / update | write `goaliesAttending` (R3 semantics) |
| hosted | `lib/actions/practice-session-queries.ts` `getPracticeSessionDetail`, `getPracticeSessionForEdit` | select the session count and the play tags |
| hosted | `lib/actions/practice-plan-import.ts` | `drillFields` gets the plan tags; the session gets `goaliesAttending` |
| hosted | `EditSessionWrapper`, `PracticeSessionEditorWrapper`, `PlayEditorWrapper` | pass the fields through |
| static | `store/library.ts` `createPlay`, `updatePlay`, `getPlaysByTeam` (filters), `seedStarterDrills` | write, filter, seed |
| static | `store/shared.ts` `summary()` | return the tags |
| static | `store/sessions.ts` `saveSessionDrill`, `importPlan`, `sessionMeta`, `duplicatePracticeSession`, `getSessionView`, `getSessionForEdit`, `assertExportable` | write and read; `cloneInto` and `copySessionDrillToLibrary` spread the record and need no change |
| static | `screens/SessionEditorScreen.tsx` `toLocalSessionSave`, `screens/DrillEditorScreen.tsx` | pass through |
| shared | `PlayLibrary` (load, `handleSelectPlay`, `handleAddStarter`), `PracticeSessionEditor.handleAddPlayFromLibrary`, `SessionDrillDialog`, `useSessionDrillDialog`, `applyDrillPatch` | carry the tags |
| shared | `ExportPlanMenu` serializer | write the tags and the count |

A guard test checks every `Prisma.PlayScalarFieldEnum` value against the keys a clone writes. Each must be written, or be in a named `PLAY_FIELDS_NOT_CLONED` set (`createdAt`, `updatedAt`: a clone is a new row). A future Play column then can't be dropped by clones without notice. This mirrors `copySessionPlayScalars`.

`app/(dashboard)/practice-planner/library/[playId]/edit/page.tsx` builds the `SavedPlay` the library editor starts from, so it also passes the tags.

### R5. Static records normalize on read

`StoredPlay` gains optional `focus?`/`goalies?`. `StoredSession` gains optional `goaliesAttending?: number | null`. They are optional because records written before this change lack them. The store always writes them; every store read goes through `drillTags(record)` or `record.goaliesAttending ?? null`. There is no IndexedDB version bump, no rewrite, and no repo change.

*Why:*
- One reader helper serves hosted rows, static records and plan drills alike.
- Repo-level normalization would duplicate it in two adapters.
- Required fields would break the many `StoredPlay` literals in the store tests for no added safety: the store's write sites are pinned by tests.

### R6. Advisory goalie warnings

`goalieWarnings(groups, goaliesAttending)` lives in `session-timeline.ts`, next to `stationWarnings`, and has the same shape: pure, over `groupStations` output.

**Demand per drill:**
- 0 unless `goalies === "required"` or `focus === "goalies"`.
- Otherwise `max(1, number of role-G markers)`.
- 1 for an unreadable diagram (`playData === null`).

**Demand per block:** the sum of its drills' demand, because stations run at once.

**Results:**
- `short`: each group whose demand is more than the goalies attending, as `{ groupIndex, sequences, needed }`.
- `unused`: true when at least one goalie is attending, the session has drills, and every drill is `goalies === "none"`.
- `goaliesAttending === null` returns no warnings.

**Messages** come from pure helpers, so the editor and the detail page say the same thing:
- standalone drill: "Needs a goalie — none attending" or "Needs 2 goalies — 1 attending";
- block header: "These stations need 3 goalies — 2 attending";
- session: "2 goalies attending, but no drill uses a goalie".

**Placement** follows the station warnings:
- A standalone drill gets a new `goalieWarning` prop on `SessionDrillCard`, rendered like `fitWarning`.
- A block appends its message to the `StationBlockHeader` warnings.
- The `unused` notice is an info Alert under the totals.
- `SessionDetailView` shows warning chips in the session's meta row (the count of short drills or blocks, and the unused notice) plus a "Goalies: N" chip. The logic lives in a `useSessionGoalies` hook, because the view has a 900-line budget.

The warnings never block a save, in either app.

### R7. Hidden goalie markers (render-time only)

The helpers live in `lib/utils/drill-tags.ts`:

- `withoutGoalies(playData)` returns a new `PlayData` with role-G players removed. Strokes, nets and annotations stay.
- `hidesGoalieMarkers(goaliesAttending, goalies)` is `goaliesAttending === 0 && goalies === "optional"`.
- `displayPlayData(playData, goalies, goaliesAttending)` returns the **same object** unless markers are hidden and there are any to hide.
- `sessionForDisplay(session)` maps each play's `playData` through `displayPlayData`. It returns the same session object when nothing changes, so React memos stay stable.

**Applied at render, never stored, in:**
- `SessionDetailView`: the active diagram, `PlayLegend` and `StationMap` stations. The detail view normally shows the stored thumbnail. When the active drill's markers are hidden it renders `PrintDiagram` from the display data instead, because a PNG can't be filtered.
- `BenchSheet.tsx`: diagrams and the combined legend.
- `buildBenchSheetModel`: the HTML and Word exports.

**Not applied to:**
- the plan JSON (`ExportPlanMenu` serializes the raw session);
- editor thumbnails and library thumbnails (stored images).

`required` drills keep their `G` markers. The warnings say a goalie is missing.

### R8. Library filters

- `LibraryQuery` gains `focus?: PlayFocus` and `goalies?: PlayGoalies`. `getPlaysByTeamSchema` gains the same as optional `z.enum`s.
- Hosted adds `where.focus` / `where.goalies`. Static filters before pagination. `total` counts the filtered set.
- The new component `DrillFilterChips.tsx` renders two single-select chip rows:
  - **Focus:** All · Team · Skaters · Goalies;
  - **Goalies:** Any · No goalie · Goalie optional · Needs goalie.
- `PlayLibrary` holds the two values. A change resets to page 1, and `loadPlays` takes them as arguments and effect dependencies, as `dateFilter` already does.
- `visibleStarters` applies the same chips.

### R9. Starter delivery

**Static:**
- `META_STARTERS_SEEDED` (boolean) gives way to `META_SEEDED_STARTER_IDS` (a `string[]`).
- If the legacy flag is true and the new key is absent, the device counts `ORIGINAL_STARTER_IDS` as seeded. That is a hard-coded list of today's 9 ids. It is not derived from `STARTER_PLAYS`, which will grow.
- Seeding adds starters whose id isn't in the set, and records every pending id as seeded. That includes one skipped because a library play already has its name, so a deleted starter never returns.
- The legacy key is left in place, and nothing reads it after migration.

**Hosted:** confirmed. `PlayLibrary.visibleStarters` already lists starters not yet copied, by name, and that stays.
- *Known limitation, kept:* matching is against the current page only. Once a library passes one page (20), a copied starter can show again on another page.
- Adding it twice makes a second copy. Nothing is lost.
- Fixing this needs a "copied starter ids" query and is out of scope.

### R10. Starter templates are plan inputs, serialized at use time

`lib/data/starter-templates.ts` exports `STARTER_TEMPLATES: readonly StarterTemplate[]`, where each is `{ id, name, description, session: PlanSessionInput }`.
- Each drill is built from a starter by id. The name, description, `playData` and tags come from `STARTER_PLAYS`, so there's one source.
- `starterTemplatePlan(template, generator, now)` calls `serializePlan`.

*Why:* `PlanGenerator` must be the running app's value, and `exportedAt` must not freeze at build time.

### R11. "Use template" goes through the existing import views

The new `StarterTemplatePicker.tsx` (shared) lists the templates as cards, each with a **Use template** button.

**Hosted:**
- `PlanImportView` renders the picker in its `pick` state. Choosing a template sets `{ kind: "ready", plan: starterTemplatePlan(t, "openleague-hosted") }`.
- The existing flow then runs as for a file: preview, team, date, start time, add to library, `importPracticePlan`. The server re-parses the document.

**Static:** `ImportScreen` does the same with `"openleague-static"` and `store.importPlan`.

**Entry points:** both practice lists get a **Use a template** button that links to the import route (`/practice-planner/import`, `#/import`). The hosted button shows only where Import shows (`canImport`).

There is no new server action and no new route.

### R12. Editor budget

`PracticeSessionEditor` gets at most ~10 lines:
- `useGoaliesAttending(initial, markDirty)` (hook) owns the state;
- `GoaliesAttendingField` (component) is a select with "Not set" plus 0–10;
- the editor adds the hook call, one payload field, one JSX element, one `SessionDrillList` prop, and imports.

The budget test stays at 900.

### R13. Plan document fields (PLAN_VERSION stays 1)

**Drill fields** `focus` and `goalies`:
- Missing or null reads as the default.
- An unrecognized value also reads as the default (`z.unknown().transform(toPlayFocus)`). The tags are advisory and must never block opening a plan.

**Session field** `goaliesAttending`:
- Missing or null reads as `null`.
- A value that is not an integer from 0 to 10 also reads as `null`.

**Serialization:**
- `serializePlan` always writes all three, with `null` for an unset count.
- `PlanSessionInput` and `PlanEditorDrill` / `PlanEditorSession` carry them.

Older v1 readers strip unknown keys, so files stay mutually readable. A round trip through an older build drops the tags. ADR-0020 gains an amendment recording the additive fields, and `affects` gains `lib/data/starter-*.ts`.

### R14. Drill editor UI

`PlayEditor` gains two `TextField select`s, **Focus** and **Goalies**, beside the description. Choosing Focus = Goalies while Goalies is not `required` sets it to `required`; the coach can change it back. `SavedPlay` carries both.

The new `GoalieBadge.tsx` is a small circular "G" with `aria-label="Needs a goalie"`. It appears on `PlayCard`, `StarterPlayCard` and `SessionDrillCard` when `goalies === "required"`.

## Starter content

All coordinates are rink feet (200×85):
- goal lines at x=11 and x=189, blue lines at 75 and 125;
- end-zone dots at x=31 and x=169, y=20.5 and 64.5; the circles have a 15 ft radius;
- creases have a 6 ft radius at (11, 42.5) and (189, 42.5).

**Rules:**
- Player centers are at least 12 ft apart.
- A left-end net is `rotation: 180`, because the glyph opens toward −x at 0.
- An id containing `pass` or `shot` has that action.
- A `required` drill has at least one role-G marker. A `none` drill has none.
- Every drill keeps the existing pack invariants: at least 3 players, at least 3 drawings, every element in the rink and inside its area, and a 21–1000-character coaching description.

The builders gain `coach`, `goalie`, `carry`, `backskate`, `lateral`, `skateStop` (end `stop`), `net`, `cone`, `pylon` and `pucks`.

### Existing 9 (tagged)

| id | focus | goalies | note |
|---|---|---|---|
| starter-breakout-5man | team | optional | |
| starter-3man-weave | skaters | optional | ends in a shot |
| starter-pp-umbrella | team | optional | |
| starter-pk-box | team | optional | |
| starter-122-forecheck | team | none | no net in play |
| starter-low-cycle | team | optional | |
| starter-point-shot-screen | team | **required** | gains `G` at (187, 42.5); the net-front player moves to (175, 45) and the shot ends at (183, 42), so the markers stay 12 ft apart |
| starter-dzone-coverage | team | optional | already has `G`; hidden when 0 goalies attend |
| starter-nz-regroup | team | none | |

### New goalie drills (focus `goalies`, goalies `required`, all at the left net)

| id | name | area |
|---|---|---|
| starter-goalie-angles-depth | Angles & Depth: Five-Spot Shooting | zone-left |
| starter-goalie-butterfly-recovery | Butterfly Drop & Recovery | custom {0, 17.5, 40, 50} |
| starter-goalie-post-to-post | Post-to-Post: RVH and Pushes | custom {0, 10, 45, 65} |
| starter-goalie-rebound-control | Rebound Control: Steer to the Corners | zone-left |
| starter-goalie-screens | Tracking Through Screens | zone-left |
| starter-goalie-puck-handling | Goalie Puck Handling: Stop and Set | half-left |
| starter-goalie-breakaways | Breakaways and Shootout | half-left |
| starter-goalie-warmup | Goalie Warm-Up | zone-left |
| starter-goalie-crease-pattern | Crease Movement Pattern | custom {0, 12.5, 50, 60} |

### New skater fundamentals (focus `skaters`)

| id | name | goalies | area |
|---|---|---|---|
| starter-skate-edges-crossovers | Edges & Crossovers: Circle Figure-Eights | none | zone-right |
| starter-skate-transitions | Pivots & Transitions: Cone Box | none | zone-neutral |
| starter-skate-passing-lanes | Partner Passing Lanes | optional | full ice |
| starter-skate-wrist-shots | Wrist-Shot Lanes | optional (has `G`) | zone-right |
| starter-skate-puck-protection | Puck Protection: Wall Battle | none | custom {155, 45, 45, 40} |
| starter-skate-small-area-2v2 | Small-Area 2-on-2 Battle | optional (has `G`) | zone-right |
| starter-skate-stops-starts | Stops & Starts | none | full ice |
| starter-skate-stickhandling | Stickhandling: Cone Weave | none | zone-neutral |

The full diagrams and descriptions are in the plan (Tasks 6–7). The descriptions use correct terminology, including:
- RVH, butterfly, lead-leg recovery, T-push and shuffle;
- C-cuts, set and reverse;
- inside and outside edges;
- open pivots;
- cushioning the pass;
- toe drags.

They give recommended durations.

### Templates (each with a goalie station)

Stations sit on non-overlapping areas. Shared edges are allowed, within the 1 ft tolerance.

| id | name | min | blocks |
|---|---|---|---|
| template-skills-stations | Skills Stations | 60 | Goalie Warm-Up (zone-left) ∥ Edges & Crossovers (zone-right), 10 · Angles & Depth (zone-left) ∥ Stickhandling (neutral) ∥ Wrist-Shot Lanes (zone-right), 15 · Partner Passing Lanes, 10 · Small-Area 2-on-2, 15 · Stops & Starts, 5 |
| template-goalie-skater-rotation | Goalie & Skater Rotation | 45 | Goalie Warm-Up ∥ Transitions ∥ Edges, 8 · Butterfly (left crease) ∥ Stickhandling ∥ Puck Protection (right corner), 12 · Breakaways, 10 · Small-Area 2-on-2, 12 |
| template-team-stations | Team Practice with Stations | 60 | Angles & Depth ∥ Transitions ∥ Small-Area 2-on-2, 15 · Rebound Control ∥ Stickhandling ∥ Wrist-Shot Lanes, 15 · Point Shot with Screen, 10 · Breakout (5-Man), 10 · 3-Man Weave, 8 |

**Template tests:**
- `parsePlan(starterTemplatePlan(t, …))` succeeds;
- no `stationWarnings` overlaps;
- `sessionWallMinutes` is at most the duration;
- every station block holds a drill with `goalies === "required"`;
- with `goaliesAttending: 1`, `goalieWarnings(...).short` is empty.

## Testing

TDD per task (see the plan):
- pure units: `drill-tags`, `goalieWarnings`, plan-document parse and serialize, migration SQL;
- hosted actions: plays write, read and filter; session drills; detach; duplicate; import; sessions; the clone guard;
- the static store against both repos, through `store-harness`;
- components: PlayEditor selects, badges, filter chips, goalie field, warnings, hidden markers in detail, bench sheet and HTML export, template picker in both import views;
- content invariants for all 26 starters and the 3 templates.

**Gates:**
- `bun run db:generate`, `type-check`, `lint`, `test`, `build`;
- `planner:build && planner:check`;
- `adr:lint`, `check:raw-sql`.

## Out of scope

- Per-goalie names or rosters, and assigning goalies to stations.
- Goalie-specific bench-sheet sections.
- A goalie count in the bench-sheet header.
- Fixing hosted page-scoped starter matching (R9).
- Re-rendering stored thumbnails without goalie markers.
- Sports other than hockey.

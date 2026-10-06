# ADM-Style Templates, Small Ice Areas and Age Groups — Design

**Date:** 2026-10-05
**Status:** Approved (design); implementation plan to follow in `../plans/2026-10-05-practice-adm-style-templates.md`
**Applies to:** the hosted Next.js planner and the static Vite planner (`apps/planner/`), which share `components/features/practice-planner/`.
**Depends on:**
- ice areas (`ICE_AREA_PRESETS`, `lib/utils/ice-area.ts`, `station-map.ts`);
- drill tags (`focus`, `goalies`, migration `20261003140000_play_drill_tags_and_session_goalies`);
- the starter catalog (`lib/data/starter-plays.ts`, `starter-templates.ts`, `StarterTemplatePicker`);
- the plan document (ADR-0020);
- `lib/utils/age-level.ts`.

## Context

What exists (verified):
- **Ice areas.**
  - `ICE_AREA_PRESETS` are `full`, `half-left`, `half-right`, `zone-left`, `zone-neutral` and `zone-right`.
  - Every preset spans the full rink height (85 ft).
  - A `custom` rectangle is also allowed.
  - Nothing smaller than a zone has a name.
- **Drill tags.** `Play.focus` and `Play.goalies` are strings with CHECK constraints, lowercase values, mirrored in Zod, the plan file and the static store.
- **Catalog.**
  - There are 26 starter drills and 3 station templates.
  - Neither drills nor templates have an age field.
  - Templates are used through "Use template" on the import screen in both apps.
- **Age labels.** `lib/utils/age-level.ts` already labels league age classifications ("8U (Mite)", "10U (Squirt)" and so on).
- **Notation.** The board notation is our own Digital Playbook design (see the 2026-10-02 notation spec), and this work keeps it.

## Goal

A coach running a youth practice in the ADM style (several small stations at once, small-area games, age-appropriate content) can:
- start from an age-group template;
- find drills for their age group;
- tag their own drills by age.

All content is written by OpenLeague. "ADM-style" is used only descriptively. Nothing names, copies or implies endorsement by any governing body.

### Success criteria

1. The area picker offers six quarter-ice presets. They work everywhere an area works: the board view, the station map, overlap warnings, thumbnails, the bench sheet and the exports.
2. **Age tags.**
   - Every starter drill and template carries age groups. Drills suitable for every age carry none.
   - A coach can set age groups on their own drills, hosted and static.
   - Plan files carry the tags.
3. The drill library (hosted and static), the session's drill picker and the template picker filter by age group. "All ages" is the default, and the filter is remembered on the device.
4. **Templates.** Three new templates (8U, 10U, 12U) and about eight new small-area drills, all valid on the rink, with no overlapping stations.
5. Existing drills, plans and files behave as before. Older plan files import with no age groups.

## Rulings

### R1. Quarter-ice presets

**The presets.** Six presets are added to `ICE_AREA_PRESETS`:

| Preset | Columns (x) | Rows (y) |
|---|---|---|
| `zone-left-top` | zone-left | 0 to 42.5 |
| `zone-left-bottom` | zone-left | 42.5 to 85 |
| `zone-neutral-top` | zone-neutral | 0 to 42.5 |
| `zone-neutral-bottom` | zone-neutral | 42.5 to 85 |
| `zone-right-top` | zone-right | 0 to 42.5 |
| `zone-right-bottom` | zone-right | 42.5 to 85 |

- Columns are the zone presets' x ranges; rows are the top and bottom halves of the rink height.
- `PRESET_X` becomes a full preset-to-rectangle table, so `areaRect` returns `y` and `h` per preset. Existing presets keep `y: 0, h: 85`, so their rectangles don't change.

**Labels:** "Left end – top", "Left end – bottom", "Neutral – top", "Neutral – bottom", "Right end – top", "Right end – bottom". Cross-ice play uses the existing zone presets.

**Compatibility.**
- `PLAY_DATA_VERSION` and `PLAN_VERSION` stay the same. The values are additive.
- An older build reads a diagram with a new preset as full ice (it drops the unknown area) until it reloads; the ADR-0020 amendment records the exact behaviour.
- ADR-0020 gets an amendment.

**Area picker.** It groups the presets: "Full and halves", "Zones", "Quarters".

### R2. Age groups

**Values.**

| Stored value | Label |
|---|---|
| `u6` | 6U |
| `u8` | 8U |
| `u10` | 10U |
| `u12` | 12U |
| `u14` | 14U |
| `u16plus` | 16U+ |

- They are exported as `AGE_GROUPS` with `AGE_GROUP_LABELS`.
- Each maps to the league `AgeClassification` for wording consistency. The mapping is a constant, not a database link.

**Shape.** `ageGroups: AgeGroup[]` holds 0 to 6 unique values, kept in the table's order. An empty list means "all ages".

**Hosted storage.**
- A `Play.ageGroups TEXT[] NOT NULL DEFAULT '{}'` column, added by a hand-written additive migration.
- A CHECK constraint (`"ageGroups" <@ ARRAY[...]::TEXT[]`) guards the values.
- The Zod schema validates writes, and the create, update, duplicate and import actions carry the field.

**Static store.**
- Drill records gain `ageGroups`. Older records read as `[]`, and a missing field on update means unchanged.
- Following #405 and #407, an IndexedDB version bump with a no-op upgrade makes a tab on the previous build reload before writing, so it can't drop the field.

**Plan document.**
- Each drill gains an optional `ageGroups`.
- An unknown value is rejected with a readable "Drill N" issue.
- An older file imports with `[]`.
- Covered by the ADR-0020 amendment.

**Starter catalog.** `StarterPlay` and `StarterTemplate` gain `ageGroups`. A template's age groups come only from its own field; they are not derived from its drills.

### R3. Filtering

- **Control.** One shared `AgeFilter` component: a row of chips ("All ages", 6U … 16U+), single choice, 44 px targets and palette tokens.
- **Matching.** A drill matches age `a` when its `ageGroups` is empty or contains `a`. Templates use the same rule.
- **Where it appears.** The drill library (hosted page and static screen), the session editor's drill picker and the template picker.
- **Memory.** The choice is stored per device in `localStorage` under one key, wrapped in try/catch. A blocked or empty storage means "All ages".
- **Empty results.** "No drills for 8U yet. Show all ages", where the last part is a link-styled button that resets the filter.

### R4. Editor field

- The drill editor (`PlayEditor`, shared by both apps) gains an **Age groups** multi-select chip field next to Focus and Goalies.
- Helper text: "Leave empty if it suits every age."
- It saves through the existing hosted and static paths.

### R5. New content (written by OpenLeague)

**Templates.** 60 min each, with warm-up, rotations and cool-down built from the existing block rows:

| Template | Age groups | Stations | Rotation |
|---|---|---|---|
| **8U Station Practice** | 6U, 8U | 4 on quarter-ice presets | every 10 min |
| **10U Station Practice** | 10U | 4 stations (3 on quarter-ice presets, 1 3v3 game in a zone) | every 10 min |
| **12U Skills and Small Games** | 12U, 14U | 3 zone stations, then a 4v4 cross-ice game block | — |

- The goalie station follows the existing `stays` pattern.
- Template descriptions may say "station-based, ADM-style practice".

**Drills.** About eight new starter drills, each with its own diagram on a quarter-ice or zone preset:
- 2v2 quarter-ice battle;
- 3v3 cross-ice game;
- 4v4 cross-ice game;
- puck-control obstacle lane;
- edges and crossovers circuit;
- give-and-go passing triangle;
- quick-release shooting station;
- small-area keep-away.

Names and descriptions are original.

**Rules.**
- No governing body's name, logo, diagram, drill name or text appears anywhere in the content, code comments, docs or commit messages.
- Each drill passes the existing starter-catalog tests.
- Each template passes the station-overlap and area checks.

### R6. Code structure

- Age-group constants, labels, the match rule and the Zod schema live in `lib/utils/age-groups.ts`. It is portable (ADR-0020).
- Quarter-preset labels sit with `ICE_AREA_LABELS` in `notation.ts`.
- Rectangles live in `lib/utils/ice-area.ts`.
- `AgeFilter` goes in `components/features/practice-planner/`.
- The line budgets still hold: `PracticeSessionEditor` ≤ 900 lines, `RinkBoard.tsx` ≤ 1057 lines.

## Testing

- **Areas:**
  - each new preset's rectangle;
  - existing presets unchanged;
  - the schema accepts the new presets and rejects unknown ones;
  - `station-map` and overlap checks with quarter areas;
  - a plan file round-trip.
- **Age groups:**
  - Zod: values, duplicates, order and empty list;
  - the migration matches `schema.prisma`, including the CHECK constraint;
  - server actions: create, update, duplicate and import carry the field, and invalid values are rejected;
  - static store: legacy records, missing-means-unchanged, and the version bump;
  - plan file: round-trip, an older file, and an unknown value rejected with a readable issue;
  - the match rule, including untagged drills.
- **Filters:**
  - the library, the drill picker and the template picker;
  - the remembered choice;
  - a blocked `localStorage`;
  - the empty state and its reset.
- **Catalog:**
  - every template drill exists;
  - every age group is valid;
  - every station area fits on the rink;
  - no stations overlap.
- **Visual:** light and dark screenshots on desktop and phone of:
  - the area picker;
  - the age filter;
  - the editor field;
  - the three templates' station maps and bench sheets.

## Out of scope

- A second symbol set or notation preset.
- An age group on practices or teams, or defaults taken from a team's division.
- Importing third-party practice files.
- Sport-specific variants beyond hockey.

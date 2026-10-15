---
name: import-drills
description: "Add drills (and optionally a starter practice template) to the practice planner's starter library from a drill PDF, practice plan, or other coaching material. Use when asked to import, add, or transcribe drills into lib/data/starter-plays.ts."
---

# Import drills into the starter library

Turns coaching material (USA Hockey drill cards, a coach's practice sheet, a
practice plan) into starter drills in `lib/data/starter-plays.ts`, and, when the
material is a whole practice, a starter template in
`lib/data/starter-templates.ts`. Starters reach the static planner on the next
load: it seeds any starter id it hasn't delivered yet, and skips a starter whose
name matches a drill the coach already has.

## Hard rules

- **No real people.** Practice sheets carry rosters (often minors' first names)
  and goalie names. None of it goes into code, tests, commit messages or PRs.
- **Paraphrase.** Published drill sets are copyrighted. Keep the drill's name,
  write the description in the pack's own voice, and redraw the diagram in rink
  coordinates. Never carry over OBJECTIVE/ORGANIZATION/KEYPOINTS text. Credit
  a published source in a comment above its entries.
- **Public repo.** No local paths, scratch paths or session details in
  anything committed, including commit messages and PR bodies.

## 1. Extract

Put each source in its own empty scratch directory. Then:

```bash
pdftotext -layout source.pdf source.txt          # text, if any
pdftoppm -r 110 -png source.pdf page             # page images for the diagrams
pdftoppm -r 200 -png sheet.pdf hi                # higher res for hand-made sheets
```

Read the PNGs: many sheets (OneNote, Bluebeam, flexxCOACH) are mostly images,
and some drills have a diagram and no text at all. Infer the rules from the
diagram and **tell the user what you inferred**.

## 2. Dedupe and decide

List the current starters (`grep -n 'name: "' lib/data/starter-plays.ts`) and
sort every source drill into one of three groups:

- **New.** It gets an entry.
- **Same drill under another name.** Map it to the existing starter. For
  example, a coach's "sharks and minnows" is "In and Out of Circles".
- **Close but distinct.** Add it under the source's own name when the source
  names it explicitly. A plan that schedules drills by name needs those names
  to exist.

Then make these decisions:

- **Prefixes and focus.** `starter-goalie-*` drills use focus `goalies` and
  goalies `required`. `starter-skate-*` drills use focus `skaters`.
  `starter-game-*` drills use focus `team`. Team set plays have no prefix
  (`starter-face-offs`). The tests count drills by prefix.
- **Age groups.** Use the source's own ages. When a coach adapts a drill to a
  younger group, tag that group too and end the description with an
  `8U: ...` style sentence.
- **Templates.** A practice plan becomes a template only when it is a single
  session. A multi-week progression does not fit the template model, so leave
  it as a follow-up.

## 3. Author in parallel (subagents)

Every drill lives in one array, so parallel agents must not edit
`starter-plays.ts`. Give each agent its own batch file, which has its own
validation test:

```bash
python3 .claude/skills/import-drills/batch.py scaffold goalie-a goalie-b skaters
```

Give each agent `agent-brief.md` (in this folder), its batch name, its page
images and text lines, the exact list of drills with ids, names, tags, age
groups and areas, and any "8U:" adaptation lines. Aim for about 8 drills per
agent.

When every batch is green, merge them, in the order the drills should appear,
and clean up:

```bash
python3 .claude/skills/import-drills/batch.py merge goalie-a goalie-b skaters
python3 .claude/skills/import-drills/batch.py clean
```

## 4. Review what came back

These problems slip past the batch tests:

- **Filler goalies.** Agents add a second "waiting" goalie to reach the
  3-marker minimum. A drill that draws two goalies makes the planner warn
  single-goalie teams that they are a goalie short, and it breaks a template's
  one-goalie check. Convert a filler goalie to a waiting skater
  (`player(id, "S", x, y)`). Keep two goalies only when the drill really is
  built for two.
- **Diagrams.** Run `bun run planner:dev`, open `/planner/#/library` in a
  fresh browser profile and look at the new thumbnails. Animation is on the
  drill viewer.

## 5. Tests to update

In `__tests__/lib/data/starter-plays.test.ts`:

- **Area map.** Add an entry for every new id: `"custom"` for a custom
  rectangle, `undefined` for full ice.
- **Age map.** Add the age groups for every new id.
- **Goalie drill list.** Add the new goalie drills to the sorted id list in
  "ships N goalie drills".
- **Counts.** Update the skater-drill count and the total in "ships N skater
  drills ... and M starters".
- **New `describe`.** Add one for the batch, asserting what makes these drills
  themselves: source order, the 8U tagging, goalie counts, nets and areas.

When a template is added:

- **`starter-templates.test.ts`.** Update the id list, the name count, the age
  map, the 60-minute `it.each` list and `stationAreas`, and add an
  order-and-rotation test.
- **`StarterTemplatePicker.test.tsx`.** Add the template's drill count chip and
  its comment.

Then the snapshot and the full gate:

```bash
bun run test __tests__/lib/utils/canvas/playback.test.ts -u
```

The snapshot diff must be **additive only**. Golden keys are sorted, so git
shows moved lines as deletions. Compare each existing drill's block between
`git show HEAD:<snap>` and the working copy: none may change.

```bash
bun run test && bun run type-check && bun run lint
```

## Template constraints (`starter-templates.test.ts`)

- **Duration.** The wall minutes must fill the duration exactly. A rotating
  block runs rotation minutes × the number of stations.
- **First block.** It must warm the goalie up: a `warmup` block, the Goalie
  Warm-Up drill, or a lone drill whose instructions say "warm the goalie up".
- **Last row.** It must be a `cooldown`. One minute for a huddle is fine.
- **Stated minutes.** Every drill's description states minutes ("5 min." or
  "8–10 min."), and they must cover the time the template gives that drill.
  Choose the ranges before the agents write the descriptions.
- **Station blocks.** Each block has 2–4 stations, one of them goalies
  `required`. Station areas must not overlap: a quarter such as
  `zone-left-top` overlaps `zone-left`.
- **Description.** It says "every N minutes" for each rotation, and never says
  "between blocks" unless `transitionMinutes > 0`.
- **Instructions.** Never write "empty net" in the instructions of a drill
  that draws a goalie, unless they also offer "second goalie".

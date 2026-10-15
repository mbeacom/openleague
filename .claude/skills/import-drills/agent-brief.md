# Brief: author starter drills for the practice planner

Use `bun`, never npm. Do not run git. Edit only your own batch file.

## Your output

You own exactly one batch, scaffolded by `.claude/skills/import-drills/batch.py`:

- **`lib/data/_batch-<BATCH>.ts`.** This is the helper section of
  `lib/data/starter-plays.ts`, ending in `export const BATCH`. Replace the
  `// ENTRIES GO HERE` placeholder with your drill objects. Do not edit the
  helper section. If you need a new helper, say so in your report instead.
- **`__tests__/lib/data/_batch-<BATCH>.test.ts`.** This holds the real
  per-drill, area, note and playback checks. Do not edit it.

Iterate until `bun run test __tests__/lib/data/_batch-<BATCH>.test.ts` passes
completely.

## Read first

- **`lib/data/starter-plays.ts`.** Read the header comment (the coordinate
  system and diagram conventions) and three or four existing entries like
  yours. Match their voice, density and diagram style.
- **The source.** Read the page images (use the Read tool on the PNGs) and the
  text lines in your assignment.

## Each drill object

- **`id` and `name`.** The `id` uses the prefix from your assignment. The
  `name` is the source's name, unique in the library.
- **`description`.** Your own prose, 150–500 characters (500 is a hard
  maximum). Say what happens, then give "Teach:" cues, then the minutes
  ("5 min." or "8–10 min."). If your assignment gives an age adaptation, end
  with it ("8U: ..."). Paraphrase: never copy the source's sentences.
- **`focus`, `goalies` and `ageGroups`.** Use the values in your assignment.
  A drill whose `goalies` is "required" draws at least one goalie, and one
  marked "none" draws none.
- **Goalie markers.** Draw exactly as many goalies as the drill truly needs.
  Every drill needs at least 3 markers; when it is short, add a coach or a
  waiting skater (`player(id, "S", x, y)`), never an idle extra goalie. An
  extra goalie makes single-goalie teams get "short a goalie" warnings.
- **Drawing helpers.**
  - Players: `player`, `goalie`, `coach`. Draw at least 3 markers.
  - Strokes: `skate`, `skateStop`, `backskate`, `lateral`, `carry`, `pass`,
    `shot`, `zoneLine`. Draw at least 3. A stroke id containing "pass" or
    "shot" must be that action.
  - Equipment: `leftNet`, `rightNet`, `goalLineNet`, `smallNet`, `cone`,
    `pylon`, `pucks`, or `gear(kind, ...)` for other kinds.
  - Notes: short `note` labels, fontSize 4–6.
- **`area`.** Set an area for any drill confined to part of the ice: a preset
  such as `{ kind: "zone-left" }`, or
  `{ kind: "custom", rect: { x, y, w, h } }`. Every element and every note's
  text box must sit inside the area, 2 ft clear of its edges. A note's box is
  `text.length × fontSize × 0.6` wide, and runs from `y - fontSize` to `y`.
- **Element ids.** Ids are unique within the drill and share a 2–4 letter
  prefix.

## Geometry

- **Rink.** Measured in feet: x runs 0–200 and y runs 0–85.
- **Nets and lines.** The left goal line is x=11, with its net at (11, 42.5),
  rotation 180. The right net is at (189, 42.5). The end-zone dots are at
  x=31/169, y=20.5/64.5. The blue lines are x=75 and x=125.
- **Which end.** Put single-net goalie drills at the left end unless your
  assignment says otherwise.
- **Marker clearances.** Markers have a 6 ft radius:
  - player centers are at least 12 ft apart;
  - every arrow tip is at least 6 ft from every player center;
  - goalies stand at least 6 ft off the goal line.
- **Net mouth.** No pass or shot may cross the goal line between the posts
  (y 39.5–45.5).
- **Animation.** Start each skate, backskate or carry within about 8 ft of the
  player who performs it, or exactly where that player's previous route ended.
  Passes and shots start at the puck carrier.

## Privacy

Never write a real person's name anywhere. Sources may list rosters; ignore
them.

## Report back

1. A table with columns id | name | focus | goalies | ageGroups | area kind.
2. Every inference you made where the source was ambiguous or had no text.
3. The final test summary line.

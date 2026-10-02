# Practice Board: Hockey-Native Notation — Design

**Date:** 2026-10-02
**Status:** Draft for review
**Phase:** 1 of 3 in the practice-planner iteration

## Context

The practice planner lets a coach build practice sessions out of plays drawn on
a canvas rink (`components/features/practice-planner/RinkBoard.tsx`). The board
works, but its vocabulary is generic: `DrawingElementType` is
`"line" | "curve" | "arrow"`, players are a label plus a color, and there are no
equipment objects. Meaning is carried by color convention only (the starter pack
in `lib/data/starter-plays.ts` documents "orange arrows = passes, red arrows =
shots"), so the board can't tell a pass from a skate.

The iteration is decomposed into three sub-projects, each with its own
spec → plan → implementation cycle:

1. **Hockey-native board** (this spec): notation, equipment, player roles.
2. **Ice usage & stations**: drills declare their area of ice; sessions can run
   drills in parallel as stations. Builds on the vocabulary defined here.
3. **Plan management & bench sheet**: inline drill building, duplication,
   running timeline, printable plan. Renders the notation defined here.

## Goal

A coach can draw a drill the way they'd sketch it on a whiteboard, using hockey
vocabulary, styled in the OpenLeague Digital Playbook look rather than
copying USA Hockey's ADM symbols one-to-one. Every existing play keeps working
and loses nothing.

### Success criteria

- A coach can place players by role, place equipment, and draw strokes whose
  *action* (skate, backward skate, puck carry, pass, shot, lateral/crossover, plain line)
  is chosen at draw time and changeable afterwards.
- Each action has one distinct, consistent rendering everywhere the play appears
  (board, library thumbnails, session detail).
- A legend under the board lists exactly the symbols the drill uses.
- Every play stored before this change opens, renders equivalently, and saves
  as the new version without data loss.
- The board stays usable on a phone (touch targets ≥ 44px, no new gestures
  required for basic drawing).

### Non-goals

- Ice-area / station modeling (phase 2).
- Printing, PDF, timeline changes (phase 3).
- Animation / multi-frame plays.
- Sports other than hockey.
- Replacing the canvas renderer with SVG (considered and rejected below).

## Approach

**Semantic actions.** A stroke stores what it *means*; a single style table
decides how it *looks*. This was chosen over:

- *Style primitives* (dash pattern × wave × end cap, with toolbar presets):
  more flexible, but strokes lose their meaning — no truthful legend, no
  restyling all passes at once, and phase 2 can't reason about drill content.
- *SVG rewrite*: better hit-testing/print/a11y, but discards ~1.3k lines of
  tested canvas behavior (zoom/pan, touch, undo). High-DPI canvas export covers
  the print need in phase 3.

## Data model

All changes live inside the existing `Play.playData Json` column. **No Prisma
migration.**

### Current (v1, implicit)

Stored data is a bare `PlayData` (`{ players, drawings, annotations }`) with no
`version` field. `PlayDataJSON` in `types/practice-planner.ts` is declared but
never written. "v1" therefore means *any object without a `version` key*.

### New (v2)

```ts
// types/practice-planner.ts
export const PLAY_DATA_VERSION = 2;

export type PlayerRole = "X" | "O" | "F" | "D" | "G" | "C";

export interface PlayerIcon {
  id: string;
  position: Position;   // rink feet, x 0–200, y 0–85 (unchanged)
  role: PlayerRole;
  label: string;        // optional short text shown in/next to the marker ("" allowed)
  color: string;        // still user-choosable; role supplies the default
}

export type StrokeAction =
  | "skate"       // forward skating
  | "backskate"   // backward skating
  | "carry"       // skating with the puck
  | "pass"
  | "shot"
  | "lateral"     // crossovers / lateral movement
  | "line";       // plain line: markings, lanes, no hockey meaning

export type StrokePath = "straight" | "freehand";
export type StrokeEnd = "arrow" | "stop" | "none";

export interface DrawingElement {
  id: string;
  action: StrokeAction;
  path: StrokePath;
  end: StrokeEnd;
  points: Position[];
  color: string;
  strokeWidth: number;
}

export type EquipmentKind = "puck" | "puckPile" | "cone" | "net" | "tire" | "pylon";

export interface EquipmentItem {
  id: string;
  kind: EquipmentKind;
  position: Position;
  rotation: number;     // degrees; meaningful for "net", 0 otherwise
}

export interface PlayData {
  version: typeof PLAY_DATA_VERSION;
  players: PlayerIcon[];
  drawings: DrawingElement[];
  equipment: EquipmentItem[];
  annotations: TextAnnotation[]; // unchanged
}
```

`DrawingElementType` and the unused `PlayDataJSON` / `RinkDimensions` types are
removed. `DrawingTool` becomes
`"select" | "player" | "stroke" | "equipment" | "text" | "eraser"`; the
*active* role / action / path / end / equipment kind live in board UI state
(see Components).

### Upgrade (v1 → v2)

`upgradePlayData(raw: unknown): PlayData` in a new module
`lib/utils/play-data.ts`. Pure, total, and idempotent:

| v1 | v2 |
|----|----|
| missing `version` | `version: 2` |
| player `{ id, position, label, color }` | `role: "X"`, other fields kept |
| drawing `type: "line"` | `action: "line", path: "straight", end: "none"` |
| drawing `type: "arrow"` | `action: "skate", path: "straight", end: "arrow"` |
| drawing `type: "curve"` | `action: "skate", path: "freehand", end: "none"` |
| missing `equipment` | `equipment: []` |

Colors are preserved as-is. The upgrade **does not** infer actions from colors:
user plays use arbitrary colors and a wrong guess would silently change meaning.
Coaches can re-tag strokes with the inspector. (Starter plays are rewritten by
hand instead; see below.)

An object that already has `version: 2` passes through unchanged. Anything that
is neither valid v1 nor valid v2 throws a typed `PlayDataError`.

### Validation

One Zod v4 schema, `playDataSchema`, in `lib/utils/validation.ts`:

- replaces the two `playData: z.any()` fields (create and update play schemas);
- replaces the hand-written guards in `types/practice-planner.ts`
  (`isValidPosition`, `isValidPlayerIcon`, `isValidDrawingElement`,
  `isValidTextAnnotation`, `validatePlayData`, `validatePlayDataJSON`) — their
  callers move to the schema; tests in `__tests__/types/practice-planner.test.ts`
  are migrated, not dropped;
- enforces the existing `VALIDATION_CONSTRAINTS` plus a new
  `MAX_EQUIPMENT: 50`; positions are bounded to the rink (0–200, 0–85);
  strokes need ≥ 2 points; `MAX_ELEMENTS_PER_PLAY` counts players + drawings +
  equipment + annotations.

Writes (`createPlay`, `updatePlay`) parse through `playDataSchema` and only
accept v2. The client always produces v2 because it upgrades on load.

### Read sites

Every place that turns `Play.playData` into `PlayData` goes through
`parseStoredPlayData()` (`upgradePlayData` + schema parse), replacing the
`as unknown as PlayData` casts. Known sites:

- `lib/actions/plays.ts:386` (`getPlayById`) and the `getPlaysByTeam` mapping
- `lib/actions/practice-sessions.ts:1268` (`getPracticeSessionById`)
- `lib/actions/practice-session-queries.ts:265` and any other mapping in that file

The implementation plan must re-grep for `playData` reads rather than trust
this list. A play whose data fails to parse is surfaced as an error state for that one play
(board shows the existing `RinkBoardErrorBoundary` message), never a crashed
page and never silently emptied.

There is no backfill job: rows upgrade lazily on their next save. A grep-able
helper keeps the "v1 still exists in the DB" fact in one place.

## Rendering

`lib/utils/canvas/drawing-utils.ts` gains:

- `ACTION_STYLES: Record<StrokeAction, ActionStyle>`, the single source of truth
  for how each action looks:

  | action | stroke | notes |
  |--------|--------|-------|
  | skate | solid | |
  | backskate | solid with evenly spaced short cross-ticks | |
  | carry | wavy (sine along the path) | |
  | pass | dashed | |
  | shot | double parallel line | |
  | lateral | zig-zag | |
  | line | solid, thinner | neutral marking |

  End caps are independent: `arrow` (filled head), `stop` (perpendicular bar),
  `none`. Default end cap per action at draw time: `arrow` for all hockey
  actions, `none` for `line`.
- Path utilities that sample a polyline (straight or freehand-smoothed, reusing
  the existing curve smoothing) at even arc-length so wave/zig-zag/tick patterns
  render uniformly regardless of how fast the coach drew.
- `drawPlayer(role, …)`: role glyphs in the Digital Playbook palette —
  `X`/`O` as letters (X in Action Blue, O in Penalty Box Red by default),
  `F`/`D` as filled circles with the letter, `G` as a circle with a goalie
  bar, `C` as a triangle (coach). Default colors come from the theme; the
  per-player `color` overrides.
- `drawEquipment(kind, …)`: puck (small filled disc), puck pile (cluster),
  cone (triangle), pylon (tall narrow triangle), tire (ring), net (rotatable
  goal frame).
- Player marker radius drops from 12 ft to **6 ft**, so drills can show
  realistic spacing; the starter pack's "keep centers 24+ ft apart" rule
  relaxes to 12+ ft. Equipment glyphs are sized relative to it (puck ≈ 1.5 ft,
  cone ≈ 3 ft, net 6 ft wide), with a minimum on-screen size of 8 CSS px so
  they stay tappable when zoomed out.

`thumbnail-generator.ts` and `drawAllElements` render through the same
functions, so thumbnails, the board, and the session detail view stay
identical.

## Components

### DrawingToolbar

Tools regroup into four groups, each a single ToggleButton with a secondary
picker (popover on desktop, bottom sheet on `xs`):

- **Players**: role (X, O, F, D, G, C)
- **Movement**: action (7) × path (straight / freehand) × end (arrow / stop / none)
- **Equipment**: kind (6)
- **Annotate**: text, eraser

`select`, undo/redo, and clear stay as they are. The last-used option in each
group is remembered for the session (component state, not persisted), so
drawing ten passes in a row is one tap each. All targets ≥ 44px; every option
has an accessible name and tooltip.

### Element inspector (new: `ElementInspector.tsx`)

Appears when exactly one element is selected (floating panel anchored near the
selection on `md+`, bottom sheet on `xs`):

- stroke → action, end cap, color
- player → role, label, color
- equipment → kind, rotation (nets only)
- annotation → existing text editing

Edits go through the board's existing history so they are undoable.

### RinkBoard

- Hit-testing and drag gain the `equipment` collection; existing select/drag
  behavior covers it. The eraser removes equipment too.
- Stroke drawing records the active action/path/end at pointer-up.
- `RinkBoardHandle` is unchanged (undo/redo/clear).
- `RinkBoard.tsx` is already ~900 lines. New hit-testing for equipment goes into
  `lib/utils/canvas/interaction-utils.ts`, and new rendering into
  `drawing-utils.ts`, rather than into the component.

### Legend (new: `PlayLegend.tsx`)

Collapsible, below the board in `PlayEditor` and on the session detail view.
It is computed from the play: the distinct actions, end caps, roles, and
equipment actually used, each drawn with the same render functions at a small
size, and labeled ("Pass", "Puck carry", "Defense"…). Empty drill → no legend.

## Starter plays

`lib/data/starter-plays.ts` is rewritten to v2: color-encoded meaning becomes
`action`; the "Blue = our team / Red = opponent / Black = goalie" convention
becomes roles (`X`/`O`/`G`), with the color fields left to theme defaults. The
file's header comment is updated to describe the new conventions. A test asserts
every starter play passes `playDataSchema`.

## Error handling

- Corrupt or unrecognized stored data → `PlayDataError`, caught per play and
  shown in the existing error boundary with the play name; logged server-side.
- Server actions reject non-v2 or invalid input with the standard
  `ActionResult` error plus Zod `details` (existing pattern).
- Constraint overflows (for example a 51st cone) are blocked in the UI with a
  snackbar before they reach the server.

## Testing

- `upgradePlayData`: each mapping row in the table above; idempotence (v2 in → identical
  out); real v1 fixtures captured from current starter-play shapes; invalid
  input throws `PlayDataError`.
- `playDataSchema`: bounds, limits, ≥ 2 points, rejects v1 on write.
- Round trip: v1 fixture → load → save payload is valid v2 and semantically
  equal (same ids, positions, colors, labels, point lists).
- Renderers: one test per action, end cap, role, and equipment kind, asserting
  the expected canvas calls against a mocked 2D context (matching the
  approach in `__tests__/lib/utils/canvas/`).
- `DrawingToolbar` / `ElementInspector` / `PlayLegend`: Testing Library —
  selecting options, inspector edits are undoable, legend reflects content.
- Read sites: actions return upgraded data for v1 rows (Prisma mocked).
- Starter pack validates.
- Gates: `bun run type-check`, `bun run lint`, `bun run test`; `bun run build`
  because pages and components change.

## Risks

- **Visual density on phones.** Seven actions × three end caps is a lot. The
  remembered last-used choice plus action-first ordering keeps the common path
  short; revisit after real use.
- **Mixed-version rows.** v1 rows persist until edited. All reads go through one
  helper, and phase 2/3 must use that helper rather than reading `playData` directly.
- **Hand-rolled guard removal.** Other callers may depend on the guards in
  `types/practice-planner.ts`. The plan must grep and migrate all of them.

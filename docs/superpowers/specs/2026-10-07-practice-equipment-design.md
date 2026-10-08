# Practice Equipment — Design

**Date:** 2026-10-07
**Status:** Approved (design); implementation plan in `../plans/2026-10-07-practice-equipment.md`
**Applies to:** the hosted Next.js planner and the static Vite planner (`apps/planner/`). Both render the shared components in `components/features/practice-planner/`.
**Depends on:** the diagram data model (`PlayData` v2), session-owned drill copies (3a), stations and practice timing (`lib/utils/session-timeline.ts`), the plan document (ADR-0020), the bench sheet and its HTML/Word exports.

## Context

Before a practice, someone has to fill the bag: how many cones, which nets, how many pucks. The drill diagrams already show most of it, because the board's equipment tool places pucks, puck piles, cones, nets, tires and pylons. Nothing adds it up.

What exists today (verified):
- **Diagram objects.** `PlayData` holds `players` (skaters, goalies, coaches), `drawings` (lines), `equipment` and `annotations` (text), plus an optional ice `area`. Only `equipment` is gear. `EquipmentItem.kind` is one of `EQUIPMENT_KINDS`: `puck`, `puckPile`, `cone`, `net`, `tire`, `pylon`. Labels live in `EQUIPMENT_LABELS` (`lib/utils/canvas/notation.ts`).
- **Drill saves.** A drill's diagram is saved whole through `createPlay` / `updatePlay` / `saveSessionDrill` (hosted) and the static store's `updatePlay` / `saveSessionDrill`. A session owns its own copy of each drill (3a), so a diagram in a practice is already per practice. The session save never sends diagrams.
- **Undo.** `RinkBoard` keeps its own history of whole `PlayData` snapshots. A value put into `playData` from outside the board is reverted by the next undo.
- **Timeline.** `groupStations` splits rows into blocks. A drill with `runsWithPrevious` runs at the same time as the drill before it (a station block). Blocks run one after another. Warm-ups, breaks, transitions and cool-downs are block rows with no diagram.
- **Plan document.** Each drill row carries `drill.playData`, parsed by `playDataSchema`, a Zod object that strips unknown keys.

## Goal

Every drill lists the equipment it needs, starting from what its diagram shows. A coach can remove items, add items and change counts per drill. The practice rolls these up into one list, with practice-level additions ("Water bottles", "Whiteboard marker"), and the list appears on the editor, the session page, the bench sheet (live and print), the HTML and Word exports, and the plan import preview.

### Success criteria

1. A drill with 4 cones and 1 net on its diagram lists "Cones ×4" and "Net ×1" with no work from the coach.
2. In the drill editor the coach can remove an item, change its count, and add a diagram kind or a typed item. Moving, adding or deleting cones on the diagram later still updates the list, and the coach's changes still apply.
3. The practice list is correct for stations: drills that run one after another reuse the same gear; stations that run at the same time need their gear at once.
4. The practice's own additions appear in the list. "Show by drill" breaks each item down by drill.
5. The bench sheet, print, HTML, Word and the import preview show the practice list and each drill's list.
6. Older plan files, stored drills and stored practices open exactly as before, with a list derived from their diagrams.

## Rulings

### R1. Vocabulary: diagram kinds plus typed items

- **Diagram kinds** are exactly `EQUIPMENT_KINDS`, everything the board's equipment tool places. Players (including goalie and coach markers), lines and text are not equipment.
- **Typed items** are free text, for anything the board can't place: boards, tennis balls, a whiteboard, water bottles. A name is cleaned like a staff name (control and zero-width characters removed, whitespace collapsed, trimmed) and is 1–40 characters (`EQUIPMENT_NAME_MAX`). Names are matched ignoring case.
- **A typed name that names a diagram kind is that kind.** "cone", "Cones", "PUCK PILES" and "pylon" resolve to the kind (singular or plural label, ignoring case), so typing "Cones" adjusts the cone count instead of adding a second cone line.
- **Puck piles stay puck piles.** A puck pile is its own line ("Puck piles ×2"). It is never converted to a puck count, because a pile's size is the coach's call.
- **Labels.** A kind shows its singular label at a count of 1 and its plural otherwise ("Net ×1", "Nets ×2", "Puck pile ×1"). A typed item shows its name as typed. Every item is written `<label> ×<count>`.

### R2. Per-drill overrides live inside the diagram data

`PlayData` gains one optional key, `equipmentNeeds`:

```ts
interface EquipmentNeeds {
  /** At most one entry per diagram kind. */
  kinds: Array<{ kind: EquipmentKind; delta: number; removed: boolean }>;
  /** Typed items: at most 12, names unique ignoring case and never a kind's name. */
  custom: Array<{ name: string; count: number }>;
}
```

- **Derived counts** come from the diagram: the number of `equipment` items of each kind.
- **A kind's count** is `0` when `removed`, else `derived + delta`, kept within 0–999. An item shows when its count is above 0.
  - Adding a kind the diagram doesn't show is a positive `delta` from 0.
  - Changing a count stores the difference from the diagram.
- **Why a difference, not a fixed count.** The diagram can change after the coach edits the list. With a stored difference, "the diagram shows 4 cones, I want 2 spares" still means 2 spares when the diagram grows to 6 cones (8 in all). A fixed count would silently fall below what the diagram shows. Removal is a separate flag, so a removed kind stays removed however many the diagram gains ("the nets are already on the ice").
- **A typed item's count** is fixed (1–999), because the diagram has nothing to compare it with.
- **Limits:** `delta` is a whole number from −999 to 999; `MAX_EQUIPMENT_COUNT = 999`; `MAX_DRILL_CUSTOM_EQUIPMENT = 12`.
- **Normalized on write.** An entry with `delta` 0 that isn't removed is dropped, and an empty `equipmentNeeds` is removed from the diagram, so an untouched drill saves exactly as before.
- **Read leniently.** Like an unreadable ice area, a malformed `equipmentNeeds` is dropped and logged on read. It never makes the drill unreadable.

**Why inside `PlayData`, with no migration:**
- The list starts from the diagram, so the changes belong beside it.
- Session-owned copies (3a) already make a diagram per practice, and a library drill keeps its list when it is added to a practice or forked.
- It rides every existing save path (hosted `createPlay`, `updatePlay`, `saveSessionDrill`; static `updatePlay`, `saveSessionDrill`), duplicate, detach, import, and the plan document's `drill.playData`, with no new column, field or carry rule.
- `area` and curved lines set the precedent: additive diagram fields, versions unchanged.

**Editing outside undo.** The drill editor keeps the list in its own state and merges it into the diagram data on save. The board's undo and redo never touch it, and clearing the board doesn't clear it.

### R3. Practice-level additions

- A practice has `equipment: Array<{ name: string; count: number }>`: items the drills don't account for. At most 20 (`MAX_PRACTICE_EQUIPMENT`), names as in R1 and unique ignoring case, counts 1–999.
- A name that names a diagram kind resolves to that kind and is **added** to the drills' total for it ("Pucks ×30" on top of the drills' pucks). This is additions only; a practice can't remove a drill's item. To drop the nets, remove them per drill.
- **Hosted:** one new column, `practice_sessions.equipment JSONB NOT NULL DEFAULT '[]'`, in a hand-written additive migration (the dev database is behind, so `migrate dev` is not used). Older rows read as none. There is no existing JSON field on the session to reuse, and a separate table would be heavier than a list of names and counts.
- **Saves:** `equipment` travels in the whole-practice save. **Absent means unchanged** (an editor opened before this change omits it), `[]` clears, a create without it stores none.

### R4. The rollup

1. Each drill's list (R2). A drill whose diagram can't be read contributes nothing. Blocks contribute nothing.
2. **Within a block** (`groupStations`), items are **summed** across its stations: stations run at the same time.
3. **Across blocks**, the practice needs the **largest** block's count of each item: drills that run one after another reuse the same gear.
4. **Practice-level additions** are then added (R3).

- **Order:** diagram kinds in `EQUIPMENT_KINDS` order, then typed items by first appearance (drills in schedule order, then the practice's items).
- **Breakdown:** each total keeps its parts: the drills that need it (name, count, and "Station 2 of 3" when it is a station) and the practice's addition. "Show by drill" shows the parts on screen. On paper, each drill's own line is the breakdown.

### R5. Where it shows

- **Drill editor** (`PlayEditor`, so the library and the session's drill dialog both get it): an **Equipment** section under the board.
  - Each item on a 44 px row: its label, a count with − and + buttons, and remove.
  - A changed count shows "Diagram shows 4".
  - Removed kinds that are on the diagram are listed under **Removed**, each with **Restore**.
  - **Add item**: a free-text field that suggests the diagram kinds, a count, and **Add**.
- **Session editor:** a **Practice equipment** section after the drill list: the totals, a **Show by drill** switch, and the practice's own items (edit count, remove, add). Each drill card adds one line, "Equipment: Cones ×6 · Net ×1". The list is edited in the drill dialog, never on the card.
- **Session page:** a **Practice equipment** card with the totals and **Show by drill**.
- **Bench sheet** (live/print, HTML, Word):
  - page 1 gets an **Equipment** section after the timeline and before the legend: the totals as a short list in columns, `Cones ×12`;
  - each drill's meta line gets its own list, `Equipment: Cones ×6 · Net ×1`;
  - the section and the lines are left out when empty;
  - HTML strings go through the `html` escaping template, Word strings through `xmlSafe` (`textRuns`).
- **Import preview:** "Equipment: Cones ×12 · Nets ×2" under the staff line, and each drill's line under its timing.

### R6. Plan document (PLAN_VERSION stays 1, PlayData.version stays 2)

- **Per drill:** nothing new on the row. The overrides are inside `drill.playData.equipmentNeeds`, which `playDataSchema` now accepts.
- **Per session:** optional `equipment`, a list of `{ name, count }` (≤ 20, names 1–40 once cleaned and unique ignoring case, counts whole 1–999). Missing or `null` reads as `[]`. It is strict like staff: a broken list is an "Equipment" issue, never silently dropped. Writers always emit it.
- **Compatibility:** a reader built before this change strips both keys and opens the file with the diagram-derived lists only. A round trip through an older build loses the overrides and additions. Nothing older readers rely on changes, so no version bump. ADR-0020 gets an amendment.

### R7. Static store

- `StoredSession.equipment?` (absent on older records: none). `LocalSessionSave.equipment?` is absent = unchanged and `[]` clears. The store checks the same limits and messages as hosted.
- Drills keep `equipmentNeeds` inside their stored `playData`.
- **IndexedDB version 4 → 5**, a no-op upgrade, as in every earlier additive change: it makes a tab still running an older build reload before it can save a drill without its overrides.

### R8. Older clients

- A hosted editor tab opened before the deploy omits `equipment`, so the practice's additions are kept.
- An older drill editor (hosted tab not reloaded) saves a drill's diagram without `equipmentNeeds`. That drill's overrides are lost on that save. This is accepted, as for age groups: it needs a tab open across the deploy *and* a save of that drill.

### R9. Merging with parallel work

Practice rosters, drill suggestions and favorites are being built at the same time. This feature keeps to its own names:
- the `equipmentNeeds` key inside `PlayData`;
- the session's `equipment` key on the save input, the view, the plan document and the stored record;
- the migration folder `…_practice_session_equipment`;
- new files: `lib/utils/equipment-needs.ts` (vocabulary, per-drill rules, schemas, labels), `lib/utils/practice-equipment.ts` (the rollup), `DrillEquipmentField.tsx`, `SessionEquipmentSection.tsx`, `useSessionEquipment.ts`, `EquipmentRollupList.tsx`. The rules and the rollup are two modules because `play-data.ts` imports the schema, and the rollup's import of the session timeline would otherwise close a cycle back to `play-data.ts`.

Shared files get small, additive edits only. The IndexedDB version bump is the one likely textual conflict: whichever change lands second takes the next number.

## Testing

- **Pure** (`equipment-needs`, `practice-equipment`):
  - derived counts;
  - kind resolution from typed names;
  - delta, removal and clamping;
  - typed items;
  - normalization;
  - lenient reading;
  - the rollup: sequential max, station sum then max across blocks, practice additions, unreadable drills and blocks;
  - labels and the breakdown.
- **PlayData:** the schema accepts `equipmentNeeds`; a malformed one is dropped, not fatal; the write sanitizer cleans typed names.
- **Plan document:**
  - an older file opens with no additions;
  - round-trip of overrides and additions;
  - strict issues for a broken list;
  - an older reader (a schema without the keys) strips them and still opens the file.
- **Static store:** absent = unchanged, `[]` clears, limits, duplicate and import carry, version 5.
- **Hosted:** schema limits; create/update absent = unchanged, `[]` clears; duplicate and import carry; the migration matches `schema.prisma`.
- **Bench sheet model, HTML, Word:** the section and each drill's line, escaped; empty means omitted.
- **Components:**
  - the drill editor's Equipment section (derived, remove/restore, count change, add typed, add a kind by name, undo doesn't touch it);
  - the session editor's section (totals for a station block, Show by drill, add and remove an item, payload);
  - the drill card line;
  - the import preview line.
- **Browser** (static planner, 360 px and 1280 px, light and dark):
  - a drill with cones and a net shows them;
  - remove one and add a typed item;
  - the practice total is correct for a station block;
  - the items appear on the bench sheet and in print preview.

## Out of scope

- Inventory: what the team or rink owns, and shortfalls against it.
- Removing a drill's item at the practice level.
- Equipment on blocks (warm-ups, breaks): use practice-level additions.
- Emails.

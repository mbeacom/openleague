# ADM-Style Templates, Small Ice Areas and Age Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A coach running a youth practice in the ADM style can pick quarter-ice areas, tag drills by age group, filter the drill library, the session's drill picker and the template picker by age, and start from three new age-group station templates built from nine new, original small-area drills, in both planners.

**Architecture:**
- **Quarter-ice presets (spec R1).** Six values join `ICE_AREA_PRESETS`. `lib/utils/ice-area.ts` swaps its x-only table for a full preset-to-rectangle table, so `areaRect` returns each preset's `y` and `h`; every surface that draws or compares an area (board, thumbnails, station map, overlap warnings, bench sheet, exports) already goes through `areaRect`. The area picker in `PlayEditor` groups its options with MUI `ListSubheader`s. `PLAY_DATA_VERSION` (2) and `PLAN_VERSION` (1) don't change.
- **Age groups (spec R2, R6).** One portable module, `lib/utils/age-groups.ts`, owns the vocabulary (`u6` … `u16plus`), labels, the filter's match rule, a lenient reader (`toAgeGroups`) and the strict write schema (`ageGroupsSchema`). The field rides beside the existing drill tags everywhere they go: a hand-written `Play.ageGroups TEXT[]` column with a CHECK constraint, the play and session-drill actions, the session-owned copy service, both session queries, the plan document (strict, unlike `focus`/`goalies`), and the static store (IndexedDB version 3 → 4 with a no-op upgrade). `drillTags` is left alone; `ageGroups` is spread beside it.
- **Filtering (spec R3).** One shared `AgeFilter` chip row and one hook, `useAgeFilter`, which remembers the choice under one `localStorage` key through `useSyncExternalStore` (server snapshot "All ages"), so the hosted page hydrates cleanly. `PlayLibrary` (the library in both apps and, in `select` mode, the session editor's drill picker) and `StarterTemplatePicker` (both import screens) read it.
- **Editor field (spec R4).** A chip field, `AgeGroupsField`, sits under Focus and Goalies in `PlayEditor`, which the library editor and the session drill dialog share in both apps; every existing save path sends the value.
- **Content (spec R5).** Every starter drill and template gains `ageGroups`. Nine original drills (the eight the spec lists plus a quarter-ice goalie station for the `stays` pattern) and three templates (8U, 10U, 12U) are added, all checked by the existing catalog tests.

**Tech Stack:** TypeScript (strict), Next.js 16 App Router, React 19, MUI v7, Prisma 7 (Neon/PostgreSQL), Zod v4, Vite (static planner), IndexedDB (fake-indexeddb in tests), Vitest + jsdom + Testing Library, Playwright (screenshots only, from a local harness outside the repository), Bun.

**Spec:** `docs/superpowers/specs/2026-10-05-practice-adm-style-templates-design.md`. Its success criteria (1–5) and rulings R1–R6 are referenced below. Where the spec and the code disagree, the ruling is recorded under "Spec gaps and conflicts" in the Self-Review and in the task that owns it.

## Global Constraints

- Use `bun` for every script (`bun run …`), never npm or yarn.
- Use `/usr/bin/git`. Never `git stash`. Never switch branches (work on `feat/adm-style-templates`). Stage files by path, never `git add -A` or `git add .`, because `next dev` can rewrite `CLAUDE.md`.
- **Commit trailer:** every commit message ends, as its own paragraph, with the `Claude-Session:` line the executing session's instructions give. Set it once per shell as `SESSION_TRAILER` (for example `export SESSION_TRAILER='Claude-Session: https://claude.ai/code/…'` with the real URL) and pass it as the last `-m`, as every commit step below does.
- **Quarter-ice presets (R1), exactly:**
  - `ICE_AREA_PRESETS` = `full`, `half-left`, `half-right`, `zone-left`, `zone-neutral`, `zone-right`, `zone-left-top`, `zone-left-bottom`, `zone-neutral-top`, `zone-neutral-bottom`, `zone-right-top`, `zone-right-bottom`, in that order.
  - Rectangles in rink feet: columns are the zones' x ranges (0–75, 75–125, 125–200, from `BLUE_LINES`); rows are y 0–42.5 (`-top`) and 42.5–85 (`-bottom`). Every existing preset keeps `y: 0, h: 85`.
  - Labels: `Left end – top`, `Left end – bottom`, `Neutral – top`, `Neutral – bottom`, `Right end – top`, `Right end – bottom` (an en dash with a space either side).
  - Picker groups, in order: `Full and halves` (full, half-left, half-right), `Zones` (the three zones), `Quarters` (the six quarters, in `ICE_AREA_PRESETS` order); `Custom area…` stays last.
  - `PLAY_DATA_VERSION` stays 2 and `PLAN_VERSION` stays 1.
- **Age groups (R2), exactly:**
  - values and labels: `u6` 6U, `u8` 8U, `u10` 10U, `u12` 12U, `u14` 14U, `u16plus` 16U+ (`AGE_GROUPS`, `AGE_GROUP_LABELS`);
  - classification wording: `u6`→`U6`, `u8`→`U8`, `u10`→`SQUIRT_U10`, `u12`→`PEEWEE_U12`, `u14`→`BANTAM_U14`, `u16plus`→`U16` (`AGE_GROUP_CLASSIFICATION`, a constant written as string literals, never an import of `@prisma/client`);
  - shape: `ageGroups: AgeGroup[]`, 0–6 distinct values in `AGE_GROUPS` order; `[]` means all ages;
  - writes are strict (`ageGroupsSchema`: unknown value or a repeat is refused; the order is normalized); reads are lenient (`toAgeGroups`: unknown values dropped, repeats collapsed, a non-list reads as `[]`).
- **Absent = unchanged.** An update (hosted `updatePlay`, `saveSessionDrill`; static `updatePlay`, `saveSessionDrill`) that doesn't send `ageGroups` leaves the stored value alone; a fork inherits its source's; a brand-new drill gets `[]`. `[]` sent clears.
- **Hosted storage:** `Play.ageGroups String[] @default([])` in `prisma/schema.prisma`, and the hand-written additive migration `prisma/migrations/20261005130000_play_age_groups/migration.sql` (`TEXT[] NOT NULL DEFAULT '{}'::TEXT[]` and the CHECK constraint `plays_age_groups_check`). Never run `prisma migrate dev`, `db:migrate`, `db:push` or `db:migrate:reset`. Run `bun run db:generate` after the schema edit (it only regenerates the client).
- **Static storage:** `DB_VERSION` goes from 3 (verified in `apps/planner/src/store/idb-repo.ts:19`) to 4 with a no-op `oldVersion < 4` case, as #405 and #407 did, so an older tab reloads before it can rewrite a drill without `ageGroups`.
- **Plan document (R2):** each drill gains `ageGroups`. Missing or `null` reads as `[]`. An unknown value, a repeat or a non-list is an error reported as a readable `Drill N ("name"): …` issue. Writers always emit it (`[]` when none), in table order.
- **Filter (R3):** one shared `AgeFilter` (chips `All ages`, `6U` … `16U+`, single choice); match rule `matchesAgeGroup` (empty or containing the age); remembered per device under `localStorage` key `openleague.planner.ageFilter` (`AGE_FILTER_STORAGE_KEY`), every access wrapped in `try`/`catch`; blocked or empty storage reads as All ages; the server snapshot is All ages.
- **Copy, exactly:**
  - filter: group name `Age group`, chips `All ages`, `6U`, `8U`, `10U`, `12U`, `14U`, `16U+`;
  - empty state: `No drills for 8U yet.` / `No templates for 8U yet.` (the age's label), and a text button `Show all ages`;
  - editor: field label `Age groups`, helper `Leave empty if it suits every age.`;
  - template card chip: `All ages`, or the labels joined with `, ` (`6U, 8U`);
  - messages: `AGE_GROUP_UNKNOWN_MESSAGE` = `Age groups must be 6U, 8U, 10U, 12U, 14U or 16U+`; `AGE_GROUP_REPEAT_MESSAGE` = `Each age group can be listed only once`; `AGE_GROUPS_LIST_MESSAGE` = `Age groups must be a list`.
- **Portability (ADR-0020):** `lib/utils/age-groups.ts` joins the `adr-0020/portable-practice-planner` file list in `eslint.config.mjs` (Task 2). It imports only `zod`. `AgeFilter.tsx`, `useAgeFilter.ts` and `AgeGroupsField.tsx` live in `components/features/practice-planner/` (already in that block) and import only `react`, `@mui/*`, `@/lib/utils/...` and `@/types/...`. Nothing new imports `next/*`, `@/lib/actions/*`, `@/lib/db/*`, `@/lib/auth/*` or `@prisma/client`. `types/practice-planner.ts` imports the `AgeGroup` type from `@/lib/utils/age-groups` with `import type` (erased; no runtime cycle).
- **Server actions:** no new `"use server"` export. The changed ones (`createPlay`, `updatePlay`, `getPlaysByTeam`, `getPlayById`, `saveSessionDrill`, `copySessionDrillToLibrary`, `duplicatePracticeSession`, `importPracticePlan`, the two session queries) keep validating ids exactly as today (Zod `cuid` schemas or `parseId`); their entries in `__tests__/helpers/action-id-sweep-table.ts` stay valid because `ageGroups`/`ageGroup` are optional. The sweep guard (`__tests__/lib/actions/action-id-sweep.test.ts`, `action-id-arguments.test.ts`) must stay green.
- **Original content only (R5):** every drill and template name, description, note and diagram in this plan is OpenLeague's own. "ADM-style" may appear descriptively in template descriptions. Never name any national governing body, its programs, logos, diagrams, drill names or text in content, code comments, test names, commit messages or docs.
- **On-screen components:** palette tokens only (`text.secondary`, `divider`, `primary`, `action.hover`…), so dark mode works; every new interactive control is at least 44 × 44 px (`minHeight: 44` on every chip).
- **Line budgets:** `components/features/practice-planner/PracticeSessionEditor.tsx` (806 lines today; one existing line changes in Task 5) stays at or under 900, and `components/features/practice-planner/RinkBoard.tsx` (1014 today, untouched) at or under 1057; both are pinned by their `*.line-budget.test.ts`.
- **Breaking tests:** a task that changes a type, a written shape or a pinned list names every existing test it breaks in its Files list, narrows it as shown, and stages it. Every task ends with `bun run type-check` and its suites green (`tsconfig.json` includes `__tests__`, so type-check covers the tests).
- **Screenshots (Task 7):** build and serve the static planner, drive it with a local headless Playwright script kept outside the repository, launch Chromium with `executablePath: process.env.CHROMIUM_PATH`, and write the PNGs to `.cache/adm-style/` in the repository (git-ignored by the `.cache` rule). Read every PNG before calling the task done.
- **Public repository:** commit messages, comments and test names are neutral and factual. No local machine paths, scratch directories or session ids in anything committed (the commit trailer is the one allowed session URL).

## Review Focus

1. **Search and the age filter together on the hosted library.** `getPlaysByTeam` already puts the name/description search in `where.OR`; the age match (`isEmpty` OR `has`) must not overwrite it. A coach who types "breakout" with 10U chosen expects drills matching both, and an exact total for paging. Test: Task 2 (`where.OR` and `where.AND` both present, and `count` receives the same `where`).
2. **Two library loads in flight.** On the hosted page the remembered age is read after hydration (the server snapshot is All ages), so the first effect loads all ages and the second loads 8U; a quick chip change does the same. Whichever answer arrives last must not win; the latest request must. Test: Task 5 (an earlier, slower answer resolved after a later one is ignored).
3. **A remembered value that isn't usable.** A stored `"u7"`, a value from a newer build, or a `localStorage` that throws on read or write. The filter reads as All ages, the chips still work for the rest of the visit, and nothing crashes. Tests: Task 5 (`useAgeFilter.test.tsx`, `useAgeFilter.blocked.test.tsx`).
4. **Ages survive every copy path.** Library → session (clone), the drill dialog's fork with no ages sent, back to the library, a duplicated session, and an export → import round trip, in both apps. A coach expects the ages they set to come back. Tests: Task 2 (clone guard, fork, copy to library, both queries), Task 3 (plan file, hosted import, static store end to end).
5. **Older data and older builds.** A stored play or device record with no `ageGroups`, a plan file with no key or `null`, and an area kind the running build doesn't know (data from a newer build reaching an older tab). They read as all ages, or as full ice, never as an error or a crash. Tests: Task 1 (`areaRect` fallback; `upgradePlayData` drops an unknown kind), Task 2 (`toAgeGroups`), Task 3 (older plan file, legacy device record, IndexedDB 3 → 4).

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `types/practice-planner.ts` | six quarter presets (1); `ageGroups?` on `PlayInSession`, `PracticeSessionViewPlay.play`, `SavedPlay` (2) | 1, 2 |
| `lib/utils/ice-area.ts` | `PRESET_RECTS`; `areaRect` returns `y`/`h`, falls back to full ice for an unknown kind | 1 |
| `lib/utils/canvas/notation.ts` | quarter labels, `ICE_AREA_GROUPS` | 1 |
| `components/features/practice-planner/PlayEditor.tsx` | grouped area picker (1); `Age groups` field (6) | 1, 6 |
| `docs/adr/0020-…-static-local.md` | amendments: quarter areas (1), drill age groups (3) | 1, 3 |
| `lib/utils/age-groups.ts` (new) | vocabulary, labels, classification map, match rule, readers, schemas, copy | 2 |
| `eslint.config.mjs` | `lib/utils/age-groups.ts` joins the ADR-0020 portable block | 2 |
| `lib/planner-store/types.ts` | `ageGroups?` on summaries, new plays and session-drill saves; `ageGroup?` on `LibraryQuery` | 2 |
| `lib/utils/validation.ts` | `ageGroups` on create/update/save-session-drill; `ageGroup` on the library query | 2 |
| `prisma/schema.prisma`, `prisma/migrations/20261005130000_play_age_groups/migration.sql` (new) | the column and its CHECK constraint | 2 |
| `lib/actions/plays.ts`, `lib/actions/practice-session-drills.ts`, `lib/services/practice-session-drills.ts`, `lib/actions/practice-session-queries.ts` | hosted carry-through and the library filter | 2 |
| `lib/plan-document/document.ts` | `ageGroups` on plan drills (strict), the editor mapping | 3 |
| `lib/actions/practice-plan-import.ts` | hosted import stores a plan drill's ages | 3 |
| `components/features/practice-planner/ExportPlanMenu.tsx`, `export/bench-sheet-model.ts` | exports write each drill's ages | 3 |
| `apps/planner/src/store/{records,shared,library,sessions,types,idb-repo}.ts` | static carry-through, the library filter, `DB_VERSION` 4 | 3 |
| `lib/data/starter-plays.ts`, `lib/data/starter-templates.ts` | ages on every starter, nine new drills, three new templates (4) | 4 |
| `apps/planner/src/store/library.ts` | seeding copies a starter's ages | 4 |
| `components/features/practice-planner/{useAgeFilter.ts,AgeFilter.tsx}` (new) | the remembered choice; the chip row and its empty state | 5 |
| `components/features/practice-planner/PlayLibrary.tsx` | age filter in the library and the drill picker; latest load wins; starter and selected drills carry ages | 4, 5 |
| `components/features/practice-planner/StarterTemplatePicker.tsx` | age filter and ages chip on templates | 5 |
| `components/features/practice-planner/PracticeSessionEditor.tsx` | a drill picked from the library keeps its ages (one existing line) | 5 |
| `components/features/practice-planner/AgeGroupsField.tsx` (new) | the editor's multi-select chips | 6 |
| `components/features/practice-planner/{SessionDrillDialog.tsx,useSessionDrillDialog.ts}`, `lib/utils/session-drill-ids.ts`, `app/(dashboard)/practice-planner/library/{PlayEditorWrapper.tsx,[playId]/edit/page.tsx}`, `apps/planner/src/screens/DrillEditorScreen.tsx` | every editor save path sends and loads the ages | 6 |

The hosted library page (`app/(dashboard)/practice-planner/library/page.tsx`) renders `PlayLibrary` and needs no change; the static `LibraryScreen.tsx` and `PlayLibraryDialog.tsx` likewise.

---

### Task 1: Quarter-ice presets, their rectangles and the grouped area picker

Six new presets (spec R1, success criterion 1). The vocabulary grows, `areaRect` learns each preset's full rectangle, the picker groups its options, and the ADR-0020 amendment records what plan files may now carry. Every renderer and the overlap warnings already call `areaRect`, so this task proves them with tests rather than editing them: the board (`RinkBoard.tsx` masks and clamps to `areaRect`), thumbnails (`thumbnail-generator.ts:97`), the station map (`station-map.ts:94`), the overlap and size warnings (`session-timeline.ts:358-412`), the bench sheet and the exports (both draw through `drawBoardScene`/`drawStationMap`).

**Files:**
- Modify: `types/practice-planner.ts:210` (`ICE_AREA_PRESETS`)
- Modify: `lib/utils/ice-area.ts:14-37` (`PRESET_X` → `PRESET_RECTS`; `areaRect`)
- Modify: `lib/utils/canvas/notation.ts:79-87` (labels; add `ICE_AREA_GROUPS`)
- Modify: `components/features/practice-planner/PlayEditor.tsx` (imports at lines 12-30 and 43-55; the area `Select` at lines 413-421)
- Modify: `docs/adr/0020-exchange-practice-plans-as-a-portable-versioned-document-and-ship-a-static-local.md` (append an amendment after the last one)
- Test (modify): `__tests__/lib/utils/ice-area.test.ts` (the label list at lines 130-138 breaks: it pins six labels), `__tests__/lib/utils/play-data.test.ts`, `__tests__/lib/utils/session-timeline.test.ts`, `__tests__/lib/utils/canvas/station-map.test.ts`, `__tests__/lib/plan-document/document.test.ts`, `__tests__/components/features/practice-planner/PlayEditor.ice-area.test.tsx`
- Existing tests that must stay green unchanged: `__tests__/lib/data/starter-plays.test.ts`, `__tests__/lib/utils/canvas/thumbnail-area.test.ts`, `__tests__/components/features/practice-planner/RinkBoard.ice-area.test.tsx`.

**Interfaces:**
- Produces, from `types/practice-planner.ts`: `ICE_AREA_PRESETS` with the twelve values above (so `IceAreaPreset` gains the six quarters).
- Produces, from `lib/utils/ice-area.ts`: `areaRect(area?: IceArea): RinkRect` (unchanged signature; per-preset `y`/`h`; an unknown preset kind returns a copy of `FULL_RINK`).
- Produces, from `lib/utils/canvas/notation.ts`: `ICE_AREA_LABELS` (twelve presets plus `custom`), `ICE_AREA_GROUPS: ReadonlyArray<{ label: string; presets: readonly IceAreaPreset[] }>`.

- [ ] **Step 1: Write the failing rectangle and label tests**

In `__tests__/lib/utils/ice-area.test.ts`, add `ICE_AREA_GROUPS` to the notation import (line 14):

```ts
import { ICE_AREA_GROUPS, ICE_AREA_LABELS, iceAreaLabel } from "@/lib/utils/canvas/notation";
```

Inside `describe("areaRect", …)`, after the existing `it.each` (which keeps pinning the six older presets at full height), add:

```ts
    it.each([
        ["zone-left-top", 0, 75, 0],
        ["zone-left-bottom", 0, 75, 42.5],
        ["zone-neutral-top", 75, 125, 0],
        ["zone-neutral-bottom", 75, 125, 42.5],
        ["zone-right-top", 125, 200, 0],
        ["zone-right-bottom", 125, 200, 42.5],
    ] as const)("%s spans x %d-%d and half the height from y %d", (kind, x0, x1, y) => {
        expect(areaRect({ kind })).toEqual({ x: x0, y, w: x1 - x0, h: 42.5 });
    });

    it("tiles the rink with the six quarters", () => {
        const quarters = ICE_AREA_PRESETS.filter((kind) => /-(top|bottom)$/.test(kind));
        expect(quarters).toHaveLength(6);
        expect(quarters.reduce((sum, kind) => sum + areaRect({ kind }).w * areaRect({ kind }).h, 0)).toBe(200 * 85);
    });

    it("returns a fresh object for a preset, so callers can't change the table", () => {
        const rect = areaRect({ kind: "zone-left-top" });
        rect.h = 85;
        expect(areaRect({ kind: "zone-left-top" }).h).toBe(42.5);
    });

    it("draws an area kind this build doesn't know as full ice instead of throwing", () => {
        expect(areaRect({ kind: "zone-center" } as unknown as IceArea)).toEqual(FULL_RINK);
    });
```

Inside `describe("editViewport", …)`, add:

```ts
    it("fits a quarter with its margin on all four sides, clamped to the rink", () => {
        expect(editViewport({ kind: "zone-left-top" })).toEqual({ x: 0, y: 0, w: 80, h: 47.5 });
        expect(editViewport({ kind: "zone-right-bottom" })).toEqual({ x: 120, y: 37.5, w: 80, h: 47.5 });
        expect(editViewport({ kind: "zone-neutral-bottom" })).toEqual({ x: 70, y: 37.5, w: 60, h: 47.5 });
    });
```

Replace the whole `describe("ICE_AREA_LABELS", …)` block (lines 130-138) with:

```ts
describe("ICE_AREA_LABELS", () => {
    it("labels every preset and custom", () => {
        expect(ICE_AREA_PRESETS.map((p) => ICE_AREA_LABELS[p])).toEqual([
            "Full ice", "Half ice (left)", "Half ice (right)", "Left end zone", "Neutral zone", "Right end zone",
            "Left end – top", "Left end – bottom", "Neutral – top", "Neutral – bottom", "Right end – top", "Right end – bottom",
        ]);
        expect(ICE_AREA_LABELS.custom).toBe("Custom area");
        expect(iceAreaLabel(undefined)).toBe("Full ice");
        expect(iceAreaLabel({ kind: "zone-neutral" })).toBe("Neutral zone");
        expect(iceAreaLabel({ kind: "zone-right-bottom" })).toBe("Right end – bottom");
    });
});

describe("ICE_AREA_GROUPS", () => {
    it("groups the picker's presets in order, each preset exactly once", () => {
        expect(ICE_AREA_GROUPS.map((group) => group.label)).toEqual(["Full and halves", "Zones", "Quarters"]);
        expect(ICE_AREA_GROUPS.flatMap((group) => group.presets)).toEqual([...ICE_AREA_PRESETS]);
    });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test __tests__/lib/utils/ice-area.test.ts`
Expected: FAIL. `ICE_AREA_GROUPS` is not exported, `zone-left-top` is not a preset (`areaRect` destructures `undefined` and throws a `TypeError`), and the label list has six entries.

- [ ] **Step 3: Add the presets, the rectangles and the labels**

In `types/practice-planner.ts`, replace line 210:

```ts
export const ICE_AREA_PRESETS = ["full", "half-left", "half-right", "zone-left", "zone-neutral", "zone-right"] as const;
```

with:

```ts
/** Full ice, halves, zones, then the six quarters (a zone's top or bottom half; ADM-style templates R1). */
export const ICE_AREA_PRESETS = [
    "full",
    "half-left",
    "half-right",
    "zone-left",
    "zone-neutral",
    "zone-right",
    "zone-left-top",
    "zone-left-bottom",
    "zone-neutral-top",
    "zone-neutral-bottom",
    "zone-right-top",
    "zone-right-bottom",
] as const;
```

In `lib/utils/ice-area.ts`, replace lines 14-37 (from `const RINK_W` through the end of `areaRect`) with:

```ts
const RINK_W = RINK_DIMENSIONS.width;
const RINK_H = RINK_DIMENSIONS.height;
const HALF_H = RINK_H / 2;
const NEUTRAL_W = BLUE_LINES.right - BLUE_LINES.left;
const END_W = RINK_W - BLUE_LINES.right;

/**
 * Every preset's rectangle in rink feet. Full ice, the halves and the zones
 * span the rink's height; a quarter is a zone's top or bottom half (R1).
 */
const PRESET_RECTS: Record<IceAreaPreset, Readonly<RinkRect>> = {
    full: { x: 0, y: 0, w: RINK_W, h: RINK_H },
    "half-left": { x: 0, y: 0, w: RINK_W / 2, h: RINK_H },
    "half-right": { x: RINK_W / 2, y: 0, w: RINK_W / 2, h: RINK_H },
    "zone-left": { x: 0, y: 0, w: BLUE_LINES.left, h: RINK_H },
    "zone-neutral": { x: BLUE_LINES.left, y: 0, w: NEUTRAL_W, h: RINK_H },
    "zone-right": { x: BLUE_LINES.right, y: 0, w: END_W, h: RINK_H },
    "zone-left-top": { x: 0, y: 0, w: BLUE_LINES.left, h: HALF_H },
    "zone-left-bottom": { x: 0, y: HALF_H, w: BLUE_LINES.left, h: HALF_H },
    "zone-neutral-top": { x: BLUE_LINES.left, y: 0, w: NEUTRAL_W, h: HALF_H },
    "zone-neutral-bottom": { x: BLUE_LINES.left, y: HALF_H, w: NEUTRAL_W, h: HALF_H },
    "zone-right-top": { x: BLUE_LINES.right, y: 0, w: END_W, h: HALF_H },
    "zone-right-bottom": { x: BLUE_LINES.right, y: HALF_H, w: END_W, h: HALF_H },
};

/** True for a missing area and for an explicit `{ kind: "full" }`. */
export function isFullIce(area?: IceArea): boolean {
    return area === undefined || area.kind === "full";
}

/**
 * The area's rectangle in rink feet (a fresh object). A preset kind this build
 * doesn't know (data written by a newer build) is drawn as full ice rather
 * than throwing; the strict schema still refuses it on write.
 */
export function areaRect(area?: IceArea): RinkRect {
    if (!area) return { ...FULL_RINK };
    if (area.kind === "custom") return { ...area.rect };
    const preset = PRESET_RECTS[area.kind] as Readonly<RinkRect> | undefined;
    return preset ? { ...preset } : { ...FULL_RINK };
}
```

In `lib/utils/canvas/notation.ts`, replace lines 79-87 (`ICE_AREA_LABELS`) with:

```ts
export const ICE_AREA_LABELS: Record<IceAreaPreset | "custom", string> = {
    full: "Full ice",
    "half-left": "Half ice (left)",
    "half-right": "Half ice (right)",
    "zone-left": "Left end zone",
    "zone-neutral": "Neutral zone",
    "zone-right": "Right end zone",
    "zone-left-top": "Left end – top",
    "zone-left-bottom": "Left end – bottom",
    "zone-neutral-top": "Neutral – top",
    "zone-neutral-bottom": "Neutral – bottom",
    "zone-right-top": "Right end – top",
    "zone-right-bottom": "Right end – bottom",
    custom: "Custom area",
};

/** The area picker's groups (R1), in ICE_AREA_PRESETS order; every preset is in exactly one. */
export const ICE_AREA_GROUPS: ReadonlyArray<{ label: string; presets: readonly IceAreaPreset[] }> = [
    { label: "Full and halves", presets: ["full", "half-left", "half-right"] },
    { label: "Zones", presets: ["zone-left", "zone-neutral", "zone-right"] },
    {
        label: "Quarters",
        presets: ["zone-left-top", "zone-left-bottom", "zone-neutral-top", "zone-neutral-bottom", "zone-right-top", "zone-right-bottom"],
    },
];
```

- [ ] **Step 4: Run them to verify they pass**

Run: `bun run test __tests__/lib/utils/ice-area.test.ts`
Expected: PASS (every test in the file, the six older `areaRect` cases included).

- [ ] **Step 5: Write the failing schema, warning, station-map and plan-file tests**

In `__tests__/lib/utils/play-data.test.ts`, inside `describe("ice area", …)`, add `["a near-miss quarter", { kind: "zone-left-middle" }],` to the `invalidAreas` list, then add:

```ts
    it.each(["zone-left-top", "zone-left-bottom", "zone-neutral-top", "zone-neutral-bottom", "zone-right-top", "zone-right-bottom"] as const)(
        "accepts the quarter preset %s on write and keeps it on read",
        (kind) => {
            const stored = { ...createEmptyPlayData(), area: { kind } };
            expect(playDataSchema.safeParse(stored).success).toBe(true);
            expect(upgradePlayData(stored)).toStrictEqual(stored);
        },
    );
```

(The existing `it.each(invalidAreas)` pair then also proves the near-miss kind is dropped and logged on read and refused on write, which is what a build older than this one does with every quarter; see the ADR amendment in Step 11.)

In `__tests__/lib/utils/session-timeline.test.ts`, add these rows to the `drillFootprint` `it.each` table:

```ts
        ["zone-left-top", { kind: "zone-left-top" }, "zone"],
        ["zone-neutral-bottom", { kind: "zone-neutral-bottom" }, "zone"],
```

and, inside `describe("stationWarnings", …)`, add:

```ts
    it("doesn't flag quarters that only share a line, and flags a quarter inside a zone", () => {
        expect(warn(placed([{ kind: "zone-left-top" }, { kind: "zone-left-bottom" }, { kind: "zone-neutral-top" }, { kind: "zone-right-bottom" }])).overlaps).toEqual([]);
        expect(warn(placed([{ kind: "zone-neutral" }, { kind: "zone-neutral-bottom" }])).overlaps).toEqual([[0, 0, 1]]);
        expect(warn(placed([{ kind: "zone-left-top" }, { kind: "half-left" }])).overlaps).toEqual([[0, 0, 1]]);
    });
```

In `__tests__/lib/utils/canvas/station-map.test.ts`, inside `describe("drawStationMap", …)`, add:

```ts
    it("clips and outlines a quarter-ice station to its half of the zone", () => {
        const quarter: PlayData = { ...createEmptyPlayData(), area: { kind: "zone-right-bottom" } };
        const calls = draw([{ name: "Battle", playData: quarter }]);
        const clipRect = calls.find((c, i) => c.name === "rect" && calls[i + 1]?.name === "clip");
        const topLeft = rinkToCanvas({ x: 125, y: 42.5 }, t);
        const bottomRight = rinkToCanvas({ x: 200, y: 85 }, t);
        expect(clipRect?.args[0]).toBeCloseTo(topLeft.x, 9);
        expect(clipRect?.args[1]).toBeCloseTo(topLeft.y, 9);
        expect(clipRect?.args[2]).toBeCloseTo(bottomRight.x - topLeft.x, 9);
        expect(clipRect?.args[3]).toBeCloseTo(bottomRight.y - topLeft.y, 9);
    });
```

In `__tests__/lib/plan-document/document.test.ts`, add a new `describe` at the end of the file:

```ts
describe("quarter-ice areas (additive values, versions stay 1 and 2)", () => {
    it("round-trips a quarter-ice diagram through a plan file at version 1", () => {
        const quarter: PlayData = { ...BOARD, area: { kind: "zone-neutral-top" } };
        const doc = serializePlan(input({ drills: [{ sequence: 0, duration: 10, runsWithPrevious: false, instructions: null, name: "Lane", description: null, playData: quarter }] }), "openleague-static", NOW);
        expect(doc.version).toBe(PLAN_VERSION);
        const parsed = parsePlan(JSON.parse(JSON.stringify(doc)));
        expect(parsed.ok && drillRows(parsed.plan.session.drills)[0].drill.playData.area).toEqual({ kind: "zone-neutral-top" });
    });
});
```

- [ ] **Step 6: Run them**

Run: `bun run test __tests__/lib/utils/play-data.test.ts __tests__/lib/utils/session-timeline.test.ts __tests__/lib/utils/canvas/station-map.test.ts __tests__/lib/plan-document/document.test.ts`
Expected: PASS. These pin behaviour Step 3 already delivered through `areaRect` and `z.enum(ICE_AREA_PRESETS)`; if one fails, the failure names the surface that bypasses `areaRect`, and the fix belongs in that surface, not in the test.

- [ ] **Step 7: Write the failing picker test**

In `__tests__/components/features/practice-planner/PlayEditor.ice-area.test.tsx`, add `within` to the Testing Library import (line 8):

```ts
import { act, fireEvent, render, screen, within } from "@testing-library/react";
```

Then, inside `describe("PlayEditor ice area", …)`, add:

```ts
    it("groups the presets under Full and halves, Zones and Quarters, with Custom area… last", async () => {
        renderEditor();
        fireEvent.mouseDown(screen.getByRole("combobox", { name: /Ice area/ }));
        const listbox = await screen.findByRole("listbox");
        const entries = Array.from(listbox.querySelectorAll("li")).map((item) => item.textContent);
        expect(entries).toEqual([
            "Full and halves", "Full ice", "Half ice (left)", "Half ice (right)",
            "Zones", "Left end zone", "Neutral zone", "Right end zone",
            "Quarters", "Left end – top", "Left end – bottom", "Neutral – top", "Neutral – bottom", "Right end – top", "Right end – bottom",
            "Custom area…",
        ]);
        // A header is not a choice: MUI gives it role "option" but clicking it changes nothing.
        fireEvent.click(within(listbox).getByText("Quarters"));
        expect("area" in boardProps.current!.playData).toBe(false);
    });

    it("sets a quarter preset", async () => {
        renderEditor();
        await chooseArea("Right end – bottom");
        expect(boardProps.current!.playData.area).toEqual({ kind: "zone-right-bottom" });
    });
```

- [ ] **Step 8: Run it to verify it fails**

Run: `bun run test __tests__/components/features/practice-planner/PlayEditor.ice-area.test.tsx`
Expected: FAIL on the grouping test (no header items; the picker lists the presets flat).

- [ ] **Step 9: Group the picker**

In `components/features/practice-planner/PlayEditor.tsx`, add `ListSubheader` to the `@mui/material` import (lines 12-30), keeping the list alphabetical:

```ts
    InputLabel,
    ListSubheader,
    MenuItem,
```

Remove `ICE_AREA_PRESETS,` from the `@/types/practice-planner` import (line 44) and change the notation import (line 55) to:

```ts
import { ICE_AREA_GROUPS, ICE_AREA_LABELS } from "@/lib/utils/canvas/notation";
```

Replace the options inside the ice-area `Select` (lines 415-420):

```tsx
                                {ICE_AREA_PRESETS.map((preset) => (
                                    <MenuItem key={preset} value={preset}>
                                        {ICE_AREA_LABELS[preset]}
                                    </MenuItem>
                                ))}
                                <MenuItem value="custom">Custom area…</MenuItem>
```

with:

```tsx
                                {/* Select needs its options as direct children, so the groups are flattened (R1). */}
                                {ICE_AREA_GROUPS.flatMap((group) => [
                                    <ListSubheader key={`group-${group.label}`}>{group.label}</ListSubheader>,
                                    ...group.presets.map((preset) => (
                                        <MenuItem key={preset} value={preset}>
                                            {ICE_AREA_LABELS[preset]}
                                        </MenuItem>
                                    )),
                                ])}
                                <MenuItem value="custom">Custom area…</MenuItem>
```

- [ ] **Step 10: Run it to verify it passes**

Run: `bun run test __tests__/components/features/practice-planner/PlayEditor.ice-area.test.tsx`
Expected: PASS (the new tests and every existing one, including "sets a preset and clears it back to full ice").

- [ ] **Step 11: Record the amendment in ADR-0020**

Append to `docs/adr/0020-exchange-practice-plans-as-a-portable-versioned-document-and-ship-a-static-local.md`, after the "Curved lines" amendment:

```markdown
### 2026-10-05: Quarter-ice areas (six additive area values, versions stay 1 and 2)

A diagram's `area.kind` may now also be one of six quarters: `zone-left-top`, `zone-left-bottom`, `zone-neutral-top`, `zone-neutral-bottom`, `zone-right-top` and `zone-right-bottom`. Each is a zone's x range and the top (y 0–42.5) or bottom (y 42.5–85) half of the rink. `PLAN_VERSION` stays 1 and `PlayData.version` stays 2.

**Rules:**
- The six earlier presets keep their rectangles, so every earlier file and stored play draws exactly as before.
- Writers emit a quarter only for a drill set to one.

**Compatibility:** a reader built before this amendment treats an unknown area as unreadable and drops it (`upgradePlayData`), not the whole diagram:
- a plan file (or plan link) with a quarter-ice drill opens, and that drill reads as full ice;
- a static planner tab still on an older build reads such a drill as full ice, and would save it without its area. The IndexedDB version bump that ships with drill age groups (amendment below) makes such a tab reload before it can write;
- a hosted tab opened before the deploy receives the quarter from the updated server and can't draw it (its rectangle table has no entry) until it is reloaded.

From this amendment on, `areaRect` draws an area kind it doesn't know as full ice instead of throwing, so the next additive area value degrades the same way in every surface.

That one-way loss is accepted, as for block rows and curves: a version bump would make older readers reject every new file, including the many without quarters.

Spec: `docs/superpowers/specs/2026-10-05-practice-adm-style-templates-design.md`.
```

- [ ] **Step 12: Type-check, run the area suites, lint the ADR corpus and commit**

```bash
bun run type-check
bun run test __tests__/lib/utils/ice-area.test.ts __tests__/lib/utils/play-data.test.ts __tests__/lib/utils/session-timeline.test.ts __tests__/lib/utils/canvas/station-map.test.ts __tests__/lib/utils/canvas/thumbnail-area.test.ts __tests__/lib/plan-document/document.test.ts __tests__/components/features/practice-planner/PlayEditor.ice-area.test.tsx __tests__/components/features/practice-planner/RinkBoard.ice-area.test.tsx __tests__/lib/data/starter-plays.test.ts
bun run adr:lint
```

Expected: type-check exits 0; all suites PASS; `adr:lint` exits 0.

```bash
/usr/bin/git add types/practice-planner.ts lib/utils/ice-area.ts lib/utils/canvas/notation.ts components/features/practice-planner/PlayEditor.tsx \
  docs/adr/0020-exchange-practice-plans-as-a-portable-versioned-document-and-ship-a-static-local.md \
  __tests__/lib/utils/ice-area.test.ts __tests__/lib/utils/play-data.test.ts __tests__/lib/utils/session-timeline.test.ts \
  __tests__/lib/utils/canvas/station-map.test.ts __tests__/lib/plan-document/document.test.ts \
  __tests__/components/features/practice-planner/PlayEditor.ice-area.test.tsx
/usr/bin/git commit -m "feat(practice-planner): quarter-ice area presets and a grouped area picker" -m "$SESSION_TRAILER"
```

### Task 2: The age-group vocabulary and hosted storage

The portable module every later task imports (spec R2, R6), the shared types, and the hosted side end to end: the column and its CHECK constraint, the play actions (create, update, read, list with the age filter), the session-drill actions (save, fork, copy to the library), the copy service that materialize, detach and duplicate share, and both session queries. Nothing renders an age yet; the editor field and the filter come in Tasks 5 and 6.

**Files:**
- Create: `lib/utils/age-groups.ts`
- Modify: `eslint.config.mjs:172` (add `"lib/utils/age-groups.ts",` after `"lib/utils/session-timeline.ts",`)
- Modify: `types/practice-planner.ts` (import at line 11; `PlayInSession` lines 277-278; `PracticeSessionViewPlay.play` lines 351-352; `SavedPlay` lines 419-420)
- Modify: `lib/planner-store/types.ts` (import at line 12; `LibraryPlaySummary`, `LibraryQuery`, `NewLibraryPlay`, `SessionDrillSave`)
- Modify: `lib/utils/validation.ts` (import after line 47; `createPlaySchema` 1347-1356, `updatePlaySchema` 1358-1369, `getPlaysByTeamSchema` 1381-1390, `saveSessionDrillSchema` 1569-1584)
- Modify: `prisma/schema.prisma:1761-1762` (model `Play`)
- Create: `prisma/migrations/20261005130000_play_age_groups/migration.sql`
- Modify: `lib/actions/plays.ts` (imports 21-22; `createPlay` 97-99; `updatePlay` 209-210; `getPlayById` 359-436; `getPlaysByTeam` 466-573)
- Modify: `lib/actions/practice-session-drills.ts` (tags 70-73; fork select 109 and data 127; `copySessionDrillToLibrary` 150 and 162-163)
- Modify: `lib/services/practice-session-drills.ts` (`CloneSource` 33-35, `CLONE_SOURCE_SELECT` 47-48, `cloneDrillsIntoSessions` 85-86)
- Modify: `lib/actions/practice-session-queries.ts` (import line 8; detail select 145-146 and play 219; edit select 291-292 and row 372)
- Test (create): `__tests__/lib/utils/age-groups.test.ts`, `__tests__/prisma/play-age-groups-migration.test.ts`
- Test (modify): `__tests__/lib/actions/plays-tags.test.ts`, `__tests__/lib/actions/practice-session-drills.test.ts`, `__tests__/lib/services/practice-session-drills.test.ts`, `__tests__/lib/actions/practice-session-queries.test.ts`
- Existing tests that must stay green unchanged: `__tests__/lib/utils/drill-tags.test.ts` (`drillTags` keeps returning exactly `{ focus, goalies }`), `__tests__/lib/actions/action-id-sweep.test.ts`, `__tests__/lib/actions/action-id-arguments.test.ts`, `__tests__/lib/utils/validation-practice-session.test.ts`, `__tests__/prisma/play-drill-tags-migration.test.ts`.

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces, from `lib/utils/age-groups.ts`:
  - `AGE_GROUPS` (`readonly ["u6", "u8", "u10", "u12", "u14", "u16plus"]`), `type AgeGroup`, `AGE_GROUP_LABELS: Record<AgeGroup, string>`, `AGE_GROUP_CLASSIFICATION`;
  - copy: `ALL_AGES_LABEL`, `SHOW_ALL_AGES_LABEL`, `AGE_FILTER_GROUP_LABEL`, `AGE_GROUPS_FIELD_LABEL`, `AGE_GROUPS_HELPER`, `AGE_GROUP_UNKNOWN_MESSAGE`, `AGE_GROUP_REPEAT_MESSAGE`, `AGE_GROUPS_LIST_MESSAGE`, `AGE_FILTER_STORAGE_KEY`;
  - `isAgeGroup(value: unknown): value is AgeGroup`, `toAgeGroup(value: unknown): AgeGroup | null`, `inAgeOrder(groups: readonly AgeGroup[]): AgeGroup[]`, `toAgeGroups(value: unknown): AgeGroup[]`, `toggleAgeGroup(groups: readonly AgeGroup[], group: AgeGroup): AgeGroup[]`, `matchesAgeGroup(groups: readonly AgeGroup[] | undefined, filter: AgeGroup | null): boolean`, `formatAgeGroups(groups: readonly AgeGroup[] | undefined): string`, `noAgeMatchMessage(noun: "drills" | "templates", group: AgeGroup): string`;
  - schemas: `ageGroupSchema` (one value), `ageGroupsSchema` (a list; output in table order).
- Produces, on shared types: `ageGroups?: AgeGroup[]` on `PlayInSession`, `PracticeSessionViewPlay["play"]`, `SavedPlay`, `LibraryPlaySummary`, `NewLibraryPlay`, `SessionDrillSave`; `ageGroup?: AgeGroup` on `LibraryQuery`.
- Produces, hosted: `getPlayById` and `getPlaysByTeam` results carry `ageGroups: AgeGroup[]`; `getPlaysByTeam` takes `ageGroup?: AgeGroup`; `createPlay` takes `ageGroups?` (default `[]`), `updatePlay` and `saveSessionDrill` take `ageGroups?` (absent = unchanged); session detail and edit rows carry `ageGroups`.

- [ ] **Step 1: Write the failing vocabulary tests**

Create `__tests__/lib/utils/age-groups.test.ts`:

```ts
/** Drill age groups (ADM-style templates spec R2, R3): vocabulary, readers, match rule and write schema. */
import { describe, expect, it } from "vitest";
import type { AgeClassification } from "@prisma/client";
import {
    AGE_GROUPS,
    AGE_GROUP_CLASSIFICATION,
    AGE_GROUP_LABELS,
    AGE_GROUP_REPEAT_MESSAGE,
    AGE_GROUP_UNKNOWN_MESSAGE,
    AGE_GROUPS_LIST_MESSAGE,
    ALL_AGES_LABEL,
    ageGroupSchema,
    ageGroupsSchema,
    formatAgeGroups,
    matchesAgeGroup,
    noAgeMatchMessage,
    toAgeGroup,
    toAgeGroups,
    toggleAgeGroup,
    type AgeGroup,
} from "@/lib/utils/age-groups";
import { AGE_CLASSIFICATION_LABELS } from "@/lib/utils/age-level";

describe("the vocabulary", () => {
    it("lists six groups in age order with their labels", () => {
        expect([...AGE_GROUPS]).toEqual(["u6", "u8", "u10", "u12", "u14", "u16plus"]);
        expect(AGE_GROUPS.map((group) => AGE_GROUP_LABELS[group])).toEqual(["6U", "8U", "10U", "12U", "14U", "16U+"]);
    });

    it("maps each group to the league classification its wording follows", () => {
        // Typed against Prisma's enum here, so a renamed classification fails type-check.
        const mapping: Record<AgeGroup, AgeClassification> = AGE_GROUP_CLASSIFICATION;
        for (const group of AGE_GROUPS) {
            expect(AGE_CLASSIFICATION_LABELS[mapping[group]].startsWith(AGE_GROUP_LABELS[group].replace("+", ""))).toBe(true);
        }
    });
});

describe("readers", () => {
    it("reads a stored filter value, or null for anything unknown", () => {
        expect(toAgeGroup("u8")).toBe("u8");
        expect(toAgeGroup("u7")).toBeNull();
        expect(toAgeGroup(null)).toBeNull();
        expect(toAgeGroup(8)).toBeNull();
    });

    it("reads stored lists leniently: known values, once each, in table order; a non-list is every age", () => {
        expect(toAgeGroups(["u12", "u8", "u12", "u7"])).toEqual(["u8", "u12"]);
        expect(toAgeGroups([])).toEqual([]);
        expect(toAgeGroups(undefined)).toEqual([]);
        expect(toAgeGroups(null)).toEqual([]);
        expect(toAgeGroups("u8")).toEqual([]);
    });

    it("toggles a group in or out, keeping the table order", () => {
        expect(toggleAgeGroup(["u12"], "u8")).toEqual(["u8", "u12"]);
        expect(toggleAgeGroup(["u8", "u12"], "u8")).toEqual(["u12"]);
        expect(toggleAgeGroup([], "u16plus")).toEqual(["u16plus"]);
    });
});

describe("matchesAgeGroup (R3)", () => {
    it("matches everything for All ages, an untagged drill for every age, and a tagged drill for its own ages", () => {
        expect(matchesAgeGroup(["u12"], null)).toBe(true);
        expect(matchesAgeGroup([], "u6")).toBe(true);
        expect(matchesAgeGroup(undefined, "u16plus")).toBe(true);
        expect(matchesAgeGroup(["u8", "u10"], "u10")).toBe(true);
        expect(matchesAgeGroup(["u8", "u10"], "u12")).toBe(false);
    });
});

describe("copy", () => {
    it("formats a list for a chip and names the empty state", () => {
        expect(formatAgeGroups([])).toBe(ALL_AGES_LABEL);
        expect(formatAgeGroups(undefined)).toBe("All ages");
        expect(formatAgeGroups(["u8", "u6"])).toBe("6U, 8U");
        expect(noAgeMatchMessage("drills", "u8")).toBe("No drills for 8U yet.");
        expect(noAgeMatchMessage("templates", "u16plus")).toBe("No templates for 16U+ yet.");
    });
});

describe("the write schema (R2)", () => {
    it("accepts 0 to 6 known values and stores them in table order", () => {
        expect(ageGroupsSchema.parse([])).toEqual([]);
        expect(ageGroupsSchema.parse(["u16plus", "u6"])).toEqual(["u6", "u16plus"]);
        expect(ageGroupsSchema.parse([...AGE_GROUPS].reverse())).toEqual([...AGE_GROUPS]);
    });

    it("refuses an unknown value, a repeat and a non-list, each with its message", () => {
        const message = (value: unknown) => {
            const result = ageGroupsSchema.safeParse(value);
            return result.success ? null : result.error.issues[0].message;
        };
        expect(message(["u8", "u7"])).toBe(AGE_GROUP_UNKNOWN_MESSAGE);
        expect(message(["u8", "u8"])).toBe(AGE_GROUP_REPEAT_MESSAGE);
        expect(message("u8")).toBe(AGE_GROUPS_LIST_MESSAGE);
        expect(AGE_GROUP_UNKNOWN_MESSAGE).toBe("Age groups must be 6U, 8U, 10U, 12U, 14U or 16U+");
    });

    it("validates one filter value", () => {
        expect(ageGroupSchema.parse("u14")).toBe("u14");
        expect(ageGroupSchema.safeParse("U14").success).toBe(false);
    });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test __tests__/lib/utils/age-groups.test.ts`
Expected: FAIL with "Failed to resolve import "@/lib/utils/age-groups"".

- [ ] **Step 3: Write the module**

Create `lib/utils/age-groups.ts`:

```ts
/**
 * Drill age groups (ADM-style templates spec R2, R3, R6): the vocabulary and
 * labels, the league classification each label follows, the filter's match
 * rule, lenient readers for stored values and the strict write schema.
 * Portable (ADR-0020): imports only zod, so both deployables, the server
 * actions and the plan document share it. Never import @prisma/client here.
 */
import { z } from "zod";

export const AGE_GROUPS = ["u6", "u8", "u10", "u12", "u14", "u16plus"] as const;
/** One age group. A drill or template with none suits every age. */
export type AgeGroup = (typeof AGE_GROUPS)[number];

export const AGE_GROUP_LABELS: Record<AgeGroup, string> = {
    u6: "6U",
    u8: "8U",
    u10: "10U",
    u12: "12U",
    u14: "14U",
    u16plus: "16U+",
};

/**
 * The league AgeClassification whose wording each label follows
 * (lib/utils/age-level.ts). A constant, not a database link, written as
 * string literals so this module stays portable; a test types it against
 * Prisma's enum.
 */
export const AGE_GROUP_CLASSIFICATION: Record<AgeGroup, "U6" | "U8" | "SQUIRT_U10" | "PEEWEE_U12" | "BANTAM_U14" | "U16"> = {
    u6: "U6",
    u8: "U8",
    u10: "SQUIRT_U10",
    u12: "PEEWEE_U12",
    u14: "BANTAM_U14",
    u16plus: "U16",
};

export const ALL_AGES_LABEL = "All ages";
export const SHOW_ALL_AGES_LABEL = "Show all ages";
export const AGE_FILTER_GROUP_LABEL = "Age group";
export const AGE_GROUPS_FIELD_LABEL = "Age groups";
export const AGE_GROUPS_HELPER = "Leave empty if it suits every age.";
export const AGE_GROUP_UNKNOWN_MESSAGE = "Age groups must be 6U, 8U, 10U, 12U, 14U or 16U+";
export const AGE_GROUP_REPEAT_MESSAGE = "Each age group can be listed only once";
export const AGE_GROUPS_LIST_MESSAGE = "Age groups must be a list";

/** The one localStorage key that remembers the age filter on this device (R3). */
export const AGE_FILTER_STORAGE_KEY = "openleague.planner.ageFilter";

export function isAgeGroup(value: unknown): value is AgeGroup {
    return (AGE_GROUPS as readonly unknown[]).includes(value);
}

/** A known group, else null (All ages): a remembered filter, a query value. */
export function toAgeGroup(value: unknown): AgeGroup | null {
    return isAgeGroup(value) ? value : null;
}

/** The groups given, each once, in AGE_GROUPS order. */
export function inAgeOrder(groups: readonly AgeGroup[]): AgeGroup[] {
    return AGE_GROUPS.filter((group) => groups.includes(group));
}

/**
 * Lenient reader for a stored value (a database array, a device record, an
 * exporter's input): unknown values are dropped, repeats collapse, the order
 * is the table's, and anything that isn't a list reads as [] (every age).
 */
export function toAgeGroups(value: unknown): AgeGroup[] {
    return Array.isArray(value) ? inAgeOrder(value.filter(isAgeGroup)) : [];
}

/** The editor chip's toggle: adds or removes one group, keeping the table order. */
export function toggleAgeGroup(groups: readonly AgeGroup[], group: AgeGroup): AgeGroup[] {
    return groups.includes(group) ? groups.filter((other) => other !== group) : inAgeOrder([...groups, group]);
}

/** The filter's rule (R3): All ages (null) matches everything; an untagged drill or template matches every age. */
export function matchesAgeGroup(groups: readonly AgeGroup[] | undefined, filter: AgeGroup | null): boolean {
    return filter === null || !groups || groups.length === 0 || groups.includes(filter);
}

/** "All ages", or the labels in table order: "6U, 8U". */
export function formatAgeGroups(groups: readonly AgeGroup[] | undefined): string {
    const known = toAgeGroups(groups);
    return known.length === 0 ? ALL_AGES_LABEL : known.map((group) => AGE_GROUP_LABELS[group]).join(", ");
}

/** The filter's empty state (R3): "No drills for 8U yet." */
export function noAgeMatchMessage(noun: "drills" | "templates", group: AgeGroup): string {
    return `No ${noun} for ${AGE_GROUP_LABELS[group]} yet.`;
}

/** One age group: the library filter's query value. */
export const ageGroupSchema = z.enum(AGE_GROUPS, { message: AGE_GROUP_UNKNOWN_MESSAGE });

/**
 * A drill's age groups on write (R2): known values only and no repeats, so at
 * most six; stored in table order whatever order was sent.
 */
export const ageGroupsSchema = z
    .array(ageGroupSchema, { message: AGE_GROUPS_LIST_MESSAGE })
    .refine((groups) => new Set(groups).size === groups.length, { message: AGE_GROUP_REPEAT_MESSAGE })
    .transform(inAgeOrder);
```

- [ ] **Step 4: Run them to verify they pass**

Run: `bun run test __tests__/lib/utils/age-groups.test.ts`
Expected: PASS.

- [ ] **Step 5: Keep the module portable and give the shared types the field**

In `eslint.config.mjs`, inside the `adr-0020/portable-practice-planner` block's `files`, after `"lib/utils/session-timeline.ts",` (line 172), add:

```js
      "lib/utils/age-groups.ts",
```

In `types/practice-planner.ts`, after line 11 (`import type { SegmentKind } from "@/types/segments";`) add:

```ts
import type { AgeGroup } from "@/lib/utils/age-groups";
```

Then add the field beside the drill tags in three places:
- in `PlayInSession`, after `goalies?: PlayGoalies;` (line 278):

  ```ts
      /** Age groups (ADM-style templates R2); absent or [] = every age. */
      ageGroups?: AgeGroup[];
  ```
- in `PracticeSessionViewPlay["play"]`, after `goalies?: PlayGoalies;` (line 352):

  ```ts
          ageGroups?: AgeGroup[];
  ```
- in `SavedPlay`, after `goalies?: PlayGoalies;` (line 420):

  ```ts
      ageGroups?: AgeGroup[];
  ```

In `lib/planner-store/types.ts`, change line 12 to:

```ts
import type { LogoImage, PlayData, PlayFocus, PlayGoalies } from "@/types/practice-planner";
import type { AgeGroup } from "@/lib/utils/age-groups";
```

and add, after `goalies?: PlayGoalies;` in each interface:
- `LibraryPlaySummary`: `ageGroups?: AgeGroup[];`
- `NewLibraryPlay`: `ageGroups?: AgeGroup[];`
- `SessionDrillSave`: `ageGroups?: AgeGroup[];`
- `LibraryQuery` (after its `goalies?: PlayGoalies;`):

  ```ts
      /** Only drills for this age, untagged drills included (ADM-style templates R3). */
      ageGroup?: AgeGroup;
  ```

- [ ] **Step 6: Write the failing migration test**

Create `__tests__/prisma/play-age-groups-migration.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AGE_GROUPS } from "@/lib/utils/age-groups";

const sql = readFileSync(join(process.cwd(), "prisma/migrations/20261005130000_play_age_groups/migration.sql"), "utf8");
const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");

describe("drill age groups migration", () => {
    it("adds the column with an empty default, so existing plays read as every age", () => {
        expect(sql).toContain(`ADD COLUMN "ageGroups" TEXT[] NOT NULL DEFAULT '{}'::TEXT[]`);
    });

    it("constrains the values at the database, in step with the code vocabulary", () => {
        expect(sql).toContain(`ADD CONSTRAINT "plays_age_groups_check"`);
        expect(sql).toContain(`CHECK ("ageGroups" <@ ARRAY[${AGE_GROUPS.map((value) => `'${value}'`).join(", ")}]::TEXT[])`);
    });

    it("is additive: nothing is dropped, rewritten or deleted", () => {
        expect(sql).not.toMatch(/\bDROP\b|\bUPDATE\b|\bDELETE\b/i);
    });

    it("matches the Prisma schema's column", () => {
        expect(schema).toMatch(/ageGroups\s+String\[\]\s+@default\(\[\]\)/);
    });
});
```

Run: `bun run test __tests__/prisma/play-age-groups-migration.test.ts`
Expected: FAIL with ENOENT (the migration file does not exist).

- [ ] **Step 7: Add the column and the migration**

In `prisma/schema.prisma`, model `Play`, after `goalies     String   @default("optional")` (line 1762) add:

```prisma
  // Age groups (ADM-style templates R2): AGE_GROUPS in lib/utils/age-groups.ts,
  // [] = every age. CHECK plays_age_groups_check in migration
  // 20261005130000_play_age_groups keeps the values honest; Prisma can't
  // model it, so keep it by hand.
  ageGroups   String[] @default([])
```

Create `prisma/migrations/20261005130000_play_age_groups/migration.sql`:

```sql
-- Drill age groups (ADM-style templates, spec R2).
-- Hand-written and additive: the dev database is behind on migrations, so
-- `migrate dev` cannot be used. Existing plays read as every age ('{}'); a
-- constant DEFAULT is metadata-only on PostgreSQL 11+, so no table is
-- rewritten. Prisma does not model CHECK constraints: keep this one by hand
-- if the column is ever regenerated.

-- AlterTable
ALTER TABLE "plays" ADD COLUMN "ageGroups" TEXT[] NOT NULL DEFAULT '{}'::TEXT[];
ALTER TABLE "plays" ADD CONSTRAINT "plays_age_groups_check"
  CHECK ("ageGroups" <@ ARRAY['u6', 'u8', 'u10', 'u12', 'u14', 'u16plus']::TEXT[]);
```

Regenerate the client (no database access): `bun run db:generate`.
Run: `bun run test __tests__/prisma/play-age-groups-migration.test.ts`
Expected: PASS.

- [ ] **Step 8: Write the failing play-action tests**

In `__tests__/lib/actions/plays-tags.test.ts`, add after the imports:

```ts
import { AGE_GROUP_REPEAT_MESSAGE, AGE_GROUP_UNKNOWN_MESSAGE } from "@/lib/utils/age-groups";
```

and append:

```ts
describe("plays: age groups (ADM-style templates R2, R3)", () => {
    it("createPlay stores none by default, and the sent groups in table order", async () => {
        await createPlay({ name: "Drill", teamId: TEAM, isTemplate: true, playData: createEmptyPlayData() });
        expect(mockPrisma.play.create.mock.calls[0][0].data).toMatchObject({ ageGroups: [] });
        await createPlay({ name: "Drill", teamId: TEAM, isTemplate: true, playData: createEmptyPlayData(), ageGroups: ["u10", "u8"] });
        expect(mockPrisma.play.create.mock.calls[1][0].data).toMatchObject({ ageGroups: ["u8", "u10"] });
    });

    it("createPlay refuses an unknown or repeated group without writing", async () => {
        const unknown = await createPlay({ name: "Drill", teamId: TEAM, isTemplate: true, playData: createEmptyPlayData(), ageGroups: ["u7" as never] });
        const repeated = await createPlay({ name: "Drill", teamId: TEAM, isTemplate: true, playData: createEmptyPlayData(), ageGroups: ["u8", "u8"] });
        expect(unknown).toMatchObject({ success: false, error: "Invalid input" });
        expect(JSON.stringify(unknown)).toContain(AGE_GROUP_UNKNOWN_MESSAGE);
        expect(JSON.stringify(repeated)).toContain(AGE_GROUP_REPEAT_MESSAGE);
        expect(mockPrisma.play.create).not.toHaveBeenCalled();
    });

    it("updatePlay writes the groups only when sent; [] clears them", async () => {
        mockPrisma.play.findUnique.mockResolvedValue({ teamId: TEAM, sessionId: null });
        await updatePlay({ id: PLAY, name: "Drill", teamId: TEAM, playData: createEmptyPlayData() });
        expect(tx.play.update.mock.calls[0][0].data).not.toHaveProperty("ageGroups");
        await updatePlay({ id: PLAY, name: "Drill", teamId: TEAM, playData: createEmptyPlayData(), ageGroups: [] });
        expect(tx.play.update.mock.calls[1][0].data).toMatchObject({ ageGroups: [] });
    });

    it("getPlaysByTeam filters by age with untagged drills included, beside the search, and narrows stored arrays", async () => {
        mockPrisma.play.findMany.mockResolvedValue([
            { id: PLAY, name: "Drill", description: null, thumbnail: null, isTemplate: true, focus: "team", goalies: "optional", ageGroups: ["u10", "u7", "u8", "u8"], createdAt: AT, updatedAt: AT },
        ]);
        mockPrisma.play.count.mockResolvedValue(1);
        const result = await getPlaysByTeam({ teamId: TEAM, isTemplate: true, page: 1, limit: 20, dateFilter: "all", search: "breakout", ageGroup: "u10" });

        const query = mockPrisma.play.findMany.mock.calls[0][0];
        expect(query.where.AND).toEqual([{ OR: [{ ageGroups: { isEmpty: true } }, { ageGroups: { has: "u10" } }] }]);
        // The search keeps its own OR: the age clause never replaces it.
        expect(query.where.OR).toEqual([
            { name: { contains: "breakout", mode: "insensitive" } },
            { description: { contains: "breakout", mode: "insensitive" } },
        ]);
        expect(mockPrisma.play.count.mock.calls[0][0].where).toEqual(query.where);
        expect(query.select).toMatchObject({ ageGroups: true });
        expect(result.success && result.data.plays[0].ageGroups).toEqual(["u8", "u10"]);
    });

    it("getPlaysByTeam adds no age clause for All ages, and refuses an unknown age", async () => {
        mockPrisma.play.findMany.mockResolvedValue([]);
        mockPrisma.play.count.mockResolvedValue(0);
        await getPlaysByTeam({ teamId: TEAM, isTemplate: true, page: 1, limit: 20, dateFilter: "all" });
        expect(mockPrisma.play.findMany.mock.calls[0][0].where).not.toHaveProperty("AND");
        const refused = await getPlaysByTeam({ teamId: TEAM, isTemplate: true, page: 1, limit: 20, dateFilter: "all", ageGroup: "u7" as never });
        expect(refused).toMatchObject({ success: false, error: "Invalid input" });
        expect(mockPrisma.play.findMany).toHaveBeenCalledTimes(1);
    });

    it("getPlayById returns the groups ([] for a play saved before them)", async () => {
        mockPrisma.play.findUnique.mockResolvedValue({
            id: PLAY, name: "Drill", description: null, thumbnail: null, playData: createEmptyPlayData(), isTemplate: true,
            teamId: TEAM, sessionId: null, focus: "team", goalies: "optional", ageGroups: ["u12"], createdAt: AT, updatedAt: AT,
        });
        const result = await getPlayById({ id: PLAY, teamId: TEAM });
        expect(mockPrisma.play.findUnique.mock.calls[0][0].select).toMatchObject({ ageGroups: true });
        expect(result.success && result.data.ageGroups).toEqual(["u12"]);
        mockPrisma.play.findUnique.mockResolvedValue({
            id: PLAY, name: "Drill", description: null, thumbnail: null, playData: createEmptyPlayData(), isTemplate: true,
            teamId: TEAM, sessionId: null, focus: "team", goalies: "optional", createdAt: AT, updatedAt: AT,
        });
        const legacy = await getPlayById({ id: PLAY, teamId: TEAM });
        expect(legacy.success && legacy.data.ageGroups).toEqual([]);
    });
});
```

Run: `bun run test __tests__/lib/actions/plays-tags.test.ts`
Expected: FAIL (`ageGroups` is stripped by the schemas and never written or selected; there is no `AND`).

- [ ] **Step 9: Validate and store the groups in the play actions**

In `lib/utils/validation.ts`, after line 47 (`import { GOALIES_ATTENDING_MESSAGE } from "@/lib/utils/drill-tags";`) add:

```ts
import { ageGroupSchema, ageGroupsSchema } from "@/lib/utils/age-groups";
```

Then:
- in `createPlaySchema`, after `goalies: playGoaliesSchema.default("optional"),` add `  ageGroups: ageGroupsSchema.default([]),`
- in `updatePlaySchema`, after `goalies: playGoaliesSchema.optional(),` add `  ageGroups: ageGroupsSchema.optional(),`
- in `getPlaysByTeamSchema`, after `goalies: playGoaliesSchema.optional(),` add `  ageGroup: ageGroupSchema.optional(),`
- in `saveSessionDrillSchema`, after `goalies: playGoaliesSchema.optional(),` add `  ageGroups: ageGroupsSchema.optional(),`

In `lib/actions/plays.ts`, change lines 21-22 to:

```ts
import { drillTags } from "@/lib/utils/drill-tags";
import { toAgeGroups, type AgeGroup } from "@/lib/utils/age-groups";
import type { PlayData, PlayFocus, PlayGoalies } from "@/types/practice-planner";
```

Then:
- `createPlay`, in `data` after `goalies: validated.goalies,` (line 99): `                ageGroups: validated.ageGroups,`
- `updatePlay`, in `data` after the `goalies` spread (line 210): `                    ...(validated.ageGroups !== undefined && { ageGroups: validated.ageGroups }),`
- `getPlayById`: add `    ageGroups: AgeGroup[];` after `goalies: PlayGoalies;` in the return type (line 367); `ageGroups: true,` after `goalies: true,` in `select` (line 390); and `ageGroups: toAgeGroups(play.ageGroups),` after `...drillTags(play),` (line 432).
- `getPlaysByTeam`: add `        ageGroups: AgeGroup[];` after `goalies: PlayGoalies;` in the return type (line 474); after the drill-tag filters (line 503) add:

  ```ts
          // Age filter (ADM-style templates R3): an untagged drill suits every age.
          // AND, not OR: the search below already owns where.OR.
          if (validated.ageGroup) {
              where.AND = [{ OR: [{ ageGroups: { isEmpty: true } }, { ageGroups: { has: validated.ageGroup } }] }];
          }
  ```

  add `ageGroups: true,` after `goalies: true,` in `select` (line 553); and change the mapping (line 568) to:

  ```ts
                  plays: plays.map((play) => ({ ...play, ...drillTags(play), ageGroups: toAgeGroups(play.ageGroups) })),
  ```

Run: `bun run test __tests__/lib/actions/plays-tags.test.ts`
Expected: PASS (the earlier drill-tag tests in the file too).

- [ ] **Step 10: Write the failing session-drill and copy-service tests**

Append to `__tests__/lib/actions/practice-session-drills.test.ts`:

```ts
describe("saveSessionDrill and copySessionDrillToLibrary: age groups", () => {
    it("a brand-new drill stores the sent groups; none sent stores the column default", async () => {
        await saveSessionDrill({ ...drillInput(), ageGroups: ["u10", "u8"] });
        expect(tx.play.create.mock.calls[0][0].data).toMatchObject({ ageGroups: ["u8", "u10"] });
        await saveSessionDrill(drillInput());
        expect(tx.play.create.mock.calls[1][0].data).not.toHaveProperty("ageGroups");
    });

    it("an owned drill keeps its groups when none are sent", async () => {
        tx.play.findFirst.mockResolvedValue({ id: OWNED, sessionId: SESSION, isTemplate: false, sourcePlayId: LIB, focus: "team", goalies: "optional", ageGroups: ["u12"] });
        await saveSessionDrill(drillInput(OWNED));
        expect(tx.play.update.mock.calls[0][0].data).not.toHaveProperty("ageGroups");
        await saveSessionDrill({ ...drillInput(OWNED), ageGroups: [] });
        expect(tx.play.update.mock.calls[1][0].data).toMatchObject({ ageGroups: [] });
    });

    it("a fork inherits the source's groups unless new ones are sent", async () => {
        tx.play.findFirst.mockResolvedValue({ id: LIB, sessionId: null, isTemplate: true, sourcePlayId: null, focus: "team", goalies: "optional", ageGroups: ["u8"] });
        await saveSessionDrill(drillInput(LIB));
        expect(tx.play.findFirst.mock.calls[0][0].select).toMatchObject({ ageGroups: true });
        expect(tx.play.create.mock.calls[0][0].data).toMatchObject({ ageGroups: ["u8"] });
        await saveSessionDrill({ ...drillInput(LIB), ageGroups: ["u14"] });
        expect(tx.play.create.mock.calls[1][0].data).toMatchObject({ ageGroups: ["u14"] });
    });

    it("refuses an unknown group", async () => {
        const result = await saveSessionDrill({ ...drillInput(), ageGroups: ["u9" as never] });
        expect(result).toMatchObject({ success: false, error: "Invalid input" });
        expect(tx.play.create).not.toHaveBeenCalled();
    });

    it("copySessionDrillToLibrary copies the groups", async () => {
        tx.play.findFirst.mockResolvedValue({ name: "Battle", description: null, thumbnail: null, playData: {}, sessionId: SESSION, focus: "skaters", goalies: "none", ageGroups: ["u6", "u8"] });
        await copySessionDrillToLibrary({ playId: OWNED, teamId: TEAM });
        expect(tx.play.findFirst.mock.calls[0][0].select).toMatchObject({ ageGroups: true });
        expect(tx.play.create.mock.calls[0][0].data).toMatchObject({ ageGroups: ["u6", "u8"], isTemplate: true });
    });
});
```

In `__tests__/lib/services/practice-session-drills.test.ts`, inside `describe("clones carry the drill tags …", …)`, add:

```ts
    it("selects and copies the age groups", async () => {
        expect(CLONE_SOURCE_SELECT).toMatchObject({ ageGroups: true });
        const data = await cloneOne({ id: "lib", name: "Battle", description: null, thumbnail: null, playData: {}, sourcePlayId: null, focus: "skaters", goalies: "none", ageGroups: ["u8"] });
        expect(data).toMatchObject({ ageGroups: ["u8"] });
    });
```

(The existing "writes every Play column except the timestamps (new-column guard)" test now also fails until the service copies `ageGroups`: Prisma's `PlayScalarFieldEnum` gained it in Step 7.)

Run: `bun run test __tests__/lib/actions/practice-session-drills.test.ts __tests__/lib/services/practice-session-drills.test.ts`
Expected: FAIL in the new tests and in the new-column guard.

- [ ] **Step 11: Carry the groups through session drills and copies**

In `lib/actions/practice-session-drills.ts`:
- in `tags` (lines 71-74), after the `goalies` spread add `            ...(validated.ageGroups !== undefined && { ageGroups: validated.ageGroups }),`
- in the fork lookup's `select` (line 109) add `ageGroups: true`:

  ```ts
                  select: { id: true, sessionId: true, isTemplate: true, sourcePlayId: true, focus: true, goalies: true, ageGroups: true },
  ```
- in the fork's `data` (line 127):

  ```ts
                  data: { focus: play.focus, goalies: play.goalies, ageGroups: play.ageGroups, ...fields, ...ownedCopy, sourcePlayId: play.sourcePlayId ?? play.id },
  ```
- in `copySessionDrillToLibrary`, add `ageGroups: true` to the `select` (line 150) and `                ageGroups: play.ageGroups,` after `goalies: play.goalies,` (line 163).

In `lib/services/practice-session-drills.ts`:
- in `CloneSource`, after `goalies?: string;` (line 35): `    /** Age groups; absent on old fixtures = the column default ([]). */` and `    ageGroups?: string[];`
- in `CLONE_SOURCE_SELECT`, after `goalies: true,` (line 48): `    ageGroups: true,`
- in `cloneDrillsIntoSessions`'s `data`, after `goalies: source.goalies,` (line 86): `            ageGroups: source.ageGroups,`

Run: `bun run test __tests__/lib/actions/practice-session-drills.test.ts __tests__/lib/services/practice-session-drills.test.ts`
Expected: PASS, the new-column guard included.

- [ ] **Step 12: Write the failing session-query test**

In `__tests__/lib/actions/practice-session-queries.test.ts`, inside `describe("goaltender fields in the session queries", …)`, add:

```ts
    it("both queries return each drill's age groups ([] when untagged)", async () => {
        mockPrisma.practiceSession.findUnique.mockResolvedValue({
            ...base,
            plays: [{ ...row("a", 0), play: { ...row("a", 0).play, ageGroups: ["u10", "u8"] } }, row("b", 1)],
        });
        const detail = await getPracticeSessionDetail(SESSION_ID);
        expect(drillRows(detail!.session.plays).map((p) => p.play.ageGroups)).toEqual([["u8", "u10"], []]);
        expect(mockPrisma.practiceSession.findUnique.mock.calls[0][0].include.plays.include.play.select).toMatchObject({ ageGroups: true });

        const edit = await getPracticeSessionForEdit(SESSION_ID);
        expect(drillRows(edit!.initialData.plays).map((p) => p.ageGroups)).toEqual([["u8", "u10"], []]);
        expect(mockPrisma.practiceSession.findUnique.mock.calls[1][0].include.plays.include.play.select).toMatchObject({ ageGroups: true });
    });
```

Run: `bun run test __tests__/lib/actions/practice-session-queries.test.ts`
Expected: FAIL (`ageGroups` is `undefined` on both).

- [ ] **Step 13: Read the groups in both session queries**

In `lib/actions/practice-session-queries.ts`, after line 8 (`import { drillTags } from "@/lib/utils/drill-tags";`) add:

```ts
import { toAgeGroups } from "@/lib/utils/age-groups";
```

Then:
- detail `select` (after `goalies: true,`, line 146): `              ageGroups: true,`
- detail play (after `...drillTags(play),`, line 219): `            ageGroups: toAgeGroups(play.ageGroups),`
- edit `select` (after `goalies: true,`, line 292): `              ageGroups: true,`
- edit row (after `...drillTags(sp.play),`, line 372): `          ageGroups: toAgeGroups(sp.play.ageGroups),`

Run: `bun run test __tests__/lib/actions/practice-session-queries.test.ts`
Expected: PASS.

- [ ] **Step 14: Type-check, lint, run the task's suites and commit**

```bash
bun run type-check
bun run lint
bun run test __tests__/lib/utils/age-groups.test.ts __tests__/prisma/play-age-groups-migration.test.ts __tests__/prisma/play-drill-tags-migration.test.ts \
  __tests__/lib/actions/plays-tags.test.ts __tests__/lib/actions/practice-session-drills.test.ts __tests__/lib/services/practice-session-drills.test.ts \
  __tests__/lib/actions/practice-session-queries.test.ts __tests__/lib/utils/drill-tags.test.ts __tests__/lib/utils/validation-practice-session.test.ts \
  __tests__/lib/actions/action-id-sweep.test.ts __tests__/lib/actions/action-id-arguments.test.ts
bun run check:raw-sql
```

Expected: all exit 0 and PASS. The sweep tests need no table change: no export was added, and every changed action still validates its ids before anything else.

```bash
/usr/bin/git add lib/utils/age-groups.ts eslint.config.mjs types/practice-planner.ts lib/planner-store/types.ts lib/utils/validation.ts \
  prisma/schema.prisma prisma/migrations/20261005130000_play_age_groups/migration.sql \
  lib/actions/plays.ts lib/actions/practice-session-drills.ts lib/services/practice-session-drills.ts lib/actions/practice-session-queries.ts \
  __tests__/lib/utils/age-groups.test.ts __tests__/prisma/play-age-groups-migration.test.ts __tests__/lib/actions/plays-tags.test.ts \
  __tests__/lib/actions/practice-session-drills.test.ts __tests__/lib/services/practice-session-drills.test.ts __tests__/lib/actions/practice-session-queries.test.ts
/usr/bin/git commit -m "feat(practice-planner): drill age groups vocabulary and hosted storage" -m "$SESSION_TRAILER"
```

### Task 3: Age groups in plan files and the static store

Plan files carry each drill's ages (spec R2, success criteria 2 and 5): the document validates them strictly and always writes them, the hosted import stores them, both exports write them, and the ADR-0020 amendment records the field. The static store carries the field everywhere the drill tags go, filters the library by age, and bumps IndexedDB from version 3 to 4 with a no-op upgrade so a tab on an older build reloads before it can rewrite a drill without the field (#405/#407 pattern).

**Files:**
- Modify: `lib/plan-document/document.ts` (imports 11-25; `planDrillSchema` 160-166; `PlanDrillInput` 283-301; `serializePlan` 382-387; `PlanEditorDrill` 498-514; `planToEditorSession` 557-563)
- Modify: `lib/actions/practice-plan-import.ts:124-125` (`drillFields`)
- Modify: `components/features/practice-planner/export/bench-sheet-model.ts:8,41` (`ExportSessionPlay["play"]`)
- Modify: `components/features/practice-planner/ExportPlanMenu.tsx:63-64` (`toPlanRows`)
- Modify: `docs/adr/0020-exchange-practice-plans-as-a-portable-versioned-document-and-ship-a-static-local.md` (append a second amendment)
- Modify: `apps/planner/src/store/records.ts` (import line 6; `StoredPlay` lines 16-18)
- Modify: `apps/planner/src/store/shared.ts` (imports 2-6; `summary` 83-94; add `checkedAgeGroups`)
- Modify: `apps/planner/src/store/library.ts` (imports 5 and 7-19; `getPlaysByTeam` 68-69; `createPlay` 105; `updatePlay` 122-125)
- Modify: `apps/planner/src/store/sessions.ts` (imports 11 and 64; plan export 246; `getSessionView` 410; `getSessionForEdit` 448; `saveSessionDrill` 531-563; `importPlan` 681-682)
- Modify: `apps/planner/src/store/types.ts:13,57-58` (`LocalPlayUpdate`)
- Modify: `apps/planner/src/store/idb-repo.ts:10-19,47-52` (`DB_VERSION`, `upgradeDatabase`)
- Test (create): `__tests__/apps/planner/local-store.age-groups.test.ts`
- Test (modify): `__tests__/lib/plan-document/document.test.ts` (line 148 breaks: it pins a plan drill's keys), `__tests__/lib/actions/practice-plan-import.test.ts`, `__tests__/components/features/practice-planner/ExportPlanMenu.test.tsx`, `__tests__/apps/planner/repos.test.ts` (line 187 "is version 3" and line 236 `toBe(3)` break)
- Existing tests that must stay green unchanged: `__tests__/lib/data/starter-templates.test.ts` (its round-trip test compares a serialized template with its parsed copy, both of which now carry `ageGroups: []`), `__tests__/components/features/practice-planner/PlanImportView.test.tsx`, `__tests__/apps/planner/import-screen.test.tsx`, `__tests__/apps/planner/local-store.library.test.ts`, `__tests__/apps/planner/local-store.sessions.test.ts`.

**Interfaces:**
- Consumes (Task 2): `AgeGroup`, `ageGroupsSchema`, `toAgeGroups`, `matchesAgeGroup`, `AGE_GROUP_UNKNOWN_MESSAGE`; `LibraryQuery.ageGroup`, `NewLibraryPlay.ageGroups`, `SessionDrillSave.ageGroups`, `PracticeSessionViewPlay["play"].ageGroups`, `PlayInSession.ageGroups`.
- Produces, from `lib/plan-document/document.ts`: plan drills' `drill.ageGroups: AgeGroup[]` (parse output); `PlanDrillInput.ageGroups?: readonly AgeGroup[]` (absent = none); `PlanEditorDrill.ageGroups: AgeGroup[]`.
- Produces, from `components/features/practice-planner/export/bench-sheet-model.ts`: `ExportSessionPlay["play"].ageGroups?: readonly AgeGroup[]`.
- Produces, from `apps/planner/src/store/shared.ts`: `checkedAgeGroups(value: unknown): AgeGroup[]` (throws `StoreRefusal` with the schema's message).
- Produces, from `apps/planner/src/store/records.ts`: `StoredPlay.ageGroups?: AgeGroup[]`; from `types.ts`: `LocalPlayUpdate.ageGroups?: AgeGroup[]`; from `idb-repo.ts`: `DB_VERSION = 4`.

- [ ] **Step 1: Write the failing plan-document tests**

In `__tests__/lib/plan-document/document.test.ts`, add to the imports:

```ts
import { AGE_GROUP_REPEAT_MESSAGE, AGE_GROUP_UNKNOWN_MESSAGE, AGE_GROUPS_LIST_MESSAGE } from "@/lib/utils/age-groups";
```

Change line 148 to:

```ts
        expect(Object.keys(drillRows(doc.session.drills)[0].drill).sort()).toEqual(["ageGroups", "description", "focus", "goalies", "name", "playData"]);
```

and append a new `describe` at the end of the file:

```ts
describe("drill age groups (additive, version 1)", () => {
    function agedInput(ageGroups?: unknown): PlanSessionInput {
        return {
            title: "Station night",
            durationMinutes: 30,
            date: null,
            startTime: null,
            drills: [
                { sequence: 0, duration: 10, runsWithPrevious: false, instructions: null, name: "Keep-Away", description: null, playData: null, ageGroups: ageGroups as never },
                { sequence: 1, duration: 10, runsWithPrevious: false, instructions: null, name: "Weave", description: null, playData: null },
            ],
        };
    }

    const issuesFor = (ageGroups: unknown) => {
        const raw = JSON.parse(JSON.stringify(serializePlan(agedInput(), "openleague-static", NOW)));
        raw.session.drills[0].drill.ageGroups = ageGroups;
        const result = parsePlan(raw);
        return result.ok ? [] : result.error.issues ?? [];
    };

    it("always writes the groups: known values once each in table order, [] when none", () => {
        const doc = serializePlan(agedInput(["u10", "u8", "u8", "u7"]), "openleague-static", NOW);
        expect(drillRows(doc.session.drills).map((d) => d.drill.ageGroups)).toEqual([["u8", "u10"], []]);
    });

    it("round-trips through parsePlan", () => {
        const doc = serializePlan(agedInput(["u6", "u8"]), "openleague-hosted", NOW);
        expect(parsePlan(JSON.parse(JSON.stringify(doc)))).toEqual({ ok: true, plan: doc });
    });

    it("reads an older file without the key, or with null, as every age", () => {
        const raw = JSON.parse(JSON.stringify(serializePlan(agedInput(["u12"]), "openleague-static", NOW)));
        delete raw.session.drills[0].drill.ageGroups;
        raw.session.drills[1].drill.ageGroups = null;
        const result = parsePlan(raw);
        expect(result.ok && drillRows(result.plan.session.drills).map((d) => d.drill.ageGroups)).toEqual([[], []]);
    });

    it("refuses an unknown value, a repeat or a non-list with a readable Drill N issue", () => {
        expect(issuesFor(["u8", "u7"])).toEqual([`Drill 1 ("Keep-Away"): ${AGE_GROUP_UNKNOWN_MESSAGE}`]);
        expect(issuesFor(["u8", "u8"])).toEqual([`Drill 1 ("Keep-Away"): ${AGE_GROUP_REPEAT_MESSAGE}`]);
        expect(issuesFor("u8")).toEqual([`Drill 1 ("Keep-Away"): ${AGE_GROUPS_LIST_MESSAGE}`]);
    });

    it("carries the groups into the editor mapping", () => {
        const editor = planToEditorSession(serializePlan(agedInput(["u10"]), "openleague-static", NOW));
        expect(editor.plays[0]).toMatchObject({ ageGroups: ["u10"] });
    });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test __tests__/lib/plan-document/document.test.ts`
Expected: FAIL (the drill keys lack `ageGroups`; parse strips it; no issue is reported).

- [ ] **Step 3: Add the field to the document**

In `lib/plan-document/document.ts`, after line 22 (`import { drillTags, … } from "@/lib/utils/drill-tags";`) add:

```ts
import { ageGroupsSchema, toAgeGroups, type AgeGroup } from "@/lib/utils/age-groups";
```

After `goaliesAttendingSchema` (line 123) add:

```ts
/**
 * Drill age groups (ADM-style templates R2). Missing or null is every age:
 * every file written before them. Strict, unlike focus and goalies: an
 * unknown value or a repeat is a broken file, reported as a "Drill N" issue.
 */
const planAgeGroupsSchema = ageGroupsSchema.nullish().transform((groups): AgeGroup[] => groups ?? []);
```

In `planDrillSchema`'s `drill` object (lines 160-166), after `goalies: goaliesSchema,` add:

```ts
        ageGroups: planAgeGroupsSchema,
```

In `PlanDrillInput`, after `goalies?: PlayGoalies;` (line 293) add:

```ts
    /** Absent = none (every age). Unknown values and repeats are dropped on export. */
    ageGroups?: readonly AgeGroup[];
```

In `serializePlan`'s drill (lines 382-387), after `...drillTags(row),` add:

```ts
                ageGroups: toAgeGroups(row.ageGroups),
```

In `PlanEditorDrill`, after `goalies: PlayGoalies;` (line 509) add `    ageGroups: AgeGroup[];`, and in `planToEditorSession`, after `goalies: entry.drill.goalies,` (line 560) add:

```ts
                      ageGroups: entry.drill.ageGroups,
```

- [ ] **Step 4: Run them to verify they pass**

Run: `bun run test __tests__/lib/plan-document/document.test.ts __tests__/lib/data/starter-templates.test.ts`
Expected: PASS (the template round trip included).

- [ ] **Step 5: Write the failing import and export tests**

Append to `__tests__/lib/actions/practice-plan-import.test.ts`:

```ts
describe("importPracticePlan: drill age groups", () => {
    it("stores each drill's groups on the session copy and the library copy", async () => {
        const document = doc({
            drills: [{ sequence: 0, duration: 10, runsWithPrevious: false, instructions: "", name: "Keep-Away", description: "", ageGroups: ["u6", "u8"], playData: BOARD }],
        });
        const result = await importPracticePlan({ teamId: TEAM, date: DATE, addToLibrary: true, document });
        expect(result.success).toBe(true);
        expect(models.play.createMany).toHaveBeenCalled();
        for (const call of models.play.createMany.mock.calls) {
            expect(call[0].data[0]).toMatchObject({ ageGroups: ["u6", "u8"] });
        }
    });
});
```

In `__tests__/components/features/practice-planner/ExportPlanMenu.test.tsx`, inside `describe("buildPlanDocument: goaltender fields", …)`, add:

```ts
    it("writes each drill's age groups, and [] for a drill without them", () => {
        const session: ExportableSession = {
            ...SESSION,
            plays: [
                { ...sessionPlay("Keep-Away", 0), play: { name: "Keep-Away", description: null, playData: createEmptyPlayData(), ageGroups: ["u8", "u6"] } },
                sessionPlay("Weave", 1),
            ],
        };
        expect(drillRows(buildPlanDocument(session, NOW).session.drills).map((d) => d.drill.ageGroups)).toEqual([["u6", "u8"], []]);
    });
```

Run: `bun run test __tests__/lib/actions/practice-plan-import.test.ts __tests__/components/features/practice-planner/ExportPlanMenu.test.tsx`
Expected: FAIL (the import drops the groups; the export row type has no `ageGroups`, so type-check would also fail, and the document gets `[]`).

- [ ] **Step 6: Store on import, write on export**

In `lib/actions/practice-plan-import.ts`, in `drillFields` after `goalies: entry.drill.goalies,` (line 125) add:

```ts
                ageGroups: entry.drill.ageGroups,
```

In `components/features/practice-planner/export/bench-sheet-model.ts`, after line 8 add:

```ts
import type { AgeGroup } from "@/lib/utils/age-groups";
```

and change line 41 to:

```ts
    play: { name: string; description: string | null; playData: PlayData | null; focus?: PlayFocus; goalies?: PlayGoalies; ageGroups?: readonly AgeGroup[] };
```

In `components/features/practice-planner/ExportPlanMenu.tsx`, in `toPlanRows` after `goalies: row.play.goalies,` (line 64) add:

```ts
                  ageGroups: row.play.ageGroups,
```

Run: `bun run test __tests__/lib/actions/practice-plan-import.test.ts __tests__/components/features/practice-planner/ExportPlanMenu.test.tsx`
Expected: PASS.

- [ ] **Step 7: Record the amendment in ADR-0020**

Append after the quarter-ice amendment from Task 1:

```markdown
### 2026-10-05: Drill age groups (one additive field, version stays 1)

Each drill gains `ageGroups`: a list of up to six distinct values from `u6`, `u8`, `u10`, `u12`, `u14` and `u16plus`, in that order. An empty list means the drill suits every age. `PLAN_VERSION` stays 1.

**Rules:**
- Missing or `null` reads as `[]`, so every earlier file reads as before.
- Unlike `focus` and `goalies`, the field is strict: an unknown value, a repeated value or a value that isn't a list is an error, reported as a readable "Drill N" issue, never silently dropped.
- Writers always emit the field (`[]` when none), in the order above.

**Compatibility:**
- A reader built before this amendment strips the key and opens the file with no age groups; a round trip through an older build drops them.
- The static planner's IndexedDB goes from version 3 to 4 with no data change, so a tab still running an older build reloads (`onversionchange`) before it can rewrite a drill without its age groups, or a quarter-ice drill without its area.
- A hosted tab opened before the deploy sends no age groups when it saves a drill, which the server reads as "unchanged".

Spec: `docs/superpowers/specs/2026-10-05-practice-adm-style-templates-design.md`.
```

- [ ] **Step 8: Write the failing static-store tests**

In `__tests__/apps/planner/repos.test.ts`, change line 187 to:

```ts
    it("is version 4", () => expect(DB_VERSION).toBe(4));
```

change line 236 (`expect(await versionOf(factory, "v2-open-tab")).toBe(3);`) to:

```ts
        expect(await versionOf(factory, "v2-open-tab")).toBe(DB_VERSION);
```

and add, after that test (inside the same `describe`):

```ts
    it("makes a tab still open at version 3 (before age groups) reload before this build writes, keeping its data", async () => {
        const factory = new IDBFactory();
        const v3 = await openAt(factory, "v3-open-tab", 3);
        await seed(v3);
        // A build without age groups would rewrite a drill without them: its tab must reload first.
        const reload = vi.fn();
        v3.onversionchange = () => {
            v3.close();
            reload();
        };
        const repo = await openIdbRepo({ factory, name: "v3-open-tab" });
        expect(reload).toHaveBeenCalledTimes(1);
        expect(await repo.read((tx) => tx.getSession("s1"))).toEqual(v1Session);
        expect((await repo.read((tx) => tx.allPlays())).map((p) => p.id).sort()).toEqual(["lib", "p1"]);
        expect(await versionOf(factory, "v3-open-tab")).toBe(4);
        repo.close();
    });
```

Create `__tests__/apps/planner/local-store.age-groups.test.ts`:

```ts
/** Drill age groups in the static store (ADM-style templates R2, R3), against both repos. */
import { describe, expect, it } from "vitest";
import { REPOS, openHarness } from "./store-harness";
import { createLocalPlannerStore } from "@/apps/planner/src/store/local-store";
import type { StoredPlay } from "@/apps/planner/src/store/records";
import { LOCAL_TEAM_ID } from "@/apps/planner/src/config";
import { buildPlanDocument } from "@/components/features/practice-planner/ExportPlanMenu";
import { serializePlan } from "@/lib/plan-document";
import type { ActionResult } from "@/lib/planner-store";
import { AGE_GROUP_REPEAT_MESSAGE, AGE_GROUP_UNKNOWN_MESSAGE, type AgeGroup } from "@/lib/utils/age-groups";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { drillRows } from "@/lib/utils/session-rows";

const T = LOCAL_TEAM_ID;
const QUERY = { teamId: T, isTemplate: true, page: 1, limit: 20, dateFilter: "all" as const };

function data<R>(result: ActionResult<R>): R {
    if (!result.success) throw new Error(result.error);
    return result.data;
}

const drill = (name: string, ageGroups?: AgeGroup[]) => ({
    name,
    playData: createEmptyPlayData(),
    isTemplate: true,
    teamId: T,
    ...(ageGroups && { ageGroups }),
});

describe.each(REPOS)("age groups in the static store (%s)", (_name, open) => {
    async function setup() {
        const h = await openHarness(open);
        return { ...h, store: createLocalPlannerStore(h.repo, h.options) };
    }

    it("stores a new drill's groups in table order, none by default, and refuses bad ones as hosted does", async () => {
        const { store } = await setup();
        const aged = data(await store.createPlay(drill("Keep-Away", ["u8", "u6"])));
        const plain = data(await store.createPlay(drill("Weave")));
        expect(data(await store.getPlayById({ id: aged.id, teamId: T })).ageGroups).toEqual(["u6", "u8"]);
        expect(data(await store.getPlayById({ id: plain.id, teamId: T })).ageGroups).toEqual([]);
        expect(await store.createPlay(drill("Bad", ["u7" as AgeGroup]))).toEqual({ success: false, error: AGE_GROUP_UNKNOWN_MESSAGE });
        expect(await store.createPlay(drill("Twice", ["u8", "u8"]))).toEqual({ success: false, error: AGE_GROUP_REPEAT_MESSAGE });
    });

    it("reads a record saved before age groups as every age, and lists it under any age", async () => {
        const { repo, clock, store } = await setup();
        const legacy: StoredPlay = {
            id: "legacy", name: "Legacy", description: null, thumbnail: null, playData: createEmptyPlayData(), isTemplate: true,
            sessionId: null, sourcePlayId: null, createdAt: clock.now, updatedAt: clock.now,
        };
        await repo.write((tx) => tx.putPlay(legacy));
        expect(data(await store.getPlayById({ id: "legacy", teamId: T })).ageGroups).toEqual([]);
        expect(data(await store.getPlaysByTeam({ ...QUERY, ageGroup: "u16plus" })).plays.map((p) => [p.name, p.ageGroups])).toEqual([["Legacy", []]]);
    });

    it("filters the library by age before paging, untagged drills included", async () => {
        const { store } = await setup();
        await store.createPlay(drill("Keep-Away", ["u6", "u8"]));
        await store.createPlay(drill("4-on-4", ["u12", "u14"]));
        await store.createPlay(drill("Edges"));
        const names = async (ageGroup?: AgeGroup) =>
            data(await store.getPlaysByTeam({ ...QUERY, ...(ageGroup && { ageGroup }) })).plays.map((p) => p.name).sort();
        expect(await names("u8")).toEqual(["Edges", "Keep-Away"]);
        expect(await names("u14")).toEqual(["4-on-4", "Edges"]);
        expect(await names()).toEqual(["4-on-4", "Edges", "Keep-Away"]);
        const page = data(await store.getPlaysByTeam({ ...QUERY, ageGroup: "u8", limit: 1 }));
        expect(page.total).toBe(2);
    });

    it("keeps the groups when an update leaves them out, and replaces them when sent", async () => {
        const { store } = await setup();
        const { id } = data(await store.createPlay(drill("Keep-Away", ["u8"])));
        data(await store.updatePlay({ id, name: "Keep-Away", playData: createEmptyPlayData() }));
        expect(data(await store.getPlayById({ id, teamId: T })).ageGroups).toEqual(["u8"]);
        data(await store.updatePlay({ id, name: "Keep-Away", playData: createEmptyPlayData(), ageGroups: [] }));
        expect(data(await store.getPlayById({ id, teamId: T })).ageGroups).toEqual([]);
        expect(await store.updatePlay({ id, name: "Keep-Away", playData: createEmptyPlayData(), ageGroups: ["u9" as AgeGroup] })).toEqual({
            success: false,
            error: AGE_GROUP_UNKNOWN_MESSAGE,
        });
    });

    it("carries the groups through a session, a fork, the dialog's save, copy to library and duplicate", async () => {
        const { store } = await setup();
        const lib = data(await store.createPlay(drill("Keep-Away", ["u6", "u8"])));
        const session = data(await store.createSession({
            title: "Station night", date: new Date("2026-10-06T19:00:00"), duration: 60,
            plays: [{ playId: lib.id, clientKey: "k1", sequence: 0, runsWithPrevious: false, duration: 10, instructions: "" }],
        }));
        const view = data(await store.getSessionView(session.id));
        expect(drillRows(view.plays)[0].play.ageGroups).toEqual(["u6", "u8"]);
        expect(data(await store.getSessionForEdit(session.id)).initialData.plays[0]).toMatchObject({ ageGroups: ["u6", "u8"] });

        // A fork with no groups sent inherits the library drill's.
        const fork = data(await store.saveSessionDrill({ sessionId: session.id, teamId: T, playId: lib.id, name: "Keep-Away", playData: createEmptyPlayData() }));
        const copied = data(await store.copySessionDrillToLibrary({ playId: fork.playId, teamId: T }));
        expect(data(await store.getPlayById({ id: copied.playId, teamId: T })).ageGroups).toEqual(["u6", "u8"]);

        // Saving the owned drill with new groups changes them; a new drill with none sent has none.
        const owned = drillRows(view.plays)[0].play.id;
        data(await store.saveSessionDrill({ sessionId: session.id, teamId: T, playId: owned, name: "Keep-Away", playData: createEmptyPlayData(), ageGroups: ["u10"] }));
        expect(drillRows(data(await store.getSessionView(session.id)).plays)[0].play.ageGroups).toEqual(["u10"]);
        const fresh = data(await store.saveSessionDrill({ sessionId: session.id, teamId: T, name: "New", playData: createEmptyPlayData() }));
        expect(fresh.playId).toBeTruthy();
        expect(await store.saveSessionDrill({ sessionId: session.id, teamId: T, name: "Bad", playData: createEmptyPlayData(), ageGroups: ["u8", "u8"] })).toEqual({
            success: false,
            error: AGE_GROUP_REPEAT_MESSAGE,
        });

        const duplicate = data(await store.duplicatePracticeSession({ id: session.id, teamId: T, date: new Date("2026-10-13T19:00:00") }));
        expect(drillRows(data(await store.getSessionView(duplicate.id)).plays)[0].play.ageGroups).toEqual(["u10"]);
    });

    it("imports a plan's groups, onto the library copy too, and exports them back", async () => {
        const { store } = await setup();
        const document = serializePlan(
            {
                title: "Station night", durationMinutes: 30, date: null, startTime: null,
                drills: [{ sequence: 0, duration: 10, runsWithPrevious: false, instructions: "", name: "Keep-Away", description: "", ageGroups: ["u6", "u8"], playData: createEmptyPlayData() }],
            },
            "openleague-static",
        );
        const { sessionId } = data(await store.importPlan(document, { date: new Date("2026-10-06T19:00:00"), addToLibrary: true }));
        const view = data(await store.getSessionView(sessionId));
        expect(drillRows(view.plays)[0].play.ageGroups).toEqual(["u6", "u8"]);
        expect(drillRows(buildPlanDocument(view, new Date(), "openleague-static").session.drills)[0].drill.ageGroups).toEqual(["u6", "u8"]);
        expect(data(await store.getPlaysByTeam({ ...QUERY, ageGroup: "u12" })).total).toBe(0);
        expect(data(await store.getPlaysByTeam({ ...QUERY, ageGroup: "u6" })).total).toBe(1);
    });
});
```

Run: `bun run test __tests__/apps/planner/repos.test.ts __tests__/apps/planner/local-store.age-groups.test.ts`
Expected: FAIL (`DB_VERSION` is 3; the store drops and never filters by the groups).

- [ ] **Step 9: Carry the groups through the static store**

In `apps/planner/src/store/records.ts`, change line 6 to:

```ts
import type { PlayFocus, PlayGoalies, SessionRowKind } from "@/types/practice-planner";
import type { AgeGroup } from "@/lib/utils/age-groups";
```

and in `StoredPlay`, after `goalies?: PlayGoalies;` (line 18) add:

```ts
    /** Age groups. Absent on records written before them: read through toAgeGroups() (every age). */
    ageGroups?: AgeGroup[];
```

In `apps/planner/src/store/shared.ts`, after line 3 (`import { GOALIES_ATTENDING_MESSAGE, … } from "@/lib/utils/drill-tags";`) add:

```ts
import { AGE_GROUP_UNKNOWN_MESSAGE, ageGroupsSchema, toAgeGroups, type AgeGroup } from "@/lib/utils/age-groups";
```

In `summary`, after `...drillTags(play),` (line 89) add `        ageGroups: toAgeGroups(play.ageGroups),`, and append at the end of the file:

```ts
/** Hosted's rule (ageGroupsSchema): known values, no repeats; returned in the table's order. */
export function checkedAgeGroups(value: unknown): AgeGroup[] {
    const parsed = ageGroupsSchema.safeParse(value);
    if (!parsed.success) throw new StoreRefusal(parsed.error.issues[0]?.message ?? AGE_GROUP_UNKNOWN_MESSAGE);
    return parsed.data;
}
```

In `apps/planner/src/store/library.ts`, after line 5 add:

```ts
import { matchesAgeGroup, toAgeGroups } from "@/lib/utils/age-groups";
```

add `checkedAgeGroups,` to the `./shared` import list (alphabetical, before `drillText,`), and:
- in `getPlaysByTeam`, after the `goalies` filter (line 69):

  ```ts
                      .filter((p) => matchesAgeGroup(toAgeGroups(p.ageGroups), input.ageGroup ?? null))
  ```
- in `createPlay`, after `...drillTags(input),` (line 105):

  ```ts
                      ageGroups: input.ageGroups === undefined ? [] : checkedAgeGroups(input.ageGroups),
  ```
- in `updatePlay`'s `tags` (lines 122-125), after the `goalies` spread:

  ```ts
                      ...(input.ageGroups !== undefined && { ageGroups: checkedAgeGroups(input.ageGroups) }),
  ```

In `apps/planner/src/store/types.ts`, change line 13 to import `AgeGroup` too:

```ts
import type { PlayData, PlayFocus, PlayGoalies, PracticeSessionData, PracticeSessionView, TeamProfile } from "@/types/practice-planner";
import type { AgeGroup } from "@/lib/utils/age-groups";
```

and add `    ageGroups?: AgeGroup[];` after `goalies?: PlayGoalies;` in `LocalPlayUpdate` (line 58).

In `apps/planner/src/store/sessions.ts`, after line 11 add:

```ts
import { toAgeGroups } from "@/lib/utils/age-groups";
```

add `checkedAgeGroups,` to the `./shared` import (line 64, after `attempt,`), and:
- in the plan export's drill (after `...drillTags(play),`, line 246): `                    ageGroups: toAgeGroups(play?.ageGroups),`
- in `getSessionView`'s `play` (after `...drillTags(play),`, line 410): `                                    ageGroups: toAgeGroups(play.ageGroups),`
- in `getSessionForEdit`'s row (after `...drillTags(play),`, line 448): `                            ageGroups: toAgeGroups(play.ageGroups),`
- in `importPlan`'s `base` (after `goalies: entry.drill.goalies,`, line 682): `                            ageGroups: entry.drill.ageGroups,`
- in `saveSessionDrill`, replace lines 531-563 (from `const thumbnail = thumbnailOrNull(input.thumbnail);` through `const forked: StoredPlay = {` … `createdAt: at,` `};`) with:

  ```ts
                const thumbnail = thumbnailOrNull(input.thumbnail);
                // Absent = unchanged (owned), inherited (fork) or none (new drill). Checked here: nothing
                // but repo calls may run inside the transaction.
                const sentAgeGroups = input.ageGroups === undefined ? undefined : checkedAgeGroups(input.ageGroups);
                const playId = await write(ctx, async (tx) => {
                    const session = await tx.getSession(input.sessionId);
                    if (!session) throw new StoreRefusal(SESSION_NOT_FOUND);
                    const at = ctx.now();
                    const fields = { ...text, thumbnail, playData, updatedAt: at };
                    // Absent = unchanged: only tags the caller sends replace the stored ones.
                    const sent = {
                        ...(input.focus !== undefined && { focus: toPlayFocus(input.focus) }),
                        ...(input.goalies !== undefined && { goalies: toPlayGoalies(input.goalies) }),
                        ...(sentAgeGroups !== undefined && { ageGroups: sentAgeGroups }),
                    };
                    if (!input.playId) {
                        const created: StoredPlay = { id: ctx.newId(), ...fields, ...drillTags(sent), ageGroups: sentAgeGroups ?? [], isTemplate: false, sessionId: session.id, sourcePlayId: null, createdAt: at };
                        await tx.putPlay(created);
                        return created.id;
                    }
                    const play = await tx.getPlay(input.playId);
                    if (!play) throw new StoreRefusal(SESSION_DRILL_REJECTED_MESSAGE);
                    if (play.sessionId === session.id) {
                        await tx.putPlay({ ...play, ...fields, ...sent });
                        return play.id;
                    }
                    if (play.sessionId !== null || !play.isTemplate) throw new StoreRefusal(SESSION_DRILL_REJECTED_MESSAGE);
                    const forked: StoredPlay = {
                        id: ctx.newId(),
                        ...fields,
                        // A fork inherits the library drill's tags and ages unless new ones were sent.
                        ...drillTags({ ...drillTags(play), ...sent }),
                        ageGroups: sentAgeGroups ?? toAgeGroups(play.ageGroups),
                        isTemplate: false,
                        sessionId: session.id,
                        sourcePlayId: play.sourcePlayId ?? play.id,
                        createdAt: at,
                    };
  ```

  (The lines after it, `await tx.putPlay(forked);` through `return ok({ playId });`, stay as they are. `copySessionDrillToLibrary` and `cloneInto` spread the stored play, so they carry `ageGroups` with no edit.)

In `apps/planner/src/store/idb-repo.ts`, replace the versions paragraph of the header comment (lines 10-14) with:

```ts
 * Versions: 1 = the first release; 2 = practice timing rows (a row's playId
 * may be null, block rows carry kind and label); 3 = practice staff (sessions
 * and rows gained optional staff fields); 4 = drill age groups and quarter-ice
 * areas (plays gained an optional ageGroups field and new area values).
 * Bumping the version is what makes a tab still running an older build close
 * its connection and reload (onversionchange below) before this build writes
 * rows it can't read.
```

change line 19 to `export const DB_VERSION = 4;`, and after the `oldVersion < 3` case (line 52) add:

```ts
    if (oldVersion < 4) {
        // Drill age groups and quarter-ice areas: plays only gained an optional field and new
        // area values (older records read as every age), so there is nothing to migrate. The
        // bump makes a tab still running an older build reload before it can save a drill
        // without its age groups or its quarter-ice area.
    }
```

- [ ] **Step 10: Run them to verify they pass**

Run: `bun run test __tests__/apps/planner/repos.test.ts __tests__/apps/planner/local-store.age-groups.test.ts __tests__/apps/planner/local-store.library.test.ts __tests__/apps/planner/local-store.sessions.test.ts __tests__/apps/planner/import-screen.test.tsx __tests__/apps/planner/open-store.test.ts`
Expected: PASS.

- [ ] **Step 11: Type-check, lint and commit**

```bash
bun run type-check
bun run lint
bun run adr:lint
bun run test __tests__/lib/plan-document __tests__/lib/actions/practice-plan-import.test.ts __tests__/components/features/practice-planner/ExportPlanMenu.test.tsx \
  __tests__/components/features/practice-planner/ExportPlanMenu.bench-sheet.test.tsx __tests__/components/features/practice-planner/PlanImportView.test.tsx \
  __tests__/components/features/practice-planner/PlanPreview.test.tsx __tests__/lib/data/starter-templates.test.ts __tests__/apps/planner
```

Expected: all exit 0 and PASS.

```bash
/usr/bin/git add lib/plan-document/document.ts lib/actions/practice-plan-import.ts components/features/practice-planner/export/bench-sheet-model.ts \
  components/features/practice-planner/ExportPlanMenu.tsx docs/adr/0020-exchange-practice-plans-as-a-portable-versioned-document-and-ship-a-static-local.md \
  apps/planner/src/store/records.ts apps/planner/src/store/shared.ts apps/planner/src/store/library.ts apps/planner/src/store/sessions.ts \
  apps/planner/src/store/types.ts apps/planner/src/store/idb-repo.ts \
  __tests__/lib/plan-document/document.test.ts __tests__/lib/actions/practice-plan-import.test.ts \
  __tests__/components/features/practice-planner/ExportPlanMenu.test.tsx __tests__/apps/planner/repos.test.ts __tests__/apps/planner/local-store.age-groups.test.ts
/usr/bin/git commit -m "feat(practice-planner): age groups in plan files and the static store" -m "$SESSION_TRAILER"
```

### Task 4: The starter catalog: age tags, nine small-area drills and three age-group templates

Every starter drill and template gains `ageGroups` (spec R2, success criterion 2); nine original drills and three templates are added (spec R5, success criterion 4). The drill diagrams below were designed against every rule the catalog tests enforce (player spacing, arrow tips, notes, area containment, net direction, goalie markers) and the templates against every template rule (minutes, rotation, overlap, goalie demand), so an implementer pastes them; a failing catalog test means a transcription slip, not a design to rework. Both ways a starter enters a library (hosted "Add to my library", static first-run seeding) copy its ages.

**Rulings this task applies (also in the Self-Review):**
- **A ninth drill.** The spec's 8U template puts four stations on quarters and keeps the goalie station's `stays` pattern, but no starter goalie drill fits a quarter (they all use the centre of a goal line, on the quarters' shared edge). `starter-goalie-quarter-station` is that station: a net on the goal line, level with the bottom faceoff dot. The 10U template uses it too.
- **The 12U block rotates.** The spec's table gives 12U no rotation ("—"), but `starter-templates.test.ts` requires every template to rotate at least one block (`rotates with real rotation`). The three zone stations rotate every 7 minutes, with the goalie staying on angles (a `stays` station needs no rotation of its own).
- **Small-area nets.** A cross-ice game needs nets against the side boards. The catalog test "opens every net toward center ice" (`rotation = x < 100 ? 180 : 0`) is kept for goal-line nets (x 11 or 189) and generalized for every other net: a multiple of 90° whose mouth faces the middle of the drill's area. Every existing net is a goal-line net, so their check is unchanged.
- **Names.** The existing `Small-Area 2-on-2 Battle` keeps its name; the new quarter-ice battle is `Quarter-Ice 2-on-2`. New skater drills use the `starter-skate-` prefix, the two games `starter-game-`, the goalie station `starter-goalie-`.

**Files:**
- Modify: `lib/data/starter-plays.ts` (header comment 12-21; imports 24-38; `StarterPlay` 40-49; helpers after line 95; every drill's `goalies:` line; append nine drills before the closing `];` at line 805)
- Modify: `lib/data/starter-templates.ts` (header 1-10; imports 11-20; `StarterTemplate` 22-28; `practice` 63-87; constants 89-92; `STARTER_TEMPLATES` 94-180)
- Modify: `components/features/practice-planner/PlayLibrary.tsx:539-540` (`handleAddStarter`)
- Modify: `apps/planner/src/store/library.ts:172-173` (`seedStarterDrills`)
- Test (modify): `__tests__/lib/data/starter-plays.test.ts` (lines 103-107 net rule, 138-170 the area map, 226-240 the goalie-drill list and 260-263 the counts break), `__tests__/lib/data/starter-templates.test.ts` (lines 22-29 the three ids, 144-155 verbatim drills), `__tests__/components/features/practice-planner/StarterTemplatePicker.test.tsx` (line 70 counts three templates), `__tests__/components/features/practice-planner/PlayLibrary.filters.test.tsx`, `__tests__/apps/planner/local-store.library.test.ts`
- Existing tests that must stay green unchanged: `__tests__/lib/utils/canvas/line-editing.test.ts`, `__tests__/apps/planner/open-store.test.ts`, `__tests__/apps/planner/app.test.tsx`, `__tests__/apps/planner/import-screen.test.tsx`, `__tests__/components/features/practice-planner/PlanPreview.test.tsx` (it reads templates 0 and 1, which stay first).

**Interfaces:**
- Consumes (Task 1): the quarter presets; (Task 2): `AgeGroup`, `toAgeGroups`; (Task 3): `PlanDrillInput.ageGroups`.
- Produces: `StarterPlay.ageGroups: readonly AgeGroup[]`; `StarterTemplate.ageGroups: readonly AgeGroup[]`; `STARTER_PLAYS` (35 drills) and `STARTER_TEMPLATES` (6 templates; the three new ones last: `template-8u-stations`, `template-10u-stations`, `template-12u-skills-games`).

- [ ] **Step 1: Write the failing catalog tests**

In `__tests__/lib/data/starter-plays.test.ts`, change the imports (lines 5 and 7) to:

```ts
import { areaRect, countElementsOutside } from "@/lib/utils/ice-area";
import { AGE_GROUPS, toAgeGroups } from "@/lib/utils/age-groups";
```

```ts
import { ICE_AREA_PRESETS, PLAY_FOCUS, PLAY_GOALIES, type IceArea } from "@/types/practice-planner";
```

Replace the `"opens every net toward center ice"` test (lines 103-107) with:

```ts
            it("opens goal-line nets toward center ice, and every other net toward the middle of the drill's area", () => {
                const rect = areaRect(play.playData.area);
                const middle = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
                for (const item of play.playData.equipment.filter((e) => e.kind === "net")) {
                    if (item.position.x === 11 || item.position.x === 189) {
                        expect(item.rotation, item.id).toBe(item.position.x < 100 ? 180 : 0);
                        continue;
                    }
                    // A small-area net: square to the boards, its mouth facing the play. The glyph's mouth
                    // faces (-cos θ, -sin θ) (drawEquipmentGlyph draws the back at +x, then rotates).
                    expect([0, 90, 180, 270], item.id).toContain(item.rotation);
                    const θ = (item.rotation * Math.PI) / 180;
                    const facing = -Math.cos(θ) * (middle.x - item.position.x) - Math.sin(θ) * (middle.y - item.position.y);
                    expect(facing, item.id).toBeGreaterThan(0);
                }
            });
```

Add these nine rows to the `EXPECTED` map (after `"starter-skate-stickhandling": "zone-neutral",`):

```ts
        "starter-goalie-quarter-station": "zone-left-bottom",
        "starter-skate-edge-circuit": "zone-left-top",
        "starter-skate-obstacle-lane": "zone-neutral-top",
        "starter-skate-quarter-2v2": "zone-right-bottom",
        "starter-skate-give-and-go": "zone-left-top",
        "starter-skate-quick-release": "zone-right-top",
        "starter-skate-keep-away": "zone-neutral-bottom",
        "starter-game-3v3-cross-ice": "zone-neutral",
        "starter-game-4v4-cross-ice": "zone-right",
```

In the goalie-drill test (lines 226-240), add `"starter-goalie-quarter-station",` to the sorted list (after `"starter-goalie-puck-handling",`) and rename the test `"ships ten goalie drills, every one needing a goalie"`.

Replace the `"ships eight skater fundamentals and 26 starters in all"` test (lines 260-263) with:

```ts
    it("ships fourteen skater drills, two small-area games and 35 starters in all", () => {
        expect(STARTER_PLAYS.filter((p) => p.id.startsWith("starter-skate-")).map((p) => p.focus)).toEqual(Array(14).fill("skaters"));
        expect(STARTER_PLAYS.filter((p) => p.id.startsWith("starter-game-")).map((p) => p.focus)).toEqual(["team", "team"]);
        expect(STARTER_PLAYS).toHaveLength(35);
    });

    it("puts every small-area drill on a quarter-ice or zone preset", () => {
        const small = ["starter-goalie-quarter-station", "starter-skate-edge-circuit", "starter-skate-obstacle-lane", "starter-skate-quarter-2v2",
            "starter-skate-give-and-go", "starter-skate-quick-release", "starter-skate-keep-away", "starter-game-3v3-cross-ice", "starter-game-4v4-cross-ice"];
        for (const id of small) {
            const kind = STARTER_PLAYS.find((p) => p.id === id)?.playData.area?.kind;
            expect(kind && ICE_AREA_PRESETS.includes(kind as (typeof ICE_AREA_PRESETS)[number]) && /^zone-/.test(kind), id).toBe(true);
        }
    });
```

Append a new `describe` at the end of the file:

```ts
describe("Starter age groups (ADM-style templates R2)", () => {
    const AGES: Record<string, string[]> = {
        "starter-breakout-5man": ["u10", "u12", "u14", "u16plus"],
        "starter-3man-weave": ["u10", "u12", "u14", "u16plus"],
        "starter-pp-umbrella": ["u12", "u14", "u16plus"],
        "starter-pk-box": ["u12", "u14", "u16plus"],
        "starter-122-forecheck": ["u12", "u14", "u16plus"],
        "starter-low-cycle": ["u12", "u14", "u16plus"],
        "starter-point-shot-screen": ["u12", "u14", "u16plus"],
        "starter-dzone-coverage": ["u12", "u14", "u16plus"],
        "starter-nz-regroup": ["u12", "u14", "u16plus"],
        "starter-goalie-angles-depth": ["u10", "u12", "u14", "u16plus"],
        "starter-goalie-butterfly-recovery": ["u10", "u12", "u14", "u16plus"],
        "starter-goalie-post-to-post": ["u12", "u14", "u16plus"],
        "starter-goalie-rebound-control": ["u10", "u12", "u14", "u16plus"],
        "starter-goalie-screens": ["u12", "u14", "u16plus"],
        "starter-goalie-puck-handling": ["u12", "u14", "u16plus"],
        "starter-goalie-breakaways": ["u10", "u12", "u14", "u16plus"],
        "starter-goalie-warmup": [],
        "starter-goalie-crease-pattern": ["u10", "u12", "u14", "u16plus"],
        "starter-skate-edges-crossovers": [],
        "starter-skate-transitions": [],
        "starter-skate-passing-lanes": ["u10", "u12", "u14", "u16plus"],
        "starter-skate-wrist-shots": [],
        "starter-skate-puck-protection": [],
        "starter-skate-small-area-2v2": [],
        "starter-skate-stops-starts": [],
        "starter-skate-stickhandling": [],
        "starter-goalie-quarter-station": ["u8", "u10", "u12"],
        "starter-skate-edge-circuit": ["u6", "u8", "u10"],
        "starter-skate-obstacle-lane": ["u6", "u8", "u10"],
        "starter-skate-quarter-2v2": [],
        "starter-skate-give-and-go": ["u10", "u12", "u14"],
        "starter-skate-quick-release": ["u10", "u12", "u14", "u16plus"],
        "starter-skate-keep-away": ["u6", "u8", "u10"],
        "starter-game-3v3-cross-ice": [],
        "starter-game-4v4-cross-ice": ["u10", "u12", "u14", "u16plus"],
    };

    it("tags every starter, leaving drills that suit every age untagged", () => {
        expect(Object.fromEntries(STARTER_PLAYS.map((p) => [p.id, [...p.ageGroups]]))).toEqual(AGES);
    });

    it("uses known groups, once each, in age order", () => {
        for (const play of STARTER_PLAYS) {
            expect(play.ageGroups.every((group) => (AGE_GROUPS as readonly string[]).includes(group)), play.id).toBe(true);
            expect(toAgeGroups(play.ageGroups), play.id).toEqual([...play.ageGroups]);
        }
    });

    it("has a drill for every age group", () => {
        for (const group of AGE_GROUPS) {
            expect(STARTER_PLAYS.some((p) => p.ageGroups.includes(group)), group).toBe(true);
        }
    });
});
```

In `__tests__/lib/data/starter-templates.test.ts`, change the imports to add:

```ts
import { areaRect } from "@/lib/utils/ice-area";
import { toAgeGroups } from "@/lib/utils/age-groups";
```

Replace the `"ships three templates …"` test (lines 22-29) with:

```ts
    it("ships six templates with stable unique ids and names, the age-group templates last", () => {
        expect(STARTER_TEMPLATES.map((t) => t.id)).toEqual([
            "template-skills-stations",
            "template-goalie-skater-rotation",
            "template-team-stations",
            "template-8u-stations",
            "template-10u-stations",
            "template-12u-skills-games",
        ]);
        expect(new Set(STARTER_TEMPLATES.map((t) => t.name)).size).toBe(6);
    });

    it("tags every template with its own age groups (never derived from its drills)", () => {
        expect(Object.fromEntries(STARTER_TEMPLATES.map((t) => [t.id, [...t.ageGroups]]))).toEqual({
            "template-skills-stations": ["u10", "u12", "u14", "u16plus"],
            "template-goalie-skater-rotation": ["u10", "u12", "u14", "u16plus"],
            "template-team-stations": ["u12", "u14", "u16plus"],
            "template-8u-stations": ["u6", "u8"],
            "template-10u-stations": ["u10"],
            "template-12u-skills-games": ["u12", "u14"],
        });
        for (const template of STARTER_TEMPLATES) expect(toAgeGroups(template.ageGroups)).toEqual([...template.ageGroups]);
    });

    it.each(["template-8u-stations", "template-10u-stations", "template-12u-skills-games"])("%s fills 60 minutes exactly", (id) => {
        const template = STARTER_TEMPLATES.find((t) => t.id === id);
        if (!template) throw new Error(`${id} is missing`);
        expect(template.session.durationMinutes).toBe(60);
        expect(sessionWallMinutes(template.session.drills, template.session.transitionMinutes)).toBe(60);
    });

    it("puts the station blocks on quarters and zones as the spec lays them out", () => {
        const stationAreas = (id: string) => {
            const template = STARTER_TEMPLATES.find((t) => t.id === id);
            const block = groupStations(template?.session.drills ?? []).find((group) => group.stations.length > 1);
            return drillRows(block?.stations ?? []).map((row) => row.playData?.area?.kind);
        };
        expect(stationAreas("template-8u-stations")).toEqual(["zone-left-bottom", "zone-left-top", "zone-neutral-top", "zone-right-bottom"]);
        expect(stationAreas("template-10u-stations")).toEqual(["zone-left-bottom", "zone-left-top", "zone-right-top", "zone-neutral"]);
        expect(stationAreas("template-12u-skills-games")).toEqual(["zone-left", "zone-neutral", "zone-right"]);
        // Each quarter is half a zone's height.
        expect(areaRect({ kind: "zone-left-top" }).h).toBe(42.5);
    });
```

Inside the `describe.each` block, in `"uses starter drills verbatim"`, add `ageGroups: [...starter!.ageGroups],` to the `toMatchObject` object (after `goalies: starter!.goalies,`).

In `__tests__/components/features/practice-planner/StarterTemplatePicker.test.tsx`, change line 68-70 to:

```ts
        // Skills Stations 2 + 3 + 1 + 1 + 1 drills, Goalie & Skater 3 + 3 + 1 + 1, Team Practice 1 + 3 + 3 + 1 + 1,
        // then the 8U, 10U and 12U templates 4 + 1 each, and 3 + 1 + 1; block rows (warm-up, break, cool-down) never count.
        expect(chips).toEqual(["8 drills", "8 drills", "9 drills", "5 drills", "5 drills", "5 drills"]);
```

In `__tests__/components/features/practice-planner/PlayLibrary.filters.test.tsx`, add to `"copies a starter with its tags"` a second expectation:

```ts
        expect(store.createPlay.mock.calls[0][0].ageGroups).toEqual([]);
```

and add a test after it:

```ts
    it("copies a starter's age groups", async () => {
        const { store } = renderLibrary([]);
        store.createPlay.mockResolvedValue({ success: true, data: { id: "cnewxxxxxxxxxxxxxxxxxxxxx", name: "Keep-Away in a Box", isTemplate: true } });
        await screen.findByText("Keep-Away in a Box");
        fireEvent.click(within(cardOf("Keep-Away in a Box")).getByRole("button", { name: /Add to my library/ }));
        await waitFor(() => expect(store.createPlay).toHaveBeenCalledWith(expect.objectContaining({ name: "Keep-Away in a Box", ageGroups: ["u6", "u8", "u10"] })));
    });
```

In `__tests__/apps/planner/local-store.library.test.ts`, add a test inside `describe.each(REPOS)("library (%s)", …)`:

```ts
    it("seeds each starter with its age groups", async () => {
        const { library } = await setup();
        await library.seedStarterDrills();
        const page = await library.getPlaysByTeam({ ...QUERY, limit: 100, search: "Keep-Away in a Box" });
        const id = page.success ? page.data.plays[0]?.id : undefined;
        const read = id ? await library.getPlayById({ id, teamId: LOCAL_TEAM_ID }) : null;
        expect(read?.success && read.data.ageGroups).toEqual(["u6", "u8", "u10"]);
    });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test __tests__/lib/data __tests__/components/features/practice-planner/StarterTemplatePicker.test.tsx __tests__/components/features/practice-planner/PlayLibrary.filters.test.tsx __tests__/apps/planner/local-store.library.test.ts`
Expected: FAIL (no `ageGroups` on starters or templates, nine drills and three templates missing).

- [ ] **Step 3: Tag the starters and add the helpers**

In `lib/data/starter-plays.ts`:

Add two bullets to the header comment, after the "Every drill is tagged (focus, goalies)…" bullet (line 21):

```ts
 * - Every drill carries age groups (ADM-style templates); [] means it suits
 *   every age
 * - Small-area nets sit off the goal lines, square to the boards, with their
 *   mouth facing the middle of the drill's area
```

Change the imports to add the `AgeGroup` type (after line 38):

```ts
import type { AgeGroup } from "@/lib/utils/age-groups";
```

In `StarterPlay`, after `goalies: PlayGoalies;` (line 47) add:

```ts
    /** [] = every age (ADM-style templates R2) */
    ageGroups: readonly AgeGroup[];
```

After `const rightNet = …` (line 95) add:

```ts
/** A net on a goal line at height `y`, opening toward center ice. */
const goalLineNet = (id: string, x: 11 | 189, y: number) => gear("net", id, x, y, x === 11 ? 180 : 0);
/** A small-area net off the goal lines: rotation 90 opens toward the top boards, 270 toward the bottom, 180 toward the right end. */
const smallNet = (id: string, x: number, y: number, rotation: 90 | 180 | 270) => gear("net", id, x, y, rotation);
```

Then, for each of the 26 existing drills, add one line after its `goalies: "…",` line with the value from this table (each `goalies:` line appears once per drill, at 8 spaces):

| id | line to add |
|---|---|
| `starter-breakout-5man`, `starter-3man-weave` | `        ageGroups: ["u10", "u12", "u14", "u16plus"],` |
| `starter-pp-umbrella`, `starter-pk-box`, `starter-122-forecheck`, `starter-low-cycle`, `starter-point-shot-screen`, `starter-dzone-coverage`, `starter-nz-regroup` | `        ageGroups: ["u12", "u14", "u16plus"],` |
| `starter-goalie-angles-depth`, `starter-goalie-butterfly-recovery`, `starter-goalie-rebound-control`, `starter-goalie-breakaways`, `starter-goalie-crease-pattern` | `        ageGroups: ["u10", "u12", "u14", "u16plus"],` |
| `starter-goalie-post-to-post`, `starter-goalie-screens`, `starter-goalie-puck-handling` | `        ageGroups: ["u12", "u14", "u16plus"],` |
| `starter-skate-passing-lanes` | `        ageGroups: ["u10", "u12", "u14", "u16plus"],` |
| `starter-goalie-warmup`, `starter-skate-edges-crossovers`, `starter-skate-transitions`, `starter-skate-wrist-shots`, `starter-skate-puck-protection`, `starter-skate-small-area-2v2`, `starter-skate-stops-starts`, `starter-skate-stickhandling` | `        ageGroups: [],` |

- [ ] **Step 4: Add the nine drills**

In `lib/data/starter-plays.ts`, insert before the final `];` (after the `starter-skate-stickhandling` entry):

```ts
    {
        id: "starter-goalie-quarter-station",
        name: "Goalie Station: Track, Set, Save",
        description:
            "A goalie station in one quarter of the ice that stays put while the skater groups rotate. Set a net on the goal line, level with the bottom faceoff dot. A helper passes to the coach, so the goalie follows the pass, squares up and sets before the coach shoots from the slot. Start with shots to the body, then low to each pad. Teach: eyes on the puck, short shuffles, stick on the ice, glove up, and back to the feet after every save. Young players can take turns in net.",
        focus: "goalies",
        goalies: "required",
        ageGroups: ["u8", "u10", "u12"],
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                goalie("gq-g", 17, 64.5),
                coach("gq-c", 42, 64.5),
                player("gq-h1", "H1", 34, 50),
                player("gq-h2", "H2", 34, 79),
            ],
            drawings: [
                pass("gq-pass1", [37, 54], [39, 57.5]),
                pass("gq-pass2", [37, 75], [39.5, 71]),
                lateral("gq-track", [21, 58], [21, 71]),
                shot("gq-shot", [36, 64.5], [24, 64.5]),
            ],
            equipment: [goalLineNet("gq-net", 11, 64.5), pucks("gq-pucks", 52, 64.5)],
            annotations: [note("gq-note", "Square up", 44, 83, "#000000", 5)],
            area: { kind: "zone-left-bottom" },
        },
    },
    {
        id: "starter-skate-edge-circuit",
        name: "Edge Circuit: Circle and Cones",
        description:
            "Edge work in one quarter of the ice. Skate forward crossovers all the way around the faceoff circle, then carve through the line of cones on deep inside and outside edges and rejoin the line. Teach: knees bent, a full push from the outside leg, the inside foot crossing over, shoulders level, eyes up. Change direction every other turn so both edges work, and add a puck once the pattern is easy. 8–10 min.",
        focus: "skaters",
        goalies: "none",
        ageGroups: ["u6", "u8", "u10"],
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                player("ci-s1", "S1", 55, 33),
                player("ci-s2", "S2", 55, 20.5),
                player("ci-s3", "S3", 60, 8),
            ],
            drawings: [
                skate("ci-entry", [50, 31], [47.5, 27]),
                lateral("ci-circle", [47, 24], [42.3, 31.8], [31, 36.5], [19.7, 31.8], [15, 20.5], [19.7, 9.2], [31, 4.5], [42.3, 9.2], [46, 15]),
                skate("ci-weave", [64, 6], [73, 12], [66, 24], [73, 36], [68, 40]),
            ],
            equipment: [cone("ci-cone1", 69.5, 12), cone("ci-cone2", 69.5, 24), cone("ci-cone3", 69.5, 36)],
            annotations: [],
            area: { kind: "zone-left-top" },
        },
    },
    {
        id: "starter-skate-obstacle-lane",
        name: "Obstacle Lane: Puck Control",
        description:
            "A lane of cones and a tire across one quarter of the ice. Carry the puck through the lane, weaving above and below each obstacle, finish around the last cone, pass back to the next skater and join the line. Teach: soft hands, the puck in the middle of the blade, small quick steps, and eyes up between obstacles (glance down, don't stare). Progress to backhand only, then one hand on the stick. 8–10 min.",
        focus: "skaters",
        goalies: "none",
        ageGroups: ["u6", "u8", "u10"],
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                player("ol-s1", "S1", 80, 36),
                player("ol-s2", "S2", 93, 36),
                player("ol-s3", "S3", 106, 36),
            ],
            drawings: [
                carry("ol-carry", [80, 30], [86, 11], [96, 27], [106, 11], [116, 27], [121, 19]),
                pass("ol-pass", [119, 24], [100, 31]),
                skate("ol-next", [93, 30], [84, 26]),
            ],
            equipment: [
                cone("ol-cone1", 86, 19),
                cone("ol-cone2", 96, 19),
                gear("tire", "ol-tire", 106, 19),
                cone("ol-cone3", 116, 19),
                pucks("ol-pucks", 78, 8),
            ],
            annotations: [],
            area: { kind: "zone-neutral-top" },
        },
    },
    {
        id: "starter-skate-quarter-2v2",
        name: "Quarter-Ice 2-on-2",
        description:
            "Two on two in one quarter of the ice, with a small net at each end. The coach spots a puck; the pair that wins it attacks the far net and the other pair defends, and every change of possession flips the direction. 30-second shifts, then the next four go. Attackers: support the puck carrier and get open. Defenders: stick on the puck, body between the puck and the net. Keep score. 8–10 min.",
        focus: "skaters",
        goalies: "none",
        ageGroups: [],
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                player("q2-f1", "F1", 150, 55),
                player("q2-f2", "F2", 158, 76),
                player("q2-o1", "O1", 166, 60, "them"),
                player("q2-o2", "O2", 146, 72, "them"),
                coach("q2-c", 130, 80),
            ],
            drawings: [
                pass("q2-pass", [135, 79], [150, 78]),
                carry("q2-carry", [162, 75], [172, 74], [178, 70]),
                shot("q2-shot", [179, 69], [185, 66.5]),
                skate("q2-f1-route", [154, 58], [166, 50]),
            ],
            equipment: [goalLineNet("q2-net-right", 189, 64.5), smallNet("q2-net-left", 136, 64.5, 180), pucks("q2-pucks", 128, 82)],
            annotations: [],
            area: { kind: "zone-right-bottom" },
        },
    },
    {
        id: "starter-skate-give-and-go",
        name: "Give-and-Go Triangle",
        description:
            "Three skaters in one quarter of the ice. S1 passes to S2, skates hard around the cone and gets the puck straight back, then carries to S3, who starts the next give-and-go. Teach: pass to the target, then move at once; the receiver shows a target with the stick on the ice; the return pass leads the skater; heads up before every pass. Switch direction after every few turns. 8–10 min.",
        focus: "skaters",
        goalies: "none",
        ageGroups: ["u10", "u12", "u14"],
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                player("gg-s1", "S1", 20, 32),
                player("gg-s2", "S2", 46, 8),
                player("gg-s3", "S3", 62, 30),
            ],
            drawings: [
                pass("gg-pass1", [25, 28], [40, 13]),
                skate("gg-s1-route", [26, 34], [36, 30], [44, 22]),
                pass("gg-pass2", [47, 14], [48, 24]),
                carry("gg-carry", [49, 26], [55, 30]),
            ],
            equipment: [cone("gg-cone", 34, 22), pucks("gg-pucks", 12, 36)],
            annotations: [],
            area: { kind: "zone-left-top" },
        },
    },
    {
        id: "starter-skate-quick-release",
        name: "Quick-Release Shooting",
        description:
            "A coach passes from the corner; the shooter takes it in stride at the top of the circle and shoots in one motion, without stopping the puck first. Two lines take turns. Teach: catch the pass in front of the body with soft hands, keep the puck moving toward the release, move the weight onto the front foot, and pick a corner before the pass arrives. Shoot at an empty net or targets unless a goalie is free. 8–10 min.",
        focus: "skaters",
        goalies: "optional",
        ageGroups: ["u10", "u12", "u14", "u16plus"],
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                player("qr-s1", "S1", 140, 12),
                player("qr-s2", "S2", 140, 30),
                coach("qr-c", 176, 37),
            ],
            drawings: [
                pass("qr-pass", [171, 36], [156, 30]),
                skate("qr-s2-route", [146, 30], [154, 28]),
                shot("qr-shot", [157, 27], [182, 21.5]),
                skate("qr-s1-next", [146, 13], [152, 16]),
            ],
            equipment: [goalLineNet("qr-net", 189, 20.5), pucks("qr-pucks", 184, 38)],
            annotations: [],
            area: { kind: "zone-right-top" },
        },
    },
    {
        id: "starter-skate-keep-away",
        name: "Keep-Away in a Box",
        description:
            "Three skaters keep the puck away from two inside a box of cones. Every completed pass is a point; when a defender touches the puck, the skater who lost it swaps in as a defender. 30-second rounds. Teach: move to open ice right after passing, show a target with the stick, and shield the puck with the body when pressured. Run one game in each quarter of the ice so everyone plays. 12–15 min.",
        focus: "skaters",
        goalies: "none",
        ageGroups: ["u6", "u8", "u10"],
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                player("ka-f1", "F1", 84, 52),
                player("ka-f2", "F2", 114, 54),
                player("ka-f3", "F3", 100, 76),
                player("ka-o1", "O1", 96, 60, "them"),
                player("ka-o2", "O2", 110, 66, "them"),
            ],
            drawings: [
                pass("ka-pass1", [87, 57], [96, 70]),
                pass("ka-pass2", [104, 72], [115, 61]),
                skate("ka-f1-route", [83, 58], [82, 66]),
                opponentRoute("ka-o1-route", [99, 64], [102, 70]),
            ],
            equipment: [cone("ka-cone1", 78, 46), cone("ka-cone2", 122, 46), cone("ka-cone3", 122, 82), cone("ka-cone4", 78, 82)],
            annotations: [],
            area: { kind: "zone-neutral-bottom" },
        },
    },
    {
        id: "starter-game-3v3-cross-ice",
        name: "3-on-3 Cross-Ice Game",
        description:
            "Three on three across the neutral zone, with a small net against each side boards. Play keeps going after a goal: the coach spots a new puck at once. Shifts of 30–40 seconds, then the next three from each team jump on. Teach: move to open ice after every pass, support the puck carrier from below, and come back to the net to defend. 7–10 min.",
        focus: "team",
        goalies: "none",
        ageGroups: [],
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                player("c3-f1", "F1", 88, 30),
                player("c3-f2", "F2", 112, 36),
                player("c3-f3", "F3", 96, 56),
                player("c3-o1", "O1", 106, 22, "them"),
                player("c3-o2", "O2", 88, 46, "them"),
                player("c3-o3", "O3", 114, 58, "them"),
            ],
            drawings: [
                pass("c3-pass", [90, 35], [95, 49]),
                carry("c3-carry", [100, 60], [106, 68]),
                shot("c3-shot", [107, 70], [102, 76]),
                skate("c3-f2-route", [112, 42], [116, 46]),
                opponentRoute("c3-o2-route", [88, 52], [93, 62]),
            ],
            equipment: [smallNet("c3-net-top", 100, 6, 270), smallNet("c3-net-bottom", 100, 79, 90), pucks("c3-pucks", 122, 42.5)],
            annotations: [],
            area: { kind: "zone-neutral" },
        },
    },
    {
        id: "starter-game-4v4-cross-ice",
        name: "4-on-4 Cross-Ice Game",
        description:
            "Four on four across one end zone, with a net against each side boards. Lines change on the whistle every 45 seconds, and the coach spots a new puck whenever one leaves the zone. Play fast: support the puck in threes, use the back player to switch sides, and get a body to the net on every shot. Run a second game in the other end zone if numbers allow. 15–20 min.",
        focus: "team",
        goalies: "optional",
        ageGroups: ["u10", "u12", "u14", "u16plus"],
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                player("c4-f1", "F1", 142, 52),
                player("c4-f2", "F2", 180, 56),
                player("c4-f3", "F3", 160, 64),
                player("c4-d1", "D1", 152, 30),
                player("c4-o1", "O1", 165, 48, "them"),
                player("c4-o2", "O2", 144, 68, "them"),
                player("c4-o3", "O3", 176, 70, "them"),
                player("c4-o4", "O4", 170, 22, "them"),
            ],
            drawings: [
                pass("c4-pass", [150, 36], [144, 45]),
                carry("c4-carry", [146, 56], [153, 68]),
                shot("c4-shot", [156, 70], [161, 75]),
                skate("c4-f3-route", [164, 68], [166, 74]),
                skate("c4-d1-route", [156, 34], [160, 40]),
            ],
            equipment: [smallNet("c4-net-top", 162.5, 8, 270), smallNet("c4-net-bottom", 162.5, 77, 90), pucks("c4-pucks", 128, 42.5)],
            annotations: [],
            area: { kind: "zone-right" },
        },
    },
```

- [ ] **Step 5: Tag the templates and add the three new ones**

In `lib/data/starter-templates.ts`:

Change the header's first sentence (lines 2-5) to:

```ts
 * Starter practice templates (goaltender-aware drills, spec R10; practice
 * timing, spec R12; ADM-style templates, spec R5): station practices built
 * from starter drills. Each opens with a warm-up drill or block, closes with a
 * cool-down, and rotates its skater groups through station blocks while the
 * goalie station stays put. Each carries its own age groups.
```

After line 20 (`import type { BlockKind } from "@/types/practice-planner";`) add:

```ts
import type { AgeGroup } from "@/lib/utils/age-groups";
```

In `StarterTemplate`, after `description: string;` add:

```ts
    /** The template's own ages ([] = every age); never derived from its drills (R2). */
    ageGroups: readonly AgeGroup[];
```

In `practice`, after `goalies: play.goalies,` (line 79) add:

```ts
                ageGroups: play.ageGroups,
```

After `const COACH_FIVE_SPOTS = …` (line 92) add:

```ts
/** Who shoots at the quarter-ice goalie station that stays. */
const COACH_SHOOTS_QUARTER = "A coach shoots; a helper feeds the passes.";
```

Add `ageGroups` to each existing template, after its `description`:
- `template-skills-stations`: `        ageGroups: ["u10", "u12", "u14", "u16plus"],`
- `template-goalie-skater-rotation`: `        ageGroups: ["u10", "u12", "u14", "u16plus"],`
- `template-team-stations`: `        ageGroups: ["u12", "u14", "u16plus"],`

Then append the three new templates before the closing `];` of `STARTER_TEMPLATES` (after `template-team-stations`):

```ts
    {
        id: "template-8u-stations",
        name: "8U Station Practice",
        description:
            "A 60-minute, station-based, ADM-style practice for 6U and 8U: a warm-up, then four stations in the quarters of the ice where the goalie stays in net while three skater groups rotate between edges, puck control and 2-on-2 battles every 10 minutes, a water break, keep-away games in every quarter, and a cool-down.",
        ageGroups: ["u6", "u8"],
        session: practice("8U Station Practice", 60, 0, [
            { block: "warmup", minutes: 8, note: "Easy laps with a puck, then a few starts and stops." },
            {
                rotateEveryMinutes: 10,
                stations: [
                    { drill: "starter-goalie-quarter-station", minutes: 30, stays: true, instructions: COACH_SHOOTS_QUARTER },
                    { drill: "starter-skate-edge-circuit", minutes: 10 },
                    { drill: "starter-skate-obstacle-lane", minutes: 10 },
                    { drill: "starter-skate-quarter-2v2", minutes: 10 },
                ],
            },
            { block: "break", minutes: 2 },
            { stations: [{ drill: "starter-skate-keep-away", minutes: 15, instructions: "One game in each quarter of the ice." }] },
            { block: "cooldown", minutes: 5, note: "Easy laps, then a stretch." },
        ]),
    },
    {
        id: "template-10u-stations",
        name: "10U Station Practice",
        description:
            "A 60-minute, station-based, ADM-style practice for 10U: a warm-up, then four stations where the goalie stays in net in one quarter while three skater groups rotate between a give-and-go passing triangle, quick-release shooting and a 3-on-3 cross-ice game every 10 minutes, a water break, small-area 2-on-2 battles and a cool-down.",
        ageGroups: ["u10"],
        session: practice("10U Station Practice", 60, 0, [
            { block: "warmup", minutes: 10, note: "Laps with a puck, edges on the circles, then a few hard starts." },
            {
                rotateEveryMinutes: 10,
                stations: [
                    { drill: "starter-goalie-quarter-station", minutes: 30, stays: true, instructions: COACH_SHOOTS_QUARTER },
                    { drill: "starter-skate-give-and-go", minutes: 10 },
                    { drill: "starter-skate-quick-release", minutes: 10 },
                    { drill: "starter-game-3v3-cross-ice", minutes: 10 },
                ],
            },
            { block: "break", minutes: 3 },
            { stations: [{ drill: "starter-skate-small-area-2v2", minutes: 12, instructions: SMALL_AREA }] },
            { block: "cooldown", minutes: 5, note: "Easy laps, then a stretch." },
        ]),
    },
    {
        id: "template-12u-skills-games",
        name: "12U Skills and Small Games",
        description:
            "A 60-minute, station-based, ADM-style practice for 12U and 14U: a warm-up, then three zone stations where the goalie stays on angles while two skater groups rotate between a 3-on-3 cross-ice game and wrist shots every 7 minutes, partner passing the length of the ice, a 4-on-4 cross-ice game and a cool-down, with a minute between blocks.",
        ageGroups: ["u12", "u14"],
        session: practice("12U Skills and Small Games", 60, 1, [
            { block: "warmup", minutes: 8, note: "Laps with a puck, then crossovers around every circle." },
            {
                rotateEveryMinutes: 7,
                stations: [
                    { drill: "starter-goalie-angles-depth", minutes: 14, stays: true, instructions: COACH_FIVE_SPOTS },
                    { drill: "starter-game-3v3-cross-ice", minutes: 7 },
                    { drill: "starter-skate-wrist-shots", minutes: 7, instructions: EMPTY_NET },
                ],
            },
            { stations: [{ drill: "starter-skate-passing-lanes", minutes: 8 }] },
            { stations: [{ drill: "starter-game-4v4-cross-ice", minutes: 20, instructions: "Two games, one in each end zone; the goalie plays in one of them." }] },
            { block: "cooldown", minutes: 6, note: "Easy laps, then a stretch." },
        ]),
    },
```

(The wall clock: 8U 8 + 30 + 2 + 15 + 5; 10U 10 + 30 + 3 + 12 + 5; 12U 8 + 14 + 8 + 20 + 6 plus five 1-minute gaps. Each block that holds stations has exactly one drill that needs a goalie, with one goalie marker, so `goalieWarnings` reports nothing for the one goalie every template is built for.)

- [ ] **Step 6: Copy a starter's ages into a library**

In `components/features/practice-planner/PlayLibrary.tsx`, in `handleAddStarter`'s `store.createPlay({ … })` call, after `goalies: starter.goalies,` (line 540) add:

```ts
                    ageGroups: [...starter.ageGroups],
```

In `apps/planner/src/store/library.ts`, in `seedStarterDrills`, after `goalies: starter.goalies,` (line 173) add:

```ts
                        ageGroups: [...starter.ageGroups],
```

- [ ] **Step 7: Run the catalog suites to verify they pass**

Run: `bun run test __tests__/lib/data __tests__/components/features/practice-planner/StarterTemplatePicker.test.tsx __tests__/components/features/practice-planner/PlayLibrary.filters.test.tsx __tests__/apps/planner/local-store.library.test.ts __tests__/lib/utils/canvas/line-editing.test.ts __tests__/apps/planner/open-store.test.ts __tests__/apps/planner/app.test.tsx __tests__/apps/planner/import-screen.test.tsx __tests__/components/features/practice-planner/PlanPreview.test.tsx`
Expected: PASS. Every per-drill rule in `starter-plays.test.ts` (spacing, tips, notes, nets, goalie markers, areas) and every per-template rule in `starter-templates.test.ts` (minutes, rotation text, overlap, goalie demand, verbatim drills) runs over the new entries.

- [ ] **Step 8: Check the content for third-party names**

```bash
rg -n -i '\busa\b|development model|\badm\b|governing body' lib/data/starter-plays.ts lib/data/starter-templates.ts
```

Expected: only the three template descriptions' "ADM-style" (the descriptive use spec R5 allows). Nothing else: no organization, program, logo or third-party drill name (Global Constraints, "Original content only").

- [ ] **Step 9: Type-check and commit**

```bash
bun run type-check
```

Expected: exit 0.

```bash
/usr/bin/git add lib/data/starter-plays.ts lib/data/starter-templates.ts components/features/practice-planner/PlayLibrary.tsx apps/planner/src/store/library.ts \
  __tests__/lib/data/starter-plays.test.ts __tests__/lib/data/starter-templates.test.ts \
  __tests__/components/features/practice-planner/StarterTemplatePicker.test.tsx __tests__/components/features/practice-planner/PlayLibrary.filters.test.tsx \
  __tests__/apps/planner/local-store.library.test.ts
/usr/bin/git commit -m "feat(practice-planner): age-tagged starters, nine small-area drills and 8U/10U/12U station templates" -m "$SESSION_TRAILER"
```

### Task 5: The age filter: remembered choice, library, drill picker and template picker

One shared chip row and one remembered choice (spec R3, success criterion 3). `useAgeFilter` keeps the choice under `AGE_FILTER_STORAGE_KEY` through `useSyncExternalStore`, with All ages as the server snapshot and an in-page fallback when storage throws. `PlayLibrary` (the library in both apps, and the session editor's drill picker in `select` mode) adds the age to its query and its starter cards, shows the empty state, and from now on drops any load answer that isn't the latest (Review Focus 2). `StarterTemplatePicker` filters the templates and shows each template's ages. A drill picked from the library keeps its ages on the session card.

**Files:**
- Create: `components/features/practice-planner/useAgeFilter.ts`, `components/features/practice-planner/AgeFilter.tsx`
- Modify: `components/features/practice-planner/PlayLibrary.tsx` (line numbers are as they stand after Task 4: imports 57-59; `NAMES_PAGE_SIZE` 61-62; state 369-370; `loadPlays` 426-465; the three loaders that pass `filters` at 471, 478-479, 552 and 563, 687 and 699; `visibleStarters` 519-523; `handleFiltersChange` 587-590; `handleSelectPlay` 614; the filter box 781-784; the empty state 807-839)
- Modify: `components/features/practice-planner/StarterTemplatePicker.tsx`
- Modify: `components/features/practice-planner/PracticeSessionEditor.tsx:564` (one line; the file stays at 806 lines)
- Test (create): `__tests__/components/features/practice-planner/AgeFilter.test.tsx`, `__tests__/components/features/practice-planner/useAgeFilter.test.tsx`, `__tests__/components/features/practice-planner/useAgeFilter.blocked.test.tsx`, `__tests__/components/features/practice-planner/PlayLibrary.age-filter.test.tsx`
- Test (modify): `__tests__/components/features/practice-planner/StarterTemplatePicker.test.tsx`, `__tests__/components/features/practice-planner/PracticeSessionEditor.drill-tags.test.tsx`
- Existing tests that must stay green unchanged: `__tests__/components/features/practice-planner/PlayLibrary.test.tsx`, `PlayLibrary.filters.test.tsx`, `PlayLibrary.portable.test.tsx`, `PlanImportView.test.tsx`, `PracticeSessionEditor.line-budget.test.ts`, `__tests__/apps/planner/import-screen.test.tsx`, `__tests__/apps/planner/app.test.tsx`. None of them chooses an age, so their queries carry no `ageGroup`; every new test file clears `localStorage` before and after each test so a remembered age never leaks between tests.

**Interfaces:**
- Consumes (Task 2): `AGE_GROUPS`, `AGE_GROUP_LABELS`, `ALL_AGES_LABEL`, `SHOW_ALL_AGES_LABEL`, `AGE_FILTER_GROUP_LABEL`, `AGE_FILTER_STORAGE_KEY`, `toAgeGroup`, `matchesAgeGroup`, `formatAgeGroups`, `noAgeMatchMessage`, `type AgeGroup`, `LibraryQuery.ageGroup`, `SavedPlay.ageGroups`; (Task 4): `StarterPlay.ageGroups`, `StarterTemplate.ageGroups`.
- Produces, from `useAgeFilter.ts`: `useAgeFilter(): [AgeGroup | null, (value: AgeGroup | null) => void]`, `setAgeFilter(value: AgeGroup | null): void`.
- Produces, from `AgeFilter.tsx`: `AgeFilter({ value, onChange }: { value: AgeGroup | null; onChange: (next: AgeGroup | null) => void })`, `AgeFilterEmpty({ noun, ageGroup, onShowAll }: { noun: "drills" | "templates"; ageGroup: AgeGroup; onShowAll: () => void })`.
- Produces: `StarterTemplatePicker` gains an optional `templates?: readonly StarterTemplate[]` prop (default `STARTER_TEMPLATES`).

- [ ] **Step 1: Write the failing chip-row tests**

Create `__tests__/components/features/practice-planner/AgeFilter.test.tsx`:

```tsx
/** The shared age filter (ADM-style templates R3). */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { AgeFilter, AgeFilterEmpty } from "@/components/features/practice-planner/AgeFilter";

const themed = (ui: React.ReactElement) => render(<ThemeProvider theme={createTheme()}>{ui}</ThemeProvider>);

describe("AgeFilter", () => {
    it("offers All ages and every group as single-choice chips of at least 44 px", () => {
        const onChange = vi.fn();
        themed(<AgeFilter value="u8" onChange={onChange} />);
        const group = screen.getByRole("group", { name: "Age group" });
        const chips = within(group).getAllByRole("button");
        expect(chips.map((chip) => chip.textContent)).toEqual(["All ages", "6U", "8U", "10U", "12U", "14U", "16U+"]);
        expect(within(group).getByRole("button", { name: "8U" })).toHaveAttribute("aria-pressed", "true");
        expect(within(group).getByRole("button", { name: "All ages" })).toHaveAttribute("aria-pressed", "false");
        for (const chip of chips) expect(chip).toHaveStyle({ minHeight: "44px" });

        fireEvent.click(within(group).getByRole("button", { name: "16U+" }));
        expect(onChange).toHaveBeenLastCalledWith("u16plus");
        fireEvent.click(within(group).getByRole("button", { name: "All ages" }));
        expect(onChange).toHaveBeenLastCalledWith(null);
    });

    it("marks All ages when nothing is chosen", () => {
        themed(<AgeFilter value={null} onChange={vi.fn()} />);
        expect(screen.getByRole("button", { name: "All ages" })).toHaveAttribute("aria-pressed", "true");
    });
});

describe("AgeFilterEmpty", () => {
    it("names the age and offers a reset", () => {
        const onShowAll = vi.fn();
        themed(<AgeFilterEmpty noun="drills" ageGroup="u8" onShowAll={onShowAll} />);
        expect(screen.getByText("No drills for 8U yet.")).toBeInTheDocument();
        const reset = screen.getByRole("button", { name: "Show all ages" });
        expect(reset).toHaveStyle({ minHeight: "44px" });
        fireEvent.click(reset);
        expect(onShowAll).toHaveBeenCalledTimes(1);
    });
});
```

Run: `bun run test __tests__/components/features/practice-planner/AgeFilter.test.tsx`
Expected: FAIL with "Failed to resolve import".

- [ ] **Step 2: Write the chip row**

Create `components/features/practice-planner/AgeFilter.tsx`:

```tsx
"use client";

/**
 * The age filter (ADM-style templates R3): All ages, then one chip per age
 * group, single choice. Shared by the drill library, the session editor's
 * drill picker and the template picker; useAgeFilter remembers the choice.
 */
import { Button, Chip, Stack, Typography } from "@mui/material";
import {
    AGE_FILTER_GROUP_LABEL,
    AGE_GROUPS,
    AGE_GROUP_LABELS,
    ALL_AGES_LABEL,
    SHOW_ALL_AGES_LABEL,
    noAgeMatchMessage,
    type AgeGroup,
} from "@/lib/utils/age-groups";

export interface AgeFilterProps {
    /** null = All ages */
    value: AgeGroup | null;
    onChange: (next: AgeGroup | null) => void;
}

export function AgeFilter({ value, onChange }: AgeFilterProps) {
    const chip = (key: string, label: string, next: AgeGroup | null) => {
        const selected = value === next;
        return (
            <Chip
                key={key}
                label={label}
                clickable
                color={selected ? "primary" : "default"}
                variant={selected ? "filled" : "outlined"}
                aria-pressed={selected}
                onClick={() => onChange(next)}
                // A 44px touch target everywhere.
                sx={{ minHeight: 44 }}
            />
        );
    };
    return (
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap role="group" aria-label={AGE_FILTER_GROUP_LABEL}>
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 800, minWidth: 64, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Age
            </Typography>
            {chip("all", ALL_AGES_LABEL, null)}
            {AGE_GROUPS.map((group) => chip(group, AGE_GROUP_LABELS[group], group))}
        </Stack>
    );
}

export interface AgeFilterEmptyProps {
    noun: "drills" | "templates";
    ageGroup: AgeGroup;
    onShowAll: () => void;
}

/** The empty state (R3): "No drills for 8U yet." and a link-styled "Show all ages". */
export function AgeFilterEmpty({ noun, ageGroup, onShowAll }: AgeFilterEmptyProps) {
    return (
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" flexWrap="wrap" useFlexGap role="status">
            <Typography variant="body2" color="text.secondary">
                {noAgeMatchMessage(noun, ageGroup)}
            </Typography>
            <Button variant="text" onClick={onShowAll} sx={{ minHeight: 44, textTransform: "none", textDecoration: "underline" }}>
                {SHOW_ALL_AGES_LABEL}
            </Button>
        </Stack>
    );
}
```

Run: `bun run test __tests__/components/features/practice-planner/AgeFilter.test.tsx`
Expected: PASS.

- [ ] **Step 3: Write the failing remembered-choice tests**

Create `__tests__/components/features/practice-planner/useAgeFilter.test.tsx`:

```tsx
/** The remembered age filter (R3): one localStorage key, shared by every filter on the page. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { useAgeFilter } from "@/components/features/practice-planner/useAgeFilter";
import { AGE_FILTER_STORAGE_KEY } from "@/lib/utils/age-groups";

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe("useAgeFilter", () => {
    it("starts at All ages, remembers a choice under one key, and forgets it for All ages", () => {
        const { result } = renderHook(() => useAgeFilter());
        expect(result.current[0]).toBeNull();
        act(() => result.current[1]("u10"));
        expect(result.current[0]).toBe("u10");
        expect(localStorage.getItem(AGE_FILTER_STORAGE_KEY)).toBe("u10");
        act(() => result.current[1](null));
        expect(result.current[0]).toBeNull();
        expect(localStorage.getItem(AGE_FILTER_STORAGE_KEY)).toBeNull();
    });

    it("reads the remembered age on mount, and every filter on the page follows a change", () => {
        localStorage.setItem(AGE_FILTER_STORAGE_KEY, "u8");
        const first = renderHook(() => useAgeFilter());
        const second = renderHook(() => useAgeFilter());
        expect(first.result.current[0]).toBe("u8");
        act(() => first.result.current[1]("u12"));
        expect(second.result.current[0]).toBe("u12");
    });

    it("reads a stored value it doesn't know as All ages", () => {
        localStorage.setItem(AGE_FILTER_STORAGE_KEY, "u7");
        expect(renderHook(() => useAgeFilter()).result.current[0]).toBeNull();
    });

    it("follows a change made in another tab", () => {
        const { result } = renderHook(() => useAgeFilter());
        act(() => {
            localStorage.setItem(AGE_FILTER_STORAGE_KEY, "u14");
            window.dispatchEvent(new StorageEvent("storage", { key: AGE_FILTER_STORAGE_KEY }));
        });
        expect(result.current[0]).toBe("u14");
    });

    it("renders All ages on the server, whatever the device remembers, so hydration matches", () => {
        localStorage.setItem(AGE_FILTER_STORAGE_KEY, "u8");
        function Probe() {
            const [age] = useAgeFilter();
            return <span>{age ?? "all"}</span>;
        }
        expect(renderToString(<Probe />)).toContain("all");
    });
});
```

Create `__tests__/components/features/practice-planner/useAgeFilter.blocked.test.tsx` (its own file: the hook's in-page fallback is module state, which Vitest isolates per file):

```tsx
/** The age filter when the browser blocks localStorage (R3): All ages, and the chips still work. */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useAgeFilter } from "@/components/features/practice-planner/useAgeFilter";

beforeAll(() => {
    const blocked = () => {
        throw new DOMException("The operation is insecure.", "SecurityError");
    };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(blocked);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(blocked);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(blocked);
});
afterAll(() => vi.restoreAllMocks());

describe("useAgeFilter with blocked storage", () => {
    it("reads All ages, never throws, and keeps a choice for the rest of the visit", () => {
        const first = renderHook(() => useAgeFilter());
        expect(first.result.current[0]).toBeNull();
        act(() => first.result.current[1]("u6"));
        expect(first.result.current[0]).toBe("u6");
        const second = renderHook(() => useAgeFilter());
        expect(second.result.current[0]).toBe("u6");
        act(() => second.result.current[1](null));
        expect(first.result.current[0]).toBeNull();
    });
});
```

Run: `bun run test __tests__/components/features/practice-planner/useAgeFilter.test.tsx __tests__/components/features/practice-planner/useAgeFilter.blocked.test.tsx`
Expected: FAIL with "Failed to resolve import".

- [ ] **Step 4: Write the hook**

Create `components/features/practice-planner/useAgeFilter.ts`:

```ts
"use client";

/**
 * The age filter's remembered choice (ADM-style templates R3): one value per
 * device under AGE_FILTER_STORAGE_KEY, shared by the drill library, the
 * session editor's drill picker and the template picker.
 *
 * Read through useSyncExternalStore with All ages as the server snapshot, so
 * the hosted page hydrates without a mismatch and then shows the remembered
 * age. Every storage access is guarded: when the browser blocks storage (or a
 * write fails), the choice lives in this page only and the filter keeps
 * working. A stored value this build doesn't know reads as All ages.
 */
import { useSyncExternalStore } from "react";
import { AGE_FILTER_STORAGE_KEY, toAgeGroup, type AgeGroup } from "@/lib/utils/age-groups";

const listeners = new Set<() => void>();
/** Set once storage fails; from then on the choice lives here, for this page only. */
let memory: { value: AgeGroup | null } | null = null;

function read(): AgeGroup | null {
    if (memory) return memory.value;
    try {
        return toAgeGroup(window.localStorage.getItem(AGE_FILTER_STORAGE_KEY));
    } catch {
        memory = { value: null };
        return null;
    }
}

/** Remembers the choice (null = All ages) and tells every filter on the page. */
export function setAgeFilter(value: AgeGroup | null): void {
    if (memory) {
        memory.value = value;
    } else {
        try {
            if (value === null) window.localStorage.removeItem(AGE_FILTER_STORAGE_KEY);
            else window.localStorage.setItem(AGE_FILTER_STORAGE_KEY, value);
        } catch {
            memory = { value };
        }
    }
    listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    // A change made in another tab of this site.
    const onStorage = (event: StorageEvent) => {
        if (event.key === null || event.key === AGE_FILTER_STORAGE_KEY) listener();
    };
    window.addEventListener("storage", onStorage);
    return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", onStorage);
    };
}

const allAges = (): AgeGroup | null => null;

/** [the remembered age, or null for All ages; the setter] */
export function useAgeFilter(): [AgeGroup | null, (value: AgeGroup | null) => void] {
    return [useSyncExternalStore(subscribe, read, allAges), setAgeFilter];
}
```

Run: `bun run test __tests__/components/features/practice-planner/useAgeFilter.test.tsx __tests__/components/features/practice-planner/useAgeFilter.blocked.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write the failing library and picker tests**

Create `__tests__/components/features/practice-planner/PlayLibrary.age-filter.test.tsx`:

```tsx
/** The age filter in the drill library and the session editor's drill picker (R3). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { createHashPlatform, createMockPlannerStore, renderWithPlanner } from "@/__tests__/helpers/planner";
import { AGE_FILTER_STORAGE_KEY } from "@/lib/utils/age-groups";
import { createEmptyPlayData } from "@/lib/utils/play-data";

vi.mock("@/lib/utils/canvas/thumbnail-generator", () => ({ generateThumbnail: () => "data:image/png;base64,AA==" }));

import { PlayLibrary } from "@/components/features/practice-planner/PlayLibrary";

const TEAM = "cteamxxxxxxxxxxxxxxxxxxxx";
const AT = new Date("2026-04-01T00:00:00Z");
const summary = (id: string, name: string, extra: Record<string, unknown> = {}) =>
    ({ id, name, description: null, thumbnail: null, isTemplate: true, createdAt: AT, updatedAt: AT, ...extra });
const KEEP_AWAY = summary("cplay1xxxxxxxxxxxxxxxxxxx", "My Keep-Away", { ageGroups: ["u6", "u8"] });
const FOUR_ON_FOUR = summary("cplay2xxxxxxxxxxxxxxxxxxx", "My 4-on-4", { ageGroups: ["u12", "u14"] });
const page = (plays: unknown[]) => ({ success: true, data: { plays, total: plays.length, page: 1, limit: 20 } });

function renderLibrary(plays: unknown[] = [KEEP_AWAY, FOUR_ON_FOUR], mode: "manage" | "select" = "manage") {
    const store = createMockPlannerStore();
    store.getPlaysByTeam.mockResolvedValue(page(plays));
    const onSelectPlay = vi.fn();
    const view = renderWithPlanner(
        <ThemeProvider theme={createTheme()}>
            <PlayLibrary teamId={TEAM} mode={mode} onSelectPlay={onSelectPlay} />
        </ThemeProvider>,
        { store, platform: createHashPlatform() },
    );
    return { store, onSelectPlay, view };
}

const ageChip = (name: string) => within(screen.getByRole("group", { name: "Age group" })).getByRole("button", { name });
const cardOf = (text: string) => screen.getByText(text).closest(".MuiCard-root") as HTMLElement;

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe("PlayLibrary: age filter", () => {
    it("asks for the chosen age from page 1, and remembers it on this device", async () => {
        const { store, view } = renderLibrary();
        await screen.findByText("My Keep-Away");
        expect(store.getPlaysByTeam.mock.lastCall?.[0]).not.toHaveProperty("ageGroup");
        fireEvent.click(ageChip("8U"));
        await waitFor(() => expect(store.getPlaysByTeam).toHaveBeenLastCalledWith(expect.objectContaining({ ageGroup: "u8", page: 1 })));
        expect(localStorage.getItem(AGE_FILTER_STORAGE_KEY)).toBe("u8");

        view.unmount();
        const again = renderLibrary();
        await screen.findByText("My Keep-Away");
        expect(again.store.getPlaysByTeam).toHaveBeenLastCalledWith(expect.objectContaining({ ageGroup: "u8" }));
        expect(ageChip("8U")).toHaveAttribute("aria-pressed", "true");
    });

    it("filters the starter cards by the same rule: untagged starters show for every age", async () => {
        renderLibrary([]);
        await screen.findByText("Keep-Away in a Box");
        fireEvent.click(ageChip("16U+"));
        await waitFor(() => expect(screen.queryByText("Keep-Away in a Box")).toBeNull());
        expect(screen.getByText("Goalie Warm-Up")).toBeInTheDocument();
        expect(screen.getByText("4-on-4 Cross-Ice Game")).toBeInTheDocument();
    });

    it("says when no drill matches the age, and Show all ages clears the filter", async () => {
        localStorage.setItem(AGE_FILTER_STORAGE_KEY, "u8");
        const { store } = renderLibrary([], "select");
        expect(await screen.findByText("No drills for 8U yet.")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Show all ages" }));
        await waitFor(() => expect(store.getPlaysByTeam.mock.lastCall?.[0]).not.toHaveProperty("ageGroup"));
        expect(localStorage.getItem(AGE_FILTER_STORAGE_KEY)).toBeNull();
        expect(ageChip("All ages")).toHaveAttribute("aria-pressed", "true");
    });

    it("shows the latest answer when an earlier, slower one arrives after it", async () => {
        const store = createMockPlannerStore();
        let releaseFirst: (value: unknown) => void = () => undefined;
        store.getPlaysByTeam
            .mockImplementationOnce(() => new Promise((resolve) => (releaseFirst = resolve)))
            .mockResolvedValue(page([FOUR_ON_FOUR]));
        renderWithPlanner(
            <ThemeProvider theme={createTheme()}>
                <PlayLibrary teamId={TEAM} mode="select" />
            </ThemeProvider>,
            { store, platform: createHashPlatform() },
        );
        fireEvent.click(ageChip("12U"));
        expect(await screen.findByText("My 4-on-4")).toBeInTheDocument();
        await act(async () => releaseFirst(page([KEEP_AWAY])));
        expect(screen.queryByText("My Keep-Away")).toBeNull();
        expect(screen.getByText("My 4-on-4")).toBeInTheDocument();
    });

    it("offers the filter in the drill picker and hands a picked drill over with its ages", async () => {
        const { store, onSelectPlay } = renderLibrary([KEEP_AWAY], "select");
        store.getPlayById.mockResolvedValue({ success: true, data: { ...KEEP_AWAY, playData: createEmptyPlayData(), focus: "skaters", goalies: "none" } });
        expect(await screen.findByRole("group", { name: "Age group" })).toBeInTheDocument();
        fireEvent.click(cardOf("My Keep-Away"));
        await waitFor(() => expect(onSelectPlay).toHaveBeenCalledWith(expect.objectContaining({ name: "My Keep-Away", ageGroups: ["u6", "u8"] })));
    });
});
```

In `__tests__/components/features/practice-planner/StarterTemplatePicker.test.tsx`, add to the imports:

```ts
import { afterEach, beforeEach } from "vitest";
import { AGE_FILTER_STORAGE_KEY } from "@/lib/utils/age-groups";
```

(merge `afterEach`/`beforeEach` into the existing `vitest` import line), and append:

```ts
describe("StarterTemplatePicker: age filter (R3)", () => {
    beforeEach(() => localStorage.clear());
    afterEach(() => localStorage.clear());

    const cardNames = () => screen.queryAllByRole("heading", { level: 3 }).map((heading) => heading.textContent);

    it("shows each template's ages, and filters by the remembered age", () => {
        render(<StarterTemplatePicker onUse={vi.fn()} />);
        const card = screen.getByRole("heading", { name: "8U Station Practice" }).closest(".MuiCard-root") as HTMLElement;
        expect(within(card).getByText("6U, 8U")).toBeInTheDocument();

        fireEvent.click(within(screen.getByRole("group", { name: "Age group" })).getByRole("button", { name: "6U" }));
        expect(cardNames()).toEqual(["8U Station Practice"]);
        expect(localStorage.getItem(AGE_FILTER_STORAGE_KEY)).toBe("u6");
        fireEvent.click(within(screen.getByRole("group", { name: "Age group" })).getByRole("button", { name: "14U" }));
        expect(cardNames()).toEqual(["Skills Stations", "Goalie & Skater Rotation", "Team Practice with Stations", "12U Skills and Small Games"]);
    });

    it("says when no template matches, and Show all ages brings them back", () => {
        localStorage.setItem(AGE_FILTER_STORAGE_KEY, "u6");
        const only12U = STARTER_TEMPLATES.filter((template) => template.id === "template-12u-skills-games");
        render(<StarterTemplatePicker onUse={vi.fn()} templates={only12U} />);
        expect(screen.getByText("No templates for 6U yet.")).toBeInTheDocument();
        expect(cardNames()).toEqual([]);
        fireEvent.click(screen.getByRole("button", { name: "Show all ages" }));
        expect(cardNames()).toEqual(["12U Skills and Small Games"]);
    });
});
```

In `__tests__/components/features/practice-planner/PracticeSessionEditor.drill-tags.test.tsx`, add `ageGroups: ["u8"]` to `LIB` and change the last expectation to:

```ts
        expect(onSave.mock.calls[0][0].plays[0]).toMatchObject({ name: "My Warm-up", focus: "goalies", goalies: "required", ageGroups: ["u8"] });
```

Run: `bun run test __tests__/components/features/practice-planner/PlayLibrary.age-filter.test.tsx __tests__/components/features/practice-planner/StarterTemplatePicker.test.tsx __tests__/components/features/practice-planner/PracticeSessionEditor.drill-tags.test.tsx`
Expected: FAIL (no "Age group" group; templates aren't filtered; picked drills lose their ages).

- [ ] **Step 6: Filter the library and the drill picker**

In `components/features/practice-planner/PlayLibrary.tsx`:

After line 59 (`import { needsGoalie } from "@/lib/utils/drill-tags";`) add:

```ts
import { matchesAgeGroup, type AgeGroup } from "@/lib/utils/age-groups";
import { AgeFilter, AgeFilterEmpty } from "./AgeFilter";
import { useAgeFilter } from "./useAgeFilter";
```

After `const NAMES_PAGE_SIZE = 100;` (line 62) add:

```ts
/** What a library load asks for: the tag chips plus the age filter (ADM-style templates R3). */
type LibraryFilters = DrillFilters & { ageGroup?: AgeGroup };
```

Replace lines 369-370:

```ts
    const [filters, setFilters] = useState<DrillFilters>({});
    const filtersActive = Boolean(filters.focus || filters.goalies);
```

with:

```ts
    const [filters, setFilters] = useState<DrillFilters>({});
    // Remembered on this device, and shared with the drill picker and the template picker (R3).
    const [ageFilter, setAgeFilter] = useAgeFilter();
    const queryFilters = useMemo<LibraryFilters>(() => (ageFilter ? { ...filters, ageGroup: ageFilter } : filters), [filters, ageFilter]);
    const filtersActive = Boolean(filters.focus || filters.goalies || ageFilter);
    // Only the latest load may set the grid: on the hosted page the remembered age arrives after
    // hydration, and a quick chip change can also leave an earlier, slower answer in flight.
    const latestLoad = useRef(0);
```

Replace `loadPlays` (lines 426-465, from `const loadPlays = useCallback(` through `}, [store, teamId, currentPage, refreshLibraryNames]);`) with:

```ts
    const loadPlays = useCallback(async (search: string, dateFilterValue: "all" | "today" | "week" | "month", drillFilters: LibraryFilters, refreshNames = false) => {
        const load = ++latestLoad.current;
        setIsLoading(true);
        setError(null);

        try {
            const result = await store.getPlaysByTeam({
                teamId,
                isTemplate: true, // Only load library plays
                page: currentPage,
                limit: playsPerPage,
                search: search.trim() || undefined,
                dateFilter: dateFilterValue,
                ...(drillFilters.focus && { focus: drillFilters.focus }),
                ...(drillFilters.goalies && { goalies: drillFilters.goalies }),
                ...(drillFilters.ageGroup && { ageGroup: drillFilters.ageGroup }),
            });
            if (load !== latestLoad.current) return;

            if (result.success) {
                const playsData = result.data.plays.map((play) => ({
                    ...play,
                    description: play.description ?? "",
                    thumbnail: play.thumbnail ?? "",
                    playData: createEmptyPlayData(), // Will be loaded when needed
                })) as SavedPlay[];

                setPlays(playsData);
                setTotalPages(Math.ceil(result.data.total / playsPerPage));
                if (refreshNames) {
                    const unfiltered = !search.trim() && dateFilterValue === "all" && !drillFilters.focus && !drillFilters.goalies && !drillFilters.ageGroup;
                    refreshLibraryNames(unfiltered && currentPage === 1 ? result.data : null);
                }
            } else {
                setError(result.error);
            }
        } catch (err) {
            if (load !== latestLoad.current) return;
            console.error("Error loading plays:", err);
            setError("Failed to load plays. Please try again.");
        } finally {
            if (load === latestLoad.current) setIsLoading(false);
        }
    }, [store, teamId, currentPage, refreshLibraryNames]);
```

Then pass `queryFilters` wherever a load passed `filters`, and depend on it:
- `debouncedSearch` (line 471): `loadPlays(search, dateFilter, queryFilters);`
- the load effect (lines 478-479):

  ```ts
          loadPlays(searchQuery, dateFilter, queryFilters, !libraryNamesLoaded.current);
      }, [currentPage, dateFilter, queryFilters]); // eslint-disable-line react-hooks/exhaustive-deps
  ```
- `handleAddStarter` (line 552 and its dependency list at 563): `await loadPlays(searchQuery, dateFilter, queryFilters, true);` and `[store, starterThumbnails, teamId, loadPlays, searchQuery, dateFilter, queryFilters]`
- `handleDeleteConfirm` (line 687 and its dependency list at 699): `await loadPlays(searchQuery, dateFilter, queryFilters, true);` and `[store, playToDelete, plays, teamId, loadPlays, searchQuery, dateFilter, queryFilters]`

In `visibleStarters`, after the `goalies` check (line 520) add:

```ts
            if (!matchesAgeGroup(starter.ageGroups, ageFilter)) return false;
```

and add `ageFilter` to its dependency list (line 523): `[mode, plays, libraryNames, copiedStarterNames, searchQuery, filters, ageFilter]`.

After `handleFiltersChange` (ends line 590) add:

```ts
    /**
     * Handle an age chip change (remembered on this device)
     */
    const handleAgeChange = useCallback((next: AgeGroup | null) => {
        setAgeFilter(next);
        setCurrentPage(1); // a filtered result starts at its first page
    }, [setAgeFilter]);
```

In `handleSelectPlay`'s `fullPlay`, after `goalies: result.data.goalies,` (line 614) add `                            ageGroups: result.data.ageGroups,`.

Replace the filter box (lines 781-784):

```tsx
            {/* Drill-tag filters (goaltender-aware drills) */}
            <Box sx={{ mb: 3 }}>
                <DrillFilterChips value={filters} onChange={handleFiltersChange} />
            </Box>
```

with:

```tsx
            {/* Drill-tag filters (goaltender-aware drills) and the age filter (ADM-style templates R3) */}
            <Stack spacing={1} sx={{ mb: 3 }}>
                <DrillFilterChips value={filters} onChange={handleFiltersChange} />
                <AgeFilter value={ageFilter} onChange={handleAgeChange} />
            </Stack>
```

In the empty state (lines 821-830), replace the two `Typography` elements with:

```tsx
                    {ageFilter ? (
                        <AgeFilterEmpty noun="drills" ageGroup={ageFilter} onShowAll={() => handleAgeChange(null)} />
                    ) : (
                        <>
                            <Typography variant="h6" color="text.secondary" gutterBottom>
                                {searchQuery || dateFilter !== "all" || filtersActive
                                    ? "No plays found"
                                    : "No plays in your library yet"}
                            </Typography>
                            <Typography variant="body2" color="text.secondary" mb={2}>
                                {searchQuery || dateFilter !== "all" || filtersActive
                                    ? "Try adjusting your search or filter settings"
                                    : "Create your first play to get started"}
                            </Typography>
                        </>
                    )}
```

(The `Create Play` button below keeps its `!filtersActive` condition, which now includes the age.)

In `components/features/practice-planner/PracticeSessionEditor.tsx`, change line 564:

```ts
            focus: savedPlay.focus, goalies: savedPlay.goalies,
```

to:

```ts
            focus: savedPlay.focus, goalies: savedPlay.goalies, ageGroups: savedPlay.ageGroups,
```

- [ ] **Step 7: Filter the templates**

Replace `components/features/practice-planner/StarterTemplatePicker.tsx` from line 3 to the end with:

```tsx
import { Box, Button, Card, CardActions, CardContent, Chip, Grid, Stack, Typography } from "@mui/material";
import { STARTER_TEMPLATES, starterTemplatePlan, type StarterTemplate } from "@/lib/data/starter-templates";
import { parsePlan, type ParsePlanResult, type PlanGenerator } from "@/lib/plan-document";
import { groupStations } from "@/lib/utils/session-timeline";
import { drillRows } from "@/lib/utils/session-rows";
import { formatAgeGroups, matchesAgeGroup } from "@/lib/utils/age-groups";
import { AgeFilter, AgeFilterEmpty } from "./AgeFilter";
import { useAgeFilter } from "./useAgeFilter";

/**
 * A template as the import views receive a plan file: stamped with the running
 * app and the moment it was chosen, then parsed. The JSON round trip matters:
 * the template's diagrams are the starter drills' own objects, and the import
 * must never hold (or let an editor mutate) those.
 */
export function starterTemplateImport(template: StarterTemplate, generator: PlanGenerator, now: Date = new Date()): ParsePlanResult {
    return parsePlan(JSON.parse(JSON.stringify(starterTemplatePlan(template, generator, now))));
}

export interface StarterTemplatePickerProps {
    onUse: (template: StarterTemplate) => void;
    disabled?: boolean;
    /** The templates offered; tests pass their own. */
    templates?: readonly StarterTemplate[];
}

/**
 * Starter practice templates (spec R11). Choosing one hands it to the import
 * view, which previews it and saves it exactly like a plan file. Filtered by
 * the remembered age (ADM-style templates R3) by each template's own ages.
 */
export function StarterTemplatePicker({ onUse, disabled = false, templates = STARTER_TEMPLATES }: StarterTemplatePickerProps) {
    const [ageFilter, setAgeFilter] = useAgeFilter();
    const shown = templates.filter((template) => matchesAgeGroup(template.ageGroups, ageFilter));
    return (
        <Stack component="section" spacing={2} aria-labelledby="starter-templates-heading">
            <Box>
                <Typography id="starter-templates-heading" variant="h6" component="h2" sx={{ fontWeight: 800 }}>
                    Start from a template
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    Station practices with a goalie station, built from the starter drills. Everything stays editable after you save it.
                </Typography>
            </Box>
            <AgeFilter value={ageFilter} onChange={setAgeFilter} />
            {ageFilter && shown.length === 0 && <AgeFilterEmpty noun="templates" ageGroup={ageFilter} onShowAll={() => setAgeFilter(null)} />}
            <Grid container spacing={2}>
                {shown.map((template) => {
                    const blocks = groupStations(template.session.drills).filter((group) => group.stations.length > 1).length;
                    return (
                        <Grid key={template.id} size={{ xs: 12, md: 4 }}>
                            <Card
                                variant="outlined"
                                sx={{ height: "100%", display: "flex", flexDirection: "column", borderTop: 4, borderTopColor: "primary.main" }}
                            >
                                <CardContent sx={{ flexGrow: 1 }}>
                                    <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 800 }}>
                                        {template.name}
                                    </Typography>
                                    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ my: 1 }}>
                                        <Chip size="small" label={`${template.session.durationMinutes} min`} />
                                        <Chip size="small" label={`${drillRows(template.session.drills).length} drills`} />
                                        <Chip size="small" label={`${blocks} station ${blocks === 1 ? "block" : "blocks"}`} />
                                        <Chip size="small" color="primary" variant="outlined" label={formatAgeGroups(template.ageGroups)} />
                                    </Stack>
                                    <Typography variant="body2" color="text.secondary">
                                        {template.description}
                                    </Typography>
                                </CardContent>
                                <CardActions sx={{ px: 2, pb: 2 }}>
                                    <Button
                                        variant="contained"
                                        onClick={() => onUse(template)}
                                        disabled={disabled}
                                        aria-label={`Use template: ${template.name}`}
                                        sx={{ minHeight: 44 }}
                                    >
                                        Use template
                                    </Button>
                                </CardActions>
                            </Card>
                        </Grid>
                    );
                })}
            </Grid>
        </Stack>
    );
}
```

- [ ] **Step 8: Run them to verify they pass**

Run: `bun run test __tests__/components/features/practice-planner/AgeFilter.test.tsx __tests__/components/features/practice-planner/useAgeFilter.test.tsx __tests__/components/features/practice-planner/useAgeFilter.blocked.test.tsx __tests__/components/features/practice-planner/PlayLibrary.age-filter.test.tsx __tests__/components/features/practice-planner/PlayLibrary.test.tsx __tests__/components/features/practice-planner/PlayLibrary.filters.test.tsx __tests__/components/features/practice-planner/PlayLibrary.portable.test.tsx __tests__/components/features/practice-planner/StarterTemplatePicker.test.tsx __tests__/components/features/practice-planner/PlanImportView.test.tsx __tests__/components/features/practice-planner/PracticeSessionEditor.drill-tags.test.tsx __tests__/components/features/practice-planner/PracticeSessionEditor.line-budget.test.ts __tests__/apps/planner/import-screen.test.tsx __tests__/apps/planner/app.test.tsx`
Expected: PASS.

- [ ] **Step 9: Type-check, lint and commit**

```bash
bun run type-check
bun run lint
wc -l components/features/practice-planner/PracticeSessionEditor.tsx
```

Expected: exit 0; `PracticeSessionEditor.tsx` still 806 lines.

```bash
/usr/bin/git add components/features/practice-planner/useAgeFilter.ts components/features/practice-planner/AgeFilter.tsx \
  components/features/practice-planner/PlayLibrary.tsx components/features/practice-planner/StarterTemplatePicker.tsx \
  components/features/practice-planner/PracticeSessionEditor.tsx \
  __tests__/components/features/practice-planner/AgeFilter.test.tsx __tests__/components/features/practice-planner/useAgeFilter.test.tsx \
  __tests__/components/features/practice-planner/useAgeFilter.blocked.test.tsx __tests__/components/features/practice-planner/PlayLibrary.age-filter.test.tsx \
  __tests__/components/features/practice-planner/StarterTemplatePicker.test.tsx __tests__/components/features/practice-planner/PracticeSessionEditor.drill-tags.test.tsx
/usr/bin/git commit -m "feat(practice-planner): age filter for the drill library, drill picker and templates" -m "$SESSION_TRAILER"
```

---

### Task 6: The Age groups field in the drill editor

`PlayEditor`, shared by both apps' library editors and the session drill dialog, gains an **Age groups** chip field under Focus and Goalies (spec R4, success criterion 2). Every editor save path sends the value and every editor load passes it in: the hosted library wrapper and edit page, the static drill editor screen, the session drill dialog and its hook (and so the editor's card patch). The stores already store it (Tasks 2 and 3).

**Files:**
- Create: `components/features/practice-planner/AgeGroupsField.tsx`
- Modify: `components/features/practice-planner/PlayEditor.tsx` (imports after line 42; state after line 109; `handleTagsChange` 239-243; `handleSave` 284-293 and its dependency list 319; the form after line 403)
- Modify: `components/features/practice-planner/SessionDrillDialog.tsx` (import line 22; `SessionDrillDialogDrill` 36-37; `handleSave` 84-85 and 98-99; `initialData` 136-137)
- Modify: `components/features/practice-planner/useSessionDrillDialog.ts:36-37`
- Modify: `lib/utils/session-drill-ids.ts:5,35-36` (`SessionDrillPatch`)
- Modify: `app/(dashboard)/practice-planner/library/PlayEditorWrapper.tsx:30-31,41-42`
- Modify: `app/(dashboard)/practice-planner/library/[playId]/edit/page.tsx:71-72`
- Modify: `apps/planner/src/screens/DrillEditorScreen.tsx:45-46,63-64`
- Test (create): `__tests__/components/features/practice-planner/PlayEditor.age-groups.test.tsx`, `__tests__/components/features/practice-planner/useSessionDrillDialog.age-groups.test.tsx`
- Test (modify): `__tests__/components/features/practice-planner/SessionDrillDialog.test.tsx`, `__tests__/app/practice-planner-hosted-wrappers.test.tsx`, `__tests__/apps/planner/editor-screens.test.tsx`
- Existing tests that must stay green unchanged: `__tests__/components/features/practice-planner/DrillTags.ui.test.tsx`, `PlayEditor.test.tsx`, `PlayEditor.ice-area.test.tsx`, `PracticeSessionEditor.drill-dialog.test.tsx`.

**Interfaces:**
- Consumes (Task 2): `AGE_GROUPS`, `AGE_GROUP_LABELS`, `AGE_GROUPS_FIELD_LABEL`, `AGE_GROUPS_HELPER`, `toggleAgeGroup`, `toAgeGroups`, `type AgeGroup`; `SavedPlay.ageGroups`, `PlayInSession.ageGroups`, `SessionDrillSave.ageGroups`, `NewLibraryPlay.ageGroups`, `LocalPlayUpdate.ageGroups`.
- Produces, from `AgeGroupsField.tsx`: `AgeGroupsField({ value, onChange, disabled }: { value: readonly AgeGroup[]; onChange: (next: AgeGroup[]) => void; disabled?: boolean })`.
- Produces: `SessionDrillDialogDrill.ageGroups?: AgeGroup[]`; `SessionDrillPatch.ageGroups?: AgeGroup[]`; `PlayEditor`'s `onSave` receives `ageGroups: AgeGroup[]` (always set, in table order).

- [ ] **Step 1: Write the failing editor tests**

Create `__tests__/components/features/practice-planner/PlayEditor.age-groups.test.tsx`:

```tsx
/** The drill editor's Age groups field (ADM-style templates R4). */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { PlayEditor } from "@/components/features/practice-planner/PlayEditor";
import type { AgeGroup } from "@/lib/utils/age-groups";

vi.mock("@/lib/utils/canvas/thumbnail-generator", () => ({ generateThumbnail: vi.fn(() => "data:image/png;base64,AA==") }));

const themed = (ui: React.ReactElement) => render(<ThemeProvider theme={createTheme()}>{ui}</ThemeProvider>);
const field = () => screen.getByRole("group", { name: "Age groups" });
const chip = (name: string) => within(field()).getByRole("button", { name });

describe("PlayEditor: Age groups", () => {
    it("offers one 44 px toggle per group, with the helper text", () => {
        themed(<PlayEditor teamId="t" initialData={{ name: "Drill" }} autoSave={false} />);
        const chips = within(field()).getAllByRole("button");
        expect(chips.map((c) => c.textContent)).toEqual(["6U", "8U", "10U", "12U", "14U", "16U+"]);
        for (const c of chips) {
            expect(c).toHaveAttribute("aria-pressed", "false");
            expect(c).toHaveStyle({ minHeight: "44px" });
        }
        expect(screen.getByText("Leave empty if it suits every age.")).toBeInTheDocument();
    });

    it("starts from the drill's groups, ignoring any it doesn't know", () => {
        themed(<PlayEditor teamId="t" initialData={{ name: "Drill", ageGroups: ["u12", "u7" as AgeGroup] }} autoSave={false} />);
        expect(chip("12U")).toHaveAttribute("aria-pressed", "true");
        expect(within(field()).getAllByRole("button").filter((c) => c.getAttribute("aria-pressed") === "true")).toHaveLength(1);
    });

    it("toggles groups, marks the drill unsaved, and saves them in table order", async () => {
        const onSave = vi.fn().mockResolvedValue(undefined);
        const onDirtyChange = vi.fn();
        themed(<PlayEditor teamId="t" initialData={{ name: "Drill", ageGroups: ["u12"] }} autoSave={false} onSave={onSave} onDirtyChange={onDirtyChange} />);
        fireEvent.click(chip("8U"));
        fireEvent.click(chip("12U"));
        fireEvent.click(chip("6U"));
        expect(onDirtyChange).toHaveBeenLastCalledWith(true);
        fireEvent.click(screen.getByRole("button", { name: /Save Play/i }));
        await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ ageGroups: ["u6", "u8"] })));
    });

    it("saves [] (every age) for a drill with none chosen", async () => {
        const onSave = vi.fn().mockResolvedValue(undefined);
        themed(<PlayEditor teamId="t" initialData={{ name: "Drill" }} autoSave={false} onSave={onSave} />);
        fireEvent.click(screen.getByRole("button", { name: /Save Play/i }));
        await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ ageGroups: [] })));
    });
});
```

Run: `bun run test __tests__/components/features/practice-planner/PlayEditor.age-groups.test.tsx`
Expected: FAIL (no "Age groups" group).

- [ ] **Step 2: Write the field and put it in the editor**

Create `components/features/practice-planner/AgeGroupsField.tsx`:

```tsx
"use client";

/**
 * The drill editor's Age groups field (ADM-style templates R4): one toggle
 * chip per group, any number chosen; none means the drill suits every age.
 */
import { Chip, FormControl, FormHelperText, FormLabel, Stack } from "@mui/material";
import {
    AGE_GROUPS,
    AGE_GROUP_LABELS,
    AGE_GROUPS_FIELD_LABEL,
    AGE_GROUPS_HELPER,
    toggleAgeGroup,
    type AgeGroup,
} from "@/lib/utils/age-groups";

export interface AgeGroupsFieldProps {
    value: readonly AgeGroup[];
    onChange: (next: AgeGroup[]) => void;
    disabled?: boolean;
}

export function AgeGroupsField({ value, onChange, disabled = false }: AgeGroupsFieldProps) {
    return (
        <FormControl component="fieldset" disabled={disabled} aria-describedby="drill-age-groups-helper">
            <FormLabel component="legend">{AGE_GROUPS_FIELD_LABEL}</FormLabel>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
                {AGE_GROUPS.map((group) => {
                    const selected = value.includes(group);
                    return (
                        <Chip
                            key={group}
                            label={AGE_GROUP_LABELS[group]}
                            clickable
                            disabled={disabled}
                            color={selected ? "primary" : "default"}
                            variant={selected ? "filled" : "outlined"}
                            aria-pressed={selected}
                            onClick={() => onChange(toggleAgeGroup(value, group))}
                            sx={{ minHeight: 44 }}
                        />
                    );
                })}
            </Stack>
            <FormHelperText id="drill-age-groups-helper">{AGE_GROUPS_HELPER}</FormHelperText>
        </FormControl>
    );
}
```

In `components/features/practice-planner/PlayEditor.tsx`:

After `import { drillTags } from "@/lib/utils/drill-tags";` (line 42 after Task 1's import edits) add:

```ts
import { AgeGroupsField } from "./AgeGroupsField";
import { toAgeGroups, type AgeGroup } from "@/lib/utils/age-groups";
```

After `const [tags, setTags] = useState<DrillTagValues>(() => drillTags(initialData));` (line 109) add:

```ts
    const [ageGroups, setAgeGroups] = useState<AgeGroup[]>(() => toAgeGroups(initialData?.ageGroups));
```

After `handleTagsChange` (ends line 243) add:

```ts
    const handleAgeGroupsChange = (next: AgeGroup[]) => {
        setAgeGroups(next);
        setHasUnsavedChanges(true);
        setSaveSuccess(false);
    };
```

In `handleSave`'s `savedPlay`, after `...tags,` (line 291) add `                ageGroups,`, and add `ageGroups` to the callback's dependency list (line 319):

```ts
    }, [name, description, playData, isTemplate, tags, ageGroups, playId, initialData, onSave]);
```

After `<DrillTagFields value={tags} onChange={handleTagsChange} />` (line 403) add:

```tsx

                    {/* Age groups (ADM-style templates) */}
                    <AgeGroupsField value={ageGroups} onChange={handleAgeGroupsChange} />
```

Run: `bun run test __tests__/components/features/practice-planner/PlayEditor.age-groups.test.tsx __tests__/components/features/practice-planner/DrillTags.ui.test.tsx __tests__/components/features/practice-planner/PlayEditor.test.tsx __tests__/components/features/practice-planner/PlayEditor.ice-area.test.tsx`
Expected: PASS.

- [ ] **Step 3: Write the failing save-path tests**

Append to `__tests__/components/features/practice-planner/SessionDrillDialog.test.tsx`:

```tsx
describe("SessionDrillDialog: age groups", () => {
    it("opens the editor with the drill's groups, and saves them with the session drill and the card patch", async () => {
        const onSaved = vi.fn().mockResolvedValue({ ok: true });
        renderWithPlanner(
            <SessionDrillDialog
                open
                sessionId={SESSION}
                teamId={TEAM}
                drill={{ clientKey: "k1", playId: OWNED, name: "Keep-Away", description: "", playData: createEmptyPlayData(), thumbnail: "", ageGroups: ["u6", "u8"] }}
                onSaved={onSaved}
                onClose={vi.fn()}
            />,
            { store: actions },
        );
        expect(captured.props?.initialData).toMatchObject({ ageGroups: ["u6", "u8"] });
        await act(async () => {
            await captured.props?.onSave?.({ ...saved, name: "Keep-Away", ageGroups: ["u8"] });
        });
        expect(actions.saveSessionDrill).toHaveBeenLastCalledWith(expect.objectContaining({ ageGroups: ["u8"] }));
        expect(onSaved).toHaveBeenCalledWith("k1", expect.objectContaining({ ageGroups: ["u8"] }));
    });
});
```

Create `__tests__/components/features/practice-planner/useSessionDrillDialog.age-groups.test.tsx`:

```tsx
/** The session editor's drill dialog state carries a card's age groups both ways. */
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useSessionDrillDialog } from "@/components/features/practice-planner/useSessionDrillDialog";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import type { SessionItem } from "@/types/practice-planner";

const OWNED = "cownedxxxxxxxxxxxxxxxxxxx";
const CARD: SessionItem = {
    id: "k1", playId: OWNED, name: "Keep-Away", description: "", sequence: 0, runsWithPrevious: false, duration: 10,
    instructions: "", playData: createEmptyPlayData(), ageGroups: ["u6", "u8"],
};

function useHarness() {
    const [plays, setPlays] = useState<SessionItem[]>([CARD]);
    const dialog = useSessionDrillDialog(plays, setPlays, () => undefined, async () => ({ ok: true }));
    return { plays, dialog };
}

describe("useSessionDrillDialog: age groups", () => {
    it("opens a card's diagram with its groups, and a save puts the new groups on the card", async () => {
        const { result } = renderHook(() => useHarness());
        act(() => result.current.dialog.editDiagram("k1"));
        expect(result.current.dialog.drill).toMatchObject({ ageGroups: ["u6", "u8"] });
        await act(async () => {
            await result.current.dialog.onSaved("k1", { playId: OWNED, name: "Keep-Away", description: "", thumbnail: "", playData: createEmptyPlayData(), ageGroups: ["u10"] });
        });
        expect(result.current.plays[0]).toMatchObject({ ageGroups: ["u10"] });
    });
});
```

In `__tests__/app/practice-planner-hosted-wrappers.test.tsx`, inside `describe("hosted wrappers: goaltender fields", …)`, add:

```tsx
    it("PlayEditorWrapper sends the age groups on create and on update", async () => {
        const drill = {
            id: "", name: "Keep-Away", description: "", thumbnail: "", playData: createEmptyPlayData(), isTemplate: true,
            ageGroups: ["u6", "u8"], createdAt: new Date(), updatedAt: new Date(),
        };
        render(<PlayEditorWrapper teamId={TEAM} />);
        await captured.props!.onSave(drill);
        expect(actions.createPlay.mock.calls[0][0]).toMatchObject({ ageGroups: ["u6", "u8"] });

        actions.updatePlay.mockResolvedValue({ success: true, data: { id: "cplayxxxxxxxxxxxxxxxxxxxx", name: "Keep-Away", isTemplate: true } });
        render(<PlayEditorWrapper teamId={TEAM} play={{ ...drill, id: "cplayxxxxxxxxxxxxxxxxxxxx" } as never} />);
        await captured.props!.onSave({ ...drill, ageGroups: [] });
        expect(actions.updatePlay.mock.calls[0][0]).toMatchObject({ id: "cplayxxxxxxxxxxxxxxxxxxxx", ageGroups: [] });
    });
```

In `__tests__/apps/planner/editor-screens.test.tsx`, add `within` to the Testing Library import (line 2), and inside `describe("DrillEditorScreen", …)` add:

```tsx
    it("saves the chosen age groups with a new drill, and shows them when it is edited", async () => {
        const { store } = memoryStore();
        renderScreen(<DrillEditorScreen store={store} />, store);
        fireEvent.change(screen.getByLabelText(/play name/i), { target: { value: "Keep-Away" } });
        fireEvent.click(within(screen.getByRole("group", { name: "Age groups" })).getByRole("button", { name: "8U" }));
        fireEvent.click(screen.getByRole("button", { name: /^save play/i }));
        await waitFor(() => expect(window.location.hash).toBe("#/library"));
        const listing = await store.getPlaysByTeam({ teamId: LOCAL_TEAM_ID, isTemplate: true, page: 1, limit: 20, dateFilter: "all" });
        const saved = listing.success ? listing.data.plays[0] : undefined;
        expect(saved?.ageGroups).toEqual(["u8"]);
    });

    it("loads a drill's age groups into the editor", async () => {
        const { store } = memoryStore();
        const created = await store.createPlay({ name: "Keep-Away", playData: createEmptyPlayData(), isTemplate: true, teamId: LOCAL_TEAM_ID, ageGroups: ["u6"] });
        if (!created.success) throw new Error(created.error);
        renderScreen(<DrillEditorScreen store={store} id={created.data.id} />, store);
        const group = await screen.findByRole("group", { name: "Age groups" });
        expect(within(group).getByRole("button", { name: "6U" })).toHaveAttribute("aria-pressed", "true");
    });
```

Run: `bun run test __tests__/components/features/practice-planner/SessionDrillDialog.test.tsx __tests__/components/features/practice-planner/useSessionDrillDialog.age-groups.test.tsx __tests__/app/practice-planner-hosted-wrappers.test.tsx __tests__/apps/planner/editor-screens.test.tsx`
Expected: FAIL (the dialog, the hook, the wrappers and the static screen drop the groups; `SessionDrillDialogDrill` and `SessionDrillPatch` have no `ageGroups`, so type-check would also fail).

- [ ] **Step 4: Send and load the groups on every editor path**

In `lib/utils/session-drill-ids.ts`, change line 5 to:

```ts
import type { PlayData, PlayFocus, PlayGoalies, SessionItem } from "@/types/practice-planner";
import type { AgeGroup } from "@/lib/utils/age-groups";
```

and add `    ageGroups?: AgeGroup[];` after `goalies?: PlayGoalies;` in `SessionDrillPatch` (line 36).

In `components/features/practice-planner/SessionDrillDialog.tsx`:
- after line 22 (`import type { PlayData, PlayFocus, PlayGoalies, SavedPlay } from "@/types/practice-planner";`) add `import type { AgeGroup } from "@/lib/utils/age-groups";`
- in `SessionDrillDialogDrill`, after `goalies?: PlayGoalies;` (line 37): `    ageGroups?: AgeGroup[];`
- in `handleSave`, after `goalies: saved.goalies,` in the `saveSessionDrill` call (line 85) and in the `onSaved` patch (line 99): `            ageGroups: saved.ageGroups,`
- in `PlayEditor`'s `initialData`, after `goalies: drill.goalies,` (line 137): `                    ageGroups: drill.ageGroups,`

In `components/features/practice-planner/useSessionDrillDialog.ts`, in `editDiagram`'s `setDrill`, after `goalies: play.goalies,` (line 37) add `            ageGroups: play.ageGroups,`.

In `app/(dashboard)/practice-planner/library/PlayEditorWrapper.tsx`, after `goalies: saved.goalies,` in both the `updatePlay` call (line 31) and the `createPlay` call (line 42) add `            ageGroups: saved.ageGroups,`.

In `app/(dashboard)/practice-planner/library/[playId]/edit/page.tsx`, after `goalies: result.data.goalies,` (line 72) add `    ageGroups: result.data.ageGroups,`.

In `apps/planner/src/screens/DrillEditorScreen.tsx`, after `goalies: state.data.goalies,` (line 46) add `        ageGroups: state.data.ageGroups,`, and after `goalies: saved.goalies,` in `fields` (line 64) add `                ageGroups: saved.ageGroups,`.

- [ ] **Step 5: Run them to verify they pass**

Run: `bun run test __tests__/components/features/practice-planner/SessionDrillDialog.test.tsx __tests__/components/features/practice-planner/useSessionDrillDialog.age-groups.test.tsx __tests__/app/practice-planner-hosted-wrappers.test.tsx __tests__/apps/planner/editor-screens.test.tsx __tests__/components/features/practice-planner/PracticeSessionEditor.drill-dialog.test.tsx`
Expected: PASS.

- [ ] **Step 6: Type-check, lint and commit**

```bash
bun run type-check
bun run lint
```

Expected: exit 0.

```bash
/usr/bin/git add components/features/practice-planner/AgeGroupsField.tsx components/features/practice-planner/PlayEditor.tsx \
  components/features/practice-planner/SessionDrillDialog.tsx components/features/practice-planner/useSessionDrillDialog.ts lib/utils/session-drill-ids.ts \
  "app/(dashboard)/practice-planner/library/PlayEditorWrapper.tsx" "app/(dashboard)/practice-planner/library/[playId]/edit/page.tsx" \
  apps/planner/src/screens/DrillEditorScreen.tsx \
  __tests__/components/features/practice-planner/PlayEditor.age-groups.test.tsx __tests__/components/features/practice-planner/useSessionDrillDialog.age-groups.test.tsx \
  __tests__/components/features/practice-planner/SessionDrillDialog.test.tsx __tests__/app/practice-planner-hosted-wrappers.test.tsx __tests__/apps/planner/editor-screens.test.tsx
/usr/bin/git commit -m "feat(practice-planner): age groups field in the drill editor" -m "$SESSION_TRAILER"
```

### Task 7: Gates and visual check

Every repository gate, then light and dark screenshots on desktop and phone of the area picker, the age filter, the editor field, and the three new templates' station maps and bench sheets (spec "Testing: Visual"). Fix forward in the task that owns a failure; never skip a gate or weaken a test.

**Files:** none new in the repository. The screenshot script lives outside it; its PNGs go to `.cache/adm-style/` (git-ignored by the `.cache` rule).

- [ ] **Step 1: Type-check and lint**

```bash
bun run type-check
bun run lint
```

Expected: both exit 0. A Zod v4 deprecation hint (★) in an IDE is not an error; the CLI result is what counts.

- [ ] **Step 2: Run the full suite**

Run: `bun run test`
Expected: PASS. If an unrelated test fails, check `gh run list --branch main --limit 5` first: a red `main` is not this branch's regression. A failure that names a date is clock rot; pin it with `vi.setSystemTime`, never by editing fixture dates.

- [ ] **Step 3: Build both deployables**

```bash
bun run build
bun run planner:build
bun run planner:check
```

Expected: all three succeed. `planner:check` still passes (no Next.js runtime in the static bundle; `lib/utils/age-groups.ts` imports only `zod`).

- [ ] **Step 4: Policy, portability and budget checks**

```bash
bun run check:raw-sql
bun run adr:lint
bun run adr:check-integrity
bun run adr:check lib/utils/age-groups.ts lib/utils/ice-area.ts lib/plan-document/document.ts apps/planner/src/store/idb-repo.ts \
  components/features/practice-planner/AgeFilter.tsx components/features/practice-planner/PlayLibrary.tsx lib/data/starter-plays.ts lib/data/starter-templates.ts \
  prisma/schema.prisma lib/actions/plays.ts
rg -n 'from "next|@/lib/actions|@/lib/db|@/lib/auth|@prisma/client|from "react"|@mui' lib/utils/age-groups.ts
rg -n 'from "next/|@/lib/actions|@/lib/db|@/lib/auth|@prisma/client' \
  components/features/practice-planner/AgeFilter.tsx components/features/practice-planner/useAgeFilter.ts components/features/practice-planner/AgeGroupsField.tsx
wc -l components/features/practice-planner/PracticeSessionEditor.tsx components/features/practice-planner/RinkBoard.tsx
```

Expected:
- `check:raw-sql`, `adr:lint` and `adr:check-integrity` exit 0 (`adr:lint` covers the two ADR-0020 amendments);
- `adr:check` lists the ADRs governing these paths (ADR-0020 among them; ADR-0003 for the Prisma change) with no violation. ADR-0020 already carries both amendments. If `adr:check` names an ADR this change contradicts, stop and report instead of editing the ADR;
- both `rg` searches print nothing;
- `PracticeSessionEditor.tsx` is 806 lines (≤ 900) and `RinkBoard.tsx` 1014 (≤ 1057).

- [ ] **Step 5: Hygiene of the branch**

```bash
/usr/bin/git diff main --name-only | xargs rg -n --no-heading '/Use[r]s/|/priv[a]te/tmp|scratc[h]pad/|sessio[n]_0' || true
/usr/bin/git diff main --name-only -- lib components apps app __tests__ | xargs rg -n -i --no-heading '\busa\b|development model|governing body' || true
/usr/bin/git status --short
```

Expected: the first two commands print nothing (no local path or session id in any changed file; no third-party organization or program named in code, content or tests; commit messages are not files, and Step 7 keeps them neutral). `git status` is clean. If `CLAUDE.md` shows as modified by `next dev`, leave it out of every commit.

- [ ] **Step 6: Screenshots**

Build and serve the static planner (Bash `run_in_background: true` for the preview):

```bash
bun run planner:build
bun run planner:preview --port 4199 --strictPort
```

In a local harness folder outside the repository (with `playwright` installed there), write `adm-style.mjs`:

```js
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

// OUT_DIR is the repository's .cache/adm-style (git-ignored)
const OUT = process.env.OUT_DIR;
mkdirSync(OUT, { recursive: true });
const shot = (name) => path.join(OUT, name);
const BASE = "http://localhost:4199/";
const TEMPLATES = [
  ["8U Station Practice", "8u"],
  ["10U Station Practice", "10u"],
  ["12U Skills and Small Games", "12u"],
];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });

async function overflow(page, label) {
  console.log(label, "horizontal overflow px:", await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth));
}
const ageChip = (page, name) => page.getByRole("group", { name: "Age group" }).getByRole("button", { name, exact: true });

for (const scheme of ["light", "dark"]) {
  for (const [w, h, tag] of [[1280, 1000, "desktop"], [390, 844, "mobile"]]) {
    const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.log("pageerror", e.message));

    // 1. The grouped area picker, open
    await page.goto(BASE + "#/library/new");
    await page.getByRole("combobox", { name: /Ice area/ }).click();
    await page.getByRole("listbox").waitFor();
    await page.screenshot({ path: shot(`area-picker-${tag}-${scheme}.png`) });
    await page.getByRole("option", { name: "Neutral – bottom" }).click();

    // 2. The editor's Age groups field, two groups chosen
    const field = page.getByRole("group", { name: "Age groups" });
    await field.scrollIntoViewIfNeeded();
    await field.getByRole("button", { name: "8U", exact: true }).click();
    await field.getByRole("button", { name: "10U", exact: true }).click();
    await page.screenshot({ path: shot(`age-field-${tag}-${scheme}.png`) });
    await overflow(page, `${scheme} ${tag} editor`);

    // 3. The library filtered to 8U (the starters are seeded on first load)
    await page.goto(BASE + "#/library");
    await page.getByText("Keep-Away in a Box").first().waitFor({ timeout: 20000 });
    await ageChip(page, "8U").click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: shot(`library-8u-${tag}-${scheme}.png`), fullPage: true });
    await overflow(page, `${scheme} ${tag} library`);

    // 4. The template picker: the remembered 8U carries over, then All ages
    await page.goto(BASE + "#/import");
    await page.getByRole("heading", { name: "Start from a template" }).waitFor();
    await page.screenshot({ path: shot(`templates-8u-${tag}-${scheme}.png`), fullPage: true });
    await ageChip(page, "All ages").click();
    await overflow(page, `${scheme} ${tag} templates`);

    // 5. Each new template: saved, its session page (station map), its printed bench sheet
    for (const [name, slug] of TEMPLATES) {
      await page.goto(BASE + "#/import");
      await page.getByRole("button", { name: `Use template: ${name}` }).click();
      await page.getByRole("button", { name: /save to my practices/i }).click();
      await page.waitForURL(/#\/sessions\/[^/]+$/, { timeout: 20000 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: shot(`${slug}-session-${tag}-${scheme}.png`), fullPage: true });
      await overflow(page, `${scheme} ${tag} ${slug} session`);
      const sessionUrl = page.url();
      await page.goto(sessionUrl + "/print");
      await page.getByRole("button", { name: "Print" }).waitFor({ timeout: 20000 });
      await page.waitForTimeout(1500);
      await page.emulateMedia({ media: "print" });
      await page.screenshot({ path: shot(`${slug}-bench-${tag}-${scheme}.png`), fullPage: true });
      await page.emulateMedia({ media: "screen" });
    }
    await ctx.close();
  }
}
await browser.close();
```

Run it from the harness folder with `CHROMIUM_PATH` set to the local Chromium headless shell and `OUT_DIR` set to the repository's `.cache/adm-style`: `node adm-style.mjs`.
Expected output: no `pageerror` line; every overflow is 0.

Read every PNG (desktop and mobile, light and dark). Check all of these, then fix in the owning task and re-run until they hold:
- `area-picker`: three headers (`Full and halves`, `Zones`, `Quarters`) above their options, the six quarter labels with their en dashes, `Custom area…` last; headers and options readable in dark.
- `age-field`: the `Age groups` label, six chips with 8U and 10U filled in the primary colour, the helper text below; under Focus and Goalies; no chip shorter than its neighbours on the phone.
- `library-8u`: the `Age` chip row under the Focus and Goalies rows with `8U` selected; only drills tagged 8U or untagged (for example `Keep-Away in a Box` and `Goalie Warm-Up`, never `Power-Play Umbrella`); chips wrap on the phone without overflow.
- `templates-8u`: the age row above the cards with `8U` selected, only `8U Station Practice` listed, its chips reading `60 min`, `5 drills`, `1 station block` and `6U, 8U`.
- `8u-session`: the station map shows four quarter outlines (left end top and bottom, neutral top, right end bottom) with no overlap, each labelled, the goalie station's net on the left goal line in the bottom quarter.
- `10u-session`: three quarters plus the whole neutral zone for the 3-on-3, no overlap.
- `12u-session`: the three zones, the goalie on angles in the left zone.
- `*-bench`: every quarter-ice drill's diagram is shaded outside its quarter, cross-ice nets face each other against the side boards, and the station block's rotation shows 10-minute rounds (8U, 10U) or 7-minute rounds (12U).
- Dark scheme: chips, headers and helper text use the dark palette; the ice is still light.

Stop the preview server.

- [ ] **Step 7: Commit any gate fixes**

Only if Steps 1–6 required changes. Stage the exact files by path:

```bash
/usr/bin/git add <the files you changed>
/usr/bin/git commit -m "fix(practice-planner): <what the gate caught>" -m "$SESSION_TRAILER"
```

---

## Self-Review

**Spec coverage:**

| Spec item | Task |
|---|---|
| Success 1 / R1: six quarter presets with the given columns and rows; existing presets unchanged; full rectangle table | 1 (`PRESET_RECTS`, `areaRect` tests per preset and for the six older ones) |
| R1: works on the board, station map, overlap warnings, thumbnails, bench sheet, exports | 1 (all go through `areaRect`; station-map, overlap, footprint and plan-file tests; `thumbnail-area` and `RinkBoard.ice-area` suites stay green), 7 (bench sheet and station map screenshots) |
| R1: labels; picker groups `Full and halves`, `Zones`, `Quarters` | 1 |
| R1: versions unchanged; older builds; ADR-0020 amendment | 1 (amendment records the real older-build behaviour; `areaRect` fallback), 3 (IndexedDB bump) |
| R2: values, labels, classification mapping, shape, order, `[]` = all ages | 2 (`age-groups.ts` and its tests) |
| R2 hosted: column, hand-written migration, CHECK, Zod on writes; create, update, duplicate (the copy service), import carry the field | 2 (create, update, read, list, session drills, copy service, queries), 3 (import) |
| R2 static: records gain the field; older records read `[]`; missing on update = unchanged; IndexedDB bump with a no-op upgrade | 3 |
| R2 plan document: optional `ageGroups`, unknown value rejected with a "Drill N" issue, older file imports with `[]`; ADR amendment | 3 |
| R2 catalog: `StarterPlay` and `StarterTemplate` gain `ageGroups`; a template's ages are its own | 4 |
| Success 2: every starter drill and template tagged; coaches tag their own drills in both apps; plan files carry the tags | 4 (tables pinned in tests), 6 (editor field and every save path), 3 (plan files) |
| R3 / success 3: one `AgeFilter`, chips All ages … 16U+, single choice, 44 px, palette tokens; match rule; library (both apps), drill picker, template picker; remembered per device in one key with try/catch; blocked storage = All ages; empty state with reset | 5 |
| R4: Age groups multi-select chips next to Focus and Goalies with the helper text; saves through the existing paths | 6 |
| R5 / success 4: three templates (8U for 6U and 8U, 4 quarter stations every 10 min; 10U, 3 quarters and a 3v3 zone game every 10 min; 12U for 12U and 14U, three zone stations then a 4v4 cross-ice game); goalie station `stays`; about eight new drills on quarter or zone presets, original; catalog and template checks | 4 |
| R6: module locations, portability, line budgets | 1, 2 (ESLint block), 5, 6, 7 (portability and budget checks) |
| Success 5: existing drills, plans and files behave as before; older plan files import with no age groups | 1 (older presets unchanged), 2 (`drillTags` untouched, legacy rows read `[]`), 3 (older plan file, legacy device record, IndexedDB 3 → 4 keeps data) |
| Testing: areas (rectangles, unchanged presets, schema, station-map and overlap, plan round trip) | 1 |
| Testing: age groups (Zod values, duplicates, order, empty; migration vs schema incl. CHECK; actions; static store; plan file; match rule incl. untagged) | 2, 3 |
| Testing: filters (library, drill picker, template picker, remembered choice, blocked storage, empty state and reset) | 5 |
| Testing: catalog (template drills exist, age groups valid, areas on the rink, no overlap) | 4 |
| Testing: visual (light and dark, desktop and phone) | 7 |
| Out of scope (second symbol set, ages on practices or teams, third-party imports, other sports) | not touched |

**Spec gaps and conflicts, and how this plan rules on them:**
- **Starter count.** The spec says 29 starter drills; the code has 26 (`starter-plays.test.ts:262` pins 26). The plan counts from 26: 35 after Task 4.
- **Older builds and quarter areas.** The spec says an older build "rejects a diagram that uses a new preset … as with `curve`". The code does something else: `upgradePlayData` drops an unknown area (`dropInvalidArea`), so an older reader opens the drill as full ice; an old static tab could save it without its area; an old hosted tab receives the quarter from the updated server and can't draw it. The ADR-0020 amendment (Task 1) records that real behaviour; the IndexedDB bump (Task 3) makes old static tabs reload; `areaRect` now draws an unknown kind as full ice so the next additive value degrades instead of throwing.
- **A ninth drill.** The 8U template needs a goalie station on a quarter that follows the `stays` pattern, and every existing goalie drill uses the centre of a goal line, on the quarters' shared edge. `starter-goalie-quarter-station` (net on the goal line level with the bottom dot) fills that slot and is reused by 10U: nine new drills where the spec says "about eight".
- **12U rotation.** The spec's table shows no rotation ("—") for 12U, but `starter-templates.test.ts` requires every template to rotate at least one block and every station block to hold a goalie-required drill. The three zone stations rotate every 7 minutes with the goalie staying on angles; the 4-on-4 game is a single row after the block.
- **Net direction.** "Each drill passes the existing starter-catalog tests", but cross-ice games need nets against the side boards, which the existing "opens every net toward center ice" rule forbids. The rule is kept for goal-line nets and generalized for small-area nets (a multiple of 90°, mouth toward the middle of the drill's area); all 26 existing drills use goal-line nets, so their check is unchanged.
- **Ages on existing starters and templates.** The spec requires them but doesn't list them. The plan assigns them (Task 4 tables, pinned by tests): team systems and advanced goalie work 12U and up; core goalie drills, breakouts, weaves and passing lanes 10U and up; skating, stickhandling, shooting, protection and small-area battles all ages. The three existing templates: Skills Stations and Goalie & Skater Rotation 10U–16U+, Team Practice with Stations 12U–16U+.
- **Strictness of `ageGroups`.** The spec makes an unknown plan-file value an error (unlike the advisory `focus`/`goalies`). The plan applies the same rule to a repeated value and to a non-list, since R2 says "unique values"; order is normalized rather than refused ("kept in the table's order").
- **"Duplicate" action.** There is no duplicate-play action; the spec's "duplicate" is read as `duplicatePracticeSession` and the copy service it shares with materialize and detach (`cloneDrillsIntoSessions`), which the new-column guard test forces to carry the field.
- **Session drills.** `PlayEditor` is shared with the session drill dialog, so its field also appears there and saves through `saveSessionDrill`; session views and exports carry the ages so plan files keep them. No session view displays them (out of scope: ages on practices).
- **Hosted hydration.** Remembering the filter on the device means the hosted library hydrates with All ages and then switches to the remembered age, so two loads can be in flight. The plan adds a latest-load guard to `PlayLibrary` (Review Focus 2).
- **Template ages chip.** Not in the spec; each template card shows its ages (`6U, 8U` / `All ages`) so a filtered list explains itself. One chip, no new interaction.
- **Area picker headers.** MUI 7 gives a `ListSubheader` inside a `Select` the role `option`; clicking one changes nothing (verified), and the picker test pins that.
- **Task order.** The catalog (Task 4) comes before the filter (Task 5) because the filter reads starter and template ages; the editor field (Task 6) comes last because the stores it saves through are finished in Tasks 2 and 3.

**Placeholder scan:** none. Every code step carries the code; edits to existing files quote the exact old text or name the exact line and content to add. The only `<…>` text is in Task 7's gate-fix commit template. `SESSION_TRAILER`, `CHROMIUM_PATH` and `OUT_DIR` are read from the environment on purpose.

**Type consistency:**
- `AgeGroup`, `AGE_GROUPS`, `AGE_GROUP_LABELS` and the copy constants are defined once in `lib/utils/age-groups.ts` (Task 2) and imported everywhere after it; `types/practice-planner.ts`, `lib/planner-store/types.ts`, `apps/planner/src/store/records.ts`, `types.ts`, `bench-sheet-model.ts`, `session-drill-ids.ts`, `SessionDrillDialog.tsx`, `starter-plays.ts` and `starter-templates.ts` import the type only.
- The field is `ageGroups` (a list) on every record, input and result; the library query's single value is `ageGroup` (hosted `getPlaysByTeamSchema`, `LibraryQuery`, the static filter and `PlayLibrary`'s `LibraryFilters`).
- `toAgeGroups(value: unknown): AgeGroup[]` is the lenient reader on every read path (hosted actions and queries, static summary, views and exports, `serializePlan`, `PlayEditor`'s initial state); `ageGroupsSchema` is the strict writer (hosted Zod schemas, `checkedAgeGroups` in the static store, `planAgeGroupsSchema` in the document).
- `matchesAgeGroup(groups, filter: AgeGroup | null)` is called by the static store (Task 3), `PlayLibrary`'s starter list (Task 5) and `StarterTemplatePicker` (Task 5) with `null` for All ages; `useAgeFilter` returns `AgeGroup | null` in the same convention.
- `StarterPlay.ageGroups` and `StarterTemplate.ageGroups` are `readonly AgeGroup[]` (Task 4); they are copied (`[...starter.ageGroups]`) where a mutable list is stored (Task 4) and passed as-is to `PlanDrillInput.ageGroups?: readonly AgeGroup[]` (Task 3) and `matchesAgeGroup` (Task 5).
- `AgeFilter`/`AgeFilterEmpty` (Task 5) and `AgeGroupsField` (Task 6) take the props their tests render them with.

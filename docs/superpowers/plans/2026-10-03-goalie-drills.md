# Goaltender-Aware Drills and an Expanded Starter Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drills carry `focus`/`goalies` tags, sessions carry an optional goalie count with advisory warnings and render-time goalie-marker hiding, the plan document carries all three, and both planners ship 17 new starter drills plus 3 station templates.

**Architecture:**
- A pure vocabulary layer is shared by both deployables: `types/practice-planner.ts`, `lib/utils/drill-tags.ts`, `lib/utils/session-timeline.ts` and `lib/plan-document/`.
- Hosted persists through two string columns with CHECK constraints and one nullable int, added by a hand-written migration, plus the existing server actions.
- The static app persists in its IndexedDB records. Fields are optional there, and every read applies defaults.
- The shared components (`PlayEditor`, `PlayLibrary`, the session editor, the detail view, the bench sheet and exports) read the tags.
- Starter content and templates are plain data in `lib/data/`.

**Tech Stack:** TypeScript (strict), Next.js 16 App Router, React 19, MUI v7, Prisma 7 (Neon/PostgreSQL), Zod v4, Vite (static planner), Vitest + Testing Library, fake-indexeddb, Bun.

**Spec:** `docs/superpowers/specs/2026-10-03-goalie-drills-design.md`. Its rulings R1–R14 are referenced below.

## Global Constraints

- Use `bun` for every script (`bun run …`), never npm or yarn.
- Use `/usr/bin/git`. Never `git stash`. Never switch branches (work on `feat/goalie-drills`). Stage files by path, never `git add -A` or `git add .`, because `next dev` can rewrite `CLAUDE.md`.
- Never run `prisma migrate dev`, `db:migrate`, `db:push` or `db:migrate:reset`. The migration is hand-written; `bun run db:generate` is the only Prisma command used locally.
- Migration folder: `prisma/migrations/20261003140000_play_drill_tags_and_session_goalies/`.
- `focus` ∈ `team | skaters | goalies`, default `team`. `goalies` ∈ `none | optional | required`, default `optional`. `goaliesAttending` is an integer from 0 to 10, or `null` (not set).
- `PLAN_VERSION` stays `1`. The new plan fields are additive.
- `components/features/practice-planner/PracticeSessionEditor.tsx` must stay at or under 900 lines (`PracticeSessionEditor.line-budget.test.ts`).
- Every starter description is 21–500 characters. 500 is `PlayEditor`'s description limit, so a coach can re-save a copied starter.
- No new runtime dependencies. No raw SQL outside the migration file (ADR-0003, `bun run check:raw-sql`). MUI is the only component library (ADR-0004).
- Copy, exactly:
  - `GOALIES_ATTENDING_MESSAGE` = `Goalies attending must be a whole number from 0 to 10`
  - badge `aria-label` = `Needs a goalie`
  - field label = `Goalies attending`; its empty option = `Not set`
  - picker heading = `Start from a template`; card button = `Use template`; practice-list button = `Use a template`
  - warnings: built only by `goalieShortMessage`, `goaliesUnusedMessage` and `goalieShortSummary` (Task 1)
- Advisory goalie warnings never block a save, in either app.
- Commit trailer, on its own paragraph: `Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX`

## Review Focus

1. **An autosave from an editor tab opened before this change** omits `goaliesAttending`. It must leave the stored count unchanged; only an explicit `null` clears it. Tests: Task 2 (hosted `updatePracticeSession`) and Task 5 (static `updateSession`).
2. **Changing a library filter while on page 3** must reset to page 1, so a filtered result never shows an empty page with a wrong total. Test: Task 6 (`PlayLibrary` filters).
3. **A static device that already has the 9 original starters** gets only the 17 new ones on upgrade:
   - a starter the coach deleted never comes back;
   - a coach drill with a new starter's name blocks that starter and still marks it seeded.

   Test: Task 5 (seeding).
4. **A plan file from another build** with `focus: "both"` or `goaliesAttending: 11` must still open, with defaults, and never fail validation. Test: Task 1 (plan document).
5. **Plan JSON exported with 0 goalies attending** must keep the `G` markers; only the bench sheet, its exports and the detail view hide them. Tests: Task 1 (`buildPlanDocument`) and Task 7 (HTML export model).

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `types/practice-planner.ts` | `PLAY_FOCUS`, `PLAY_GOALIES`, defaults, `MAX_GOALIES_ATTENDING`; optional tag fields on the portable types | 1 |
| `lib/utils/drill-tags.ts` (new) | labels, readers (`toPlayFocus`, `drillTags`, `toGoaliesAttending`), marker rule (`withoutGoalies`, `displayPlayData`, `sessionForDisplay`), `goalieDemand` | 1 |
| `lib/utils/session-timeline.ts` | `goalieWarnings` and its message helpers | 1 |
| `lib/utils/validation.ts` | Zod fields on the play, library and session schemas | 1 |
| `lib/utils/session-drill-ids.ts` | `SessionDrillPatch` tags | 1 |
| `lib/planner-store/types.ts` | `LibraryPlaySummary`, `NewLibraryPlay`, `SessionDrillSave` and `LibraryQuery` tags | 1 |
| `lib/plan-document/document.ts` | additive plan fields | 1 |
| `components/features/practice-planner/ExportPlanMenu.tsx`, `export/bench-sheet-model.ts` | serializer and `ExportSession` types | 1 |
| `docs/adr/0020-…md` | amendment | 1 |
| `prisma/schema.prisma`, migration, `__tests__/prisma/play-drill-tags-migration.test.ts` | hosted columns | 2 |
| `lib/actions/plays.ts`, `lib/services/practice-session-drills.ts`, `lib/actions/practice-session-drills.ts`, `lib/actions/practice-sessions.ts`, `lib/actions/practice-session-queries.ts`, `lib/actions/practice-plan-import.ts`, hosted wrappers | hosted copy paths (spec R4) | 2 |
| `lib/data/starter-plays.ts` | builders, tags on the 9 originals, 9 goalie drills | 3 |
| `lib/data/starter-plays.ts`, `lib/data/starter-templates.ts` (new) | 8 skater drills, 3 templates | 4 |
| `apps/planner/src/store/{records,types,shared,library,sessions}.ts`, `screens/{SessionEditorScreen,DrillEditorScreen}.tsx` | static copy paths, filters, seeding by id | 5 |
| `components/features/practice-planner/{GoalieBadge,DrillFilterChips}.tsx` (new), `PlayEditor.tsx`, `PlayLibrary.tsx`, `SessionDrillCard.tsx`, `SessionDrillDialog.tsx`, `useSessionDrillDialog.ts`, `PracticeSessionEditor.tsx` (`handleAddPlayFromLibrary`), `app/(dashboard)/practice-planner/library/PlayEditorWrapper.tsx` | drill UI | 6 |
| `components/features/practice-planner/{GoaliesAttendingField.tsx,useGoaliesAttending.ts}` (new), `PracticeSessionEditor.tsx`, `SessionDrillList.tsx`, `SessionDetailView.tsx`, `print/BenchSheet.tsx`, `export/bench-sheet-model.ts` | session UI, warnings, hidden markers | 7 |
| `components/features/practice-planner/StarterTemplatePicker.tsx` (new), `PlanImportView.tsx`, `apps/planner/src/screens/{ImportScreen,SessionListScreen}.tsx`, `app/(dashboard)/practice-planner/PracticePlannerList.tsx` | "Use template" | 8 |

---

### Task 1: Vocabulary, helpers, warnings, schemas, plan document and ADR amendment

The pure layer that every later task imports. No component or persistence behaviour changes yet, except that the plan document now writes three more fields.

**Files:**
- Modify: `types/practice-planner.ts`
- Create: `lib/utils/drill-tags.ts`
- Modify: `lib/utils/session-timeline.ts` (append after `stationWarnings`)
- Modify: `lib/utils/validation.ts:1-5` (imports), `:1283-1318` (play schemas), `:1368-1394` (session schemas), `:1421-1429` (`saveSessionDrillSchema`), `:1443` (`CreatePlayInput`)
- Modify: `lib/utils/session-drill-ids.ts:28-34`
- Modify: `lib/planner-store/types.ts`
- Modify: `lib/plan-document/document.ts`
- Modify: `components/features/practice-planner/ExportPlanMenu.tsx:42-67`
- Modify: `components/features/practice-planner/export/bench-sheet-model.ts:17-37`
- Modify: `docs/adr/0020-exchange-practice-plans-as-a-portable-versioned-document-and-ship-a-static-local.md`
- Test (create): `__tests__/lib/utils/drill-tags.test.ts`
- Test (append): `__tests__/lib/utils/session-timeline.test.ts`, `__tests__/lib/utils/validation-practice-session.test.ts`, `__tests__/lib/plan-document/document.test.ts`, `__tests__/components/features/practice-planner/ExportPlanMenu.test.tsx`

**Interfaces:**
- Produces, from `types/practice-planner.ts`:
  - `PLAY_FOCUS`, `PlayFocus`, `PLAY_GOALIES`, `PlayGoalies`;
  - `DEFAULT_PLAY_FOCUS = "team"`, `DEFAULT_PLAY_GOALIES = "optional"`, `MAX_GOALIES_ATTENDING = 10`;
  - optional `focus?`/`goalies?` on `PlayInSession`, `SavedPlay` and `PracticeSessionViewPlay["play"]`;
  - optional `goaliesAttending?: number | null` on `PracticeSessionData` and `PracticeSessionView`.
- Produces, from `lib/utils/drill-tags.ts`:
  - `FOCUS_LABELS`, `GOALIES_LABELS`, `GOALIES_ATTENDING_MESSAGE`;
  - `toPlayFocus(v: unknown): PlayFocus`, `toPlayGoalies(v: unknown): PlayGoalies`;
  - `drillTags(x): { focus; goalies }`, `toGoaliesAttending(v: unknown): number | null`;
  - `goalieMarkerCount(pd)`, `withoutGoalies(pd)`, `hidesGoalieMarkers(attending, goalies)`;
  - `displayPlayData(pd, goalies, attending)`, `sessionForDisplay(session)`, `goalieDemand(drill)`.
- Produces, from `lib/utils/session-timeline.ts`:
  - `GoalieNeeds`, `GoalieShortfall`, `GoalieWarnings`;
  - `goalieWarnings(groups, attending)`;
  - `goalieShortMessage(needed, attending, stations)`, `goaliesUnusedMessage(attending)`, `goalieShortSummary(count, attending)`.
- Produces, from `lib/plan-document`: `PlanSessionInput.goaliesAttending?`, drill `focus?`/`goalies?`; `PlanDocument` drill `focus`/`goalies` and session `goaliesAttending`; `PlanEditorDrill.focus/goalies`; `PlanEditorSession.goaliesAttending`.
- Produces, from `lib/planner-store`: `LibraryQuery.focus?`/`goalies?`; `LibraryPlaySummary`, `NewLibraryPlay` and `SessionDrillSave` `focus?`/`goalies?`.

- [ ] **Step 1: Write the failing helper tests**

Create `__tests__/lib/utils/drill-tags.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
    FOCUS_LABELS,
    GOALIES_LABELS,
    displayPlayData,
    drillTags,
    goalieDemand,
    goalieMarkerCount,
    hidesGoalieMarkers,
    sessionForDisplay,
    toGoaliesAttending,
    toPlayFocus,
    toPlayGoalies,
    withoutGoalies,
} from "@/lib/utils/drill-tags";
import { PLAY_FOCUS, PLAY_GOALIES, type PlayData } from "@/types/practice-planner";
import { createEmptyPlayData } from "@/lib/utils/play-data";

const BOARD: PlayData = {
    ...createEmptyPlayData(),
    players: [
        { id: "g", role: "G", label: "G", position: { x: 14, y: 42.5 }, color: "#212121" },
        { id: "f", role: "F", label: "F1", position: { x: 40, y: 42.5 }, color: "#1976D2" },
    ],
    equipment: [{ id: "n", kind: "net", position: { x: 11, y: 42.5 }, rotation: 180 }],
};

describe("tag readers", () => {
    it("accept every known value and default anything else", () => {
        for (const focus of PLAY_FOCUS) expect(toPlayFocus(focus)).toBe(focus);
        for (const goalies of PLAY_GOALIES) expect(toPlayGoalies(goalies)).toBe(goalies);
        expect(toPlayFocus("keepers")).toBe("team");
        expect(toPlayFocus(undefined)).toBe("team");
        expect(toPlayGoalies(null)).toBe("optional");
        expect(drillTags({})).toEqual({ focus: "team", goalies: "optional" });
        expect(drillTags(null)).toEqual({ focus: "team", goalies: "optional" });
        expect(drillTags({ focus: "goalies", goalies: "required" })).toEqual({ focus: "goalies", goalies: "required" });
    });

    it("labels every value", () => {
        expect(Object.keys(FOCUS_LABELS)).toEqual([...PLAY_FOCUS]);
        expect(Object.keys(GOALIES_LABELS)).toEqual([...PLAY_GOALIES]);
    });

    it("reads a goalie count as a whole number from 0 to 10, else null", () => {
        expect([0, 1, 10].map(toGoaliesAttending)).toEqual([0, 1, 10]);
        expect([-1, 11, 1.5, "2", null, undefined, Number.NaN].map(toGoaliesAttending)).toEqual([null, null, null, null, null, null, null]);
    });
});

describe("goalie markers", () => {
    it("withoutGoalies drops only role-G players and leaves the input untouched", () => {
        const shown = withoutGoalies(BOARD);
        expect(shown.players.map((p) => p.id)).toEqual(["f"]);
        expect(shown.equipment).toBe(BOARD.equipment);
        expect(BOARD.players).toHaveLength(2);
    });

    it("hides markers only when 0 goalies attend an optional-goalie drill", () => {
        expect(hidesGoalieMarkers(0, "optional")).toBe(true);
        expect(hidesGoalieMarkers(0, undefined)).toBe(true); // untagged reads as optional
        expect(hidesGoalieMarkers(0, "required")).toBe(false);
        expect(hidesGoalieMarkers(0, "none")).toBe(false);
        expect(hidesGoalieMarkers(1, "optional")).toBe(false);
        expect(hidesGoalieMarkers(null, "optional")).toBe(false);
        expect(hidesGoalieMarkers(undefined, "optional")).toBe(false);
    });

    it("displayPlayData returns the same object unless markers are hidden", () => {
        expect(displayPlayData(BOARD, "optional", 1)).toBe(BOARD);
        expect(displayPlayData(BOARD, "required", 0)).toBe(BOARD);
        expect(displayPlayData(null, "optional", 0)).toBeNull();
        const noGoalie = withoutGoalies(BOARD);
        expect(displayPlayData(noGoalie, "optional", 0)).toBe(noGoalie);
        expect(displayPlayData(BOARD, "optional", 0)?.players.map((p) => p.role)).toEqual(["F"]);
    });

    it("sessionForDisplay keeps the session object when nothing is hidden", () => {
        const session = { goaliesAttending: null, plays: [{ play: { goalies: "optional" as const, playData: BOARD } }] };
        expect(sessionForDisplay(session)).toBe(session);
        const zero = { ...session, goaliesAttending: 0 };
        const shown = sessionForDisplay(zero);
        expect(shown).not.toBe(zero);
        expect(shown.plays[0].play.playData?.players).toHaveLength(1);
        expect(zero.plays[0].play.playData.players).toHaveLength(2);
    });
});

describe("goalieDemand", () => {
    it("is 0 unless the drill needs goalies, then one per G marker (at least one)", () => {
        expect(goalieDemand({ goalies: "optional", playData: BOARD })).toBe(0);
        expect(goalieDemand({ goalies: "none", playData: BOARD })).toBe(0);
        expect(goalieDemand({ goalies: "required", playData: createEmptyPlayData() })).toBe(1);
        expect(goalieDemand({ focus: "goalies", goalies: "optional", playData: BOARD })).toBe(1);
        const two = { ...BOARD, players: [...BOARD.players, { ...BOARD.players[0], id: "g2", position: { x: 186, y: 42.5 } }] };
        expect(goalieMarkerCount(two)).toBe(2);
        expect(goalieDemand({ goalies: "required", playData: two })).toBe(2);
        expect(goalieDemand({ goalies: "required", playData: null })).toBe(1);
    });
});
```

Append to `__tests__/lib/utils/session-timeline.test.ts`. Update the imports:
- add `goalieShortMessage, goalieShortSummary, goalieWarnings, goaliesUnusedMessage, type GoalieNeeds` to the existing `@/lib/utils/session-timeline` import;
- extend the existing `import type { IceArea } from "@/types/practice-planner"` to `import type { IceArea, PlayData, PlayFocus, PlayGoalies } from "@/types/practice-planner"`, rather than adding a second import from the same module;
- add the one new line below.

```ts
import { createEmptyPlayData } from "@/lib/utils/play-data";

describe("goalieWarnings", () => {
    const G: PlayData = {
        ...createEmptyPlayData(),
        players: [{ id: "g", role: "G", label: "G", position: { x: 14, y: 42.5 }, color: "#212121" }],
    };
    type Drill = TimelinePlay & GoalieNeeds;
    const drill = (sequence: number, goalies: PlayGoalies, runsWithPrevious = false, playData: PlayData | null = G, focus?: PlayFocus): Drill =>
        ({ sequence, duration: 10, runsWithPrevious, goalies, focus, playData });
    const warn = (plays: Drill[], attending: number | null) => goalieWarnings(groupStations(plays), attending);

    it("is silent when the count is not set", () => {
        expect(warn([drill(0, "required")], null)).toEqual({ short: [], unused: false });
    });

    it("flags a required drill when no goalie attends", () => {
        expect(warn([drill(0, "required"), drill(1, "optional")], 0)).toEqual({
            short: [{ groupIndex: 0, sequences: [0], needed: 1 }],
            unused: false,
        });
    });

    it("sums demand across stations that run together", () => {
        const plays = [drill(0, "required"), drill(1, "required", true), drill(2, "optional", true)];
        expect(warn(plays, 1).short).toEqual([{ groupIndex: 0, sequences: [0, 1], needed: 2 }]);
        expect(warn(plays, 2).short).toEqual([]);
    });

    it("counts a goalie-focus drill as needing a goalie even when tagged optional", () => {
        expect(warn([drill(0, "optional", false, G, "goalies")], 0).short).toHaveLength(1);
    });

    it("needs one goalie per G marker, and one for an unreadable diagram", () => {
        const two: PlayData = { ...G, players: [...G.players, { ...G.players[0], id: "g2", position: { x: 186, y: 42.5 } }] };
        expect(warn([drill(0, "required", false, two)], 1).short).toEqual([{ groupIndex: 0, sequences: [0], needed: 2 }]);
        expect(warn([drill(0, "required", false, null)], 0).short[0].needed).toBe(1);
    });

    it("notices goalies attending when no drill uses one", () => {
        expect(warn([drill(0, "none"), drill(1, "none")], 2)).toEqual({ short: [], unused: true });
        expect(warn([drill(0, "none"), drill(1, "optional")], 2).unused).toBe(false);
        expect(warn([drill(0, "none")], 0).unused).toBe(false);
        expect(warn([], 2).unused).toBe(false);
    });

    it("words the drill, block, session and summary messages", () => {
        expect(goalieShortMessage(1, 0, false)).toBe("Needs a goalie — none attending");
        expect(goalieShortMessage(2, 1, false)).toBe("Needs 2 goalies — 1 attending");
        expect(goalieShortMessage(3, 2, true)).toBe("These stations need 3 goalies — 2 attending");
        expect(goalieShortMessage(1, 0, true)).toBe("These stations need 1 goalie — none attending");
        expect(goaliesUnusedMessage(1)).toBe("1 goalie attending, but no drill uses a goalie");
        expect(goaliesUnusedMessage(2)).toBe("2 goalies attending, but no drill uses a goalie");
        expect(goalieShortSummary(1, 0)).toBe("1 drill or station block needs a goalie, but none are attending");
        expect(goalieShortSummary(2, 1)).toBe("2 drills or station blocks need more goalies than the 1 attending");
    });
});
```

- [ ] **Step 2: Write the failing schema and plan-document tests**

Append to `__tests__/lib/utils/validation-practice-session.test.ts`. Merge `createPlaySchema`, `getPlaysByTeamSchema` and `updatePlaySchema` into the file's existing `@/lib/utils/validation` import, which already has `updatePracticeSessionSchema`. Add the two other imports at the top:

```ts
import { GOALIES_ATTENDING_MESSAGE } from "@/lib/utils/drill-tags";
import { createEmptyPlayData } from "@/lib/utils/play-data";

describe("goaltender fields", () => {
    const CUID = "cjld2cjxh0000qzrmn831i7rn";

    it("createPlaySchema defaults focus and goalies", () => {
        const parsed = createPlaySchema.parse({ name: "Drill", teamId: CUID, playData: createEmptyPlayData() });
        expect([parsed.focus, parsed.goalies]).toEqual(["team", "optional"]);
    });

    it("updatePlaySchema leaves omitted tags undefined, meaning unchanged", () => {
        const parsed = updatePlaySchema.parse({ id: CUID, name: "Drill", teamId: CUID, playData: createEmptyPlayData() });
        expect(parsed.focus).toBeUndefined();
        expect(parsed.goalies).toBeUndefined();
    });

    it("rejects unknown tag values", () => {
        expect(createPlaySchema.safeParse({ name: "D", teamId: CUID, playData: createEmptyPlayData(), focus: "keepers" }).success).toBe(false);
        expect(getPlaysByTeamSchema.safeParse({ teamId: CUID, goalies: "maybe" }).success).toBe(false);
    });

    it("accepts library filters", () => {
        expect(getPlaysByTeamSchema.parse({ teamId: CUID, focus: "goalies", goalies: "required" })).toMatchObject({ focus: "goalies", goalies: "required" });
    });

    it("accepts a goalie count of 0–10 or null, and leaves it undefined when omitted", () => {
        const base = { id: CUID, title: "Practice", date: "2026-10-06T23:00:00.000Z", duration: 60, teamId: CUID };
        expect(updatePracticeSessionSchema.parse({ ...base, goaliesAttending: 0 }).goaliesAttending).toBe(0);
        expect(updatePracticeSessionSchema.parse({ ...base, goaliesAttending: null }).goaliesAttending).toBeNull();
        expect(updatePracticeSessionSchema.parse(base).goaliesAttending).toBeUndefined();
        for (const bad of [-1, 11, 2.5]) {
            const result = updatePracticeSessionSchema.safeParse({ ...base, goaliesAttending: bad });
            expect(result.success ? [] : result.error.issues.map((issue) => issue.message)).toEqual([GOALIES_ATTENDING_MESSAGE]);
        }
    });
});
```

Append to `__tests__/lib/plan-document/document.test.ts`. That file already defines `input` and `NOW`, so this block uses `goalieInput`:

```ts
describe("goaltender fields (additive, version 1)", () => {
    function goalieInput(extra: Partial<PlanSessionInput> = {}): PlanSessionInput {
        return {
            title: "Goalie night",
            durationMinutes: 30,
            date: null,
            startTime: null,
            drills: [
                { sequence: 0, duration: 10, runsWithPrevious: false, instructions: null, name: "Warm-up", description: null, playData: null, focus: "goalies", goalies: "required" },
                { sequence: 1, duration: 10, runsWithPrevious: false, instructions: null, name: "Weave", description: null, playData: null },
            ],
            ...extra,
        };
    }

    it("serializes the tags (defaults when absent) and the count (null when unset)", () => {
        const doc = serializePlan(goalieInput({ goaliesAttending: 2 }), "openleague-static", NOW);
        expect(doc.session.goaliesAttending).toBe(2);
        expect(doc.session.drills.map((d) => [d.drill.focus, d.drill.goalies])).toEqual([["goalies", "required"], ["team", "optional"]]);
        expect(serializePlan(goalieInput(), "openleague-static", NOW).session.goaliesAttending).toBeNull();
    });

    it("round-trips through parsePlan", () => {
        const doc = serializePlan(goalieInput({ goaliesAttending: 0 }), "openleague-hosted", NOW);
        expect(parsePlan(JSON.parse(JSON.stringify(doc)))).toEqual({ ok: true, plan: doc });
    });

    it("reads an older v1 file without the fields using the defaults", () => {
        const raw = JSON.parse(JSON.stringify(serializePlan(goalieInput({ goaliesAttending: 3 }), "openleague-static", NOW)));
        delete raw.session.goaliesAttending;
        for (const d of raw.session.drills) {
            delete d.drill.focus;
            delete d.drill.goalies;
        }
        const result = parsePlan(raw);
        expect(result.ok && result.plan.session.goaliesAttending).toBeNull();
        expect(result.ok && result.plan.session.drills.map((d) => [d.drill.focus, d.drill.goalies])).toEqual([
            ["team", "optional"],
            ["team", "optional"],
        ]);
    });

    it("never rejects a plan for an unrecognized tag or count", () => {
        const raw = JSON.parse(JSON.stringify(serializePlan(goalieInput(), "openleague-static", NOW)));
        raw.session.goaliesAttending = 11;
        raw.session.drills[0].drill.focus = "both";
        raw.session.drills[0].drill.goalies = 3;
        const result = parsePlan(raw);
        expect(result.ok).toBe(true);
        expect(result.ok && [result.plan.session.goaliesAttending, result.plan.session.drills[0].drill.focus, result.plan.session.drills[0].drill.goalies])
            .toEqual([null, "team", "optional"]);
    });

    it("carries the fields into the editor mapping", () => {
        const editor = planToEditorSession(serializePlan(goalieInput({ goaliesAttending: 1 }), "openleague-static", NOW));
        expect(editor.goaliesAttending).toBe(1);
        expect(editor.plays[0]).toMatchObject({ focus: "goalies", goalies: "required" });
    });
});
```

In the same file, update the existing test `carries no ids, thumbnails or other extra fields`. The documented key sets gain the new fields:

```ts
        expect(Object.keys(doc.session).sort()).toEqual(["date", "drills", "durationMinutes", "goaliesAttending", "startTime", "title"]);
        expect(Object.keys(doc.session.drills[0]).sort()).toEqual(["drill", "durationMinutes", "instructions", "runsWithPrevious", "sequence"]);
        expect(Object.keys(doc.session.drills[0].drill).sort()).toEqual(["description", "focus", "goalies", "name", "playData"]);
```

Append to `__tests__/components/features/practice-planner/ExportPlanMenu.test.tsx`:

```ts
describe("buildPlanDocument: goaltender fields", () => {
    it("writes the count and drill tags, and keeps goalie markers even when none attend", () => {
        const goalieBoard = {
            ...createEmptyPlayData(),
            players: [{ id: "g", role: "G" as const, label: "G", position: { x: 14, y: 42.5 }, color: "#212121" }],
        };
        const session: ExportableSession = {
            ...SESSION,
            goaliesAttending: 0,
            plays: [{ ...sessionPlay("Warm-up", 0), play: { name: "Warm-up", description: null, playData: goalieBoard, focus: "goalies", goalies: "optional" } }],
        };
        const doc = buildPlanDocument(session, NOW);
        expect(doc.session.goaliesAttending).toBe(0);
        expect(doc.session.drills[0].drill).toMatchObject({ focus: "goalies", goalies: "optional" });
        expect(doc.session.drills[0].drill.playData.players.map((p) => p.role)).toEqual(["G"]);
    });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bun run test __tests__/lib/utils/drill-tags.test.ts __tests__/lib/utils/session-timeline.test.ts __tests__/lib/utils/validation-practice-session.test.ts __tests__/lib/plan-document/document.test.ts __tests__/components/features/practice-planner/ExportPlanMenu.test.tsx`
Expected: FAIL, because `@/lib/utils/drill-tags` can't be resolved, `goalieWarnings` is not exported, and the schemas and documents lack the fields.

- [ ] **Step 4: Add the vocabulary to `types/practice-planner.ts`**

After the `EQUIPMENT_KINDS` / `EquipmentKind` lines, add:

```ts
// ============================================================================
// Drill tags and goalie count (goaltender-aware drills)
// ============================================================================

export const PLAY_FOCUS = ["team", "skaters", "goalies"] as const;
/** What a drill trains: team play, skater skills, or goaltending. */
export type PlayFocus = (typeof PLAY_FOCUS)[number];

export const PLAY_GOALIES = ["none", "optional", "required"] as const;
/** Whether a drill needs a goalie in net. */
export type PlayGoalies = (typeof PLAY_GOALIES)[number];

/** What an untagged drill (every drill saved before tags existed) reads as. */
export const DEFAULT_PLAY_FOCUS: PlayFocus = "team";
export const DEFAULT_PLAY_GOALIES: PlayGoalies = "optional";

/** A session's goalie count is a whole number from 0 to this, or null (not set). */
export const MAX_GOALIES_ATTENDING = 10;
```

Add the optional fields. Absent means the default (spec R3):

```ts
// In PlayInSession, after `playData: PlayData;`:
    focus?: PlayFocus;
    goalies?: PlayGoalies;

// In PracticeSessionData, after `isShared: boolean;`:
    /** Goalies expected at this practice; null or absent = not set (spec R6, R7). */
    goaliesAttending?: number | null;

// In PracticeSessionViewPlay.play, after `playData: PlayData | null;`:
        focus?: PlayFocus;
        goalies?: PlayGoalies;

// In PracticeSessionView, after `startAt?: string | null;`:
    goaliesAttending?: number | null;

// In SavedPlay, after `isTemplate: boolean; ...`:
    focus?: PlayFocus;
    goalies?: PlayGoalies;
```

- [ ] **Step 5: Create `lib/utils/drill-tags.ts`**

```ts
/**
 * Drill tags (focus, goalies) and the session goalie count (goaltender-aware
 * drills): labels, readers that fill in the defaults, and the render-time
 * goalie-marker rule. Pure: no React, server or DOM imports, so both
 * deployables, the server actions and the plan document share it.
 */
import {
    DEFAULT_PLAY_FOCUS,
    DEFAULT_PLAY_GOALIES,
    MAX_GOALIES_ATTENDING,
    PLAY_FOCUS,
    PLAY_GOALIES,
    type PlayData,
    type PlayFocus,
    type PlayGoalies,
} from "@/types/practice-planner";

export const FOCUS_LABELS: Record<PlayFocus, string> = {
    team: "Team",
    skaters: "Skaters",
    goalies: "Goalies",
};

export const GOALIES_LABELS: Record<PlayGoalies, string> = {
    none: "No goalie",
    optional: "Goalie optional",
    required: "Needs goalie",
};

export const GOALIES_ATTENDING_MESSAGE = `Goalies attending must be a whole number from 0 to ${MAX_GOALIES_ATTENDING}`;

/** A known focus, else the default (a database string, a legacy record, a plan file). */
export function toPlayFocus(value: unknown): PlayFocus {
    return (PLAY_FOCUS as readonly unknown[]).includes(value) ? (value as PlayFocus) : DEFAULT_PLAY_FOCUS;
}

/** A known goalies value, else the default. */
export function toPlayGoalies(value: unknown): PlayGoalies {
    return (PLAY_GOALIES as readonly unknown[]).includes(value) ? (value as PlayGoalies) : DEFAULT_PLAY_GOALIES;
}

/** Both tags with the defaults filled in. */
export function drillTags(source: { focus?: unknown; goalies?: unknown } | null | undefined): { focus: PlayFocus; goalies: PlayGoalies } {
    return { focus: toPlayFocus(source?.focus), goalies: toPlayGoalies(source?.goalies) };
}

/** A whole number from 0 to MAX_GOALIES_ATTENDING, else null (not set). */
export function toGoaliesAttending(value: unknown): number | null {
    return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_GOALIES_ATTENDING ? value : null;
}

export function goalieMarkerCount(playData: PlayData): number {
    return playData.players.filter((player) => player.role === "G").length;
}

/** The diagram without its role-G players. Strokes, nets and notes stay. Never mutates. */
export function withoutGoalies(playData: PlayData): PlayData {
    return { ...playData, players: playData.players.filter((player) => player.role !== "G") };
}

/** Goalie markers are hidden only when the coach said no goalies are coming and the drill doesn't need one. */
export function hidesGoalieMarkers(goaliesAttending: number | null | undefined, goalies: PlayGoalies | undefined): boolean {
    return goaliesAttending === 0 && toPlayGoalies(goalies) === "optional";
}

/** The diagram as the session views draw it. The same object unless markers are actually hidden. */
export function displayPlayData<T extends PlayData | null>(
    playData: T,
    goalies: PlayGoalies | undefined,
    goaliesAttending: number | null | undefined,
): T {
    if (!playData || !hidesGoalieMarkers(goaliesAttending, goalies) || goalieMarkerCount(playData) === 0) return playData;
    return withoutGoalies(playData) as T;
}

interface DisplayablePlay {
    play: { goalies?: PlayGoalies; playData: PlayData | null };
}

/**
 * The session with every drill's diagram passed through displayPlayData.
 * Render-time only (spec R7): never stored, never exported as plan JSON.
 * Returns the session itself when nothing is hidden, so memos stay stable.
 */
export function sessionForDisplay<S extends { goaliesAttending?: number | null; plays: readonly DisplayablePlay[] }>(session: S): S {
    let changed = false;
    const plays = session.plays.map((sp) => {
        const shown = displayPlayData(sp.play.playData, sp.play.goalies, session.goaliesAttending);
        if (shown === sp.play.playData) return sp;
        changed = true;
        return { ...sp, play: { ...sp.play, playData: shown } };
    });
    return changed ? ({ ...session, plays } as S) : session;
}

/**
 * Goalies a drill needs in net: 0 unless it is tagged required or is goalie
 * focused; then one per G marker (at least one), and one when unreadable.
 */
export function goalieDemand(drill: { focus?: PlayFocus; goalies?: PlayGoalies; playData: PlayData | null }): number {
    const { focus, goalies } = drillTags(drill);
    if (goalies !== "required" && focus !== "goalies") return 0;
    return drill.playData ? Math.max(1, goalieMarkerCount(drill.playData)) : 1;
}
```

- [ ] **Step 6: Add `goalieWarnings` to `lib/utils/session-timeline.ts`**

Replace the `import type { IceArea } …` line with:

```ts
import type { IceArea, PlayData, PlayFocus, PlayGoalies } from "@/types/practice-planner";
import { goalieDemand, toPlayGoalies } from "@/lib/utils/drill-tags";
```

Append at the end of the file:

```ts
// ---------------------------------------------------------------------------
// Goalie warnings (advisory, never block a save)
// ---------------------------------------------------------------------------

/** What the goalie warnings read from a drill. playData null = unreadable (needs one goalie if required). */
export interface GoalieNeeds {
    focus?: PlayFocus;
    goalies?: PlayGoalies;
    playData: PlayData | null;
}

export interface GoalieShortfall {
    /** The block (StationGroup.index) that needs more goalies than attend. */
    groupIndex: number;
    /** Sequences of the drills in that block that need a goalie. */
    sequences: number[];
    needed: number;
}

export interface GoalieWarnings {
    short: GoalieShortfall[];
    /** Goalies attend, but every drill is tagged "none". */
    unused: boolean;
}

/**
 * Blocks needing more goalies than attend. Stations in a block run at once,
 * so their demand adds up (goalieDemand per drill). A null count (not set)
 * warns about nothing.
 */
export function goalieWarnings(
    groups: StationGroup<TimelinePlay & GoalieNeeds>[],
    goaliesAttending: number | null | undefined,
): GoalieWarnings {
    if (goaliesAttending === null || goaliesAttending === undefined) return { short: [], unused: false };
    const short: GoalieShortfall[] = [];
    let drills = 0;
    let anyUsesGoalie = false;
    for (const group of groups) {
        let needed = 0;
        const sequences: number[] = [];
        for (const station of group.stations) {
            drills++;
            if (toPlayGoalies(station.goalies) !== "none") anyUsesGoalie = true;
            const demand = goalieDemand(station);
            if (demand > 0) {
                needed += demand;
                sequences.push(station.sequence);
            }
        }
        if (needed > goaliesAttending) short.push({ groupIndex: group.index, sequences, needed });
    }
    return { short, unused: goaliesAttending > 0 && drills > 0 && !anyUsesGoalie };
}

/** "Needs a goalie — none attending" (a drill) or "These stations need 3 goalies — 2 attending" (a block). */
export function goalieShortMessage(needed: number, attending: number, stations: boolean): string {
    const have = attending === 0 ? "none attending" : `${attending} attending`;
    if (stations) return `These stations need ${needed} ${needed === 1 ? "goalie" : "goalies"} — ${have}`;
    return `Needs ${needed === 1 ? "a goalie" : `${needed} goalies`} — ${have}`;
}

/** "2 goalies attending, but no drill uses a goalie". */
export function goaliesUnusedMessage(attending: number): string {
    return `${attending} ${attending === 1 ? "goalie" : "goalies"} attending, but no drill uses a goalie`;
}

/** The detail page's one-line summary of the shortfalls. */
export function goalieShortSummary(count: number, attending: number): string {
    const subject = count === 1 ? "1 drill or station block needs" : `${count} drills or station blocks need`;
    return attending === 0 ? `${subject} a goalie, but none are attending` : `${subject} more goalies than the ${attending} attending`;
}
```

`drill-tags.ts` imports only types, so the module graph has no cycle.

- [ ] **Step 7: Add the Zod fields to `lib/utils/validation.ts`**

Extend the imports at the top:

```ts
import { MAX_GOALIES_ATTENDING, PLAY_FOCUS, PLAY_GOALIES } from "@/types/practice-planner";
import { GOALIES_ATTENDING_MESSAGE } from "@/lib/utils/drill-tags";
```

Just above `export const createPlaySchema`, add:

```ts
// Drill tags and the session goalie count (goaltender-aware drills, spec R3).
const playFocusSchema = z.enum(PLAY_FOCUS);
const playGoaliesSchema = z.enum(PLAY_GOALIES);
const goaliesAttendingSchema = z
  .number({ message: GOALIES_ATTENDING_MESSAGE })
  .int(GOALIES_ATTENDING_MESSAGE)
  .min(0, GOALIES_ATTENDING_MESSAGE)
  .max(MAX_GOALIES_ATTENDING, GOALIES_ATTENDING_MESSAGE);
```

Add the fields:

```ts
// createPlaySchema: after `isTemplate: …,`
  focus: playFocusSchema.default("team"),
  goalies: playGoaliesSchema.default("optional"),

// updatePlaySchema: after `isTemplate: …,` (absent = unchanged)
  focus: playFocusSchema.optional(),
  goalies: playGoaliesSchema.optional(),

// getPlaysByTeamSchema: after `dateFilter: …,`
  focus: playFocusSchema.optional(),
  goalies: playGoaliesSchema.optional(),

// createPracticeSessionSchema and updatePracticeSessionSchema: after `plays: practiceSessionPlayItemsSchema,`
  // Absent = unchanged on update, null on create; null clears (spec R3).
  goaliesAttending: goaliesAttendingSchema.nullable().optional(),

// saveSessionDrillSchema: after `playData: playDataSchema,`
  // Absent: a new drill takes the defaults, an owned drill keeps its tags, a fork inherits its source's.
  focus: playFocusSchema.optional(),
  goalies: playGoaliesSchema.optional(),
```

Change `export type CreatePlayInput = z.infer<typeof createPlaySchema>;` to:

```ts
export type CreatePlayInput = z.input<typeof createPlaySchema>;
```

The defaulted tags (and `isTemplate`) are optional for callers. The action parses, so it still sees the output type.

- [ ] **Step 8: Extend the patch and store types**

In `lib/utils/session-drill-ids.ts`, change `SessionDrillPatch` to:

```ts
export type SessionDrillPatch = {
    playId: string;
    name: string;
    description: string;
    thumbnail: string;
    playData: PlayData;
    focus?: PlayFocus;
    goalies?: PlayGoalies;
};
```

Extend that file's `@/types/practice-planner` import with `PlayFocus, PlayGoalies`. `applyDrillPatch` spreads the patch, so it needs no change.

In `lib/planner-store/types.ts`, change the import to `import type { PlayData, PlayFocus, PlayGoalies } from "@/types/practice-planner";` and add:

```ts
// LibraryPlaySummary, after `thumbnail: string | null;`:
    focus?: PlayFocus;
    goalies?: PlayGoalies;

// LibraryQuery, after `dateFilter: LibraryDateFilter;`:
    /** Only drills with this focus (spec R8). */
    focus?: PlayFocus;
    /** Only drills with this goalies tag. */
    goalies?: PlayGoalies;

// NewLibraryPlay, after `playData: PlayData;`:
    focus?: PlayFocus;
    goalies?: PlayGoalies;

// SessionDrillSave, after `playData: PlayData;`:
    focus?: PlayFocus;
    goalies?: PlayGoalies;
```

- [ ] **Step 9: Add the plan-document fields in `lib/plan-document/document.ts`**

Imports:

```ts
import type { PlayData, PlayFocus, PlayGoalies } from "@/types/practice-planner";
import { drillTags, toGoaliesAttending, toPlayFocus, toPlayGoalies } from "@/lib/utils/drill-tags";
```

Above `const planDrillSchema`, add:

```ts
/**
 * Advisory fields (spec R13): missing, null or unrecognized reads as the
 * default, so a tag or a count never blocks opening a plan.
 */
const focusSchema = z.unknown().transform(toPlayFocus);
const goaliesSchema = z.unknown().transform(toPlayGoalies);
const goaliesAttendingSchema = z.unknown().transform(toGoaliesAttending);
```

In `planDrillSchema.drill`, add `focus: focusSchema, goalies: goaliesSchema,` after `description`. In `planSessionSchema`'s object, add `goaliesAttending: goaliesAttendingSchema,` after `startTime`.

Extend `PlanSessionInput`:

```ts
export interface PlanSessionInput {
    title: string;
    durationMinutes: number;
    date: string | null;
    startTime: string | null;
    /** null or absent = not set */
    goaliesAttending?: number | null;
    drills: Array<{
        sequence: number;
        duration: number;
        runsWithPrevious: boolean;
        instructions: string | null;
        name: string;
        description: string | null;
        /** Absent = the default tag */
        focus?: PlayFocus;
        goalies?: PlayGoalies;
        /** null = unreadable; exported as an empty board */
        playData: PlayData | null;
    }>;
}
```

In `serializePlan`, the drill becomes:

```ts
            drill: {
                name: d.name,
                description: d.description ?? "",
                ...drillTags(d),
                playData: d.playData ?? createEmptyPlayData(),
            },
```

The session gets `goaliesAttending: toGoaliesAttending(input.goaliesAttending),` after `startTime`.

Extend the editor mapping:

```ts
// PlanEditorDrill, after `description: string;`:
    focus: PlayFocus;
    goalies: PlayGoalies;

// PlanEditorSession, after `startTime: string | null;`:
    goaliesAttending: number | null;
```

In `planToEditorSession`, add `goaliesAttending: plan.session.goaliesAttending,` to the session and `focus: d.drill.focus, goalies: d.drill.goalies,` to each play.

- [ ] **Step 10: Write the fields from `buildPlanDocument`, and type `ExportSession`**

In `components/features/practice-planner/export/bench-sheet-model.ts`, extend the types. Add `PlayGoalies, PlayFocus` to the `@/types/practice-planner` import.

```ts
export interface ExportSessionPlay {
    sequence: number;
    duration: number;
    instructions: string | null;
    runsWithPrevious: boolean;
    play: { name: string; description: string | null; playData: PlayData | null; focus?: PlayFocus; goalies?: PlayGoalies };
}

// ExportSession, after `segmentName?: string | null;`:
    goaliesAttending?: number | null;
```

In `ExportPlanMenu.tsx` `buildPlanDocument`, pass the raw session's fields. The plan JSON keeps every `G` marker (spec R7):

```ts
            startTime: startTime ?? null,
            goaliesAttending: session.goaliesAttending ?? null,
            drills: session.plays.map((sp) => ({
                sequence: sp.sequence,
                duration: sp.duration,
                runsWithPrevious: sp.runsWithPrevious,
                instructions: sp.instructions,
                name: sp.play.name,
                description: sp.play.description,
                focus: sp.play.focus,
                goalies: sp.play.goalies,
                playData: sp.play.playData,
            })),
```

- [ ] **Step 11: Run the tests to verify they pass**

Run: `bun run test __tests__/lib/utils/drill-tags.test.ts __tests__/lib/utils/session-timeline.test.ts __tests__/lib/utils/validation-practice-session.test.ts __tests__/lib/plan-document __tests__/components/features/practice-planner/ExportPlanMenu.test.tsx __tests__/components/features/practice-planner/ExportPlanMenu.bench-sheet.test.tsx`
Expected: PASS.

Then run `bun run type-check`. Expected: PASS. If a caller of `createPlay` or `serializePlan` fails, the fix is to pass the new optional fields or nothing; never widen a type to `any`.

- [ ] **Step 12: Amend ADR-0020 and lint the corpus**

In `docs/adr/0020-exchange-practice-plans-as-a-portable-versioned-document-and-ship-a-static-local.md`, append a new `affects` entry after the `hosted-planner-platform.tsx` entry:

```yaml
  - type: path
    pattern: "lib/data/starter-*.ts"
    note: Starter drills and starter practice templates both deployables ship; templates are plan-document inputs.
```

Append at the end of the file:

```markdown
## Amendments

### 2026-10-03: Goaltender-aware drills (additive fields, version stays 1)

The document gains three optional fields without a version bump:
- each drill's `focus` (`team` | `skaters` | `goalies`) and `goalies` (`none` | `optional` | `required`);
- the session's `goaliesAttending` (an integer from 0 to 10, or `null`).

**Rules:**
- Missing, null or unrecognized values read as `team` / `optional` / `null`, so these advisory fields never make a plan unreadable.
- Writers always emit all three.
- Readers built before this amendment strip unknown keys, so files stay mutually readable. A round trip through an older build drops the tags.

**Why no bump:**
- The change is purely additive and lossy only toward older readers.
- A bump would make every older build reject new files as "made by a newer version", a worse outcome than losing advisory tags.

Starter practice templates ship as plan-document inputs (`lib/data/starter-templates.ts`) and are imported through the existing import flows. Spec: `docs/superpowers/specs/2026-10-03-goalie-drills-design.md`.
```

Run: `bun run adr:lint && bun run adr:check-integrity`
Expected: PASS (no errors).

- [ ] **Step 13: Commit**

```bash
/usr/bin/git add types/practice-planner.ts lib/utils/drill-tags.ts lib/utils/session-timeline.ts lib/utils/validation.ts \
  lib/utils/session-drill-ids.ts lib/planner-store/types.ts lib/plan-document/document.ts \
  components/features/practice-planner/ExportPlanMenu.tsx components/features/practice-planner/export/bench-sheet-model.ts \
  docs/adr/0020-exchange-practice-plans-as-a-portable-versioned-document-and-ship-a-static-local.md \
  __tests__/lib/utils/drill-tags.test.ts __tests__/lib/utils/session-timeline.test.ts \
  __tests__/lib/utils/validation-practice-session.test.ts __tests__/lib/plan-document/document.test.ts \
  __tests__/components/features/practice-planner/ExportPlanMenu.test.tsx
/usr/bin/git commit -m "feat(practice-planner): drill tags, goalie count and warnings vocabulary" -m "Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 2: Hosted persistence: columns, migration, actions, queries, import, wrappers

Every hosted copy path from spec R4. After this task a hosted drill keeps its tags through create, edit, save-in-session, fork, add-to-library, detach, duplicate and import, and a session stores its goalie count.

**Files:**
- Modify: `prisma/schema.prisma` (`model Play`, `model PracticeSession`)
- Create: `prisma/migrations/20261003140000_play_drill_tags_and_session_goalies/migration.sql`
- Modify: `lib/actions/plays.ts` (`createPlay`, `updatePlay`, `getPlayById`, `getPlaysByTeam`)
- Modify: `lib/services/practice-session-drills.ts` (`CloneSource`, `CLONE_SOURCE_SELECT`, `cloneDrillsIntoSessions`; new `PLAY_FIELDS_NOT_CLONED`)
- Modify: `lib/actions/practice-session-drills.ts` (`saveSessionDrill`, `copySessionDrillToLibrary`, `duplicatePracticeSession`)
- Modify: `lib/actions/practice-sessions.ts:561-581` (create data), `:928-950` (update data)
- Modify: `lib/actions/practice-session-queries.ts` (`getPracticeSessionDetail`, `getPracticeSessionForEdit`)
- Modify: `lib/actions/practice-plan-import.ts`
- Modify: `app/(dashboard)/practice-planner/[sessionId]/edit/EditSessionWrapper.tsx`, `app/(dashboard)/practice-planner/new/PracticeSessionEditorWrapper.tsx`, `app/(dashboard)/practice-planner/library/PlayEditorWrapper.tsx`, `app/(dashboard)/practice-planner/library/[playId]/edit/page.tsx`
- Test (create): `__tests__/prisma/play-drill-tags-migration.test.ts`, `__tests__/lib/actions/plays-tags.test.ts`, `__tests__/app/practice-planner-hosted-wrappers.test.tsx`
- Test (append or modify): `__tests__/lib/services/practice-session-drills.test.ts`, `__tests__/lib/actions/practice-session-drills.test.ts`, `__tests__/lib/actions/practice-sessions-ownership.test.ts`, `__tests__/lib/actions/practice-session-queries.test.ts`, `__tests__/lib/actions/practice-plan-import.test.ts`

**Interfaces:**
- Consumes (Task 1): `drillTags`, `toGoaliesAttending` from `@/lib/utils/drill-tags`; `PlayFocus` and `PlayGoalies`; schema fields `createPlaySchema.focus/goalies` (defaulted), `updatePlaySchema` / `saveSessionDrillSchema` `focus?/goalies?`, `getPlaysByTeamSchema.focus?/goalies?`, and the session schemas' `goaliesAttending?: number | null`.
- Produces:
  - Prisma `Play.focus: string`, `Play.goalies: string`, `PracticeSession.goaliesAttending: number | null`;
  - `PLAY_FIELDS_NOT_CLONED: ReadonlySet<string>`;
  - `getPlaysByTeam` / `getPlayById` results carrying `focus: PlayFocus; goalies: PlayGoalies`;
  - the detail and edit queries returning `goaliesAttending` and per-drill tags.

- [ ] **Step 1: Write the failing migration test**

Create `__tests__/prisma/play-drill-tags-migration.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_GOALIES_ATTENDING, PLAY_FOCUS, PLAY_GOALIES } from "@/types/practice-planner";

const sql = readFileSync(
    join(process.cwd(), "prisma/migrations/20261003140000_play_drill_tags_and_session_goalies/migration.sql"),
    "utf8",
);
const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");

describe("drill tags and session goalies migration", () => {
    it("adds the play tags with defaults, so existing rows read team / optional", () => {
        expect(sql).toContain(`ADD COLUMN "focus" TEXT NOT NULL DEFAULT 'team'`);
        expect(sql).toContain(`ADD COLUMN "goalies" TEXT NOT NULL DEFAULT 'optional'`);
    });

    it("constrains the values at the database, in step with the code vocabulary", () => {
        expect(sql).toContain(`CHECK ("focus" IN (${PLAY_FOCUS.map((v) => `'${v}'`).join(", ")}))`);
        expect(sql).toContain(`CHECK ("goalies" IN (${PLAY_GOALIES.map((v) => `'${v}'`).join(", ")}))`);
        expect(sql).toContain(`ADD COLUMN "goaliesAttending" INTEGER`);
        expect(sql).toContain(`CHECK ("goaliesAttending" IS NULL OR "goaliesAttending" BETWEEN 0 AND ${MAX_GOALIES_ATTENDING})`);
    });

    it("is additive: nothing is dropped, rewritten or deleted", () => {
        expect(sql).not.toMatch(/\bDROP\b|\bUPDATE\b|\bDELETE\b/i);
    });

    it("matches the Prisma schema's columns", () => {
        expect(schema).toMatch(/focus\s+String\s+@default\("team"\)/);
        expect(schema).toMatch(/goalies\s+String\s+@default\("optional"\)/);
        expect(schema).toMatch(/goaliesAttending\s+Int\?/);
    });
});
```

Run: `bun run test __tests__/prisma/play-drill-tags-migration.test.ts`
Expected: FAIL with ENOENT for the migration file.

- [ ] **Step 2: Add the columns and the hand-written migration**

In `prisma/schema.prisma`, in `model Play`, after `isTemplate …`:

```prisma
  // Drill tags (goaltender-aware drills). Strings, not enums: the lowercase
  // vocabulary is PLAY_FOCUS / PLAY_GOALIES in types/practice-planner.ts,
  // shared with the plan document and the static planner. CHECK constraints
  // in migration 20261003140000_play_drill_tags_and_session_goalies keep the
  // values honest; Prisma can't model them, so keep them by hand.
  focus       String   @default("team")
  goalies     String   @default("optional")
```

In `model PracticeSession`, after `isShared …`:

```prisma
  // Goalies expected (0-10; null = not set). Advisory only: drives goalie
  // warnings and hides optional-drill goalie markers at 0. CHECK in migration
  // 20261003140000_play_drill_tags_and_session_goalies.
  goaliesAttending Int?
```

Create `prisma/migrations/20261003140000_play_drill_tags_and_session_goalies/migration.sql`:

```sql
-- Goaltender-aware drills: drill tags and a session goalie count.
-- Hand-written and additive: the dev database is behind on migrations, so
-- `migrate dev` cannot be used. Existing plays read as team / optional and
-- existing sessions have no goalie count (NULL = not set); a constant
-- DEFAULT is metadata-only on PostgreSQL 11+, so no table is rewritten.
-- Prisma does not model CHECK constraints: keep them by hand if these
-- columns are ever regenerated.

-- AlterTable
ALTER TABLE "plays" ADD COLUMN "focus" TEXT NOT NULL DEFAULT 'team';
ALTER TABLE "plays" ADD COLUMN "goalies" TEXT NOT NULL DEFAULT 'optional';
ALTER TABLE "plays" ADD CONSTRAINT "plays_focus_check" CHECK ("focus" IN ('team', 'skaters', 'goalies'));
ALTER TABLE "plays" ADD CONSTRAINT "plays_goalies_check" CHECK ("goalies" IN ('none', 'optional', 'required'));

-- AlterTable
ALTER TABLE "practice_sessions" ADD COLUMN "goaliesAttending" INTEGER;
ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_goaliesAttending_check"
  CHECK ("goaliesAttending" IS NULL OR "goaliesAttending" BETWEEN 0 AND 10);
```

Run: `bun run db:generate && bun run test __tests__/prisma/play-drill-tags-migration.test.ts`
Expected: the client generates; the test passes. Do **not** run any migrate command; CI applies the migration with `db:migrate:deploy` (ADR-0019).

- [ ] **Step 3: Write the failing action tests**

Create `__tests__/lib/actions/plays-tags.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, tx } = vi.hoisted(() => {
    const tx = {
        play: { update: vi.fn() },
        practiceSessionPlay: { findMany: vi.fn() },
    };
    return {
        tx,
        mockPrisma: {
            $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
            play: { findUnique: vi.fn(), create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
        },
    };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/session", () => ({ requireTeamMember: vi.fn(), requireTeamAdmin: vi.fn().mockResolvedValue("user-1") }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createPlay, getPlayById, getPlaysByTeam, updatePlay } from "@/lib/actions/plays";
import { createEmptyPlayData } from "@/lib/utils/play-data";

const TEAM = "cjld2cjxh0000qzrmn831i7rn";
const PLAY = "cjld2cyuq0000t3rmniod1foy";
const AT = new Date("2026-10-03T12:00:00Z");

beforeEach(() => {
    vi.clearAllMocks();
    tx.practiceSessionPlay.findMany.mockResolvedValue([]); // detach finds no sessions
    tx.play.update.mockResolvedValue({ id: PLAY, name: "Drill", isTemplate: true });
    mockPrisma.play.create.mockResolvedValue({ id: PLAY, name: "Drill", isTemplate: true });
});

describe("plays: drill tags", () => {
    it("createPlay stores the defaults when no tags are sent", async () => {
        await createPlay({ name: "Drill", teamId: TEAM, isTemplate: true, playData: createEmptyPlayData() });
        expect(mockPrisma.play.create.mock.calls[0][0].data).toMatchObject({ focus: "team", goalies: "optional" });
    });

    it("createPlay stores the sent tags", async () => {
        await createPlay({ name: "Drill", teamId: TEAM, isTemplate: true, playData: createEmptyPlayData(), focus: "goalies", goalies: "required" });
        expect(mockPrisma.play.create.mock.calls[0][0].data).toMatchObject({ focus: "goalies", goalies: "required" });
    });

    it("updatePlay writes a tag only when it is sent", async () => {
        mockPrisma.play.findUnique.mockResolvedValue({ teamId: TEAM, sessionId: null });
        await updatePlay({ id: PLAY, name: "Drill", teamId: TEAM, playData: createEmptyPlayData() });
        expect(tx.play.update.mock.calls[0][0].data).not.toHaveProperty("focus");
        expect(tx.play.update.mock.calls[0][0].data).not.toHaveProperty("goalies");

        await updatePlay({ id: PLAY, name: "Drill", teamId: TEAM, playData: createEmptyPlayData(), goalies: "none" });
        expect(tx.play.update.mock.calls[1][0].data).toMatchObject({ goalies: "none" });
        expect(tx.play.update.mock.calls[1][0].data).not.toHaveProperty("focus");
    });

    it("getPlaysByTeam filters by tags, keeps pagination and total, and narrows stored strings", async () => {
        mockPrisma.play.findMany.mockResolvedValue([
            { id: PLAY, name: "Drill", description: null, thumbnail: null, isTemplate: true, focus: "goalies", goalies: "bogus", createdAt: AT, updatedAt: AT },
        ]);
        mockPrisma.play.count.mockResolvedValue(21);
        const result = await getPlaysByTeam({ teamId: TEAM, isTemplate: true, page: 2, limit: 20, dateFilter: "all", focus: "goalies", goalies: "required" });

        const query = mockPrisma.play.findMany.mock.calls[0][0];
        expect(query.where).toMatchObject({ teamId: TEAM, sessionId: null, isTemplate: true, focus: "goalies", goalies: "required" });
        expect(query).toMatchObject({ skip: 20, take: 20 });
        expect(query.select).toMatchObject({ focus: true, goalies: true });
        expect(mockPrisma.play.count.mock.calls[0][0].where).toEqual(query.where);
        expect(result.success && result.data.total).toBe(21);
        expect(result.success && result.data.plays[0]).toMatchObject({ focus: "goalies", goalies: "optional" });
    });

    it("getPlaysByTeam adds no tag filter when none is asked", async () => {
        mockPrisma.play.findMany.mockResolvedValue([]);
        mockPrisma.play.count.mockResolvedValue(0);
        await getPlaysByTeam({ teamId: TEAM, isTemplate: true, page: 1, limit: 20, dateFilter: "all" });
        const where = mockPrisma.play.findMany.mock.calls[0][0].where;
        expect(where).not.toHaveProperty("focus");
        expect(where).not.toHaveProperty("goalies");
    });

    it("getPlayById returns the tags", async () => {
        mockPrisma.play.findUnique.mockResolvedValue({
            id: PLAY, name: "Drill", description: null, thumbnail: null, playData: createEmptyPlayData(), isTemplate: true,
            teamId: TEAM, sessionId: null, focus: "skaters", goalies: "none", createdAt: AT, updatedAt: AT,
        });
        const result = await getPlayById({ id: PLAY, teamId: TEAM });
        expect(mockPrisma.play.findUnique.mock.calls[0][0].select).toMatchObject({ focus: true, goalies: true });
        expect(result.success && result.data).toMatchObject({ focus: "skaters", goalies: "none" });
    });
});
```

Append to `__tests__/lib/services/practice-session-drills.test.ts`. Add `cloneDrillsIntoSessions`, `CLONE_SOURCE_SELECT` and `PLAY_FIELDS_NOT_CLONED` to the existing import from `@/lib/services/practice-session-drills`. Change the type-only `import type { Prisma } from "@prisma/client";` to a value import, `import { Prisma } from "@prisma/client";`, because the guard reads `Prisma.PlayScalarFieldEnum`.

```ts
describe("clones carry the drill tags (materialize, detach and duplicate share cloneDrillsIntoSessions)", () => {
    async function cloneOne(source: Record<string, unknown>) {
        const createManyAndReturn = vi.fn(async ({ data }: { data: Array<{ id: string }> }) => data.map((d) => ({ id: d.id })));
        const client = { play: { createManyAndReturn } } as unknown as Prisma.TransactionClient;
        await cloneDrillsIntoSessions(client, {
            teamId: TEAM,
            userId: USER,
            copies: [{ sessionId: SESSION, source: source as never }],
        });
        return createManyAndReturn.mock.calls[0][0].data[0] as Record<string, unknown>;
    }

    it("selects and copies focus and goalies", async () => {
        expect(CLONE_SOURCE_SELECT).toMatchObject({ focus: true, goalies: true });
        const data = await cloneOne({ id: "lib", name: "Warm-up", description: null, thumbnail: null, playData: {}, sourcePlayId: null, focus: "goalies", goalies: "required" });
        expect(data).toMatchObject({ focus: "goalies", goalies: "required", sessionId: SESSION, sourcePlayId: "lib" });
    });

    it("writes every Play column except the timestamps (new-column guard)", async () => {
        const data = await cloneOne({ id: "lib", name: "W", description: null, thumbnail: null, playData: {}, sourcePlayId: null, focus: "team", goalies: "none" });
        for (const field of Object.values(Prisma.PlayScalarFieldEnum)) {
            expect(field in data || PLAY_FIELDS_NOT_CLONED.has(field), `Play.${field} is neither cloned nor in PLAY_FIELDS_NOT_CLONED`).toBe(true);
        }
    });
});
```

Append to `__tests__/lib/actions/practice-session-drills.test.ts`:

```ts
describe("saveSessionDrill: drill tags", () => {
    it("a brand-new drill stores the sent tags", async () => {
        await saveSessionDrill({ ...drillInput(), focus: "goalies", goalies: "required" });
        expect(tx.play.create.mock.calls[0][0].data).toMatchObject({ focus: "goalies", goalies: "required" });
    });

    it("an owned drill keeps its tags when none are sent, and takes the ones that are", async () => {
        tx.play.findFirst.mockResolvedValue({ id: OWNED, sessionId: SESSION, isTemplate: false, sourcePlayId: LIB, focus: "skaters", goalies: "none" });
        await saveSessionDrill(drillInput(OWNED));
        expect(tx.play.update.mock.calls[0][0].data).not.toHaveProperty("focus");
        expect(tx.play.update.mock.calls[0][0].data).not.toHaveProperty("goalies");
        await saveSessionDrill({ ...drillInput(OWNED), goalies: "required" });
        expect(tx.play.update.mock.calls[1][0].data).toMatchObject({ goalies: "required" });
    });

    it("a fork inherits the source's tags unless new ones are sent", async () => {
        tx.play.findFirst.mockResolvedValue({ id: LIB, sessionId: null, isTemplate: true, sourcePlayId: null, focus: "goalies", goalies: "required" });
        await saveSessionDrill(drillInput(LIB));
        expect(tx.play.findFirst.mock.calls[0][0].select).toMatchObject({ focus: true, goalies: true });
        expect(tx.play.create.mock.calls[0][0].data).toMatchObject({ focus: "goalies", goalies: "required" });
        await saveSessionDrill({ ...drillInput(LIB), focus: "team" });
        expect(tx.play.create.mock.calls[1][0].data).toMatchObject({ focus: "team", goalies: "required" });
    });
});

describe("copySessionDrillToLibrary: drill tags", () => {
    it("copies the tags into the new library play", async () => {
        tx.play.findFirst.mockResolvedValue({ name: "Warm-up", description: null, thumbnail: null, playData: {}, sessionId: SESSION, focus: "goalies", goalies: "required" });
        tx.play.create.mockResolvedValue({ id: NEW_ID });
        await copySessionDrillToLibrary({ playId: OWNED, teamId: TEAM });
        expect(tx.play.findFirst.mock.calls[0][0].select).toMatchObject({ focus: true, goalies: true });
        expect(tx.play.create.mock.calls[0][0].data).toMatchObject({ focus: "goalies", goalies: "required", isTemplate: true });
    });
});
```

Inside the existing `describe("duplicatePracticeSession", …)` in the same file, add:

```ts
    it("copies the session's goalie count", async () => {
        mockPrisma.practiceSession.findUnique.mockResolvedValue({
            teamId: TEAM, title: "Tuesday", duration: 75, goaliesAttending: 2, plays: [sourceRow(0)],
        });
        await duplicatePracticeSession({ id: SOURCE, teamId: TEAM, date: DATE });
        expect(tx.practiceSession.create.mock.calls[0][0].data.goaliesAttending).toBe(2);
        expect(mockPrisma.practiceSession.findUnique.mock.calls[0][0].select).toMatchObject({ goaliesAttending: true });
    });
```

Then update that describe's existing `creates an unshared, unbooked copy on the chosen date` expectation. Its fixture has no count, so the copy gets `null`:

```ts
        expect(data).toEqual({
            title: "Copy of Tuesday", date: DATE, duration: 75, goaliesAttending: null, isShared: false, teamId: TEAM, createdById: USER,
        });
```

Append to `__tests__/lib/actions/practice-sessions-ownership.test.ts`. It reuses that file's `input`, `models` and harness:

```ts
describe("goalie count (goaltender-aware drills)", () => {
    it("createPracticeSession stores the count, or null when none is sent", async () => {
        await createPracticeSession({ ...input([]), goaliesAttending: 2 });
        expect(models.practiceSession.create.mock.calls[0][0].data.goaliesAttending).toBe(2);
        await createPracticeSession(input([]));
        expect(models.practiceSession.create.mock.calls[1][0].data.goaliesAttending).toBeNull();
    });

    it("updatePracticeSession writes a sent count, clears on null, and leaves it alone when omitted (older tabs' autosave)", async () => {
        const update = (extra: Record<string, unknown> = {}) => updatePracticeSession({ id: SESSION, ...input([]), ...extra });
        await update({ goaliesAttending: 1 });
        expect(models.practiceSession.update.mock.calls[0][0].data.goaliesAttending).toBe(1);
        await update({ goaliesAttending: null });
        expect(models.practiceSession.update.mock.calls[1][0].data.goaliesAttending).toBeNull();
        await update();
        expect(models.practiceSession.update.mock.calls[2][0].data).not.toHaveProperty("goaliesAttending");
    });

    it("rejects a count outside 0–10 without writing", async () => {
        const result = await createPracticeSession({ ...input([]), goaliesAttending: 11 });
        expect(result.success).toBe(false);
        expect(models.practiceSession.create).not.toHaveBeenCalled();
    });
});
```

Append to `__tests__/lib/actions/practice-session-queries.test.ts`:

```ts
describe("goaltender fields in the session queries", () => {
    const base = {
        id: "s1", teamId: "t1", title: "T", date: new Date("2026-01-01T00:00:00Z"), duration: 60, isShared: true,
        venueId: null, surfaceId: null, segmentId: null, startAt: null, goaliesAttending: 1,
        createdBy: { name: "Coach" }, team: { id: "t1", name: "Team" }, venue: null, surface: null, segment: null,
        plays: [{ ...row("a", 0), play: { ...row("a", 0).play, focus: "goalies", goalies: "required" } }, row("b", 1)],
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockPrisma.teamMember.findFirst.mockResolvedValue({ id: "m", role: "ADMIN", teamId: "t1" });
        mockPrisma.practiceSession.findUnique.mockResolvedValue(base);
    });

    it("getPracticeSessionForEdit returns the count and each drill's tags (defaults when untagged)", async () => {
        const result = await getPracticeSessionForEdit("s1");
        expect(result?.initialData.goaliesAttending).toBe(1);
        expect(result?.initialData.plays.map((p) => [p.focus, p.goalies])).toEqual([["goalies", "required"], ["team", "optional"]]);
        const select = mockPrisma.practiceSession.findUnique.mock.calls[0][0].include.plays.include.play.select;
        expect(select).toMatchObject({ focus: true, goalies: true });
    });

    it("getPracticeSessionDetail returns the count and each drill's tags", async () => {
        const result = await getPracticeSessionDetail("s1");
        expect(result?.session.goaliesAttending).toBe(1);
        expect(result?.session.plays.map((p) => [p.play.focus, p.play.goalies])).toEqual([["goalies", "required"], ["team", "optional"]]);
    });
});
```

`getPracticeSessionDetail` returns `{ session, … }` or `null`. Membership is the second `teamMember.findFirst` call, and `role: "ADMIN"` passes its `isAdmin` check. Don't change the function's authorization.

In `__tests__/lib/actions/practice-plan-import.test.ts`:
- Update the `owned[0]` `toEqual` expectation in the existing import test to include `focus: "team", goalies: "optional",`, the defaults for an untagged plan drill.
- Append:

```ts
describe("importPracticePlan: goaltender fields", () => {
    it("stores the drill tags and the session goalie count", async () => {
        const document = serializePlan(
            {
                title: "Goalie night", durationMinutes: 30, date: "2026-10-06", startTime: "19:00", goaliesAttending: 2,
                drills: [{ sequence: 0, duration: 10, runsWithPrevious: false, instructions: "", name: "Warm-up", description: "", focus: "goalies", goalies: "required", playData: BOARD }],
            },
            "openleague-static",
            new Date("2026-10-03T18:00:00.000Z"),
        );
        mockAuth.requireUserId.mockResolvedValue(USER);
        mockAuth.isTeamAdmin.mockResolvedValue(true);
        models.practiceSession.create.mockResolvedValue({ id: SESSION });
        const result = await importPracticePlan({ teamId: TEAM, date: DATE, addToLibrary: true, document });
        expect(result.success).toBe(true);
        expect(models.practiceSession.create.mock.calls[0][0].data.goaliesAttending).toBe(2);
        for (const call of models.play.createMany.mock.calls) {
            expect(call[0].data[0]).toMatchObject({ focus: "goalies", goalies: "required" });
        }
    });
});
```

The `mockAuth` / `models` setup lines above mirror what that file's `beforeEach` does. If its `beforeEach` already sets them, drop the duplicates.

Create `__tests__/app/practice-planner-hosted-wrappers.test.tsx`:

```tsx
/** The hosted wrappers pass the goaltender fields from the shared editors to the server actions. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const captured = vi.hoisted(() => ({ props: null as null | Record<string, (arg: unknown) => Promise<unknown>> }));
const actions = vi.hoisted(() => ({
    updatePracticeSession: vi.fn(),
    createPracticeSession: vi.fn(),
    sharePracticeSession: vi.fn(),
    createPlay: vi.fn(),
    updatePlay: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/actions/practice-sessions", () => actions);
vi.mock("@/lib/actions/plays", () => actions);
vi.mock("@/components/features/practice-planner/PracticeSessionEditor", () => ({
    PracticeSessionEditor: (props: Record<string, (arg: unknown) => Promise<unknown>>) => {
        captured.props = props;
        return null;
    },
    extractBookingConflicts: () => undefined,
}));
vi.mock("@/components/features/practice-planner/PlayEditor", () => ({
    PlayEditor: (props: Record<string, (arg: unknown) => Promise<unknown>>) => {
        captured.props = props;
        return null;
    },
}));

import { EditSessionWrapper } from "@/app/(dashboard)/practice-planner/[sessionId]/edit/EditSessionWrapper";
import { PracticeSessionEditorWrapper } from "@/app/(dashboard)/practice-planner/new/PracticeSessionEditorWrapper";
import { PlayEditorWrapper } from "@/app/(dashboard)/practice-planner/library/PlayEditorWrapper";
import { createEmptyPlayData } from "@/lib/utils/play-data";

const TEAM = "cteamxxxxxxxxxxxxxxxxxxxx";
const SESSION = "csessionxxxxxxxxxxxxxxxxx";
const BOOKING = { venues: [], reservations: [], currentReservationId: null, surfacesByVenue: {}, segmentsBySurface: {}, wholeLabelBySurface: {} };
const submitted = {
    title: "Tuesday", date: new Date("2026-04-07T22:00:00.000Z"), duration: 60, plays: [], isShared: false,
    goaliesAttending: 0, overrideConflicts: false, overrideReason: "", notify: false,
};

beforeEach(() => {
    vi.clearAllMocks();
    actions.updatePracticeSession.mockResolvedValue({ success: true, data: { id: SESSION, plays: [] } });
    actions.createPracticeSession.mockResolvedValue({ success: true, data: { id: SESSION, plays: [] } });
    actions.createPlay.mockResolvedValue({ success: true, data: { id: "p", name: "D", isTemplate: true } });
});

describe("hosted wrappers: goaltender fields", () => {
    it("EditSessionWrapper sends goaliesAttending", async () => {
        render(<EditSessionWrapper sessionId={SESSION} teamId={TEAM} initialData={{}} bookingOptions={BOOKING as never} />);
        await captured.props!.onSave(submitted);
        expect(actions.updatePracticeSession.mock.calls[0][0]).toMatchObject({ goaliesAttending: 0 });
    });

    it("PracticeSessionEditorWrapper sends goaliesAttending", async () => {
        render(<PracticeSessionEditorWrapper teamId={TEAM} bookingOptions={BOOKING as never} />);
        await captured.props!.onSave({ ...submitted, goaliesAttending: 2 });
        expect(actions.createPracticeSession.mock.calls[0][0]).toMatchObject({ goaliesAttending: 2 });
    });

    it("PlayEditorWrapper sends the drill tags", async () => {
        render(<PlayEditorWrapper teamId={TEAM} />);
        await captured.props!.onSave({
            id: "", name: "Warm-up", description: "", thumbnail: "", playData: createEmptyPlayData(), isTemplate: true,
            focus: "goalies", goalies: "required", createdAt: new Date(), updatedAt: new Date(),
        });
        expect(actions.createPlay.mock.calls[0][0]).toMatchObject({ focus: "goalies", goalies: "required" });
    });
});
```

The prop names match the wrappers as of `eb9b3ed`:
- `EditSessionWrapper`: `sessionId`, `teamId`, `initialData`, `bookingOptions`;
- `PracticeSessionEditorWrapper`: `teamId`, `bookingOptions`;
- `PlayEditorWrapper`: `teamId`, `play?`.

`BOOKING` is a full `VenueBookingOptions`.

Run: `bun run test __tests__/lib/actions/plays-tags.test.ts __tests__/lib/services/practice-session-drills.test.ts __tests__/lib/actions/practice-session-drills.test.ts __tests__/lib/actions/practice-sessions-ownership.test.ts __tests__/lib/actions/practice-session-queries.test.ts __tests__/lib/actions/practice-plan-import.test.ts __tests__/app/practice-planner-hosted-wrappers.test.tsx`
Expected: FAIL. The tags and the count are missing from the writes, selects and results, and `cloneDrillsIntoSessions` / `PLAY_FIELDS_NOT_CLONED` aren't wired.

- [ ] **Step 4: Implement `lib/actions/plays.ts`**

Add `import { drillTags } from "@/lib/utils/drill-tags";` and extend the type import to `import type { PlayData, PlayFocus, PlayGoalies } from "@/types/practice-planner";`.

`createPlay`, in `prisma.play.create({ data: { … } })`, after `isTemplate`:

```ts
                focus: validated.focus,
                goalies: validated.goalies,
```

`updatePlay`, in `tx.play.update({ data: { … } })`, after the `isTemplate` spread:

```ts
                    ...(validated.focus !== undefined && { focus: validated.focus }),
                    ...(validated.goalies !== undefined && { goalies: validated.goalies }),
```

`getPlayById`: add `focus: true, goalies: true,` to the `select`, and `...drillTags(play),` to the returned `data` after `isTemplate`. Add `focus: PlayFocus; goalies: PlayGoalies;` to its declared result type.

`getPlaysByTeam`:
- Add `focus: PlayFocus; goalies: PlayGoalies;` to the declared play type.
- After the `isTemplate` filter, add:

```ts
        // Drill-tag filters (spec R8). Applied in the database, so total and pages stay exact.
        if (validated.focus) where.focus = validated.focus;
        if (validated.goalies) where.goalies = validated.goalies;
```

- Add `focus: true, goalies: true,` to the `findMany` `select`.
- Return `plays: plays.map((play) => ({ ...play, ...drillTags(play) })),` instead of `plays,`.

- [ ] **Step 5: Implement the clone path in `lib/services/practice-session-drills.ts`**

```ts
/** What a clone copies. playData is copied raw (it may still be v1; reads upgrade it). */
export type CloneSource = {
    id: string;
    name: string;
    description: string | null;
    thumbnail: string | null;
    playData: Prisma.JsonValue;
    sourcePlayId: string | null;
    /** Drill tags (goaltender-aware drills); absent on old fixtures = the column default. */
    focus?: string;
    goalies?: string;
};

export const CLONE_SOURCE_SELECT = {
    id: true,
    name: true,
    description: true,
    thumbnail: true,
    playData: true,
    sourcePlayId: true,
    isTemplate: true,
    sessionId: true,
    focus: true,
    goalies: true,
} as const;

/**
 * Play columns a clone does not write: a clone is a new row, so it gets its
 * own timestamps. Every other Play column must appear in the clone's data
 * (the new-column guard test), so a column added later can't be silently
 * dropped from session copies.
 */
export const PLAY_FIELDS_NOT_CLONED: ReadonlySet<string> = new Set(["createdAt", "updatedAt"]);
```

In `cloneDrillsIntoSessions`, add after `playData: …,`:

```ts
            focus: source.focus,
            goalies: source.goalies,
```

`undefined` lets Prisma apply the column default. A real source row always has both values.

- [ ] **Step 6: Implement `lib/actions/practice-session-drills.ts`**

In `saveSessionDrill`, replace the `fields` constant with:

```ts
        // Tags: absent = keep (owned drill) / inherit (fork) / default (new drill) (spec R3).
        const tags = {
            ...(validated.focus !== undefined && { focus: validated.focus }),
            ...(validated.goalies !== undefined && { goalies: validated.goalies }),
        };
        const fields = {
            name: validated.name,
            description: validated.description || null,
            thumbnail: validated.thumbnail || null,
            playData: sanitized.data as unknown as Prisma.InputJsonValue,
            ...tags,
        };
```

Change the source lookup select to `select: { id: true, sessionId: true, isTemplate: true, sourcePlayId: true, focus: true, goalies: true },`. Make the fork's create data inherit:

```ts
            const forked = await tx.play.create({
                data: { focus: play.focus, goalies: play.goalies, ...fields, ...ownedCopy, sourcePlayId: play.sourcePlayId ?? play.id },
                select: { id: true },
            });
```

In `copySessionDrillToLibrary`:
- the select becomes `select: { name: true, description: true, thumbnail: true, playData: true, sessionId: true, focus: true, goalies: true },`;
- the create data gains `focus: play.focus, goalies: play.goalies,` after `playData`.

In `duplicatePracticeSession`:
- add `goaliesAttending: true,` to the source `select`;
- add `goaliesAttending: source.goaliesAttending ?? null,` to the new session's `data` after `duration`.

- [ ] **Step 7: Implement `lib/actions/practice-sessions.ts`**

In `createPracticeSession`'s `tx.practiceSession.create({ data: { … } })`, after `isShared: false,`:

```ts
                    goaliesAttending: validated.goaliesAttending ?? null,
```

In `updatePracticeSession`'s `tx.practiceSession.update({ data: { … } })`, after the `duration` entry:

```ts
                    // Absent = unchanged: an editor tab opened before this field existed autosaves without it.
                    ...(validated.goaliesAttending !== undefined && { goaliesAttending: validated.goaliesAttending }),
```

- [ ] **Step 8: Implement the queries and the import**

In `lib/actions/practice-session-queries.ts`:
- add `import { drillTags } from "@/lib/utils/drill-tags";` and `PlayFocus, PlayGoalies` to the types import;
- in **both** `getPracticeSessionDetail` and `getPracticeSessionForEdit`, add `focus: true, goalies: true,` to the `play.select`. The sessions use `include`, so `goaliesAttending` comes back already.

`getPracticeSessionDetail`:
- add `goaliesAttending: number | null;` to its declared `session` result type and `focus: PlayFocus; goalies: PlayGoalies;` to the declared `play` type;
- return `goaliesAttending: session.goaliesAttending ?? null,` in the returned `session` object, after `startAt`;
- add `...drillTags(sp.play),` inside each `play: { … }` after `thumbnail`.

`getPracticeSessionForEdit`:
- add `goaliesAttending: number | null;` to `initialData`'s declared type and `focus: PlayFocus; goalies: PlayGoalies;` to its plays;
- return `goaliesAttending: session.goaliesAttending ?? null,` after `startAt`;
- add `...drillTags(sp.play),` in each mapped play after `instructions`.

In `lib/actions/practice-plan-import.ts`:

```ts
            const session = await tx.practiceSession.create({
                data: {
                    title: planSession.title,
                    date: new Date(validated.data.date),
                    duration: planSession.durationMinutes,
                    goaliesAttending: planSession.goaliesAttending,
                    isShared: false,
                    teamId,
                    createdById: userId,
                },
                select: { id: true },
            });
```

In `drillFields`, add after `playData`:

```ts
                focus: drill.drill.focus,
                goalies: drill.drill.goalies,
```

`parsePlan` already defaulted and narrowed them (Task 1).

- [ ] **Step 9: Pass the fields through the hosted wrappers**

`EditSessionWrapper.tsx` (`updatePracticeSession({ … })`) and `PracticeSessionEditorWrapper.tsx` (`createPracticeSession({ … })`), after `duration: session.duration,`:

```ts
        goaliesAttending: session.goaliesAttending ?? null,
```

`PlayEditorWrapper.tsx`, in both the `updatePlay({ … })` and `createPlay({ … })` calls, after `playData: saved.playData,`:

```ts
            focus: saved.focus,
            goalies: saved.goalies,
```

`app/(dashboard)/practice-planner/library/[playId]/edit/page.tsx` builds the `SavedPlay` that `PlayEditor` starts from. Add the tags after `isTemplate`, or the editor would open every drill as team / optional and a save would reset its tags:

```ts
    focus: result.data.focus,
    goalies: result.data.goalies,
```

- [ ] **Step 10: Run the tests to verify they pass**

Run the Step 3 command again. Expected: PASS.
Run: `bun run test __tests__/lib/actions __tests__/lib/services __tests__/prisma && bun run type-check`
Expected: PASS. Fix any other exact-shape assertion the new keys break by adding the keys, never by loosening the assertion.

- [ ] **Step 11: Commit**

```bash
/usr/bin/git add prisma/schema.prisma prisma/migrations/20261003140000_play_drill_tags_and_session_goalies/migration.sql \
  lib/actions/plays.ts lib/services/practice-session-drills.ts lib/actions/practice-session-drills.ts \
  lib/actions/practice-sessions.ts lib/actions/practice-session-queries.ts lib/actions/practice-plan-import.ts \
  "app/(dashboard)/practice-planner/[sessionId]/edit/EditSessionWrapper.tsx" \
  "app/(dashboard)/practice-planner/new/PracticeSessionEditorWrapper.tsx" \
  "app/(dashboard)/practice-planner/library/PlayEditorWrapper.tsx" \
  "app/(dashboard)/practice-planner/library/[playId]/edit/page.tsx" \
  __tests__/prisma/play-drill-tags-migration.test.ts __tests__/lib/actions/plays-tags.test.ts \
  __tests__/lib/services/practice-session-drills.test.ts __tests__/lib/actions/practice-session-drills.test.ts \
  __tests__/lib/actions/practice-sessions-ownership.test.ts __tests__/lib/actions/practice-session-queries.test.ts \
  __tests__/lib/actions/practice-plan-import.test.ts __tests__/app/practice-planner-hosted-wrappers.test.tsx
/usr/bin/git commit -m "feat(practice-planner): persist drill tags and session goalie count (hosted)" -m "Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 3: Starter content, part 1: builders, tags on the originals, nine goalie drills

Content only. The plumbing that reads `focus`/`goalies` landed in Tasks 1–2. The static seeding and the library UI that deliver these drills come in Tasks 5–6. Every coordinate below was checked against the pack invariants:
- `playDataSchema`;
- every element inside the drill's area;
- player markers at least 12 ft apart;
- `pass`/`shot` ids carry those actions;
- the G-marker rules.

**Files:**
- Modify: `lib/data/starter-plays.ts`
- Test: `__tests__/lib/data/starter-plays.test.ts`

**Interfaces:**
- Consumes (Task 1): `PlayFocus` and `PlayGoalies`.
- Produces:
  - `StarterPlay.focus: PlayFocus` and `StarterPlay.goalies: PlayGoalies` (both **required**);
  - `STARTER_PLAYS` grows from 9 to 18, and Task 4 takes it to 26;
  - the stable ids listed in the test below. Static seeding (Task 5) keys on them.

**Hockey conventions used (keep them if you touch a diagram):**
- Rink feet are 200×85: goal lines at x=11/189, blue lines at 75/125, end-zone dots at x=31/169 and y=20.5/64.5, circle radius 15, crease radius 6.
- A left-end net is `rotation: 180`. The glyph opens toward −x at 0°, so 180 opens it toward center ice.
- A goalie in the crease sits at about (14, 42.5).
- Drill time is in each description ("8–10 min") because a drill's minutes belong to the session row, not the drill.

- [ ] **Step 1: Write the failing content tests**

In `__tests__/lib/data/starter-plays.test.ts`:

1. Change the import line `import type { IceAreaPreset } from "@/types/practice-planner";` to:

```ts
import { PLAY_FOCUS, PLAY_GOALIES, type IceArea } from "@/types/practice-planner";
```

2. In the existing per-play `describe.each`, change `expect(play.description.length).toBeLessThanOrEqual(1000);` to `toBeLessThanOrEqual(500)`. That is `PlayEditor`'s limit, so a coach can re-save a copied starter. Add these cases inside the same `describe.each`:

```ts
            it("keeps player markers at least 12 ft apart (markers are 6 ft radius)", () => {
                const players = play.playData.players;
                for (let i = 0; i < players.length; i++) {
                    for (let j = i + 1; j < players.length; j++) {
                        const gap = Math.hypot(players[i].position.x - players[j].position.x, players[i].position.y - players[j].position.y);
                        expect(gap, `${players[i].id} – ${players[j].id}`).toBeGreaterThanOrEqual(12);
                    }
                }
            });

            it("opens every net toward center ice", () => {
                for (const item of play.playData.equipment.filter((e) => e.kind === "net")) {
                    expect(item.rotation, item.id).toBe(item.position.x < 100 ? 180 : 0);
                }
            });

            it("has known tags, and draws a goalie exactly when the tags say one is in net", () => {
                expect(PLAY_FOCUS).toContain(play.focus);
                expect(PLAY_GOALIES).toContain(play.goalies);
                const goalies = play.playData.players.filter((p) => p.role === "G").length;
                if (play.goalies === "required") expect(goalies).toBeGreaterThanOrEqual(1);
                if (play.goalies === "none") expect(goalies).toBe(0);
            });
```

3. Replace the `Starter play ice areas` `EXPECTED` constant and its type:

```ts
    const EXPECTED: Record<string, IceArea["kind"] | undefined> = {
        "starter-breakout-5man": "half-left",
        "starter-3man-weave": undefined,
        "starter-pp-umbrella": "zone-right",
        "starter-pk-box": "zone-left",
        "starter-122-forecheck": undefined,
        "starter-low-cycle": "zone-right",
        "starter-point-shot-screen": "zone-right",
        "starter-dzone-coverage": "zone-left",
        "starter-nz-regroup": undefined,
        "starter-goalie-angles-depth": "zone-left",
        "starter-goalie-butterfly-recovery": "custom",
        "starter-goalie-post-to-post": "custom",
        "starter-goalie-rebound-control": "zone-left",
        "starter-goalie-screens": "zone-left",
        "starter-goalie-puck-handling": "half-left",
        "starter-goalie-breakaways": "half-left",
        "starter-goalie-warmup": "zone-left",
        "starter-goalie-crease-pattern": "custom",
    };
```

4. Append:

```ts
describe("Starter drill tags", () => {
    const tags = (id: string) => {
        const play = STARTER_PLAYS.find((p) => p.id === id);
        return play ? [play.focus, play.goalies] : null;
    };

    it("tags the original nine as the spec judges them", () => {
        expect(Object.fromEntries([
            "starter-breakout-5man", "starter-3man-weave", "starter-pp-umbrella", "starter-pk-box", "starter-122-forecheck",
            "starter-low-cycle", "starter-point-shot-screen", "starter-dzone-coverage", "starter-nz-regroup",
        ].map((id) => [id, tags(id)]))).toEqual({
            "starter-breakout-5man": ["team", "optional"],
            "starter-3man-weave": ["skaters", "optional"],
            "starter-pp-umbrella": ["team", "optional"],
            "starter-pk-box": ["team", "optional"],
            "starter-122-forecheck": ["team", "none"],
            "starter-low-cycle": ["team", "optional"],
            "starter-point-shot-screen": ["team", "required"],
            "starter-dzone-coverage": ["team", "optional"],
            "starter-nz-regroup": ["team", "none"],
        });
    });

    it("ships nine goalie drills, every one needing a goalie", () => {
        const goalieDrills = STARTER_PLAYS.filter((p) => p.focus === "goalies");
        expect(goalieDrills.map((p) => p.id).sort()).toEqual([
            "starter-goalie-angles-depth",
            "starter-goalie-breakaways",
            "starter-goalie-butterfly-recovery",
            "starter-goalie-crease-pattern",
            "starter-goalie-post-to-post",
            "starter-goalie-puck-handling",
            "starter-goalie-rebound-control",
            "starter-goalie-screens",
            "starter-goalie-warmup",
        ]);
        expect(goalieDrills.every((p) => p.goalies === "required")).toBe(true);
    });
});
```

Run: `bun run test __tests__/lib/data/starter-plays.test.ts`
Expected: FAIL. `StarterPlay` has no `focus`, the goalie ids are missing, and the point shot has no `G`.

- [ ] **Step 2: Extend the builders and the `StarterPlay` type**

In `lib/data/starter-plays.ts`, replace the header comment's "Diagram conventions" bullet list with:

```ts
 * Diagram conventions used across the pack:
 * - Meaning is carried by `action` (skate, backskate, carry, lateral, pass,
 *   shot, line) and `role` (F/D forwards and defense, O opponents, G goalie,
 *   C coach), never by color alone; colors are just the theme defaults
 * - Player markers are 6 ft radius, so centers are kept >= 12 ft apart
 * - A left-end net is rotated 180° so it opens toward center ice
 * - Drills confined to part of the ice carry an explicit ice area (practice
 *   planner 2a); drills that span the ice leave it unset (full ice)
 * - Every drill is tagged (focus, goalies); a "required" drill draws its
 *   goalie(s), a "none" drill draws none (goaltender-aware drills)
```

Replace the imports and the helper section, from `import {` through the `note` function, with:

```ts
import {
    PLAY_DATA_VERSION,
    type DrawingElement,
    type EquipmentItem,
    type EquipmentKind,
    type PlayData,
    type PlayFocus,
    type PlayGoalies,
    type PlayerIcon,
    type PlayerRole,
    type Position,
    type StrokeAction,
    type TextAnnotation,
} from "@/types/practice-planner";
import { DEFAULT_END_FOR_ACTION, ROLE_DEFAULT_COLORS } from "@/lib/utils/canvas/notation";

export interface StarterPlay {
    /** Stable slug: React keys, thumbnail caching, and the static planner's seeded-id set */
    id: string;
    name: string;
    /** Coaching description, at most 500 characters (PlayEditor's limit) */
    description: string;
    focus: PlayFocus;
    goalies: PlayGoalies;
    playData: PlayData;
}

const SKATE_COLOR = "#212121";
const PASS_COLOR = "#1976D2";
const SHOT_COLOR = "#D32F2F";
const OPPONENT_ROUTE_COLOR = "#D32F2F";
const ZONE_COLOR = "#0D47A1";

type Point = [x: number, y: number];

const toPositions = (points: Point[]): Position[] =>
    points.map(([x, y]) => ({ x, y }));

type Side = "us" | "them" | "goalie" | "coach";

function player(id: string, label: string, x: number, y: number, side: Side = "us"): PlayerIcon {
    // A label "C" on side "us" means center (a forward); a coach is side "coach".
    const role: PlayerRole =
        side === "them" ? "O" : side === "goalie" ? "G" : side === "coach" ? "C" : label.startsWith("D") ? "D" : "F";
    return { id, role, label, position: { x, y }, color: ROLE_DEFAULT_COLORS[role] };
}

const goalie = (id: string, x: number, y: number) => player(id, "G", x, y, "goalie");
const coach = (id: string, x: number, y: number) => player(id, "C", x, y, "coach");

function stroke(action: StrokeAction, id: string, color: string, strokeWidth: number, points: Point[]): DrawingElement {
    return { id, action, path: "straight", end: DEFAULT_END_FOR_ACTION[action], points: toPositions(points), color, strokeWidth };
}

const skate = (id: string, ...points: Point[]) => stroke("skate", id, SKATE_COLOR, 3, points);
/** A skate that ends in a hockey stop (end "stop"). */
const skateStop = (id: string, ...points: Point[]): DrawingElement => ({ ...stroke("skate", id, SKATE_COLOR, 3, points), end: "stop" });
const backskate = (id: string, ...points: Point[]) => stroke("backskate", id, SKATE_COLOR, 3, points);
/** Shuffles, T-pushes and crossovers. */
const lateral = (id: string, ...points: Point[]) => stroke("lateral", id, SKATE_COLOR, 3, points);
const carry = (id: string, ...points: Point[]) => stroke("carry", id, SKATE_COLOR, 3, points);
const pass = (id: string, ...points: Point[]) => stroke("pass", id, PASS_COLOR, 2, points);
const shot = (id: string, ...points: Point[]) => stroke("shot", id, SHOT_COLOR, 2, points);
const opponentRoute = (id: string, ...points: Point[]) => stroke("skate", id, OPPONENT_ROUTE_COLOR, 2, points);
const zoneLine = (id: string, ...points: Point[]) => stroke("line", id, ZONE_COLOR, 2, points);

function gear(kind: EquipmentKind, id: string, x: number, y: number, rotation = 0): EquipmentItem {
    return { id, kind, position: { x, y }, rotation };
}
/** The left-end net, opening toward center ice. */
const leftNet = (id: string) => gear("net", id, 11, 42.5, 180);
const rightNet = (id: string) => gear("net", id, 189, 42.5);
const cone = (id: string, x: number, y: number) => gear("cone", id, x, y);
const pylon = (id: string, x: number, y: number) => gear("pylon", id, x, y);
const pucks = (id: string, x: number, y: number) => gear("puckPile", id, x, y);

function note(id: string, text: string, x: number, y: number, color: string = "#000000"): TextAnnotation {
    return { id, text, position: { x, y }, fontSize: 8, color };
}
```

`rightNet`, `skateStop` and `pylon` are first used in Task 4. If `bun run lint` reports them unused in this task, move those three helpers to Task 4's step 2 instead of disabling the rule.

- [ ] **Step 3: Tag the nine originals and give the point shot its goalie**

Add `focus` / `goalies` directly after each original entry's `description`:

| id | add |
|---|---|
| starter-breakout-5man | `focus: "team", goalies: "optional",` |
| starter-3man-weave | `focus: "skaters", goalies: "optional",` |
| starter-pp-umbrella | `focus: "team", goalies: "optional",` |
| starter-pk-box | `focus: "team", goalies: "optional",` |
| starter-122-forecheck | `focus: "team", goalies: "none",` |
| starter-low-cycle | `focus: "team", goalies: "optional",` |
| starter-dzone-coverage | `focus: "team", goalies: "optional",` |
| starter-nz-regroup | `focus: "team", goalies: "none",` |

Replace the whole `starter-point-shot-screen` entry with this version:
- it is tagged `required`;
- its net-front player moves to (175, 45), and a goalie stands at (187, 42.5), 12.3 ft apart;
- the shot ends at the goalie instead of passing through the net-front marker.

```ts
    {
        id: "starter-point-shot-screen",
        name: "Point Shot with Screen",
        description:
            "Simple offensive-zone set to generate traffic goals. The corner forward wins the puck and moves it to the point; the net-front forward establishes a screen at the top of the crease while the high slot forward crashes for tips and rebounds off the point shot.",
        focus: "team",
        goalies: "required",
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                player("ps-d1", "D1", 130, 30),
                player("ps-d2", "D2", 130, 60),
                player("ps-nf", "NF", 175, 45),
                player("ps-f2", "F2", 170, 72),
                player("ps-f3", "F3", 155, 22),
                goalie("ps-g", 187, 42.5),
            ],
            drawings: [
                pass("ps-pass1", [164, 66], [136, 36]),
                shot("ps-shot", [136, 31], [183, 42]),
                skate("ps-f3-route", [158, 27], [170, 37]),
            ],
            equipment: [
                { id: "ps-pucks", kind: "puckPile", position: { x: 128, y: 45 }, rotation: 0 },
                { id: "ps-net", kind: "net", position: { x: 189, y: 42.5 }, rotation: 0 },
            ],
            annotations: [note("ps-note", "Screen", 170, 57)],
            area: { kind: "zone-right" },
        },
    },
```

- [ ] **Step 4: Add the nine goalie drills**

Append these entries at the end of the `STARTER_PLAYS` array, before the closing `];`:

```ts
    {
        id: "starter-goalie-angles-depth",
        name: "Angles & Depth: Five-Spot Shooting",
        description:
            "Five shooters on an arc from post to post. The coach points to a shooter; the goalie shuffles to square up, sets the feet and finds depth at the top of the crease before the release. Shooters wait until the goalie is set and shoot to the body first, then the corners. Teach: lead with the eyes, short shuffles between neighboring spots (T-pushes for bigger moves), shoulders square to the puck, and back off toward the post as the angle gets sharper. 8–10 min; rotate goalies every 10 shots.",
        focus: "goalies",
        goalies: "required",
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                goalie("ga-g", 14, 42.5),
                player("ga-s1", "1", 30, 14),
                player("ga-s2", "2", 40, 27),
                player("ga-s3", "3", 44, 42.5),
                player("ga-s4", "4", 40, 58),
                player("ga-s5", "5", 30, 71),
            ],
            drawings: [
                zoneLine("ga-angle-line", [40, 27], [11, 42.5]),
                lateral("ga-g-shuffle", [16, 37], [16, 48]),
                shot("ga-shot1", [33, 18], [17, 39]),
                shot("ga-shot3", [38, 42.5], [20, 42.5]),
                shot("ga-shot5", [33, 67], [17, 46]),
            ],
            equipment: [leftNet("ga-net"), pucks("ga-pucks", 54, 42.5)],
            annotations: [note("ga-note", "Set before the shot", 30, 82)],
            area: { kind: "zone-left" },
        },
    },
    {
        id: "starter-goalie-butterfly-recovery",
        name: "Butterfly Drop & Recovery",
        description:
            "The coach shoots low to either pad from the slot. The goalie drops into the butterfly, smothers or controls the shot, then recovers toward the next shooter on the flank: lead leg up on the side the goalie is moving to, push off the trailing leg, and arrive square before the flank shooter releases. Teach: knees together, pads flat to seal the ice, hands out in front, stick blade covering the five-hole, and never recover by standing straight up. 6–8 min, alternate sides.",
        focus: "goalies",
        goalies: "required",
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                goalie("bf-g", 14, 42.5),
                coach("bf-c", 34, 42.5),
                player("bf-s1", "S1", 28, 25),
                player("bf-s2", "S2", 28, 60),
            ],
            drawings: [
                shot("bf-shot1", [29, 43], [18, 46]),
                lateral("bf-recover-up", [15, 39], [15, 31]),
                shot("bf-shot2", [25, 28], [18, 33]),
                lateral("bf-recover-down", [15, 46], [15, 54]),
                shot("bf-shot3", [25, 57], [18, 52]),
            ],
            equipment: [leftNet("bf-net"), pucks("bf-pucks", 37, 50)],
            annotations: [note("bf-note", "Lead leg up", 24, 65)],
            area: { kind: "custom", rect: { x: 0, y: 17.5, w: 40, h: 50 } },
        },
    },
    {
        id: "starter-goalie-post-to-post",
        name: "Post-to-Post: RVH and Pushes",
        description:
            "F1 carries from the corner behind the net and tries a wrap-around at the far post. With the puck below the goal line, the goalie seals the near post in reverse-VH (RVH): post pad flat on the ice against the post, back skate loaded. As F1 wraps, the goalie rotates and pushes across to seal the far post. Option two: F1 stops and passes out to F2 in the slot; the goalie rises out of RVH and T-pushes to square up. Use RVH only while the puck is below the goal line. 6–8 min.",
        focus: "goalies",
        goalies: "required",
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                goalie("pt-g", 14, 37),
                player("pt-f1", "F1", 16, 16),
                player("pt-f2", "F2", 34, 48),
            ],
            drawings: [
                carry("pt-wrap", [12, 19], [5, 30], [5, 55], [12, 64]),
                lateral("pt-g-push", [15, 40], [15, 47]),
                shot("pt-wrap-shot", [13, 63], [12, 48]),
                pass("pt-pass-out", [7, 57], [29, 50]),
                shot("pt-shot2", [30, 46], [18, 43]),
            ],
            equipment: [leftNet("pt-net"), pucks("pt-pucks", 30, 14)],
            annotations: [note("pt-note", "RVH", 24, 30)],
            area: { kind: "custom", rect: { x: 0, y: 10, w: 45, h: 65 } },
        },
    },
    {
        id: "starter-goalie-rebound-control",
        name: "Rebound Control: Steer to the Corners",
        description:
            "A shooter in the high slot shoots low to the pads while F1 and F2 crash the posts on every shot. The goalie angles the pad or the stick blade so the rebound kicks to the corner cones, never back into the slot. Anything left in front, the forwards bury. Count the rebounds that reach the cones. Progress to shots at the body (absorb and cover) and the blocker (deflect to the corner). 8 min.",
        focus: "goalies",
        goalies: "required",
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                goalie("rc-g", 14, 42.5),
                player("rc-s", "S", 48, 42.5),
                player("rc-f1", "F1", 30, 22),
                player("rc-f2", "F2", 30, 63),
            ],
            drawings: [
                shot("rc-shot", [42, 42.5], [18, 46]),
                skate("rc-f1-crash", [33, 26], [22, 34]),
                skate("rc-f2-crash", [33, 59], [22, 51]),
                zoneLine("rc-steer-low", [16, 50], [9, 72]),
                zoneLine("rc-steer-high", [16, 35], [9, 13]),
            ],
            equipment: [leftNet("rc-net"), cone("rc-cone-low", 10, 76), cone("rc-cone-high", 10, 9), pucks("rc-pucks", 56, 42.5)],
            annotations: [note("rc-note", "Steer to the corners", 40, 80)],
            area: { kind: "zone-left" },
        },
    },
    {
        id: "starter-goalie-screens",
        name: "Tracking Through Screens",
        description:
            "D2 passes to D1, who shoots low through traffic while a screener stands at the top of the crease and moves across the goalie's eyes on the pass. The goalie finds the puck by looking around the screen, low and beside the screener's hips, not over the top; holds the crease and the angle; and stays big and patient instead of dropping early. Screener: stick on the ice, no contact with the goalie. 8 min; switch screeners every few shots.",
        focus: "goalies",
        goalies: "required",
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                goalie("sc-g", 14, 42.5),
                player("sc-x", "X", 27, 45),
                player("sc-d1", "D1", 68, 28),
                player("sc-d2", "D2", 68, 58),
            ],
            drawings: [
                pass("sc-pass", [68, 52], [68, 34]),
                shot("sc-shot", [64, 30], [19, 41]),
                skate("sc-screen-move", [31, 50], [31, 38]),
                lateral("sc-g-look", [16, 47], [16, 39]),
            ],
            equipment: [leftNet("sc-net"), pucks("sc-pucks", 72, 43)],
            annotations: [note("sc-note", "Look around, not over", 44, 78)],
            area: { kind: "zone-left" },
        },
    },
    {
        id: "starter-goalie-puck-handling",
        name: "Goalie Puck Handling: Stop and Set",
        description:
            "The coach rims a puck around the boards. The goalie leaves the net early, stops the rim behind the net with the stick on the ice and the glove behind it, and either sets the puck flat beside the net for D1 or moves it up the wall to the winger, on D1's call: \"set\", \"reverse\" or \"wall\". Then the goalie gets back to the crease the short way, stick first. Teach: read the rim early, don't chase pucks you can't reach first, and leave it flat, never on edge. 6 min.",
        focus: "goalies",
        goalies: "required",
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                goalie("ph-g", 14, 42.5),
                coach("ph-c", 80, 72),
                player("ph-d1", "D1", 28, 14),
                player("ph-lw", "LW", 55, 7),
            ],
            drawings: [
                pass("ph-rim-pass", [76, 76], [40, 82], [12, 78], [4, 62], [4, 50]),
                skate("ph-g-route", [11, 47], [5, 52]),
                pass("ph-set-pass", [6, 47], [24, 18]),
                pass("ph-wall-pass", [8, 40], [50, 10]),
            ],
            equipment: [leftNet("ph-net"), pucks("ph-pucks", 86, 76)],
            annotations: [note("ph-note", "Set · Reverse · Wall", 45, 50)],
            area: { kind: "half-left" },
        },
    },
    {
        id: "starter-goalie-breakaways",
        name: "Breakaways and Shootout",
        description:
            "Shooters attack from center ice one at a time, alternating a shot and a deke. The goalie starts at the top of the crease, matches the shooter's speed with a controlled backward glide (C-cuts), keeps the gap so the shooter can't get wide, and stays patient: don't open up or drop first, and follow the puck on the deke. Shooters must finish within 8 seconds. Finish with a three-round shootout. 8–10 min.",
        focus: "goalies",
        goalies: "required",
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                goalie("bk-g", 18, 42.5),
                player("bk-f1", "F1", 92, 42.5),
                player("bk-f2", "F2", 96, 28),
                player("bk-f3", "F3", 96, 57),
            ],
            drawings: [
                carry("bk-carry", [86, 42.5], [50, 40], [30, 37]),
                shot("bk-shot", [29, 37], [17, 40]),
                carry("bk-deke", [30, 46], [24, 53], [17, 50]),
                backskate("bk-g-glide", [23, 48], [15, 46]),
            ],
            equipment: [leftNet("bk-net"), pucks("bk-pucks", 98, 72)],
            annotations: [note("bk-note", "Match speed", 40, 22)],
            area: { kind: "half-left" },
        },
    },
    {
        id: "starter-goalie-warmup",
        name: "Goalie Warm-Up",
        description:
            "Every goalie's warm-up before team drills, run by a coach (5–8 min). Start with slow shots to the body so the goalie finds pucks: five to the blocker, five to the glove, five to each pad, all from the slot. Then the flank shooters shoot to the far pad so the goalie pushes and seals. Finish with five quicker shots anywhere. Shooters hit the goalie; the goal is touch and confidence, not goals.",
        focus: "goalies",
        goalies: "required",
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                goalie("wu-g", 14, 42.5),
                coach("wu-c", 40, 42.5),
                player("wu-f1", "F1", 36, 18),
                player("wu-f2", "F2", 36, 67),
            ],
            drawings: [
                shot("wu-shot1", [34, 42.5], [20, 41]),
                shot("wu-shot2", [33, 22], [18, 46]),
                shot("wu-shot3", [33, 63], [18, 39]),
            ],
            equipment: [leftNet("wu-net"), pucks("wu-pucks", 48, 47)],
            annotations: [note("wu-note", "Shoot to the goalie", 44, 80)],
            area: { kind: "zone-left" },
        },
    },
    {
        id: "starter-goalie-crease-pattern",
        name: "Crease Movement Pattern",
        description:
            "A skating pattern for crease movement, on the coach's whistle: T-push to the top post, step out to the top of the crease, C-cut back to the bottom post. Finish with a shot from F1 so every rep ends in a save. Teach: lead with the head and eyes, rotate the hips before the push, stop square with no drift, stick on the ice the whole time. With two goalies, run it at both ends. 5 min.",
        focus: "goalies",
        goalies: "required",
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                goalie("cp-g", 14, 42.5),
                coach("cp-c", 40, 42.5),
                player("cp-f1", "F1", 36, 64),
            ],
            drawings: [
                lateral("cp-push-top", [15, 37], [15, 31]),
                skate("cp-out", [17, 31], [24, 40]),
                backskate("cp-back", [24, 45], [17, 54]),
                shot("cp-shot", [33, 61], [19, 52]),
            ],
            equipment: [leftNet("cp-net"), cone("cp-cone-top", 16, 28), cone("cp-cone-out", 27, 42.5), cone("cp-cone-bottom", 16, 57), pucks("cp-pucks", 44, 66)],
            annotations: [note("cp-note", "Post · top · post", 30, 20)],
            area: { kind: "custom", rect: { x: 0, y: 12.5, w: 50, h: 60 } },
        },
    },
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun run test __tests__/lib/data/starter-plays.test.ts && bun run type-check`
Expected: PASS. Every other `STARTER_PLAYS` consumer still compiles, because the new fields are additions.

Then run the other tests that render or count the starter pack. These can depend on its size or order:
- `__tests__/apps/planner/app.test.tsx`: the seeded library shows `STARTER_PLAYS[0]`;
- `__tests__/apps/planner/open-store.test.ts`: total equals `STARTER_PLAYS.length`;
- `__tests__/components/features/practice-planner/PlayLibrary.test.tsx`: manage mode renders a starter card per unseen starter.

`bun run test __tests__/apps/planner __tests__/components/features/practice-planner/PlayLibrary.test.tsx __tests__/components/features/practice-planner/PlayLibrary.portable.test.tsx`

Expected: PASS. Seeded starters share one `createdAt` and sort by name, so page 1 (20) still holds the originals these tests look for. If an assertion counts starter cards or assumes exactly nine, fix it forward: count `STARTER_PLAYS`, or scope the query to the card under test. Never trim the pack to make a test pass. Repeat this run after Task 4 takes the pack to 26.

- [ ] **Step 6: Commit**

Also stage any starter-count test fixed in Step 5.

```bash
/usr/bin/git add lib/data/starter-plays.ts __tests__/lib/data/starter-plays.test.ts
/usr/bin/git commit -m "feat(practice-planner): goalie starter drills and starter tags" -m "Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 4: Starter content, part 2: eight skater fundamentals and three station templates

Content only. The "Use template" UI is Task 8.

**Files:**
- Modify: `lib/data/starter-plays.ts`
- Create: `lib/data/starter-templates.ts`
- Test: `__tests__/lib/data/starter-plays.test.ts`, create `__tests__/lib/data/starter-templates.test.ts`

**Interfaces:**
- Consumes: `STARTER_PLAYS` and `StarterPlay` (Task 3); `serializePlan`, `PlanSessionInput`, `PlanGenerator` and `PlanDocument` (Task 1).
- Produces:
  - `STARTER_TEMPLATES: readonly StarterTemplate[]`, where each is `{ id; name; description; session: PlanSessionInput }`;
  - `starterTemplatePlan(template, generator, now?): PlanDocument`;
  - the template ids `template-skills-stations`, `template-goalie-skater-rotation` and `template-team-stations`.

- [ ] **Step 1: Write the failing tests**

In `__tests__/lib/data/starter-plays.test.ts`, add the skater ids to `EXPECTED`:

```ts
        "starter-skate-edges-crossovers": "zone-right",
        "starter-skate-transitions": "zone-neutral",
        "starter-skate-passing-lanes": undefined,
        "starter-skate-wrist-shots": "zone-right",
        "starter-skate-puck-protection": "custom",
        "starter-skate-small-area-2v2": "zone-right",
        "starter-skate-stops-starts": undefined,
        "starter-skate-stickhandling": "zone-neutral",
```

Append, inside `describe("Starter drill tags")`:

```ts
    it("ships eight skater fundamentals and 26 starters in all", () => {
        expect(STARTER_PLAYS.filter((p) => p.id.startsWith("starter-skate-")).map((p) => p.focus)).toEqual(Array(8).fill("skaters"));
        expect(STARTER_PLAYS).toHaveLength(26);
    });
```

Create `__tests__/lib/data/starter-templates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { STARTER_TEMPLATES, starterTemplatePlan } from "@/lib/data/starter-templates";
import { STARTER_PLAYS } from "@/lib/data/starter-plays";
import { parsePlan } from "@/lib/plan-document";
import {
    MAX_STATIONS_PER_GROUP,
    goalieWarnings,
    groupStations,
    sessionWallMinutes,
    stationGroupError,
    stationWarnings,
} from "@/lib/utils/session-timeline";

const NOW = new Date("2026-10-03T18:00:00.000Z");

describe("starter templates", () => {
    it("ships three templates with stable unique ids and names", () => {
        expect(STARTER_TEMPLATES.map((t) => t.id)).toEqual([
            "template-skills-stations",
            "template-goalie-skater-rotation",
            "template-team-stations",
        ]);
        expect(new Set(STARTER_TEMPLATES.map((t) => t.name)).size).toBe(3);
    });

    describe.each(STARTER_TEMPLATES.map((t) => [t.name, t] as const))("%s", (_name, template) => {
        const drills = template.session.drills;

        it("serializes to a valid plan document for either app, stamped at use time", () => {
            for (const generator of ["openleague-static", "openleague-hosted"] as const) {
                const doc = starterTemplatePlan(template, generator, NOW);
                expect(doc.generator).toBe(generator);
                expect(doc.exportedAt).toBe(NOW.toISOString());
                const parsed = parsePlan(JSON.parse(JSON.stringify(doc)));
                expect(parsed.ok ? [] : parsed.error.issues).toEqual([]);
            }
        });

        it("has a coaching description and fits its duration", () => {
            expect(template.description.length).toBeGreaterThan(40);
            expect(sessionWallMinutes(drills)).toBeLessThanOrEqual(template.session.durationMinutes);
            expect(stationGroupError(drills)).toBeNull();
        });

        it("has station blocks of 2–4 drills, each with a goalie station", () => {
            const blocks = groupStations(drills).filter((group) => group.stations.length > 1);
            expect(blocks.length).toBeGreaterThan(0);
            for (const block of blocks) {
                expect(block.stations.length).toBeLessThanOrEqual(MAX_STATIONS_PER_GROUP);
                expect(block.stations.some((station) => station.goalies === "required")).toBe(true);
            }
        });

        it("puts stations on ice that doesn't overlap", () => {
            const withAreas = drills.map((d) => ({ ...d, area: d.playData?.area }));
            expect(stationWarnings(groupStations(withAreas), null).overlaps).toEqual([]);
        });

        it("runs with a single goalie", () => {
            expect(goalieWarnings(groupStations(drills), 1).short).toEqual([]);
        });

        it("uses starter drills verbatim", () => {
            for (const drill of drills) {
                const starter = STARTER_PLAYS.find((p) => p.name === drill.name);
                expect(starter, drill.name).toBeDefined();
                expect(drill).toMatchObject({
                    description: starter!.description,
                    focus: starter!.focus,
                    goalies: starter!.goalies,
                    playData: starter!.playData,
                });
            }
        });
    });
});
```

Run: `bun run test __tests__/lib/data`
Expected: FAIL. The skater ids are missing, and `@/lib/data/starter-templates` doesn't exist.

- [ ] **Step 2: Add the eight skater drills**

Append these entries at the end of the `STARTER_PLAYS` array, after the goalie drills:

```ts
    {
        id: "starter-skate-edges-crossovers",
        name: "Edges & Crossovers: Circle Figure-Eights",
        description:
            "Forward crossovers around both right-end circles in a figure eight, switching direction through the middle so both edges work. Teach: knees bent, a full push from the outside leg, the crossover leg pushing under the body on its outside edge, shoulders level, head and stick up. Second time through, backward crossovers. Add a puck once the pattern is clean. 6–8 min.",
        focus: "skaters",
        goalies: "none",
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                player("ec-s1", "S1", 140, 42.5),
                player("ec-s2", "S2", 130, 30),
                player("ec-s3", "S3", 130, 55),
            ],
            drawings: [
                skate("ec-entry", [146, 42.5], [156, 34]),
                lateral(
                    "ec-figure-eight",
                    [157, 32.5], [152, 20.5], [157, 8.5], [169, 3.5], [181, 8.5], [186, 20.5], [181, 32.5],
                    [169, 42.5],
                    [157, 52.5], [152, 64.5], [157, 76.5], [169, 81.5], [181, 76.5], [186, 64.5], [181, 52.5], [172, 44],
                ),
                skate("ec-exit", [170, 46], [146, 50]),
            ],
            equipment: [pylon("ec-pylon-top", 169, 20.5), pylon("ec-pylon-bottom", 169, 64.5)],
            annotations: [note("ec-note", "Switch edges in the middle", 150, 82)],
            area: { kind: "zone-right" },
        },
    },
    {
        id: "starter-skate-transitions",
        name: "Pivots & Transitions: Cone Box",
        description:
            "Skate forward up one side of the box, open the hips and pivot to backward at the cone, skate backward across the top, pivot to forward down the far side, and so on around the box. Teach: pivot at the cone, not after it; turn the hips and shoulders together; keep the stick on the ice and the eyes up the ice; quick feet out of every pivot. Run both directions so the pivots go both ways. 6 min.",
        focus: "skaters",
        goalies: "none",
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                player("tr-s1", "S1", 82, 77),
                player("tr-s2", "S2", 95, 77),
                player("tr-s3", "S3", 108, 77),
            ],
            drawings: [
                skate("tr-fwd-left", [85, 70], [85, 23]),
                backskate("tr-back-top", [88, 20], [112, 20]),
                skate("tr-fwd-right", [115, 23], [115, 62]),
                backskate("tr-back-bottom", [112, 65], [88, 65]),
            ],
            equipment: [cone("tr-cone1", 85, 20), cone("tr-cone2", 115, 20), cone("tr-cone3", 115, 65), cone("tr-cone4", 85, 65)],
            annotations: [note("tr-note", "Pivot at every cone", 100, 42.5)],
            area: { kind: "zone-neutral" },
        },
    },
    {
        id: "starter-skate-passing-lanes",
        name: "Partner Passing Lanes",
        description:
            "Partners skate the length of the ice about 40 feet apart, passing back and forth at full speed without breaking stride. Pass ahead of your partner's stick so they skate into it; receive on the forehand and backhand alternately and cushion the puck (soft hands, blade angled over the puck). The last pass comes at the far blue line; the receiver drives wide and shoots. Count completed passes per trip. 8 min.",
        focus: "skaters",
        goalies: "optional",
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                player("pl-a1", "A1", 18, 20),
                player("pl-a2", "A2", 18, 65),
                player("pl-b1", "B1", 6, 20),
                player("pl-b2", "B2", 6, 65),
            ],
            drawings: [
                skate("pl-a1-route", [24, 20], [160, 20]),
                skate("pl-a2-route", [24, 65], [160, 65]),
                pass("pl-pass1", [40, 23], [62, 62]),
                pass("pl-pass2", [78, 62], [100, 23]),
                pass("pl-pass3", [116, 23], [138, 62]),
                carry("pl-a2-drive", [160, 65], [176, 56]),
                shot("pl-shot", [176, 55], [187, 45]),
            ],
            equipment: [rightNet("pl-net"), pucks("pl-pucks", 10, 42.5)],
            annotations: [],
        },
    },
    {
        id: "starter-skate-wrist-shots",
        name: "Wrist-Shot Lanes",
        description:
            "Three lines at the tops of the circles and the high slot. On the whistle, each shooter takes a short pull-in carry and shoots a wrist shot in stride, lines alternating. Teach: the puck starts at the heel of the blade beside the back foot; weight moves from the back foot to the front; roll the wrists and follow through at the target, low for low shots and high for the top corners. Pick a spot before the release. 8 min; rotate lines every five shots.",
        focus: "skaters",
        goalies: "optional",
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                goalie("ws-g", 186, 42.5),
                player("ws-s1", "S1", 150, 18),
                player("ws-s2", "S2", 140, 42.5),
                player("ws-s3", "S3", 150, 67),
            ],
            drawings: [
                carry("ws-s1-carry", [154, 22], [162, 28]),
                shot("ws-shot1", [163, 29], [184, 39]),
                carry("ws-s2-carry", [146, 42.5], [158, 42.5]),
                shot("ws-shot2", [159, 42.5], [181, 42.5]),
                carry("ws-s3-carry", [154, 63], [162, 57]),
                shot("ws-shot3", [163, 56], [184, 46]),
            ],
            equipment: [rightNet("ws-net"), pucks("ws-pucks1", 144, 12), pucks("ws-pucks2", 132, 42.5), pucks("ws-pucks3", 144, 73)],
            annotations: [note("ws-note", "Pick a spot", 170, 82)],
            area: { kind: "zone-right" },
        },
    },
    {
        id: "starter-skate-puck-protection",
        name: "Puck Protection: Wall Battle",
        description:
            "The coach spots a puck into the corner. F1 wins it and protects it along the wall for 10 seconds against a live defender, staying inside the cones. Teach: wide base and bent knees, the puck on the far side of the body from the defender's stick, the inside arm and hip holding the defender off (legal body position, no hooking), and a cut back when the defender overcommits. Defender: stick on the puck, body between the puck and the net. Swap roles every rep. 6 min.",
        focus: "skaters",
        goalies: "none",
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                player("pr-f1", "F1", 175, 74),
                player("pr-o1", "O1", 166, 64, "them"),
                coach("pr-c", 190, 52),
            ],
            drawings: [
                pass("pr-pass", [186, 55], [178, 69]),
                carry("pr-carry", [179, 78], [190, 75], [194, 62]),
                carry("pr-cutback", [192, 58], [180, 60]),
                opponentRoute("pr-o1-route", [168, 69], [180, 77]),
            ],
            equipment: [cone("pr-cone1", 158, 48), cone("pr-cone2", 158, 82), pucks("pr-pucks", 196, 48)],
            annotations: [note("pr-note", "10 seconds", 166, 50)],
            area: { kind: "custom", rect: { x: 155, y: 45, w: 45, h: 40 } },
        },
    },
    {
        id: "starter-skate-small-area-2v2",
        name: "Small-Area 2-on-2 Battle",
        description:
            "The coach spots pucks into the zone: two attackers against two defenders, 30–40 second shifts, everything below the tops of the circles. Attackers get to the net fast; one takes the puck to the net, the other finds open ice for a pass or a rebound. Defenders: stick on the puck, take away the middle, win it and move it to the coach to switch. Keep score, because battles need consequences. 10–12 min.",
        focus: "skaters",
        goalies: "optional",
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                goalie("sa-g", 186, 42.5),
                player("sa-f1", "F1", 158, 30),
                player("sa-f2", "F2", 158, 58),
                player("sa-o1", "O1", 171, 32, "them"),
                player("sa-o2", "O2", 171, 55, "them"),
                coach("sa-c", 136, 78),
            ],
            drawings: [
                pass("sa-pass1", [140, 76], [154, 62]),
                carry("sa-f2-carry", [163, 61], [176, 70]),
                pass("sa-pass2", [176, 66], [162, 34]),
                shot("sa-shot", [163, 33], [183, 40]),
                opponentRoute("sa-o1-route", [168, 36], [164, 44]),
            ],
            equipment: [rightNet("sa-net"), pucks("sa-pucks", 132, 82)],
            annotations: [],
            area: { kind: "zone-right" },
        },
    },
    {
        id: "starter-skate-stops-starts",
        name: "Stops & Starts",
        description:
            "Skate from the goal line to the near blue line, two-foot hockey stop, and sprint back; then to the red line and back, then the far blue line and back. Stop facing the same wall on the way out and the other wall on the way back so both sides get worked. Teach: drop the hips, turn the hips and shoulders together, skates about shoulder-width apart, and dig in the inside edge of the front skate and the outside edge of the back skate. Explode out with short, quick first strides. 4–5 min.",
        focus: "skaters",
        goalies: "none",
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                player("ss-s1", "S1", 14, 20),
                player("ss-s2", "S2", 14, 42.5),
                player("ss-s3", "S3", 14, 65),
            ],
            drawings: [
                skateStop("ss-s1-out", [20, 20], [73, 20]),
                skateStop("ss-s1-back", [73, 25], [20, 25]),
                skateStop("ss-s2-out", [20, 42.5], [98, 42.5]),
                skateStop("ss-s3-out", [20, 65], [123, 65]),
            ],
            equipment: [],
            annotations: [note("ss-note", "Stop facing the same wall", 100, 8)],
        },
    },
    {
        id: "starter-skate-stickhandling",
        name: "Stickhandling: Cone Weave",
        description:
            "Carry the puck through the cones with quick side-to-side handles, finish around the last cone with a toe drag, and pass to the next skater. Teach: the puck in the middle of the blade, a loose bottom hand, the top hand doing the work, the puck moving wider than the body, and the eyes up between cones (glance down, don't stare). Progress: forehand only, backhand only, then one hand on the stick. 6 min.",
        focus: "skaters",
        goalies: "none",
        playData: {
            version: PLAY_DATA_VERSION,
            players: [
                player("st-s1", "S1", 80, 15),
                player("st-s2", "S2", 92, 15),
                player("st-s3", "S3", 104, 15),
            ],
            drawings: [
                carry("st-weave", [80, 21], [80, 35], [86, 49], [91, 37], [96, 49], [101, 37], [106, 49], [111, 37], [116, 49], [122, 42.5], [119, 32]),
                pass("st-pass", [116, 29], [107, 20]),
                skate("st-s2-next", [92, 21], [84, 30]),
            ],
            equipment: [cone("st-cone1", 86, 42.5), cone("st-cone2", 96, 42.5), cone("st-cone3", 106, 42.5), cone("st-cone4", 116, 42.5), pucks("st-pucks", 78, 6)],
            annotations: [note("st-note", "Eyes up", 100, 70)],
            area: { kind: "zone-neutral" },
        },
    },
```

- [ ] **Step 3: Create `lib/data/starter-templates.ts`**

```ts
/**
 * Starter practice templates (goaltender-aware drills, spec R10): station
 * practices built from starter drills, each station block with a goalie
 * station on its own piece of ice.
 *
 * Plain plan-document inputs. A template becomes a PlanDocument only when a
 * coach uses it (starterTemplatePlan), so the generator is the running app's
 * and exportedAt is "now". Both import flows then re-parse it like any file.
 */
import { serializePlan, type PlanDocument, type PlanGenerator, type PlanSessionInput } from "@/lib/plan-document";
import { STARTER_PLAYS, type StarterPlay } from "@/lib/data/starter-plays";

export interface StarterTemplate {
    /** Stable slug */
    id: string;
    name: string;
    description: string;
    session: PlanSessionInput;
}

interface Station {
    /** A starter drill id */
    drill: string;
    minutes: number;
    instructions?: string;
}

function starter(id: string): StarterPlay {
    const found = STARTER_PLAYS.find((play) => play.id === id);
    if (!found) throw new Error(`Unknown starter drill "${id}" in a starter template`);
    return found;
}

/** Each inner array is one block: its first drill runs on its own, the rest run with it as stations. */
function practice(title: string, durationMinutes: number, blocks: Station[][]): PlanSessionInput {
    const drills = blocks
        .flatMap((block) => block.map((station, slot) => ({ station, runsWithPrevious: slot > 0 })))
        .map(({ station, runsWithPrevious }, sequence) => {
            const play = starter(station.drill);
            return {
                sequence,
                duration: station.minutes,
                runsWithPrevious,
                instructions: station.instructions ?? "",
                name: play.name,
                description: play.description,
                focus: play.focus,
                goalies: play.goalies,
                playData: play.playData,
            };
        });
    return { title, durationMinutes, date: null, startTime: null, goaliesAttending: null, drills };
}

const GOALIE_STAYS = (minutes: number) => `Goalies stay at this station; skater groups rotate every ${minutes} minutes.`;
const ROTATE = (minutes: number) => `Skater groups rotate every ${minutes} minutes.`;
const EMPTY_NET = "With one goalie, shoot at an empty net or targets.";

export const STARTER_TEMPLATES: readonly StarterTemplate[] = [
    {
        id: "template-skills-stations",
        name: "Skills Stations",
        description:
            "A 60-minute skills practice for one goalie and any number of skaters: a goalie warm-up alongside skater edge work, a three-station block (goalie angles, stickhandling, shooting), then passing, small-area battles and a conditioning finish.",
        session: practice("Skills Stations", 60, [
            [
                { drill: "starter-goalie-warmup", minutes: 8, instructions: "A coach warms up the goalies while the skaters work edges." },
                { drill: "starter-skate-edges-crossovers", minutes: 10 },
            ],
            [
                { drill: "starter-goalie-angles-depth", minutes: 15, instructions: GOALIE_STAYS(5) },
                { drill: "starter-skate-stickhandling", minutes: 15, instructions: ROTATE(5) },
                { drill: "starter-skate-wrist-shots", minutes: 15, instructions: `${ROTATE(5)} ${EMPTY_NET}` },
            ],
            [{ drill: "starter-skate-passing-lanes", minutes: 10 }],
            [{ drill: "starter-skate-small-area-2v2", minutes: 15, instructions: "Goalie in net; 30–40 second shifts." }],
            [{ drill: "starter-skate-stops-starts", minutes: 5 }],
        ]),
    },
    {
        id: "template-goalie-skater-rotation",
        name: "Goalie & Skater Rotation",
        description:
            "A 45-minute practice that keeps the goalie working the whole time: three stations at once on separate ice (goalie work, skating, puck skills), then breakaways and a small-area game to finish.",
        session: practice("Goalie & Skater Rotation", 45, [
            [
                { drill: "starter-goalie-warmup", minutes: 8, instructions: "A coach warms up the goalies." },
                { drill: "starter-skate-transitions", minutes: 8, instructions: "Half the skaters; switch with edges at 4 minutes." },
                { drill: "starter-skate-edges-crossovers", minutes: 8, instructions: "Half the skaters; switch with transitions at 4 minutes." },
            ],
            [
                { drill: "starter-goalie-butterfly-recovery", minutes: 12, instructions: "Goalies stay at this station with a coach." },
                { drill: "starter-skate-stickhandling", minutes: 12, instructions: "Switch with puck protection at 6 minutes." },
                { drill: "starter-skate-puck-protection", minutes: 12, instructions: "Switch with stickhandling at 6 minutes." },
            ],
            [{ drill: "starter-goalie-breakaways", minutes: 10 }],
            [{ drill: "starter-skate-small-area-2v2", minutes: 12, instructions: "Goalie in net; 30–40 second shifts." }],
        ]),
    },
    {
        id: "template-team-stations",
        name: "Team Practice with Stations",
        description:
            "A 60-minute team practice: two three-station skill blocks, each with a goalie station, then the full team on point shots with a screen, breakouts and the 3-man weave.",
        session: practice("Team Practice with Stations", 60, [
            [
                { drill: "starter-goalie-angles-depth", minutes: 15, instructions: GOALIE_STAYS(5) },
                { drill: "starter-skate-transitions", minutes: 15, instructions: ROTATE(5) },
                { drill: "starter-skate-small-area-2v2", minutes: 15, instructions: `${ROTATE(5)} ${EMPTY_NET}` },
            ],
            [
                { drill: "starter-goalie-rebound-control", minutes: 15, instructions: GOALIE_STAYS(5) },
                { drill: "starter-skate-stickhandling", minutes: 15, instructions: ROTATE(5) },
                { drill: "starter-skate-wrist-shots", minutes: 15, instructions: `${ROTATE(5)} ${EMPTY_NET}` },
            ],
            [{ drill: "starter-point-shot-screen", minutes: 10 }],
            [{ drill: "starter-breakout-5man", minutes: 10 }],
            [{ drill: "starter-3man-weave", minutes: 8 }],
        ]),
    },
];

/** The template as a plan document from the running app, ready for the import flow. */
export function starterTemplatePlan(template: StarterTemplate, generator: PlanGenerator, now: Date = new Date()): PlanDocument {
    return serializePlan(template.session, generator, now);
}
```

Checked layouts, with wall time against duration:
- Skills Stations: 10 + 15 + 10 + 15 + 5 = 55 / 60.
- Goalie & Skater Rotation: 8 + 12 + 10 + 12 = 42 / 45.
- Team Practice with Stations: 15 + 15 + 10 + 10 + 8 = 58 / 60.

In every block, the stations sit on non-overlapping areas: zone-left, zone-neutral, zone-right, the left-crease custom rectangle and the right-corner custom rectangle.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test __tests__/lib/data && bun run type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add lib/data/starter-plays.ts lib/data/starter-templates.ts __tests__/lib/data/starter-plays.test.ts __tests__/lib/data/starter-templates.test.ts
/usr/bin/git commit -m "feat(practice-planner): skater starter drills and station practice templates" -m "Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 5: Static store: tags, goalie count, filters and seeding by id

The static planner's copy paths (spec R4, R5), its library filters (R8) and upgrade-safe starter delivery (R9).

**Files:**
- Modify: `apps/planner/src/store/records.ts`, `types.ts`, `shared.ts`, `library.ts`, `sessions.ts`
- Modify: `apps/planner/src/screens/SessionEditorScreen.tsx` (`toLocalSessionSave`), `apps/planner/src/screens/DrillEditorScreen.tsx`
- Test: `__tests__/apps/planner/local-store.library.test.ts`, `__tests__/apps/planner/local-store.sessions.test.ts`, `__tests__/apps/planner/editor-screens.test.tsx`

**Interfaces:**
- Consumes: `drillTags`, `toPlayFocus`, `toPlayGoalies`, `toGoaliesAttending` and `GOALIES_ATTENDING_MESSAGE` (Task 1); `STARTER_PLAYS` with `focus`/`goalies` (Tasks 3–4); `LibraryQuery.focus?/goalies?`.
- Produces:
  - `StoredPlay.focus?` and `goalies?`; `StoredSession.goaliesAttending?`;
  - `LocalSessionSave.goaliesAttending?: number | null`; `LocalPlayUpdate.focus?` and `goalies?`;
  - `META_SEEDED_STARTER_IDS` and `LEGACY_SEEDED_STARTER_IDS` (records.ts);
  - `seededStarterIds(stored, legacyFlag): Set<string>` (library.ts);
  - `checkedGoalieCount(value)` (shared.ts).

- [ ] **Step 1: Write the failing store tests**

In `__tests__/apps/planner/local-store.library.test.ts`, extend the imports:

```ts
import { LEGACY_SEEDED_STARTER_IDS, META_SEEDED_STARTER_IDS, META_STARTERS_SEEDED, type StoredPlay } from "@/apps/planner/src/store/records";
```

The file already imports `type StoredPlay` from records; merge it into this line. Then replace the existing test `seeds the starter drills once, skipping names already in the library, and never re-seeds` with:

```ts
    it("seeds every starter once, skipping names already in the library, records every id, and never re-seeds", async () => {
        const { repo, library } = await setup();
        await addLibraryPlay(library, STARTER_PLAYS[0].name.toUpperCase());
        await library.seedStarterDrills();
        const all = await library.getPlaysByTeam({ ...QUERY, limit: 100 });
        expect(all.success && all.data.total).toBe(STARTER_PLAYS.length);
        expect(await repo.read((tx) => tx.getMeta(META_SEEDED_STARTER_IDS))).toEqual(STARTER_PLAYS.map((s) => s.id));

        const starterId = all.success ? all.data.plays.find((p) => p.name === STARTER_PLAYS[1].name)!.id : "";
        await library.deletePlay({ id: starterId, teamId: LOCAL_TEAM_ID });
        await library.seedStarterDrills();
        const after = await library.getPlaysByTeam({ ...QUERY, limit: 100 });
        expect(after.success && after.data.total).toBe(STARTER_PLAYS.length - 1);
    });

    it("stores each starter's tags", async () => {
        const { library } = await setup();
        await library.seedStarterDrills();
        const goalieDrills = await library.getPlaysByTeam({ ...QUERY, limit: 100, focus: "goalies" });
        expect(goalieDrills.success && goalieDrills.data.total).toBe(STARTER_PLAYS.filter((s) => s.focus === "goalies").length);
    });

    it("upgrades a device seeded before ids were tracked: adds only the new starters, never a deleted original", async () => {
        const { repo, library } = await setup();
        // A device that seeded the original nine (legacy flag), then deleted the first one.
        await repo.write((tx) => tx.putMeta(META_STARTERS_SEEDED, true));
        for (const id of LEGACY_SEEDED_STARTER_IDS.slice(1)) {
            await addLibraryPlay(library, STARTER_PLAYS.find((s) => s.id === id)!.name);
        }
        await library.seedStarterDrills();

        const all = await library.getPlaysByTeam({ ...QUERY, limit: 100 });
        const names = all.success ? all.data.plays.map((p) => p.name) : [];
        expect(names).not.toContain(STARTER_PLAYS.find((s) => s.id === LEGACY_SEEDED_STARTER_IDS[0])!.name);
        expect(all.success && all.data.total).toBe(STARTER_PLAYS.length - 1);
        expect(new Set(await repo.read((tx) => tx.getMeta(META_SEEDED_STARTER_IDS)) as string[])).toEqual(new Set(STARTER_PLAYS.map((s) => s.id)));
    });

    it("marks a new starter seeded when a coach's drill already has its name, so deleting that drill never brings the starter back", async () => {
        const { repo, library } = await setup();
        await repo.write((tx) => tx.putMeta(META_STARTERS_SEEDED, true));
        const warmUp = STARTER_PLAYS.find((s) => s.id === "starter-goalie-warmup")!;
        const mine = await addLibraryPlay(library, warmUp.name);
        await library.seedStarterDrills();
        const named = async () => {
            const all = await library.getPlaysByTeam({ ...QUERY, limit: 100 });
            return all.success ? all.data.plays.filter((p) => p.name === warmUp.name).map((p) => p.id) : [];
        };
        expect(await named()).toEqual([mine]);
        await library.deletePlay({ id: mine, teamId: LOCAL_TEAM_ID });
        await library.seedStarterDrills();
        expect(await named()).toEqual([]);
    });

    it("filters by focus and goalies before paging, reading untagged records as team / optional", async () => {
        const { repo, clock, library } = await setup();
        const empty = createEmptyPlayData();
        await library.createPlay({ name: "Warm-up", playData: empty, isTemplate: true, teamId: LOCAL_TEAM_ID, focus: "goalies", goalies: "required" });
        await library.createPlay({ name: "Edges", playData: empty, isTemplate: true, teamId: LOCAL_TEAM_ID, focus: "skaters", goalies: "none" });
        const legacy: StoredPlay = {
            id: "legacy", name: "Legacy", description: null, thumbnail: null, playData: empty, isTemplate: true,
            sessionId: null, sourcePlayId: null, createdAt: clock.now, updatedAt: clock.now,
        };
        await repo.write((tx) => tx.putPlay(legacy));
        const names = async (filters: { focus?: "team" | "skaters" | "goalies"; goalies?: "none" | "optional" | "required" }) => {
            const result = await library.getPlaysByTeam({ ...QUERY, ...filters });
            return result.success ? result.data.plays.map((p) => p.name).sort() : [];
        };
        expect(await names({ focus: "goalies" })).toEqual(["Warm-up"]);
        expect(await names({ focus: "team" })).toEqual(["Legacy"]);
        expect(await names({ goalies: "optional" })).toEqual(["Legacy"]);
        expect(await names({ focus: "skaters", goalies: "none" })).toEqual(["Edges"]);
        const page = await library.getPlaysByTeam({ ...QUERY, focus: "goalies", limit: 1, page: 1 });
        expect(page.success && page.data.total).toBe(1);
        const read = await library.getPlayById({ id: "legacy", teamId: LOCAL_TEAM_ID });
        expect(read.success && read.data).toMatchObject({ focus: "team", goalies: "optional" });
    });

    it("updatePlay keeps the tags unless new ones are sent", async () => {
        const { library } = await setup();
        const created = await library.createPlay({ name: "Warm-up", playData: createEmptyPlayData(), isTemplate: true, teamId: LOCAL_TEAM_ID, focus: "goalies", goalies: "required" });
        if (!created.success) throw new Error(created.error);
        await library.updatePlay({ id: created.data.id, name: "Warm-up", playData: createEmptyPlayData() });
        let read = await library.getPlayById({ id: created.data.id, teamId: LOCAL_TEAM_ID });
        expect(read.success && read.data).toMatchObject({ focus: "goalies", goalies: "required" });
        await library.updatePlay({ id: created.data.id, name: "Warm-up", playData: createEmptyPlayData(), goalies: "optional" });
        read = await library.getPlayById({ id: created.data.id, teamId: LOCAL_TEAM_ID });
        expect(read.success && read.data).toMatchObject({ focus: "goalies", goalies: "optional" });
    });
```

Outside the `describe.each`, add:

```ts
describe("LEGACY_SEEDED_STARTER_IDS", () => {
    it("pins the nine starters every device seeded before ids were tracked", () => {
        expect(LEGACY_SEEDED_STARTER_IDS).toEqual([
            "starter-breakout-5man", "starter-3man-weave", "starter-pp-umbrella", "starter-pk-box", "starter-122-forecheck",
            "starter-low-cycle", "starter-point-shot-screen", "starter-dzone-coverage", "starter-nz-regroup",
        ]);
        for (const id of LEGACY_SEEDED_STARTER_IDS) expect(STARTER_PLAYS.some((s) => s.id === id), id).toBe(true);
    });
});
```

In `__tests__/apps/planner/local-store.sessions.test.ts`, add `import type { ActionResult } from "@/lib/planner-store";` and `import { GOALIES_ATTENDING_MESSAGE } from "@/lib/utils/drill-tags";`. Below the `save` helper, add:

```ts
function data<T>(result: ActionResult<T>): T {
    if (!result.success) throw new Error(result.error);
    return result.data;
}
```

Inside `describe.each(REPOS)`, add:

```ts
    it("carries drill tags and the goalie count through saves, forks, add-to-library and duplicate", async () => {
        const { store } = await setup();
        const lib = data(await store.createPlay({ name: "Warm-up", playData: createEmptyPlayData(), isTemplate: true, teamId: T, focus: "goalies", goalies: "required" }));
        const session = data(await store.createSession(save([drill(lib.id, "k1", 0)], { goaliesAttending: 1 })));

        const view = data(await store.getSessionView(session.id));
        expect(view.goaliesAttending).toBe(1);
        expect(view.plays[0].play).toMatchObject({ focus: "goalies", goalies: "required" });
        const edit = data(await store.getSessionForEdit(session.id));
        expect(edit.initialData.goaliesAttending).toBe(1);
        expect(edit.initialData.plays[0]).toMatchObject({ focus: "goalies", goalies: "required" });

        // A fork with no tags sent inherits the library drill's.
        const fork = data(await store.saveSessionDrill({ sessionId: session.id, teamId: T, playId: lib.id, name: "Warm-up", playData: createEmptyPlayData() }));
        const copied = data(await store.copySessionDrillToLibrary({ playId: fork.playId, teamId: T }));
        expect(data(await store.getPlayById({ id: copied.playId, teamId: T }))).toMatchObject({ focus: "goalies", goalies: "required" });

        // Saving an owned drill in place with new tags changes them.
        const owned = view.plays[0].play.id;
        data(await store.saveSessionDrill({ sessionId: session.id, teamId: T, playId: owned, name: "Warm-up", playData: createEmptyPlayData(), goalies: "optional" }));
        expect(data(await store.getSessionView(session.id)).plays[0].play).toMatchObject({ focus: "goalies", goalies: "optional" });

        const duplicate = data(await store.duplicatePracticeSession({ id: session.id, teamId: T, date: new Date("2026-10-13T19:00:00") }));
        const copy = data(await store.getSessionView(duplicate.id));
        expect(copy.goaliesAttending).toBe(1);
        expect(copy.plays[0].play).toMatchObject({ focus: "goalies", goalies: "optional" });
    });

    it("keeps the goalie count when an update omits it, clears it on null, and refuses an out-of-range count", async () => {
        const { store } = await setup();
        const { id } = data(await store.createSession(save([], { goaliesAttending: 2 })));
        data(await store.updateSession(id, save([])));
        expect(data(await store.getSessionView(id)).goaliesAttending).toBe(2);
        data(await store.updateSession(id, save([], { goaliesAttending: null })));
        expect(data(await store.getSessionView(id)).goaliesAttending).toBeNull();
        expect(await store.updateSession(id, save([], { goaliesAttending: 11 }))).toEqual({ success: false, error: GOALIES_ATTENDING_MESSAGE });
        expect(await store.createSession(save([], { goaliesAttending: -1 }))).toEqual({ success: false, error: GOALIES_ATTENDING_MESSAGE });
    });

    it("imports a plan's tags and goalie count, and exports them back", async () => {
        const { store } = await setup();
        const document = serializePlan(
            {
                title: "Goalie night", durationMinutes: 30, date: null, startTime: null, goaliesAttending: 0,
                drills: [{ sequence: 0, duration: 10, runsWithPrevious: false, instructions: "", name: "Warm-up", description: "", focus: "goalies", goalies: "required", playData: createEmptyPlayData() }],
            },
            "openleague-static",
        );
        const { sessionId } = data(await store.importPlan(document, { date: new Date("2026-10-06T19:00:00"), addToLibrary: true }));
        const view = data(await store.getSessionView(sessionId));
        expect(view.goaliesAttending).toBe(0);
        const exported = buildPlanDocument(view, new Date(), "openleague-static");
        expect(exported.session.goaliesAttending).toBe(0);
        expect(exported.session.drills[0].drill).toMatchObject({ focus: "goalies", goalies: "required" });
        const library = data(await store.getPlaysByTeam({ teamId: T, isTemplate: true, page: 1, limit: 20, dateFilter: "all", focus: "goalies" }));
        expect(library.total).toBe(1);
    });

    it("reads a session stored before goalie counts as not set", async () => {
        const { repo, store, clock } = await setup();
        await repo.write((tx) => tx.putSession({ id: "old", title: "Old", date: clock.now, duration: 60, rows: [], createdAt: clock.now, updatedAt: clock.now }));
        expect(data(await store.getSessionView("old")).goaliesAttending).toBeNull();
        expect(data(await store.getSessionForEdit("old")).initialData.goaliesAttending).toBeNull();
    });
```

In `__tests__/apps/planner/editor-screens.test.tsx`:
- add `goaliesAttending: 2,` to the `submitted` payload in `toLocalSessionSave`'s test;
- add `goaliesAttending: 2,` after `duration: 60,` in its `toEqual` expectation.

Run: `bun run test __tests__/apps/planner`
Expected: FAIL. Seeding still uses the boolean flag, the filters are ignored, and the fields are not stored.

- [ ] **Step 2: Extend the record and store types**

`apps/planner/src/store/records.ts`:
- add `import type { PlayFocus, PlayGoalies } from "@/types/practice-planner";`;
- in `StoredPlay`, after `isTemplate: boolean;`:

```ts
    /** Drill tags. Absent on records written before tags existed: read through drillTags(). */
    focus?: PlayFocus;
    goalies?: PlayGoalies;
```

- in `StoredSession`, after `duration: number;`:

```ts
    /** Goalies expected (0–10). null = not set; absent on sessions stored before the field existed. */
    goaliesAttending?: number | null;
```

- replace the two meta constants at the end with:

```ts
/** Legacy (boolean): set by builds that seeded the starter pack once, before seeded ids were tracked. Read only. */
export const META_STARTERS_SEEDED = "startersSeeded";
/** The starter ids this device has received (string[]), so upgrades add only new starters. */
export const META_SEEDED_STARTER_IDS = "seededStarterIds";
export const META_PERSIST_REQUESTED = "persistRequested";

/**
 * The starters every device seeded under META_STARTERS_SEEDED. Hard-coded on
 * purpose: STARTER_PLAYS keeps growing, and only these nine were delivered then.
 */
export const LEGACY_SEEDED_STARTER_IDS: readonly string[] = [
    "starter-breakout-5man",
    "starter-3man-weave",
    "starter-pp-umbrella",
    "starter-pk-box",
    "starter-122-forecheck",
    "starter-low-cycle",
    "starter-point-shot-screen",
    "starter-dzone-coverage",
    "starter-nz-regroup",
];
```

`apps/planner/src/store/types.ts`: add `PlayFocus, PlayGoalies` to the `@/types/practice-planner` import.

```ts
// LocalSessionSave, after `duration: number;`:
    /** Absent = unchanged on update (null on create); null clears. */
    goaliesAttending?: number | null;

// LocalPlayUpdate, after `playData: PlayData;`:
    focus?: PlayFocus;
    goalies?: PlayGoalies;
```

`apps/planner/src/store/shared.ts`:
- add `import { GOALIES_ATTENDING_MESSAGE, drillTags, toGoaliesAttending } from "@/lib/utils/drill-tags";`;
- in `summary()`, add `...drillTags(play),` after `thumbnail`;
- append:

```ts
/** Hosted's rule (updatePracticeSessionSchema): 0–10 or null; undefined passes through, meaning unchanged. */
export function checkedGoalieCount(value: number | null | undefined): number | null | undefined {
    if (value === undefined || value === null) return value;
    if (toGoaliesAttending(value) === null) throw new StoreRefusal(GOALIES_ATTENDING_MESSAGE);
    return value;
}
```

- [ ] **Step 3: Implement the library (`apps/planner/src/store/library.ts`)**

Imports:

```ts
import { drillTags, toPlayFocus, toPlayGoalies } from "@/lib/utils/drill-tags";
import { LEGACY_SEEDED_STARTER_IDS, META_SEEDED_STARTER_IDS, META_STARTERS_SEEDED, type RepoTx, type StoredPlay } from "./records";
```

Add, above `createLibraryOps`:

```ts
/** Starter ids this device has received: the stored list, or before it existed, the nine the legacy flag stood for. */
export function seededStarterIds(stored: unknown, legacyFlag: unknown): Set<string> {
    if (Array.isArray(stored)) return new Set(stored.filter((id): id is string => typeof id === "string"));
    return new Set(legacyFlag ? LEGACY_SEEDED_STARTER_IDS : []);
}

async function readSeeded(tx: RepoTx): Promise<Set<string>> {
    return seededStarterIds(await tx.getMeta(META_SEEDED_STARTER_IDS), await tx.getMeta(META_STARTERS_SEEDED));
}

const unseeded = (seeded: Set<string>) => STARTER_PLAYS.filter((starter) => !seeded.has(starter.id));
```

`getPlaysByTeam`: after the `isTemplate` filter, add:

```ts
                    .filter((p) => !input.focus || drillTags(p).focus === input.focus)
                    .filter((p) => !input.goalies || drillTags(p).goalies === input.goalies)
```

`getPlayById` returns `{ ...summary(play), playData }`. `summary` now carries the tags, so it needs no change.

`createPlay`: add `...drillTags(input),` after `playData,` in the new `StoredPlay`.

`updatePlay`:

```ts
                const tags = {
                    ...(input.focus !== undefined && { focus: toPlayFocus(input.focus) }),
                    ...(input.goalies !== undefined && { goalies: toPlayGoalies(input.goalies) }),
                };
                // …inside the write, replace the putPlay line with:
                    await tx.putPlay({ ...play, ...text, thumbnail, playData, ...tags, updatedAt: at });
```

Replace `seedStarterDrills` entirely:

```ts
        seedStarterDrills: async () => {
            const pending = unseeded(await ctx.repo.read(readSeeded));
            if (pending.length === 0) return;
            // Thumbnails first: nothing but repo calls may be awaited inside a transaction.
            const thumbnails = new Map(pending.map((starter) => [starter.id, ctx.makeThumbnail(starter.playData)]));
            // Not a user write (ctx.repo.write, not write): no persistence prompt at first load.
            await ctx.repo.write(async (tx) => {
                const seeded = await readSeeded(tx);
                const todo = unseeded(seeded);
                if (todo.length === 0) return;
                const existing = new Set(
                    (await tx.allPlays()).filter((p) => p.sessionId === null).map((p) => p.name.trim().toLowerCase()),
                );
                const at = ctx.now();
                for (const starter of todo) {
                    // Seeded either way: a starter blocked by a coach's own drill, or deleted later, never returns.
                    seeded.add(starter.id);
                    if (existing.has(starter.name.trim().toLowerCase())) continue;
                    const play: StoredPlay = {
                        id: ctx.newId(),
                        name: starter.name,
                        description: starter.description || null,
                        thumbnail: thumbnails.get(starter.id) ?? null,
                        playData: structuredClone(starter.playData),
                        focus: starter.focus,
                        goalies: starter.goalies,
                        isTemplate: true,
                        sessionId: null,
                        sourcePlayId: null,
                        createdAt: at,
                        updatedAt: at,
                    };
                    await tx.putPlay(play);
                }
                await tx.putMeta(META_SEEDED_STARTER_IDS, [...seeded]);
            });
        },
```

The legacy key is never written or deleted. It stays readable for a device that hasn't upgraded yet, in another tab or an older cached build.

- [ ] **Step 4: Implement the sessions (`apps/planner/src/store/sessions.ts`)**

Imports:
- add `import { drillTags, toPlayFocus, toPlayGoalies } from "@/lib/utils/drill-tags";`;
- add `checkedGoalieCount` to the `./shared` import.

`assertExportable`:
- change its first parameter to `meta: { title: string; duration: number; goaliesAttending?: number | null }`;
- pass `goaliesAttending: meta.goaliesAttending ?? null,` to `serializePlan` after `startTime: null,`;
- in each mapped drill, add `...drillTags(play),` before `playData`.

`getSessionView`:
- add `goaliesAttending: session.goaliesAttending ?? null,` after `startAt: null,`;
- in each `play: { … }`, add `...drillTags(play),` after `thumbnail`.

`getSessionForEdit`:
- add `goaliesAttending: session.goaliesAttending ?? null,` to `initialData` after `isShared: false,`;
- in each editor play, add `...drillTags(play),` after `instructions`.

`createSession`, after `checkDrills(input.plays);`:

```ts
                const goaliesAttending = checkedGoalieCount(input.goaliesAttending) ?? null;
```

then use `assertExportable({ ...meta, goaliesAttending }, rows, plays, at);` and `await tx.putSession({ id, ...meta, goaliesAttending, rows, createdAt: at, updatedAt: at });`.

`updateSession`, after `checkDrills(input.plays);`:

```ts
                const count = checkedGoalieCount(input.goaliesAttending);
```

Inside the write, after reading `existing`:

```ts
                    // Absent = unchanged: an editor opened before the field existed autosaves without it.
                    const goaliesAttending = count === undefined ? (existing.goaliesAttending ?? null) : count;
```

then `assertExportable({ ...meta, goaliesAttending }, rows, plays, at);` and `await tx.putSession({ ...existing, ...meta, goaliesAttending, rows, updatedAt: at });`.

`saveSessionDrill`:

```ts
                    const fields = { ...text, thumbnail, playData, updatedAt: at };
                    const sent = {
                        ...(input.focus !== undefined && { focus: toPlayFocus(input.focus) }),
                        ...(input.goalies !== undefined && { goalies: toPlayGoalies(input.goalies) }),
                    };
                    if (!input.playId) {
                        const created: StoredPlay = { id: ctx.newId(), ...fields, ...drillTags(sent), isTemplate: false, sessionId: session.id, sourcePlayId: null, createdAt: at };
                        // …
                    }
                    // owned, in place:
                        await tx.putPlay({ ...play, ...fields, ...sent });
                    // fork: inherit the source's tags unless new ones were sent
                    const forked: StoredPlay = {
                        id: ctx.newId(),
                        ...fields,
                        ...drillTags({ ...drillTags(play), ...sent }),
                        isTemplate: false,
                        sessionId: session.id,
                        sourcePlayId: play.sourcePlayId ?? play.id,
                        createdAt: at,
                    };
```

`copySessionDrillToLibrary` and `cloneInto` spread the stored record, so the tags carry with no change.

`duplicatePracticeSession`: the new session's `meta` becomes:

```ts
                    const meta = { title: duplicateSessionTitle(source.title), date, duration: source.duration, goaliesAttending: source.goaliesAttending ?? null };
```

`assertExportable(meta, …)` accepts it as written.

`importPlan`: in `base`, add `focus: d.drill.focus, goalies: d.drill.goalies,` after `playData`. In `putSession`, add `goaliesAttending: parsed.plan.session.goaliesAttending,` after `duration`.

- [ ] **Step 5: Pass the fields through the static screens**

`apps/planner/src/screens/SessionEditorScreen.tsx` `toLocalSessionSave`, after `duration: session.duration,`:

```ts
        goaliesAttending: session.goaliesAttending ?? null,
```

`apps/planner/src/screens/DrillEditorScreen.tsx`:
- add `focus: state.data.focus, goalies: state.data.goalies,` to the `SavedPlay` built for editing;
- in `handleSave`'s `fields`, add `focus: saved.focus, goalies: saved.goalies,`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bun run test __tests__/apps/planner && bun run type-check`
Expected: PASS for both repos (memory and IndexedDB).

- [ ] **Step 7: Commit**

```bash
/usr/bin/git add apps/planner/src/store/records.ts apps/planner/src/store/types.ts apps/planner/src/store/shared.ts \
  apps/planner/src/store/library.ts apps/planner/src/store/sessions.ts \
  apps/planner/src/screens/SessionEditorScreen.tsx apps/planner/src/screens/DrillEditorScreen.tsx \
  __tests__/apps/planner/local-store.library.test.ts __tests__/apps/planner/local-store.sessions.test.ts \
  __tests__/apps/planner/editor-screens.test.tsx
/usr/bin/git commit -m "feat(planner): drill tags, goalie count and seeding by starter id in the static store" -m "Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 6: Drill UI: tag selects, G badges, library filter chips and tag carry-through

Shared components, so both apps get this at once.

**Files:**
- Create: `components/features/practice-planner/GoalieBadge.tsx`, `DrillTagFields.tsx`, `DrillFilterChips.tsx`
- Modify: `components/features/practice-planner/PlayEditor.tsx` (state, save payload, fields)
- Modify: `components/features/practice-planner/PlayLibrary.tsx` (filters, starters, badges, carry the tags)
- Modify: `components/features/practice-planner/SessionDrillCard.tsx` (badge)
- Modify: `components/features/practice-planner/SessionDrillDialog.tsx`, `useSessionDrillDialog.ts` (carry the tags)
- Modify: `components/features/practice-planner/PracticeSessionEditor.tsx` (`handleAddPlayFromLibrary`, **one line**)
- Test (create): `__tests__/components/features/practice-planner/DrillTags.ui.test.tsx`, `__tests__/components/features/practice-planner/PlayLibrary.filters.test.tsx`, `__tests__/components/features/practice-planner/PracticeSessionEditor.drill-tags.test.tsx`
- Test (append): `__tests__/components/features/practice-planner/SessionDrillDialog.test.tsx`

**Interfaces:**
- Consumes: `FOCUS_LABELS`, `GOALIES_LABELS` and `drillTags` (Task 1); `LibraryQuery.focus/goalies`; `SavedPlay.focus/goalies`; `PlayInSession.focus/goalies`; `SessionDrillSave.focus/goalies`; `SessionDrillPatch.focus/goalies`; `StarterPlay.focus/goalies` (Task 3).
- Produces:
  - `GoalieBadge({ sx? })`: a `role="img"` disc named "Needs a goalie";
  - `DrillTagFields({ value, onChange, disabled? })` with `DrillTagValues = { focus: PlayFocus; goalies: PlayGoalies }`;
  - `DrillFilterChips({ value, onChange })` with `DrillFilters = { focus?: PlayFocus; goalies?: PlayGoalies }`;
  - `SessionDrillDialogDrill.focus?` and `goalies?`.

- [ ] **Step 1: Write the failing UI tests**

Create `__tests__/components/features/practice-planner/DrillTags.ui.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { GoalieBadge } from "@/components/features/practice-planner/GoalieBadge";
import { DrillTagFields } from "@/components/features/practice-planner/DrillTagFields";
import { DrillFilterChips } from "@/components/features/practice-planner/DrillFilterChips";
import { PlayEditor } from "@/components/features/practice-planner/PlayEditor";
import { SessionDrillCard } from "@/components/features/practice-planner/SessionDrillCard";
import { renderWithPlanner } from "@/__tests__/helpers/planner";
import { createEmptyPlayData } from "@/lib/utils/play-data";

vi.mock("@/lib/utils/canvas/thumbnail-generator", () => ({ generateThumbnail: vi.fn(() => "data:image/png;base64,AA==") }));

const themed = (ui: React.ReactElement) => render(<ThemeProvider theme={createTheme()}>{ui}</ThemeProvider>);

describe("GoalieBadge", () => {
    it("is an image named for screen readers", () => {
        themed(<GoalieBadge />);
        expect(screen.getByRole("img", { name: "Needs a goalie" })).toHaveTextContent("G");
    });
});

describe("DrillTagFields", () => {
    it("sets Goalies to required when Focus becomes Goalies, and leaves it alone otherwise", async () => {
        const onChange = vi.fn();
        themed(<DrillTagFields value={{ focus: "team", goalies: "optional" }} onChange={onChange} />);
        fireEvent.mouseDown(screen.getByRole("combobox", { name: /^Focus/ }));
        fireEvent.click(await screen.findByRole("option", { name: "Goalies" }));
        expect(onChange).toHaveBeenLastCalledWith({ focus: "goalies", goalies: "required" });
        fireEvent.mouseDown(screen.getByRole("combobox", { name: /^Focus/ }));
        fireEvent.click(await screen.findByRole("option", { name: "Skaters" }));
        expect(onChange).toHaveBeenLastCalledWith({ focus: "skaters", goalies: "optional" });
        fireEvent.mouseDown(screen.getByRole("combobox", { name: /^Goalies/ }));
        fireEvent.click(await screen.findByRole("option", { name: "No goalie" }));
        expect(onChange).toHaveBeenLastCalledWith({ focus: "team", goalies: "none" });
    });
});

describe("DrillFilterChips", () => {
    it("reports single-select chip changes per row; All / Any clears the row", () => {
        const onChange = vi.fn();
        themed(<DrillFilterChips value={{ focus: "goalies" }} onChange={onChange} />);
        const focus = screen.getByRole("group", { name: "Focus" });
        expect(within(focus).getByRole("button", { name: "Goalies" })).toHaveAttribute("aria-pressed", "true");
        fireEvent.click(within(focus).getByRole("button", { name: "All" }));
        expect(onChange).toHaveBeenLastCalledWith({ focus: undefined });
        fireEvent.click(within(screen.getByRole("group", { name: "Goalies" })).getByRole("button", { name: "Needs goalie" }));
        expect(onChange).toHaveBeenLastCalledWith({ focus: "goalies", goalies: "required" });
    });
});

describe("PlayEditor drill tags", () => {
    it("starts from the drill's tags, or team / optional", () => {
        themed(<PlayEditor teamId="t" initialData={{ name: "Warm-up", focus: "goalies", goalies: "required" }} autoSave={false} />);
        expect(screen.getByRole("combobox", { name: /^Focus/ })).toHaveTextContent("Goalies");
        expect(screen.getByRole("combobox", { name: /^Goalies/ })).toHaveTextContent("Needs goalie");
    });

    it("saves the chosen tags with the drill", async () => {
        const onSave = vi.fn().mockResolvedValue(undefined);
        themed(<PlayEditor teamId="t" initialData={{ name: "Warm-up" }} autoSave={false} onSave={onSave} />);
        expect(screen.getByRole("combobox", { name: /^Focus/ })).toHaveTextContent("Team");
        fireEvent.mouseDown(screen.getByRole("combobox", { name: /^Focus/ }));
        fireEvent.click(await screen.findByRole("option", { name: "Goalies" }));
        fireEvent.click(screen.getByRole("button", { name: /Save Play/i }));
        await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ focus: "goalies", goalies: "required" })));
    });
});

describe("SessionDrillCard goalie badge", () => {
    function card(goalies?: "none" | "optional" | "required") {
        renderWithPlanner(
            <SessionDrillCard
                play={{ id: "k1", playId: "cplayxxxxxxxxxxxxxxxxxxxx", name: "Warm-up", sequence: 0, duration: 10, runsWithPrevious: false, instructions: "", playData: createEmptyPlayData(), goalies }}
                index={0} canMoveUp={false} canMoveDown={false} station={null} onToggleStation={vi.fn()} isEditing={false}
                onDelete={vi.fn()} onEdit={vi.fn()} onUpdate={vi.fn()} onCancelEdit={vi.fn()} onMoveUp={vi.fn()} onMoveDown={vi.fn()}
                canEditDiagram onEditDiagram={vi.fn()}
            />,
        );
    }
    it("shows the badge only for a drill that needs a goalie", () => {
        card("required");
        expect(screen.getByRole("img", { name: "Needs a goalie" })).toBeInTheDocument();
    });
    it("hides it otherwise, including untagged drills", () => {
        card(undefined);
        expect(screen.queryByRole("img", { name: "Needs a goalie" })).toBeNull();
    });
});
```

Create `__tests__/components/features/practice-planner/PlayLibrary.filters.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { createHashPlatform, createMockPlannerStore, renderWithPlanner } from "@/__tests__/helpers/planner";

vi.mock("@/lib/utils/canvas/thumbnail-generator", () => ({ generateThumbnail: () => "data:image/png;base64,AA==" }));

import { PlayLibrary } from "@/components/features/practice-planner/PlayLibrary";

const TEAM = "cteamxxxxxxxxxxxxxxxxxxxx";
const AT = new Date("2026-04-01T00:00:00Z");
const summary = (id: string, name: string, extra: Record<string, unknown> = {}) =>
    ({ id, name, description: null, thumbnail: null, isTemplate: true, createdAt: AT, updatedAt: AT, ...extra });
const WARM_UP = summary("cplay1xxxxxxxxxxxxxxxxxxx", "My Warm-up", { focus: "goalies", goalies: "required" });
const WEAVE = summary("cplay2xxxxxxxxxxxxxxxxxxx", "My Weave", { focus: "skaters", goalies: "optional" });

function renderLibrary(plays: unknown[] = [WARM_UP, WEAVE], total = plays.length, mode: "manage" | "select" = "manage") {
    const store = createMockPlannerStore();
    store.getPlaysByTeam.mockResolvedValue({ success: true, data: { plays, total, page: 1, limit: 20 } });
    const onSelectPlay = vi.fn();
    renderWithPlanner(
        <ThemeProvider theme={createTheme()}>
            <PlayLibrary teamId={TEAM} mode={mode} onSelectPlay={onSelectPlay} />
        </ThemeProvider>,
        { store, platform: createHashPlatform() },
    );
    return { store, onSelectPlay };
}

const cardOf = (text: string) => screen.getByText(text).closest(".MuiCard-root") as HTMLElement;
const focusChip = (name: string) => within(screen.getByRole("group", { name: "Focus" })).getByRole("button", { name });
const goaliesChip = (name: string) => within(screen.getByRole("group", { name: "Goalies" })).getByRole("button", { name });

describe("PlayLibrary drill tags", () => {
    it("badges library drills that need a goalie", async () => {
        renderLibrary();
        await screen.findByText("My Warm-up");
        expect(within(cardOf("My Warm-up")).getByRole("img", { name: "Needs a goalie" })).toBeInTheDocument();
        expect(within(cardOf("My Weave")).queryByRole("img", { name: "Needs a goalie" })).toBeNull();
    });

    it("sends the chosen filters to the store and goes back to page 1", async () => {
        const { store } = renderLibrary([WARM_UP, WEAVE], 45);
        await screen.findByText("My Warm-up");
        fireEvent.click(screen.getByRole("button", { name: "Go to page 3" }));
        await waitFor(() => expect(store.getPlaysByTeam).toHaveBeenLastCalledWith(expect.objectContaining({ page: 3 })));

        fireEvent.click(focusChip("Goalies"));
        await waitFor(() => expect(store.getPlaysByTeam).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, focus: "goalies" })));
        fireEvent.click(goaliesChip("Needs goalie"));
        await waitFor(() => expect(store.getPlaysByTeam).toHaveBeenLastCalledWith(expect.objectContaining({ focus: "goalies", goalies: "required" })));
        fireEvent.click(focusChip("All"));
        await waitFor(() => expect(store.getPlaysByTeam.mock.lastCall?.[0]).not.toHaveProperty("focus"));
        expect(store.getPlaysByTeam.mock.lastCall?.[0]).toMatchObject({ goalies: "required" });
    });

    it("filters the starter cards with the same chips", async () => {
        renderLibrary([]);
        await screen.findByText("Breakout (5-Man)");
        fireEvent.click(focusChip("Goalies"));
        await waitFor(() => expect(screen.queryByText("Breakout (5-Man)")).toBeNull());
        expect(screen.getByText("Goalie Warm-Up")).toBeInTheDocument();
        expect(within(cardOf("Goalie Warm-Up")).getByRole("img", { name: "Needs a goalie" })).toBeInTheDocument();
    });

    it("copies a starter with its tags", async () => {
        const { store } = renderLibrary([]);
        store.createPlay.mockResolvedValue({ success: true, data: { id: "cnewxxxxxxxxxxxxxxxxxxxxx", name: "Goalie Warm-Up", isTemplate: true } });
        await screen.findByText("Goalie Warm-Up");
        fireEvent.click(within(cardOf("Goalie Warm-Up")).getByRole("button", { name: /Add to my library/ }));
        await waitFor(() => expect(store.createPlay).toHaveBeenCalledWith(expect.objectContaining({ name: "Goalie Warm-Up", focus: "goalies", goalies: "required" })));
    });

    it("hands a selected drill over with its tags", async () => {
        const { store, onSelectPlay } = renderLibrary([WARM_UP], 1, "select");
        store.getPlayById.mockResolvedValue({ success: true, data: { ...WARM_UP, playData: { version: 2, players: [], drawings: [], equipment: [], annotations: [] } } });
        fireEvent.click(await screen.findByText("My Warm-up"));
        await waitFor(() => expect(onSelectPlay).toHaveBeenCalledWith(expect.objectContaining({ focus: "goalies", goalies: "required" })));
    });
});
```

Create `__tests__/components/features/practice-planner/PracticeSessionEditor.drill-tags.test.tsx`:

```tsx
import { beforeAll, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { createMockPlannerStore, renderWithPlanner } from "@/__tests__/helpers/planner";
import { PracticeSessionEditor } from "@/components/features/practice-planner/PracticeSessionEditor";
import { createEmptyPlayData } from "@/lib/utils/play-data";

vi.mock("@/lib/utils/canvas/thumbnail-generator", () => ({ generateThumbnail: () => "data:image/png;base64,AA==" }));

beforeAll(() => {
    global.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver;
});

const TEAM = "cteamxxxxxxxxxxxxxxxxxxxx";
const AT = new Date("2026-04-01T00:00:00Z");
const LIB = { id: "cplay1xxxxxxxxxxxxxxxxxxx", name: "My Warm-up", description: null, thumbnail: null, isTemplate: true, createdAt: AT, updatedAt: AT, focus: "goalies", goalies: "required" };

describe("PracticeSessionEditor: drill tags", () => {
    it("adds a library drill with its tags", async () => {
        const store = createMockPlannerStore();
        store.getPlaysByTeam.mockResolvedValue({ success: true, data: { plays: [LIB], total: 1, page: 1, limit: 20 } });
        store.getPlayById.mockResolvedValue({ success: true, data: { ...LIB, playData: createEmptyPlayData() } });
        const onSave = vi.fn().mockResolvedValue({ success: true });
        renderWithPlanner(
            <ThemeProvider theme={createTheme()}>
                <LocalizationProvider dateAdapter={AdapterDateFns}>
                    <PracticeSessionEditor teamId={TEAM} initialData={{ title: "Practice", duration: 60, date: new Date("2026-04-07T22:00:00.000Z"), plays: [] }} onSave={onSave} />
                </LocalizationProvider>
            </ThemeProvider>,
            { store },
        );
        fireEvent.click(screen.getByRole("button", { name: "Add from library" }));
        fireEvent.click(await screen.findByText("My Warm-up"));
        // The drill list's empty state goes away once the drill is added.
        await waitFor(() => expect(screen.queryByText("No plays added yet")).toBeNull());
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /^save session/i }));
        });
        await waitFor(() => expect(onSave).toHaveBeenCalled());
        expect(onSave.mock.calls[0][0].plays[0]).toMatchObject({ name: "My Warm-up", focus: "goalies", goalies: "required" });
    });
});
```

Append to `__tests__/components/features/practice-planner/SessionDrillDialog.test.tsx`. It uses that file's mocked `PlayEditor` (`captured.props`), `actions` store and fixtures:

```tsx
describe("SessionDrillDialog: drill tags", () => {
    it("opens the editor with the drill's tags, and saves them with the session drill and the card patch", async () => {
        const onSaved = vi.fn().mockResolvedValue({ ok: true });
        renderWithPlanner(
            <SessionDrillDialog
                open
                sessionId={SESSION}
                teamId={TEAM}
                drill={{ clientKey: "k1", playId: OWNED, name: "Warm-up", description: "", playData: createEmptyPlayData(), thumbnail: "", focus: "goalies", goalies: "required" }}
                onSaved={onSaved}
                onClose={vi.fn()}
            />,
            { store: actions },
        );
        expect(captured.props?.initialData).toMatchObject({ focus: "goalies", goalies: "required" });

        await act(async () => {
            await captured.props?.onSave?.({ ...saved, name: "Warm-up", focus: "goalies", goalies: "optional" });
        });
        expect(actions.saveSessionDrill).toHaveBeenLastCalledWith(expect.objectContaining({ focus: "goalies", goalies: "optional" }));
        expect(onSaved).toHaveBeenCalledWith("k1", expect.objectContaining({ focus: "goalies", goalies: "optional" }));
    });
});
```

Run: `bun run test __tests__/components/features/practice-planner/DrillTags.ui.test.tsx __tests__/components/features/practice-planner/PlayLibrary.filters.test.tsx __tests__/components/features/practice-planner/PracticeSessionEditor.drill-tags.test.tsx __tests__/components/features/practice-planner/SessionDrillDialog.test.tsx`
Expected: FAIL. The components don't exist, and the tags aren't carried.

- [ ] **Step 2: Create the three small components**

`components/features/practice-planner/GoalieBadge.tsx`:

```tsx
"use client";

import { Box, type SxProps, type Theme } from "@mui/material";

/**
 * "G" on a drill card: this drill needs a goalie in net (goaltender-aware
 * drills). The board's goalie marker style: a solid ink disc, a circle as in
 * the logo's orbit motif, with the meaning in its accessible name.
 */
export function GoalieBadge({ sx }: { sx?: SxProps<Theme> }) {
    return (
        <Box
            role="img"
            aria-label="Needs a goalie"
            title="Needs a goalie"
            sx={[
                {
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    bgcolor: "grey.900",
                    color: "common.white",
                    border: 2,
                    borderColor: "common.white",
                    boxShadow: 1,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 13,
                    fontWeight: 800,
                    lineHeight: 1,
                    flexShrink: 0,
                },
                ...(Array.isArray(sx) ? sx : [sx]),
            ]}
        >
            G
        </Box>
    );
}
```

`components/features/practice-planner/DrillTagFields.tsx`:

```tsx
"use client";

import { FormControl, InputLabel, MenuItem, Select, Stack } from "@mui/material";
import { PLAY_FOCUS, PLAY_GOALIES, type PlayFocus, type PlayGoalies } from "@/types/practice-planner";
import { FOCUS_LABELS, GOALIES_LABELS } from "@/lib/utils/drill-tags";

export interface DrillTagValues {
    focus: PlayFocus;
    goalies: PlayGoalies;
}

/** The drill editor's Focus and Goalies selects (goaltender-aware drills, spec R14). */
export function DrillTagFields({ value, onChange, disabled = false }: { value: DrillTagValues; onChange: (next: DrillTagValues) => void; disabled?: boolean }) {
    return (
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <FormControl sx={{ minWidth: 180 }} disabled={disabled}>
                <InputLabel id="drill-focus-label">Focus</InputLabel>
                <Select<PlayFocus>
                    labelId="drill-focus-label"
                    id="drill-focus"
                    label="Focus"
                    value={value.focus}
                    onChange={(event) => {
                        const focus = event.target.value as PlayFocus;
                        // A goalie drill needs a goalie; the coach can still change it back.
                        onChange({ focus, goalies: focus === "goalies" ? "required" : value.goalies });
                    }}
                >
                    {PLAY_FOCUS.map((focus) => (
                        <MenuItem key={focus} value={focus}>
                            {FOCUS_LABELS[focus]}
                        </MenuItem>
                    ))}
                </Select>
            </FormControl>
            <FormControl sx={{ minWidth: 200 }} disabled={disabled}>
                <InputLabel id="drill-goalies-label">Goalies</InputLabel>
                <Select<PlayGoalies>
                    labelId="drill-goalies-label"
                    id="drill-goalies"
                    label="Goalies"
                    value={value.goalies}
                    onChange={(event) => onChange({ ...value, goalies: event.target.value as PlayGoalies })}
                >
                    {PLAY_GOALIES.map((goalies) => (
                        <MenuItem key={goalies} value={goalies}>
                            {GOALIES_LABELS[goalies]}
                        </MenuItem>
                    ))}
                </Select>
            </FormControl>
        </Stack>
    );
}
```

`components/features/practice-planner/DrillFilterChips.tsx`:

```tsx
"use client";

import { Chip, Stack, Typography } from "@mui/material";
import { PLAY_FOCUS, PLAY_GOALIES, type PlayFocus, type PlayGoalies } from "@/types/practice-planner";
import { FOCUS_LABELS, GOALIES_LABELS } from "@/lib/utils/drill-tags";

export interface DrillFilters {
    focus?: PlayFocus;
    goalies?: PlayGoalies;
}

interface ChipRowProps<T extends string> {
    label: string;
    allLabel: string;
    values: readonly T[];
    labels: Record<T, string>;
    value: T | undefined;
    onChange: (value: T | undefined) => void;
}

function ChipRow<T extends string>({ label, allLabel, values, labels, value, onChange }: ChipRowProps<T>) {
    const chip = (key: string, text: string, selected: boolean, next: T | undefined) => (
        <Chip
            key={key}
            label={text}
            clickable
            color={selected ? "primary" : "default"}
            variant={selected ? "filled" : "outlined"}
            aria-pressed={selected}
            onClick={() => onChange(next)}
            sx={{ minHeight: 32 }}
        />
    );
    return (
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap role="group" aria-label={label}>
            <Typography variant="body2" sx={{ fontWeight: 800, minWidth: 64, textTransform: "uppercase", letterSpacing: 0.5 }} color="text.secondary">
                {label}
            </Typography>
            {chip("all", allLabel, value === undefined, undefined)}
            {values.map((v) => chip(v, labels[v], value === v, v))}
        </Stack>
    );
}

/** Library filters by drill tag (spec R8): one single-select chip row each for Focus and Goalies. */
export function DrillFilterChips({ value, onChange }: { value: DrillFilters; onChange: (next: DrillFilters) => void }) {
    return (
        <Stack spacing={1}>
            <ChipRow label="Focus" allLabel="All" values={PLAY_FOCUS} labels={FOCUS_LABELS} value={value.focus} onChange={(focus) => onChange({ ...value, focus })} />
            <ChipRow label="Goalies" allLabel="Any" values={PLAY_GOALIES} labels={GOALIES_LABELS} value={value.goalies} onChange={(goalies) => onChange({ ...value, goalies })} />
        </Stack>
    );
}
```

- [ ] **Step 3: Wire `PlayEditor`**

Add imports:

```tsx
import { DrillTagFields, type DrillTagValues } from "./DrillTagFields";
import { drillTags } from "@/lib/utils/drill-tags";
```

After the `isTemplate` state, add:

```tsx
    const [tags, setTags] = useState<DrillTagValues>(() => drillTags(initialData));
```

Next to `handleTemplateChange`, add:

```tsx
    const handleTagsChange = (next: DrillTagValues) => {
        setTags(next);
        setHasUnsavedChanges(true);
        setSaveSuccess(false);
    };
```

In the save callback's `savedPlay`, add `...tags,` after `isTemplate,`, and add `tags` to that `useCallback`'s dependency array.

In the metadata form, place the selects between the Description `TextField` and the `{/* Ice area (2a) */}` block:

```tsx
                    {/* Drill tags (goaltender-aware drills) */}
                    <DrillTagFields value={tags} onChange={handleTagsChange} />
```

- [ ] **Step 4: Wire `PlayLibrary`**

Imports:

```tsx
import { DrillFilterChips, type DrillFilters } from "./DrillFilterChips";
import { GoalieBadge } from "./GoalieBadge";
```

**`PlayCard`:** inside its `CardMedia`, after the thumbnail conditional, add:

```tsx
                {play.goalies === "required" && <GoalieBadge sx={{ position: "absolute", top: 8, left: 8 }} />}
```

**`StarterPlayCard`:** the "Starter" chip is top-right, so add the badge in the same place (top-left):

```tsx
                {starter.goalies === "required" && <GoalieBadge sx={{ position: "absolute", top: 8, left: 8 }} />}
```

**`PlayLibrary` state:** after `dateFilter`, add:

```tsx
    const [filters, setFilters] = useState<DrillFilters>({});
    const filtersActive = Boolean(filters.focus || filters.goalies);
```

**`loadPlays`:** give it a third parameter, `drillFilters: DrillFilters`, and spread it into the query:

```tsx
            const result = await store.getPlaysByTeam({
                teamId,
                isTemplate: true, // Only load library plays
                page: currentPage,
                limit: playsPerPage,
                search: search.trim() || undefined,
                dateFilter: dateFilterValue,
                ...(drillFilters.focus && { focus: drillFilters.focus }),
                ...(drillFilters.goalies && { goalies: drillFilters.goalies }),
            });
```

Then pass `filters` as the third argument at **every** call site: the debounced search, the load effect, `handleAddStarter` and `handleDeleteConfirm`. Add `filters` to their dependency arrays, including the load effect (`[currentPage, dateFilter, filters]`).

Add the change handler next to `handleDateFilterChange`:

```tsx
    const handleFiltersChange = useCallback((next: DrillFilters) => {
        setFilters(next);
        setCurrentPage(1); // a filtered result starts at its first page
    }, []);
```

**`visibleStarters`:** after the search check, add:

```tsx
            if (filters.focus && starter.focus !== filters.focus) return false;
            if (filters.goalies && starter.goalies !== filters.goalies) return false;
```

and add `filters` to its `useMemo` dependency array.

**`handleAddStarter`:** add `focus: starter.focus, goalies: starter.goalies,` to the `store.createPlay({ … })` input.

**`handleSelectPlay`:** add `focus: result.data.focus, goalies: result.data.goalies,` to `fullPlay`.

**Render:**
- directly after the search/date `Stack`, add:

```tsx
            {/* Drill-tag filters (goaltender-aware drills) */}
            <Box sx={{ mb: 3 }}>
                <DrillFilterChips value={filters} onChange={handleFiltersChange} />
            </Box>
```

- in the empty state, change both `searchQuery || dateFilter !== "all"` conditions to `searchQuery || dateFilter !== "all" || filtersActive`;
- change the Create button's `!searchQuery && dateFilter === "all"` to `!searchQuery && dateFilter === "all" && !filtersActive`.

- [ ] **Step 5: Badge the session card and carry the tags through the dialog and editor**

**`SessionDrillCard.tsx`:** import `GoalieBadge` and `drillTags`. Inside `CardMedia`, after the `#n` chip:

```tsx
                {drillTags(play).goalies === "required" && <GoalieBadge sx={{ position: "absolute", top: 8, right: 8 }} />}
```

**`SessionDrillDialog.tsx`:**
- extend the type import to `PlayData, PlayFocus, PlayGoalies, SavedPlay`, and add to `SessionDrillDialogDrill`:

```tsx
    focus?: PlayFocus;
    goalies?: PlayGoalies;
```

- in `handleSave`, add `focus: saved.focus, goalies: saved.goalies,` to both the `store.saveSessionDrill({ … })` input and the `onSaved(drill.clientKey, { … })` patch;
- in `PlayEditor`'s `initialData`, add `focus: drill.focus, goalies: drill.goalies,`.

**`useSessionDrillDialog.ts`:** in `editDiagram`'s `setDrill({ … })`, add `focus: play.focus, goalies: play.goalies,`. `newDrill` leaves them unset, so the editor shows the defaults.

**`PracticeSessionEditor.tsx`:** in `handleAddPlayFromLibrary`'s `playInstance`, add **one** line after `playData`:

```tsx
            focus: savedPlay.focus, goalies: savedPlay.goalies,
```

Keep it to one line; the 900-line budget is tight.

- [ ] **Step 6: Run the tests to verify they pass**

Run the Step 1 command again, then:
`bun run test __tests__/components/features/practice-planner __tests__/apps/planner && bun run type-check && bun run lint`
Expected: PASS. `PracticeSessionEditor.line-budget.test.ts` still passes (≤ 900).

- [ ] **Step 7: Commit**

```bash
/usr/bin/git add components/features/practice-planner/GoalieBadge.tsx components/features/practice-planner/DrillTagFields.tsx \
  components/features/practice-planner/DrillFilterChips.tsx components/features/practice-planner/PlayEditor.tsx \
  components/features/practice-planner/PlayLibrary.tsx components/features/practice-planner/SessionDrillCard.tsx \
  components/features/practice-planner/SessionDrillDialog.tsx components/features/practice-planner/useSessionDrillDialog.ts \
  components/features/practice-planner/PracticeSessionEditor.tsx \
  __tests__/components/features/practice-planner/DrillTags.ui.test.tsx __tests__/components/features/practice-planner/PlayLibrary.filters.test.tsx \
  __tests__/components/features/practice-planner/PracticeSessionEditor.drill-tags.test.tsx __tests__/components/features/practice-planner/SessionDrillDialog.test.tsx
/usr/bin/git commit -m "feat(practice-planner): drill tag editor, goalie badges and library filters" -m "Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 7: Session UI: the goalie count field, advisory warnings and hidden goalie markers

**Files:**
- Create: `components/features/practice-planner/useGoaliesAttending.ts`, `GoaliesAttendingField.tsx`, `useSessionGoalies.ts`
- Modify: `components/features/practice-planner/PracticeSessionEditor.tsx` (**≤ 7 added lines**; it ends Task 6 at ~879)
- Modify: `components/features/practice-planner/SessionDrillList.tsx`, `SessionDrillCard.tsx` (`goalieWarning` prop)
- Modify: `app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx` (796/900 lines; logic goes in `useSessionGoalies`)
- Modify: `components/features/practice-planner/print/BenchSheet.tsx`, `components/features/practice-planner/export/bench-sheet-model.ts`
- Test (create): `__tests__/components/features/practice-planner/PracticeSessionEditor.goalies.test.tsx`, `__tests__/app/practice-session-detail-goalies.test.tsx`
- Test (append): `__tests__/components/features/practice-planner/export/bench-sheet-model.test.ts`, `__tests__/components/features/practice-planner/print/BenchSheet.test.tsx`

**Interfaces:**
- Consumes (Task 1): `goalieWarnings`, `goalieShortMessage`, `goaliesUnusedMessage`, `goalieShortSummary`, `sessionForDisplay`, `displayPlayData` and `MAX_GOALIES_ATTENDING`; `PracticeSessionData.goaliesAttending` and `PracticeSessionView.goaliesAttending`.
- Produces:
  - `useGoaliesAttending(initial, markDirty): { goaliesAttending: number | null; setGoaliesAttending(next: number | null): void }`;
  - `GoaliesAttendingField({ value, onChange, disabled? })`;
  - `useSessionGoalies(session): { shown: PracticeSessionView; messages: string[] }`;
  - `SessionDrillListProps.goaliesAttending?: number | null`;
  - `SessionDrillCardProps.goalieWarning?: string | null`.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/components/features/practice-planner/PracticeSessionEditor.goalies.test.tsx`:

```tsx
import { beforeAll, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { renderWithPlanner } from "@/__tests__/helpers/planner";
import { PracticeSessionEditor } from "@/components/features/practice-planner/PracticeSessionEditor";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import type { PlayData, PlayGoalies, PlayInSession } from "@/types/practice-planner";

beforeAll(() => {
    global.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver;
});

const TEAM = "cteamxxxxxxxxxxxxxxxxxxxx";
const G_BOARD: PlayData = {
    ...createEmptyPlayData(),
    players: [{ id: "g", role: "G", label: "G", position: { x: 14, y: 42.5 }, color: "#212121" }],
};

function drill(id: string, sequence: number, goalies: PlayGoalies, runsWithPrevious = false): PlayInSession {
    return {
        id, playId: `clib${id}xxxxxxxxxxxxxxxxxxxx`, name: `Drill ${id}`, sequence, runsWithPrevious, duration: 10,
        instructions: "", playData: G_BOARD, thumbnail: "", goalies,
    };
}

function renderEditor(plays: PlayInSession[], goaliesAttending: number | null | undefined, onSave = vi.fn().mockResolvedValue({ success: true })) {
    renderWithPlanner(
        <ThemeProvider theme={createTheme()}>
            <LocalizationProvider dateAdapter={AdapterDateFns}>
                <PracticeSessionEditor
                    teamId={TEAM}
                    initialData={{ title: "Practice", duration: 60, date: new Date("2026-04-07T22:00:00.000Z"), plays, goaliesAttending }}
                    onSave={onSave}
                />
            </LocalizationProvider>
        </ThemeProvider>,
    );
    return { onSave };
}

async function chooseGoalies(label: string) {
    fireEvent.mouseDown(screen.getByRole("combobox", { name: /^Goalies attending/ }));
    fireEvent.click(await screen.findByRole("option", { name: label }));
}

describe("PracticeSessionEditor: goalies attending", () => {
    it("starts from the session's count, shows Not set when unset, and saves the choice", async () => {
        const { onSave } = renderEditor([], undefined);
        expect(screen.getByRole("combobox", { name: /^Goalies attending/ })).toHaveTextContent("Not set");
        await chooseGoalies("2");
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /^save session/i }));
        });
        expect(onSave.mock.calls[0][0].goaliesAttending).toBe(2);
    });

    it("saves null after choosing Not set", async () => {
        const { onSave } = renderEditor([], 1);
        await chooseGoalies("Not set");
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /^save session/i }));
        });
        expect(onSave.mock.calls[0][0].goaliesAttending).toBeNull();
    });

    it("shows no goalie warning when the count is not set", () => {
        renderEditor([drill("a", 0, "required")], null);
        expect(screen.queryByText(/goalie — /)).toBeNull();
    });

    it("warns on a drill that needs a goalie when none attend, without blocking the save", async () => {
        const { onSave } = renderEditor([drill("a", 0, "required")], 0);
        expect(screen.getByText("Needs a goalie — none attending")).toBeInTheDocument();
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /^save session/i }));
        });
        expect(onSave).toHaveBeenCalled();
    });

    it("warns on a station block that needs more goalies than attend", () => {
        renderEditor([drill("a", 0, "required"), drill("b", 1, "required", true)], 1);
        const header = screen.getByRole("heading", { name: /Stations · 2/ }).parentElement as HTMLElement;
        expect(within(header).getByText("These stations need 2 goalies — 1 attending")).toBeInTheDocument();
    });

    it("notices goalies attending when no drill uses one", () => {
        renderEditor([drill("a", 0, "none")], 2);
        expect(screen.getByText("2 goalies attending, but no drill uses a goalie")).toBeInTheDocument();
    });
});
```

Create `__tests__/app/practice-session-detail-goalies.test.tsx`:

```tsx
/** Session detail (spec R6, R7): goalie messages, and goalie markers hidden at render time only. */
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { renderWithPlanner } from "@/__tests__/helpers/planner";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import type { PlayData, PlayGoalies } from "@/types/practice-planner";

const seen = vi.hoisted(() => ({ legends: [] as PlayData[], diagrams: [] as PlayData[] }));
vi.mock("@/components/features/practice-planner/PlayLegend", () => ({
    PlayLegend: ({ playData }: { playData: PlayData | null }) => {
        if (playData) seen.legends.push(playData);
        return null;
    },
    LegendSwatch: () => null,
}));
vi.mock("@/components/features/practice-planner/print/PrintDiagram", () => ({
    PrintDiagram: ({ playData }: { playData: PlayData | null }) => {
        if (playData) seen.diagrams.push(playData);
        return <div data-testid="live-diagram" />;
    },
    PRINT_DIAGRAM_SIZE: { width: 720, height: 306, pixelRatio: 3 },
    printPixelRatio: () => 3,
    DIAGRAM_UNAVAILABLE: "Diagram unavailable",
}));

import { SessionDetailView } from "@/app/(dashboard)/practice-planner/[sessionId]/SessionDetailView";

const G_BOARD: PlayData = {
    ...createEmptyPlayData(),
    players: [
        { id: "g", role: "G", label: "G", position: { x: 14, y: 42.5 }, color: "#212121" },
        { id: "f", role: "F", label: "F1", position: { x: 40, y: 42.5 }, color: "#1976D2" },
    ],
};

function session(goaliesAttending: number | null, goalies: PlayGoalies) {
    return {
        id: "csessionxxxxxxxxxxxxxxxxx", title: "Tuesday", date: "2026-04-07T22:00:00.000Z", duration: 60, isShared: false,
        createdByName: "Coach", teamId: "cteamxxxxxxxxxxxxxxxxxxxx", teamName: "Team", startAt: null, goaliesAttending,
        plays: [{
            id: "row-a", sequence: 0, duration: 10, runsWithPrevious: false, instructions: null,
            play: { id: "play-a", name: "D-Zone", description: null, thumbnail: "data:image/png;base64,AA==", playData: G_BOARD, goalies },
        }],
    };
}

function renderView(s: ReturnType<typeof session>) {
    seen.legends.length = 0;
    seen.diagrams.length = 0;
    renderWithPlanner(
        <ThemeProvider theme={createTheme()}>
            <SessionDetailView session={s} isAdmin={false} />
        </ThemeProvider>,
    );
}

describe("SessionDetailView goalies", () => {
    it("draws an optional-goalie drill without its goalie when none attend, from a live diagram", () => {
        renderView(session(0, "optional"));
        expect(screen.getByTestId("live-diagram")).toBeInTheDocument();
        expect(seen.diagrams.at(-1)?.players.map((p) => p.role)).toEqual(["F"]);
        expect(seen.legends.at(-1)?.players.map((p) => p.role)).toEqual(["F"]);
    });

    it("keeps the stored thumbnail and every marker otherwise", () => {
        renderView(session(1, "optional"));
        expect(screen.queryByTestId("live-diagram")).toBeNull();
        expect(seen.legends.at(-1)?.players.map((p) => p.role)).toEqual(["G", "F"]);
    });

    it("keeps the goalie on a drill that needs one, and says a goalie is missing", () => {
        renderView(session(0, "required"));
        expect(seen.legends.at(-1)?.players.map((p) => p.role)).toEqual(["G", "F"]);
        expect(screen.getByText("1 drill or station block needs a goalie, but none are attending")).toBeInTheDocument();
        expect(screen.getByText("Goalies: 0")).toBeInTheDocument();
    });

    it("says nothing about goalies when the count is not set", () => {
        renderView(session(null, "required"));
        expect(screen.queryByText(/goalie/i)).toBeNull();
    });
});
```

The last test assumes no other text on the page matches `/goalie/i`. If the drill list shows the drill name only, it holds. If it fails on unrelated text, narrow it to the three message helpers' outputs.

Append to `__tests__/components/features/practice-planner/export/bench-sheet-model.test.ts`:

```ts
describe("goalie markers (spec R7)", () => {
    const goalieBoard: PlayData = {
        ...createEmptyPlayData(),
        players: [
            { id: "g", role: "G", label: "G", position: { x: 14, y: 42.5 }, color: "#212121" },
            { id: "f", role: "F", label: "F1", position: { x: 40, y: 42.5 }, color: "#1976D2" },
        ],
    };
    const session = (goaliesAttending: number | null): ExportSession => ({
        ...UNBOOKED,
        goaliesAttending,
        plays: [
            { ...play("D-Zone", 0, 10, false, { playData: goalieBoard }), play: { name: "D-Zone", description: null, playData: goalieBoard, goalies: "optional" } },
            { ...play("Warm-up", 1, 10, false, { playData: goalieBoard }), play: { name: "Warm-up", description: null, playData: goalieBoard, goalies: "required" } },
        ],
    });

    function drawn(goaliesAttending: number | null): string[][] {
        const diagrams: PlayData[] = [];
        const renderers: BenchSheetRenderers = {
            diagram: (playData) => {
                diagrams.push(playData);
                return "data:image/png;base64,AA==";
            },
            swatch: () => null,
        };
        buildBenchSheetModel(session(goaliesAttending), renderers);
        return diagrams.map((d) => d.players.map((p) => p.role));
    }

    it("hides the goalie on optional-goalie drills when 0 goalies attend; keeps it on required drills", () => {
        expect(drawn(0)).toEqual([["F"], ["G", "F"]]);
    });

    it("changes nothing when goalies attend or the count is not set", () => {
        expect(drawn(1)).toEqual([["G", "F"], ["G", "F"]]);
        expect(drawn(null)).toEqual([["G", "F"], ["G", "F"]]);
    });

    it("never touches the stored diagram", () => {
        drawn(0);
        expect(goalieBoard.players).toHaveLength(2);
    });
});
```

Append to `__tests__/components/features/practice-planner/print/BenchSheet.test.tsx`. Add `waitFor` to the testing-library import if it is missing:

```tsx
describe("BenchSheet goalie markers", () => {
    it("prints optional-goalie drills without the goalie when 0 goalies attend", async () => {
        const goalieBoard: PlayData = {
            ...createEmptyPlayData(),
            players: [
                { id: "g", role: "G", label: "G", position: { x: 14, y: 42.5 }, color: "#212121" },
                { id: "f", role: "F", label: "F1", position: { x: 40, y: 42.5 }, color: "#1976D2" },
            ],
        };
        mockGenerate.mockClear();
        renderWithPlanner(
            <BenchSheet
                session={{
                    ...SESSION,
                    goaliesAttending: 0,
                    plays: [{ ...sessionPlay("D-Zone", 0, false, 10, { playData: goalieBoard }), play: { id: "play-dz", name: "D-Zone", description: null, thumbnail: null, playData: goalieBoard, goalies: "optional" } }],
                }}
            />,
        );
        await waitFor(() => expect(mockGenerate).toHaveBeenCalled());
        const drawnPlayers = (mockGenerate.mock.calls[0] as unknown as [PlayData])[0].players;
        expect(drawnPlayers.map((p) => p.role)).toEqual(["F"]);
    });
});
```

If the file renders `BenchSheet` through its own helper, use that helper instead of the inline `renderWithPlanner`.

Run: `bun run test __tests__/components/features/practice-planner/PracticeSessionEditor.goalies.test.tsx __tests__/app/practice-session-detail-goalies.test.tsx __tests__/components/features/practice-planner/export/bench-sheet-model.test.ts __tests__/components/features/practice-planner/print/BenchSheet.test.tsx`
Expected: FAIL. There is no goalie field, no warnings, and markers are always drawn.

- [ ] **Step 2: Create the editor hook and field**

`components/features/practice-planner/useGoaliesAttending.ts`:

```ts
"use client";

import { useCallback, useState } from "react";

/**
 * The session's goalie count in the editor (spec R12): 0–10, or null = not
 * set. Its own hook so PracticeSessionEditor stays under its line budget.
 */
export function useGoaliesAttending(initial: number | null | undefined, markDirty: () => void) {
    const [goaliesAttending, setValue] = useState<number | null>(initial ?? null);
    const setGoaliesAttending = useCallback(
        (next: number | null) => {
            setValue(next);
            markDirty();
        },
        [markDirty],
    );
    return { goaliesAttending, setGoaliesAttending };
}
```

`components/features/practice-planner/GoaliesAttendingField.tsx`:

```tsx
"use client";

import { MenuItem, TextField } from "@mui/material";
import { MAX_GOALIES_ATTENDING } from "@/types/practice-planner";

const NOT_SET = "";

/** "Goalies attending": Not set, or 0–10. Advisory only: it drives warnings and, at 0, hides optional goalie markers. */
export function GoaliesAttendingField({
    value,
    onChange,
    disabled = false,
}: {
    value: number | null;
    onChange: (next: number | null) => void;
    disabled?: boolean;
}) {
    return (
        <TextField
            select
            fullWidth
            label="Goalies attending"
            value={value === null ? NOT_SET : String(value)}
            onChange={(event) => onChange(event.target.value === NOT_SET ? null : Number(event.target.value))}
            disabled={disabled}
            helperText="Optional. Used for goalie warnings; at 0, goalies are hidden on drills that don't need one."
            slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
            sx={{ "& .MuiInputBase-root": { minHeight: 44 } }}
        >
            <MenuItem value={NOT_SET}>Not set</MenuItem>
            {Array.from({ length: MAX_GOALIES_ATTENDING + 1 }, (_, count) => (
                <MenuItem key={count} value={String(count)}>
                    {count}
                </MenuItem>
            ))}
        </TextField>
    );
}
```

- [ ] **Step 3: Wire the editor (at most 7 added lines)**

In `components/features/practice-planner/PracticeSessionEditor.tsx`:
1. Imports, 2 lines, next to the other local imports:

```tsx
import { GoaliesAttendingField } from "./GoaliesAttendingField";
import { useGoaliesAttending } from "./useGoaliesAttending";
```

2. After `const drillDialog = useSessionDrillDialog(…);`, 1 line:

```tsx
    const goalies = useGoaliesAttending(initialData?.goaliesAttending, markDirty);
```

3. In `handleSave`'s `sessionData`, after `isShared,`, 1 line:

```tsx
                goaliesAttending: goalies.goaliesAttending,
```

Then add `goalies.goaliesAttending` to `handleSave`'s dependency array. That edits an existing line.

4. After the Session Duration `TextField` (inside the same `Stack`), 1 line:

```tsx
                    <GoaliesAttendingField value={goalies.goaliesAttending} onChange={goalies.setGoaliesAttending} disabled={creating} />
```

5. On `<SessionDrillList …>`, after `segmentKind={booking.segmentKind}`, 1 line:

```tsx
                goaliesAttending={goalies.goaliesAttending}
```

Run `bun run test __tests__/components/features/practice-planner/PracticeSessionEditor.line-budget.test.ts`. Expected: PASS (≤ 900).

- [ ] **Step 4: Show the warnings in `SessionDrillList` and `SessionDrillCard`**

`SessionDrillCard.tsx`:
- add the prop `/** Advisory goalie shortfall for a standalone drill. */ goalieWarning?: string | null;`;
- destructure it as `goalieWarning = null`;
- render it right after the `fitWarning` chip, the same way:

```tsx
                    {goalieWarning && (
                        <Chip label={goalieWarning} color="warning" size="small" variant="outlined" sx={{ alignSelf: "flex-start" }} />
                    )}
```

`SessionDrillList.tsx`:
- add `goalieShortMessage, goalieWarnings, goaliesUnusedMessage` to the session-timeline import;
- add to the props:

```tsx
    /** Goalies expected (null = not set): drives the goalie warnings (advisory). */
    goaliesAttending?: number | null;
```

- destructure it as `goaliesAttending = null`;
- after the `warnings` constant, add:

```tsx
    // Unreadable drills count as needing one goalie if tagged so (playData null), never zero by accident.
    const goalieAlerts = goalieWarnings(
        groupStations(plays.map((play) => ({ ...play, playData: play.playDataUnreadable ? null : play.playData }))),
        goaliesAttending,
    );
    const goalieMessage = (group: StationGroup<PlayInSession>): string | null => {
        const shortfall = goalieAlerts.short.find((short) => short.groupIndex === group.index);
        return shortfall && goaliesAttending !== null
            ? goalieShortMessage(shortfall.needed, goaliesAttending, group.stations.length > 1)
            : null;
    };
```

- give `renderCard` a third parameter, `goalieWarning: string | null = null`, and pass `goalieWarning={goalieWarning}` to `SessionDrillCard`;
- for a standalone drill, call `renderCard(group.stations[0], undefined, goalieMessage(group))`;
- in a block header, append the block's message to the warnings:

```tsx
                                    warnings={[...overlapMessages(group, warnings.overlaps), ...(goalieMessage(group) ? [goalieMessage(group) as string] : [])]}
```

- inside the totals `Box`, after the play-time warning:

```tsx
                        {goalieAlerts.unused && goaliesAttending !== null && (
                            <Alert severity="info" sx={{ mt: 1 }}>
                                {goaliesUnusedMessage(goaliesAttending)}
                            </Alert>
                        )}
```

- [ ] **Step 5: Hide markers at render time in the detail view, the bench sheet and the export model**

`components/features/practice-planner/useSessionGoalies.ts`:

```ts
"use client";

import { useMemo } from "react";
import type { PracticeSessionView } from "@/types/practice-planner";
import { sessionForDisplay } from "@/lib/utils/drill-tags";
import { goalieShortSummary, goalieWarnings, goaliesUnusedMessage, groupStations } from "@/lib/utils/session-timeline";

/**
 * The detail page's goalie view (spec R6, R7): the session as drawn (goalie
 * markers hidden on optional drills when 0 attend) and its advisory messages.
 * Warnings read the stored session, so hidden markers never change the counts.
 */
export function useSessionGoalies(session: PracticeSessionView): { shown: PracticeSessionView; messages: string[] } {
    const shown = useMemo(() => sessionForDisplay(session), [session]);
    const messages = useMemo(() => {
        const attending = session.goaliesAttending ?? null;
        if (attending === null) return [];
        const warnings = goalieWarnings(
            groupStations(session.plays.map((sp) => ({ ...sp, focus: sp.play.focus, goalies: sp.play.goalies, playData: sp.play.playData }))),
            attending,
        );
        return [
            ...(warnings.short.length > 0 ? [goalieShortSummary(warnings.short.length, attending)] : []),
            ...(warnings.unused ? [goaliesUnusedMessage(attending)] : []),
        ];
    }, [session]);
    return { shown, messages };
}
```

In `SessionDetailView.tsx`:
- add `import { useSessionGoalies } from "@/components/features/practice-planner/useSessionGoalies";` and `import { PrintDiagram } from "@/components/features/practice-planner/print/PrintDiagram";`;
- after `activePlay` is defined, add:

```tsx
  const { shown, messages: goalieMessages } = useSessionGoalies(session);
  // The diagram as drawn for this session (spec R7); the stored play is never changed.
  const drawn = (sp: PracticeSessionViewPlay) => shown.plays[session.plays.indexOf(sp)]?.play.playData ?? sp.play.playData;
  const activeDrawn = activePlay ? drawn(activePlay) : null;
  const goaliesHidden = Boolean(activePlay && activeDrawn !== activePlay.play.playData);
```

- in `stationMapStations`, map with `playData: drawn(sp)` instead of `sp.play.playData`, and add `shown` to that memo's dependencies;
- in the session's meta row (the `Stack` of date, duration, plays and author), add the chips after the `{session.venueName && (…)}` block and before that `Stack` closes. The fit chip sits inside the venue block, which renders only for booked sessions, so it is the wrong anchor:

```tsx
                  {session.goaliesAttending != null && (
                    <Chip size="small" variant="outlined" label={`Goalies: ${session.goaliesAttending}`} />
                  )}
                  {goalieMessages.map((message) => (
                    <Chip key={message} size="small" color="warning" variant="outlined" label={message} />
                  ))}
```

- in the "Thumbnail / rink preview" `Box`, put the hidden-marker case first. A stored PNG can't drop a marker, so draw live:

```tsx
                  {goaliesHidden ? (
                    <PrintDiagram playData={activeDrawn} name={activePlay.play.name} pixelRatio={2} />
                  ) : activePlay.play.thumbnail ? (
```

Keep the existing thumbnail and fallback branches after it.

- pass `playData={activeDrawn}` to the `PlayLegend` below it, instead of `activePlay.play.playData`.

Run `bun run test __tests__/app/SessionDetailView.line-budget.test.ts`. Expected: PASS (≤ 900).

In `components/features/practice-planner/print/BenchSheet.tsx`:
- import `useMemo` and `sessionForDisplay`;
- rename the prop binding and draw from the display session:

```tsx
export function BenchSheet({ session: stored }: { session: BenchSheetSession }) {
    // Goalie markers hidden at render time only (spec R7); the stored session is untouched.
    const session = useMemo(() => sessionForDisplay(stored), [stored]);
```

Every later use of `session` in the component now sees the display diagrams. Leave them as they are.

In `components/features/practice-planner/export/bench-sheet-model.ts`:
- import `sessionForDisplay`;
- rename the first parameter to `stored` and start the body with:

```ts
    // Goalie markers hidden at render time only (spec R7). The plan JSON export never calls this.
    const session = sessionForDisplay(stored);
```

- [ ] **Step 6: Run the tests to verify they pass**

Run the Step 1 command again, then:
`bun run test __tests__/components/features/practice-planner __tests__/app && bun run type-check && bun run lint`
Expected: PASS, including both line-budget tests.

- [ ] **Step 7: Commit**

```bash
/usr/bin/git add components/features/practice-planner/useGoaliesAttending.ts components/features/practice-planner/GoaliesAttendingField.tsx \
  components/features/practice-planner/useSessionGoalies.ts components/features/practice-planner/PracticeSessionEditor.tsx \
  components/features/practice-planner/SessionDrillList.tsx components/features/practice-planner/SessionDrillCard.tsx \
  "app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx" \
  components/features/practice-planner/print/BenchSheet.tsx components/features/practice-planner/export/bench-sheet-model.ts \
  __tests__/components/features/practice-planner/PracticeSessionEditor.goalies.test.tsx __tests__/app/practice-session-detail-goalies.test.tsx \
  __tests__/components/features/practice-planner/export/bench-sheet-model.test.ts __tests__/components/features/practice-planner/print/BenchSheet.test.tsx
/usr/bin/git commit -m "feat(practice-planner): goalies attending, goalie warnings and render-time goalie hiding" -m "Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 8: "Use template" in both apps

Templates go through the existing import views (spec R11). Hosted re-parses on the server in `importPracticePlan`; static re-parses in `store.importPlan`. There is no new action or route.

**Files:**
- Create: `components/features/practice-planner/StarterTemplatePicker.tsx`
- Modify: `components/features/practice-planner/PlanImportView.tsx` (the `pick` state)
- Modify: `apps/planner/src/screens/ImportScreen.tsx` (the `pick` state)
- Modify: `app/(dashboard)/practice-planner/PracticePlannerList.tsx` (header button)
- Modify: `apps/planner/src/screens/SessionListScreen.tsx` (`Actions`)
- Test (create): `__tests__/components/features/practice-planner/StarterTemplatePicker.test.tsx`
- Test (append): `__tests__/components/features/practice-planner/PlanImportView.test.tsx`, `__tests__/apps/planner/import-screen.test.tsx`, `__tests__/app/practice-planner-list-import.test.tsx`, `__tests__/apps/planner/app.test.tsx`

**Interfaces:**
- Consumes (Task 4): `STARTER_TEMPLATES`, `StarterTemplate` and `starterTemplatePlan(template, generator, now?)`.
- Produces: `StarterTemplatePicker({ onUse(template), disabled? })`. Each card's button is named `Use template: <name>`; its visible text is "Use template".

- [ ] **Step 1: Write the failing tests**

Create `__tests__/components/features/practice-planner/StarterTemplatePicker.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { StarterTemplatePicker } from "@/components/features/practice-planner/StarterTemplatePicker";
import { STARTER_TEMPLATES } from "@/lib/data/starter-templates";

describe("StarterTemplatePicker", () => {
    it("lists every template under one heading, with its length and a Use template button", () => {
        render(<StarterTemplatePicker onUse={vi.fn()} />);
        expect(screen.getByRole("heading", { name: "Start from a template" })).toBeInTheDocument();
        for (const template of STARTER_TEMPLATES) {
            expect(screen.getByRole("heading", { name: template.name })).toBeInTheDocument();
            expect(screen.getByRole("button", { name: `Use template: ${template.name}` })).toHaveTextContent("Use template");
        }
        expect(screen.getAllByText(`${STARTER_TEMPLATES[0].session.durationMinutes} min`).length).toBeGreaterThan(0);
    });

    it("hands the chosen template back", () => {
        const onUse = vi.fn();
        render(<StarterTemplatePicker onUse={onUse} />);
        fireEvent.click(screen.getByRole("button", { name: `Use template: ${STARTER_TEMPLATES[1].name}` }));
        expect(onUse).toHaveBeenCalledWith(STARTER_TEMPLATES[1]);
    });
});
```

Append to `__tests__/components/features/practice-planner/PlanImportView.test.tsx`:

```tsx
describe("PlanImportView: starter templates", () => {
    it("previews a template and imports it into the chosen team as a hosted plan", async () => {
        actions.importPracticePlan.mockResolvedValue({ success: true, data: { sessionId: NEW_SESSION } });
        render(<PlanImportView teams={[LIONS]} />);
        fireEvent.click(screen.getByRole("button", { name: "Use template: Skills Stations" }));
        expect(await screen.findByRole("heading", { name: "Skills Stations" })).toBeInTheDocument();

        // Templates carry no date: the coach picks one, as for any undated plan.
        fireEvent.change(screen.getByLabelText(/^date/i), { target: { value: "2026-10-06" } });
        fireEvent.change(screen.getByLabelText(/start time/i), { target: { value: "19:00" } });
        fireEvent.click(screen.getByRole("button", { name: "Import plan" }));

        await waitFor(() => expect(nav.push).toHaveBeenCalledWith(`/practice-planner/${NEW_SESSION}/edit`));
        const sent = actions.importPracticePlan.mock.calls[0][0];
        expect(sent.teamId).toBe(LIONS.id);
        expect(sent.document).toMatchObject({ generator: "openleague-hosted", session: { title: "Skills Stations" } });
        expect(sent.document.session.drills.some((d: { drill: { goalies: string } }) => d.drill.goalies === "required")).toBe(true);
    });

    it("offers templates only while no plan is chosen", async () => {
        render(<PlanImportView teams={[LIONS]} />);
        expect(screen.getByRole("heading", { name: "Start from a template" })).toBeInTheDocument();
        upload(JSON.stringify(plan()));
        await title();
        expect(screen.queryByRole("heading", { name: "Start from a template" })).toBeNull();
    });
});
```

Append to `__tests__/apps/planner/import-screen.test.tsx`, inside `describe("ImportScreen")`:

```tsx
    it("saves a starter template as a practice in this browser", async () => {
        const { store } = memoryStore();
        renderScreen(<ImportScreen store={store} linkValue={null} />, store);
        fireEvent.click(screen.getByRole("button", { name: "Use template: Goalie & Skater Rotation" }));
        expect(await screen.findByText("Goalie & Skater Rotation")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /save to my practices/i }));
        await waitFor(() => expect(window.location.hash).toMatch(/^#\/sessions\/[^/]+$/));
        const sessions = await store.listSessions();
        expect(sessions.success && sessions.data.map((s) => s.title)).toEqual(["Goalie & Skater Rotation"]);
    });
```

Append to `__tests__/app/practice-planner-list-import.test.tsx`:

```tsx
describe("PracticePlannerList Use a template", () => {
    it("links to the import page, where templates are offered, whenever Import is offered", () => {
        renderList({ isAdmin: false, canImport: true });
        expect(screen.getByRole("link", { name: /use a template/i })).toHaveAttribute("href", "/practice-planner/import");
    });

    it("hides it when the user can't schedule anywhere", () => {
        renderList({ isAdmin: false, canImport: false });
        expect(screen.queryByRole("link", { name: /use a template/i })).not.toBeInTheDocument();
    });
});
```

In `__tests__/apps/planner/app.test.tsx`, in the test `shows the empty practice list with both actions`, add next to its existing `import plan` assertion:

```tsx
        expect(screen.getAllByRole("link", { name: /use a template/i })[0]).toHaveAttribute("href", "#/import");
```

Run: `bun run test __tests__/components/features/practice-planner/StarterTemplatePicker.test.tsx __tests__/components/features/practice-planner/PlanImportView.test.tsx __tests__/apps/planner/import-screen.test.tsx __tests__/app/practice-planner-list-import.test.tsx __tests__/apps/planner/app.test.tsx`
Expected: FAIL. There is no picker and no buttons.

- [ ] **Step 2: Create `components/features/practice-planner/StarterTemplatePicker.tsx`**

```tsx
"use client";

import { Box, Button, Card, CardActions, CardContent, Chip, Grid, Stack, Typography } from "@mui/material";
import { STARTER_TEMPLATES, type StarterTemplate } from "@/lib/data/starter-templates";
import { groupStations } from "@/lib/utils/session-timeline";

/**
 * Starter practice templates (spec R11). Choosing one hands it to the import
 * view, which previews it and saves it exactly like a plan file.
 */
export function StarterTemplatePicker({ onUse, disabled = false }: { onUse: (template: StarterTemplate) => void; disabled?: boolean }) {
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
            <Grid container spacing={2}>
                {STARTER_TEMPLATES.map((template) => {
                    const blocks = groupStations(template.session.drills).filter((group) => group.stations.length > 1).length;
                    const nameId = `${template.id}-name`;
                    return (
                        <Grid key={template.id} size={{ xs: 12, md: 4 }}>
                            <Card variant="outlined" sx={{ height: "100%", display: "flex", flexDirection: "column", borderTop: 4, borderTopColor: "primary.main" }}>
                                <CardContent sx={{ flexGrow: 1 }}>
                                    <Typography id={nameId} variant="subtitle1" component="h3" sx={{ fontWeight: 800 }}>
                                        {template.name}
                                    </Typography>
                                    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ my: 1 }}>
                                        <Chip size="small" label={`${template.session.durationMinutes} min`} />
                                        <Chip size="small" label={`${template.session.drills.length} drills`} />
                                        <Chip size="small" label={`${blocks} station ${blocks === 1 ? "block" : "blocks"}`} />
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

- [ ] **Step 3: Offer templates in both import views and both practice lists**

**`PlanImportView.tsx`:**
- imports:

```tsx
import { StarterTemplatePicker } from "@/components/features/practice-planner/StarterTemplatePicker";
import { starterTemplatePlan } from "@/lib/data/starter-templates";
```

- directly after the `state.kind === "pick"` file `Paper` block, add:

```tsx
                {state.kind === "pick" && (
                    <StarterTemplatePicker onUse={(template) => setState({ kind: "ready", plan: starterTemplatePlan(template, "openleague-hosted") })} />
                )}
```

**`apps/planner/src/screens/ImportScreen.tsx`:**
- the same imports;
- after its `pick` `Paper` block:

```tsx
                {state.kind === "pick" && (
                    <StarterTemplatePicker
                        onUse={(template) => {
                            // Newest choice wins, as for a file or a link.
                            latestChoice.current = Symbol("template");
                            setSaveError(null);
                            setState({ kind: "ready", plan: starterTemplatePlan(template, "openleague-static") });
                        }}
                    />
                )}
```

**`PracticePlannerList.tsx`** (hosted):
- import `ViewQuiltOutlined as TemplateIcon` from `@mui/icons-material`, or the file's icon import style;
- right after the `Import plan` button, inside the same `{canImport && (…)}` fragment (wrap the two in `<>…</>`):

```tsx
                  <Button
                    component={Link}
                    href="/practice-planner/import"
                    variant="outlined"
                    startIcon={<TemplateIcon />}
                    size={isMobile ? "small" : "medium"}
                  >
                    Use a template
                  </Button>
```

**`apps/planner/src/screens/SessionListScreen.tsx`:** in `Actions`, after the `Import plan` button:

```tsx
            <Button variant="outlined" startIcon={<TemplateIcon />} href={staticRoutes.importPlan()}>
                Use a template
            </Button>
```

with `ViewQuiltOutlined as TemplateIcon` added to its `@mui/icons-material` import.

- [ ] **Step 4: Run the tests to verify they pass**

Run the Step 1 command again. Expected: PASS.
Run: `bun run test __tests__/components/features/practice-planner __tests__/apps/planner __tests__/app && bun run type-check && bun run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add components/features/practice-planner/StarterTemplatePicker.tsx components/features/practice-planner/PlanImportView.tsx \
  apps/planner/src/screens/ImportScreen.tsx apps/planner/src/screens/SessionListScreen.tsx \
  "app/(dashboard)/practice-planner/PracticePlannerList.tsx" \
  __tests__/components/features/practice-planner/StarterTemplatePicker.test.tsx __tests__/components/features/practice-planner/PlanImportView.test.tsx \
  __tests__/apps/planner/import-screen.test.tsx __tests__/app/practice-planner-list-import.test.tsx __tests__/apps/planner/app.test.tsx
/usr/bin/git commit -m "feat(practice-planner): start a practice from a station template" -m "Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 9: Gates

Every repository gate, run in CI order. Fix forward in the task that owns a failure; never skip a gate or weaken a test.

**Files:** none new. This task changes code only if a gate fails.

- [ ] **Step 1: Regenerate the Prisma client, then type-check and lint**

```bash
bun run db:generate
bun run type-check
bun run lint
```

Expected: all three exit 0. A Zod v4 deprecation hint (★) in an IDE is not an error; the CLI result is what counts.

- [ ] **Step 2: Run the full suite**

Run: `bun run test`
Expected: PASS. If an unrelated test fails, check `gh run list --branch main --limit 5` first: a red `main` is not this branch's regression. A failure that names a date is clock rot; pin it with `vi.setSystemTime`, never by editing fixtures' dates.

- [ ] **Step 3: Build both deployables**

```bash
bun run build
bun run planner:build && bun run planner:check
```

Expected: both succeed.
- `next build` catches route and RSC-boundary errors that type-check misses.
- `planner:check` (`scripts/check-planner-build.ts`) confirms the static bundle still:
  - carries the plan format;
  - loads `docx` only lazily;
  - has no Next.js runtime, telemetry or analytics.

  The new shared imports (`lib/data/starter-templates.ts`, `lib/utils/drill-tags.ts`, `StarterTemplatePicker`) are pure and must keep it that way. If the Vite build fails on a server-only import, the offending import is in a shared module and must move out of it.

- [ ] **Step 4: Run the ADR and SQL policy checks**

```bash
bun run adr:lint
bun run adr:check-integrity
bun run check:raw-sql
bun run adr:check prisma/schema.prisma lib/plan-document/document.ts lib/data/starter-templates.ts apps/planner/src/store/library.ts
```

Expected:
- the first three exit 0;
- `adr:check` lists ADR-0003 (Prisma only: the migration is the sanctioned place for SQL) and ADR-0020 (amended in Task 1) as governing, with no violation.

- [ ] **Step 5: Check the line budgets and the working tree**

```bash
wc -l components/features/practice-planner/PracticeSessionEditor.tsx "app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx"
/usr/bin/git status --short
```

Expected:
- both files are ≤ 900 lines;
- `git status` shows nothing. If `CLAUDE.md` appears modified by `next dev`, leave it out of every commit.

- [ ] **Step 6: Commit any gate fixes**

Only if Steps 1–5 required changes. Stage the exact files by path:

```bash
/usr/bin/git add <the files you changed>
/usr/bin/git commit -m "fix(practice-planner): <what the gate caught>" -m "Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

## Self-Review

**Spec coverage:**

| Spec item | Task |
|---|---|
| R1 strings and CHECK constraints | 2 |
| R2 migration | 2 |
| R3 optional types, write semantics | 1, 2, 5 |
| R4 copy paths, with the clone guard | 2 (hosted), 5 (static), 6 (shared UI) |
| R5 static records | 5 |
| R6 warnings | 1 (pure), 7 (UI) |
| R7 hidden markers | 1 (helpers), 7 (detail, bench sheet, export model); plan JSON untouched (1) |
| R8 filters | 1 (types and schema), 2 (hosted query), 5 (static query), 6 (chips) |
| R9 seeding by id with the legacy flag | 5; hosted behaviour unchanged (known limitation recorded in the spec) |
| R10 templates as plan inputs | 4 |
| R11 "Use template" through the import views | 8 |
| R12 editor budget | 7 (hook, field, ≤ 7 lines) |
| R13 plan fields, PLAN_VERSION 1, ADR-0020 amendment | 1 |
| R14 drill editor selects, G badge | 6 |
| Content: 9 originals tagged, 9 goalie drills, 8 skater drills, 3 templates | 3, 4 |
| Gates | 9 |

**Placeholder scan:** none. Every code step carries the code. Steps that edit large existing files name the exact block and show the inserted lines.

**Type consistency:**
- `drillTags` / `toPlayFocus` / `toPlayGoalies` / `toGoaliesAttending`, `goalieWarnings(groups, attending)`, `sessionForDisplay(session)` and `starterTemplatePlan(template, generator, now?)` are used with the same signatures in every task.
- `DrillFilters`, `DrillTagValues` and `GoalieNeeds` are defined once.
- `PLAY_FIELDS_NOT_CLONED` = `createdAt`, `updatedAt`. The guard checks the clone's written keys, so the selected-but-recomputed `isTemplate`, `sessionId` and `sourcePlayId` don't need listing.

**Review Focus coverage:** item 1 → Tasks 2 and 5; item 2 → Task 6; item 3 → Task 5; item 4 → Task 1; item 5 → Tasks 1 and 7.

# Static Pre-Season Placement Rankings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Rankings tool to the static app (openleague.dev/planner/). A coach pastes a league's public schedule and snake chart, and sees CSHL-compatible placement ratings, a per-team explanation and what-if results. All data stays on the device, and it exports and imports as a portable `openleague.rankings` v1 file.

**Architecture:** There are three pure modules.
- `lib/ratings/` holds the calculation: SRS (the Lodin part), the Walkush approximation, scaling, the composite, and the margin sweep.
- `lib/ratings/import/` holds the parsers for the schedule page and the snake chart.
- `lib/rankings-document/` holds the portable format (zod schema, parser, merge).

On top of them, the static app gets four parts:
- a `rankings` record in the IndexedDB `meta` store, with no database version bump;
- `#/rankings…` hash routes;
- a "Rankings" nav item;
- five screens: rankings, import, setup, team detail and what-if.

**Tech Stack:** TypeScript (strict), React 19, MUI v7, Zod v4, Vite (static app), Vitest + Testing Library + fake-indexeddb, Bun.

**Spec:** `docs/superpowers/specs/2026-10-07-static-rankings-design.md`

## Global Constraints

- Static app only. No change to hosted routes, server actions, Prisma or the database (spec R1).
- No network requests to league or third-party sites. Input is pasted text or a user-chosen file (spec R2).
- The team number (a string) is the key everywhere (spec R3).
- No league name, team name or score from real league data goes into the repository. Fixtures use the made-up programs Riverside, Lakeview, Hilltop and Brookside with team numbers 901–905 (spec R6).
- `lib/ratings/**` and `lib/rankings-document/**` must not import `next`, `next/*`, `@/lib/actions/*`, `@/lib/db/*`, `@/lib/auth/*`, `@prisma/client` or `server-only` (ADR-0020 portability).
- CSHL 8U preset values are exactly: goal cap `8`, Walkush variant `"plus-one"`, low-confidence threshold `3`, levels `R1 6, R2 6, R3 7, W1 6, W2 8, W3 6, W4 7`.
- Use these labels verbatim in the UI: "CSHL-compatible RPI", "Walkush (approx.)", "capped at 8" (with the configured cap substituted).
- Movement is always shown as an icon plus a word ("▲ Up", "▬ Same", "▼ Down"), never as colour alone.
- Tap targets are at least 44px. Every screen works at 360px width.
- Use Bun only (`bun run …`). Follow Zod v4 APIs.
- **Git:** commit locally on branch `docs/static-rankings-spec` (or a feature branch cut from it). **Do not push, create remote branches or open PRs on weekdays before 5 PM ET.**

## Review Focus

1. **Real pasted page text differs from the fixtures.** Pasting the live schedule page must still produce games, or list each line it can't read. Task 4 pins the token shapes seen on the real page: date and time as separate lines, the score split as `11` / `-` / `4`, a combined `4 - 9`, and tab-separated rows. Task 14 re-checks with a real paste in the browser and fixes the parser if needed.
2. **The same matchup played twice on one day, or the same matchup listed with home and away swapped on re-import.** It must merge as the same game, never as a duplicate or a false conflict. The tests in Task 6 cover `gameKeys` ordinals and orientation.
3. **A team excluded after import.** It must still count in its opponents' SCHED but drop out of ranks and scaling. Covered in Task 2.
4. **A saved record that fails validation** (damaged storage, or an older build). The screen must show an error with a "Start over" action, not crash. Covered in Task 8 (store) and Task 10 (screen).
5. **What-if input left blank or invalid.** Blank or non-numeric score fields mean "not applied". They never throw, and they never write to storage. Covered in Task 13.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/ratings/types.ts` | Rating input types, `RatingMethod`, `CSHL_8U_METHOD`, `capMargin`, `canonicalGames`, `compareTeamNumbers` |
| `lib/ratings/srs.ts` | `srs()`: AGD, SCHED and the converged rating (Lodin) |
| `lib/ratings/walkush.ts` | `walkushApprox()`: log-space ratio rating |
| `lib/ratings/composite.ts` | `scale0to20`, `composite`, `whatIf`: per-team rows, ranks, levels, movement, components |
| `lib/ratings/sweep.ts` | `marginSweep()` |
| `lib/ratings/index.ts` | Barrel |
| `lib/ratings/import/html.ts` | `htmlToText`, `decodeEntities` |
| `lib/ratings/import/schedule.ts` | `parseSchedule()` |
| `lib/ratings/import/snake-chart.ts` | `parseSnakeChart()` |
| `lib/ratings/import/index.ts` | Barrel |
| `lib/rankings-document/document.ts` | Zod schema, `parseRankings`, `createRankingsDocument`, `serializeRankings`, `rankingsFileName`, `toRatingInputs` |
| `lib/rankings-document/merge.ts` | `gameKeys`, `mergeSchedule`, `resolveConflict`, `applySnakeChart` |
| `lib/rankings-document/file.ts` | `readRankingsFile` |
| `lib/rankings-document/index.ts` | Barrel |
| `apps/planner/src/store/rankings.ts` | `createRankingsOps`: get, save and clear in the meta store |
| `apps/planner/src/routes.ts` | Rankings routes and nav section (modify) |
| `apps/planner/src/screens/AppShell.tsx` | "Rankings" nav item (modify) |
| `apps/planner/src/App.tsx` | Route cases (modify) |
| `apps/planner/src/screens/rankings/useRankingsDoc.ts` | Load and save hook |
| `apps/planner/src/screens/rankings/display.tsx` | Formatting, movement label, level band colour, status views |
| `apps/planner/src/screens/rankings/RankingsScreen.tsx` | Tiles, ladder, table, filters, export |
| `apps/planner/src/screens/rankings/RankingsImportScreen.tsx` | Paste or file input, preview, merge, conflicts |
| `apps/planner/src/screens/rankings/RankingsSetupScreen.tsx` | Title, levels, cap, teams, games editor |
| `apps/planner/src/screens/rankings/RankingsTeamScreen.tsx` | Game log and arithmetic |
| `apps/planner/src/screens/rankings/RankingsWhatIfScreen.tsx` | Hypothetical scores, sweep, who moves, record as final |
| `docs/adr/0021-*.md` | ADR extending ADR-0020 |
| Tests | `__tests__/lib/ratings/*.test.ts`, `__tests__/lib/rankings-document/*.test.ts`, `__tests__/apps/planner/rankings-*.test.ts(x)` |

---

### Task 1: Rating types and SRS (the Lodin part)

**Files:**
- Create: `lib/ratings/types.ts`, `lib/ratings/srs.ts`, `lib/ratings/index.ts`
- Test: `__tests__/lib/ratings/srs.test.ts`

**Interfaces:**
- Produces:
  - `RatingGame { home: string; away: string; homeGoals: number; awayGoals: number }`
  - `RatingTeam { number: string; name: string; startingBracket?: string | null; excluded?: boolean }`
  - `LevelSpec { name: string; size: number }`
  - `RatingMethod { preset: string; goalCap: number; walkush: { variant: "plus-one" }; lowConfidenceGames: number; levels: LevelSpec[] }`
  - `CSHL_8U_METHOD`, `capMargin(margin, cap)`, `canonicalGames(games)`, `compareTeamNumbers(a, b)`, `mean(values)`
  - `srs(games: readonly RatingGame[], goalCap: number): SrsResult`, where `SrsResult { agd: Map<string, number>; sched: Map<string, number>; rating: Map<string, number>; converged: boolean }`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/lib/ratings/srs.test.ts
import { describe, expect, it } from "vitest";
import { CSHL_8U_METHOD, canonicalGames, capMargin, srs, type RatingGame } from "@/lib/ratings";

const g = (home: string, away: string, homeGoals: number, awayGoals: number): RatingGame => ({ home, away, homeGoals, awayGoals });

describe("capMargin", () => {
    it("clamps to ±cap", () => {
        expect(capMargin(15, 8)).toBe(8);
        expect(capMargin(-11, 8)).toBe(-8);
        expect(capMargin(3, 8)).toBe(3);
    });
});

describe("CSHL_8U_METHOD", () => {
    it("matches the spec's preset", () => {
        expect(CSHL_8U_METHOD.goalCap).toBe(8);
        expect(CSHL_8U_METHOD.walkush.variant).toBe("plus-one");
        expect(CSHL_8U_METHOD.lowConfidenceGames).toBe(3);
        expect(CSHL_8U_METHOD.levels.map((l) => `${l.name}:${l.size}`).join(",")).toBe("R1:6,R2:6,R3:7,W1:6,W2:8,W3:6,W4:7");
    });
});

describe("canonicalGames", () => {
    it("orients each game so home sorts first and orders games", () => {
        expect(canonicalGames([g("903", "901", 1, 4), g("901", "902", 2, 2)])).toEqual([g("901", "902", 2, 2), g("901", "903", 4, 1)]);
    });
});

describe("srs", () => {
    it("solves a two-team pool and centers it on 0", () => {
        const result = srs([g("901", "902", 5, 1)], 8);
        expect(result.agd.get("901")).toBeCloseTo(4, 9);
        expect(result.rating.get("901")).toBeCloseTo(2, 6);
        expect(result.rating.get("902")).toBeCloseTo(-2, 6);
        expect(result.sched.get("901")).toBeCloseTo(-2, 6);
        expect(result.converged).toBe(true);
    });

    it("solves a three-team pool by hand", () => {
        // agd: 901 = 3.5, 902 = 0.5, 903 = -4; fixed point r = (7/3, 1/3, -8/3).
        const result = srs([g("901", "902", 3, 1), g("902", "903", 4, 1), g("901", "903", 5, 0)], 8);
        expect(result.agd.get("901")).toBeCloseTo(3.5, 9);
        expect(result.rating.get("901")).toBeCloseTo(7 / 3, 6);
        expect(result.rating.get("902")).toBeCloseTo(1 / 3, 6);
        expect(result.rating.get("903")).toBeCloseTo(-8 / 3, 6);
        expect(result.sched.get("901")).toBeCloseTo(-7 / 6, 6);
    });

    it("caps blowouts at the goal cap", () => {
        expect(srs([g("901", "902", 15, 0)], 8).agd.get("901")).toBe(8);
    });

    it("counts repeat opponents as separate games", () => {
        const result = srs([g("901", "902", 3, 1), g("902", "901", 4, 0)], 8);
        expect(result.agd.get("901")).toBeCloseTo((2 - 4) / 2, 9);
    });

    it("gives identical results for any game order or home/away orientation", () => {
        const games = [g("901", "902", 3, 1), g("902", "903", 4, 1), g("901", "903", 5, 0), g("903", "904", 2, 2)];
        const flipped = [...games].reverse().map((x) => g(x.away, x.home, x.awayGoals, x.homeGoals));
        const a = srs(games, 8);
        const b = srs(flipped, 8);
        for (const team of ["901", "902", "903", "904"]) expect(b.rating.get(team)).toBe(a.rating.get(team));
    });

    it("never lowers a team's rating when one of its margins improves", () => {
        const base = [g("901", "902", 3, 1), g("902", "903", 4, 1), g("901", "903", 5, 0)];
        let previous = -Infinity;
        for (let goals = 0; goals <= 10; goals++) {
            const games = [...base.slice(0, 2), g("901", "903", goals, 0)];
            const r = srs(games, 8);
            const lodin = r.agd.get("901")! + r.sched.get("901")!;
            expect(lodin).toBeGreaterThanOrEqual(previous - 1e-9);
            previous = lodin;
        }
    });

    it("handles an empty pool", () => {
        const result = srs([], 8);
        expect(result.rating.size).toBe(0);
        expect(result.converged).toBe(true);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test __tests__/lib/ratings/srs.test.ts`
Expected: FAIL, with "Failed to resolve import "@/lib/ratings"".

- [ ] **Step 3: Write `lib/ratings/types.ts`**

```ts
/**
 * Placement ratings (static rankings spec, 2026-10-07). Pure: no React, DOM,
 * Next or server imports (ADR-0020 portability). Team numbers are strings and
 * are the key everywhere (spec R3).
 */

export interface RatingGame {
    home: string;
    away: string;
    homeGoals: number;
    awayGoals: number;
}

export interface RatingTeam {
    number: string;
    name: string;
    startingBracket?: string | null;
    /** Still an opponent in others' schedules; never scaled, ranked or levelled (spec R5). */
    excluded?: boolean;
}

export interface LevelSpec {
    name: string;
    size: number;
}

export type WalkushVariant = "plus-one";

export interface RatingMethod {
    preset: string;
    goalCap: number;
    walkush: { variant: WalkushVariant };
    lowConfidenceGames: number;
    levels: LevelSpec[];
}

export const CSHL_8U_METHOD: RatingMethod = {
    preset: "cshl-8u",
    goalCap: 8,
    walkush: { variant: "plus-one" },
    lowConfidenceGames: 3,
    levels: [
        { name: "R1", size: 6 },
        { name: "R2", size: 6 },
        { name: "R3", size: 7 },
        { name: "W1", size: 6 },
        { name: "W2", size: 8 },
        { name: "W3", size: 6 },
        { name: "W4", size: 7 },
    ],
};

export const RATING_TOLERANCE = 1e-9;
export const MAX_RATING_ITERATIONS = 10_000;

export function capMargin(margin: number, cap: number): number {
    return Math.max(-cap, Math.min(cap, margin));
}

/** "101" < "102" < "1010": numeric where both are digits. */
export function compareTeamNumbers(a: string, b: string): number {
    return a.localeCompare(b, undefined, { numeric: true });
}

export function mean(values: readonly number[]): number {
    let sum = 0;
    for (const value of values) sum += value;
    return values.length === 0 ? 0 : sum / values.length;
}

/**
 * Each game oriented so `home` sorts first, then sorted. Every calculation
 * walks this order, so input order and home/away orientation never change a
 * result, not even in the last floating-point bit.
 */
export function canonicalGames(games: readonly RatingGame[]): RatingGame[] {
    return games
        .map((game) =>
            compareTeamNumbers(game.home, game.away) <= 0
                ? { ...game }
                : { home: game.away, away: game.home, homeGoals: game.awayGoals, awayGoals: game.homeGoals },
        )
        .sort(
            (a, b) =>
                compareTeamNumbers(a.home, b.home) ||
                compareTeamNumbers(a.away, b.away) ||
                a.homeGoals - b.homeGoals ||
                a.awayGoals - b.awayGoals,
        );
}
```

- [ ] **Step 4: Write `lib/ratings/srs.ts`**

```ts
/**
 * Simple rating system: rating = AGD + mean opponent rating, centered on 0.
 * This is the "Lodin" half of the CSHL RPI (spec, Calculation). Solved by
 * damped iteration: plain Jacobi oscillates on two-colourable schedules (two
 * teams that only played each other), and damping by ½ keeps the same fixed
 * point while removing the oscillation.
 */
import { MAX_RATING_ITERATIONS, RATING_TOLERANCE, canonicalGames, capMargin, compareTeamNumbers, mean, type RatingGame } from "./types";

export interface SrsResult {
    agd: Map<string, number>;
    sched: Map<string, number>;
    rating: Map<string, number>;
    converged: boolean;
}

interface Side {
    opponent: string;
    margin: number;
}

export function srs(games: readonly RatingGame[], goalCap: number): SrsResult {
    const sides = new Map<string, Side[]>();
    const add = (team: string, side: Side) => {
        const list = sides.get(team);
        if (list) list.push(side);
        else sides.set(team, [side]);
    };
    for (const game of canonicalGames(games)) {
        const margin = capMargin(game.homeGoals - game.awayGoals, goalCap);
        add(game.home, { opponent: game.away, margin });
        add(game.away, { opponent: game.home, margin: -margin });
    }
    const teams = [...sides.keys()].sort(compareTeamNumbers);
    const agd = new Map(teams.map((team) => [team, mean(sides.get(team)!.map((side) => side.margin))]));

    let rating = new Map(agd);
    let converged = teams.length === 0;
    for (let iteration = 0; iteration < MAX_RATING_ITERATIONS && !converged; iteration++) {
        const next = new Map<string, number>();
        for (const team of teams) {
            const target = agd.get(team)! + mean(sides.get(team)!.map((side) => rating.get(side.opponent)!));
            next.set(team, 0.5 * rating.get(team)! + 0.5 * target);
        }
        const center = mean(teams.map((team) => next.get(team)!));
        let delta = 0;
        for (const team of teams) {
            const value = next.get(team)! - center;
            next.set(team, value);
            delta = Math.max(delta, Math.abs(value - rating.get(team)!));
        }
        rating = next;
        converged = delta < RATING_TOLERANCE;
    }

    const sched = new Map(teams.map((team) => [team, mean(sides.get(team)!.map((side) => rating.get(side.opponent)!))]));
    return { agd, sched, rating, converged };
}
```

- [ ] **Step 5: Write `lib/ratings/index.ts`**

```ts
/** Placement ratings (static rankings spec). Pure; see types.ts. */
export * from "./types";
export * from "./srs";
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `bun run test __tests__/lib/ratings/srs.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 7: Commit**

```bash
git add lib/ratings __tests__/lib/ratings/srs.test.ts
git commit -m "feat(rankings): simple rating system for placement ratings"
```

---

### Task 2: Walkush approximation, scaling and the composite

**Files:**
- Create: `lib/ratings/walkush.ts`, `lib/ratings/composite.ts`
- Modify: `lib/ratings/index.ts`
- Test: `__tests__/lib/ratings/composite.test.ts`

**Interfaces:**
- Consumes: Task 1 types, plus `srs`, `canonicalGames`, `compareTeamNumbers` and `mean`.
- Produces:
  - `walkushApprox(games: readonly RatingGame[], variant: WalkushVariant): { value: Map<string, number>; converged: boolean }`
  - `scale0to20(values: Map<string, number>, include: readonly string[]): Map<string, number>`
  - `type Movement = "up" | "same" | "down"`
  - `TeamRating`, with these fields:
    - `number`, `name`, `startingBracket: string | null`, `excluded: boolean`
    - `games`, `wins`, `losses`, `ties`, `goalsFor`, `goalsAgainst`
    - `agd`, `sched`, `lodin`, `walkush`, `lodinScaled`, `walkushScaled`, `rpi`, all `number | null`
    - `rank: number | null`, `level: string | null`, `startingLevel: string | null`, `movement: Movement | null`
    - `lowConfidence: boolean`, `component: number | null`
  - `RatingsResult { teams: TeamRating[]; ranked: TeamRating[]; byNumber: Map<string, TeamRating>; componentCount: number; converged: boolean }`
  - `composite(games: readonly RatingGame[], teams: readonly RatingTeam[], method: RatingMethod): RatingsResult`
  - `whatIf(games, hypotheticals, teams, method): RatingsResult`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/lib/ratings/composite.test.ts
import { describe, expect, it } from "vitest";
import { composite, scale0to20, walkushApprox, whatIf, type RatingGame, type RatingMethod, type RatingTeam } from "@/lib/ratings";

const g = (home: string, away: string, homeGoals: number, awayGoals: number): RatingGame => ({ home, away, homeGoals, awayGoals });
const t = (number: string, extra: Partial<RatingTeam> = {}): RatingTeam => ({ number, name: `Team ${number}`, ...extra });
const method = (levels: Array<[string, number]>, extra: Partial<RatingMethod> = {}): RatingMethod => ({
    preset: "test",
    goalCap: 8,
    walkush: { variant: "plus-one" },
    lowConfidenceGames: 0,
    levels: levels.map(([name, size]) => ({ name, size })),
    ...extra,
});

describe("walkushApprox", () => {
    it("solves a two-team pool in log space", () => {
        const { value, converged } = walkushApprox([g("901", "902", 5, 1)], "plus-one");
        expect(converged).toBe(true);
        expect(value.get("901")).toBeCloseTo(Math.log(3) / 2, 6);
        expect(value.get("902")).toBeCloseTo(-Math.log(3) / 2, 6);
    });

    it("treats 0–0 as a ratio of 1", () => {
        const { value } = walkushApprox([g("901", "902", 0, 0)], "plus-one");
        expect(value.get("901")).toBeCloseTo(0, 9);
    });
});

describe("scale0to20", () => {
    it("maps min to 0 and max to 20 over the included teams", () => {
        const scaled = scale0to20(new Map([["a", 1], ["b", 3], ["c", 2], ["x", 99]]), ["a", "b", "c"]);
        expect(scaled.get("a")).toBe(0);
        expect(scaled.get("b")).toBe(20);
        expect(scaled.get("c")).toBe(10);
        expect(scaled.has("x")).toBe(false);
    });

    it("gives everyone 10 when all values are equal", () => {
        expect(scale0to20(new Map([["a", 2], ["b", 2]]), ["a", "b"]).get("a")).toBe(10);
    });
});

describe("composite", () => {
    const chain = [g("901", "902", 4, 0), g("902", "903", 4, 0), g("903", "904", 4, 0)];
    const chainTeams = [t("901"), t("902"), t("903"), t("904")];

    it("ranks a dominance chain in order with RPI 20 at the top and 0 at the bottom", () => {
        const result = composite(chain, chainTeams, method([["X", 2], ["Y", 1]]));
        expect(result.ranked.map((r) => r.number)).toEqual(["901", "902", "903", "904"]);
        expect(result.byNumber.get("901")!.rpi).toBeCloseTo(20, 6);
        expect(result.byNumber.get("904")!.rpi).toBeCloseTo(0, 6);
        expect(result.ranked.map((r) => r.level)).toEqual(["X", "X", "Y", null]);
    });

    it("reports Lodin as AGD + SCHED and the record", () => {
        const row = composite(chain, chainTeams, method([["X", 4]])).byNumber.get("902")!;
        expect(row.lodin).toBeCloseTo(row.agd! + row.sched!, 9);
        expect([row.wins, row.losses, row.ties, row.games]).toEqual([1, 1, 0, 2]);
        expect([row.goalsFor, row.goalsAgainst]).toEqual([4, 4]);
    });

    it("keeps excluded teams as opponents but out of ranks and scaling", () => {
        const games = [...chain, g("905", "901", 9, 0), g("905", "904", 9, 0)];
        const teams = [...chainTeams, t("905", { excluded: true })];
        const result = composite(games, teams, method([["X", 5]]));
        const excluded = result.byNumber.get("905")!;
        expect(excluded.rank).toBeNull();
        expect(excluded.rpi).toBeNull();
        expect(excluded.lodin).not.toBeNull();
        expect(result.ranked).toHaveLength(4);
        expect(result.byNumber.get("901")!.sched).not.toBeCloseTo(composite(chain, chainTeams, method([["X", 4]])).byNumber.get("901")!.sched!, 3);
    });

    it("lists teams with no games as unranked at the end", () => {
        const result = composite(chain, [...chainTeams, t("950")], method([["X", 10]]));
        const idle = result.byNumber.get("950")!;
        expect(idle.rank).toBeNull();
        expect(idle.lodin).toBeNull();
        expect(result.teams.at(-1)!.number).toBe("950");
    });

    it("adds teams that appear only in games, named by number", () => {
        const result = composite([g("901", "999", 1, 0)], [t("901")], method([["X", 2]]));
        expect(result.byNumber.get("999")!.name).toBe("999");
    });

    it("breaks RPI ties by Lodin then team number", () => {
        const result = composite([g("902", "901", 2, 2)], [t("901"), t("902")], method([["X", 2]]));
        expect(result.ranked.map((r) => r.number)).toEqual(["901", "902"]);
        expect(result.byNumber.get("901")!.rpi).toBe(10);
    });

    it("flags low confidence below the threshold", () => {
        const result = composite(chain, chainTeams, method([["X", 4]], { lowConfidenceGames: 2 }));
        expect(result.byNumber.get("901")!.lowConfidence).toBe(true);
        expect(result.byNumber.get("902")!.lowConfidence).toBe(false);
    });

    it("counts disconnected groups", () => {
        const result = composite([g("901", "902", 1, 0), g("903", "904", 1, 0)], chainTeams, method([["X", 4]]));
        expect(result.componentCount).toBe(2);
        expect(result.byNumber.get("901")!.component).toBe(result.byNumber.get("902")!.component);
        expect(result.byNumber.get("901")!.component).not.toBe(result.byNumber.get("903")!.component);
    });

    it("derives starting levels from brackets and reports movement", () => {
        const teams = [
            t("901", { startingBracket: "Red Strong" }),
            t("902", { startingBracket: "Red Strong" }),
            t("903", { startingBracket: "White Strong" }),
            t("904", { startingBracket: "White Strong" }),
        ];
        const games = [g("904", "901", 4, 0), g("904", "902", 4, 0), g("901", "903", 4, 0), g("902", "903", 1, 0)];
        const result = composite(games, teams, method([["X", 2], ["Y", 2]]));
        const top = result.byNumber.get("904")!;
        expect(top.rank).toBe(1);
        expect(top.startingLevel).toBe("Y");
        expect(top.level).toBe("X");
        expect(top.movement).toBe("up");
        expect(result.byNumber.get("903")!.movement).toBe("same");
    });

    it("whatIf adds hypothetical games without changing its inputs", () => {
        const games = Object.freeze([...chain]) as readonly RatingGame[];
        const before = composite(games, chainTeams, method([["X", 4]]));
        const after = whatIf(games, [g("904", "901", 8, 0)], chainTeams, method([["X", 4]]));
        expect(games).toHaveLength(3);
        expect(after.byNumber.get("904")!.rpi).toBeGreaterThan(before.byNumber.get("904")!.rpi!);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test __tests__/lib/ratings/composite.test.ts`
Expected: FAIL, because `composite` is not exported.

- [ ] **Step 3: Write `lib/ratings/walkush.ts`**

```ts
/**
 * Approximation of the CSHL "Walkush" half (spec, Calculation): per game a
 * goal ratio (GF + 1) / (GA + 1); ratings solve rating_t / rating_o ≈ ratio
 * on average. Iterated in log space (l = ln rating) with the same ½ damping as
 * srs, centered so the geometric mean is 1. Reported as l. Scaling is affine
 * invariant, so the reported offset does not matter. Always labelled "approx."
 */
import { MAX_RATING_ITERATIONS, RATING_TOLERANCE, canonicalGames, compareTeamNumbers, mean, type RatingGame, type WalkushVariant } from "./types";

interface Side {
    opponent: string;
    logRatio: number;
}

function logRatio(goalsFor: number, goalsAgainst: number, variant: WalkushVariant): number {
    switch (variant) {
        case "plus-one":
            return Math.log((goalsFor + 1) / (goalsAgainst + 1));
    }
}

export function walkushApprox(games: readonly RatingGame[], variant: WalkushVariant): { value: Map<string, number>; converged: boolean } {
    const sides = new Map<string, Side[]>();
    const add = (team: string, side: Side) => {
        const list = sides.get(team);
        if (list) list.push(side);
        else sides.set(team, [side]);
    };
    for (const game of canonicalGames(games)) {
        add(game.home, { opponent: game.away, logRatio: logRatio(game.homeGoals, game.awayGoals, variant) });
        add(game.away, { opponent: game.home, logRatio: logRatio(game.awayGoals, game.homeGoals, variant) });
    }
    const teams = [...sides.keys()].sort(compareTeamNumbers);
    let value = new Map(teams.map((team) => [team, 0]));
    let converged = teams.length === 0;
    for (let iteration = 0; iteration < MAX_RATING_ITERATIONS && !converged; iteration++) {
        const next = new Map<string, number>();
        for (const team of teams) {
            const target = Math.log(mean(sides.get(team)!.map((side) => Math.exp(side.logRatio + value.get(side.opponent)!))));
            next.set(team, 0.5 * value.get(team)! + 0.5 * target);
        }
        const center = mean(teams.map((team) => next.get(team)!));
        let delta = 0;
        for (const team of teams) {
            const v = next.get(team)! - center;
            next.set(team, v);
            delta = Math.max(delta, Math.abs(v - value.get(team)!));
        }
        value = next;
        converged = delta < RATING_TOLERANCE;
    }
    return { value, converged };
}
```

- [ ] **Step 4: Write `lib/ratings/composite.ts`**

```ts
/**
 * The CSHL-compatible RPI (spec, Calculation): (Lodin scaled + Walkush scaled) / 2,
 * each min–max scaled to 0–20 over the rated teams that aren't excluded; then
 * rank, levels by method.levels sizes, starting levels from brackets, movement,
 * low confidence and connected groups.
 */
import { srs } from "./srs";
import { compareTeamNumbers, type RatingGame, type RatingMethod, type RatingTeam } from "./types";
import { walkushApprox } from "./walkush";

export type Movement = "up" | "same" | "down";

export interface TeamRating {
    number: string;
    name: string;
    startingBracket: string | null;
    excluded: boolean;
    games: number;
    wins: number;
    losses: number;
    ties: number;
    goalsFor: number;
    goalsAgainst: number;
    agd: number | null;
    sched: number | null;
    lodin: number | null;
    walkush: number | null;
    lodinScaled: number | null;
    walkushScaled: number | null;
    rpi: number | null;
    rank: number | null;
    level: string | null;
    startingLevel: string | null;
    movement: Movement | null;
    lowConfidence: boolean;
    component: number | null;
}

export interface RatingsResult {
    /** Ranked teams by rank, then unranked teams by number. */
    teams: TeamRating[];
    ranked: TeamRating[];
    byNumber: Map<string, TeamRating>;
    /** Connected groups among ranked teams; above 1, ratings aren't comparable across groups. */
    componentCount: number;
    converged: boolean;
}

export function scale0to20(values: Map<string, number>, include: readonly string[]): Map<string, number> {
    const present = include.filter((team) => values.has(team));
    const list = present.map((team) => values.get(team)!);
    const min = Math.min(...list);
    const max = Math.max(...list);
    return new Map(present.map((team) => [team, max === min ? 10 : (20 * (values.get(team)! - min)) / (max - min)]));
}

/** Rank-ordered teams cut into named levels; teams past the total size get none. */
function cutLevels(order: readonly string[], method: RatingMethod): Map<string, string> {
    const levels = new Map<string, string>();
    let index = 0;
    for (const level of method.levels) {
        for (let k = 0; k < level.size && index < order.length; k++, index++) levels.set(order[index], level.name);
    }
    return levels;
}

function components(games: readonly RatingGame[]): Map<string, number> {
    const parent = new Map<string, string>();
    const find = (team: string): string => {
        let root = team;
        while (parent.get(root) !== root) root = parent.get(root)!;
        parent.set(team, root);
        return root;
    };
    for (const game of games) {
        for (const team of [game.home, game.away]) if (!parent.has(team)) parent.set(team, team);
        const a = find(game.home);
        const b = find(game.away);
        if (a !== b) parent.set(compareTeamNumbers(a, b) <= 0 ? b : a, compareTeamNumbers(a, b) <= 0 ? a : b);
    }
    const roots = [...new Set([...parent.keys()].map(find))].sort(compareTeamNumbers);
    const ids = new Map(roots.map((root, i) => [root, i + 1]));
    return new Map([...parent.keys()].map((team) => [team, ids.get(find(team))!]));
}

export function composite(games: readonly RatingGame[], teams: readonly RatingTeam[], method: RatingMethod): RatingsResult {
    const roster = new Map<string, RatingTeam>(teams.map((team) => [team.number, team]));
    for (const game of games) {
        for (const number of [game.home, game.away]) if (!roster.has(number)) roster.set(number, { number, name: number });
    }

    const lodinParts = srs(games, method.goalCap);
    const walkush = walkushApprox(games, method.walkush.variant);
    const groups = components(games);

    const record = new Map<string, { games: number; wins: number; losses: number; ties: number; goalsFor: number; goalsAgainst: number }>();
    const tally = (team: string, goalsFor: number, goalsAgainst: number) => {
        const r = record.get(team) ?? { games: 0, wins: 0, losses: 0, ties: 0, goalsFor: 0, goalsAgainst: 0 };
        r.games += 1;
        r.goalsFor += goalsFor;
        r.goalsAgainst += goalsAgainst;
        if (goalsFor > goalsAgainst) r.wins += 1;
        else if (goalsFor < goalsAgainst) r.losses += 1;
        else r.ties += 1;
        record.set(team, r);
    };
    for (const game of games) {
        tally(game.home, game.homeGoals, game.awayGoals);
        tally(game.away, game.awayGoals, game.homeGoals);
    }

    const lodin = new Map<string, number>();
    for (const [team, rating] of lodinParts.rating) lodin.set(team, rating);
    const eligible = [...roster.values()].filter((team) => !team.excluded && lodin.has(team.number)).map((team) => team.number);
    const lodinScaled = scale0to20(lodin, eligible);
    const walkushScaled = scale0to20(walkush.value, eligible);
    const rpi = new Map(eligible.map((team) => [team, (lodinScaled.get(team)! + walkushScaled.get(team)!) / 2]));

    const order = [...eligible].sort((a, b) => rpi.get(b)! - rpi.get(a)! || lodin.get(b)! - lodin.get(a)! || compareTeamNumbers(a, b));
    const levels = cutLevels(order, method);

    // Starting order: brackets ordered by their lowest team number (snake-chart numbering), then team number.
    const bracketMin = new Map<string, string>();
    for (const number of eligible) {
        const bracket = roster.get(number)!.startingBracket;
        if (!bracket) continue;
        const current = bracketMin.get(bracket);
        if (current === undefined || compareTeamNumbers(number, current) < 0) bracketMin.set(bracket, number);
    }
    const bracketRank = new Map([...bracketMin.entries()].sort((a, b) => compareTeamNumbers(a[1], b[1])).map(([bracket], i) => [bracket, i]));
    const seeded = eligible
        .filter((number) => bracketRank.has(roster.get(number)!.startingBracket ?? ""))
        .sort((a, b) => bracketRank.get(roster.get(a)!.startingBracket!)! - bracketRank.get(roster.get(b)!.startingBracket!)! || compareTeamNumbers(a, b));
    const startingLevels = cutLevels(seeded, method);
    const levelIndex = new Map(method.levels.map((level, i) => [level.name, i]));

    const rows = new Map<string, TeamRating>();
    for (const team of roster.values()) {
        const r = record.get(team.number) ?? { games: 0, wins: 0, losses: 0, ties: 0, goalsFor: 0, goalsAgainst: 0 };
        const rank = order.indexOf(team.number);
        const level = levels.get(team.number) ?? null;
        const startingLevel = startingLevels.get(team.number) ?? null;
        let movement: Movement | null = null;
        if (level !== null && startingLevel !== null) {
            const diff = levelIndex.get(level)! - levelIndex.get(startingLevel)!;
            movement = diff < 0 ? "up" : diff > 0 ? "down" : "same";
        }
        rows.set(team.number, {
            number: team.number,
            name: team.name,
            startingBracket: team.startingBracket ?? null,
            excluded: team.excluded ?? false,
            ...r,
            agd: lodinParts.agd.get(team.number) ?? null,
            sched: lodinParts.sched.get(team.number) ?? null,
            lodin: lodin.get(team.number) ?? null,
            walkush: walkush.value.get(team.number) ?? null,
            lodinScaled: lodinScaled.get(team.number) ?? null,
            walkushScaled: walkushScaled.get(team.number) ?? null,
            rpi: rpi.get(team.number) ?? null,
            rank: rank === -1 ? null : rank + 1,
            level,
            startingLevel,
            movement,
            lowConfidence: r.games < method.lowConfidenceGames,
            component: groups.get(team.number) ?? null,
        });
    }

    const ranked = order.map((number) => rows.get(number)!);
    const unranked = [...rows.values()].filter((row) => row.rank === null).sort((a, b) => compareTeamNumbers(a.number, b.number));
    return {
        teams: [...ranked, ...unranked],
        ranked,
        byNumber: rows,
        componentCount: new Set(ranked.map((row) => row.component)).size,
        converged: lodinParts.converged && walkush.converged,
    };
}

/** The ratings as if the hypothetical results had happened. Inputs are never changed. */
export function whatIf(
    games: readonly RatingGame[],
    hypotheticals: readonly RatingGame[],
    teams: readonly RatingTeam[],
    method: RatingMethod,
): RatingsResult {
    return composite([...games, ...hypotheticals], teams, method);
}
```

- [ ] **Step 5: Export the new modules from `lib/ratings/index.ts`**

```ts
/** Placement ratings (static rankings spec). Pure; see types.ts. */
export * from "./types";
export * from "./srs";
export * from "./walkush";
export * from "./composite";
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bun run test __tests__/lib/ratings`
Expected: PASS (both files).

- [ ] **Step 7: Commit**

```bash
git add lib/ratings __tests__/lib/ratings/composite.test.ts
git commit -m "feat(rankings): Walkush approximation and CSHL-compatible composite"
```

---

### Task 3: Margin sweep

**Files:**
- Create: `lib/ratings/sweep.ts`
- Modify: `lib/ratings/index.ts` (add `export * from "./sweep";`)
- Test: `__tests__/lib/ratings/sweep.test.ts`

**Interfaces:**
- Consumes: `composite`, `RatingGame`, `RatingTeam`, `RatingMethod`.
- Produces: `SweepCell { margin: number; teamGoals: number; opponentGoals: number; rank: number | null; level: string | null; rpi: number | null; lodin: number | null }` and `marginSweep(games: readonly RatingGame[], fixture: { home: string; away: string }, team: string, teams: readonly RatingTeam[], method: RatingMethod, otherGoals?: number): SweepCell[]`.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/lib/ratings/sweep.test.ts
import { describe, expect, it } from "vitest";
import { marginSweep, type RatingGame, type RatingMethod, type RatingTeam } from "@/lib/ratings";

const g = (home: string, away: string, homeGoals: number, awayGoals: number): RatingGame => ({ home, away, homeGoals, awayGoals });
const teams: RatingTeam[] = ["901", "902", "903", "904"].map((number) => ({ number, name: number }));
const method: RatingMethod = { preset: "t", goalCap: 3, walkush: { variant: "plus-one" }, lowConfidenceGames: 0, levels: [{ name: "X", size: 2 }, { name: "Y", size: 2 }] };
const games = [g("901", "902", 3, 1), g("902", "903", 2, 2), g("903", "904", 4, 1)];

describe("marginSweep", () => {
    it("returns one cell per margin from -cap to +cap with the scores it assumed", () => {
        const cells = marginSweep(games, { home: "904", away: "901" }, "904", teams, method);
        expect(cells.map((c) => c.margin)).toEqual([-3, -2, -1, 0, 1, 2, 3]);
        expect(cells[0]).toMatchObject({ teamGoals: 2, opponentGoals: 5 });
        expect(cells[6]).toMatchObject({ teamGoals: 5, opponentGoals: 2 });
    });

    it("never lowers the team's own Lodin as the margin grows", () => {
        const cells = marginSweep(games, { home: "901", away: "904" }, "904", teams, method);
        for (let i = 1; i < cells.length; i++) expect(cells[i].lodin!).toBeGreaterThanOrEqual(cells[i - 1].lodin! - 1e-9);
    });

    it("rejects a team that isn't in the fixture", () => {
        expect(() => marginSweep(games, { home: "901", away: "904" }, "902", teams, method)).toThrow();
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test __tests__/lib/ratings/sweep.test.ts`
Expected: FAIL, because `marginSweep` is not exported.

- [ ] **Step 3: Write `lib/ratings/sweep.ts`**

```ts
/**
 * What-if sweep (spec, What-if): the chosen team's rank, level and RPI at every
 * final margin from −cap to +cap for one fixture. The losing (or tied) side is
 * assumed to score `otherGoals`, which matters only to the Walkush ratio.
 */
import { composite } from "./composite";
import type { RatingGame, RatingMethod, RatingTeam } from "./types";

export interface SweepCell {
    margin: number;
    teamGoals: number;
    opponentGoals: number;
    rank: number | null;
    level: string | null;
    rpi: number | null;
    lodin: number | null;
}

export const SWEEP_OTHER_GOALS = 2;

export function marginSweep(
    games: readonly RatingGame[],
    fixture: { home: string; away: string },
    team: string,
    teams: readonly RatingTeam[],
    method: RatingMethod,
    otherGoals: number = SWEEP_OTHER_GOALS,
): SweepCell[] {
    if (team !== fixture.home && team !== fixture.away) throw new Error("The swept team must play in the fixture");
    const cells: SweepCell[] = [];
    for (let margin = -method.goalCap; margin <= method.goalCap; margin++) {
        const teamGoals = otherGoals + Math.max(margin, 0);
        const opponentGoals = otherGoals + Math.max(-margin, 0);
        const game: RatingGame =
            team === fixture.home
                ? { home: fixture.home, away: fixture.away, homeGoals: teamGoals, awayGoals: opponentGoals }
                : { home: fixture.home, away: fixture.away, homeGoals: opponentGoals, awayGoals: teamGoals };
        const row = composite([...games, game], teams, method).byNumber.get(team);
        cells.push({ margin, teamGoals, opponentGoals, rank: row?.rank ?? null, level: row?.level ?? null, rpi: row?.rpi ?? null, lodin: row?.lodin ?? null });
    }
    return cells;
}
```

- [ ] **Step 4: Add `export * from "./sweep";` to `lib/ratings/index.ts`**

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun run test __tests__/lib/ratings`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/ratings __tests__/lib/ratings/sweep.test.ts
git commit -m "feat(rankings): margin sweep for what-if"
```

---

### Task 4: Schedule page parser

**Files:**
- Create: `lib/ratings/import/html.ts`, `lib/ratings/import/schedule.ts`, `lib/ratings/import/index.ts`
- Test: `__tests__/lib/ratings/import-schedule.test.ts`

**Interfaces:**
- Produces:
  - `htmlToText(html: string): string`
  - `decodeEntities(text: string): string`
  - `looksLikeHtml(input: string): boolean`
  - `ParsedGame { date: string; time: string | null; home: string; away: string; homeGoals: number | null; awayGoals: number | null; rink: string | null }`
  - `ParsedSchedule { games: ParsedGame[]; teams: Array<{ number: string; name: string }>; unparsed: string[] }`
  - `parseSchedule(input: string, options: { seasonYear: number }): ParsedSchedule`
  - `defaultSeasonYear(now: Date): number`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/lib/ratings/import-schedule.test.ts
import { describe, expect, it } from "vitest";
import { defaultSeasonYear, htmlToText, parseSchedule } from "@/lib/ratings/import";

// Made-up programs in the token shapes the real schedule page produces (spec R6).
const PAGE_TEXT = [
    "Schedule", "Home", "Score", "Away", "Location",
    "9/20", "9:25am", "901 Riverside M1", "11", "-", "4", "902 Lakeview M2", "North Rink",
    "9/26", "3:40pm", "903 Hilltop M1", "4 - 9", "901 Riverside M1", "Center Ice",
    "9/26", "4:30pm", "902 Lakeview M2", "6", "-", "5", "903 Hilltop M1", "Center Ice",
    "10/12", "8:00am", "901 Riverside M1", "vs", "903 Hilltop M1", "The Pond",
    "10/12", "12:30pm", "902 Lakeview M2", "903 Hilltop M1",
    "904 Orphan Team",
].join("\n");

describe("parseSchedule", () => {
    it("reads completed and scheduled games from page text", () => {
        const result = parseSchedule(PAGE_TEXT, { seasonYear: 2026 });
        expect(result.games).toEqual([
            { date: "2026-09-20", time: "09:25", home: "901", away: "902", homeGoals: 11, awayGoals: 4, rink: "North Rink" },
            { date: "2026-09-26", time: "15:40", home: "903", away: "901", homeGoals: 4, awayGoals: 9, rink: "Center Ice" },
            { date: "2026-09-26", time: "16:30", home: "902", away: "903", homeGoals: 6, awayGoals: 5, rink: "Center Ice" },
            { date: "2026-10-12", time: "08:00", home: "901", away: "903", homeGoals: null, awayGoals: null, rink: "The Pond" },
            { date: "2026-10-12", time: "12:30", home: "902", away: "903", homeGoals: null, awayGoals: null, rink: null },
        ]);
        expect(result.teams).toEqual([
            { number: "901", name: "Riverside M1" },
            { number: "902", name: "Lakeview M2" },
            { number: "903", name: "Hilltop M1" },
        ]);
        expect(result.unparsed).toEqual(["904 Orphan Team"]);
    });

    it("reads tab-separated rows and combined date and time cells", () => {
        const result = parseSchedule("9/26 3:40pm\t903 Hilltop M1\t4 - 9\t901 Riverside M1\tCenter Ice", { seasonYear: 2026 });
        expect(result.games).toHaveLength(1);
        expect(result.games[0]).toMatchObject({ date: "2026-09-26", time: "15:40", homeGoals: 4, awayGoals: 9 });
    });

    it("reads a saved page's HTML, ignoring scripts and decoding entities", () => {
        const html =
            '<html><head><script>var d="9/21";</script><style>.x{}</style></head><body>' +
            '<div class="game"><span>9/20</span><span>9:25am</span><a href="#">901 Riverside M1</a><b>11</b><b>-</b><b>4</b>' +
            '<a href="#">902 Lake &amp; View M2</a><span>North&nbsp;Rink</span></div></body></html>';
        const result = parseSchedule(html, { seasonYear: 2026 });
        expect(result.games).toHaveLength(1);
        expect(result.teams[1]).toEqual({ number: "902", name: "Lake & View M2" });
        expect(result.games[0].rink).toBe("North Rink");
    });

    it("puts January–June dates in the following calendar year", () => {
        const result = parseSchedule("1/5\n9:00am\n901 Riverside M1\n2 - 1\n902 Lakeview M2", { seasonYear: 2026 });
        expect(result.games[0].date).toBe("2027-01-05");
    });

    it("converts 12am and 12pm correctly", () => {
        const result = parseSchedule("9/1\n12:05am\n901 A\n1 - 0\n902 B\n9/1\n12:30pm\n901 A\n1 - 0\n902 B", { seasonYear: 2026 });
        expect(result.games.map((x) => x.time)).toEqual(["00:05", "12:30"]);
    });

    it("never invents a game without a date, or between a team and itself", () => {
        const result = parseSchedule("901 Riverside M1\n2 - 1\n902 Lakeview M2\n9/1\n901 A\n1 - 0\n901 A", { seasonYear: 2026 });
        expect(result.games).toHaveLength(0);
        expect(result.unparsed).toEqual(["901 Riverside M1", "902 Lakeview M2", "901 A"]);
    });
});

describe("htmlToText", () => {
    it("puts every element's text on its own line", () => {
        expect(htmlToText("<p>a<b>b</b></p><!-- c --><br>d").split("\n")).toEqual(["a", "b", "d"]);
    });
});

describe("defaultSeasonYear", () => {
    it("is this year from July on, else last year", () => {
        expect(defaultSeasonYear(new Date(2026, 9, 7))).toBe(2026);
        expect(defaultSeasonYear(new Date(2027, 1, 7))).toBe(2026);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test __tests__/lib/ratings/import-schedule.test.ts`
Expected: FAIL, with "Failed to resolve import "@/lib/ratings/import"".

- [ ] **Step 3: Write `lib/ratings/import/html.ts`**

```ts
/** Minimal HTML → text for pasted or saved league pages (spec R2). Pure: no DOM. */

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—" };

export function decodeEntities(text: string): string {
    return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
        if (body[0] === "#") {
            const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
            return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
        }
        return NAMED[body.toLowerCase()] ?? match;
    });
}

export function looksLikeHtml(input: string): boolean {
    return /<(html|body|div|table|tr|td|span|a|p)\b/i.test(input);
}

/** Every element boundary becomes a line break; blank lines dropped; each line trimmed. */
export function htmlToText(html: string): string {
    const withoutCode = html
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
    const text = decodeEntities(withoutCode.replace(/<[^>]*>/g, "\n"));
    return text
        .split("\n")
        .map((line) => line.replace(/\s+/g, " ").trim())
        .filter((line) => line.length > 0)
        .join("\n");
}
```

- [ ] **Step 4: Write `lib/ratings/import/schedule.ts`**

```ts
/**
 * Reads a league schedule page that the user pasted or saved (spec R2). The page lists
 * `date · time · home · score · away · rink`, with cells on separate lines or tab-separated.
 * The score is one cell ("4 - 9") or three ("4", "-", "9"). A game with no score is
 * scheduled. Lines holding a team number that never formed a game are reported verbatim,
 * never dropped silently.
 */
import { htmlToText, looksLikeHtml } from "./html";

export interface ParsedGame {
    date: string;
    time: string | null;
    home: string;
    away: string;
    homeGoals: number | null;
    awayGoals: number | null;
    rink: string | null;
}

export interface ParsedSchedule {
    games: ParsedGame[];
    teams: Array<{ number: string; name: string }>;
    unparsed: string[];
}

const DATE = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/;
const TIME = /^(\d{1,2}):(\d{2})\s*([ap])\.?m\.?$/i;
const DATE_TIME = /^(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s+(\d{1,2}:\d{2}\s*[ap]\.?m\.?)$/i;
const TEAM = /^(\d{3})\s+(\S.*)$/;
const SCORE = /^(\d{1,2})\s*[-–]\s*(\d{1,2})$/;
const GOALS = /^\d{1,2}$/;
const DASH = /^[-–]$/;
const VERSUS = /^(vs\.?|v\.?|@|at)$/i;

/** Pre-season starts in late summer: from July on it's this year, else last year. */
export function defaultSeasonYear(now: Date): number {
    return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
}

const pad = (n: number) => String(n).padStart(2, "0");

function toIsoDate(token: string, seasonYear: number): string | null {
    const m = DATE.exec(token);
    if (!m) return null;
    const month = Number(m[1]);
    const day = Number(m[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    let year = m[3] ? Number(m[3]) : month >= 7 ? seasonYear : seasonYear + 1;
    if (year < 100) year += 2000;
    return `${year}-${pad(month)}-${pad(day)}`;
}

function toTime(token: string): string | null {
    const m = TIME.exec(token);
    if (!m) return null;
    let hour = Number(m[1]);
    const minute = Number(m[2]);
    if (hour < 1 || hour > 12 || minute > 59) return null;
    const pm = m[3].toLowerCase() === "p";
    if (hour === 12) hour = pm ? 12 : 0;
    else if (pm) hour += 12;
    return `${pad(hour)}:${pad(minute)}`;
}

function tokenize(input: string): string[] {
    const text = looksLikeHtml(input) ? htmlToText(input) : input;
    const tokens: string[] = [];
    for (const raw of text.split(/\r?\n|\t/)) {
        const cell = raw.replace(/\s+/g, " ").trim();
        if (!cell) continue;
        const both = DATE_TIME.exec(cell);
        if (both) tokens.push(both[1], both[2]);
        else tokens.push(cell);
    }
    return tokens;
}

function isStructural(token: string): boolean {
    return DATE.test(token) || TIME.test(token) || DATE_TIME.test(token) || TEAM.test(token) || SCORE.test(token) || GOALS.test(token) || DASH.test(token) || VERSUS.test(token);
}

export function parseSchedule(input: string, options: { seasonYear: number }): ParsedSchedule {
    const tokens = tokenize(input);
    const games: ParsedGame[] = [];
    const names = new Map<string, string>();
    const used = new Set<number>();
    let date: string | null = null;
    let time: string | null = null;

    let i = 0;
    while (i < tokens.length) {
        const token = tokens[i];
        const isoDate = toIsoDate(token, options.seasonYear);
        if (isoDate) {
            date = isoDate;
            time = null;
            i++;
            continue;
        }
        const clock = toTime(token);
        if (clock) {
            time = clock;
            i++;
            continue;
        }
        const home = TEAM.exec(token);
        if (!home || !date) {
            i++;
            continue;
        }
        let j = i + 1;
        let homeGoals: number | null = null;
        let awayGoals: number | null = null;
        const single = SCORE.exec(tokens[j] ?? "");
        if (single) {
            homeGoals = Number(single[1]);
            awayGoals = Number(single[2]);
            j += 1;
        } else if (GOALS.test(tokens[j] ?? "") && DASH.test(tokens[j + 1] ?? "") && GOALS.test(tokens[j + 2] ?? "")) {
            homeGoals = Number(tokens[j]);
            awayGoals = Number(tokens[j + 2]);
            j += 3;
        } else if (VERSUS.test(tokens[j] ?? "")) {
            j += 1;
        }
        const away = TEAM.exec(tokens[j] ?? "");
        if (!away || away[1] === home[1]) {
            i++;
            continue;
        }
        let rink: string | null = null;
        const next = tokens[j + 1];
        let end = j + 1;
        if (next !== undefined && !isStructural(next)) {
            rink = next;
            end = j + 2;
        }
        for (let k = i; k < end; k++) used.add(k);
        if (!names.has(home[1])) names.set(home[1], home[2]);
        if (!names.has(away[1])) names.set(away[1], away[2]);
        games.push({ date, time, home: home[1], away: away[1], homeGoals, awayGoals, rink });
        i = end;
    }

    const unparsed: string[] = [];
    tokens.forEach((token, index) => {
        if (!used.has(index) && TEAM.test(token) && !unparsed.includes(token)) unparsed.push(token);
    });
    return { games, teams: [...names.entries()].map(([number, name]) => ({ number, name })), unparsed };
}
```

- [ ] **Step 5: Write `lib/ratings/import/index.ts`**

```ts
/** Parsers for pasted or saved league pages (static rankings spec R2). Pure. */
export * from "./html";
export * from "./schedule";
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `bun run test __tests__/lib/ratings/import-schedule.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 7: Commit**

```bash
git add lib/ratings/import __tests__/lib/ratings/import-schedule.test.ts
git commit -m "feat(rankings): parse pasted or saved schedule pages"
```

---

### Task 5: Snake chart parser

**Files:**
- Create: `lib/ratings/import/snake-chart.ts`
- Modify: `lib/ratings/import/index.ts` (add `export * from "./snake-chart";`)
- Test: `__tests__/lib/ratings/import-snake.test.ts`

**Interfaces:**
- Consumes: `decodeEntities` and `looksLikeHtml` from Task 4.
- Produces: `ParsedSnakeTeam { number: string; name: string | null; startingBracket: string }`, `ParsedSnakeChart { teams: ParsedSnakeTeam[]; unparsed: string[] }` and `parseSnakeChart(input: string): ParsedSnakeChart`.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/lib/ratings/import-snake.test.ts
import { describe, expect, it } from "vitest";
import { parseSnakeChart } from "@/lib/ratings/import";

const HTML = `
<h2>8U Snake Chart</h2>
<table><thead>
<tr><th>8U</th><th>1</th><th>2</th><th>3</th><th>4</th><th>Teams</th></tr>
<tr><th>Program</th><th>Red</th><th>Red</th><th>White</th><th>White</th><th rowspan="2">Total</th></tr>
<tr><th>Strength</th><th>str</th><th>weak</th><th>str</th><th>weak</th></tr>
</thead><tbody>
<tr><th rowspan="2" title="Riverside Hawks">Riverside</th><td class="n" title="Riverside M1">901</td><td></td><td class="n" title="Riverside M2">903</td><td></td><td class="total" rowspan="2">3</td></tr>
<tr><td></td><td></td><td></td><td class="n" title="Riverside M3">905</td></tr>
<tr><th title="Lakeview">Lakeview</th><td></td><td class="n" title="Lakeview M1">902</td><td></td><td class="n" title="Lakeview M2">904</td><td class="total">2</td></tr>
</tbody></table>`;

const TEXT = ["Program\tRed\tRed\tWhite\tWhite\tTotal", "Strength\tstr\tweak\tstr\tweak", "Riverside\t901\t\t903\t\t3", "\t\t\t\t905", "Lakeview\t\t902\t\t904\t2"].join("\n");

const byNumber = (teams: Array<{ number: string }>) => [...teams].sort((a, b) => a.number.localeCompare(b.number));

describe("parseSnakeChart", () => {
    it("reads brackets and names from the table HTML, including continuation rows", () => {
        expect(byNumber(parseSnakeChart(HTML).teams)).toEqual([
            { number: "901", name: "Riverside M1", startingBracket: "Red Strong" },
            { number: "902", name: "Lakeview M1", startingBracket: "Red Weak" },
            { number: "903", name: "Riverside M2", startingBracket: "White Strong" },
            { number: "904", name: "Lakeview M2", startingBracket: "White Weak" },
            { number: "905", name: "Riverside M3", startingBracket: "White Weak" },
        ]);
    });

    it("reads a tab-separated paste of the same table", () => {
        const teams = byNumber(parseSnakeChart(TEXT).teams);
        expect(teams.map((t) => `${t.number}:${t.startingBracket}`)).toEqual(["901:Red Strong", "902:Red Weak", "903:White Strong", "904:White Weak", "905:White Weak"]);
        expect(teams[0].name).toBeNull();
    });

    it("reports team numbers outside any labelled column", () => {
        const result = parseSnakeChart("Riverside\t901");
        expect(result.teams).toEqual([]);
        expect(result.unparsed).toEqual(["901"]);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test __tests__/lib/ratings/import-snake.test.ts`
Expected: FAIL, because `parseSnakeChart` is not exported.

- [ ] **Step 3: Write `lib/ratings/import/snake-chart.ts`**

```ts
/**
 * Reads a snake chart (spec, Import): a "Program" header row (colour per column)
 * and a "Strength" header row (str/mid/weak), then one row per program whose cells
 * hold team numbers. Continuation rows (a program with more teams than one row)
 * have no program cell. Accepts the table's HTML or a tab-separated paste of it.
 * Header rows reset the columns, so a page with several age-group tables works.
 */
import { decodeEntities, looksLikeHtml } from "./html";

export interface ParsedSnakeTeam {
    number: string;
    name: string | null;
    startingBracket: string;
}

export interface ParsedSnakeChart {
    teams: ParsedSnakeTeam[];
    unparsed: string[];
}

interface Row {
    /** The row's leading label cell, or null for an HTML continuation row. */
    label: string | null;
    /** Positional data cells after the label. */
    cells: Array<{ text: string; title: string | null }>;
}

const STRENGTH: Record<string, string> = { str: "Strong", strong: "Strong", mid: "Mid", middle: "Mid", weak: "Weak" };
const NUMBER = /^\d{3}$/;

const stripTags = (html: string) => decodeEntities(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

function htmlRows(html: string): Row[] {
    const rows: Row[] = [];
    for (const tr of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
        const cells = [...tr[1].matchAll(/<(t[hd])\b([^>]*)>([\s\S]*?)<\/\1>/gi)].map((m) => ({
            kind: m[1].toLowerCase(),
            text: stripTags(m[3]),
            title: (() => {
                const t = /\btitle\s*=\s*"([^"]*)"/i.exec(m[2]);
                return t ? decodeEntities(t[1]).trim() || null : null;
            })(),
        }));
        if (cells.length === 0) continue;
        if (cells[0].kind === "th") rows.push({ label: cells[0].text, cells: cells.slice(1).map(({ text, title }) => ({ text, title })) });
        else rows.push({ label: null, cells: cells.map(({ text, title }) => ({ text, title })) });
    }
    return rows;
}

function textRows(text: string): Row[] {
    return text
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0)
        .map((line) => {
            const cells = line.split("\t").map((cell) => cell.replace(/\s+/g, " ").trim());
            return { label: cells[0], cells: cells.slice(1).map((cell) => ({ text: cell, title: null })) };
        });
}

export function parseSnakeChart(input: string): ParsedSnakeChart {
    const rows = looksLikeHtml(input) ? htmlRows(input) : textRows(input);
    const teams: ParsedSnakeTeam[] = [];
    const unparsed: string[] = [];
    let colours: string[] = [];
    let labels: string[] = [];
    for (const row of rows) {
        const label = row.label?.toLowerCase() ?? null;
        if (label === "program") {
            colours = row.cells.map((cell) => cell.text);
            labels = [];
            continue;
        }
        if (label === "strength") {
            labels = row.cells.map((cell, k) => `${colours[k] ?? ""} ${STRENGTH[cell.text.toLowerCase()] ?? cell.text}`.trim());
            continue;
        }
        row.cells.forEach((cell, k) => {
            if (!NUMBER.test(cell.text)) return;
            const bracket = labels[k];
            if (!bracket) {
                unparsed.push(cell.text);
                return;
            }
            teams.push({ number: cell.text, name: cell.title, startingBracket: bracket });
        });
    }
    return { teams, unparsed };
}
```

- [ ] **Step 4: Add `export * from "./snake-chart";` to `lib/ratings/import/index.ts`**

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun run test __tests__/lib/ratings/import-snake.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/ratings/import __tests__/lib/ratings/import-snake.test.ts
git commit -m "feat(rankings): parse pasted or saved snake charts"
```

---

### Task 6: `openleague.rankings` v1 document, merge and file reading

**Files:**
- Create: `lib/rankings-document/document.ts`, `lib/rankings-document/merge.ts`, `lib/rankings-document/file.ts`, `lib/rankings-document/index.ts`
- Test: `__tests__/lib/rankings-document/document.test.ts`, `__tests__/lib/rankings-document/merge.test.ts`

**Interfaces:**
- Consumes: `RatingGame`, `RatingTeam`, `RatingMethod` and `CSHL_8U_METHOD` (Task 1), plus `ParsedSchedule` and `ParsedSnakeChart` (Tasks 4–5).
- Produces:
  - `RANKINGS_FORMAT`, `RANKINGS_VERSION`, `MAX_RANKINGS_FILE_BYTES`
  - Message constants: `NOT_RANKINGS_MESSAGE`, `NEWER_RANKINGS_MESSAGE`, `INVALID_RANKINGS_MESSAGE`, `RANKINGS_FILE_TOO_LARGE_MESSAGE`
  - Types: `RankingsDocument`, `RankingsGame`, `RankingsTeam`, `RankingsError { code: "not-rankings" | "newer-version" | "invalid"; message: string; issues?: string[] }`, `ParseRankingsResult = { ok: true; doc: RankingsDocument } | { ok: false; error: RankingsError }`
  - `parseRankings(raw: unknown): ParseRankingsResult`
  - `createRankingsDocument(input: { title: string; method?: RatingMethod }): RankingsDocument`
  - `serializeRankings(doc): string` and `rankingsFileName(doc): string`
  - `toRatingInputs(doc): { games: RatingGame[]; teams: RatingTeam[] }`
  - `gameKeys(games): string[]`
  - `GameConflict { key: string; existing: RankingsGame; incoming: RankingsGame }`
  - `MergeSummary { added: number; updated: number; unchanged: number; conflicts: GameConflict[] }`
  - `mergeSchedule(doc, parsed: ParsedSchedule): { doc: RankingsDocument; summary: MergeSummary }`
  - `resolveConflict(doc, conflict, choice: "existing" | "incoming"): RankingsDocument`
  - `applySnakeChart(doc, chart: ParsedSnakeChart): { doc: RankingsDocument; matched: number; ignored: number }`
  - `readRankingsFile(file: File): Promise<ParseRankingsResult>`

- [ ] **Step 1: Write the failing document test**

```ts
// __tests__/lib/rankings-document/document.test.ts
import { describe, expect, it } from "vitest";
import {
    NEWER_RANKINGS_MESSAGE,
    NOT_RANKINGS_MESSAGE,
    createRankingsDocument,
    parseRankings,
    rankingsFileName,
    serializeRankings,
    toRatingInputs,
    type RankingsDocument,
} from "@/lib/rankings-document";
import { CSHL_8U_METHOD } from "@/lib/ratings";

function sample(): RankingsDocument {
    const doc = createRankingsDocument({ title: "Fall Pre-season" });
    return {
        ...doc,
        teams: [
            { number: "901", name: "Riverside M1", startingBracket: "Red Strong", excluded: false },
            { number: "902", name: "Lakeview M2", startingBracket: null, excluded: false },
        ],
        games: [
            { date: "2026-09-20", time: "09:25", home: "901", away: "902", homeGoals: 3, awayGoals: 1, status: "final", rink: "North Rink" },
            { date: "2026-10-12", time: null, home: "902", away: "901", homeGoals: null, awayGoals: null, status: "scheduled", rink: null },
        ],
        myTeam: "901",
    };
}

describe("parseRankings", () => {
    it("round-trips through JSON", () => {
        const doc = sample();
        const result = parseRankings(JSON.parse(serializeRankings(doc)));
        expect(result).toEqual({ ok: true, doc });
    });

    it("starts from the CSHL 8U preset", () => {
        expect(createRankingsDocument({ title: "x" }).method).toEqual(CSHL_8U_METHOD);
    });

    it("rejects something that isn't a rankings file", () => {
        expect(parseRankings({ format: "openleague.practice-plan" })).toEqual({ ok: false, error: { code: "not-rankings", message: NOT_RANKINGS_MESSAGE } });
    });

    it("rejects a newer version", () => {
        expect(parseRankings({ ...sample(), version: 2 })).toEqual({ ok: false, error: { code: "newer-version", message: NEWER_RANKINGS_MESSAGE } });
    });

    it.each([
        ["a team playing itself", (d: RankingsDocument) => (d.games[0] = { ...d.games[0], away: "901" }), "games.0"],
        ["a final game without goals", (d: RankingsDocument) => (d.games[0] = { ...d.games[0], homeGoals: null }), "games.0"],
        ["a scheduled game with goals", (d: RankingsDocument) => (d.games[1] = { ...d.games[1], homeGoals: 1, awayGoals: 0 }), "games.1"],
        ["an unknown team in a game", (d: RankingsDocument) => (d.games[0] = { ...d.games[0], home: "999" }), "games.0.home"],
        ["a duplicate team number", (d: RankingsDocument) => (d.teams[1] = { ...d.teams[1], number: "901" }), "teams.1.number"],
        ["an unknown my-team", (d: RankingsDocument) => (d.myTeam = "999"), "myTeam"],
        ["a zero level size", (d: RankingsDocument) => (d.method.levels[0] = { name: "R1", size: 0 }), "method.levels.0.size"],
    ])("rejects %s with the field path", (_label, mutate, path) => {
        const doc = structuredClone(sample());
        mutate(doc);
        const result = parseRankings(doc);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.issues?.some((issue) => issue.startsWith(path))).toBe(true);
    });

    it("drops unknown keys", () => {
        const result = parseRankings({ ...sample(), extra: 1, meta: { ...sample().meta, junk: true } });
        expect(result.ok && "extra" in result.doc).toBe(false);
    });
});

describe("helpers", () => {
    it("names the file from the title", () => {
        expect(rankingsFileName(sample())).toBe("fall-pre-season.rankings.json");
    });

    it("feeds only final games to the ratings", () => {
        const inputs = toRatingInputs(sample());
        expect(inputs.games).toEqual([{ home: "901", away: "902", homeGoals: 3, awayGoals: 1 }]);
        expect(inputs.teams[0]).toEqual({ number: "901", name: "Riverside M1", startingBracket: "Red Strong", excluded: false });
    });
});
```

- [ ] **Step 2: Write the failing merge test**

```ts
// __tests__/lib/rankings-document/merge.test.ts
import { describe, expect, it } from "vitest";
import { applySnakeChart, createRankingsDocument, gameKeys, mergeSchedule, resolveConflict } from "@/lib/rankings-document";
import type { ParsedSchedule } from "@/lib/ratings/import";

const parsed = (games: ParsedSchedule["games"]): ParsedSchedule => ({
    games,
    teams: [
        { number: "901", name: "Riverside M1" },
        { number: "902", name: "Lakeview M2" },
    ],
    unparsed: [],
});
const game = (home: string, away: string, homeGoals: number | null, awayGoals: number | null, time: string | null = "09:00", date = "2026-09-20") => ({
    date,
    time,
    home,
    away,
    homeGoals,
    awayGoals,
    rink: null,
});

describe("gameKeys", () => {
    it("keys by date, unordered pair and order within the day", () => {
        expect(gameKeys([game("901", "902", 1, 0, "10:00"), game("902", "901", 2, 0, "09:00")])).toEqual(["2026-09-20|901~902|1", "2026-09-20|901~902|0"]);
    });
});

describe("mergeSchedule", () => {
    it("adds games and teams to an empty document", () => {
        const { doc, summary } = mergeSchedule(createRankingsDocument({ title: "x" }), parsed([game("901", "902", 3, 1), game("902", "901", null, null, null, "2026-10-12")]));
        expect(summary).toEqual({ added: 2, updated: 0, unchanged: 0, conflicts: [] });
        expect(doc.games.map((g) => g.status)).toEqual(["final", "scheduled"]);
        expect(doc.teams.map((t) => t.name)).toEqual(["Riverside M1", "Lakeview M2"]);
    });

    it("fills in a scheduled game's score, even when home and away are listed the other way", () => {
        const first = mergeSchedule(createRankingsDocument({ title: "x" }), parsed([game("901", "902", null, null)])).doc;
        const { doc, summary } = mergeSchedule(first, parsed([game("902", "901", 1, 4)]));
        expect(summary.updated).toBe(1);
        expect(doc.games[0]).toMatchObject({ home: "901", away: "902", homeGoals: 4, awayGoals: 1, status: "final" });
    });

    it("leaves the same score unchanged and never duplicates a game", () => {
        const first = mergeSchedule(createRankingsDocument({ title: "x" }), parsed([game("901", "902", 3, 1)])).doc;
        const { doc, summary } = mergeSchedule(first, parsed([game("902", "901", 1, 3)]));
        expect(summary.unchanged).toBe(1);
        expect(doc.games).toHaveLength(1);
    });

    it("reports a different score as a conflict and keeps the existing one until resolved", () => {
        const first = mergeSchedule(createRankingsDocument({ title: "x" }), parsed([game("901", "902", 3, 1)])).doc;
        const { doc, summary } = mergeSchedule(first, parsed([game("901", "902", 3, 2)]));
        expect(summary.conflicts).toHaveLength(1);
        expect(doc.games[0].awayGoals).toBe(1);
        expect(resolveConflict(doc, summary.conflicts[0], "existing")).toBe(doc);
        expect(resolveConflict(doc, summary.conflicts[0], "incoming").games[0].awayGoals).toBe(2);
    });

    it("keeps a double-header as two games", () => {
        const { doc } = mergeSchedule(createRankingsDocument({ title: "x" }), parsed([game("901", "902", 3, 1, "09:00"), game("901", "902", 2, 2, "11:00")]));
        expect(doc.games).toHaveLength(2);
    });
});

describe("applySnakeChart", () => {
    it("sets brackets for known teams only and keeps their names", () => {
        const base = mergeSchedule(createRankingsDocument({ title: "x" }), parsed([game("901", "902", 3, 1)])).doc;
        const { doc, matched, ignored } = applySnakeChart(base, {
            teams: [
                { number: "901", name: "Riverside Other", startingBracket: "Red Strong" },
                { number: "950", name: null, startingBracket: "White Weak" },
            ],
            unparsed: [],
        });
        expect([matched, ignored]).toEqual([1, 1]);
        expect(doc.teams[0]).toMatchObject({ name: "Riverside M1", startingBracket: "Red Strong" });
        expect(doc.teams).toHaveLength(2);
    });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bun run test __tests__/lib/rankings-document`
Expected: FAIL, with "Failed to resolve import "@/lib/rankings-document"".

- [ ] **Step 4: Write `lib/rankings-document/document.ts`**

```ts
/**
 * The portable rankings document (static rankings spec; ADR-0020 conventions):
 * one versioned JSON format for the static app's storage, export and import.
 * Pure. Parsing strips unknown keys; a newer version is refused with its own
 * message; `snapshots` is reserved for phase 2 and kept as-is.
 */
import { z } from "zod";
import { CSHL_8U_METHOD, type RatingGame, type RatingMethod, type RatingTeam } from "@/lib/ratings";

export const RANKINGS_FORMAT = "openleague.rankings" as const;
export const RANKINGS_VERSION = 1 as const;
export const MAX_RANKINGS_FILE_BYTES = 2_000_000;
const MAX_TEAMS = 400;
const MAX_GAMES = 5000;

export const NOT_RANKINGS_MESSAGE = "This file isn't an OpenLeague rankings file.";
export const NEWER_RANKINGS_MESSAGE = "This rankings file was made by a newer version of OpenLeague. Update to open it.";
export const INVALID_RANKINGS_MESSAGE = "This rankings file has problems and can't be opened.";

const CONTROL = /[\u0000-\u001f\u007f]/g;
const clean = (text: string) => text.replace(CONTROL, "").trim();

const requiredText = (max: number, label: string) =>
    z
        .string({ message: `${label} must be text` })
        .transform(clean)
        .pipe(z.string().min(1, `${label} is required`).max(max, `${label} must be at most ${max} characters`));

const optionalText = (max: number, label: string) =>
    z
        .string({ message: `${label} must be text` })
        .transform(clean)
        .pipe(z.string().max(max, `${label} must be at most ${max} characters`))
        .nullish()
        .transform((value) => (value ? value : null));

const teamNumber = z.string({ message: "Team number must be text" }).regex(/^[A-Za-z0-9]{1,8}$/, "Team number must be 1–8 letters or digits");
const goals = z.number({ message: "Goals must be a number" }).int("Goals must be whole numbers").min(0).max(99);

const gameSchema = z
    .object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
        time: z
            .string()
            .regex(/^\d{2}:\d{2}$/, "Time must be HH:MM")
            .nullish()
            .transform((value) => value ?? null),
        home: teamNumber,
        away: teamNumber,
        homeGoals: goals.nullish().transform((value) => value ?? null),
        awayGoals: goals.nullish().transform((value) => value ?? null),
        status: z.enum(["final", "scheduled"], { message: "Status must be final or scheduled" }),
        rink: optionalText(100, "Rink"),
    })
    .superRefine((game, ctx) => {
        if (game.home === game.away) ctx.addIssue({ code: "custom", message: "A team can't play itself" });
        const scored = game.homeGoals !== null && game.awayGoals !== null;
        const unscored = game.homeGoals === null && game.awayGoals === null;
        if (game.status === "final" && !scored) ctx.addIssue({ code: "custom", message: "A final game needs both scores" });
        if (game.status === "scheduled" && !unscored) ctx.addIssue({ code: "custom", message: "A scheduled game has no score" });
    });

const teamSchema = z.object({
    number: teamNumber,
    name: requiredText(100, "Team name"),
    startingBracket: optionalText(40, "Starting bracket"),
    excluded: z.boolean().optional().transform((value) => value ?? false),
});

const methodSchema = z.object({
    preset: requiredText(40, "Preset"),
    goalCap: z.number().int().min(1, "Goal cap must be 1–20").max(20, "Goal cap must be 1–20"),
    walkush: z.object({ variant: z.literal("plus-one") }),
    lowConfidenceGames: z.number().int().min(0).max(20),
    levels: z
        .array(z.object({ name: requiredText(20, "Level name"), size: z.number().int().min(1, "Level size must be at least 1").max(200) }))
        .min(1, "Add at least one level")
        .max(20),
});

const rankingsSchema = z
    .object({
        format: z.literal(RANKINGS_FORMAT),
        version: z.literal(RANKINGS_VERSION),
        meta: z.object({
            title: requiredText(100, "Title"),
            ageGroup: optionalText(20, "Age group"),
            seasonLabel: optionalText(20, "Season"),
            source: optionalText(500, "Source"),
        }),
        method: methodSchema,
        teams: z.array(teamSchema).max(MAX_TEAMS, `At most ${MAX_TEAMS} teams`),
        games: z.array(gameSchema).max(MAX_GAMES, `At most ${MAX_GAMES} games`),
        myTeam: teamNumber.nullish().transform((value) => value ?? null),
        snapshots: z.array(z.unknown()).optional().transform((value) => value ?? []),
    })
    .superRefine((doc, ctx) => {
        const seen = new Set<string>();
        doc.teams.forEach((team, i) => {
            if (seen.has(team.number)) ctx.addIssue({ code: "custom", path: ["teams", i, "number"], message: `Team ${team.number} is listed twice` });
            seen.add(team.number);
        });
        doc.games.forEach((game, i) => {
            if (!seen.has(game.home)) ctx.addIssue({ code: "custom", path: ["games", i, "home"], message: `Team ${game.home} isn't in the team list` });
            if (!seen.has(game.away)) ctx.addIssue({ code: "custom", path: ["games", i, "away"], message: `Team ${game.away} isn't in the team list` });
        });
        if (doc.myTeam !== null && !seen.has(doc.myTeam)) ctx.addIssue({ code: "custom", path: ["myTeam"], message: "Your team isn't in the team list" });
    });

export type RankingsDocument = z.output<typeof rankingsSchema>;
export type RankingsGame = RankingsDocument["games"][number];
export type RankingsTeam = RankingsDocument["teams"][number];

export interface RankingsError {
    code: "not-rankings" | "newer-version" | "invalid";
    message: string;
    issues?: string[];
}

export type ParseRankingsResult = { ok: true; doc: RankingsDocument } | { ok: false; error: RankingsError };

export function parseRankings(raw: unknown): ParseRankingsResult {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw) || (raw as { format?: unknown }).format !== RANKINGS_FORMAT) {
        return { ok: false, error: { code: "not-rankings", message: NOT_RANKINGS_MESSAGE } };
    }
    const version = (raw as { version?: unknown }).version;
    if (typeof version === "number" && Number.isInteger(version) && version > RANKINGS_VERSION) {
        return { ok: false, error: { code: "newer-version", message: NEWER_RANKINGS_MESSAGE } };
    }
    const result = rankingsSchema.safeParse(raw);
    if (!result.success) {
        return {
            ok: false,
            error: { code: "invalid", message: INVALID_RANKINGS_MESSAGE, issues: result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) },
        };
    }
    return { ok: true, doc: result.data };
}

export function createRankingsDocument({ title, method = CSHL_8U_METHOD }: { title: string; method?: RatingMethod }): RankingsDocument {
    return {
        format: RANKINGS_FORMAT,
        version: RANKINGS_VERSION,
        meta: { title: clean(title) || "Pre-season rankings", ageGroup: null, seasonLabel: null, source: null },
        method: structuredClone(method),
        teams: [],
        games: [],
        myTeam: null,
        snapshots: [],
    };
}

export function serializeRankings(doc: RankingsDocument): string {
    return `${JSON.stringify(doc, null, 2)}\n`;
}

export function rankingsFileName(doc: RankingsDocument): string {
    const slug = doc.meta.title
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60)
        .replace(/-+$/, "");
    return `${slug || "rankings"}.rankings.json`;
}

export function toRatingInputs(doc: RankingsDocument): { games: RatingGame[]; teams: RatingTeam[] } {
    return {
        games: doc.games
            .filter((game) => game.status === "final")
            .map((game) => ({ home: game.home, away: game.away, homeGoals: game.homeGoals!, awayGoals: game.awayGoals! })),
        teams: doc.teams.map((team) => ({ number: team.number, name: team.name, startingBracket: team.startingBracket, excluded: team.excluded })),
    };
}
```

- [ ] **Step 5: Write `lib/rankings-document/merge.ts`**

```ts
/**
 * Re-import merges (spec, Import and editing). A game's key is its date, the
 * unordered pair of teams, and its order among that pair's games that day.
 * Scores are compared from the existing game's home/away orientation, so a page
 * that lists the matchup the other way round never duplicates or conflicts.
 */
import type { ParsedSchedule, ParsedSnakeChart } from "@/lib/ratings/import";
import { compareTeamNumbers } from "@/lib/ratings";
import type { RankingsDocument, RankingsGame } from "./document";

interface Keyable {
    date: string;
    time: string | null;
    home: string;
    away: string;
}

export function gameKeys(games: readonly Keyable[]): string[] {
    const order = games.map((game, index) => ({ game, index })).sort((a, b) => (a.game.time ?? "").localeCompare(b.game.time ?? "") || a.index - b.index);
    const counts = new Map<string, number>();
    const keys = new Array<string>(games.length);
    for (const { game, index } of order) {
        const pair = [game.home, game.away].sort(compareTeamNumbers).join("~");
        const base = `${game.date}|${pair}`;
        const n = counts.get(base) ?? 0;
        counts.set(base, n + 1);
        keys[index] = `${base}|${n}`;
    }
    return keys;
}

const goalsOf = (game: RankingsGame, team: string) => (team === game.home ? game.homeGoals : game.awayGoals);

/** The incoming game's result, oriented to `like`'s home and away. */
function orientedLike(like: RankingsGame, incoming: RankingsGame): RankingsGame {
    return { ...like, homeGoals: goalsOf(incoming, like.home), awayGoals: goalsOf(incoming, like.away), status: incoming.status };
}

export interface GameConflict {
    key: string;
    existing: RankingsGame;
    incoming: RankingsGame;
}

export interface MergeSummary {
    added: number;
    updated: number;
    unchanged: number;
    conflicts: GameConflict[];
}

export function mergeSchedule(doc: RankingsDocument, parsed: ParsedSchedule): { doc: RankingsDocument; summary: MergeSummary } {
    const games = [...doc.games];
    const index = new Map(gameKeys(games).map((key, i) => [key, i]));
    const summary: MergeSummary = { added: 0, updated: 0, unchanged: 0, conflicts: [] };
    const incomingKeys = gameKeys(parsed.games);

    parsed.games.forEach((p, i) => {
        const incoming: RankingsGame = {
            date: p.date,
            time: p.time,
            home: p.home,
            away: p.away,
            homeGoals: p.homeGoals,
            awayGoals: p.awayGoals,
            status: p.homeGoals === null || p.awayGoals === null ? "scheduled" : "final",
            rink: p.rink,
        };
        if (incoming.status === "scheduled") {
            incoming.homeGoals = null;
            incoming.awayGoals = null;
        }
        const at = index.get(incomingKeys[i]);
        if (at === undefined) {
            games.push(incoming);
            summary.added += 1;
            return;
        }
        const existing = games[at];
        if (incoming.status === "scheduled") {
            summary.unchanged += 1;
            return;
        }
        if (existing.status === "scheduled") {
            games[at] = { ...orientedLike(existing, incoming), time: existing.time ?? incoming.time, rink: existing.rink ?? incoming.rink };
            summary.updated += 1;
            return;
        }
        if (goalsOf(incoming, existing.home) === existing.homeGoals && goalsOf(incoming, existing.away) === existing.awayGoals) {
            summary.unchanged += 1;
            return;
        }
        summary.conflicts.push({ key: incomingKeys[i], existing, incoming });
    });

    const teams = [...doc.teams];
    const known = new Set(teams.map((team) => team.number));
    for (const team of parsed.teams) {
        if (known.has(team.number)) continue;
        known.add(team.number);
        teams.push({ number: team.number, name: team.name, startingBracket: null, excluded: false });
    }
    for (const game of games) {
        for (const number of [game.home, game.away]) {
            if (known.has(number)) continue;
            known.add(number);
            teams.push({ number, name: number, startingBracket: null, excluded: false });
        }
    }
    return { doc: { ...doc, games, teams }, summary };
}

export function resolveConflict(doc: RankingsDocument, conflict: GameConflict, choice: "existing" | "incoming"): RankingsDocument {
    if (choice === "existing") return doc;
    const at = gameKeys(doc.games).indexOf(conflict.key);
    if (at === -1) return doc;
    const games = [...doc.games];
    games[at] = orientedLike(games[at], conflict.incoming);
    return { ...doc, games };
}

export function applySnakeChart(doc: RankingsDocument, chart: ParsedSnakeChart): { doc: RankingsDocument; matched: number; ignored: number } {
    const brackets = new Map(chart.teams.map((team) => [team.number, team.startingBracket]));
    let matched = 0;
    const teams = doc.teams.map((team) => {
        const bracket = brackets.get(team.number);
        if (bracket === undefined) return team;
        matched += 1;
        return { ...team, startingBracket: bracket };
    });
    return { doc: { ...doc, teams }, matched, ignored: chart.teams.length - matched };
}
```

- [ ] **Step 6: Write `lib/rankings-document/file.ts` and `index.ts`**

```ts
// lib/rankings-document/file.ts
/** Reading a chosen rankings file. Size first, then JSON, then parseRankings. Never throws. */
import { MAX_RANKINGS_FILE_BYTES, NOT_RANKINGS_MESSAGE, parseRankings, type ParseRankingsResult } from "./document";

export const RANKINGS_FILE_TOO_LARGE_MESSAGE = `This file is too large to be a rankings file (the limit is ${MAX_RANKINGS_FILE_BYTES / 1_000_000} MB).`;

export async function readRankingsFile(file: File): Promise<ParseRankingsResult> {
    if (file.size > MAX_RANKINGS_FILE_BYTES) return { ok: false, error: { code: "invalid", message: RANKINGS_FILE_TOO_LARGE_MESSAGE } };
    let raw: unknown;
    try {
        raw = JSON.parse(await file.text());
    } catch {
        return { ok: false, error: { code: "not-rankings", message: NOT_RANKINGS_MESSAGE } };
    }
    return parseRankings(raw);
}
```

```ts
// lib/rankings-document/index.ts
/** Portable rankings document (static rankings spec). Pure. */
export * from "./document";
export * from "./merge";
export * from "./file";
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `bun run test __tests__/lib/rankings-document`
Expected: PASS. If a zod issue path assertion fails, print `result.error.issues` and correct the expected path in the test only if the schema's path is the more precise one (for example `games.0.home` rather than `games.0`).

- [ ] **Step 8: Commit**

```bash
git add lib/rankings-document __tests__/lib/rankings-document
git commit -m "feat(rankings): portable openleague.rankings v1 document and merge"
```

---

### Task 7: Portability guard and ADR-0021

**Files:**
- Modify: `eslint.config.mjs` (the `adr-0020/portable-practice-planner` block's `files`)
- Modify: `__tests__/lib/planner-store/portability.test.ts` (`ENTRIES`)
- Create: `docs/adr/0021-compute-placement-ratings-client-side-from-public-results.md`

**Interfaces:** none (guard only).

- [ ] **Step 1: Add the new modules to the ESLint portability block.** In `eslint.config.mjs`, inside `files:` of the block named `adr-0020/portable-practice-planner`, add after the `lib/plan-document` line:

```js
      `lib/ratings/**/${SOURCE_GLOB}`,
      `lib/rankings-document/**/${SOURCE_GLOB}`,
```

- [ ] **Step 2: Add the entries to the transitive portability test.** In `__tests__/lib/planner-store/portability.test.ts`, add to `ENTRIES` after `"lib/planner-store/index.ts",`:

```ts
    "lib/ratings/index.ts",
    "lib/ratings/import/index.ts",
    "lib/rankings-document/index.ts",
```

- [ ] **Step 3: Run the guard**

Run: `bun run test __tests__/lib/planner-store/portability.test.ts && bunx eslint lib/ratings lib/rankings-document`
Expected: PASS, and no lint errors.

- [ ] **Step 4: Scaffold and write the ADR**

Run: `bun run adr:new "Compute placement ratings client-side from public results"`
Expected: it creates `docs/adr/0021-compute-placement-ratings-client-side-from-public-results.md`. If adrkit picks another number or filename, use the one it prints.

Replace the file's contents with:

```markdown
---
schemaVersion: 0.1.0
id: "0021"
title: "Compute placement ratings client-side from public results"
status: proposed
date: 2026-10-07
created: 2026-10-07
deciders: ["@mbeacom"]
tags: [rankings, static-site, local-first, interchange]
scope: component
reversibility: two-way-door
blastRadius: component
relatesTo: ["0008", "0010", "0020"]
affects:
  - type: path
    pattern: "lib/ratings/**"
    note: The placement-rating calculation and the pasted-page parsers.
  - type: path
    pattern: "lib/rankings-document/**"
    note: The portable openleague.rankings document, its parser and merge.
  - type: path
    pattern: "apps/planner/src/screens/rankings/**"
    note: The static app's rankings screens.
  - type: path
    pattern: "apps/planner/src/store/rankings.ts"
    note: Device-local storage of the rankings document.
provenance:
  authoredBy: agent-drafted
  sourceArtifact: docs/superpowers/specs/2026-10-07-static-rankings-design.md
review:
  tier: async
  tierReason: Adds a second portable document type to the static deployable; sole maintainer reviews.
reviewBy: 2027-04-07
---

# ADR-0021: Compute placement ratings client-side from public results

## Context

Youth hockey leagues place teams into divisions after a pre-season. They use
ratings built from published game results; CSHL calls its rating "RPI" and
publishes the results but not the full method. Coaches want to see where their
team stands, why, and what a remaining game could change. Leagues need a
transparent, reproducible replacement for spreadsheet ratings.

The hosted platform deliberately withholds win/loss records below the
score-recording age (FR-026, `lib/actions/placements.ts`). 8U, where this need
is sharpest, is below that threshold. League sites are third-party pages whose
structure changes and whose terms may not allow automated collection.

## Decision

We will compute placement ratings entirely on the user's device in the static
app (ADR-0020's deployable). Data comes only from text or files the user pastes
or chooses. We will exchange the data as a portable, versioned
`openleague.rankings` document that follows ADR-0020's conventions (format
discriminant, strict parser, newer-version refusal).

- The calculation (`lib/ratings`) is pure and parameterised by a `RatingMethod`. League rules are presets, never hard-coded.
- The app makes no network request to league or third-party sites.
- Placement ratings for ages below the score-recording threshold stay off the hosted platform.

## Consequences

- Coaches get the tool with no account, and nothing about their league leaves the device unless they export it.
- Import depends on the shape of pasted page text, so parser drift is fixed in code, not by a server.
- A second document type now exists, so a shared storage connector (Drive/OneDrive) can be designed against two real consumers.

## Alternatives considered

- **Hosted league feature.** Rejected for now: it conflicts with FR-026 for sub-threshold ages, and it would require accounts for a one-coach task.
- **Fetching or scraping league pages.** Rejected: browsers block cross-origin reads, page structure changes, and site terms may forbid it.
- **Hard-coding CSHL's formula.** Rejected: other leagues differ, and CSHL's Walkush component is unpublished, so it is approximated and labelled.

## What would make this wrong

- A league publishes a machine-readable results API with permissive terms. Fetching would then be better than pasting.
- FR-026 changes for placement contexts, or a league asks to publish ratings through the hosted platform.
```

- [ ] **Step 5: Validate the corpus**

Run: `bun run adr:lint && bun run adr:check-integrity`
Expected: both pass. If the linter rejects a field, adjust it to match `docs/adr/0020-*.md`, which passes.

- [ ] **Step 6: Commit**

```bash
git add eslint.config.mjs __tests__/lib/planner-store/portability.test.ts docs/adr/0021-*.md
git commit -m "docs(adr): 0021 compute placement ratings client-side; guard portability"
```

---

### Task 8: Rankings storage in the static store

**Files:**
- Create: `apps/planner/src/store/rankings.ts`
- Modify: `apps/planner/src/store/records.ts` (add `META_RANKINGS`)
- Modify: `apps/planner/src/store/types.ts` (extend `LocalPlannerStore`)
- Modify: `apps/planner/src/store/local-store.ts` (spread `createRankingsOps(ctx)`)
- Test: `__tests__/apps/planner/local-store.rankings.test.ts`

**Interfaces:**
- Consumes: `parseRankings` and `RankingsDocument` (Task 6), plus `StoreContext`, `attempt`, `ok` and `write` (`apps/planner/src/store/shared.ts`).
- Produces: `RankingsOps`, which `LocalPlannerStore` now extends:
  - `getRankings(): Promise<ActionResult<RankingsDocument | null>>`
  - `saveRankings(doc: RankingsDocument): Promise<ActionResult<RankingsDocument>>`
  - `clearRankings(): Promise<ActionResult<null>>`
- Message constants: `RANKINGS_LOAD_FAILED`, `RANKINGS_SAVE_FAILED`, `RANKINGS_DAMAGED`.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/apps/planner/local-store.rankings.test.ts
import { describe, expect, it } from "vitest";
import { createLocalPlannerStore } from "@/apps/planner/src/store/local-store";
import { META_RANKINGS } from "@/apps/planner/src/store/records";
import { RANKINGS_DAMAGED } from "@/apps/planner/src/store/rankings";
import { createRankingsDocument } from "@/lib/rankings-document";
import { REPOS, openHarness } from "./store-harness";

describe.each(REPOS)("rankings on %s", (_name, open) => {
    it("starts empty, saves, reads back and clears", async () => {
        const { repo, options } = await openHarness(open);
        const store = createLocalPlannerStore(repo, options);
        expect(await store.getRankings()).toEqual({ success: true, data: null });

        const doc = { ...createRankingsDocument({ title: "Fall" }), teams: [{ number: "901", name: "Riverside M1", startingBracket: null, excluded: false }] };
        const saved = await store.saveRankings(doc);
        expect(saved).toEqual({ success: true, data: doc });
        expect(await store.getRankings()).toEqual({ success: true, data: doc });

        expect(await store.clearRankings()).toEqual({ success: true, data: null });
        expect(await store.getRankings()).toEqual({ success: true, data: null });
    });

    it("refuses an invalid document with the first issue", async () => {
        const { repo, options } = await openHarness(open);
        const store = createLocalPlannerStore(repo, options);
        const bad = { ...createRankingsDocument({ title: "Fall" }), myTeam: "999" };
        const result = await store.saveRankings(bad);
        expect(result.success).toBe(false);
        if (!result.success) expect(result.error).toContain("Your team isn't in the team list");
    });

    it("reports a damaged saved record instead of crashing", async () => {
        const { repo, options } = await openHarness(open);
        await repo.write((tx) => tx.putMeta(META_RANKINGS, { format: "openleague.rankings", version: 1, junk: true }));
        const store = createLocalPlannerStore(repo, options);
        expect(await store.getRankings()).toEqual({ success: false, error: RANKINGS_DAMAGED });
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test __tests__/apps/planner/local-store.rankings.test.ts`
Expected: FAIL, because `META_RANKINGS` and `RANKINGS_DAMAGED` are not exported.

- [ ] **Step 3: Add the meta key.** In `apps/planner/src/store/records.ts`, after `export const META_TEAM_PROFILE = "teamProfile";`, add:

```ts
/** The rankings document (static rankings spec): one per device, in the meta store, so no schema bump. */
export const META_RANKINGS = "rankings";
```

- [ ] **Step 4: Write `apps/planner/src/store/rankings.ts`**

```ts
/**
 * Rankings storage (static rankings spec): one device-level openleague.rankings
 * document in the meta store. Validated on write; a record that fails parsing
 * on read is reported (the screen offers "Start over"), never thrown.
 */
import type { ActionResult } from "@/lib/planner-store";
import { parseRankings, type RankingsDocument } from "@/lib/rankings-document";
import { META_RANKINGS } from "./records";
import { attempt, ok, write, type StoreContext } from "./shared";

export const RANKINGS_LOAD_FAILED = "Couldn't load your rankings. Please try again.";
export const RANKINGS_SAVE_FAILED = "Couldn't save your rankings. Please try again.";
export const RANKINGS_DAMAGED = "Your saved rankings can't be read. Start over by importing the schedule again.";

export interface RankingsOps {
    getRankings: () => Promise<ActionResult<RankingsDocument | null>>;
    saveRankings: (doc: RankingsDocument) => Promise<ActionResult<RankingsDocument>>;
    clearRankings: () => Promise<ActionResult<null>>;
}

export function createRankingsOps(ctx: StoreContext): RankingsOps {
    return {
        getRankings: () =>
            attempt(RANKINGS_LOAD_FAILED, async () => {
                const raw = await ctx.repo.read((tx) => tx.getMeta(META_RANKINGS));
                if (raw === undefined || raw === null) return ok(null);
                const parsed = parseRankings(raw);
                return parsed.ok ? ok(parsed.doc) : { success: false, error: RANKINGS_DAMAGED };
            }),

        saveRankings: (doc) =>
            attempt(RANKINGS_SAVE_FAILED, async () => {
                const parsed = parseRankings(doc);
                if (!parsed.ok) return { success: false, error: parsed.error.issues?.[0] ?? parsed.error.message };
                await write(ctx, (tx) => tx.putMeta(META_RANKINGS, parsed.doc));
                return ok(parsed.doc);
            }),

        clearRankings: () =>
            attempt(RANKINGS_SAVE_FAILED, async () => {
                await write(ctx, (tx) => tx.putMeta(META_RANKINGS, null));
                return ok(null);
            }),
    };
}
```

- [ ] **Step 5: Extend the store type.** In `apps/planner/src/store/types.ts`, add the import `import type { RankingsOps } from "./rankings";` and change the declaration line to:

```ts
export interface LocalPlannerStore extends PlannerStore, RankingsOps {
```

- [ ] **Step 6: Wire the store.** In `apps/planner/src/store/local-store.ts`, add `import { createRankingsOps } from "./rankings";` and change the return statement to:

```ts
    return { ...createLibraryOps(ctx), ...createSessionOps(ctx), ...createTeamProfileOps(ctx), ...createRankingsOps(ctx) };
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `bun run test __tests__/apps/planner/local-store.rankings.test.ts && bun run type-check`
Expected: PASS (6 tests, 3 per repo); type-check clean.

- [ ] **Step 8: Commit**

```bash
git add apps/planner/src/store __tests__/apps/planner/local-store.rankings.test.ts
git commit -m "feat(rankings): store the rankings document on the device"
```

---

### Task 9: Routes, nav item and screen scaffolding

**Files:**
- Modify: `apps/planner/src/routes.ts`, `apps/planner/src/screens/AppShell.tsx`, `apps/planner/src/App.tsx`
- Create: `apps/planner/src/screens/rankings/useRankingsDoc.ts`, `apps/planner/src/screens/rankings/display.tsx`
- Create (stubs that Tasks 10–13 replace): `RankingsScreen.tsx`, `RankingsImportScreen.tsx`, `RankingsSetupScreen.tsx`, `RankingsTeamScreen.tsx`, `RankingsWhatIfScreen.tsx` in `apps/planner/src/screens/rankings/`
- Modify: `__tests__/apps/planner/routes.test.ts`

**Interfaces:**
- Produces:
  - Routes: `staticRoutes.rankings()` → `"#/rankings"`, `.rankingsImport()` → `"#/rankings/import"`, `.rankingsSetup()` → `"#/rankings/setup"`, `.rankingsWhatIf()` → `"#/rankings/what-if"`, `.rankingsTeam(number)` → `"#/rankings/team/<number>"`
  - `StaticRoute` members: `{ name: "rankings" } | { name: "rankingsImport" } | { name: "rankingsSetup" } | { name: "rankingsWhatIf" } | { name: "rankingsTeam"; number: string }`
  - `NavSection` gains `"rankings"`
  - `useRankingsDoc(store)` returns `{ state: RankingsState; save(doc): Promise<ActionResult<RankingsDocument>>; clear(): Promise<ActionResult<null>> }`, where `RankingsState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; doc: RankingsDocument | null }`
  - From `display.tsx`: `formatRating(value, digits?)`, `formatSigned(value)`, `MovementLabel`, `levelBandColor(theme, index, count)`, and `RankingsStatus` (loading, error and empty views, with `START_OVER_LABEL` and `NO_RANKINGS_MESSAGE`)
  - Each screen's props: `{ store: LocalPlannerStore }`, plus `number: string` for the team screen

- [ ] **Step 1: Add route tests.** In `__tests__/apps/planner/routes.test.ts`, add these rows to the `it.each` table in `describe("matchRoute")`:

```ts
        ["#/rankings", { name: "rankings" }],
        ["#/rankings/", { name: "rankings" }],
        ["#/rankings/import", { name: "rankingsImport" }],
        ["#/rankings/setup", { name: "rankingsSetup" }],
        ["#/rankings/what-if", { name: "rankingsWhatIf" }],
        ["#/rankings/team/903", { name: "rankingsTeam", number: "903" }],
        ["#/rankings/team", { name: "notFound" }],
        ["#/rankings/team/903/x", { name: "notFound" }],
        ["#/rankings/nope", { name: "notFound" }],
```

Append this test at the end of the file:

```ts
describe("rankings routes", () => {
    it("builds and matches the team route", () => {
        expect(staticRoutes.rankingsTeam("903")).toBe("#/rankings/team/903");
        expect(matchRoute(staticRoutes.rankingsTeam("903"))).toEqual({ name: "rankingsTeam", number: "903" });
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test __tests__/apps/planner/routes.test.ts`
Expected: FAIL. The rankings rows return `notFound`, and `rankingsTeam` doesn't exist yet.

- [ ] **Step 3: Update `apps/planner/src/routes.ts`.** Add these members to the `StaticRoutes` interface:

```ts
    rankings(): string;
    rankingsImport(): string;
    rankingsSetup(): string;
    rankingsWhatIf(): string;
    rankingsTeam(number: string): string;
```

Add to `staticRoutes`:

```ts
    rankings: () => "#/rankings",
    rankingsImport: () => "#/rankings/import",
    rankingsSetup: () => "#/rankings/setup",
    rankingsWhatIf: () => "#/rankings/what-if",
    rankingsTeam: (number) => `#/rankings/team/${enc(number)}`,
```

Add these members to the `StaticRoute` union, before `| { name: "notFound" }`:

```ts
    | { name: "rankings" }
    | { name: "rankingsImport" }
    | { name: "rankingsSetup" }
    | { name: "rankingsWhatIf" }
    | { name: "rankingsTeam"; number: string }
```

In `matchRoute`, before the final `return NOT_FOUND;`, add:

```ts
    if (section === "rankings") {
        if (second === undefined) return { name: "rankings" };
        if (third === undefined) {
            if (second === "import") return { name: "rankingsImport" };
            if (second === "setup") return { name: "rankingsSetup" };
            if (second === "what-if") return { name: "rankingsWhatIf" };
            return NOT_FOUND;
        }
        if (second === "team") {
            const number = decodeId(third);
            return number ? { name: "rankingsTeam", number } : NOT_FOUND;
        }
        return NOT_FOUND;
    }
```

Change the `NavSection` type and `navSection` function:

```ts
export type NavSection = "practices" | "library" | "import" | "rankings";
```

Add to the `switch` in `navSection`, before `case "notFound":`:

```ts
        case "rankings":
        case "rankingsImport":
        case "rankingsSetup":
        case "rankingsWhatIf":
        case "rankingsTeam":
            return "rankings";
```

Note: `"#/rankings/team"` has `third === undefined`, `second === "team"`, which falls into the `third === undefined` branch and returns `NOT_FOUND`, as the test expects.

- [ ] **Step 4: Add the nav item.** In `apps/planner/src/screens/AppShell.tsx`, add this entry to `NAV_ITEMS` after the Import entry:

```ts
    { section: "rankings", label: "Rankings", href: staticRoutes.rankings() },
```

- [ ] **Step 5: Write `apps/planner/src/screens/rankings/useRankingsDoc.ts`**

```ts
/** Loads the device's rankings document once and saves through the store (static rankings spec). */
import { useCallback, useEffect, useState } from "react";
import type { ActionResult } from "@/lib/planner-store";
import type { RankingsDocument } from "@/lib/rankings-document";
import type { RankingsOps } from "../../store/rankings";

export type RankingsState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; doc: RankingsDocument | null };

export function useRankingsDoc(store: RankingsOps): {
    state: RankingsState;
    save: (doc: RankingsDocument) => Promise<ActionResult<RankingsDocument>>;
    clear: () => Promise<ActionResult<null>>;
} {
    const [state, setState] = useState<RankingsState>({ status: "loading" });
    useEffect(() => {
        let live = true;
        void store.getRankings().then((result) => {
            if (!live) return;
            setState(result.success ? { status: "ready", doc: result.data } : { status: "error", message: result.error });
        });
        return () => {
            live = false;
        };
    }, [store]);
    const save = useCallback(
        async (doc: RankingsDocument) => {
            const result = await store.saveRankings(doc);
            if (result.success) setState({ status: "ready", doc: result.data });
            return result;
        },
        [store],
    );
    const clear = useCallback(async () => {
        const result = await store.clearRankings();
        if (result.success) setState({ status: "ready", doc: null });
        return result;
    }, [store]);
    return { state, save, clear };
}
```

- [ ] **Step 6: Write `apps/planner/src/screens/rankings/display.tsx`**

```tsx
/** Shared rankings display pieces: number formats, movement (icon + word), level bands, status views. */
import { Alert, Box, Button, CircularProgress, Stack, Typography } from "@mui/material";
import { alpha, type Theme } from "@mui/material/styles";
import type { Movement } from "@/lib/ratings";
import { staticRoutes } from "../../routes";
import type { RankingsState } from "./useRankingsDoc";

export const NO_RANKINGS_MESSAGE = "No rankings yet. Paste your league's schedule page to get started.";
export const START_OVER_LABEL = "Start over";
export const COMPONENTS_WARNING =
    "Some teams never played anyone connected to the rest, so ratings can't be compared across those groups.";
export const NOT_CONVERGED_WARNING = "The ratings didn't fully settle. Results may shift slightly.";

export function formatRating(value: number | null, digits = 1): string {
    return value === null ? "—" : value.toFixed(digits);
}

export function formatSigned(value: number | null): string {
    if (value === null) return "—";
    const text = Math.abs(value) < 0.05 ? "0.0" : value.toFixed(1);
    return value >= 0.05 ? `+${text}` : text;
}

const MOVEMENT: Record<Movement, { icon: string; word: string }> = {
    up: { icon: "▲", word: "Up" },
    same: { icon: "▬", word: "Same" },
    down: { icon: "▼", word: "Down" },
};

export function MovementLabel({ movement, startingLevel }: { movement: Movement | null; startingLevel: string | null }) {
    if (!movement) return null;
    const { icon, word } = MOVEMENT[movement];
    return (
        <Box component="span" sx={{ whiteSpace: "nowrap", color: "text.secondary" }}>
            <span aria-hidden="true">{icon}</span> {word}
            {startingLevel ? ` from ${startingLevel}` : ""}
        </Box>
    );
}

/** One League Blue ramp: the top level darkest, the bottom lightest (spec, Colour). */
export function levelBandColor(theme: Theme, index: number, count: number): string {
    const strongest = 0.18;
    const weakest = 0.04;
    const t = count <= 1 ? 0 : index / (count - 1);
    return alpha(theme.palette.primary.main, strongest - (strongest - weakest) * t);
}

export function RankingsStatus({ state, onStartOver }: { state: Exclude<RankingsState, { status: "ready" }> | { status: "empty" }; onStartOver: () => void }) {
    if (state.status === "loading") {
        return (
            <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
                <CircularProgress aria-label="Loading rankings" />
            </Box>
        );
    }
    if (state.status === "error") {
        return (
            <Alert
                severity="error"
                action={
                    <Button color="inherit" size="small" onClick={onStartOver} sx={{ minHeight: 44 }}>
                        {START_OVER_LABEL}
                    </Button>
                }
            >
                {state.message}
            </Alert>
        );
    }
    return (
        <Stack spacing={2} sx={{ alignItems: "flex-start", py: 2 }}>
            <Typography>{NO_RANKINGS_MESSAGE}</Typography>
            <Button variant="contained" href={staticRoutes.rankingsImport()} sx={{ minHeight: 44 }}>
                Import schedule
            </Button>
        </Stack>
    );
}
```

- [ ] **Step 7: Create the five screen stubs.** Each file follows this shape. For example, `RankingsScreen.tsx`:

```tsx
import { Typography } from "@mui/material";
import type { LocalPlannerStore } from "../../store/types";

export function RankingsScreen(_props: { store: LocalPlannerStore }) {
    return <Typography component="h1" variant="h5">Rankings</Typography>;
}
```

The others are the same: `RankingsImportScreen` (heading "Import rankings"), `RankingsSetupScreen` ("Rankings setup"), `RankingsWhatIfScreen` ("What-if"), and `RankingsTeamScreen(_props: { store: LocalPlannerStore; number: string })` ("Team").

- [ ] **Step 8: Route the screens.** In `apps/planner/src/App.tsx`, import the five screens from `./screens/rankings/...`. Add these cases to the `RouteView` switch before `default:`:

```tsx
        case "rankings":
            return <RankingsScreen store={store} />;
        case "rankingsImport":
            return <RankingsImportScreen store={store} />;
        case "rankingsSetup":
            return <RankingsSetupScreen store={store} />;
        case "rankingsWhatIf":
            return <RankingsWhatIfScreen store={store} />;
        case "rankingsTeam":
            return <RankingsTeamScreen key={route.number} store={store} number={route.number} />;
```

- [ ] **Step 9: Run the tests and type-check**

Run: `bun run test __tests__/apps/planner/routes.test.ts __tests__/apps/planner/app.test.tsx && bun run type-check`
Expected: PASS. If `app.test.tsx` asserts the exact nav item count or labels, add "Rankings" to that assertion.

- [ ] **Step 10: Commit**

```bash
git add apps/planner/src __tests__/apps/planner/routes.test.ts __tests__/apps/planner/app.test.tsx
git commit -m "feat(rankings): routes, nav item and screen scaffolding"
```

---

### Task 10: Rankings screen (tiles, ladder, table, filters, export)

**Files:**
- Replace: `apps/planner/src/screens/rankings/RankingsScreen.tsx`
- Create: `__tests__/apps/planner/rankings-fixtures.ts`
- Test: `__tests__/apps/planner/rankings-screen.test.tsx`

**Interfaces:**
- Consumes:
  - `useRankingsDoc`, `RankingsStatus`, `MovementLabel`, `formatRating`, `levelBandColor`, `COMPONENTS_WARNING` and `NOT_CONVERGED_WARNING` (Task 9)
  - `composite` (Task 2)
  - `toRatingInputs`, `serializeRankings` and `rankingsFileName` (Task 6)
  - `downloadBlob` (`components/features/practice-planner/export/download.ts`)
- Produces: `sampleRankingsDoc()` in the test fixtures, used by Tasks 11–13, and the exported labels `PICK_TEAM_LABEL`, `LADDER_LABEL`, `TABLE_LABEL` and `EXPORT_LABEL`.

- [ ] **Step 1: Write the fixtures**

```ts
// __tests__/apps/planner/rankings-fixtures.ts
/** Made-up programs (spec R6): never real league data. */
import { createRankingsDocument, type RankingsDocument } from "@/lib/rankings-document";

export function sampleRankingsDoc(overrides: Partial<RankingsDocument> = {}): RankingsDocument {
    const base = createRankingsDocument({
        title: "Fall Pre-season",
        method: { preset: "test", goalCap: 8, walkush: { variant: "plus-one" }, lowConfidenceGames: 3, levels: [{ name: "X", size: 2 }, { name: "Y", size: 2 }] },
    });
    return {
        ...base,
        teams: [
            { number: "901", name: "Riverside M1", startingBracket: "Red Strong", excluded: false },
            { number: "902", name: "Lakeview M2", startingBracket: "Red Strong", excluded: false },
            { number: "903", name: "Hilltop M1", startingBracket: "White Strong", excluded: false },
            { number: "904", name: "Brookside M1", startingBracket: "White Strong", excluded: false },
        ],
        games: [
            { date: "2026-09-20", time: "09:00", home: "901", away: "902", homeGoals: 3, awayGoals: 1, status: "final", rink: null },
            { date: "2026-09-21", time: "09:00", home: "902", away: "903", homeGoals: 4, awayGoals: 1, status: "final", rink: null },
            { date: "2026-09-22", time: "09:00", home: "901", away: "903", homeGoals: 12, awayGoals: 0, status: "final", rink: null },
            { date: "2026-09-23", time: "09:00", home: "904", away: "903", homeGoals: 2, awayGoals: 2, status: "final", rink: null },
            { date: "2026-09-24", time: "09:00", home: "902", away: "904", homeGoals: 3, awayGoals: 2, status: "final", rink: null },
            { date: "2026-10-12", time: "08:00", home: "903", away: "904", homeGoals: null, awayGoals: null, status: "scheduled", rink: "The Pond" },
        ],
        myTeam: "903",
        ...overrides,
    };
}
```

- [ ] **Step 2: Write the failing test**

```tsx
// __tests__/apps/planner/rankings-screen.test.tsx
import { describe, expect, it } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { RankingsScreen } from "@/apps/planner/src/screens/rankings/RankingsScreen";
import { NO_RANKINGS_MESSAGE, START_OVER_LABEL } from "@/apps/planner/src/screens/rankings/display";
import { META_RANKINGS } from "@/apps/planner/src/store/records";
import { memoryStore, renderScreen } from "./render-screen";
import { sampleRankingsDoc } from "./rankings-fixtures";

describe("RankingsScreen", () => {
    it("invites an import when there's nothing saved", async () => {
        const { store } = memoryStore();
        renderScreen(<RankingsScreen store={store} />, store);
        expect(await screen.findByText(NO_RANKINGS_MESSAGE)).toBeInTheDocument();
    });

    it("shows my team's tiles and every team in the ladder", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc());
        renderScreen(<RankingsScreen store={store} />, store);
        expect(await screen.findByText("CSHL-compatible RPI")).toBeInTheDocument();
        expect(screen.getByText(/of 4/)).toBeInTheDocument();
        for (const name of ["Riverside M1", "Lakeview M2", "Hilltop M1", "Brookside M1"]) expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    });

    it("switches to the table with the league's columns", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc());
        renderScreen(<RankingsScreen store={store} />, store);
        fireEvent.click(await screen.findByRole("button", { name: "Table" }));
        for (const column of ["AGD", "SCHED", "Lodin", "Walkush (approx.)", "RPI", "Level"]) expect(screen.getByRole("columnheader", { name: new RegExp(column.replace(/[()]/g, "\\$&")) })).toBeInTheDocument();
    });

    it("filters by team name", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc());
        renderScreen(<RankingsScreen store={store} />, store);
        fireEvent.change(await screen.findByLabelText("Find a team"), { target: { value: "Brook" } });
        expect(screen.queryByRole("link", { name: "Riverside M1" })).not.toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Brookside M1" })).toBeInTheDocument();
    });

    it("offers Start over for a damaged record", async () => {
        const { store, repo } = memoryStore();
        await repo.write((tx) => tx.putMeta(META_RANKINGS, { format: "openleague.rankings", version: 1 }));
        renderScreen(<RankingsScreen store={store} />, store);
        fireEvent.click(await screen.findByRole("button", { name: START_OVER_LABEL }));
        expect(await screen.findByText(NO_RANKINGS_MESSAGE)).toBeInTheDocument();
    });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `bun run test __tests__/apps/planner/rankings-screen.test.tsx`
Expected: FAIL. The stub has no empty-state text.

- [ ] **Step 4: Write `RankingsScreen.tsx`**

```tsx
/**
 * Rankings (static rankings spec, Screens): my-team tiles, a ladder with level
 * bands (a compact list on phones), a sortable table with every column, filters
 * and export. Movement is always an icon plus a word.
 */
import { useMemo, useState } from "react";
import {
    Alert,
    Box,
    Button,
    Checkbox,
    Chip,
    FormControlLabel,
    MenuItem,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TableSortLabel,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Tooltip,
    Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { downloadBlob } from "@/components/features/practice-planner/export/download";
import { composite, type RatingsResult, type TeamRating } from "@/lib/ratings";
import { rankingsFileName, serializeRankings, toRatingInputs, type RankingsDocument } from "@/lib/rankings-document";
import { staticRoutes } from "../../routes";
import type { LocalPlannerStore } from "../../store/types";
import { COMPONENTS_WARNING, MovementLabel, NOT_CONVERGED_WARNING, RankingsStatus, formatRating, formatSigned, levelBandColor } from "./display";
import { useRankingsDoc } from "./useRankingsDoc";

export const PICK_TEAM_LABEL = "Pick your team";
export const LADDER_LABEL = "Ladder";
export const TABLE_LABEL = "Table";
export const EXPORT_LABEL = "Export rankings file";

type SortKey = "rank" | "name" | "games" | "agd" | "sched" | "lodin" | "walkush" | "rpi";
const COLUMNS: Array<{ key: SortKey; label: string; numeric: boolean }> = [
    { key: "rank", label: "Rank", numeric: true },
    { key: "name", label: "Team", numeric: false },
    { key: "games", label: "GP", numeric: true },
    { key: "agd", label: "AGD", numeric: true },
    { key: "sched", label: "SCHED", numeric: true },
    { key: "lodin", label: "Lodin", numeric: true },
    { key: "walkush", label: "Walkush (approx.)", numeric: true },
    { key: "rpi", label: "RPI", numeric: true },
];

export function useRatings(doc: RankingsDocument): RatingsResult {
    return useMemo(() => {
        const { games, teams } = toRatingInputs(doc);
        return composite(games, teams, doc.method);
    }, [doc]);
}

function opponentsOf(doc: RankingsDocument, team: string | null): Set<string> {
    const set = new Set<string>();
    if (!team) return set;
    for (const game of doc.games) {
        if (game.home === team) set.add(game.away);
        if (game.away === team) set.add(game.home);
    }
    return set;
}

function Tiles({ row, total }: { row: TeamRating; total: number }) {
    const tiles = [
        { label: "CSHL-compatible RPI", value: formatRating(row.rpi) },
        { label: "Rank", value: row.rank === null ? "—" : `${row.rank} of ${total}` },
        { label: "Suggested level", value: row.level ?? "—", extra: <MovementLabel movement={row.movement} startingLevel={row.startingLevel} /> },
    ];
    return (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" }, gap: 1.5 }}>
            {tiles.map((tile) => (
                <Paper key={tile.label} variant="outlined" sx={{ p: 2, borderRadius: 1 }}>
                    <Typography variant="overline" color="text.secondary">
                        {tile.label}
                    </Typography>
                    <Typography sx={{ fontSize: { xs: 28, sm: 34 }, fontWeight: 800, lineHeight: 1.1 }}>{tile.value}</Typography>
                    {tile.extra}
                </Paper>
            ))}
        </Box>
    );
}

function Ladder({ rows, doc, myTeam }: { rows: TeamRating[]; doc: RankingsDocument; myTeam: string | null }) {
    const theme = useTheme();
    const levelIndex = new Map(doc.method.levels.map((level, i) => [level.name, i]));
    let previous: string | undefined;
    return (
        <Stack component="ol" sx={{ listStyle: "none", p: 0, m: 0 }} aria-label="Rankings ladder">
            {rows.map((row) => {
                const group = row.rank === null ? "unranked" : row.level === null ? "below" : `level:${row.level}`;
                const header = group !== previous ? (row.rank === null ? "Not ranked" : row.level ?? "Below the last level") : null;
                previous = group;
                const band = row.level === null ? "transparent" : levelBandColor(theme, levelIndex.get(row.level) ?? 0, doc.method.levels.length);
                const mine = row.number === myTeam;
                return (
                    <Box component="li" key={row.number}>
                        {header && (
                            <Typography variant="subtitle2" sx={{ mt: 1.5, px: 1, fontWeight: 800, borderTop: 2, borderColor: "divider" }}>
                                {header}
                            </Typography>
                        )}
                        <Box
                            sx={{
                                display: "grid",
                                gridTemplateColumns: { xs: "2.5rem 1fr auto", sm: "2.5rem minmax(9rem, 14rem) 1fr 3.5rem 8rem" },
                                alignItems: "center",
                                gap: 1,
                                minHeight: 44,
                                px: 1,
                                bgcolor: band,
                                borderLeft: 4,
                                borderColor: mine ? "secondary.main" : "transparent",
                            }}
                        >
                            <Typography sx={{ fontWeight: 700 }}>{row.rank ?? "—"}</Typography>
                            <Box sx={{ minWidth: 0 }}>
                                <Box component="a" href={staticRoutes.rankingsTeam(row.number)} sx={{ color: "text.primary", fontWeight: mine ? 800 : 500 }}>
                                    {row.name}
                                </Box>
                                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                                    {row.number}
                                    {row.startingBracket ? ` · started ${row.startingBracket}` : ""}
                                    {row.excluded ? " · excluded" : ""}
                                </Typography>
                                {row.lowConfidence && row.rank !== null && <Chip size="small" label="Few games" variant="outlined" sx={{ mt: 0.25 }} />}
                            </Box>
                            <Box sx={{ display: { xs: "none", sm: "block" }, position: "relative", height: 10, borderRadius: 5, bgcolor: "action.hover" }}>
                                {row.rpi !== null && (
                                    <Tooltip title={`RPI ${formatRating(row.rpi)} · Lodin ${formatRating(row.lodin)} · Walkush (approx.) ${formatRating(row.walkush, 2)} · ${row.wins}-${row.losses}-${row.ties}`}>
                                        <Box
                                            tabIndex={0}
                                            aria-label={`${row.name} RPI ${formatRating(row.rpi)}`}
                                            sx={{
                                                position: "absolute",
                                                top: "50%",
                                                left: `${(row.rpi / 20) * 100}%`,
                                                width: 14,
                                                height: 14,
                                                transform: "translate(-50%, -50%)",
                                                borderRadius: "50%",
                                                bgcolor: mine ? "secondary.main" : "primary.main",
                                                border: 2,
                                                borderColor: "background.paper",
                                            }}
                                        />
                                    </Tooltip>
                                )}
                            </Box>
                            <Typography sx={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{formatRating(row.rpi)}</Typography>
                            <Box sx={{ display: { xs: "none", sm: "block" } }}>
                                <MovementLabel movement={row.movement} startingLevel={row.startingLevel} />
                            </Box>
                        </Box>
                    </Box>
                );
            })}
        </Stack>
    );
}

function sortValue(row: TeamRating, key: SortKey): number | string {
    if (key === "name") return row.name.toLowerCase();
    const value = row[key];
    return value === null ? Number.NEGATIVE_INFINITY : value;
}

function RatingsTable({ rows, cap }: { rows: TeamRating[]; cap: number }) {
    const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "rank", dir: "asc" });
    const sorted = [...rows].sort((a, b) => {
        const x = sortValue(a, sort.key);
        const y = sortValue(b, sort.key);
        const cmp = typeof x === "string" && typeof y === "string" ? x.localeCompare(y) : (x as number) - (y as number);
        return sort.dir === "asc" ? cmp : -cmp;
    });
    return (
        <TableContainer component={Paper} variant="outlined">
            <Table size="small" aria-label={`Ratings table, margins capped at ${cap}`}>
                <TableHead>
                    <TableRow>
                        {COLUMNS.map((column) => (
                            <TableCell key={column.key} align={column.numeric ? "right" : "left"} sortDirection={sort.key === column.key ? sort.dir : false}>
                                <TableSortLabel
                                    active={sort.key === column.key}
                                    direction={sort.key === column.key ? sort.dir : "asc"}
                                    onClick={() => setSort((s) => ({ key: column.key, dir: s.key === column.key && s.dir === "asc" ? "desc" : "asc" }))}
                                >
                                    {column.label}
                                </TableSortLabel>
                            </TableCell>
                        ))}
                        <TableCell>W-L-T</TableCell>
                        <TableCell>Level</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {sorted.map((row) => (
                        <TableRow key={row.number}>
                            <TableCell align="right">{row.rank ?? "—"}</TableCell>
                            <TableCell>
                                <a href={staticRoutes.rankingsTeam(row.number)}>{row.name}</a>
                            </TableCell>
                            <TableCell align="right">{row.games}</TableCell>
                            <TableCell align="right">{formatSigned(row.agd)}</TableCell>
                            <TableCell align="right">{formatSigned(row.sched)}</TableCell>
                            <TableCell align="right">{formatSigned(row.lodin)}</TableCell>
                            <TableCell align="right">{formatRating(row.walkush, 2)}</TableCell>
                            <TableCell align="right">{formatRating(row.rpi)}</TableCell>
                            <TableCell>{`${row.wins}-${row.losses}-${row.ties}`}</TableCell>
                            <TableCell>{row.level ?? "—"}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    );
}

function Ready({ doc, save }: { doc: RankingsDocument; save: (doc: RankingsDocument) => Promise<unknown> }) {
    const result = useRatings(doc);
    const [view, setView] = useState<"ladder" | "table">("ladder");
    const [query, setQuery] = useState("");
    const [bracket, setBracket] = useState("");
    const [onlyOpponents, setOnlyOpponents] = useState(false);
    const brackets = [...new Set(doc.teams.map((team) => team.startingBracket).filter((b): b is string => !!b))];
    const opponents = opponentsOf(doc, doc.myTeam);
    const rows = result.teams.filter(
        (row) =>
            (!query || row.name.toLowerCase().includes(query.toLowerCase()) || row.number.includes(query)) &&
            (!bracket || row.startingBracket === bracket) &&
            (!onlyOpponents || opponents.has(row.number) || row.number === doc.myTeam),
    );
    const mine = doc.myTeam ? result.byNumber.get(doc.myTeam) : undefined;

    return (
        <Stack spacing={2}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}>
                <Typography component="h1" variant="h5" sx={{ fontWeight: 800 }}>
                    {doc.meta.title}
                </Typography>
                <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
                    <Button href={staticRoutes.rankingsWhatIf()} variant="contained" sx={{ minHeight: 44 }}>
                        What-if
                    </Button>
                    <Button href={staticRoutes.rankingsImport()} sx={{ minHeight: 44 }}>
                        Update from schedule
                    </Button>
                    <Button href={staticRoutes.rankingsSetup()} sx={{ minHeight: 44 }}>
                        Setup
                    </Button>
                    <Button
                        sx={{ minHeight: 44 }}
                        onClick={() => downloadBlob(new Blob([serializeRankings(doc)], { type: "application/json" }), rankingsFileName(doc))}
                    >
                        {EXPORT_LABEL}
                    </Button>
                </Stack>
            </Stack>

            {result.componentCount > 1 && <Alert severity="warning">{COMPONENTS_WARNING}</Alert>}
            {!result.converged && <Alert severity="info">{NOT_CONVERGED_WARNING}</Alert>}

            {mine ? (
                <Tiles row={mine} total={result.ranked.length} />
            ) : (
                <TextField
                    select
                    label={PICK_TEAM_LABEL}
                    value=""
                    onChange={(event) => void save({ ...doc, myTeam: event.target.value })}
                    sx={{ maxWidth: 360 }}
                >
                    {doc.teams.map((team) => (
                        <MenuItem key={team.number} value={team.number}>
                            {team.number} {team.name}
                        </MenuItem>
                    ))}
                </TextField>
            )}

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "center" } }}>
                <TextField label="Find a team" value={query} onChange={(e) => setQuery(e.target.value)} size="small" />
                <TextField select label="Starting bracket" value={bracket} onChange={(e) => setBracket(e.target.value)} size="small" sx={{ minWidth: 180 }}>
                    <MenuItem value="">All brackets</MenuItem>
                    {brackets.map((b) => (
                        <MenuItem key={b} value={b}>
                            {b}
                        </MenuItem>
                    ))}
                </TextField>
                <FormControlLabel
                    control={<Checkbox checked={onlyOpponents} onChange={(e) => setOnlyOpponents(e.target.checked)} disabled={!doc.myTeam} />}
                    label="My team's opponents"
                />
                <ToggleButtonGroup exclusive size="small" value={view} onChange={(_e, value) => value && setView(value)} sx={{ ml: { sm: "auto" } }}>
                    <ToggleButton value="ladder" sx={{ minHeight: 44 }}>
                        {LADDER_LABEL}
                    </ToggleButton>
                    <ToggleButton value="table" sx={{ minHeight: 44 }}>
                        {TABLE_LABEL}
                    </ToggleButton>
                </ToggleButtonGroup>
            </Stack>

            {view === "ladder" ? <Ladder rows={rows} doc={doc} myTeam={doc.myTeam} /> : <RatingsTable rows={rows} cap={doc.method.goalCap} />}

            <Typography variant="body2" color="text.secondary">
                CSHL-compatible RPI = (Lodin scaled + Walkush (approx.) scaled) ÷ 2, each scaled 0–20. Margins capped at {doc.method.goalCap}. Not the league's official number.
            </Typography>
        </Stack>
    );
}

export function RankingsScreen({ store }: { store: LocalPlannerStore }) {
    const { state, save, clear } = useRankingsDoc(store);
    if (state.status !== "ready") return <RankingsStatus state={state} onStartOver={() => void clear()} />;
    if (!state.doc) return <RankingsStatus state={{ status: "empty" }} onStartOver={() => void clear()} />;
    return <Ready doc={state.doc} save={save} />;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun run test __tests__/apps/planner/rankings-screen.test.tsx`
Expected: PASS (5 tests). If the "league's columns" test can't find a column header because `TableSortLabel` nests the text, query with `screen.getByText(column)` inside `within(screen.getByRole("table"))` instead.

- [ ] **Step 6: Commit**

```bash
git add apps/planner/src/screens/rankings/RankingsScreen.tsx __tests__/apps/planner/rankings-fixtures.ts __tests__/apps/planner/rankings-screen.test.tsx
git commit -m "feat(rankings): rankings screen with tiles, ladder, table and filters"
```

---

### Task 11: Import screen

**Files:**
- Replace: `apps/planner/src/screens/rankings/RankingsImportScreen.tsx`
- Test: `__tests__/apps/planner/rankings-import.test.tsx`

**Interfaces:**
- Consumes:
  - `parseSchedule`, `parseSnakeChart` and `defaultSeasonYear` (Tasks 4–5)
  - `createRankingsDocument`, `mergeSchedule`, `applySnakeChart`, `resolveConflict`, `readRankingsFile`, `GameConflict` and `MergeSummary` (Task 6)
  - `useRankingsDoc`, `RankingsStatus` and `navigateTo` (`apps/planner/src/platform.tsx`)
- Produces: the exported labels `READ_SCHEDULE_LABEL = "Read schedule"`, `READ_SNAKE_LABEL = "Read snake chart"`, `SAVE_IMPORT_LABEL = "Save rankings"`, `OPEN_FILE_LABEL = "Open rankings file"`.

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/apps/planner/rankings-import.test.tsx
import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { READ_SCHEDULE_LABEL, READ_SNAKE_LABEL, RankingsImportScreen, SAVE_IMPORT_LABEL } from "@/apps/planner/src/screens/rankings/RankingsImportScreen";
import { memoryStore, renderScreen } from "./render-screen";
import { sampleRankingsDoc } from "./rankings-fixtures";

const PAGE = ["9/20", "9:25am", "901 Riverside M1", "11", "-", "4", "902 Lakeview M2", "North Rink", "10/12", "8:00am", "901 Riverside M1", "902 Lakeview M2", "904 Orphan Team"].join("\n");
const SNAKE = ["Program\tRed\tWhite", "Strength\tstr\tstr", "Riverside\t901\t", "Lakeview\t\t902"].join("\n");

describe("RankingsImportScreen", () => {
    it("previews a pasted schedule, applies a snake chart and saves", async () => {
        const { store } = memoryStore();
        renderScreen(<RankingsImportScreen store={store} />, store);
        fireEvent.change(await screen.findByLabelText("Season starts in"), { target: { value: "2026" } });
        fireEvent.change(screen.getByLabelText("Schedule page"), { target: { value: PAGE } });
        fireEvent.click(screen.getByRole("button", { name: READ_SCHEDULE_LABEL }));
        expect(await screen.findByText(/1 completed game, 1 scheduled, 2 teams/)).toBeInTheDocument();
        expect(screen.getByText("904 Orphan Team")).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText("Snake chart"), { target: { value: SNAKE } });
        fireEvent.click(screen.getByRole("button", { name: READ_SNAKE_LABEL }));
        expect(await screen.findByText(/2 teams with a starting bracket/)).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: SAVE_IMPORT_LABEL }));
        await waitFor(async () => {
            const saved = await store.getRankings();
            expect(saved.success && saved.data?.games).toHaveLength(2);
        });
        const saved = await store.getRankings();
        if (saved.success) expect(saved.data!.teams.find((t) => t.number === "902")!.startingBracket).toBe("White Strong");
    });

    it("shows conflicts on re-import and lets the user take the imported score", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc());
        renderScreen(<RankingsImportScreen store={store} />, store);
        const changed = ["9/20", "9:00am", "901 Riverside M1", "3 - 2", "902 Lakeview M2"].join("\n");
        // Pin the season: the default comes from today's date, which would rot this fixture.
        fireEvent.change(await screen.findByLabelText("Season starts in"), { target: { value: "2026" } });
        fireEvent.change(screen.getByLabelText("Schedule page"), { target: { value: changed } });
        fireEvent.click(screen.getByRole("button", { name: READ_SCHEDULE_LABEL }));
        fireEvent.click(await screen.findByRole("button", { name: "Use imported 3–2" }));
        fireEvent.click(screen.getByRole("button", { name: SAVE_IMPORT_LABEL }));
        await waitFor(async () => {
            const saved = await store.getRankings();
            expect(saved.success && saved.data!.games[0].awayGoals).toBe(2);
        });
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test __tests__/apps/planner/rankings-import.test.tsx`
Expected: FAIL, because the labels are not exported.

- [ ] **Step 3: Write `RankingsImportScreen.tsx`**

```tsx
/**
 * Import (static rankings spec, Import and editing): paste or open the schedule
 * page, then optionally the snake chart; preview counts and unread lines; merge
 * into the device's rankings, resolving score conflicts; or open a rankings file.
 * Never fetches anything (spec R2).
 */
import { useState, type ChangeEvent } from "react";
import { Alert, Box, Button, List, ListItem, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { applySnakeChart, createRankingsDocument, mergeSchedule, readRankingsFile, resolveConflict, type GameConflict, type RankingsDocument } from "@/lib/rankings-document";
import { CSHL_8U_METHOD } from "@/lib/ratings";
import { defaultSeasonYear, parseSchedule, parseSnakeChart, type ParsedSchedule, type ParsedSnakeChart } from "@/lib/ratings/import";
import { navigateTo } from "../../platform";
import { staticRoutes } from "../../routes";
import type { LocalPlannerStore } from "../../store/types";
import { RankingsStatus } from "./display";
import { useRankingsDoc } from "./useRankingsDoc";

export const READ_SCHEDULE_LABEL = "Read schedule";
export const READ_SNAKE_LABEL = "Read snake chart";
export const SAVE_IMPORT_LABEL = "Save rankings";
export const OPEN_FILE_LABEL = "Open rankings file";

const PRESETS = [{ id: CSHL_8U_METHOD.preset, label: "CSHL 8U", method: CSHL_8U_METHOD }];
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

async function readTextFile(event: ChangeEvent<HTMLInputElement>): Promise<string | null> {
    const file = event.target.files?.[0];
    event.target.value = "";
    return file ? file.text() : null;
}

const score = (game: { homeGoals: number | null; awayGoals: number | null }, home: string, gameHome: string) =>
    home === gameHome ? `${game.homeGoals}–${game.awayGoals}` : `${game.awayGoals}–${game.homeGoals}`;

export function RankingsImportScreen({ store }: { store: LocalPlannerStore }) {
    const { state, save, clear } = useRankingsDoc(store);
    const [scheduleText, setScheduleText] = useState("");
    const [snakeText, setSnakeText] = useState("");
    const [seasonYear, setSeasonYear] = useState(() => defaultSeasonYear(new Date()));
    const [presetId, setPresetId] = useState(PRESETS[0].id);
    const [title, setTitle] = useState("Pre-season rankings");
    const [schedule, setSchedule] = useState<ParsedSchedule | null>(null);
    const [snake, setSnake] = useState<ParsedSnakeChart | null>(null);
    const [draft, setDraft] = useState<RankingsDocument | null>(null);
    const [conflicts, setConflicts] = useState<GameConflict[]>([]);
    const [message, setMessage] = useState<{ severity: "error" | "success" | "info"; text: string } | null>(null);

    if (state.status !== "ready") return <RankingsStatus state={state} onStartOver={() => void clear()} />;
    const existing = state.doc;

    const rebuild = (nextSchedule: ParsedSchedule | null, nextSnake: ParsedSnakeChart | null) => {
        const method = PRESETS.find((p) => p.id === presetId)!.method;
        let doc = existing ?? createRankingsDocument({ title, method });
        let found: GameConflict[] = [];
        if (nextSchedule) {
            const merged = mergeSchedule(doc, nextSchedule);
            doc = merged.doc;
            found = merged.summary.conflicts;
        }
        if (nextSnake) doc = applySnakeChart(doc, nextSnake).doc;
        setDraft(doc);
        setConflicts(found);
    };

    const readSchedule = () => {
        const parsed = parseSchedule(scheduleText, { seasonYear });
        setSchedule(parsed);
        rebuild(parsed, snake);
    };
    const readSnake = () => {
        const parsed = parseSnakeChart(snakeText);
        setSnake(parsed);
        rebuild(schedule, parsed);
    };
    const choose = (conflict: GameConflict, choice: "existing" | "incoming") => {
        if (draft) setDraft(resolveConflict(draft, conflict, choice));
        setConflicts((list) => list.filter((c) => c !== conflict));
    };
    const commit = async () => {
        if (!draft) return;
        const result = await save(draft);
        if (result.success) navigateTo(staticRoutes.rankings());
        else setMessage({ severity: "error", text: result.error });
    };
    const openFile = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        const parsed = await readRankingsFile(file);
        if (!parsed.ok) {
            setMessage({ severity: "error", text: parsed.error.message });
            return;
        }
        const result = await save(parsed.doc);
        if (result.success) navigateTo(staticRoutes.rankings());
        else setMessage({ severity: "error", text: result.error });
    };

    const finals = schedule?.games.filter((g) => g.homeGoals !== null).length ?? 0;
    const scheduled = (schedule?.games.length ?? 0) - finals;

    return (
        <Stack spacing={3} sx={{ maxWidth: 820 }}>
            <Typography component="h1" variant="h5" sx={{ fontWeight: 800 }}>
                Import rankings
            </Typography>
            <Typography color="text.secondary">
                Open your league's schedule page, select everything (Ctrl/⌘ + A), copy, and paste it below. You can also save the page and open the file.
                Nothing is sent anywhere: it stays in this browser.
            </Typography>

            {!existing && (
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                    <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
                    <TextField select label="Rules" value={presetId} onChange={(e) => setPresetId(e.target.value)} sx={{ minWidth: 160 }}>
                        {PRESETS.map((p) => (
                            <MenuItem key={p.id} value={p.id}>
                                {p.label}
                            </MenuItem>
                        ))}
                    </TextField>
                </Stack>
            )}

            <Stack spacing={1}>
                <Typography component="h2" variant="h6">
                    1. Schedule
                </Typography>
                <TextField label="Schedule page" multiline minRows={4} maxRows={10} value={scheduleText} onChange={(e) => setScheduleText(e.target.value)} />
                <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
                    <TextField
                        label="Season starts in"
                        type="number"
                        value={seasonYear}
                        onChange={(e) => setSeasonYear(Number(e.target.value) || defaultSeasonYear(new Date()))}
                        size="small"
                        sx={{ width: 150 }}
                    />
                    <Button component="label" sx={{ minHeight: 44 }}>
                        Open saved page
                        <input hidden type="file" accept=".html,.htm,.txt,text/html,text/plain" onChange={async (e) => setScheduleText((await readTextFile(e)) ?? scheduleText)} />
                    </Button>
                    <Button variant="contained" onClick={readSchedule} disabled={!scheduleText.trim()} sx={{ minHeight: 44 }}>
                        {READ_SCHEDULE_LABEL}
                    </Button>
                </Stack>
                {schedule && (
                    <Alert severity={schedule.games.length ? "success" : "warning"}>
                        {`${plural(finals, "completed game")}, ${scheduled} scheduled, ${plural(schedule.teams.length, "team")}`}
                        {schedule.unparsed.length > 0 && (
                            <>
                                <Typography variant="body2" sx={{ mt: 1 }}>
                                    {plural(schedule.unparsed.length, "line")} not understood:
                                </Typography>
                                <List dense>
                                    {schedule.unparsed.map((line) => (
                                        <ListItem key={line} sx={{ py: 0 }}>
                                            {line}
                                        </ListItem>
                                    ))}
                                </List>
                            </>
                        )}
                    </Alert>
                )}
            </Stack>

            <Stack spacing={1}>
                <Typography component="h2" variant="h6">
                    2. Snake chart (optional)
                </Typography>
                <TextField label="Snake chart" multiline minRows={3} maxRows={8} value={snakeText} onChange={(e) => setSnakeText(e.target.value)} />
                <Stack direction="row" spacing={1}>
                    <Button component="label" sx={{ minHeight: 44 }}>
                        Open saved page
                        <input hidden type="file" accept=".html,.htm,.txt,text/html,text/plain" onChange={async (e) => setSnakeText((await readTextFile(e)) ?? snakeText)} />
                    </Button>
                    <Button variant="outlined" onClick={readSnake} disabled={!snakeText.trim()} sx={{ minHeight: 44 }}>
                        {READ_SNAKE_LABEL}
                    </Button>
                </Stack>
                {snake && (
                    <Alert severity={snake.teams.length ? "success" : "warning"}>
                        {`${plural(snake.teams.length, "team")} with a starting bracket`}
                        {snake.unparsed.length > 0 ? ` · ${snake.unparsed.length} without a column: ${snake.unparsed.join(", ")}` : ""}
                    </Alert>
                )}
            </Stack>

            {conflicts.length > 0 && (
                <Stack spacing={1}>
                    <Typography component="h2" variant="h6">
                        Scores that changed
                    </Typography>
                    {conflicts.map((conflict) => (
                        <Box key={conflict.key} sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                            <Typography sx={{ flex: "1 1 14rem" }}>
                                {conflict.existing.date}: {conflict.existing.home} vs {conflict.existing.away}
                            </Typography>
                            <Button sx={{ minHeight: 44 }} onClick={() => choose(conflict, "existing")}>
                                {`Keep ${score(conflict.existing, conflict.existing.home, conflict.existing.home)}`}
                            </Button>
                            <Button variant="outlined" sx={{ minHeight: 44 }} onClick={() => choose(conflict, "incoming")}>
                                {`Use imported ${score(conflict.incoming, conflict.existing.home, conflict.incoming.home)}`}
                            </Button>
                        </Box>
                    ))}
                </Stack>
            )}

            {message && <Alert severity={message.severity}>{message.text}</Alert>}

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <Button variant="contained" size="large" onClick={() => void commit()} disabled={!draft || conflicts.length > 0} sx={{ minHeight: 44 }}>
                    {SAVE_IMPORT_LABEL}
                </Button>
                <Button component="label" sx={{ minHeight: 44 }}>
                    {OPEN_FILE_LABEL}
                    <input hidden type="file" accept=".json,application/json" onChange={(e) => void openFile(e)} />
                </Button>
            </Stack>
        </Stack>
    );
}
```

Note: with the sample document, the re-imported `901 vs 902 3 - 2` keys to the existing 2026-09-20 game, because both are the first game of that pair that day. Its existing score is 3–1, so it is a conflict, and the button reads "Use imported 3–2".

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test __tests__/apps/planner/rankings-import.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/planner/src/screens/rankings/RankingsImportScreen.tsx __tests__/apps/planner/rankings-import.test.tsx
git commit -m "feat(rankings): import screen with preview, merge and conflicts"
```

---

### Task 12: Team detail and setup screens

**Files:**
- Replace: `apps/planner/src/screens/rankings/RankingsTeamScreen.tsx`, `apps/planner/src/screens/rankings/RankingsSetupScreen.tsx`
- Test: `__tests__/apps/planner/rankings-team-setup.test.tsx`

**Interfaces:**
- Consumes: `useRatings` (Task 10), `capMargin` (Task 1), `useRankingsDoc`, `RankingsStatus`, `formatSigned`, `formatRating` and `CSHL_8U_METHOD`.
- Produces: `TEAM_NOT_FOUND_MESSAGE` and `SAVE_SETUP_LABEL = "Save setup"`.

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/apps/planner/rankings-team-setup.test.tsx
import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { RankingsTeamScreen, TEAM_NOT_FOUND_MESSAGE } from "@/apps/planner/src/screens/rankings/RankingsTeamScreen";
import { RankingsSetupScreen, SAVE_SETUP_LABEL } from "@/apps/planner/src/screens/rankings/RankingsSetupScreen";
import { memoryStore, renderScreen } from "./render-screen";
import { sampleRankingsDoc } from "./rankings-fixtures";

describe("RankingsTeamScreen", () => {
    it("shows the game log, the cap and the arithmetic", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc());
        renderScreen(<RankingsTeamScreen store={store} number="903" />, store);
        expect(await screen.findByRole("heading", { name: /Hilltop M1/ })).toBeInTheDocument();
        expect(screen.getByText(/AGD .+ \+ SCHED .+ = Lodin .+/)).toBeInTheDocument();
        expect(screen.getAllByText(/capped at 8/).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/Brookside M1/).length).toBeGreaterThan(0);
    });

    it("says when the team doesn't exist", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc());
        renderScreen(<RankingsTeamScreen store={store} number="999" />, store);
        expect(await screen.findByText(TEAM_NOT_FOUND_MESSAGE)).toBeInTheDocument();
    });
});

describe("RankingsSetupScreen", () => {
    it("marks a team excluded and changes a level size", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc());
        renderScreen(<RankingsSetupScreen store={store} />, store);
        const row = (await screen.findByText("Brookside M1")).closest("tr")!;
        fireEvent.click(within(row).getByRole("checkbox", { name: "Excluded" }));
        fireEvent.change(screen.getByLabelText("Size of level 1"), { target: { value: "3" } });
        fireEvent.click(screen.getByRole("button", { name: SAVE_SETUP_LABEL }));
        await waitFor(async () => {
            const saved = await store.getRankings();
            expect(saved.success && saved.data!.teams.find((t) => t.number === "904")!.excluded).toBe(true);
            expect(saved.success && saved.data!.method.levels[0].size).toBe(3);
        });
    });

    it("shows the validation message instead of saving bad input", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc());
        renderScreen(<RankingsSetupScreen store={store} />, store);
        fireEvent.change(await screen.findByLabelText("Size of level 1"), { target: { value: "0" } });
        fireEvent.click(screen.getByRole("button", { name: SAVE_SETUP_LABEL }));
        expect(await screen.findByText(/Level size must be at least 1/)).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test __tests__/apps/planner/rankings-team-setup.test.tsx`
Expected: FAIL, because the constants are not exported.

- [ ] **Step 3: Write `RankingsTeamScreen.tsx`**

```tsx
/** Team detail (static rankings spec): game log with capped margins and the arithmetic behind the numbers. */
import { Alert, Box, Button, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import { capMargin } from "@/lib/ratings";
import type { RankingsDocument } from "@/lib/rankings-document";
import { staticRoutes } from "../../routes";
import type { LocalPlannerStore } from "../../store/types";
import { MovementLabel, RankingsStatus, formatRating, formatSigned } from "./display";
import { useRatings } from "./RankingsScreen";
import { useRankingsDoc } from "./useRankingsDoc";

export const TEAM_NOT_FOUND_MESSAGE = "That team isn't in these rankings.";

function TeamDetail({ doc, number }: { doc: RankingsDocument; number: string }) {
    const result = useRatings(doc);
    const row = result.byNumber.get(number);
    if (!row) return <Alert severity="warning">{TEAM_NOT_FOUND_MESSAGE}</Alert>;
    const cap = doc.method.goalCap;
    const names = new Map(doc.teams.map((team) => [team.number, team.name]));
    const games = doc.games.filter((game) => game.home === number || game.away === number);
    const finals = games.filter((game) => game.status === "final");
    const upcoming = games.filter((game) => game.status === "scheduled");

    return (
        <Stack spacing={2}>
            <Button href={staticRoutes.rankings()} sx={{ alignSelf: "flex-start", minHeight: 44 }}>
                ← All teams
            </Button>
            <Typography component="h1" variant="h5" sx={{ fontWeight: 800 }}>
                {row.name} ({row.number})
            </Typography>
            <Typography>
                Rank {row.rank ?? "—"} · RPI {formatRating(row.rpi)} · Level {row.level ?? "—"} <MovementLabel movement={row.movement} startingLevel={row.startingLevel} />
            </Typography>
            <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography sx={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                    {`AGD ${formatSigned(row.agd)} + SCHED ${formatSigned(row.sched)} = Lodin ${formatSigned(row.lodin)}`}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    AGD is the average goal margin, with each game capped at {cap}. SCHED is the average rating of the opponents played.
                    {row.lowConfidence ? ` Fewer than ${doc.method.lowConfidenceGames} games: treat this rating with caution.` : ""}
                </Typography>
            </Paper>

            <TableContainer component={Paper} variant="outlined">
                <Table size="small" aria-label="Game log">
                    <TableHead>
                        <TableRow>
                            <TableCell>Date</TableCell>
                            <TableCell>Opponent</TableCell>
                            <TableCell align="right">Opp. rating</TableCell>
                            <TableCell>Score</TableCell>
                            <TableCell align="right">Margin</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {finals.map((game, i) => {
                            const home = game.home === number;
                            const opponent = home ? game.away : game.home;
                            const goalsFor = home ? game.homeGoals! : game.awayGoals!;
                            const goalsAgainst = home ? game.awayGoals! : game.homeGoals!;
                            const raw = goalsFor - goalsAgainst;
                            const margin = capMargin(raw, cap);
                            return (
                                <TableRow key={`${game.date}-${opponent}-${i}`}>
                                    <TableCell>{game.date}</TableCell>
                                    <TableCell>
                                        <a href={staticRoutes.rankingsTeam(opponent)}>{names.get(opponent) ?? opponent}</a>
                                    </TableCell>
                                    <TableCell align="right">{formatSigned(result.byNumber.get(opponent)?.lodin ?? null)}</TableCell>
                                    <TableCell>{`${goalsFor > goalsAgainst ? "W" : goalsFor < goalsAgainst ? "L" : "T"} ${goalsFor}–${goalsAgainst}`}</TableCell>
                                    <TableCell align="right">
                                        <Box component="span" sx={{ fontVariantNumeric: "tabular-nums" }}>
                                            {margin > 0 ? `+${margin}` : margin}
                                        </Box>
                                        {raw !== margin && (
                                            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                                                capped at {cap}
                                            </Typography>
                                        )}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </TableContainer>
            {!finals.some((game) => Math.abs((game.homeGoals ?? 0) - (game.awayGoals ?? 0)) > cap) && (
                <Typography variant="caption" color="text.secondary">
                    Margins are capped at {cap}; no game here reached the cap.
                </Typography>
            )}

            {upcoming.length > 0 && (
                <Stack spacing={0.5}>
                    <Typography component="h2" variant="h6">
                        Still to play
                    </Typography>
                    {upcoming.map((game, i) => {
                        const opponent = game.home === number ? game.away : game.home;
                        return <Typography key={`${game.date}-${opponent}-${i}`}>{`${game.date} vs ${names.get(opponent) ?? opponent}`}</Typography>;
                    })}
                    <Button href={staticRoutes.rankingsWhatIf()} variant="contained" sx={{ alignSelf: "flex-start", minHeight: 44 }}>
                        Try results in What-if
                    </Button>
                </Stack>
            )}
        </Stack>
    );
}

export function RankingsTeamScreen({ store, number }: { store: LocalPlannerStore; number: string }) {
    const { state, clear } = useRankingsDoc(store);
    if (state.status !== "ready") return <RankingsStatus state={state} onStartOver={() => void clear()} />;
    if (!state.doc) return <RankingsStatus state={{ status: "empty" }} onStartOver={() => void clear()} />;
    return <TeamDetail doc={state.doc} number={number} />;
}
```

- [ ] **Step 4: Write `RankingsSetupScreen.tsx`**

```tsx
/** Setup (static rankings spec): title, goal cap, levels, teams (name, bracket, excluded, my team), games; validated on save. */
import { useState } from "react";
import {
    Alert,
    Button,
    Checkbox,
    IconButton,
    MenuItem,
    Paper,
    Radio,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Typography,
} from "@mui/material";
import { CSHL_8U_METHOD } from "@/lib/ratings";
import type { RankingsDocument, RankingsGame } from "@/lib/rankings-document";
import { navigateTo } from "../../platform";
import { staticRoutes } from "../../routes";
import type { LocalPlannerStore } from "../../store/types";
import { RankingsStatus } from "./display";
import { useRankingsDoc } from "./useRankingsDoc";

export const SAVE_SETUP_LABEL = "Save setup";
export const CLEAR_ALL_LABEL = "Delete these rankings";

const goalsValue = (text: string): number | null => (text.trim() === "" || !/^\d{1,2}$/.test(text.trim()) ? null : Number(text));

function Editor({ initial, save, clear }: { initial: RankingsDocument; save: LocalPlannerStore["saveRankings"]; clear: () => Promise<unknown> }) {
    const [doc, setDoc] = useState<RankingsDocument>(initial);
    const [error, setError] = useState<string | null>(null);
    const [confirmClear, setConfirmClear] = useState(false);
    const [newGame, setNewGame] = useState<RankingsGame>({ date: "", time: null, home: "", away: "", homeGoals: null, awayGoals: null, status: "final", rink: null });

    const setLevel = (index: number, patch: Partial<{ name: string; size: number }>) =>
        setDoc((d) => ({ ...d, method: { ...d.method, levels: d.method.levels.map((l, i) => (i === index ? { ...l, ...patch } : l)) } }));
    const setTeam = (number: string, patch: Partial<RankingsDocument["teams"][number]>) =>
        setDoc((d) => ({ ...d, teams: d.teams.map((t) => (t.number === number ? { ...t, ...patch } : t)) }));
    const setGame = (index: number, patch: Partial<RankingsGame>) =>
        setDoc((d) => ({ ...d, games: d.games.map((g, i) => (i === index ? { ...g, ...patch } : g)) }));

    const submit = async () => {
        const result = await save(doc);
        if (result.success) {
            setError(null);
            navigateTo(staticRoutes.rankings());
        } else setError(result.error);
    };

    return (
        <Stack spacing={3}>
            <Typography component="h1" variant="h5" sx={{ fontWeight: 800 }}>
                Rankings setup
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <TextField label="Title" value={doc.meta.title} onChange={(e) => setDoc({ ...doc, meta: { ...doc.meta, title: e.target.value } })} />
                <TextField
                    label="Goal cap"
                    type="number"
                    value={doc.method.goalCap}
                    onChange={(e) => setDoc({ ...doc, method: { ...doc.method, goalCap: Number(e.target.value) } })}
                    sx={{ width: 120 }}
                />
                <Button onClick={() => setDoc({ ...doc, method: structuredClone(CSHL_8U_METHOD) })} sx={{ minHeight: 44 }}>
                    Reset to CSHL 8U
                </Button>
            </Stack>

            <Stack spacing={1}>
                <Typography component="h2" variant="h6">
                    Levels (top first)
                </Typography>
                {doc.method.levels.map((level, i) => (
                    <Stack key={i} direction="row" spacing={1} sx={{ alignItems: "center" }}>
                        <TextField label={`Name of level ${i + 1}`} value={level.name} onChange={(e) => setLevel(i, { name: e.target.value })} size="small" />
                        <TextField
                            label={`Size of level ${i + 1}`}
                            type="number"
                            value={level.size}
                            onChange={(e) => setLevel(i, { size: Number(e.target.value) })}
                            size="small"
                            sx={{ width: 140 }}
                        />
                        <IconButton
                            aria-label={`Remove level ${i + 1}`}
                            onClick={() => setDoc((d) => ({ ...d, method: { ...d.method, levels: d.method.levels.filter((_l, k) => k !== i) } }))}
                            sx={{ width: 44, height: 44 }}
                        >
                            ×
                        </IconButton>
                    </Stack>
                ))}
                <Button
                    onClick={() => setDoc((d) => ({ ...d, method: { ...d.method, levels: [...d.method.levels, { name: `L${d.method.levels.length + 1}`, size: 6 }] } }))}
                    sx={{ alignSelf: "flex-start", minHeight: 44 }}
                >
                    Add level
                </Button>
                <Typography variant="body2" color="text.secondary">
                    {`Levels hold ${doc.method.levels.reduce((sum, l) => sum + (Number.isFinite(l.size) ? l.size : 0), 0)} teams; ${doc.teams.filter((t) => !t.excluded).length} teams aren't excluded.`}
                </Typography>
            </Stack>

            <Stack spacing={1}>
                <Typography component="h2" variant="h6">
                    Teams
                </Typography>
                <TableContainer component={Paper} variant="outlined">
                    <Table size="small" aria-label="Teams">
                        <TableHead>
                            <TableRow>
                                <TableCell>My team</TableCell>
                                <TableCell>Number</TableCell>
                                <TableCell>Name</TableCell>
                                <TableCell>Starting bracket</TableCell>
                                <TableCell>Excluded</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {doc.teams.map((team) => (
                                <TableRow key={team.number}>
                                    <TableCell>
                                        <Radio checked={doc.myTeam === team.number} onChange={() => setDoc({ ...doc, myTeam: team.number })} inputProps={{ "aria-label": `My team: ${team.name}` }} />
                                    </TableCell>
                                    <TableCell>{team.number}</TableCell>
                                    <TableCell>
                                        <Typography component="span" sx={{ display: "none" }}>
                                            {team.name}
                                        </Typography>
                                        <TextField value={team.name} onChange={(e) => setTeam(team.number, { name: e.target.value })} size="small" slotProps={{ htmlInput: { "aria-label": `Name of ${team.number}` } }} />
                                    </TableCell>
                                    <TableCell>
                                        <TextField
                                            value={team.startingBracket ?? ""}
                                            onChange={(e) => setTeam(team.number, { startingBracket: e.target.value || null })}
                                            size="small"
                                            slotProps={{ htmlInput: { "aria-label": `Starting bracket of ${team.number}` } }}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Checkbox checked={team.excluded} onChange={(e) => setTeam(team.number, { excluded: e.target.checked })} inputProps={{ "aria-label": "Excluded" }} />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Stack>

            <Stack spacing={1}>
                <Typography component="h2" variant="h6">
                    Games
                </Typography>
                {doc.games.map((game, i) => (
                    <Stack key={i} direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
                        <Typography sx={{ minWidth: "11rem" }}>{`${game.date} · ${game.home} vs ${game.away}`}</Typography>
                        <TextField
                            label="Home"
                            value={game.homeGoals ?? ""}
                            onChange={(e) => {
                                const homeGoals = goalsValue(e.target.value);
                                setGame(i, { homeGoals, status: homeGoals !== null && game.awayGoals !== null ? "final" : "scheduled" });
                            }}
                            size="small"
                            sx={{ width: 80 }}
                        />
                        <TextField
                            label="Away"
                            value={game.awayGoals ?? ""}
                            onChange={(e) => {
                                const awayGoals = goalsValue(e.target.value);
                                setGame(i, { awayGoals, status: game.homeGoals !== null && awayGoals !== null ? "final" : "scheduled" });
                            }}
                            size="small"
                            sx={{ width: 80 }}
                        />
                        <IconButton aria-label={`Delete game ${i + 1}`} onClick={() => setDoc((d) => ({ ...d, games: d.games.filter((_g, k) => k !== i) }))} sx={{ width: 44, height: 44 }}>
                            ×
                        </IconButton>
                    </Stack>
                ))}
                <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1, alignItems: "center" }}>
                    <TextField label="Date" type="date" value={newGame.date} onChange={(e) => setNewGame({ ...newGame, date: e.target.value })} size="small" slotProps={{ inputLabel: { shrink: true } }} />
                    {(["home", "away"] as const).map((side) => (
                        <TextField key={side} select label={side === "home" ? "Home team" : "Away team"} value={newGame[side]} onChange={(e) => setNewGame({ ...newGame, [side]: e.target.value })} size="small" sx={{ minWidth: 160 }}>
                            {doc.teams.map((t) => (
                                <MenuItem key={t.number} value={t.number}>
                                    {t.number} {t.name}
                                </MenuItem>
                            ))}
                        </TextField>
                    ))}
                    <Button
                        onClick={() => {
                            const status = newGame.homeGoals !== null && newGame.awayGoals !== null ? "final" : "scheduled";
                            setDoc((d) => ({ ...d, games: [...d.games, { ...newGame, status }] }));
                            setNewGame({ ...newGame, home: "", away: "", homeGoals: null, awayGoals: null });
                        }}
                        disabled={!newGame.date || !newGame.home || !newGame.away}
                        sx={{ minHeight: 44 }}
                    >
                        Add game
                    </Button>
                </Stack>
            </Stack>

            {error && <Alert severity="error">{error}</Alert>}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <Button variant="contained" onClick={() => void submit()} sx={{ minHeight: 44 }}>
                    {SAVE_SETUP_LABEL}
                </Button>
                <Button href={staticRoutes.rankings()} sx={{ minHeight: 44 }}>
                    Cancel
                </Button>
                {confirmClear ? (
                    <Button color="error" variant="outlined" onClick={() => void clear().then(() => navigateTo(staticRoutes.rankings()))} sx={{ minHeight: 44 }}>
                        Yes, delete them
                    </Button>
                ) : (
                    <Button color="error" onClick={() => setConfirmClear(true)} sx={{ minHeight: 44 }}>
                        {CLEAR_ALL_LABEL}
                    </Button>
                )}
            </Stack>
        </Stack>
    );
}

export function RankingsSetupScreen({ store }: { store: LocalPlannerStore }) {
    const { state, save, clear } = useRankingsDoc(store);
    if (state.status !== "ready") return <RankingsStatus state={state} onStartOver={() => void clear()} />;
    if (!state.doc) return <RankingsStatus state={{ status: "empty" }} onStartOver={() => void clear()} />;
    return <Editor initial={state.doc} save={save} clear={clear} />;
}
```

The hidden `Typography` in each Name cell gives the setup test a plain text node (`findByText("Brookside M1")`) to find its row by.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun run test __tests__/apps/planner/rankings-team-setup.test.tsx`
Expected: PASS (4 tests). In the sample, game `901 12–0 903` exceeds the cap of 8, so "capped at 8" is rendered.

- [ ] **Step 6: Commit**

```bash
git add apps/planner/src/screens/rankings/RankingsTeamScreen.tsx apps/planner/src/screens/rankings/RankingsSetupScreen.tsx __tests__/apps/planner/rankings-team-setup.test.tsx
git commit -m "feat(rankings): team detail and setup screens"
```

---

### Task 13: What-if screen

**Files:**
- Replace: `apps/planner/src/screens/rankings/RankingsWhatIfScreen.tsx`
- Test: `__tests__/apps/planner/rankings-whatif.test.tsx`

**Interfaces:**
- Consumes: `whatIf`, `composite`, `marginSweep` and `SWEEP_OTHER_GOALS` (Tasks 2–3), plus `toRatingInputs`, `useRankingsDoc`, `RankingsStatus` and `formatRating`.
- Produces: `RECORD_FINAL_LABEL = "Record as final"`, `ADD_HYPOTHETICAL_LABEL = "Add hypothetical game"`, `SWEEP_HEADING = "Every final margin"`, `WHO_MOVES_HEADING = "Who moves"`.

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/apps/planner/rankings-whatif.test.tsx
import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { RECORD_FINAL_LABEL, RankingsWhatIfScreen, SWEEP_HEADING } from "@/apps/planner/src/screens/rankings/RankingsWhatIfScreen";
import { memoryStore, renderScreen } from "./render-screen";
import { sampleRankingsDoc } from "./rankings-fixtures";

describe("RankingsWhatIfScreen", () => {
    it("lists my team's unplayed game and sweeps every margin", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc());
        renderScreen(<RankingsWhatIfScreen store={store} />, store);
        expect((await screen.findAllByText(/vs Brookside M1/)).length).toBeGreaterThan(0);
        const sweep = screen.getByRole("list", { name: SWEEP_HEADING });
        expect(within(sweep).getAllByRole("listitem")).toHaveLength(17);
    });

    it("ignores blank or invalid scores and never writes them", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc());
        renderScreen(<RankingsWhatIfScreen store={store} />, store);
        fireEvent.change(await screen.findByLabelText("Hilltop M1 goals"), { target: { value: "abc" } });
        expect(screen.getByRole("button", { name: RECORD_FINAL_LABEL })).toBeDisabled();
        const saved = await store.getRankings();
        expect(saved.success && saved.data!.games.at(-1)!.status).toBe("scheduled");
    });

    it("shows before → after for my team and records a result as final", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc());
        renderScreen(<RankingsWhatIfScreen store={store} />, store);
        fireEvent.change(await screen.findByLabelText("Hilltop M1 goals"), { target: { value: "8" } });
        fireEvent.change(screen.getByLabelText("Brookside M1 goals"), { target: { value: "0" } });
        expect(await screen.findByText(/Rank \d+ → \d+/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: RECORD_FINAL_LABEL }));
        await waitFor(async () => {
            const saved = await store.getRankings();
            expect(saved.success && saved.data!.games.at(-1)).toMatchObject({ status: "final", homeGoals: 8, awayGoals: 0 });
        });
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test __tests__/apps/planner/rankings-whatif.test.tsx`
Expected: FAIL, because the labels are not exported.

- [ ] **Step 3: Write `RankingsWhatIfScreen.tsx`**

```tsx
/**
 * What-if (static rankings spec): scores typed for unplayed or hypothetical
 * games re-run everything in memory; a sweep shows the chosen team's level and
 * rank at every margin; "Record as final" is the only path to storage. Blank or
 * invalid scores mean "not applied" and never throw (Review Focus 5).
 */
import { useMemo, useState } from "react";
import { Alert, Box, Button, List, ListItem, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import { composite, marginSweep, whatIf, SWEEP_OTHER_GOALS, type RatingGame } from "@/lib/ratings";
import { toRatingInputs, type RankingsDocument, type RankingsGame } from "@/lib/rankings-document";
import type { LocalPlannerStore } from "../../store/types";
import { RankingsStatus, formatRating } from "./display";
import { useRankingsDoc } from "./useRankingsDoc";

export const RECORD_FINAL_LABEL = "Record as final";
export const ADD_HYPOTHETICAL_LABEL = "Add hypothetical game";
export const SWEEP_HEADING = "Every final margin";
export const WHO_MOVES_HEADING = "Who moves";

interface Fixture {
    id: string;
    home: string;
    away: string;
    date: string | null;
    /** Index into doc.games for a scheduled game; null for a hypothetical one. */
    gameIndex: number | null;
}

const goals = (text: string | undefined): number | null => (text !== undefined && /^\d{1,2}$/.test(text.trim()) ? Number(text) : null);

function WhatIf({ doc, save }: { doc: RankingsDocument; save: (doc: RankingsDocument) => Promise<unknown> }) {
    const [team, setTeam] = useState(doc.myTeam ?? doc.teams[0]?.number ?? "");
    const [scores, setScores] = useState<Record<string, { home?: string; away?: string }>>({});
    const [extra, setExtra] = useState<Fixture[]>([]);
    const [opponent, setOpponent] = useState("");
    const [sweepId, setSweepId] = useState<string | null>(null);
    const names = new Map(doc.teams.map((t) => [t.number, t.name]));
    const name = (number: string) => names.get(number) ?? number;
    const { games, teams } = useMemo(() => toRatingInputs(doc), [doc]);

    const fixtures: Fixture[] = [
        ...doc.games
            .map((game, gameIndex) => ({ game, gameIndex }))
            .filter(({ game }) => game.status === "scheduled" && (game.home === team || game.away === team))
            .map(({ game, gameIndex }) => ({ id: `g${gameIndex}`, home: game.home, away: game.away, date: game.date, gameIndex })),
        ...extra.filter((f) => f.home === team || f.away === team),
    ];

    const entered = (f: Fixture): RatingGame | null => {
        const s = scores[f.id];
        const h = goals(s?.home);
        const a = goals(s?.away);
        return h === null || a === null ? null : { home: f.home, away: f.away, homeGoals: h, awayGoals: a };
    };
    const hypotheticals = fixtures.map(entered).filter((g): g is RatingGame => g !== null);
    const before = useMemo(() => composite(games, teams, doc.method), [games, teams, doc.method]);
    const after = whatIf(games, hypotheticals, teams, doc.method);
    const mineBefore = before.byNumber.get(team);
    const mineAfter = after.byNumber.get(team);
    const movers = after.ranked.filter((row) => before.byNumber.get(row.number)?.rank !== row.rank);

    const sweepFixture = fixtures.find((f) => f.id === sweepId) ?? fixtures[0];
    const otherEntered = sweepFixture ? fixtures.filter((f) => f.id !== sweepFixture.id).map(entered).filter((g): g is RatingGame => g !== null) : [];
    const sweep = sweepFixture ? marginSweep([...games, ...otherEntered], sweepFixture, team, teams, doc.method) : [];

    const record = async (f: Fixture) => {
        const game = entered(f);
        if (!game || f.gameIndex === null) return;
        const updated: RankingsGame = { ...doc.games[f.gameIndex], homeGoals: game.homeGoals, awayGoals: game.awayGoals, status: "final" };
        await save({ ...doc, games: doc.games.map((g, i) => (i === f.gameIndex ? updated : g)) });
        setScores((s) => ({ ...s, [f.id]: {} }));
    };

    return (
        <Stack spacing={3}>
            <Typography component="h1" variant="h5" sx={{ fontWeight: 800 }}>
                What-if
            </Typography>
            <TextField select label="Team" value={team} onChange={(e) => setTeam(e.target.value)} sx={{ maxWidth: 360 }}>
                {doc.teams.map((t) => (
                    <MenuItem key={t.number} value={t.number}>
                        {t.number} {t.name}
                    </MenuItem>
                ))}
            </TextField>

            {fixtures.length === 0 && <Alert severity="info">No unplayed games for this team. Add a hypothetical one below.</Alert>}
            {fixtures.map((f) => {
                const valid = entered(f) !== null;
                return (
                    <Paper key={f.id} variant="outlined" sx={{ p: 1.5 }}>
                        <Typography sx={{ mb: 1 }}>{`${f.date ?? "Hypothetical"} · ${name(f.home)} vs ${name(f.away)}`}</Typography>
                        <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
                            <TextField
                                label={`${name(f.home)} goals`}
                                value={scores[f.id]?.home ?? ""}
                                onChange={(e) => setScores((s) => ({ ...s, [f.id]: { ...s[f.id], home: e.target.value } }))}
                                size="small"
                                slotProps={{ htmlInput: { inputMode: "numeric" } }}
                                sx={{ width: 150 }}
                            />
                            <TextField
                                label={`${name(f.away)} goals`}
                                value={scores[f.id]?.away ?? ""}
                                onChange={(e) => setScores((s) => ({ ...s, [f.id]: { ...s[f.id], away: e.target.value } }))}
                                size="small"
                                slotProps={{ htmlInput: { inputMode: "numeric" } }}
                                sx={{ width: 150 }}
                            />
                            <Button onClick={() => setSweepId(f.id)} sx={{ minHeight: 44 }}>
                                Sweep this game
                            </Button>
                            {f.gameIndex !== null ? (
                                <Button variant="outlined" disabled={!valid} onClick={() => void record(f)} sx={{ minHeight: 44 }}>
                                    {RECORD_FINAL_LABEL}
                                </Button>
                            ) : (
                                <Button onClick={() => setExtra((list) => list.filter((x) => x.id !== f.id))} sx={{ minHeight: 44 }}>
                                    Remove
                                </Button>
                            )}
                        </Stack>
                    </Paper>
                );
            })}

            <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
                <TextField select label="Opponent" value={opponent} onChange={(e) => setOpponent(e.target.value)} size="small" sx={{ minWidth: 200 }}>
                    {doc.teams
                        .filter((t) => t.number !== team)
                        .map((t) => (
                            <MenuItem key={t.number} value={t.number}>
                                {t.number} {t.name}
                            </MenuItem>
                        ))}
                </TextField>
                <Button
                    disabled={!opponent || !team}
                    onClick={() => {
                        setExtra((list) => [...list, { id: `h${Date.now()}-${list.length}`, home: team, away: opponent, date: null, gameIndex: null }]);
                        setOpponent("");
                    }}
                    sx={{ minHeight: 44 }}
                >
                    {ADD_HYPOTHETICAL_LABEL}
                </Button>
            </Stack>

            {mineBefore && mineAfter && hypotheticals.length > 0 && (
                <Paper variant="outlined" sx={{ p: 2 }}>
                    <Typography sx={{ fontWeight: 800 }}>{`Rank ${mineBefore.rank ?? "—"} → ${mineAfter.rank ?? "—"}`}</Typography>
                    <Typography>{`RPI ${formatRating(mineBefore.rpi)} → ${formatRating(mineAfter.rpi)} · Level ${mineBefore.level ?? "—"} → ${mineAfter.level ?? "—"}`}</Typography>
                </Paper>
            )}

            {sweepFixture && (
                <Stack spacing={1}>
                    <Typography component="h2" variant="h6" id="sweep-heading">
                        {SWEEP_HEADING}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        {`${name(team)} vs ${name(sweepFixture.home === team ? sweepFixture.away : sweepFixture.home)}, assuming the losing side scores ${SWEEP_OTHER_GOALS}.`}
                    </Typography>
                    <Box component="ul" aria-label={SWEEP_HEADING} sx={{ display: "flex", gap: 0.5, overflowX: "auto", listStyle: "none", p: 0, m: 0, pb: 1 }}>
                        {sweep.map((cell) => (
                            <Box
                                component="li"
                                key={cell.margin}
                                sx={{ minWidth: 64, minHeight: 64, p: 0.75, borderRadius: 1, border: 1, borderColor: cell.margin === 0 ? "text.secondary" : "divider", textAlign: "center" }}
                            >
                                <Typography sx={{ fontWeight: 800 }}>{cell.margin > 0 ? `+${cell.margin}` : cell.margin}</Typography>
                                <Typography variant="body2">{cell.level ?? "—"}</Typography>
                                <Typography variant="caption" color="text.secondary">{`#${cell.rank ?? "—"}`}</Typography>
                            </Box>
                        ))}
                    </Box>
                </Stack>
            )}

            {hypotheticals.length > 0 && (
                <Stack spacing={1}>
                    <Typography component="h2" variant="h6">
                        {WHO_MOVES_HEADING}
                    </Typography>
                    {movers.length === 0 ? (
                        <Typography color="text.secondary">No ranks change.</Typography>
                    ) : (
                        <List dense>
                            {movers.map((row) => (
                                <ListItem key={row.number}>{`${row.name}: ${before.byNumber.get(row.number)?.rank ?? "—"} → ${row.rank}`}</ListItem>
                            ))}
                        </List>
                    )}
                </Stack>
            )}
        </Stack>
    );
}

export function RankingsWhatIfScreen({ store }: { store: LocalPlannerStore }) {
    const { state, save, clear } = useRankingsDoc(store);
    if (state.status !== "ready") return <RankingsStatus state={state} onStartOver={() => void clear()} />;
    if (!state.doc) return <RankingsStatus state={{ status: "empty" }} onStartOver={() => void clear()} />;
    return <WhatIf doc={state.doc} save={save} />;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test __tests__/apps/planner/rankings-whatif.test.tsx`
Expected: PASS (3 tests). The sample's goal cap is 8, so the sweep has 17 cells. The sample's scheduled game is `903 home vs 904 away`, so "Hilltop M1 goals" is the home field.

- [ ] **Step 5: Commit**

```bash
git add apps/planner/src/screens/rankings/RankingsWhatIfScreen.tsx __tests__/apps/planner/rankings-whatif.test.tsx
git commit -m "feat(rankings): what-if screen with sweep, who moves and record as final"
```

---

### Task 14: Verification against a real paste, quality gates and browser check

**Files:**
- Possibly modify: `lib/ratings/import/schedule.ts` and its test, if a real paste reveals a new token shape. Add the new shape to the test as a made-up fixture.

- [ ] **Step 1: Run the full quality gates**

Run: `bun run type-check && bun run lint && bun run test && bun run check:raw-sql && bun run adr:lint`
Expected: all pass. Fix any failure in the task that owns the file, then re-run.

- [ ] **Step 2: Build the static app**

Run: `bun run planner:build && bun run planner:check`
Expected: both pass. Check that the bundle doesn't pull in `next`.

- [ ] **Step 3: Check a real paste, locally and without committing it.** Run `bun run planner:dev` and open `http://localhost:5173/#/rankings/import`.
- Open the league's public schedule page in a normal browser tab, select all, copy, and paste into "Schedule page". Click **Read schedule**.
- Expected: the completed and scheduled counts match the page. The "not understood" list holds only lines that aren't games.
- If games are missing, copy one game's pasted text into a **made-up** fixture with the same structure, add a failing test to `__tests__/lib/ratings/import-schedule.test.ts`, fix `parseSchedule`, and commit (`fix(rankings): read <shape> rows`).
- Do the same for the snake chart page.
- Never commit the real paste or the league's names.

- [ ] **Step 4: Sanity-check the numbers (local only).** With the real pool loaded, check the following:
- AGD for a few teams matches the league standings' goal differential ÷ games played, within the cap.
- The ladder's top team is plausible.
- The team detail arithmetic adds up.

- [ ] **Step 5: Check the browser at phone and desktop widths.** Use the Playwright MCP or Chrome DevTools to check these routes at 360×800 and at 1280×800, in light and dark colour schemes:
- `#/rankings`
- `#/rankings/team/<n>`
- `#/rankings/what-if`
- `#/rankings/setup`
- `#/rankings/import`

Check for:
- no horizontal page scroll (the sweep strip and the tables scroll inside their own containers);
- 44px targets;
- level bands visible in both schemes;
- movement shown as icon plus word;
- tooltips on ladder dots;
- the nav fits on phones with four items.
- level-band contrast: run the dataviz palette validator on the band colours composited over the light and dark page backgrounds. Bands are one hue with text labels, so the check is lightness steps and contrast, not distinguishing categories.

Fix what you find and commit each fix.

- [ ] **Step 6: Commit any verification fixes, but do not push**

```bash
git status
git log --oneline docs/static-rankings-spec ^main
```

Expected: a clean tree and one commit per task. **Do not push or open a PR before 5 PM ET on a weekday.** Tell the owner the branch is ready to push.

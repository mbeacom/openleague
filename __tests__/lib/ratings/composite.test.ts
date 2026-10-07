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

    it("reports movement against the levels the starting bracket was seeded into", () => {
        const teams = [
            t("901", { startingBracket: "Red Strong" }),
            t("902", { startingBracket: "Red Strong" }),
            t("903", { startingBracket: "White Strong" }),
            t("904", { startingBracket: "White Strong" }),
        ];
        const games = [g("904", "901", 4, 0), g("904", "902", 4, 0), g("901", "903", 4, 0), g("902", "903", 1, 0)];
        const result = composite(games, teams, method([["X", 2], ["Y", 2]]), { bracketOrder: ["Red Strong", "White Strong"] });
        const top = result.byNumber.get("904")!;
        expect(top.rank).toBe(1);
        expect(top.level).toBe("X");
        expect(top.movement).toBe("up");
        expect(result.byNumber.get("903")!.movement).toBe("same");
        expect(result.ranked.find((row) => row.level === "Y" && row.startingBracket === "Red Strong")!.movement).toBe("down");
    });

    describe("starting bracket order", () => {
        // White Strong carries the LOWER numbers but sits below Red Strong on the chart.
        const teams = [
            t("901", { startingBracket: "White Strong" }),
            t("902", { startingBracket: "White Strong" }),
            t("903", { startingBracket: "Red Strong" }),
            t("904", { startingBracket: "Red Strong" }),
        ];
        // Results that put the White Strong teams on top.
        const games = [g("901", "903", 5, 0), g("902", "904", 5, 0), g("901", "904", 5, 0), g("902", "903", 5, 0)];
        const levels = method([["X", 2], ["Y", 2]]);

        it("comes from the chart's column order, never from team numbers", () => {
            const result = composite(games, teams, levels, { bracketOrder: ["Red Strong", "White Strong"] });
            expect(result.byNumber.get("901")!.level).toBe("X");
            expect(result.byNumber.get("901")!.movement).toBe("up");
            expect(result.byNumber.get("903")!.level).toBe("Y");
            expect(result.byNumber.get("903")!.movement).toBe("down");
        });

        it("falls back to the order brackets first appear in the team list", () => {
            const result = composite(games, teams, levels);
            expect(result.byNumber.get("901")!.movement).toBe("same");
            expect(result.byNumber.get("903")!.movement).toBe("same");
            const reversed = composite(games, [...teams].reverse(), levels);
            expect(reversed.byNumber.get("901")!.movement).toBe("up");
        });

        it("treats a bracket that straddles a cut as spanning both levels", () => {
            // Seeds: Red Strong ×3 then White Strong ×1 into X(2), Y(2): Red Strong spans X..Y.
            const straddle = [
                t("901", { startingBracket: "Red Strong" }),
                t("902", { startingBracket: "Red Strong" }),
                t("903", { startingBracket: "Red Strong" }),
                t("904", { startingBracket: "White Strong" }),
            ];
            const chain = [g("901", "902", 4, 0), g("902", "903", 4, 0), g("903", "904", 4, 0)];
            const result = composite(chain, straddle, levels, { bracketOrder: ["Red Strong", "White Strong"] });
            expect(result.ranked.map((row) => row.movement)).toEqual(["same", "same", "same", "same"]);
        });

        it("gives teams below the last level movement through a virtual level", () => {
            const result = composite(games, teams, method([["X", 1], ["Y", 1]]), { bracketOrder: ["Red Strong", "White Strong"] });
            // Seeds: Red Strong → X, Y; White Strong → below, below.
            const below = result.ranked.filter((row) => row.level === null);
            expect(below).toHaveLength(2);
            expect(below.every((row) => row.startingBracket === "Red Strong" && row.movement === "down")).toBe(true);
            expect(result.byNumber.get("901")!.movement).toBe("up");
        });
    });

    it("leaves ranked teams past the level sizes without a level, still ranked", () => {
        const teams = [...chainTeams, t("905"), t("906")];
        const games = [...[g("901", "902", 4, 0), g("902", "903", 4, 0), g("903", "904", 4, 0)], g("904", "905", 4, 0), g("905", "906", 4, 0)];
        const result = composite(games, teams, method([["X", 2], ["Y", 2]]));
        expect(result.ranked).toHaveLength(6);
        expect(result.ranked.map((row) => row.level)).toEqual(["X", "X", "Y", "Y", null, null]);
        expect(result.byNumber.get("906")!.rank).toBe(6);
    });

    it("whatIf adds hypothetical games without changing its inputs", () => {
        const games = Object.freeze([...chain]) as readonly RatingGame[];
        const before = composite(games, chainTeams, method([["X", 4]]));
        const after = whatIf(games, [g("904", "901", 8, 0)], chainTeams, method([["X", 4]]));
        expect(games).toHaveLength(3);
        expect(after.byNumber.get("904")!.rpi).toBeGreaterThan(before.byNumber.get("904")!.rpi!);
    });
});

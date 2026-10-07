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

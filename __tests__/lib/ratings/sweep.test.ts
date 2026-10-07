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

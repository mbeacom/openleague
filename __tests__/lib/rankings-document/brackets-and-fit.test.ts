import { describe, expect, it } from "vitest";
import { applySnakeChart, docBracketOrder, rankedTeamCount, scheduleTeamNumbers, snakeChartFit } from "@/lib/rankings-document";
import { composite, orderBrackets } from "@/lib/ratings";
import { toRatingInputs } from "@/lib/rankings-document";
import type { ParsedSnakeChart } from "@/lib/ratings/import";
import { sampleRankingsDoc } from "../../apps/planner/rankings-fixtures";

describe("bracket order", () => {
    it("puts the saved order first, then other brackets in the order they appear", () => {
        expect(orderBrackets(["White Strong", "White Strong"], ["Red Strong", null, "White Strong", "Red Weak"])).toEqual(["White Strong", "Red Strong", "Red Weak"]);
        expect(docBracketOrder(sampleRankingsDoc())).toEqual(["Red Strong", "White Strong"]);
        expect(docBracketOrder(sampleRankingsDoc({ bracketOrder: ["White Strong"] }))).toEqual(["White Strong", "Red Strong"]);
    });
});

describe("rankedTeamCount", () => {
    it("counts the same teams composite ranks", () => {
        const base = sampleRankingsDoc();
        const doc = sampleRankingsDoc({
            teams: [
                ...base.teams.map((t) => (t.number === "904" ? { ...t, excluded: true } : t)),
                { number: "905", name: "Pinewood M1", startingBracket: null, excluded: false },
            ],
        });
        const { games, teams, options } = toRatingInputs(doc);
        expect(rankedTeamCount(doc)).toBe(composite(games, teams, doc.method, options).ranked.length);
        expect(rankedTeamCount(doc)).toBe(3);
    });
});

describe("snakeChartFit", () => {
    const chart: ParsedSnakeChart = {
        teams: [
            { number: "901", name: null, startingBracket: "Red Strong" },
            { number: "999", name: null, startingBracket: "Red Strong" },
        ],
        brackets: ["Red Strong"],
        unparsed: [],
    };
    const saved = () => {
        const base = sampleRankingsDoc();
        return sampleRankingsDoc({
            teams: base.teams.map((t) => (t.number === "901" ? t : { ...t, startingBracket: null, excluded: t.number === "904" })),
        });
    };

    it("counts against the scope it is given, not every saved team", () => {
        const doc = applySnakeChart(saved(), chart).doc;
        const fit = snakeChartFit(doc, chart, ["901", "902"]);
        expect(fit).toMatchObject({ matched: 1, total: 2, ignored: 1 });
        expect(fit.without.map((t) => t.number)).toEqual(["902"]);
    });

    it("falls back to every team, and never lists excluded ones as missing a bracket", () => {
        const doc = applySnakeChart(saved(), chart).doc;
        const fit = snakeChartFit(doc, chart);
        expect(fit).toMatchObject({ matched: 1, total: 4, ignored: 1 });
        expect(fit.without.map((t) => t.number)).toEqual(["902", "903"]);
    });

    it("reads a schedule's teams from its team list and its games", () => {
        const numbers = scheduleTeamNumbers({
            teams: [{ number: "901", name: "Riverside M1" }],
            games: [{ date: "2026-09-20", time: null, home: "902", away: "903", homeGoals: null, awayGoals: null, rink: null }],
            unparsed: [],
        });
        expect([...numbers].sort()).toEqual(["901", "902", "903"]);
    });
});

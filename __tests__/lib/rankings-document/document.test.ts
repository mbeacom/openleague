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
        ["a repeated level name", (d: RankingsDocument) => (d.method.levels[2] = { name: "R1", size: 6 }), "method.levels.2.name"],
        ["too many starting brackets", (d: RankingsDocument) => (d.bracketOrder = Array.from({ length: 21 }, (_v, i) => `B${i}`)), "bracketOrder"],
    ])("rejects %s with the field path", (_label, mutate, path) => {
        const doc = structuredClone(sample());
        mutate(doc);
        const result = parseRankings(doc);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.issues?.some((issue) => issue.startsWith(path))).toBe(true);
    });

    it("reads an older v1 file without a bracket order", () => {
        const { bracketOrder: _omit, ...older } = sample();
        const result = parseRankings(JSON.parse(JSON.stringify(older)));
        expect(result.ok && result.doc.bracketOrder).toEqual([]);
    });

    it("keeps and cleans the bracket order", () => {
        const result = parseRankings({ ...sample(), bracketOrder: [" Red Strong\u0007", "White Strong"] });
        expect(result.ok && result.doc.bracketOrder).toEqual(["Red Strong", "White Strong"]);
    });

    it("drops unknown keys", () => {
        const result = parseRankings({ ...sample(), extra: 1, meta: { ...sample().meta, junk: true } });
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect("extra" in result.doc).toBe(false);
            expect("junk" in result.doc.meta).toBe(false);
        }
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

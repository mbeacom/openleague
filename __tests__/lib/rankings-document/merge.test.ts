import { describe, expect, it } from "vitest";
import { parseRankings } from "@/lib/rankings-document";
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

    it("resolves a swapped-orientation conflict in the existing game's orientation", () => {
        const first = mergeSchedule(createRankingsDocument({ title: "x" }), parsed([game("901", "902", 3, 1)])).doc;
        const { doc, summary } = mergeSchedule(first, parsed([game("902", "901", 5, 3)]));
        expect(summary.conflicts).toHaveLength(1);
        expect(resolveConflict(doc, summary.conflicts[0], "incoming").games[0]).toMatchObject({ home: "901", away: "902", homeGoals: 3, awayGoals: 5 });
    });

    it("keeps a final game when the incoming one is only scheduled", () => {
        const first = mergeSchedule(createRankingsDocument({ title: "x" }), parsed([game("901", "902", 3, 1)])).doc;
        const { doc, summary } = mergeSchedule(first, parsed([game("901", "902", null, null)]));
        expect(summary).toEqual({ added: 0, updated: 0, unchanged: 1, conflicts: [] });
        expect(doc.games[0]).toMatchObject({ status: "final", homeGoals: 3, awayGoals: 1 });
    });

    it("clamps imported text so the merged document still parses", () => {
        const p = parsed([{ ...game("901", "902", 3, 1), rink: "R".repeat(150) }]);
        p.teams = [
            { number: "901", name: `A\u0007${"N".repeat(200)}` },
            { number: "902", name: "\u0007" },
        ];
        const { doc } = mergeSchedule(createRankingsDocument({ title: "x" }), p);
        expect(doc.teams[0].name).toHaveLength(100);
        expect(doc.teams[0].name).not.toContain("\u0007");
        expect(doc.teams[1].name).toBe("902");
        expect(doc.games[0].rink).toHaveLength(100);
        expect(parseRankings(doc).ok).toBe(true);
        const chart = applySnakeChart(doc, { teams: [{ number: "901", name: null, startingBracket: "B".repeat(60) }, { number: "902", name: null, startingBracket: "\u0007" }], brackets: [], unparsed: [] });
        expect(chart.doc.teams[0].startingBracket).toHaveLength(40);
        expect(chart.doc.teams[1].startingBracket).toBeNull();
        expect(parseRankings(chart.doc).ok).toBe(true);
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
            brackets: ["Red Strong", "White Weak"],
            unparsed: [],
        });
        expect([matched, ignored]).toEqual([1, 1]);
        expect(doc.teams[0]).toMatchObject({ name: "Riverside M1", startingBracket: "Red Strong" });
        expect(doc.teams).toHaveLength(2);
        expect(doc.bracketOrder).toEqual(["Red Strong", "White Weak"]);
        expect(parseRankings(doc).ok).toBe(true);
    });

    it("cleans the chart's bracket order and keeps the old order when the chart has none", () => {
        const base = { ...createRankingsDocument({ title: "x" }), bracketOrder: ["White Strong", "Red Strong"] };
        const cleaned = applySnakeChart(base, { teams: [], brackets: ["  Red Strong\u0007 ", "Red Strong", "", "C".repeat(60)], unparsed: [] }).doc;
        expect(cleaned.bracketOrder).toEqual(["Red Strong", "C".repeat(40)]);
        expect(applySnakeChart(base, { teams: [], brackets: [], unparsed: [] }).doc.bracketOrder).toEqual(["White Strong", "Red Strong"]);
    });
});

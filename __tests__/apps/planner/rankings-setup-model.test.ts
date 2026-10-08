import { describe, expect, it } from "vitest";
import { dayHeading, filterGames, formatRecord, gameDates, groupByDate, recordOf, sectionOfPath, teamRecords } from "@/apps/planner/src/screens/rankings/setup-model";
import { sampleRankingsDoc } from "./rankings-fixtures";

describe("setup-model", () => {
    it("counts each team's record from final games only", () => {
        const records = teamRecords(sampleRankingsDoc().games);
        expect(recordOf(records, "903")).toEqual({ played: 3, wins: 0, losses: 2, ties: 1, goalsFor: 3, goalsAgainst: 18 });
        expect(formatRecord(recordOf(records, "902"))).toBe("2–1–0");
        expect(recordOf(records, "999").played).toBe(0);
    });

    it("sorts games by date then time, untimed last in their day, and keeps each game's index", () => {
        const base = sampleRankingsDoc().games[0];
        const games = [
            { ...base, date: "2026-09-21", time: null },
            { ...base, date: "2026-09-21", time: "18:00" },
            { ...base, date: "2026-09-20", time: "20:00" },
            { ...base, date: "2026-09-21", time: "07:30" },
        ];
        const sorted = filterGames(games, { team: "", status: "all", date: "" });
        expect(sorted.map((g) => g.index)).toEqual([2, 3, 1, 0]);
        expect(groupByDate(sorted).map((d) => [d.date, d.games.length])).toEqual([
            ["2026-09-20", 1],
            ["2026-09-21", 3],
        ]);
        expect(gameDates(games)).toEqual([
            { date: "2026-09-20", count: 1 },
            { date: "2026-09-21", count: 3 },
        ]);
    });

    it("writes a day heading, or the raw text when it isn't a date", () => {
        expect(dayHeading("2026-09-12")).toBe("Sat 12 Sep 2026");
        expect(dayHeading("")).toBe("");
    });

    it("maps a save problem's path to the Setup section holding it", () => {
        expect(sectionOfPath(["teams", 0, "name"])).toBe("teams");
        expect(sectionOfPath(["myTeam"])).toBe("teams");
        expect(sectionOfPath(["games", 3, "home"])).toBe("games");
        expect(sectionOfPath(["method", "levels", 1, "name"])).toBe("rules");
        expect(sectionOfPath(["meta", "title"])).toBe("rules");
        expect(sectionOfPath(["bracketOrder", 2])).toBe("brackets");
        expect(sectionOfPath(["sources", "schedule", "url"])).toBe("pages");
        expect(sectionOfPath(["snapshots"])).toBeUndefined();
        expect(sectionOfPath([])).toBeUndefined();
        expect(sectionOfPath(undefined)).toBeUndefined();
    });
});

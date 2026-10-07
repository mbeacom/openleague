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
            { date: "2026-10-12", time: "08:00", home: "903", away: "904", homeGoals: null, awayGoals: null, status: "scheduled", rink: "Rink B" },
        ],
        myTeam: "903",
        ...overrides,
    };
}

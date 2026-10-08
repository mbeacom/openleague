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

const PROGRAMS = ["Riverside", "Lakeview", "Hilltop", "Brookside", "Pinewood"];
export const LEAGUE_BRACKETS = ["Red Strong", "Red Mid", "Red Weak", "White Strong", "White Mid", "White Weak"];

/**
 * A made-up league at real scale (spec R6: never real data): `count` teams
 * numbered from 901 across six starting brackets, seven levels holding 47
 * (6 + 6 + 5 × 7), and a seeded schedule of about six games each. The
 * second-to-last team has no games and the last is excluded, so 49 are ranked
 * and the two lowest fall below the last level. Deterministic, so every run is
 * identical.
 */
export function leagueRankingsDoc(count = 51): RankingsDocument {
    let seed = 7;
    const random = () => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648;
    };
    const teams = Array.from({ length: count }, (_v, i) => ({
        number: String(901 + i),
        name: `${PROGRAMS[i % PROGRAMS.length]} M${Math.floor(i / PROGRAMS.length) + 1}`,
        startingBracket: LEAGUE_BRACKETS[Math.min(LEAGUE_BRACKETS.length - 1, Math.floor((i * LEAGUE_BRACKETS.length) / count))],
        excluded: i === count - 1,
    }));
    // Strength mostly follows the bracket, with enough noise that some teams move.
    const strength = teams.map((_t, i) => 10 - (i * 8) / count + (random() - 0.5) * 5);
    const games: RankingsDocument["games"] = [];
    const playing = count - 2;
    for (let round = 0; round < 3; round++) {
        for (let i = 0; i < playing; i++) {
            const j = (i + 1 + Math.floor(random() * 6) + round * 7) % playing;
            if (i === j) continue;
            const diff = strength[i] - strength[j];
            const homeGoals = Math.max(0, Math.round(3 + diff / 1.5 + (random() - 0.5) * 4));
            const awayGoals = Math.max(0, Math.round(3 - diff / 1.5 + (random() - 0.5) * 4));
            const day = 1 + ((round * playing + i) % 28);
            games.push({
                date: `2026-09-${String(day).padStart(2, "0")}`,
                time: "09:00",
                home: teams[i].number,
                away: teams[j].number,
                homeGoals,
                awayGoals,
                status: "final",
                rink: i % 2 ? "Rink A" : "Rink B",
            });
        }
    }
    games.push({ date: "2026-09-30", time: "10:00", home: teams[count - 1].number, away: teams[0].number, homeGoals: 1, awayGoals: 4, status: "final", rink: "Rink A" });
    const base = createRankingsDocument({
        title: "Fall Pre-season",
        method: {
            preset: "test",
            goalCap: 8,
            walkush: { variant: "plus-one" },
            lowConfidenceGames: 5,
            levels: ["A1", "A2", "B1", "B2", "C1", "C2", "C3"].map((name, i) => ({ name, size: i < 2 ? 6 : 7 })),
        },
    });
    return { ...base, teams, games, myTeam: teams[17].number, bracketOrder: LEAGUE_BRACKETS };
}

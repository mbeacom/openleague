/** Made-up league schedules for the schedule pull (spec R6): never real league data. */
import type { ParsedSchedule } from "@/lib/ratings/import";
import type { SchedulePull } from "@/lib/rankings-document";

const PROGRAMS = ["Riverside", "Lakeview", "Hilltop", "Brookside", "Pinewood"];

/** `count` games among 40 fictional 9xx teams, about a fifth unplayed, on Rink A and Rink B. */
export function fictionalSchedule(count = 190): ParsedSchedule {
    const teams = Array.from({ length: 40 }, (_, i) => ({
        number: String(901 + i),
        name: `${PROGRAMS[i % PROGRAMS.length]} M${(i % 4) + 1}`,
    }));
    const games = Array.from({ length: count }, (_, i) => {
        const home = teams[i % teams.length].number;
        const away = teams[(i * 7 + 3) % teams.length].number === home ? teams[(i + 1) % teams.length].number : teams[(i * 7 + 3) % teams.length].number;
        const day = 1 + (i % 28);
        const month = 9 + Math.floor(i / 120);
        const played = i % 5 !== 4;
        return {
            date: `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
            time: `${String(8 + (i % 12)).padStart(2, "0")}:${i % 2 ? "40" : "05"}`,
            home,
            away,
            homeGoals: played ? i % 9 : null,
            awayGoals: played ? (i * 3) % 7 : null,
            rink: i % 3 === 0 ? null : i % 3 === 1 ? "Rink A" : "Rink B",
        };
    });
    // The parser lists teams in first-seen order; keep only teams that played.
    const seen: string[] = [];
    for (const game of games) for (const n of [game.home, game.away]) if (!seen.includes(n)) seen.push(n);
    return { games, teams: seen.map((n) => teams.find((t) => t.number === n)!), unparsed: [] };
}

export function fictionalPull(schedule: ParsedSchedule = fictionalSchedule()): SchedulePull {
    return { sourceUrl: "https://league.example.org/schedule?division=8u", fetchedAt: "2026-10-07T12:00:00.000Z", schedule };
}

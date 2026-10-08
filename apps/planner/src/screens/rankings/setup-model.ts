/**
 * Pure helpers behind the Setup screen's Teams and Games lists: each team's
 * record from its final games, the list filters, and games grouped by day.
 * Also which section a save problem belongs to. Pure, so these are tested
 * without rendering.
 */
import { format, parseISO } from "date-fns";
import type { RankingsGame, RankingsTeam } from "@/lib/rankings-document";
import type { RankingsSetupSection } from "../../routes";

export interface TeamRecord {
    played: number;
    wins: number;
    losses: number;
    ties: number;
    goalsFor: number;
    goalsAgainst: number;
}

const EMPTY_RECORD: TeamRecord = { played: 0, wins: 0, losses: 0, ties: 0, goalsFor: 0, goalsAgainst: 0 };

/** Every team's record from final games only; a team with none gets all zeros. */
export function teamRecords(games: readonly RankingsGame[]): Map<string, TeamRecord> {
    const records = new Map<string, TeamRecord>();
    const add = (number: string, scored: number, allowed: number) => {
        const r = { ...(records.get(number) ?? EMPTY_RECORD) };
        r.played += 1;
        r.goalsFor += scored;
        r.goalsAgainst += allowed;
        if (scored > allowed) r.wins += 1;
        else if (scored < allowed) r.losses += 1;
        else r.ties += 1;
        records.set(number, r);
    };
    for (const game of games) {
        if (game.status !== "final" || game.homeGoals === null || game.awayGoals === null) continue;
        add(game.home, game.homeGoals, game.awayGoals);
        add(game.away, game.awayGoals, game.homeGoals);
    }
    return records;
}

export const recordOf = (records: Map<string, TeamRecord>, number: string): TeamRecord => records.get(number) ?? EMPTY_RECORD;

/** "3–2–1": wins, losses, ties. */
export const formatRecord = (r: TeamRecord) => `${r.wins}–${r.losses}–${r.ties}`;

/** Which teams the Teams list shows. */
export type TeamShow = "all" | "excluded" | "no-games";
/** A bracket key, "none" (no starting bracket) or "all". */
export type BracketFilter = number | "none" | "all";

export interface TeamFilter {
    query: string;
    bracket: BracketFilter;
    show: TeamShow;
}

export const DEFAULT_TEAM_FILTER: TeamFilter = { query: "", bracket: "all", show: "all" };

export function filterTeams(
    teams: readonly RankingsTeam[],
    filter: TeamFilter,
    { assigned, records }: { assigned: Record<string, number | null>; records: Map<string, TeamRecord> },
): RankingsTeam[] {
    const query = filter.query.trim().toLowerCase();
    return teams.filter((team) => {
        if (query && !team.number.toLowerCase().includes(query) && !team.name.toLowerCase().includes(query)) return false;
        const key = assigned[team.number] ?? null;
        if (filter.bracket === "none" && key !== null) return false;
        if (typeof filter.bracket === "number" && key !== filter.bracket) return false;
        if (filter.show === "excluded" && !team.excluded) return false;
        if (filter.show === "no-games" && recordOf(records, team.number).played > 0) return false;
        return true;
    });
}

export type GameStatusFilter = "all" | "final" | "scheduled";

export interface GameFilter {
    team: string;
    status: GameStatusFilter;
    date: string;
}

export const DEFAULT_GAME_FILTER: GameFilter = { team: "", status: "all", date: "" };

/** A game with its index in the document, so an edit or delete reaches the right one after sorting. */
export interface IndexedGame {
    index: number;
    game: RankingsGame;
}

const timeKey = (game: RankingsGame) => game.time ?? "99:99";

/** The games that match, by date then time (untimed last in their day), then document order. */
export function filterGames(games: readonly RankingsGame[], filter: GameFilter): IndexedGame[] {
    return games
        .map((game, index) => ({ game, index }))
        .filter(({ game }) => {
            if (filter.team && game.home !== filter.team && game.away !== filter.team) return false;
            if (filter.status !== "all" && game.status !== filter.status) return false;
            if (filter.date && game.date !== filter.date) return false;
            return true;
        })
        .sort((a, b) => a.game.date.localeCompare(b.game.date) || timeKey(a.game).localeCompare(timeKey(b.game)) || a.index - b.index);
}

export interface GameDay {
    date: string;
    games: IndexedGame[];
}

/** Consecutive games on the same date, in the order given. */
export function groupByDate(games: readonly IndexedGame[]): GameDay[] {
    const days: GameDay[] = [];
    for (const entry of games) {
        const last = days.at(-1);
        if (last && last.date === entry.game.date) last.games.push(entry);
        else days.push({ date: entry.game.date, games: [entry] });
    }
    return days;
}

/** Each date with games, ascending, with how many. */
export function gameDates(games: readonly RankingsGame[]): { date: string; count: number }[] {
    const counts = new Map<string, number>();
    for (const game of games) counts.set(game.date, (counts.get(game.date) ?? 0) + 1);
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count }));
}

/** "Sat 12 Sep 2026" for a YYYY-MM-DD date; the raw text if it isn't one. */
export function dayHeading(date: string): string {
    const parsed = parseISO(date);
    return Number.isNaN(parsed.getTime()) ? date : format(parsed, "EEE d MMM yyyy");
}

/** Setup's section for each top-level field of the rankings document. */
const SECTION_OF_FIELD: ReadonlyMap<string, RankingsSetupSection> = new Map([
    ["meta", "rules"],
    ["method", "rules"],
    ["bracketOrder", "brackets"],
    ["teams", "teams"],
    ["myTeam", "teams"],
    ["games", "games"],
    ["sources", "pages"],
]);

/** The Setup section holding the field a save problem's path points into, if any. */
export function sectionOfPath(path: unknown): RankingsSetupSection | undefined {
    if (!Array.isArray(path) || typeof path[0] !== "string") return undefined;
    return SECTION_OF_FIELD.get(path[0]);
}

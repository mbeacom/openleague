/**
 * Re-import merges (spec, Import and editing). A game's key is its date, the
 * unordered pair of teams, and its order among that pair's games that day.
 * Scores are compared from the existing game's home/away orientation, so a page
 * that lists the matchup the other way round never duplicates or conflicts.
 */
import type { ParsedSchedule, ParsedSnakeChart } from "@/lib/ratings/import";
import { compareTeamNumbers } from "@/lib/ratings";
import type { RankingsDocument, RankingsGame } from "./document";

interface Keyable {
    date: string;
    time: string | null;
    home: string;
    away: string;
}

export function gameKeys(games: readonly Keyable[]): string[] {
    const order = games.map((game, index) => ({ game, index })).sort((a, b) => (a.game.time ?? "").localeCompare(b.game.time ?? "") || a.index - b.index);
    const counts = new Map<string, number>();
    const keys = new Array<string>(games.length);
    for (const { game, index } of order) {
        const pair = [game.home, game.away].sort(compareTeamNumbers).join("~");
        const base = `${game.date}|${pair}`;
        const n = counts.get(base) ?? 0;
        counts.set(base, n + 1);
        keys[index] = `${base}|${n}`;
    }
    return keys;
}

const goalsOf = (game: RankingsGame, team: string) => (team === game.home ? game.homeGoals : game.awayGoals);

/** The incoming game's result, oriented to `like`'s home and away. */
function orientedLike(like: RankingsGame, incoming: RankingsGame): RankingsGame {
    return { ...like, homeGoals: goalsOf(incoming, like.home), awayGoals: goalsOf(incoming, like.away), status: incoming.status };
}

export interface GameConflict {
    key: string;
    existing: RankingsGame;
    incoming: RankingsGame;
}

export interface MergeSummary {
    added: number;
    updated: number;
    unchanged: number;
    conflicts: GameConflict[];
}

export function mergeSchedule(doc: RankingsDocument, parsed: ParsedSchedule): { doc: RankingsDocument; summary: MergeSummary } {
    const games = [...doc.games];
    const index = new Map(gameKeys(games).map((key, i) => [key, i]));
    const summary: MergeSummary = { added: 0, updated: 0, unchanged: 0, conflicts: [] };
    const incomingKeys = gameKeys(parsed.games);

    parsed.games.forEach((p, i) => {
        const incoming: RankingsGame = {
            date: p.date,
            time: p.time,
            home: p.home,
            away: p.away,
            homeGoals: p.homeGoals,
            awayGoals: p.awayGoals,
            status: p.homeGoals === null || p.awayGoals === null ? "scheduled" : "final",
            rink: p.rink,
        };
        if (incoming.status === "scheduled") {
            incoming.homeGoals = null;
            incoming.awayGoals = null;
        }
        const at = index.get(incomingKeys[i]);
        if (at === undefined) {
            games.push(incoming);
            summary.added += 1;
            return;
        }
        const existing = games[at];
        if (incoming.status === "scheduled") {
            summary.unchanged += 1;
            return;
        }
        if (existing.status === "scheduled") {
            games[at] = { ...orientedLike(existing, incoming), time: existing.time ?? incoming.time, rink: existing.rink ?? incoming.rink };
            summary.updated += 1;
            return;
        }
        if (goalsOf(incoming, existing.home) === existing.homeGoals && goalsOf(incoming, existing.away) === existing.awayGoals) {
            summary.unchanged += 1;
            return;
        }
        summary.conflicts.push({ key: incomingKeys[i], existing, incoming });
    });

    const teams = [...doc.teams];
    const known = new Set(teams.map((team) => team.number));
    for (const team of parsed.teams) {
        if (known.has(team.number)) continue;
        known.add(team.number);
        teams.push({ number: team.number, name: team.name, startingBracket: null, excluded: false });
    }
    for (const game of games) {
        for (const number of [game.home, game.away]) {
            if (known.has(number)) continue;
            known.add(number);
            teams.push({ number, name: number, startingBracket: null, excluded: false });
        }
    }
    return { doc: { ...doc, games, teams }, summary };
}

export function resolveConflict(doc: RankingsDocument, conflict: GameConflict, choice: "existing" | "incoming"): RankingsDocument {
    if (choice === "existing") return doc;
    const at = gameKeys(doc.games).indexOf(conflict.key);
    if (at === -1) return doc;
    const games = [...doc.games];
    games[at] = orientedLike(games[at], conflict.incoming);
    return { ...doc, games };
}

export function applySnakeChart(doc: RankingsDocument, chart: ParsedSnakeChart): { doc: RankingsDocument; matched: number; ignored: number } {
    const brackets = new Map(chart.teams.map((team) => [team.number, team.startingBracket]));
    let matched = 0;
    const teams = doc.teams.map((team) => {
        const bracket = brackets.get(team.number);
        if (bracket === undefined) return team;
        matched += 1;
        return { ...team, startingBracket: bracket };
    });
    return { doc: { ...doc, teams }, matched, ignored: chart.teams.length - matched };
}

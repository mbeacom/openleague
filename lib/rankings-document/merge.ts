/**
 * Re-import merges (spec, Import and editing). A game's key is its date, the
 * unordered pair of teams, and its order among that pair's games that day.
 * Incoming games match saved ones on date and pair, then on exact time, then in
 * time order among those left, so a newly listed same-day game never takes
 * another game's result. Scores are compared from the existing game's
 * home/away orientation, so a page that lists the matchup the other way round
 * never duplicates or conflicts.
 */
import type { ParsedSchedule, ParsedSnakeChart } from "@/lib/ratings/import";
import { compareTeamNumbers } from "@/lib/ratings";
import { MAX_BRACKETS, MAX_BRACKET_LENGTH, cleanImportedText, type RankingsDocument, type RankingsGame, type RankingsTeam } from "./document";

interface Keyable {
    date: string;
    time: string | null;
    home: string;
    away: string;
}

const pairOf = (game: Keyable) => `${game.date}|${[game.home, game.away].sort(compareTeamNumbers).join("~")}`;

function inTimeOrder<T extends Keyable>(games: readonly T[]): { game: T; index: number }[] {
    return games.map((game, index) => ({ game, index })).sort((a, b) => (a.game.time ?? "").localeCompare(b.game.time ?? "") || a.index - b.index);
}

export function gameKeys(games: readonly Keyable[]): string[] {
    const counts = new Map<string, number>();
    const keys = new Array<string>(games.length);
    for (const { game, index } of inTimeOrder(games)) {
        const base = pairOf(game);
        const n = counts.get(base) ?? 0;
        counts.set(base, n + 1);
        keys[index] = `${base}|${n}`;
    }
    return keys;
}

/** For each incoming game, the index of the existing game it matches, or -1 for a new game. */
function matchGames(existing: readonly Keyable[], incoming: readonly Keyable[]): number[] {
    const open = new Map<string, number[]>();
    for (const { game, index } of inTimeOrder(existing)) {
        const base = pairOf(game);
        open.set(base, [...(open.get(base) ?? []), index]);
    }
    const matches = new Array<number>(incoming.length).fill(-1);
    const ordered = inTimeOrder(incoming);
    for (const { game, index } of ordered) {
        if (game.time === null) continue;
        const candidates = open.get(pairOf(game)) ?? [];
        const at = candidates.findIndex((i) => existing[i].time === game.time);
        if (at !== -1) matches[index] = candidates.splice(at, 1)[0];
    }
    for (const { game, index } of ordered) {
        if (matches[index] !== -1) continue;
        const candidates = open.get(pairOf(game));
        if (candidates?.length) matches[index] = candidates.shift()!;
    }
    return matches;
}

const goalsOf = (game: RankingsGame, team: string) => (team === game.home ? game.homeGoals : game.awayGoals);

/** The incoming game's result, oriented to `like`'s home and away. */
function orientedLike(like: RankingsGame, incoming: RankingsGame): RankingsGame {
    return { ...like, homeGoals: goalsOf(incoming, like.home), awayGoals: goalsOf(incoming, like.away), status: incoming.status };
}

export interface GameConflict {
    /** The existing game's key in the saved document: stable while the import screen is open. */
    key: string;
    /** The existing game's position in the merged document's games. */
    index: number;
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
    const existingKeys = gameKeys(games);
    const matches = matchGames(games, parsed.games);
    const summary: MergeSummary = { added: 0, updated: 0, unchanged: 0, conflicts: [] };

    parsed.games.forEach((p, i) => {
        const incoming: RankingsGame = {
            date: p.date,
            time: p.time,
            home: p.home,
            away: p.away,
            homeGoals: p.homeGoals,
            awayGoals: p.awayGoals,
            status: p.homeGoals === null || p.awayGoals === null ? "scheduled" : "final",
            rink: cleanImportedText(p.rink, 100) || null,
        };
        if (incoming.status === "scheduled") {
            incoming.homeGoals = null;
            incoming.awayGoals = null;
        }
        const at = matches[i];
        if (at === -1) {
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
        summary.conflicts.push({ key: existingKeys[at], index: at, existing, incoming });
    });

    const teams = [...doc.teams];
    const known = new Set(teams.map((team) => team.number));
    for (const team of parsed.teams) {
        if (known.has(team.number)) continue;
        known.add(team.number);
        teams.push({ number: team.number, name: cleanImportedText(team.name, 100) || team.number, startingBracket: null, excluded: false });
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
    const at = conflict.index;
    const target = doc.games[at];
    if (!target || pairOf(target) !== pairOf(conflict.existing)) return doc;
    const games = [...doc.games];
    games[at] = orientedLike(target, conflict.incoming);
    return { ...doc, games };
}

export function applySnakeChart(doc: RankingsDocument, chart: ParsedSnakeChart): { doc: RankingsDocument; matched: number; ignored: number } {
    const brackets = new Map(chart.teams.map((team) => [team.number, team.startingBracket]));
    let matched = 0;
    const teams = doc.teams.map((team) => {
        const bracket = brackets.get(team.number);
        if (bracket === undefined) return team;
        matched += 1;
        return { ...team, startingBracket: cleanImportedText(bracket, MAX_BRACKET_LENGTH) || null };
    });
    // Only brackets a team starts in: a chart's other columns (or other age divisions) don't belong.
    // A saved team the chart doesn't list keeps its bracket, so that bracket keeps its place too.
    const held = new Set(teams.map((team) => team.startingBracket).filter((bracket): bracket is string => !!bracket));
    const order = [...new Set(chart.brackets.map((bracket) => cleanImportedText(bracket, MAX_BRACKET_LENGTH)).filter((bracket) => held.has(bracket)))].slice(0, MAX_BRACKETS);
    return { doc: { ...doc, teams, bracketOrder: order.length > 0 ? order : doc.bracketOrder }, matched, ignored: chart.teams.length - matched };
}

export interface SnakeChartFit {
    /** Teams in scope that the chart lists (and so gave a starting bracket). */
    matched: number;
    /** Teams in scope. */
    total: number;
    /** Chart teams that match no team in the document. */
    ignored: number;
    /** Teams in scope still without a starting bracket; excluded teams aren't listed. */
    without: RankingsTeam[];
}

/**
 * How a snake chart fits the teams an import concerns. `doc` is the document
 * after `applySnakeChart`. `scope` is the team numbers the import is about
 * (the schedule just read); without one, every team in the document.
 */
export function snakeChartFit(doc: RankingsDocument, chart: ParsedSnakeChart, scope?: Iterable<string>): SnakeChartFit {
    const inScope = scope ? new Set(scope) : null;
    const teams = inScope ? doc.teams.filter((team) => inScope.has(team.number)) : doc.teams;
    const charted = new Set(chart.teams.map((team) => team.number));
    const known = new Set(doc.teams.map((team) => team.number));
    return {
        matched: teams.filter((team) => charted.has(team.number)).length,
        total: teams.length,
        ignored: [...charted].filter((number) => !known.has(number)).length,
        without: teams.filter((team) => !team.startingBracket && !team.excluded),
    };
}

/** Every team number a parsed schedule mentions: its team list and both sides of every game. */
export function scheduleTeamNumbers(parsed: ParsedSchedule): Set<string> {
    const numbers = new Set(parsed.teams.map((team) => team.number));
    for (const game of parsed.games) {
        numbers.add(game.home);
        numbers.add(game.away);
    }
    return numbers;
}

/**
 * The CSHL-compatible RPI (spec, Calculation): (Lodin scaled + Walkush scaled) / 2,
 * each min–max scaled to 0–20 over the rated teams that aren't excluded; then
 * rank, levels by method.levels sizes, movement against the starting bracket,
 * low confidence and connected groups.
 */
import { srs } from "./srs";
import { compareTeamNumbers, type RatingGame, type RatingMethod, type RatingTeam } from "./types";
import { walkushApprox } from "./walkush";

export type Movement = "up" | "same" | "down";

export interface TeamRating {
    number: string;
    name: string;
    startingBracket: string | null;
    excluded: boolean;
    games: number;
    wins: number;
    losses: number;
    ties: number;
    goalsFor: number;
    goalsAgainst: number;
    agd: number | null;
    sched: number | null;
    lodin: number | null;
    walkush: number | null;
    lodinScaled: number | null;
    walkushScaled: number | null;
    rpi: number | null;
    rank: number | null;
    level: string | null;
    /** Suggested level against the levels the team's starting bracket was seeded into; null without a bracket or a rank. */
    movement: Movement | null;
    lowConfidence: boolean;
    component: number | null;
}

export interface RatingsResult {
    /** Ranked teams by rank, then unranked teams by number. */
    teams: TeamRating[];
    ranked: TeamRating[];
    byNumber: Map<string, TeamRating>;
    /** Connected groups among ranked teams; above 1, ratings aren't comparable across groups. */
    componentCount: number;
    converged: boolean;
}

export interface CompositeOptions {
    /**
     * Starting brackets, strongest first (the snake chart's column order). Brackets
     * missing from it follow in the order they first appear in `teams`. Team
     * numbers never set this order (spec, Context).
     */
    bracketOrder?: readonly string[];
}

export function scale0to20(values: Map<string, number>, include: readonly string[]): Map<string, number> {
    const present = include.filter((team) => values.has(team));
    const list = present.map((team) => values.get(team)!);
    const min = Math.min(...list);
    const max = Math.max(...list);
    return new Map(present.map((team) => [team, max === min ? 10 : (20 * (values.get(team)! - min)) / (max - min)]));
}

/** Rank-ordered teams cut into named levels; teams past the total size get none. */
function cutLevels(order: readonly string[], method: RatingMethod): Map<string, string> {
    const levels = new Map<string, string>();
    let index = 0;
    for (const level of method.levels) {
        for (let k = 0; k < level.size && index < order.length; k++, index++) levels.set(order[index], level.name);
    }
    return levels;
}

function components(games: readonly RatingGame[]): Map<string, number> {
    const parent = new Map<string, string>();
    const find = (team: string): string => {
        let root = team;
        while (parent.get(root) !== root) root = parent.get(root)!;
        parent.set(team, root);
        return root;
    };
    for (const game of games) {
        for (const team of [game.home, game.away]) if (!parent.has(team)) parent.set(team, team);
        const a = find(game.home);
        const b = find(game.away);
        if (a !== b) parent.set(compareTeamNumbers(a, b) <= 0 ? b : a, compareTeamNumbers(a, b) <= 0 ? a : b);
    }
    const roots = [...new Set([...parent.keys()].map(find))].sort(compareTeamNumbers);
    const ids = new Map(roots.map((root, i) => [root, i + 1]));
    return new Map([...parent.keys()].map((team) => [team, ids.get(find(team))!]));
}

/**
 * Starting brackets, strongest first: `bracketOrder` (deduplicated), then any
 * other bracket in `brackets` in the order it first appears. The one rule for
 * bracket order, shared by the calculation and the screens.
 */
export function orderBrackets(bracketOrder: readonly string[], brackets: Iterable<string | null | undefined>): string[] {
    const order = [...new Set(bracketOrder)];
    for (const bracket of brackets) if (bracket && !order.includes(bracket)) order.push(bracket);
    return order;
}

/**
 * For each starting bracket, the range of level indices its seeded positions
 * fall in: ranked teams ordered by bracket (strongest first), cut by the level
 * sizes, with every position past the last level in one virtual level
 * (index `levels.length`). Order within a bracket doesn't matter: the range
 * covers all of the bracket's positions.
 */
function bracketSpans(
    eligible: readonly string[],
    roster: ReadonlyMap<string, RatingTeam>,
    method: RatingMethod,
    bracketOrder: readonly string[],
): Map<string, { min: number; max: number }> {
    const order = orderBrackets(
        bracketOrder,
        eligible.map((number) => roster.get(number)!.startingBracket),
    );
    const seeded: string[] = [];
    for (const bracket of order) {
        for (const number of eligible) if (roster.get(number)!.startingBracket === bracket) seeded.push(bracket);
    }
    const spans = new Map<string, { min: number; max: number }>();
    let position = 0;
    const indexAt = (p: number) => {
        let end = 0;
        for (let i = 0; i < method.levels.length; i++) {
            end += method.levels[i].size;
            if (p < end) return i;
        }
        return method.levels.length;
    };
    for (const bracket of seeded) {
        const index = indexAt(position++);
        const current = spans.get(bracket);
        spans.set(bracket, current ? { min: Math.min(current.min, index), max: Math.max(current.max, index) } : { min: index, max: index });
    }
    return spans;
}

export function composite(
    games: readonly RatingGame[],
    teams: readonly RatingTeam[],
    method: RatingMethod,
    options: CompositeOptions = {},
): RatingsResult {
    const roster = new Map<string, RatingTeam>(teams.map((team) => [team.number, team]));
    for (const game of games) {
        for (const number of [game.home, game.away]) if (!roster.has(number)) roster.set(number, { number, name: number });
    }

    const lodinParts = srs(games, method.goalCap);
    const walkush = walkushApprox(games, method.walkush.variant);
    const groups = components(games);

    const record = new Map<string, { games: number; wins: number; losses: number; ties: number; goalsFor: number; goalsAgainst: number }>();
    const tally = (team: string, goalsFor: number, goalsAgainst: number) => {
        const r = record.get(team) ?? { games: 0, wins: 0, losses: 0, ties: 0, goalsFor: 0, goalsAgainst: 0 };
        r.games += 1;
        r.goalsFor += goalsFor;
        r.goalsAgainst += goalsAgainst;
        if (goalsFor > goalsAgainst) r.wins += 1;
        else if (goalsFor < goalsAgainst) r.losses += 1;
        else r.ties += 1;
        record.set(team, r);
    };
    for (const game of games) {
        tally(game.home, game.homeGoals, game.awayGoals);
        tally(game.away, game.awayGoals, game.homeGoals);
    }

    const lodin = new Map<string, number>();
    for (const team of lodinParts.rating.keys()) {
        const agdVal = lodinParts.agd.get(team)!;
        const schedVal = lodinParts.sched.get(team)!;
        lodin.set(team, agdVal + schedVal);
    }
    const eligible = [...roster.values()].filter((team) => !team.excluded && lodin.has(team.number)).map((team) => team.number);
    const lodinScaled = scale0to20(lodin, eligible);
    const walkushScaled = scale0to20(walkush.value, eligible);
    const rpi = new Map(eligible.map((team) => [team, (lodinScaled.get(team)! + walkushScaled.get(team)!) / 2]));

    const order = [...eligible].sort((a, b) => rpi.get(b)! - rpi.get(a)! || lodin.get(b)! - lodin.get(a)! || compareTeamNumbers(a, b));
    const levels = cutLevels(order, method);

    const span = bracketSpans(eligible, roster, method, options.bracketOrder ?? []);
    const levelIndex = new Map(method.levels.map((level, i) => [level.name, i]));

    const rows = new Map<string, TeamRating>();
    for (const team of roster.values()) {
        const r = record.get(team.number) ?? { games: 0, wins: 0, losses: 0, ties: 0, goalsFor: 0, goalsAgainst: 0 };
        const rank = order.indexOf(team.number);
        const level = levels.get(team.number) ?? null;
        const seededInto = team.startingBracket ? span.get(team.startingBracket) : undefined;
        let movement: Movement | null = null;
        if (rank !== -1 && seededInto) {
            // Ranked past the last level counts as one virtual level after it.
            const current = level === null ? method.levels.length : levelIndex.get(level)!;
            movement = current < seededInto.min ? "up" : current > seededInto.max ? "down" : "same";
        }
        rows.set(team.number, {
            number: team.number,
            name: team.name,
            startingBracket: team.startingBracket ?? null,
            excluded: team.excluded ?? false,
            ...r,
            agd: lodinParts.agd.get(team.number) ?? null,
            sched: lodinParts.sched.get(team.number) ?? null,
            lodin: lodin.get(team.number) ?? null,
            walkush: walkush.value.get(team.number) ?? null,
            lodinScaled: lodinScaled.get(team.number) ?? null,
            walkushScaled: walkushScaled.get(team.number) ?? null,
            rpi: rpi.get(team.number) ?? null,
            rank: rank === -1 ? null : rank + 1,
            level,
            movement,
            lowConfidence: r.games < method.lowConfidenceGames,
            component: groups.get(team.number) ?? null,
        });
    }

    const ranked = order.map((number) => rows.get(number)!);
    const unranked = [...rows.values()].filter((row) => row.rank === null).sort((a, b) => compareTeamNumbers(a.number, b.number));
    return {
        teams: [...ranked, ...unranked],
        ranked,
        byNumber: rows,
        componentCount: new Set(ranked.map((row) => row.component)).size,
        converged: lodinParts.converged && walkush.converged,
    };
}

/** The ratings as if the hypothetical results had happened. Inputs are never changed. */
export function whatIf(
    games: readonly RatingGame[],
    hypotheticals: readonly RatingGame[],
    teams: readonly RatingTeam[],
    method: RatingMethod,
    options: CompositeOptions = {},
): RatingsResult {
    return composite([...games, ...hypotheticals], teams, method, options);
}

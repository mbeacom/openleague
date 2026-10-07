/**
 * Approximation of the CSHL "Walkush" half (spec, Calculation): per game a
 * goal ratio (GF + 1) / (GA + 1); ratings solve rating_t / rating_o ≈ ratio
 * on average. Iterated in log space (l = ln rating) with the same ½ damping as
 * srs, centered so the geometric mean is 1. Reported as l. Scaling is affine
 * invariant, so the reported offset does not matter. Always labelled "approx."
 */
import { MAX_RATING_ITERATIONS, RATING_TOLERANCE, canonicalGames, compareTeamNumbers, mean, type RatingGame, type WalkushVariant } from "./types";

interface Side {
    opponent: string;
    logRatio: number;
}

function logRatio(goalsFor: number, goalsAgainst: number, variant: WalkushVariant): number {
    switch (variant) {
        case "plus-one":
            return Math.log((goalsFor + 1) / (goalsAgainst + 1));
    }
}

export function walkushApprox(games: readonly RatingGame[], variant: WalkushVariant): { value: Map<string, number>; converged: boolean } {
    const sides = new Map<string, Side[]>();
    const add = (team: string, side: Side) => {
        const list = sides.get(team);
        if (list) list.push(side);
        else sides.set(team, [side]);
    };
    for (const game of canonicalGames(games)) {
        add(game.home, { opponent: game.away, logRatio: logRatio(game.homeGoals, game.awayGoals, variant) });
        add(game.away, { opponent: game.home, logRatio: logRatio(game.awayGoals, game.homeGoals, variant) });
    }
    const teams = [...sides.keys()].sort(compareTeamNumbers);
    let value = new Map(teams.map((team) => [team, 0]));
    let converged = teams.length === 0;
    for (let iteration = 0; iteration < MAX_RATING_ITERATIONS && !converged; iteration++) {
        const next = new Map<string, number>();
        for (const team of teams) {
            const target = Math.log(mean(sides.get(team)!.map((side) => Math.exp(side.logRatio + value.get(side.opponent)!))));
            next.set(team, 0.5 * value.get(team)! + 0.5 * target);
        }
        const center = mean(teams.map((team) => next.get(team)!));
        let delta = 0;
        for (const team of teams) {
            const v = next.get(team)! - center;
            next.set(team, v);
            delta = Math.max(delta, Math.abs(v - value.get(team)!));
        }
        value = next;
        converged = delta < RATING_TOLERANCE;
    }
    return { value, converged };
}

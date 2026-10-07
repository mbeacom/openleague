/**
 * Simple rating system: rating = AGD + mean opponent rating, centered on 0.
 * This is the "Lodin" half of the CSHL RPI (spec, Calculation). Solved by
 * damped iteration: plain Jacobi oscillates on two-colourable schedules (two
 * teams that only played each other), and damping by ½ keeps the same fixed
 * point while removing the oscillation.
 */
import { MAX_RATING_ITERATIONS, RATING_TOLERANCE, canonicalGames, capMargin, compareTeamNumbers, mean, type RatingGame } from "./types";

export interface SrsResult {
    agd: Map<string, number>;
    sched: Map<string, number>;
    rating: Map<string, number>;
    converged: boolean;
}

interface Side {
    opponent: string;
    margin: number;
}

export function srs(games: readonly RatingGame[], goalCap: number): SrsResult {
    const sides = new Map<string, Side[]>();
    const add = (team: string, side: Side) => {
        const list = sides.get(team);
        if (list) list.push(side);
        else sides.set(team, [side]);
    };
    for (const game of canonicalGames(games)) {
        const margin = capMargin(game.homeGoals - game.awayGoals, goalCap);
        add(game.home, { opponent: game.away, margin });
        add(game.away, { opponent: game.home, margin: -margin });
    }
    const teams = [...sides.keys()].sort(compareTeamNumbers);
    const agd = new Map(teams.map((team) => [team, mean(sides.get(team)!.map((side) => side.margin))]));

    let rating = new Map(agd);
    let converged = teams.length === 0;
    for (let iteration = 0; iteration < MAX_RATING_ITERATIONS && !converged; iteration++) {
        const next = new Map<string, number>();
        for (const team of teams) {
            const target = agd.get(team)! + mean(sides.get(team)!.map((side) => rating.get(side.opponent)!));
            next.set(team, 0.5 * rating.get(team)! + 0.5 * target);
        }
        const center = mean(teams.map((team) => next.get(team)!));
        let delta = 0;
        for (const team of teams) {
            const value = next.get(team)! - center;
            next.set(team, value);
            delta = Math.max(delta, Math.abs(value - rating.get(team)!));
        }
        rating = next;
        converged = delta < RATING_TOLERANCE;
    }

    const sched = new Map(teams.map((team) => [team, mean(sides.get(team)!.map((side) => rating.get(side.opponent)!))]));
    return { agd, sched, rating, converged };
}

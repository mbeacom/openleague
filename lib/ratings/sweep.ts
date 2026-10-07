/**
 * What-if sweep (spec, What-if): the chosen team's rank, level and RPI at every
 * final margin from −cap to +cap for one fixture. The losing (or tied) side is
 * assumed to score `otherGoals`, which matters only to the Walkush ratio.
 */
import { composite, type CompositeOptions } from "./composite";
import type { RatingGame, RatingMethod, RatingTeam } from "./types";

export interface SweepCell {
    margin: number;
    teamGoals: number;
    opponentGoals: number;
    rank: number | null;
    level: string | null;
    rpi: number | null;
    lodin: number | null;
}

export const SWEEP_OTHER_GOALS = 2;

export function marginSweep(
    games: readonly RatingGame[],
    fixture: { home: string; away: string },
    team: string,
    teams: readonly RatingTeam[],
    method: RatingMethod,
    otherGoals: number = SWEEP_OTHER_GOALS,
    options: CompositeOptions = {},
): SweepCell[] {
    if (team !== fixture.home && team !== fixture.away) throw new Error("The swept team must play in the fixture");
    const cells: SweepCell[] = [];
    for (let margin = -method.goalCap; margin <= method.goalCap; margin++) {
        const teamGoals = otherGoals + Math.max(margin, 0);
        const opponentGoals = otherGoals + Math.max(-margin, 0);
        const game: RatingGame =
            team === fixture.home
                ? { home: fixture.home, away: fixture.away, homeGoals: teamGoals, awayGoals: opponentGoals }
                : { home: fixture.home, away: fixture.away, homeGoals: opponentGoals, awayGoals: teamGoals };
        const row = composite([...games, game], teams, method, options).byNumber.get(team);
        cells.push({ margin, teamGoals, opponentGoals, rank: row?.rank ?? null, level: row?.level ?? null, rpi: row?.rpi ?? null, lodin: row?.lodin ?? null });
    }
    return cells;
}

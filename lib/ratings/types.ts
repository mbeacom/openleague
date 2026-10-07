/**
 * Placement ratings (static rankings spec, 2026-10-07). Pure: no React, DOM,
 * Next or server imports (ADR-0020 portability). Team numbers are strings and
 * are the key everywhere (spec R3).
 */

export interface RatingGame {
    home: string;
    away: string;
    homeGoals: number;
    awayGoals: number;
}

export interface RatingTeam {
    number: string;
    name: string;
    startingBracket?: string | null;
    /** Still an opponent in others' schedules; never scaled, ranked or levelled (spec R5). */
    excluded?: boolean;
}

export interface LevelSpec {
    name: string;
    size: number;
}

export type WalkushVariant = "plus-one";

export interface RatingMethod {
    preset: string;
    goalCap: number;
    walkush: { variant: WalkushVariant };
    lowConfidenceGames: number;
    levels: LevelSpec[];
}

export const CSHL_8U_METHOD: RatingMethod = {
    preset: "cshl-8u",
    goalCap: 8,
    walkush: { variant: "plus-one" },
    lowConfidenceGames: 3,
    levels: [
        { name: "R1", size: 6 },
        { name: "R2", size: 6 },
        { name: "R3", size: 7 },
        { name: "W1", size: 6 },
        { name: "W2", size: 8 },
        { name: "W3", size: 6 },
        { name: "W4", size: 7 },
    ],
};

export const RATING_TOLERANCE = 1e-9;
export const MAX_RATING_ITERATIONS = 10_000;

export function capMargin(margin: number, cap: number): number {
    return Math.max(-cap, Math.min(cap, margin));
}

/** "101" < "102" < "1010": numeric where both are digits. */
export function compareTeamNumbers(a: string, b: string): number {
    return a.localeCompare(b, undefined, { numeric: true });
}

export function mean(values: readonly number[]): number {
    let sum = 0;
    for (const value of values) sum += value;
    return values.length === 0 ? 0 : sum / values.length;
}

/**
 * Each game oriented so `home` sorts first, then sorted. Every calculation
 * walks this order, so input order and home/away orientation never change a
 * result, not even in the last floating-point bit.
 */
export function canonicalGames(games: readonly RatingGame[]): RatingGame[] {
    return games
        .map((game) =>
            compareTeamNumbers(game.home, game.away) <= 0
                ? { ...game }
                : { home: game.away, away: game.home, homeGoals: game.awayGoals, awayGoals: game.homeGoals },
        )
        .sort(
            (a, b) =>
                compareTeamNumbers(a.home, b.home) ||
                compareTeamNumbers(a.away, b.away) ||
                a.homeGoals - b.homeGoals ||
                a.awayGoals - b.awayGoals,
        );
}

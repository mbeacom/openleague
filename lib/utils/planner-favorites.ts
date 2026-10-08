/**
 * Practice planner favorites (practice favorites spec): the rules both the
 * hosted actions and the static store use. Pure, so the static bundle can
 * import it (ADR-0020).
 */
import { z } from "zod";
import { STARTER_PLAYS } from "@/lib/data/starter-plays";

export const PLANNER_FAVORITE_KINDS = ["DRILL", "PRACTICE"] as const;
export type PlannerFavoriteKind = (typeof PLANNER_FAVORITE_KINDS)[number];

const STARTER_DRILL_IDS: ReadonlySet<string> = new Set(STARTER_PLAYS.map((starter) => starter.id));

/** A starter drill's stable id (lib/data/starter-plays.ts): starrable before it is copied into a library (spec R3). */
export function isStarterDrillId(id: unknown): id is string {
    return typeof id === "string" && STARTER_DRILL_IDS.has(id);
}

export const plannerFavoriteKindSchema = z.enum(PLANNER_FAVORITE_KINDS);

export const listPlannerFavoritesSchema = z.object({ kind: plannerFavoriteKindSchema });

const cuidSchema = z.string().cuid("Invalid id format");

/** Hosted: a drill is a CUID (library play) or a known starter id; a practice is a CUID. */
export const setPlannerFavoriteSchema = z.discriminatedUnion("kind", [
    z.object({
        kind: z.literal("DRILL"),
        targetId: z.union([cuidSchema, z.string().refine(isStarterDrillId, "Invalid id format")]),
        favorite: z.boolean(),
    }),
    z.object({ kind: z.literal("PRACTICE"), targetId: cuidSchema, favorite: z.boolean() }),
]);

export const PLANNER_FAVORITE_SAVE_FAILED = "Couldn't update your favorites. Please try again.";
export const PLANNER_FAVORITE_LOAD_FAILED = "Couldn't load your favorites. Please try again.";
export const FAVORITE_DRILL_NOT_FOUND = "Drill not found";
export const FAVORITE_PRACTICE_NOT_FOUND = "Practice not found";

/**
 * A comparator that puts favorites first and otherwise defers to `compare`.
 * For any list that wants starred items on top (practice lists, drill suggestions).
 */
export function favoritesFirst<T>(isFavorite: (item: T) => boolean, compare: (a: T, b: T) => number = () => 0): (a: T, b: T) => number {
    return (a, b) => {
        const rank = Number(isFavorite(b)) - Number(isFavorite(a));
        return rank !== 0 ? rank : compare(a, b);
    };
}

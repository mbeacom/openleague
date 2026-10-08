/**
 * Favorites on this device (practice favorites spec R1): one record in the
 * meta store, so no schema bump. Validated on write and read leniently, so a
 * damaged record reads as no favorites rather than breaking the library.
 * Never written into plan files (spec R2). Stars on deleted drills or
 * practices stay inert: ids are never reused (spec R4).
 */
import type { PlannerFavoriteChange, PlannerFavoriteKind } from "@/lib/planner-store";
import {
    FAVORITE_DRILL_NOT_FOUND,
    FAVORITE_PRACTICE_NOT_FOUND,
    PLANNER_FAVORITE_KINDS,
    PLANNER_FAVORITE_LOAD_FAILED,
    PLANNER_FAVORITE_SAVE_FAILED,
    isStarterDrillId,
} from "@/lib/utils/planner-favorites";
import type { RepoTx } from "./records";
import { StoreRefusal, attempt, ok, write, type StoreContext } from "./shared";
import type { LocalPlannerStore } from "./types";

/** The device's favorites: { DRILL: ids, PRACTICE: ids }, newest first. Its own key, apart from every other record. */
export const META_FAVORITES = "plannerFavorites";

export type FavoritesRecord = Record<PlannerFavoriteKind, string[]>;

const MAX_ID_LENGTH = 200;

function isId(value: unknown): value is string {
    return typeof value === "string" && value.length > 0 && value.length <= MAX_ID_LENGTH;
}

function isKind(value: unknown): value is PlannerFavoriteKind {
    return (PLANNER_FAVORITE_KINDS as readonly unknown[]).includes(value);
}

/** Lenient: anything that isn't a list of ids reads as none; repeats are dropped. */
export function readFavorites(value: unknown): FavoritesRecord {
    const source = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
    const ids = (list: unknown) => (Array.isArray(list) ? [...new Set(list.filter(isId))] : []);
    return { DRILL: ids(source.DRILL), PRACTICE: ids(source.PRACTICE) };
}

async function targetExists(tx: RepoTx, kind: PlannerFavoriteKind, targetId: string): Promise<boolean> {
    if (kind === "PRACTICE") return Boolean(await tx.getSession(targetId));
    if (isStarterDrillId(targetId)) return true;
    // A session's own drill copy is never listed, so it can't be starred.
    const play = await tx.getPlay(targetId);
    return Boolean(play && play.sessionId === null);
}

export type FavoriteOps = Pick<LocalPlannerStore, "listPlannerFavorites" | "setPlannerFavorite">;

export function createFavoriteOps(ctx: StoreContext): FavoriteOps {
    return {
        listPlannerFavorites: (input) =>
            attempt(PLANNER_FAVORITE_LOAD_FAILED, async () => {
                if (!isKind(input?.kind)) return { success: false, error: "Invalid input" };
                const record = readFavorites(await ctx.repo.read((tx) => tx.getMeta(META_FAVORITES)));
                return ok(record[input.kind]);
            }),

        setPlannerFavorite: (input) =>
            attempt(PLANNER_FAVORITE_SAVE_FAILED, async () => {
                const { kind, targetId, favorite } = input ?? ({} as PlannerFavoriteChange);
                if (!isKind(kind) || !isId(targetId) || typeof favorite !== "boolean") return { success: false, error: "Invalid input" };
                await write(ctx, async (tx) => {
                    const record = readFavorites(await tx.getMeta(META_FAVORITES));
                    const rest = record[kind].filter((id) => id !== targetId);
                    if (favorite) {
                        if (!(await targetExists(tx, kind, targetId))) {
                            throw new StoreRefusal(kind === "DRILL" ? FAVORITE_DRILL_NOT_FOUND : FAVORITE_PRACTICE_NOT_FOUND);
                        }
                        // Already starred: keep its place, so a repeat is a no-op.
                        record[kind] = record[kind].includes(targetId) ? record[kind] : [targetId, ...rest];
                    } else {
                        record[kind] = rest;
                    }
                    await tx.putMeta(META_FAVORITES, record);
                });
                return ok({ kind, targetId, favorite });
            }),
    };
}

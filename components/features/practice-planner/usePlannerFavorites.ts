"use client";

/**
 * The signed-in user's (hosted) or this device's (static) favorites of one
 * kind (practice favorites spec R6), with an optimistic setFavorite: the star
 * changes at once and goes back, with an error, if the save fails. Rapid taps
 * on one star are latest-wins. `isFavorite` is the hook other features use to
 * put favorites first (lib/utils/planner-favorites.ts favoritesFirst).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOptionalPlannerStore, type PlannerFavoriteKind } from "@/lib/planner-store";
import { PLANNER_FAVORITE_LOAD_FAILED, PLANNER_FAVORITE_SAVE_FAILED } from "@/lib/utils/planner-favorites";

export interface PlannerFavorites {
    /** False when the store has no favorites: hide every star and filter. */
    supported: boolean;
    /** False until the first list arrives (true at once when `initial` was given). */
    loaded: boolean;
    ids: ReadonlySet<string>;
    isFavorite: (id: string) => boolean;
    /** Resolves to whether the save succeeded. */
    setFavorite: (id: string, favorite: boolean) => Promise<boolean>;
    error: string | null;
    clearError: () => void;
}

function withId(set: ReadonlySet<string>, id: string, present: boolean): Set<string> {
    const next = new Set(set);
    if (present) next.add(id);
    else next.delete(id);
    return next;
}

/** `initial`: ids already read on the server (the hosted practice list), so nothing is fetched. */
export function usePlannerFavorites(kind: PlannerFavoriteKind, initial?: readonly string[]): PlannerFavorites {
    // Outside a PlannerProvider (a hosted screen rendered on its own) there are simply no favorites.
    const store = useOptionalPlannerStore();
    const list = store?.listPlannerFavorites;
    const save = store?.setPlannerFavorite;
    const supported = Boolean(list && save);
    const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set(initial ?? []));
    const [loaded, setLoaded] = useState(initial !== undefined);
    const [error, setError] = useState<string | null>(null);
    // Each id's latest local change, so a slower list or an older failed save never undoes a newer tap.
    const changes = useRef(new Map<string, { seq: number; favorite: boolean }>());
    const skipLoad = useRef(initial !== undefined);

    useEffect(() => {
        if (!list || skipLoad.current) return;
        let live = true;
        list({ kind })
            .catch(() => ({ success: false as const, error: PLANNER_FAVORITE_LOAD_FAILED }))
            .then((result) => {
                if (!live) return;
                setLoaded(true);
                if (!result.success) {
                    setError(result.error);
                    return;
                }
                let next = new Set(result.data);
                for (const [id, change] of changes.current) next = withId(next, id, change.favorite);
                setIds(next);
            });
        return () => {
            live = false;
        };
    }, [list, kind]);

    const setFavorite = useCallback(
        async (id: string, favorite: boolean) => {
            if (!save) return false;
            const seq = (changes.current.get(id)?.seq ?? 0) + 1;
            changes.current.set(id, { seq, favorite });
            setIds((prev) => withId(prev, id, favorite));
            const result = await save({ kind, targetId: id, favorite }).catch(() => ({
                success: false as const,
                error: PLANNER_FAVORITE_SAVE_FAILED,
            }));
            if (result.success) return true;
            if (changes.current.get(id)?.seq === seq) {
                changes.current.set(id, { seq, favorite: !favorite });
                setIds((prev) => withId(prev, id, !favorite));
                setError(result.error);
            }
            return false;
        },
        [save, kind],
    );

    const isFavorite = useCallback((id: string) => ids.has(id), [ids]);
    const clearError = useCallback(() => setError(null), []);

    return useMemo(
        () => ({ supported, loaded, ids, isFavorite, setFavorite, error, clearError }),
        [supported, loaded, ids, isFavorite, setFavorite, error, clearError],
    );
}

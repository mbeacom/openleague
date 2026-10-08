"use client";

/**
 * The signed-in user's (hosted) or this device's (static) favorites of one
 * kind (practice favorites spec R6), with an optimistic setFavorite: the star
 * changes at once and goes back, with an error, if the save fails. Saves for
 * one star are serialized: one request at a time, and taps made meanwhile are
 * coalesced into a single follow-up carrying the latest state, so an older
 * request can never land after a newer one and leave the stored star wrong.
 * `isFavorite` is the hook other features use to
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
    /** Resolves to whether the star's final state was saved (taps coalesced into one save share the answer). */
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
    // Each id's save queue while one is running: what the store last confirmed, and who waits on the outcome.
    const queues = useRef(new Map<string, { saved: boolean; waiters: Array<(ok: boolean) => void> }>());
    const idsRef = useRef(ids);
    useEffect(() => {
        idsRef.current = ids;
    }, [ids]);
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

    /** Sends `id`'s latest wanted state until the store holds it, one request at a time. */
    const drain = useCallback(
        async (id: string, queue: { saved: boolean; waiters: Array<(ok: boolean) => void> }, send: NonNullable<typeof save>) => {
            let sent = false;
            let ok = true;
            for (;;) {
                const change = changes.current.get(id);
                if (!change) break;
                const { seq, favorite } = change;
                // Coalesced: taps that ended where the store already is need no request.
                if (sent && favorite === queue.saved) break;
                sent = true;
                const result = await send({ kind, targetId: id, favorite }).catch(() => ({
                    success: false as const,
                    error: PLANNER_FAVORITE_SAVE_FAILED,
                }));
                if (result.success) queue.saved = favorite;
                // A newer tap arrived while this was in flight: send that next, whatever happened here.
                if (changes.current.get(id)?.seq !== seq) {
                    // A failed request may or may not have landed, so the next one is always sent.
                    if (!result.success) sent = false;
                    continue;
                }
                if (!result.success) {
                    changes.current.set(id, { seq, favorite: queue.saved });
                    setIds((prev) => withId(prev, id, queue.saved));
                    setError(result.error);
                    ok = false;
                }
                break;
            }
            queues.current.delete(id);
            for (const resolve of queue.waiters) resolve(ok);
        },
        [kind],
    );

    const setFavorite = useCallback(
        (id: string, favorite: boolean) => {
            if (!save) return Promise.resolve(false);
            const seq = (changes.current.get(id)?.seq ?? 0) + 1;
            changes.current.set(id, { seq, favorite });
            setIds((prev) => withId(prev, id, favorite));
            const outcome = new Promise<boolean>((resolve) => {
                const running = queues.current.get(id);
                if (running) {
                    // Picked up by the queue once its request in flight settles.
                    running.waiters.push(resolve);
                    return;
                }
                const queue = { saved: idsRef.current.has(id), waiters: [resolve] };
                queues.current.set(id, queue);
                void drain(id, queue, save);
            });
            return outcome;
        },
        [save, drain],
    );

    const isFavorite = useCallback((id: string) => ids.has(id), [ids]);
    const clearError = useCallback(() => setError(null), []);

    return useMemo(
        () => ({ supported, loaded, ids, isFavorite, setFavorite, error, clearError }),
        [supported, loaded, ids, isFavorite, setFavorite, error, clearError],
    );
}

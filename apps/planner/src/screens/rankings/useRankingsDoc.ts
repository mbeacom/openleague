/** Loads the device's rankings document once and saves through the store (static rankings spec). */
import { useCallback, useEffect, useState } from "react";
import type { ActionResult } from "@/lib/planner-store";
import type { RankingsDocument } from "@/lib/rankings-document";
import type { RankingsOps } from "../../store/rankings";

export type RankingsState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; doc: RankingsDocument | null };

export function useRankingsDoc(store: RankingsOps): {
    state: RankingsState;
    save: (doc: RankingsDocument) => Promise<ActionResult<RankingsDocument>>;
    clear: () => Promise<ActionResult<null>>;
} {
    const [state, setState] = useState<RankingsState>({ status: "loading" });
    useEffect(() => {
        let live = true;
        void store.getRankings().then((result) => {
            if (!live) return;
            setState(result.success ? { status: "ready", doc: result.data } : { status: "error", message: result.error });
        });
        return () => {
            live = false;
        };
    }, [store]);
    const save = useCallback(
        async (doc: RankingsDocument) => {
            const result = await store.saveRankings(doc);
            if (result.success) setState({ status: "ready", doc: result.data });
            return result;
        },
        [store],
    );
    const clear = useCallback(async () => {
        const result = await store.clearRankings();
        if (result.success) setState({ status: "ready", doc: null });
        return result;
    }, [store]);
    return { state, save, clear };
}

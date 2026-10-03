import { useEffect, useState } from "react";
import type { ActionResult } from "@/lib/planner-store";

export type LoadState<T> =
    | { kind: "loading" }
    | { kind: "error"; message: string; details?: unknown }
    | { kind: "ready"; data: T };

/** Runs a store read when `load` changes (memoize it with useCallback). Screens are keyed by id, so state resets per record. */
export function useStoreResult<T>(load: () => Promise<ActionResult<T>>): LoadState<T> {
    const [state, setState] = useState<LoadState<T>>({ kind: "loading" });
    useEffect(() => {
        let cancelled = false;
        load().then(
            (result) => {
                if (cancelled) return;
                setState(
                    result.success
                        ? { kind: "ready", data: result.data }
                        : { kind: "error", message: result.error, details: result.details },
                );
            },
            () => {
                if (!cancelled) setState({ kind: "error", message: "Something went wrong. Please try again." });
            },
        );
        return () => {
            cancelled = true;
        };
    }, [load]);
    return state;
}

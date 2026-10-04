"use client";

import { useCallback, useState } from "react";

/**
 * The session's goalie count in the editor (spec R12): 0–10, or null = not
 * set. Its own hook so PracticeSessionEditor stays under its line budget.
 */
export function useGoaliesAttending(initial: number | null | undefined, markDirty: () => void) {
    const [goaliesAttending, setValue] = useState<number | null>(initial ?? null);
    const setGoaliesAttending = useCallback(
        (next: number | null) => {
            setValue(next);
            markDirty();
        },
        [markDirty],
    );
    return { goaliesAttending, setGoaliesAttending };
}

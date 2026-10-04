"use client";

import { useCallback, useState } from "react";

/**
 * The gap between blocks in the editor (spec R8), 0–5 minutes. Undefined until
 * the session loads one or the coach picks one, so a save never sends a gap
 * the editor didn't hold (absent = unchanged). Its own hook so
 * PracticeSessionEditor stays under its line budget.
 */
export function useBetweenBlocks(initial: number | undefined, markDirty: () => void) {
    const [transitionMinutes, setValue] = useState<number | undefined>(initial);
    const setTransitionMinutes = useCallback(
        (next: number) => {
            setValue(next);
            markDirty();
        },
        [markDirty],
    );
    return { transitionMinutes, setTransitionMinutes };
}

"use client";

/**
 * The session editor's list edits (2b, practice timing): delete, move, the
 * station toggle and Add block, through the shared timeline rules. A refused
 * edit (the helpers return the list itself) changes nothing and never marks
 * the editor dirty. Kept out of PracticeSessionEditor for its line budget.
 */
import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { BlockKind, SessionItem } from "@/types/practice-planner";
import { moveItem, removeItem, toggleRunsWithPrevious } from "@/lib/utils/session-timeline";
import { newBlockItem } from "@/lib/utils/session-rows";

export function useSessionRowEdits({
    plays,
    setPlays,
    markDirty,
    locked,
}: {
    plays: SessionItem[];
    setPlays: Dispatch<SetStateAction<SessionItem[]>>;
    markDirty: () => void;
    /** A create in flight: it redirects, so any edit would be lost. */
    locked: boolean;
}) {
    // Computed from the rendered list; React renders between discrete clicks.
    const applyListEdit = useCallback(
        (next: SessionItem[]) => {
            if (locked || next === plays) return;
            setPlays(next);
            markDirty();
        },
        [locked, plays, setPlays, markDirty],
    );

    // Removing a block's first drill keeps its stations grouped (2b).
    const deleteRow = useCallback((id: string) => applyListEdit(removeItem(plays, plays.findIndex((p) => p.id === id))), [applyListEdit, plays]);
    const moveRow = useCallback((index: number, dir: -1 | 1) => applyListEdit(moveItem(plays, index, dir)), [applyListEdit, plays]);
    const toggleStation = useCallback((index: number) => applyListEdit(toggleRunsWithPrevious(plays, index)), [applyListEdit, plays]);

    const addBlock = useCallback(
        (kind: BlockKind) => {
            if (locked) return;
            setPlays((prev) => [
                ...prev,
                newBlockItem(kind, prev.reduce((max, p) => Math.max(max, p.sequence), -1) + 1, `block-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`),
            ]);
            markDirty();
        },
        [locked, setPlays, markDirty],
    );

    return { deleteRow, moveRow, toggleStation, addBlock };
}

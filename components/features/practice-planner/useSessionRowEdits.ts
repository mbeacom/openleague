"use client";

/**
 * The session editor's list edits (2b, practice timing): delete, move, the
 * station toggle, Add block, and a station block's rotation and Stays ticks,
 * through the shared timeline rules. A refused edit (the helpers return the
 * list itself) changes nothing and never marks the editor dirty. Kept out of PracticeSessionEditor for its line budget.
 */
import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import type { BlockKind, SessionItem } from "@/types/practice-planner";
import { groupRange, moveItem, normalizeGroups, removeItem, toggleRunsWithPrevious } from "@/lib/utils/session-timeline";
import { isDrillRow, newBlockItem } from "@/lib/utils/session-rows";

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

    // Turning Rotate on writes M over each station's minutes (spec R3). Each
    // station's own minutes are remembered for this sitting only, by row id, so
    // turning Rotate off again gives them back; a block that loaded rotating
    // has nothing remembered and keeps M.
    const minutesBeforeRotation = useRef(new Map<string, number>());

    // The rotation lives on the block's first drill; normalizeGroups writes the stations' minutes (spec R3).
    // `plays` is the editor's list, in sequence order, as normalizeGroups groups by position.
    const setRotation = useCallback(
        (headIndex: number, minutes: number | null) => {
            const head = plays[headIndex];
            if (locked || !head || !isDrillRow(head)) return;
            const { start, end } = groupRange(plays, headIndex);
            const remembered = minutesBeforeRotation.current;
            const turningOn = head.rotateEveryMinutes == null && minutes !== null;
            const turningOff = head.rotateEveryMinutes != null && minutes === null;
            const next = plays.map((row, i) => {
                if (i < start || i >= end) return row;
                if (turningOn) remembered.set(row.id, row.duration);
                const restored = turningOff ? remembered.get(row.id) : undefined;
                if (turningOff) remembered.delete(row.id);
                if (i === headIndex) return { ...row, rotateEveryMinutes: minutes, ...(restored !== undefined && { duration: restored }) };
                return restored !== undefined ? { ...row, duration: restored } : row;
            });
            applyListEdit(normalizeGroups(next));
        },
        [applyListEdit, locked, plays],
    );
    const setStays = useCallback(
        (index: number, stays: boolean) =>
            applyListEdit(normalizeGroups(plays.map((row, i) => (i === index && isDrillRow(row) ? { ...row, stays } : row)))),
        [applyListEdit, plays],
    );

    return { deleteRow, moveRow, toggleStation, addBlock, setRotation, setStays };
}

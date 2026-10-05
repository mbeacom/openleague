"use client";

/**
 * The practice's staff in the editor (spec R8, R11): the list; add (a team
 * official or admin from the hosted picker, or a typed name); rename; remove,
 * which takes the person off every row; and each row's Run by keys. Undefined
 * until the session loads a list or the coach adds someone, so a save never
 * sends a list the editor didn't hold (absent = unchanged). Kept out of
 * PracticeSessionEditor for its line budget.
 */
import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import type { SessionItem, SessionStaffMember, StaffOption } from "@/types/practice-planner";
import { applySavedStaffIds, assignmentCount, toStaffName, withoutStaffMember, type SavedStaffId } from "@/lib/utils/session-staff";

let lastKey = 0;
/** An editor key for someone not saved yet; a save keeps a stored id and maps a new key to a new one. */
function newStaffKey(): string {
    lastKey += 1;
    return `staff-${Date.now().toString(36)}-${lastKey}`;
}

export function useSessionStaff({
    initial,
    plays,
    setPlays,
    markDirty,
    locked,
}: {
    initial: SessionStaffMember[] | undefined;
    plays: SessionItem[];
    setPlays: Dispatch<SetStateAction<SessionItem[]>>;
    markDirty: () => void;
    /** A create in flight: it redirects, so any edit would be lost. */
    locked: boolean;
}) {
    const [staff, setStaff] = useState<SessionStaffMember[] | undefined>(initial);
    // A swapped id → the person's first key, which stays their React key: a save that swaps a
    // new person's key to the stored id never remounts their row (a Name field keeps focus).
    const [renderKeys, setRenderKeys] = useState<ReadonlyMap<string, string>>(() => new Map());

    const edit = useCallback(
        (change: (current: SessionStaffMember[]) => SessionStaffMember[]) => {
            if (locked) return;
            setStaff((current) => change(current ?? []));
            markDirty();
        },
        [locked, markDirty],
    );

    const addOption = useCallback(
        (option: StaffOption) =>
            edit((current) => [
                ...current,
                { id: newStaffKey(), name: toStaffName(option.name), ...(option.kind === "official" ? { teamOfficialId: option.id } : { userId: option.id }) },
            ]),
        [edit],
    );

    /** Adds an empty typed name and returns its key, so the section can focus its field. */
    const addTyped = useCallback(() => {
        const key = newStaffKey();
        edit((current) => [...current, { id: key, name: "" }]);
        return key;
    }, [edit]);

    const rename = useCallback(
        (key: string, name: string) => edit((current) => current.map((member) => (member.id === key ? { ...member, name } : member))),
        [edit],
    );

    const remove = useCallback(
        (key: string) => {
            if (locked) return;
            setStaff((current) => current?.filter((member) => member.id !== key));
            setPlays((rows) => withoutStaffMember(rows, key));
            // The person's render key goes with them (it is keyed by their current id).
            setRenderKeys((current) => {
                if (!current.has(key)) return current;
                const next = new Map(current);
                next.delete(key);
                return next;
            });
            markDirty();
        },
        [locked, markDirty, setPlays],
    );

    const setRowStaff = useCallback(
        (rowId: string, keys: string[]) => {
            if (locked) return;
            setPlays((rows) => rows.map((row) => (row.id === rowId ? { ...row, staff: keys } : row)));
            markDirty();
        },
        [locked, markDirty, setPlays],
    );

    const assignments = useCallback((key: string) => assignmentCount(plays, key), [plays]);

    /**
     * After a hosted save (parity with applySavedPlayIds): a person added in this sitting
     * takes the id the save stored them under, on the list and on every row, so the next
     * save keeps that id instead of minting another. Applied to the current list and rows,
     * never the save's snapshot (a person removed while it was in flight stays removed).
     * Not an edit: nothing is marked unsaved.
     */
    const applySaved = useCallback(
        (saved: readonly SavedStaffId[] | undefined) => {
            const swaps = (saved ?? []).filter((entry) => entry.key !== entry.id);
            if (swaps.length === 0) return;
            setRenderKeys((current) => {
                const next = new Map(current);
                for (const { key, id } of swaps) next.set(id, current.get(key) ?? key);
                return next;
            });
            // Each on its own: remove takes a key off the list and every row at once (applySavedStaffIds).
            setStaff((current) => (current ? applySavedStaffIds(current, [], saved).staff : current));
            setPlays((rows) => applySavedStaffIds([], rows, saved).rows);
        },
        [setPlays],
    );

    return { staff, renderKeys, addOption, addTyped, rename, remove, setRowStaff, assignments, applySaved };
}

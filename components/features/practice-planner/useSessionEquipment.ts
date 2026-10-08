"use client";

/**
 * The session editor's own equipment items (practice equipment spec R3): the
 * list the save sends as `equipment`. Kept out of the editor to hold it under
 * its line budget.
 */
import { useCallback, useState } from "react";
import { MAX_EQUIPMENT_COUNT, type EquipmentCountItem } from "@/types/practice-planner";
import { cleanEquipmentName, equipmentKey, practiceEquipmentError } from "@/lib/utils/equipment-needs";

export function useSessionEquipment(initial: EquipmentCountItem[] | undefined, markDirty: () => void, locked = false) {
    const [items, setItems] = useState<EquipmentCountItem[]>(() => initial ?? []);

    /** Adds `count`, to an item already listed under the same name (or kind); returns an error, or null. */
    const add = useCallback((name: string, count: number): string | null => {
        if (locked) return null;
        const cleaned = cleanEquipmentName(name);
        const key = equipmentKey({ kind: null, name: cleaned });
        const index = items.findIndex((item) => equipmentKey({ kind: null, name: item.name }) === key);
        const next = index >= 0
            ? items.map((item, i) => (i === index ? { ...item, count: Math.min(MAX_EQUIPMENT_COUNT, item.count + count) } : item))
            : [...items, { name: cleaned, count }];
        // A bad count is reported for the new item itself, not hidden by a merge.
        const error = practiceEquipmentError([{ name: cleaned, count }]) ?? practiceEquipmentError(next);
        if (error) return error;
        setItems(next);
        markDirty();
        return null;
    }, [items, locked, markDirty]);

    const setCount = useCallback((index: number, count: number) => {
        if (locked || count < 1 || count > MAX_EQUIPMENT_COUNT) return;
        setItems((current) => current.map((item, i) => (i === index ? { ...item, count } : item)));
        markDirty();
    }, [locked, markDirty]);

    const remove = useCallback((index: number) => {
        if (locked) return;
        setItems((current) => current.filter((_, i) => i !== index));
        markDirty();
    }, [locked, markDirty]);

    return { items, add, setCount, remove };
}

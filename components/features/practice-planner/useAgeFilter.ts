"use client";

/**
 * The age filter's remembered choice (age-group templates R3): one value per
 * device under AGE_FILTER_STORAGE_KEY, shared by the drill library, the
 * session editor's drill picker and the template picker.
 *
 * Read through useSyncExternalStore with All ages as the server snapshot, so
 * the hosted page hydrates without a mismatch and then shows the remembered
 * age. Every storage access is guarded: when the browser blocks storage (or a
 * write fails), the choice lives in this page only and the filter keeps
 * working. A stored value this build doesn't know reads as All ages.
 */
import { useSyncExternalStore } from "react";
import { AGE_FILTER_STORAGE_KEY, toAgeGroup, type AgeGroup } from "@/lib/utils/age-groups";

const listeners = new Set<() => void>();
/** Set once storage fails; from then on the choice lives here, for this page only. */
let memory: { value: AgeGroup | null } | null = null;

function read(): AgeGroup | null {
    if (memory) return memory.value;
    try {
        return toAgeGroup(window.localStorage.getItem(AGE_FILTER_STORAGE_KEY));
    } catch {
        memory = { value: null };
        return null;
    }
}

/** Remembers the choice (null = All ages) and tells every filter on the page. */
export function setAgeFilter(value: AgeGroup | null): void {
    if (memory) {
        memory.value = value;
    } else {
        try {
            if (value === null) window.localStorage.removeItem(AGE_FILTER_STORAGE_KEY);
            else window.localStorage.setItem(AGE_FILTER_STORAGE_KEY, value);
        } catch {
            memory = { value };
        }
    }
    listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    // A change made in another tab of this site.
    const onStorage = (event: StorageEvent) => {
        if (event.key === null || event.key === AGE_FILTER_STORAGE_KEY) listener();
    };
    window.addEventListener("storage", onStorage);
    return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", onStorage);
    };
}

const allAges = (): AgeGroup | null => null;

/** [the remembered age, or null for All ages; the setter] */
export function useAgeFilter(): [AgeGroup | null, (value: AgeGroup | null) => void] {
    return [useSyncExternalStore(subscribe, read, allAges), setAgeFilter];
}

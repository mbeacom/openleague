"use client";

/**
 * The session editor's drill-list density, remembered per device under
 * DRILL_DENSITY_STORAGE_KEY, as useAgeFilter remembers the age filter:
 * "comfortable" (the full card) or "compact" (one line per drill).
 *
 * Read through useSyncExternalStore with "comfortable" as the server
 * snapshot, so the hosted page hydrates without a mismatch and then shows the
 * remembered density. Every storage access is guarded: when the browser
 * blocks storage (or a write fails), the choice lives in this page only and
 * the toggle keeps working. A stored value this build doesn't know reads as
 * "comfortable".
 */
import { useSyncExternalStore } from "react";

export type DrillDensity = "comfortable" | "compact";

/** The one localStorage key that remembers the density on this device. */
export const DRILL_DENSITY_STORAGE_KEY = "openleague.planner.drillDensity";

const listeners = new Set<() => void>();
/** Set once storage fails; from then on the choice lives here, for this page only. */
let memory: { value: DrillDensity } | null = null;

function toDensity(value: unknown): DrillDensity {
    return value === "compact" ? "compact" : "comfortable";
}

function read(): DrillDensity {
    if (memory) return memory.value;
    try {
        return toDensity(window.localStorage.getItem(DRILL_DENSITY_STORAGE_KEY));
    } catch {
        memory = { value: "comfortable" };
        return "comfortable";
    }
}

/** Remembers the density ("comfortable" clears the key) and tells every list on the page. */
export function setDrillDensity(value: DrillDensity): void {
    if (memory) {
        memory.value = value;
    } else {
        try {
            if (value === "comfortable") window.localStorage.removeItem(DRILL_DENSITY_STORAGE_KEY);
            else window.localStorage.setItem(DRILL_DENSITY_STORAGE_KEY, value);
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
        if (event.key === null || event.key === DRILL_DENSITY_STORAGE_KEY) listener();
    };
    window.addEventListener("storage", onStorage);
    return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", onStorage);
    };
}

const comfortable = (): DrillDensity => "comfortable";

/** [the remembered density; the setter] */
export function useDrillDensity(): [DrillDensity, (value: DrillDensity) => void] {
    return [useSyncExternalStore(subscribe, read, comfortable), setDrillDensity];
}

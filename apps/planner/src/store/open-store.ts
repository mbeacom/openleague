/**
 * Boot-time storage (ADR-0020): IndexedDB when the browser allows it, else the
 * in-memory fallback (the shell warns). Seeds the starter drills once.
 */
import { StorageBlockedError, openIdbRepo } from "./idb-repo";
import { createLocalPlannerStore } from "./local-store";
import { createMemoryRepo } from "./memory-repo";
import type { PlannerRepo } from "./records";
import type { LocalPlannerStore, LocalStoreOptions } from "./types";

/** Set when another tab upgraded (or holds) the database: this tab must reload. */
export interface StaleSignal {
    subscribe: (listener: () => void) => () => void;
    isStale: () => boolean;
    markStale: () => void;
}

export function createStaleSignal(): StaleSignal {
    let stale = false;
    const listeners = new Set<() => void>();
    return {
        subscribe: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        isStale: () => stale,
        markStale: () => {
            if (stale) return;
            stale = true;
            for (const listener of listeners) listener();
        },
    };
}

export interface OpenStoreOptions {
    open?: () => Promise<PlannerRepo>;
    stale?: StaleSignal;
    storeOptions?: LocalStoreOptions;
}

export async function openPlannerStore({ open, stale, storeOptions }: OpenStoreOptions = {}): Promise<{ store: LocalPlannerStore; durable: boolean }> {
    let repo: PlannerRepo;
    try {
        repo = await (open ?? (() => openIdbRepo({ onVersionChange: () => stale?.markStale() })))();
    } catch (error) {
        if (error instanceof StorageBlockedError) stale?.markStale();
        console.error("The planner can't use IndexedDB here; keeping work in memory for this tab:", error);
        repo = createMemoryRepo();
    }
    const store = createLocalPlannerStore(repo, storeOptions);
    try {
        await store.seedStarterDrills();
    } catch (error) {
        console.error("Couldn't add the starter drills:", error);
    }
    return { store, durable: repo.durable };
}

import { useSyncExternalStore } from "react";
import type { LocalPlannerStore } from "../store/types";

/** Goes up each time this tab saves or clears "Your team": pass it to useStoreResult to read again. */
export function useTeamProfileVersion(store: LocalPlannerStore): number {
    return useSyncExternalStore(store.subscribeTeamProfile, store.teamProfileVersion, () => 0);
}

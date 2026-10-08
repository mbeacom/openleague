import { useCallback, useSyncExternalStore } from "react";
import type { AiSettings } from "../ai/settings";
import type { LocalPlannerStore } from "../store/types";
import { useStoreResult, type LoadState } from "./useStoreResult";

/** The AI settings (ADR-0023), read again whenever this tab saves them. */
export function useAiSettings(store: LocalPlannerStore): LoadState<AiSettings> {
    const version = useSyncExternalStore(store.subscribeAiSettings, store.aiSettingsVersion, () => 0);
    const load = useCallback(() => store.getAiSettings(), [store]);
    return useStoreResult(load, version);
}

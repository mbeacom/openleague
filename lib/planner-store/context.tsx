"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { PlannerPlatform, PlannerStore } from "./types";

const PlannerStoreContext = createContext<PlannerStore | null>(null);
const PlannerPlatformContext = createContext<PlannerPlatform | null>(null);

export const MISSING_PROVIDER_MESSAGE =
    "Practice-planner components must render inside <PlannerProvider>. Hosted routes get one from " +
    "HostedPlannerProvider in app/(dashboard)/practice-planner/layout.tsx and app/(print)/practice-planner/layout.tsx.";

export interface PlannerProviderProps {
    store: PlannerStore;
    platform: PlannerPlatform;
    children: ReactNode;
}

export function PlannerProvider({ store, platform, children }: PlannerProviderProps) {
    return (
        <PlannerStoreContext.Provider value={store}>
            <PlannerPlatformContext.Provider value={platform}>{children}</PlannerPlatformContext.Provider>
        </PlannerStoreContext.Provider>
    );
}

/** No default: a fallback would either pull Next.js into shared code or quietly change hosted behaviour. */
export function usePlannerStore(): PlannerStore {
    const store = useContext(PlannerStoreContext);
    if (!store) throw new Error(MISSING_PROVIDER_MESSAGE);
    return store;
}

/** The store when one is provided, else null: for hosted-only screens that also render outside the planner layout. */
export function useOptionalPlannerStore(): PlannerStore | null {
    return useContext(PlannerStoreContext);
}

export function usePlannerPlatform(): PlannerPlatform {
    const platform = useContext(PlannerPlatformContext);
    if (!platform) throw new Error(MISSING_PROVIDER_MESSAGE);
    return platform;
}

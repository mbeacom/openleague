"use client";

/**
 * Hosted implementation of the practice planner's seam (ADR-0020). The store
 * is the server actions themselves (ADR-0002), with no wrapper, so arguments,
 * results, timing and errors are exactly what the components saw before the
 * seam. Typing it as PlannerStore makes tsc prove that the store's inputs are
 * assignable to the actions' inputs.
 */
import type { ReactNode } from "react";
import { PlannerProvider, type PlannerStore } from "@/lib/planner-store";
import { createPlay, deletePlay, getPlayById, getPlaysByTeam } from "@/lib/actions/plays";
import {
    copySessionDrillToLibrary,
    duplicatePracticeSession,
    saveSessionDrill,
} from "@/lib/actions/practice-session-drills";
import { deletePracticeSession, sharePracticeSession } from "@/lib/actions/practice-sessions";
import { useHostedPlannerPlatform } from "./hosted-planner-platform";

export const hostedPlannerStore: PlannerStore = {
    getPlaysByTeam,
    getPlayById,
    createPlay,
    deletePlay,
    saveSessionDrill,
    copySessionDrillToLibrary,
    duplicatePracticeSession,
    deletePracticeSession,
    sharePracticeSession,
};

export function HostedPlannerProvider({ children }: { children: ReactNode }) {
    const platform = useHostedPlannerPlatform();
    return (
        <PlannerProvider store={hostedPlannerStore} platform={platform}>
            {children}
        </PlannerProvider>
    );
}

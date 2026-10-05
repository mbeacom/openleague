import { useCallback } from "react";
import { SessionDetailView } from "@/app/(dashboard)/practice-planner/[sessionId]/SessionDetailView";
import type { LocalPlannerStore } from "../store/types";
import { LoadingScreen, MissingScreen } from "./StatusScreens";
import { useStoreResult } from "./useStoreResult";
import { useTeamProfileVersion } from "./useTeamProfile";

/** Everything on this device is the coach's own, so the admin controls show (Share stays hidden: no sharePracticeSession). */
export function SessionDetailScreen({ store, id }: { store: LocalPlannerStore; id: string }) {
    const load = useCallback(() => store.getSessionView(id), [store, id]);
    // A "Your team" change shows on an open practice without a reload (practice logo spec R4).
    const state = useStoreResult(load, useTeamProfileVersion(store));
    if (state.kind === "loading") return <LoadingScreen />;
    if (state.kind === "error") return <MissingScreen message={state.message} />;
    return <SessionDetailView session={state.data} isAdmin />;
}

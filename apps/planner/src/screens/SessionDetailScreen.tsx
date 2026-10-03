import { useCallback } from "react";
import { SessionDetailView } from "@/app/(dashboard)/practice-planner/[sessionId]/SessionDetailView";
import type { LocalPlannerStore } from "../store/types";
import { LoadingScreen, MissingScreen } from "./StatusScreens";
import { useStoreResult } from "./useStoreResult";

/** Everything on this device is the coach's own, so the admin controls show (Share stays hidden: no sharePracticeSession). */
export function SessionDetailScreen({ store, id }: { store: LocalPlannerStore; id: string }) {
    const load = useCallback(() => store.getSessionView(id), [store, id]);
    const state = useStoreResult(load);
    if (state.kind === "loading") return <LoadingScreen />;
    if (state.kind === "error") return <MissingScreen message={state.message} />;
    return <SessionDetailView session={state.data} isAdmin />;
}

import { useCallback, useState } from "react";
import { SessionDetailView } from "@/app/(dashboard)/practice-planner/[sessionId]/SessionDetailView";
import { PLAN_FORMAT, planFileName } from "@/lib/plan-document";
import { docKeyOf } from "../store/links";
import type { LocalPlannerStore } from "../store/types";
import { DocumentStorageBar } from "./storage/DocumentStorageBar";
import { LoadingScreen, MissingScreen } from "./StatusScreens";
import { useStoreResult } from "./useStoreResult";
import { useTeamProfileVersion } from "./useTeamProfile";

/** Everything on this device is the coach's own, so the admin controls show (Share stays hidden: no sharePracticeSession). */
export function SessionDetailScreen({ store, id }: { store: LocalPlannerStore; id: string }) {
    const load = useCallback(() => store.getSessionView(id), [store, id]);
    // Reloads when the practice is replaced from its linked file (a refresh, "Use theirs").
    const [replaced, setReplaced] = useState(0);
    const onReplaced = useCallback(() => setReplaced((value) => value + 1), []);
    // A "Your team" change shows on an open practice without a reload (practice logo spec R4).
    const state = useStoreResult(load, `${useTeamProfileVersion(store)}:${replaced}`);
    if (state.kind === "loading") return <LoadingScreen />;
    if (state.kind === "error") return <MissingScreen message={state.message} />;
    return (
        <>
            <DocumentStorageBar docKey={docKeyOf(PLAN_FORMAT, id)} kind={PLAN_FORMAT} fileName={planFileName(state.data.title)} onReplaced={onReplaced} />
            <SessionDetailView session={state.data} isAdmin />
        </>
    );
}

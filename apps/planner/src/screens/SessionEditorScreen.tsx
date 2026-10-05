/**
 * Static glue for PracticeSessionEditor: what PracticeSessionEditorWrapper and
 * EditSessionWrapper do for hosted, against the local store. No venue
 * booking (no venues are passed, so the fields render nothing) and no Share.
 */
import { useCallback } from "react";
import {
    PracticeSessionEditor,
    type PracticeSessionSaveResult,
    type PracticeSessionSubmitData,
} from "@/components/features/practice-planner/PracticeSessionEditor";
import { usePlannerPlatform } from "@/lib/planner-store";
import { LOCAL_TEAM_ID } from "../config";
import { staticRoutes } from "../routes";
import type { LocalPlannerStore, LocalSessionSave } from "../store/types";
import { toSessionRowInputs } from "@/lib/utils/session-rows";
import { toSessionStaffInputs } from "@/lib/utils/session-staff";
import { LoadingScreen, MissingScreen } from "./StatusScreens";
import { useStoreResult } from "./useStoreResult";

export function toLocalSessionSave(session: PracticeSessionSubmitData): LocalSessionSave {
    return {
        title: session.title,
        date: session.date,
        duration: session.duration,
        // Absent = unchanged (as EditSessionWrapper): an editor without the field never clears a stored count.
        ...(session.goaliesAttending !== undefined && { goaliesAttending: session.goaliesAttending }),
        plays: toSessionRowInputs(session.plays),
        // Absent = unchanged (as EditSessionWrapper): an editor that never loaded or set the gap sends none.
        ...(session.transitionMinutes !== undefined && { transitionMinutes: session.transitionMinutes }),
        // Absent = unchanged (as EditSessionWrapper): an editor that holds no list sends none.
        ...(session.staff !== undefined && { staff: toSessionStaffInputs(session.staff) }),
    };
}

export function SessionEditorScreen({ store, id }: { store: LocalPlannerStore; id?: string }) {
    return id ? <ExistingSessionEditor store={store} id={id} /> : <NewSessionEditor store={store} />;
}

function NewSessionEditor({ store }: { store: LocalPlannerStore }) {
    const { navigate } = usePlannerPlatform();
    const handleSave = useCallback(
        async (session: PracticeSessionSubmitData): Promise<PracticeSessionSaveResult> => {
            const result = await store.createSession(toLocalSessionSave(session));
            if (!result.success) return { success: false, error: result.error };
            // Diagram editing needs a saved session, so continue on its edit page (as hosted).
            navigate(staticRoutes.sessionEdit(result.data.id));
            return { success: true };
        },
        [store, navigate],
    );
    return <PracticeSessionEditor teamId={LOCAL_TEAM_ID} onSave={handleSave} onCancel={() => navigate(staticRoutes.list())} />;
}

function ExistingSessionEditor({ store, id }: { store: LocalPlannerStore; id: string }) {
    const { navigate } = usePlannerPlatform();
    const load = useCallback(() => store.getSessionForEdit(id), [store, id]);
    const state = useStoreResult(load);
    const handleSave = useCallback(
        async (session: PracticeSessionSubmitData): Promise<PracticeSessionSaveResult> => {
            const result = await store.updateSession(id, toLocalSessionSave(session));
            return result.success ? { success: true, plays: result.data.plays } : { success: false, error: result.error };
        },
        [store, id],
    );

    if (state.kind === "loading") return <LoadingScreen />;
    if (state.kind === "error") return <MissingScreen message={state.message} />;
    return (
        <PracticeSessionEditor
            sessionId={state.data.sessionId}
            teamId={LOCAL_TEAM_ID}
            initialData={state.data.initialData}
            onSave={handleSave}
            onCancel={() => navigate(staticRoutes.session(id))}
        />
    );
}

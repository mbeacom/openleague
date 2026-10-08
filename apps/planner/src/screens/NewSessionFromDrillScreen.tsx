/** A new practice that starts with one library drill (the drill details page's "Add to new practice"). */
import { useCallback } from "react";
import { libraryDrillRow } from "@/lib/utils/drill-details";
import { LOCAL_TEAM_ID } from "../config";
import { staticRoutes } from "../routes";
import type { LocalPlannerStore } from "../store/types";
import { NewSessionEditor } from "./SessionEditorScreen";
import { DRILL_NOT_ON_DEVICE_MESSAGE, LoadingScreen, MissingScreen } from "./StatusScreens";
import { useStoreResult } from "./useStoreResult";

export function NewSessionFromDrillScreen({ store, drillId }: { store: LocalPlannerStore; drillId: string }) {
    const load = useCallback(() => store.getPlayById({ id: drillId, teamId: LOCAL_TEAM_ID }), [store, drillId]);
    const state = useStoreResult(load);
    if (state.kind === "loading") return <LoadingScreen />;
    if (state.kind === "error") {
        return <MissingScreen message={DRILL_NOT_ON_DEVICE_MESSAGE} backHref={staticRoutes.library()} backLabel="Back to the drill library" />;
    }
    return <NewSessionEditor store={store} initialPlays={[libraryDrillRow(state.data, `play-start-${state.data.id}`)]} />;
}

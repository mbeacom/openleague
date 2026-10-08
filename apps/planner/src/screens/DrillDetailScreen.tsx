/** Static glue for DrillDetailView, as the library/[playId] page does for hosted. */
import { useCallback } from "react";
import { Alert, Button, Stack } from "@mui/material";
import { ArrowBack as ArrowBackIcon } from "@mui/icons-material";
import { DrillDetailView } from "@/components/features/practice-planner/DrillDetailView";
import { PLAY_DATA_UNREADABLE_CODE } from "@/lib/utils/play-data";
import { LOCAL_TEAM_ID } from "../config";
import { staticRoutes } from "../routes";
import type { LocalPlannerStore } from "../store/types";
import { DRILL_NOT_ON_DEVICE_MESSAGE, LoadingScreen, MissingScreen } from "./StatusScreens";
import { useStoreResult } from "./useStoreResult";

/** Everything on this device is the coach's own, so Edit, Duplicate and Add to practice show (as SessionDetailScreen's isAdmin). */
export function DrillDetailScreen({ store, id }: { store: LocalPlannerStore; id: string }) {
    const load = useCallback(() => store.getPlayById({ id, teamId: LOCAL_TEAM_ID }), [store, id]);
    const state = useStoreResult(load);
    const loadUsage = useCallback(() => store.countPlayUsage(id), [store, id]);
    const usage = useStoreResult(loadUsage);

    if (state.kind === "loading") return <LoadingScreen />;
    if (state.kind === "error") {
        const unreadable = (state.details as { code?: string } | undefined)?.code === PLAY_DATA_UNREADABLE_CODE;
        if (!unreadable) {
            return <MissingScreen message={DRILL_NOT_ON_DEVICE_MESSAGE} backHref={staticRoutes.library()} backLabel="Back to the drill library" />;
        }
        return (
            <Stack spacing={2} alignItems="flex-start">
                <Alert severity="error" sx={{ alignSelf: "stretch" }}>
                    {state.message}
                </Alert>
                <Button href={staticRoutes.library()} startIcon={<ArrowBackIcon />}>
                    Back to the drill library
                </Button>
            </Stack>
        );
    }
    return (
        <DrillDetailView
            play={state.data}
            teamId={LOCAL_TEAM_ID}
            canEdit
            usageCount={usage.kind === "ready" ? usage.data : undefined}
        />
    );
}

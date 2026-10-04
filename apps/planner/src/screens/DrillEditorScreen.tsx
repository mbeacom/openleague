/** Static glue for PlayEditor, as PlayEditorWrapper and the library edit page do for hosted. */
import { useCallback } from "react";
import { Alert, Button, Stack } from "@mui/material";
import { ArrowBack as ArrowBackIcon } from "@mui/icons-material";
import { PlayEditor } from "@/components/features/practice-planner/PlayEditor";
import { usePlannerPlatform } from "@/lib/planner-store";
import { PLAY_DATA_UNREADABLE_CODE } from "@/lib/utils/play-data";
import type { SavedPlay } from "@/types/practice-planner";
import { LOCAL_TEAM_ID } from "../config";
import { staticRoutes } from "../routes";
import type { LocalPlannerStore } from "../store/types";
import { DRILL_NOT_ON_DEVICE_MESSAGE, LoadingScreen, MissingScreen } from "./StatusScreens";
import { useStoreResult } from "./useStoreResult";

export function DrillEditorScreen({ store, id }: { store: LocalPlannerStore; id?: string }) {
    return id ? <ExistingDrill store={store} id={id} /> : <DrillEditor store={store} />;
}

function ExistingDrill({ store, id }: { store: LocalPlannerStore; id: string }) {
    const load = useCallback(() => store.getPlayById({ id, teamId: LOCAL_TEAM_ID }), [store, id]);
    const state = useStoreResult(load);
    if (state.kind === "loading") return <LoadingScreen />;
    if (state.kind === "error") {
        const unreadable = (state.details as { code?: string } | undefined)?.code === PLAY_DATA_UNREADABLE_CODE;
        if (!unreadable) {
            return <MissingScreen message={DRILL_NOT_ON_DEVICE_MESSAGE} backHref={staticRoutes.library()} backLabel="Back to the drill library" />;
        }
        return (
            <Stack spacing={2} alignItems="flex-start">
                <Alert severity="error" sx={{ alignSelf: "stretch" }}>
                    {state.message} Editing is disabled so the stored drawing isn&apos;t overwritten.
                </Alert>
                <Button href={staticRoutes.library()} startIcon={<ArrowBackIcon />}>
                    Back to the drill library
                </Button>
            </Stack>
        );
    }
    const play: SavedPlay = {
        id: state.data.id,
        name: state.data.name,
        description: state.data.description ?? "",
        thumbnail: state.data.thumbnail ?? "",
        playData: state.data.playData,
        focus: state.data.focus,
        goalies: state.data.goalies,
        isTemplate: state.data.isTemplate,
        createdAt: state.data.createdAt,
        updatedAt: state.data.updatedAt,
    };
    return <DrillEditor store={store} play={play} />;
}

function DrillEditor({ store, play }: { store: LocalPlannerStore; play?: SavedPlay }) {
    const { navigate } = usePlannerPlatform();
    const handleSave = useCallback(
        async (saved: SavedPlay) => {
            const fields = {
                name: saved.name,
                description: saved.description || undefined,
                thumbnail: saved.thumbnail || undefined,
                playData: saved.playData,
                focus: saved.focus,
                goalies: saved.goalies,
            };
            const result = play
                ? await store.updatePlay({ id: play.id, ...fields })
                : await store.createPlay({ ...fields, isTemplate: true, teamId: LOCAL_TEAM_ID });
            // PlayEditor catches this and shows the message.
            if (!result.success) throw new Error(result.error);
            // Edits autosave and stay; a new drill returns to the library (as hosted).
            if (!play) navigate(staticRoutes.library());
        },
        [store, play, navigate],
    );
    return (
        <PlayEditor
            teamId={LOCAL_TEAM_ID}
            playId={play?.id}
            initialData={play ?? { isTemplate: true }}
            lockTemplate
            onSave={handleSave}
            onCancel={() => navigate(staticRoutes.library())}
        />
    );
}

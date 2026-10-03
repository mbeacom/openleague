"use client";

/**
 * Drill dialog state for PracticeSessionEditor (practice planner 3a): which
 * card's diagram is open (or a new drill), and how a dialog save lands on the
 * cards. Kept out of the editor to hold it under its line budget.
 */

import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import type { PlayInSession } from "@/types/practice-planner";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { upsertSessionDrill, type SessionDrillPatch } from "@/lib/utils/session-drill-ids";
import type { SessionDrillDialogDrill } from "./SessionDrillDialog";

export function useSessionDrillDialog(
    plays: PlayInSession[],
    setPlays: Dispatch<SetStateAction<PlayInSession[]>>,
    markDirty: () => void,
) {
    const [drill, setDrill] = useState<SessionDrillDialogDrill | null>(null);

    const editDiagram = useCallback((clientKey: string) => {
        const play = plays.find((p) => p.id === clientKey);
        if (!play) return;
        setDrill({
            clientKey,
            playId: play.playId,
            name: play.name,
            description: play.description ?? "",
            playData: play.playData,
            thumbnail: play.thumbnail ?? "",
        });
    }, [plays]);

    const newDrill = useCallback(() => {
        setDrill({
            clientKey: `drill-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
            playId: null,
            name: "",
            description: "",
            playData: createEmptyPlayData(),
            thumbnail: "",
        });
    }, []);

    // Every dialog save: point the card at the saved copy and let autosave persist it.
    const onSaved = useCallback((clientKey: string, patch: SessionDrillPatch) => {
        setPlays((prev) => upsertSessionDrill(prev, clientKey, patch));
        markDirty();
    }, [setPlays, markDirty]);

    const close = useCallback(() => setDrill(null), []);

    return { drill, editDiagram, newDrill, onSaved, close };
}

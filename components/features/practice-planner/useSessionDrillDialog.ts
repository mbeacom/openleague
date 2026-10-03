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
    /** Saves the session now (single-flight: runs, or queues behind a running save). */
    saveNow: () => void,
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

    // Every dialog save points the card at the saved copy. Editing a copy the
    // session already owns changed only that row, so autosave can follow. A fork
    // (library or legacy drill) or a new drill is a new id the session doesn't
    // reference yet: save it now, not after the autosave timer, which a failed
    // earlier save leaves unarmed. Until then, leaving the page loses the edit.
    const onSaved = useCallback((clientKey: string, patch: SessionDrillPatch) => {
        const isNewId = plays.find((play) => play.id === clientKey)?.playId !== patch.playId;
        setPlays((prev) => upsertSessionDrill(prev, clientKey, patch));
        markDirty();
        if (isNewId) saveNow();
    }, [plays, setPlays, markDirty, saveNow]);

    const close = useCallback(() => setDrill(null), []);

    return { drill, editDiagram, newDrill, onSaved, close };
}

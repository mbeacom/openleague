"use client";

/**
 * Drill dialog state for PracticeSessionEditor (practice planner 3a): which
 * card's diagram is open (or a new drill), and how a dialog save lands on the
 * cards. Kept out of the editor to hold it under its line budget.
 */

import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import type { SessionItem } from "@/types/practice-planner";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { isDrillRow } from "@/lib/utils/session-rows";
import { upsertSessionDrill, type SessionDrillPatch } from "@/lib/utils/session-drill-ids";
import type { SessionDrillDialogDrill } from "./SessionDrillDialog";
import type { SaveOutcome } from "./useSingleFlightSave";

export function useSessionDrillDialog(
    plays: SessionItem[],
    setPlays: Dispatch<SetStateAction<SessionItem[]>>,
    markDirty: () => void,
    /** Saves the session now (single-flight: runs, or queues behind a running save); settles with that save's outcome. */
    saveNow: () => Promise<SaveOutcome>,
) {
    const [drill, setDrill] = useState<SessionDrillDialogDrill | null>(null);

    const editDiagram = useCallback((clientKey: string) => {
        const play = plays.find((p) => p.id === clientKey);
        if (!play || !isDrillRow(play)) return;
        setDrill({
            clientKey,
            playId: play.playId,
            name: play.name,
            description: play.description ?? "",
            playData: play.playData,
            thumbnail: play.thumbnail ?? "",
            focus: play.focus,
            goalies: play.goalies,
            ageGroups: play.ageGroups,
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
    // earlier save leaves unarmed, and report that save's outcome to the dialog.
    //
    // If that save fails, the card is rolled back (a new drill's card removed),
    // so the dialog's retry is again a new id and saves the session again; a
    // card left on the copy would make the retry look like an in-place edit and
    // report success with the drill still unlinked. The copy the dialog created
    // stays unreferenced and goes with the session (drop-only cleanup).
    const onSaved = useCallback(async (clientKey: string, patch: SessionDrillPatch): Promise<SaveOutcome> => {
        const previous = plays.find((play) => play.id === clientKey);
        setPlays((prev) => upsertSessionDrill(prev, clientKey, patch));
        markDirty();
        if (previous && isDrillRow(previous) && previous.playId === patch.playId) return { ok: true };

        const outcome = await saveNow();
        if (!outcome.ok) {
            setPlays((prev) => previous
                ? prev.map((play) => (play.id === clientKey ? previous : play))
                : prev.filter((play) => play.id !== clientKey));
        }
        return outcome;
    }, [plays, setPlays, markDirty, saveNow]);

    const close = useCallback(() => setDrill(null), []);

    return { drill, editDiagram, newDrill, onSaved, close };
}

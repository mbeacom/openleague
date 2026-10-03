"use client";

/**
 * Single-flight save coordination for the session editor (practice planner 3a).
 * Only one save runs at a time. A save requested while one is running is
 * queued, and the queued requests are merged by OR-ing their intent, so a
 * Save or "Book anyway" click is never downgraded to a plain autosave.
 * `followUp` changes once per settled save that has queued work; the editor
 * runs it from an effect declared after its latest-handleSave ref is updated.
 */

import { useMemo, useRef, useState } from "react";

export type SaveIntent = { overrideConflicts: boolean; notify: boolean };

export function useSingleFlightSave() {
    const inFlightRef = useRef(false);
    const queuedRef = useRef<SaveIntent | null>(null);
    const editVersionRef = useRef(0);
    const [followUp, setFollowUp] = useState<SaveIntent | null>(null);

    const controls = useMemo(
        () => ({
            /** Records an edit, so a save that started earlier knows it is stale. */
            markEdited() {
                editVersionRef.current += 1;
            },
            isRunning: () => inFlightRef.current,
            /** Queues a follow-up save, merging with any intent already queued. */
            queue(intent: SaveIntent) {
                const queued = queuedRef.current;
                queuedRef.current = {
                    overrideConflicts: intent.overrideConflicts || Boolean(queued?.overrideConflicts),
                    notify: intent.notify || Boolean(queued?.notify),
                };
            },
            /** Marks a save as running and returns the edit version it covers. */
            start() {
                inFlightRef.current = true;
                return editVersionRef.current;
            },
            editedSince: (version: number) => editVersionRef.current !== version,
            /** Ends the running save and publishes any queued follow-up. */
            finish() {
                inFlightRef.current = false;
                const queued = queuedRef.current;
                if (queued) {
                    queuedRef.current = null;
                    setFollowUp(queued);
                }
            },
        }),
        [],
    );

    // Stable between follow-ups, so callbacks that depend on it stay stable.
    return useMemo(() => ({ ...controls, followUp }), [controls, followUp]);
}

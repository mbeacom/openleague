"use client";

/**
 * Single-flight save coordination for the session editor (practice planner 3a).
 * Only one save runs at a time. A save requested while one is running is
 * queued, and the queued requests are merged by OR-ing their intent, so a
 * Save or "Book anyway" click is never downgraded to a plain autosave.
 * `followUp` changes once per settled save that has queued work, and once per
 * `request` made while idle; the editor runs it from an effect declared after
 * its latest-handleSave ref is updated.
 *
 * `request` returns a promise that settles with the outcome of the save that
 * carries it: the next follow-up save to start (`start({ carriesRequests })`),
 * or `abandon` when that save stops before it starts.
 */

import { useMemo, useRef, useState } from "react";

export type SaveIntent = { overrideConflicts: boolean; notify: boolean };
export type SaveOutcome = { ok: true } | { ok: false; error: string };

type Waiter = (outcome: SaveOutcome) => void;

export function useSingleFlightSave() {
    const inFlightRef = useRef(false);
    const queuedRef = useRef<SaveIntent | null>(null);
    const editVersionRef = useRef(0);
    // Requests waiting for the next save to start, and those the running save carries.
    const waitingRef = useRef<Waiter[]>([]);
    const carriedRef = useRef<Waiter[]>([]);
    const [followUp, setFollowUp] = useState<SaveIntent | null>(null);

    const controls = useMemo(() => {
        /** Queues a follow-up save, merging with any intent already queued. */
        const queue = (intent: SaveIntent) => {
            const queued = queuedRef.current;
            queuedRef.current = {
                overrideConflicts: intent.overrideConflicts || Boolean(queued?.overrideConflicts),
                notify: intent.notify || Boolean(queued?.notify),
            };
        };
        const settle = (waiters: Waiter[], outcome: SaveOutcome) => {
            for (const resolve of waiters) resolve(outcome);
        };
        return {
            /** Records an edit, so a save that started earlier knows it is stale. */
            markEdited() {
                editVersionRef.current += 1;
            },
            isRunning: () => inFlightRef.current,
            queue,
            /**
             * Marks a save as running and returns the edit version it covers.
             * Only a save run for a published `followUp` carries the waiting
             * requests: an autosave timer armed earlier can fire before the
             * editor's latest-handleSave ref refreshes and send stale state.
             */
            start({ carriesRequests = false }: { carriesRequests?: boolean } = {}) {
                inFlightRef.current = true;
                if (carriesRequests) {
                    carriedRef.current = waitingRef.current;
                    waitingRef.current = [];
                }
                return editVersionRef.current;
            },
            /**
             * Asks for a save now, without waiting for the autosave timer: queued
             * behind a running save, otherwise published as a follow-up so it
             * runs after the render that holds the latest edits. Resolves with
             * that save's outcome.
             */
            request(intent: SaveIntent): Promise<SaveOutcome> {
                const outcome = new Promise<SaveOutcome>((resolve) => waitingRef.current.push(resolve));
                if (inFlightRef.current) {
                    queue(intent);
                } else {
                    setFollowUp({ ...intent });
                }
                return outcome;
            },
            /** A save stopped before it started (e.g. validation): fails the waiting requests. */
            abandon(error: string) {
                const waiting = waitingRef.current;
                waitingRef.current = [];
                settle(waiting, { ok: false, error });
            },
            editedSince: (version: number) => editVersionRef.current !== version,
            /** Ends the running save, settles what it carried, and publishes any queued follow-up. */
            finish(outcome: SaveOutcome = { ok: true }) {
                inFlightRef.current = false;
                const carried = carriedRef.current;
                carriedRef.current = [];
                settle(carried, outcome);
                const queued = queuedRef.current;
                if (queued) {
                    queuedRef.current = null;
                    setFollowUp(queued);
                }
            },
        };
    }, []);

    // Stable between follow-ups, so callbacks that depend on it stay stable.
    return useMemo(() => ({ ...controls, followUp }), [controls, followUp]);
}

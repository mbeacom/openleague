/**
 * Adapter for a schedule pulled by the hosted "Fetch it for me" page
 * (ADR-0024). The route `#/rankings/import?pull=…` hands the import screen a
 * payload; this decodes it once, drops it from the address bar, and gives the
 * screen a page source it reads like any pasted or saved page, so the usual
 * preview, unread-lines list and merge apply, and nothing is saved until the
 * user chooses Save.
 */
import { useEffect, useRef, useState } from "react";
import { decodeSchedulePull, schedulePullHost, schedulePullSource } from "@/lib/rankings-document";
import { replaceHash } from "../../platform";
import { staticRoutes } from "../../routes";

export interface PulledSchedule {
    /** The page as the import reads it (see schedulePullSource). */
    content: string;
    /** "Schedule fetched from <host>". */
    label: string;
    sourceUrl: string;
}

export type PulledScheduleResult = { ok: true; schedule: PulledSchedule } | { ok: false; message: string };

export const pulledScheduleLabel = (host: string) => `Schedule fetched from ${host}`;

/** Decodes a `pull` value into what the import screen loads. Never throws. */
export async function readPulledSchedule(value: string): Promise<PulledScheduleResult> {
    const result = await decodeSchedulePull(value);
    if (!result.ok) return { ok: false, message: result.message };
    const { pull } = result;
    return { ok: true, schedule: { content: schedulePullSource(pull), label: pulledScheduleLabel(schedulePullHost(pull)), sourceUrl: pull.sourceUrl } };
}

/**
 * The route's pull, decoded once. `take()` hands the result over exactly once (the screen calls
 * it while rendering, once its rankings are loaded) and returns null after that.
 */
export function usePulledSchedule(pull: string | undefined): { take: () => PulledScheduleResult | null } {
    // The first pull only: clearing the hash re-routes without it, and that must not cancel the read.
    const first = useRef(pull);
    const [result, setResult] = useState<PulledScheduleResult | null>(null);
    useEffect(() => {
        const value = first.current;
        if (!value) return;
        let live = true;
        // The payload must not linger in the address bar or this history entry.
        replaceHash(staticRoutes.rankingsImport());
        void readPulledSchedule(value).then((read) => {
            if (live) setResult(read);
        });
        return () => {
            live = false;
        };
    }, []);
    return {
        take: () => {
            if (!result) return null;
            setResult(null);
            return result;
        },
    };
}

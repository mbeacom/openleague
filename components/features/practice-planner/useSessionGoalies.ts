"use client";

import { useMemo } from "react";
import type { PracticeSessionView } from "@/types/practice-planner";
import { sessionForDisplay } from "@/lib/utils/drill-tags";
import { isDrillRow } from "@/lib/utils/session-rows";
import { goalieShortSummary, goalieWarnings, goaliesUnusedMessage, groupStations } from "@/lib/utils/session-timeline";

/**
 * The detail page's goalie view (spec R6, R7): the session as drawn (goalie
 * markers hidden on optional drills when 0 attend) and its advisory messages.
 * Warnings read the stored session, so hidden markers never change the counts.
 */
export function useSessionGoalies(session: PracticeSessionView): { shown: PracticeSessionView; messages: string[] } {
    const shown = useMemo(() => sessionForDisplay(session), [session]);
    const messages = useMemo(() => {
        const attending = session.goaliesAttending ?? null;
        if (attending === null) return [];
        const warnings = goalieWarnings(
            groupStations(
                session.plays.map((sp) =>
                    isDrillRow(sp) ? { ...sp, focus: sp.play.focus, goalies: sp.play.goalies, playData: sp.play.playData } : sp,
                ),
            ),
            attending,
        );
        return [
            ...(warnings.short.length > 0 ? [goalieShortSummary(warnings.short.length, attending)] : []),
            ...(warnings.unused ? [goaliesUnusedMessage(attending)] : []),
        ];
    }, [session]);
    return { shown, messages };
}

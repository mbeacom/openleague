/**
 * Pure helpers for the session editor's drill cards (practice planner 3a).
 * A card's `id` is its clientKey; `playId` is the Play row it shows.
 */
import type { PlayData, PlayInSession } from "@/types/practice-planner";

export type SavedDrillId = { clientKey: string; playId: string };

export type SessionDrillPatch = {
    playId: string;
    name: string;
    description: string;
    thumbnail: string;
    playData: PlayData;
};

/**
 * Applies a save's clientKey → owned playId mapping. A card is only swapped
 * if its playId is still the one that save sent: if the drill dialog forked a
 * new copy onto it while the save was in flight, the newer id wins (the next
 * save sends it, and cleanup removes the copy this save made).
 */
export function applySavedPlayIds(
    plays: PlayInSession[],
    sentPlayIds: ReadonlyMap<string, string>,
    saved: readonly SavedDrillId[] | undefined,
): PlayInSession[] {
    if (!saved || saved.length === 0) return plays;
    const byKey = new Map(saved.map((entry) => [entry.clientKey, entry.playId]));
    let changed = false;
    const next = plays.map((play) => {
        const ownedId = byKey.get(play.id);
        if (!ownedId || ownedId === play.playId || sentPlayIds.get(play.id) !== play.playId) return play;
        changed = true;
        return { ...play, playId: ownedId };
    });
    return changed ? next : plays;
}

/** Updates the card's drill after a dialog save, or appends a new drill card. */
export function upsertSessionDrill(
    plays: PlayInSession[],
    clientKey: string,
    patch: SessionDrillPatch,
): PlayInSession[] {
    if (plays.some((play) => play.id === clientKey)) {
        return plays.map((play) => (play.id === clientKey ? { ...play, ...patch } : play));
    }
    const sequence = plays.reduce((max, play) => Math.max(max, play.sequence), -1) + 1;
    return [...plays, { id: clientKey, ...patch, sequence, duration: 10, instructions: "" }];
}

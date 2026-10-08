"use client";

/**
 * The editor's practice roster state (roster and suggestions spec R1–R4, R7).
 * Kept out of PracticeSessionEditor for its line budget, and in its own hook so
 * other per-practice lists can grow beside it without touching it.
 *
 * Save payload: `payload` is undefined (unchanged) until the editor loaded a
 * roster or the coach changed one; then the current roster, or null.
 */
import { useCallback, useMemo, useState } from "react";
import type { AgeGroup } from "@/lib/utils/age-groups";
import {
    MAX_ROSTER_PLAYERS,
    addCustomRosterRole,
    emptyRoster,
    firstSkaterRole,
    newRosterKey,
    roleFromTeamPosition,
    setRosterAgeGroup,
    toRosterRole,
    toggleRosterRole,
    type PastedPlayer,
    type PracticeRoster,
    type RosterOption,
    type RosterPlayer,
} from "@/lib/utils/practice-roster";

export interface SessionRosterState {
    /** What the section shows: the roster, or an empty one with no age. */
    roster: PracticeRoster;
    /** What a save sends: undefined = unchanged, null = none. */
    payload: PracticeRoster | null | undefined;
    setAgeGroup: (ageGroup: AgeGroup | null) => void;
    toggleRole: (role: string) => void;
    /** Returns an error message, or null when added. */
    addCustomRole: (label: string) => string | null;
    addPlayer: (role?: string) => string | null;
    updatePlayer: (key: string, patch: Partial<Pick<RosterPlayer, "name" | "number" | "role">>) => void;
    removePlayer: (key: string) => void;
    addPlayers: (players: readonly PastedPlayer[]) => void;
    addFromTeam: (options: readonly RosterOption[]) => void;
}

export function useSessionRoster({
    initial,
    markDirty,
    locked = false,
}: {
    initial: PracticeRoster | null | undefined;
    markDirty: () => void;
    locked?: boolean;
}): SessionRosterState {
    const [roster, setRoster] = useState<PracticeRoster | null>(initial ?? null);
    // A loaded roster (even null) is always sent back; an untouched new practice sends none.
    const [owned, setOwned] = useState(initial !== undefined);

    const shown = useMemo(() => roster ?? emptyRoster(null), [roster]);

    const edit = useCallback(
        (change: (current: PracticeRoster) => PracticeRoster) => {
            if (locked) return;
            setRoster((current) => {
                const base = current ?? emptyRoster(null);
                const next = change(base);
                return next === base ? current : next;
            });
            setOwned(true);
            markDirty();
        },
        [markDirty, locked],
    );

    const addCustomRole = useCallback(
        (label: string) => {
            const result = addCustomRosterRole(roster ?? emptyRoster(null), label);
            if (!result.ok) return result.error;
            edit(() => result.roster);
            return null;
        },
        [roster, edit],
    );

    const addPlayer = useCallback(
        (role?: string) => {
            if (shown.players.length >= MAX_ROSTER_PLAYERS) return null;
            const key = newRosterKey();
            edit((current) => ({
                ...current,
                players: [...current.players, { key, name: "", number: "", role: role ? toRosterRole(role, current.roles) : firstSkaterRole(current.roles) }],
            }));
            return key;
        },
        [shown.players.length, edit],
    );

    return {
        roster: shown,
        payload: owned ? roster : undefined,
        setAgeGroup: (ageGroup) => edit((current) => setRosterAgeGroup(current, ageGroup)),
        toggleRole: (role) => edit((current) => toggleRosterRole(current, role)),
        addCustomRole,
        addPlayer,
        updatePlayer: (key, patch) =>
            edit((current) => ({
                ...current,
                players: current.players.map((player) =>
                    player.key === key ? { ...player, ...patch, ...(patch.role !== undefined && { role: toRosterRole(patch.role, current.roles) }) } : player,
                ),
            })),
        removePlayer: (key) => edit((current) => ({ ...current, players: current.players.filter((player) => player.key !== key) })),
        addPlayers: (players) =>
            edit((current) => ({
                ...current,
                players: [
                    ...current.players,
                    ...players
                        .slice(0, Math.max(0, MAX_ROSTER_PLAYERS - current.players.length))
                        .map((player) => ({ key: newRosterKey(), name: player.name, number: player.number, role: toRosterRole(player.role, current.roles) })),
                ],
            })),
        addFromTeam: (options) =>
            edit((current) => {
                const listed = new Set(current.players.flatMap((player) => (player.playerId ? [player.playerId] : [])));
                const fresh = options.filter((option) => !listed.has(option.playerId)).slice(0, Math.max(0, MAX_ROSTER_PLAYERS - current.players.length));
                return {
                    ...current,
                    players: [
                        ...current.players,
                        ...fresh.map((option) => ({
                            key: newRosterKey(),
                            name: option.name,
                            number: option.number,
                            role: roleFromTeamPosition(option.position, current.roles),
                            playerId: option.playerId,
                        })),
                    ],
                };
            }),
    };
}

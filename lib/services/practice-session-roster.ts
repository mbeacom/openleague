/**
 * Practice roster database work (roster and suggestions spec R6–R8) that runs
 * INSIDE the calling Server Action's transaction, plus the read select every
 * loader shares; these are not actions (ADR-0002). The rules themselves are
 * pure, in lib/utils/practice-roster.ts.
 */
import type { Prisma } from "@prisma/client";
import { ROSTER_PLAYER_TEAM_MESSAGE, toPracticeRoster, toRosterNumber, type PracticeRoster } from "@/lib/utils/practice-roster";

/**
 * What every roster read selects. A linked player's name and jersey number
 * come from Player, and nothing else of Player: no contact, birth date or
 * membership field ever leaves the database through a practice (R6, R8).
 */
export const PRACTICE_ROSTER_SELECT = {
    rosterAgeGroup: true,
    rosterRoles: true,
    rosterPlayers: {
        orderBy: { position: "asc" },
        select: {
            id: true,
            name: true,
            number: true,
            role: true,
            playerId: true,
            player: { select: { name: true, jerseyNumber: true, teamId: true } },
        },
    },
} as const satisfies Prisma.PracticeSessionSelect;

export type StoredPracticeRoster = Prisma.PracticeSessionGetPayload<{ select: typeof PRACTICE_ROSTER_SELECT }>;

/**
 * The stored roster as the editor and views read it; null when the practice
 * has none (empty positions). A linked player who is no longer on the
 * practice's team (moved to another team) is left out: their name isn't this
 * team's to show, and an open editor's autosave never sends a link the save
 * would refuse.
 */
export function readPracticeRoster(stored: StoredPracticeRoster & { teamId: string }): PracticeRoster | null {
    // Optional chaining: a caller's select without the roster fields reads as no roster.
    if (!stored.rosterRoles?.length) return null;
    return toPracticeRoster({
        ageGroup: stored.rosterAgeGroup,
        roles: stored.rosterRoles,
        players: stored.rosterPlayers.filter((row) => !row.player || row.player.teamId === stored.teamId).map((row) => ({
            key: row.id,
            // A linked player's current team name and number, read live (R6).
            name: row.player ? row.player.name : (row.name ?? ""),
            number: row.player ? toRosterNumber(row.player.jerseyNumber ?? "") : (row.number ?? ""),
            role: row.role,
            playerId: row.playerId,
        })),
    });
}

/** The first team link the practice's team doesn't have (R7), or null. After authorization, inside the save. */
export async function rosterTeamError(tx: Prisma.TransactionClient, teamId: string, roster: PracticeRoster): Promise<string | null> {
    const ids = [...new Set(roster.players.flatMap((player) => (player.playerId ? [player.playerId] : [])))];
    if (ids.length === 0) return null;
    const found = await tx.player.findMany({ where: { id: { in: ids }, teamId }, select: { id: true } });
    return found.length === ids.length ? null : ROSTER_PLAYER_TEAM_MESSAGE;
}

/**
 * Replaces the practice's roster whole (R7): null clears it. A linked player
 * stores only the link (the CHECK refuses a name or number beside it).
 */
export async function replaceSessionRoster(tx: Prisma.TransactionClient, sessionId: string, roster: PracticeRoster | null): Promise<void> {
    await tx.practiceSessionRosterPlayer.deleteMany({ where: { sessionId } });
    await tx.practiceSession.update({
        where: { id: sessionId },
        data: { rosterAgeGroup: roster?.ageGroup ?? null, rosterRoles: roster?.roles ?? [] },
    });
    if (!roster || roster.players.length === 0) return;
    await tx.practiceSessionRosterPlayer.createMany({
        data: roster.players.map((player, position) => ({
            sessionId,
            position,
            role: player.role,
            playerId: player.playerId ?? null,
            name: player.playerId ? null : player.name || null,
            number: player.playerId ? null : player.number || null,
        })),
    });
}

/** A practice's roster copied to another practice of the same team (duplicate): links kept, as read. */
export async function copySessionRoster(tx: Prisma.TransactionClient, source: StoredPracticeRoster & { teamId: string }, targetId: string): Promise<void> {
    const roster = readPracticeRoster(source);
    if (roster) await replaceSessionRoster(tx, targetId, roster);
}

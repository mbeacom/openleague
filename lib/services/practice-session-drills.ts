/**
 * Session-owned drill copies (practice planner 3a).
 *
 * Every drill in a saved session is its own Play row (isTemplate=false,
 * sessionId=S, sourcePlayId=provenance). These helpers run INSIDE the calling
 * Server Action's transaction; they are not actions themselves (ADR-0002).
 */
import type { Prisma } from "@prisma/client";

export const SESSION_DRILL_REJECTED_MESSAGE =
    "One or more drills not found or do not belong to this session";

/** A drill in the payload the session may not use. Aborts the whole save. */
export class SessionDrillError extends Error {
    constructor(message = SESSION_DRILL_REJECTED_MESSAGE) {
        super(message);
        this.name = "SessionDrillError";
    }
}

export type SessionDrillItem = { playId: string; clientKey: string; sequence: number };
export type SessionDrillMapping = { clientKey: string; sequence: number; playId: string };

/** What a clone copies. playData is copied raw (it may still be v1; reads upgrade it). */
export type CloneSource = {
    id: string;
    name: string;
    description: string | null;
    thumbnail: string | null;
    playData: Prisma.JsonValue;
    sourcePlayId: string | null;
};

export const CLONE_SOURCE_SELECT = {
    id: true,
    name: true,
    description: true,
    thumbnail: true,
    playData: true,
    sourcePlayId: true,
    isTemplate: true,
    sessionId: true,
} as const;

/** A copy's provenance is the library play it ultimately came from. */
function provenanceOf(source: CloneSource): string {
    return source.sourcePlayId ?? source.id;
}

/**
 * Creates one owned copy per entry, each in its own session, in one round
 * trip. Returns the new ids in `copies` order.
 */
export async function cloneDrillsIntoSessions(
    tx: Prisma.TransactionClient,
    input: { teamId: string; userId: string; copies: Array<{ sessionId: string; source: CloneSource }> },
): Promise<string[]> {
    if (input.copies.length === 0) return [];

    const created = await tx.play.createManyAndReturn({
        data: input.copies.map(({ sessionId, source }) => ({
            name: source.name,
            description: source.description,
            thumbnail: source.thumbnail,
            playData: source.playData as Prisma.InputJsonValue,
            isTemplate: false,
            teamId: input.teamId,
            createdById: input.userId,
            sessionId,
            sourcePlayId: provenanceOf(source),
        })),
        select: { id: true, name: true, sourcePlayId: true, sessionId: true },
    });

    // PostgreSQL returns INSERT … RETURNING rows in VALUES order, but Prisma
    // does not document it: verify, and abort rather than mis-map a drill.
    const inOrder =
        created.length === input.copies.length
        && created.every(
            (row, index) =>
                row.name === input.copies[index].source.name
                && row.sourcePlayId === provenanceOf(input.copies[index].source)
                && row.sessionId === input.copies[index].sessionId,
        );
    if (!inOrder) {
        throw new Error("Drill copies came back out of order");
    }
    return created.map((row) => row.id);
}

/** cloneDrillsIntoSessions for a single session. */
export async function cloneDrillsIntoSession(
    tx: Prisma.TransactionClient,
    input: { sessionId: string; teamId: string; userId: string; sources: CloneSource[] },
): Promise<string[]> {
    return cloneDrillsIntoSessions(tx, {
        teamId: input.teamId,
        userId: input.userId,
        copies: input.sources.map((source) => ({ sessionId: input.sessionId, source })),
    });
}

/**
 * Resolves a save payload to plays session S owns:
 * - owned by S: kept (a second occurrence of the same id is cloned);
 * - a library play, or an unowned play S already references (pre-3a data): cloned;
 * - anything else (another session's copy, another team's play, a missing
 *   play, an unowned non-library play S never referenced): SessionDrillError.
 *
 * Must run BEFORE the caller deletes S's session plays: it reads them to know
 * the legacy references. Returns the mapping in `items` order and the play
 * ids S referenced before this save (for deleteOrphanedSessionDrills).
 */
export async function materializeSessionDrills(
    tx: Prisma.TransactionClient,
    input: { sessionId: string; teamId: string; userId: string; items: SessionDrillItem[] },
): Promise<{ mapping: SessionDrillMapping[]; previousPlayIds: string[] }> {
    const previous = await tx.practiceSessionPlay.findMany({
        where: { sessionId: input.sessionId },
        select: { playId: true },
    });
    const previousPlayIds = [...new Set(previous.map((row) => row.playId))];
    if (input.items.length === 0) return { mapping: [], previousPlayIds };

    const plays = await tx.play.findMany({
        where: { id: { in: [...new Set(input.items.map((item) => item.playId))] }, teamId: input.teamId },
        select: CLONE_SOURCE_SELECT,
    });
    const byId = new Map(plays.map((play) => [play.id, play]));
    const referenced = new Set(previousPlayIds);
    const kept = new Set<string>();

    // For each item: the owned id it keeps, or the index of its clone source.
    const resolved: Array<{ item: SessionDrillItem; keptId: string } | { item: SessionDrillItem; cloneIndex: number }> = [];
    const sources: CloneSource[] = [];

    for (const item of input.items) {
        const play = byId.get(item.playId);
        if (!play) throw new SessionDrillError();

        if (play.sessionId === input.sessionId && !kept.has(play.id)) {
            kept.add(play.id);
            resolved.push({ item, keptId: play.id });
            continue;
        }

        const ownedHere = play.sessionId === input.sessionId;
        const isLibrary = play.isTemplate && play.sessionId === null;
        const isLegacyReference = play.sessionId === null && referenced.has(play.id);
        if (!ownedHere && !isLibrary && !isLegacyReference) {
            throw new SessionDrillError();
        }

        resolved.push({ item, cloneIndex: sources.length });
        sources.push(play);
    }

    const cloneIds = await cloneDrillsIntoSession(tx, {
        sessionId: input.sessionId,
        teamId: input.teamId,
        userId: input.userId,
        sources,
    });

    const mapping = resolved.map((entry) => ({
        clientKey: entry.item.clientKey,
        sequence: entry.item.sequence,
        playId: "keptId" in entry ? entry.keptId : cloneIds[entry.cloneIndex],
    }));
    return { mapping, previousPlayIds };
}

/**
 * After S's session plays are rewritten: deletes owned plays that S
 * referenced before this save and that no session play references now.
 * Drop-only by design: a copy S has never referenced (one the drill dialog
 * just created, not yet sent by the editor) is never deleted here, so an
 * autosave already in flight cannot remove it. Never-referenced copies go
 * with the session (ON DELETE CASCADE).
 */
export async function deleteOrphanedSessionDrills(
    tx: Prisma.TransactionClient,
    input: { sessionId: string; previousPlayIds: string[] },
): Promise<void> {
    if (input.previousPlayIds.length === 0) return;
    await tx.play.deleteMany({
        where: {
            sessionId: input.sessionId,
            id: { in: input.previousPlayIds },
            sessions: { none: {} },
        },
    });
}

/**
 * Detach-on-write: before a library play is updated or deleted, every
 * session whose rows still reference it (sessions not re-saved since 3a)
 * gets its own copy of the CURRENT content — one per session — and its rows
 * are repointed to that copy. Library edits and deletes then never reach a
 * session. Returns the number of sessions detached.
 */
export async function detachLibraryPlay(
    tx: Prisma.TransactionClient,
    input: { playId: string; teamId: string; userId: string },
): Promise<number> {
    const rows = await tx.practiceSessionPlay.findMany({
        where: { playId: input.playId, session: { teamId: input.teamId } },
        select: { sessionId: true },
    });
    const sessionIds = [...new Set(rows.map((row) => row.sessionId))];
    if (sessionIds.length === 0) return 0;

    // Team-scoped: a copy is created under input.teamId, so the source must be
    // that team's play (never copy another team's content into its sessions).
    const source = await tx.play.findUniqueOrThrow({
        where: { id: input.playId, teamId: input.teamId },
        select: CLONE_SOURCE_SELECT,
    });
    const copyIds = await cloneDrillsIntoSessions(tx, {
        teamId: input.teamId,
        userId: input.userId,
        copies: sessionIds.map((sessionId) => ({ sessionId, source })),
    });
    for (const [index, sessionId] of sessionIds.entries()) {
        await tx.practiceSessionPlay.updateMany({
            where: { sessionId, playId: input.playId },
            data: { playId: copyIds[index] },
        });
    }
    return sessionIds.length;
}

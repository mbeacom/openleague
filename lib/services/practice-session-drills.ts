/**
 * Session-owned drill copies (practice planner 3a).
 *
 * Every drill in a saved session is its own Play row (isTemplate=false,
 * sessionId=S, sourcePlayId=provenance). These helpers run INSIDE the calling
 * Server Action's transaction; they are not actions themselves (ADR-0002).
 */
import { Prisma } from "@prisma/client";
import { SESSION_DRILL_REJECTED_MESSAGE } from "@/lib/utils/session-drill-ids";
import { newPlayId } from "@/lib/services/play-ids";

export { SESSION_DRILL_REJECTED_MESSAGE };

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

    // Ids are generated here, so each copy is matched to its source by id:
    // returned row order is not documented, and two copies can share a name,
    // provenance and session while carrying different diagrams.
    const ids = input.copies.map(() => newPlayId());
    const created = await tx.play.createManyAndReturn({
        data: input.copies.map(({ sessionId, source }, index) => ({
            id: ids[index],
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
        select: { id: true },
    });

    const returned = new Set(created.map((row) => row.id));
    if (created.length !== ids.length || ids.some((id) => !returned.has(id))) {
        throw new Error("Drill copies did not come back as created");
    }
    return ids;
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
 * Copies S already owns that a stale payload item should map back to, keyed
 * by the unowned play they came from (each list is consumed one per item).
 *
 * Detach-on-write gives S a copy C of library play L and repoints S's rows to
 * C. An editor opened before that still sends L; cloning L would take L's NEW
 * content, and drop-only cleanup would then delete C. So an item sending an
 * unowned L maps to C when: S referenced C before this save, C came from L,
 * no payload item sends C itself, and S no longer references L.
 *
 * A further occurrence of that L (a legacy session that held L on several
 * rows got one copy for all of them) clones C, not L's new content.
 *
 * Trade-off: removing a copy's card and re-adding the same library drill in
 * one save window also lands here, so it reuses the existing copy (with its
 * session edits) instead of taking a fresh library copy.
 */
async function findReusableCopies(
    tx: Prisma.TransactionClient,
    sessionId: string,
    items: SessionDrillItem[],
    plays: Array<{ id: string; sessionId: string | null }>,
    previousPlayIds: string[],
): Promise<Map<string, CloneSource[]>> {
    const reusable = new Map<string, CloneSource[]>();
    const referenced = new Set(previousPlayIds);
    const payloadIds = new Set(items.map((item) => item.playId));
    const staleSources = plays
        .filter((play) => play.sessionId === null && !referenced.has(play.id))
        .map((play) => play.id);
    const candidates = previousPlayIds.filter((id) => !payloadIds.has(id));
    if (staleSources.length === 0 || candidates.length === 0) return reusable;

    const copies = await tx.play.findMany({
        where: { sessionId, id: { in: candidates }, sourcePlayId: { in: staleSources } },
        select: CLONE_SOURCE_SELECT,
        orderBy: { createdAt: "asc" },
    });
    for (const copy of copies) {
        // Re-checked here: the where clause is the contract, this is the guard.
        if (copy.sessionId !== sessionId || !copy.sourcePlayId || !staleSources.includes(copy.sourcePlayId)) continue;
        if (!candidates.includes(copy.id)) continue;
        reusable.set(copy.sourcePlayId, [...(reusable.get(copy.sourcePlayId) ?? []), copy]);
    }
    return reusable;
}

/**
 * Resolves a save payload to plays session S owns:
 * - owned by S: kept (a second occurrence of the same id is cloned);
 * - an unowned play S no longer references, whose detached copy S still
 *   owns and the payload does not send: mapped to that copy (findReusableCopies);
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
    const reusable = await findReusableCopies(tx, input.sessionId, input.items, plays, previousPlayIds);
    // The copy last reused for each stale L: further occurrences of L clone it.
    const reusedFor = new Map<string, CloneSource>();

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

        const reused = play.sessionId === null ? reusable.get(play.id)?.shift() : undefined;
        if (reused) {
            kept.add(reused.id);
            reusedFor.set(play.id, reused);
            resolved.push({ item, keptId: reused.id });
            continue;
        }
        const reusedCopy = reusedFor.get(play.id);
        if (reusedCopy) {
            resolved.push({ item, cloneIndex: sources.length });
            sources.push(reusedCopy);
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

/** Session-play columns a duplicate never copies: ids, foreign keys, timestamps. */
export const SESSION_PLAY_FIELDS_NOT_COPIED: ReadonlySet<string> = new Set([
    "id",
    "sessionId",
    "playId",
    "createdAt",
    "updatedAt",
]);

export type CopiedSessionPlayFields = Omit<
    Prisma.PracticeSessionPlayCreateManyInput,
    "id" | "sessionId" | "playId" | "createdAt" | "updatedAt"
>;

/**
 * Copies every PracticeSessionPlay scalar column except ids, foreign keys and
 * timestamps. Driven by the generated scalar-field enum, so a column added
 * later (e.g. phase 2b's runsWithPrevious) is carried without editing this.
 */
export function copySessionPlayScalars(row: Record<string, unknown>): CopiedSessionPlayFields {
    const copy: Record<string, unknown> = {};
    for (const field of Object.values(Prisma.PracticeSessionPlayScalarFieldEnum)) {
        if (!SESSION_PLAY_FIELDS_NOT_COPIED.has(field)) copy[field] = row[field];
    }
    return copy as CopiedSessionPlayFields;
}

/** "Copy of <title>", kept within the 100-character title limit. */
export function duplicateSessionTitle(title: string): string {
    return `Copy of ${title}`.slice(0, 100);
}

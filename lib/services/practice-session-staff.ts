/**
 * Practice staff database work (spec R2–R5) that runs INSIDE the calling
 * Server Action's transaction; these are not actions (ADR-0002). The rules
 * themselves are pure, in lib/utils/session-staff.ts.
 */
import type { Prisma } from "@prisma/client";
import { newPlayId } from "@/lib/services/play-ids";
import { isBlockKind, toRowKind } from "@/lib/utils/session-rows";
import { STAFF_ADMIN_MESSAGE, STAFF_NAME_TAKEN_MESSAGE, STAFF_OFFICIAL_MESSAGE, type StoredBlock, type StoredRowStaff } from "@/lib/utils/session-staff";

/** The database refused a name (the unique index on lower("name")): shown as the name message. */
export class StaffNameConflictError extends Error {
    constructor() {
        super(STAFF_NAME_TAKEN_MESSAGE);
        this.name = "StaffNameConflictError";
    }
}

function isUniqueViolation(error: unknown): boolean {
    return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

type StaffLink = { teamOfficialId?: string | null; userId?: string | null };

/**
 * A link the practice's team doesn't allow (spec R3, R4): an official must be
 * ACTIVE or INVITED on the team, a user an ADMIN member of it. Checked after
 * authorization, inside the save's transaction.
 */
export async function staffLinkError(tx: Prisma.TransactionClient, teamId: string, staff: readonly StaffLink[]): Promise<string | null> {
    const officialIds = [...new Set(staff.flatMap((member) => (member.teamOfficialId ? [member.teamOfficialId] : [])))];
    const userIds = [...new Set(staff.flatMap((member) => (member.userId ? [member.userId] : [])))];
    if (officialIds.length > 0) {
        const officials = await tx.teamOfficial.findMany({
            where: { id: { in: officialIds }, teamId, status: { in: ["ACTIVE", "INVITED"] } },
            select: { id: true },
        });
        if (officials.length !== officialIds.length) return STAFF_OFFICIAL_MESSAGE;
    }
    if (userIds.length > 0) {
        const admins = await tx.teamMember.findMany({
            where: { userId: { in: userIds }, teamId, role: "ADMIN" },
            select: { userId: true },
        });
        if (new Set(admins.map((admin) => admin.userId)).size !== userIds.length) return STAFF_ADMIN_MESSAGE;
    }
    return null;
}

/**
 * Replaces the practice's staff list with a sent one (spec R3), in its order.
 * A key that is a stored staff id of this practice keeps that id; any other key
 * gets a new id. Deleting first lets a save swap two names or positions (both
 * unique). The delete cascades the old assignments; the caller writes new ones.
 * Returns key → id.
 */
export async function replaceSessionStaff(
    tx: Prisma.TransactionClient,
    sessionId: string,
    staff: ReadonlyArray<{ key: string; name: string } & StaffLink>,
): Promise<Map<string, string>> {
    const stored = await tx.practiceSessionStaff.findMany({ where: { sessionId }, select: { id: true } });
    const storedIds = new Set(stored.map((member) => member.id));
    const ids = new Map(staff.map((member) => [member.key, storedIds.has(member.key) ? member.key : newPlayId()]));
    await tx.practiceSessionStaff.deleteMany({ where: { sessionId } });
    if (staff.length === 0) return ids;
    try {
        await tx.practiceSessionStaff.createMany({
            data: staff.map((member, position) => ({
                id: ids.get(member.key) as string,
                sessionId,
                name: member.name,
                position,
                teamOfficialId: member.teamOfficialId ?? null,
                userId: member.userId ?? null,
            })),
        });
    } catch (error) {
        if (isUniqueViolation(error)) throw new StaffNameConflictError();
        throw error;
    }
    return ids;
}

/**
 * Writes each row's staff, in order, to the rows just written. Rows are found
 * by sequence (unique per practice), never by position in a returned list.
 * Reads and writes nothing when no row has anyone.
 */
export async function writeRowStaff(
    tx: Prisma.TransactionClient,
    sessionId: string,
    assignments: ReadonlyArray<{ sequence: number; staffIds: readonly string[] }>,
): Promise<void> {
    const wanted = assignments.filter((assignment) => assignment.staffIds.length > 0);
    if (wanted.length === 0) return;
    const written = await tx.practiceSessionPlay.findMany({
        where: { sessionId, sequence: { in: wanted.map((assignment) => assignment.sequence) } },
        select: { id: true, sequence: true },
    });
    const rowIds = new Map(written.map((row) => [row.sequence, row.id]));
    await tx.practiceSessionPlayStaff.createMany({
        data: wanted.flatMap((assignment) => {
            const playRowId = rowIds.get(assignment.sequence);
            if (playRowId === undefined) throw new Error(`No row at sequence ${assignment.sequence}`);
            return assignment.staffIds.map((staffId, position) => ({ playRowId, staffId, position }));
        }),
    });
}

/**
 * The stored assignments, read BEFORE the rows are deleted (spec R3: the delete
 * cascades them), grouped by row in each row's order, with every stored block
 * row's sequence and kind when a block had anyone (carryRowStaff carries block
 * staff only when the save keeps that block layout exactly).
 */
export async function readCarriedRowStaff(
    tx: Prisma.TransactionClient,
    sessionId: string,
): Promise<{ stored: StoredRowStaff[]; storedBlocks: StoredBlock[] }> {
    const assigned = await tx.practiceSessionPlayStaff.findMany({
        where: { playRow: { sessionId } },
        orderBy: { position: "asc" },
        select: { staffId: true, playRowId: true, playRow: { select: { playId: true, kind: true, sequence: true } } },
    });
    if (assigned.length === 0) return { stored: [], storedBlocks: [] };
    const byRow = new Map<string, StoredRowStaff>();
    for (const entry of assigned) {
        const row = byRow.get(entry.playRowId) ?? {
            playId: entry.playRow.playId,
            kind: toRowKind(entry.playRow.kind),
            sequence: entry.playRow.sequence,
            staffIds: [],
        };
        row.staffIds.push(entry.staffId);
        byRow.set(entry.playRowId, row);
    }
    const stored = [...byRow.values()];
    const storedBlocks = stored.some((row) => isBlockKind(row.kind))
        ? (
              await tx.practiceSessionPlay.findMany({
                  where: { sessionId, kind: { not: "drill" } },
                  orderBy: { sequence: "asc" },
                  select: { sequence: true, kind: true },
              })
          ).map((row) => ({ sequence: row.sequence, kind: toRowKind(row.kind) }))
        : [];
    return { stored, storedBlocks };
}

/**
 * Practice staff database work (spec R2–R5) that runs INSIDE the calling
 * Server Action's transaction; these are not actions (ADR-0002). The rules
 * themselves are pure, in lib/utils/session-staff.ts.
 */
import { Prisma } from "@prisma/client";
import { newPlayId } from "@/lib/services/play-ids";
import { isBlockKind, toRowKind } from "@/lib/utils/session-rows";
import { STAFF_NAME_TAKEN_MESSAGE, staffAdminGoneMessage, staffOfficialGoneMessage, type StoredBlock, type StoredRowStaff } from "@/lib/utils/session-staff";

/** The database refused a name (the unique index on lower("name")): shown as the name message. */
export class StaffNameConflictError extends Error {
    constructor() {
        super(STAFF_NAME_TAKEN_MESSAGE);
        this.name = "StaffNameConflictError";
    }
}

/** The unique index on ("sessionId", lower("name")), added by hand in the migration (Prisma can't model it). */
export const STAFF_NAME_INDEX = "practice_session_staff_sessionId_lower_name_key";

type UniqueViolationMeta = {
    target?: unknown;
    driverAdapterError?: { cause?: { constraint?: { index?: string; fields?: string[] } } };
};

/**
 * A unique violation on the staff name index, and on nothing else (the
 * (sessionId, position) index or a primary key stays a generic failure).
 * Under a driver adapter a P2002 carries no meta.target: the cause is in
 * meta.driverAdapterError.cause.constraint, where the pg adapter names the
 * index and the Neon adapter lists the key's columns as PostgreSQL's message
 * prints them, cut at the expression's first ")" (`lower(name`). Without any
 * of these the violation is not counted as a name clash.
 */
export function isStaffNameConflict(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return false;
    const meta = (error.meta ?? {}) as UniqueViolationMeta;
    const constraint = meta.driverAdapterError?.cause?.constraint;
    if (constraint?.index !== undefined) return constraint.index === STAFF_NAME_INDEX;
    const fields = constraint?.fields ?? (Array.isArray(meta.target) ? meta.target : typeof meta.target === "string" ? [meta.target] : []);
    return fields.some((field) => typeof field === "string" && (field === STAFF_NAME_INDEX || /^lower\(/i.test(field.trim())));
}

type StaffLink = { teamOfficialId?: string | null; userId?: string | null };

/**
 * A link the practice's team doesn't allow (spec R3, R4): an official must be
 * ACTIVE or INVITED on the team, a user an ADMIN member of it. Checked after
 * authorization, inside the save's transaction. The message names the first
 * person refused and says what to do: an editor left open while an official
 * was removed or an admin demoted keeps sending the link until the coach
 * removes them or reloads (the edit loader unlinks them).
 */
export async function staffLinkError(
    tx: Prisma.TransactionClient,
    teamId: string,
    staff: ReadonlyArray<{ name: string } & StaffLink>,
): Promise<string | null> {
    const officialIds = [...new Set(staff.flatMap((member) => (member.teamOfficialId ? [member.teamOfficialId] : [])))];
    const userIds = [...new Set(staff.flatMap((member) => (member.userId ? [member.userId] : [])))];
    if (officialIds.length > 0) {
        const officials = await tx.teamOfficial.findMany({
            where: { id: { in: officialIds }, teamId, status: { in: ["ACTIVE", "INVITED"] } },
            select: { id: true },
        });
        const live = new Set(officials.map((official) => official.id));
        const gone = staff.find((member) => member.teamOfficialId && !live.has(member.teamOfficialId));
        if (gone) return staffOfficialGoneMessage(gone.name);
    }
    if (userIds.length > 0) {
        const admins = await tx.teamMember.findMany({
            where: { userId: { in: userIds }, teamId, role: "ADMIN" },
            select: { userId: true },
        });
        const live = new Set(admins.map((admin) => admin.userId));
        const gone = staff.find((member) => member.userId && !live.has(member.userId));
        if (gone) return staffAdminGoneMessage(gone.name);
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
        // The list was just deleted, ids are stored or new and positions run 0..n-1, so the name
        // index is the one a sound save can hit; isStaffNameConflict still checks which index fired.
        if (isStaffNameConflict(error)) throw new StaffNameConflictError();
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

/** What a duplicate reads of each staff member: every column but the practice (the id maps assignments). */
export const PRACTICE_STAFF_COPY_SELECT = { id: true, name: true, position: true, teamOfficialId: true, userId: true } as const;
/** Staff columns a duplicate never copies: the id (new) and the practice (the copy). */
export const STAFF_FIELDS_NOT_COPIED: ReadonlySet<string> = new Set(["id", "sessionId"]);
/** What a duplicate reads of each assignment: the person (mapped to their copy) and the order. */
export const ROW_STAFF_COPY_SELECT = { staffId: true, position: true } as const;
/** Assignment columns a duplicate never copies: the row (the copy's row, found by sequence). */
export const ROW_STAFF_FIELDS_NOT_COPIED: ReadonlySet<string> = new Set(["playRowId"]);

/** A staff member as PRACTICE_STAFF_COPY_SELECT reads it. */
type StaffCopySource = { id: string; name: string; position: number; teamOfficialId: string | null; userId: string | null };

/**
 * The staff with any link the team no longer allows (an official not ACTIVE or
 * INVITED, a user no longer an ADMIN) set to null, names kept: the same rule
 * staffLinkError applies on save, so a copy never stores a link a save of it
 * would refuse. Reads nothing when nobody is linked.
 */
export async function withLiveStaffLinks<T extends StaffLink>(
    tx: Prisma.TransactionClient,
    teamId: string,
    staff: readonly T[],
): Promise<T[]> {
    const officialIds = [...new Set(staff.flatMap((member) => (member.teamOfficialId ? [member.teamOfficialId] : [])))];
    const userIds = [...new Set(staff.flatMap((member) => (member.userId ? [member.userId] : [])))];
    const liveOfficials = new Set(
        officialIds.length === 0
            ? []
            : (
                  await tx.teamOfficial.findMany({
                      where: { id: { in: officialIds }, teamId, status: { in: ["ACTIVE", "INVITED"] } },
                      select: { id: true },
                  })
              ).map((official) => official.id),
    );
    const admins = new Set(
        userIds.length === 0
            ? []
            : (
                  await tx.teamMember.findMany({
                      where: { userId: { in: userIds }, teamId, role: "ADMIN" },
                      select: { userId: true },
                  })
              ).map((admin) => admin.userId),
    );
    return staff.map((member) => ({
        ...member,
        teamOfficialId: member.teamOfficialId && liveOfficials.has(member.teamOfficialId) ? member.teamOfficialId : null,
        userId: member.userId && admins.has(member.userId) ? member.userId : null,
    }));
}

/**
 * Duplicate (spec R5): a practice's staff into another practice of the same
 * team, new ids, links kept. Every staff column but the id and the practice is
 * copied, driven by the generated scalar-field enum (the guard test fails when
 * a column is added to the model but not to PRACTICE_STAFF_COPY_SELECT).
 * Returns old id → new id.
 */
export async function copySessionStaff(
    tx: Prisma.TransactionClient,
    sessionId: string,
    source: readonly StaffCopySource[],
): Promise<Map<string, string>> {
    const ids = new Map(source.map((member) => [member.id, newPlayId()]));
    if (source.length === 0) return ids;
    await tx.practiceSessionStaff.createMany({
        data: source.map((member) => {
            const copy: Record<string, unknown> = {};
            for (const field of Object.values(Prisma.PracticeSessionStaffScalarFieldEnum)) {
                if (!STAFF_FIELDS_NOT_COPIED.has(field)) copy[field] = (member as Record<string, unknown>)[field];
            }
            return { ...copy, id: ids.get(member.id) as string, sessionId } as Prisma.PracticeSessionStaffCreateManyInput;
        }),
    });
    return ids;
}

"use server";

/**
 * Hosted rankings (ADR-0025; hosted rankings and team logos spec). A signed-in
 * user keeps their own rankings documents on the hosted app: the same
 * portable `openleague.rankings` v1 document the static planner stores in the
 * browser, validated by the same parser on every write.
 *
 * Every record is private to its owner. There is no team, league or public
 * read path: every query is scoped by `ownerId` from the session, and a
 * record that isn't the caller's reads as not found.
 */

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/auth/session";
import { parseId } from "@/lib/utils/ids";
import {
    MAX_RANKINGS_FILE_BYTES,
    RANKINGS_FILE_TOO_LARGE_MESSAGE,
    RANKINGS_TOO_LARGE_TO_SAVE_MESSAGE,
    createRankingsDocument,
    fitsRankingsFile,
    parseRankings,
    type RankingsDocument,
} from "@/lib/rankings-document";
import { RANKINGS_LIST_PATH } from "@/components/features/rankings/paths";

export type ActionResult<T> =
    | { success: true; data: T }
    | { success: false; error: string; details?: unknown };

export interface RankingsRecordSummary {
    id: string;
    title: string;
    /** False after "Start over", until the next import. */
    hasDocument: boolean;
    updatedAt: Date;
}

export interface RankingsRecordView {
    id: string;
    title: string;
    /** null after "Start over": the screens offer an import, as on the static app. */
    document: RankingsDocument | null;
}

// Not exported: a "use server" file may export only async functions.
const MAX_RECORDS_PER_USER = 20;
const NOT_FOUND_MESSAGE = "Those rankings weren't found.";
const LOAD_FAILED_MESSAGE = "Couldn't load your rankings. Please try again.";
const SAVE_FAILED_MESSAGE = "Couldn't save your rankings. Please try again.";
const DAMAGED_MESSAGE = "These saved rankings can't be read. Start over by importing the schedule again.";
const TOO_MANY_MESSAGE = `You can keep up to ${MAX_RECORDS_PER_USER} rankings. Delete one to add another.`;

const createSchema = z.object({
    title: z.string().max(100).optional(),
    /** A document read from a rankings file; checked by parseRankings below. */
    document: z.unknown().optional(),
});

const saveSchema = z.object({
    id: z.unknown(),
    document: z.unknown(),
});

/**
 * The portable parser, between two size checks. The compact JSON's length is
 * a cheap lower bound on the file's size, so a body within the action limit
 * but plainly past the file cap is refused before the schema walks it. After
 * parsing, the canonical file (UTF-8 bytes) must fit the cap too, so a saved
 * document always exports and reopens.
 */
function validDocument(raw: unknown): { ok: true; doc: RankingsDocument } | { ok: false; error: string; issues?: string[] } {
    let size: number;
    try {
        size = JSON.stringify(raw)?.length ?? 0;
    } catch {
        return { ok: false, error: SAVE_FAILED_MESSAGE };
    }
    if (size > MAX_RANKINGS_FILE_BYTES) return { ok: false, error: RANKINGS_FILE_TOO_LARGE_MESSAGE };
    const parsed = parseRankings(raw);
    if (!parsed.ok) return { ok: false, error: parsed.error.issues?.[0] ?? parsed.error.message, issues: parsed.error.issues };
    if (!fitsRankingsFile(parsed.doc)) return { ok: false, error: RANKINGS_TOO_LARGE_TO_SAVE_MESSAGE };
    return { ok: true, doc: parsed.doc };
}

/** The hosted list, and the record's own page when there is one. */
function revalidateRankings(id?: string) {
    revalidatePath(RANKINGS_LIST_PATH);
    if (id) revalidatePath(`${RANKINGS_LIST_PATH}/${id}`);
}

/** Prisma's JSON input type for a validated document. */
const asJson = (doc: RankingsDocument) => doc as unknown as Prisma.InputJsonValue;

export async function listRankingsRecords(): Promise<ActionResult<RankingsRecordSummary[]>> {
    const userId = await requireUserId();
    try {
        const records = await prisma.rankingsRecord.findMany({
            where: { ownerId: userId },
            orderBy: { updatedAt: "desc" },
            take: MAX_RECORDS_PER_USER,
            select: { id: true, title: true, updatedAt: true },
        });
        const cleared = await prisma.rankingsRecord.findMany({
            where: { ownerId: userId, document: { equals: Prisma.DbNull } },
            select: { id: true },
        });
        const empty = new Set(cleared.map((record) => record.id));
        return { success: true, data: records.map((record) => ({ ...record, hasDocument: !empty.has(record.id) })) };
    } catch (error) {
        console.error({ event: "rankings_list_failed", errorType: error instanceof Error ? error.name : "unknown" });
        return { success: false, error: LOAD_FAILED_MESSAGE };
    }
}

/** A new record: empty (to import into), or holding a document read from a rankings file. */
export async function createRankingsRecord(input: z.input<typeof createSchema> = {}): Promise<ActionResult<{ id: string }>> {
    const userId = await requireUserId();
    try {
        const validated = createSchema.safeParse(input);
        if (!validated.success) return { success: false, error: SAVE_FAILED_MESSAGE };
        let doc: RankingsDocument | null = null;
        if (validated.data.document !== undefined) {
            const checked = validDocument(validated.data.document);
            if (!checked.ok) return { success: false, error: checked.error, ...(checked.issues ? { details: { issues: checked.issues } } : {}) };
            doc = checked.doc;
        }
        const title = doc?.meta.title ?? createRankingsDocument({ title: validated.data.title ?? "" }).meta.title;

        const count = await prisma.rankingsRecord.count({ where: { ownerId: userId } });
        if (count >= MAX_RECORDS_PER_USER) return { success: false, error: TOO_MANY_MESSAGE };

        const record = await prisma.rankingsRecord.create({
            data: { ownerId: userId, title, document: doc ? asJson(doc) : Prisma.DbNull },
            select: { id: true },
        });
        revalidateRankings();
        return { success: true, data: record };
    } catch (error) {
        console.error({ event: "rankings_create_failed", errorType: error instanceof Error ? error.name : "unknown" });
        return { success: false, error: SAVE_FAILED_MESSAGE };
    }
}

export async function getRankingsRecord(recordId: string): Promise<ActionResult<RankingsRecordView>> {
    const userId = await requireUserId();
    const id = parseId(recordId);
    if (!id) return { success: false, error: NOT_FOUND_MESSAGE };
    try {
        const record = await prisma.rankingsRecord.findFirst({
            where: { id, ownerId: userId },
            select: { id: true, title: true, document: true },
        });
        if (!record) return { success: false, error: NOT_FOUND_MESSAGE };
        if (record.document === null) return { success: true, data: { id: record.id, title: record.title, document: null } };
        const parsed = parseRankings(record.document);
        if (!parsed.ok) return { success: false, error: DAMAGED_MESSAGE };
        return { success: true, data: { id: record.id, title: record.title, document: parsed.doc } };
    } catch (error) {
        console.error({ event: "rankings_load_failed", errorType: error instanceof Error ? error.name : "unknown" });
        return { success: false, error: LOAD_FAILED_MESSAGE };
    }
}

export async function saveRankingsRecord(input: { id: string; document: RankingsDocument }): Promise<ActionResult<RankingsDocument>> {
    const userId = await requireUserId();
    const shape = saveSchema.safeParse(input);
    const id = shape.success ? parseId(shape.data.id) : null;
    if (!shape.success || !id) return { success: false, error: NOT_FOUND_MESSAGE };
    try {
        const checked = validDocument(shape.data.document);
        if (!checked.ok) return { success: false, error: checked.error, ...(checked.issues ? { details: { issues: checked.issues } } : {}) };
        const { count } = await prisma.rankingsRecord.updateMany({
            where: { id, ownerId: userId },
            data: { title: checked.doc.meta.title, document: asJson(checked.doc) },
        });
        if (count === 0) return { success: false, error: NOT_FOUND_MESSAGE };
        revalidateRankings(id);
        return { success: true, data: checked.doc };
    } catch (error) {
        console.error({ event: "rankings_save_failed", errorType: error instanceof Error ? error.name : "unknown" });
        return { success: false, error: SAVE_FAILED_MESSAGE };
    }
}

/** "Start over": the record stays, empty, so the import screen can fill it again. */
export async function clearRankingsRecord(recordId: string): Promise<ActionResult<null>> {
    const userId = await requireUserId();
    const id = parseId(recordId);
    if (!id) return { success: false, error: NOT_FOUND_MESSAGE };
    try {
        const { count } = await prisma.rankingsRecord.updateMany({ where: { id, ownerId: userId }, data: { document: Prisma.DbNull } });
        if (count === 0) return { success: false, error: NOT_FOUND_MESSAGE };
        revalidateRankings(id);
        return { success: true, data: null };
    } catch (error) {
        console.error({ event: "rankings_clear_failed", errorType: error instanceof Error ? error.name : "unknown" });
        return { success: false, error: SAVE_FAILED_MESSAGE };
    }
}

export async function deleteRankingsRecord(recordId: string): Promise<ActionResult<{ id: string }>> {
    const userId = await requireUserId();
    const id = parseId(recordId);
    if (!id) return { success: false, error: NOT_FOUND_MESSAGE };
    try {
        const { count } = await prisma.rankingsRecord.deleteMany({ where: { id, ownerId: userId } });
        if (count === 0) return { success: false, error: NOT_FOUND_MESSAGE };
        revalidateRankings(id);
        return { success: true, data: { id } };
    } catch (error) {
        console.error({ event: "rankings_delete_failed", errorType: error instanceof Error ? error.name : "unknown" });
        return { success: false, error: SAVE_FAILED_MESSAGE };
    }
}

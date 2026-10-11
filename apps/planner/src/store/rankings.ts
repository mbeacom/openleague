/**
 * Rankings storage (static rankings spec; storage connectors spec R3): the
 * rankings store holds openleague.rankings documents keyed by a local id, so a
 * device can hold several, each with its own envelope id. Validated on write,
 * file cap included; a record that fails parsing on read is reported (the
 * screen offers "Start over"), never thrown.
 *
 * The screens still work on one document through RankingsOps: "the" rankings
 * document is the most recently updated record. RankingsDocumentOps reaches
 * every record by id, as the hosted app keys its records (ADR-0025).
 */
import type { ActionResult } from "@/lib/planner-store";
import { RANKINGS_FORMAT, RANKINGS_TOO_LARGE_TO_SAVE_MESSAGE, fitsRankingsFile, parseRankings, type RankingsDocument } from "@/lib/rankings-document";
import { docKeyOf } from "./links";
import type { RepoTx, StoredRankings } from "./records";
import { StoreRefusal, attempt, ok, write, type StoreContext } from "./shared";

export const RANKINGS_LOAD_FAILED = "Couldn't load your rankings. Please try again.";
export const RANKINGS_SAVE_FAILED = "Couldn't save your rankings. Please try again.";
export const RANKINGS_DAMAGED = "Your saved rankings can't be read. Start over by importing the schedule again.";
export const RANKINGS_NOT_FOUND = "Those rankings weren't found.";

/** The one-document seam the rankings screens use; hosted implements it over a record (ADR-0025). */
export interface RankingsOps {
    getRankings: () => Promise<ActionResult<RankingsDocument | null>>;
    saveRankings: (doc: RankingsDocument) => Promise<ActionResult<RankingsDocument>>;
    clearRankings: () => Promise<ActionResult<null>>;
}

export interface RankingsSummary {
    id: string;
    documentId: string;
    /** null when the record can't be read. */
    title: string | null;
    damaged: boolean;
    updatedAt: Date;
}

export interface RankingsRecordView {
    id: string;
    documentId: string;
    document: RankingsDocument;
    updatedAt: Date;
}

/** Every rankings document on this device, by local id (static only: hosted has its own actions). */
export interface RankingsDocumentOps {
    /** Most recently updated first. */
    listRankingsDocuments: () => Promise<ActionResult<RankingsSummary[]>>;
    getRankingsDocument: (id: string) => Promise<ActionResult<RankingsRecordView>>;
    /** A new record. `documentId` keeps an opened file's envelope id; otherwise the record's own id is used. */
    createRankingsDocument: (doc: RankingsDocument, options?: { documentId?: string }) => Promise<ActionResult<RankingsRecordView>>;
    saveRankingsDocument: (id: string, doc: RankingsDocument) => Promise<ActionResult<RankingsRecordView>>;
    /** Deletes the record and its link (the remote file, if any, is left alone). */
    deleteRankingsDocument: (id: string) => Promise<ActionResult<null>>;
}

/** Newest first; ties by creation, then id, so "the current one" never flickers. */
function newestFirst(a: StoredRankings, b: StoredRankings): number {
    return b.updatedAt.getTime() - a.updatedAt.getTime() || b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
}

async function currentRecord(tx: RepoTx): Promise<StoredRankings | undefined> {
    return (await tx.allRankingsRecords()).sort(newestFirst)[0];
}

/** A failed check as an ActionResult, the same shape the screens already handle. */
type Checked = { ok: true; doc: RankingsDocument } | { ok: false; result: ActionResult<never> };

function checkForWrite(doc: RankingsDocument): Checked {
    const parsed = parseRankings(doc);
    if (!parsed.ok) {
        return { ok: false, result: { success: false, error: parsed.error.issues?.[0] ?? parsed.error.message, details: { path: parsed.error.paths?.[0] ?? [] } } };
    }
    // The file cap holds on every write, so whatever is saved still exports and reopens.
    if (!fitsRankingsFile(parsed.doc)) return { ok: false, result: { success: false, error: RANKINGS_TOO_LARGE_TO_SAVE_MESSAGE } };
    return { ok: true, doc: parsed.doc };
}

function viewOf(record: StoredRankings, document: RankingsDocument): RankingsRecordView {
    return { id: record.id, documentId: record.documentId, document, updatedAt: record.updatedAt };
}

export function createRankingsOps(ctx: StoreContext): RankingsOps & RankingsDocumentOps {
    return {
        getRankings: () =>
            attempt(RANKINGS_LOAD_FAILED, async () => {
                const record = await ctx.repo.read((tx) => currentRecord(tx));
                if (!record) return ok(null);
                const parsed = parseRankings(record.document);
                return parsed.ok ? ok(parsed.doc) : { success: false, error: RANKINGS_DAMAGED };
            }),

        saveRankings: (doc) =>
            attempt(RANKINGS_SAVE_FAILED, async () => {
                const checked = checkForWrite(doc);
                if (!checked.ok) return checked.result;
                const at = ctx.now();
                const freshId = ctx.newId();
                await write(ctx, async (tx) => {
                    const current = await currentRecord(tx);
                    await tx.putRankingsRecord(
                        current ? { ...current, document: checked.doc, updatedAt: at } : { id: freshId, documentId: freshId, document: checked.doc, createdAt: at, updatedAt: at },
                    );
                });
                return ok(checked.doc);
            }),

        clearRankings: () =>
            attempt(RANKINGS_SAVE_FAILED, async () => {
                await write(ctx, async (tx) => {
                    const current = await currentRecord(tx);
                    if (!current) return;
                    await tx.deleteRankingsRecord(current.id);
                    await tx.deleteLink(docKeyOf(RANKINGS_FORMAT, current.id));
                });
                return ok(null);
            }),

        listRankingsDocuments: () =>
            attempt(RANKINGS_LOAD_FAILED, async () => {
                const records = (await ctx.repo.read((tx) => tx.allRankingsRecords())).sort(newestFirst);
                return ok(
                    records.map((record) => {
                        const parsed = parseRankings(record.document);
                        return { id: record.id, documentId: record.documentId, title: parsed.ok ? parsed.doc.meta.title : null, damaged: !parsed.ok, updatedAt: record.updatedAt };
                    }),
                );
            }),

        getRankingsDocument: (id) =>
            attempt(RANKINGS_LOAD_FAILED, async () => {
                const record = await ctx.repo.read((tx) => tx.getRankingsRecord(id));
                if (!record) return { success: false, error: RANKINGS_NOT_FOUND };
                const parsed = parseRankings(record.document);
                return parsed.ok ? ok(viewOf(record, parsed.doc)) : { success: false, error: RANKINGS_DAMAGED };
            }),

        createRankingsDocument: (doc, options = {}) =>
            attempt(RANKINGS_SAVE_FAILED, async () => {
                const checked = checkForWrite(doc);
                if (!checked.ok) return checked.result;
                const at = ctx.now();
                const id = ctx.newId();
                const record: StoredRankings = { id, documentId: options.documentId ?? id, document: checked.doc, createdAt: at, updatedAt: at };
                await write(ctx, (tx) => tx.putRankingsRecord(record));
                return ok(viewOf(record, checked.doc));
            }),

        saveRankingsDocument: (id, doc) =>
            attempt(RANKINGS_SAVE_FAILED, async () => {
                const checked = checkForWrite(doc);
                if (!checked.ok) return checked.result;
                const at = ctx.now();
                const saved = await write(ctx, async (tx) => {
                    const existing = await tx.getRankingsRecord(id);
                    if (!existing) throw new StoreRefusal(RANKINGS_NOT_FOUND);
                    const next: StoredRankings = { ...existing, document: checked.doc, updatedAt: at };
                    await tx.putRankingsRecord(next);
                    return next;
                });
                return ok(viewOf(saved, checked.doc));
            }),

        deleteRankingsDocument: (id) =>
            attempt(RANKINGS_SAVE_FAILED, async () => {
                await write(ctx, async (tx) => {
                    await tx.deleteRankingsRecord(id);
                    await tx.deleteLink(docKeyOf(RANKINGS_FORMAT, id));
                });
                return ok(null);
            }),
    };
}

/**
 * The sync engine's working copies over the planner's store (storage
 * connectors plan, Task 8): practices as plan documents and rankings records,
 * each keyed `${kind}:${localId}`. A practice's plan is built exactly as
 * "Download plan file" builds it, with the practice's last edit as its
 * `exportedAt`, so an unedited practice reads back the same and its base hash
 * holds. Store failures throw, with the store's own message.
 */
import { PLAN_FORMAT, type PlanDocument } from "@/lib/plan-document";
import { RANKINGS_FORMAT, type RankingsDocument } from "@/lib/rankings-document";
import { isDocumentKind, type DocumentGenerator, type DocumentKind } from "@/lib/document-envelope";
import type { ActionResult } from "@/lib/planner-store";
import { buildPlanDocument } from "@/components/features/practice-planner/ExportPlanMenu";
import type { LocalPlannerStore } from "../store/types";
import type { LocalDocument, LocalDocuments } from "./sync";

export class StoreDocumentError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "StoreDocumentError";
    }
}

/** `${kind}:${localId}` back into its parts; null for a key this build doesn't know. */
export function parseDocKey(docKey: string): { kind: DocumentKind; id: string } | null {
    const at = docKey.indexOf(":");
    if (at === -1) return null;
    const kind = docKey.slice(0, at);
    const id = docKey.slice(at + 1);
    return isDocumentKind(kind) && id ? { kind, id } : null;
}

function unwrap<T>(result: ActionResult<T>): T {
    if (!result.success) throw new StoreDocumentError(result.error);
    return result.data;
}

/** A document's title, for lists and dialogs. */
export function titleOfPayload(kind: string, payload: unknown): string {
    if (kind === PLAN_FORMAT) return (payload as PlanDocument | null)?.session?.title ?? "Practice plan";
    if (kind === RANKINGS_FORMAT) return (payload as RankingsDocument | null)?.meta?.title ?? "Rankings";
    return "Document";
}

export type DocumentStore = Pick<
    LocalPlannerStore,
    | "getSessionView"
    | "getSessionDocumentInfo"
    | "ensureSessionDocumentId"
    | "replaceSessionFromPlan"
    | "setSessionDocumentId"
    | "getRankingsDocument"
    | "putRankingsDocument"
    | "setRankingsDocumentId"
    | "addRecoveredCopy"
>;

/** The practice's plan as its plan file carries it: the same build as "Download plan file", dated by its last edit. */
export async function sessionPlanDocument(store: Pick<DocumentStore, "getSessionView" | "getSessionDocumentInfo">, id: string, generator: DocumentGenerator = "openleague-static") {
    const info = await store.getSessionDocumentInfo(id);
    if (!info.success) return null;
    const view = await store.getSessionView(id);
    if (!view.success) return null;
    return { info: info.data, plan: buildPlanDocument(view.data, info.data.updatedAt, generator) };
}

export function createStoreDocuments(store: DocumentStore, generator: DocumentGenerator = "openleague-static"): LocalDocuments {
    return {
        read: async (docKey) => {
            const key = parseDocKey(docKey);
            if (!key) return null;
            if (key.kind === PLAN_FORMAT) {
                const built = await sessionPlanDocument(store, key.id, generator);
                if (!built) return null;
                // Made on first use (a connector save, a wrapped download), then kept.
                const documentId = built.info.documentId ?? unwrap(await store.ensureSessionDocumentId(key.id));
                return { kind: PLAN_FORMAT, documentId, payload: built.plan };
            }
            const record = await store.getRankingsDocument(key.id);
            if (!record.success) return null;
            return { kind: RANKINGS_FORMAT, documentId: record.data.documentId, payload: record.data.document };
        },

        replace: async (docKey, next: LocalDocument) => {
            const key = parseDocKey(docKey);
            if (!key || key.kind !== next.kind) throw new StoreDocumentError("That file is a different kind of document.");
            if (key.kind === PLAN_FORMAT) {
                unwrap(await store.replaceSessionFromPlan(key.id, next.payload as PlanDocument, { documentId: next.documentId }));
                return;
            }
            unwrap(await store.putRankingsDocument(key.id, next.payload as RankingsDocument, { documentId: next.documentId }));
        },

        recover: async (docKey, copy, at) => {
            unwrap(await store.addRecoveredCopy({ docKey, kind: copy.kind, documentId: copy.documentId, title: titleOfPayload(copy.kind, copy.payload), payload: copy.payload }, at));
        },

        setDocumentId: async (docKey, documentId) => {
            const key = parseDocKey(docKey);
            if (!key) return;
            unwrap(key.kind === PLAN_FORMAT ? await store.setSessionDocumentId(key.id, documentId) : await store.setRankingsDocumentId(key.id, documentId));
        },
    };
}

/**
 * "Replace my copy" for a file opened as a copy (storage connectors spec R7):
 * the document's current version goes to Recovered copies, then the file's
 * content (and its envelope id) replaces it. A link, if any, stays: the
 * changed content reads as unsaved against it.
 */
export async function replaceWithRecovery(documents: LocalDocuments, docKey: string, next: LocalDocument, at: string = new Date().toISOString()): Promise<void> {
    const previous = await documents.read(docKey);
    if (previous) await documents.recover(docKey, previous, at);
    await documents.replace(docKey, next);
}

/** What the rankings import's id match needs, over the store (RankingsImportScreen's RankingsFileOps). */
export function createRankingsFileOps(store: DocumentStore & Pick<LocalPlannerStore, "findRankingsByDocumentId" | "createRankingsDocument">) {
    const documents = createStoreDocuments(store);
    const attempted = async (work: () => Promise<unknown>): Promise<ActionResult<null>> => {
        try {
            await work();
            return { success: true, data: null };
        } catch (error) {
            return { success: false, error: error instanceof StoreDocumentError ? error.message : "Couldn't open the rankings file. Please try again." };
        }
    };
    return {
        findByDocumentId: async (documentId: string) => {
            const found = await store.findRankingsByDocumentId(documentId);
            return found.success ? found.data : null;
        },
        replaceMine: (id: string, doc: RankingsDocument) =>
            attempted(async () => {
                const key = `${RANKINGS_FORMAT}:${id}`;
                const current = await documents.read(key);
                await replaceWithRecovery(documents, key, { kind: RANKINGS_FORMAT, documentId: current?.documentId ?? id, payload: doc });
            }),
        keepBoth: (doc: RankingsDocument) => store.createRankingsDocument(doc),
        createWithId: (doc: RankingsDocument, documentId: string) => store.createRankingsDocument(doc, { documentId }),
    };
}

/**
 * Devices for the sync tests: each has its own link table (a memory repo), its
 * own working copies and its own client of a shared fake remote. Documents are
 * real rankings documents with made-up programs, so every remote read goes
 * through the envelope reader.
 */
import { createMemoryRepo } from "@/apps/planner/src/store/memory-repo";
import { createLinkStore, docKeyOf, type LinkStore } from "@/apps/planner/src/store/links";
import { createFakeConnector, type FakeConnector, type FakeRemote } from "@/apps/planner/src/storage/fake";
import { createSyncEngine, type LocalDocument, type LocalDocuments, type SyncEngine } from "@/apps/planner/src/storage/sync";
import { serializeDocument, wrapDocument } from "@/lib/document-envelope";
import { RANKINGS_FORMAT, createRankingsDocument, type RankingsDocument } from "@/lib/rankings-document";

export const KEY = docKeyOf(RANKINGS_FORMAT, "local-1");
export const DOCUMENT_ID = "0b7c1f0e-5a3e-4c1e-9a47-6f0d7b2f8a11";

export function rankingsTitled(title: string): RankingsDocument {
    return { ...createRankingsDocument({ title }), teams: [{ number: "901", name: "Riverside M1", startingBracket: null, excluded: false }] };
}

export function wrappedText(doc: RankingsDocument, id = DOCUMENT_ID): string {
    return serializeDocument(wrapDocument(RANKINGS_FORMAT, doc, { id, updatedAt: "2026-10-11T12:00:00.000Z", generator: "openleague-static" }));
}

export interface Clock {
    now: Date;
}

export function createClock(start = "2026-10-11T12:00:00.000Z"): Clock {
    return { now: new Date(start) };
}

let uuidSeq = 0;
/** Valid version 4 UUIDs, distinct across the suite. */
export function nextUuid(): string {
    return `00000000-0000-4000-8000-${String(++uuidSeq).padStart(12, "0")}`;
}

export interface MemoryDocuments extends LocalDocuments {
    docs: Map<string, LocalDocument>;
    recovered: Array<{ docKey: string; copy: LocalDocument; at: string }>;
}

export function memoryDocuments(): MemoryDocuments {
    const docs = new Map<string, LocalDocument>();
    const recovered: MemoryDocuments["recovered"] = [];
    return {
        docs,
        recovered,
        read: async (docKey) => (docs.has(docKey) ? structuredClone(docs.get(docKey)!) : null),
        replace: async (docKey, next) => {
            docs.set(docKey, structuredClone(next));
        },
        recover: async (docKey, copy, at) => {
            recovered.push({ docKey, copy: structuredClone(copy), at });
        },
        setDocumentId: async (docKey, documentId) => {
            const doc = docs.get(docKey);
            if (doc) docs.set(docKey, { ...doc, documentId });
        },
    };
}

export interface Device {
    name: string;
    connector: FakeConnector;
    links: LinkStore;
    documents: MemoryDocuments;
    engine: SyncEngine;
    /** The working copy's title (what a coach would see). */
    title: (docKey?: string) => string | undefined;
    /** A local edit, as the store would make it. */
    edit: (title: string, docKey?: string) => void;
    /** Puts a working copy in place without any sync (a document made on this device). */
    create: (doc: RankingsDocument, docKey?: string, documentId?: string) => void;
}

export function createDevice(remote: FakeRemote, name: string, clock: Clock): Device {
    const connector = createFakeConnector(remote, { user: name });
    const links = createLinkStore(createMemoryRepo());
    const documents = memoryDocuments();
    const engine = createSyncEngine({ connectors: [connector], links, documents, now: () => new Date(clock.now), newId: nextUuid });
    return {
        name,
        connector,
        links,
        documents,
        engine,
        title: (docKey = KEY) => (documents.docs.get(docKey)?.payload as RankingsDocument | undefined)?.meta.title,
        edit: (title, docKey = KEY) => {
            const doc = documents.docs.get(docKey);
            if (!doc) throw new Error(`${name} has no ${docKey}`);
            const payload = doc.payload as RankingsDocument;
            documents.docs.set(docKey, { ...doc, payload: { ...payload, meta: { ...payload.meta, title } } });
        },
        create: (doc, docKey = KEY, documentId = DOCUMENT_ID) => {
            documents.docs.set(docKey, { kind: RANKINGS_FORMAT, documentId, payload: doc });
        },
    };
}

/** A hook that holds a save between its revision check and its write until released. */
export function writeGate() {
    let reach!: () => void;
    let release!: () => void;
    const reached = new Promise<void>((resolve) => (reach = resolve));
    const released = new Promise<void>((resolve) => (release = resolve));
    return {
        hook: async () => {
            reach();
            await released;
        },
        reached,
        release,
    };
}

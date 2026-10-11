/**
 * Sync between a local document and its remote file (storage connectors spec,
 * "Sync and conflicts"; ADR-0022). Two layers:
 *
 * - Pure: syncStateOf derives the spec's state from a link and the remote's
 *   current revision; linkFromRemote and copyName build what a step records.
 * - createSyncEngine: save, open, check and resolve over connectors, the link
 *   table and the local working copies, each passed in, so the same engine runs
 *   against IndexedDB in the app and against memory in tests.
 *
 * The rules that keep writes from being lost: conflicts are decided by the
 * provider's revision, never a clock; a remote that moved past a version this
 * device wrote is "Overwritten", never a silent refresh; and local content is
 * replaced only by a refresh of a copy this device read, or by the coach's
 * choice, with the replaced version kept as a recovered copy.
 */
import { serializeDocument, wrapDocument, type DocumentGenerator, type DocumentKind, type DocumentPayloads } from "@/lib/document-envelope";
import { readAnyDocumentText } from "@/lib/document-formats";
import type { LinkStore } from "../store/links";
import type { DocumentLink } from "../store/records";
import { refOf, type ConnectorError, type ConnectorId, type RemoteFile, type RemoteRef, type StorageConnector } from "./connector";

export type SyncState =
    /** Clean, and the remote is at baseRevision: nothing to do. */
    | "in-sync"
    /** Local edits, remote unchanged: "Save" writes with expectedRevision = baseRevision. */
    | "unsaved"
    /** Clean, the remote moved, and the base came from a read: refreshed silently. */
    | "newer-available"
    /** Clean, the remote moved, and the base was this device's own save: the coach chooses. */
    | "overwritten"
    /** Local edits and the remote moved: the coach chooses. */
    | "conflict";

export type Resolution = "keep-mine" | "use-theirs" | "keep-both";

/** The checks the engine makes on focus or reconnect run at most this often per document. */
export const RECHECK_INTERVAL_MS = 60_000;

export interface SyncBase {
    dirty: boolean;
    baseRevision: string | null;
    baseWrittenHere: boolean;
}

/** The spec's state table. A link with no base revision has never matched any remote revision. */
export function syncStateOf(base: SyncBase, remoteRevision: string): SyncState {
    if (base.baseRevision !== null && base.baseRevision === remoteRevision) return base.dirty ? "unsaved" : "in-sync";
    if (base.dirty) return "conflict";
    return base.baseWrittenHere ? "overwritten" : "newer-available";
}

/** States that need the coach (the conflict dialog). */
export function needsChoice(state: SyncState): state is "overwritten" | "conflict" {
    return state === "overwritten" || state === "conflict";
}

/** SHA-256 of the payload as JSON, hex: the link's baseHash. */
export async function hashPayload(payload: unknown): Promise<string> {
    const bytes = new TextEncoder().encode(JSON.stringify(payload) ?? "null");
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The link a successful save (writtenHere) or read (not) leaves behind. */
export function linkFromRemote(input: { docKey: string; documentId: string; file: RemoteFile; hash: string; writtenHere: boolean; at: string }): DocumentLink {
    const { file } = input;
    return {
        docKey: input.docKey,
        documentId: input.documentId,
        connector: file.connector,
        remote: { fileId: file.fileId, name: file.name, ...(file.driveId !== undefined ? { driveId: file.driveId } : {}) },
        baseRevision: file.revision,
        baseHash: input.hash,
        baseWrittenHere: input.writtenHere,
        dirty: false,
        lastSyncedAt: input.at,
    };
}

const DOCUMENT_EXTENSION = /(\.(?:olplan|rankings))?\.(?:json|jsonc|yaml|yml|toml)$/i;

/** "Keep both": "fall.rankings.json" → "fall (my copy).rankings.json". */
export function copyName(name: string): string {
    const match = DOCUMENT_EXTENSION.exec(name);
    const cut = match ? match.index : name.length;
    return `${name.slice(0, cut)} (my copy)${name.slice(cut)}`;
}

/** A local working copy, as the engine sees it. */
export interface LocalDocument {
    kind: DocumentKind;
    /** The envelope id. */
    documentId: string;
    /** The bare document. */
    payload: unknown;
}

/** Where the working copies live (the store, in the app). */
export interface LocalDocuments {
    read: (docKey: string) => Promise<LocalDocument | null>;
    /** Replaces (or creates) the working copy: a silent refresh, "Use theirs", or a first open. */
    replace: (docKey: string, next: LocalDocument) => Promise<void>;
    /** Keeps a working copy about to be replaced as a dated local copy ("Recovered copies", kept 30 days). */
    recover: (docKey: string, copy: LocalDocument, at: string) => Promise<void>;
    /** "Keep both": the working copy takes a new envelope id. */
    setDocumentId: (docKey: string, documentId: string) => Promise<void>;
}

export type SyncError =
    | ConnectorError
    | { code: "not-linked" }
    | { code: "missing-local" }
    | { code: "no-connector" }
    /** The remote file isn't a document this build can read; `message` is the reader's. */
    | { code: "unreadable"; message: string };

export type SyncOutcome =
    | {
          ok: true;
          state: SyncState;
          link: DocumentLink;
          /** For "overwritten" and "conflict": the remote as just seen, handed back to resolve. */
          remote?: RemoteFile;
          /** True when a "newer-available" remote was taken into the working copy. */
          refreshed?: boolean;
      }
    | { ok: false; error: SyncError };

export interface SyncEngineOptions {
    connectors: StorageConnector[];
    links: LinkStore;
    documents: LocalDocuments;
    now?: () => Date;
    /** New envelope ids ("Keep both", a bare file opened for the first time). */
    newId?: () => string;
    generator?: DocumentGenerator;
}

export interface SyncEngine {
    /** Saves a local document to a new remote file and links it. */
    saveNew: (docKey: string, connector: ConnectorId, name: string) => Promise<SyncOutcome>;
    /** Opens a remote file into the working copy `docKey` and links it; an existing copy is recovered first. */
    openLinked: (docKey: string, ref: RemoteRef) => Promise<SyncOutcome>;
    /** Reads the remote's revision and applies the state table. */
    check: (docKey: string) => Promise<SyncOutcome>;
    /** check, at most once per RECHECK_INTERVAL_MS per document (focus, back online); null when skipped. */
    recheck: (docKey: string) => Promise<SyncOutcome | null>;
    /** "Save": writes local edits with expectedRevision = baseRevision; with none, only checks. */
    save: (docKey: string) => Promise<SyncOutcome>;
    /** The conflict dialog's choice, with the remote it was shown. */
    resolve: (docKey: string, resolution: Resolution, remote: RemoteFile) => Promise<SyncOutcome>;
    /** Marks a linked document dirty after a local edit. */
    noteLocalEdit: (docKey: string) => Promise<void>;
}

const failed = (error: SyncError): SyncOutcome => ({ ok: false, error });

const refFromLink = (link: DocumentLink): RemoteRef => ({ connector: link.connector, ...link.remote });

export function createSyncEngine({ connectors, links, documents, now = () => new Date(), newId = () => crypto.randomUUID(), generator = "openleague-static" }: SyncEngineOptions): SyncEngine {
    const byId = new Map(connectors.map((connector) => [connector.id, connector]));
    const lastChecked = new Map<string, number>();
    const stamp = () => now().toISOString();

    const textOf = (doc: LocalDocument, at: string) =>
        serializeDocument(wrapDocument(doc.kind, doc.payload as DocumentPayloads[DocumentKind], { id: doc.documentId, updatedAt: at, generator }));

    type Context = { link: DocumentLink; connector: StorageConnector; local: LocalDocument; dirty: boolean };

    async function load(docKey: string): Promise<{ ok: true; ctx: Context } | { ok: false; outcome: SyncOutcome }> {
        const link = await links.get(docKey);
        if (!link) return { ok: false, outcome: failed({ code: "not-linked" }) };
        const connector = byId.get(link.connector);
        if (!connector) return { ok: false, outcome: failed({ code: "no-connector" }) };
        const local = await documents.read(docKey);
        if (!local) return { ok: false, outcome: failed({ code: "missing-local" }) };
        // The flag, or content that no longer matches the base: either way, there are edits to keep.
        const dirty = link.dirty || (await hashPayload(local.payload)) !== link.baseHash;
        return { ok: true, ctx: { link, connector, local, dirty } };
    }

    /** Takes a remote file into the working copy and records a read base. */
    async function adopt(docKey: string, input: { file: RemoteFile; text: string; kind?: DocumentKind; previous: LocalDocument | null; recover: boolean; link: DocumentLink | null }): Promise<SyncOutcome> {
        const { file, text, kind, previous, link } = input;
        const source = { modifiedAt: file.modifiedAt };
        const read = kind ? await readAnyDocumentText(text, file.name, source, { kind }) : await readAnyDocumentText(text, file.name, source);
        if (!read.ok) return failed({ code: "unreadable", message: read.error.message });
        const at = stamp();
        if (previous && input.recover) await documents.recover(docKey, previous, at);
        const documentId = read.document.id ?? link?.documentId ?? previous?.documentId ?? newId();
        const payload = read.document.payload;
        await documents.replace(docKey, { kind: read.document.kind, documentId, payload });
        const next = linkFromRemote({ docKey, documentId, file, hash: await hashPayload(payload), writtenHere: false, at });
        await links.put(next);
        return { ok: true, state: "in-sync", link: next };
    }

    /** A save that succeeded: the base is now this device's own write. */
    async function recordSave(docKey: string, local: LocalDocument, file: RemoteFile): Promise<SyncOutcome> {
        const next = linkFromRemote({ docKey, documentId: local.documentId, file, hash: await hashPayload(local.payload), writtenHere: true, at: stamp() });
        await links.put(next);
        return { ok: true, state: "in-sync", link: next };
    }

    /** A save that failed for another reason than a conflict: the edits stay, marked dirty. */
    async function keepDirty(link: DocumentLink, error: ConnectorError): Promise<SyncOutcome> {
        await links.put({ ...link, dirty: true });
        return failed(error);
    }

    async function check(docKey: string): Promise<SyncOutcome> {
        const loaded = await load(docKey);
        if (!loaded.ok) return loaded.outcome;
        const { link, connector, local, dirty } = loaded.ctx;
        lastChecked.set(docKey, now().getTime());
        const opened = await connector.open(refFromLink(link));
        if (!opened.ok) return failed(opened.error);
        const { file, text } = opened.value;
        const state = syncStateOf({ dirty, baseRevision: link.baseRevision, baseWrittenHere: link.baseWrittenHere }, file.revision);
        if (state === "newer-available") {
            // This device's copy came from the remote, so the remote's history already holds it.
            const adopted = await adopt(docKey, { file, text, kind: local.kind, previous: local, recover: false, link });
            return adopted.ok ? { ...adopted, state, refreshed: true } : adopted;
        }
        if (needsChoice(state)) return { ok: true, state, link, remote: file };
        // A rename (metadata only) moves no revision; the link just learns the new name.
        if (file.name !== link.remote.name) {
            const renamed = { ...link, remote: { ...link.remote, name: file.name } };
            await links.put(renamed);
            return { ok: true, state, link: renamed };
        }
        return { ok: true, state, link };
    }

    async function writeOver(docKey: string, ctx: Context, expectedRevision: string): Promise<SyncOutcome> {
        const { link, connector, local } = ctx;
        const saved = await connector.save({
            ref: refFromLink(link),
            name: link.remote.name,
            text: textOf(local, stamp()),
            kind: local.kind,
            documentId: local.documentId,
            expectedRevision,
        });
        if (saved.ok) return recordSave(docKey, local, saved.value);
        if (saved.error.code === "conflict") {
            const remote = saved.error.remote;
            if (ctx.dirty) await links.put({ ...link, dirty: true });
            const state = syncStateOf({ dirty: ctx.dirty, baseRevision: link.baseRevision, baseWrittenHere: link.baseWrittenHere }, remote.revision);
            return { ok: true, state: needsChoice(state) ? state : "conflict", link: ctx.dirty ? { ...link, dirty: true } : link, remote };
        }
        return keepDirty(link, saved.error);
    }

    return {
        saveNew: async (docKey, connectorId, name) => {
            const connector = byId.get(connectorId);
            if (!connector) return failed({ code: "no-connector" });
            const local = await documents.read(docKey);
            if (!local) return failed({ code: "missing-local" });
            const saved = await connector.save({ ref: null, name, text: textOf(local, stamp()), kind: local.kind, documentId: local.documentId, expectedRevision: null });
            if (!saved.ok) return failed(saved.error);
            return recordSave(docKey, local, saved.value);
        },

        openLinked: async (docKey, ref) => {
            const connector = byId.get(ref.connector);
            if (!connector) return failed({ code: "no-connector" });
            const opened = await connector.open(refOf(ref));
            if (!opened.ok) return failed(opened.error);
            const previous = await documents.read(docKey);
            return adopt(docKey, { ...opened.value, kind: previous?.kind, previous, recover: previous !== null, link: await links.get(docKey) });
        },

        check,

        recheck: async (docKey) => {
            const last = lastChecked.get(docKey);
            if (last !== undefined && now().getTime() - last < RECHECK_INTERVAL_MS) return null;
            return check(docKey);
        },

        save: async (docKey) => {
            const loaded = await load(docKey);
            if (!loaded.ok) return loaded.outcome;
            const { ctx } = loaded;
            // Nothing to write: a save is still a check, so an overwrite is noticed.
            if (!ctx.dirty) return check(docKey);
            if (ctx.link.baseRevision === null) return failed({ code: "not-linked" });
            return writeOver(docKey, ctx, ctx.link.baseRevision);
        },

        resolve: async (docKey, resolution, remote) => {
            const loaded = await load(docKey);
            if (!loaded.ok) return loaded.outcome;
            const { ctx } = loaded;
            const { link, connector, local } = ctx;
            if (resolution === "keep-mine") {
                // The revision just seen, so a third write in between is still caught.
                return writeOver(docKey, ctx, remote.revision);
            }
            if (resolution === "use-theirs") {
                const opened = await connector.open(refFromLink(link));
                if (!opened.ok) return failed(opened.error);
                return adopt(docKey, { ...opened.value, kind: local.kind, previous: local, recover: true, link });
            }
            // Keep both: mine becomes a new document with a new envelope id; theirs stays as it is.
            const documentId = newId();
            const mine: LocalDocument = { ...local, documentId };
            const saved = await connector.save({ ref: null, name: copyName(link.remote.name), text: textOf(mine, stamp()), kind: local.kind, documentId, expectedRevision: null });
            if (!saved.ok) return keepDirty(link, saved.error);
            await documents.setDocumentId(docKey, documentId);
            return recordSave(docKey, mine, saved.value);
        },

        noteLocalEdit: async (docKey) => {
            const link = await links.get(docKey);
            if (link && !link.dirty) await links.put({ ...link, dirty: true });
        },
    };
}

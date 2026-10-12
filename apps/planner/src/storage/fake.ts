/**
 * An in-memory storage connector for tests and development (storage
 * connectors spec, Testing). One FakeRemote is the provider's storage; each
 * createFakeConnector is one device's client of it, so several devices can
 * share a remote. It simulates revisions, both conditional-write modes,
 * metadata-only changes, deletes, withdrawn tokens and going offline.
 *
 * - "atomic" (OneDrive's if-match): the revision check and the write are one step.
 * - "check-then-write" (Google Drive, local file handles): the connector reads
 *   the revision, then writes. `beforeWrite` runs between the two, so a test can
 *   interleave two saves and reproduce the race the spec describes.
 */
import { connectorFail, connectorOk, refOf, type ConditionalWrite, type ConnectorError, type ConnectorId, type RemoteFile, type RemoteRef, type StorageConnector } from "./connector";

interface FakeFile {
    fileId: string;
    name: string;
    text: string;
    revision: string;
    modifiedAt: string;
    modifiedBy?: string;
    kind?: string;
    documentId?: string;
}

export interface FakeRemoteOptions {
    connector?: ConnectorId;
    mode?: Exclude<ConditionalWrite, "none">;
    now?: () => Date;
    /** Saves larger than this (UTF-8 bytes) fail with too-large. */
    maxBytes?: number;
}

export interface FakeRemote {
    readonly connector: ConnectorId;
    readonly mode: Exclude<ConditionalWrite, "none">;
    /** Puts a file straight into storage, as another app or a person in the provider's UI would. */
    seed: (input: { name: string; text: string; kind?: string; documentId?: string; modifiedBy?: string }) => RemoteFile;
    /** A content change made outside any connector (a new revision). */
    overwrite: (fileId: string, text: string, modifiedBy?: string) => RemoteFile;
    /** A metadata-only change: the name moves, the revision does not. */
    rename: (fileId: string, name: string) => void;
    remove: (fileId: string) => void;
    peek: (fileId: string) => (RemoteFile & { text: string }) | null;
    /** Internal: the connectors' view. */
    readonly files: Map<string, FakeFile>;
    nextRevision: () => string;
    nextFileId: () => string;
    stamp: () => string;
    readonly maxBytes: number | undefined;
}

const byteLength = (text: string) => new TextEncoder().encode(text).byteLength;

function toRemote(connector: ConnectorId, file: FakeFile): RemoteFile {
    return {
        connector,
        fileId: file.fileId,
        name: file.name,
        revision: file.revision,
        modifiedAt: file.modifiedAt,
        ...(file.modifiedBy !== undefined ? { modifiedBy: file.modifiedBy } : {}),
        size: byteLength(file.text),
        ...(file.kind !== undefined ? { kind: file.kind } : {}),
    };
}

export function createFakeRemote({ connector = "local-file", mode = "atomic", now = () => new Date(), maxBytes }: FakeRemoteOptions = {}): FakeRemote {
    const files = new Map<string, FakeFile>();
    let revisions = 0;
    let fileIds = 0;
    const nextRevision = () => `rev-${++revisions}`;
    const stamp = () => now().toISOString();
    const remote: FakeRemote = {
        connector,
        mode,
        files,
        maxBytes,
        nextRevision,
        nextFileId: () => `file-${++fileIds}`,
        stamp,
        seed: ({ name, text, kind, documentId, modifiedBy }) => {
            const file: FakeFile = { fileId: remote.nextFileId(), name, text, revision: nextRevision(), modifiedAt: stamp(), modifiedBy, kind, documentId };
            files.set(file.fileId, file);
            return toRemote(connector, file);
        },
        overwrite: (fileId, text, modifiedBy) => {
            const file = files.get(fileId);
            if (!file) throw new Error(`No fake file ${fileId}`);
            Object.assign(file, { text, revision: nextRevision(), modifiedAt: stamp(), modifiedBy });
            return toRemote(connector, file);
        },
        rename: (fileId, name) => {
            const file = files.get(fileId);
            if (!file) throw new Error(`No fake file ${fileId}`);
            file.name = name;
        },
        remove: (fileId) => {
            files.delete(fileId);
        },
        peek: (fileId) => {
            const file = files.get(fileId);
            return file ? { ...toRemote(connector, file), text: file.text } : null;
        },
    };
    return remote;
}

export interface FakeConnectorOptions {
    /** Shown as modifiedBy on this client's saves. */
    user?: string;
    /** Starts connected unless false. */
    connected?: boolean;
    /** Runs after the revision check and before the write (check-then-write), or before the atomic write. */
    beforeWrite?: (ref: RemoteRef) => Promise<void>;
}

export interface FakeConnector extends StorageConnector {
    setOffline: (offline: boolean) => void;
    /** The token is withdrawn: every call needs auth until connect(). */
    withdrawAuth: () => void;
    /** What the next pickToOpen returns (then []). */
    queuePick: (refs: RemoteRef[]) => void;
    setBeforeWrite: (hook: FakeConnectorOptions["beforeWrite"]) => void;
}

export function createFakeConnector(remote: FakeRemote, { user, connected = true, beforeWrite }: FakeConnectorOptions = {}): FakeConnector {
    let status: "disconnected" | "connected" = connected ? "connected" : "disconnected";
    let offline = false;
    let picks: RemoteRef[] = [];
    let hook = beforeWrite;

    /** Offline wins over auth: the request never reaches the provider. */
    function gate(): ConnectorError | null {
        if (offline) return { code: "offline" };
        if (status !== "connected") return { code: "auth-required" };
        return null;
    }

    function stale(file: FakeFile, expected: string | null): boolean {
        return expected === null || file.revision !== expected;
    }

    return {
        id: remote.connector,
        capabilities: { list: true, pick: true, delete: true, conditionalWrite: remote.mode },
        status: () => status,
        connect: async () => {
            if (offline) return connectorFail({ code: "offline" });
            status = "connected";
            return connectorOk(undefined);
        },
        disconnect: async () => {
            status = "disconnected";
        },
        setOffline: (value) => {
            offline = value;
        },
        withdrawAuth: () => {
            status = "disconnected";
        },
        queuePick: (refs) => {
            picks = refs;
        },
        setBeforeWrite: (next) => {
            hook = next;
        },
        list: async (filter) => {
            const blocked = gate();
            if (blocked) return connectorFail(blocked);
            const all = [...remote.files.values()].filter((file) => filter?.kind === undefined || file.kind === filter.kind);
            return connectorOk(all.map((file) => toRemote(remote.connector, file)));
        },
        pickToOpen: async () => {
            const blocked = gate();
            if (blocked) return connectorFail(blocked);
            const chosen = picks;
            picks = [];
            return connectorOk(chosen.map(refOf));
        },
        open: async (ref) => {
            const blocked = gate();
            if (blocked) return connectorFail(blocked);
            const file = remote.files.get(ref.fileId);
            if (!file) return connectorFail({ code: "not-found" });
            return connectorOk({ file: toRemote(remote.connector, file), text: file.text });
        },
        save: async ({ ref, name, text, kind, documentId, expectedRevision }) => {
            const blocked = gate();
            if (blocked) return connectorFail(blocked);
            if (remote.maxBytes !== undefined && byteLength(text) > remote.maxBytes) return connectorFail({ code: "too-large" });
            if (ref === null) {
                const file: FakeFile = { fileId: remote.nextFileId(), name, text, revision: remote.nextRevision(), modifiedAt: remote.stamp(), modifiedBy: user, kind, documentId };
                remote.files.set(file.fileId, file);
                return connectorOk(toRemote(remote.connector, file));
            }
            if (remote.mode === "check-then-write") {
                // The check: read the revision now…
                const current = remote.files.get(ref.fileId);
                if (!current) return connectorFail({ code: "not-found" });
                if (stale(current, expectedRevision)) return connectorFail({ code: "conflict", remote: toRemote(remote.connector, current) });
                await hook?.(ref);
                // …then write without looking again: another save may have landed in between.
                const target = remote.files.get(ref.fileId);
                if (!target) return connectorFail({ code: "not-found" });
                Object.assign(target, { name, text, revision: remote.nextRevision(), modifiedAt: remote.stamp(), modifiedBy: user, kind, documentId });
                return connectorOk(toRemote(remote.connector, target));
            }
            await hook?.(ref);
            // Atomic: the precondition and the write happen together.
            const current = remote.files.get(ref.fileId);
            if (!current) return connectorFail({ code: "not-found" });
            if (stale(current, expectedRevision)) return connectorFail({ code: "conflict", remote: toRemote(remote.connector, current) });
            Object.assign(current, { name, text, revision: remote.nextRevision(), modifiedAt: remote.stamp(), modifiedBy: user, kind, documentId });
            return connectorOk(toRemote(remote.connector, current));
        },
        delete: async (ref, expectedRevision) => {
            const blocked = gate();
            if (blocked) return connectorFail(blocked);
            const current = remote.files.get(ref.fileId);
            if (!current) return connectorFail({ code: "not-found" });
            if (stale(current, expectedRevision)) return connectorFail({ code: "conflict", remote: toRemote(remote.connector, current) });
            remote.files.delete(ref.fileId);
            return connectorOk(undefined);
        },
    };
}

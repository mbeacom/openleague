/**
 * The storage connector seam (storage connectors spec, "The StorageConnector
 * interface"; ADR-0022). A connector is a remote the app saves to and opens
 * from; IndexedDB stays the working copy. Connectors move text, never parsed
 * documents: parsing stays in lib/document-envelope so every connector gets the
 * same checks. Errors carry codes, never provider response bodies, so nothing a
 * provider echoes back (a file name, an email) reaches a log.
 */

export type ConnectorId = "local-file" | "google-drive" | "onedrive";

export interface RemoteRef {
    connector: ConnectorId;
    fileId: string;
    name: string;
    driveId?: string;
}

export interface RemoteFile extends RemoteRef {
    /** Opaque and content-bound: Drive headRevisionId, OneDrive cTag, FSA lastModified + size + content digest. */
    revision: string;
    /** The provider's clock; passed to readDocument as source.modifiedAt. */
    modifiedAt: string;
    modifiedBy?: string;
    size: number;
    kind?: string;
}

export type ConnectorError =
    /** The revision moved since expectedRevision. */
    | { code: "conflict"; remote: RemoteFile }
    /** Deleted, or access withdrawn. */
    | { code: "not-found" }
    /** For example, a view-only share. */
    | { code: "forbidden" }
    /** The token is missing or expired and silent renewal failed. */
    | { code: "auth-required" }
    | { code: "offline" }
    | { code: "too-large" }
    | { code: "quota" }
    | { code: "unavailable"; retryAfterSeconds?: number }
    /** Anything else, with no body text. */
    | { code: "provider"; status: number }
    /** The coach dismissed a picker this call opened (the local file connector's save picker). Nothing was written. */
    | { code: "cancelled" }
    /**
     * The document can't be written in the file's format (TOML has no null for a
     * drill diagram's empty value). `message` is the encoder's own text, never a
     * provider's.
     */
    | { code: "unwritable"; message: string };

export type Result<T> = { ok: true; value: T } | { ok: false; error: ConnectorError };

export type ConditionalWrite = "atomic" | "check-then-write" | "none";

export interface ConnectorCapabilities {
    /** Can enumerate its own files. */
    list: boolean;
    /** Has a provider picker. */
    pick: boolean;
    delete: boolean;
    conditionalWrite: ConditionalWrite;
}

export type ConnectorStatus = "unconfigured" | "disconnected" | "connected";

export interface SaveInput {
    /** null = create. */
    ref: RemoteRef | null;
    name: string;
    /** The serialized envelope. */
    text: string;
    /** For provider metadata (appProperties). */
    kind: string;
    documentId: string;
    /** null only with ref = null (create); "Keep mine" passes the revision just seen. */
    expectedRevision: string | null;
}

export interface StorageConnector {
    readonly id: ConnectorId;
    readonly capabilities: ConnectorCapabilities;
    status: () => ConnectorStatus;
    /** Interactive: call from a user gesture. */
    connect: () => Promise<Result<void>>;
    /**
     * Loads what connect() and a picker need (a lazy chunk, a provider script)
     * ahead of the tap, so the popup opens while the browser still counts the
     * tap as its cause. Called when a menu offering this connector opens; never fails.
     */
    prepare?: () => Promise<void>;
    /**
     * True once prepare() has finished, so connect() can open its popup
     * straight from the tap. Absent with prepare(): the screens wait for the
     * prepare() they started.
     */
    prepared?: () => boolean;
    /** Revokes or clears tokens; links are kept. */
    disconnect: () => Promise<void>;
    list: (filter?: { kind?: string }) => Promise<Result<RemoteFile[]>>;
    /** [] when cancelled. */
    pickToOpen: (filter?: { kind?: string }) => Promise<Result<RemoteRef[]>>;
    open: (ref: RemoteRef) => Promise<Result<{ file: RemoteFile; text: string }>>;
    save: (input: SaveInput) => Promise<Result<RemoteFile>>;
    delete?: (ref: RemoteRef, expectedRevision: string) => Promise<Result<void>>;
}

export const connectorOk = <T,>(value: T): Result<T> => ({ ok: true, value });

export const connectorFail = <T = never,>(error: ConnectorError): Result<T> => ({ ok: false, error });

/** The ref part of a remote file, for a link or a later open. */
export function refOf(file: RemoteRef): RemoteRef {
    return { connector: file.connector, fileId: file.fileId, name: file.name, ...(file.driveId !== undefined ? { driveId: file.driveId } : {}) };
}

/**
 * The Local connector (storage connectors spec R7, tier 1; ADR-0022): files on
 * this computer through the File System Access API (Chromium desktop).
 *
 * - "Save to…" opens the save picker; the file's handle is kept in IndexedDB
 *   (handles are structured-cloneable) by a file id this connector makes.
 * - Every save checks the file's revision (its lastModified, size and a
 *   digest of its content, from one getFile()) before writing: check, then
 *   write (R4). The digest catches a same-size edit inside the timestamp's
 *   resolution. Two tabs or apps can still race; the sync engine's
 *   "Overwritten" rule catches it.
 * - Permission is asked for before a read or write. After a reload the
 *   browser asks again, and only from a tap: a check made without one reports
 *   auth-required and the screen offers "Allow access".
 *
 * Tier 2 (download and file input, every browser including iOS Safari) is not
 * a connector: a download is a copy with no link (see the storage screens).
 * Where the API is missing, this connector reports "unconfigured".
 */
import { formatFromFileName } from "@/lib/document-formats";
import type { FileHandleStore } from "../store/file-handles";
import { connectorFail, connectorOk, type ConnectorError, type RemoteFile, type RemoteRef, type Result, type StorageConnector } from "./connector";
import { reencodeForFile } from "./encode";

type PermissionMode = "read" | "readwrite";

export interface FsaWritable {
    write: (data: string) => Promise<void>;
    close: () => Promise<void>;
    abort?: () => Promise<void>;
}

/** The part of FileSystemFileHandle this connector uses. */
export interface FsaFileHandle {
    readonly kind: "file";
    readonly name: string;
    getFile: () => Promise<Pick<File, "lastModified" | "size" | "text">>;
    createWritable: () => Promise<FsaWritable>;
    queryPermission?: (descriptor: { mode: PermissionMode }) => Promise<PermissionState>;
    requestPermission?: (descriptor: { mode: PermissionMode }) => Promise<PermissionState>;
}

export interface FsaPickerType {
    description: string;
    accept: Record<string, string[]>;
}

/** The window's pickers (showSaveFilePicker, showOpenFilePicker). */
export interface FsaPickers {
    showSaveFilePicker: (options: { suggestedName?: string; types?: FsaPickerType[]; excludeAcceptAllOption?: boolean }) => Promise<FsaFileHandle>;
    showOpenFilePicker: (options: { multiple?: boolean; types?: FsaPickerType[]; excludeAcceptAllOption?: boolean }) => Promise<FsaFileHandle[]>;
}

/** The pickers when this browser has the File System Access API, else null (tier 2: download and file input). */
export function fileSystemAccess(scope: unknown = globalThis): FsaPickers | null {
    const target = scope as Partial<Record<"showSaveFilePicker" | "showOpenFilePicker", unknown>> | null;
    if (!target || typeof target.showSaveFilePicker !== "function" || typeof target.showOpenFilePicker !== "function") return null;
    const save = target.showSaveFilePicker as FsaPickers["showSaveFilePicker"];
    const open = target.showOpenFilePicker as FsaPickers["showOpenFilePicker"];
    return {
        showSaveFilePicker: (options) => save.call(scope, options),
        showOpenFilePicker: (options) => open.call(scope, options),
    };
}

/** Save picker types: JSON first (the default), then the other formats a coach may choose. */
export const SAVE_PICKER_TYPES: FsaPickerType[] = [
    { description: "OpenLeague file (JSON)", accept: { "application/json": [".json"] } },
    { description: "OpenLeague file (YAML)", accept: { "application/yaml": [".yaml", ".yml"] } },
    { description: "OpenLeague file (TOML)", accept: { "application/toml": [".toml"] } },
    { description: "OpenLeague file (JSON with comments)", accept: { "text/plain": [".jsonc"] } },
];

export const OPEN_PICKER_TYPES: FsaPickerType[] = [
    {
        description: "OpenLeague files",
        accept: { "application/json": [".json"], "application/yaml": [".yaml", ".yml"], "application/toml": [".toml"], "text/plain": [".jsonc"] },
    },
];

function isHandle(value: unknown): value is FsaFileHandle {
    const handle = value as Partial<FsaFileHandle> | null;
    return typeof handle === "object" && handle !== null && typeof handle.name === "string" && typeof handle.getFile === "function" && typeof handle.createWritable === "function";
}

const errorName = (error: unknown): string => (typeof error === "object" && error !== null && typeof (error as { name?: unknown }).name === "string" ? (error as { name: string }).name : "");

/** A DOMException as a code. Never its message: it can carry a file path. */
function toConnectorError(error: unknown): ConnectorError {
    switch (errorName(error)) {
        case "AbortError":
            return { code: "cancelled" };
        case "NotFoundError":
            return { code: "not-found" };
        case "NotAllowedError":
        case "SecurityError":
            return { code: "auth-required" };
        case "QuotaExceededError":
            return { code: "quota" };
        case "NotReadableError":
        case "InvalidStateError":
        case "NoModificationAllowedError":
            return { code: "unavailable" };
        default:
            return { code: "provider", status: 0 };
    }
}

/**
 * The file's revision: its lastModified, size and a SHA-256 digest of `text`,
 * all from the same getFile(). Content-bound: a same-size edit that keeps
 * lastModified (within the timestamp's resolution) still moves it.
 */
export async function revisionOf(file: Pick<File, "lastModified" | "size">, text: string): Promise<string> {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
    const hex = Array.from(digest.subarray(0, 16), (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${file.lastModified}:${file.size}:${hex}`;
}

/** lastModified as ISO; the epoch when it is outside the Date range (toISOString would throw). */
function isoOf(lastModified: number): string {
    const date = new Date(lastModified);
    return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

export interface LocalFileConnectorOptions {
    /** null: this browser has no File System Access API. */
    pickers: FsaPickers | null;
    handles: FileHandleStore;
    newId?: () => string;
}

export function createLocalFileConnector({ pickers, handles, newId = () => crypto.randomUUID() }: LocalFileConnectorOptions): StorageConnector {
    /** The file as a RemoteFile, with its text: one getFile() for both, so the revision matches the text. */
    async function read(fileId: string, handle: FsaFileHandle): Promise<{ file: RemoteFile; text: string }> {
        const file = await handle.getFile();
        const text = await file.text();
        return {
            file: { connector: "local-file", fileId, name: handle.name, revision: await revisionOf(file, text), modifiedAt: isoOf(file.lastModified), size: file.size },
            text,
        };
    }

    /** Granted already, or asked now (works only from a tap); anything else needs the coach. */
    async function permitted(handle: FsaFileHandle, mode: PermissionMode): Promise<boolean> {
        if (!handle.queryPermission) return true;
        if ((await handle.queryPermission({ mode })) === "granted") return true;
        if (!handle.requestPermission) return false;
        return (await handle.requestPermission({ mode })) === "granted";
    }

    async function handleFor(ref: RemoteRef): Promise<FsaFileHandle | null> {
        const stored = await handles.get(ref.fileId);
        return isHandle(stored) ? stored : null;
    }

    async function writeText(handle: FsaFileHandle, text: string): Promise<void> {
        const writable = await handle.createWritable();
        try {
            await writable.write(text);
        } catch (error) {
            await writable.abort?.().catch(() => undefined);
            throw error;
        }
        await writable.close();
    }

    async function guarded<T>(work: () => Promise<Result<T>>): Promise<Result<T>> {
        if (!pickers) return connectorFail({ code: "unavailable" });
        try {
            return await work();
        } catch (error) {
            return connectorFail(toConnectorError(error));
        }
    }

    return {
        id: "local-file",
        capabilities: { list: false, pick: true, delete: false, conditionalWrite: "check-then-write" },
        status: () => (pickers ? "connected" : "unconfigured"),
        // No account: permission is asked per file, from the tap that saves or opens it.
        connect: async () => (pickers ? connectorOk(undefined) : connectorFail({ code: "unavailable" })),
        disconnect: async () => undefined,
        // Without access to a folder the API can't list files.
        list: async () => (pickers ? connectorOk([]) : connectorFail({ code: "unavailable" })),

        pickToOpen: (filter) =>
            guarded(async () => {
                void filter;
                let picked: FsaFileHandle[];
                try {
                    picked = await pickers!.showOpenFilePicker({ multiple: false, types: OPEN_PICKER_TYPES });
                } catch (error) {
                    if (errorName(error) === "AbortError") return connectorOk([]);
                    throw error;
                }
                const refs: RemoteRef[] = [];
                for (const handle of picked) {
                    const fileId = newId();
                    await handles.put(fileId, handle);
                    refs.push({ connector: "local-file", fileId, name: handle.name });
                }
                return connectorOk(refs);
            }),

        open: (ref) =>
            guarded(async () => {
                const handle = await handleFor(ref);
                if (!handle) return connectorFail({ code: "not-found" });
                if (!(await permitted(handle, "read"))) return connectorFail({ code: "auth-required" });
                return connectorOk(await read(ref.fileId, handle));
            }),

        save: (input) =>
            guarded(async () => {
                if (input.ref === null) {
                    const handle = await pickers!.showSaveFilePicker({ suggestedName: input.name, types: SAVE_PICKER_TYPES });
                    // The coach may have typed another extension: the file is written in its own format.
                    const text = formatFromFileName(handle.name) === formatFromFileName(input.name) ? { ok: true as const, text: input.text } : await reencodeForFile(input.text, input.name, handle.name);
                    if (!text.ok) return connectorFail(text.error);
                    await writeText(handle, text.text);
                    const fileId = newId();
                    await handles.put(fileId, handle);
                    return connectorOk((await read(fileId, handle)).file);
                }
                const handle = await handleFor(input.ref);
                if (!handle) return connectorFail({ code: "not-found" });
                if (!(await permitted(handle, "readwrite"))) return connectorFail({ code: "auth-required" });
                // The check…
                const current = (await read(input.ref.fileId, handle)).file;
                if (input.expectedRevision === null || current.revision !== input.expectedRevision) {
                    return connectorFail({ code: "conflict", remote: current });
                }
                // …then the write. Another app may write in between (R4); "Overwritten" catches it.
                await writeText(handle, input.text);
                return connectorOk((await read(input.ref.fileId, handle)).file);
            }),
    };
}

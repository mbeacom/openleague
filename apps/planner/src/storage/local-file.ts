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
 * - With a planner folder chosen (storage locations design, decision 2), a
 *   new file is written into `<folder>/<Kind>/` with no picker, and the
 *   folder's files can be listed. Files there get folder-scoped ids
 *   (`folder:<generation>:<Kind>/<name>`, the generation a random id per
 *   folder choice), so autosave can tell them apart and
 *   listing the same file again reuses its id; a new folder choice is a new
 *   generation, so an old link never resolves into a different folder.
 *
 * Tier 2 (download and file input, every browser including iOS Safari) is not
 * a connector: a download is a copy with no link (see the storage screens).
 * Where the API is missing, this connector reports "unconfigured".
 */
import { formatFromFileName } from "@/lib/document-formats";
import { isDocumentFileName, KIND_FOLDERS, kindFolderOf, numberedName } from "./folders";
import type { FileHandleStore } from "../store/file-handles";
import type { LocationStore } from "../store/locations";
import { connectorFail, connectorOk, type ConnectorError, type RemoteFile, type RemoteRef, type Result, type SaveInput, type StorageConnector } from "./connector";
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

/** The part of FileSystemDirectoryHandle this connector uses. */
export interface FsaDirectoryHandle {
    readonly kind: "directory";
    readonly name: string;
    getDirectoryHandle: (name: string, options?: { create?: boolean }) => Promise<FsaDirectoryHandle>;
    getFileHandle: (name: string, options?: { create?: boolean }) => Promise<FsaFileHandle>;
    values: () => AsyncIterable<FsaFileHandle | FsaDirectoryHandle>;
    /** Whether two handles are the same folder on disk. */
    isSameEntry?: (other: FsaDirectoryHandle) => Promise<boolean>;
    queryPermission?: (descriptor: { mode: PermissionMode }) => Promise<PermissionState>;
    requestPermission?: (descriptor: { mode: PermissionMode }) => Promise<PermissionState>;
}

/** The window's pickers (showSaveFilePicker, showOpenFilePicker, and showDirectoryPicker where the browser has it). */
export interface FsaPickers {
    showSaveFilePicker: (options: { suggestedName?: string; types?: FsaPickerType[]; excludeAcceptAllOption?: boolean }) => Promise<FsaFileHandle>;
    showOpenFilePicker: (options: { multiple?: boolean; types?: FsaPickerType[]; excludeAcceptAllOption?: boolean }) => Promise<FsaFileHandle[]>;
    showDirectoryPicker?: (options: { id?: string; mode?: PermissionMode }) => Promise<FsaDirectoryHandle>;
}

/** The planner folder as the connector gets it: the handle, and the choice it came from. */
export interface PlannerFolder {
    handle: FsaDirectoryHandle;
    /** Changes with every choice of a different folder (the location's generation). */
    generation: string;
}

/** The prefix of a file id inside the planner folder. */
export const FOLDER_FILE_PREFIX = "folder:";

export const folderFileId = (generation: string, kindFolder: string, name: string) => `${FOLDER_FILE_PREFIX}${generation}:${kindFolder}/${name}`;

/** The kind subfolder ("Practices") of a file in the planner folder; undefined for any other file id. */
export function folderOfFileId(fileId: string): string | undefined {
    if (!isFolderFileId(fileId)) return undefined;
    return Object.values(KIND_FOLDERS).find((kindFolder) => fileId.includes(`:${kindFolder}/`));
}

/** True for a file the connector placed in, or listed from, a planner folder (this one or an earlier choice). */
export const isFolderFileId = (fileId: string): boolean => fileId.startsWith(FOLDER_FILE_PREFIX);

/** True for a file in the planner folder chosen at `generation`: the current one, when that's the current choice. */
export const isInFolderGeneration = (fileId: string, generation: string): boolean => fileId.startsWith(`${FOLDER_FILE_PREFIX}${generation}:`);

export function isDirectoryHandle(value: unknown): value is FsaDirectoryHandle {
    const handle = value as Partial<FsaDirectoryHandle> | null;
    return typeof handle === "object" && handle !== null && handle.kind === "directory" && typeof handle.getFileHandle === "function" && typeof handle.getDirectoryHandle === "function";
}

/** The pickers when this browser has the File System Access API, else null (tier 2: download and file input). */
export function fileSystemAccess(scope: unknown = globalThis): FsaPickers | null {
    const target = scope as Partial<Record<"showSaveFilePicker" | "showOpenFilePicker", unknown>> | null;
    if (!target || typeof target.showSaveFilePicker !== "function" || typeof target.showOpenFilePicker !== "function") return null;
    const save = target.showSaveFilePicker as FsaPickers["showSaveFilePicker"];
    const open = target.showOpenFilePicker as FsaPickers["showOpenFilePicker"];
    const directory = (scope as { showDirectoryPicker?: unknown }).showDirectoryPicker;
    return {
        showSaveFilePicker: (options) => save.call(scope, options),
        showOpenFilePicker: (options) => open.call(scope, options),
        ...(typeof directory === "function" ? { showDirectoryPicker: (options) => (directory as NonNullable<FsaPickers["showDirectoryPicker"]>).call(scope, options) } : {}),
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
    /** Where the planner folder is kept (the store's locations, in the app); none: no planner folder. */
    locations?: Pick<LocationStore, "get" | "set">;
    newId?: () => string;
    now?: () => Date;
}

/** Runs `work` holding the planner folder's Web Lock where the browser has one, so two tabs don't pick the same new name. */
async function withFolderLock<T>(work: () => Promise<T>): Promise<T> {
    const locks = (globalThis.navigator as { locks?: { request: (name: string, callback: () => Promise<T>) => Promise<T> } } | undefined)?.locks;
    return locks ? locks.request("openleague-planner-folder", work) : work();
}

/** Tries before giving up on a free name in a kind folder. */
const MAX_NAME_TRIES = 50;

export function createLocalFileConnector({ pickers, handles, locations, newId = () => crypto.randomUUID(), now = () => new Date() }: LocalFileConnectorOptions): StorageConnector {
    /** The planner folder, when the coach chose one and it is still a folder handle. */
    async function folder(): Promise<PlannerFolder | null> {
        const stored = await locations?.get("local-file");
        return stored && isDirectoryHandle(stored.handle) ? { handle: stored.handle, generation: stored.generation } : null;
    }

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
    async function permitted(handle: Pick<FsaFileHandle, "queryPermission" | "requestPermission">, mode: PermissionMode): Promise<boolean> {
        if (!handle.queryPermission) return true;
        if ((await handle.queryPermission({ mode })) === "granted") return true;
        if (!handle.requestPermission) return false;
        return (await handle.requestPermission({ mode })) === "granted";
    }

    async function handleFor(ref: RemoteRef): Promise<FsaFileHandle | null> {
        const stored = await handles.get(ref.fileId);
        return isHandle(stored) ? stored : null;
    }

    /** The planner folder with access granted (asked for now if this is a tap), or why not. */
    async function grantedFolder(mode: PermissionMode): Promise<Result<PlannerFolder | null>> {
        const current = await folder();
        if (!current) return connectorOk(null);
        if (!(await permitted(current.handle, mode))) return connectorFail({ code: "auth-required" });
        return connectorOk(current);
    }

    /** A kind folder inside the planner folder; null when it doesn't exist and `create` is false. */
    async function kindDirectory(root: FsaDirectoryHandle, kindFolder: string, create: boolean): Promise<FsaDirectoryHandle | null> {
        try {
            return await root.getDirectoryHandle(kindFolder, { create });
        } catch (error) {
            if (!create && (errorName(error) === "NotFoundError" || errorName(error) === "TypeMismatchError")) return null;
            throw error;
        }
    }

    async function exists(directory: FsaDirectoryHandle, name: string): Promise<boolean> {
        try {
            await directory.getFileHandle(name);
            return true;
        } catch (error) {
            if (errorName(error) === "NotFoundError") return false;
            // A folder by that name counts as taken.
            if (errorName(error) === "TypeMismatchError") return true;
            throw error;
        }
    }

    /** A new file in `<folder>/<Kind>/`: the asked-for name, or the first numbered one free. */
    async function createInFolder(current: PlannerFolder, input: SaveInput): Promise<Result<RemoteFile>> {
        const kindFolder = kindFolderOf(input.kind);
        if (!kindFolder) return connectorFail({ code: "provider", status: 0 });
        const directory = (await kindDirectory(current.handle, kindFolder, true))!;
        // One tab at a time picks a free name; another app can still create one between the check and the create,
        // so a file that turns out to have content is left alone and the next name is tried.
        return withFolderLock(async () => {
            for (let n = 1; n <= MAX_NAME_TRIES; n++) {
                const name = numberedName(input.name, n);
                if (await exists(directory, name)) continue;
                const handle = await directory.getFileHandle(name, { create: true });
                if ((await handle.getFile()).size !== 0) continue;
                await writeText(handle, input.text);
                const fileId = folderFileId(current.generation, kindFolder, name);
                await handles.put(fileId, handle);
                return connectorOk((await read(fileId, handle)).file);
            }
            return connectorFail({ code: "provider", status: 409 });
        });
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
        location: async () => {
            const current = await folder();
            return current ? { name: current.handle.name, chosen: true } : null;
        },

        chooseLocation: () =>
            guarded(async () => {
                if (!pickers!.showDirectoryPicker || !locations) return connectorFail({ code: "unavailable" });
                let handle: FsaDirectoryHandle;
                try {
                    // The id lets the browser reopen the picker where the coach last chose.
                    handle = await pickers!.showDirectoryPicker({ id: "openleague-planner", mode: "readwrite" });
                } catch (error) {
                    if (errorName(error) === "AbortError") return connectorOk(null);
                    throw error;
                }
                if (!(await permitted(handle, "readwrite"))) return connectorFail({ code: "auth-required" });
                const previous = await locations.get("local-file");
                // The same folder chosen again keeps its generation, so its files stay "in the folder" and none are saved twice.
                const same = previous && isDirectoryHandle(previous.handle) && handle.isSameEntry ? await handle.isSameEntry(previous.handle).catch(() => false) : false;
                await locations.set("local-file", {
                    handle,
                    name: handle.name,
                    autosave: previous?.autosave ?? true,
                    generation: same && previous ? previous.generation : newId(),
                    chosenAt: now().toISOString(),
                });
                return connectorOk({ name: handle.name });
            }),

        resetLocation: async () => {
            await locations?.set("local-file", undefined);
        },

        // Without a planner folder there is nothing to list; with one, its kind folders.
        list: (filter) =>
            guarded(async () => {
                const granted = await grantedFolder("read");
                if (!granted.ok) return granted;
                const current = granted.value;
                if (!current) return connectorOk([]);
                const files: RemoteFile[] = [];
                const found: Array<readonly [string, FsaFileHandle]> = [];
                const kinds = filter?.kind ? [filter.kind] : Object.keys(KIND_FOLDERS);
                for (const kind of kinds) {
                    const kindFolder = kindFolderOf(kind);
                    if (!kindFolder) continue;
                    const directory = await kindDirectory(current.handle, kindFolder, false);
                    if (!directory) continue;
                    for await (const entry of directory.values()) {
                        if (entry.kind !== "file" || !isDocumentFileName(entry.name)) continue;
                        const fileId = folderFileId(current.generation, kindFolder, entry.name);
                        found.push([fileId, entry]);
                        files.push({ ...(await read(fileId, entry)).file, kind });
                    }
                }
                // One write for the whole listing (the map is one record); one at a time where the store has no batch.
                if (handles.putMany) await handles.putMany(found);
                else for (const [fileId, handle] of found) await handles.put(fileId, handle);
                files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
                return connectorOk(files);
            }),

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
                    const granted = await grantedFolder("readwrite");
                    if (!granted.ok) return granted;
                    if (granted.value) return createInFolder(granted.value, input);
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

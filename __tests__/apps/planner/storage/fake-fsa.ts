/**
 * A fake File System Access environment for the local file connector's tests:
 * a disk of named files, handles over them, permissions, and whether the call
 * runs inside a tap (pickers and requestPermission throw SecurityError
 * outside one, as browsers do). The clock moves a second per write, so every
 * write has its own lastModified. Folders are path prefixes: a file seeded
 * as "Planner/Practices/a.olplan.json" is inside the "Planner" folder's
 * "Practices" folder, and its handle's name is "a.olplan.json".
 */
import type { FsaDirectoryHandle, FsaFileHandle, FsaPickers } from "@/apps/planner/src/storage/local-file";
import type { FileHandleStore } from "@/apps/planner/src/store/file-handles";

interface DiskFile {
    name: string;
    text: string;
    lastModified: number;
}

const domError = (name: string) => Object.assign(new Error(name), { name });

export interface FakeFsa {
    pickers: FsaPickers;
    /** What the next save picker returns: a name the coach typed, or "cancel". */
    queueSave: (answer: string | "cancel") => void;
    /** What the next open picker returns: file names on the disk, or "cancel". */
    queueOpen: (answer: string[] | "cancel") => void;
    /** Puts a file on the disk, as another app would. */
    seed: (name: string, text: string) => void;
    read: (name: string) => string | undefined;
    /** Another app writes the file. */
    overwrite: (name: string, text: string) => void;
    /** Another app writes the file within the timestamp's resolution: the content moves, lastModified doesn't. */
    overwriteKeepingTime: (name: string, text: string) => void;
    /** A metadata-only change: the handle's name moves; content and lastModified don't. */
    rename: (from: string, to: string) => void;
    remove: (name: string) => void;
    /** Permission is withdrawn ("prompt") and calls run outside a tap until activate(). */
    withdraw: () => void;
    /** The next calls run inside a tap. */
    activate: () => void;
    /** The coach refuses the next permission prompts. */
    denyPrompts: (deny: boolean) => void;
    handleFor: (name: string) => FsaFileHandle;
    /** A folder's handle (made if missing). */
    directory: (path: string) => FsaDirectoryHandle;
    /** What the next directory picker returns: a folder path, or "cancel". */
    queueDirectory: (answer: string | "cancel") => void;
    /** Every path on the disk. */
    paths: () => string[];
    writes: number;
}

const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);

export function createFakeFsa(start = Date.parse("2026-10-11T12:00:00.000Z")): FakeFsa {
    const disk = new Map<string, DiskFile>();
    let clock = start;
    let gesture = true;
    let deny = false;
    let permission: PermissionState = "granted";
    let saveAnswers: Array<string | "cancel"> = [];
    let openAnswers: Array<string[] | "cancel"> = [];
    const directoryAnswers: Array<string | "cancel"> = [];
    const directories = new Set<string>();
    const fsa: FakeFsa = {
        writes: 0,
        pickers: {
            showSaveFilePicker: async (options) => {
                if (!gesture) throw domError("SecurityError");
                const answer = saveAnswers.shift() ?? options.suggestedName ?? "untitled.json";
                if (answer === "cancel") throw domError("AbortError");
                // As browsers do: picking creates (or truncates) the file.
                clock += 1000;
                const file: DiskFile = { name: answer, text: "", lastModified: clock };
                disk.set(answer, file);
                return fsa.handleFor(answer);
            },
            showOpenFilePicker: async () => {
                if (!gesture) throw domError("SecurityError");
                const answer = openAnswers.shift() ?? "cancel";
                if (answer === "cancel") throw domError("AbortError");
                return answer.map((name) => fsa.handleFor(name));
            },
            showDirectoryPicker: async () => {
                if (!gesture) throw domError("SecurityError");
                const answer = directoryAnswers.shift() ?? "cancel";
                if (answer === "cancel") throw domError("AbortError");
                return fsa.directory(answer);
            },
        },
        queueDirectory: (answer) => directoryAnswers.push(answer),
        paths: () => [...disk.keys()].sort(),
        directory: (path) => {
            directories.add(path);
            const child = (name: string) => `${path}/${name}`;
            const handle: FsaDirectoryHandle = {
                kind: "directory",
                name: baseName(path),
                getDirectoryHandle: async (name, options) => {
                    if (disk.has(child(name))) throw domError("TypeMismatchError");
                    if (!directories.has(child(name)) && !options?.create) throw domError("NotFoundError");
                    return fsa.directory(child(name));
                },
                getFileHandle: async (name, options) => {
                    if (directories.has(child(name))) throw domError("TypeMismatchError");
                    if (!disk.has(child(name))) {
                        if (!options?.create) throw domError("NotFoundError");
                        clock += 1000;
                        disk.set(child(name), { name, text: "", lastModified: clock });
                    }
                    return fsa.handleFor(child(name));
                },
                values: async function* () {
                    for (const key of [...disk.keys()]) if (key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes("/")) yield fsa.handleFor(key);
                    for (const dir of [...directories]) if (dir.startsWith(`${path}/`) && !dir.slice(path.length + 1).includes("/")) yield fsa.directory(dir);
                },
                queryPermission: async () => permission,
                requestPermission: async () => {
                    if (!gesture) throw domError("SecurityError");
                    if (deny) return "denied";
                    permission = "granted";
                    return permission;
                },
            };
            return handle;
        },
        queueSave: (answer) => saveAnswers.push(answer),
        queueOpen: (answer) => openAnswers.push(answer),
        seed: (name, text) => {
            clock += 1000;
            disk.set(name, { name: baseName(name), text, lastModified: clock });
            for (let at = name.indexOf("/"); at !== -1; at = name.indexOf("/", at + 1)) directories.add(name.slice(0, at));
        },
        read: (name) => disk.get(name)?.text,
        overwrite: (name, text) => {
            const file = disk.get(name);
            if (!file) throw new Error(`No file ${name}`);
            clock += 1000;
            Object.assign(file, { text, lastModified: clock });
        },
        overwriteKeepingTime: (name, text) => {
            const file = disk.get(name);
            if (!file) throw new Error(`No file ${name}`);
            file.text = text;
        },
        rename: (from, to) => {
            const file = disk.get(from);
            if (!file) throw new Error(`No file ${from}`);
            disk.delete(from);
            file.name = baseName(to);
            disk.set(to, file);
        },
        remove: (name) => {
            disk.delete(name);
        },
        withdraw: () => {
            permission = "prompt";
            gesture = false;
        },
        activate: () => {
            gesture = true;
        },
        denyPrompts: (value) => {
            deny = value;
        },
        handleFor: (name) => {
            const target = disk.get(name);
            if (!target) throw domError("NotFoundError");
            const alive = () => {
                if (![...disk.values()].includes(target)) throw domError("NotFoundError");
                return target;
            };
            return {
                kind: "file",
                get name() {
                    return target.name;
                },
                getFile: async () => {
                    const file = alive();
                    return { lastModified: file.lastModified, size: new TextEncoder().encode(file.text).byteLength, text: async () => file.text };
                },
                createWritable: async () => {
                    alive();
                    let buffer = "";
                    return {
                        write: async (data: string) => {
                            buffer += data;
                        },
                        close: async () => {
                            const file = alive();
                            clock += 1000;
                            fsa.writes += 1;
                            Object.assign(file, { text: buffer, lastModified: clock });
                        },
                    };
                },
                queryPermission: async () => permission,
                requestPermission: async () => {
                    if (!gesture) throw domError("SecurityError");
                    if (deny) return "denied";
                    permission = "granted";
                    return permission;
                },
            };
        },
    };
    return fsa;
}

/** Handles in memory: test handles have methods, which IndexedDB's structured clone refuses. */
export function memoryHandleStore(): FileHandleStore & { map: Map<string, unknown> } {
    const map = new Map<string, unknown>();
    return {
        map,
        get: async (fileId) => map.get(fileId),
        put: async (fileId, handle) => {
            map.set(fileId, handle);
        },
        delete: async (fileId) => {
            map.delete(fileId);
        },
        sweep: async (keep) => {
            let dropped = 0;
            for (const fileId of [...map.keys()]) {
                if (!keep.has(fileId)) {
                    map.delete(fileId);
                    dropped++;
                }
            }
            return dropped;
        },
    };
}

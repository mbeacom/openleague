/**
 * File System Access handles for linked local files (storage connectors spec
 * R7): FileSystemFileHandle is structured-cloneable, so the handles live in
 * IndexedDB under one meta key, by the local file connector's file id. A
 * handle is not a credential: after a reload the browser asks for permission
 * again before the app may read or write through it.
 */
import { META_FILE_HANDLES, type PlannerRepo } from "./records";

/** What the store keeps; the connector checks the shape it needs. */
export interface StoredFileHandle {
    handle: unknown;
    addedAt: string;
}

export interface FileHandleStore {
    get: (fileId: string) => Promise<unknown>;
    put: (fileId: string, handle: unknown) => Promise<void>;
    delete: (fileId: string) => Promise<void>;
    /** Drops every handle whose file id isn't in `keep` (no link uses it); resolves to how many it dropped. */
    sweep: (keep: ReadonlySet<string>) => Promise<number>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function readMap(stored: unknown): Record<string, StoredFileHandle> {
    if (!isRecord(stored)) return {};
    const out: Record<string, StoredFileHandle> = {};
    for (const [fileId, entry] of Object.entries(stored)) {
        if (isRecord(entry) && "handle" in entry && typeof entry.addedAt === "string") out[fileId] = { handle: entry.handle, addedAt: entry.addedAt };
    }
    return out;
}

export function createFileHandleStore(repo: PlannerRepo, now: () => Date = () => new Date()): FileHandleStore {
    return {
        get: async (fileId) => readMap(await repo.read((tx) => tx.getMeta(META_FILE_HANDLES)))[fileId]?.handle,
        put: async (fileId, handle) => {
            const addedAt = now().toISOString();
            await repo.write(async (tx) => {
                const map = readMap(await tx.getMeta(META_FILE_HANDLES));
                await tx.putMeta(META_FILE_HANDLES, { ...map, [fileId]: { handle, addedAt } });
            });
        },
        delete: async (fileId) => {
            await repo.write(async (tx) => {
                const map = readMap(await tx.getMeta(META_FILE_HANDLES));
                if (!(fileId in map)) return;
                delete map[fileId];
                await tx.putMeta(META_FILE_HANDLES, map);
            });
        },
        sweep: async (keep) =>
            repo.write(async (tx) => {
                const map = readMap(await tx.getMeta(META_FILE_HANDLES));
                const dropped = Object.keys(map).filter((fileId) => !keep.has(fileId));
                if (dropped.length === 0) return 0;
                for (const fileId of dropped) delete map[fileId];
                await tx.putMeta(META_FILE_HANDLES, map);
                return dropped.length;
            }),
    };
}

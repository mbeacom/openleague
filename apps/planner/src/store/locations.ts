/**
 * Where connectors save new files (storage locations design, decisions 2 and
 * 3), under one meta key. The planner folder's directory handle is
 * structured-cloneable like a file handle, and like one it is not a
 * credential: after a reload the browser asks again before the app may use it.
 * A Drive folder is kept by id and the name it had when chosen.
 */
import { META_STORAGE_LOCATIONS, type PlannerRepo } from "./records";

export interface LocalFolderLocation {
    /** A FileSystemDirectoryHandle; the connector checks its shape. */
    handle: unknown;
    name: string;
    /** "Keep the folder up to date". */
    autosave: boolean;
    /** New with every choice of a different folder (random, so two choices never share one); scopes the folder's file ids. */
    generation: string;
    chosenAt: string;
}

export interface DriveFolderLocation {
    folderId: string;
    name: string;
    chosenAt: string;
}

export interface StorageLocations {
    "local-file"?: LocalFolderLocation;
    "google-drive"?: DriveFolderLocation;
}

export type LocationConnector = keyof StorageLocations;

export interface LocationStore {
    get: <K extends LocationConnector>(connector: K) => Promise<StorageLocations[K] | undefined>;
    /** undefined clears it: the connector's default place again. */
    set: <K extends LocationConnector>(connector: K, location: StorageLocations[K] | undefined) => Promise<void>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** What's stored, keeping only entries of the right shape, so a damaged record reads as the default. */
export function readLocations(stored: unknown): StorageLocations {
    if (!isRecord(stored)) return {};
    const out: StorageLocations = {};
    const local = stored["local-file"];
    if (isRecord(local) && "handle" in local && typeof local.name === "string" && typeof local.generation === "string" && local.generation !== "" && typeof local.chosenAt === "string") {
        out["local-file"] = { handle: local.handle, name: local.name, autosave: local.autosave !== false, generation: local.generation, chosenAt: local.chosenAt };
    }
    const drive = stored["google-drive"];
    if (isRecord(drive) && typeof drive.folderId === "string" && drive.folderId !== "" && typeof drive.name === "string" && typeof drive.chosenAt === "string") {
        out["google-drive"] = { folderId: drive.folderId, name: drive.name, chosenAt: drive.chosenAt };
    }
    return out;
}

export function createLocationStore(repo: PlannerRepo): LocationStore {
    return {
        get: async (connector) => readLocations(await repo.read((tx) => tx.getMeta(META_STORAGE_LOCATIONS)))[connector],
        set: async (connector, location) => {
            await repo.write(async (tx) => {
                const current = readLocations(await tx.getMeta(META_STORAGE_LOCATIONS));
                if (location === undefined) delete current[connector];
                else current[connector] = location;
                await tx.putMeta(META_STORAGE_LOCATIONS, current);
            });
        },
    };
}

/** An in-memory location store (tests, and the memory fallback's shape). */
export function createMemoryLocationStore(initial: StorageLocations = {}): LocationStore {
    const current: StorageLocations = { ...initial };
    return {
        get: async (connector) => current[connector],
        set: async (connector, location) => {
            if (location === undefined) delete current[connector];
            else current[connector] = location;
        },
    };
}

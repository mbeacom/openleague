/**
 * The storage connectors as the app runs them (ADR-0022): one sync engine over
 * the store's link table and working copies, with the connectors this browser
 * can use: the Local connector where the File System Access API exists, and
 * Google Drive and OneDrive when the build carries their settings (spec R9).
 * A cloud connector that isn't configured is absent: not in the menus, not in
 * the bundle.
 */
import { GOOGLE_DRIVE_SETTINGS, ONEDRIVE_SETTINGS } from "../config";
import type { FileHandleStore } from "../store/file-handles";
import type { LocalPlannerStore } from "../store/types";
import type { ConnectorId, StorageConnector } from "./connector";
import { createStoreDocuments } from "./documents";
import { createLazyGoogleDriveConnector } from "./google-drive-lazy";
import { createLocalFileConnector, fileSystemAccess, type FsaPickers } from "./local-file";
import { createLazyOneDriveConnector } from "./onedrive-loader";
import { createSyncEngine, type LocalDocuments, type SyncEngine } from "./sync";

export interface StorageService {
    store: LocalPlannerStore;
    engine: SyncEngine;
    /** The working copies the engine reads and writes. */
    documents: LocalDocuments;
    /** Connectors that can save here (configured and supported), in menu order. */
    connectors: StorageConnector[];
    connector: (id: ConnectorId) => StorageConnector | undefined;
}

export interface StorageServiceOptions {
    /** The File System Access pickers; found on the window when omitted (null where the API is missing). */
    pickers?: FsaPickers | null;
    /** Where file handles are kept; the store's (IndexedDB) when omitted. */
    handles?: FileHandleStore;
    /** Extra connectors (tests). */
    extra?: StorageConnector[];
    now?: () => Date;
}

export function createStorageService(store: LocalPlannerStore, { pickers = fileSystemAccess(globalThis), handles = store.fileHandles, extra = [], now }: StorageServiceOptions = {}): StorageService {
    // Written against the build constants themselves: unset, a branch folds away and so do that connector's chunks.
    const google = GOOGLE_DRIVE_SETTINGS ? [createLazyGoogleDriveConnector(GOOGLE_DRIVE_SETTINGS)] : [];
    const oneDrive = ONEDRIVE_SETTINGS ? [createLazyOneDriveConnector({ clientId: ONEDRIVE_SETTINGS.clientId, accounts: ONEDRIVE_SETTINGS.accounts })] : [];
    const all = [createLocalFileConnector({ pickers, handles }), ...google, ...oneDrive, ...extra];
    const connectors = all.filter((connector) => connector.status() !== "unconfigured");
    const documents = createStoreDocuments(store);
    const engine = createSyncEngine({ connectors, links: store.links, documents, ...(now && { now }) });
    return { store, engine, documents, connectors, connector: (id) => connectors.find((connector) => connector.id === id) };
}

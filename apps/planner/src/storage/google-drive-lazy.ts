/**
 * The Google Drive connector as the entry chunk sees it (storage connectors
 * spec R5, R9; ADR-0022): a stand-in that loads the real connector
 * (google-drive.ts, its own chunk) the first time it is used, so a coach who
 * never chooses Google Drive downloads none of it, and Google's scripts load
 * only from that chunk. The service creates this only when the build carries
 * Google settings; otherwise neither file is in the bundle.
 */
import type { GoogleCloudSettings } from "../../cloud-config";
import { connectorFail, type ConnectorCapabilities, type Result, type StorageConnector } from "./connector";

/** Lists its own files (appProperties), opens others through the Picker, and checks before it writes (R4). */
export const GOOGLE_DRIVE_CAPABILITIES: ConnectorCapabilities = { list: true, pick: true, delete: false, conditionalWrite: "check-then-write" };

export type LoadGoogleDrive = (settings: GoogleCloudSettings) => Promise<StorageConnector>;

const loadGoogleDrive: LoadGoogleDrive = async (settings) => (await import("./google-drive")).createGoogleDriveConnector({ settings });

export function createLazyGoogleDriveConnector(settings: GoogleCloudSettings, load: LoadGoogleDrive = loadGoogleDrive): StorageConnector {
    let inner: StorageConnector | null = null;
    let loading: Promise<StorageConnector> | null = null;

    function ensure(): Promise<StorageConnector> {
        if (inner) return Promise.resolve(inner);
        loading ??= load(settings).then(
            (connector) => (inner = connector),
            (error: unknown) => {
                // A failed chunk load (offline, a new deploy) is retried on the next tap.
                loading = null;
                throw error;
            },
        );
        return loading;
    }

    async function via<T>(work: (connector: StorageConnector) => Promise<Result<T>>): Promise<Result<T>> {
        let connector: StorageConnector;
        try {
            connector = await ensure();
        } catch {
            return connectorFail({ code: "unavailable" });
        }
        return work(connector);
    }

    return {
        id: "google-drive",
        capabilities: GOOGLE_DRIVE_CAPABILITIES,
        // Tokens live in memory only (R5), so until the chunk loads there is no session.
        status: () => inner?.status() ?? "disconnected",
        connect: () => via((connector) => connector.connect()),
        disconnect: async () => {
            if (inner) await inner.disconnect();
        },
        prepare: async () => {
            try {
                await (await ensure()).prepare?.();
            } catch {
                // The tap that follows reports the failure.
            }
        },
        list: (filter) => via((connector) => connector.list(filter)),
        pickToOpen: (filter) => via((connector) => connector.pickToOpen(filter)),
        open: (ref) => via((connector) => connector.open(ref)),
        save: (input) => via((connector) => connector.save(input)),
    };
}

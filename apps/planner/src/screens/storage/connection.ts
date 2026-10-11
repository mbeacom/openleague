/**
 * Cloud connectors need an account session before a save, an open or a
 * picker (storage connectors spec R5, R6). Their sign-in is a popup, which
 * browsers allow only from a tap, so the screens connect inside the tap's own
 * handler, and load the connector's code when its menu opens so the popup
 * isn't delayed past the tap.
 */
import type { ConnectorError, StorageConnector } from "../../storage/connector";

/** Connects a disconnected connector (a popup, from this tap); null when ready or nothing to do. */
export async function connectIfNeeded(connector: StorageConnector | undefined): Promise<ConnectorError | null> {
    if (!connector || connector.status() !== "disconnected") return null;
    const connected = await connector.connect();
    return connected.ok ? null : connected.error;
}

/** Starts loading what each connector's sign-in and picker need. Never throws. */
export function prepareConnectors(connectors: readonly StorageConnector[]): void {
    for (const connector of connectors) void connector.prepare?.();
}

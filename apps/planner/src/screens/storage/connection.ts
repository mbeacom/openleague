/**
 * Cloud connectors need an account session before a save, an open or a
 * picker (storage connectors spec R5, R6). Their sign-in is a popup, which
 * browsers allow only from a tap, so the screens connect inside the tap's own
 * handler, and load the connector's code when its menu opens so the popup
 * isn't delayed past the tap. Until that load finishes, the connector's
 * action waits (disabled, "Loading…"): a tap that had to wait for the network
 * first could lose the popup.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ConnectorError, ConnectorId, StorageConnector } from "../../storage/connector";

/** Connects a disconnected connector (a popup, from this tap); null when ready or nothing to do. */
export async function connectIfNeeded(connector: StorageConnector | undefined): Promise<ConnectorError | null> {
    if (!connector || connector.status() !== "disconnected") return null;
    const connected = await connector.connect();
    return connected.ok ? null : connected.error;
}

export interface ConnectorPreparation {
    /** Starts loading what each connector's sign-in and picker need. Never throws. */
    prepare: (connectors: readonly (StorageConnector | undefined)[]) => void;
    /** Loading now: its action waits. */
    isPreparing: (id: ConnectorId) => boolean;
    /**
     * A tap can connect now: nothing to load, loaded, or a load already tried
     * here (a failed load is then reported by connect() itself).
     */
    isReady: (connector: StorageConnector) => boolean;
}

/** Tracks the prepare() calls this screen started, so it can hold a connector's action until its load finishes. */
export function useConnectorPreparation(): ConnectorPreparation {
    const [preparing, setPreparing] = useState<ReadonlySet<ConnectorId>>(() => new Set());
    const [tried, setTried] = useState<ReadonlySet<ConnectorId>>(() => new Set());
    const live = useRef(true);
    useEffect(() => {
        live.current = true;
        return () => {
            live.current = false;
        };
    }, []);

    const prepare = useCallback((connectors: readonly (StorageConnector | undefined)[]) => {
        for (const connector of connectors) {
            if (!connector?.prepare || connector.prepared?.()) continue;
            const { id } = connector;
            setPreparing((current) => new Set(current).add(id));
            void connector
                .prepare()
                .catch(() => undefined)
                .finally(() => {
                    if (!live.current) return;
                    setPreparing((current) => {
                        const next = new Set(current);
                        next.delete(id);
                        return next;
                    });
                    setTried((current) => new Set(current).add(id));
                });
        }
    }, []);

    const isPreparing = useCallback((id: ConnectorId) => preparing.has(id), [preparing]);
    const isReady = useCallback(
        (connector: StorageConnector) => !preparing.has(connector.id) && (!connector.prepare || connector.prepared?.() === true || tried.has(connector.id)),
        [preparing, tried],
    );
    return { prepare, isPreparing, isReady };
}

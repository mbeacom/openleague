/**
 * Cloud storage connections on the Saved files page (storage connectors spec
 * R5, R6, R9): one row per cloud connector this build carries, with Connect
 * and Disconnect. Disconnecting revokes or clears the provider's session in
 * this tab and keeps every link, so connecting again resumes; the coach
 * removes the app's access for good at their account's own page, linked here.
 * Builds without cloud connectors show nothing.
 */
import { useState } from "react";
import { Alert, Box, Button, Link, Stack, Typography } from "@mui/material";
import type { ConnectorId, StorageConnector } from "../../storage/connector";
import { connectIfNeeded, prepareConnectors } from "./connection";
import { CONNECTOR_NAMES, connectErrorText } from "./messages";

/** Where a coach removes the app's access to their account. */
export const CONNECTOR_ACCOUNT_PAGES: Partial<Record<ConnectorId, { href: string; label: string }>> = {
    "google-drive": { href: "https://myaccount.google.com/connections", label: "Your Google Account's third-party connections" },
};

export const CONNECT_LABEL = "Connect";
export const DISCONNECT_LABEL = "Disconnect";

export function disconnectedText(connector: ConnectorId): string {
    return `Disconnected from ${CONNECTOR_NAMES[connector]} in this tab. Your linked files stay linked; connect again to keep saving to them.`;
}

export function CloudConnections({ connectors }: { connectors: readonly StorageConnector[] }) {
    const cloud = connectors.filter((connector) => connector.id !== "local-file");
    const [, setVersion] = useState(0);
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);
    const [disconnected, setDisconnected] = useState<ConnectorId | null>(null);
    if (cloud.length === 0) return null;

    const connect = async (connector: StorageConnector) => {
        setBusy(true);
        setProblem(null);
        setDisconnected(null);
        try {
            const error = await connectIfNeeded(connector);
            if (error) setProblem(connectErrorText(error, connector.id));
        } finally {
            setBusy(false);
            setVersion((value) => value + 1);
        }
    };

    const disconnect = async (connector: StorageConnector) => {
        setBusy(true);
        setProblem(null);
        try {
            await connector.disconnect();
            setDisconnected(connector.id);
        } finally {
            setBusy(false);
            setVersion((value) => value + 1);
        }
    };

    return (
        <Stack spacing={1}>
            {cloud.map((connector) => {
                const isConnected = connector.status() === "connected";
                const account = CONNECTOR_ACCOUNT_PAGES[connector.id];
                return (
                    <Box key={connector.id}>
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "center" } }}>
                            <Typography sx={{ flexGrow: 1 }}>
                                {`${CONNECTOR_NAMES[connector.id]}: ${isConnected ? "connected in this tab" : "not connected"}. Save to… and Open from… offer it; you sign in when you first use it.`}
                            </Typography>
                            {isConnected ? (
                                <Button variant="outlined" disabled={busy} onClick={() => void disconnect(connector)} sx={{ minHeight: 44, flexShrink: 0 }}>
                                    {`${DISCONNECT_LABEL} ${CONNECTOR_NAMES[connector.id]}`}
                                </Button>
                            ) : (
                                <Button
                                    variant="outlined"
                                    disabled={busy}
                                    onPointerEnter={() => prepareConnectors([connector])}
                                    onFocus={() => prepareConnectors([connector])}
                                    onClick={() => void connect(connector)}
                                    sx={{ minHeight: 44, flexShrink: 0 }}
                                >
                                    {`${CONNECT_LABEL} ${CONNECTOR_NAMES[connector.id]}`}
                                </Button>
                            )}
                        </Stack>
                        {disconnected === connector.id && (
                            <Alert severity="info" onClose={() => setDisconnected(null)} sx={{ mt: 1 }}>
                                {disconnectedText(connector.id)}
                                {account && (
                                    <>
                                        {" To remove OpenLeague's access completely, use "}
                                        <Link href={account.href} target="_blank" rel="noopener noreferrer">
                                            {account.label}
                                        </Link>
                                        .
                                    </>
                                )}
                            </Alert>
                        )}
                    </Box>
                );
            })}
            {problem && (
                <Alert severity="error" onClose={() => setProblem(null)}>
                    {problem}
                </Alert>
            )}
        </Stack>
    );
}

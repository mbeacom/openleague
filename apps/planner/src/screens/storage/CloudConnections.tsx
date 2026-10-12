/**
 * Cloud storage connections on the Saved files page (storage connectors spec
 * R5, R6, R9): one row per cloud connector this build carries, with Connect
 * and Disconnect. Disconnecting revokes or clears the provider's session in
 * this tab and keeps every link, so connecting again resumes; the coach
 * removes the app's access for good at their account's own page, linked here.
 * Builds without cloud connectors show nothing.
 */
import { useEffect, useState } from "react";
import { Alert, Box, Button, Link, Stack, Typography } from "@mui/material";
import type { ConnectorId, StorageConnector } from "../../storage/connector";
import { isOneDriveConnector } from "../../storage/onedrive-loader";
import { connectIfNeeded, useConnectorPreparation } from "./connection";
import { CONNECTOR_NAMES, connectErrorText } from "./messages";

/** Where a coach removes the app's access to their account. */
export const CONNECTOR_ACCOUNT_PAGES: Partial<Record<ConnectorId, { href: string; label: string }>> = {
    "google-drive": { href: "https://myaccount.google.com/connections", label: "Your Google Account's third-party connections" },
    // A personal Microsoft account; a work or school account (an `any` build only) uses ONEDRIVE_WORK_ACCOUNT_PAGE.
    onedrive: { href: "https://account.live.com/consent/Manage", label: "your Microsoft account's app permissions" },
};

/** OneDrive with a work or school account (an `any` build only): My Apps, where a user removes an app they consented to. */
export const ONEDRIVE_WORK_ACCOUNT_PAGE = { href: "https://myapps.microsoft.com/", label: "My Apps (work or school accounts)" };

/** Spec R8: in phase 4a the planner reaches only its own folder, so sharing is download-and-open. */
export const ONEDRIVE_SHARING_NOTE =
    "The planner can use only its own folder in your OneDrive (Apps). To share a file, share it in OneDrive; the other coach downloads it and opens it here as a file.";

type AccountType = "personal" | "work" | null;

/**
 * Where to remove access, by the account that was signed in. A build for
 * personal accounts only never mentions work or school accounts; an `any`
 * build offers both pages when the account is unknown.
 */
function accountPages(connector: ConnectorId, account: AccountType, workAccounts: boolean): Array<{ href: string; label: string }> {
    const page = CONNECTOR_ACCOUNT_PAGES[connector];
    if (connector !== "onedrive" || !workAccounts) return page ? [page] : [];
    if (account === "work") return [ONEDRIVE_WORK_ACCOUNT_PAGE];
    if (account === "personal") return page ? [page] : [];
    return [...(page ? [page] : []), ONEDRIVE_WORK_ACCOUNT_PAGE];
}

const accountSuffix = (account: AccountType) => (account === "personal" ? " (personal Microsoft account)" : account === "work" ? " (work or school account)" : "");

export const CONNECT_LABEL = "Connect";
export const DISCONNECT_LABEL = "Disconnect";
export const loadingLabel = (connector: ConnectorId) => `Loading ${CONNECTOR_NAMES[connector]}…`;

export function disconnectedText(connector: ConnectorId): string {
    return `Disconnected from ${CONNECTOR_NAMES[connector]} in this tab. Your linked files stay linked; connect again to keep saving to them.`;
}

export function CloudConnections({ connectors }: { connectors: readonly StorageConnector[] }) {
    const cloud = connectors.filter((connector) => connector.id !== "local-file");
    const [, setVersion] = useState(0);
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);
    const [disconnected, setDisconnected] = useState<{ id: ConnectorId; account: AccountType } | null>(null);
    const preparation = useConnectorPreparation();
    useEffect(() => {
        // OneDrive's session survives a reload (MSAL's sessionStorage cache), so its status is known only once its chunk has read it.
        let live = true;
        const oneDrive = connectors.filter(isOneDriveConnector);
        void Promise.all(oneDrive.map((connector) => connector.prepare())).then(() => {
            if (live && oneDrive.length > 0) setVersion((value) => value + 1);
        });
        return () => {
            live = false;
        };
    }, [connectors]);
    if (cloud.length === 0) return null;

    const connect = async (connector: StorageConnector) => {
        // A cold tap loads the sign-in first; the next tap connects, so its popup opens from that tap.
        if (!preparation.isReady(connector)) {
            preparation.prepare([connector]);
            return;
        }
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
            const account = isOneDriveConnector(connector) ? connector.accountType() : null;
            await connector.disconnect();
            setDisconnected({ id: connector.id, account });
        } finally {
            setBusy(false);
            setVersion((value) => value + 1);
        }
    };

    return (
        <Stack spacing={1}>
            {cloud.map((connector) => {
                const isConnected = connector.status() === "connected";
                const signedIn = isOneDriveConnector(connector) ? connector.accountType() : null;
                const workAccounts = isOneDriveConnector(connector) && connector.accounts === "any";
                const pages = disconnected?.id === connector.id ? accountPages(connector.id, disconnected.account, workAccounts) : [];
                return (
                    <Box key={connector.id}>
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "center" } }}>
                            <Typography sx={{ flexGrow: 1 }}>
                                {`${CONNECTOR_NAMES[connector.id]}: ${isConnected ? `connected in this tab${accountSuffix(signedIn)}` : "not connected"}. Save to… and Open from… offer it; you sign in when you first use it.`}
                            </Typography>
                            {isConnected ? (
                                <Button variant="outlined" disabled={busy} onClick={() => void disconnect(connector)} sx={{ minHeight: 44, flexShrink: 0 }}>
                                    {`${DISCONNECT_LABEL} ${CONNECTOR_NAMES[connector.id]}`}
                                </Button>
                            ) : (
                                <Button
                                    variant="outlined"
                                    disabled={busy || preparation.isPreparing(connector.id)}
                                    onPointerEnter={() => preparation.prepare([connector])}
                                    onFocus={() => preparation.prepare([connector])}
                                    onClick={() => void connect(connector)}
                                    sx={{ minHeight: 44, flexShrink: 0 }}
                                >
                                    {preparation.isPreparing(connector.id) ? loadingLabel(connector.id) : `${CONNECT_LABEL} ${CONNECTOR_NAMES[connector.id]}`}
                                </Button>
                            )}
                        </Stack>
                        {connector.id === "onedrive" && (
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                {ONEDRIVE_SHARING_NOTE}
                            </Typography>
                        )}
                        {disconnected?.id === connector.id && (
                            <Alert severity="info" onClose={() => setDisconnected(null)} sx={{ mt: 1 }}>
                                {disconnectedText(connector.id)}
                                {pages.length > 0 && (
                                    <>
                                        {" To remove OpenLeague's access completely, use "}
                                        {pages.map((page, index) => (
                                            <span key={page.href}>
                                                {index > 0 && " or "}
                                                <Link href={page.href} target="_blank" rel="noopener noreferrer">
                                                    {page.label}
                                                </Link>
                                            </span>
                                        ))}
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

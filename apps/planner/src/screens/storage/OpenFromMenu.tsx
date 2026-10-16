/**
 * "Open from…" (storage connectors spec R7): a file opened through a connector
 * becomes a linked document, so "Save" writes back to it. A file whose
 * envelope id matches a document already here offers "Replace my copy" (the
 * document links to the file; its old content goes to Recovered copies) or
 * "Keep both" (an unlinked copy with its own id). Without a connector the
 * menu offers the import screen, which opens a file as a copy.
 */
import { useState } from "react";
import { Alert, Button, ListItemText, Menu, MenuItem } from "@mui/material";
import { FolderOpenOutlined as OpenIcon } from "@mui/icons-material";
import { readAnyDocumentText } from "@/lib/document-formats";
import { PLAN_FORMAT, type PlanDocument } from "@/lib/plan-document";
import type { RankingsDocument } from "@/lib/rankings-document";
import type { DocumentKind } from "@/lib/document-envelope";
import { docKeyOf } from "../../store/links";
import { refOf, type RemoteFile, type RemoteRef, type StorageConnector } from "../../storage/connector";
import { planStartDate } from "../PlanReviewPanel";
import { useStorage } from "./StorageContext";
import { RemoteFileListDialog } from "./RemoteFileListDialog";
import { ReplaceOrKeepDialog } from "./ReplaceOrKeepDialog";
import { connectIfNeeded, useConnectorPreparation } from "./connection";
import { CONNECTOR_LABELS, CONNECTOR_NAMES, DOWNLOAD_COPY_HINT, LOADING_HINT, connectErrorText, IMPORT_COPY_LABEL, OPEN_FROM_LABEL, STORE_FAILED_MESSAGE, syncErrorText } from "./messages";

export interface OpenFromMenuProps {
    kind: DocumentKind;
    /** The import screen, which opens a file as a copy. */
    importHref: string;
    /** The local id of the document now holding the file. */
    onOpened: (localId: string) => void;
}

interface Pending {
    ref: RemoteRef;
    payload: unknown;
    match: { id: string; title: string };
}

export const PLANNER_FOLDER_ITEM = "From the planner folder…";

const nounOf = (kind: DocumentKind) => (kind === PLAN_FORMAT ? "practice plan" : "rankings");

export function OpenFromMenu({ kind, importHref, onOpened }: OpenFromMenuProps) {
    const storage = useStorage();
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);
    const [pending, setPending] = useState<Pending | null>(null);
    const preparation = useConnectorPreparation();
    const [listing, setListing] = useState<{ connector: StorageConnector; files: RemoteFile[] } | null>(null);
    /** The planner folder on this computer, when one is chosen (storage locations design): its files are offered as a list. */
    const [folderName, setFolderName] = useState<string | null>(null);
    if (!storage) return null;
    const { store, engine, connectors } = storage;

    const attempt = async (work: () => Promise<void>) => {
        setBusy(true);
        setProblem(null);
        try {
            await work();
        } catch (error) {
            console.error("Open failed:", error instanceof Error ? error.name : "unknown");
            setProblem(error instanceof Error && error.name === "StoreDocumentError" ? error.message : STORE_FAILED_MESSAGE);
        } finally {
            setBusy(false);
        }
    };

    const openLinked = async (localId: string, ref: RemoteRef) => {
        const outcome = await engine.openLinked(docKeyOf(kind, localId), ref, { kind });
        if (!outcome.ok) {
            setProblem(syncErrorText(outcome.error, ref.name));
            return;
        }
        onOpened(localId);
    };

    /** Reads a chosen file first: a file this browser already holds is a choice, not a duplicate. */
    const openRef = async (connector: StorageConnector, ref: RemoteRef) => {
        const opened = await connector.open(ref);
        if (!opened.ok) {
            setProblem(syncErrorText(opened.error, ref.name));
            return;
        }
        const read = await readAnyDocumentText(opened.value.text, opened.value.file.name, { modifiedAt: opened.value.file.modifiedAt }, { kind });
        if (!read.ok) {
            setProblem(syncErrorText({ code: "unreadable", message: read.error.message }, ref.name));
            return;
        }
        if (read.document.id) {
            const found = kind === PLAN_FORMAT ? await store.findSessionByDocumentId(read.document.id) : await store.findRankingsByDocumentId(read.document.id);
            if (found.success && found.data) {
                setPending({ ref, payload: read.document.payload, match: { id: found.data.id, title: found.data.title ?? nounOf(kind) } });
                return;
            }
        }
        await openLinked(crypto.randomUUID(), ref);
    };

    const listFrom = async (connector: StorageConnector, where: string) => {
        const listed = await connector.list({ kind });
        if (!listed.ok) {
            setProblem(syncErrorText(listed.error, where));
            return;
        }
        setListing({ connector, files: listed.value });
    };

    const local = connectors.find((connector) => connector.id === "local-file");

    const pickFromFolder = () =>
        attempt(async () => {
            setAnchor(null);
            if (local) await listFrom(local, "the planner folder");
        });

    const pick = (connector: StorageConnector) =>
        attempt(async () => {
            setAnchor(null);
            // A cloud connector signs in first, from this tap; its picker or list needs the session.
            const unconnected = await connectIfNeeded(connector);
            if (unconnected) {
                setProblem(connectErrorText(unconnected, connector.id));
                return;
            }
            if (!connector.capabilities.pick && connector.capabilities.list) {
                // No picker (OneDrive's app folder): choose from the connector's own list.
                await listFrom(connector, CONNECTOR_NAMES[connector.id]);
                return;
            }
            const picked = await connector.pickToOpen({ kind });
            if (!picked.ok) {
                setProblem(syncErrorText(picked.error, "the file"));
                return;
            }
            const ref = picked.value[0];
            if (!ref) return;
            await openRef(connector, ref);
        });

    const chooseListed = (file: RemoteFile) =>
        attempt(async () => {
            if (!listing) return;
            const { connector } = listing;
            setListing(null);
            await openRef(connector, refOf(file));
        });

    const replaceMine = () =>
        attempt(async () => {
            if (!pending) return;
            const { ref, match } = pending;
            setPending(null);
            await openLinked(match.id, ref);
        });

    const keepBoth = () =>
        attempt(async () => {
            if (!pending) return;
            const { payload } = pending;
            setPending(null);
            // A separate, unlinked copy with its own envelope id.
            if (kind === PLAN_FORMAT) {
                const plan = payload as PlanDocument;
                const result = await store.importPlan(plan, { date: planStartDate(plan), addToLibrary: false });
                if (result.success) onOpened(result.data.sessionId);
                else setProblem(result.error);
                return;
            }
            const result = await store.createRankingsDocument(payload as RankingsDocument);
            if (result.success) onOpened(result.data.id);
            else setProblem(result.error);
        });

    return (
        <>
            <Button
                variant="outlined"
                startIcon={<OpenIcon />}
                disabled={busy}
                aria-haspopup="menu"
                aria-controls={anchor ? `open-from-${kind}` : undefined}
                aria-expanded={anchor ? "true" : undefined}
                onClick={(event) => {
                    preparation.prepare(connectors);
                    setAnchor(event.currentTarget);
                    void local?.location?.().then((location) => setFolderName(location?.name ?? null));
                }}
                sx={{ minHeight: 44 }}
            >
                {OPEN_FROM_LABEL}
            </Button>
            <Menu id={`open-from-${kind}`} anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
                {folderName !== null && (
                    <MenuItem onClick={() => void pickFromFolder()} sx={{ minHeight: 44 }}>
                        <ListItemText primary={PLANNER_FOLDER_ITEM} secondary={`${folderName}. Linked: Save writes back to it`} />
                    </MenuItem>
                )}
                {connectors.map((connector) => {
                    // Held while its sign-in loads, so the popup opens from the tap.
                    const loading = preparation.isPreparing(connector.id);
                    const linkedHint = connector.capabilities.pick ? "Linked: Save writes back to it" : "From the planner's folder there. Linked: Save writes back to it";
                    return (
                        <MenuItem key={connector.id} disabled={loading} onClick={() => !loading && void pick(connector)} sx={{ minHeight: 44 }}>
                            <ListItemText primary={CONNECTOR_LABELS[connector.id].item} secondary={loading ? LOADING_HINT : linkedHint} />
                        </MenuItem>
                    );
                })}
                <MenuItem component="a" href={importHref} onClick={() => setAnchor(null)} sx={{ minHeight: 44 }}>
                    <ListItemText primary={IMPORT_COPY_LABEL} secondary={DOWNLOAD_COPY_HINT} />
                </MenuItem>
            </Menu>
            {problem && (
                <Alert severity="error" onClose={() => setProblem(null)} sx={{ mt: 1, width: "100%" }}>
                    {problem}
                </Alert>
            )}
            {listing && (
                <RemoteFileListDialog
                    open
                    where={CONNECTOR_NAMES[listing.connector.id]}
                    files={listing.files}
                    onChoose={(file) => void chooseListed(file)}
                    onCancel={() => setListing(null)}
                />
            )}
            {pending && (
                <ReplaceOrKeepDialog
                    open
                    existingTitle={pending.match.title}
                    noun={nounOf(kind)}
                    busy={busy}
                    onReplace={() => void replaceMine()}
                    onKeepBoth={() => void keepBoth()}
                    onCancel={() => setPending(null)}
                />
            )}
        </>
    );
}

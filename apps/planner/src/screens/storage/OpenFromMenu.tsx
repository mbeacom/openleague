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
import type { RemoteRef, StorageConnector } from "../../storage/connector";
import { planStartDate } from "../PlanReviewPanel";
import { useStorage } from "./StorageContext";
import { ReplaceOrKeepDialog } from "./ReplaceOrKeepDialog";
import { connectIfNeeded, prepareConnectors } from "./connection";
import { CONNECTOR_LABELS, DOWNLOAD_COPY_HINT, connectErrorText, IMPORT_COPY_LABEL, OPEN_FROM_LABEL, STORE_FAILED_MESSAGE, syncErrorText } from "./messages";

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

const nounOf = (kind: DocumentKind) => (kind === PLAN_FORMAT ? "practice plan" : "rankings");

export function OpenFromMenu({ kind, importHref, onOpened }: OpenFromMenuProps) {
    const storage = useStorage();
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);
    const [pending, setPending] = useState<Pending | null>(null);
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

    const pick = (connector: StorageConnector) =>
        attempt(async () => {
            setAnchor(null);
            // A cloud connector signs in first, from this tap; its picker needs the session.
            const unconnected = await connectIfNeeded(connector);
            if (unconnected) {
                setProblem(connectErrorText(unconnected, connector.id));
                return;
            }
            const picked = await connector.pickToOpen({ kind });
            if (!picked.ok) {
                setProblem(syncErrorText(picked.error, "the file"));
                return;
            }
            const ref = picked.value[0];
            if (!ref) return;
            // Read it first: a file this browser already holds is a choice, not a duplicate.
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
                    prepareConnectors(connectors);
                    setAnchor(event.currentTarget);
                }}
                sx={{ minHeight: 44 }}
            >
                {OPEN_FROM_LABEL}
            </Button>
            <Menu id={`open-from-${kind}`} anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
                {connectors.map((connector) => (
                    <MenuItem key={connector.id} onClick={() => void pick(connector)} sx={{ minHeight: 44 }}>
                        <ListItemText primary={CONNECTOR_LABELS[connector.id].item} secondary="Linked: Save writes back to it" />
                    </MenuItem>
                ))}
                <MenuItem component="a" href={importHref} onClick={() => setAnchor(null)} sx={{ minHeight: 44 }}>
                    <ListItemText primary={IMPORT_COPY_LABEL} secondary={DOWNLOAD_COPY_HINT} />
                </MenuItem>
            </Menu>
            {problem && (
                <Alert severity="error" onClose={() => setProblem(null)} sx={{ mt: 1, width: "100%" }}>
                    {problem}
                </Alert>
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

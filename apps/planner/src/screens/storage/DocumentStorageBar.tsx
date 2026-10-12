/**
 * One document's storage controls (storage connectors spec R3, R4, R7; Sync
 * and conflicts): where it is saved and whether that's current, "Save" to its
 * linked file, "Save to…" a new file, and the conflict dialog. The linked
 * file is checked when the screen opens, when the window regains focus and
 * when the browser comes back online (at most once a minute; no polling).
 * Every remote write is a tap: nothing saves in the background.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Box, Button, Chip, ListItemText, Menu, MenuItem, Paper, Stack, Typography } from "@mui/material";
import {
    CloudDoneOutlined as SyncedIcon,
    EditNoteOutlined as UnsavedIcon,
    ErrorOutline as ConflictIcon,
    LockOutlined as LockIcon,
    SaveOutlined as SaveIcon,
    StorageOutlined as BrowserIcon,
} from "@mui/icons-material";
import { serializeDocument, wrapDocument, type DocumentKind, type DocumentPayloads } from "@/lib/document-envelope";
import { downloadBlob } from "@/components/features/practice-planner/export/download";
import type { DocumentLink } from "../../store/records";
import type { ConnectorId, RemoteFile } from "../../storage/connector";
import { needsChoice, type LocalSyncState, type Resolution, type SyncOutcome } from "../../storage/sync";
import { ConflictDialog } from "./ConflictDialog";
import { connectIfNeeded, useConnectorPreparation } from "./connection";
import { useStorage } from "./StorageContext";
import {
    ALLOW_ACCESS_LABEL,
    CONNECTOR_LABELS,
    DOWNLOAD_COPY_HINT,
    DOWNLOAD_COPY_LABEL,
    DOWNLOAD_IS_A_COPY,
    LOADING_HINT,
    SAVE_LABEL,
    SAVE_TO_LABEL,
    STORE_FAILED_MESSAGE,
    UNLINK_LABEL,
    connectErrorText,
    saveCopyLabel,
    statusText,
    syncErrorText,
} from "./messages";

export interface DocumentStorageBarProps {
    docKey: string;
    kind: DocumentKind;
    /** The file name "Save to…" suggests (`<slug>.olplan.json`, `<slug>.rankings.json`). */
    fileName: string;
    /** The working copy was replaced from the file (a refresh, "Use theirs"): reload what the screen shows. */
    onReplaced?: () => void;
    /** Changes whenever the screen saved an edit, so the status is read again. */
    editVersion?: number;
}

type Shown = "unlinked" | "in-sync" | "unsaved" | "newer-available" | "conflict" | "overwritten" | "needs-permission" | "offline";

interface Choice {
    kind: "conflict" | "overwritten";
    remote: RemoteFile;
}

export function DocumentStorageBar(props: DocumentStorageBarProps) {
    const storage = useStorage();
    if (!storage) return null;
    return <StorageBar {...props} />;
}

function StorageBar({ docKey, kind, fileName, onReplaced, editVersion = 0 }: DocumentStorageBarProps) {
    const storage = useStorage()!;
    const { engine, documents, connectors } = storage;
    const [link, setLink] = useState<DocumentLink | null>(null);
    const [shown, setShown] = useState<Shown>("unlinked");
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);
    const [choice, setChoice] = useState<Choice | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [menu, setMenu] = useState<HTMLElement | null>(null);
    /** The linked file refused a save (a view-only share, spec R8): offer a copy. */
    const [refused, setRefused] = useState(false);
    const preparation = useConnectorPreparation();
    const { prepare } = preparation;
    const replaced = useRef(onReplaced);
    useEffect(() => {
        replaced.current = onReplaced;
    });
    const name = link?.remote.name ?? fileName;

    const showLocal = useCallback((local: LocalSyncState) => {
        setLink(local.link);
        setShown(local.link ? (local.dirty ? "unsaved" : "in-sync") : "unlinked");
    }, []);

    const readLocal = useCallback(async () => {
        const local = await engine.localState(docKey);
        showLocal(local);
        return local;
    }, [engine, docKey, showLocal]);

    /** An engine step's result on screen. */
    const apply = useCallback(
        async (outcome: SyncOutcome | null, fileName: string) => {
            if (outcome === null) return;
            setRefused(!outcome.ok && outcome.error.code === "forbidden");
            if (!outcome.ok) {
                await readLocal();
                if (outcome.error.code === "auth-required") setShown("needs-permission");
                else if (outcome.error.code === "offline") setShown("offline");
                setProblem(syncErrorText(outcome.error, fileName));
                return;
            }
            setProblem(null);
            setLink(outcome.link);
            if (needsChoice(outcome.state) && outcome.remote) {
                setShown(outcome.state);
                setChoice({ kind: outcome.state, remote: outcome.remote });
                setDialogOpen(true);
                return;
            }
            setChoice(null);
            if (outcome.refreshed) {
                setShown("newer-available");
                replaced.current?.();
                return;
            }
            setShown(outcome.state);
        },
        [readLocal],
    );

    /** Runs one step; a store failure (thrown) is said plainly. */
    const run = useCallback(
        async (step: () => Promise<SyncOutcome | null>, label: string) => {
            setBusy(true);
            try {
                await apply(await step(), label);
            } catch (error) {
                console.error("Storage step failed:", error instanceof Error ? error.name : "unknown");
                setProblem(error instanceof Error && error.name === "StoreDocumentError" ? error.message : STORE_FAILED_MESSAGE);
            } finally {
                setBusy(false);
            }
        },
        [apply],
    );

    // On open, and after each edit the screen saved: local state, then (once a minute at most) the file.
    useEffect(() => {
        let live = true;
        void engine.localState(docKey).then((local) => {
            if (!live) return;
            showLocal(local);
            if (local.link) void run(() => engine.recheck(docKey), local.link.remote.name);
        });
        return () => {
            live = false;
        };
    }, [showLocal, run, engine, docKey, editVersion]);

    useEffect(() => {
        const recheck = () => {
            if (link) void run(() => engine.recheck(docKey), link.remote.name);
        };
        window.addEventListener("focus", recheck);
        window.addEventListener("online", recheck);
        return () => {
            window.removeEventListener("focus", recheck);
            window.removeEventListener("online", recheck);
        };
    }, [link, run, engine, docKey]);

    // A linked cloud file's Save and "Allow access" sign in from the tap: load that sign-in now, not on the tap.
    const linkedConnector = link?.connector;
    useEffect(() => {
        const connector = linkedConnector ? storage.connector(linkedConnector) : undefined;
        if (connector?.status() === "disconnected") prepare([connector]);
    }, [linkedConnector, storage, prepare]);

    /** A step that needs the connector's session: a cloud connector signs in first, from this tap. */
    const connected = useCallback(
        async (id: ConnectorId, step: () => Promise<SyncOutcome | null>): Promise<SyncOutcome | null> => {
            const error = await connectIfNeeded(storage.connector(id));
            if (!error) return step();
            setProblem(connectErrorText(error, id));
            return null;
        },
        [storage],
    );

    const saveTo = (connector: ConnectorId) => {
        setMenu(null);
        void run(() => connected(connector, () => engine.saveNew(docKey, connector, fileName)), fileName);
    };

    const saveCopy = () => {
        if (!link) return;
        const id = link.connector;
        void run(() => connected(id, () => engine.saveCopy(docKey)), name);
    };

    const downloadCopy = async () => {
        setMenu(null);
        try {
            const local = await documents.read(docKey);
            if (!local) {
                setProblem(syncErrorText({ code: "missing-local" }, fileName));
                return;
            }
            const envelope = wrapDocument(local.kind, local.payload as DocumentPayloads[DocumentKind], { id: local.documentId, updatedAt: new Date().toISOString(), generator: "openleague-static" });
            downloadBlob(new Blob([serializeDocument(envelope)], { type: "application/json" }), fileName);
        } catch (error) {
            console.error("Download failed:", error instanceof Error ? error.name : "unknown");
            setProblem(STORE_FAILED_MESSAGE);
        }
    };

    const resolve = (resolution: Resolution) => {
        if (!choice) return;
        const remote = choice.remote;
        void run(async () => {
            const outcome = await engine.resolve(docKey, resolution, remote);
            if (outcome.ok && resolution === "use-theirs") replaced.current?.();
            return outcome;
        }, name);
    };

    const unlink = async () => {
        setMenu(null);
        await engine.unlink(docKey);
        setChoice(null);
        setProblem(null);
        await readLocal();
    };

    const where = link ? CONNECTOR_LABELS[link.connector].where : "";
    const canSaveLinked = link !== null && connectors.some((connector) => connector.id === link.connector);
    /** The linked connector's sign-in is loading: the steps that may sign in wait for it. */
    const linkedLoading = link !== null && preparation.isPreparing(link.connector);
    const icon =
        shown === "in-sync" || shown === "newer-available" ? (
            <SyncedIcon />
        ) : shown === "unsaved" || shown === "offline" ? (
            <UnsavedIcon />
        ) : shown === "needs-permission" ? (
            <LockIcon />
        ) : shown === "unlinked" ? (
            <BrowserIcon />
        ) : (
            <ConflictIcon />
        );
    const color = shown === "conflict" || shown === "overwritten" ? "warning" : shown === "in-sync" || shown === "newer-available" ? "success" : "default";

    return (
        <Paper variant="outlined" component="section" aria-label="Saving" sx={{ p: { xs: 1.5, sm: 2 }, mb: 2 }}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "center" } }}>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Chip
                        icon={icon}
                        color={color}
                        variant="outlined"
                        label={statusText(shown, link ? `${name} ${where}` : name)}
                        role="status"
                        sx={{ maxWidth: "100%", height: "auto", minHeight: 32, "& .MuiChip-label": { whiteSpace: "normal", py: 0.5 } }}
                    />
                </Box>
                <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
                    {shown === "needs-permission" && link && (
                        <Button
                            variant="contained"
                            startIcon={<LockIcon />}
                            disabled={busy || linkedLoading}
                            onClick={() => void run(() => connected(link.connector, () => engine.check(docKey)), name)}
                            sx={{ minHeight: 44 }}
                        >
                            {ALLOW_ACCESS_LABEL}
                        </Button>
                    )}
                    {(shown === "conflict" || shown === "overwritten") && choice && (
                        <Button variant="contained" color="warning" disabled={busy} onClick={() => setDialogOpen(true)} sx={{ minHeight: 44 }}>
                            Choose a version
                        </Button>
                    )}
                    {canSaveLinked && shown !== "needs-permission" && (
                        <Button variant={shown === "unsaved" || shown === "offline" ? "contained" : "outlined"} startIcon={<SaveIcon />} disabled={busy || linkedLoading} onClick={() => void run(() => connected(link.connector, () => engine.save(docKey)), name)} sx={{ minHeight: 44 }}>
                            {SAVE_LABEL}
                        </Button>
                    )}
                    <Button
                        variant="outlined"
                        disabled={busy}
                        aria-haspopup="menu"
                        aria-controls={menu ? `save-to-${docKey}` : undefined}
                        aria-expanded={menu ? "true" : undefined}
                        onClick={(event) => {
                            preparation.prepare(connectors);
                            setMenu(event.currentTarget);
                        }}
                        sx={{ minHeight: 44 }}
                    >
                        {SAVE_TO_LABEL}
                    </Button>
                </Stack>
            </Stack>
            {connectors.length === 0 && !link && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    {DOWNLOAD_IS_A_COPY}
                </Typography>
            )}
            {problem && (
                <Alert
                    severity={shown === "offline" ? "info" : "error"}
                    onClose={() => setProblem(null)}
                    action={
                        refused && link && canSaveLinked ? (
                            <Button color="inherit" size="small" disabled={busy || linkedLoading} onClick={saveCopy} sx={{ minHeight: 44 }}>
                                {saveCopyLabel(link.connector)}
                            </Button>
                        ) : undefined
                    }
                    sx={{ mt: 1 }}
                >
                    {problem}
                </Alert>
            )}
            <Menu id={`save-to-${docKey}`} anchorEl={menu} open={menu !== null} onClose={() => setMenu(null)}>
                {connectors.map((connector) => {
                    // Held while its sign-in loads, so the popup opens from the tap.
                    const loading = preparation.isPreparing(connector.id);
                    return (
                        <MenuItem key={connector.id} disabled={loading} onClick={() => !loading && saveTo(connector.id)} sx={{ minHeight: 44 }}>
                            <ListItemText primary={CONNECTOR_LABELS[connector.id].item} secondary={loading ? LOADING_HINT : link ? "Saves to a new file and links it" : undefined} />
                        </MenuItem>
                    );
                })}
                <MenuItem onClick={() => void downloadCopy()} sx={{ minHeight: 44 }}>
                    <ListItemText primary={DOWNLOAD_COPY_LABEL} secondary={DOWNLOAD_COPY_HINT} />
                </MenuItem>
                {link && (
                    <MenuItem onClick={() => void unlink()} sx={{ minHeight: 44 }}>
                        <ListItemText primary={UNLINK_LABEL} secondary={`Keeps ${link.remote.name} and this copy; stops saving to it`} />
                    </MenuItem>
                )}
            </Menu>
            {choice && (
                <ConflictDialog
                    open={dialogOpen}
                    kind={choice.kind}
                    remote={choice.remote}
                    mineAt={link?.lastSyncedAt ?? null}
                    busy={busy}
                    onChoose={resolve}
                    onClose={() => setDialogOpen(false)}
                />
            )}
        </Paper>
    );
}

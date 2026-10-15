/**
 * Where new files go, on the Saved files page (storage locations design): per
 * connector, the folder new files are saved under, with Practices/ and
 * Rankings/ inside it. Files on this computer can have a planner folder, with
 * "Keep the folder up to date", "Save everything to the folder" and "Restore
 * from the folder"; Google Drive can have a chosen folder; OneDrive's is
 * fixed to the planner's app folder. Files already saved never move.
 */
import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Card, CardActions, CardContent, FormControlLabel, Stack, Switch, Typography } from "@mui/material";
import type { StorageConnector } from "../../storage/connector";
import { KIND_FOLDERS } from "../../storage/folders";
import { restoreFromFolder, restoreText, saveAllText, saveAllToFolder, takeFolderCopy, type FolderDifference } from "../../storage/planner-folder";
import { connectIfNeeded, useConnectorPreparation } from "./connection";
import { CONNECTOR_NAMES, connectErrorText, syncErrorText } from "./messages";
import { useStorage } from "./StorageContext";

export const LOCATIONS_TITLE = "Where new files go";
export const CHOOSE_FOLDER_LABEL = "Choose folder…";
export const CHANGE_FOLDER_LABEL = "Change folder…";
export const USE_DEFAULT_LABEL = "Use the default";
export const STOP_FOLDER_LABEL = "Stop using this folder";
export const AUTOSAVE_LABEL = "Keep the folder up to date";
export const SAVE_ALL_LABEL = "Save everything to the folder";
export const RESTORE_LABEL = "Restore from the folder";
export const TAKE_FOLDER_COPY_LABEL = "Use the folder's copy";
export const DIFFERENCES_HELP = "These are in this browser with other content than their files in the folder. The folder's copy replaces this browser's, which is kept in Recovered copies. Leave one alone to keep this browser's version, unlinked.";

const SUBFOLDERS = Object.values(KIND_FOLDERS).join(" and ");
/** Said under every location: the layout inside it, and that nothing already saved moves. */
export const SUBFOLDER_NOTE = `New files go in ${SUBFOLDERS} inside it. Files you saved before stay where they are.`;
export const NO_PLANNER_FOLDER = "No planner folder: Save to… asks where to put each new file.";
export const PLANNER_FOLDER_HELP =
    "Choose a folder on this computer and the planner saves new files there without asking, can keep them up to date as you edit, and can restore everything into another browser from it.";

interface Row {
    connector: StorageConnector;
    location: { name: string; chosen: boolean } | null;
}

export interface SaveLocationsProps {
    connectors: readonly StorageConnector[];
    /** After a step that may link, relink or replace documents: the page's other lists reload. */
    onChanged?: () => void;
}

export function SaveLocations({ connectors, onChanged }: SaveLocationsProps) {
    const storage = useStorage();
    const preparation = useConnectorPreparation();
    const [rows, setRows] = useState<Row[] | null>(null);
    const [autosave, setAutosave] = useState(true);
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [differences, setDifferences] = useState<FolderDifference[]>([]);
    const [version, setVersion] = useState(0);
    const reload = useCallback(() => setVersion((value) => value + 1), []);

    const placed = connectors.filter((connector) => connector.location);
    useEffect(() => {
        let live = true;
        void (async () => {
            const next = await Promise.all(placed.map(async (connector) => ({ connector, location: (await connector.location?.()) ?? null })));
            const local = await storage?.locations.get("local-file");
            if (!live) return;
            setRows(next);
            setAutosave(local?.autosave ?? true);
        })();
        return () => {
            live = false;
        };
        // `placed` is derived from connectors, which only changes with the service.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [connectors, storage, version]);

    if (!storage || placed.length === 0) return null;

    const attempt = async (work: () => Promise<void>) => {
        setBusy(true);
        setProblem(null);
        setNotice(null);
        setDifferences([]);
        try {
            await work();
        } catch (error) {
            console.error("A storage location step failed:", error instanceof Error ? error.name : "unknown");
            setProblem("That didn't work. Please try again.");
        } finally {
            setBusy(false);
            reload();
            onChanged?.();
        }
    };

    const choose = (connector: StorageConnector) =>
        attempt(async () => {
            // A cloud connector signs in from this tap first; a cold one loads, and the next tap connects.
            if (connector.id !== "local-file" && !preparation.isReady(connector)) {
                preparation.prepare([connector]);
                return;
            }
            const unconnected = await connectIfNeeded(connector);
            if (unconnected) {
                setProblem(connectErrorText(unconnected, connector.id));
                return;
            }
            const chosen = await connector.chooseLocation?.();
            if (!chosen) return;
            if (!chosen.ok) {
                setProblem(syncErrorText(chosen.error, CONNECTOR_NAMES[connector.id]));
                return;
            }
            if (chosen.value) setNotice(`New files will go in ${chosen.value.name}.`);
        });

    const reset = (connector: StorageConnector) =>
        attempt(async () => {
            await connector.resetLocation?.();
        });

    const setFolderAutosave = (on: boolean) =>
        attempt(async () => {
            const current = await storage.locations.get("local-file");
            if (current) await storage.locations.set("local-file", { ...current, autosave: on });
        });

    const saveAll = () =>
        attempt(async () => {
            const summary = await saveAllToFolder(storage);
            if (summary.firstError && summary.added === 0 && summary.saved === 0) setProblem(syncErrorText(summary.firstError, "the planner folder") ?? saveAllText(summary));
            else setNotice(saveAllText(summary));
        });

    const restore = () =>
        attempt(async () => {
            const summary = await restoreFromFolder(storage);
            const anything = summary.added + summary.linked + summary.unchanged + summary.differing + summary.unreadable > 0;
            if (summary.firstError && !anything) setProblem(syncErrorText(summary.firstError, "the planner folder") ?? restoreText(summary));
            else setNotice(restoreText(summary));
            setDifferences(summary.differences);
        });

    const takeCopy = async (difference: FolderDifference) => {
        setBusy(true);
        setProblem(null);
        try {
            const outcome = await takeFolderCopy(storage, difference);
            if (!outcome.ok) setProblem(syncErrorText(outcome.error, difference.file.name));
            else setDifferences((current) => current.filter((entry) => entry.docKey !== difference.docKey));
        } finally {
            setBusy(false);
            onChanged?.();
        }
    };

    return (
        <Box component="section" aria-labelledby="locations-title">
            <Typography id="locations-title" variant="h6" component="h2" fontWeight={700} sx={{ mb: 1 }}>
                {LOCATIONS_TITLE}
            </Typography>
            {problem && (
                <Alert severity="error" onClose={() => setProblem(null)} sx={{ mb: 1 }}>
                    {problem}
                </Alert>
            )}
            {notice && (
                <Alert severity="success" onClose={() => setNotice(null)} sx={{ mb: 1 }} role="status">
                    {notice}
                </Alert>
            )}
            {differences.length > 0 && (
                <Card variant="outlined" sx={{ mb: 1 }} aria-labelledby="differences-title">
                    <CardContent sx={{ pb: 1 }}>
                        <Typography id="differences-title" fontWeight={700}>
                            Different in the folder
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                            {DIFFERENCES_HELP}
                        </Typography>
                        <Stack spacing={1}>
                            {differences.map((difference) => (
                                <Stack key={difference.docKey} direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", rowGap: 1 }}>
                                    <Typography>{`${difference.title} · ${difference.file.name}`}</Typography>
                                    <Button disabled={busy} onClick={() => void takeCopy(difference)} sx={{ minHeight: 44 }} aria-label={`${TAKE_FOLDER_COPY_LABEL}: ${difference.title}`}>
                                        {TAKE_FOLDER_COPY_LABEL}
                                    </Button>
                                </Stack>
                            ))}
                        </Stack>
                    </CardContent>
                </Card>
            )}
            {rows === null ? (
                <Typography color="text.secondary">Loading…</Typography>
            ) : (
                <Stack spacing={1}>
                    {rows.map(({ connector, location }) => {
                        const name = CONNECTOR_NAMES[connector.id];
                        const loading = preparation.isPreparing(connector.id);
                        const isLocal = connector.id === "local-file";
                        return (
                            <Card key={connector.id} variant="outlined">
                                <CardContent sx={{ pb: 1 }}>
                                    <Typography fontWeight={700}>{name}</Typography>
                                    {location ? (
                                        <>
                                            <Typography>{location.chosen ? `In ${location.name}` : `In ${location.name} (the default)`}</Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                {SUBFOLDER_NOTE}
                                            </Typography>
                                        </>
                                    ) : (
                                        <>
                                            <Typography>{NO_PLANNER_FOLDER}</Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                {PLANNER_FOLDER_HELP}
                                            </Typography>
                                        </>
                                    )}
                                    {isLocal && location && (
                                        <FormControlLabel
                                            sx={{ mt: 1 }}
                                            control={<Switch checked={autosave} disabled={busy} onChange={(event) => void setFolderAutosave(event.target.checked)} />}
                                            label={AUTOSAVE_LABEL}
                                        />
                                    )}
                                </CardContent>
                                {connector.chooseLocation && (
                                    <CardActions sx={{ justifyContent: "flex-end", pt: 0, flexWrap: "wrap", gap: 1 }}>
                                        {isLocal && location && (
                                            <>
                                                <Button disabled={busy} onClick={() => void saveAll()} sx={{ minHeight: 44 }}>
                                                    {SAVE_ALL_LABEL}
                                                </Button>
                                                <Button disabled={busy} onClick={() => void restore()} sx={{ minHeight: 44 }}>
                                                    {RESTORE_LABEL}
                                                </Button>
                                            </>
                                        )}
                                        {location?.chosen && (
                                            <Button disabled={busy} onClick={() => void reset(connector)} sx={{ minHeight: 44 }}>
                                                {isLocal ? STOP_FOLDER_LABEL : USE_DEFAULT_LABEL}
                                            </Button>
                                        )}
                                        <Button
                                            variant="outlined"
                                            disabled={busy || loading}
                                            onClick={() => void choose(connector)}
                                            onPointerEnter={() => preparation.prepare([connector])}
                                            onFocus={() => preparation.prepare([connector])}
                                            sx={{ minHeight: 44 }}
                                            aria-label={`${location?.chosen ? CHANGE_FOLDER_LABEL : CHOOSE_FOLDER_LABEL} (${name})`}
                                        >
                                            {loading ? "Loading…" : location?.chosen ? CHANGE_FOLDER_LABEL : CHOOSE_FOLDER_LABEL}
                                        </Button>
                                    </CardActions>
                                )}
                            </Card>
                        );
                    })}
                </Stack>
            )}
        </Box>
    );
}

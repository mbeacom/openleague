/**
 * Drill files (#523): "Share drills" downloads chosen library drills as an
 * openleague.drills file, and "Import drills" adds a file's drills to this
 * team's library. Shared by the hosted and static planners through the
 * planner store, so both read and write the same file.
 */
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import {
    Alert,
    Button,
    Checkbox,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    Stack,
    Typography,
    useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { FileDownloadOutlined as ShareIcon, FileOpenOutlined as ImportIcon } from "@mui/icons-material";
import { usePlannerPlatform, usePlannerStore, type LibraryPlaySummary } from "@/lib/planner-store";
import { DOCUMENT_FILE_ACCEPT } from "@/lib/document-formats";
import { MAX_FILE_DRILLS, createDrillsDocument, drillsFileName, readDrillsFile, serializeDrillsDocument, type DrillSource, type FileDrill } from "@/lib/drill-document";
import { generateThumbnail } from "@/lib/utils/canvas/thumbnail-generator";
import { STORED_THUMBNAIL_PIXEL_RATIO } from "@/lib/utils/thumbnail-rules";
import { waitForDiagramFont } from "@/lib/utils/canvas/diagram-fonts";
import { downloadBlob } from "./export/download";

const TARGET = { minHeight: 44 } as const;
const PAGE_SIZE = 100;

export const SHARE_DRILLS_INTRO = `Choose up to ${MAX_FILE_DRILLS} drills. Another coach can add them to their library with Import drills.`;
export const ALREADY_IN_LIBRARY = "Already in your library";
export const DRILLS_LOAD_FAILED = "Couldn't load your drills. Try again.";
export const drillsAddedNotice = (count: number) => (count === 1 ? "Added 1 drill to your library." : `Added ${count} drills to your library.`);

const nameKey = (name: string) => name.trim().toLowerCase();

/** Downloads one or more drills as a drill file. Throws when a drill can't be read. */
export async function downloadDrillFile(drills: readonly DrillSource[], generator: Parameters<typeof createDrillsDocument>[1]): Promise<void> {
    const doc = createDrillsDocument(drills, generator);
    downloadBlob(new Blob([serializeDrillsDocument(doc)], { type: "application/json" }), drillsFileName(doc));
}

function storedThumbnail(drill: FileDrill): string | undefined {
    try {
        return generateThumbnail(drill.playData, { pixelRatio: STORED_THUMBNAIL_PIXEL_RATIO });
    } catch {
        // The drill still saves, without a thumbnail.
        return undefined;
    }
}

function ShareDrillsDialog({ teamId, onClose }: { teamId: string; onClose: () => void }) {
    const store = usePlannerStore();
    const { planGenerator } = usePlannerPlatform();
    const fullScreen = useMediaQuery(useTheme().breakpoints.down("sm"));
    const [drills, setDrills] = useState<LibraryPlaySummary[] | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let current = true;
        void (async () => {
            const all: LibraryPlaySummary[] = [];
            let pages = 1;
            for (let page = 1; page <= pages; page++) {
                const result = await store.getPlaysByTeam({ teamId, isTemplate: true, page, limit: PAGE_SIZE, dateFilter: "all" });
                if (!current) return;
                if (!result.success) {
                    setError(DRILLS_LOAD_FAILED);
                    setDrills([]);
                    return;
                }
                all.push(...result.data.plays);
                if (page === 1) pages = Math.ceil(result.data.total / PAGE_SIZE);
            }
            setDrills(all.sort((a, b) => a.name.localeCompare(b.name)));
        })();
        return () => {
            current = false;
        };
    }, [store, teamId]);

    const toggle = (id: string) =>
        setSelected((previous) => {
            const next = new Set(previous);
            if (next.has(id)) next.delete(id);
            else if (next.size < MAX_FILE_DRILLS) next.add(id);
            return next;
        });

    const download = async () => {
        if (!drills) return;
        setBusy(true);
        setError(null);
        try {
            const chosen: DrillSource[] = [];
            for (const drill of drills) {
                if (!selected.has(drill.id)) continue;
                const result = await store.getPlayById({ id: drill.id, teamId });
                if (!result.success) throw new Error(result.error);
                chosen.push(result.data);
            }
            await downloadDrillFile(chosen, planGenerator);
            onClose();
        } catch {
            setError("Couldn't create the drill file. Try again.");
        } finally {
            setBusy(false);
        }
    };

    const atLimit = selected.size >= MAX_FILE_DRILLS;
    return (
        <Dialog open onClose={busy ? undefined : onClose} fullScreen={fullScreen} fullWidth maxWidth="xs" aria-labelledby="share-drills-title">
            <DialogTitle id="share-drills-title" sx={{ fontWeight: 800 }}>
                Share drills
            </DialogTitle>
            <DialogContent>
                <Stack spacing={1.5}>
                    <Typography variant="body2" color="text.secondary">
                        {SHARE_DRILLS_INTRO}
                    </Typography>
                    {error && <Alert severity="error">{error}</Alert>}
                    {drills === null ? (
                        <CircularProgress size={28} sx={{ alignSelf: "center" }} aria-label="Loading drills" />
                    ) : drills.length === 0 && !error ? (
                        <Typography>Your library has no drills yet.</Typography>
                    ) : (
                        <Stack>
                            {drills.map((drill) => (
                                <FormControlLabel
                                    key={drill.id}
                                    sx={TARGET}
                                    control={<Checkbox checked={selected.has(drill.id)} disabled={busy || (atLimit && !selected.has(drill.id))} onChange={() => toggle(drill.id)} />}
                                    label={drill.name}
                                />
                            ))}
                        </Stack>
                    )}
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={onClose} disabled={busy} sx={TARGET}>
                    Cancel
                </Button>
                <Button variant="contained" onClick={() => void download()} disabled={busy || selected.size === 0} sx={TARGET}>
                    {selected.size > 0 ? `Download ${selected.size === 1 ? "1 drill" : `${selected.size} drills`}` : "Download"}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

function ImportDrillsDialog({
    teamId,
    drills,
    libraryNames,
    onClose,
    onImported,
}: {
    teamId: string;
    drills: FileDrill[];
    libraryNames: ReadonlySet<string> | null;
    onClose: () => void;
    onImported: (count: number) => void;
}) {
    const store = usePlannerStore();
    const fullScreen = useMediaQuery(useTheme().breakpoints.down("sm"));
    const inLibrary = (drill: FileDrill) => libraryNames?.has(nameKey(drill.name)) ?? false;
    // A drill whose name is already in the library starts unticked, so importing the same file twice adds nothing.
    const [selected, setSelected] = useState<Set<number>>(() => new Set(drills.flatMap((drill, index) => (inLibrary(drill) ? [] : [index]))));
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const toggle = (index: number) =>
        setSelected((previous) => {
            const next = new Set(previous);
            if (next.has(index)) next.delete(index);
            else next.add(index);
            return next;
        });

    const add = async () => {
        setBusy(true);
        setError(null);
        let added = 0;
        try {
            // The stored thumbnail must not bake in the fallback font.
            await waitForDiagramFont();
            for (const [index, drill] of drills.entries()) {
                if (!selected.has(index)) continue;
                const result = await store.createPlay({
                    name: drill.name,
                    description: drill.description || undefined,
                    thumbnail: storedThumbnail(drill),
                    playData: drill.playData,
                    focus: drill.focus,
                    goalies: drill.goalies,
                    ageGroups: [...drill.ageGroups],
                    isTemplate: true,
                    teamId,
                });
                if (!result.success) {
                    setError(added > 0 ? `${result.error} ${drillsAddedNotice(added)}` : result.error);
                    if (added > 0) onImported(added);
                    return;
                }
                added++;
            }
            onImported(added);
            onClose();
        } catch {
            setError(added > 0 ? `Couldn't add every drill. ${drillsAddedNotice(added)}` : "Couldn't add the drills. Try again.");
            if (added > 0) onImported(added);
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open onClose={busy ? undefined : onClose} fullScreen={fullScreen} fullWidth maxWidth="xs" aria-labelledby="import-drills-title">
            <DialogTitle id="import-drills-title" sx={{ fontWeight: 800 }}>
                Import drills
            </DialogTitle>
            <DialogContent>
                <Stack spacing={1.5}>
                    <Typography variant="body2" color="text.secondary">
                        The chosen drills are added to your library.
                    </Typography>
                    {error && <Alert severity="error">{error}</Alert>}
                    <Stack>
                        {drills.map((drill, index) => (
                            <FormControlLabel
                                key={index}
                                sx={TARGET}
                                control={<Checkbox checked={selected.has(index)} disabled={busy} onChange={() => toggle(index)} />}
                                label={
                                    <span>
                                        {drill.name}
                                        {inLibrary(drill) && (
                                            <Typography component="span" variant="body2" color="text.secondary">
                                                {` · ${ALREADY_IN_LIBRARY}`}
                                            </Typography>
                                        )}
                                    </span>
                                }
                            />
                        ))}
                    </Stack>
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={onClose} disabled={busy} sx={TARGET}>
                    Cancel
                </Button>
                <Button variant="contained" onClick={() => void add()} disabled={busy || selected.size === 0} sx={TARGET}>
                    {selected.size === 1 ? "Add 1 drill" : `Add ${selected.size} drills`}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

/** The library header's Share drills and Import drills buttons, with their dialogs. */
export function DrillFileActions({
    teamId,
    libraryNames,
    onImported,
}: {
    teamId: string;
    /** Every drill name in the library (trimmed, lowercased); null while unknown. */
    libraryNames: ReadonlySet<string> | null;
    onImported: (count: number) => void;
}) {
    const fileInput = useRef<HTMLInputElement>(null);
    const [sharing, setSharing] = useState(false);
    const [importing, setImporting] = useState<FileDrill[] | null>(null);
    const [notice, setNotice] = useState<{ severity: "success" | "error"; text: string } | null>(null);

    const chooseFile = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        const result = await readDrillsFile(file);
        if (result.ok) {
            setNotice(null);
            setImporting(result.doc.drills);
        } else {
            setNotice({ severity: "error", text: result.error.message });
        }
    }, []);

    return (
        <Stack spacing={1}>
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
                <Button variant="outlined" startIcon={<ShareIcon />} onClick={() => setSharing(true)} sx={TARGET}>
                    Share drills
                </Button>
                <Button variant="outlined" startIcon={<ImportIcon />} onClick={() => fileInput.current?.click()} sx={TARGET}>
                    Import drills
                </Button>
                <input ref={fileInput} type="file" hidden accept={DOCUMENT_FILE_ACCEPT} data-testid="drills-file-input" onChange={(event) => void chooseFile(event)} />
            </Stack>
            {notice && (
                <Alert severity={notice.severity} onClose={() => setNotice(null)}>
                    {notice.text}
                </Alert>
            )}
            {sharing && <ShareDrillsDialog teamId={teamId} onClose={() => setSharing(false)} />}
            {importing && (
                <ImportDrillsDialog
                    teamId={teamId}
                    drills={importing}
                    libraryNames={libraryNames}
                    onClose={() => setImporting(null)}
                    onImported={(count) => {
                        setNotice({ severity: "success", text: drillsAddedNotice(count) });
                        onImported(count);
                    }}
                />
            )}
        </Stack>
    );
}

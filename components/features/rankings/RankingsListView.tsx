"use client";

/**
 * The hosted rankings list (ADR-0025): the signed-in user's own rankings
 * documents, private to them. Start an empty one (it opens on the import
 * screen) or open a rankings file exported from either app.
 */
import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Alert, Box, Button, IconButton, List, ListItem, ListItemButton, ListItemText, Paper, Stack, Tooltip, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import FileOpenIcon from "@mui/icons-material/FileOpenOutlined";
import { createRankingsRecord, deleteRankingsRecord, type RankingsRecordSummary } from "@/lib/actions/rankings";
import { readRankingsFile } from "@/lib/rankings-document";
import { RANKINGS_LIST_PATH } from "./paths";

export const NEW_RANKINGS_LABEL = "New rankings";
export const OPEN_RANKINGS_FILE_LABEL = "Open a rankings file";
export const RANKINGS_PRIVACY_NOTE =
    "Your rankings are private to your account: no team, league or other user can see them. They're computed from league pages you choose, and you can export them as a file that the free planner opens too.";
export const NO_RANKINGS_MESSAGE = "No rankings yet. Start new rankings and import a league schedule, or open a rankings file.";

const updatedText = (date: Date) =>
    // A fixed locale and zone: the server render and the browser must produce the same text.
    `Updated ${new Date(date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })}`;

export function RankingsListView({ records }: { records: RankingsRecordSummary[] }) {
    const router = useRouter();
    const fileInput = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    const start = async () => {
        setBusy(true);
        setError(null);
        const result = await createRankingsRecord({});
        if (result.success) router.push(`${RANKINGS_LIST_PATH}/${result.data.id}/import`);
        else {
            setError(result.error);
            setBusy(false);
        }
    };

    const openFile = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        setBusy(true);
        setError(null);
        const read = await readRankingsFile(file);
        if (!read.ok) {
            setError(read.error.message);
            setBusy(false);
            return;
        }
        const result = await createRankingsRecord({ document: read.doc });
        if (result.success) router.push(`${RANKINGS_LIST_PATH}/${result.data.id}`);
        else {
            setError(result.error);
            setBusy(false);
        }
    };

    const remove = async (id: string) => {
        setBusy(true);
        setError(null);
        const result = await deleteRankingsRecord(id);
        setBusy(false);
        setConfirmDelete(null);
        if (result.success) router.refresh();
        else setError(result.error);
    };

    return (
        <Stack spacing={2}>
            <Box>
                <Typography component="h1" variant="h4" sx={{ fontWeight: 800 }}>
                    Rankings
                </Typography>
                <Typography color="text.secondary" sx={{ mt: 0.5, maxWidth: "48rem" }}>
                    {RANKINGS_PRIVACY_NOTE}
                </Typography>
            </Box>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <Button variant="contained" startIcon={<AddIcon />} disabled={busy} onClick={() => void start()} sx={{ minHeight: 44 }}>
                    {NEW_RANKINGS_LABEL}
                </Button>
                <Button variant="outlined" startIcon={<FileOpenIcon />} disabled={busy} onClick={() => fileInput.current?.click()} sx={{ minHeight: 44 }}>
                    {OPEN_RANKINGS_FILE_LABEL}
                </Button>
                <input ref={fileInput} type="file" accept=".json,application/json" hidden aria-label={OPEN_RANKINGS_FILE_LABEL} onChange={(event) => void openFile(event)} />
            </Stack>
            {error && <Alert severity="error">{error}</Alert>}
            {records.length === 0 ? (
                <Alert severity="info">{NO_RANKINGS_MESSAGE}</Alert>
            ) : (
                <Paper variant="outlined">
                    <List disablePadding aria-label="Your rankings">
                        {records.map((record) => (
                            <ListItem
                                key={record.id}
                                divider
                                disablePadding
                                secondaryAction={
                                    confirmDelete === record.id ? (
                                        <Stack direction="row" spacing={0.5}>
                                            <Button color="error" disabled={busy} onClick={() => void remove(record.id)} sx={{ minHeight: 44 }}>
                                                Delete
                                            </Button>
                                            <Button onClick={() => setConfirmDelete(null)} sx={{ minHeight: 44 }}>
                                                Keep
                                            </Button>
                                        </Stack>
                                    ) : (
                                        <Tooltip title="Delete">
                                            <IconButton edge="end" aria-label={`Delete ${record.title}`} onClick={() => setConfirmDelete(record.id)} sx={{ width: 44, height: 44 }}>
                                                <DeleteOutlineIcon />
                                            </IconButton>
                                        </Tooltip>
                                    )
                                }
                            >
                                <ListItemButton component={Link} href={`${RANKINGS_LIST_PATH}/${record.id}`} sx={{ minHeight: 56, pr: confirmDelete === record.id ? 20 : 8 }}>
                                    <ListItemText
                                        primary={record.title}
                                        secondary={record.hasDocument ? updatedText(record.updatedAt) : `${updatedText(record.updatedAt)} · waiting for a schedule import`}
                                        slotProps={{ primary: { sx: { fontWeight: 700 } } }}
                                    />
                                </ListItemButton>
                            </ListItem>
                        ))}
                    </List>
                </Paper>
            )}
        </Stack>
    );
}

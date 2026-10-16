/**
 * Saved files (storage connectors spec R7, Sync and conflicts): where this
 * browser can save, which documents are linked to a file (with "Unlink"), and
 * Recovered copies, the versions "Use theirs", opening a file over a document,
 * or "Replace my copy" replaced, kept 30 days.
 */
import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Card, CardActions, CardContent, Stack, Typography } from "@mui/material";
import { PageHeader } from "@/components/ui/PageHeader";
import { serializeDocument, wrapDocument, isEnvelopeId, type DocumentKind, type DocumentPayloads } from "@/lib/document-envelope";
import { PLAN_FORMAT, planFileName, type PlanDocument } from "@/lib/plan-document";
import { RANKINGS_FORMAT, rankingsFileName, type RankingsDocument } from "@/lib/rankings-document";
import { downloadBlob } from "@/components/features/practice-planner/export/download";
import { usePlannerPlatform } from "@/lib/planner-store";
import { staticRoutes } from "../../routes";
import type { DocumentLink } from "../../store/records";
import type { RecoveredCopySummary } from "../../store/recovered";
import { RECOVERED_RETENTION_DAYS } from "../../store/recovered";
import { parseDocKey } from "../../storage/documents";
import { folderOfFileId } from "../../storage/local-file";
import { planStartDate } from "../PlanReviewPanel";
import { CloudConnections } from "./CloudConnections";
import { SaveLocations } from "./SaveLocations";
import { useStorage } from "./StorageContext";
import { CONNECTOR_LABELS, DOWNLOAD_IS_A_COPY, SAVED_IN_BROWSER, UNLINK_LABEL, savedAtText } from "./messages";

export const STORAGE_SCREEN_TITLE = "Saved files";
export const RECOVERED_TITLE = "Recovered copies";
export const LINKED_TITLE = "Linked files";
export const RESTORE_LABEL = "Restore as a copy";
export const NO_RECOVERED_MESSAGE = "Nothing to recover. When a document is replaced from a file, the version it replaced is kept here.";
export const NO_LINKED_MESSAGE = "No documents are linked to a file. Use Save to… on a practice or your rankings.";

interface LinkedRow {
    link: DocumentLink;
    title: string;
    href: string | null;
}

/** "Practices/tuesday.olplan.json in the planner folder", or the file's name and where it is. */
function linkedWhere(link: DocumentLink): string {
    const kindFolder = link.connector === "local-file" ? folderOfFileId(link.remote.fileId) : undefined;
    return kindFolder ? `${kindFolder}/${link.remote.name} in the planner folder` : `${link.remote.name} ${CONNECTOR_LABELS[link.connector].where}`;
}

const kindNoun = (kind: string) => (kind === PLAN_FORMAT ? "Practice plan" : kind === RANKINGS_FORMAT ? "Rankings" : "Document");

export function StorageScreen() {
    const storage = useStorage();
    const { navigate } = usePlannerPlatform();
    const [linked, setLinked] = useState<LinkedRow[] | null>(null);
    const [copies, setCopies] = useState<RecoveredCopySummary[] | null>(null);
    const [problem, setProblem] = useState<string | null>(null);
    const [version, setVersion] = useState(0);
    const reload = useCallback(() => setVersion((value) => value + 1), []);

    useEffect(() => {
        if (!storage) return;
        let live = true;
        const { store } = storage;
        void (async () => {
            const links = await store.links.list();
            // The rankings route shows the newest record only, so only that record gets an Open link.
            const currentRankings = links.some((link) => parseDocKey(link.docKey)?.kind === RANKINGS_FORMAT) ? await store.listRankingsDocuments() : null;
            const currentRankingsId = currentRankings?.success ? (currentRankings.data[0]?.id ?? null) : null;
            const rows = await Promise.all(
                links.map(async (link): Promise<LinkedRow> => {
                    const key = parseDocKey(link.docKey);
                    if (key?.kind === PLAN_FORMAT) {
                        const info = await store.getSessionDocumentInfo(key.id);
                        return { link, title: info.success ? info.data.title : link.remote.name, href: staticRoutes.session(key.id) };
                    }
                    if (key?.kind === RANKINGS_FORMAT) {
                        const record = await store.getRankingsDocument(key.id);
                        return { link, title: record.success ? record.data.document.meta.title : link.remote.name, href: key.id === currentRankingsId ? staticRoutes.rankings() : null };
                    }
                    return { link, title: link.remote.name, href: null };
                }),
            );
            const recovered = await store.listRecoveredCopies();
            if (!live) return;
            setLinked(rows);
            if (recovered.success) setCopies(recovered.data);
            else setProblem(recovered.error);
        })();
        return () => {
            live = false;
        };
    }, [storage, version]);

    if (!storage) return null;
    const { store, engine, connectors } = storage;

    const unlink = async (docKey: string) => {
        await engine.unlink(docKey);
        reload();
    };

    const restore = async (copy: RecoveredCopySummary) => {
        setProblem(null);
        const full = await store.getRecoveredCopy(copy.id);
        if (!full.success) return setProblem(full.error);
        if (copy.kind === PLAN_FORMAT) {
            const plan = full.data.payload as PlanDocument;
            const result = await store.importPlan(plan, { date: planStartDate(plan), addToLibrary: false });
            if (!result.success) return setProblem(result.error);
            navigate(staticRoutes.session(result.data.sessionId));
            return;
        }
        if (copy.kind === RANKINGS_FORMAT) {
            // A new record becomes the current rankings; the one it replaced stays on this device.
            const result = await store.createRankingsDocument(full.data.payload as RankingsDocument);
            if (!result.success) return setProblem(result.error);
            navigate(staticRoutes.rankings());
        }
    };

    const download = async (copy: RecoveredCopySummary) => {
        setProblem(null);
        const full = await store.getRecoveredCopy(copy.id);
        if (!full.success) return setProblem(full.error);
        const kind = copy.kind as DocumentKind;
        const payload = full.data.payload as DocumentPayloads[DocumentKind];
        const envelope = wrapDocument(kind, payload, {
            id: isEnvelopeId(copy.documentId) ? copy.documentId : crypto.randomUUID(),
            updatedAt: copy.recoveredAt,
            generator: "openleague-static",
        });
        const name = kind === PLAN_FORMAT ? planFileName((payload as PlanDocument).session.title) : rankingsFileName(payload as RankingsDocument);
        downloadBlob(new Blob([serializeDocument(envelope)], { type: "application/json" }), name);
    };

    const remove = async (copy: RecoveredCopySummary) => {
        const result = await store.deleteRecoveredCopy(copy.id);
        if (!result.success) setProblem(result.error);
        reload();
    };

    return (
        <>
            <PageHeader title={STORAGE_SCREEN_TITLE} subtitle="Where your practices and rankings are saved, besides this browser." />
            <Stack spacing={3}>
                {problem && (
                    <Alert severity="error" onClose={() => setProblem(null)}>
                        {problem}
                    </Alert>
                )}

                <Box component="section" aria-labelledby="where-title">
                    <Typography id="where-title" variant="h6" component="h2" fontWeight={700} sx={{ mb: 1 }}>
                        Where you can save
                    </Typography>
                    <Stack spacing={1}>
                        <Typography>{`${SAVED_IN_BROWSER}: always. Every change is kept here first.`}</Typography>
                        {connectors.some((connector) => connector.id === "local-file") ? (
                            <Typography>Files on this computer: Save to… links a practice or your rankings to a file, and Save writes your changes back to it.</Typography>
                        ) : (
                            <Typography color="text.secondary">{DOWNLOAD_IS_A_COPY}</Typography>
                        )}
                        <CloudConnections connectors={connectors} />
                    </Stack>
                </Box>

                <SaveLocations connectors={connectors} onChanged={reload} />

                <Box component="section" aria-labelledby="linked-title">
                    <Typography id="linked-title" variant="h6" component="h2" fontWeight={700} sx={{ mb: 1 }}>
                        {LINKED_TITLE}
                    </Typography>
                    {linked === null ? (
                        <Typography color="text.secondary">Loading…</Typography>
                    ) : linked.length === 0 ? (
                        <Typography color="text.secondary">{NO_LINKED_MESSAGE}</Typography>
                    ) : (
                        <Stack spacing={1}>
                            {linked.map(({ link, title, href }) => (
                                <Card key={link.docKey} variant="outlined">
                                    <CardContent sx={{ pb: 1 }}>
                                        <Typography fontWeight={700}>{title}</Typography>
                                        <Typography variant="body2" color="text.secondary">{`${linkedWhere(link)} · last saved or read ${savedAtText(link.lastSyncedAt)}`}</Typography>
                                    </CardContent>
                                    <CardActions sx={{ justifyContent: "flex-end", pt: 0, flexWrap: "wrap", gap: 1 }}>
                                        {href && (
                                            <Button href={href} sx={{ minHeight: 44 }}>
                                                Open
                                            </Button>
                                        )}
                                        <Button onClick={() => void unlink(link.docKey)} sx={{ minHeight: 44 }} aria-label={`${UNLINK_LABEL} ${title}`}>
                                            {UNLINK_LABEL}
                                        </Button>
                                    </CardActions>
                                </Card>
                            ))}
                        </Stack>
                    )}
                </Box>

                <Box component="section" aria-labelledby="recovered-title">
                    <Typography id="recovered-title" variant="h6" component="h2" fontWeight={700}>
                        {RECOVERED_TITLE}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        {`Kept in this browser for ${RECOVERED_RETENTION_DAYS} days, then removed.`}
                    </Typography>
                    {copies === null ? (
                        <Typography color="text.secondary">Loading…</Typography>
                    ) : copies.length === 0 ? (
                        <Typography color="text.secondary">{NO_RECOVERED_MESSAGE}</Typography>
                    ) : (
                        <Stack spacing={1}>
                            {copies.map((copy) => (
                                <Card key={copy.id} variant="outlined">
                                    <CardContent sx={{ pb: 1 }}>
                                        <Typography fontWeight={700}>{copy.title}</Typography>
                                        <Typography variant="body2" color="text.secondary">{`${kindNoun(copy.kind)} · replaced ${savedAtText(copy.recoveredAt)}`}</Typography>
                                    </CardContent>
                                    <CardActions sx={{ justifyContent: "flex-end", pt: 0, flexWrap: "wrap", gap: 1 }}>
                                        <Button onClick={() => void restore(copy)} sx={{ minHeight: 44 }} aria-label={`${RESTORE_LABEL}: ${copy.title}`}>
                                            {RESTORE_LABEL}
                                        </Button>
                                        <Button onClick={() => void download(copy)} sx={{ minHeight: 44 }} aria-label={`Download ${copy.title}`}>
                                            Download
                                        </Button>
                                        <Button color="error" onClick={() => void remove(copy)} sx={{ minHeight: 44 }} aria-label={`Delete ${copy.title}`}>
                                            Delete
                                        </Button>
                                    </CardActions>
                                </Card>
                            ))}
                        </Stack>
                    )}
                </Box>
            </Stack>
        </>
    );
}

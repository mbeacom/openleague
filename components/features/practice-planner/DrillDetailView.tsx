"use client";

/**
 * A library drill's read-only details page, on both deployables (ADR-0020):
 * the diagram large, what the drill is for, and the actions a coach takes
 * from here. The primary click on a library card opens this; Edit is one of
 * its actions. Store and links come from the planner seam.
 */
import { useCallback, useState, type ReactNode } from "react";
import { Alert, Box, Button, Chip, CircularProgress, Divider, Paper, Stack, Typography } from "@mui/material";
import {
    AddCircleOutline as AddToPracticeIcon,
    ArrowBack as ArrowBackIcon,
    ContentCopy as DuplicateIcon,
    Edit as EditIcon,
    FileDownloadOutlined as DownloadIcon,
} from "@mui/icons-material";
import { usePlannerPlatform, usePlannerStore, type LibraryPlay } from "@/lib/planner-store";
import { FOCUS_LABELS, GOALIES_LABELS, drillTags } from "@/lib/utils/drill-tags";
import { formatAgeGroups } from "@/lib/utils/age-groups";
import { iceAreaLabel } from "@/lib/utils/canvas/notation";
import { generateThumbnail } from "@/lib/utils/canvas/thumbnail-generator";
import { waitForDiagramFont } from "@/lib/utils/canvas/diagram-fonts";
import { isPngDataUri, pngDataUriToBytes } from "@/lib/utils/png-data-uri";
import {
    diagramEquipment,
    drillDiagramFileName,
    duplicateDrillName,
    equipmentCountLabel,
    usedInLabel,
} from "@/lib/utils/drill-details";
import { downloadBlob } from "./export/download";
import { PRINT_DIAGRAM_SIZE } from "./print/PrintDiagram";
import { PlayDiagram } from "./PlayDiagram";
import { PlayLegend } from "./PlayLegend";

export interface DrillDetailViewProps {
    play: LibraryPlay;
    /** The team id the drill's library belongs to. */
    teamId: string;
    /** Edit and Duplicate (and Add to practice) are for whoever may change the library. */
    canEdit: boolean;
    /** Practices that use this drill; omitted when unknown. */
    usageCount?: number;
    /**
     * Extra detail rows below the tags, for fields other features add to a drill
     * (a gear list, a favorite toggle). Rendered as given.
     */
    extras?: ReactNode;
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
    return (
        <Box>
            <Typography variant="overline" color="text.secondary" component="dt" sx={{ display: "block", lineHeight: 1.6, letterSpacing: "0.08em" }}>
                {label}
            </Typography>
            <Box component="dd" sx={{ m: 0 }}>
                {children}
            </Box>
        </Box>
    );
}

export function DrillDetailView({ play, teamId, canEdit, usageCount, extras }: DrillDetailViewProps) {
    const store = usePlannerStore();
    const { Link, navigate, routes } = usePlannerPlatform();
    const [error, setError] = useState<string | null>(null);
    const [duplicating, setDuplicating] = useState(false);

    const tags = drillTags(play);
    const equipment = diagramEquipment(play.playData);
    const description = play.description?.trim() ?? "";

    const handleDuplicate = useCallback(async () => {
        setDuplicating(true);
        setError(null);
        try {
            const result = await store.createPlay({
                name: duplicateDrillName(play.name),
                description: play.description || undefined,
                thumbnail: play.thumbnail || undefined,
                playData: play.playData,
                focus: play.focus,
                goalies: play.goalies,
                ageGroups: play.ageGroups ? [...play.ageGroups] : undefined,
                isTemplate: true,
                teamId,
            });
            if (result.success) {
                navigate(routes.libraryPlay(result.data.id));
                return;
            }
            setError(result.error);
        } catch (err) {
            console.error("Error duplicating drill:", err);
            setError("Couldn't duplicate this drill. Please try again.");
        }
        setDuplicating(false);
    }, [store, play, teamId, navigate, routes]);

    const handleDownload = useCallback(async () => {
        setError(null);
        try {
            // A downloaded file must not bake in the fallback font.
            await waitForDiagramFont();
            // The bench sheet's printed diagram, so the file matches the paper.
            const uri = generateThumbnail(play.playData, PRINT_DIAGRAM_SIZE);
            if (!isPngDataUri(uri)) throw new Error("The diagram didn't draw as a PNG");
            downloadBlob(new Blob([pngDataUriToBytes(uri) as BlobPart], { type: "image/png" }), drillDiagramFileName(play.name));
        } catch (err) {
            console.error("Error downloading the diagram:", err);
            setError("Couldn't download the diagram. Please try again.");
        }
    }, [play]);

    return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <Button
                component={Link}
                href={routes.library()}
                startIcon={<ArrowBackIcon />}
                variant="text"
                sx={{ alignSelf: "flex-start", ml: -1, minHeight: 44 }}
            >
                Drill library
            </Button>

            {error && (
                <Alert severity="error" onClose={() => setError(null)}>
                    {error}
                </Alert>
            )}

            {/* Header: name, usage, actions */}
            <Paper
                sx={{
                    p: { xs: 2, sm: 3 },
                    position: "relative",
                    overflow: "hidden",
                    "&::before": {
                        content: '""',
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        height: "4px",
                        // Tokens, not theme.palette: under cssVariables the JS palette always holds the
                        // LIGHT literals, so the stripe would stay light-scheme blue in dark mode.
                        background: (theme) => {
                            const { primary } = (theme.vars || theme).palette;
                            return `linear-gradient(90deg, ${primary.dark} 0%, ${primary.main} 55%, ${primary.light} 100%)`;
                        },
                    },
                }}
            >
                <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ xs: "stretch", md: "center" }} spacing={2}>
                    <Box sx={{ minWidth: 0 }}>
                        <Typography variant="overline" color="secondary" sx={{ fontWeight: 700, letterSpacing: "0.12em" }}>
                            Drill
                        </Typography>
                        <Typography variant="h4" component="h1" sx={{ fontWeight: 800, overflowWrap: "anywhere" }}>
                            {play.name}
                        </Typography>
                        {usageCount !== undefined && (
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }} data-testid="drill-usage">
                                {usedInLabel(usageCount)}
                            </Typography>
                        )}
                    </Box>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ flexShrink: 0 }}>
                        {canEdit && (
                            <Button component={Link} href={routes.libraryEdit(play.id)} variant="contained" startIcon={<EditIcon />} sx={{ minHeight: 44 }}>
                                Edit
                            </Button>
                        )}
                        {canEdit && (
                            <Button
                                component={Link}
                                href={routes.sessionNewWithDrill(play.id)}
                                variant="outlined"
                                startIcon={<AddToPracticeIcon />}
                                sx={{ minHeight: 44 }}
                            >
                                Add to new practice
                            </Button>
                        )}
                        {canEdit && (
                            <Button
                                variant="outlined"
                                startIcon={duplicating ? <CircularProgress size={16} color="inherit" /> : <DuplicateIcon />}
                                onClick={handleDuplicate}
                                disabled={duplicating}
                                sx={{ minHeight: 44 }}
                            >
                                {duplicating ? "Duplicating..." : "Duplicate"}
                            </Button>
                        )}
                        <Button variant="outlined" startIcon={<DownloadIcon />} onClick={handleDownload} sx={{ minHeight: 44 }}>
                            Download diagram
                        </Button>
                    </Stack>
                </Stack>
            </Paper>

            <Box sx={{ display: "grid", gap: 3, gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "minmax(0, 2fr) minmax(0, 1fr)" }, alignItems: "start" }}>
                {/* The diagram, large, with the notation it uses */}
                <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2 }, display: "flex", flexDirection: "column", gap: 2 }}>
                    <Box sx={{ bgcolor: "common.white", borderRadius: 1, overflow: "hidden" }}>
                        <PlayDiagram playData={play.playData} label={play.name} />
                    </Box>
                    <PlayLegend playData={play.playData} defaultExpanded />
                </Paper>

                {/* What the drill is for */}
                <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
                    <Typography variant="h6" component="h2" sx={{ fontWeight: 700, mb: 1 }}>
                        About this drill
                    </Typography>
                    <Typography variant="body1" color={description ? "text.primary" : "text.secondary"} sx={{ whiteSpace: "pre-line", overflowWrap: "anywhere" }}>
                        {description || "No description yet."}
                    </Typography>
                    <Divider sx={{ my: 2 }} />
                    <Stack component="dl" spacing={1.5} sx={{ m: 0 }}>
                        <DetailRow label="Focus">
                            <Chip size="small" color="primary" variant="outlined" label={FOCUS_LABELS[tags.focus]} />
                        </DetailRow>
                        <DetailRow label="Goalies">
                            <Chip size="small" variant="outlined" label={GOALIES_LABELS[tags.goalies]} />
                        </DetailRow>
                        <DetailRow label="Ages">
                            <Typography variant="body2">{formatAgeGroups(play.ageGroups)}</Typography>
                        </DetailRow>
                        <DetailRow label="Ice area">
                            <Typography variant="body2">{iceAreaLabel(play.playData.area)}</Typography>
                        </DetailRow>
                        <DetailRow label="On the diagram">
                            {equipment.length === 0 ? (
                                <Typography variant="body2" color="text.secondary">
                                    No equipment drawn
                                </Typography>
                            ) : (
                                <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                                    {equipment.map((item) => (
                                        <Chip key={item.kind} size="small" variant="outlined" label={equipmentCountLabel(item)} />
                                    ))}
                                </Stack>
                            )}
                        </DetailRow>
                        {extras}
                    </Stack>
                </Paper>
            </Box>
        </Box>
    );
}

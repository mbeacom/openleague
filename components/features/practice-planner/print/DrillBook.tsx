"use client";

/**
 * The drill book: the library's drills as a printable booklet. On screen, the
 * coach names the book and picks drills (all by default); the page below is
 * what prints: a cover with the contents, then one drill per page with its
 * tags, equipment, numbered diagram, legend, sequence and description.
 * Nothing auto-prints: Print stays disabled until every chosen diagram is
 * drawn. Shared by the hosted app and the static planner through the store
 * seam; no server or Next imports.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Box, Button, Checkbox, FormControlLabel, Stack, TextField, Typography } from "@mui/material";
import { ArrowBack as ArrowBackIcon, PrintOutlined as PrintIcon } from "@mui/icons-material";
import { usePlannerPlatform, usePlannerStore, type LibraryPlay, type LibraryPlaySummary } from "@/lib/planner-store";
import {
    DRILL_BOOK_DEFAULT_TITLE,
    DRILL_BOOK_MAX_DRILLS,
    DRILL_BOOK_TITLE_MAX,
    drillSequenceLines,
    drillTagLine,
    loadDrillBookPlays,
    loadDrillBookSummaries,
} from "@/lib/utils/drill-book";
import { drillEquipment, drillEquipmentText } from "@/lib/utils/equipment-needs";
import { PrintDiagram, printPixelRatio } from "./PrintDiagram";
import { LegendList } from "./LegendList";
import { PREPARING_PRINT } from "./BenchSheet";

export const DRILL_BOOK_EMPTY_LIBRARY = "Your library has no drills yet.";
export const DRILL_BOOK_NONE_CHOSEN = "Choose at least one drill to print.";
export const DRILL_BOOK_LOAD_ERROR = "The library couldn't be loaded. Reload the page to try again.";
export const DRILL_UNAVAILABLE = "This drill couldn't be loaded.";

type Summaries = { kind: "loading" } | { kind: "error" } | { kind: "ready"; plays: LibraryPlaySummary[] };

function BookDrill({ number, play, pixelRatio, onReady }: { number: number; play: LibraryPlay; pixelRatio: number; onReady: () => void }) {
    const equipment = drillEquipmentText(drillEquipment(play.playData));
    const sequence = drillSequenceLines(play.playData);
    const description = play.description?.trim();
    return (
        <Box component="article" aria-label={`Drill ${number}: ${play.name}`} className="drill-book-page bench-drill" sx={{ mt: 4 }}>
            <Typography variant="h5" component="h2" sx={{ fontWeight: 800 }}>
                {`${number}. ${play.name}`}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>
                {drillTagLine(play)}
            </Typography>
            {equipment && (
                <Typography variant="body2" sx={{ mb: 1 }}>
                    {equipment}
                </Typography>
            )}
            <PrintDiagram playData={play.playData} name={play.name} pixelRatio={pixelRatio} onReady={onReady} />
            <LegendList playData={play.playData} />
            {sequence.length > 0 && (
                <Box component="section" aria-label="Sequence" sx={{ mt: 2 }}>
                    <Typography variant="subtitle2" component="h3" sx={{ fontWeight: 800 }}>
                        Sequence
                    </Typography>
                    {sequence.map((line) => (
                        <Typography key={line} variant="body2">
                            {line}
                        </Typography>
                    ))}
                </Box>
            )}
            {description && (
                <Typography variant="body2" sx={{ mt: 2, whiteSpace: "pre-wrap" }}>
                    {description}
                </Typography>
            )}
        </Box>
    );
}

export function DrillBook({ teamId }: { teamId: string }) {
    const store = usePlannerStore();
    const { Link, routes } = usePlannerPlatform();
    const [summaries, setSummaries] = useState<Summaries>({ kind: "loading" });
    const [title, setTitle] = useState(DRILL_BOOK_DEFAULT_TITLE);
    /** Drills left out; everything else prints, so a drill added elsewhere is in by default. */
    const [excluded, setExcluded] = useState<ReadonlySet<string>>(() => new Set());
    const [plays, setPlays] = useState<ReadonlyMap<string, LibraryPlay | null>>(() => new Map());
    const requested = useRef(new Set<string>());

    useEffect(() => {
        let live = true;
        loadDrillBookSummaries(store, teamId)
            .then((plays) => live && setSummaries(plays ? { kind: "ready", plays } : { kind: "error" }))
            .catch(() => live && setSummaries({ kind: "error" }));
        return () => {
            live = false;
        };
    }, [store, teamId]);

    const chosen = useMemo(
        () => (summaries.kind === "ready" ? summaries.plays.filter((p) => !excluded.has(p.id)) : []),
        [summaries, excluded]
    );

    // Load each chosen drill's diagram once; a drill left out and put back is not loaded again.
    useEffect(() => {
        const missing = chosen.map((p) => p.id).filter((id) => !requested.current.has(id));
        if (missing.length === 0) return;
        missing.forEach((id) => requested.current.add(id));
        let live = true;
        void loadDrillBookPlays(store, teamId, missing).then((entries) => {
            if (!live) {
                entries.forEach((e) => requested.current.delete(e.id));
                return;
            }
            setPlays((prev) => {
                const next = new Map(prev);
                entries.forEach((e) => next.set(e.id, e.play));
                return next;
            });
        });
        return () => {
            live = false;
        };
    }, [chosen, store, teamId]);

    const [ready, setReady] = useState<ReadonlySet<string>>(() => new Set());
    const markReady = useCallback((id: string) => setReady((prev) => (prev.has(id) ? prev : new Set(prev).add(id))), []);

    const readable = chosen.filter((p) => plays.get(p.id));
    const pixelRatio = printPixelRatio(readable.length);
    const allLoaded = chosen.every((p) => plays.has(p.id));
    const allReady = chosen.length > 0 && allLoaded && readable.every((p) => ready.has(p.id));
    const bookTitle = title.trim() || DRILL_BOOK_DEFAULT_TITLE;

    const toggle = (id: string) =>
        setExcluded((prev) => {
            const next = new Set(prev);
            if (!next.delete(id)) next.add(id);
            return next;
        });

    return (
        <Box className="drill-book" sx={{ maxWidth: 820, mx: "auto", p: { xs: 2, sm: 4 }, bgcolor: "#fff", color: "#000" }}>
            <Box className="no-print" sx={{ mb: 4 }}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
                    <Button
                        variant="contained"
                        startIcon={<PrintIcon />}
                        onClick={() => window.print()}
                        disabled={!allReady}
                        aria-busy={(chosen.length > 0 && !allReady) || undefined}
                    >
                        Print
                    </Button>
                    <Button component={Link} href={routes.library()} variant="outlined" startIcon={<ArrowBackIcon />}>
                        Back to library
                    </Button>
                    {chosen.length > 0 && !allReady && (
                        <Typography variant="body2" role="status" sx={{ color: "text.secondary" }}>
                            {PREPARING_PRINT}
                        </Typography>
                    )}
                </Stack>

                {summaries.kind === "loading" && <Typography role="status">Loading your library…</Typography>}
                {summaries.kind === "error" && <Alert severity="error">{DRILL_BOOK_LOAD_ERROR}</Alert>}
                {summaries.kind === "ready" && summaries.plays.length === 0 && <Alert severity="info">{DRILL_BOOK_EMPTY_LIBRARY}</Alert>}
                {summaries.kind === "ready" && summaries.plays.length > 0 && (
                    <Stack spacing={2}>
                        <TextField
                            label="Book title"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            slotProps={{ htmlInput: { maxLength: DRILL_BOOK_TITLE_MAX } }}
                            sx={{ maxWidth: 480 }}
                        />
                        <Box component="fieldset" sx={{ border: 0, m: 0, p: 0 }}>
                            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                                <Typography component="legend" variant="subtitle1" sx={{ fontWeight: 800, mr: 1 }}>
                                    {`Drills (${chosen.length} of ${summaries.plays.length})`}
                                </Typography>
                                <Button size="small" onClick={() => setExcluded(new Set())} disabled={excluded.size === 0} sx={{ minHeight: 44 }}>
                                    Choose all
                                </Button>
                                <Button
                                    size="small"
                                    onClick={() => setExcluded(new Set(summaries.plays.map((p) => p.id)))}
                                    disabled={chosen.length === 0}
                                    sx={{ minHeight: 44 }}
                                >
                                    Clear
                                </Button>
                            </Stack>
                            {summaries.plays.length >= DRILL_BOOK_MAX_DRILLS && (
                                <Typography variant="body2" color="text.secondary">
                                    {`The book offers your ${DRILL_BOOK_MAX_DRILLS} newest drills.`}
                                </Typography>
                            )}
                            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, columnGap: 2 }}>
                                {summaries.plays.map((p) => (
                                    <FormControlLabel
                                        key={p.id}
                                        control={<Checkbox checked={!excluded.has(p.id)} onChange={() => toggle(p.id)} />}
                                        label={p.name}
                                        sx={{ minHeight: 44, mr: 0 }}
                                    />
                                ))}
                            </Box>
                        </Box>
                        {chosen.length === 0 && <Alert severity="info">{DRILL_BOOK_NONE_CHOSEN}</Alert>}
                    </Stack>
                )}
            </Box>

            {chosen.length > 0 && (
                <Box component="section" aria-label="Book">
                    <Box component="header" className="drill-book-cover" sx={{ pb: 1, borderBottom: "3px solid", borderColor: "primary.main" }}>
                        <Typography variant="h3" component="h1" sx={{ fontWeight: 800, color: "primary.main" }}>
                            {bookTitle}
                        </Typography>
                        <Typography variant="subtitle1">{`${chosen.length} ${chosen.length === 1 ? "drill" : "drills"}`}</Typography>
                    </Box>
                    <Box component="ol" aria-label="Contents" sx={{ mt: 2, pl: 3, columns: { sm: 2 }, columnGap: 4 }}>
                        {chosen.map((p) => (
                            <Typography key={p.id} component="li" variant="body2" sx={{ breakInside: "avoid" }}>
                                {p.name}
                            </Typography>
                        ))}
                    </Box>
                    {chosen.map((summary, i) => {
                        const play = plays.get(summary.id);
                        if (play === undefined) return null;
                        if (play === null) {
                            return (
                                <Box key={summary.id} component="article" className="drill-book-page" sx={{ mt: 4 }}>
                                    <Typography variant="h5" component="h2" sx={{ fontWeight: 800 }}>
                                        {`${i + 1}. ${summary.name}`}
                                    </Typography>
                                    <Typography variant="body2">{DRILL_UNAVAILABLE}</Typography>
                                </Box>
                            );
                        }
                        return <BookDrill key={summary.id} number={i + 1} play={play} pixelRatio={pixelRatio} onReady={() => markReady(summary.id)} />;
                    })}
                </Box>
            )}
        </Box>
    );
}

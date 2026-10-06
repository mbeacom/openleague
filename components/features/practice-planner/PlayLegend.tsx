"use client";

/** Collapsible legend listing only the notation a drill actually uses. */
import React, { useEffect, useRef } from "react";
import { Accordion, AccordionDetails, AccordionSummary, Box, Chip, Stack, Typography } from "@mui/material";
import { ExpandMore as ExpandMoreIcon } from "@mui/icons-material";
import type { PlayData } from "@/types/practice-planner";
import { buildLegend, type LegendEntry } from "@/lib/utils/canvas/legend";
import { LEGEND_SWATCH_SIZE, paintLegendSwatch } from "@/lib/utils/canvas/legend-swatch";
import { backingPixelRatio, sizeBackingStore } from "@/lib/utils/canvas/backing-store";
import { iceAreaLabel } from "@/lib/utils/canvas/notation";
import { isFullIce } from "@/lib/utils/ice-area";

/** One symbol's sample, drawn on a small canvas. Exported for the bench sheet's LegendList (3b). */
export function LegendSwatch({ entry }: { entry: LegendEntry }) {
    const ref = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const canvas = ref.current;
        if (!canvas) return;
        // At the screen's ratio, so it is sharp on screen and in print (browsers print a canvas at its backing size).
        const ratio = backingPixelRatio();
        sizeBackingStore(canvas, LEGEND_SWATCH_SIZE.width, LEGEND_SWATCH_SIZE.height, ratio);
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        paintLegendSwatch(ctx, entry);
    }, [entry]);
    return (
        <canvas
            ref={ref}
            width={LEGEND_SWATCH_SIZE.width}
            height={LEGEND_SWATCH_SIZE.height}
            aria-hidden="true"
            style={{ width: LEGEND_SWATCH_SIZE.width, height: LEGEND_SWATCH_SIZE.height }}
        />
    );
}

export function PlayLegend({ playData, defaultExpanded = false }: { playData: PlayData | null; defaultExpanded?: boolean }) {
    if (!playData) return null;
    const entries = buildLegend(playData);
    const showArea = !isFullIce(playData.area);
    if (entries.length === 0 && !showArea) return null;
    return (
        <Stack spacing={1}>
            {/* Outside the accordion so the area shows while the legend is collapsed */}
            {showArea && (
                <Box>
                    <Chip size="small" color="primary" variant="outlined" label={iceAreaLabel(playData.area)} />
                </Box>
            )}
            {entries.length > 0 && (
                <Accordion defaultExpanded={defaultExpanded} disableGutters elevation={0} sx={{ border: 1, borderColor: "divider" }}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>{`Legend (${entries.length})`}</Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                        <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 1 }}>
                            {entries.map((entry) => (
                                <Box component="li" key={entry.key} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                    <LegendSwatch entry={entry} />
                                    <Typography variant="body2">{entry.label}</Typography>
                                </Box>
                            ))}
                        </Box>
                    </AccordionDetails>
                </Accordion>
            )}
        </Stack>
    );
}

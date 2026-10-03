"use client";

/** Collapsible legend listing only the notation a drill actually uses. */
import React, { useEffect, useRef } from "react";
import { Accordion, AccordionDetails, AccordionSummary, Box, Chip, Stack, Typography } from "@mui/material";
import { ExpandMore as ExpandMoreIcon } from "@mui/icons-material";
import type { PlayData, StrokeAction } from "@/types/practice-planner";
import { buildLegend, type LegendEntry } from "@/lib/utils/canvas/legend";
import { buildStrokeGeometry } from "@/lib/utils/canvas/stroke-geometry";
import { paintStrokeGeometry } from "@/lib/utils/canvas/drawing-utils";
import { drawEquipmentGlyph, drawPlayerGlyph } from "@/lib/utils/canvas/glyphs";
import { BOARD_COLORS, ROLE_DEFAULT_COLORS, iceAreaLabel } from "@/lib/utils/canvas/notation";
import { isFullIce } from "@/lib/utils/ice-area";

const W = 40;
const H = 20;
// Swatches are drawn in raw canvas px; a small pxPerFt makes the patterns' px minimums bind.
const SWATCH_PX_PER_FT = 0.5;

/** One symbol's sample, drawn on a small canvas. Exported for the bench sheet's LegendList (3b). */
export function LegendSwatch({ entry }: { entry: LegendEntry }) {
    const ref = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const ctx = ref.current?.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, W, H);
        const center = { x: W / 2, y: H / 2 };
        const strokeSwatch = (action: StrokeAction, end: "arrow" | "stop") => {
            const geometry = buildStrokeGeometry(
                { action, path: "straight", end, points: [{ x: 4, y: H / 2 }, { x: W - 6, y: H / 2 }], strokeWidth: 2 },
                SWATCH_PX_PER_FT
            );
            paintStrokeGeometry(ctx, geometry, BOARD_COLORS.ink, SWATCH_PX_PER_FT);
        };
        switch (entry.type) {
            case "action":
                strokeSwatch(entry.action, "arrow");
                break;
            case "end":
                strokeSwatch("skate", "stop");
                break;
            case "role":
                drawPlayerGlyph(ctx, { id: "", role: entry.role, label: "", color: ROLE_DEFAULT_COLORS[entry.role], position: { x: 0, y: 0 } }, center, 8, false);
                break;
            case "equipment":
                drawEquipmentGlyph(ctx, { kind: entry.kind, rotation: 0 }, center, 8, false);
                break;
        }
    }, [entry]);
    return <canvas ref={ref} width={W} height={H} aria-hidden="true" />;
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

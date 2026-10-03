"use client";

/**
 * The bench sheet's one legend (3b): every symbol any readable drill uses,
 * listed once with no toggle. Pass it combinedLegendData over all the
 * session's drills; buildLegend's Sets remove duplicates.
 */
import { Box, Typography } from "@mui/material";
import type { PlayData } from "@/types/practice-planner";
import { buildLegend } from "@/lib/utils/canvas/legend";
import { LegendSwatch } from "../PlayLegend";

export function LegendList({ playData }: { playData: PlayData | null }) {
    if (!playData) return null;
    const entries = buildLegend(playData);
    if (entries.length === 0) return null;
    return (
        <Box component="section" aria-label="Legend" className="bench-legend" sx={{ mt: 3 }}>
            <Typography variant="subtitle2" component="h2" sx={{ fontWeight: 800, mb: 1 }}>
                Legend
            </Typography>
            <Box
                component="ul"
                sx={{ listStyle: "none", m: 0, p: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 1 }}
            >
                {entries.map((entry) => (
                    <Box component="li" key={entry.key} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <LegendSwatch entry={entry} />
                        <Typography variant="body2">{entry.label}</Typography>
                    </Box>
                ))}
            </Box>
        </Box>
    );
}

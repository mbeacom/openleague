"use client";

/** One drill on the bench sheet (3b). print.css keeps it on one page and breaks after every second drill. */
import { Box, Stack, Typography } from "@mui/material";
import type { PlayData } from "@/types/practice-planner";
import { PrintDiagram } from "./PrintDiagram";

/** "Station 2 of 3": a grouped drill's place in its block. */
export function stationTag(position: number, count: number): string {
    return `Station ${position} of ${count}`;
}

/** The drill's instructions, else its description, else nothing. Whitespace-only text counts as none. */
export function drillText(instructions: string | null, description: string | null): string | null {
    return instructions?.trim() || description?.trim() || null;
}

export interface BenchSheetDrillProps {
    /** 1-based position in sequence order */
    number: number;
    name: string;
    /** The block's start, already formatted ("6:00 PM EDT") */
    startLabel: string;
    /** The drill's own minutes */
    minutes: number;
    /** Set when the drill runs in a station block */
    station: { position: number; count: number } | null;
    playData: PlayData | null;
    /** drillText(instructions, description) */
    text: string | null;
    /** This drill ends a printed page (every second drill, never the last) */
    breakAfter: boolean;
}

export function BenchSheetDrill({ number, name, startLabel, minutes, station, playData, text, breakAfter }: BenchSheetDrillProps) {
    return (
        <Box
            component="article"
            aria-label={`Drill ${number}: ${name}`}
            className={breakAfter ? "bench-drill bench-drill--page-end" : "bench-drill"}
            sx={{ mb: 3 }}
        >
            <Stack direction="row" alignItems="baseline" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
                <Typography variant="h6" component="h2" sx={{ fontWeight: 800 }}>
                    {`${number}. ${name}`}
                </Typography>
                <Typography variant="body2">{`${startLabel} · ${minutes} min`}</Typography>
                {station && (
                    <Typography variant="body2" sx={{ fontWeight: 700, border: "1px solid #000", px: 0.75 }}>
                        {stationTag(station.position, station.count)}
                    </Typography>
                )}
            </Stack>
            <PrintDiagram playData={playData} name={name} />
            {text && (
                <Typography variant="body2" className="bench-drill-text" sx={{ mt: 1, whiteSpace: "pre-wrap" }}>
                    {text}
                </Typography>
            )}
        </Box>
    );
}

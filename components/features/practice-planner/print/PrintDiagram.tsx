"use client";

/**
 * A drill's diagram on the bench sheet (3b): drawn once into a PNG at 720×306
 * logical px with a 3× backing store, and shown as an <img>, which browsers
 * print more reliably than a live canvas. It is computed in a memo after
 * mount: there is no canvas on the server, and a memo avoids a setState in an
 * effect.
 */
import { useMemo } from "react";
import { Box, Typography } from "@mui/material";
import type { PlayData } from "@/types/practice-planner";
import { generateThumbnail } from "@/lib/utils/canvas/thumbnail-generator";
import { useMounted } from "@/lib/hooks/useClockText";

export const PRINT_DIAGRAM_SIZE = { width: 720, height: 306, pixelRatio: 3 } as const;
export const DIAGRAM_UNAVAILABLE = "Diagram unavailable";

type Diagram = { src: string } | { failed: true };

function renderDiagram(playData: PlayData, name: string): Diagram {
    try {
        return { src: generateThumbnail(playData, { ...PRINT_DIAGRAM_SIZE }) };
    } catch (error) {
        console.warn(`Bench sheet: couldn't render the diagram for "${name}":`, error);
        return { failed: true };
    }
}

function DiagramBox({ text, busy = false }: { text: string; busy?: boolean }) {
    return (
        <Box
            aria-busy={busy || undefined}
            sx={{
                width: "100%",
                aspectRatio: `${PRINT_DIAGRAM_SIZE.width} / ${PRINT_DIAGRAM_SIZE.height}`,
                border: "1px dashed #999",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
            }}
        >
            <Typography variant="body2" sx={{ color: "#555" }}>
                {text}
            </Typography>
        </Box>
    );
}

export function PrintDiagram({ playData, name }: { playData: PlayData | null; name: string }) {
    const mounted = useMounted();
    const diagram = useMemo(
        () => (mounted && playData ? renderDiagram(playData, name) : null),
        [mounted, playData, name]
    );

    if (!playData || (diagram && "failed" in diagram)) return <DiagramBox text={DIAGRAM_UNAVAILABLE} />;
    if (!diagram) return <DiagramBox text="Rendering diagram…" busy />;
    return (
        // A data URL printed as-is: next/image would lazy-load it and could miss the printout.
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={diagram.src}
            alt={`Diagram: ${name}`}
            loading="eager"
            className="bench-diagram"
            width={PRINT_DIAGRAM_SIZE.width}
            height={PRINT_DIAGRAM_SIZE.height}
            style={{ width: "100%", height: "auto", display: "block" }}
        />
    );
}

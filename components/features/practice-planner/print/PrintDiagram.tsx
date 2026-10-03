"use client";

/**
 * A drill's diagram on the bench sheet (3b): drawn once into a PNG at 720×306
 * logical px, and shown as an <img>, which browsers print more reliably than a
 * live canvas. The backing store is 3× by default; BenchSheet lowers it for
 * long sessions (printPixelRatio) to bound decoded-image memory. It is
 * computed in a memo after mount: there is no canvas on the server, and a memo
 * avoids a setState in an effect. onReady fires once: when the image loads,
 * or when there is no diagram to wait for (unreadable, failed to render, or an
 * image that fails to decode, which then shows the unavailable box).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Typography } from "@mui/material";
import type { PlayData } from "@/types/practice-planner";
import { generateThumbnail } from "@/lib/utils/canvas/thumbnail-generator";
import { useMounted } from "@/lib/hooks/useClockText";

export const PRINT_DIAGRAM_SIZE = { width: 720, height: 306, pixelRatio: 3 } as const;
export const DIAGRAM_UNAVAILABLE = "Diagram unavailable";

/**
 * Backing-store scale for a sheet with this many readable diagrams. Each 3×
 * diagram decodes to ~7.6 MiB, so big sessions trade sharpness for memory.
 */
export function printPixelRatio(readableCount: number): number {
    if (readableCount <= 12) return 3;
    if (readableCount <= 40) return 2;
    return 1;
}

type Diagram = { src: string } | { failed: true };

function renderDiagram(playData: PlayData, name: string, pixelRatio: number): Diagram {
    try {
        return { src: generateThumbnail(playData, { ...PRINT_DIAGRAM_SIZE, pixelRatio }) };
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

export interface PrintDiagramProps {
    playData: PlayData | null;
    name: string;
    /** Backing-store scale; defaults to PRINT_DIAGRAM_SIZE.pixelRatio */
    pixelRatio?: number;
    /** Called once, when the diagram is ready to print or there is none to wait for */
    onReady?: () => void;
}

export function PrintDiagram({ playData, name, pixelRatio = PRINT_DIAGRAM_SIZE.pixelRatio, onReady }: PrintDiagramProps) {
    const mounted = useMounted();
    const diagram = useMemo(
        () => (mounted && playData ? renderDiagram(playData, name, pixelRatio) : null),
        [mounted, playData, name, pixelRatio]
    );
    // The src whose <img> failed to decode (e.g. toDataURL gave "data:" under memory pressure).
    const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
    const reported = useRef(false);
    const report = () => {
        if (reported.current) return;
        reported.current = true;
        onReady?.();
    };
    const unavailable =
        !playData || (diagram !== null && ("failed" in diagram || diagram.src === brokenSrc));

    useEffect(() => {
        if (!unavailable || reported.current) return;
        reported.current = true;
        onReady?.();
    }, [unavailable, onReady]);

    if (unavailable) return <DiagramBox text={DIAGRAM_UNAVAILABLE} />;
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
            onLoad={report}
            onError={() => {
                console.warn(`Bench sheet: the diagram image for "${name}" failed to load.`);
                setBrokenSrc(diagram.src);
                report();
            }}
        />
    );
}

"use client";

/**
 * A drill's diagram drawn live at its displayed size × the screen's pixel ratio
 * (rink diagram quality spec §1), for surfaces that already hold the play
 * data; a stored PNG would be upscaled there. Same scene as a thumbnail.
 */
import { useEffect, useRef, useState } from "react";
import { Box, type SxProps, type Theme } from "@mui/material";
import type { PlayData } from "@/types/practice-planner";
import { THUMBNAIL_ASPECT, THUMBNAIL_DIMENSIONS, drawThumbnailScene } from "@/lib/utils/canvas/thumbnail-generator";
import { backingPixelRatio, sizeBackingStore, watchPixelRatio } from "@/lib/utils/canvas/backing-store";

export interface PlayDiagramProps {
    playData: PlayData;
    /** The drill's name; the canvas is announced as "<label> diagram". */
    label: string;
    /** Hidden from assistive tech: for cards that already name the drill next to it. */
    decorative?: boolean;
    sx?: SxProps<Theme>;
}

export function PlayDiagram({ playData, label, decorative = false, sx }: PlayDiagramProps) {
    const boxRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [size, setSize] = useState({ width: 0, height: 0 });
    // Never rendered into markup, so reading it on the first client render can't mismatch hydration.
    const [ratio, setRatio] = useState(backingPixelRatio);
    useEffect(() => watchPixelRatio(() => setRatio(backingPixelRatio())), []);

    useEffect(() => {
        const box = boxRef.current;
        if (!box) return;
        const observer = new ResizeObserver((entries) => {
            const rect = entries[0]?.contentRect;
            if (rect) setSize({ width: Math.round(rect.width), height: Math.round(rect.height) });
        });
        observer.observe(box);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        // A hidden or collapsed container measures 0: wait until it has a size.
        if (!canvas || size.width === 0 || size.height === 0) return;
        sizeBackingStore(canvas, size.width, size.height, ratio);
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        // Drawn in the stored thumbnail's 300 px-wide space and scaled to the box, so a live
        // diagram has the stored image's proportions (the renderer's minimum glyph and arrow
        // sizes are in drawing px); only the sharpness changes. Phase 2 moves sizes into feet.
        const scale = size.width / THUMBNAIL_DIMENSIONS.width;
        ctx.setTransform(ratio * scale, 0, 0, ratio * scale, 0, 0);
        try {
            drawThumbnailScene(ctx, playData, THUMBNAIL_DIMENSIONS.width, size.height / scale, { cachedRink: false });
        } catch (error) {
            console.warn(`Couldn't draw the diagram for "${label}":`, error);
        }
    }, [playData, label, size, ratio]);

    return (
        <Box ref={boxRef} sx={[{ width: "100%", aspectRatio: `${THUMBNAIL_ASPECT}`, maxWidth: "100%" }, ...(Array.isArray(sx) ? sx : [sx])]}>
            <canvas
                ref={canvasRef}
                {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": `${label} diagram` })}
                style={{ display: "block", width: "100%", height: "100%" }}
            />
        </Box>
    );
}

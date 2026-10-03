"use client";

/**
 * Station map (practice planner 2b): every station of a block on one rink,
 * each clipped to its own area, the active one highlighted, and one legend
 * combining the stations' symbols.
 */

import { useEffect, useRef } from "react";
import { Stack } from "@mui/material";
import { createTransformContext } from "@/lib/utils/canvas/rink-renderer";
import {
    combinedLegendData,
    drawStationMap,
    stationLabel,
    type StationMapStation,
} from "@/lib/utils/canvas/station-map";
import { PlayLegend } from "./PlayLegend";

// Intrinsic (logical) canvas size; CSS scales it to the container's width.
const MAP_WIDTH = 960;
const MAP_HEIGHT = 420;
const MAP_PADDING = 12;
const MAX_PIXEL_RATIO = 3;

/** The display's devicePixelRatio, clamped to [1, 3] so the backing store stays bounded. */
function backingPixelRatio(): number {
    const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio;
    return Number.isFinite(dpr) ? Math.min(MAX_PIXEL_RATIO, Math.max(1, dpr)) : 1;
}

export interface StationMapProps {
    stations: StationMapStation[];
    /** Index into `stations` of the drill being viewed. */
    activeIndex: number;
}

export function StationMap({ stations, activeIndex }: StationMapProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        // Sized here rather than in render so SSR and hydration agree; the JSX width and
        // height keep the logical size (and aspect ratio) and React doesn't reapply them.
        // drawStationMap draws the rink as vectors (no cached bitmap), so it stays crisp.
        const ratio = backingPixelRatio();
        canvas.width = MAP_WIDTH * ratio;
        canvas.height = MAP_HEIGHT * ratio;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.clearRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
        drawStationMap(ctx, createTransformContext(MAP_WIDTH, MAP_HEIGHT, MAP_PADDING), stations, activeIndex);
    }, [stations, activeIndex]);

    if (stations.length === 0) return null;

    const description = stations
        .map((station, index) => `${stationLabel(index + 1, station.name)}${index === activeIndex ? " (current)" : ""}`)
        .join(", ");

    return (
        <Stack spacing={1}>
            <canvas
                ref={canvasRef}
                width={MAP_WIDTH}
                height={MAP_HEIGHT}
                role="img"
                aria-label={`Station map: ${description}`}
                style={{ width: "100%", height: "auto", display: "block" }}
            />
            <PlayLegend playData={combinedLegendData(stations)} />
        </Stack>
    );
}

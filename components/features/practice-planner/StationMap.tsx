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

// Intrinsic canvas size; CSS scales it to the container's width.
const MAP_WIDTH = 960;
const MAP_HEIGHT = 420;
const MAP_PADDING = 12;

export interface StationMapProps {
    stations: StationMapStation[];
    /** Index into `stations` of the drill being viewed. */
    activeIndex: number;
}

export function StationMap({ stations, activeIndex }: StationMapProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const ctx = canvasRef.current?.getContext("2d");
        if (!ctx) return;
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

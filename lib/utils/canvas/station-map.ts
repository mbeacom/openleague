/**
 * Station map (practice planner 2b): one rink with each station's drawing
 * clipped to its own ice area, outlined, and labelled "1 · Drill name". Uses
 * drawBoardScene's pieces (drawRink, drawAllElements) rather than
 * drawBoardScene itself, which draws every element unclipped and adds a mask.
 * Pure canvas calls, so it is tested with a recording context; StationMap.tsx
 * hosts it.
 */
import type { PlayData } from "@/types/practice-planner";
import { areaRect } from "@/lib/utils/ice-area";
import { PLAY_DATA_UNREADABLE_MESSAGE } from "@/lib/utils/play-data";
import { drawRink, rinkToCanvas, type TransformContext } from "./rink-renderer";
import { drawAllElements } from "./drawing-utils";
import { BOARD_COLORS } from "./notation";

export interface StationMapStation {
    /** The drill's name, shown in the station's label. */
    name: string;
    /** null = the drill's stored data couldn't be read: outlined over the whole rink and labelled, nothing drawn. */
    playData: PlayData | null;
}

const LABEL_FONT = "700 14px sans-serif";
const MESSAGE_FONT = "400 12px sans-serif";
const LABEL_INSET_PX = 6;
const LABEL_LINE_PX = 18;
const LABEL_BACKING = "rgba(255, 255, 255, 0.85)";
const OUTLINE_PX = 2;
const ACTIVE_OUTLINE_PX = 4;
const OUTLINE_DASH = [8, 6];

/** "1 · Breakout": a station's number in its block, then its drill's name. */
export function stationLabel(position: number, name: string): string {
    return `${position} · ${name}`;
}

function drawLabelLine(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, font: string, color: string): void {
    ctx.font = font;
    const width = ctx.measureText(text).width;
    ctx.fillStyle = LABEL_BACKING;
    ctx.fillRect(x - 2, y - 2, width + 4, LABEL_LINE_PX);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
}

/**
 * Draws the whole rink, then each station: its elements clipped to its area,
 * a dashed outline (solid and thicker for the active station), and its label.
 * Labels of stations that share a top-left corner stack instead of overlapping.
 */
export function drawStationMap(
    ctx: CanvasRenderingContext2D,
    transform: TransformContext,
    stations: StationMapStation[],
    activeIndex: number,
): void {
    drawRink(ctx, transform, { cache: false });
    const labelOffsets = new Map<string, number>();

    const outline = (topLeft: { x: number; y: number }, width: number, height: number, active: boolean) => {
        ctx.save();
        ctx.strokeStyle = active ? BOARD_COLORS.actionBlue : BOARD_COLORS.ink;
        ctx.lineWidth = active ? ACTIVE_OUTLINE_PX : OUTLINE_PX;
        ctx.setLineDash(active ? [] : OUTLINE_DASH);
        ctx.strokeRect(topLeft.x, topLeft.y, width, height);
        ctx.restore();
    };
    const geometry: { topLeft: { x: number; y: number }; width: number; height: number }[] = [];

    stations.forEach((station, i) => {
        const rect = areaRect(station.playData?.area);
        const topLeft = rinkToCanvas({ x: rect.x, y: rect.y }, transform);
        const bottomRight = rinkToCanvas({ x: rect.x + rect.w, y: rect.y + rect.h }, transform);
        const width = bottomRight.x - topLeft.x;
        const height = bottomRight.y - topLeft.y;
        geometry.push({ topLeft, width, height });

        ctx.save();
        ctx.beginPath();
        ctx.rect(topLeft.x, topLeft.y, width, height);
        ctx.clip();
        if (station.playData) drawAllElements(ctx, station.playData, transform);
        ctx.restore();

        const active = i === activeIndex;
        const color = active ? BOARD_COLORS.actionBlue : BOARD_COLORS.ink;
        const corner = `${rect.x},${rect.y}`;
        const offset = labelOffsets.get(corner) ?? 0;
        labelOffsets.set(corner, offset + (station.playData ? 1 : 2) * LABEL_LINE_PX);
        const textX = topLeft.x + LABEL_INSET_PX;
        const textY = topLeft.y + LABEL_INSET_PX + offset;

        // Labels are clipped to the station's area so long names can't spill into neighbours.
        ctx.save();
        ctx.beginPath();
        ctx.rect(topLeft.x, topLeft.y, width, height);
        ctx.clip();
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        drawLabelLine(ctx, stationLabel(i + 1, station.name), textX, textY, LABEL_FONT, color);
        if (!station.playData) {
            drawLabelLine(ctx, PLAY_DATA_UNREADABLE_MESSAGE, textX, textY + LABEL_LINE_PX, MESSAGE_FONT, color);
        }
        ctx.restore();

        if (!active) outline(topLeft, width, height, false);
    });

    // Second pass: the active outline goes last so neighbouring outlines can't paint over it.
    const current = geometry[activeIndex];
    if (current) outline(current.topLeft, current.width, current.height, true);
}

/** One PlayData holding every readable station's symbols, for a single legend; null when none can be read. */
export function combinedLegendData(stations: StationMapStation[]): PlayData | null {
    const readable = stations.flatMap((station) => (station.playData ? [station.playData] : []));
    if (readable.length === 0) return null;
    return {
        version: readable[0].version,
        players: readable.flatMap((data) => data.players),
        drawings: readable.flatMap((data) => data.drawings),
        equipment: readable.flatMap((data) => data.equipment),
        annotations: readable.flatMap((data) => data.annotations),
    };
}

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
import { THUMBNAIL_MIN_GLYPH_RADIUS_PX } from "./glyph-metrics";
import { BOARD_COLORS } from "./notation";
import { DIAGRAM_THEME } from "./diagram-theme";
import { diagramFont } from "./diagram-fonts";

export interface StationMapStation {
    /** The drill's name, shown in the station's label. */
    name: string;
    /** null = the drill's stored data couldn't be read: outlined over the whole rink and labelled, nothing drawn. */
    playData: PlayData | null;
}

const LABEL_FONT = diagramFont(800, 14);
const MESSAGE_FONT = diagramFont(600, 12);
const LABEL_INSET_PX = 6;
const LABEL_LINE_PX = 18;
const LABEL_BACKING = DIAGRAM_THEME.stationLabelBacking;
const OUTLINE_PX = 2;
const ACTIVE_OUTLINE_PX = 4;
const OUTLINE_DASH = [8, 6];

/** "1 · Breakout": a station's number in its block, then its drill's name. */
export function stationLabel(position: number, name: string): string {
    return `${position} · ${name}`;
}

interface Box {
    x: number;
    y: number;
    w: number;
    h: number;
}

const boxesOverlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Where a station's label block goes: its area's top-left corner, stepped
 * down a line at a time while it overlaps a label already placed (stations
 * sharing or nearly sharing a corner). It stops at the area's bottom edge;
 * the label is clipped to its area either way.
 */
function placeLabel(box: Box, placed: Box[], areaBottom: number): Box {
    const next = { ...box };
    while (placed.some((other) => boxesOverlap(next, other)) && next.y + LABEL_LINE_PX < areaBottom) {
        next.y += LABEL_LINE_PX;
    }
    return next;
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
 * Labels that would overlap an earlier station's label stack below it instead.
 */
export function drawStationMap(
    ctx: CanvasRenderingContext2D,
    transform: TransformContext,
    stations: StationMapStation[],
    activeIndex: number,
): void {
    drawRink(ctx, transform, { cache: false });
    const placedLabels: Box[] = [];

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
        // Nobody edits the station map: markers at real size, like a thumbnail (scale model).
        if (station.playData) drawAllElements(ctx, station.playData, transform, undefined, 1, THUMBNAIL_MIN_GLYPH_RADIUS_PX);
        ctx.restore();

        const active = i === activeIndex;
        const color = active ? BOARD_COLORS.actionBlue : BOARD_COLORS.ink;
        const label = stationLabel(i + 1, station.name);
        ctx.font = LABEL_FONT;
        let labelWidth = ctx.measureText(label).width;
        if (!station.playData) {
            ctx.font = MESSAGE_FONT;
            labelWidth = Math.max(labelWidth, ctx.measureText(PLAY_DATA_UNREADABLE_MESSAGE).width);
        }
        // The box matches drawLabelLine's backing rects: 2px of padding round the text.
        const box = placeLabel(
            {
                x: topLeft.x + LABEL_INSET_PX - 2,
                y: topLeft.y + LABEL_INSET_PX - 2,
                w: labelWidth + 4,
                h: (station.playData ? 1 : 2) * LABEL_LINE_PX,
            },
            placedLabels,
            topLeft.y + height,
        );
        placedLabels.push(box);
        const textX = box.x + 2;
        const textY = box.y + 2;

        // Labels are clipped to the station's area so long names can't spill into neighbours.
        ctx.save();
        ctx.beginPath();
        ctx.rect(topLeft.x, topLeft.y, width, height);
        ctx.clip();
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        drawLabelLine(ctx, label, textX, textY, LABEL_FONT, color);
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

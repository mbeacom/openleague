/**
 * Drawing utilities for the Hockey Practice Planner
 *
 * This module provides functions to draw various elements on the rink board:
 * - Strokes by hockey action (skate, carry, pass, shot, ...) with end caps
 * - Player icons with labels and colors
 * - Text annotations
 *
 * Requirements: 1.2, 1.3, 1.4, 5.1, 5.2
 */

import {
    Position,
    PlayerIcon,
    DrawingElement,
    TextAnnotation,
    EquipmentItem,
    PlayData,
} from "@/types/practice-planner";
import type { RinkRect, StrokeOptions } from "@/types/practice-planner";
import { FULL_RINK, TransformContext, drawRink, rinkToCanvas } from "./rink-renderer";
import { buildStrokeGeometry, type StrokeGeometry } from "./stroke-geometry";
import { drawPlayerGlyph, drawEquipmentGlyph } from "./glyphs";
import { EQUIPMENT_RADIUS_FT, PLAYER_RADIUS_FT, glyphRadiusPx } from "./glyph-metrics";
import { BOARD_COLORS } from "./notation";

/**
 * Visual constants for drawing
 */
const SELECTION_COLOR = "#FFD700"; // Gold highlight for selected elements

/**
 * Draws a stroke by hockey action (pattern), path style and end cap.
 * Geometry is computed in canvas px by `buildStrokeGeometry`.
 */
export function drawStroke(
    ctx: CanvasRenderingContext2D,
    stroke: StrokeOptions & { points: Position[]; color: string; strokeWidth: number },
    transform: TransformContext
): void {
    if (stroke.points.length < 2) return;
    const pxPerFt = Math.min(transform.scaleX, transform.scaleY);
    const geometry = buildStrokeGeometry(
        { ...stroke, points: stroke.points.map((p) => rinkToCanvas(p, transform)) },
        pxPerFt
    );

    paintStrokeGeometry(ctx, geometry, stroke.color, pxPerFt);
}

/**
 * Paints precomputed stroke geometry (canvas px): the pattern polylines, then
 * the end cap. Shared by the board and the drill legend swatches.
 */
export function paintStrokeGeometry(
    ctx: CanvasRenderingContext2D,
    geometry: StrokeGeometry,
    color: string,
    pxPerFt: number
): void {
    ctx.strokeStyle = color;
    ctx.lineWidth = geometry.lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const line of geometry.polylines) {
        ctx.beginPath();
        ctx.moveTo(line[0].x, line[0].y);
        for (let i = 1; i < line.length; i++) ctx.lineTo(line[i].x, line[i].y);
        ctx.stroke();
    }

    if (!geometry.end) return;
    const { tip, angle, type } = geometry.end;
    if (type === "arrow") {
        const from = { x: tip.x - Math.cos(angle), y: tip.y - Math.sin(angle) };
        drawArrowHead(ctx, from, tip, color, geometry.lineWidth);
    } else {
        const half = Math.max(1.8 * pxPerFt, 4);
        const nx = -Math.sin(angle);
        const ny = Math.cos(angle);
        ctx.beginPath();
        ctx.moveTo(tip.x + nx * half, tip.y + ny * half);
        ctx.lineTo(tip.x - nx * half, tip.y - ny * half);
        ctx.stroke();
    }
}

/**
 * Draws an arrow head at the end of a line
 *
 * @param ctx - Canvas 2D rendering context
 * @param from - Starting point of the arrow segment
 * @param to - End point where arrow head is drawn
 * @param color - Arrow color
 * @param strokeWidth - Base stroke width for sizing
 */
function drawArrowHead(
    ctx: CanvasRenderingContext2D,
    from: Position,
    to: Position,
    color: string,
    strokeWidth: number
): void {
    const headLength = Math.max(10, strokeWidth * 5); // Arrow head length

    // Calculate angle of the line
    const angle = Math.atan2(to.y - from.y, to.x - from.x);

    ctx.fillStyle = color;
    ctx.beginPath();

    // Arrow head tip
    ctx.moveTo(to.x, to.y);

    // Left side of arrow head
    ctx.lineTo(
        to.x - headLength * Math.cos(angle - Math.PI / 6),
        to.y - headLength * Math.sin(angle - Math.PI / 6)
    );

    // Right side of arrow head
    ctx.lineTo(
        to.x - headLength * Math.cos(angle + Math.PI / 6),
        to.y - headLength * Math.sin(angle + Math.PI / 6)
    );

    ctx.closePath();
    ctx.fill();
}

/**
 * Draws a player icon with label and color
 * Requirements: 1.2
 *
 * @param ctx - Canvas 2D rendering context
 * @param player - Player icon data
 * @param transform - Transformation context for coordinate conversion
 * @param isSelected - Whether the player is currently selected
 */
export function drawPlayerIcon(
    ctx: CanvasRenderingContext2D,
    player: PlayerIcon,
    transform: TransformContext,
    isSelected: boolean = false,
    zoom: number = 1
): void {
    const pxPerFt = Math.min(transform.scaleX, transform.scaleY);
    drawPlayerGlyph(
        ctx,
        player,
        rinkToCanvas(player.position, transform),
        glyphRadiusPx(PLAYER_RADIUS_FT, pxPerFt, zoom),
        isSelected
    );
}

/**
 * Draws an equipment item (puck, cone, net, ...)
 */
export function drawEquipmentItem(
    ctx: CanvasRenderingContext2D,
    item: EquipmentItem,
    transform: TransformContext,
    isSelected: boolean = false,
    zoom: number = 1
): void {
    const pxPerFt = Math.min(transform.scaleX, transform.scaleY);
    drawEquipmentGlyph(
        ctx,
        item,
        rinkToCanvas(item.position, transform),
        glyphRadiusPx(EQUIPMENT_RADIUS_FT[item.kind], pxPerFt, zoom),
        isSelected
    );
}

/**
 * Draws a text annotation
 * Requirements: 1.4
 *
 * @param ctx - Canvas 2D rendering context
 * @param annotation - Text annotation data
 * @param transform - Transformation context for coordinate conversion
 * @param isSelected - Whether the annotation is currently selected
 */
export function drawTextAnnotation(
    ctx: CanvasRenderingContext2D,
    annotation: TextAnnotation,
    transform: TransformContext,
    isSelected: boolean = false
): void {
    const canvasPos = rinkToCanvas(annotation.position, transform);
    const scaledFontSize = annotation.fontSize * Math.min(transform.scaleX, transform.scaleY);

    // Measure text for background
    ctx.font = `${scaledFontSize}px Arial`;
    const metrics = ctx.measureText(annotation.text);
    const textWidth = metrics.width;
    const textHeight = scaledFontSize;

    // Draw selection highlight if selected
    if (isSelected) {
        ctx.fillStyle = "rgba(255, 215, 0, 0.3)"; // Gold with transparency
        ctx.fillRect(
            canvasPos.x - 4,
            canvasPos.y - textHeight - 4,
            textWidth + 8,
            textHeight + 8
        );
    }

    // Draw semi-transparent background for readability
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    ctx.fillRect(canvasPos.x - 2, canvasPos.y - textHeight - 2, textWidth + 4, textHeight + 4);

    // Draw text
    ctx.fillStyle = annotation.color;
    ctx.font = `${scaledFontSize}px Arial`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(annotation.text, canvasPos.x, canvasPos.y - textHeight);
}

/**
 * Draws a complete drawing element (line, curve, or arrow)
 * Requirements: 1.3, 5.1, 5.2
 *
 * @param ctx - Canvas 2D rendering context
 * @param element - Drawing element data
 * @param transform - Transformation context for coordinate conversion
 * @param isSelected - Whether the element is currently selected
 */
export function drawElement(
    ctx: CanvasRenderingContext2D,
    element: DrawingElement,
    transform: TransformContext,
    isSelected: boolean = false
): void {
    // Draw selection highlight if selected
    if (isSelected) {
        ctx.strokeStyle = SELECTION_COLOR;
        ctx.lineWidth = element.strokeWidth + 4;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.globalAlpha = 0.5;

        ctx.beginPath();
        const startCanvas = rinkToCanvas(element.points[0], transform);
        ctx.moveTo(startCanvas.x, startCanvas.y);

        for (let i = 1; i < element.points.length; i++) {
            const pointCanvas = rinkToCanvas(element.points[i], transform);
            ctx.lineTo(pointCanvas.x, pointCanvas.y);
        }

        ctx.stroke();
        ctx.globalAlpha = 1.0;
    }

    drawStroke(ctx, element, transform);
}

/**
 * Draws all elements from play data: drawings, equipment, players, annotations
 *
 * @param ctx - Canvas 2D rendering context
 * @param playData - Play data to render
 * @param transform - Transformation context
 * @param selectedId - ID of currently selected element (if any)
 * @param zoom - Canvas zoom applied by the caller (keeps minimum glyph size on screen)
 */
export function drawAllElements(
    ctx: CanvasRenderingContext2D,
    playData: PlayData,
    transform: TransformContext,
    selectedId?: string,
    zoom: number = 1
): void {
    playData.drawings.forEach((d) => drawElement(ctx, d, transform, d.id === selectedId));
    playData.equipment.forEach((e) => drawEquipmentItem(ctx, e, transform, e.id === selectedId, zoom));
    playData.players.forEach((p) => drawPlayerIcon(ctx, p, transform, p.id === selectedId, zoom));
    playData.annotations.forEach((a) => drawTextAnnotation(ctx, a, transform, a.id === selectedId));
}

/** Ink (#212121) at 35%: shades the ice outside a drill's area. */
const AREA_MASK_FILL = "rgba(33, 33, 33, 0.35)";
const AREA_OUTLINE_DASH = [8, 6];

function coversRink(rect: RinkRect): boolean {
    return rect.x <= 0 && rect.y <= 0 && rect.x + rect.w >= FULL_RINK.w && rect.y + rect.h >= FULL_RINK.h;
}

/**
 * Shades the rink outside `rect` (even-odd fill of the rink rectangle minus
 * the area) and outlines the area, dashed, in Action Blue. Draws nothing when
 * `rect` covers the whole rink.
 */
export function drawAreaMask(ctx: CanvasRenderingContext2D, rect: RinkRect, transform: TransformContext): void {
    if (coversRink(rect)) return;
    const rinkTopLeft = rinkToCanvas({ x: 0, y: 0 }, transform);
    const rinkBottomRight = rinkToCanvas({ x: FULL_RINK.w, y: FULL_RINK.h }, transform);
    const topLeft = rinkToCanvas({ x: rect.x, y: rect.y }, transform);
    const bottomRight = rinkToCanvas({ x: rect.x + rect.w, y: rect.y + rect.h }, transform);

    ctx.save();
    ctx.fillStyle = AREA_MASK_FILL;
    ctx.beginPath();
    ctx.rect(rinkTopLeft.x, rinkTopLeft.y, rinkBottomRight.x - rinkTopLeft.x, rinkBottomRight.y - rinkTopLeft.y);
    ctx.rect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
    ctx.fill("evenodd");
    ctx.strokeStyle = BOARD_COLORS.actionBlue;
    ctx.lineWidth = 2;
    ctx.setLineDash(AREA_OUTLINE_DASH);
    ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
    ctx.restore();
}

export interface BoardSceneOptions {
    /** Element drawn with the selection highlight */
    selectedId?: string;
    /** Canvas zoom applied by the caller (keeps minimum glyph size on screen) */
    zoom?: number;
    /** Rectangle left unshaded; omitted, or covering the rink, means no mask */
    maskRect?: RinkRect;
}

/**
 * The board's draw sequence, shared by RinkBoard and thumbnails: rink, then
 * elements, then the area mask on top, so elements outside the area are
 * dimmed with the ice they sit on.
 */
export function drawBoardScene(
    ctx: CanvasRenderingContext2D,
    transform: TransformContext,
    playData: PlayData,
    options: BoardSceneOptions = {}
): void {
    drawRink(ctx, transform);
    drawAllElements(ctx, playData, transform, options.selectedId, options.zoom ?? 1);
    if (options.maskRect) drawAreaMask(ctx, options.maskRect, transform);
}

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
} from "@/types/practice-planner";
import type { StrokeOptions } from "@/types/practice-planner";
import { TransformContext, rinkToCanvas } from "./rink-renderer";
import { buildStrokeGeometry } from "./stroke-geometry";

/**
 * Visual constants for drawing
 */
const PLAYER_ICON_RADIUS = 12; // feet in rink coordinates
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

    ctx.strokeStyle = stroke.color;
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
        drawArrowHead(ctx, from, tip, stroke.color, geometry.lineWidth);
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
    isSelected: boolean = false
): void {
    const canvasPos = rinkToCanvas(player.position, transform);
    const radius = PLAYER_ICON_RADIUS * Math.min(transform.scaleX, transform.scaleY);

    // Draw selection highlight if selected
    if (isSelected) {
        ctx.strokeStyle = SELECTION_COLOR;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(canvasPos.x, canvasPos.y, radius + 4, 0, Math.PI * 2);
        ctx.stroke();
    }

    // Draw player circle
    ctx.fillStyle = player.color;
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(canvasPos.x, canvasPos.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Draw label text
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `bold ${Math.floor(radius * 1.2)}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(player.label, canvasPos.x, canvasPos.y);
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
 * Draws all elements from play data
 *
 * @param ctx - Canvas 2D rendering context
 * @param players - Array of player icons
 * @param drawings - Array of drawing elements
 * @param annotations - Array of text annotations
 * @param transform - Transformation context
 * @param selectedId - ID of currently selected element (if any)
 */
export function drawAllElements(
    ctx: CanvasRenderingContext2D,
    players: PlayerIcon[],
    drawings: DrawingElement[],
    annotations: TextAnnotation[],
    transform: TransformContext,
    selectedId?: string
): void {
    // Draw drawings first (bottom layer)
    drawings.forEach((drawing) => {
        drawElement(ctx, drawing, transform, drawing.id === selectedId);
    });

    // Draw players (middle layer)
    players.forEach((player) => {
        drawPlayerIcon(ctx, player, transform, player.id === selectedId);
    });

    // Draw annotations last (top layer)
    annotations.forEach((annotation) => {
        drawTextAnnotation(ctx, annotation, transform, annotation.id === selectedId);
    });
}

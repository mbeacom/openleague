/**
 * Rink rendering utilities for the Hockey Practice Planner
 * 
 * This module provides functions to draw a standard hockey rink with proper
 * dimensions and markings, coordinate transformations for responsive scaling,
 * and layer caching for performance optimization.
 * 
 * Requirements: 1.1
 */

import { Position } from "@/types/practice-planner";

/**
 * Standard NHL rink dimensions in feet
 */
export const RINK_DIMENSIONS = {
    width: 200, // feet
    height: 85, // feet
} as const;

/**
 * Rink zone dimensions
 */
const ZONE_DIMENSIONS = {
    neutralZoneWidth: 50, // feet
    defensiveZoneWidth: 75, // feet
    offensiveZoneWidth: 75, // feet
    cornerRadius: 28, // feet
} as const;

/**
 * Circle dimensions
 */
const CIRCLE_DIMENSIONS = {
    centerCircleRadius: 15, // feet
    faceoffCircleRadius: 15, // feet
    faceoffDotRadius: 1, // feet
} as const;

/**
 * Line dimensions
 */
const LINE_DIMENSIONS = {
    goalLineDistance: 11, // feet from end boards
    blueLineWidth: 1, // feet
    redLineWidth: 1, // feet
    goalCreaseRadius: 6, // feet
} as const;

/**
 * Coordinate transformation context for responsive scaling
 */
export interface TransformContext {
    canvasWidth: number;
    canvasHeight: number;
    scaleX: number;
    scaleY: number;
    offsetX: number;
    offsetY: number;
}

/**
 * Creates a transformation context for converting between rink coordinates
 * and canvas coordinates with responsive scaling
 * 
 * @param canvasWidth - Width of the canvas element in pixels
 * @param canvasHeight - Height of the canvas element in pixels
 * @param padding - Padding around the rink in pixels (default: 20)
 * @returns Transformation context for coordinate conversions
 */
export function createTransformContext(
    canvasWidth: number,
    canvasHeight: number,
    padding: number = 20
): TransformContext {
    const availableWidth = canvasWidth - padding * 2;
    const availableHeight = canvasHeight - padding * 2;

    // Calculate scale to fit rink in available space while maintaining aspect ratio
    const scaleX = availableWidth / RINK_DIMENSIONS.width;
    const scaleY = availableHeight / RINK_DIMENSIONS.height;
    const scale = Math.min(scaleX, scaleY);

    // Calculate offsets to center the rink
    const scaledWidth = RINK_DIMENSIONS.width * scale;
    const scaledHeight = RINK_DIMENSIONS.height * scale;
    const offsetX = (canvasWidth - scaledWidth) / 2;
    const offsetY = (canvasHeight - scaledHeight) / 2;

    return {
        canvasWidth,
        canvasHeight,
        scaleX: scale,
        scaleY: scale,
        offsetX,
        offsetY,
    };
}

/**
 * Converts rink coordinates to canvas coordinates
 * 
 * @param rinkPos - Position in rink coordinates (feet)
 * @param transform - Transformation context
 * @returns Position in canvas coordinates (pixels)
 */
export function rinkToCanvas(rinkPos: Position, transform: TransformContext): Position {
    return {
        x: rinkPos.x * transform.scaleX + transform.offsetX,
        y: rinkPos.y * transform.scaleY + transform.offsetY,
    };
}

/**
 * Converts canvas coordinates to rink coordinates
 * 
 * @param canvasPos - Position in canvas coordinates (pixels)
 * @param transform - Transformation context
 * @returns Position in rink coordinates (feet)
 */
export function canvasToRink(canvasPos: Position, transform: TransformContext): Position {
    return {
        x: (canvasPos.x - transform.offsetX) / transform.scaleX,
        y: (canvasPos.y - transform.offsetY) / transform.scaleY,
    };
}

/**
 * Cached rink background for performance optimization
 */
let cachedRinkCanvas: HTMLCanvasElement | null = null;
let cachedRinkTransform: TransformContext | null = null;

/**
 * Clears the cached rink background
 */
export function clearRinkCache(): void {
    cachedRinkCanvas = null;
    cachedRinkTransform = null;
}

/**
 * Gets or creates a cached rink background canvas
 * 
 * @param width - Canvas width in pixels
 * @param height - Canvas height in pixels
 * @returns Cached canvas with rink background
 */
function getCachedRinkCanvas(width: number, height: number): HTMLCanvasElement {
    // Check if we can reuse the cached canvas
    if (
        cachedRinkCanvas &&
        cachedRinkTransform &&
        cachedRinkCanvas.width === width &&
        cachedRinkCanvas.height === height
    ) {
        return cachedRinkCanvas;
    }

    // Create new canvas and cache it
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
        throw new Error("Failed to get 2D context for rink cache");
    }

    const transform = createTransformContext(width, height);
    drawRinkBackground(ctx, transform);

    cachedRinkCanvas = canvas;
    cachedRinkTransform = transform;

    return canvas;
}

/**
 * Draws the complete hockey rink with all markings
 * 
 * @param ctx - Canvas 2D rendering context
 * @param transform - Transformation context for coordinate conversion
 */
export function drawRink(ctx: CanvasRenderingContext2D, transform: TransformContext): void {
    // Use cached background if available
    try {
        const cachedCanvas = getCachedRinkCanvas(transform.canvasWidth, transform.canvasHeight);
        ctx.drawImage(cachedCanvas, 0, 0);
    } catch (error) {
        // Fallback to direct rendering if caching fails
        console.warn("Failed to use cached rink, rendering directly:", error);
        drawRinkBackground(ctx, transform);
    }
}

/**
 * Draws the rink background with all markings (internal function)
 * 
 * @param ctx - Canvas 2D rendering context
 * @param transform - Transformation context
 */
function drawRinkBackground(ctx: CanvasRenderingContext2D, transform: TransformContext): void {
    // Clear canvas
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, transform.canvasWidth, transform.canvasHeight);

    // Draw ice surface
    drawIceSurface(ctx, transform);

    // Draw boards (outline)
    drawBoards(ctx, transform);

    // Draw lines
    drawCenterRedLine(ctx, transform);
    drawBlueLines(ctx, transform);
    drawGoalLines(ctx, transform);

    // Draw circles
    drawCenterCircle(ctx, transform);
    drawFaceoffCircles(ctx, transform);
    drawFaceoffDots(ctx, transform);

    // Draw goal creases
    drawGoalCreases(ctx, transform);
}

/**
 * Draws the ice surface
 */
function drawIceSurface(ctx: CanvasRenderingContext2D, transform: TransformContext): void {
    const topLeft = rinkToCanvas({ x: 0, y: 0 }, transform);
    const bottomRight = rinkToCanvas(
        { x: RINK_DIMENSIONS.width, y: RINK_DIMENSIONS.height },
        transform
    );

    const width = bottomRight.x - topLeft.x;
    const height = bottomRight.y - topLeft.y;
    const cornerRadius = ZONE_DIMENSIONS.cornerRadius * transform.scaleX;

    ctx.fillStyle = "#E8F4F8"; // Light ice blue
    ctx.beginPath();
    ctx.roundRect(topLeft.x, topLeft.y, width, height, cornerRadius);
    ctx.fill();
}

/**
 * Draws the boards (rink outline)
 */
function drawBoards(ctx: CanvasRenderingContext2D, transform: TransformContext): void {
    const topLeft = rinkToCanvas({ x: 0, y: 0 }, transform);
    const bottomRight = rinkToCanvas(
        { x: RINK_DIMENSIONS.width, y: RINK_DIMENSIONS.height },
        transform
    );

    const width = bottomRight.x - topLeft.x;
    const height = bottomRight.y - topLeft.y;
    const cornerRadius = ZONE_DIMENSIONS.cornerRadius * transform.scaleX;

    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(topLeft.x, topLeft.y, width, height, cornerRadius);
    ctx.stroke();
}

/**
 * Draws the center red line
 */
function drawCenterRedLine(ctx: CanvasRenderingContext2D, transform: TransformContext): void {
    const centerX = RINK_DIMENSIONS.width / 2;
    const top = rinkToCanvas({ x: centerX, y: 0 }, transform);
    const bottom = rinkToCanvas({ x: centerX, y: RINK_DIMENSIONS.height }, transform);

    ctx.strokeStyle = "#C8102E"; // Red
    ctx.lineWidth = LINE_DIMENSIONS.redLineWidth * transform.scaleX;
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(bottom.x, bottom.y);
    ctx.stroke();
}

/**
 * Draws the blue lines
 */
function drawBlueLines(ctx: CanvasRenderingContext2D, transform: TransformContext): void {
    const leftBlueLineX = ZONE_DIMENSIONS.defensiveZoneWidth;
    const rightBlueLineX = RINK_DIMENSIONS.width - ZONE_DIMENSIONS.offensiveZoneWidth;

    ctx.strokeStyle = "#003087"; // Blue
    ctx.lineWidth = LINE_DIMENSIONS.blueLineWidth * transform.scaleX;

    // Left blue line
    const leftTop = rinkToCanvas({ x: leftBlueLineX, y: 0 }, transform);
    const leftBottom = rinkToCanvas({ x: leftBlueLineX, y: RINK_DIMENSIONS.height }, transform);
    ctx.beginPath();
    ctx.moveTo(leftTop.x, leftTop.y);
    ctx.lineTo(leftBottom.x, leftBottom.y);
    ctx.stroke();

    // Right blue line
    const rightTop = rinkToCanvas({ x: rightBlueLineX, y: 0 }, transform);
    const rightBottom = rinkToCanvas({ x: rightBlueLineX, y: RINK_DIMENSIONS.height }, transform);
    ctx.beginPath();
    ctx.moveTo(rightTop.x, rightTop.y);
    ctx.lineTo(rightBottom.x, rightBottom.y);
    ctx.stroke();
}

/**
 * Draws the goal lines
 */
function drawGoalLines(ctx: CanvasRenderingContext2D, transform: TransformContext): void {
    const leftGoalLineX = LINE_DIMENSIONS.goalLineDistance;
    const rightGoalLineX = RINK_DIMENSIONS.width - LINE_DIMENSIONS.goalLineDistance;

    ctx.strokeStyle = "#C8102E"; // Red
    ctx.lineWidth = LINE_DIMENSIONS.redLineWidth * transform.scaleX;

    // Left goal line
    const leftTop = rinkToCanvas({ x: leftGoalLineX, y: 0 }, transform);
    const leftBottom = rinkToCanvas({ x: leftGoalLineX, y: RINK_DIMENSIONS.height }, transform);
    ctx.beginPath();
    ctx.moveTo(leftTop.x, leftTop.y);
    ctx.lineTo(leftBottom.x, leftBottom.y);
    ctx.stroke();

    // Right goal line
    const rightTop = rinkToCanvas({ x: rightGoalLineX, y: 0 }, transform);
    const rightBottom = rinkToCanvas({ x: rightGoalLineX, y: RINK_DIMENSIONS.height }, transform);
    ctx.beginPath();
    ctx.moveTo(rightTop.x, rightTop.y);
    ctx.lineTo(rightBottom.x, rightBottom.y);
    ctx.stroke();
}

/**
 * Draws the center circle
 */
function drawCenterCircle(ctx: CanvasRenderingContext2D, transform: TransformContext): void {
    const center = rinkToCanvas(
        { x: RINK_DIMENSIONS.width / 2, y: RINK_DIMENSIONS.height / 2 },
        transform
    );
    const radius = CIRCLE_DIMENSIONS.centerCircleRadius * transform.scaleX;

    ctx.strokeStyle = "#003087"; // Blue
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Center dot
    ctx.fillStyle = "#003087";
    ctx.beginPath();
    ctx.arc(center.x, center.y, CIRCLE_DIMENSIONS.faceoffDotRadius * transform.scaleX, 0, Math.PI * 2);
    ctx.fill();
}

/**
 * Draws the faceoff circles
 */
function drawFaceoffCircles(ctx: CanvasRenderingContext2D, transform: TransformContext): void {
    const circleY1 = RINK_DIMENSIONS.height / 2 - 22; // 22 feet from center
    const circleY2 = RINK_DIMENSIONS.height / 2 + 22;

    const leftCircleX = LINE_DIMENSIONS.goalLineDistance + 20; // 20 feet from goal line
    const rightCircleX = RINK_DIMENSIONS.width - LINE_DIMENSIONS.goalLineDistance - 20;

    const radius = CIRCLE_DIMENSIONS.faceoffCircleRadius * transform.scaleX;

    ctx.strokeStyle = "#C8102E"; // Red
    ctx.lineWidth = 2;

    // Draw all four faceoff circles
    const positions = [
        { x: leftCircleX, y: circleY1 },
        { x: leftCircleX, y: circleY2 },
        { x: rightCircleX, y: circleY1 },
        { x: rightCircleX, y: circleY2 },
    ];

    positions.forEach((pos) => {
        const center = rinkToCanvas(pos, transform);
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
        ctx.stroke();
    });
}

/**
 * Draws the faceoff dots
 */
function drawFaceoffDots(ctx: CanvasRenderingContext2D, transform: TransformContext): void {
    const circleY1 = RINK_DIMENSIONS.height / 2 - 22;
    const circleY2 = RINK_DIMENSIONS.height / 2 + 22;

    const leftCircleX = LINE_DIMENSIONS.goalLineDistance + 20;
    const rightCircleX = RINK_DIMENSIONS.width - LINE_DIMENSIONS.goalLineDistance - 20;

    const dotRadius = CIRCLE_DIMENSIONS.faceoffDotRadius * transform.scaleX;

    ctx.fillStyle = "#C8102E"; // Red

    // Draw all four faceoff dots
    const positions = [
        { x: leftCircleX, y: circleY1 },
        { x: leftCircleX, y: circleY2 },
        { x: rightCircleX, y: circleY1 },
        { x: rightCircleX, y: circleY2 },
    ];

    positions.forEach((pos) => {
        const center = rinkToCanvas(pos, transform);
        ctx.beginPath();
        ctx.arc(center.x, center.y, dotRadius, 0, Math.PI * 2);
        ctx.fill();
    });

    // Neutral zone faceoff dots
    const neutralDotY1 = RINK_DIMENSIONS.height / 2 - 22;
    const neutralDotY2 = RINK_DIMENSIONS.height / 2 + 22;
    const neutralDotX1 = ZONE_DIMENSIONS.defensiveZoneWidth + 5;
    const neutralDotX2 = RINK_DIMENSIONS.width - ZONE_DIMENSIONS.offensiveZoneWidth - 5;

    const neutralPositions = [
        { x: neutralDotX1, y: neutralDotY1 },
        { x: neutralDotX1, y: neutralDotY2 },
        { x: neutralDotX2, y: neutralDotY1 },
        { x: neutralDotX2, y: neutralDotY2 },
    ];

    neutralPositions.forEach((pos) => {
        const center = rinkToCanvas(pos, transform);
        ctx.beginPath();
        ctx.arc(center.x, center.y, dotRadius, 0, Math.PI * 2);
        ctx.fill();
    });
}

/**
 * Draws the goal creases
 */
function drawGoalCreases(ctx: CanvasRenderingContext2D, transform: TransformContext): void {
    const leftGoalX = LINE_DIMENSIONS.goalLineDistance;
    const rightGoalX = RINK_DIMENSIONS.width - LINE_DIMENSIONS.goalLineDistance;
    const centerY = RINK_DIMENSIONS.height / 2;

    const creaseRadius = LINE_DIMENSIONS.goalCreaseRadius * transform.scaleX;

    ctx.strokeStyle = "#C8102E"; // Red
    ctx.fillStyle = "rgba(200, 16, 46, 0.1)"; // Light red fill
    ctx.lineWidth = 2;

    // Left goal crease
    const leftGoal = rinkToCanvas({ x: leftGoalX, y: centerY }, transform);
    ctx.beginPath();
    ctx.arc(leftGoal.x, leftGoal.y, creaseRadius, -Math.PI / 2, Math.PI / 2);
    ctx.fill();
    ctx.stroke();

    // Right goal crease
    const rightGoal = rinkToCanvas({ x: rightGoalX, y: centerY }, transform);
    ctx.beginPath();
    ctx.arc(rightGoal.x, rightGoal.y, creaseRadius, Math.PI / 2, (3 * Math.PI) / 2);
    ctx.fill();
    ctx.stroke();
}

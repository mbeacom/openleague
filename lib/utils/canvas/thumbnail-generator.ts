/**
 * Thumbnail generation utilities for the Hockey Practice Planner
 *
 * This module provides functions to:
 * - Export canvas as base64 PNG
 * - Create thumbnail with scaling and optimization
 *
 * Requirements: 4.2
 */

import { PlayData } from "@/types/practice-planner";
import { createTransformContext, drawRink } from "./rink-renderer";
import { drawAllElements } from "./drawing-utils";

/**
 * Default thumbnail dimensions
 */
export const THUMBNAIL_DIMENSIONS = {
    width: 300,
    height: 128, // Maintains ~200:85 aspect ratio
} as const;

/**
 * Options for thumbnail generation
 */
export interface ThumbnailOptions {
    width?: number;
    height?: number;
    quality?: number; // 0-1, for JPEG quality (not used for PNG)
    backgroundColor?: string;
}

/**
 * Generates a thumbnail image from play data
 * Requirements: 4.2
 *
 * @param playData - Play data to render
 * @param options - Thumbnail generation options
 * @returns Base64 encoded PNG string
 */
export function generateThumbnail(
    playData: PlayData,
    options: ThumbnailOptions = {}
): string {
    const {
        width = THUMBNAIL_DIMENSIONS.width,
        height = THUMBNAIL_DIMENSIONS.height,
        backgroundColor = "#FFFFFF",
    } = options;

    // Create off-screen canvas
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
        throw new Error("Failed to get 2D context for thumbnail generation");
    }

    // Fill background
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);

    // Create transform context for thumbnail size
    const transform = createTransformContext(width, height, 10);

    // Draw rink
    drawRink(ctx, transform);

    // Draw all play elements
    drawAllElements(
        ctx,
        playData.players,
        playData.drawings,
        playData.annotations,
        transform
    );

    // Export as base64 PNG
    return canvas.toDataURL("image/png");
}

/**
 * Exports a canvas to base64 PNG
 * Requirements: 4.2
 *
 * @param canvas - Canvas element to export
 * @returns Base64 encoded PNG string
 */
export function canvasToBase64(canvas: HTMLCanvasElement): string {
    return canvas.toDataURL("image/png");
}

/**
 * Scales a canvas to a specific size while maintaining aspect ratio
 *
 * @param sourceCanvas - Source canvas to scale
 * @param maxWidth - Maximum width
 * @param maxHeight - Maximum height
 * @returns Scaled canvas
 */
export function scaleCanvas(
    sourceCanvas: HTMLCanvasElement,
    maxWidth: number,
    maxHeight: number
): HTMLCanvasElement {
    const sourceWidth = sourceCanvas.width;
    const sourceHeight = sourceCanvas.height;

    // Calculate scale to fit within max dimensions
    const scaleX = maxWidth / sourceWidth;
    const scaleY = maxHeight / sourceHeight;
    const scale = Math.min(scaleX, scaleY, 1); // Don't scale up

    const targetWidth = Math.floor(sourceWidth * scale);
    const targetHeight = Math.floor(sourceHeight * scale);

    // Create target canvas
    const targetCanvas = document.createElement("canvas");
    targetCanvas.width = targetWidth;
    targetCanvas.height = targetHeight;

    const ctx = targetCanvas.getContext("2d");
    if (!ctx) {
        throw new Error("Failed to get 2D context for canvas scaling");
    }

    // Use high-quality image smoothing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // Draw scaled image
    ctx.drawImage(sourceCanvas, 0, 0, targetWidth, targetHeight);

    return targetCanvas;
}

/**
 * Optimizes a canvas for thumbnail size
 * Uses multi-step downscaling for better quality
 *
 * @param sourceCanvas - Source canvas
 * @param targetWidth - Target width
 * @param targetHeight - Target height
 * @returns Optimized canvas
 */
export function optimizeThumbnail(
    sourceCanvas: HTMLCanvasElement,
    targetWidth: number,
    targetHeight: number
): HTMLCanvasElement {
    const sourceWidth = sourceCanvas.width;
    const sourceHeight = sourceCanvas.height;

    // If source is already smaller or equal, return as-is
    if (sourceWidth <= targetWidth && sourceHeight <= targetHeight) {
        return sourceCanvas;
    }

    // Calculate scale factor
    const scaleX = targetWidth / sourceWidth;
    const scaleY = targetHeight / sourceHeight;
    const scale = Math.min(scaleX, scaleY);

    // If scaling down by more than 50%, use multi-step approach
    if (scale < 0.5) {
        return multiStepScale(sourceCanvas, targetWidth, targetHeight);
    }

    // Otherwise, use single-step scaling
    return scaleCanvas(sourceCanvas, targetWidth, targetHeight);
}

/**
 * Performs multi-step downscaling for better quality
 * Scales by 50% at a time until reaching target size
 *
 * @param sourceCanvas - Source canvas
 * @param targetWidth - Target width
 * @param targetHeight - Target height
 * @returns Scaled canvas
 */
function multiStepScale(
    sourceCanvas: HTMLCanvasElement,
    targetWidth: number,
    targetHeight: number
): HTMLCanvasElement {
    let currentCanvas = sourceCanvas;
    let currentWidth = sourceCanvas.width;
    let currentHeight = sourceCanvas.height;

    // Scale by 50% at a time
    while (currentWidth > targetWidth * 2 || currentHeight > targetHeight * 2) {
        const stepWidth = Math.floor(currentWidth * 0.5);
        const stepHeight = Math.floor(currentHeight * 0.5);

        const stepCanvas = document.createElement("canvas");
        stepCanvas.width = stepWidth;
        stepCanvas.height = stepHeight;

        const ctx = stepCanvas.getContext("2d");
        if (!ctx) {
            throw new Error("Failed to get 2D context for multi-step scaling");
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(currentCanvas, 0, 0, stepWidth, stepHeight);

        currentCanvas = stepCanvas;
        currentWidth = stepWidth;
        currentHeight = stepHeight;
    }

    // Final scale to exact target size
    return scaleCanvas(currentCanvas, targetWidth, targetHeight);
}

/**
 * Validates that a base64 string is a valid PNG image
 *
 * @param base64String - Base64 string to validate
 * @returns True if valid PNG
 */
export function isValidPngBase64(base64String: string): boolean {
    // Check if it starts with PNG data URL prefix
    if (!base64String.startsWith("data:image/png;base64,")) {
        return false;
    }

    // Extract base64 data
    const base64Data = base64String.split(",")[1];
    if (!base64Data) {
        return false;
    }

    try {
        // Try to decode base64
        atob(base64Data);
        return true;
    } catch {
        return false;
    }
}

/**
 * Gets the size of a base64 image in bytes
 *
 * @param base64String - Base64 string
 * @returns Size in bytes
 */
export function getBase64Size(base64String: string): number {
    // Remove data URL prefix if present
    const base64Data = base64String.includes(",")
        ? base64String.split(",")[1]
        : base64String;

    // Calculate size (base64 encoding increases size by ~33%)
    return Math.floor((base64Data.length * 3) / 4);
}

/**
 * Compresses a base64 PNG by reducing dimensions if it exceeds max size
 *
 * @param base64String - Base64 PNG string
 * @param maxSizeBytes - Maximum size in bytes
 * @returns Compressed base64 PNG string
 */
export async function compressThumbnail(
    base64String: string,
    maxSizeBytes: number = 100000 // 100KB default
): Promise<string> {
    const currentSize = getBase64Size(base64String);

    if (currentSize <= maxSizeBytes) {
        return base64String;
    }

    // Load image
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to load image for compression"));
        img.src = base64String;
    });

    // Calculate scale factor to reduce size
    const scaleFactor = Math.sqrt(maxSizeBytes / currentSize);
    const newWidth = Math.floor(img.width * scaleFactor);
    const newHeight = Math.floor(img.height * scaleFactor);

    // Create scaled canvas
    const canvas = document.createElement("canvas");
    canvas.width = newWidth;
    canvas.height = newHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
        throw new Error("Failed to get 2D context for compression");
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, newWidth, newHeight);

    return canvas.toDataURL("image/png");
}

/**
 * Canvas utilities for the Hockey Practice Planner
 * 
 * This module exports all canvas-related utilities:
 * - Rink rendering with coordinate transformations
 * - Drawing utilities for lines, curves, arrows, players, and annotations
 * - Interaction utilities for hit detection and event handling
 * - Thumbnail generation and optimization
 * - Undo/redo history management
 */

// Rink rendering
export {
    RINK_DIMENSIONS,
    type TransformContext,
    createTransformContext,
    rinkToCanvas,
    canvasToRink,
    clearRinkCache,
    drawRink,
} from "./rink-renderer";

// Drawing utilities
export {
    drawLine,
    drawCurve,
    drawArrow,
    drawPlayerIcon,
    drawTextAnnotation,
    drawElement,
    drawAllElements,
} from "./drawing-utils";

// Interaction utilities
export {
    type SelectableElement,
    type HitTestResult,
    type HistoryState,
    HistoryManager,
    getMousePosition,
    getTouchPosition,
    getEventRinkPosition,
    hitTestPlayer,
    hitTestDrawing,
    hitTestAnnotation,
    hitTest,
    isWithinRinkBounds,
    clampToRinkBounds,
    debounce,
    preventDefaultAndStop,
} from "./interaction-utils";

// Thumbnail generation
export {
    THUMBNAIL_DIMENSIONS,
    type ThumbnailOptions,
    generateThumbnail,
    canvasToBase64,
    scaleCanvas,
    optimizeThumbnail,
    isValidPngBase64,
    getBase64Size,
    compressThumbnail,
} from "./thumbnail-generator";

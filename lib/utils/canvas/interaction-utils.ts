/**
 * Interaction utilities for the Hockey Practice Planner
 *
 * This module provides functions for:
 * - Hit detection for selecting elements on canvas
 * - Touch and mouse event handlers with coordinate mapping
 * - Undo/redo history management system
 *
 * Requirements: 5.4, 5.5
 */

import {
    Position,
    PlayerIcon,
    DrawingElement,
    TextAnnotation,
    PlayData,
    EquipmentItem,
    RinkRect,
} from "@/types/practice-planner";
import { TransformContext, canvasToRink } from "./rink-renderer";
import { PLAYER_RADIUS_FT, EQUIPMENT_RADIUS_FT } from "./glyph-metrics";

/**
 * Hit detection constants
 */
const HIT_THRESHOLD = 5; // Hit detection threshold in rink coordinates

/**
 * Type for elements that can be selected
 */
export type SelectableElement = PlayerIcon | DrawingElement | TextAnnotation | EquipmentItem;

/**
 * Result of a hit detection test
 */
export interface HitTestResult {
    hit: boolean;
    elementId?: string;
    elementType?: "player" | "drawing" | "annotation" | "equipment";
    element?: SelectableElement;
}

/**
 * History state for undo/redo functionality
 */
export interface HistoryState {
    playData: PlayData;
    timestamp: number;
}

/**
 * History manager for undo/redo operations
 * Requirements: 5.5
 */
export class HistoryManager {
    private history: HistoryState[] = [];
    private currentIndex: number = -1;
    private maxHistorySize: number = 50;

    /**
     * Pushes a new state to the history
     *
     * @param playData - Current play data state
     */
    push(playData: PlayData): void {
        // Remove any states after current index (when undoing then making new changes)
        this.history = this.history.slice(0, this.currentIndex + 1);

        // Add new state
        this.history.push({
            playData: this.deepClone(playData),
            timestamp: Date.now(),
        });

        // Limit history size
        if (this.history.length > this.maxHistorySize) {
            this.history.shift();
        } else {
            this.currentIndex++;
        }
    }

    /**
     * Undoes the last action
     *
     * @returns Previous play data state, or null if can't undo
     */
    undo(): PlayData | null {
        if (!this.canUndo()) {
            return null;
        }

        this.currentIndex--;
        return this.deepClone(this.history[this.currentIndex].playData);
    }

    /**
     * Redoes the last undone action
     *
     * @returns Next play data state, or null if can't redo
     */
    redo(): PlayData | null {
        if (!this.canRedo()) {
            return null;
        }

        this.currentIndex++;
        return this.deepClone(this.history[this.currentIndex].playData);
    }

    /**
     * Checks if undo is available
     */
    canUndo(): boolean {
        return this.currentIndex > 0;
    }

    /**
     * Checks if redo is available
     */
    canRedo(): boolean {
        return this.currentIndex < this.history.length - 1;
    }

    /**
     * Gets the current state
     */
    getCurrentState(): PlayData | null {
        if (this.currentIndex >= 0 && this.currentIndex < this.history.length) {
            return this.deepClone(this.history[this.currentIndex].playData);
        }
        return null;
    }

    /**
     * Clears all history
     */
    clear(): void {
        this.history = [];
        this.currentIndex = -1;
    }

    /**
     * Deep clones play data to prevent mutations
     */
    private deepClone(playData: PlayData): PlayData {
        return structuredClone(playData);
    }
}

/**
 * Gets canvas coordinates from a mouse event
 * Requirements: 5.4
 *
 * @param event - Mouse event
 * @param canvas - Canvas element
 * @returns Canvas coordinates
 */
export function getMousePosition(event: MouseEvent, canvas: HTMLCanvasElement): Position {
    const rect = canvas.getBoundingClientRect();
    return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
    };
}

/**
 * Gets canvas coordinates from a touch event
 * Requirements: 5.4
 *
 * @param event - Touch event
 * @param canvas - Canvas element
 * @returns Canvas coordinates of the first touch
 */
export function getTouchPosition(event: TouchEvent, canvas: HTMLCanvasElement): Position | null {
    if (event.touches.length === 0) {
        return null;
    }

    const rect = canvas.getBoundingClientRect();
    const touch = event.touches[0];
    return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
    };
}

/**
 * Converts event coordinates to rink coordinates
 *
 * @param event - Mouse or touch event
 * @param canvas - Canvas element
 * @param transform - Transformation context
 * @returns Rink coordinates
 */
export function getEventRinkPosition(
    event: MouseEvent | TouchEvent,
    canvas: HTMLCanvasElement,
    transform: TransformContext
): Position | null {
    let canvasPos: Position | null;

    if (event instanceof MouseEvent) {
        canvasPos = getMousePosition(event, canvas);
    } else {
        canvasPos = getTouchPosition(event, canvas);
    }

    if (!canvasPos) {
        return null;
    }

    return canvasToRink(canvasPos, transform);
}

/**
 * Tests if a point hits a player icon
 * Requirements: 5.4
 *
 * @param point - Point to test in rink coordinates
 * @param player - Player icon to test against
 * @param minHitRadiusFt - Minimum hit radius in feet (default: 0)
 * @returns True if point hits the player
 */
export function hitTestPlayer(
    point: Position,
    player: PlayerIcon,
    minHitRadiusFt = 0
): boolean {
    const r = Math.max(PLAYER_RADIUS_FT, minHitRadiusFt);
    const distance = Math.sqrt(
        Math.pow(point.x - player.position.x, 2) + Math.pow(point.y - player.position.y, 2)
    );
    return distance <= r;
}

/**
 * Tests if a point hits a drawing element
 * Requirements: 5.4
 *
 * @param point - Point to test in rink coordinates
 * @param drawing - Drawing element to test against
 * @param threshold - Hit detection threshold (default: HIT_THRESHOLD)
 * @returns True if point hits the drawing
 */
export function hitTestDrawing(
    point: Position,
    drawing: DrawingElement,
    threshold = HIT_THRESHOLD
): boolean {
    // Check each line segment in the drawing
    for (let i = 0; i < drawing.points.length - 1; i++) {
        const p1 = drawing.points[i];
        const p2 = drawing.points[i + 1];

        const distance = distanceToLineSegment(point, p1, p2);
        if (distance <= threshold) {
            return true;
        }
    }

    return false;
}

/**
 * Tests if a point hits a text annotation
 * Requirements: 5.4
 *
 * NOTE: This uses an approximation for text bounds. For pixel-perfect accuracy,
 * ctx.measureText() should be used, which would require refactoring to pass a
 * CanvasRenderingContext2D to this function. Current approximation works well
 * for typical use cases but may be slightly inaccurate for variable-width fonts.
 *
 * @param point - Point to test in rink coordinates
 * @param annotation - Text annotation to test against
 * @returns True if point hits the annotation
 */
export function hitTestAnnotation(
    point: Position,
    annotation: TextAnnotation
): boolean {
    // Estimate text bounds (approximation using average character width)
    // Most proportional fonts average ~0.6x fontSize for character width
    const charWidth = annotation.fontSize * 0.6;
    const textWidth = annotation.text.length * charWidth;
    const textHeight = annotation.fontSize;

    // Add small padding for easier selection
    const padding = annotation.fontSize * 0.2;

    // Check if point is within text bounds (with padding)
    return (
        point.x >= annotation.position.x - padding &&
        point.x <= annotation.position.x + textWidth + padding &&
        point.y >= annotation.position.y - textHeight - padding &&
        point.y <= annotation.position.y + padding
    );
}

/**
 * Tests if a point hits an equipment item
 * Requirements: 5.4
 *
 * @param point - Point to test in rink coordinates
 * @param item - Equipment item to test against
 * @param minHitRadiusFt - Minimum hit radius in feet (default: 0)
 * @returns True if point hits the equipment
 */
export function hitTestEquipment(
    point: Position,
    item: EquipmentItem,
    minHitRadiusFt = 0
): boolean {
    const r = Math.max(EQUIPMENT_RADIUS_FT[item.kind], minHitRadiusFt);
    return Math.hypot(point.x - item.position.x, point.y - item.position.y) <= r;
}

/**
 * Performs hit testing on all elements in play data
 * Requirements: 5.4
 *
 * @param point - Point to test in rink coordinates
 * @param playData - Play data containing all elements
 * @param minHitRadiusFt - Minimum hit radius in feet (default: 0)
 * @returns Hit test result with element information
 */
export function hitTest(
    point: Position,
    playData: PlayData,
    minHitRadiusFt = 0
): HitTestResult {
    // Test annotations first (top layer)
    for (const annotation of playData.annotations) {
        if (hitTestAnnotation(point, annotation)) {
            return {
                hit: true,
                elementId: annotation.id,
                elementType: "annotation",
                element: annotation,
            };
        }
    }

    // Test players
    for (const player of playData.players) {
        if (hitTestPlayer(point, player, minHitRadiusFt)) {
            return {
                hit: true,
                elementId: player.id,
                elementType: "player",
                element: player,
            };
        }
    }

    // Test equipment
    for (const item of playData.equipment) {
        if (hitTestEquipment(point, item, minHitRadiusFt)) {
            return {
                hit: true,
                elementId: item.id,
                elementType: "equipment",
                element: item,
            };
        }
    }

    // Test drawings (bottom layer)
    for (const drawing of playData.drawings) {
        if (hitTestDrawing(point, drawing, Math.max(HIT_THRESHOLD, minHitRadiusFt))) {
            return {
                hit: true,
                elementId: drawing.id,
                elementType: "drawing",
                element: drawing,
            };
        }
    }

    return { hit: false };
}

/**
 * Calculates the distance from a point to a line segment
 *
 * @param point - Point to test
 * @param lineStart - Start of line segment
 * @param lineEnd - End of line segment
 * @returns Distance from point to line segment
 */
function distanceToLineSegment(point: Position, lineStart: Position, lineEnd: Position): number {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    const lengthSquared = dx * dx + dy * dy;

    if (lengthSquared === 0) {
        // Line segment is a point
        return Math.sqrt(
            Math.pow(point.x - lineStart.x, 2) + Math.pow(point.y - lineStart.y, 2)
        );
    }

    // Calculate projection of point onto line segment
    let t =
        ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t));

    // Calculate closest point on line segment
    const closestX = lineStart.x + t * dx;
    const closestY = lineStart.y + t * dy;

    // Calculate distance
    return Math.sqrt(Math.pow(point.x - closestX, 2) + Math.pow(point.y - closestY, 2));
}

/**
 * Checks if a position is within the rink bounds
 *
 * @param position - Position to check in rink coordinates
 * @param rinkWidth - Rink width (default: 200)
 * @param rinkHeight - Rink height (default: 85)
 * @returns True if position is within bounds
 */
export function isWithinRinkBounds(
    position: Position,
    rinkWidth: number = 200,
    rinkHeight: number = 85
): boolean {
    return (
        position.x >= 0 &&
        position.x <= rinkWidth &&
        position.y >= 0 &&
        position.y <= rinkHeight
    );
}

/**
 * Clamps a position to an axis-aligned rectangle in rink feet.
 */
export function clampToRect(position: Position, rect: RinkRect): Position {
    return {
        x: Math.max(rect.x, Math.min(rect.x + rect.w, position.x)),
        y: Math.max(rect.y, Math.min(rect.y + rect.h, position.y)),
    };
}

/**
 * Clamps a position to stay within rink bounds: `clampToRect` over the rink.
 *
 * @param position - Position to clamp
 * @param rinkWidth - Rink width (default: 200)
 * @param rinkHeight - Rink height (default: 85)
 * @returns Clamped position
 */
export function clampToRinkBounds(
    position: Position,
    rinkWidth: number = 200,
    rinkHeight: number = 85
): Position {
    return clampToRect(position, { x: 0, y: 0, w: rinkWidth, h: rinkHeight });
}

/**
 * Where a dragged element lands: the pointer (clamped only to the rink by the
 * caller) minus the grab offset, then clamped to `rect`. Clamping the pointer
 * to `rect` first would stop the element `grabOffset` feet short of the edge.
 */
export function dragTarget(pointer: Position, grabOffset: Position, rect: RinkRect): Position {
    return clampToRect({ x: pointer.x - grabOffset.x, y: pointer.y - grabOffset.y }, rect);
}

/**
 * How far, in screen pixels, the pointer must travel from the grab point
 * before a press on an element becomes a drag. Measured on screen rather than
 * in rink feet so it feels the same at every viewport and pinch zoom: a fixed
 * 1 ft (the area tool's click test) is ~12 px on a zoomed-in drill area but
 * ~4 px on full ice. Below it, a press is a tap: it selects and never moves the
 * element, so a tap on an element outside the drill's area cannot clamp it in
 * (touch devices fire a touchmove on nearly every tap).
 */
export const DRAG_THRESHOLD_PX = 4;

/** Screen pixels as rink feet, through the viewport transform and the board's zoom. */
export function pxToRinkFt(px: number, transform: Pick<TransformContext, "scaleX" | "scaleY">, zoom: number): number {
    return px / (Math.min(transform.scaleX, transform.scaleY) * zoom);
}

/** Board zoom limits for a pinch */
export const PINCH_ZOOM_MIN = 0.5;
export const PINCH_ZOOM_MAX = 3;

/** The board's zoom/pan: a canvas point p appears on screen at zoom * p + pan. */
export interface BoardView {
    zoom: number;
    pan: Position;
}

/**
 * The view for a pinch in progress, from the view and the fingers' midpoint
 * (canvas-relative CSS pixels) and distance when the pinch started. The zoom
 * scales with the finger distance, clamped to [PINCH_ZOOM_MIN, PINCH_ZOOM_MAX]
 * first; the pan then keeps the canvas point that was under the starting
 * midpoint under the current one, so a still pinch zooms about the fingers
 * and a moving one zooms and pans together.
 */
export function pinchView(
    start: BoardView & { center: Position; distance: number },
    current: { center: Position; distance: number }
): BoardView {
    if (!(start.distance > 0) || !(start.zoom > 0)) return { zoom: start.zoom, pan: start.pan };
    const zoom = Math.max(PINCH_ZOOM_MIN, Math.min(PINCH_ZOOM_MAX, (start.zoom * current.distance) / start.distance));
    const ratio = zoom / start.zoom;
    return {
        zoom,
        pan: {
            x: current.center.x - (start.center.x - start.pan.x) * ratio,
            y: current.center.y - (start.center.y - start.pan.y) * ratio,
        },
    };
}

/** True once `pointer` is at least `thresholdFt` from `grab` (rink feet). */
export function pastDragThreshold(grab: Position, pointer: Position, thresholdFt: number): boolean {
    return Math.hypot(pointer.x - grab.x, pointer.y - grab.y) >= thresholdFt;
}

/**
 * Creates a debounced function that delays execution
 * Useful for auto-save functionality
 *
 * @param func - Function to debounce
 * @param delay - Delay in milliseconds
 * @returns Debounced function
 */
export function debounce<T extends (...args: never[]) => unknown>(
    func: T,
    delay: number
): (...args: Parameters<T>) => void {
    let timeoutId: NodeJS.Timeout | null = null;

    return (...args: Parameters<T>) => {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }

        timeoutId = setTimeout(() => {
            func(...args);
            timeoutId = null;
        }, delay);
    };
}

/**
 * Prevents default behavior and stops propagation for an event
 * Useful for preventing scrolling during touch interactions
 *
 * @param event - Event to prevent
 */
export function preventDefaultAndStop(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
}

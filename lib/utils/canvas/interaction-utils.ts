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
} from "@/types/practice-planner";
import { TransformContext, canvasToRink } from "./rink-renderer";

/**
 * Type for elements that can be selected
 */
export type SelectableElement = PlayerIcon | DrawingElement | TextAnnotation;

/**
 * Result of a hit detection test
 */
export interface HitTestResult {
    hit: boolean;
    elementId?: string;
    elementType?: "player" | "drawing" | "annotation";
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
        return {
            players: playData.players.map((p) => ({ ...p, position: { ...p.position } })),
            drawings: playData.drawings.map((d) => ({
                ...d,
                points: d.points.map((pt) => ({ ...pt })),
            })),
            annotations: playData.annotations.map((a) => ({
                ...a,
                position: { ...a.position },
            })),
        };
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
 * @returns True if point hits the player
 */
export function hitTestPlayer(
    point: Position,
    player: PlayerIcon
): boolean {
    const radius = 12; // Player icon radius in rink coordinates
    const distance = Math.sqrt(
        Math.pow(point.x - player.position.x, 2) + Math.pow(point.y - player.position.y, 2)
    );
    return distance <= radius;
}

/**
 * Tests if a point hits a drawing element
 * Requirements: 5.4
 *
 * @param point - Point to test in rink coordinates
 * @param drawing - Drawing element to test against
 * @returns True if point hits the drawing
 */
export function hitTestDrawing(
    point: Position,
    drawing: DrawingElement
): boolean {
    const hitThreshold = 5; // Hit detection threshold in rink coordinates

    // Check each line segment in the drawing
    for (let i = 0; i < drawing.points.length - 1; i++) {
        const p1 = drawing.points[i];
        const p2 = drawing.points[i + 1];

        const distance = distanceToLineSegment(point, p1, p2);
        if (distance <= hitThreshold) {
            return true;
        }
    }

    return false;
}

/**
 * Tests if a point hits a text annotation
 * Requirements: 5.4
 *
 * @param point - Point to test in rink coordinates
 * @param annotation - Text annotation to test against
 * @returns True if point hits the annotation
 */
export function hitTestAnnotation(
    point: Position,
    annotation: TextAnnotation
): boolean {
    // Estimate text bounds (rough approximation)
    const charWidth = annotation.fontSize * 0.6;
    const textWidth = annotation.text.length * charWidth;
    const textHeight = annotation.fontSize;

    // Check if point is within text bounds
    return (
        point.x >= annotation.position.x &&
        point.x <= annotation.position.x + textWidth &&
        point.y >= annotation.position.y - textHeight &&
        point.y <= annotation.position.y
    );
}

/**
 * Performs hit testing on all elements in play data
 * Requirements: 5.4
 *
 * @param point - Point to test in rink coordinates
 * @param playData - Play data containing all elements
 * @returns Hit test result with element information
 */
export function hitTest(
    point: Position,
    playData: PlayData
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

    // Test players (middle layer)
    for (const player of playData.players) {
        if (hitTestPlayer(point, player)) {
            return {
                hit: true,
                elementId: player.id,
                elementType: "player",
                element: player,
            };
        }
    }

    // Test drawings (bottom layer)
    for (const drawing of playData.drawings) {
        if (hitTestDrawing(point, drawing)) {
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
 * Clamps a position to stay within rink bounds
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
    return {
        x: Math.max(0, Math.min(rinkWidth, position.x)),
        y: Math.max(0, Math.min(rinkHeight, position.y)),
    };
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

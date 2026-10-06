"use client";

/**
 * Touch input for the rink board, moved out of RinkBoard unchanged in
 * behaviour: one finger acts like the mouse (tap tools wait for the finger
 * to lift), two fingers pinch to zoom and pan, and a second finger or a
 * touchcancel abandons whatever the first finger started. RinkBoard supplies
 * the pointer callbacks and applies the pinch's view.
 *
 * Requirements: 3.5
 */
import React, { useCallback, useRef } from "react";
import type { DrawingTool, Position } from "@/types/practice-planner";
import { DRAG_THRESHOLD_PX, pinchView, type BoardView } from "@/lib/utils/canvas/interaction-utils";

/**
 * Tools whose touch tap acts once (place, erase, ask for text). On touch they
 * wait for the finger to lift, so the first finger of a pinch never acts.
 */
export const TAP_TOOLS: ReadonlySet<DrawingTool> = new Set<DrawingTool>(["player", "equipment", "eraser", "text"]);

export interface BoardTouchOptions {
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    /** False until the board has a transform; touches are ignored until then */
    enabled: boolean;
    areaTool: boolean;
    selectedTool: DrawingTool;
    /** The board's zoom and pan, read when a pinch starts */
    scaleRef: React.RefObject<number>;
    panOffsetRef: React.RefObject<Position>;
    /** Applies a pinch's view (RinkBoard bounds the pan and updates its refs and state) */
    applyView: (view: BoardView) => void;
    /** A one-finger press, move and release, in client px (RinkBoard maps them like mouse events) */
    onPointerDown: (clientX: number, clientY: number) => void;
    onPointerMove: (clientX: number, clientY: number) => void;
    onPointerUp: () => void;
    /** A second finger or a touchcancel: drop any gesture in progress without committing it */
    onAbandon: () => void;
}

export interface BoardTouch {
    handleTouchStart: (event: React.TouchEvent<HTMLCanvasElement>) => void;
    handleTouchMove: (event: React.TouchEvent<HTMLCanvasElement>) => void;
    handleTouchEnd: (event: React.TouchEvent<HTMLCanvasElement>) => void;
    handleTouchCancel: () => void;
    /** Ends any pinch and drops a pending tap (the viewport changed) */
    resetGestures: () => void;
}

/** Distance between two touches, in client px */
function touchDistance(touch1: React.Touch, touch2: React.Touch): number {
    return Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
}

export function useBoardTouch(options: BoardTouchOptions): BoardTouch {
    const {
        canvasRef, enabled, areaTool, selectedTool, scaleRef, panOffsetRef,
        applyView, onPointerDown, onPointerMove, onPointerUp, onAbandon,
    } = options;
    // The view and fingers when the current pinch began (null = no pinch)
    const pinchStartRef = useRef<(BoardView & { center: Position; distance: number }) | null>(null);
    // A touch tap with a TAP_TOOLS tool, waiting for touchend (client px; null = none)
    const pendingTapRef = useRef<{ clientX: number; clientY: number } | null>(null);

    /**
     * Center point between two touches, relative to the canvas (the space
     * the zoom/pan transform works in)
     */
    const touchCenter = useCallback((touch1: React.Touch, touch2: React.Touch): Position => {
        const rect = canvasRef.current?.getBoundingClientRect();
        return {
            x: (touch1.clientX + touch2.clientX) / 2 - (rect?.left ?? 0),
            y: (touch1.clientY + touch2.clientY) / 2 - (rect?.top ?? 0),
        };
    }, [canvasRef]);

    /**
     * Starts a pinch from the current view and these touches when exactly two
     * are down, and ends it otherwise. Called whenever the finger count
     * changes, so a pinch never continues from a different pair of fingers.
     */
    const capturePinch = useCallback(
        (touches: React.TouchList) => {
            pinchStartRef.current = touches.length === 2
                ? {
                    zoom: scaleRef.current,
                    pan: panOffsetRef.current,
                    center: touchCenter(touches[0], touches[1]),
                    distance: touchDistance(touches[0], touches[1]),
                }
                : null;
        },
        [scaleRef, panOffsetRef, touchCenter]
    );

    const handleTouchStart = useCallback(
        (event: React.TouchEvent<HTMLCanvasElement>) => {
            if (!enabled || !canvasRef.current) return;

            // No preventDefault here: React registers touchstart/touchmove as
            // passive listeners, so it would throw on every move. The canvas's
            // `touch-action: none` is what stops scrolling and browser zoom.

            if (event.touches.length === 1) {
                pendingTapRef.current = null; // never replay an older, unfinished tap
                const { clientX, clientY } = event.touches[0];
                // Place / erase / text act on touchend, and only for a still,
                // one-finger tap: this finger may be the first of a pinch.
                if (!areaTool && TAP_TOOLS.has(selectedTool)) {
                    pendingTapRef.current = { clientX, clientY };
                    return;
                }
                // Select (drag), stroke and the area tool start now, like a mouse down
                onPointerDown(clientX, clientY);
            } else {
                pendingTapRef.current = null;
                // Two touches pinch to zoom or pan (Requirements: 3.5); a third
                // finger ends the pinch until the count is back to two.
                capturePinch(event.touches);
                // The pinch takes over: nothing the coach was dragging or
                // drawing may commit on the final touchend.
                onAbandon();
            }
        },
        [enabled, canvasRef, areaTool, selectedTool, capturePinch, onPointerDown, onAbandon]
    );

    const handleTouchMove = useCallback(
        (event: React.TouchEvent<HTMLCanvasElement>) => {
            if (!enabled || !canvasRef.current) return;

            // No preventDefault here: see handleTouchStart.

            if (event.touches.length === 1) {
                // A pending tap that travels past the drag threshold is not a tap
                const tap = pendingTapRef.current;
                const touch = event.touches[0];
                if (tap && Math.hypot(touch.clientX - tap.clientX, touch.clientY - tap.clientY) >= DRAG_THRESHOLD_PX) {
                    pendingTapRef.current = null;
                }
                // Single touch - treat like mouse move
                onPointerMove(touch.clientX, touch.clientY);
            } else if (event.touches.length === 2 && pinchStartRef.current) {
                // Two touches: zoom about the fingers' midpoint and pan with it
                // Requirements: 3.5
                applyView(pinchView(pinchStartRef.current, {
                    center: touchCenter(event.touches[0], event.touches[1]),
                    distance: touchDistance(event.touches[0], event.touches[1]),
                }));
            }
        },
        [enabled, canvasRef, onPointerMove, applyView, touchCenter]
    );

    const handleTouchEnd = useCallback(
        (event: React.TouchEvent<HTMLCanvasElement>) => {
            // Suppresses the compatibility mouse events and click after a tap.
            // A touchend the browser marks non-cancelable logs an error if
            // cancelled, so only cancel when it can be.
            if (event.cancelable) event.preventDefault();

            if (event.touches.length === 0) {
                // A still one-finger tap with a place / erase / text tool acts now
                const tap = pendingTapRef.current;
                pendingTapRef.current = null;
                if (tap) onPointerDown(tap.clientX, tap.clientY);
                // All touches ended - treat like mouse up
                onPointerUp();
                pinchStartRef.current = null;
            } else {
                // Fewer fingers remain: one ends the pinch; two (after a
                // third lifted) restart it from the pair that is left.
                capturePinch(event.touches);
            }
        },
        [onPointerDown, onPointerUp, capturePinch]
    );

    /** The browser took the touches away (e.g. a system gesture): drop the pending tap, the pinch and any interaction in progress. */
    const handleTouchCancel = useCallback(() => {
        pendingTapRef.current = null;
        pinchStartRef.current = null;
        onAbandon();
    }, [onAbandon]);

    const resetGestures = useCallback(() => {
        pinchStartRef.current = null;
        pendingTapRef.current = null;
    }, []);

    return { handleTouchStart, handleTouchMove, handleTouchEnd, handleTouchCancel, resetGestures };
}

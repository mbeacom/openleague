"use client";

/**
 * Gesture state for editing the selected line on the rink board (line
 * editing spec R3, R5): drag the whole line, an end, a bend or a freehand
 * anchor, or a "+" handle to add a bend. The geometry is pure
 * (lib/utils/canvas/line-editing.ts); this hook holds the gesture between
 * press and release, exposes the live preview, and commits one history
 * entry on release.
 */
import React, { useCallback, useRef, useState } from "react";
import type { DrawingElement, PlayData, Position, RinkRect } from "@/types/practice-planner";
import { findElement, replaceDrawing } from "@/lib/utils/canvas/element-ops";
import { drawingHitRadius, hitTestDrawing, pastDragThreshold } from "@/lib/utils/canvas/interaction-utils";
import {
    hitTestLineHandle,
    insertBend,
    lineHandles,
    moveLine,
    moveLinePoint,
    type LineHandle,
} from "@/lib/utils/canvas/line-editing";

export interface LinePress {
    /** The board's selected element (null = none); only a selected line has handles */
    selectedId: string | null;
    /** Pointer in rink feet, clamped to the rink */
    point: Position;
    /** The board's minimum hit radius in feet (MIN_HIT_RADIUS_PX at the current zoom) */
    hitRadiusFt: number;
}

export interface LineMove {
    /** The drill's ice area: every edited point stays inside it */
    area: RinkRect;
    /** DRAG_THRESHOLD_PX in feet: until the pointer passes it, a press edits nothing */
    thresholdFt: number;
}

export interface StrokeEditingOptions {
    /** The board's latest play data */
    playDataRef: React.RefObject<PlayData>;
    /** Records one history entry (RinkBoard's updatePlayData) */
    commit: (next: PlayData) => void;
}

export interface StrokeEditing {
    /** A Select press on the selected line's handles or body starts a gesture; false (and nothing) otherwise */
    press: (press: LinePress) => boolean;
    /** Starts a whole-line move on a line a press has just selected */
    grab: (stroke: DrawingElement, point: Position) => void;
    /** Updates the preview; false when no gesture is in progress */
    move: (pointer: Position, move: LineMove) => boolean;
    /** Commits the preview as one history entry, or nothing if it changed nothing */
    release: () => void;
    /** Drops the gesture without committing */
    cancel: () => void;
    /** The edited line while a gesture has moved it (null = none) */
    preview: DrawingElement | null;
    /** True from press to release or cancel */
    active: boolean;
}

interface Gesture {
    /** The line as it was at the press */
    stroke: DrawingElement;
    /** The handle pressed, or null for the line's body (a whole-line move) */
    handle: LineHandle | null;
    /** Where the press landed (rink feet) */
    grab: Position;
    /** True once the pointer passed the drag threshold */
    started: boolean;
}

/** The gesture's line with the pointer applied; a handle keeps its offset from the press. */
function editedStroke(g: Gesture, pointer: Position, area: RinkRect): DrawingElement {
    const delta = { x: pointer.x - g.grab.x, y: pointer.y - g.grab.y };
    if (!g.handle) return moveLine(g.stroke, delta, area);
    const target = { x: g.handle.position.x + delta.x, y: g.handle.position.y + delta.y };
    return g.handle.kind === "add"
        ? insertBend(g.stroke, g.handle.segment, target, area)
        : moveLinePoint(g.stroke, g.handle.index, target, area);
}

export function useStrokeEditing({ playDataRef, commit }: StrokeEditingOptions): StrokeEditing {
    const gestureRef = useRef<Gesture | null>(null);
    // The preview in a ref too, so a release in the same frame as the last move reads it
    const previewRef = useRef<DrawingElement | null>(null);
    const [preview, setPreviewState] = useState<DrawingElement | null>(null);
    const [active, setActive] = useState(false);

    const setPreview = useCallback((stroke: DrawingElement | null) => {
        previewRef.current = stroke;
        setPreviewState(stroke);
    }, []);

    const begin = useCallback(
        (stroke: DrawingElement, handle: LineHandle | null, point: Position) => {
            gestureRef.current = { stroke, handle, grab: point, started: false };
            setPreview(null);
            setActive(true);
        },
        [setPreview]
    );

    const press = useCallback(
        ({ selectedId, point, hitRadiusFt }: LinePress): boolean => {
            if (!selectedId) return false;
            const found = findElement(playDataRef.current, selectedId);
            if (!found || found.kind !== "drawing") return false;
            const stroke = found.element;
            // Handles first, then the line's body (R3)
            const handle = hitTestLineHandle(lineHandles(stroke), point, hitRadiusFt);
            if (handle) {
                begin(stroke, handle, point);
                return true;
            }
            if (hitTestDrawing(point, stroke, drawingHitRadius(hitRadiusFt))) {
                begin(stroke, null, point);
                return true;
            }
            return false;
        },
        [playDataRef, begin]
    );

    const grab = useCallback((stroke: DrawingElement, point: Position) => begin(stroke, null, point), [begin]);

    const move = useCallback(
        (pointer: Position, { area, thresholdFt }: LineMove): boolean => {
            const g = gestureRef.current;
            if (!g) return false;
            // A press that never travels the drag threshold is a tap: it edits nothing
            if (!g.started) {
                if (!pastDragThreshold(g.grab, pointer, thresholdFt)) return true;
                g.started = true;
            }
            setPreview(editedStroke(g, pointer, area));
            return true;
        },
        [setPreview]
    );

    const release = useCallback(() => {
        const g = gestureRef.current;
        const edited = previewRef.current;
        gestureRef.current = null;
        setPreview(null);
        setActive(false);
        if (!g?.started || !edited || edited === g.stroke) return;
        const current = playDataRef.current;
        const next = replaceDrawing(current, edited);
        if (next !== current) commit(next);
    }, [playDataRef, commit, setPreview]);

    const cancel = useCallback(() => {
        gestureRef.current = null;
        setPreview(null);
        setActive(false);
    }, [setPreview]);

    return { press, grab, move, release, cancel, preview, active };
}

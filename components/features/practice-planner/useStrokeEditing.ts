"use client";

/**
 * Gesture state for editing lines on the rink board (line editing spec R3,
 * R4, R5): drag the whole selected line, an end, a bend or a freehand
 * anchor, or a "+" handle to add a bend; double-tap a bend to remove it;
 * snap a line end (drawn or dragged) to a player, equipment or another
 * line's end, with a ring on the target. The geometry is pure
 * (lib/utils/canvas/line-editing.ts); this hook holds the gesture between
 * press and release, exposes the live preview and the ring, and commits one
 * history entry per edit.
 */
import React, { useCallback, useRef, useState } from "react";
import type { DrawingElement, PlayData, Position, RinkRect } from "@/types/practice-planner";
import { findElement, replaceDrawing } from "@/lib/utils/canvas/element-ops";
import { drawingHitRadius, hitTestDrawing, pastDragThreshold } from "@/lib/utils/canvas/interaction-utils";
import {
    findSnapTarget,
    hitTestLineHandle,
    insertBend,
    isDoubleTap,
    lineHandles,
    moveLine,
    moveLinePoint,
    removeBend,
    type LineHandle,
    type SnapOptions,
    type SnapTarget,
    type TapRecord,
} from "@/lib/utils/canvas/line-editing";

export interface LinePress {
    /** The board's selected element (null = none); only a selected line has handles */
    selectedId: string | null;
    /** Pointer in rink feet, clamped to the rink */
    point: Position;
    /** The board's minimum hit radius in feet (MIN_HIT_RADIUS_PX at the current zoom) */
    hitRadiusFt: number;
    /** When the press happened, in milliseconds (for the double-tap) */
    time: number;
}

export interface LineMove {
    /** The drill's ice area: every edited point stays inside it */
    area: RinkRect;
    /** DRAG_THRESHOLD_PX in feet: until the pointer passes it, a press edits nothing */
    thresholdFt: number;
    /** Snap radius in feet for a dragged end (snapRadiusFt) */
    snapRadiusFt: number;
    /** Alt/Option held on this move: no snapping */
    bypassSnap: boolean;
}

export interface StrokeEditingOptions {
    /** The board's latest play data */
    playDataRef: React.RefObject<PlayData>;
    /** Records one history entry (RinkBoard's updatePlayData) */
    commit: (next: PlayData) => void;
}

export interface StrokeEditing {
    /** A Select press on the selected line's handles or body starts a gesture (or removes a double-tapped bend); false (and nothing) otherwise */
    press: (press: LinePress) => boolean;
    /** Starts a whole-line move on a line a press has just selected */
    grab: (stroke: DrawingElement, point: Position) => void;
    /** Updates the preview; false when no gesture is in progress */
    move: (pointer: Position, move: LineMove) => boolean;
    /** Commits the preview as one history entry, or nothing if it changed nothing */
    release: () => void;
    /** Drops the gesture and the ring without committing */
    cancel: () => void;
    /** Snaps a line end being drawn: the target (shown with the ring) or null */
    snapLineEnd: (point: Position, options: SnapOptions) => Position | null;
    /** The last snap target (null = none), read when a drawn line is released */
    currentSnap: () => Position | null;
    /** Hides the ring */
    clearSnap: () => void;
    /** The edited line while a gesture has moved it (null = none) */
    preview: DrawingElement | null;
    /** True from press to release or cancel */
    active: boolean;
    /** The target a line end is snapping to, with its drawn size for the ring (null = none) */
    snapRing: SnapTarget | null;
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

const sameTarget = (a: SnapTarget | null, b: SnapTarget | null) =>
    a === b ||
    (a !== null && b !== null && a.position.x === b.position.x && a.position.y === b.position.y && a.radiusFt === b.radiusFt);

export function useStrokeEditing({ playDataRef, commit }: StrokeEditingOptions): StrokeEditing {
    const gestureRef = useRef<Gesture | null>(null);
    // The preview and the snap in refs too, so a release in the same frame as the last move reads them
    const previewRef = useRef<DrawingElement | null>(null);
    const snapRef = useRef<SnapTarget | null>(null);
    // The last press on a bend or corner that did not become a drag (for the double-tap)
    const lastTapRef = useRef<TapRecord | null>(null);
    const [preview, setPreviewState] = useState<DrawingElement | null>(null);
    const [active, setActive] = useState(false);
    const [snapRing, setSnapRing] = useState<SnapTarget | null>(null);

    const setPreview = useCallback((stroke: DrawingElement | null) => {
        previewRef.current = stroke;
        setPreviewState(stroke);
    }, []);

    const setSnap = useCallback((target: SnapTarget | null) => {
        snapRef.current = target;
        setSnapRing((current) => (sameTarget(current, target) ? current : target));
    }, []);

    const snapLineEnd = useCallback(
        (point: Position, options: SnapOptions): Position | null => {
            const target = findSnapTarget(playDataRef.current, point, options);
            setSnap(target);
            return target?.position ?? null;
        },
        [playDataRef, setSnap]
    );

    const currentSnap = useCallback(() => snapRef.current?.position ?? null, []);
    const clearSnap = useCallback(() => setSnap(null), [setSnap]);

    const begin = useCallback(
        (stroke: DrawingElement, handle: LineHandle | null, point: Position) => {
            gestureRef.current = { stroke, handle, grab: point, started: false };
            setPreview(null);
            setActive(true);
        },
        [setPreview]
    );

    const press = useCallback(
        ({ selectedId, point, hitRadiusFt, time }: LinePress): boolean => {
            if (!selectedId) return false;
            const data = playDataRef.current;
            const found = findElement(data, selectedId);
            if (!found || found.kind !== "drawing") return false;
            const stroke = found.element;
            // Handles first, then the line's body (R3)
            const handle = hitTestLineHandle(lineHandles(stroke), point, hitRadiusFt);
            if (handle?.kind === "bend" || handle?.kind === "corner") {
                const tap: TapRecord = { id: stroke.id, index: handle.index, position: point, time };
                if (isDoubleTap(lastTapRef.current, tap, hitRadiusFt)) {
                    // A double-tap removes the bend or corner: one history entry, no drag (R3)
                    lastTapRef.current = null;
                    const next = replaceDrawing(data, removeBend(stroke, handle.index));
                    if (next !== data) commit(next);
                    return true;
                }
                lastTapRef.current = tap;
            } else {
                lastTapRef.current = null;
            }
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
        [playDataRef, begin, commit]
    );

    const grab = useCallback((stroke: DrawingElement, point: Position) => begin(stroke, null, point), [begin]);

    const move = useCallback(
        (pointer: Position, { area, thresholdFt, snapRadiusFt, bypassSnap }: LineMove): boolean => {
            const g = gestureRef.current;
            if (!g) return false;
            // A press that never travels the drag threshold is a tap: it edits nothing
            if (!g.started) {
                if (!pastDragThreshold(g.grab, pointer, thresholdFt)) return true;
                g.started = true;
            }
            const handle = g.handle;
            if (handle && handle.kind === "end") {
                // A dragged end snaps (R4); bends, anchors and whole-line moves don't
                const target = { x: handle.position.x + pointer.x - g.grab.x, y: handle.position.y + pointer.y - g.grab.y };
                // An end never snaps onto the line's other end (or whatever sits there), whatever its length: it would
                // collapse a 2-point line, and close a curve or polyline onto itself by accident.
                const { points } = g.stroke;
                const excludePoint = points[handle.index === 0 ? points.length - 1 : 0];
                const snap = snapLineEnd(target, { radiusFt: snapRadiusFt, excludeId: g.stroke.id, excludePoint, bypass: bypassSnap, rect: area });
                setPreview(moveLinePoint(g.stroke, handle.index, snap ?? target, area));
                return true;
            }
            setPreview(editedStroke(g, pointer, area));
            return true;
        },
        [setPreview, snapLineEnd]
    );

    const release = useCallback(() => {
        const g = gestureRef.current;
        const edited = previewRef.current;
        gestureRef.current = null;
        setPreview(null);
        setActive(false);
        setSnap(null);
        // A drag is not a tap: the next press on the bend starts a new double-tap
        if (g?.started) lastTapRef.current = null;
        if (!g?.started || !edited || edited === g.stroke) return;
        const current = playDataRef.current;
        const next = replaceDrawing(current, edited);
        if (next !== current) commit(next);
    }, [playDataRef, commit, setPreview, setSnap]);

    // The double-tap record is kept on purpose: the board cancels before every Select press, so clearing it here would
    // make a second tap on a bend never count.
    const cancel = useCallback(() => {
        gestureRef.current = null;
        setPreview(null);
        setActive(false);
        setSnap(null);
    }, [setPreview, setSnap]);

    return { press, grab, move, release, cancel, snapLineEnd, currentSnap, clearSnap, preview, active, snapRing };
}

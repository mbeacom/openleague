"use client";

/**
 * RinkBoard Component
 *
 * Core canvas-based component for visualizing and editing hockey plays.
 * Provides interactive rink board with drawing tools, player placement,
 * and annotation capabilities.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 5.1, 5.2, 5.4, 5.5, 3.5
 */

import React, { useRef, useEffect, useState, useCallback, useMemo, forwardRef, useImperativeHandle } from "react";
import type {
    IceArea,
    PlayData,
    DrawingTool,
    EquipmentKind,
    PlayerRole,
    Position,
    StrokeOptions,
    TextAnnotation,
} from "@/types/practice-planner";
import {
    createTransformContext,
    FULL_RINK,
    TransformContext,
    screenToRink,
} from "@/lib/utils/canvas/rink-renderer";
import { drawBoardFrame, drawStroke } from "@/lib/utils/canvas/drawing-utils";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { areaMaskRect, areaRect, editViewport, withArea } from "@/lib/utils/ice-area";
import {
    findElement,
    finishStroke,
    isAreaClick,
    limitMessage,
    moveElement,
    placeEquipment,
    placePlayer,
    rectFromDrag,
    removeElement,
    updateElement as applyElementPatch,
    type ElementPatch,
} from "@/lib/utils/canvas/element-ops";
import {
    HistoryManager,
    hitTest,
    getMousePosition,
    clampToRect,
    dragTarget,
    DRAG_THRESHOLD_PX,
    pastDragThreshold,
    pxToRinkFt,
    pinchView,
    clampPan,
    viewportContentRect,
} from "@/lib/utils/canvas/interaction-utils";

/**
 * Props for the RinkBoard component
 */
export interface RinkBoardProps {
    mode: "edit" | "view";
    playData: PlayData;
    onPlayDataChange?: (data: PlayData) => void;
    selectedTool?: DrawingTool;
    selectedColor?: string;
    width?: number;
    height?: number;
    onUndoRedoStateChange?: (canUndo: boolean, canRedo: boolean) => void;
    /** Role placed by the player tool (default "X") */
    playerRole?: PlayerRole;
    /** Action/path/end used by the stroke tool */
    strokeOptions?: StrokeOptions;
    /** Kind placed by the equipment tool (default "cone") */
    equipmentKind?: EquipmentKind;
    /** Fires whenever the selected element changes (null = nothing selected) */
    onSelectionChange?: (id: string | null) => void;
    /** Fires with a user-facing message when an add is blocked by a play limit */
    onLimitReached?: (message: string) => void;
    /** While true, a drag draws the drill's custom ice area over the whole rink */
    areaTool?: boolean;
    /** Fires once each time the area tool finishes a rectangle */
    onAreaDrawn?: () => void;
}

/**
 * Handle interface for imperative methods exposed via ref
 * Allows parent components to trigger undo/redo/clear actions
 */
export interface RinkBoardHandle {
    undo: () => void;
    redo: () => void;
    clear: () => void;
    /** Patches an element's editable fields; recorded in undo history */
    updateElement: (id: string, patch: ElementPatch) => void;
    /** Sets the drill's ice area (undefined = full ice); recorded in undo history */
    setArea: (area: IceArea | undefined) => void;
}

/**
 * Default dimensions for the canvas
 */
const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 400;
/** True when a key event came from a text-entry control (shortcuts must not fire). */
function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target.isContentEditable
    );
}

const DEFAULT_COLOR = "#212121";
const DEFAULT_STROKE_OPTIONS: StrokeOptions = { action: "skate", path: "freehand", end: "arrow" };
/**
 * Tools whose touch tap acts once (place, erase, ask for text). On touch they
 * wait for the finger to lift, so the first finger of a pinch never acts.
 */
const TAP_TOOLS: ReadonlySet<DrawingTool> = new Set<DrawingTool>(["player", "equipment", "eraser", "text"]);
/** Minimum on-screen hit radius in CSS pixels, so small glyphs stay tappable */
const MIN_HIT_RADIUS_PX = 22;

/**
 * RinkBoard Component
 *
 * Requirements: 1.1 - Display visual hockey rink board
 */
export const RinkBoard = forwardRef<RinkBoardHandle, RinkBoardProps>(function RinkBoard(
    {
        mode,
        playData,
        onPlayDataChange,
        selectedTool = "select",
        selectedColor = DEFAULT_COLOR,
        width = DEFAULT_WIDTH,
        height = DEFAULT_HEIGHT,
        onUndoRedoStateChange,
        playerRole = "X",
        strokeOptions = DEFAULT_STROKE_OPTIONS,
        equipmentKind = "cone",
        onSelectionChange,
        onLimitReached,
        areaTool = false,
        onAreaDrawn,
    },
    ref
) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [canvasSize, setCanvasSize] = useState({ width, height });
    const [transform, setTransform] = useState<TransformContext | null>(null);
    const historyManagerRef = useRef<HistoryManager>(new HistoryManager());
    const animationFrameRef = useRef<number | null>(null);

    // State for interaction
    const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [currentDrawingPoints, setCurrentDrawingPoints] = useState<Position[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState<Position | null>(null);

    // Temporary drag position state (for visual feedback during drag, committed on mouseUp)
    const [dragPreviewPosition, setDragPreviewPosition] = useState<Position | null>(null);

    // Area-tool drag in progress (rink feet, clamped to the rink)
    const [areaDrag, setAreaDrag] = useState<{ start: Position; end: Position } | null>(null);

    // Zoom/pan (pinch) state
    const [scale, setScale] = useState(1);
    const [panOffset, setPanOffset] = useState<Position>({ x: 0, y: 0 });
    // The view and fingers when the current pinch began (null = no pinch)
    const pinchStartRef = useRef<{ zoom: number; pan: Position; center: Position; distance: number } | null>(null);
    // A touch tap with a TAP_TOOLS tool, waiting for touchend (client px; null = none)
    const pendingTapRef = useRef<{ clientX: number; clientY: number } | null>(null);

    // Refs to avoid stale closures in event handlers
    // These refs hold the latest values without triggering callback recreation
    const playDataRef = useRef(playData);
    const isDraggingRef = useRef(isDragging);
    const selectedElementIdRef = useRef(selectedElementId);
    const dragOffsetRef = useRef(dragOffset);
    // Where the current press grabbed an element (rink feet); the drag starts past DRAG_THRESHOLD_PX from it
    const grabPointRef = useRef<Position | null>(null);
    const scaleRef = useRef(scale);
    const panOffsetRef = useRef(panOffset);

    // Keep refs in sync with state
    useEffect(() => { playDataRef.current = playData; }, [playData]);
    useEffect(() => { isDraggingRef.current = isDragging; }, [isDragging]);
    useEffect(() => { selectedElementIdRef.current = selectedElementId; }, [selectedElementId]);
    useEffect(() => { dragOffsetRef.current = dragOffset; }, [dragOffset]);
    useEffect(() => { scaleRef.current = scale; }, [scale]);

    /**
     * Get rink position from event, accounting for zoom/pan transformations.
     * Applies inverse transformation to mouse/touch coordinates before converting to rink space.
     * This ensures accurate coordinate calculation after zooming or panning.
     */
    const getTransformedRinkPosition = useCallback(
        (event: MouseEvent | TouchEvent, canvas: HTMLCanvasElement, transformCtx: TransformContext): Position | null => {
            // Get canvas position from mouse or touch event
            let canvasPos: Position | null;
            if (event instanceof MouseEvent) {
                canvasPos = getMousePosition(event, canvas);
            } else {
                // TouchEvent - get position from first touch
                if (event.touches.length === 0) return null;
                const rect = canvas.getBoundingClientRect();
                const touch = event.touches[0];
                canvasPos = {
                    x: touch.clientX - rect.left,
                    y: touch.clientY - rect.top,
                };
            }
            if (!canvasPos) return null;

            // Undo zoom/pan, then the viewport transform
            return screenToRink(canvasPos, transformCtx, scaleRef.current, panOffsetRef.current);
        },
        []
    );

    /**
     * Handle canvas resize for responsive sizing
     * Requirements: 1.1
     */
    const handleResize = useCallback(() => {
        if (!containerRef.current) return;

        const containerWidth = containerRef.current.clientWidth;
        const containerHeight = containerRef.current.clientHeight || height;

        setCanvasSize({
            width: containerWidth,
            height: containerHeight,
        });
    }, [height]);

    /**
     * Initialize canvas and set up resize observer
     * Requirements: 1.1
     */
    useEffect(() => {
        handleResize();

        const resizeObserver = new ResizeObserver(handleResize);
        if (containerRef.current) {
            resizeObserver.observe(containerRef.current);
        }

        return () => {
            resizeObserver.disconnect();
        };
    }, [handleResize]);

    /**
     * Viewport: in edit mode, the drill's ice area plus a 5 ft margin (the
     * whole rink for full ice); in view mode, and while the area tool is on,
     * always the whole rink. Keyed on the four numbers, not the area object,
     * which is new on every edit.
     */
    const viewport = mode === "edit" && !areaTool ? editViewport(playData.area) : FULL_RINK;
    const { x: viewX, y: viewY, w: viewW, h: viewH } = viewport;
    useEffect(() => {
        setTransform(
            createTransformContext(canvasSize.width, canvasSize.height, 20, { x: viewX, y: viewY, w: viewW, h: viewH })
        );
    }, [canvasSize, viewX, viewY, viewW, viewH]);

    /**
     * Bounds a pan for `zoom` to the content the board draws (the viewport above,
     * through the live transform): it can't be dragged off the canvas.
     */
    const boundPan = useCallback(
        (pan: Position, zoom: number): Position => transform
            ? clampPan(
                pan,
                zoom,
                { width: transform.canvasWidth, height: transform.canvasHeight },
                viewportContentRect(transform, { x: viewX, y: viewY, w: viewW, h: viewH })
            )
            : pan,
        [transform, viewX, viewY, viewW, viewH]
    );
    // The pan in use: the stored one re-bounded, so a canvas resize (a new
    // transform at the same zoom) can't leave the content off-screen.
    const viewPan = useMemo(() => boundPan(panOffset, scale), [boundPan, panOffset, scale]);
    useEffect(() => { panOffsetRef.current = viewPan; }, [viewPan]);

    // A new viewport starts unzoomed: a pinch-zoom/pan made for the old one would
    // misframe it. A pinch in progress ends too, or its next move would re-apply it.
    useEffect(() => {
        pinchStartRef.current = null;
        pendingTapRef.current = null;
        setScale(1);
        setPanOffset({ x: 0, y: 0 });
    }, [viewX, viewY, viewW, viewH]);

    /**
     * Initialize history with initial play data
     */
    useEffect(() => {
        if (mode === "edit") {
            historyManagerRef.current.push(playData);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Only on mount - intentionally empty to avoid re-initializing history

    /**
     * Rendering function
     * Requirements: 1.1 - Render rink background
     */
    const render = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || !transform) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Drag preview is visual only; the move is committed on mouseUp.
        // drawBoardFrame clears under an identity transform, then sets the
        // zoom/pan transform every frame (a resize resets context state).
        const renderData = isDragging && selectedElementId && dragPreviewPosition
            ? moveElement(playData, selectedElementId, dragPreviewPosition)
            : playData;
        drawBoardFrame(ctx, transform, renderData, {
            selectedId: selectedElementId || undefined,
            zoom: scale,
            pan: viewPan,
            maskRect: areaMaskRect(areaDrag, playData.area),
        });

        // Draw current stroke in progress
        if (isDrawing && currentDrawingPoints.length > 1) {
            const previewPoints = strokeOptions.path === "straight"
                ? [currentDrawingPoints[0], currentDrawingPoints[currentDrawingPoints.length - 1]]
                : currentDrawingPoints;
            drawStroke(ctx, { ...strokeOptions, points: previewPoints, color: selectedColor, strokeWidth: 2 }, transform);
        }
    }, [
        transform,
        playData,
        selectedElementId,
        isDrawing,
        isDragging,
        dragPreviewPosition,
        currentDrawingPoints,
        selectedColor,
        strokeOptions,
        scale,
        viewPan,
        areaDrag,
    ]);

    /**
     * Set up rendering loop with requestAnimationFrame
     * Requirements: 1.1
     */
    useEffect(() => {
        const animate = () => {
            render();
            animationFrameRef.current = requestAnimationFrame(animate);
        };

        animationFrameRef.current = requestAnimationFrame(animate);

        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [render]);

    /**
     * Handle play data updates
     */
    const updatePlayData = useCallback(
        (newData: PlayData) => {
            if (mode === "edit" && onPlayDataChange) {
                onPlayDataChange(newData);
                historyManagerRef.current.push(newData);

                // Notify parent of undo/redo state changes
                if (onUndoRedoStateChange) {
                    onUndoRedoStateChange(
                        historyManagerRef.current.canUndo(),
                        historyManagerRef.current.canRedo()
                    );
                }
            }
        },
        [mode, onPlayDataChange, onUndoRedoStateChange]
    );

    /**
     * Handle undo operation
     * Requirements: 5.5
     */
    const handleUndo = useCallback(() => {
        if (mode === "view") return;

        const previousState = historyManagerRef.current.undo();
        if (previousState && onPlayDataChange) {
            onPlayDataChange(previousState);

            // Notify parent of undo/redo state changes
            if (onUndoRedoStateChange) {
                onUndoRedoStateChange(
                    historyManagerRef.current.canUndo(),
                    historyManagerRef.current.canRedo()
                );
            }
        }
    }, [mode, onPlayDataChange, onUndoRedoStateChange]);

    /**
     * Handle redo operation
     * Requirements: 5.5
     */
    const handleRedo = useCallback(() => {
        if (mode === "view") return;

        const nextState = historyManagerRef.current.redo();
        if (nextState && onPlayDataChange) {
            onPlayDataChange(nextState);

            // Notify parent of undo/redo state changes
            if (onUndoRedoStateChange) {
                onUndoRedoStateChange(
                    historyManagerRef.current.canUndo(),
                    historyManagerRef.current.canRedo()
                );
            }
        }
    }, [mode, onPlayDataChange, onUndoRedoStateChange]);

    /**
     * Handle clear operation - removes all elements from the canvas
     * Requirements: 5.3
     */
    const handleClear = useCallback(() => {
        if (mode === "view") return;

        // Clear removes the drawing, not the drill's setup: the ice area stays
        const clearedData: PlayData = withArea(createEmptyPlayData(), playDataRef.current.area);

        if (onPlayDataChange) {
            onPlayDataChange(clearedData);
            historyManagerRef.current.push(clearedData);

            // Notify parent of undo/redo state changes
            if (onUndoRedoStateChange) {
                onUndoRedoStateChange(
                    historyManagerRef.current.canUndo(),
                    historyManagerRef.current.canRedo()
                );
            }
        }
    }, [mode, onPlayDataChange, onUndoRedoStateChange]);

    /**
     * Expose imperative methods to parent components via ref
     * Allows toolbar to trigger undo/redo/clear actions on RinkBoard
     */
    useImperativeHandle(ref, () => ({
        undo: handleUndo,
        redo: handleRedo,
        clear: handleClear,
        updateElement: (id: string, patch: ElementPatch) => {
            const current = playDataRef.current;
            const next = applyElementPatch(current, id, patch);
            if (next !== current) updatePlayData(next);
        },
        setArea: (area: IceArea | undefined) => {
            const current = playDataRef.current;
            const next = withArea(current, area);
            if (next !== current) updatePlayData(next);
        },
    }), [handleUndo, handleRedo, handleClear, updatePlayData]);

    /**
     * Report selection changes; leaving the select tool clears the selection
     * and abandons any stroke in progress.
     */
    // Undo/redo/eraser can remove the selected element; drop the stale selection.
    useEffect(() => {
        if (selectedElementId && !findElement(playData, selectedElementId)) setSelectedElementId(null);
    }, [playData, selectedElementId]);
    useEffect(() => { onSelectionChange?.(selectedElementId); }, [selectedElementId, onSelectionChange]);
    useEffect(() => {
        if (selectedTool !== "select" || areaTool) setSelectedElementId(null);
        setIsDrawing(false);
        setCurrentDrawingPoints([]);
        setAreaDrag(null);
    }, [selectedTool, areaTool]);

    /** Hit radius in feet that stays MIN_HIT_RADIUS_PX on screen at any zoom */
    const minHitRadiusFt = useCallback(
        () => (transform ? pxToRinkFt(MIN_HIT_RADIUS_PX, transform, scaleRef.current) : 0),
        [transform]
    );

    /**
     * Generate unique ID for new elements
     */
    const generateId = useCallback(() => {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }, []);

    /**
     * Handle mouse down event
     * Requirements: 1.2, 1.3, 1.4, 5.1, 5.2, 5.4
     */
    const handleMouseDown = useCallback(
        (event: React.MouseEvent<HTMLCanvasElement>) => {
            if (mode === "view" || !transform || !canvasRef.current) return;

            // Touch taps never move focus off a text field (touchend is
            // preventDefault-ed), so blur it here: its blur commit then lands
            // on the element selected *before* this press changes the selection.
            const active = document.activeElement;
            if (active instanceof HTMLElement && isEditableTarget(active) && !canvasRef.current.contains(active)) {
                active.blur();
            }

            const rinkPos = getTransformedRinkPosition(event.nativeEvent, canvasRef.current, transform);
            if (!rinkPos) return;

            // Hit tests use the pointer clamped only to the rink, so an element
            // outside the drill's ice area stays selectable and erasable.
            // Anything placed is clamped to the area.
            const hitPos = clampToRect(rinkPos, FULL_RINK);
            const clampedPos = clampToRect(rinkPos, areaRect(playData.area));

            if (areaTool) {
                // The area tool works over the whole rink, whatever the current area
                setAreaDrag({ start: hitPos, end: hitPos });
                return;
            }

            // Handle different tools
            switch (selectedTool) {
                case "select":
                    // Handle selection
                    // Requirements: 5.4
                    // A gesture whose release was never seen (e.g. released
                    // outside the window) must not leak its preview into this one.
                    setDragPreviewPosition(null);
                    setIsDragging(false);
                    setDragOffset(null);
                    setIsDrawing(false);
                    setCurrentDrawingPoints([]);
                    grabPointRef.current = null;
                    const hitResult = hitTest(hitPos, playData, minHitRadiusFt());
                    if (hitResult.hit && hitResult.elementId) {
                        setSelectedElementId(hitResult.elementId);
                        setIsDragging(true);
                        grabPointRef.current = hitPos;

                        // Drag offset keeps the grab point under the pointer.
                        // Strokes have no position and are not draggable.
                        const found = findElement(playData, hitResult.elementId);
                        if (found && found.kind !== "drawing") {
                            setDragOffset({
                                x: hitPos.x - found.element.position.x,
                                y: hitPos.y - found.element.position.y,
                            });
                        }
                    } else {
                        // Clicked on empty space, deselect
                        setSelectedElementId(null);
                    }
                    break;

                case "player": {
                    // Place player icon
                    // Requirements: 1.2
                    const blocked = limitMessage(playData, "player");
                    if (blocked) { onLimitReached?.(blocked); break; }
                    updatePlayData(placePlayer(playData, clampedPos, playerRole, generateId()));
                    break;
                }

                case "equipment": {
                    const blocked = limitMessage(playData, "equipment");
                    if (blocked) { onLimitReached?.(blocked); break; }
                    updatePlayData(placeEquipment(playData, clampedPos, equipmentKind, generateId()));
                    break;
                }

                case "stroke": {
                    // Start drawing; the limit is checked when the stroke finishes
                    // Requirements: 1.3, 5.1, 5.2
                    setIsDrawing(true);
                    setCurrentDrawingPoints([clampedPos]);
                    break;
                }

                case "text": {
                    // Add text annotation
                    // Requirements: 1.4
                    const blocked = limitMessage(playData, "annotation");
                    if (blocked) { onLimitReached?.(blocked); break; }
                    const text = prompt("Enter text annotation:");
                    if (text && text.trim()) {
                        const newAnnotation: TextAnnotation = {
                            id: generateId(),
                            text: text.trim(),
                            position: clampedPos,
                            fontSize: 14,
                            color: selectedColor,
                        };
                        updatePlayData({
                            ...playData,
                            annotations: [...playData.annotations, newAnnotation],
                        });
                    }
                    break;
                }

                case "eraser": {
                    // Erase element
                    // Requirements: 5.4
                    const eraserHitResult = hitTest(hitPos, playData, minHitRadiusFt());
                    if (eraserHitResult.hit && eraserHitResult.elementId) {
                        updatePlayData(removeElement(playData, eraserHitResult.elementId));
                    }
                    break;
                }
            }
        },
        [
            mode,
            transform,
            areaTool,
            selectedTool,
            selectedColor,
            playData,
            playerRole,
            equipmentKind,
            onLimitReached,
            updatePlayData,
            generateId,
            getTransformedRinkPosition,
            minHitRadiusFt,
        ]
    );

    /**
     * Handle mouse move event
     * Requirements: 1.3, 5.1, 5.2
     *
     * Uses refs for drag-related state to avoid stale closures.
     * During dragging, only updates the preview position (visual feedback).
     * The actual data change is committed on mouseUp for performance.
     */
    const handleMouseMove = useCallback(
        (event: React.MouseEvent<HTMLCanvasElement>) => {
            if (mode === "view" || !transform || !canvasRef.current) return;

            const rinkPos = getTransformedRinkPosition(event.nativeEvent, canvasRef.current, transform);
            if (!rinkPos) return;

            const area = areaRect(playDataRef.current.area);

            if (areaDrag) {
                setAreaDrag({ start: areaDrag.start, end: clampToRect(rinkPos, FULL_RINK) });
                return;
            }

            // Continue drawing if in drawing mode; stroke points stay in the area
            if (isDrawing && selectedTool === "stroke") {
                setCurrentDrawingPoints((prev) => [...prev, clampToRect(rinkPos, area)]);
            }

            // Drag preview: pointer clamped only to the rink, minus the grab
            // offset, then clamped to the area, so the element can reach the
            // area's edge exactly. Committed on mouseUp. The preview starts
            // only once the pointer is DRAG_THRESHOLD_PX from the grab point,
            // so a tap (or a touch tap's zero-distance touchmove) never clamps
            // an element outside the area into it; once started, it follows
            // the pointer even back inside the threshold.
            // Requirements: 5.4
            const grabOffset = dragOffsetRef.current;
            if (isDraggingRef.current && selectedElementIdRef.current && grabOffset) {
                const pointer = clampToRect(rinkPos, FULL_RINK);
                const grab = grabPointRef.current;
                const started = !grab || pastDragThreshold(grab, pointer, pxToRinkFt(DRAG_THRESHOLD_PX, transform, scaleRef.current));
                setDragPreviewPosition((prev) => (prev === null && !started ? null : dragTarget(pointer, grabOffset, area)));
            }
        },
        [mode, transform, isDrawing, selectedTool, areaDrag, getTransformedRinkPosition]
    );

    /**
     * Handle mouse up event
     * Requirements: 1.3, 5.1, 5.2
     *
     * Commits drag changes to playData on mouseUp (performance optimization).
     * During drag, only the preview position is updated for visual feedback.
     * An area-tool drag commits the custom area (undoable) and reports it;
     * a click (under 1 ft in both axes) records nothing and leaves the tool on.
     */
    const handleMouseUp = useCallback(
        () => {
            if (mode === "view" || !transform) return;

            if (areaDrag) {
                setAreaDrag(null);
                if (isAreaClick(areaDrag.start, areaDrag.end)) return;
                const current = playDataRef.current;
                const next = withArea(current, { kind: "custom", rect: rectFromDrag(areaDrag.start, areaDrag.end) });
                if (next !== current) updatePlayData(next);
                onAreaDrawn?.();
                return;
            }

            // Finish drawing (taps shorter than 1 ft come back unchanged and are dropped)
            if (isDrawing && selectedTool === "stroke") {
                const finished = finishStroke(playData, currentDrawingPoints, strokeOptions, selectedColor, generateId());
                if (finished !== playData) {
                    const blocked = limitMessage(playData, "drawing");
                    if (blocked) onLimitReached?.(blocked);
                    else updatePlayData(finished);
                }
            }

            // Commit drag changes to playData (single history entry); a drag
            // that ends where the element already is records nothing
            if (isDragging && selectedElementId && dragPreviewPosition) {
                const current = playDataRef.current;
                const next = moveElement(current, selectedElementId, dragPreviewPosition);
                if (next !== current) updatePlayData(next);
            }

            // Reset drawing state
            setIsDrawing(false);
            setCurrentDrawingPoints([]);

            // Reset dragging state
            setIsDragging(false);
            setDragOffset(null);
            setDragPreviewPosition(null);
            grabPointRef.current = null;
        },
        [
            mode,
            transform,
            areaDrag,
            isDrawing,
            isDragging,
            selectedElementId,
            dragPreviewPosition,
            currentDrawingPoints,
            selectedTool,
            selectedColor,
            strokeOptions,
            playData,
            onLimitReached,
            onAreaDrawn,
            updatePlayData,
            generateId,
        ]
    );

    /**
     * A drag, stroke or area drag released outside the canvas ends the same way a canvas
     * release does. Releases on the canvas are left to its own handler (they
     * also bubble here, before React has re-rendered).
     */
    useEffect(() => {
        if (!isDragging && !isDrawing && !areaDrag) return;
        const onWindowMouseUp = (event: MouseEvent) => {
            if (event.target instanceof Node && canvasRef.current?.contains(event.target)) return;
            handleMouseUp();
        };
        window.addEventListener("mouseup", onWindowMouseUp);
        return () => window.removeEventListener("mouseup", onWindowMouseUp);
    }, [isDragging, isDrawing, areaDrag, handleMouseUp]);

    /**
     * Handle keyboard delete key for selected elements
     * Requirements: 5.4
     */
    useEffect(() => {
        if (mode === "view" || !selectedElementId) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (isEditableTarget(event.target)) return;
            if (event.key === "Delete" || event.key === "Backspace") {
                event.preventDefault();

                // Remove selected element
                updatePlayData(removeElement(playData, selectedElementId));
                setSelectedElementId(null);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [mode, selectedElementId, playData, updatePlayData]);

    /**
     * Handle keyboard shortcuts for undo/redo
     * Requirements: 5.5
     */
    useEffect(() => {
        if (mode === "view") return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (isEditableTarget(event.target)) return;
            // Undo: Ctrl+Z (Windows/Linux) or Cmd+Z (Mac)
            if ((event.ctrlKey || event.metaKey) && event.key === "z" && !event.shiftKey) {
                event.preventDefault();
                handleUndo();
            }

            // Redo: Ctrl+Shift+Z or Ctrl+Y (Windows/Linux) or Cmd+Shift+Z (Mac)
            if (
                ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === "z") ||
                (event.ctrlKey && event.key === "y")
            ) {
                event.preventDefault();
                handleRedo();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [mode, handleUndo, handleRedo]);

    /**
     * Calculate distance between two touch points
     */
    const getTouchDistance = useCallback((touch1: React.Touch, touch2: React.Touch): number => {
        const dx = touch1.clientX - touch2.clientX;
        const dy = touch1.clientY - touch2.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }, []);

    /**
     * Center point between two touches, relative to the canvas (the space
     * the zoom/pan transform works in)
     */
    const getTouchCenter = useCallback((touch1: React.Touch, touch2: React.Touch): Position => {
        const rect = canvasRef.current?.getBoundingClientRect();
        return {
            x: (touch1.clientX + touch2.clientX) / 2 - (rect?.left ?? 0),
            y: (touch1.clientY + touch2.clientY) / 2 - (rect?.top ?? 0),
        };
    }, []);

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
                    center: getTouchCenter(touches[0], touches[1]),
                    distance: getTouchDistance(touches[0], touches[1]),
                }
                : null;
        },
        [getTouchCenter, getTouchDistance]
    );

    /** Runs handleMouseDown for a touch point (it maps the point through zoom/pan). */
    const simulateMouseDown = useCallback(
        (clientX: number, clientY: number) => {
            handleMouseDown({
                nativeEvent: new MouseEvent("mousedown", { clientX, clientY }),
                preventDefault: () => { /* No-op: touch preventDefault handled at parent level */ },
                stopPropagation: () => { /* No-op: propagation control not needed for simulated events */ },
            } as React.MouseEvent<HTMLCanvasElement>);
        },
        [handleMouseDown]
    );

    /**
     * Abandons any area drag, element drag or stroke in progress, so a later
     * touchend or mouse event cannot commit a rectangle, a move or a line the
     * coach never meant. A drag's preview is visual only, so dropping it leaves
     * the element where it was, with no history entry; the selection stays.
     * Shared by the pinch takeover and touchcancel so they cannot drift.
     */
    const abandonTransientInteraction = useCallback(() => {
        setAreaDrag(null);
        setIsDragging(false);
        isDraggingRef.current = false;
        setDragOffset(null);
        setDragPreviewPosition(null);
        grabPointRef.current = null;
        setIsDrawing(false);
        setCurrentDrawingPoints([]);
    }, []);

    /**
     * Handle touch start event
     * Requirements: 3.5
     */
    const handleTouchStart = useCallback(
        (event: React.TouchEvent<HTMLCanvasElement>) => {
            if (!transform || !canvasRef.current) return;

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
                simulateMouseDown(clientX, clientY);
            } else {
                pendingTapRef.current = null;
                // Two touches pinch to zoom or pan (Requirements: 3.5); a third
                // finger ends the pinch until the count is back to two.
                capturePinch(event.touches);
                // The pinch takes over: nothing the coach was dragging or
                // drawing may commit on the final touchend.
                abandonTransientInteraction();
            }
        },
        [transform, areaTool, selectedTool, capturePinch, simulateMouseDown, abandonTransientInteraction]
    );

    /**
     * Handle touch move event
     * Requirements: 3.5
     */
    const handleTouchMove = useCallback(
        (event: React.TouchEvent<HTMLCanvasElement>) => {
            if (!transform || !canvasRef.current) return;

            // No preventDefault here: React registers touchstart/touchmove as
            // passive listeners, so it would throw on every move. The canvas's
            // `touch-action: none` is what stops scrolling and browser zoom.

            if (event.touches.length === 1) {
                // A pending tap that travels past the drag threshold is not a tap
                const tap = pendingTapRef.current;
                const touch = event.touches[0];
                if (tap && Math.hypot(touch.clientX - tap.clientX, touch.clientY - tap.clientY) >= DRAG_THRESHOLD_PX) {
                    pendingTapRef.current = null;
                }
                // Single touch - treat like mouse move
                const mouseEvent = new MouseEvent("mousemove", {
                    clientX: event.touches[0].clientX,
                    clientY: event.touches[0].clientY,
                });
                handleMouseMove({
                    nativeEvent: mouseEvent,
                    preventDefault: () => { },
                    stopPropagation: () => { },
                } as React.MouseEvent<HTMLCanvasElement>);
            } else if (event.touches.length === 2 && pinchStartRef.current) {
                // Two touches: zoom about the fingers' midpoint and pan with it
                // Requirements: 3.5
                // The anchored pan is then bounded, so the rink can't be pinched off-screen.
                const view = pinchView(pinchStartRef.current, {
                    center: getTouchCenter(event.touches[0], event.touches[1]),
                    distance: getTouchDistance(event.touches[0], event.touches[1]),
                });
                const pan = boundPan(view.pan, view.zoom);
                // The refs follow at once, so a tap right after the pinch maps through the new view.
                scaleRef.current = view.zoom;
                panOffsetRef.current = pan;
                setScale(view.zoom);
                setPanOffset(pan);
            }
        },
        [transform, getTouchDistance, getTouchCenter, handleMouseMove, boundPan]
    );

    /**
     * Handle touch end event
     * Requirements: 3.5
     */
    const handleTouchEnd = useCallback(
        (event: React.TouchEvent<HTMLCanvasElement>) => {
            event.preventDefault();

            if (event.touches.length === 0) {
                // A still one-finger tap with a place / erase / text tool acts now
                const tap = pendingTapRef.current;
                pendingTapRef.current = null;
                if (tap) simulateMouseDown(tap.clientX, tap.clientY);
                // All touches ended - treat like mouse up
                handleMouseUp();
                pinchStartRef.current = null;
            } else {
                // Fewer fingers remain: one ends the pinch; two (after a
                // third lifted) restart it from the pair that is left.
                capturePinch(event.touches);
            }
        },
        [handleMouseUp, simulateMouseDown, capturePinch]
    );

    /** The browser took the touches away (e.g. a system gesture): drop the pending tap, the pinch and any interaction in progress. */
    const handleTouchCancel = useCallback(() => {
        pendingTapRef.current = null;
        pinchStartRef.current = null;
        abandonTransientInteraction();
    }, [abandonTransientInteraction]);

    return (
        <div
            ref={containerRef}
            style={{
                width: "100%",
                height: height,
                position: "relative",
                touchAction: "none", // Prevent default touch behaviors
                overflow: "hidden",
            }}
        >
            <canvas
                ref={canvasRef}
                width={canvasSize.width}
                height={canvasSize.height}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchCancel}
                style={{
                    display: "block",
                    cursor: mode === "edit" ? "crosshair" : "default",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                }}
            />
        </div>
    );
});

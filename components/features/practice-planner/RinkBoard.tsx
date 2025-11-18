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

import React, { useRef, useEffect, useState, useCallback } from "react";
import {
    PlayData,
    DrawingTool,
    Position,
    PlayerIcon,
    DrawingElement,
    TextAnnotation,
} from "@/types/practice-planner";
import {
    createTransformContext,
    drawRink,
    TransformContext,
    rinkToCanvas,
} from "@/lib/utils/canvas/rink-renderer";
import { drawAllElements } from "@/lib/utils/canvas/drawing-utils";
import {
    HistoryManager,
    hitTest,
    getEventRinkPosition,
    clampToRinkBounds,
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
}

/**
 * Default dimensions for the canvas
 */
const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 400;
const DEFAULT_COLOR = "#000000";

/**
 * RinkBoard Component
 *
 * Requirements: 1.1 - Display visual hockey rink board
 */
export function RinkBoard({
    mode,
    playData,
    onPlayDataChange,
    selectedTool = "select",
    selectedColor = DEFAULT_COLOR,
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
    onUndoRedoStateChange,
}: RinkBoardProps) {
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

    // Touch interaction state
    const [touchStartDistance, setTouchStartDistance] = useState<number | null>(null);
    const [initialScale, setInitialScale] = useState(1);
    const [scale, setScale] = useState(1);
    const [panOffset, setPanOffset] = useState<Position>({ x: 0, y: 0 });
    const [lastTouchCenter, setLastTouchCenter] = useState<Position | null>(null);

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
     * Update transform context when canvas size changes
     */
    useEffect(() => {
        const newTransform = createTransformContext(canvasSize.width, canvasSize.height);
        setTransform(newTransform);
    }, [canvasSize]);

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

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw rink background
        drawRink(ctx, transform);

        // Draw all elements
        drawAllElements(
            ctx,
            playData.players,
            playData.drawings,
            playData.annotations,
            transform,
            selectedElementId || undefined
        );

        // Draw current drawing in progress
        if (isDrawing && currentDrawingPoints.length > 0) {
            ctx.strokeStyle = selectedColor;
            ctx.lineWidth = 2;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";

            ctx.beginPath();
            const startCanvas = rinkToCanvas(currentDrawingPoints[0], transform);
            ctx.moveTo(startCanvas.x, startCanvas.y);

            for (let i = 1; i < currentDrawingPoints.length; i++) {
                const pointCanvas = rinkToCanvas(currentDrawingPoints[i], transform);
                ctx.lineTo(pointCanvas.x, pointCanvas.y);
            }

            ctx.stroke();
        }
    }, [
        transform,
        playData,
        selectedElementId,
        isDrawing,
        currentDrawingPoints,
        selectedColor,
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

            const rinkPos = getEventRinkPosition(event.nativeEvent, canvasRef.current, transform);
            if (!rinkPos) return;

            const clampedPos = clampToRinkBounds(rinkPos);

            // Handle different tools
            switch (selectedTool) {
                case "select":
                    // Handle selection
                    // Requirements: 5.4
                    const hitResult = hitTest(clampedPos, playData);
                    if (hitResult.hit && hitResult.elementId) {
                        setSelectedElementId(hitResult.elementId);
                        setIsDragging(true);

                        // Calculate drag offset for smooth dragging
                        if (hitResult.elementType === "player") {
                            const player = playData.players.find((p) => p.id === hitResult.elementId);
                            if (player) {
                                setDragOffset({
                                    x: clampedPos.x - player.position.x,
                                    y: clampedPos.y - player.position.y,
                                });
                            }
                        } else if (hitResult.elementType === "annotation") {
                            const annotation = playData.annotations.find(
                                (a) => a.id === hitResult.elementId
                            );
                            if (annotation) {
                                setDragOffset({
                                    x: clampedPos.x - annotation.position.x,
                                    y: clampedPos.y - annotation.position.y,
                                });
                            }
                        }
                    } else {
                        // Clicked on empty space, deselect
                        setSelectedElementId(null);
                    }
                    break;

                case "player":
                    // Place player icon
                    // Requirements: 1.2
                    const newPlayer: PlayerIcon = {
                        id: generateId(),
                        position: clampedPos,
                        label: String.fromCharCode(65 + playData.players.length % 26), // A, B, C, etc.
                        color: selectedColor,
                    };
                    updatePlayData({
                        ...playData,
                        players: [...playData.players, newPlayer],
                    });
                    break;

                case "line":
                case "curve":
                case "arrow":
                    // Start drawing
                    // Requirements: 1.3, 5.1, 5.2
                    setIsDrawing(true);
                    setCurrentDrawingPoints([clampedPos]);
                    break;

                case "text":
                    // Add text annotation
                    // Requirements: 1.4
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

                case "eraser":
                    // Erase element
                    // Requirements: 5.4
                    const eraserHitResult = hitTest(clampedPos, playData);
                    if (eraserHitResult.hit && eraserHitResult.elementId) {
                        const newPlayData = {
                            ...playData,
                            players: eraserHitResult.elementType === "player"
                                ? playData.players.filter((p) => p.id !== eraserHitResult.elementId)
                                : playData.players,
                            drawings: eraserHitResult.elementType === "drawing"
                                ? playData.drawings.filter((d) => d.id !== eraserHitResult.elementId)
                                : playData.drawings,
                            annotations: eraserHitResult.elementType === "annotation"
                                ? playData.annotations.filter((a) => a.id !== eraserHitResult.elementId)
                                : playData.annotations,
                        };

                        updatePlayData(newPlayData);
                    }
                    break;
            }
        },
        [
            mode,
            transform,
            selectedTool,
            selectedColor,
            playData,
            updatePlayData,
            generateId,
        ]
    );

    /**
     * Handle mouse move event
     * Requirements: 1.3, 5.1, 5.2
     */
    const handleMouseMove = useCallback(
        (event: React.MouseEvent<HTMLCanvasElement>) => {
            if (mode === "view" || !transform || !canvasRef.current) return;

            const rinkPos = getEventRinkPosition(event.nativeEvent, canvasRef.current, transform);
            if (!rinkPos) return;

            const clampedPos = clampToRinkBounds(rinkPos);

            // Continue drawing if in drawing mode
            if (isDrawing && (selectedTool === "line" || selectedTool === "curve" || selectedTool === "arrow")) {
                setCurrentDrawingPoints((prev) => [...prev, clampedPos]);
            }

            // Handle dragging selected elements
            // Requirements: 5.4
            if (isDragging && selectedElementId && dragOffset) {
                const newPosition = {
                    x: clampedPos.x - dragOffset.x,
                    y: clampedPos.y - dragOffset.y,
                };
                const clampedNewPos = clampToRinkBounds(newPosition);

                const newPlayData = { ...playData };

                // Update player position
                const playerIndex = playData.players.findIndex((p) => p.id === selectedElementId);
                if (playerIndex !== -1) {
                    newPlayData.players = [...playData.players];
                    newPlayData.players[playerIndex] = {
                        ...newPlayData.players[playerIndex],
                        position: clampedNewPos,
                    };
                    updatePlayData(newPlayData);
                    return;
                }

                // Update annotation position
                const annotationIndex = playData.annotations.findIndex(
                    (a) => a.id === selectedElementId
                );
                if (annotationIndex !== -1) {
                    const updatedAnnotations = [...playData.annotations];
                    updatedAnnotations[annotationIndex] = {
                        ...updatedAnnotations[annotationIndex],
                        position: clampedNewPos,
                    };
                    updatePlayData({
                        ...playData,
                        annotations: updatedAnnotations,
                    });
                }
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [mode, transform, isDrawing, selectedTool]
        // Note: Intentionally omitting dragOffset, isDragging, playData, selectedElementId, updatePlayData
        // to avoid infinite re-render loops. These are used within the callback but should not trigger recreation.
    );

    /**
     * Handle mouse up event
     * Requirements: 1.3, 5.1, 5.2
     */
    const handleMouseUp = useCallback(
        () => {
            if (mode === "view" || !transform) return;

            // Finish drawing
            if (isDrawing && currentDrawingPoints.length >= 2) {
                const newDrawing: DrawingElement = {
                    id: generateId(),
                    type: selectedTool as "line" | "curve" | "arrow",
                    points: currentDrawingPoints,
                    color: selectedColor,
                    strokeWidth: 2,
                };

                updatePlayData({
                    ...playData,
                    drawings: [...playData.drawings, newDrawing],
                });
            }

            // Reset drawing state
            setIsDrawing(false);
            setCurrentDrawingPoints([]);

            // Reset dragging state
            setIsDragging(false);
            setDragOffset(null);
        },
        [
            mode,
            transform,
            isDrawing,
            currentDrawingPoints,
            selectedTool,
            selectedColor,
            playData,
            updatePlayData,
            generateId,
        ]
    );

    /**
     * Handle keyboard delete key for selected elements
     * Requirements: 5.4
     */
    useEffect(() => {
        if (mode === "view" || !selectedElementId) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Delete" || event.key === "Backspace") {
                event.preventDefault();

                // Remove selected element
                updatePlayData({
                    ...playData,
                    players: playData.players.filter((p) => p.id !== selectedElementId),
                    drawings: playData.drawings.filter((d) => d.id !== selectedElementId),
                    annotations: playData.annotations.filter(
                        (a) => a.id !== selectedElementId
                    ),
                });
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
     * Calculate center point between two touches
     */
    const getTouchCenter = useCallback((touch1: React.Touch, touch2: React.Touch): Position => {
        return {
            x: (touch1.clientX + touch2.clientX) / 2,
            y: (touch1.clientY + touch2.clientY) / 2,
        };
    }, []);

    /**
     * Handle touch start event
     * Requirements: 3.5
     */
    const handleTouchStart = useCallback(
        (event: React.TouchEvent<HTMLCanvasElement>) => {
            if (!transform || !canvasRef.current) return;

            event.preventDefault();

            if (event.touches.length === 1) {
                // Single touch - treat like mouse down
                const rinkPos = getEventRinkPosition(
                    event.nativeEvent,
                    canvasRef.current,
                    transform
                );
                if (!rinkPos) return;

                // Simulate mouse event for single touch
                const mouseEvent = new MouseEvent("mousedown", {
                    clientX: event.touches[0].clientX,
                    clientY: event.touches[0].clientY,
                });
                handleMouseDown({
                    nativeEvent: mouseEvent,
                    preventDefault: () => { },
                    stopPropagation: () => { },
                } as React.MouseEvent<HTMLCanvasElement>);
            } else if (event.touches.length === 2) {
                // Two touches - pinch to zoom or pan
                // Requirements: 3.5
                const distance = getTouchDistance(event.touches[0], event.touches[1]);
                setTouchStartDistance(distance);
                setInitialScale(scale);

                const center = getTouchCenter(event.touches[0], event.touches[1]);
                setLastTouchCenter(center);
            }
        },
        [transform, scale, getTouchDistance, getTouchCenter, handleMouseDown]
    );

    /**
     * Handle touch move event
     * Requirements: 3.5
     */
    const handleTouchMove = useCallback(
        (event: React.TouchEvent<HTMLCanvasElement>) => {
            if (!transform || !canvasRef.current) return;

            event.preventDefault();

            if (event.touches.length === 1) {
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
            } else if (event.touches.length === 2 && touchStartDistance !== null) {
                // Two touches - handle pinch zoom and pan
                // Requirements: 3.5
                const currentDistance = getTouchDistance(event.touches[0], event.touches[1]);
                const currentCenter = getTouchCenter(event.touches[0], event.touches[1]);

                // Calculate zoom
                const zoomFactor = currentDistance / touchStartDistance;
                const newScale = Math.max(0.5, Math.min(3, initialScale * zoomFactor));
                setScale(newScale);

                // Calculate pan
                if (lastTouchCenter) {
                    const dx = currentCenter.x - lastTouchCenter.x;
                    const dy = currentCenter.y - lastTouchCenter.y;
                    setPanOffset((prev) => ({
                        x: prev.x + dx,
                        y: prev.y + dy,
                    }));
                }

                setLastTouchCenter(currentCenter);
            }
        },
        [
            transform,
            touchStartDistance,
            initialScale,
            lastTouchCenter,
            getTouchDistance,
            getTouchCenter,
            handleMouseMove,
        ]
    );

    /**
     * Handle touch end event
     * Requirements: 3.5
     */
    const handleTouchEnd = useCallback(
        (event: React.TouchEvent<HTMLCanvasElement>) => {
            event.preventDefault();

            if (event.touches.length === 0) {
                // All touches ended - treat like mouse up
                handleMouseUp();

                // Reset touch state
                setTouchStartDistance(null);
                setLastTouchCenter(null);
            } else if (event.touches.length === 1) {
                // One touch remaining - reset pinch state
                setTouchStartDistance(null);
                setLastTouchCenter(null);
            }
        },
        [handleMouseUp]
    );

    /**
     * Apply zoom and pan transformations to canvas context
     */
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Apply transformations
        ctx.setTransform(scale, 0, 0, scale, panOffset.x, panOffset.y);
    }, [scale, panOffset]);

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
                style={{
                    display: "block",
                    cursor: mode === "edit" ? "crosshair" : "default",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                }}
            />
        </div>
    );
}

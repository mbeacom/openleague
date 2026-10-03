/**
 * Tests for RinkBoard component
 *
 * Basic smoke tests to verify the component renders and initializes correctly.
 */

import React from "react";
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { RinkBoard, type RinkBoardHandle, type RinkBoardProps } from "@/components/features/practice-planner/RinkBoard";
import { PlayData } from "@/types/practice-planner";
import { createEmptyPlayData, strokeFromV1Type } from "@/lib/utils/play-data";
import { createTransformContext, rinkToCanvas } from "@/lib/utils/canvas/rink-renderer";
import { ROLE_DEFAULT_COLORS } from "@/lib/utils/canvas/notation";

// Mock ResizeObserver
class ResizeObserverMock {
    observe() { /* No-op: Mock implementation for testing */ }
    unobserve() { /* No-op: Mock implementation for testing */ }
    disconnect() { /* No-op: Mock implementation for testing */ }
}

// Mock canvas context
const mockCanvasContext = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineCap: 'butt',
    lineJoin: 'miter',
    globalAlpha: 1,
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    arc: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 100 })),
    roundRect: vi.fn(),
    drawImage: vi.fn(),
    setTransform: vi.fn(),
};

beforeAll(() => {
    global.ResizeObserver = ResizeObserverMock as any;

    // Mock requestAnimationFrame - return a unique ID but don't execute callback
    let rafId = 0;
    global.requestAnimationFrame = vi.fn(() => {
        return ++rafId;
    }) as any;

    global.cancelAnimationFrame = vi.fn();

    // Mock canvas getContext - must be in beforeAll before any renders
    if (typeof HTMLCanvasElement !== 'undefined') {
        HTMLCanvasElement.prototype.getContext = vi.fn(() => mockCanvasContext as any);
    }

    // Mock createElement for canvas caching
    const originalCreateElement = document.createElement.bind(document);
    document.createElement = vi.fn((tagName: string) => {
        const element = originalCreateElement(tagName);
        if (tagName === 'canvas') {
            (element as any).getContext = vi.fn(() => mockCanvasContext as any);
        }
        return element;
    }) as any;
});

describe("RinkBoard", () => {
    const mockPlayData: PlayData = {
        version: 2,
        players: [],
        drawings: [],
        equipment: [],
        annotations: [],
    };

    it("renders canvas element in view mode", () => {
        const { container } = render(
            <RinkBoard mode="view" playData={mockPlayData} />
        );

        const canvas = container.querySelector("canvas");
        expect(canvas).toBeInTheDocument();
    });

    it("renders canvas element in edit mode", () => {
        const mockOnChange = vi.fn();
        const { container } = render(
            <RinkBoard
                mode="edit"
                playData={mockPlayData}
                onPlayDataChange={mockOnChange}
            />
        );

        const canvas = container.querySelector("canvas");
        expect(canvas).toBeInTheDocument();
    });

    it("applies correct cursor style in edit mode", () => {
        const mockOnChange = vi.fn();
        const { container } = render(
            <RinkBoard
                mode="edit"
                playData={mockPlayData}
                onPlayDataChange={mockOnChange}
            />
        );

        const canvas = container.querySelector("canvas");
        expect(canvas).toHaveStyle({ cursor: "crosshair" });
    });

    it("applies correct cursor style in view mode", () => {
        const { container } = render(
            <RinkBoard mode="view" playData={mockPlayData} />
        );

        const canvas = container.querySelector("canvas");
        expect(canvas).toHaveStyle({ cursor: "default" });
    });

    it("renders with custom dimensions", () => {
        const { container } = render(
            <RinkBoard
                mode="view"
                playData={mockPlayData}
                width={1000}
                height={500}
            />
        );

        const canvas = container.querySelector("canvas");
        expect(canvas).toBeInTheDocument();
    });

    it("renders with player icons", () => {
        const playDataWithPlayer: PlayData = {
            version: 2,
            equipment: [],
            players: [
                {
                    id: "player-1",
                    position: { x: 100, y: 42.5 },
                    role: "X",
                    label: "C",
                    color: "#FF0000",
                },
            ],
            drawings: [],
            annotations: [],
        };

        const { container } = render(
            <RinkBoard mode="view" playData={playDataWithPlayer} />
        );

        const canvas = container.querySelector("canvas");
        expect(canvas).toBeInTheDocument();
    });

    it("renders with drawings", () => {
        const playDataWithDrawing: PlayData = {
            version: 2,
            equipment: [],
            players: [],
            drawings: [
                {
                    id: "draw-1",
                    ...strokeFromV1Type("arrow"),
                    points: [
                        { x: 100, y: 42.5 },
                        { x: 150, y: 42.5 },
                    ],
                    color: "#0000FF",
                    strokeWidth: 2,
                },
            ],
            annotations: [],
        };

        const { container } = render(
            <RinkBoard mode="view" playData={playDataWithDrawing} />
        );

        const canvas = container.querySelector("canvas");
        expect(canvas).toBeInTheDocument();
    });

    it("renders with annotations", () => {
        const playDataWithAnnotation: PlayData = {
            version: 2,
            equipment: [],
            players: [],
            drawings: [],
            annotations: [
                {
                    id: "text-1",
                    text: "Breakout drill",
                    position: { x: 50, y: 20 },
                    fontSize: 14,
                    color: "#000000",
                },
            ],
        };

        const { container } = render(
            <RinkBoard mode="view" playData={playDataWithAnnotation} />
        );

        const canvas = container.querySelector("canvas");
        expect(canvas).toBeInTheDocument();
    });
});

describe("hockey notation tools", () => {
    // Restore only these two spies: vi.restoreAllMocks() could also reset the
    // file's getContext vi.fn mocks, depending on the Vitest version.
    let widthSpy: ReturnType<typeof vi.spyOn>;
    let heightSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
        widthSpy = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800);
        heightSpy = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(400);
    });
    afterEach(() => {
        widthSpy.mockRestore();
        heightSpy.mockRestore();
    });

    function setup(props: Partial<RinkBoardProps> = {}) {
        const onPlayDataChange = vi.fn();
        const ref = React.createRef<RinkBoardHandle>();
        const utils = render(
            <RinkBoard ref={ref} mode="edit" width={800} height={400} playData={createEmptyPlayData()} onPlayDataChange={onPlayDataChange} {...props} />
        );
        const canvas = utils.container.querySelector("canvas")!;
        canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 400, right: 800, bottom: 400, x: 0, y: 0, toJSON: () => ({}) });
        const at = (x: number, y: number) => {
            const p = rinkToCanvas({ x, y }, createTransformContext(800, 400));
            return { clientX: p.x, clientY: p.y };
        };
        return { ...utils, canvas, at, onPlayDataChange, ref };
    }

    // PROBE: written and passed first (pointer -> rink mapping works in jsdom).
    it("places a player with the chosen role (pointer → rink mapping works)", () => {
        const { canvas, at, onPlayDataChange } = setup({ selectedTool: "player", playerRole: "D" });
        fireEvent.mouseDown(canvas, at(50, 40));
        expect(onPlayDataChange).toHaveBeenCalledTimes(1);
        const data = onPlayDataChange.mock.calls[0][0];
        expect(data.players[0]).toMatchObject({ role: "D", color: ROLE_DEFAULT_COLORS.D });
        expect(data.players[0].position.x).toBeCloseTo(50, 0);
    });

    it("blocks the 51st cone and reports the limit", () => {
        const cones = Array.from({ length: 50 }, (_, i) => ({ id: `c${i}`, kind: "cone" as const, position: { x: 1, y: 1 }, rotation: 0 }));
        const onLimitReached = vi.fn();
        const { canvas, at, onPlayDataChange } = setup({
            playData: { ...createEmptyPlayData(), equipment: cones },
            selectedTool: "equipment",
            equipmentKind: "cone",
            onLimitReached,
        });
        fireEvent.mouseDown(canvas, at(100, 40));
        expect(onPlayDataChange).not.toHaveBeenCalled();
        expect(onLimitReached).toHaveBeenCalledWith(expect.stringMatching(/50 equipment/));
    });

    it("places the chosen equipment kind", () => {
        const { canvas, at, onPlayDataChange } = setup({ selectedTool: "equipment", equipmentKind: "net" });
        fireEvent.mouseDown(canvas, at(100, 40));
        expect(onPlayDataChange).toHaveBeenCalledTimes(1);
        expect(onPlayDataChange.mock.calls[0][0].equipment[0]).toMatchObject({ kind: "net", rotation: 0 });
    });

    it("stores a straight stroke with the chosen options", () => {
        const { canvas, at, onPlayDataChange } = setup({
            selectedTool: "stroke",
            selectedColor: "#1976D2",
            strokeOptions: { action: "pass", path: "straight", end: "arrow" },
        });
        fireEvent.mouseDown(canvas, at(20, 20));
        fireEvent.mouseMove(canvas, at(40, 30));
        fireEvent.mouseMove(canvas, at(60, 20));
        fireEvent.mouseUp(canvas);
        expect(onPlayDataChange).toHaveBeenCalledTimes(1);
        const stroke = onPlayDataChange.mock.calls[0][0].drawings[0];
        expect(stroke).toMatchObject({ action: "pass", path: "straight", end: "arrow", color: "#1976D2", strokeWidth: 2 });
        expect(stroke.points).toHaveLength(2);
    });

    it("drops a tap with the stroke tool without an update", () => {
        const { canvas, at, onPlayDataChange } = setup({ selectedTool: "stroke" });
        fireEvent.mouseDown(canvas, at(20, 20));
        fireEvent.mouseMove(canvas, at(20.2, 20));
        fireEvent.mouseUp(canvas);
        expect(onPlayDataChange).not.toHaveBeenCalled();
    });

    it("updateElement via the handle is undoable", () => {
        const start = { ...createEmptyPlayData(), equipment: [{ id: "n", kind: "net" as const, position: { x: 100, y: 40 }, rotation: 0 }] };
        const { ref, onPlayDataChange, rerender } = setup({ playData: start });
        act(() => ref.current!.updateElement("n", { rotation: 180 }));
        const edited = onPlayDataChange.mock.calls.at(-1)![0];
        expect(edited.equipment[0].rotation).toBe(180);
        rerender(<RinkBoard ref={ref} mode="edit" width={800} height={400} playData={edited} onPlayDataChange={onPlayDataChange} />);
        act(() => ref.current!.undo());
        expect(onPlayDataChange.mock.calls.at(-1)![0].equipment[0].rotation).toBe(0);
    });

    it("updateElement for an unknown id records nothing", () => {
        const { ref, onPlayDataChange } = setup();
        act(() => ref.current!.updateElement("missing", { rotation: 90 }));
        expect(onPlayDataChange).not.toHaveBeenCalled();
    });

    it("reports selection changes", () => {
        const onSelectionChange = vi.fn();
        const start = { ...createEmptyPlayData(), equipment: [{ id: "c", kind: "cone" as const, position: { x: 100, y: 40 }, rotation: 0 }] };
        const { canvas, at } = setup({ playData: start, selectedTool: "select", onSelectionChange });
        fireEvent.mouseDown(canvas, at(100, 40));
        fireEvent.mouseUp(canvas);
        expect(onSelectionChange).toHaveBeenLastCalledWith("c");
    });

    it("drags equipment with the select tool", () => {
        const start = { ...createEmptyPlayData(), equipment: [{ id: "c", kind: "cone" as const, position: { x: 100, y: 40 }, rotation: 0 }] };
        const { canvas, at, onPlayDataChange } = setup({ playData: start, selectedTool: "select" });
        fireEvent.mouseDown(canvas, at(100, 40));
        fireEvent.mouseMove(canvas, at(120, 50));
        fireEvent.mouseUp(canvas);
        expect(onPlayDataChange).toHaveBeenCalledTimes(1);
        const moved = onPlayDataChange.mock.calls[0][0].equipment[0].position;
        expect(moved.x).toBeCloseTo(120, 0);
        expect(moved.y).toBeCloseTo(50, 0);
    });

    it("erases equipment", () => {
        const start = { ...createEmptyPlayData(), equipment: [{ id: "c", kind: "cone" as const, position: { x: 100, y: 40 }, rotation: 0 }] };
        const { canvas, at, onPlayDataChange } = setup({ playData: start, selectedTool: "eraser" });
        fireEvent.mouseDown(canvas, at(100, 40));
        expect(onPlayDataChange.mock.calls[0][0].equipment).toHaveLength(0);
    });

    it("clears the selection when the tool leaves select", () => {
        const onSelectionChange = vi.fn();
        const start = { ...createEmptyPlayData(), equipment: [{ id: "c", kind: "cone" as const, position: { x: 100, y: 40 }, rotation: 0 }] };
        const { canvas, at, rerender, onPlayDataChange } = setup({ playData: start, selectedTool: "select", onSelectionChange });
        fireEvent.mouseDown(canvas, at(100, 40));
        fireEvent.mouseUp(canvas);
        rerender(<RinkBoard mode="edit" width={800} height={400} playData={start} onPlayDataChange={onPlayDataChange} selectedTool="player" onSelectionChange={onSelectionChange} />);
        expect(onSelectionChange).toHaveBeenLastCalledWith(null);
    });
});

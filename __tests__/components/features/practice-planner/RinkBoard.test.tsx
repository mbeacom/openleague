/**
 * Tests for RinkBoard component
 *
 * Basic smoke tests to verify the component renders and initializes correctly.
 */

import { describe, it, expect, vi, beforeAll } from "vitest";
import { render } from "@testing-library/react";
import { RinkBoard } from "@/components/features/practice-planner/RinkBoard";
import { PlayData } from "@/types/practice-planner";

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
        players: [],
        drawings: [],
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
            players: [
                {
                    id: "player-1",
                    position: { x: 100, y: 42.5 },
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
            players: [],
            drawings: [
                {
                    id: "draw-1",
                    type: "arrow",
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

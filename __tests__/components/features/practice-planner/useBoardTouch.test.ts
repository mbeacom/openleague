/** Touch input for the rink board, moved out of RinkBoard (line editing spec R5, R6). */
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { TAP_TOOLS, useBoardTouch, type BoardTouchOptions } from "@/components/features/practice-planner/useBoardTouch";

function setup(overrides: Partial<BoardTouchOptions> = {}) {
    const canvas = document.createElement("canvas");
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 400, right: 800, bottom: 400, x: 0, y: 0, toJSON: () => ({}) });
    const options: BoardTouchOptions = {
        canvasRef: { current: canvas },
        enabled: true,
        areaTool: false,
        selectedTool: "select",
        scaleRef: { current: 1 },
        panOffsetRef: { current: { x: 0, y: 0 } },
        applyView: vi.fn(),
        onPointerDown: vi.fn(),
        onPointerMove: vi.fn(),
        onPointerUp: vi.fn(),
        onAbandon: vi.fn(),
        ...overrides,
    };
    const { result } = renderHook(() => useBoardTouch(options));
    return { options, touch: result.current };
}

const touches = (...points: Array<[number, number]>) =>
    ({
        touches: points.map(([clientX, clientY]) => ({ clientX, clientY })),
        cancelable: false,
        preventDefault: vi.fn(),
    }) as unknown as React.TouchEvent<HTMLCanvasElement>;

describe("useBoardTouch", () => {
    it("presses at once with the select tool, and moves and releases like the mouse", () => {
        const { options, touch } = setup();
        touch.handleTouchStart(touches([10, 20]));
        touch.handleTouchMove(touches([30, 40]));
        touch.handleTouchEnd(touches());
        expect(options.onPointerDown).toHaveBeenCalledWith(10, 20);
        expect(options.onPointerMove).toHaveBeenCalledWith(30, 40);
        expect(options.onPointerUp).toHaveBeenCalledTimes(1);
    });

    it("waits for the finger to lift with a tap tool", () => {
        expect([...TAP_TOOLS].sort()).toEqual(["equipment", "eraser", "player", "text"]);
        const { options, touch } = setup({ selectedTool: "player" });
        touch.handleTouchStart(touches([10, 20]));
        expect(options.onPointerDown).not.toHaveBeenCalled();
        touch.handleTouchEnd(touches());
        expect(options.onPointerDown).toHaveBeenCalledWith(10, 20);
    });

    it("abandons the first finger's gesture when a second lands, then pinches", () => {
        const { options, touch } = setup();
        touch.handleTouchStart(touches([100, 100]));
        touch.handleTouchStart(touches([100, 100], [200, 100]));
        expect(options.onAbandon).toHaveBeenCalledTimes(1);
        touch.handleTouchMove(touches([50, 100], [250, 100]));
        expect(options.applyView).toHaveBeenCalledWith(expect.objectContaining({ zoom: 2 }));
    });

    it("abandons on touchcancel and ignores input while disabled", () => {
        const { options, touch } = setup();
        touch.handleTouchCancel();
        expect(options.onAbandon).toHaveBeenCalledTimes(1);
        const off = setup({ enabled: false });
        off.touch.handleTouchStart(touches([10, 20]));
        expect(off.options.onPointerDown).not.toHaveBeenCalled();
    });
});

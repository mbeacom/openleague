/**
 * RinkBoard + drill ice area: the edit board fits the area (plus a 5 ft
 * margin), clamps what is placed or dragged to it, keeps elements outside it
 * selectable and erasable, and sets the area through undoable history.
 */
import React from "react";
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { RinkBoard, type RinkBoardHandle, type RinkBoardProps } from "@/components/features/practice-planner/RinkBoard";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { createTransformContext, rinkToCanvas } from "@/lib/utils/canvas/rink-renderer";
import { editViewport } from "@/lib/utils/ice-area";
import type { IceArea, PlayData } from "@/types/practice-planner";

const mockCanvasContext = new Proxy({} as Record<string, unknown>, {
    get(t, prop) {
        if (typeof prop !== "string") return undefined;
        if (!(prop in t)) t[prop] = vi.fn(() => ({ width: 10 }));
        return t[prop];
    },
    set(t, prop, value) {
        if (typeof prop === "string") t[prop] = value;
        return true;
    },
});

beforeAll(() => {
    global.ResizeObserver = class {
        observe() { /* noop */ }
        unobserve() { /* noop */ }
        disconnect() { /* noop */ }
    } as unknown as typeof ResizeObserver;
    // Never runs the callback: rendering is tested on drawBoardScene instead.
    global.requestAnimationFrame = vi.fn(() => 1) as unknown as typeof requestAnimationFrame;
    global.cancelAnimationFrame = vi.fn();
    HTMLCanvasElement.prototype.getContext = vi.fn(() => mockCanvasContext) as unknown as HTMLCanvasElement["getContext"];
});

const CUSTOM: IceArea = { kind: "custom", rect: { x: 100, y: 30, w: 20, h: 20 } }; // viewport { 95, 25, 30, 30 }

const cone = (x: number, y = 40) => ({ id: "c", kind: "cone" as const, position: { x, y }, rotation: 0 });

describe("RinkBoard ice area", () => {
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
        const onSelectionChange = vi.fn();
        const ref = React.createRef<RinkBoardHandle>();
        const playData: PlayData = props.playData ?? createEmptyPlayData();
        const utils = render(
            <RinkBoard
                ref={ref}
                mode="edit"
                width={800}
                height={400}
                onPlayDataChange={onPlayDataChange}
                onSelectionChange={onSelectionChange}
                {...props}
                playData={playData}
            />
        );
        const canvas = utils.container.querySelector("canvas")!;
        canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 400, right: 800, bottom: 400, x: 0, y: 0, toJSON: () => ({}) });
        // Pointer for a rink point, through the viewport the board uses for this drill's area.
        const transform = createTransformContext(800, 400, 20, editViewport(playData.area));
        const at = (x: number, y: number) => {
            const p = rinkToCanvas({ x, y }, transform);
            return { clientX: p.x, clientY: p.y };
        };
        return { ...utils, canvas, at, ref, onPlayDataChange, onSelectionChange };
    }

    it("clamps a placement to the area (zone-left, click near x=150)", () => {
        const { canvas, at, onPlayDataChange } = setup({
            playData: { ...createEmptyPlayData(), area: { kind: "zone-left" } },
            selectedTool: "player",
        });
        fireEvent.mouseDown(canvas, at(150, 40));
        const placed = onPlayDataChange.mock.calls[0][0].players[0].position;
        expect(placed.x).toBe(75);
        expect(placed.y).toBeCloseTo(40, 6);
    });

    it("maps the pointer through the zoomed viewport", () => {
        // Under the whole-rink transform this pixel is about (88.9, 17.4).
        const { canvas, at, onPlayDataChange } = setup({
            playData: { ...createEmptyPlayData(), area: { kind: "zone-neutral" } },
            selectedTool: "equipment",
        });
        fireEvent.mouseDown(canvas, at(90, 20));
        const placed = onPlayDataChange.mock.calls[0][0].equipment[0].position;
        expect(placed.x).toBeCloseTo(90, 6);
        expect(placed.y).toBeCloseTo(20, 6);
    });

    it("keeps an element outside a narrowed area selectable", () => {
        // 3 ft outside the area, inside the 5 ft margin; the 22 px hit radius is 1.83 ft here,
        // so a hit test at the area-clamped point (100, 40) would miss it.
        const { canvas, at, onSelectionChange } = setup({
            playData: { ...createEmptyPlayData(), area: CUSTOM, equipment: [cone(97)] },
            selectedTool: "select",
        });
        fireEvent.mouseDown(canvas, at(97, 40));
        fireEvent.mouseUp(canvas);
        expect(onSelectionChange).toHaveBeenLastCalledWith("c");
    });

    it("keeps an element outside a narrowed area erasable", () => {
        const { canvas, at, onPlayDataChange } = setup({
            playData: { ...createEmptyPlayData(), area: CUSTOM, equipment: [cone(97)] },
            selectedTool: "eraser",
        });
        fireEvent.mouseDown(canvas, at(97, 40));
        expect(onPlayDataChange.mock.calls[0][0].equipment).toHaveLength(0);
    });

    it("deletes a selected outside element with Backspace", () => {
        const { canvas, at, onPlayDataChange } = setup({
            playData: { ...createEmptyPlayData(), area: CUSTOM, equipment: [cone(97)] },
            selectedTool: "select",
        });
        fireEvent.mouseDown(canvas, at(97, 40));
        fireEvent.mouseUp(canvas);
        fireEvent.keyDown(document.body, { key: "Backspace" });
        expect(onPlayDataChange.mock.calls.at(-1)![0].equipment).toHaveLength(0);
    });

    it("drags an element grabbed off-center exactly to the area edge", () => {
        const { canvas, at, onPlayDataChange } = setup({
            playData: { ...createEmptyPlayData(), area: CUSTOM, equipment: [cone(115)] },
            selectedTool: "select",
        });
        fireEvent.mouseDown(canvas, at(116, 40)); // grab 1 ft right of center
        fireEvent.mouseMove(canvas, at(124, 40)); // past the edge, inside the margin
        fireEvent.mouseUp(canvas);
        expect(onPlayDataChange).toHaveBeenCalledTimes(1);
        expect(onPlayDataChange.mock.calls[0][0].equipment[0].position.x).toBe(120);
    });

    it("sets the area through undoable history", () => {
        const { ref, onPlayDataChange, rerender } = setup();
        act(() => ref.current!.setArea({ kind: "zone-left" }));
        const zoned = onPlayDataChange.mock.calls.at(-1)![0];
        expect(zoned.area).toEqual({ kind: "zone-left" });
        rerender(<RinkBoard ref={ref} mode="edit" width={800} height={400} playData={zoned} onPlayDataChange={onPlayDataChange} />);
        act(() => ref.current!.undo());
        expect("area" in onPlayDataChange.mock.calls.at(-1)![0]).toBe(false);
    });

    it("records nothing when the area is unchanged, and removes the key for full ice", () => {
        const { ref, onPlayDataChange } = setup({ playData: { ...createEmptyPlayData(), area: { kind: "zone-left" } } });
        act(() => ref.current!.setArea({ kind: "zone-left" }));
        expect(onPlayDataChange).not.toHaveBeenCalled();
        act(() => ref.current!.setArea(undefined));
        expect("area" in onPlayDataChange.mock.calls.at(-1)![0]).toBe(false);
    });

    it("keeps the area when the board is cleared", () => {
        const { ref, onPlayDataChange } = setup({
            playData: { ...createEmptyPlayData(), area: { kind: "zone-left" }, equipment: [cone(40)] },
        });
        act(() => ref.current!.clear());
        const cleared = onPlayDataChange.mock.calls.at(-1)![0];
        expect(cleared.equipment).toHaveLength(0);
        expect(cleared.area).toEqual({ kind: "zone-left" });
    });
});

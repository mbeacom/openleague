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
import { createTransformContext, FULL_RINK, rinkToCanvas } from "@/lib/utils/canvas/rink-renderer";
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

    it("draws a snapped custom area over the whole rink with the area tool", () => {
        const onAreaDrawn = vi.fn();
        const { canvas, onPlayDataChange } = setup({
            playData: { ...createEmptyPlayData(), area: { kind: "zone-left" } },
            selectedTool: "player",
            areaTool: true,
            onAreaDrawn,
        });
        // The area tool shows the whole rink, whatever the current area.
        const full = createTransformContext(800, 400, 20, FULL_RINK);
        const atFull = (x: number, y: number) => {
            const p = rinkToCanvas({ x, y }, full);
            return { clientX: p.x, clientY: p.y };
        };
        fireEvent.mouseDown(canvas, atFull(122, 33));
        fireEvent.mouseMove(canvas, atFull(148, 61));
        fireEvent.mouseUp(canvas);

        expect(onPlayDataChange).toHaveBeenCalledTimes(1);
        const drawn = onPlayDataChange.mock.calls[0][0];
        expect(drawn.area).toEqual({ kind: "custom", rect: { x: 120, y: 35, w: 30, h: 25 } });
        expect(drawn.players).toHaveLength(0);
        expect(onAreaDrawn).toHaveBeenCalledTimes(1);
    });

    it("finishes an area drag released outside the canvas", () => {
        const onAreaDrawn = vi.fn();
        const { canvas, onPlayDataChange } = setup({ areaTool: true, onAreaDrawn });
        const full = createTransformContext(800, 400, 20, FULL_RINK);
        const start = rinkToCanvas({ x: 10, y: 10 }, full);
        const end = rinkToCanvas({ x: 16, y: 18 }, full); // a real drag, still under the 20 ft minimum
        fireEvent.mouseDown(canvas, { clientX: start.x, clientY: start.y });
        fireEvent.mouseMove(canvas, { clientX: end.x, clientY: end.y });
        fireEvent.mouseUp(window);
        expect(onPlayDataChange).toHaveBeenCalledTimes(1);
        expect(onPlayDataChange.mock.calls[0][0].area).toEqual({ kind: "custom", rect: { x: 10, y: 10, w: 20, h: 20 } });
        expect(onAreaDrawn).toHaveBeenCalledTimes(1);
    });

    it("records nothing for an area-tool click (no drag)", () => {
        const onAreaDrawn = vi.fn();
        const { canvas, onPlayDataChange } = setup({ areaTool: true, onAreaDrawn });
        const full = createTransformContext(800, 400, 20, FULL_RINK);
        const start = rinkToCanvas({ x: 40, y: 40 }, full);
        const jitter = rinkToCanvas({ x: 40.5, y: 40.5 }, full); // under 1 ft in both axes
        fireEvent.mouseDown(canvas, { clientX: start.x, clientY: start.y });
        fireEvent.mouseMove(canvas, { clientX: jitter.x, clientY: jitter.y });
        fireEvent.mouseUp(canvas);
        fireEvent.mouseDown(canvas, { clientX: start.x, clientY: start.y });
        fireEvent.mouseUp(window);
        expect(onPlayDataChange).not.toHaveBeenCalled();
        expect(onAreaDrawn).not.toHaveBeenCalled();
    });

    it("cancels an area drag when a second touch starts, so the final touchend commits nothing", () => {
        const onAreaDrawn = vi.fn();
        const { canvas, onPlayDataChange } = setup({ areaTool: true, onAreaDrawn });
        const full = createTransformContext(800, 400, 20, FULL_RINK);
        const a = rinkToCanvas({ x: 20, y: 10 }, full);
        const b = rinkToCanvas({ x: 60, y: 50 }, full);
        fireEvent.touchStart(canvas, { touches: [{ clientX: a.x, clientY: a.y }] });
        fireEvent.touchMove(canvas, { touches: [{ clientX: b.x, clientY: b.y }] });
        // A second finger lands: the pinch takes over and the drag is abandoned.
        fireEvent.touchStart(canvas, { touches: [{ clientX: b.x, clientY: b.y }, { clientX: a.x, clientY: a.y }] });
        fireEvent.touchEnd(canvas, { touches: [] });
        expect(onPlayDataChange).not.toHaveBeenCalled();
        expect(onAreaDrawn).not.toHaveBeenCalled();
    });

    it("abandons an element drag when a second touch starts: the element stays put, nothing is recorded", () => {
        const onUndoRedoStateChange = vi.fn();
        const { canvas, at, onPlayDataChange, onSelectionChange } = setup({
            playData: { ...createEmptyPlayData(), area: CUSTOM, equipment: [cone(110)] },
            selectedTool: "select",
            onUndoRedoStateChange,
        });
        const grab = at(110, 40);
        const moved = at(104, 40); // well past the drag threshold
        fireEvent.touchStart(canvas, { touches: [grab] });
        fireEvent.touchMove(canvas, { touches: [moved] });
        // A second finger lands: the pinch takes over and the drag is cancelled.
        fireEvent.touchStart(canvas, { touches: [moved, at(115, 45)] });
        fireEvent.touchEnd(canvas, { touches: [] });
        expect(onPlayDataChange).not.toHaveBeenCalled();
        expect(onUndoRedoStateChange).not.toHaveBeenCalled();
        // The pinch cancels the drag, not the selection.
        expect(onSelectionChange).toHaveBeenLastCalledWith("c");
    });

    it("does not resume an abandoned drag when one finger of the pinch lifts and the other moves", () => {
        const { canvas, at, onPlayDataChange } = setup({
            playData: { ...createEmptyPlayData(), area: CUSTOM, equipment: [cone(110)] },
            selectedTool: "select",
        });
        fireEvent.touchStart(canvas, { touches: [at(110, 40)] });
        fireEvent.touchMove(canvas, { touches: [at(104, 40)] });
        fireEvent.touchStart(canvas, { touches: [at(104, 40), at(115, 45)] });
        fireEvent.touchEnd(canvas, { touches: [at(104, 40)] });
        fireEvent.touchMove(canvas, { touches: [at(102, 35)] });
        fireEvent.touchEnd(canvas, { touches: [] });
        expect(onPlayDataChange).not.toHaveBeenCalled();
    });

    it("abandons a stroke in progress when a second touch starts", () => {
        const { canvas, at, onPlayDataChange } = setup({ selectedTool: "stroke" });
        fireEvent.touchStart(canvas, { touches: [at(40, 40)] });
        fireEvent.touchMove(canvas, { touches: [at(60, 40)] });
        fireEvent.touchMove(canvas, { touches: [at(80, 40)] });
        fireEvent.touchStart(canvas, { touches: [at(80, 40), at(90, 50)] });
        fireEvent.touchEnd(canvas, { touches: [] });
        expect(onPlayDataChange).not.toHaveBeenCalled();
    });

    it("zooms about the pinch midpoint: the rink point under the fingers stays under them", () => {
        const { canvas, at, onPlayDataChange } = setup({ selectedTool: "player" });
        const full = createTransformContext(800, 400, 20, FULL_RINK);
        const mid = at(150, 40);
        // Fingers 100 px apart around the point, spread to 200 px: 2x about the midpoint.
        fireEvent.touchStart(canvas, { touches: [{ clientX: mid.clientX - 50, clientY: mid.clientY }, { clientX: mid.clientX + 50, clientY: mid.clientY }] });
        fireEvent.touchMove(canvas, { touches: [{ clientX: mid.clientX - 100, clientY: mid.clientY }, { clientX: mid.clientX + 100, clientY: mid.clientY }] });
        fireEvent.touchEnd(canvas, { touches: [] });
        fireEvent.mouseDown(canvas, mid);
        const placed = onPlayDataChange.mock.calls.at(-1)![0].players[0].position;
        expect(placed.x).toBeCloseTo(150, 6);
        expect(placed.y).toBeCloseTo(40, 6);
        // A point away from the midpoint is now twice as far from it on screen.
        const off = rinkToCanvas({ x: 160, y: 40 }, full);
        fireEvent.mouseDown(canvas, { clientX: mid.clientX + 2 * (off.x - mid.clientX), clientY: mid.clientY });
        const second = onPlayDataChange.mock.calls.at(-1)![0].players.at(-1).position;
        expect(second.x).toBeCloseTo(160, 6);
    });

    it("anchors the pinch on a canvas that is offset on the page (client vs canvas coordinates)", () => {
        const { canvas, at, onPlayDataChange } = setup({ selectedTool: "player" });
        const [left, top] = [120, 60];
        canvas.getBoundingClientRect = () => ({ left, top, width: 800, height: 400, right: left + 800, bottom: top + 400, x: left, y: top, toJSON: () => ({}) });
        const p = at(150, 40);
        const mid = { clientX: p.clientX + left, clientY: p.clientY + top };
        fireEvent.touchStart(canvas, { touches: [{ clientX: mid.clientX - 50, clientY: mid.clientY }, { clientX: mid.clientX + 50, clientY: mid.clientY }] });
        fireEvent.touchMove(canvas, { touches: [{ clientX: mid.clientX - 100, clientY: mid.clientY }, { clientX: mid.clientX + 100, clientY: mid.clientY }] });
        fireEvent.touchEnd(canvas, { touches: [] });
        fireEvent.mouseDown(canvas, mid);
        const placed = onPlayDataChange.mock.calls.at(-1)![0].players[0].position;
        expect(placed.x).toBeCloseTo(150, 6);
        expect(placed.y).toBeCloseTo(40, 6);
    });

    it("resets pinch-zoom and pan when the viewport changes", () => {
        const { canvas, ref, onPlayDataChange, rerender } = setup({ selectedTool: "player" });
        // Pinch to 2x around an off-center point, which also pans.
        fireEvent.touchStart(canvas, { touches: [{ clientX: 300, clientY: 200 }, { clientX: 400, clientY: 200 }] });
        fireEvent.touchMove(canvas, { touches: [{ clientX: 300, clientY: 200 }, { clientX: 500, clientY: 200 }] });
        fireEvent.touchEnd(canvas, { touches: [] });
        act(() => ref.current!.setArea({ kind: "zone-left" }));
        const zoned: PlayData = onPlayDataChange.mock.calls.at(-1)![0];
        rerender(
            <RinkBoard ref={ref} mode="edit" width={800} height={400} selectedTool="player"
                playData={zoned} onPlayDataChange={onPlayDataChange} />
        );
        const zone = createTransformContext(800, 400, 20, editViewport({ kind: "zone-left" }));
        const p = rinkToCanvas({ x: 40, y: 50 }, zone);
        fireEvent.mouseDown(canvas, { clientX: p.x, clientY: p.y });
        const placed = onPlayDataChange.mock.calls.at(-1)![0].players[0].position;
        expect(placed.x).toBeCloseTo(40, 6);
        expect(placed.y).toBeCloseTo(50, 6);
    });

    it("follows the viewport back to the whole rink on undo", () => {
        const { canvas, ref, onPlayDataChange, rerender } = setup({ selectedTool: "player" });
        const board = (data: PlayData) => (
            <RinkBoard ref={ref} mode="edit" width={800} height={400} selectedTool="player"
                playData={data} onPlayDataChange={onPlayDataChange} />
        );
        act(() => ref.current!.setArea({ kind: "zone-left" }));
        rerender(board(onPlayDataChange.mock.calls.at(-1)![0]));
        act(() => ref.current!.undo());
        const restored: PlayData = onPlayDataChange.mock.calls.at(-1)![0];
        expect("area" in restored).toBe(false);
        rerender(board(restored));
        const full = createTransformContext(800, 400, 20, FULL_RINK);
        const p = rinkToCanvas({ x: 150, y: 40 }, full);
        fireEvent.mouseDown(canvas, { clientX: p.x, clientY: p.y });
        const placed = onPlayDataChange.mock.calls.at(-1)![0].players[0].position;
        expect(placed.x).toBeCloseTo(150, 6);
        expect(placed.y).toBeCloseTo(40, 6);
    });

    it("clamps mid-stroke points to the area", () => {
        const { canvas, at, onPlayDataChange } = setup({
            playData: { ...createEmptyPlayData(), area: { kind: "zone-left" } },
            selectedTool: "stroke",
            strokeOptions: { action: "skate", path: "freehand", end: "arrow" },
        });
        fireEvent.mouseDown(canvas, at(40, 40));
        fireEvent.mouseMove(canvas, at(60, 40));
        fireEvent.mouseMove(canvas, at(79, 20)); // in the 5 ft margin, outside the area
        fireEvent.mouseMove(canvas, at(79, 60));
        fireEvent.mouseUp(canvas);
        const points: { x: number; y: number }[] = onPlayDataChange.mock.calls[0][0].drawings[0].points;
        expect(points.length).toBeGreaterThan(2);
        expect(Math.max(...points.map((pt) => pt.x))).toBeCloseTo(75, 6);
        expect(points.at(-1)!.x).toBeCloseTo(75, 6);
    });
    describe("tapping an element is not a drag", () => {
        it("leaves an outside element in place on a mouse tap (zero-distance move), recording nothing", () => {
            const onUndoRedoStateChange = vi.fn();
            const { canvas, at, onPlayDataChange, onSelectionChange } = setup({
                playData: { ...createEmptyPlayData(), area: CUSTOM, equipment: [cone(97)] },
                selectedTool: "select",
                onUndoRedoStateChange,
            });
            fireEvent.mouseDown(canvas, at(97, 40));
            fireEvent.mouseMove(canvas, at(97, 40));
            fireEvent.mouseUp(canvas);
            expect(onSelectionChange).toHaveBeenLastCalledWith("c");
            expect(onPlayDataChange).not.toHaveBeenCalled();
            expect(onUndoRedoStateChange).not.toHaveBeenCalled();
        });

        it("leaves an outside element in place on a touch tap, recording nothing", () => {
            const onUndoRedoStateChange = vi.fn();
            const { canvas, at, onPlayDataChange } = setup({
                playData: { ...createEmptyPlayData(), area: CUSTOM, equipment: [cone(97)] },
                selectedTool: "select",
                onUndoRedoStateChange,
            });
            const p = at(97, 40);
            fireEvent.touchStart(canvas, { touches: [p] });
            fireEvent.touchMove(canvas, { touches: [p] });
            fireEvent.touchEnd(canvas, { touches: [] });
            expect(onPlayDataChange).not.toHaveBeenCalled();
            expect(onUndoRedoStateChange).not.toHaveBeenCalled();
        });

        it("ignores jitter under the drag threshold", () => {
            const { canvas, at, onPlayDataChange } = setup({
                playData: { ...createEmptyPlayData(), area: CUSTOM, equipment: [cone(97)] },
                selectedTool: "select",
            });
            const p = at(97, 40);
            fireEvent.mouseDown(canvas, p);
            fireEvent.mouseMove(canvas, { clientX: p.clientX + 2, clientY: p.clientY + 1 });
            fireEvent.mouseUp(canvas);
            expect(onPlayDataChange).not.toHaveBeenCalled();
        });

        it("still drags past the threshold, clamping into the area", () => {
            const onUndoRedoStateChange = vi.fn();
            const { canvas, at, onPlayDataChange } = setup({
                playData: { ...createEmptyPlayData(), area: CUSTOM, equipment: [cone(97)] },
                selectedTool: "select",
                onUndoRedoStateChange,
            });
            fireEvent.mouseDown(canvas, at(97, 40));
            fireEvent.mouseMove(canvas, at(90, 40)); // further outside: clamps to the area edge
            fireEvent.mouseUp(canvas);
            expect(onPlayDataChange).toHaveBeenCalledTimes(1);
            expect(onPlayDataChange.mock.calls[0][0].equipment[0].position.x).toBe(100);
            expect(onUndoRedoStateChange).toHaveBeenCalledTimes(1);
        });

        it("records nothing for a drag that ends where it started", () => {
            const { canvas, at, onPlayDataChange } = setup({
                // At the area's corner, so the return trip clamps back to exactly (120, 50)
                playData: { ...createEmptyPlayData(), area: CUSTOM, equipment: [cone(120, 50)] },
                selectedTool: "select",
            });
            fireEvent.mouseDown(canvas, at(120, 50));
            fireEvent.mouseMove(canvas, at(112, 42));
            fireEvent.mouseMove(canvas, at(124, 54));
            fireEvent.mouseUp(canvas);
            expect(onPlayDataChange).not.toHaveBeenCalled();
        });
    });
});

/**
 * Line editing on the rink board (line editing spec R3, R6): select a line,
 * drag an end, a bend or a "+", move the whole line; each edit is one undo
 * step; touch drags work, and a second finger, touchcancel or a tool change
 * cancels without committing.
 */
import React from "react";
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { RinkBoard, type RinkBoardHandle, type RinkBoardProps } from "@/components/features/practice-planner/RinkBoard";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { createTransformContext, rinkToCanvas } from "@/lib/utils/canvas/rink-renderer";
import { editViewport } from "@/lib/utils/ice-area";
import type { DrawingElement, IceArea, PlayData, Position, StrokePath } from "@/types/practice-planner";

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
    // Never runs the callback: drawing is tested in drawing-utils.
    global.requestAnimationFrame = vi.fn(() => 1) as unknown as typeof requestAnimationFrame;
    global.cancelAnimationFrame = vi.fn();
    HTMLCanvasElement.prototype.getContext = vi.fn(() => mockCanvasContext) as unknown as HTMLCanvasElement["getContext"];
});

let widthSpy: ReturnType<typeof vi.spyOn>;
let heightSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
    widthSpy = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800);
    heightSpy = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(400);
});
afterEach(() => {
    widthSpy.mockRestore();
    heightSpy.mockRestore();
    vi.useRealTimers();
});

const line = (points: Position[], path: StrokePath = "straight", id = "l"): DrawingElement => ({
    id, action: "skate", path, end: "arrow", points, color: "#212121", strokeWidth: 2,
});
const withLines = (...drawings: DrawingElement[]): PlayData => ({ ...createEmptyPlayData(), drawings });
const CUSTOM: IceArea = { kind: "custom", rect: { x: 100, y: 30, w: 20, h: 20 } }; // viewport { 95, 25, 30, 30 }
const STRAIGHT = [{ x: 40, y: 40 }, { x: 120, y: 40 }];
/** Three points: a curve when the line's path is "curve", a sharp polyline when it is "straight". */
const BENT = [{ x: 40, y: 40 }, { x: 80, y: 20 }, { x: 120, y: 40 }];

function setup(props: Partial<RinkBoardProps> = {}) {
    const onPlayDataChange = vi.fn();
    const onSelectionChange = vi.fn();
    const onUndoRedoStateChange = vi.fn();
    const ref = React.createRef<RinkBoardHandle>();
    const playData: PlayData = props.playData ?? createEmptyPlayData();
    const board = (data: PlayData, extra: Partial<RinkBoardProps> = {}) => (
        <RinkBoard
            ref={ref}
            mode="edit"
            width={800}
            height={400}
            selectedTool="select"
            onPlayDataChange={onPlayDataChange}
            onSelectionChange={onSelectionChange}
            onUndoRedoStateChange={onUndoRedoStateChange}
            {...props}
            {...extra}
            playData={data}
        />
    );
    const utils = render(board(playData));
    const canvas = utils.container.querySelector("canvas")!;
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 400, right: 800, bottom: 400, x: 0, y: 0, toJSON: () => ({}) });
    const transform = createTransformContext(800, 400, 20, editViewport(playData.area));
    const at = (x: number, y: number) => {
        const p = rinkToCanvas({ x, y }, transform);
        return { clientX: p.x, clientY: p.y };
    };
    const click = (x: number, y: number) => {
        fireEvent.mouseDown(canvas, at(x, y));
        fireEvent.mouseUp(canvas);
    };
    const drag = (from: [number, number], to: [number, number]) => {
        fireEvent.mouseDown(canvas, at(...from));
        fireEvent.mouseMove(canvas, at(...to));
        fireEvent.mouseUp(canvas);
    };
    const last = (): PlayData => onPlayDataChange.mock.calls.at(-1)![0];
    const rerender = (data: PlayData, extra: Partial<RinkBoardProps> = {}) => utils.rerender(board(data, extra));
    return { canvas, at, click, drag, last, rerender, ref, onPlayDataChange, onSelectionChange, onUndoRedoStateChange };
}

const expectPoint = (p: Position, x: number, y: number) => {
    expect(p.x).toBeCloseTo(x, 0);
    expect(p.y).toBeCloseTo(y, 0);
};

describe("RinkBoard line editing: handles and drags", () => {
    it("selects a line with a click and records nothing", () => {
        const ctx = setup({ playData: withLines(line(STRAIGHT)) });
        ctx.click(60, 40);
        expect(ctx.onSelectionChange).toHaveBeenLastCalledWith("l");
        expect(ctx.onPlayDataChange).not.toHaveBeenCalled();
    });

    it("drags an end of the selected line and leaves the other end", () => {
        const ctx = setup({ playData: withLines(line(STRAIGHT)) });
        ctx.click(60, 40);
        ctx.drag([120, 40], [130, 60]);
        expect(ctx.onPlayDataChange).toHaveBeenCalledTimes(1);
        const [start, end] = ctx.last().drawings[0].points;
        expect(start).toEqual({ x: 40, y: 40 });
        expectPoint(end, 130, 60);
    });

    it("drags a '+' handle on a 2-point line to bend it into a curve", () => {
        const ctx = setup({ playData: withLines(line(STRAIGHT)) });
        ctx.click(60, 40);
        ctx.drag([80, 40], [80, 20]);
        const stroke = ctx.last().drawings[0];
        expect(stroke.path).toBe("curve");
        expect(stroke.points).toHaveLength(3);
        expectPoint(stroke.points[1], 80, 20);
    });

    it("drags a curve's bend", () => {
        const ctx = setup({ playData: withLines(line(BENT, "curve")) });
        ctx.click(60, 30);
        ctx.drag([80, 20], [90, 10]);
        const stroke = ctx.last().drawings[0];
        expect(stroke.path).toBe("curve");
        expect(stroke.points).toHaveLength(3);
        expectPoint(stroke.points[1], 90, 10);
    });

    it("keeps an older polyline sharp: a corner drag and a '+' leave it straight", () => {
        const ctx = setup({ playData: withLines(line(BENT)) });
        ctx.click(60, 30);
        ctx.drag([80, 20], [90, 10]);
        expect(ctx.last().drawings[0].path).toBe("straight");
        expectPoint(ctx.last().drawings[0].points[1], 90, 10);

        const added = setup({ playData: withLines(line(BENT)) });
        added.click(60, 30);
        added.drag([100, 30], [100, 45]); // the second segment's midpoint "+"
        const stroke = added.last().drawings[0];
        expect(stroke.path).toBe("straight");
        expect(stroke.points).toHaveLength(4);
        expectPoint(stroke.points[2], 100, 45);
    });

    it("moves the whole line from its body, keeping its shape", () => {
        const ctx = setup({ playData: withLines(line(BENT, "curve")) });
        ctx.drag([60, 30], [70, 40]);
        expect(ctx.onPlayDataChange).toHaveBeenCalledTimes(1);
        const points = ctx.last().drawings[0].points;
        BENT.forEach((p, i) => expectPoint(points[i], p.x + 10, p.y + 10));
    });

    it("drags an end of a line shorter than two hit radii, not its '+'", () => {
        const ctx = setup({ playData: withLines(line([{ x: 60, y: 40 }, { x: 66, y: 40 }])) });
        ctx.click(63, 40);
        ctx.drag([60, 40], [60, 50]);
        const points = ctx.last().drawings[0].points;
        expect(points).toHaveLength(2);
        expectPoint(points[0], 60, 50);
    });

    it("keeps a whole-line move inside the drill's area, with its shape", () => {
        const ctx = setup({ playData: { ...withLines(line([{ x: 102, y: 35 }, { x: 110, y: 45 }])), area: CUSTOM } });
        ctx.drag([106, 40], [124, 40]);
        const [a, b] = ctx.last().drawings[0].points;
        expect(b.x).toBeCloseTo(120, 6);
        expect(b.x - a.x).toBeCloseTo(8, 6);
        expect(a.y).toBeCloseTo(35, 6);
    });

    it("never moves a line outside the area on a touch tap", () => {
        const ctx = setup({ playData: { ...withLines(line([{ x: 96, y: 27 }, { x: 99, y: 27 }])), area: CUSTOM } });
        fireEvent.touchStart(ctx.canvas, { touches: [ctx.at(97, 27)] });
        fireEvent.touchMove(ctx.canvas, { touches: [ctx.at(97, 27)] });
        fireEvent.touchEnd(ctx.canvas, { touches: [] });
        expect(ctx.onSelectionChange).toHaveBeenLastCalledWith("l");
        expect(ctx.onPlayDataChange).not.toHaveBeenCalled();
    });

    it("simplifies a freehand line to at most 8 points on the first end drag, and keeps it freehand", () => {
        const wave = Array.from({ length: 30 }, (_, i) => ({ x: 40 + i * 2, y: 40 + 8 * Math.sin(i / 3) }));
        const ctx = setup({ playData: withLines(line(wave, "freehand")) });
        ctx.click(wave[5].x, wave[5].y);
        ctx.drag([wave[29].x, wave[29].y], [110, 70]);
        const stroke = ctx.last().drawings[0];
        expect(stroke.path).toBe("freehand");
        expect(stroke.points.length).toBeLessThanOrEqual(8);
        expect(stroke.points[0]).toEqual(wave[0]);
        expectPoint(stroke.points[stroke.points.length - 1], 110, 70);
    });

    it("never simplifies a freehand line it moves as a whole", () => {
        const wave = Array.from({ length: 30 }, (_, i) => ({ x: 40 + i * 2, y: 40 + 8 * Math.sin(i / 3) }));
        const ctx = setup({ playData: withLines(line(wave, "freehand")) });
        ctx.drag([wave[5].x, wave[5].y], [wave[5].x + 5, wave[5].y + 5]);
        expect(ctx.last().drawings[0].points).toHaveLength(30);
    });
});

describe("RinkBoard line editing: history and interruptions", () => {
    it("makes each edit one undo step, and redo restores it", () => {
        const start = withLines(line(STRAIGHT));
        const ctx = setup({ playData: start });
        ctx.click(60, 40);
        ctx.drag([80, 40], [80, 20]);
        expect(ctx.onUndoRedoStateChange).toHaveBeenLastCalledWith(true, false);
        const edited = ctx.last();
        ctx.rerender(edited);
        act(() => ctx.ref.current!.undo());
        expect(ctx.last().drawings[0].points).toEqual(STRAIGHT);
        act(() => ctx.ref.current!.redo());
        expect(ctx.last().drawings[0].points).toEqual(edited.drawings[0].points);
    });

    it("commits once when a line drag is released outside the canvas", () => {
        const ctx = setup({ playData: withLines(line(STRAIGHT)) });
        ctx.click(60, 40);
        fireEvent.mouseDown(ctx.canvas, ctx.at(120, 40));
        fireEvent.mouseMove(ctx.canvas, ctx.at(130, 60));
        fireEvent.mouseUp(window);
        expect(ctx.onPlayDataChange).toHaveBeenCalledTimes(1);
        expectPoint(ctx.last().drawings[0].points[1], 130, 60);
    });

    it("cancels a handle drag when the tool changes", () => {
        const start = withLines(line(STRAIGHT));
        const ctx = setup({ playData: start });
        ctx.click(60, 40);
        fireEvent.mouseDown(ctx.canvas, ctx.at(120, 40));
        fireEvent.mouseMove(ctx.canvas, ctx.at(130, 60));
        ctx.rerender(start, { selectedTool: "player" });
        fireEvent.mouseUp(ctx.canvas);
        expect(ctx.onPlayDataChange).not.toHaveBeenCalled();
    });

    it("drags an end with one finger", () => {
        const ctx = setup({ playData: withLines(line(STRAIGHT)) });
        fireEvent.touchStart(ctx.canvas, { touches: [ctx.at(60, 40)] });
        fireEvent.touchEnd(ctx.canvas, { touches: [] });
        fireEvent.touchStart(ctx.canvas, { touches: [ctx.at(120, 40)] });
        fireEvent.touchMove(ctx.canvas, { touches: [ctx.at(130, 60)] });
        fireEvent.touchEnd(ctx.canvas, { touches: [] });
        expect(ctx.onPlayDataChange).toHaveBeenCalledTimes(1);
        expectPoint(ctx.last().drawings[0].points[1], 130, 60);
    });

    it("cancels a handle drag when a second finger lands, and keeps the selection", () => {
        const ctx = setup({ playData: withLines(line(STRAIGHT)) });
        ctx.click(60, 40);
        fireEvent.touchStart(ctx.canvas, { touches: [ctx.at(120, 40)] });
        fireEvent.touchMove(ctx.canvas, { touches: [ctx.at(130, 60)] });
        fireEvent.touchStart(ctx.canvas, { touches: [ctx.at(130, 60), ctx.at(60, 70)] });
        fireEvent.touchEnd(ctx.canvas, { touches: [] });
        expect(ctx.onPlayDataChange).not.toHaveBeenCalled();
        expect(ctx.onSelectionChange).toHaveBeenLastCalledWith("l");
    });

    it("cancels a handle drag on touchcancel", () => {
        const ctx = setup({ playData: withLines(line(STRAIGHT)) });
        ctx.click(60, 40);
        fireEvent.touchStart(ctx.canvas, { touches: [ctx.at(120, 40)] });
        fireEvent.touchMove(ctx.canvas, { touches: [ctx.at(130, 60)] });
        fireEvent.touchCancel(ctx.canvas, { touches: [] });
        fireEvent.touchEnd(ctx.canvas, { touches: [] });
        fireEvent.mouseUp(window);
        expect(ctx.onPlayDataChange).not.toHaveBeenCalled();
    });
});

describe("RinkBoard line editing: removing bends", () => {
    it("removes a curve's bend with a double-click, and the line is straight again", () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(10_000);
        const ctx = setup({ playData: withLines(line(BENT, "curve")) });
        ctx.click(60, 30);
        ctx.click(80, 20);
        vi.setSystemTime(10_200);
        ctx.click(80, 20);
        expect(ctx.onPlayDataChange).toHaveBeenCalledTimes(1);
        expect(ctx.last().drawings[0]).toMatchObject({ path: "straight", points: [{ x: 40, y: 40 }, { x: 120, y: 40 }] });
    });

    it("removes a polyline's corner with a double-click", () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(10_000);
        const ctx = setup({ playData: withLines(line(BENT)) });
        ctx.click(60, 30);
        ctx.click(80, 20);
        vi.setSystemTime(10_200);
        ctx.click(80, 20);
        expect(ctx.last().drawings[0]).toMatchObject({ path: "straight", points: [{ x: 40, y: 40 }, { x: 120, y: 40 }] });
    });

    it("keeps the bend for two slow clicks", () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(10_000);
        const ctx = setup({ playData: withLines(line(BENT, "curve")) });
        ctx.click(60, 30);
        ctx.click(80, 20);
        vi.setSystemTime(10_400);
        ctx.click(80, 20);
        expect(ctx.onPlayDataChange).not.toHaveBeenCalled();
    });

    it("removes a bend with a double-tap", () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(10_000);
        const ctx = setup({ playData: withLines(line(BENT, "curve")) });
        const tap = (x: number, y: number) => {
            fireEvent.touchStart(ctx.canvas, { touches: [ctx.at(x, y)] });
            fireEvent.touchEnd(ctx.canvas, { touches: [] });
        };
        tap(60, 30);
        tap(80, 20);
        vi.setSystemTime(10_250);
        tap(80, 20);
        expect(ctx.last().drawings[0].points).toHaveLength(2);
    });

    it("never removes an end", () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(10_000);
        const ctx = setup({ playData: withLines(line(BENT, "curve")) });
        ctx.click(60, 30);
        ctx.click(40, 40);
        vi.setSystemTime(10_100);
        ctx.click(40, 40);
        expect(ctx.onPlayDataChange).not.toHaveBeenCalled();
    });

    it("undoes a removed bend, back to the curve", () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(10_000);
        const start = withLines(line(BENT, "curve"));
        const ctx = setup({ playData: start });
        ctx.click(60, 30);
        ctx.click(80, 20);
        vi.setSystemTime(10_100);
        ctx.click(80, 20);
        ctx.rerender(ctx.last());
        act(() => ctx.ref.current!.undo());
        expect(ctx.last().drawings[0]).toMatchObject({ path: "curve", points: BENT });
    });

    it("straightens through the handle as one undoable step", () => {
        const start = withLines(line(BENT, "curve"));
        const ctx = setup({ playData: start });
        act(() => ctx.ref.current!.updateElement("l", { path: "straight", points: [BENT[0], BENT[2]] }));
        expect(ctx.last().drawings[0]).toMatchObject({ path: "straight", points: [BENT[0], BENT[2]] });
        ctx.rerender(ctx.last());
        act(() => ctx.ref.current!.undo());
        expect(ctx.last().drawings[0]).toMatchObject({ path: "curve", points: BENT });
    });
});

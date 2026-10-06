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

/** A board `size` px across: 800 × 400 (desktop) unless given; a phone-sized board has a far larger hit radius in feet. */
function setup(props: Partial<RinkBoardProps> = {}, size = { width: 800, height: 400 }) {
    const { width, height } = size;
    widthSpy.mockReturnValue(width);
    heightSpy.mockReturnValue(height);
    const onPlayDataChange = vi.fn();
    const onSelectionChange = vi.fn();
    const onUndoRedoStateChange = vi.fn();
    const ref = React.createRef<RinkBoardHandle>();
    const playData: PlayData = props.playData ?? createEmptyPlayData();
    const board = (data: PlayData, extra: Partial<RinkBoardProps> = {}) => (
        <RinkBoard
            ref={ref}
            mode="edit"
            width={width}
            height={height}
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
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width, height, right: width, bottom: height, x: 0, y: 0, toJSON: () => ({}) });
    const transform = createTransformContext(width, height, 20, editViewport(playData.area));
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

describe("RinkBoard line editing: snapping", () => {
    const targets = (): PlayData => ({
        ...createEmptyPlayData(),
        players: [{ id: "p", position: { x: 50, y: 40 }, role: "X", label: "", color: "#1976D2" }],
        equipment: [{ id: "c", kind: "cone", position: { x: 100, y: 40 }, rotation: 0 }],
    });
    const straightTool = { selectedTool: "stroke" as const, strokeOptions: { action: "skate" as const, path: "straight" as const, end: "arrow" as const } };

    it("snaps a new line's start and end to a player and a cone", () => {
        const ctx = setup({ playData: targets(), ...straightTool });
        fireEvent.mouseDown(ctx.canvas, ctx.at(52, 42));
        fireEvent.mouseMove(ctx.canvas, ctx.at(80, 41));
        fireEvent.mouseMove(ctx.canvas, ctx.at(102, 41));
        fireEvent.mouseUp(ctx.canvas);
        expect(ctx.last().drawings[0].points).toEqual([{ x: 50, y: 40 }, { x: 100, y: 40 }]);
    });

    it("skips snapping while Alt/Option is held", () => {
        const ctx = setup({ playData: targets(), ...straightTool });
        fireEvent.mouseDown(ctx.canvas, { ...ctx.at(52, 42), altKey: true });
        fireEvent.mouseMove(ctx.canvas, { ...ctx.at(102, 41), altKey: true });
        fireEvent.mouseUp(ctx.canvas);
        const [start, end] = ctx.last().drawings[0].points;
        expectPoint(start, 52, 42);
        expectPoint(end, 102, 41);
        expect(start).not.toEqual({ x: 50, y: 40 });
    });

    it("snaps only a freehand line's first and last points", () => {
        const ctx = setup({ playData: targets(), selectedTool: "stroke", strokeOptions: { action: "skate", path: "freehand", end: "arrow" } });
        fireEvent.mouseDown(ctx.canvas, ctx.at(52, 42));
        fireEvent.mouseMove(ctx.canvas, ctx.at(65, 30));
        fireEvent.mouseMove(ctx.canvas, ctx.at(80, 50));
        fireEvent.mouseMove(ctx.canvas, ctx.at(101, 42));
        fireEvent.mouseUp(ctx.canvas);
        const points = ctx.last().drawings[0].points;
        expect(points[0]).toEqual({ x: 50, y: 40 });
        expect(points[points.length - 1]).toEqual({ x: 100, y: 40 });
        expect(points.slice(1, -1).some((p) => p.x === 50 || p.x === 100)).toBe(false);
    });

    it("snaps a dragged end to another line's end, never to its own", () => {
        const other = line([{ x: 60, y: 70 }, { x: 140, y: 60 }], "straight", "m");
        const ctx = setup({ playData: withLines(line(STRAIGHT), other) });
        ctx.click(60, 40);
        ctx.drag([120, 40], [138, 58]);
        expect(ctx.last().drawings[0].points[1]).toEqual({ x: 140, y: 60 });

        const own = setup({ playData: withLines(line(STRAIGHT)) });
        own.click(60, 40);
        own.drag([120, 40], [42, 41]);
        const end = own.last().drawings[0].points[1];
        expectPoint(end, 42, 41);
        expect(end).not.toEqual({ x: 40, y: 40 });
    });

    it("never snaps a bend or a whole-line move", () => {
        const ctx = setup({ playData: { ...targets(), drawings: [line([{ x: 40, y: 60 }, { x: 120, y: 60 }])] } });
        ctx.click(60, 60);
        ctx.drag([80, 60], [99, 41]);
        expectPoint(ctx.last().drawings[0].points[1], 99, 41);
    });

    it("ignores a target outside the drill's area", () => {
        const ctx = setup({
            playData: { ...createEmptyPlayData(), area: CUSTOM, players: [{ id: "p", position: { x: 98, y: 40 }, role: "X", label: "", color: "#1976D2" }] },
            ...straightTool,
        });
        fireEvent.mouseDown(ctx.canvas, ctx.at(99.5, 40));
        fireEvent.mouseMove(ctx.canvas, ctx.at(110, 40));
        fireEvent.mouseUp(ctx.canvas);
        expectPoint(ctx.last().drawings[0].points[0], 100, 40);
    });
});

describe("RinkBoard line editing: snapping on a phone-sized board", () => {
    // 300 × 200 px over the full rink: about 1.3 px/ft, so the 22 px hit radius (and the snap radius) is about 17 ft
    const PHONE = { width: 300, height: 200 };
    const player = { id: "p", position: { x: 50, y: 40 }, role: "X" as const, label: "", color: "#1976D2" };
    const draw = (path: StrokePath) => setup(
        { playData: { ...createEmptyPlayData(), players: [player] }, selectedTool: "stroke", strokeOptions: { action: "pass", path, end: "arrow" } },
        PHONE
    );

    it("has a snap radius well above 3 ft", () => {
        const transform = createTransformContext(PHONE.width, PHONE.height, 20, editViewport());
        expect(22 / Math.min(transform.scaleX, transform.scaleY)).toBeGreaterThan(15);
    });

    it("keeps a short pass started at a player, with its end where it was released", () => {
        const ctx = draw("straight");
        fireEvent.mouseDown(ctx.canvas, ctx.at(52, 42));
        fireEvent.mouseMove(ctx.canvas, ctx.at(58, 40));
        fireEvent.mouseUp(ctx.canvas);
        const [start, end] = ctx.last().drawings[0].points;
        expect(start).toEqual({ x: 50, y: 40 });
        expectPoint(end, 58, 40);
    });

    it("keeps a short freehand line started at a player", () => {
        const ctx = draw("freehand");
        fireEvent.mouseDown(ctx.canvas, ctx.at(52, 42));
        fireEvent.mouseMove(ctx.canvas, ctx.at(55, 46));
        fireEvent.mouseMove(ctx.canvas, ctx.at(60, 44));
        fireEvent.mouseUp(ctx.canvas);
        const points = ctx.last().drawings[0].points;
        expect(points[0]).toEqual({ x: 50, y: 40 });
        expectPoint(points[points.length - 1], 60, 44);
    });

    it("creates nothing for a micro-drag, even between two targets it would snap to", () => {
        const ctx = setup({
            playData: { ...createEmptyPlayData(), players: [player], equipment: [{ id: "c", kind: "cone", position: { x: 70, y: 40 }, rotation: 0 }] },
            selectedTool: "stroke",
            strokeOptions: { action: "pass", path: "straight", end: "arrow" },
        }, PHONE);
        // Pressed nearer the player, released nearer the cone, 0.4 ft apart
        fireEvent.mouseDown(ctx.canvas, ctx.at(59.8, 40));
        fireEvent.mouseMove(ctx.canvas, ctx.at(60.2, 40));
        fireEvent.mouseUp(ctx.canvas);
        expect(ctx.onPlayDataChange).not.toHaveBeenCalled();
    });

    it("never commits a drawn line whose snapped ends coincide", () => {
        const ctx = draw("straight");
        fireEvent.mouseDown(ctx.canvas, ctx.at(45, 40));
        fireEvent.mouseMove(ctx.canvas, ctx.at(55, 40));
        fireEvent.mouseUp(ctx.canvas);
        const drawn = ctx.onPlayDataChange.mock.calls.map((call) => (call[0] as PlayData).drawings).flat();
        for (const d of drawn) expect(d.points[0]).not.toEqual(d.points[d.points.length - 1]);
        expectPoint(ctx.last().drawings[0].points[1], 55, 40);
    });

    it("never drags a free end onto the player under the line's other end", () => {
        const ctx = setup({ playData: { ...createEmptyPlayData(), players: [player], drawings: [line([{ x: 50, y: 40 }, { x: 100, y: 40 }])] } }, PHONE);
        ctx.click(80, 40);
        expect(ctx.onSelectionChange).toHaveBeenLastCalledWith("l");
        ctx.drag([100, 40], [60, 40]);
        const [start, end] = ctx.last().drawings[0].points;
        expect(start).toEqual({ x: 50, y: 40 });
        expectPoint(end, 60, 40);
    });
});

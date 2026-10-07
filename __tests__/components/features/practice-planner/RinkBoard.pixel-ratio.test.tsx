import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { RinkBoard } from "@/components/features/practice-planner/RinkBoard";
import { createEmptyPlayData } from "@/lib/utils/play-data";

const setDpr = (value: number) => Object.defineProperty(window, "devicePixelRatio", { value, configurable: true });

const ctx = new Proxy({} as Record<string, unknown>, {
    get: (t, prop) => (typeof prop === "string" && prop in t ? t[prop] : () => ({ width: 10 })),
    set: (t, prop, value) => {
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
    global.requestAnimationFrame = vi.fn(() => 1) as unknown as typeof requestAnimationFrame;
    global.cancelAnimationFrame = vi.fn();
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ctx) as unknown as HTMLCanvasElement["getContext"];
});

describe("RinkBoard pixel ratio", () => {
    beforeEach(() => {
        vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800);
        vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(400);
    });
    afterEach(() => {
        setDpr(1);
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("sizes the backing store at the screen's ratio and the CSS box at the container size", () => {
        setDpr(2);
        const { container } = render(<RinkBoard playData={createEmptyPlayData()} mode="view" height={400} />);
        const canvas = container.querySelector("canvas")!;
        expect([canvas.width, canvas.height]).toEqual([1600, 800]);
        expect([canvas.style.width, canvas.style.height]).toEqual(["800px", "400px"]);
    });

    it("puts the border on the container, so the canvas's CSS box equals its backing store and draws 1:1", () => {
        const { container } = render(<RinkBoard playData={createEmptyPlayData()} mode="view" height={400} />);
        const canvas = container.querySelector("canvas")!;
        expect(canvas.style.border).toBe("");
        expect(canvas.parentElement!.style.border).toMatch(/^1px solid/);
        expect(canvas.parentElement!.style.boxSizing).toBe("border-box");
    });

    it("re-sizes when the ratio changes (window moved to another screen)", () => {
        let fire: (() => void) | undefined;
        vi.stubGlobal("matchMedia", () => ({ addEventListener: (_: string, fn: () => void) => (fire = fn), removeEventListener: vi.fn() }));
        setDpr(1);
        const { container } = render(<RinkBoard playData={createEmptyPlayData()} mode="view" height={400} />);
        const canvas = container.querySelector("canvas")!;
        expect(canvas.width).toBe(800);
        setDpr(2);
        act(() => fire!());
        expect(canvas.width).toBe(1600);
    });
});

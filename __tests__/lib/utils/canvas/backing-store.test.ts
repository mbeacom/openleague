import { afterEach, describe, expect, it, vi } from "vitest";
import { backingPixelRatio, sizeBackingStore, watchPixelRatio } from "@/lib/utils/canvas/backing-store";

const setDpr = (value: number) => Object.defineProperty(window, "devicePixelRatio", { value, configurable: true });

describe("backingPixelRatio", () => {
    afterEach(() => setDpr(1));

    it.each([[1, 1], [2, 2], [2.5, 2.5], [4, 3], [0.5, 1], [Number.NaN, 1], [Infinity, 1]])("dpr %s → %s", (dpr, expected) => {
        setDpr(dpr);
        expect(backingPixelRatio()).toBe(expected);
    });
});

describe("sizeBackingStore", () => {
    it("sizes the backing store to css × ratio, rounded", () => {
        const canvas = document.createElement("canvas");
        sizeBackingStore(canvas, 301, 128, 1.5);
        expect([canvas.width, canvas.height]).toEqual([452, 192]);
    });

    it("never sizes below 1 px, so a hidden container doesn't produce an empty canvas error", () => {
        const canvas = document.createElement("canvas");
        sizeBackingStore(canvas, 0, 0, 2);
        expect([canvas.width, canvas.height]).toEqual([1, 1]);
    });
});

describe("watchPixelRatio", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        setDpr(1);
    });

    it("calls back when the resolution query changes, re-arms for the new ratio, and unsubscribes", () => {
        const listeners = new Map<string, () => void>();
        const queries: string[] = [];
        vi.stubGlobal("matchMedia", (query: string) => {
            queries.push(query);
            return {
                addEventListener: (_: string, fn: () => void) => listeners.set(query, fn),
                removeEventListener: () => listeners.delete(query),
            };
        });
        setDpr(1);
        const onChange = vi.fn();
        const stop = watchPixelRatio(onChange);
        expect(queries).toEqual(["(resolution: 1dppx)"]);
        setDpr(2);
        listeners.get("(resolution: 1dppx)")!();
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(queries).toEqual(["(resolution: 1dppx)", "(resolution: 2dppx)"]);
        stop();
        expect(listeners.size).toBe(0);
    });

    it("is a no-op without matchMedia", () => {
        vi.stubGlobal("matchMedia", undefined);
        expect(() => watchPixelRatio(vi.fn())()).not.toThrow();
    });
});

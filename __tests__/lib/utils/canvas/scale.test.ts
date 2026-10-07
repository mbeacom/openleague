import { describe, expect, it } from "vitest";
import { MIN_LINE_PX, REFERENCE_PX_PER_FT, refPx, snapLineWidth, snapLineX } from "@/lib/utils/canvas/scale";

describe("refPx", () => {
    it("returns the reference size exactly at the reference scale", () => {
        expect(refPx(2, REFERENCE_PX_PER_FT)).toBe(2);
        expect(refPx(3, 3.8)).toBe(3);
        expect(refPx(10, 3.8)).toBe(10);
    });

    it("scales in proportion to px per foot", () => {
        expect(refPx(2, 7.6)).toBeCloseTo(4);
        expect(refPx(4, 1.9)).toBeCloseTo(2);
    });

    it("never goes below the floor", () => {
        expect(refPx(2, 0.38)).toBe(MIN_LINE_PX);
        expect(refPx(10, 0.38, 4)).toBe(4);
    });
});

describe("snapLineX", () => {
    const ctxWith = (m: { a: number; b: number; c: number; d: number; e: number; f: number }) =>
        ({ getTransform: () => m }) as unknown as CanvasRenderingContext2D;

    it("centers an odd-device-width line on a half device pixel", () => {
        // ratio 1: a 1 px line at x = 75.3 snaps to 75.5
        expect(snapLineX(ctxWith({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }), 75.3, 1)).toBeCloseTo(75.5);
    });

    it("centers an even-device-width line on a whole device pixel", () => {
        // ratio 2: a 1 px (2 device px) line at x = 75.3 → device 150.6 → 151 → 75.5
        expect(snapLineX(ctxWith({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 }), 75.3, 1)).toBeCloseTo(75.5);
        // ratio 1, 2 px line at 75.3 → 75
        expect(snapLineX(ctxWith({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }), 75.3, 2)).toBeCloseTo(75);
    });

    it("accounts for the transform's translation", () => {
        // ratio 2 with a 10.25 px pan: device x = 2·75.3 + 10.25 = 160.85 → 161 (even width) → (161 − 10.25) / 2
        expect(snapLineX(ctxWith({ a: 2, b: 0, c: 0, d: 2, e: 10.25, f: 0 }), 75.3, 1)).toBeCloseTo(75.375);
    });

    it("leaves x alone without getTransform, or under a rotation or skew", () => {
        expect(snapLineX({} as CanvasRenderingContext2D, 75.3, 1)).toBe(75.3);
        // A mocked or partial context whose getTransform reports nothing.
        expect(snapLineX({ getTransform: () => undefined } as unknown as CanvasRenderingContext2D, 75.3, 1)).toBe(75.3);
        expect(snapLineX(ctxWith({ a: 1, b: 0.5, c: 0, d: 1, e: 0, f: 0 }), 75.3, 1)).toBe(75.3);
        expect(snapLineX(ctxWith({ a: 1, b: 0, c: 0.5, d: 1, e: 0, f: 0 }), 75.3, 1)).toBe(75.3);
    });
});

describe("snapLineWidth", () => {
    const ctxWith = (a: number, b = 0) =>
        ({ getTransform: () => ({ a, b, c: 0, d: a, e: 0, f: 0 }) }) as unknown as CanvasRenderingContext2D;

    it("rounds the width to whole device pixels", () => {
        expect(snapLineWidth(ctxWith(2), 3.8)).toBe(4); // 7.6 → 8 device px
        expect(snapLineWidth(ctxWith(1), 3.8)).toBe(4);
        expect(snapLineWidth(ctxWith(3), 1.5)).toBeCloseTo(5 / 3); // 4.5 → 5 device px
    });

    it("never goes below one device pixel", () => {
        expect(snapLineWidth(ctxWith(2), 0.1)).toBe(0.5);
    });

    it("leaves the width alone without getTransform, or under a rotation", () => {
        expect(snapLineWidth({} as CanvasRenderingContext2D, 3.8)).toBe(3.8);
        expect(snapLineWidth({ getTransform: () => undefined } as unknown as CanvasRenderingContext2D, 3.8)).toBe(3.8);
        expect(snapLineWidth(ctxWith(1, 0.5), 3.8)).toBe(3.8);
    });
});

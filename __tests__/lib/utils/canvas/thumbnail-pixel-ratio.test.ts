/** generateThumbnail's pixelRatio (3b): a sharper backing store for print, same geometry. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateThumbnail, THUMBNAIL_DIMENSIONS } from "@/lib/utils/canvas/thumbnail-generator";
import { clearRinkCache } from "@/lib/utils/canvas/rink-renderer";
import { createEmptyPlayData } from "@/lib/utils/play-data";

type Call = { name: string; args: unknown[] };
type FakeCanvas = { width: number; height: number; calls: Call[] };

function recordingCtx(calls: Call[]): CanvasRenderingContext2D {
    const target: Record<string, unknown> = {};
    return new Proxy(target, {
        get(t, prop) {
            if (typeof prop !== "string") return undefined;
            if (prop in t) return t[prop];
            return (...args: unknown[]) => {
                calls.push({ name: prop, args });
                return { width: 10 };
            };
        },
        set(t, prop, value) {
            if (typeof prop === "string") t[prop] = value;
            return true;
        },
    }) as unknown as CanvasRenderingContext2D;
}

describe("generateThumbnail pixelRatio", () => {
    let canvases: FakeCanvas[];

    beforeEach(() => {
        clearRinkCache();
        canvases = [];
        const real = document.createElement.bind(document);
        vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
            if (tag !== "canvas") return real(tag);
            const calls: Call[] = [];
            const ctx = recordingCtx(calls);
            const canvas = { width: 0, height: 0, calls, getContext: () => ctx, toDataURL: () => "data:image/png;base64,AA==" };
            canvases.push(canvas);
            return canvas as unknown as HTMLCanvasElement;
        }) as typeof document.createElement);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        clearRinkCache();
    });

    it("sizes the backing store by the ratio and scales before any drawing", () => {
        generateThumbnail(createEmptyPlayData(), { width: 720, height: 306, pixelRatio: 3 });
        const [thumb] = canvases;
        expect([thumb.width, thumb.height]).toEqual([2160, 918]);
        expect(thumb.calls[0]).toEqual({ name: "scale", args: [3, 3] });
        // The background is filled in logical pixels, which scale(3) stretches over the whole backing store.
        expect(thumb.calls.find((c) => c.name === "fillRect")?.args).toEqual([0, 0, 720, 306]);
    });

    it("draws the rink as vectors above ratio 1, so no cached rink bitmap is created or blitted", () => {
        generateThumbnail(createEmptyPlayData(), { width: 720, height: 306, pixelRatio: 3 });
        expect(canvases).toHaveLength(1);
        expect(canvases[0].calls.some((c) => c.name === "drawImage")).toBe(false);
    });

    it("is unchanged without a ratio: logical size, no scale, cached rink blitted", () => {
        generateThumbnail(createEmptyPlayData());
        const [thumb] = canvases;
        expect([thumb.width, thumb.height]).toEqual([THUMBNAIL_DIMENSIONS.width, THUMBNAIL_DIMENSIONS.height]);
        expect(thumb.calls.some((c) => c.name === "scale")).toBe(false);
        expect(canvases).toHaveLength(2); // the thumbnail, then the rink cache
        expect(thumb.calls.some((c) => c.name === "drawImage")).toBe(true);
    });

    it.each([
        [10, 4],
        [4, 4],
        [2.5, 2.5],
        [0.5, 1],
        [0, 1],
        [-2, 1],
        [Number.NaN, 1],
        [Number.POSITIVE_INFINITY, 1],
    ])("clamps pixelRatio %s to %s", (input, expected) => {
        generateThumbnail(createEmptyPlayData(), { width: 300, height: 128, pixelRatio: input });
        expect(canvases[0].width).toBe(Math.round(300 * expected));
        expect(canvases[0].calls.some((c) => c.name === "scale")).toBe(expected !== 1);
    });
});

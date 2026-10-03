/** Thumbnails show the whole rink, with everything outside the drill's area shaded. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateThumbnail, THUMBNAIL_DIMENSIONS } from "@/lib/utils/canvas/thumbnail-generator";
import { clearRinkCache, createTransformContext, rinkToCanvas } from "@/lib/utils/canvas/rink-renderer";
import { createEmptyPlayData } from "@/lib/utils/play-data";

type Call = { name: string; args: unknown[] };

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

describe("generateThumbnail with an ice area", () => {
    let canvases: Call[][];

    beforeEach(() => {
        clearRinkCache();
        canvases = [];
        const real = document.createElement.bind(document);
        vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
            if (tag !== "canvas") return real(tag);
            const calls: Call[] = [];
            canvases.push(calls);
            const ctx = recordingCtx(calls);
            return { width: 0, height: 0, getContext: () => ctx, toDataURL: () => "data:image/png;base64,AA==" } as unknown as HTMLCanvasElement;
        }) as typeof document.createElement);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        clearRinkCache();
    });

    it("outlines the area on the full-rink transform", () => {
        generateThumbnail({ ...createEmptyPlayData(), area: { kind: "zone-right" } });
        const thumb = canvases[0]; // the thumbnail canvas is created first, the rink cache second
        const t = createTransformContext(THUMBNAIL_DIMENSIONS.width, THUMBNAIL_DIMENSIONS.height, 10);
        const outline = thumb.find((c) => c.name === "strokeRect");
        expect(outline?.args[0]).toBeCloseTo(rinkToCanvas({ x: 125, y: 0 }, t).x, 9);
        expect(thumb.some((c) => c.name === "fill" && c.args[0] === "evenodd")).toBe(true);
    });

    it("draws no mask for a full-ice drill", () => {
        generateThumbnail(createEmptyPlayData());
        expect(canvases[0].some((c) => c.name === "setLineDash")).toBe(false);
    });
});

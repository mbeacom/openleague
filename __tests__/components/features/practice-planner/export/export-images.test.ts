/** canvasRenderers: the browser side of the exports. A drawing failure becomes null, never a failed export. */
import { afterEach, describe, expect, it, vi } from "vitest";

const { mockGenerate } = vi.hoisted(() => ({ mockGenerate: vi.fn(() => "data:image/png;base64,AAAA") }));
vi.mock("@/lib/utils/canvas/thumbnail-generator", () => ({ generateThumbnail: mockGenerate }));

import { canvasRenderers } from "@/components/features/practice-planner/export/export-images";
import type { LegendEntry } from "@/lib/utils/canvas/legend";
import { createEmptyPlayData } from "@/lib/utils/play-data";

afterEach(() => {
    vi.restoreAllMocks();
    mockGenerate.mockReset();
    mockGenerate.mockReturnValue("data:image/png;base64,AAAA");
});

describe("canvasRenderers.diagram", () => {
    it("draws at the bench sheet's 720×306 and the given pixel ratio", () => {
        const data = createEmptyPlayData();
        expect(canvasRenderers.diagram(data, 2)).toBe("data:image/png;base64,AAAA");
        expect(mockGenerate).toHaveBeenCalledWith(data, { width: 720, height: 306, pixelRatio: 2 });
    });

    it("returns null and warns when drawing throws", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        mockGenerate.mockImplementation(() => {
            throw new Error("no 2d context");
        });
        expect(canvasRenderers.diagram(createEmptyPlayData(), 3)).toBeNull();
        expect(warn).toHaveBeenCalled();
    });
});

const FORWARD: LegendEntry = { key: "role-F", label: "Forward", type: "role", role: "F" };

/** vitest.setup.ts's 2d context mock, plus a recording vi.fn for any method it lacks. */
function recordingContext() {
    const base = document.createElement("canvas").getContext("2d") as unknown as Record<string | symbol, unknown>;
    return new Proxy(base, {
        get(t, key) {
            if (!(key in t)) t[key] = vi.fn();
            return t[key];
        },
    }) as unknown as CanvasRenderingContext2D;
}

describe("canvasRenderers.swatch", () => {
    it("draws a 40×20 swatch at 2× and returns its PNG", () => {
        const ctx = recordingContext();
        let drawnOn: HTMLCanvasElement | undefined;
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
            drawnOn = this;
            return ctx;
        } as never);
        expect(canvasRenderers.swatch(FORWARD)).toBe("data:image/png;base64,mockImageData"); // vitest.setup.ts's toDataURL
        expect([drawnOn?.width, drawnOn?.height]).toEqual([80, 40]);
        expect(ctx.scale).toHaveBeenCalledWith(2, 2);
    });

    it("returns null without a 2d context", () => {
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
        expect(canvasRenderers.swatch(FORWARD)).toBeNull();
    });
});

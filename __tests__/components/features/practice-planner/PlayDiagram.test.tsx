import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { PlayDiagram } from "@/components/features/practice-planner/PlayDiagram";
import { drawThumbnailScene } from "@/lib/utils/canvas/thumbnail-generator";
import { createEmptyPlayData } from "@/lib/utils/play-data";

vi.mock("@/lib/utils/canvas/thumbnail-generator", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/utils/canvas/thumbnail-generator")>()),
    drawThumbnailScene: vi.fn(),
}));

const setDpr = (value: number) => Object.defineProperty(window, "devicePixelRatio", { value, configurable: true });

let resize: ((entries: Array<{ contentRect: { width: number; height: number } }>) => void) | undefined;
class FakeResizeObserver {
    constructor(cb: typeof resize) {
        resize = cb;
    }
    observe() { /* noop */ }
    unobserve() { /* noop */ }
    disconnect() { /* noop */ }
}

describe("PlayDiagram", () => {
    beforeEach(() => {
        vi.stubGlobal("ResizeObserver", FakeResizeObserver);
        vi.mocked(drawThumbnailScene).mockClear();
    });
    afterEach(() => {
        setDpr(1);
        vi.unstubAllGlobals();
    });

    it("draws at the measured size × the screen's ratio, as vectors", () => {
        setDpr(2);
        render(<PlayDiagram playData={createEmptyPlayData()} label="Backward Tag" />);
        act(() => resize!([{ contentRect: { width: 600, height: 256 } }]));
        const canvas = screen.getByRole("img", { name: "Backward Tag diagram" }) as HTMLCanvasElement;
        expect([canvas.width, canvas.height]).toEqual([1200, 512]);
        expect(drawThumbnailScene).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), 600, 256, { cachedRink: false });
    });

    it("draws nothing until the container has a size", () => {
        render(<PlayDiagram playData={createEmptyPlayData()} label="Hidden" />);
        act(() => resize!([{ contentRect: { width: 0, height: 0 } }]));
        expect(drawThumbnailScene).not.toHaveBeenCalled();
    });
});

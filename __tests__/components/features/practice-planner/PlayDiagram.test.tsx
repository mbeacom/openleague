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

    it("backs the canvas at the measured size × the screen's ratio", () => {
        setDpr(2);
        render(<PlayDiagram playData={createEmptyPlayData()} label="Backward Tag" />);
        act(() => resize!([{ contentRect: { width: 600, height: 256 } }]));
        const canvas = screen.getByRole("img", { name: "Backward Tag diagram" }) as HTMLCanvasElement;
        expect([canvas.width, canvas.height]).toEqual([1200, 512]);
    });

    it.each([
        // [css width, css height, dpr, logical height, transform scale]
        [600, 256, 2, 128, 4],
        [48, 32, 2, 200, 0.32],
        [120, 51, 1, 127.5, 0.4],
    ])("draws a %i×%i box in the stored thumbnail's 300 px space, so proportions match the stored image", (w, h, dpr, logicalH, scale) => {
        setDpr(dpr);
        const setTransform = vi.fn();
        const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ setTransform } as unknown as CanvasRenderingContext2D);
        render(<PlayDiagram playData={createEmptyPlayData()} label="Low Cycle" />);
        act(() => resize!([{ contentRect: { width: w, height: h } }]));
        expect(setTransform).toHaveBeenLastCalledWith(scale, 0, 0, scale, 0, 0);
        const [, , width, height, options] = vi.mocked(drawThumbnailScene).mock.lastCall!;
        expect([width, options]).toEqual([300, { cachedRink: false }]);
        expect(height).toBeCloseTo(logicalH);
        getContext.mockRestore();
    });

    it("is hidden from assistive tech when decorative, so a card that names the drill doesn't announce it twice", () => {
        const { container } = render(<PlayDiagram playData={createEmptyPlayData()} label="Low Cycle" decorative />);
        expect(screen.queryByRole("img")).toBeNull();
        expect(container.querySelector("canvas")).toHaveAttribute("aria-hidden", "true");
    });

    it("draws nothing until the container has a size", () => {
        render(<PlayDiagram playData={createEmptyPlayData()} label="Hidden" />);
        act(() => resize!([{ contentRect: { width: 0, height: 0 } }]));
        expect(drawThumbnailScene).not.toHaveBeenCalled();
    });
});

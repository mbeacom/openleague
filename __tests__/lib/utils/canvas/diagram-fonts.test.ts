import { afterEach, describe, expect, it, vi } from "vitest";
import { DIAGRAM_FONT_FAMILY, diagramFont, diagramFontReady, onDiagramFontLoaded, waitForDiagramFont } from "@/lib/utils/canvas/diagram-fonts";

const setFonts = (fonts: unknown) => Object.defineProperty(document, "fonts", { value: fonts, configurable: true });

describe("diagram fonts", () => {
    afterEach(() => {
        vi.useRealTimers();
        setFonts(undefined);
    });

    it("names Cabinet Grotesk with a system fallback", () => {
        expect(DIAGRAM_FONT_FAMILY).toBe('"Cabinet Grotesk", system-ui, sans-serif');
        expect(diagramFont(800, 10.5)).toBe('800 10.5px "Cabinet Grotesk", system-ui, sans-serif');
    });

    it("loads both weights and resolves when they arrive", async () => {
        const load = vi.fn((_font: string) => Promise.resolve([]));
        setFonts({ load });
        await waitForDiagramFont();
        expect(load.mock.calls.map((c) => c[0])).toEqual([diagramFont(800, 16), diagramFont(600, 16)]);
    });

    it("resolves, never rejects, when the font fails to load", async () => {
        setFonts({ load: () => Promise.reject(new Error("blocked")) });
        await expect(waitForDiagramFont()).resolves.toBeUndefined();
    });

    it("gives up after the timeout so a blocked font CDN never hangs a print", async () => {
        vi.useFakeTimers();
        setFonts({ load: () => new Promise(() => undefined) });
        const done = vi.fn();
        void waitForDiagramFont(1500).then(done);
        await vi.advanceTimersByTimeAsync(1499);
        expect(done).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(done).toHaveBeenCalled();
    });

    it("resolves at once without the Font Loading API", async () => {
        setFonts(undefined);
        await expect(waitForDiagramFont()).resolves.toBeUndefined();
    });

    it("tells live canvases when fonts finish loading, and unsubscribes", () => {
        const listeners = new Set<() => void>();
        setFonts({ load: vi.fn(), addEventListener: (_: string, fn: () => void) => listeners.add(fn), removeEventListener: (_: string, fn: () => void) => listeners.delete(fn) });
        const onLoaded = vi.fn();
        const stop = onDiagramFontLoaded(onLoaded);
        for (const fn of listeners) fn();
        expect(onLoaded).toHaveBeenCalledTimes(1);
        stop();
        expect(listeners.size).toBe(0);
    });

    it("is ready at once when there's nothing to wait for: no Font Loading API, or both weights already loaded", () => {
        setFonts(undefined);
        expect(diagramFontReady()).toBe(true);
        setFonts({ load: vi.fn(), check: () => true });
        expect(diagramFontReady()).toBe(true);
        setFonts({ load: vi.fn(), check: (font: string) => font.startsWith("800") });
        expect(diagramFontReady()).toBe(false);
    });
});

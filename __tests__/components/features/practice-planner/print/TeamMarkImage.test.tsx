/** TeamMarkImage: the bench sheet's mark, a logo or the Crest as an image (prints without CSS backgrounds). */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { CrestPaint } from "@/lib/utils/canvas/crest-png";

const { mockCrestPng } = vi.hoisted(() => ({
    mockCrestPng: vi.fn((_paint: CrestPaint): string | null => "data:image/png;base64,CREST"),
}));
vi.mock("@/lib/utils/canvas/crest-png", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/utils/canvas/crest-png")>()),
    crestPng: mockCrestPng,
}));

import { CREST_FONT_WAIT_MS, TeamMarkImage } from "@/components/features/practice-planner/print/TeamMarkImage";

const MARK = { id: "cteamxxxxxxxxxxxxxxxxxxxx", name: "Ice Hawks", logoUrl: "https://abc.public.blob.vercel-storage.com/branding/team/t/l.png", color: "#9B1B30" };

describe("TeamMarkImage", () => {
    it("shows the logo at 48 px high with the team's alt text", () => {
        render(<TeamMarkImage mark={MARK} />);
        const img = screen.getByRole("img", { name: "Ice Hawks logo" });
        expect(img).toHaveAttribute("src", MARK.logoUrl);
        expect(img.style.height).toBe("48px");
    });

    it("falls back to the Crest when the logo fails to load", () => {
        render(<TeamMarkImage mark={MARK} />);
        fireEvent.error(screen.getByRole("img", { name: "Ice Hawks logo" }));
        expect(screen.getByRole("img", { name: "Ice Hawks logo" })).toHaveAttribute("src", "data:image/png;base64,CREST");
        expect(mockCrestPng).toHaveBeenCalledWith({ name: "Ice Hawks", color: "#9B1B30", size: 192 });
    });

    it("draws the Crest in the derived color when there is no logo and no brand color", () => {
        render(<TeamMarkImage mark={{ ...MARK, logoUrl: null, color: null }} />);
        expect(screen.getByRole("img", { name: "Ice Hawks logo" })).toHaveAttribute("src", "data:image/png;base64,CREST");
        expect(mockCrestPng.mock.calls.at(-1)?.[0].color).toMatch(/^#[0-9A-F]{6}$/);
    });

    it("renders nothing when the Crest can't be drawn", () => {
        mockCrestPng.mockReturnValueOnce(null);
        const { container } = render(<TeamMarkImage mark={{ ...MARK, logoUrl: null }} />);
        expect(container.querySelector("img")).toBeNull();
    });

    it("draws the alt text from a cleaned team name, markup kept as text", () => {
        render(<TeamMarkImage mark={{ ...MARK, name: " Hawks\u0001 <U12>  & \"Co\" " }} />);
        expect(screen.getByRole("img")).toHaveAttribute("alt", "Hawks <U12> & \"Co\" logo");
    });
});

describe("TeamMarkImage: readiness for print", () => {
    it("is ready once the logo loads", () => {
        const onReady = vi.fn();
        render(<TeamMarkImage mark={MARK} onReady={onReady} />);
        expect(onReady).not.toHaveBeenCalled();
        fireEvent.load(screen.getByRole("img", { name: "Ice Hawks logo" }));
        expect(onReady).toHaveBeenCalled();
    });

    it("is ready once the Crest loads in place of a logo that failed", () => {
        const onReady = vi.fn();
        render(<TeamMarkImage mark={MARK} onReady={onReady} />);
        fireEvent.error(screen.getByRole("img", { name: "Ice Hawks logo" }));
        expect(onReady).not.toHaveBeenCalled();
        const crest = screen.getByRole("img", { name: "Ice Hawks logo" });
        expect(crest).toHaveAttribute("src", "data:image/png;base64,CREST");
        fireEvent.load(crest);
        expect(onReady).toHaveBeenCalled();
    });

    it("is ready when neither the logo nor the Crest can be drawn", () => {
        mockCrestPng.mockReturnValue(null);
        try {
            const onReady = vi.fn();
            const { container } = render(<TeamMarkImage mark={MARK} onReady={onReady} />);
            fireEvent.error(screen.getByRole("img", { name: "Ice Hawks logo" }));
            expect(container.querySelector("img")).toBeNull();
            expect(onReady).toHaveBeenCalled();
        } finally {
            mockCrestPng.mockReturnValue("data:image/png;base64,CREST");
        }
    });

    it("is ready when the Crest image itself fails", () => {
        const onReady = vi.fn();
        render(<TeamMarkImage mark={{ ...MARK, logoUrl: null }} onReady={onReady} />);
        fireEvent.error(screen.getByRole("img", { name: "Ice Hawks logo" }));
        expect(onReady).toHaveBeenCalled();
    });

    describe("an image that settled before hydration", () => {
        function stubSettled(naturalWidth: number) {
            const proto = HTMLImageElement.prototype;
            const complete = Object.getOwnPropertyDescriptor(proto, "complete");
            const width = Object.getOwnPropertyDescriptor(proto, "naturalWidth");
            Object.defineProperty(proto, "complete", { configurable: true, get: () => true });
            Object.defineProperty(proto, "naturalWidth", { configurable: true, get: () => naturalWidth });
            return () => {
                if (complete) Object.defineProperty(proto, "complete", complete);
                if (width) Object.defineProperty(proto, "naturalWidth", width);
            };
        }

        it("is ready on mount when the logo had already loaded", () => {
            const restore = stubSettled(64);
            try {
                const onReady = vi.fn();
                render(<TeamMarkImage mark={MARK} onReady={onReady} />);
                expect(onReady).toHaveBeenCalled();
                expect(screen.getByRole("img")).toHaveAttribute("src", MARK.logoUrl);
            } finally {
                restore();
            }
        });

        it("falls back to the Crest when the logo had already failed", () => {
            const restore = stubSettled(0);
            try {
                render(<TeamMarkImage mark={MARK} />);
                expect(screen.getByRole("img")).toHaveAttribute("src", "data:image/png;base64,CREST");
            } finally {
                restore();
            }
        });
    });

    it("tries a replaced logo again after the previous one failed", () => {
        const { rerender } = render(<TeamMarkImage mark={MARK} />);
        fireEvent.error(screen.getByRole("img", { name: "Ice Hawks logo" }));
        expect(screen.getByRole("img")).toHaveAttribute("src", "data:image/png;base64,CREST");
        const next = "https://abc.public.blob.vercel-storage.com/branding/team/t/l2.png";
        rerender(<TeamMarkImage mark={{ ...MARK, logoUrl: next }} />);
        expect(screen.getByRole("img")).toHaveAttribute("src", next);
    });

    it("prefers the export-ready logo image over the logo URL", () => {
        const dataUrl = "data:image/png;base64,iVBORw0KGgoAAAA=";
        render(<TeamMarkImage mark={{ ...MARK, logoImage: { dataUrl, width: 10, height: 10 } }} />);
        expect(screen.getByRole("img")).toHaveAttribute("src", dataUrl);
    });
});

describe("TeamMarkImage: the Crest's font", () => {
    const original = Object.getOwnPropertyDescriptor(document, "fonts");
    function stubFonts(load: (font: string) => Promise<unknown>, check?: (font: string) => boolean) {
        const spy = vi.fn(load);
        Object.defineProperty(document, "fonts", { configurable: true, value: check ? { load: spy, check } : { load: spy } });
        return spy;
    }
    afterEach(() => {
        if (original) Object.defineProperty(document, "fonts", original);
        else delete (document as { fonts?: unknown }).fonts;
        vi.useRealTimers();
    });

    it("draws at once where the browser has no font loading API", () => {
        expect((document as { fonts?: unknown }).fonts).toBeUndefined();
        render(<TeamMarkImage mark={{ ...MARK, logoUrl: null }} />);
        expect(screen.getByRole("img", { name: "Ice Hawks logo" })).toHaveAttribute("src", "data:image/png;base64,CREST");
    });

    it("waits for the theme font at the painted size and weight before drawing", async () => {
        let loaded!: () => void;
        const load = stubFonts(() => new Promise<void>((resolve) => { loaded = resolve; }));
        mockCrestPng.mockClear();
        const { container } = render(<TeamMarkImage mark={{ ...MARK, logoUrl: null }} />);
        expect(load).toHaveBeenCalledWith(expect.stringMatching(/^800 68px .*Cabinet Grotesk/));
        expect(container.querySelector("img")).toBeNull();
        expect(mockCrestPng).not.toHaveBeenCalled();
        await act(async () => loaded());
        expect(screen.getByRole("img", { name: "Ice Hawks logo" })).toHaveAttribute("src", "data:image/png;base64,CREST");
    });

    it("draws anyway when the font doesn't load in time", async () => {
        vi.useFakeTimers();
        stubFonts(() => new Promise(() => {}));
        const { container } = render(<TeamMarkImage mark={{ ...MARK, logoUrl: null }} />);
        expect(container.querySelector("img")).toBeNull();
        await act(async () => { await vi.advanceTimersByTimeAsync(CREST_FONT_WAIT_MS); });
        expect(screen.getByRole("img", { name: "Ice Hawks logo" })).toHaveAttribute("src", "data:image/png;base64,CREST");
    });

    it("draws again when the font arrives after the wait gave up", async () => {
        vi.useFakeTimers();
        let arrive!: () => void;
        const arrived = new Promise<void>((resolve) => { arrive = resolve; });
        let available = false;
        stubFonts(() => arrived, () => available);
        mockCrestPng.mockClear();
        render(<TeamMarkImage mark={{ ...MARK, logoUrl: null }} />);
        await act(async () => { await vi.advanceTimersByTimeAsync(CREST_FONT_WAIT_MS); });
        expect(mockCrestPng).toHaveBeenCalledTimes(1);
        available = true;
        await act(async () => { arrive(); await arrived; });
        expect(mockCrestPng).toHaveBeenCalledTimes(2);
        expect(screen.getByRole("img", { name: "Ice Hawks logo" })).toHaveAttribute("src", "data:image/png;base64,CREST");
    });

    it("doesn't draw again when the font was in time", async () => {
        let loaded!: () => void;
        stubFonts(() => new Promise<void>((resolve) => { loaded = resolve; }), () => true);
        mockCrestPng.mockClear();
        render(<TeamMarkImage mark={{ ...MARK, logoUrl: null }} />);
        await act(async () => loaded());
        expect(mockCrestPng).toHaveBeenCalledTimes(1);
    });

    it("draws anyway when the font fails to load", async () => {
        stubFonts(() => Promise.reject(new Error("network")));
        render(<TeamMarkImage mark={{ ...MARK, logoUrl: null }} />);
        expect(await screen.findByRole("img", { name: "Ice Hawks logo" })).toHaveAttribute("src", "data:image/png;base64,CREST");
    });

    it("doesn't throw when the font API disappears before the redraw check", async () => {
        let loaded = false;
        let readsAfterLoad = 0;
        const fonts = {
            load: vi.fn(() => Promise.resolve().then(() => void (loaded = true))),
            check: () => false,
        };
        // The re-render after the load still sees the API; the effect after it doesn't.
        Object.defineProperty(document, "fonts", {
            configurable: true,
            get: () => (!loaded || readsAfterLoad++ === 0 ? fonts : undefined),
        });
        render(<TeamMarkImage mark={{ ...MARK, logoUrl: null }} />);
        expect(await screen.findByRole("img", { name: "Ice Hawks logo" })).toHaveAttribute("src", "data:image/png;base64,CREST");
        expect(readsAfterLoad).toBeGreaterThan(1);
    });

    it("doesn't wait for a font while the logo shows", () => {
        const load = stubFonts(() => new Promise(() => {}));
        render(<TeamMarkImage mark={MARK} />);
        expect(load).not.toHaveBeenCalled();
        expect(screen.getByRole("img", { name: "Ice Hawks logo" })).toHaveAttribute("src", MARK.logoUrl);
    });
});

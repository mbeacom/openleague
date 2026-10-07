/** PrintDiagram (3b): one high-resolution PNG per drill, or "Diagram unavailable". */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { createEmptyPlayData } from "@/lib/utils/play-data";

const { mockGenerate } = vi.hoisted(() => ({ mockGenerate: vi.fn(() => "data:image/png;base64,AA==") }));
vi.mock("@/lib/utils/canvas/thumbnail-generator", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/utils/canvas/thumbnail-generator")>()), generateThumbnail: mockGenerate }));

const fontWait = vi.hoisted(() => ({ wait: vi.fn(() => Promise.resolve()), ready: vi.fn(() => true) }));
vi.mock("@/lib/utils/canvas/diagram-fonts", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/utils/canvas/diagram-fonts")>()),
    waitForDiagramFont: fontWait.wait,
    diagramFontReady: fontWait.ready,
}));

import { PrintDiagram, printPixelRatio } from "@/components/features/practice-planner/print/PrintDiagram";

const wrap = (ui: React.ReactElement) => <ThemeProvider theme={createTheme()}>{ui}</ThemeProvider>;

afterEach(() => {
    vi.restoreAllMocks();
    mockGenerate.mockReset();
    mockGenerate.mockReturnValue("data:image/png;base64,AA==");
});

describe("printPixelRatio", () => {
    it.each([
        [0, 3],
        [12, 3],
        [24, 3],
        [25, 2],
        [40, 2],
        [41, 2],
        [200, 2],
    ])("%i readable drills -> pixel ratio %i (never below 2)", (count, ratio) => {
        expect(printPixelRatio(count)).toBe(ratio);
    });
});

/** The diagram is drawn after the (mocked, already resolved) font wait. */
const flushFont = () => act(async () => {});

describe("PrintDiagram", () => {
    it("renders the diagram at 720×306 with pixel ratio 3, as an eager image", async () => {
        const data = createEmptyPlayData();
        render(wrap(<PrintDiagram playData={data} name="Breakout" />));
        await flushFont();
        const img = screen.getByRole("img", { name: "Diagram: Breakout" });
        expect(img).toHaveAttribute("src", "data:image/png;base64,AA==");
        expect(img).toHaveAttribute("loading", "eager");
        expect(mockGenerate).toHaveBeenCalledWith(data, { width: 720, height: 306, pixelRatio: 3 });
    });

    it("renders at the pixel ratio it is given", async () => {
        const data = createEmptyPlayData();
        render(wrap(<PrintDiagram playData={data} name="Breakout" pixelRatio={1} />));
        await flushFont();
        expect(mockGenerate).toHaveBeenCalledWith(data, { width: 720, height: 306, pixelRatio: 1 });
    });

    it("reports ready once, when its image loads", async () => {
        const onReady = vi.fn();
        const { rerender } = render(wrap(<PrintDiagram playData={createEmptyPlayData()} name="Breakout" onReady={onReady} />));
        await flushFont();
        expect(onReady).not.toHaveBeenCalled();
        const img = screen.getByRole("img", { name: "Diagram: Breakout" });
        fireEvent.load(img);
        fireEvent.load(img);
        rerender(wrap(<PrintDiagram playData={createEmptyPlayData()} name="Breakout" onReady={() => onReady()} />));
        expect(onReady).toHaveBeenCalledTimes(1);
    });

    it("reports ready once for an unreadable drill", () => {
        const onReady = vi.fn();
        const { rerender } = render(wrap(<PrintDiagram playData={null} name="Lost" onReady={onReady} />));
        rerender(wrap(<PrintDiagram playData={null} name="Lost" onReady={() => onReady()} />));
        expect(onReady).toHaveBeenCalledTimes(1);
    });

    it("reports ready when rendering fails", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        mockGenerate.mockImplementation(() => {
            throw new Error("no context");
        });
        const onReady = vi.fn();
        render(wrap(<PrintDiagram playData={createEmptyPlayData()} name="Breakout" onReady={onReady} />));
        await flushFont();
        expect(onReady).toHaveBeenCalledTimes(1);
    });

    it("treats an image that fails to decode as unavailable, and reports ready once", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        const onReady = vi.fn();
        render(wrap(<PrintDiagram playData={createEmptyPlayData()} name="Breakout" onReady={onReady} />));
        await flushFont();
        fireEvent.error(screen.getByRole("img", { name: "Diagram: Breakout" }));
        expect(screen.queryByRole("img", { name: "Diagram: Breakout" })).not.toBeInTheDocument();
        expect(screen.getByText("Diagram unavailable")).toBeInTheDocument();
        expect(onReady).toHaveBeenCalledTimes(1);
    });

    it("shows the placeholder for an unreadable drill without rendering", () => {
        render(wrap(<PrintDiagram playData={null} name="Lost" />));
        expect(screen.getByText("Diagram unavailable")).toBeInTheDocument();
        expect(mockGenerate).not.toHaveBeenCalled();
    });

    it("shows the placeholder and warns when rendering throws", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        mockGenerate.mockImplementation(() => {
            throw new Error("Failed to get 2D context for thumbnail generation");
        });
        render(wrap(<PrintDiagram playData={createEmptyPlayData()} name="Breakout" />));
        await flushFont();
        expect(screen.getByText("Diagram unavailable")).toBeInTheDocument();
        expect(warn).toHaveBeenCalled();
    });

    it("renders a placeholder on the server, where there is no canvas", () => {
        const html = renderToStaticMarkup(wrap(<PrintDiagram playData={createEmptyPlayData()} name="Breakout" />));
        expect(html).toContain("Rendering diagram…");
        expect(mockGenerate).not.toHaveBeenCalled();
    });
});

describe("PrintDiagram font wait (spec §3)", () => {
    it("waits for the diagram font before drawing, so a printed diagram never bakes in the fallback face", async () => {
        let release!: () => void;
        fontWait.ready.mockReturnValueOnce(false);
        fontWait.wait.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
        mockGenerate.mockClear();
        render(<PrintDiagram playData={createEmptyPlayData()} name="Breakout" />);
        expect(screen.getByText("Rendering diagram…")).toBeInTheDocument();
        expect(mockGenerate).not.toHaveBeenCalled();
        await act(async () => { release(); });
        expect(mockGenerate).toHaveBeenCalled();
        expect(screen.getByRole("img", { name: /Breakout/ })).toBeInTheDocument();
    });
});

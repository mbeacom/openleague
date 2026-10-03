/** PrintDiagram (3b): one high-resolution PNG per drill, or "Diagram unavailable". */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { createEmptyPlayData } from "@/lib/utils/play-data";

const { mockGenerate } = vi.hoisted(() => ({ mockGenerate: vi.fn(() => "data:image/png;base64,AA==") }));
vi.mock("@/lib/utils/canvas/thumbnail-generator", () => ({ generateThumbnail: mockGenerate }));

import { PrintDiagram } from "@/components/features/practice-planner/print/PrintDiagram";

const wrap = (ui: React.ReactElement) => <ThemeProvider theme={createTheme()}>{ui}</ThemeProvider>;

afterEach(() => {
    vi.restoreAllMocks();
    mockGenerate.mockReset();
    mockGenerate.mockReturnValue("data:image/png;base64,AA==");
});

describe("PrintDiagram", () => {
    it("renders the diagram at 720×306 with pixel ratio 3, as an eager image", () => {
        const data = createEmptyPlayData();
        render(wrap(<PrintDiagram playData={data} name="Breakout" />));
        const img = screen.getByRole("img", { name: "Diagram: Breakout" });
        expect(img).toHaveAttribute("src", "data:image/png;base64,AA==");
        expect(img).toHaveAttribute("loading", "eager");
        expect(mockGenerate).toHaveBeenCalledWith(data, { width: 720, height: 306, pixelRatio: 3 });
    });

    it("shows the placeholder for an unreadable drill without rendering", () => {
        render(wrap(<PrintDiagram playData={null} name="Lost" />));
        expect(screen.getByText("Diagram unavailable")).toBeInTheDocument();
        expect(mockGenerate).not.toHaveBeenCalled();
    });

    it("shows the placeholder and warns when rendering throws", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        mockGenerate.mockImplementation(() => {
            throw new Error("Failed to get 2D context for thumbnail generation");
        });
        render(wrap(<PrintDiagram playData={createEmptyPlayData()} name="Breakout" />));
        expect(screen.getByText("Diagram unavailable")).toBeInTheDocument();
        expect(warn).toHaveBeenCalled();
    });

    it("renders a placeholder on the server, where there is no canvas", () => {
        const html = renderToStaticMarkup(wrap(<PrintDiagram playData={createEmptyPlayData()} name="Breakout" />));
        expect(html).toContain("Rendering diagram…");
        expect(mockGenerate).not.toHaveBeenCalled();
    });
});

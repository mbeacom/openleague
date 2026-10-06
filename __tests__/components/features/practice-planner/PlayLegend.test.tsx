import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { LegendSwatch, PlayLegend } from "@/components/features/practice-planner/PlayLegend";
import { buildLegend } from "@/lib/utils/canvas/legend";
import { createEmptyPlayData } from "@/lib/utils/play-data";

const wrap = (ui: React.ReactElement) => render(<ThemeProvider theme={createTheme()}>{ui}</ThemeProvider>);

describe("PlayLegend", () => {
    it("renders nothing for an empty or unreadable play", () => {
        const { container } = wrap(<PlayLegend playData={createEmptyPlayData()} />);
        expect(container).toBeEmptyDOMElement();
        const { container: c2 } = wrap(<PlayLegend playData={null} />);
        expect(c2).toBeEmptyDOMElement();
    });

    it("lists the symbols the drill uses", () => {
        const data = { ...createEmptyPlayData(), equipment: [{ id: "n", kind: "net" as const, position: { x: 1, y: 1 }, rotation: 0 }] };
        wrap(<PlayLegend playData={data} defaultExpanded />);
        expect(screen.getByText("Legend (1)")).toBeInTheDocument();
        expect(screen.getByText("Net")).toBeInTheDocument();
    });

    it("shows the area chip above the symbols", () => {
        const data = {
            ...createEmptyPlayData(),
            area: { kind: "zone-neutral" as const },
            equipment: [{ id: "n", kind: "net" as const, position: { x: 100, y: 40 }, rotation: 0 }],
        };
        wrap(<PlayLegend playData={data} />);
        const chip = screen.getByText("Neutral zone");
        const heading = screen.getByText("Legend (1)");
        expect(chip.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("renders just the chip for a drill with an area and no symbols", () => {
        wrap(<PlayLegend playData={{ ...createEmptyPlayData(), area: { kind: "custom", rect: { x: 0, y: 0, w: 40, h: 40 } } }} />);
        expect(screen.getByText("Custom area")).toBeInTheDocument();
        expect(screen.queryByText(/^Legend/)).not.toBeInTheDocument();
    });

    it("shows no chip for full ice", () => {
        const { container } = wrap(<PlayLegend playData={{ ...createEmptyPlayData(), area: { kind: "full" } }} />);
        expect(container).toBeEmptyDOMElement();
    });
});

describe("LegendSwatch", () => {
    it("draws at the screen's pixel ratio, keeping its 40×20 CSS size", () => {
        Object.defineProperty(window, "devicePixelRatio", { value: 2, configurable: true });
        try {
            const data = { ...createEmptyPlayData(), equipment: [{ id: "n", kind: "net" as const, position: { x: 1, y: 1 }, rotation: 0 }] };
            const { container } = render(<LegendSwatch entry={buildLegend(data)[0]} />);
            const canvas = container.querySelector("canvas")!;
            expect([canvas.width, canvas.height]).toEqual([80, 40]);
            expect([canvas.style.width, canvas.style.height]).toEqual(["40px", "20px"]);
        } finally {
            Object.defineProperty(window, "devicePixelRatio", { value: 1, configurable: true });
        }
    });
});

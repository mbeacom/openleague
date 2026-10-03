import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { PlayLegend } from "@/components/features/practice-planner/PlayLegend";
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
});

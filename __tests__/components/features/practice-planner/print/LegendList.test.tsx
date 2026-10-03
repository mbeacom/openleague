/** LegendList (3b): one static legend for the whole bench sheet, each symbol once. */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { combinedLegendData } from "@/lib/utils/canvas/station-map";

// Swatch drawing is PlayLegend's concern; here, only which entries are listed.
vi.mock("@/components/features/practice-planner/PlayLegend", () => ({
    LegendSwatch: () => <span data-testid="swatch" />,
}));

import { LegendList } from "@/components/features/practice-planner/print/LegendList";

const pass = (id: string) => ({
    id,
    action: "pass" as const,
    path: "straight" as const,
    end: "arrow" as const,
    points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
    color: "#000000",
    strokeWidth: 2,
});

const wrap = (ui: React.ReactElement) => render(<ThemeProvider theme={createTheme()}>{ui}</ThemeProvider>);

describe("LegendList", () => {
    it("lists each symbol once across every readable drill", () => {
        const legend = combinedLegendData([
            { name: "A", playData: { ...createEmptyPlayData(), drawings: [pass("d1")] } },
            { name: "B", playData: { ...createEmptyPlayData(), drawings: [pass("d2")], equipment: [{ id: "c", kind: "cone" as const, position: { x: 1, y: 1 }, rotation: 0 }] } },
            { name: "Lost", playData: null },
        ]);
        wrap(<LegendList playData={legend} />);
        const region = screen.getByRole("region", { name: "Legend" });
        expect(within(region).getAllByText("Pass")).toHaveLength(1);
        expect(within(region).getByText("Cone")).toBeInTheDocument();
        expect(within(region).getAllByTestId("swatch")).toHaveLength(2);
    });

    it("renders nothing when no drill is readable, or no symbol is used", () => {
        const { container } = wrap(<LegendList playData={combinedLegendData([{ name: "Lost", playData: null }])} />);
        expect(container).toBeEmptyDOMElement();
        const { container: empty } = wrap(<LegendList playData={createEmptyPlayData()} />);
        expect(empty).toBeEmptyDOMElement();
    });
});

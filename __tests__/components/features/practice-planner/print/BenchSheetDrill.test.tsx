/** BenchSheetDrill (3b): one printed drill: number, name, time, station tag, diagram, text. */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { createEmptyPlayData } from "@/lib/utils/play-data";

vi.mock("@/lib/utils/canvas/thumbnail-generator", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/utils/canvas/thumbnail-generator")>()), generateThumbnail: vi.fn(() => "data:image/png;base64,AA==") }));

import { BenchSheetDrill, drillText, stationTag } from "@/components/features/practice-planner/print/BenchSheetDrill";

const BASE = {
    number: 2,
    name: "Regroup",
    startLabel: "6:00 PM MDT",
    minutes: 10,
    station: { position: 2, count: 2 },
    playData: createEmptyPlayData(),
    text: "Hard tape-to-tape passes.",
};

function renderDrill(props: Partial<React.ComponentProps<typeof BenchSheetDrill>> = {}) {
    render(
        <ThemeProvider theme={createTheme()}>
            <BenchSheetDrill {...BASE} {...props} />
        </ThemeProvider>,
    );
    return screen.getByRole("article", { name: `Drill ${props.number ?? BASE.number}: ${props.name ?? BASE.name}` });
}

describe("drillText", () => {
    it("prefers instructions, then the description, trimming whitespace", () => {
        expect(drillText("Go hard", "A drill")).toBe("Go hard");
        expect(drillText(null, "A drill")).toBe("A drill");
        expect(drillText("   \n ", " A drill ")).toBe("A drill");
        expect(drillText(null, null)).toBeNull();
        expect(drillText("  ", "")).toBeNull();
    });
});

describe("stationTag", () => {
    it("reads Station k of N", () => {
        expect(stationTag(2, 3)).toBe("Station 2 of 3");
    });
});

describe("BenchSheetDrill", () => {
    it("shows its number, name, block start, minutes, station tag, diagram and text", () => {
        const article = renderDrill();
        expect(article).toHaveClass("bench-drill");
        expect(screen.getByRole("heading", { name: "2. Regroup" })).toBeInTheDocument();
        expect(screen.getByText("6:00 PM MDT · 10 min")).toBeInTheDocument();
        expect(screen.getByText("Station 2 of 2")).toBeInTheDocument();
        expect(screen.getByRole("img", { name: "Diagram: Regroup" })).toBeInTheDocument();
        expect(screen.getByText("Hard tape-to-tape passes.")).toBeInTheDocument();
    });

    it("drops the tag for a standalone drill and the text block when there is none", () => {
        const article = renderDrill({ station: null, text: null });
        expect(screen.queryByText(/^Station /)).not.toBeInTheDocument();
        expect(article.querySelector(".bench-drill-text")).toBeNull();
    });

    it("prints its text with a Diagram unavailable box when unreadable", () => {
        renderDrill({ playData: null });
        expect(screen.getByText("Diagram unavailable")).toBeInTheDocument();
        expect(screen.getByText("Hard tape-to-tape passes.")).toBeInTheDocument();
    });
});

import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { RotationGridTable } from "@/components/features/practice-planner/RotationGridTable";

const TABLE = {
    columns: ["Goalie", "Skate A", "Skate B"],
    rows: [
        { start: "6:00 PM", cells: ["all", "A", "B"] },
        { start: "6:05 PM", cells: ["all", "B", "A"] },
    ],
};

describe("RotationGridTable", () => {
    it("is a named table: a Start column, one column per station, a group or all in each cell", () => {
        render(
            <ThemeProvider theme={createTheme({ palette: { mode: "dark" } })}>
                <RotationGridTable table={TABLE} caption="Rotation grid: Stations · 3 · 10 min" />
            </ThemeProvider>,
        );
        const table = screen.getByRole("table", { name: "Rotation grid: Stations · 3 · 10 min" });
        expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Start", "Goalie", "Skate A", "Skate B"]);
        expect(within(table).getAllByRole("row").slice(1).map((row) => row.textContent)).toEqual(["6:00 PMallAB", "6:05 PMallBA"]);
        // Each round's start heads its row.
        expect(within(table).getAllByRole("rowheader").map((cell) => cell.textContent)).toEqual(["6:00 PM", "6:05 PM"]);
    });

    it("prints as a plain table", () => {
        const html = renderToStaticMarkup(<RotationGridTable table={TABLE} caption="Rotation grid" variant="print" />);
        expect(html).toContain('class="bench-rotation"');
        expect(html).toContain("<th scope=\"col\">Skate A</th>");
        expect(html).toMatch(/<td>all<\/td>/);
        expect(html).toContain('<th scope="row">6:00 PM</th>');
    });
});

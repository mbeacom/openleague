/** The shared age filter (age-group templates R3). */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { AgeFilter, AgeFilterEmpty } from "@/components/features/practice-planner/AgeFilter";

const themed = (ui: React.ReactElement) => render(<ThemeProvider theme={createTheme()}>{ui}</ThemeProvider>);

describe("AgeFilter", () => {
    it("offers All ages and every group as single-choice chips of at least 44 x 44 px", () => {
        const onChange = vi.fn();
        themed(<AgeFilter value="u8" onChange={onChange} />);
        const group = screen.getByRole("group", { name: "Age group" });
        const chips = within(group).getAllByRole("button");
        expect(chips.map((chip) => chip.textContent)).toEqual(["All ages", "6U", "8U", "10U", "12U", "14U", "16U+"]);
        expect(within(group).getByRole("button", { name: "8U" })).toHaveAttribute("aria-pressed", "true");
        expect(within(group).getByRole("button", { name: "All ages" })).toHaveAttribute("aria-pressed", "false");
        for (const chip of chips) expect(chip).toHaveStyle({ minHeight: "44px", minWidth: "44px" });

        fireEvent.click(within(group).getByRole("button", { name: "16U+" }));
        expect(onChange).toHaveBeenLastCalledWith("u16plus");
        fireEvent.click(within(group).getByRole("button", { name: "All ages" }));
        expect(onChange).toHaveBeenLastCalledWith(null);
    });

    it("marks All ages when nothing is chosen", () => {
        themed(<AgeFilter value={null} onChange={vi.fn()} />);
        expect(screen.getByRole("button", { name: "All ages" })).toHaveAttribute("aria-pressed", "true");
    });
});

describe("AgeFilterEmpty", () => {
    it("names the age and offers a reset", () => {
        const onShowAll = vi.fn();
        themed(<AgeFilterEmpty noun="drills" ageGroup="u8" onShowAll={onShowAll} />);
        expect(screen.getByText("No drills for 8U yet.")).toBeInTheDocument();
        const reset = screen.getByRole("button", { name: "Show all ages" });
        expect(reset).toHaveStyle({ minHeight: "44px" });
        fireEvent.click(reset);
        expect(onShowAll).toHaveBeenCalledTimes(1);
    });
});

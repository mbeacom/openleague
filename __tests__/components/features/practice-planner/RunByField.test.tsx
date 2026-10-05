/** Run by (practice staff, spec R8): 0–4 people from the practice's staff, chips without delete icons. */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { RUN_BY_FULL_HELP, RunByField } from "@/components/features/practice-planner/RunByField";
import type { SessionStaffMember } from "@/types/practice-planner";

const STAFF: SessionStaffMember[] = ["Coach Lee", "Sam", "Alex", "Jo", "Pat"].map((name, i) => ({ id: `s${i}`, name }));

function renderField(value: string[], onChange = vi.fn(), staff: SessionStaffMember[] = STAFF) {
    render(
        <ThemeProvider theme={createTheme({ palette: { mode: "dark" } })}>
            <RunByField staff={staff} value={value} onChange={onChange} title="Breakout" />
        </ThemeProvider>,
    );
    return onChange;
}

const open = () => fireEvent.keyDown(screen.getByRole("combobox", { name: "Run by for Breakout" }), { key: "ArrowDown" });

describe("RunByField", () => {
    it("offers the named staff in list order and adds a pick after the ones already chosen", () => {
        const onChange = renderField(["s1"], vi.fn(), [...STAFF, { id: "s9", name: "  " }]);
        open();
        expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["Coach Lee", "Sam", "Alex", "Jo", "Pat"]);
        fireEvent.click(screen.getByRole("option", { name: "Coach Lee" }));
        expect(onChange).toHaveBeenCalledWith(["s1", "s0"]);
    });

    it("takes a person off when their option is picked again", () => {
        const onChange = renderField(["s1", "s0"]);
        open();
        fireEvent.click(screen.getByRole("option", { name: "Sam" }));
        expect(onChange).toHaveBeenCalledWith(["s0"]);
    });

    it("allows at most 4: the others are disabled and the helper says why", () => {
        renderField(["s0", "s1", "s2", "s3"]);
        expect(screen.getByText(RUN_BY_FULL_HELP)).toBeInTheDocument();
        open();
        expect(screen.getByRole("option", { name: "Pat" })).toHaveAttribute("aria-disabled", "true");
        expect(screen.getByRole("option", { name: "Sam" })).not.toHaveAttribute("aria-disabled", "true");
    });

    it("shows the picks as chips with no delete icon (every target 44px or more), and skips a key no longer on the list", () => {
        renderField(["s1", "gone"]);
        expect(screen.getByText("Sam").closest(".MuiChip-root")).not.toBeNull();
        expect(document.querySelectorAll(".MuiChip-deleteIcon")).toHaveLength(0);
        expect(screen.queryByText("gone")).toBeNull();
    });
});

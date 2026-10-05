/** Run by (practice staff, spec R8): 0–4 people from the practice's staff, chips without delete icons. */
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { RUN_BY_FULL_HELP, RUN_BY_NOBODY, RUN_BY_REMOVE_HELP, RunByField } from "@/components/features/practice-planner/RunByField";
import type { SessionStaffMember } from "@/types/practice-planner";

const STAFF: SessionStaffMember[] = ["Coach Lee", "Sam", "Alex", "Jo", "Pat"].map((name, i) => ({ id: `s${i}`, name }));

const THEME = createTheme({ palette: { mode: "dark" } });

function renderField(value: string[], onChange = vi.fn(), staff: SessionStaffMember[] = STAFF, disabled = false) {
    render(
        <ThemeProvider theme={THEME}>
            <RunByField staff={staff} value={value} onChange={onChange} title="Breakout" disabled={disabled} />
        </ThemeProvider>,
    );
    return onChange;
}

/** A row that keeps its picks, as the editor does. */
function Stateful({ initial = [] }: { initial?: string[] }) {
    const [value, setValue] = useState(initial);
    return <RunByField staff={STAFF} value={value} onChange={setValue} title="Breakout" />;
}
const renderStateful = (initial?: string[]) => render(<ThemeProvider theme={THEME}><Stateful initial={initial} /></ThemeProvider>);
const field = () => screen.getByRole("combobox", { name: "Run by for Breakout" });

const open = () => fireEvent.keyDown(field(), { key: "ArrowDown" });

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

    it("shows the picks as chips with no delete icon, and skips a key no longer on the list", () => {
        renderField(["s1", "gone"]);
        expect(screen.getByText("Sam").closest(".MuiChip-root")).not.toBeNull();
        expect(document.querySelectorAll(".MuiChip-deleteIcon")).toHaveLength(0);
        expect(screen.queryByText("gone")).toBeNull();
    });

    it("says inside the open list why the rest are disabled once the 4th person is picked", () => {
        renderStateful(["s0", "s1", "s2"]);
        open();
        expect(within(screen.getByRole("listbox")).queryByText(RUN_BY_FULL_HELP)).toBeNull();
        fireEvent.click(screen.getByRole("option", { name: "Jo" }));
        expect(within(screen.getByRole("listbox")).getByText(RUN_BY_FULL_HELP)).toBeInTheDocument();
        expect(screen.getByRole("option", { name: "Pat" })).toHaveAttribute("aria-disabled", "true");
    });

    it("checks the picked people in the open list, says how to remove one, and a tap on a picked name removes it", () => {
        renderStateful(["s1"]);
        open();
        const listbox = screen.getByRole("listbox");
        expect(within(listbox).getByText(RUN_BY_REMOVE_HELP)).toBeInTheDocument();
        const checked = (name: string) => (within(screen.getByRole("option", { name })).getByRole("checkbox", { hidden: true }) as HTMLInputElement).checked;
        expect(checked("Sam")).toBe(true);
        expect(checked("Alex")).toBe(false);
        expect(screen.getByRole("option", { name: "Sam" })).toHaveAttribute("aria-selected", "true");
        fireEvent.click(screen.getByRole("option", { name: "Sam" }));
        expect(checked("Sam")).toBe(false);
        expect(screen.getByRole("option", { name: "Sam" })).toHaveAttribute("aria-selected", "false");
        expect(document.querySelector(".MuiChip-root")).toBeNull();
    });

    it("removes the last pick with Backspace", () => {
        const onChange = renderField(["s1", "s0"]);
        fireEvent.keyDown(field(), { key: "Backspace" });
        expect(onChange).toHaveBeenCalledWith(["s1"]);
    });

    it("tells screen readers who runs the row, or that nobody does", () => {
        renderField(["s0", "s1"]);
        expect(field()).toHaveAccessibleDescription("Run by Coach Lee, Sam");
    });

    it("says nobody is assigned on an empty row", () => {
        renderField([]);
        expect(field()).toHaveAccessibleDescription(RUN_BY_NOBODY);
    });

    it("adds the full-row reason to the description once 4 are picked", () => {
        renderField(["s0", "s1", "s2", "s3"]);
        expect(field()).toHaveAccessibleDescription(`Run by Coach Lee, Sam, Alex, Jo ${RUN_BY_FULL_HELP}`);
    });

    it("disables the field when disabled", () => {
        renderField(["s1"], vi.fn(), STAFF, true);
        expect(field()).toBeDisabled();
    });
});

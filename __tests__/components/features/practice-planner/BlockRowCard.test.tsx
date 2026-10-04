import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { BlockRowCard } from "@/components/features/practice-planner/BlockRowCard";
import type { BlockInSession } from "@/types/practice-planner";

const BREAK: BlockInSession = { id: "kb", kind: "break", label: "", sequence: 2, duration: 2, instructions: "", runsWithPrevious: false };

function renderCard(item: BlockInSession = BREAK, extra: Partial<React.ComponentProps<typeof BlockRowCard>> = {}) {
    const props = {
        item, index: 2, canMoveUp: true, canMoveDown: false,
        onUpdate: vi.fn(), onDelete: vi.fn(), onMoveUp: vi.fn(), onMoveDown: vi.fn(),
        ...extra,
    };
    render(
        <ThemeProvider theme={createTheme({ palette: { mode: "dark" } })}>
            <BlockRowCard {...props} />
        </ThemeProvider>,
    );
    return props;
}

describe("BlockRowCard", () => {
    it("titles the block by its kind's default label until the coach names it, with no diagram or station switch", () => {
        renderCard();
        expect(screen.getByRole("heading", { name: "Water break" })).toBeInTheDocument();
        expect(screen.getByRole("textbox", { name: "Label" })).toHaveAttribute("placeholder", "Water break");
        expect(screen.queryByRole("img")).toBeNull();
        expect(screen.queryByRole("switch")).toBeNull();
        expect(screen.queryByRole("checkbox")).toBeNull();
    });

    it("edits the label, the note and the minutes in place", () => {
        const { onUpdate } = renderCard({ ...BREAK, label: "Fill bottles" });
        expect(screen.getByRole("heading", { name: "Fill bottles" })).toBeInTheDocument();
        fireEvent.change(screen.getByRole("textbox", { name: "Label" }), { target: { value: "Water" } });
        expect(onUpdate).toHaveBeenLastCalledWith("kb", { label: "Water" });
        fireEvent.change(screen.getByRole("textbox", { name: "Note" }), { target: { value: "Tape sticks" } });
        expect(onUpdate).toHaveBeenLastCalledWith("kb", { instructions: "Tape sticks" });
        fireEvent.click(screen.getByRole("button", { name: "More minutes for Fill bottles" }));
        expect(onUpdate).toHaveBeenLastCalledWith("kb", { duration: 3 });
        fireEvent.click(screen.getByRole("button", { name: "Fewer minutes for Fill bottles" }));
        expect(onUpdate).toHaveBeenLastCalledWith("kb", { duration: 1 });
        expect(screen.getByText("2 min")).toBeInTheDocument();
    });

    it("stops the minutes at 1", () => {
        renderCard({ ...BREAK, duration: 1 });
        expect(screen.getByRole("button", { name: "Fewer minutes for Water break" })).toBeDisabled();
    });

    it("moves and deletes by its position", () => {
        const { onMoveUp, onDelete } = renderCard();
        fireEvent.click(screen.getByRole("button", { name: "Move Water break up" }));
        expect(onMoveUp).toHaveBeenCalledWith(2);
        expect(screen.getByRole("button", { name: "Move Water break down" })).toBeDisabled();
        fireEvent.click(screen.getByRole("button", { name: "Delete Water break" }));
        expect(onDelete).toHaveBeenCalledWith("kb");
    });

    it("locks every control while the session is being created", () => {
        renderCard(BREAK, { locked: true });
        expect(screen.getByRole("textbox", { name: "Label" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Delete Water break" })).toBeDisabled();
    });
});

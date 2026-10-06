import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { ElementInspector } from "@/components/features/practice-planner/ElementInspector";
import type { SelectedElement } from "@/lib/utils/canvas/element-ops";

const wrap = (selected: SelectedElement | null, onChange = vi.fn()) => {
    render(<ThemeProvider theme={createTheme()}><ElementInspector selected={selected} onChange={onChange} /></ThemeProvider>);
    return onChange;
};

const stroke: SelectedElement = {
    kind: "drawing",
    element: { id: "d", action: "skate", path: "straight", end: "stop", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], color: "#212121", strokeWidth: 2 },
};

describe("ElementInspector", () => {
    it("renders nothing without a selection", () => {
        wrap(null);
        expect(screen.queryByRole("region", { name: "selected element" })).not.toBeInTheDocument();
    });

    it("re-tags a stroke's action without resetting its end", async () => {
        const onChange = wrap(stroke);
        await userEvent.click(screen.getByLabelText("Pass"));
        expect(onChange).toHaveBeenCalledWith({ action: "pass" });
    });

    it("changes a player's role and commits the label on blur", async () => {
        const onChange = wrap({ kind: "player", element: { id: "p", role: "X", label: "", color: "#1976D2", position: { x: 1, y: 1 } } });
        await userEvent.click(screen.getByLabelText("Goalie"));
        expect(onChange).toHaveBeenCalledWith({ role: "G" });
        const label = screen.getByLabelText("Label");
        await userEvent.type(label, "G1");
        await userEvent.tab();
        expect(onChange).toHaveBeenCalledWith({ label: "G1" });
    });

    it("offers rotation only for nets", () => {
        wrap({ kind: "equipment", element: { id: "c", kind: "cone", position: { x: 1, y: 1 }, rotation: 0 } });
        expect(screen.queryByRole("group", { name: "net rotation" })).not.toBeInTheDocument();
    });

    it("rotates a net", async () => {
        const onChange = wrap({ kind: "equipment", element: { id: "n", kind: "net", position: { x: 1, y: 1 }, rotation: 0 } });
        await userEvent.click(screen.getByLabelText("Faces right"));
        expect(onChange).toHaveBeenCalledWith({ rotation: 180 });
    });

    it("refuses to blank an annotation", async () => {
        const onChange = wrap({ kind: "annotation", element: { id: "a", text: "Go", position: { x: 1, y: 1 }, fontSize: 8, color: "#212121" } });
        const field = screen.getByLabelText("Text");
        await userEvent.clear(field);
        await userEvent.tab();
        expect(onChange).not.toHaveBeenCalledWith({ text: "" });
    });

    it("commits a label once when Enter is followed by blur", async () => {
        const onChange = wrap({ kind: "player", element: { id: "p", role: "X", label: "", color: "#1976D2", position: { x: 1, y: 1 } } });
        await userEvent.type(screen.getByLabelText("Label"), "G1{Enter}");
        await userEvent.tab();
        expect(onChange.mock.calls.filter(([p]) => "label" in p)).toEqual([[{ label: "G1" }]]);
    });
});

describe("Straighten (line editing R3)", () => {
    const drawing = (path: "straight" | "freehand" | "curve", points: { x: number; y: number }[]): SelectedElement => ({
        kind: "drawing",
        element: { id: "d", action: "skate", path, end: "arrow", points, color: "#212121", strokeWidth: 2 },
    });

    it("straightens a curve, keeping its ends", async () => {
        const onChange = wrap(drawing("curve", [{ x: 0, y: 0 }, { x: 5, y: 9 }, { x: 10, y: 0 }]));
        const button = screen.getByRole("button", { name: "Straighten" });
        expect(button).toHaveStyle({ minHeight: "44px" });
        await userEvent.click(button);
        expect(onChange).toHaveBeenCalledWith({ path: "straight", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] });
    });

    it("straightens an older polyline", async () => {
        const onChange = wrap(drawing("straight", [{ x: 0, y: 0 }, { x: 5, y: 9 }, { x: 10, y: 0 }]));
        await userEvent.click(screen.getByRole("button", { name: "Straighten" }));
        expect(onChange).toHaveBeenCalledWith({ path: "straight", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] });
    });

    it("offers Make straight for a freehand line", async () => {
        const onChange = wrap(drawing("freehand", [{ x: 0, y: 0 }, { x: 4, y: 3 }, { x: 8, y: 1 }]));
        expect(screen.queryByRole("button", { name: "Straighten" })).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Make straight" }));
        expect(onChange).toHaveBeenCalledWith({ path: "straight", points: [{ x: 0, y: 0 }, { x: 8, y: 1 }] });
    });

    it("offers neither for a 2-point straight line", () => {
        wrap(stroke);
        expect(screen.queryByRole("button", { name: "Straighten" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Make straight" })).not.toBeInTheDocument();
    });
});

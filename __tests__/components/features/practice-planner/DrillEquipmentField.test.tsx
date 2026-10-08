/** The drill editor's Equipment section (practice equipment spec R2, R5). */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { DrillEquipmentField, NO_DRILL_EQUIPMENT_TEXT } from "@/components/features/practice-planner/DrillEquipmentField";
import { PlayEditor } from "@/components/features/practice-planner/PlayEditor";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import type { EquipmentKind, EquipmentNeeds, PlayData } from "@/types/practice-planner";

vi.mock("@/lib/utils/canvas/thumbnail-generator", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/utils/canvas/thumbnail-generator")>()), generateThumbnail: vi.fn(() => "data:image/png;base64,AA==") }));

const themed = (ui: React.ReactElement) => render(<ThemeProvider theme={createTheme()}>{ui}</ThemeProvider>);

function board(kinds: EquipmentKind[], needs?: EquipmentNeeds): PlayData {
    return {
        ...createEmptyPlayData(),
        equipment: kinds.map((kind, i) => ({ id: `e${i}`, kind, position: { x: 10 + i * 5, y: 10 }, rotation: 0 })),
        ...(needs ? { equipmentNeeds: needs } : {}),
    };
}

const list = () => screen.getByRole("list", { name: "Drill equipment" });
const rows = () => within(list()).getAllByRole("listitem").map((li) => li.textContent);

function addItem(name: string, count: string) {
    fireEvent.change(screen.getByRole("combobox", { name: "Item" }), { target: { value: name } });
    fireEvent.change(screen.getByLabelText("Count"), { target: { value: count } });
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));
}

describe("DrillEquipmentField", () => {
    it("lists what the diagram shows, with nothing to change", () => {
        themed(<DrillEquipmentField playData={board(["cone", "cone", "net"])} onChange={vi.fn()} />);
        expect(rows()).toEqual(["Cones2", "Nets1"]);
        expect(screen.queryByText(/Diagram shows/)).toBeNull();
    });

    it("says what to do when there is nothing yet", () => {
        themed(<DrillEquipmentField playData={createEmptyPlayData()} onChange={vi.fn()} />);
        expect(screen.getByText(NO_DRILL_EQUIPMENT_TEXT)).toBeInTheDocument();
    });

    it("changes a count relative to the diagram, and shows what the diagram says", () => {
        const onChange = vi.fn();
        const { rerender } = themed(<DrillEquipmentField playData={board(["cone", "cone"])} onChange={onChange} />);
        fireEvent.click(screen.getByRole("button", { name: "More Cones" }));
        const needs = onChange.mock.calls[0][0];
        expect(needs).toEqual({ kinds: [{ kind: "cone", delta: 1, removed: false }], custom: [] });
        rerender(<ThemeProvider theme={createTheme()}><DrillEquipmentField playData={board(["cone", "cone"], needs)} onChange={onChange} /></ThemeProvider>);
        expect(screen.getByText("Diagram shows 2")).toBeInTheDocument();
        expect(screen.getByLabelText("Cones: 3")).toBeInTheDocument();
    });

    it("removes a diagram kind and offers to restore it", () => {
        const onChange = vi.fn();
        themed(<DrillEquipmentField playData={board(["net"], { kinds: [{ kind: "net", delta: 0, removed: true }], custom: [] })} onChange={onChange} />);
        expect(screen.queryByRole("list", { name: "Drill equipment" })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Restore Nets" }));
        expect(onChange).toHaveBeenCalledWith(undefined);
    });

    it("removes an item with its 44 px button", () => {
        const onChange = vi.fn();
        themed(<DrillEquipmentField playData={board(["net"])} onChange={onChange} />);
        const remove = screen.getByRole("button", { name: "Remove Nets" });
        expect(remove).toHaveStyle({ minWidth: "44px", minHeight: "44px" });
        fireEvent.click(remove);
        expect(onChange).toHaveBeenCalledWith({ kinds: [{ kind: "net", delta: 0, removed: true }], custom: [] });
    });

    it("adds a typed item, or adds to a kind named by the text", () => {
        const onChange = vi.fn();
        themed(<DrillEquipmentField playData={board(["cone"])} onChange={onChange} />);
        addItem("Tennis balls", "12");
        expect(onChange).toHaveBeenLastCalledWith({ kinds: [], custom: [{ name: "Tennis balls", count: 12 }] });
        addItem("cones", "2");
        expect(onChange).toHaveBeenLastCalledWith({ kinds: [{ kind: "cone", delta: 2, removed: false }], custom: [] });
    });

    it("shows why an item can't be added", () => {
        const onChange = vi.fn();
        themed(<DrillEquipmentField playData={board([])} onChange={onChange} />);
        addItem("Boards", "0");
        expect(screen.getByText("Count must be a whole number from 1 to 999")).toBeInTheDocument();
        expect(onChange).not.toHaveBeenCalled();
    });
});

describe("PlayEditor: Equipment", () => {
    it("saves the changes inside the diagram data, marking the drill unsaved", async () => {
        const onSave = vi.fn().mockResolvedValue(undefined);
        const onDirtyChange = vi.fn();
        themed(<PlayEditor teamId="t" initialData={{ name: "Cone Weave", playData: board(["cone", "cone", "net"]) }} autoSave={false} onSave={onSave} onDirtyChange={onDirtyChange} />);
        expect(rows()).toEqual(["Cones2", "Nets1"]);
        fireEvent.click(screen.getByRole("button", { name: "Remove Nets" }));
        addItem("Water bottles", "4");
        expect(onDirtyChange).toHaveBeenLastCalledWith(true);
        fireEvent.click(screen.getByRole("button", { name: /Save Play/i }));
        await waitFor(() => expect(onSave).toHaveBeenCalled());
        const saved = onSave.mock.calls[0][0].playData as PlayData;
        expect(saved.equipment).toHaveLength(3);
        expect(saved.equipmentNeeds).toEqual({ kinds: [{ kind: "net", delta: 0, removed: true }], custom: [{ name: "Water bottles", count: 4 }] });
    });

    it("saves an untouched drill without the key", async () => {
        const onSave = vi.fn().mockResolvedValue(undefined);
        themed(<PlayEditor teamId="t" initialData={{ name: "Plain", playData: board(["cone"]) }} autoSave={false} onSave={onSave} />);
        fireEvent.click(screen.getByRole("button", { name: /Save Play/i }));
        await waitFor(() => expect(onSave).toHaveBeenCalled());
        expect("equipmentNeeds" in onSave.mock.calls[0][0].playData).toBe(false);
    });
});

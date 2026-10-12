/** Drag and drop in the session editor: the unit-aware layout, strategy and announcements, and the wired list. */
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import type { ClientRect } from "@dnd-kit/core";
import { renderWithPlanner } from "@/__tests__/helpers/planner";
import { useSessionRowEdits } from "@/components/features/practice-planner/useSessionRowEdits";
import { SessionDrillList } from "@/components/features/practice-planner/SessionDrillList";
import {
    buildSortLayout,
    dropMove,
    isDropTarget,
    sessionCollision,
    sessionSortAnnouncements,
    sessionSortStrategy,
    slotShift,
} from "@/components/features/practice-planner/SessionSortable";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import type { PlayInSession, SessionItem } from "@/types/practice-planner";

function drill(id: string, sequence: number, runsWithPrevious: boolean): PlayInSession {
    return {
        id,
        playId: `clib${id}xxxxxxxxxxxxxxxxxxxx`,
        name: `Drill ${id}`,
        sequence,
        runsWithPrevious,
        duration: 10,
        instructions: "",
        playData: createEmptyPlayData(),
        thumbnail: "",
    };
}

/** "a b+ c": a, then b running with a (one block), then c. */
function drills(spec: string): PlayInSession[] {
    return spec.split(" ").map((token, sequence) => drill(token.replace("+", ""), sequence, token.endsWith("+")));
}

/** x, then a station block of a, b, c, then y: the layout SessionDrillList builds for "x a b+ c+ y". */
const layout = buildSortLayout([
    { rows: [{ id: "x", index: 0, name: "Drill x" }], name: "Drill x" },
    {
        rows: [
            { id: "a", index: 1, name: "Drill a" },
            { id: "b", index: 2, name: "Drill b" },
            { id: "c", index: 3, name: "Drill c" },
        ],
        headerId: "header-a",
        name: "station block starting with Drill a",
    },
    { rows: [{ id: "y", index: 4, name: "Drill y" }], name: "Drill y" },
]);

const rect = (top: number, height: number): ClientRect => ({ top, bottom: top + height, height, left: 0, right: 300, width: 300 });

describe("buildSortLayout", () => {
    it("lists a block's header before its stations, flat, with one unit per block", () => {
        expect(layout.items).toEqual(["x", "header-a", "a", "b", "c", "y"]);
        expect(layout.units.map((unit) => unit.leaderId)).toEqual(["x", "header-a", "y"]);
        expect(layout.units[1].stations).toEqual(["Drill a", "Drill b", "Drill c"]);
        expect(layout.elements.get("b")).toEqual({ kind: "station", unit: 1, rowIndex: 2, name: "Drill b", slot: 1, count: 3 });
        expect(layout.elements.get("header-a")).toMatchObject({ kind: "unit", unit: 1, rowIndex: 1 });
    });
});

describe("drop targets and drops", () => {
    it("lets a unit drop only on unit leaders, and a station only on its own block's stations", () => {
        expect(["x", "header-a", "a", "y"].map((id) => isDropTarget(layout, "y", id))).toEqual([true, true, false, true]);
        expect(["x", "header-a", "a", "c", "y"].map((id) => isDropTarget(layout, "b", id))).toEqual([false, false, true, true, false]);
        expect(isDropTarget(layout, null, "a")).toBe(true);
    });

    it("turns a drop into the timeline edit, by row index", () => {
        expect(dropMove(layout, "y", "header-a")).toEqual({ scope: "unit", fromIndex: 4, toIndex: 1 });
        expect(dropMove(layout, "header-a", "y")).toEqual({ scope: "unit", fromIndex: 1, toIndex: 4 });
        expect(dropMove(layout, "c", "a")).toEqual({ scope: "station", fromIndex: 3, toIndex: 1 });
    });

    it("moves nothing on no target, itself, or a target out of scope", () => {
        expect(dropMove(layout, "x", null)).toBeNull();
        expect(dropMove(layout, "x", "x")).toBeNull();
        expect(dropMove(layout, "x", "b")).toBeNull();
        expect(dropMove(layout, "b", "y")).toBeNull();
    });
});

describe("slotShift", () => {
    // Three slots of mixed heights with a 16px gap: [0,100) [116,316) [332,382).
    const rects = [rect(0, 100), rect(116, 200), rect(332, 50)];

    it("lands the dragged slot in the target's place, keeping heights and gaps", () => {
        expect(slotShift(rects, 0, 2, 0)).toBe(282); // bottom 100 → 382
        expect(slotShift(rects, 2, 0, 2)).toBe(-332); // top 332 → 0
    });

    it("closes the gap: slots between shift by the dragged slot's height plus the gap", () => {
        expect(slotShift(rects, 0, 2, 1)).toBe(-116);
        expect(slotShift(rects, 0, 2, 2)).toBe(-116);
        expect(slotShift(rects, 2, 0, 0)).toBe(66);
        expect(slotShift(rects, 2, 0, 1)).toBe(66);
    });

    it("leaves slots outside the move, and every slot when nothing moves, in place", () => {
        expect(slotShift(rects, 0, 1, 2)).toBeNull();
        expect(slotShift(rects, 1, 1, 0)).toBeNull();
        expect(slotShift([rect(0, 10)], 0, 1, 0)).toBeNull();
    });
});

describe("sessionSortStrategy", () => {
    const strategy = sessionSortStrategy(layout);
    // Measured rects by item index; a block header measures as its whole block.
    const rects = [rect(0, 100), rect(116, 400), rect(160, 100), rect(276, 100), rect(392, 100), rect(532, 100)];
    const shiftOf = (active: string, over: string, id: string) =>
        strategy({
            rects,
            activeNodeRect: rects[layout.items.indexOf(active)],
            activeIndex: layout.items.indexOf(active),
            overIndex: layout.items.indexOf(over),
            index: layout.items.indexOf(id),
        })?.y ?? null;

    it("moves a block's cards with its header when another unit passes it", () => {
        expect(["header-a", "a", "b", "c"].map((id) => shiftOf("x", "header-a", id))).toEqual([-116, -116, -116, -116]);
        expect(shiftOf("x", "header-a", "x")).toBe(416);
        expect(shiftOf("x", "header-a", "y")).toBeNull();
    });

    it("moves a dragged block's cards along with it", () => {
        expect(["header-a", "a", "c"].map((id) => shiftOf("header-a", "y", id))).toEqual([116, 116, 116]);
        expect(shiftOf("header-a", "y", "y")).toBe(-416);
    });

    it("shifts only the block's stations while a station is dragged", () => {
        expect(shiftOf("a", "c", "a")).toBe(232);
        expect(shiftOf("a", "c", "b")).toBe(-116);
        expect(shiftOf("a", "c", "header-a")).toBeNull();
        expect(shiftOf("a", "c", "y")).toBeNull();
    });

    it("moves nothing while over a target out of scope", () => {
        expect(shiftOf("x", "b", "x")).toBeNull();
    });
});

describe("sessionCollision", () => {
    // A short drill s, a tall block, and a short drill t.
    const rects = new Map([["s", rect(0, 50)], ["header-a", rect(66, 500)], ["t", rect(582, 50)]]);
    const containers = [...rects.keys()].map((id) => ({ id, key: id, data: { current: undefined }, disabled: false, node: { current: null }, rect: { current: null } }));
    const overFor = (top: number) =>
        sessionCollision({
            active: { id: "s", data: { current: undefined }, rect: { current: { initial: null, translated: null } } },
            collisionRect: rect(top, 50),
            droppableRects: rects,
            droppableContainers: containers,
            pointerCoordinates: null,
        })[0]?.id;

    it("picks the block whose span holds the dragged drill's middle, though the next unit's center is nearer", () => {
        // Bottom-aligned with the block (where the keyboard puts it): middle 541, block center 316, t center 607.
        expect(overFor(516)).toBe("header-a");
    });

    it("falls back to the nearest center over a gap", () => {
        expect(overFor(546)).toBe("t");
    });
});

describe("sessionSortAnnouncements", () => {
    const announce = sessionSortAnnouncements(layout);
    const item = (id: string) => ({ id, data: { current: undefined }, rect: { current: { initial: null, translated: null } } });
    const target = (id: string) => ({ id, data: { current: undefined }, rect: rect(0, 10), disabled: false });

    it("names the drill and its place among the units", () => {
        expect(announce.onDragStart({ active: item("y") })).toBe("Picked up Drill y, at position 3 of 3.");
        expect(announce.onDragOver({ active: item("y"), over: target("x") })).toBe("Drill y is over position 1 of 3.");
        expect(announce.onDragEnd({ active: item("y"), over: target("x") })).toBe("Moved Drill y to position 1 of 3.");
    });

    it("counts a station's place within its block", () => {
        expect(announce.onDragEnd({ active: item("a"), over: target("c") })).toBe("Moved Drill a to station 3 of 3.");
    });

    it("says when a drop or a cancel moves nothing", () => {
        expect(announce.onDragEnd({ active: item("x"), over: null })).toBe("Drill x was dropped where it started.");
        expect(announce.onDragCancel({ active: item("x"), over: null })).toBe("Moving Drill x was cancelled. It is back where it started.");
    });
});

function listProps(plays: SessionItem[]) {
    return {
        plays, duration: 60, editingPlayId: null, disabled: false,
        onOpenLibrary: vi.fn(), onDelete: vi.fn(), onEdit: vi.fn(), onUpdate: vi.fn(), onCancelEdit: vi.fn(),
        onMoveUp: vi.fn(), onMoveDown: vi.fn(), onToggleStation: vi.fn(), canEditDiagram: true, onEditDiagram: vi.fn(),
        onNewDrill: vi.fn(), onAddBlock: vi.fn(), onSetRotation: vi.fn(), onSetStays: vi.fn(),
    };
}

describe("SessionDrillList drag handles", () => {
    it("gives every standalone drill, each station and each block header a 44px handle beside the arrows", () => {
        renderWithPlanner(<SessionDrillList {...listProps(drills("x a b+"))} onMoveUnitTo={vi.fn()} onMoveStationTo={vi.fn()} />);
        const handles = ["Drill x", "station block starting with Drill a", "Drill a", "Drill b"].map((name) =>
            screen.getByLabelText(`Drag to reorder ${name}`));
        handles.forEach((handle) => {
            expect(handle).toBeEnabled();
            expect(handle).toHaveAttribute("aria-roledescription", "sortable");
        });
        // The arrows stay as the fallback.
        expect(screen.getByLabelText("Move play 1 down")).toBeInTheDocument();
    });

    it("locks the handles while the session is being created", () => {
        renderWithPlanner(<SessionDrillList {...listProps(drills("x y"))} locked onMoveUnitTo={vi.fn()} onMoveStationTo={vi.fn()} />);
        expect(screen.getByLabelText("Drag to reorder Drill x")).toBeDisabled();
    });

    it("renders no handles without the move handlers", () => {
        renderWithPlanner(<SessionDrillList {...listProps(drills("x y"))} />);
        expect(screen.queryByLabelText(/^Drag to reorder/)).not.toBeInTheDocument();
    });
});

describe("keyboard reorder through the editor's row edits", () => {
    // jsdom lays nothing out: stack every list element 100px tall with a 16px gap, in DOM order.
    const original = Element.prototype.getBoundingClientRect;
    beforeEach(() => {
        Element.prototype.getBoundingClientRect = function getBoundingClientRect(this: Element) {
            const row = this.closest("[data-sort-id]");
            if (!row?.parentElement) return original.call(this);
            const top = Array.from(row.parentElement.children).indexOf(row) * 116;
            return { ...rect(top, 100), x: 0, y: top, toJSON: () => ({}) } as DOMRect;
        };
    });
    afterEach(() => {
        Element.prototype.getBoundingClientRect = original;
    });

    const tick = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

    async function press(target: Element | Document, code: string) {
        fireEvent.keyDown(target, { code, key: code === "Space" ? " " : code });
        await tick();
    }

    /** The list as the editor wires it: its row edits hook over local state, the order shown as "a b+ c". */
    function Harness({ initial }: { initial: PlayInSession[] }) {
        const [plays, setPlays] = useState<SessionItem[]>(initial);
        const rowEdits = useSessionRowEdits({ plays, setPlays, markDirty: () => {}, locked: false });
        return (
            <>
                <SessionDrillList
                    {...listProps(plays)}
                    onMoveUp={(index) => rowEdits.moveRow(index, -1)}
                    onMoveDown={(index) => rowEdits.moveRow(index, 1)}
                    onMoveUnitTo={rowEdits.moveUnitTo}
                    onMoveStationTo={rowEdits.moveStationTo}
                />
                <output data-testid="order">{plays.map((play) => `${play.id}${play.runsWithPrevious ? "+" : ""}`).join(" ")}</output>
            </>
        );
    }

    const order = () => screen.getByTestId("order").textContent;

    it("picks up a drill with space, moves it past a whole block with the arrow keys, and drops it", async () => {
        renderWithPlanner(<Harness initial={drills("s a b+ t")} />);
        const handle = screen.getByLabelText("Drag to reorder Drill s");
        handle.focus();
        await press(handle, "Space");
        await press(document, "ArrowDown");
        await press(document, "Space");
        expect(order()).toBe("a b+ s t");
    });

    it("moves a station within its block and leaves the block whole", async () => {
        renderWithPlanner(<Harness initial={drills("x a b+ c+")} />);
        const handle = screen.getByLabelText("Drag to reorder Drill c");
        handle.focus();
        await press(handle, "Space");
        await press(document, "ArrowUp");
        await press(document, "ArrowUp");
        await press(document, "Space");
        expect(order()).toBe("x c a+ b+");
    });

    it("puts everything back on escape", async () => {
        renderWithPlanner(<Harness initial={drills("s t")} />);
        const handle = screen.getByLabelText("Drag to reorder Drill s");
        handle.focus();
        await press(handle, "Space");
        await press(document, "ArrowDown");
        await press(document, "Escape");
        expect(order()).toBe("s t");
    });
});

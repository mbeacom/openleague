/**
 * PlayEditor ↔ ice area: the select sets the area through the board handle,
 * Custom turns the area tool on until a rectangle is drawn, and elements
 * outside the area are flagged inline.
 */
import React, { forwardRef, useImperativeHandle } from "react";
import { describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import type { RinkBoardProps } from "@/components/features/practice-planner/RinkBoard";
import { withArea } from "@/lib/utils/ice-area";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import type { IceArea, PlayData } from "@/types/practice-planner";

const boardProps: { current: RinkBoardProps | null } = { current: null };

vi.mock("@/lib/utils/canvas/thumbnail-generator", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/utils/canvas/thumbnail-generator")>()), generateThumbnail: () => "" }));
vi.mock("@/components/features/practice-planner/RinkBoard", () => ({
    RinkBoard: forwardRef(function MockBoard(props: RinkBoardProps, ref) {
        boardProps.current = props;
        useImperativeHandle(ref, () => ({
            undo: () => {}, redo: () => {}, clear: () => {}, updateElement: () => {},
            setArea: (area: IceArea | undefined) => {
                const next = withArea(props.playData, area);
                if (next !== props.playData) props.onPlayDataChange?.(next);
            },
        }));
        return <div data-testid="board" />;
    }),
}));

import { PlayEditor, outsideAreaMessage } from "@/components/features/practice-planner/PlayEditor";

function renderEditor(playData: PlayData = createEmptyPlayData(), onDirtyChange?: (dirty: boolean) => void) {
    return render(
        <ThemeProvider theme={createTheme()}>
            <PlayEditor teamId="t" initialData={{ name: "Drill", playData }} onDirtyChange={onDirtyChange} />
        </ThemeProvider>
    );
}

async function chooseArea(label: string) {
    fireEvent.mouseDown(screen.getByRole("combobox", { name: /Ice area/ }));
    fireEvent.click(await screen.findByRole("option", { name: label }));
}

describe("PlayEditor ice area", () => {
    it("sets a preset and clears it back to full ice", async () => {
        renderEditor();
        await chooseArea("Neutral zone");
        expect(boardProps.current!.playData.area).toEqual({ kind: "zone-neutral" });
        await chooseArea("Full ice");
        expect("area" in boardProps.current!.playData).toBe(false);
    });

    it("groups the presets under Full and halves, Zones and Quarters, with Custom area… last", async () => {
        renderEditor();
        fireEvent.mouseDown(screen.getByRole("combobox", { name: /Ice area/ }));
        const listbox = await screen.findByRole("listbox");
        const entries = Array.from(listbox.querySelectorAll("li")).map((item) => item.textContent);
        expect(entries).toEqual([
            "Full and halves", "Full ice", "Half ice (left)", "Half ice (right)",
            "Zones", "Left end zone", "Neutral zone", "Right end zone",
            "Quarters", "Left end – top", "Left end – bottom", "Neutral – top", "Neutral – bottom", "Right end – top", "Right end – bottom",
            "Custom area…",
        ]);
        // A header is not a choice: clicking it changes nothing.
        fireEvent.click(within(listbox).getByText("Quarters"));
        expect("area" in boardProps.current!.playData).toBe(false);
    });

    it("sets a quarter preset", async () => {
        renderEditor();
        await chooseArea("Right end – bottom");
        expect(boardProps.current!.playData.area).toEqual({ kind: "zone-right-bottom" });
    });

    it("marks the drill dirty when an area is chosen (session drill dialog guard)", async () => {
        const onDirtyChange = vi.fn();
        renderEditor(createEmptyPlayData(), onDirtyChange);
        expect(onDirtyChange).toHaveBeenLastCalledWith(false);
        await chooseArea("Left end zone");
        expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    });

    it("flags elements outside the area, and clears the flag when they fit", async () => {
        renderEditor({
            ...createEmptyPlayData(),
            players: [{ id: "p", position: { x: 150, y: 40 }, role: "X", label: "", color: "#1976D2" }],
        });
        expect(screen.queryByText(/outside the ice area/)).not.toBeInTheDocument();
        await chooseArea("Left end zone");
        expect(screen.getByText("1 element is outside the ice area.")).toBeInTheDocument();
        await chooseArea("Half ice (right)");
        expect(screen.queryByText(/outside the ice area/)).not.toBeInTheDocument();
    });

    it("leaves the drag tool off for Custom area…; Draw area on rink turns it on until a rectangle is drawn", async () => {
        renderEditor();
        await chooseArea("Custom area…");
        expect(boardProps.current!.areaTool).toBe(false);
        fireEvent.click(screen.getByRole("button", { name: "Draw area on rink" }));
        expect(boardProps.current!.areaTool).toBe(true);
        expect(screen.getByText("Drag on the rink to draw the ice area.")).toBeInTheDocument();
        act(() => boardProps.current!.onAreaDrawn!());
        expect(boardProps.current!.areaTool).toBe(false);
        expect(screen.queryByText("Drag on the rink to draw the ice area.")).not.toBeInTheDocument();
    });

    it("cancels the area tool and keeps the custom area that Custom area… applied", async () => {
        renderEditor();
        await chooseArea("Custom area…");
        fireEvent.click(screen.getByRole("button", { name: "Draw area on rink" }));
        fireEvent.click(screen.getByRole("button", { name: "Stop drawing area" }));
        expect(boardProps.current!.areaTool).toBe(false);
        expect(boardProps.current!.playData.area).toEqual({ kind: "custom", rect: { x: 0, y: 0, w: 75, h: 85 } });
    });

    it("offers drawing on the rink for a drill that already has a custom area", () => {
        renderEditor({ ...createEmptyPlayData(), area: { kind: "custom", rect: { x: 100, y: 30, w: 20, h: 20 } } });
        fireEvent.click(screen.getByRole("button", { name: "Draw area on rink" }));
        expect(boardProps.current!.areaTool).toBe(true);
    });

    describe("custom area fields (keyboard)", () => {
        const field = (name: string) => screen.getByRole("spinbutton", { name }) as HTMLInputElement;
        function commit(name: string, value: string, how: "blur" | "enter" = "blur") {
            const input = field(name);
            fireEvent.change(input, { target: { value } });
            if (how === "enter") fireEvent.keyDown(input, { key: "Enter" });
            else fireEvent.blur(input);
        }

        it("applies a default custom area as soon as Custom area… is chosen", async () => {
            renderEditor();
            expect(screen.queryByRole("spinbutton", { name: "Area left (ft)" })).not.toBeInTheDocument();
            await chooseArea("Custom area…");
            expect(boardProps.current!.playData.area).toEqual({ kind: "custom", rect: { x: 0, y: 0, w: 75, h: 85 } });
            expect(field("Area left (ft)").value).toBe("0");
            expect(field("Area top (ft)").value).toBe("0");
            expect(field("Area width (ft)").value).toBe("75");
            expect(field("Area height (ft)").value).toBe("85");
        });

        it("starts from the current preset's rectangle", async () => {
            renderEditor({ ...createEmptyPlayData(), area: { kind: "zone-neutral" } });
            await chooseArea("Custom area…");
            expect(boardProps.current!.playData.area).toEqual({ kind: "custom", rect: { x: 75, y: 0, w: 50, h: 85 } });
        });

        it("sets typed values through setArea, snapped to 5 ft", async () => {
            renderEditor();
            await chooseArea("Custom area…");
            commit("Area left (ft)", "101");
            commit("Area width (ft)", "43");
            commit("Area height (ft)", "29", "enter");
            commit("Area top (ft)", "12", "enter");
            expect(boardProps.current!.playData.area).toEqual({ kind: "custom", rect: { x: 100, y: 10, w: 45, h: 30 } });
            expect(field("Area width (ft)").value).toBe("45");
        });

        it("corrects values below the minimum or outside the rink", async () => {
            renderEditor({ ...createEmptyPlayData(), area: { kind: "custom", rect: { x: 100, y: 30, w: 40, h: 40 } } });
            commit("Area width (ft)", "5");
            expect(boardProps.current!.playData.area).toEqual({ kind: "custom", rect: { x: 100, y: 30, w: 20, h: 40 } });
            commit("Area left (ft)", "250");
            expect(boardProps.current!.playData.area).toEqual({ kind: "custom", rect: { x: 180, y: 30, w: 20, h: 40 } });
            commit("Area top (ft)", "-10");
            expect(boardProps.current!.playData.area).toEqual({ kind: "custom", rect: { x: 180, y: 0, w: 20, h: 40 } });
            expect(field("Area left (ft)").value).toBe("180");
        });

        it("reverts a blank or non-numeric entry without changing the area", () => {
            const rect = { x: 100, y: 30, w: 40, h: 40 };
            renderEditor({ ...createEmptyPlayData(), area: { kind: "custom", rect } });
            commit("Area height (ft)", "");
            expect(boardProps.current!.playData.area).toEqual({ kind: "custom", rect });
            expect(field("Area height (ft)").value).toBe("40");
        });

        it("reflects the stored area after an undo", () => {
            const before: PlayData = { ...createEmptyPlayData(), area: { kind: "custom", rect: { x: 100, y: 30, w: 40, h: 40 } } };
            renderEditor(before);
            commit("Area left (ft)", "20");
            expect(field("Area left (ft)").value).toBe("20");
            // Undo arrives from the board as the previous playData
            act(() => boardProps.current!.onPlayDataChange!(before));
            expect(field("Area left (ft)").value).toBe("100");
        });

        it("keeps focus moving to the next field on Tab, and applies the edit", async () => {
            const user = userEvent.setup();
            renderEditor({ ...createEmptyPlayData(), area: { kind: "custom", rect: { x: 100, y: 30, w: 40, h: 40 } } });
            await user.click(field("Area left (ft)"));
            await user.clear(field("Area left (ft)"));
            await user.type(field("Area left (ft)"), "51");
            await user.tab();
            expect(boardProps.current!.playData.area).toEqual({ kind: "custom", rect: { x: 50, y: 30, w: 40, h: 40 } });
            expect(document.activeElement).toBe(field("Area top (ft)"));
            expect(field("Area left (ft)").value).toBe("50");
        });

        it("keeps focus on the field on Enter", async () => {
            const user = userEvent.setup();
            renderEditor({ ...createEmptyPlayData(), area: { kind: "custom", rect: { x: 100, y: 30, w: 40, h: 40 } } });
            await user.click(field("Area width (ft)"));
            await user.clear(field("Area width (ft)"));
            await user.type(field("Area width (ft)"), "61{Enter}");
            expect(boardProps.current!.playData.area).toEqual({ kind: "custom", rect: { x: 100, y: 30, w: 60, h: 40 } });
            expect(document.activeElement).toBe(field("Area width (ft)"));
            expect(field("Area width (ft)").value).toBe("60");
        });

        it("does not commit on blur when nothing was edited (legacy unsnapped data stays as-is)", async () => {
            const user = userEvent.setup();
            const onDirtyChange = vi.fn();
            const rect = { x: 101, y: 31, w: 41, h: 41 };
            renderEditor({ ...createEmptyPlayData(), area: { kind: "custom", rect } }, onDirtyChange);
            await user.click(field("Area left (ft)"));
            await user.tab();
            await user.tab();
            await user.tab();
            await user.tab();
            expect(boardProps.current!.playData.area).toEqual({ kind: "custom", rect });
            expect(onDirtyChange).not.toHaveBeenCalledWith(true);
        });

        it("shows the restored values after an undo", async () => {
            const user = userEvent.setup();
            const before: PlayData = { ...createEmptyPlayData(), area: { kind: "custom", rect: { x: 100, y: 30, w: 40, h: 40 } } };
            renderEditor(before);
            await user.click(field("Area height (ft)"));
            await user.clear(field("Area height (ft)"));
            await user.type(field("Area height (ft)"), "20{Enter}");
            expect(field("Area height (ft)").value).toBe("20");
            act(() => boardProps.current!.onPlayDataChange!(before));
            expect(field("Area height (ft)").value).toBe("40");
            expect(document.activeElement).toBe(field("Area height (ft)"));
        });

        it("gives each field a 44px touch target", () => {
            renderEditor({ ...createEmptyPlayData(), area: { kind: "custom", rect: { x: 100, y: 30, w: 40, h: 40 } } });
            expect(field("Area left (ft)").closest(".MuiInputBase-root")).toHaveStyle({ minHeight: "44px" });
        });
    });

    it("words the alert for one and for many elements", () => {
        expect(outsideAreaMessage(1)).toBe("1 element is outside the ice area.");
        expect(outsideAreaMessage(3)).toBe("3 elements are outside the ice area.");
    });
});

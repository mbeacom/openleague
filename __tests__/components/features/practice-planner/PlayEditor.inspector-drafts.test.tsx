/**
 * Inspector drafts never cross elements. On touch devices tapping the canvas
 * does not blur the focused label field, so the selection can change while a
 * draft is still pending; the draft must land on the element it was typed for.
 */
import React, { forwardRef, useImperativeHandle } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { updateElement } from "@/lib/utils/canvas/element-ops";
import type { RinkBoardProps } from "@/components/features/practice-planner/RinkBoard";

vi.mock("@/lib/utils/canvas/thumbnail-generator", () => ({ generateThumbnail: () => "data:image/png;base64,AA==" }));

const boardCalls = vi.hoisted(() => ({ updates: [] as Array<{ id: string; patch: object }> }));
vi.mock("@/components/features/practice-planner/RinkBoard", () => ({
    RinkBoard: forwardRef(function MockBoard(props: RinkBoardProps, ref) {
        useImperativeHandle(ref, () => ({
            undo: () => {}, redo: () => {}, clear: () => {},
            updateElement: (id: string, patch: object) => {
                boardCalls.updates.push({ id, patch });
                props.onPlayDataChange?.(updateElement(props.playData, id, patch));
            },
        }));
        return (
            <div data-testid="board" data-labels={JSON.stringify(props.playData.players.map((p) => [p.id, p.label]))}>
                {/* fireEvent.click moves no focus, like a touch tap on the canvas */}
                <button onClick={() => props.onSelectionChange?.("a")}>tap a</button>
                <button onClick={() => props.onSelectionChange?.("b")}>tap b</button>
            </div>
        );
    }),
}));

import { PlayEditor } from "@/components/features/practice-planner/PlayEditor";

const player = (id: string) => ({ id, position: { x: 50, y: 40 }, role: "X" as const, label: "", color: "#000000" });

describe("PlayEditor inspector drafts", () => {
    it("commits a pending label draft to the element it was typed for, not the next selection", async () => {
        const playData = { ...createEmptyPlayData(), players: [player("a"), player("b")] };
        render(
            <ThemeProvider theme={createTheme()}>
                <PlayEditor teamId="t" initialData={{ name: "Drill", playData }} />
            </ThemeProvider>
        );
        fireEvent.click(screen.getByText("tap a"));
        const labelA = await screen.findByLabelText("Label");
        act(() => labelA.focus());
        fireEvent.change(labelA, { target: { value: "C1" } }); // dirty draft, no blur, no Enter

        fireEvent.click(screen.getByText("tap b"));

        expect(boardCalls.updates).toEqual([{ id: "a", patch: { label: "C1" } }]);
        expect(JSON.parse(screen.getByTestId("board").dataset.labels!)).toEqual([["a", "C1"], ["b", ""]]);
        expect(screen.getByLabelText("Label")).toHaveValue("");
    });
});

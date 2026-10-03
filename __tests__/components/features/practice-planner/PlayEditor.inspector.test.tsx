import React, { forwardRef, useEffect, useImperativeHandle } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { updateElement } from "@/lib/utils/canvas/element-ops";
import type { RinkBoardProps } from "@/components/features/practice-planner/RinkBoard";

vi.mock("@/lib/utils/canvas/thumbnail-generator", () => ({ generateThumbnail: () => "data:image/png;base64,AA==" }));
vi.mock("@/components/features/practice-planner/RinkBoard", () => ({
    RinkBoard: forwardRef(function MockBoard(props: RinkBoardProps, ref) {
        useEffect(() => { props.onSelectionChange?.("n"); }, []); // eslint-disable-line react-hooks/exhaustive-deps
        useImperativeHandle(ref, () => ({
            undo: () => {}, redo: () => {}, clear: () => {},
            updateElement: (id: string, patch: object) => props.onPlayDataChange?.(updateElement(props.playData, id, patch)),
        }));
        return <div data-testid="board" data-rotation={props.playData.equipment[0]?.rotation} />;
    }),
}));

import { PlayEditor } from "@/components/features/practice-planner/PlayEditor";

describe("PlayEditor + inspector", () => {
    it("edits the selected net through the board handle", async () => {
        const playData = { ...createEmptyPlayData(), equipment: [{ id: "n", kind: "net" as const, position: { x: 100, y: 40 }, rotation: 0 }] };
        render(
            <ThemeProvider theme={createTheme()}>
                <PlayEditor teamId="t" initialData={{ name: "Drill", playData }} />
            </ThemeProvider>
        );
        expect(await screen.findByRole("region", { name: "selected element" })).toBeInTheDocument();
        await userEvent.click(screen.getByLabelText("Faces right"));
        expect(screen.getByTestId("board")).toHaveAttribute("data-rotation", "180");
    });
});

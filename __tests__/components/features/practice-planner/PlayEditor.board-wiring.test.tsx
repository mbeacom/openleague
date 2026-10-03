/**
 * PlayEditor ↔ RinkBoard wiring: notation options reach the board, and
 * limit messages from the board surface as a warning snackbar.
 * RinkBoard is mocked so the props it receives can be inspected directly.
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import type { RinkBoardProps } from "@/components/features/practice-planner/RinkBoard";

const boardProps: { current: RinkBoardProps | null } = { current: null };

vi.mock("@/components/features/practice-planner/RinkBoard", () => ({
    RinkBoard: React.forwardRef(function MockRinkBoard(props: RinkBoardProps, _ref: React.Ref<unknown>) {
        boardProps.current = props;
        return <div data-testid="rink-board" />;
    }),
}));

vi.mock("@/lib/utils/canvas/thumbnail-generator", () => ({
    generateThumbnail: vi.fn(() => ""),
}));

import { PlayEditor } from "@/components/features/practice-planner/PlayEditor";

function renderEditor() {
    return render(
        <ThemeProvider theme={createTheme()}>
            <PlayEditor teamId="team-1" />
        </ThemeProvider>
    );
}

describe("PlayEditor board wiring", () => {
    it("passes notation defaults and the ink color to the board", () => {
        renderEditor();
        expect(boardProps.current).toMatchObject({
            playerRole: "X",
            strokeOptions: { action: "skate", path: "freehand", end: "arrow" },
            equipmentKind: "cone",
            selectedColor: "#212121",
        });
        expect(boardProps.current?.onSelectionChange).toBeTypeOf("function");
    });

    it("shows a limit message from the board as a warning", () => {
        renderEditor();
        act(() => boardProps.current!.onLimitReached!("A play can have at most 50 equipment items."));
        const alert = screen.getByRole("alert");
        expect(alert).toHaveTextContent("at most 50 equipment items");
        expect(alert.className).toMatch(/Warning/);
    });
});

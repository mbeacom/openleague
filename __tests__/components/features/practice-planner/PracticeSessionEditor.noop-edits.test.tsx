/**
 * A move or station toggle the timeline rules refuse leaves the editor clean;
 * a real one marks it dirty. The list disables refused controls itself, so
 * here it is told every move and toggle is allowed (its can* checks are
 * mocked) while the editor's helpers keep the real rules and refuse.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithPlanner } from "@/__tests__/helpers/planner";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { PracticeSessionEditor } from "@/components/features/practice-planner/PracticeSessionEditor";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import type { PlayInSession } from "@/types/practice-planner";

// Only the list's checks are loosened; toggleRunsWithPrevious / moveItem call
// the real checks inside their own module, so they still refuse.
vi.mock("@/lib/utils/session-timeline", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/utils/session-timeline")>()),
    canToggleRunsWithPrevious: () => true,
    canMove: () => true,
}));

const TEAM = "cteamxxxxxxxxxxxxxxxxxxxx";
const START = new Date("2026-04-07T22:00:00.000Z");
const SWITCH = "Run as a station with the previous drill";

/** "a b+ c+ d": a, then b and c running with the drill before them, then d. */
function drills(spec: string): PlayInSession[] {
    return spec.split(" ").map((token, sequence) => ({
        id: token.replace("+", ""),
        playId: `clib${token.replace("+", "")}xxxxxxxxxxxxxxxxxxxx`,
        name: `Drill ${token.replace("+", "")}`,
        sequence,
        runsWithPrevious: token.endsWith("+"),
        duration: 10,
        instructions: "",
        playData: createEmptyPlayData(),
        thumbnail: "",
    }));
}

function renderEditor(plays: PlayInSession[]) {
    renderWithPlanner(
        <ThemeProvider theme={createTheme()}>
            <LocalizationProvider dateAdapter={AdapterDateFns}>
                <PracticeSessionEditor
                    teamId={TEAM}
                    initialData={{ title: "Practice", duration: 60, date: START, plays }}
                    onSave={vi.fn().mockResolvedValue({ success: true })}
                />
            </LocalizationProvider>
        </ThemeProvider>,
    );
}

describe("PracticeSessionEditor no-op edits", () => {
    it("stays clean when a station toggle is refused at the group cap", () => {
        // a b c d are one full block (4 stations); joining e to it would make 5.
        renderEditor(drills("a b+ c+ d+ e"));
        const switches = screen.getAllByLabelText(SWITCH);
        fireEvent.click(switches[switches.length - 1]);
        expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
    });

    it("marks the editor dirty for a toggle that changes the list", () => {
        renderEditor(drills("a b c"));
        fireEvent.click(screen.getAllByLabelText(SWITCH)[0]);
        expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    });

    it("stays clean when a move is refused (the first drill moving up)", () => {
        renderEditor(drills("a b"));
        fireEvent.click(screen.getByRole("button", { name: "Move play 1 up" }));
        expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
    });

    it("marks the editor dirty for a move that changes the order", () => {
        renderEditor(drills("a b"));
        fireEvent.click(screen.getByRole("button", { name: "Move play 1 down" }));
        expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    });
});

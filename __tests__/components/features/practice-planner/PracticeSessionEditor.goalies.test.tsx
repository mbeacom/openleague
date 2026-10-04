import { beforeAll, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { renderWithPlanner } from "@/__tests__/helpers/planner";
import { PracticeSessionEditor } from "@/components/features/practice-planner/PracticeSessionEditor";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import type { PlayData, PlayGoalies, PlayInSession } from "@/types/practice-planner";

beforeAll(() => {
    global.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver;
});

const TEAM = "cteamxxxxxxxxxxxxxxxxxxxx";
const G_BOARD: PlayData = {
    ...createEmptyPlayData(),
    players: [{ id: "g", role: "G", label: "G", position: { x: 14, y: 42.5 }, color: "#212121" }],
};

function drill(id: string, sequence: number, goalies: PlayGoalies, runsWithPrevious = false): PlayInSession {
    return {
        id, playId: `clib${id}xxxxxxxxxxxxxxxxxxxx`, name: `Drill ${id}`, sequence, runsWithPrevious, duration: 10,
        instructions: "", playData: G_BOARD, thumbnail: "", goalies,
    };
}

function renderEditor(plays: PlayInSession[], goaliesAttending: number | null | undefined, onSave = vi.fn().mockResolvedValue({ success: true })) {
    renderWithPlanner(
        <ThemeProvider theme={createTheme()}>
            <LocalizationProvider dateAdapter={AdapterDateFns}>
                <PracticeSessionEditor
                    teamId={TEAM}
                    initialData={{ title: "Practice", duration: 60, date: new Date("2026-04-07T22:00:00.000Z"), plays, goaliesAttending }}
                    onSave={onSave}
                />
            </LocalizationProvider>
        </ThemeProvider>,
    );
    return { onSave };
}

async function chooseGoalies(label: string) {
    fireEvent.mouseDown(screen.getByRole("combobox", { name: /^Goalies attending/ }));
    fireEvent.click(await screen.findByRole("option", { name: label }));
}

describe("PracticeSessionEditor: goalies attending", () => {
    it("starts from the session's count, shows Not set when unset, and saves the choice", async () => {
        const { onSave } = renderEditor([], undefined);
        expect(screen.getByRole("combobox", { name: /^Goalies attending/ })).toHaveTextContent("Not set");
        await chooseGoalies("2");
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /^save session/i }));
        });
        expect(onSave.mock.calls[0][0].goaliesAttending).toBe(2);
    });

    it("saves null after choosing Not set", async () => {
        const { onSave } = renderEditor([], 1);
        await chooseGoalies("Not set");
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /^save session/i }));
        });
        expect(onSave.mock.calls[0][0].goaliesAttending).toBeNull();
    });

    it("shows no goalie warning when the count is not set", () => {
        renderEditor([drill("a", 0, "required")], null);
        expect(screen.queryByText(/goalie — /)).toBeNull();
    });

    it("warns on a drill that needs a goalie when none attend, without blocking the save", async () => {
        const { onSave } = renderEditor([drill("a", 0, "required")], 0);
        expect(screen.getByText("Needs a goalie — none attending")).toBeInTheDocument();
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /^save session/i }));
        });
        expect(onSave).toHaveBeenCalled();
    });

    it("warns on a station block that needs more goalies than attend", () => {
        renderEditor([drill("a", 0, "required"), drill("b", 1, "required", true)], 1);
        const header = screen.getByRole("heading", { name: /Stations · 2/ }).parentElement as HTMLElement;
        expect(within(header).getByText("These stations need 2 goalies — 1 attending")).toBeInTheDocument();
    });

    it("notices goalies attending when no drill uses one", () => {
        renderEditor([drill("a", 0, "none")], 2);
        expect(screen.getByText("2 goalies attending, but no drill uses a goalie")).toBeInTheDocument();
    });
});

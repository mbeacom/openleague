import { beforeAll, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { renderWithPlanner } from "@/__tests__/helpers/planner";
import { PracticeSessionEditor } from "@/components/features/practice-planner/PracticeSessionEditor";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import type { SessionItem } from "@/types/practice-planner";

beforeAll(() => {
    global.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver;
});

const TEAM = "cteamxxxxxxxxxxxxxxxxxxxx";
const PLAYS: SessionItem[] = [
    { id: "kw", kind: "warmup", label: "", sequence: 0, duration: 8, instructions: "Easy laps", runsWithPrevious: false },
    { id: "k1", playId: "cplayaxxxxxxxxxxxxxxxxxxx", name: "Breakout", sequence: 1, runsWithPrevious: false, duration: 10, instructions: "", playData: createEmptyPlayData(), thumbnail: "" },
    { id: "kb", kind: "break", label: "Water", sequence: 2, duration: 2, instructions: "", runsWithPrevious: false },
];

function renderEditor(onSave = vi.fn().mockResolvedValue({ success: true })) {
    renderWithPlanner(
        <ThemeProvider theme={createTheme()}>
            <LocalizationProvider dateAdapter={AdapterDateFns}>
                <PracticeSessionEditor
                    teamId={TEAM}
                    initialData={{ title: "Practice", duration: 60, date: new Date("2026-04-07T22:00:00.000Z"), plays: PLAYS }}
                    onSave={onSave}
                />
            </LocalizationProvider>
        </ThemeProvider>,
    );
    return onSave;
}

async function save() {
    await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /^save session/i }));
    });
}

describe("PracticeSessionEditor: block rows", () => {
    it("shows block rows as block cards between the drills, and counts their minutes", () => {
        renderEditor();
        expect(screen.getByRole("heading", { name: "Warm-up" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Water" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Breakout" })).toBeInTheDocument();
        expect(screen.getByText("Total Play Time: 20 minutes")).toBeInTheDocument();
    });

    it("saves the block rows it loaded, unchanged and in order", async () => {
        const onSave = renderEditor();
        await save();
        expect(onSave.mock.calls[0][0].plays).toEqual(PLAYS);
    });

    it("edits a block in place and moves it like any row", async () => {
        const onSave = renderEditor();
        fireEvent.click(screen.getByRole("button", { name: "More minutes for Water" }));
        fireEvent.click(screen.getByRole("button", { name: "Move Water up" }));
        await save();
        const plays = onSave.mock.calls[0][0].plays as SessionItem[];
        expect(plays.map((play) => play.id)).toEqual(["kw", "kb", "k1"]);
        expect(plays[1]).toMatchObject({ kind: "break", duration: 3, sequence: 1, runsWithPrevious: false });
    });
});

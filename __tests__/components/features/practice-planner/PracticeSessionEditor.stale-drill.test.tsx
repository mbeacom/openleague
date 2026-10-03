import { describe, it, expect, vi, beforeAll } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import {
    PracticeSessionEditor,
    type PracticeSessionSaveResult,
    type PracticeSessionSubmitData,
} from "@/components/features/practice-planner/PracticeSessionEditor";
import { createEmptyPlayData } from "@/lib/utils/play-data";

beforeAll(() => {
    global.ResizeObserver = class {
        observe() { /* noop */ }
        unobserve() { /* noop */ }
        disconnect() { /* noop */ }
    } as unknown as typeof ResizeObserver;
});

vi.mock("@/lib/actions/plays", () => ({
    getPlaysByTeam: vi.fn().mockResolvedValue({ success: true, data: { plays: [], total: 0 } }),
    getPlayById: vi.fn(),
    deletePlay: vi.fn(),
    createPlay: vi.fn(),
}));

vi.mock("@/lib/actions/practice-session-drills", () => ({
    saveSessionDrill: vi.fn(),
    copySessionDrillToLibrary: vi.fn(),
}));

type SaveFn = (data: PracticeSessionSubmitData) => Promise<PracticeSessionSaveResult>;
const STALE = "One or more drills not found or do not belong to this session";

function renderEditor(onSave: SaveFn) {
    render(
        <ThemeProvider theme={createTheme()}>
            <LocalizationProvider dateAdapter={AdapterDateFns}>
                <PracticeSessionEditor
                    sessionId="csessionxxxxxxxxxxxxxxxxx"
                    teamId="cteamxxxxxxxxxxxxxxxxxxxx"
                    initialData={{
                        title: "Practice", duration: 60, date: new Date("2026-04-07T22:00:00Z"),
                        plays: [{ id: "k1", playId: "cdeletedxxxxxxxxxxxxxxxxx", name: "Breakout", sequence: 0, duration: 10, runsWithPrevious: false, instructions: "", playData: createEmptyPlayData(), thumbnail: "" }],
                    }}
                    onSave={onSave}
                />
            </LocalizationProvider>
        </ThemeProvider>,
    );
}

async function clickSave() {
    fireEvent.change(screen.getByLabelText(/session title/i), { target: { value: "Practice v2" } });
    await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /^save session/i }));
    });
}

// A library drill deleted elsewhere while this editor still holds its id: every
// save is rejected until the page is reloaded, so say so.
describe("PracticeSessionEditor stale-drill save error", () => {
    it("tells the coach to reload when a drill the editor holds no longer exists", async () => {
        renderEditor(vi.fn<SaveFn>().mockResolvedValue({ success: false, error: STALE }));
        await clickSave();
        expect(screen.getByRole("alert")).toHaveTextContent(`${STALE}. Reload the page to get the latest drills.`);
    });

    it("shows other save errors unchanged", async () => {
        renderEditor(vi.fn<SaveFn>().mockResolvedValue({ success: false, error: "Failed to save practice session" }));
        await clickSave();
        expect(screen.getByRole("alert")).toHaveTextContent(/^Failed to save practice session$/);
    });
});

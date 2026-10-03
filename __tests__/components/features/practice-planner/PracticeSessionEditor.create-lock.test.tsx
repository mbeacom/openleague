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
vi.mock("@/lib/actions/practice-session-drills", () => ({ saveSessionDrill: vi.fn(), copySessionDrillToLibrary: vi.fn() }));

type SaveFn = (data: PracticeSessionSubmitData) => Promise<PracticeSessionSaveResult>;

function renderNewSession(onSave: SaveFn) {
    render(
        <ThemeProvider theme={createTheme()}>
            <LocalizationProvider dateAdapter={AdapterDateFns}>
                <PracticeSessionEditor
                    teamId="cteamxxxxxxxxxxxxxxxxxxxx"
                    initialData={{
                        title: "Practice",
                        duration: 60,
                        date: new Date("2026-04-07T22:00:00Z"),
                        plays: [{
                            id: "k1", playId: "clibraryxxxxxxxxxxxxxxxxx", name: "Breakout", sequence: 0, duration: 10, runsWithPrevious: false,
                            instructions: "", playData: createEmptyPlayData(), thumbnail: "",
                        }, {
                            id: "k2", playId: "clibrary2xxxxxxxxxxxxxxxx", name: "Regroup", sequence: 1, duration: 10, runsWithPrevious: false,
                            instructions: "", playData: createEmptyPlayData(), thumbnail: "",
                        }],
                    }}
                    onSave={onSave}
                />
            </LocalizationProvider>
        </ThemeProvider>,
    );
}

function expectLocked() {
    expect(screen.getByLabelText(/session title/i)).toBeDisabled();
    expect(screen.getByLabelText(/session duration/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /add from library/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^(save session|saving)/i })).toBeDisabled();
    // Every drill card control: reorder, inline edit, delete.
    expect(screen.getByRole("button", { name: "Move play 1 down" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move play 2 up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Edit play 2" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete play 1" })).toBeDisabled();
}

// A create has no follow-up save and redirects on success, so an edit made
// while it runs would be silently dropped: the form must not accept one.
describe("PracticeSessionEditor while creating a new session", () => {
    it("locks the form and drill controls while the create is in flight", async () => {
        const onSave = vi.fn<SaveFn>(() => new Promise<PracticeSessionSaveResult>(() => {}));
        renderNewSession(onSave);

        fireEvent.click(screen.getByRole("button", { name: /save session/i }));
        await act(async () => {});

        expect(onSave).toHaveBeenCalledTimes(1);
        expectLocked();
    });

    it("locks a drill's open inline editor while the create is in flight", async () => {
        renderNewSession(vi.fn<SaveFn>(() => new Promise<PracticeSessionSaveResult>(() => {})));
        fireEvent.click(screen.getByRole("button", { name: "Edit play 1" }));

        fireEvent.click(screen.getByRole("button", { name: /save session/i }));
        await act(async () => {});

        expect(screen.getByLabelText("Duration (minutes)")).toBeDisabled();
        expect(screen.getByLabelText("Instructions")).toBeDisabled();
        expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
    });

    it("stays locked after a successful create, until the redirect lands", async () => {
        renderNewSession(vi.fn<SaveFn>().mockResolvedValue({ success: true }));

        fireEvent.click(screen.getByRole("button", { name: /save session/i }));
        await act(async () => {});

        expectLocked();
    });

    it("unlocks after a failed create so the coach can fix and retry", async () => {
        renderNewSession(vi.fn<SaveFn>().mockResolvedValue({ success: false, error: "Network down" }));

        fireEvent.click(screen.getByRole("button", { name: /save session/i }));
        await act(async () => {});

        expect(screen.getByLabelText(/session title/i)).not.toBeDisabled();
        expect(screen.getByRole("button", { name: /add from library/i })).not.toBeDisabled();
    });
});

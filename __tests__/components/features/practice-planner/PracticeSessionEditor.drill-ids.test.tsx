import { describe, it, expect, vi, beforeAll } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { renderWithPlanner } from "@/__tests__/helpers/planner";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import {
    PracticeSessionEditor,
    type PracticeSessionSaveResult,
    type PracticeSessionSubmitData,
} from "@/components/features/practice-planner/PracticeSessionEditor";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import type { PlayInSession } from "@/types/practice-planner";

beforeAll(() => {
    global.ResizeObserver = class {
        observe() { /* noop */ }
        unobserve() { /* noop */ }
        disconnect() { /* noop */ }
    } as unknown as typeof ResizeObserver;
});

type SaveFn = (data: PracticeSessionSubmitData) => Promise<PracticeSessionSaveResult>;

const LIB = "clibraryxxxxxxxxxxxxxxxxx";
const OWNED = "cownedxxxxxxxxxxxxxxxxxxx";

function drill(id: string, playId: string): PlayInSession {
    return { id, playId, name: "Breakout", sequence: 0, duration: 10, runsWithPrevious: false, instructions: "", playData: createEmptyPlayData(), thumbnail: "" };
}

function renderEditor(onSave: SaveFn, plays: PlayInSession[] = [], sessionId: string | null = "csessionxxxxxxxxxxxxxxxxx") {
    renderWithPlanner(
        <ThemeProvider theme={createTheme()}>
            <LocalizationProvider dateAdapter={AdapterDateFns}>
                <PracticeSessionEditor
                    sessionId={sessionId ?? undefined}
                    teamId="cteamxxxxxxxxxxxxxxxxxxxx"
                    initialData={{ title: "Practice", duration: 60, date: new Date("2026-04-07T22:00:00Z"), plays }}
                    onSave={onSave}
                />
            </LocalizationProvider>
        </ThemeProvider>,
    );
}

async function editTitleAndWait(value: string) {
    fireEvent.change(screen.getByLabelText(/session title/i), { target: { value } });
    await act(async () => {
        await vi.advanceTimersByTimeAsync(2100);
    });
}

describe("PracticeSessionEditor drill ids and autosave", () => {
    it("swaps a drill's playId for the owned copy the save returns", async () => {
        vi.useFakeTimers();
        try {
            const onSave = vi.fn<SaveFn>()
                .mockResolvedValueOnce({ success: true, plays: [{ clientKey: "k1", playId: OWNED }] })
                .mockResolvedValue({ success: true, plays: [] });
            renderEditor(onSave, [drill("k1", LIB)]);

            await editTitleAndWait("Practice v2");
            expect(onSave.mock.calls[0][0].plays[0].playId).toBe(LIB);

            await editTitleAndWait("Practice v3");
            expect(onSave.mock.calls[1][0].plays[0].playId).toBe(OWNED);
        } finally {
            vi.useRealTimers();
        }
    });

    it("never runs two saves at once and follows up with the latest edits", async () => {
        vi.useFakeTimers();
        try {
            const releases: Array<() => void> = [];
            let inFlight = 0;
            let maxInFlight = 0;
            const onSave = vi.fn<SaveFn>(async () => {
                inFlight += 1;
                maxInFlight = Math.max(maxInFlight, inFlight);
                await new Promise<void>((resolve) => releases.push(resolve));
                inFlight -= 1;
                return { success: true, plays: [] };
            });
            renderEditor(onSave);

            await editTitleAndWait("A");
            expect(onSave).toHaveBeenCalledTimes(1);

            await editTitleAndWait("AB");
            expect(onSave).toHaveBeenCalledTimes(1);

            await act(async () => {
                releases[0]();
                await vi.advanceTimersByTimeAsync(0);
            });
            expect(onSave).toHaveBeenCalledTimes(2);
            expect(onSave.mock.calls[1][0].title).toBe("AB");

            await act(async () => {
                releases[1]();
                await vi.advanceTimersByTimeAsync(0);
            });
            expect(maxInFlight).toBe(1);
            expect(onSave).toHaveBeenCalledTimes(2);
            expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
        } finally {
            vi.useRealTimers();
        }
    });
    it("never runs a second create when the coach edits while a new session is saving", async () => {
        vi.useFakeTimers();
        try {
            let release: () => void = () => {};
            const onSave = vi.fn<SaveFn>(async () => {
                await new Promise<void>((resolve) => { release = resolve; });
                return { success: true, plays: [] };
            });
            renderEditor(onSave, [], null);

            fireEvent.change(screen.getByLabelText(/session title/i), { target: { value: "New" } });
            fireEvent.click(screen.getByRole("button", { name: /save session/i }));
            expect(onSave).toHaveBeenCalledTimes(1);

            fireEvent.change(screen.getByLabelText(/session title/i), { target: { value: "New 2" } });
            await act(async () => {
                release();
                await vi.advanceTimersByTimeAsync(2100);
            });
            expect(onSave).toHaveBeenCalledTimes(1);
        } finally {
            vi.useRealTimers();
        }
    });

    it("keeps a Save click's notify intent when it arrives during an autosave", async () => {
        vi.useFakeTimers();
        try {
            const releases: Array<() => void> = [];
            const onSave = vi.fn<SaveFn>(async () => {
                await new Promise<void>((resolve) => releases.push(resolve));
                return { success: true, plays: [] };
            });
            renderEditor(onSave);
            fireEvent.change(screen.getByLabelText(/session title/i), { target: { value: "A" } });
            const saveButton = screen.getByRole("button", { name: /save session/i });

            // The autosave starts and the click lands before isSaving renders.
            act(() => {
                vi.advanceTimersByTime(2000);
                fireEvent.click(saveButton);
            });
            expect(onSave).toHaveBeenCalledTimes(1);
            expect(onSave.mock.calls[0][0].notify).toBe(false);

            await act(async () => {
                releases[0]();
                await vi.advanceTimersByTimeAsync(0);
            });
            expect(onSave).toHaveBeenCalledTimes(2);
            expect(onSave.mock.calls[1][0].notify).toBe(true);

            await act(async () => {
                releases[1]();
                await vi.advanceTimersByTimeAsync(0);
            });
        } finally {
            vi.useRealTimers();
        }
    });
});

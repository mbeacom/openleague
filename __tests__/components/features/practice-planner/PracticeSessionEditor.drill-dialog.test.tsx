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
import type { PlayInSession } from "@/types/practice-planner";

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

const FORK = "cforkxxxxxxxxxxxxxxxxxxxx";

// Stand-in for the dialog: one button that reports a successful drill save.
vi.mock("@/components/features/practice-planner/SessionDrillDialog", () => ({
    SessionDrillDialog: ({ open, drill, onSaved }: {
        open: boolean;
        drill: { clientKey: string } | null;
        onSaved: (clientKey: string, patch: Record<string, unknown>) => void;
    }) => {
        if (!open || !drill) return null;
        const clientKey = drill.clientKey;
        return (
            <button
                type="button"
                onClick={() => onSaved(clientKey, {
                    playId: "cforkxxxxxxxxxxxxxxxxxxxx", name: "Forked", description: "", thumbnail: "", playData: { version: 2, players: [], drawings: [], equipment: [], annotations: [] },
                })}
            >
                stub save drill
            </button>
        );
    },
}));

type SaveFn = (data: PracticeSessionSubmitData) => Promise<PracticeSessionSaveResult>;
const LIB = "clibraryxxxxxxxxxxxxxxxxx";

function drill(id: string, playId: string): PlayInSession {
    return { id, playId, name: "Breakout", sequence: 0, duration: 10, instructions: "", playData: createEmptyPlayData(), thumbnail: "" };
}

// sessionId null = a session that has never been saved.
function renderEditor(onSave: SaveFn, plays: PlayInSession[], sessionId: string | null = "csessionxxxxxxxxxxxxxxxxx") {
    render(
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

describe("PracticeSessionEditor drill dialog wiring", () => {
    it("disables diagram editing and new drills before the session is saved", () => {
        renderEditor(vi.fn<SaveFn>(), [drill("k1", LIB)], null);
        expect(screen.getByRole("button", { name: /edit diagram/i })).toBeDisabled();
        expect(screen.getByRole("button", { name: /new drill/i })).toBeDisabled();
    });

    it("appends a drill built in the dialog and saves its id", async () => {
        const onSave = vi.fn<SaveFn>().mockResolvedValue({ success: true, plays: [] });
        renderEditor(onSave, []);
        fireEvent.click(screen.getByRole("button", { name: /new drill/i }));
        fireEvent.click(screen.getByRole("button", { name: "stub save drill" }));

        expect(screen.getByRole("heading", { name: "Forked" })).toBeInTheDocument();
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /^save session/i }));
        });
        expect(onSave.mock.calls[0][0].plays.map((p) => p.playId)).toEqual([FORK]);
    });

    it("keeps the dialog's fork when an autosave in flight returns an older copy", async () => {
        vi.useFakeTimers();
        try {
            const releases: Array<() => void> = [];
            const onSave = vi.fn<SaveFn>()
                .mockImplementationOnce(async () => {
                    await new Promise<void>((resolve) => releases.push(resolve));
                    return { success: true, plays: [{ clientKey: "k1", playId: "cautosavecopyxxxxxxxxxxxx" }] };
                })
                .mockResolvedValue({ success: true, plays: [] });
            renderEditor(onSave, [drill("k1", LIB)]);

            fireEvent.change(screen.getByLabelText(/session title/i), { target: { value: "Practice v2" } });
            await act(async () => {
                await vi.advanceTimersByTimeAsync(2100);
            });
            expect(onSave.mock.calls[0][0].plays[0].playId).toBe(LIB);

            fireEvent.click(screen.getByRole("button", { name: /edit diagram/i }));
            fireEvent.click(screen.getByRole("button", { name: "stub save drill" }));

            await act(async () => {
                releases[0]();
                await vi.advanceTimersByTimeAsync(0);
            });
            expect(onSave).toHaveBeenCalledTimes(2);
            expect(onSave.mock.calls[1][0].plays[0].playId).toBe(FORK);
        } finally {
            vi.useRealTimers();
        }
    });
});

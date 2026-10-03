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

const FORK = "cforkxxxxxxxxxxxxxxxxxxxx";
// What the last stub save's onSaved returned (the session-save outcome).
const lastOutcome = vi.hoisted(() => ({ promise: null as Promise<unknown> | null }));

// Stand-in for the dialog: one button that reports a successful drill save.
vi.mock("@/components/features/practice-planner/SessionDrillDialog", () => ({
    SessionDrillDialog: ({ open, drill, onSaved }: {
        open: boolean;
        drill: { clientKey: string } | null;
        onSaved: (clientKey: string, patch: Record<string, unknown>) => Promise<unknown>;
    }) => {
        if (!open || !drill) return null;
        const clientKey = drill.clientKey;
        return (
            <button
                type="button"
                onClick={() => {
                    lastOutcome.promise = onSaved(clientKey, {
                        playId: "cforkxxxxxxxxxxxxxxxxxxxx", name: "Forked", description: "", thumbnail: "", playData: { version: 2, players: [], drawings: [], equipment: [], annotations: [] },
                    });
                }}
            >
                stub save drill
            </button>
        );
    },
}));

type SaveFn = (data: PracticeSessionSubmitData) => Promise<PracticeSessionSaveResult>;
const LIB = "clibraryxxxxxxxxxxxxxxxxx";

function drill(id: string, playId: string): PlayInSession {
    return { id, playId, name: "Breakout", sequence: 0, duration: 10, runsWithPrevious: false, instructions: "", playData: createEmptyPlayData(), thumbnail: "" };
}

// sessionId null = a session that has never been saved.
function renderEditor(onSave: SaveFn, plays: PlayInSession[], sessionId: string | null = "csessionxxxxxxxxxxxxxxxxx") {
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
        // A new drill's id is saved into the session right away (no Save click).
        await act(async () => {});
        expect(onSave).toHaveBeenCalledTimes(1);
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

            // The dialog is already open when the autosave starts ("Edit diagram" is
            // disabled while a save is in flight).
            fireEvent.click(screen.getByRole("button", { name: /edit diagram/i }));
            fireEvent.change(screen.getByLabelText(/session title/i), { target: { value: "Practice v2" } });
            await act(async () => {
                await vi.advanceTimersByTimeAsync(2100);
            });
            expect(onSave.mock.calls[0][0].plays[0].playId).toBe(LIB);

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

// A fork only exists in the session once a session save sends its id; until
// then a coach who leaves the page loses the edit.
describe("PracticeSessionEditor saves a dialog fork right away", () => {
    it("saves the fork without waiting for the autosave timer", async () => {
        vi.useFakeTimers();
        try {
            const onSave = vi.fn<SaveFn>().mockResolvedValue({ success: true, plays: [] });
            renderEditor(onSave, [drill("k1", LIB)]);

            fireEvent.click(screen.getByRole("button", { name: /edit diagram/i }));
            fireEvent.click(screen.getByRole("button", { name: "stub save drill" }));
            await act(async () => {
                await vi.advanceTimersByTimeAsync(0);
            });

            expect(onSave).toHaveBeenCalledTimes(1);
            expect(onSave.mock.calls[0][0].plays[0].playId).toBe(FORK);
        } finally {
            vi.useRealTimers();
        }
    });

    it("saves the fork right away even after a failed save left the session dirty", async () => {
        vi.useFakeTimers();
        try {
            const onSave = vi.fn<SaveFn>()
                .mockResolvedValueOnce({ success: false, error: "Network down" })
                .mockResolvedValue({ success: true, plays: [] });
            renderEditor(onSave, [drill("k1", LIB)]);

            // An autosave fails: the session stays dirty, so the autosave timer
            // does not re-arm on the next edit.
            fireEvent.change(screen.getByLabelText(/session title/i), { target: { value: "Practice v2" } });
            await act(async () => {
                await vi.advanceTimersByTimeAsync(2100);
            });
            expect(onSave).toHaveBeenCalledTimes(1);
            expect(screen.getByText("Network down")).toBeInTheDocument();

            fireEvent.click(screen.getByRole("button", { name: /edit diagram/i }));
            fireEvent.click(screen.getByRole("button", { name: "stub save drill" }));
            await act(async () => {
                await vi.advanceTimersByTimeAsync(0);
            });

            expect(onSave).toHaveBeenCalledTimes(2);
            expect(onSave.mock.calls[1][0].plays[0].playId).toBe(FORK);
        } finally {
            vi.useRealTimers();
        }
    });

    it("does not save the session again when an owned drill is edited in place", async () => {
        vi.useFakeTimers();
        try {
            const onSave = vi.fn<SaveFn>().mockResolvedValue({ success: true, plays: [] });
            renderEditor(onSave, [drill("k1", FORK)]);

            fireEvent.click(screen.getByRole("button", { name: /edit diagram/i }));
            fireEvent.click(screen.getByRole("button", { name: "stub save drill" }));
            await act(async () => {
                await vi.advanceTimersByTimeAsync(0);
            });

            expect(onSave).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });
});

// A new drill or fork is only linked once the session save succeeds; the
// dialog must hear about a failure instead of reporting success.
describe("PracticeSessionEditor reports the session save to the drill dialog", () => {
    const DURATION_ERROR = "Total drill time exceeds the session duration";

    async function stubSaveOutcome(): Promise<unknown> {
        fireEvent.click(screen.getByRole("button", { name: "stub save drill" }));
        let outcome: unknown;
        await act(async () => {
            outcome = await lastOutcome.promise;
        });
        return outcome;
    }

    it("resolves ok once the session save that carries the fork succeeds", async () => {
        renderEditor(vi.fn<SaveFn>().mockResolvedValue({ success: true, plays: [] }), [drill("k1", LIB)]);
        fireEvent.click(screen.getByRole("button", { name: /edit diagram/i }));

        expect(await stubSaveOutcome()).toEqual({ ok: true });
    });

    it("reports a rejected session save and rolls the card back", async () => {
        const onSave = vi.fn<SaveFn>().mockResolvedValue({ success: false, error: DURATION_ERROR });
        renderEditor(onSave, [drill("k1", LIB)]);
        fireEvent.click(screen.getByRole("button", { name: /edit diagram/i }));

        expect(await stubSaveOutcome()).toEqual({ ok: false, error: expect.stringContaining(DURATION_ERROR) });
        expect(onSave.mock.calls[0][0].plays[0].playId).toBe(FORK);
        // The card is back on the library drill, so a retry from the dialog is
        // again a new id and saves the session again.
        expect(screen.queryByRole("heading", { name: "Forked" })).toBeNull();
        expect(screen.getByRole("heading", { name: "Breakout" })).toBeInTheDocument();
    });

    it("removes a brand-new drill's card when its session save fails", async () => {
        renderEditor(vi.fn<SaveFn>().mockResolvedValue({ success: false, error: DURATION_ERROR }), []);
        fireEvent.click(screen.getByRole("button", { name: /new drill/i }));

        expect(await stubSaveOutcome()).toMatchObject({ ok: false });
        expect(screen.queryByRole("heading", { name: "Forked" })).toBeNull();
    });
});

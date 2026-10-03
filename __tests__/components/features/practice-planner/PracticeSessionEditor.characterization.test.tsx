/**
 * Characterization tests: pin PracticeSessionEditor's behavior before it is
 * split into SessionDrillCard / SessionDrillList / VenueBookingFields /
 * useVenueBooking. They must pass unchanged before and after the split.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import {
    PracticeSessionEditor,
    type PracticeSessionEditorProps,
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

// The editor hosts SessionDrillDialog, which imports these server actions.
vi.mock("@/lib/actions/practice-session-drills", () => ({
    saveSessionDrill: vi.fn(),
    copySessionDrillToLibrary: vi.fn(),
}));

type SaveFn = (data: PracticeSessionSubmitData) => Promise<PracticeSessionSaveResult>;

const TEAM = "cteamxxxxxxxxxxxxxxxxxxxx";
const VENUE = "cvenuexxxxxxxxxxxxxxxxxxx";
const RESERVATION = "cresxxxxxxxxxxxxxxxxxxxxx";
const START = new Date("2026-04-07T22:00:00.000Z");

function drill(id: string, sequence: number, duration = 10): PlayInSession {
    return {
        id,
        playId: `clib${id}xxxxxxxxxxxxxxxxxxxx`,
        name: `Drill ${id}`,
        sequence,
        runsWithPrevious: false,
        duration,
        instructions: `Run ${id}`,
        playData: createEmptyPlayData(),
        thumbnail: "",
    };
}

function renderEditor(
    props: Partial<PracticeSessionEditorProps> = {},
    plays: PlayInSession[] = [],
    onSave = vi.fn<SaveFn>().mockResolvedValue({ success: true }),
) {
    render(
        <ThemeProvider theme={createTheme()}>
            <LocalizationProvider dateAdapter={AdapterDateFns}>
                <PracticeSessionEditor
                    teamId={TEAM}
                    initialData={{ title: "Practice", duration: 60, date: START, plays }}
                    onSave={onSave}
                    {...props}
                />
            </LocalizationProvider>
        </ThemeProvider>,
    );
    return { onSave };
}

async function clickSaveSession() {
    await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /^save session/i }));
    });
}

describe("PracticeSessionEditor (characterization)", () => {
    it("shows the empty drill list", () => {
        renderEditor();
        expect(screen.getByText("No plays added yet")).toBeInTheDocument();
    });

    it("renders a card per drill and saves reordered sequences", async () => {
        const { onSave } = renderEditor({}, [drill("a", 0), drill("b", 1)]);
        expect(screen.getByRole("heading", { name: "Drill a" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Drill b" })).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Move play 1 down" }));
        await clickSaveSession();

        const sent = onSave.mock.calls[0][0].plays;
        expect(sent.map((p) => [p.id, p.sequence])).toEqual([["b", 0], ["a", 1]]);
    });

    it("edits a drill's duration and instructions inline", async () => {
        const { onSave } = renderEditor({}, [drill("a", 0), drill("b", 1)]);
        fireEvent.click(screen.getByRole("button", { name: "Edit play 1" }));
        fireEvent.change(screen.getByLabelText("Duration (minutes)"), { target: { value: "25" } });
        fireEvent.change(screen.getByLabelText("Instructions"), { target: { value: "Faster" } });
        fireEvent.click(screen.getByRole("button", { name: "Save" }));

        expect(screen.getByText("Total Play Time: 35 minutes")).toBeInTheDocument();
        await clickSaveSession();
        expect(onSave.mock.calls[0][0].plays[0]).toMatchObject({ duration: 25, instructions: "Faster" });
    });

    it("deletes a drill and renumbers the rest", async () => {
        const { onSave } = renderEditor({}, [drill("a", 0), drill("b", 1)]);
        fireEvent.click(screen.getByRole("button", { name: "Delete play 1" }));
        await clickSaveSession();
        expect(onSave.mock.calls[0][0].plays.map((p) => [p.id, p.sequence])).toEqual([["b", 0]]);
    });

    it("warns when drill time exceeds the session", () => {
        renderEditor({}, [drill("a", 0, 40), drill("b", 1, 30)]);
        expect(screen.getByText(/Total play time \(70 min\) exceeds/)).toBeInTheDocument();
    });

    it("requires a start time once a venue is picked", async () => {
        const { onSave } = renderEditor({
            venues: [{ id: VENUE, name: "Test Rink", timezone: "America/New_York" }],
        });
        fireEvent.mouseDown(screen.getByRole("combobox", { name: /^Venue/ }));
        fireEvent.click(screen.getByRole("option", { name: "Test Rink" }));
        await clickSaveSession();

        expect(screen.getByText("Start time is required when booking a venue")).toBeInTheDocument();
        expect(onSave).not.toHaveBeenCalled();
    });

    it("adopts a confirmed reservation's start and length", async () => {
        const { onSave } = renderEditor({
            reservations: [{
                id: RESERVATION,
                startsAt: "2026-04-08T23:00:00.000Z",
                endsAt: "2026-04-09T00:30:00.000Z",
                timezone: "America/New_York",
                venueId: VENUE,
                venueName: "Test Rink",
                surfaceId: null,
                surfaceName: null,
                segmentId: null,
                segmentName: null,
                ownerType: "team",
            }],
        });
        fireEvent.mouseDown(screen.getByRole("combobox", { name: /Confirmed reservation/ }));
        fireEvent.click(screen.getByRole("option", { name: /Test Rink/ }));
        await clickSaveSession();

        const sent = onSave.mock.calls[0][0];
        expect(sent.reservationId).toBe(RESERVATION);
        expect(sent.duration).toBe(90);
        expect(sent.startAt?.toISOString()).toBe("2026-04-08T23:00:00.000Z");
    });

    it("shows venue conflicts and resubmits with an override reason", async () => {
        const onSave = vi.fn<SaveFn>()
            .mockResolvedValueOnce({
                success: false,
                error: "conflict",
                conflicts: [{
                    source: "venueReservation",
                    title: "Hockey Club",
                    startAt: new Date("2026-04-07T22:00:00.000Z"),
                    endAt: null,
                    surfaceId: null,
                    segmentId: null,
                    segmentName: null,
                }],
            })
            .mockResolvedValue({ success: true });
        renderEditor({}, [], onSave);

        await clickSaveSession();
        expect(screen.getByText(/overlaps 1 existing booking/)).toBeInTheDocument();
        const override = screen.getByRole("button", { name: "Override conflict" });
        expect(override).toBeDisabled();

        fireEvent.change(screen.getByLabelText(/Override reason/), { target: { value: "Coach approved" } });
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Override conflict" }));
        });
        expect(onSave.mock.calls[1][0]).toMatchObject({
            overrideConflicts: true,
            overrideReason: "Coach approved",
            notify: true,
        });
    });
});

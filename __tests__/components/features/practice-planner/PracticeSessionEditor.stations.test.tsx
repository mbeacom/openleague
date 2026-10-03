/** Station grouping in the session editor (practice planner 2b). */
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
import type { IceArea, PlayInSession } from "@/types/practice-planner";

vi.mock("@/lib/actions/plays", () => ({
    getPlaysByTeam: vi.fn().mockResolvedValue({ success: true, data: { plays: [], total: 0 } }),
    getPlayById: vi.fn(),
    deletePlay: vi.fn(),
    createPlay: vi.fn(),
}));
// The drill dialog's actions import the auth stack; the editor tests never call them.
vi.mock("@/lib/actions/practice-session-drills", () => ({ saveSessionDrill: vi.fn(), copySessionDrillToLibrary: vi.fn() }));

type SaveFn = (data: PracticeSessionSubmitData) => Promise<PracticeSessionSaveResult>;

const TEAM = "cteamxxxxxxxxxxxxxxxxxxxx";
const START = new Date("2026-04-07T22:00:00.000Z");
const SWITCH = "Run as a station with the previous drill";

function drill(id: string, sequence: number, runsWithPrevious: boolean, duration = 15): PlayInSession {
    return {
        id,
        playId: `clib${id}xxxxxxxxxxxxxxxxxxxx`,
        name: `Drill ${id}`,
        sequence,
        runsWithPrevious,
        duration,
        instructions: "",
        playData: createEmptyPlayData(),
        thumbnail: "",
    };
}

/** "a b+ c+ d": a, then b and c running with the drill before them, then d. */
function drills(spec: string): PlayInSession[] {
    return spec.split(" ").map((token, sequence) => drill(token.replace("+", ""), sequence, token.endsWith("+")));
}

function renderEditor(
    plays: PlayInSession[],
    { initialData, ...props }: Partial<PracticeSessionEditorProps> = {},
    duration = 60,
) {
    const onSave = vi.fn<SaveFn>().mockResolvedValue({ success: true });
    render(
        <ThemeProvider theme={createTheme()}>
            <LocalizationProvider dateAdapter={AdapterDateFns}>
                <PracticeSessionEditor
                    teamId={TEAM}
                    initialData={{ title: "Practice", duration, date: START, plays, ...initialData }}
                    onSave={onSave}
                    {...props}
                />
            </LocalizationProvider>
        </ThemeProvider>,
    );
    return { onSave };
}

/** Clicks Save session and returns the saved order in the same "a b+" notation. */
async function savedOrder(onSave: ReturnType<typeof vi.fn<SaveFn>>): Promise<string> {
    await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /^save session/i }));
    });
    const sent = onSave.mock.calls[0][0].plays;
    expect(sent.map((play) => play.sequence)).toEqual(sent.map((_, index) => index));
    return sent.map((play) => `${play.id}${play.runsWithPrevious ? "+" : ""}`).join(" ");
}

describe("PracticeSessionEditor stations (2b)", () => {
    it("offers the station switch on every drill after the first", () => {
        renderEditor(drills("a b c"));
        expect(screen.getAllByLabelText(SWITCH)).toHaveLength(2);
    });

    it("groups toggled drills into one block timed by its longest drill, and saves the flags", async () => {
        const { onSave } = renderEditor(drills("a b c"), {}, 20);
        fireEvent.click(screen.getAllByLabelText(SWITCH)[0]);
        fireEvent.click(screen.getAllByLabelText(SWITCH)[1]);

        expect(screen.getByText("Stations · 3 · 15 min")).toBeInTheDocument();
        // The block is decoration over a flat list: each grouped card is described by its header.
        expect(screen.getByRole("heading", { name: "Drill b" }).closest(".MuiCard-root"))
            .toHaveAccessibleDescription("Stations · 3 · 15 min");
        expect(screen.getByText("Total Play Time: 15 minutes")).toBeInTheDocument();
        expect(screen.queryByText(/exceeds/)).not.toBeInTheDocument();
        expect(await savedOrder(onSave)).toBe("a b+ c+");
    });

    it("disables the switch that would make a fifth station, but not one that leaves the block", () => {
        renderEditor(drills("a b+ c+ d+ e"));
        const switches = screen.getAllByLabelText(SWITCH);
        expect(switches[3]).toBeDisabled(); // e
        expect(switches[2]).toBeEnabled(); // d
    });

    it("keeps the rest of a block together when its first drill is deleted", async () => {
        const { onSave } = renderEditor(drills("x y+ a b+ c+"));
        fireEvent.click(screen.getByRole("button", { name: "Delete play 3" }));
        expect(await savedOrder(onSave)).toBe("x y+ b c+");
    });

    it("moves a standalone drill over a whole block", async () => {
        const { onSave } = renderEditor(drills("s a b+"));
        fireEvent.click(screen.getByRole("button", { name: "Move play 1 down" }));
        expect(await savedOrder(onSave)).toBe("a b+ s");
    });

    it("moves a whole block when its first drill moves", async () => {
        const { onSave } = renderEditor(drills("x a b+"));
        fireEvent.click(screen.getByRole("button", { name: "Move play 2 up" }));
        expect(await savedOrder(onSave)).toBe("a b+ x");
    });

    it("reorders a station within its block, and stops at the block's edge", async () => {
        const { onSave } = renderEditor(drills("a b+ c+ s"));
        expect(screen.getByRole("button", { name: "Move play 3 down" })).toBeDisabled();
        fireEvent.click(screen.getByRole("button", { name: "Move play 3 up" }));
        expect(await savedOrder(onSave)).toBe("a c+ b+ s");
    });
});

describe("PracticeSessionEditor cards keep their identity across regrouping (2b)", () => {
    it("keeps focus on a station switch after toggling it into a block", async () => {
        const user = userEvent.setup();
        renderEditor(drills("a b c"));
        const toggle = screen.getAllByLabelText(SWITCH)[0];

        await user.click(toggle);

        expect(screen.getByText("Stations · 2 · 15 min")).toBeInTheDocument();
        expect(toggle.isConnected).toBe(true);
        expect(document.activeElement).toBe(toggle);
    });

    it("keeps focus on a station switch after toggling it out of a block", async () => {
        const user = userEvent.setup();
        renderEditor(drills("a b+ c"));
        const toggle = screen.getAllByLabelText(SWITCH)[0];

        await user.click(toggle);

        expect(screen.queryByText(/^Stations ·/)).not.toBeInTheDocument();
        expect(document.activeElement).toBe(toggle);
    });

    it("keeps a sibling card's open inline-edit draft when the block's first drill is deleted", async () => {
        const user = userEvent.setup();
        renderEditor(drills("a b+ c+"));
        await user.click(screen.getByRole("button", { name: "Edit play 3" }));
        const instructions = screen.getByLabelText("Instructions");
        await user.type(instructions, "Half-speed reps");

        await user.click(screen.getByRole("button", { name: "Delete play 1" }));

        expect(screen.getByText("Stations · 2 · 15 min")).toBeInTheDocument();
        expect(screen.getByLabelText("Instructions")).toHaveValue("Half-speed reps");
    });

    it("keeps focus on a station's move button when it becomes its block's first drill", async () => {
        const user = userEvent.setup();
        renderEditor(drills("x a b+"));
        const moveUp = screen.getByRole("button", { name: "Move play 3 up" });

        await user.click(moveUp);

        expect(screen.getByRole("button", { name: "Move play 2 up" })).toBe(moveUp);
        expect(document.activeElement).toBe(moveUp);
    });
});

describe("PracticeSessionEditor station warnings (2b)", () => {
    const VENUE = "cvenuexxxxxxxxxxxxxxxxxxx";
    const SURFACE = "csurfacexxxxxxxxxxxxxxxxx";
    const SEGMENT = "csegmentxxxxxxxxxxxxxxxxx";
    const booking: Partial<PracticeSessionEditorProps> = {
        venues: [{ id: VENUE, name: "Test Rink", timezone: "America/New_York" }],
        surfacesByVenue: { [VENUE]: [{ id: SURFACE, name: "Main" }] },
        segmentsBySurface: { [SURFACE]: [{ id: SEGMENT, name: "Half A", kind: "HALF" }] },
    };

    function withArea(play: PlayInSession, area?: IceArea): PlayInSession {
        return { ...play, playData: { ...createEmptyPlayData(), ...(area ? { area } : {}) } };
    }

    it("warns, without blocking the save, when two stations' areas overlap", async () => {
        const [a, b] = drills("a b+");
        const { onSave } = renderEditor([withArea(a, { kind: "half-left" }), withArea(b, { kind: "zone-neutral" })]);

        expect(screen.getByText("Stations 1 and 2 overlap on the ice")).toBeInTheDocument();
        expect(await savedOrder(onSave)).toBe("a b+");
    });

    it("doesn't warn for stations that only share a blue line", () => {
        const [a, b, c] = drills("a b+ c+");
        renderEditor([
            withArea(a, { kind: "zone-left" }),
            withArea(b, { kind: "zone-neutral" }),
            withArea(c, { kind: "zone-right" }),
        ]);
        expect(screen.queryByText(/overlap on the ice/)).not.toBeInTheDocument();
    });

    it("flags a drill larger than the booked half-ice segment", () => {
        const [a, b] = drills("a b");
        renderEditor([withArea(a), withArea(b, { kind: "half-left" })], {
            ...booking,
            initialData: { venueId: VENUE, surfaceId: SURFACE, segmentId: SEGMENT, startAt: START },
        });
        expect(screen.getAllByText("Larger than the booked half ice")).toHaveLength(1);
    });

    it("flags a drill larger than a booked reservation's segment kind", () => {
        const [a, b] = drills("a b");
        renderEditor([withArea(a), withArea(b, { kind: "half-left" })], {
            ...booking,
            reservations: [{
                id: "cresxxxxxxxxxxxxxxxxxxxxx",
                startsAt: START.toISOString(),
                endsAt: new Date(START.getTime() + 60 * 60_000).toISOString(),
                timezone: "America/New_York",
                venueId: VENUE,
                venueName: "Test Rink",
                surfaceId: SURFACE,
                surfaceName: "Main",
                segmentId: SEGMENT,
                segmentName: "Half A",
                segmentKind: "HALF",
                ownerType: "team",
            }],
        });
        expect(screen.queryByText(/Larger than the booked/)).not.toBeInTheDocument();
        fireEvent.mouseDown(screen.getByRole("combobox", { name: /Confirmed reservation/ }));
        fireEvent.click(screen.getByRole("option", { name: /Test Rink/ }));
        expect(screen.getAllByText("Larger than the booked half ice")).toHaveLength(1);
    });

    it("skips a drill whose diagram couldn't be read: no overlap and no fit warning", () => {
        const [a, b] = drills("a b+");
        renderEditor([{ ...withArea(a), playDataUnreadable: true }, withArea(b, { kind: "half-left" })], {
            ...booking,
            initialData: { venueId: VENUE, surfaceId: SURFACE, segmentId: SEGMENT, startAt: START },
        });
        expect(screen.queryByText(/overlap on the ice/)).not.toBeInTheDocument();
        expect(screen.queryByText(/Larger than the booked/)).not.toBeInTheDocument();
    });

    it("flags nothing when the whole surface is booked", () => {
        const [a] = drills("a");
        renderEditor([withArea(a)], {
            ...booking,
            initialData: { venueId: VENUE, surfaceId: SURFACE, startAt: START },
        });
        expect(screen.queryByText(/Larger than the booked/)).not.toBeInTheDocument();
    });
});

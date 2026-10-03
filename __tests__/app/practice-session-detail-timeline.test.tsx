/** Session detail view (3b): timeline, venue-zone header and the bench-sheet link. */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { renderWithPlanner } from "@/__tests__/helpers/planner";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { formatClockTime, formatLongDate } from "@/lib/utils/date";

vi.mock("@/components/features/practice-planner/StationMap", () => ({
    StationMap: () => <div data-testid="station-map" />,
}));

import { SessionDetailView } from "@/app/(dashboard)/practice-planner/[sessionId]/SessionDetailView";

function sessionPlay(name: string, sequence: number, runsWithPrevious: boolean, duration: number) {
    return {
        id: `row-${name}`,
        sequence,
        duration,
        runsWithPrevious,
        instructions: null,
        play: { id: `play-${name}`, name, description: null, thumbnail: null, playData: createEmptyPlayData() },
    };
}

const SESSION = {
    id: "csessionxxxxxxxxxxxxxxxxx",
    title: "Tuesday",
    date: "2026-04-07T22:00:00.000Z",
    duration: 60,
    isShared: false,
    createdByName: "Coach",
    teamId: "cteamxxxxxxxxxxxxxxxxxxxx",
    teamName: "Team",
    venueId: null,
    venueName: null,
    venueTimezone: null,
    surfaceName: null,
    segmentName: null,
    segmentKind: null,
    startAt: null,
    plays: [sessionPlay("Breakout", 0, false, 15), sessionPlay("Regroup", 1, true, 10), sessionPlay("Shooting", 2, false, 10)],
};

const BOOKED = {
    ...SESSION,
    venueId: "cvenuexxxxxxxxxxxxxxxxxxx",
    venueName: "Test Rink",
    venueTimezone: "America/Denver",
    startAt: "2026-04-08T00:00:00.000Z", // 6:00 PM MDT on April 7
};

type SessionProp = React.ComponentProps<typeof SessionDetailView>["session"];

function renderView(session: SessionProp = SESSION) {
    renderWithPlanner(
        <ThemeProvider theme={createTheme()}>
            <SessionDetailView session={session} isAdmin={false} />
        </ThemeProvider>,
    );
}

const timeline = () => screen.getByRole("table", { name: "Session timeline" });

describe("SessionDetailView timeline and print (3b)", () => {
    it("links to the bench sheet in a new tab, for members too", () => {
        renderView();
        const link = screen.getByRole("link", { name: /print bench sheet/i });
        expect(link).toHaveAttribute("href", "/practice-planner/csessionxxxxxxxxxxxxxxxxx/print");
        expect(link).toHaveAttribute("target", "_blank");
        expect(link).toHaveAttribute("rel", "noopener");
    });

    it("offers Export plan to members too (ADR-0020)", () => {
        renderView();
        expect(screen.getByRole("button", { name: "Export plan" })).toBeInTheDocument();
    });

    it("formats a booked session's header and timeline in the venue's zone", () => {
        renderView(BOOKED);
        expect(screen.getByText("Tuesday, April 7, 2026 at 6:00 PM MDT")).toBeInTheDocument();
        expect(within(timeline()).getByText("6:00 PM MDT")).toBeInTheDocument();
        expect(within(timeline()).getByText("6:15 PM MDT")).toBeInTheDocument();
    });

    it("formats an unbooked session in the viewer's zone with no suffix", () => {
        renderView();
        const start = new Date(SESSION.date);
        expect(screen.getByText(`${formatLongDate(start)} at ${formatClockTime(start)}`)).toBeInTheDocument();
    });

    it("falls back to the viewer's zone for a venue zone Intl rejects", () => {
        renderView({ ...BOOKED, venueTimezone: "Not/AZone" });
        const start = new Date(BOOKED.startAt);
        expect(screen.getByText(`${formatLongDate(start)} at ${formatClockTime(start)}`)).toBeInTheDocument();
    });

    it("opens the drill whose name is clicked in the timeline", () => {
        renderView();
        fireEvent.click(within(timeline()).getByRole("button", { name: "Shooting" }));
        expect(screen.getByText("Play 3 of 3")).toBeInTheDocument();
        expect(within(timeline()).getByRole("button", { name: "Shooting" }).closest("tr")).toHaveClass("Mui-selected");
    });

    it("reads a zero-minute session as over time, with a full bar rather than NaN", () => {
        renderView({ ...SESSION, duration: 0 });
        expect(screen.getByText("Planned 25 of 0 min (over time!)")).toBeInTheDocument();
        expect(screen.getByRole("progressbar", { name: "Time allocation" })).toHaveAttribute("aria-valuenow", "100");
    });

    it("shows no timeline for a session with no drills", () => {
        renderView({ ...SESSION, plays: [] });
        expect(screen.queryByRole("table", { name: "Session timeline" })).not.toBeInTheDocument();
    });
});

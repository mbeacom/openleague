/** Session detail view with station blocks (practice planner 2b). */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import type { IceArea } from "@/types/practice-planner";

vi.mock("@/lib/actions/practice-sessions", () => ({ deletePracticeSession: vi.fn(), sharePracticeSession: vi.fn() }));
vi.mock("@/lib/actions/practice-session-drills", () => ({ duplicatePracticeSession: vi.fn() }));
// The map's canvas drawing is tested in StationMap.test.tsx; here, only what it is given.
vi.mock("@/components/features/practice-planner/StationMap", () => ({
    StationMap: ({ stations, activeIndex }: { stations: Array<{ name: string }>; activeIndex: number }) => (
        <div data-testid="station-map">{`${activeIndex}:${stations.map((station) => station.name).join("|")}`}</div>
    ),
}));

import { SessionDetailView } from "@/app/(dashboard)/practice-planner/[sessionId]/SessionDetailView";

function sessionPlay(name: string, sequence: number, runsWithPrevious: boolean, duration: number, area?: IceArea) {
    return {
        id: `row-${name}`,
        sequence,
        duration,
        runsWithPrevious,
        instructions: null,
        play: {
            id: `play-${name}`,
            name,
            description: null,
            thumbnail: null,
            playData: { ...createEmptyPlayData(), ...(area ? { area } : {}) },
        },
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
    venueName: "Test Rink",
    surfaceName: "Main",
    segmentName: "Half A",
    segmentKind: "HALF" as const,
    startAt: null,
    plays: [
        sessionPlay("Breakout", 0, false, 15), // full ice: too big for a half-ice booking
        sessionPlay("Regroup", 1, true, 10, { kind: "zone-left" }),
        sessionPlay("Shooting", 2, false, 10, { kind: "half-right" }),
    ],
};

function renderView() {
    render(
        <ThemeProvider theme={createTheme()}>
            <SessionDetailView session={SESSION} isAdmin={false} />
        </ThemeProvider>,
    );
}

describe("SessionDetailView stations (2b)", () => {
    it("groups stations in the sidebar under one header", () => {
        renderView();
        const block = screen.getByRole("group", { name: "Stations · 2 · 15 min" });

        expect(within(block).getByText("Stations · 2 · 15 min")).toBeInTheDocument();
        expect(within(block).getByText("Breakout")).toBeInTheDocument();
        expect(within(block).getByText("Regroup")).toBeInTheDocument();
        expect(within(block).queryByText("Shooting")).not.toBeInTheDocument();
    });

    it("shows the station map for a grouped drill, highlighting it, while Next steps one drill at a time", () => {
        renderView();
        expect(screen.getByTestId("station-map")).toHaveTextContent("0:Breakout|Regroup");

        fireEvent.click(screen.getByRole("button", { name: "Next play" }));
        expect(screen.getByTestId("station-map")).toHaveTextContent("1:Breakout|Regroup");

        fireEvent.click(screen.getByRole("button", { name: "Next play" }));
        expect(screen.getByText("Play 3 of 3")).toBeInTheDocument();
        expect(screen.queryByTestId("station-map")).not.toBeInTheDocument();
    });

    it("opens a grouped drill from the sidebar with its station highlighted", () => {
        renderView();
        fireEvent.click(within(screen.getByRole("group", { name: "Stations · 2 · 15 min" })).getByText("Regroup"));
        expect(screen.getByTestId("station-map")).toHaveTextContent("1:Breakout|Regroup");
    });

    it("measures time allocation by wall time", () => {
        renderView();
        expect(screen.getByText("25 / 60 min")).toBeInTheDocument();
    });

    it("shows the fit warning next to the booking line", () => {
        renderView();
        expect(screen.getByText("1 drill larger than the booked half ice")).toBeInTheDocument();
    });
});

/** Session detail view with station blocks (practice planner 2b). */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { renderWithPlanner } from "@/__tests__/helpers/planner";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import type { IceArea } from "@/types/practice-planner";

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

type SessionProp = React.ComponentProps<typeof SessionDetailView>["session"];

function renderView(session: SessionProp = SESSION) {
    renderWithPlanner(
        <ThemeProvider theme={createTheme()}>
            <SessionDetailView session={session} isAdmin={false} />
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
        expect(screen.getByText("Planned 25 of 60 min")).toBeInTheDocument();
    });

    it("shows the fit warning next to the booking line", () => {
        renderView();
        expect(screen.getByText("1 drill larger than the booked half ice")).toBeInTheDocument();
    });
});

describe("SessionDetailView sidebar keyboard access", () => {
    /** Tabs forward until `target` has focus, as a keyboard user would. */
    async function tabTo(user: ReturnType<typeof userEvent.setup>, target: HTMLElement) {
        for (let i = 0; i < 40 && document.activeElement !== target; i++) await user.tab();
        expect(document.activeElement).toBe(target);
    }

    it.each([["Enter", "{Enter}"], ["Space", " "]])("selects a sidebar drill with %s", async (_key, keys) => {
        const user = userEvent.setup();
        renderView();
        const shooting = screen.getByRole("button", { name: /^3 Shooting/ });
        expect(screen.getByRole("button", { name: /^1 Breakout/ })).toHaveAttribute("aria-current", "true");
        expect(shooting).not.toHaveAttribute("aria-current");

        await tabTo(user, shooting);
        await user.keyboard(keys);

        expect(screen.getByText("Play 3 of 3")).toBeInTheDocument();
        expect(shooting).toHaveAttribute("aria-current", "true");
        expect(screen.getByRole("button", { name: /^1 Breakout/ })).not.toHaveAttribute("aria-current");
    });
});

describe("SessionDetailView without stations or with unreadable drills (2b)", () => {
    it("leaves a purely sequential session as it was", () => {
        renderView({
            ...SESSION,
            segmentName: null,
            segmentKind: null,
            duration: 60,
            plays: [sessionPlay("One", 0, false, 15), sessionPlay("Two", 1, false, 10), sessionPlay("Three", 2, false, 20)],
        });

        expect(screen.queryByText(/^Stations ·/)).not.toBeInTheDocument();
        expect(screen.queryByRole("group", { name: /^Stations/ })).not.toBeInTheDocument();
        expect(screen.queryByTestId("station-map")).not.toBeInTheDocument();
        expect(screen.queryByText(/larger than the booked/)).not.toBeInTheDocument();
        expect(screen.getByText("Planned 45 of 60 min")).toBeInTheDocument();
    });

    it("still renders a block with an unreadable drill, and skips it in the fit warning", () => {
        const lost = sessionPlay("Lost", 1, true, 10);
        const unreadable = { ...lost, play: { ...lost.play, playData: null } };
        renderView({
            ...SESSION,
            plays: [sessionPlay("Breakout", 0, false, 15, { kind: "zone-left" }), unreadable],
        });

        expect(screen.getByRole("group", { name: "Stations · 2 · 15 min" })).toBeInTheDocument();
        expect(screen.getByTestId("station-map")).toHaveTextContent("0:Breakout|Lost");
        expect(screen.queryByText(/larger than the booked/)).not.toBeInTheDocument();
    });
});

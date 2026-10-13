/** Session detail: the drill viewer plays an animated drill in place, and moving to another drill stops it. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { renderWithPlanner } from "@/__tests__/helpers/planner";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import type { PlayData, PracticeSessionView } from "@/types/practice-planner";

vi.mock("@/components/features/practice-planner/StationMap", () => ({ StationMap: () => null }));

import { SessionDetailView } from "@/app/(dashboard)/practice-planner/[sessionId]/SessionDetailView";

const ANIMATED: PlayData = {
    ...createEmptyPlayData(),
    players: [{ id: "p1", role: "F", label: "F1", position: { x: 20, y: 20 }, color: "#1976D2" }],
    drawings: [{ id: "s1", action: "skate", path: "straight", end: "arrow", points: [{ x: 24, y: 20 }, { x: 80, y: 20 }], color: "#212121", strokeWidth: 3 }],
};

const drill = (id: string, name: string, sequence: number, playData: PlayData) => ({
    id, sequence, duration: 10, runsWithPrevious: false, instructions: null,
    play: { id: `play-${id}`, name, description: null, thumbnail: null, playData },
});

const SESSION: PracticeSessionView = {
    id: "csessionxxxxxxxxxxxxxxxxx", title: "Tuesday", date: "2026-04-07T22:00:00.000Z", duration: 60, isShared: false,
    createdByName: "Coach", teamId: "cteamxxxxxxxxxxxxxxxxxxxx", teamName: "Team", startAt: null,
    roster: null,
    equipment: [],
    plays: [drill("row-a", "Breakout", 0, ANIMATED), drill("row-b", "Shooting", 1, ANIMATED), drill("row-c", "Stretch", 2, createEmptyPlayData())],
};

function renderView() {
    renderWithPlanner(
        <ThemeProvider theme={createTheme()}>
            <SessionDetailView session={SESSION} isAdmin={false} />
        </ThemeProvider>,
    );
    return screen.getByRole("region", { name: "Drill viewer" });
}

describe("SessionDetailView drill playback", () => {
    beforeEach(() => {
        vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
        vi.stubGlobal("cancelAnimationFrame", vi.fn());
    });
    afterEach(() => vi.unstubAllGlobals());

    it("swaps the active drill's diagram for the playback board on Play, and back, with focus following", () => {
        const viewer = renderView();
        fireEvent.click(within(viewer).getByRole("button", { name: "Play the Breakout animation" }));
        expect(within(viewer).getByRole("group", { name: /Breakout playback/ })).toHaveFocus();
        expect(within(viewer).getAllByRole("img", { name: "Breakout diagram" })).toHaveLength(1);

        fireEvent.click(within(viewer).getByRole("button", { name: "Close playback" }));
        expect(within(viewer).queryByRole("group", { name: /playback/ })).not.toBeInTheDocument();
        expect(within(viewer).getByRole("button", { name: "Play the Breakout animation" })).toHaveFocus();
    });

    it("returns to the still diagram when moving to the next drill", () => {
        const viewer = renderView();
        fireEvent.click(within(viewer).getByRole("button", { name: "Play the Breakout animation" }));
        fireEvent.click(within(viewer).getByRole("button", { name: "Next play" }));
        expect(within(viewer).queryByRole("group", { name: /playback/ })).not.toBeInTheDocument();
        expect(within(viewer).getByRole("button", { name: "Play the Shooting animation" })).not.toHaveFocus();
    });

    it("offers no Play on a drill with nothing to animate", () => {
        const viewer = renderView();
        fireEvent.click(within(viewer).getByRole("button", { name: "Next play" }));
        fireEvent.click(within(viewer).getByRole("button", { name: "Next play" }));
        expect(within(viewer).getByRole("img", { name: "Stretch diagram" })).toBeInTheDocument();
        expect(within(viewer).queryByRole("button", { name: /^Play the/ })).not.toBeInTheDocument();
    });
});

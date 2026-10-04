/** Session detail (spec R9): block rows on the timeline only; the sequence, the viewer and the counts are drills. */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { renderWithPlanner } from "@/__tests__/helpers/planner";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import type { PracticeSessionView } from "@/types/practice-planner";

vi.mock("@/lib/utils/canvas/thumbnail-generator", () => ({ generateThumbnail: () => "data:image/png;base64,LIVE" }));
vi.mock("@/components/features/practice-planner/StationMap", () => ({ StationMap: () => null }));
vi.mock("@/components/features/practice-planner/PlayLegend", () => ({ PlayLegend: () => null, LegendSwatch: () => null }));

import { SessionDetailView } from "@/app/(dashboard)/practice-planner/[sessionId]/SessionDetailView";

const drill = (id: string, name: string, sequence: number) => ({
    id, sequence, duration: 10, runsWithPrevious: false, instructions: null,
    play: { id: `play-${id}`, name, description: null, thumbnail: null, playData: createEmptyPlayData() },
});

const SESSION: PracticeSessionView = {
    id: "csessionxxxxxxxxxxxxxxxxx", title: "Tuesday", date: "2026-04-07T22:00:00.000Z", duration: 60, isShared: false,
    createdByName: "Coach", teamId: "cteamxxxxxxxxxxxxxxxxxxxx", teamName: "Team", startAt: null, transitionMinutes: 2,
    plays: [
        { id: "row-w", kind: "warmup", label: null, sequence: 0, duration: 8, instructions: "Easy laps", runsWithPrevious: false },
        drill("row-a", "Breakout", 1),
        { id: "row-b", kind: "break", label: "Water", sequence: 2, duration: 2, instructions: null, runsWithPrevious: false },
        drill("row-c", "Shooting", 3),
    ],
};

function renderView() {
    renderWithPlanner(
        <ThemeProvider theme={createTheme()}>
            <SessionDetailView session={SESSION} isAdmin={false} />
        </ThemeProvider>,
    );
}

describe("SessionDetailView: block rows", () => {
    it("counts and pages through drills only, starting on the first drill", () => {
        renderView();
        expect(screen.getByText("2 plays")).toBeInTheDocument();
        expect(screen.getByText("Play 1 of 2")).toBeInTheDocument();
        expect(screen.getByRole("heading", { level: 5, name: "Breakout" })).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Next play" }));
        expect(screen.getByRole("heading", { level: 5, name: "Shooting" })).toBeInTheDocument();
    });

    it("lists blocks on the timeline, with the gap folded into the next start, and not in the play sequence", () => {
        renderView();
        const timeline = screen.getByRole("table", { name: "Session timeline" });
        expect(within(timeline).getByText("Warm-up")).toBeInTheDocument();
        expect(within(timeline).getByText("Water")).toBeInTheDocument();
        expect(screen.getAllByText("Warm-up")).toHaveLength(1);
        // 8 + 2 + 10 + 2 + 2 + 2 + 10 = 36
        expect(screen.getByText("Planned 36 of 60 min")).toBeInTheDocument();
    });

    it("selects a drill from the timeline by its place among the drills", () => {
        renderView();
        fireEvent.click(within(screen.getByRole("table", { name: "Session timeline" })).getByRole("button", { name: "Shooting" }));
        expect(screen.getByText("Play 2 of 2")).toBeInTheDocument();
    });
});

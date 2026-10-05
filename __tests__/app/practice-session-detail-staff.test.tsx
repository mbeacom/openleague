/** Session detail (practice staff, spec R9): names on the timeline and a "Run by" line on the sidebar cards. */
import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { renderWithPlanner } from "@/__tests__/helpers/planner";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import type { PracticeSessionView } from "@/types/practice-planner";

vi.mock("@/lib/utils/canvas/thumbnail-generator", () => ({ generateThumbnail: () => "data:image/png;base64,LIVE" }));
vi.mock("@/components/features/practice-planner/StationMap", () => ({ StationMap: () => null }));
vi.mock("@/components/features/practice-planner/PlayLegend", () => ({ PlayLegend: () => null, LegendSwatch: () => null }));

import { SessionDetailView } from "@/app/(dashboard)/practice-planner/[sessionId]/SessionDetailView";

const drill = (id: string, name: string, sequence: number, staff?: string[]) => ({
    id, sequence, duration: 10, runsWithPrevious: false, instructions: null, ...(staff && { staff }),
    play: { id: `play-${id}`, name, description: null, thumbnail: null, playData: createEmptyPlayData() },
});

const SESSION: PracticeSessionView = {
    id: "csessionxxxxxxxxxxxxxxxxx", title: "Tuesday", date: "2026-04-07T22:00:00.000Z", duration: 60, isShared: false,
    createdByName: "Coach", teamId: "cteamxxxxxxxxxxxxxxxxxxxx", teamName: "Team", startAt: null, transitionMinutes: 0,
    staff: [{ id: "s1", name: "Coach Lee" }, { id: "s2", name: "Sam" }],
    plays: [
        { id: "row-w", kind: "warmup", label: null, sequence: 0, duration: 8, instructions: null, runsWithPrevious: false, staff: ["s2"] },
        drill("row-a", "Breakout", 1, ["s1", "s2"]),
        drill("row-c", "Shooting", 2),
    ],
};

describe("SessionDetailView: practice staff", () => {
    it("names who runs each row on the timeline, and on each drill's sidebar card", () => {
        renderWithPlanner(
            <ThemeProvider theme={createTheme()}>
                <SessionDetailView session={SESSION} isAdmin={false} />
            </ThemeProvider>,
        );
        const timeline = screen.getByRole("table", { name: "Session timeline" });
        expect(within(timeline).getByText("· run by Sam")).toBeInTheDocument();
        expect(within(timeline).getByText("· run by Coach Lee, Sam")).toBeInTheDocument();
        expect(screen.getByText("Run by Coach Lee, Sam")).toBeInTheDocument();
        // The warm-up has no sidebar card, and Shooting has nobody.
        expect(screen.getAllByText(/^Run by /)).toHaveLength(1);
    });
});

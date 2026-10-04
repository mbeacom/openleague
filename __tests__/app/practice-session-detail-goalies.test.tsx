/** Session detail (spec R6, R7): goalie messages, and goalie markers hidden at render time only. */
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { renderWithPlanner } from "@/__tests__/helpers/planner";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import type { PlayData, PlayGoalies } from "@/types/practice-planner";

const seen = vi.hoisted(() => ({ legends: [] as PlayData[], diagrams: [] as PlayData[] }));
vi.mock("@/components/features/practice-planner/PlayLegend", () => ({
    PlayLegend: ({ playData }: { playData: PlayData | null }) => {
        if (playData) seen.legends.push(playData);
        return null;
    },
    LegendSwatch: () => null,
}));
vi.mock("@/components/features/practice-planner/print/PrintDiagram", () => ({
    PrintDiagram: ({ playData }: { playData: PlayData | null }) => {
        if (playData) seen.diagrams.push(playData);
        return <div data-testid="live-diagram" />;
    },
    PRINT_DIAGRAM_SIZE: { width: 720, height: 306, pixelRatio: 3 },
    printPixelRatio: () => 3,
    DIAGRAM_UNAVAILABLE: "Diagram unavailable",
}));

import { SessionDetailView } from "@/app/(dashboard)/practice-planner/[sessionId]/SessionDetailView";

const G_BOARD: PlayData = {
    ...createEmptyPlayData(),
    players: [
        { id: "g", role: "G", label: "G", position: { x: 14, y: 42.5 }, color: "#212121" },
        { id: "f", role: "F", label: "F1", position: { x: 40, y: 42.5 }, color: "#1976D2" },
    ],
};

function session(goaliesAttending: number | null, goalies: PlayGoalies) {
    return {
        id: "csessionxxxxxxxxxxxxxxxxx", title: "Tuesday", date: "2026-04-07T22:00:00.000Z", duration: 60, isShared: false,
        createdByName: "Coach", teamId: "cteamxxxxxxxxxxxxxxxxxxxx", teamName: "Team", startAt: null, goaliesAttending,
        plays: [{
            id: "row-a", sequence: 0, duration: 10, runsWithPrevious: false, instructions: null,
            play: { id: "play-a", name: "D-Zone", description: null, thumbnail: "data:image/png;base64,AA==", playData: G_BOARD, goalies },
        }],
    };
}

function renderView(s: ReturnType<typeof session>) {
    seen.legends.length = 0;
    seen.diagrams.length = 0;
    renderWithPlanner(
        <ThemeProvider theme={createTheme()}>
            <SessionDetailView session={s} isAdmin={false} />
        </ThemeProvider>,
    );
}

describe("SessionDetailView goalies", () => {
    it("draws an optional-goalie drill without its goalie when none attend, from a live diagram", () => {
        renderView(session(0, "optional"));
        expect(screen.getByTestId("live-diagram")).toBeInTheDocument();
        expect(seen.diagrams.at(-1)?.players.map((p) => p.role)).toEqual(["F"]);
        expect(seen.legends.at(-1)?.players.map((p) => p.role)).toEqual(["F"]);
    });

    it("keeps the stored thumbnail and every marker otherwise", () => {
        renderView(session(1, "optional"));
        expect(screen.queryByTestId("live-diagram")).toBeNull();
        expect(seen.legends.at(-1)?.players.map((p) => p.role)).toEqual(["G", "F"]);
    });

    it("keeps the goalie on a drill that needs one, and says a goalie is missing", () => {
        renderView(session(0, "required"));
        expect(seen.legends.at(-1)?.players.map((p) => p.role)).toEqual(["G", "F"]);
        expect(screen.getByText("1 drill or station block needs a goalie, but none are attending")).toBeInTheDocument();
        expect(screen.getByText("Goalies: 0")).toBeInTheDocument();
    });

    it("says nothing about goalies when the count is not set", () => {
        renderView(session(null, "required"));
        expect(screen.queryByText(/goalie/i)).toBeNull();
    });
});

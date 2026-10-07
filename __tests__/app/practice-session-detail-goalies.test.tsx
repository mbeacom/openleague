/** Session detail (spec R6, R7): goalie messages, and goalie markers hidden at render time only. */
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { renderWithPlanner } from "@/__tests__/helpers/planner";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import type { PlayData, PlayGoalies } from "@/types/practice-planner";

const seen = vi.hoisted(() => ({ legends: [] as PlayData[], diagrams: [] as PlayData[], stations: [] as Array<Array<{ playData: PlayData | null }>> }));
vi.mock("@/components/features/practice-planner/PlayDiagram", () => ({
    PlayDiagram: ({ playData, label, decorative }: { playData: PlayData; label: string; decorative?: boolean }) => {
        seen.diagrams.push(playData);
        const roles = playData.players.map((p) => p.role).join(",");
        return decorative
            ? <div aria-hidden data-diagram={label} data-roles={roles} />
            : <div role="img" aria-label={`${label} diagram`} data-diagram={label} data-roles={roles} />;
    },
}));
vi.mock("@/components/features/practice-planner/StationMap", () => ({
    StationMap: ({ stations }: { stations: Array<{ playData: PlayData | null }> }) => {
        seen.stations.push(stations);
        return null;
    },
}));
vi.mock("@/components/features/practice-planner/PlayLegend", () => ({
    PlayLegend: ({ playData }: { playData: PlayData | null }) => {
        if (playData) seen.legends.push(playData);
        return null;
    },
    LegendSwatch: () => null,
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
    seen.stations.length = 0;
    renderWithPlanner(
        <ThemeProvider theme={createTheme()}>
            <SessionDetailView session={s} isAdmin={false} />
        </ThemeProvider>,
    );
}

/** The drill diagram in the sidebar's play sequence (not the main preview); decorative, so found by attribute. */
function sidebarDiagram() {
    const sequence = screen.getByText("Play Sequence").parentElement as HTMLElement;
    const diagram = sequence.querySelector('[data-diagram="D-Zone"]');
    expect(diagram).toHaveAttribute("aria-hidden");
    return diagram as HTMLElement;
}

/** The marker roles each drawn diagram shows (preview and sidebar). */
const drawnRoles = () => Array.from(document.querySelectorAll('[data-diagram="D-Zone"]')).map((el) => el.getAttribute("data-roles"));

describe("SessionDetailView goalies", () => {
    it("draws an optional-goalie drill without its goalie when none attend, in the preview and the sidebar", () => {
        renderView(session(0, "optional"));
        expect(drawnRoles()).toEqual(["F", "F"]);
        expect(seen.legends.at(-1)?.players.map((p) => p.role)).toEqual(["F"]);
    });

    it("draws every marker otherwise", () => {
        renderView(session(1, "optional"));
        expect(drawnRoles()).toEqual(["G,F", "G,F"]);
        expect(seen.legends.at(-1)?.players.map((p) => p.role)).toEqual(["G", "F"]);
    });

    it("keeps the goalie on a drill that needs one, and says a goalie is missing", () => {
        renderView(session(0, "required"));
        expect(seen.legends.at(-1)?.players.map((p) => p.role)).toEqual(["G", "F"]);
        expect(screen.getByText("1 drill or station block needs a goalie, but none are attending")).toBeInTheDocument();
        expect(screen.getByText("Goalies: 0")).toBeInTheDocument();
    });

    it("passes the drawn diagrams (goalie hidden) to the station map", () => {
        const base = session(0, "optional");
        const second = { ...base.plays[0], id: "row-b", sequence: 1, runsWithPrevious: true, play: { ...base.plays[0].play, id: "play-b", name: "Low Cycle" } };
        renderView({ ...base, plays: [base.plays[0], second] });
        const stations = seen.stations.at(-1) ?? [];
        expect(stations.map((st) => st.playData?.players.map((p) => p.role))).toEqual([["F"], ["F"]]);
        expect(G_BOARD.players).toHaveLength(2);
    });

    it("draws the sidebar diagram live, without the goalie, when it is hidden", () => {
        renderView(session(0, "optional"));
        expect(sidebarDiagram()).toHaveAttribute("data-roles", "F");
    });

    it("draws the sidebar diagram with the goalie when goalies attend", () => {
        renderView(session(1, "optional"));
        expect(sidebarDiagram()).toHaveAttribute("data-roles", "G,F");
    });

    it("says nothing about goalies when the count is not set", () => {
        renderView(session(null, "required"));
        expect(screen.queryByText(/goalie/i)).toBeNull();
    });
});

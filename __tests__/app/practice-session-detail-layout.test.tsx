/** Session detail layout: the timeline as a sticky drill navigator beside the viewer; roster and equipment collapsed. */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { renderWithPlanner } from "@/__tests__/helpers/planner";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import type { PracticeSessionView } from "@/types/practice-planner";

vi.mock("@/components/features/practice-planner/StationMap", () => ({ StationMap: () => null }));

import { SessionDetailView } from "@/app/(dashboard)/practice-planner/[sessionId]/SessionDetailView";

const drill = (id: string, name: string, sequence: number) => ({
    id, sequence, duration: 10, runsWithPrevious: false, instructions: null,
    play: { id: `play-${id}`, name, description: null, thumbnail: null, playData: createEmptyPlayData() },
});

const SESSION: PracticeSessionView = {
    id: "csessionxxxxxxxxxxxxxxxxx", title: "Tuesday", date: "2026-04-07T22:00:00.000Z", duration: 60, isShared: false,
    createdByName: "Coach", teamId: "cteamxxxxxxxxxxxxxxxxxxxx", teamName: "Team", startAt: null,
    roster: {
        ageGroup: null,
        roles: ["S", "G"],
        players: [
            { key: "r1", name: "Riley Fenwick", number: "4", role: "S", playerId: null },
            { key: "r2", name: "Morgan Ashby", number: "30", role: "G", playerId: null },
        ],
    },
    equipment: [{ name: "Pucks", count: 20 }],
    plays: [drill("row-a", "Breakout", 0), drill("row-b", "Shooting", 1)],
};

function renderView(session: PracticeSessionView = SESSION) {
    renderWithPlanner(
        <ThemeProvider theme={createTheme()}>
            <SessionDetailView session={session} isAdmin={false} />
        </ThemeProvider>,
    );
}

/** The CSS Emotion generated for an element's classes. */
function cssFor(element: HTMLElement): string {
    const sheets = Array.from(document.querySelectorAll("style")).map((style) => style.textContent ?? "").join("\n");
    return Array.from(element.classList)
        .filter((name) => name.startsWith("css-"))
        .map((name) => sheets.split("}").filter((rule) => rule.includes(`.${name}`)).join("}"))
        .join("\n");
}

const plan = () => screen.getByRole("complementary", { name: "Session plan" });

describe("SessionDetailView layout", () => {
    it("navigates drills from the timeline in the plan column; there is no separate play sequence", () => {
        renderView();
        expect(within(plan()).getByRole("table", { name: "Session timeline" })).toBeInTheDocument();
        expect(screen.queryByText("Play Sequence")).not.toBeInTheDocument();

        fireEvent.click(within(plan()).getByRole("button", { name: "Shooting" }));
        const viewer = screen.getByRole("region", { name: "Drill viewer" });
        expect(within(viewer).getByRole("heading", { level: 5, name: "Shooting" })).toBeInTheDocument();
    });

    it("keeps the plan column sticky, with its own scroll, once the page is wide", () => {
        renderView();
        const css = cssFor(plan());
        expect(css).toMatch(/@container \(min-width: ?760px\)/);
        expect(css).toMatch(/position: ?sticky/);
        expect(css).toMatch(/overflow-y: ?auto/);
    });

    it("draws the viewer's diagram at the board's shape across its width, not at a fixed height", () => {
        renderView();
        const canvas = within(screen.getByRole("region", { name: "Drill viewer" })).getByRole("img", { name: "Breakout diagram" });
        const css = cssFor(canvas.parentElement as HTMLElement);
        expect(css).toMatch(/width: ?100%/);
        expect(css).toMatch(/aspect-ratio/);
        expect(css).not.toMatch(/height: ?100%/);
    });

    it("collapses the roster and the equipment in the plan column, each with a one-line summary", () => {
        renderView();
        const roster = within(plan()).getByRole("region", { name: "Roster" });
        const equipment = within(plan()).getByRole("region", { name: "Practice equipment" });
        expect(within(roster).getByRole("button", { expanded: false })).toHaveTextContent("1 skater · 1 goalie");
        expect(within(equipment).getByRole("button", { expanded: false })).toHaveTextContent("1 item");

        fireEvent.click(within(roster).getByRole("button", { expanded: false }));
        expect(within(roster).getByRole("button", { expanded: true })).toBeInTheDocument();
        expect(within(roster).getByText(/Riley Fenwick/)).toBeVisible();
    });

    it("uses one column, with the empty state, for a session with no rows", () => {
        renderView({ ...SESSION, plays: [] });
        expect(screen.queryByRole("table", { name: "Session timeline" })).not.toBeInTheDocument();
        expect(cssFor(plan())).not.toMatch(/position: ?sticky/);
        expect(screen.getByText("No plays in this session")).toBeInTheDocument();
    });
});

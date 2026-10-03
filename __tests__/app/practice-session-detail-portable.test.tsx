/** SessionDetailView on the static app's shape: hash routes, and no team sharing (ADR-0020). */
import { describe, expect, it } from "vitest";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { createHashPlatform, createMockPlannerStore, renderWithPlanner, type MockPlannerStore } from "@/__tests__/helpers/planner";
import { SessionDetailView } from "@/app/(dashboard)/practice-planner/[sessionId]/SessionDetailView";

const ID = "csessionxxxxxxxxxxxxxxxxx";
const SESSION = {
    id: ID,
    title: "Tuesday",
    date: "2026-04-07T22:00:00.000Z",
    duration: 60,
    isShared: false,
    createdByName: "Coach",
    teamId: "cteamxxxxxxxxxxxxxxxxxxxx",
    teamName: "Team",
    plays: [
        {
            id: "row-1",
            sequence: 0,
            duration: 10,
            runsWithPrevious: false,
            instructions: null,
            play: { id: "play-1", name: "Breakout", description: null, thumbnail: "data:image/png;base64,AA==", playData: createEmptyPlayData() },
        },
    ],
};

function renderPortable(store: MockPlannerStore) {
    const platform = createHashPlatform();
    renderWithPlanner(
        <ThemeProvider theme={createTheme()}>
            <SessionDetailView session={SESSION} isAdmin />
        </ThemeProvider>,
        { store, platform },
    );
    return platform;
}

function storeWithoutSharing(): MockPlannerStore {
    const store = createMockPlannerStore();
    delete store.sharePracticeSession;
    return store;
}

describe("SessionDetailView on a portable platform", () => {
    it("hides Share when the store has no team sharing, and keeps the other admin actions", () => {
        renderPortable(storeWithoutSharing());
        expect(screen.queryByRole("button", { name: /share/i })).toBeNull();
        expect(screen.getByRole("button", { name: "Duplicate" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    });

    it("shows Share when the store has it", () => {
        renderPortable(createMockPlannerStore());
        expect(screen.getByRole("button", { name: /share/i })).toBeInTheDocument();
    });

    it("links with the platform's routes", () => {
        renderPortable(storeWithoutSharing());
        expect(screen.getByRole("link", { name: "Practice Planner" })).toHaveAttribute("href", "#/");
        expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute("href", `#/sessions/${ID}/edit`);
        expect(screen.getByRole("link", { name: "Print bench sheet" })).toHaveAttribute("href", `#/sessions/${ID}/print`);
    });

    it("deletes through the store, then navigates to the list route", async () => {
        const store = storeWithoutSharing();
        store.deletePracticeSession.mockResolvedValue({ success: true, data: { id: ID } });
        const platform = renderPortable(store);
        fireEvent.click(screen.getByRole("button", { name: "Delete" }));
        const dialog = screen.getByRole("dialog", { name: "Delete Practice Session?" });
        await act(async () => {
            fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
        });
        expect(store.deletePracticeSession).toHaveBeenCalledWith({ id: ID, teamId: SESSION.teamId });
        expect(platform.navigate).toHaveBeenCalledWith("#/");
    });

    it("draws the active drill with the platform's Image", () => {
        renderPortable(storeWithoutSharing());
        expect(screen.getByRole("img", { name: "Breakout" })).toHaveAttribute("data-fit", "contain");
    });
});

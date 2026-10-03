/** PlayLibrary on a non-hosted platform: the static app's shape (ADR-0020). */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { createHashPlatform, createMockPlannerStore, renderWithPlanner } from "@/__tests__/helpers/planner";

vi.mock("@/lib/utils/canvas/thumbnail-generator", () => ({ generateThumbnail: () => "data:image/png;base64,AA==" }));

import { PlayLibrary } from "@/components/features/practice-planner/PlayLibrary";

const TEAM = "cteamxxxxxxxxxxxxxxxxxxxx";
const PLAY_ID = "cplayxxxxxxxxxxxxxxxxxxxx";
const PLAY = {
    id: PLAY_ID,
    name: "Saturday Skate",
    description: null,
    thumbnail: "data:image/png;base64,AA==",
    isTemplate: true,
    createdAt: new Date("2026-04-01T00:00:00Z"),
    updatedAt: new Date("2026-04-01T00:00:00Z"),
};

function renderLibrary() {
    const store = createMockPlannerStore();
    store.getPlaysByTeam.mockResolvedValue({ success: true, data: { plays: [PLAY], total: 1, page: 1, limit: 20 } });
    const platform = createHashPlatform();
    renderWithPlanner(
        <ThemeProvider theme={createTheme()}>
            <PlayLibrary teamId={TEAM} mode="manage" />
        </ThemeProvider>,
        { store, platform },
    );
    return { store, platform };
}

describe("PlayLibrary on a portable platform", () => {
    it("reads the library from the store", async () => {
        const { store } = renderLibrary();
        expect(await screen.findByText("Saturday Skate")).toBeInTheDocument();
        expect(store.getPlaysByTeam).toHaveBeenCalledWith({
            teamId: TEAM,
            isTemplate: true,
            page: 1,
            limit: 20,
            search: undefined,
            dateFilter: "all",
        });
    });

    it("navigates with the platform's routes", async () => {
        const { platform } = renderLibrary();
        fireEvent.click(await screen.findByRole("button", { name: "Edit Saturday Skate" }));
        expect(platform.navigate).toHaveBeenCalledWith(`#/library/${PLAY_ID}/edit`);
        fireEvent.click(screen.getByRole("button", { name: "New Play" }));
        expect(platform.navigate).toHaveBeenCalledWith("#/library/new");
    });

    it("draws thumbnails with the platform's Image", async () => {
        renderLibrary();
        expect(await screen.findByRole("img", { name: "Saturday Skate" })).toHaveAttribute("data-fit", "contain");
    });
});

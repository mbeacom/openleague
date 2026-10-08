/** A library card's primary click opens the drill's details; the drill picker keeps selecting. */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { createHashPlatform, createMockPlannerStore, renderWithPlanner } from "@/__tests__/helpers/planner";
import { createEmptyPlayData } from "@/lib/utils/play-data";

vi.mock("@/lib/utils/canvas/thumbnail-generator", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/utils/canvas/thumbnail-generator")>()), generateThumbnail: () => "data:image/png;base64,AA==" }));

import { PlayLibrary } from "@/components/features/practice-planner/PlayLibrary";

const TEAM = "cteamxxxxxxxxxxxxxxxxxxxx";
const PLAY_ID = "cplayxxxxxxxxxxxxxxxxxxxx";
const PLAY = {
    id: PLAY_ID,
    name: "Lakeview Regroup",
    description: "Regroup through the neutral zone",
    thumbnail: "data:image/png;base64,AA==",
    isTemplate: true,
    createdAt: new Date("2026-04-01T00:00:00Z"),
    updatedAt: new Date("2026-04-01T00:00:00Z"),
};

function renderLibrary(mode: "select" | "manage", onSelectPlay = vi.fn()) {
    const store = createMockPlannerStore();
    store.getPlaysByTeam.mockResolvedValue({ success: true, data: { plays: [PLAY], total: 1, page: 1, limit: 20 } });
    store.getPlayById.mockResolvedValue({ success: true, data: { ...PLAY, playData: createEmptyPlayData() } });
    const platform = createHashPlatform();
    renderWithPlanner(
        <ThemeProvider theme={createTheme()}>
            <PlayLibrary teamId={TEAM} mode={mode} onSelectPlay={onSelectPlay} />
        </ThemeProvider>,
        { store, platform },
    );
    return { store, platform, onSelectPlay };
}

describe("PlayLibrary card's primary click", () => {
    it("opens the drill's details in manage mode, with Edit and Delete still on the card", async () => {
        renderLibrary("manage");
        const heading = await screen.findByRole("heading", { name: "Lakeview Regroup" });
        const link = heading.closest("a");
        expect(link).toHaveAttribute("href", `#/library/${PLAY_ID}`);
        // The secondary actions sit outside the link.
        const edit = screen.getByRole("button", { name: "Edit Lakeview Regroup" });
        expect(link?.contains(edit)).toBe(false);
        expect(screen.getByRole("button", { name: "Delete Lakeview Regroup" })).toBeInTheDocument();
    });

    it("still picks the drill in select mode, with no details link", async () => {
        const { onSelectPlay } = renderLibrary("select");
        const heading = await screen.findByRole("heading", { name: "Lakeview Regroup" });
        expect(heading.closest("a")).toBeNull();
        fireEvent.click(heading);
        await waitFor(() => expect(onSelectPlay).toHaveBeenCalledWith(expect.objectContaining({ id: PLAY_ID })));
        expect(within(document.body).queryByRole("link", { name: /Lakeview Regroup/ })).toBeNull();
    });
});

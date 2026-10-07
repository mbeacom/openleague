/** Adding a starter stores its thumbnail at the stored 2×, whatever the screen's ratio (rink diagram quality spec §1). */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { createHashPlatform, createMockPlannerStore, renderWithPlanner } from "@/__tests__/helpers/planner";

vi.mock("@/lib/utils/canvas/thumbnail-generator", () => ({
    generateThumbnail: (_: unknown, options?: { pixelRatio?: number }) => `data:image/png;base64,RATIO${options?.pixelRatio ?? 1}`,
}));

import { PlayLibrary } from "@/components/features/practice-planner/PlayLibrary";

const TEAM = "cteamxxxxxxxxxxxxxxxxxxxx";
const setDpr = (value: number) => Object.defineProperty(window, "devicePixelRatio", { value, configurable: true });

describe("PlayLibrary starter thumbnails", () => {
    afterEach(() => setDpr(1));

    it.each([1, 3])("stores an added starter's thumbnail at 2× on a %i× screen", async (dpr) => {
        setDpr(dpr);
        const store = createMockPlannerStore();
        store.getPlaysByTeam.mockResolvedValue({ success: true, data: { plays: [], total: 0, page: 1, limit: 20 } });
        store.createPlay.mockResolvedValue({ success: true, data: { id: "cplayxxxxxxxxxxxxxxxxxxxx" } });
        renderWithPlanner(
            <ThemeProvider theme={createTheme()}>
                <PlayLibrary teamId={TEAM} mode="manage" />
            </ThemeProvider>,
            { store, platform: createHashPlatform() },
        );
        fireEvent.click((await screen.findAllByRole("button", { name: "Add to my library" }))[0]);
        await waitFor(() => expect(store.createPlay).toHaveBeenCalledTimes(1));
        expect(store.createPlay.mock.calls[0][0]).toMatchObject({ thumbnail: "data:image/png;base64,RATIO2" });
    });
});

import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { createHashPlatform, createMockPlannerStore, renderWithPlanner } from "@/__tests__/helpers/planner";

vi.mock("@/lib/utils/canvas/thumbnail-generator", () => ({ generateThumbnail: () => "data:image/png;base64,AA==" }));

import { PlayLibrary } from "@/components/features/practice-planner/PlayLibrary";

const TEAM = "cteamxxxxxxxxxxxxxxxxxxxx";
const AT = new Date("2026-04-01T00:00:00Z");
const summary = (id: string, name: string, extra: Record<string, unknown> = {}) =>
    ({ id, name, description: null, thumbnail: null, isTemplate: true, createdAt: AT, updatedAt: AT, ...extra });
const WARM_UP = summary("cplay1xxxxxxxxxxxxxxxxxxx", "My Warm-up", { focus: "goalies", goalies: "required" });
const WEAVE = summary("cplay2xxxxxxxxxxxxxxxxxxx", "My Weave", { focus: "skaters", goalies: "optional" });

function renderLibrary(plays: unknown[] = [WARM_UP, WEAVE], total = plays.length, mode: "manage" | "select" = "manage") {
    const store = createMockPlannerStore();
    store.getPlaysByTeam.mockResolvedValue({ success: true, data: { plays, total, page: 1, limit: 20 } });
    const onSelectPlay = vi.fn();
    renderWithPlanner(
        <ThemeProvider theme={createTheme()}>
            <PlayLibrary teamId={TEAM} mode={mode} onSelectPlay={onSelectPlay} />
        </ThemeProvider>,
        { store, platform: createHashPlatform() },
    );
    return { store, onSelectPlay };
}

const cardOf = (text: string) => screen.getByText(text).closest(".MuiCard-root") as HTMLElement;
const focusChip = (name: string) => within(screen.getByRole("group", { name: "Focus" })).getByRole("button", { name });
const goaliesChip = (name: string) => within(screen.getByRole("group", { name: "Goalies" })).getByRole("button", { name });

describe("PlayLibrary drill tags", () => {
    it("badges library drills that need a goalie", async () => {
        renderLibrary();
        await screen.findByText("My Warm-up");
        expect(within(cardOf("My Warm-up")).getByRole("img", { name: "Needs a goalie" })).toBeInTheDocument();
        expect(within(cardOf("My Weave")).queryByRole("img", { name: "Needs a goalie" })).toBeNull();
    });

    it("sends the chosen filters to the store and goes back to page 1", async () => {
        const { store } = renderLibrary([WARM_UP, WEAVE], 45);
        await screen.findByText("My Warm-up");
        fireEvent.click(screen.getByRole("button", { name: "Go to page 3" }));
        await waitFor(() => expect(store.getPlaysByTeam).toHaveBeenLastCalledWith(expect.objectContaining({ page: 3 })));

        fireEvent.click(focusChip("Goalies"));
        await waitFor(() => expect(store.getPlaysByTeam).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, focus: "goalies" })));
        fireEvent.click(goaliesChip("Needs goalie"));
        await waitFor(() => expect(store.getPlaysByTeam).toHaveBeenLastCalledWith(expect.objectContaining({ focus: "goalies", goalies: "required" })));
        fireEvent.click(focusChip("All"));
        await waitFor(() => expect(store.getPlaysByTeam.mock.lastCall?.[0]).not.toHaveProperty("focus"));
        expect(store.getPlaysByTeam.mock.lastCall?.[0]).toMatchObject({ goalies: "required" });
    });

    it("filters the starter cards with the same chips", async () => {
        renderLibrary([]);
        await screen.findByText("Breakout (5-Man)");
        fireEvent.click(focusChip("Goalies"));
        await waitFor(() => expect(screen.queryByText("Breakout (5-Man)")).toBeNull());
        expect(screen.getByText("Goalie Warm-Up")).toBeInTheDocument();
        expect(within(cardOf("Goalie Warm-Up")).getByRole("img", { name: "Needs a goalie" })).toBeInTheDocument();
    });

    it("copies a starter with its tags", async () => {
        const { store } = renderLibrary([]);
        store.createPlay.mockResolvedValue({ success: true, data: { id: "cnewxxxxxxxxxxxxxxxxxxxxx", name: "Goalie Warm-Up", isTemplate: true } });
        await screen.findByText("Goalie Warm-Up");
        fireEvent.click(within(cardOf("Goalie Warm-Up")).getByRole("button", { name: /Add to my library/ }));
        await waitFor(() => expect(store.createPlay).toHaveBeenCalledWith(expect.objectContaining({ name: "Goalie Warm-Up", focus: "goalies", goalies: "required" })));
    });

    it("hands a selected drill over with its tags", async () => {
        const { store, onSelectPlay } = renderLibrary([WARM_UP], 1, "select");
        store.getPlayById.mockResolvedValue({ success: true, data: { ...WARM_UP, playData: { version: 2, players: [], drawings: [], equipment: [], annotations: [] } } });
        fireEvent.click(await screen.findByText("My Warm-up"));
        await waitFor(() => expect(onSelectPlay).toHaveBeenCalledWith(expect.objectContaining({ focus: "goalies", goalies: "required" })));
    });

    it("hides a starter already copied anywhere in the library, not only on the current page", async () => {
        const store = createMockPlannerStore();
        const copied = summary("cplay3xxxxxxxxxxxxxxxxxxx", "Goalie Warm-Up", { focus: "goalies", goalies: "required" });
        // The page query (limit 20) shows only the first page; the copied starter sits further down.
        store.getPlaysByTeam.mockImplementation(async (query: { limit: number; page: number }) =>
            query.limit === 20
                ? { success: true, data: { plays: [WARM_UP], total: 21, page: query.page, limit: 20 } }
                : { success: true, data: { plays: [WARM_UP, WEAVE, copied], total: 3, page: query.page, limit: query.limit } },
        );
        renderWithPlanner(
            <ThemeProvider theme={createTheme()}>
                <PlayLibrary teamId={TEAM} mode="manage" />
            </ThemeProvider>,
            { store, platform: createHashPlatform() },
        );
        await screen.findByText("My Warm-up");
        await screen.findByText("Breakout (5-Man)");
        await waitFor(() => expect(screen.queryByText("Goalie Warm-Up")).toBeNull());
        // The names scan ignores search, date and tag filters, so it sees the whole library.
        expect(store.getPlaysByTeam).toHaveBeenCalledWith({ teamId: TEAM, isTemplate: true, page: 1, limit: 100, dateFilter: "all" });
    });
});

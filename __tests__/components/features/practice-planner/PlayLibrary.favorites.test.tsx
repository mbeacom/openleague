import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { createHashPlatform, createMockPlannerStore, renderWithPlanner } from "@/__tests__/helpers/planner";
import { STARTER_PLAYS } from "@/lib/data/starter-plays";

vi.mock("@/lib/utils/canvas/thumbnail-generator", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/utils/canvas/thumbnail-generator")>()), generateThumbnail: () => "data:image/png;base64,AA==" }));

import { PlayLibrary } from "@/components/features/practice-planner/PlayLibrary";

const TEAM = "cteamxxxxxxxxxxxxxxxxxxxx";
const AT = new Date("2026-04-01T00:00:00Z");
const summary = (id: string, name: string) => ({ id, name, description: null, thumbnail: null, isTemplate: true, createdAt: AT, updatedAt: AT });
const WARM_UP = summary("cplay1xxxxxxxxxxxxxxxxxxx", "My Warm-up");
const WEAVE = summary("cplay2xxxxxxxxxxxxxxxxxxx", "My Weave");
const STARTER = STARTER_PLAYS[0];

function renderLibrary({ favorites = [WEAVE.id], mode = "manage" as "manage" | "select", withFavorites = true, save = vi.fn() } = {}) {
    const store = createMockPlannerStore();
    store.getPlaysByTeam.mockImplementation(async ({ page, limit }: { page: number; limit: number }) => ({
        success: true,
        data: { plays: page === 1 ? [WARM_UP, WEAVE] : [], total: 2, page, limit },
    }));
    const extra = withFavorites
        ? {
              listPlannerFavorites: vi.fn().mockResolvedValue({ success: true, data: favorites }),
              setPlannerFavorite: save.mockImplementation(async (input: unknown) => ({ success: true, data: input })),
          }
        : {};
    const fullStore = { ...store, ...extra };
    const onSelectPlay = vi.fn();
    renderWithPlanner(
        <ThemeProvider theme={createTheme()}>
            <PlayLibrary teamId={TEAM} mode={mode} onSelectPlay={onSelectPlay} />
        </ThemeProvider>,
        { store: fullStore as never, platform: createHashPlatform() },
    );
    return { store: fullStore, onSelectPlay, save };
}

const star = (name: string) => screen.getByRole("button", { name: `Favorite ${name}` });

describe("PlayLibrary favorites", () => {
    it("shows no stars or filter when the store has no favorites", async () => {
        renderLibrary({ withFavorites: false });
        await screen.findByText("My Warm-up");
        expect(screen.queryByRole("button", { name: /^Favorite / })).toBeNull();
        expect(screen.queryByRole("button", { name: "Favorites" })).toBeNull();
    });

    it("stars drills and uncopied starters, with aria-pressed and 44px targets", async () => {
        renderLibrary();
        await screen.findByText("My Warm-up");
        await waitFor(() => expect(star("My Weave")).toHaveAttribute("aria-pressed", "true"));
        expect(star("My Warm-up")).toHaveAttribute("aria-pressed", "false");
        expect(star(STARTER.name)).toHaveAttribute("aria-pressed", "false");
    });

    it("stars a drill at once and saves it", async () => {
        const { save } = renderLibrary();
        await screen.findByText("My Warm-up");
        fireEvent.click(star("My Warm-up"));
        expect(star("My Warm-up")).toHaveAttribute("aria-pressed", "true");
        expect(save).toHaveBeenCalledWith({ kind: "DRILL", targetId: WARM_UP.id, favorite: true });
    });

    it("stars a starter by its stable id", async () => {
        const { save } = renderLibrary();
        await screen.findByText(STARTER.name);
        fireEvent.click(star(STARTER.name));
        expect(save).toHaveBeenCalledWith({ kind: "DRILL", targetId: STARTER.id, favorite: true });
    });

    it("filters to favorites across every page, starters included", async () => {
        const { store } = renderLibrary({ favorites: [WEAVE.id, STARTER.id] });
        await screen.findByText("My Warm-up");
        await waitFor(() => expect(star("My Weave")).toHaveAttribute("aria-pressed", "true"));
        fireEvent.click(screen.getByRole("button", { name: "Favorites" }));
        await waitFor(() => expect(screen.queryByText("My Warm-up")).toBeNull());
        expect(screen.getByText("My Weave")).toBeInTheDocument();
        expect(screen.getByText(STARTER.name)).toBeInTheDocument();
        expect(screen.queryByText(STARTER_PLAYS[1].name)).toBeNull();
        expect(store.getPlaysByTeam).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, limit: 100 }));
    });

    it("says so when there are no favorites yet", async () => {
        renderLibrary({ favorites: [] });
        await screen.findByText("My Warm-up");
        fireEvent.click(screen.getByRole("button", { name: "Favorites" }));
        expect(await screen.findByText("No favorite drills yet")).toBeInTheDocument();
    });

    it("never selects the drill when its star is tapped in the picker", async () => {
        const { onSelectPlay, save } = renderLibrary({ mode: "select" });
        await screen.findByText("My Warm-up");
        fireEvent.click(star("My Warm-up"));
        expect(save).toHaveBeenCalled();
        expect(onSelectPlay).not.toHaveBeenCalled();
        const card = screen.getByText("My Weave").closest(".MuiCard-root") as HTMLElement;
        await waitFor(() => expect(within(card).getByRole("button", { name: "Favorite My Weave" })).toHaveAttribute("aria-pressed", "true"));
    });

    it("stars the library copy of a starred starter", async () => {
        const { store, save } = renderLibrary({ favorites: [STARTER.id] });
        const created = "cplay9xxxxxxxxxxxxxxxxxxx";
        (store.createPlay as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, data: { id: created, name: STARTER.name, isTemplate: true } });
        await waitFor(() => expect(star(STARTER.name)).toHaveAttribute("aria-pressed", "true"));
        const card = screen.getByText(STARTER.name).closest(".MuiCard-root") as HTMLElement;
        fireEvent.click(within(card).getByRole("button", { name: /Add to my library/ }));
        await waitFor(() => expect(save).toHaveBeenCalledWith({ kind: "DRILL", targetId: created, favorite: true }));
    });
});

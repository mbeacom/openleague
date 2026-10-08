/** The hosted practice list's stars, Favorites filter and favorites-first order (practice favorites spec R7). */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { PlannerProvider, type PlannerStore } from "@/lib/planner-store";
import { createHashPlatform, createMockPlannerStore } from "@/__tests__/helpers/planner";

import PracticePlannerList from "@/app/(dashboard)/practice-planner/PracticePlannerList";

const session = (id: string, title: string, date: string) => ({
    id,
    title,
    date,
    duration: 60,
    isShared: true,
    createdByName: "Coach",
    playCount: 2,
    firstPlayThumbnail: null,
});
const MONDAY = session("csess1xxxxxxxxxxxxxxxxxxx", "Riverside Monday", "2099-01-05T18:00:00.000Z");
const WEDNESDAY = session("csess2xxxxxxxxxxxxxxxxxxx", "Riverside Wednesday", "2099-01-07T18:00:00.000Z");
const FRIDAY = session("csess3xxxxxxxxxxxxxxxxxxx", "Riverside Friday", "2099-01-09T18:00:00.000Z");

function renderList(favoriteSessionIds: string[] = [FRIDAY.id]) {
    const save = vi.fn(async (input: unknown) => ({ success: true, data: input }));
    const list = vi.fn();
    const store = { ...createMockPlannerStore(), listPlannerFavorites: list, setPlannerFavorite: save } as unknown as PlannerStore;
    render(
        <PlannerProvider store={store} platform={createHashPlatform()}>
            <PracticePlannerList
                sessions={[MONDAY, WEDNESDAY, FRIDAY]}
                teamId="cteamxxxxxxxxxxxxxxxxxxxx"
                teamName="Riverside 901"
                isAdmin
                canImport={false}
                favoriteSessionIds={favoriteSessionIds}
            />
        </PlannerProvider>,
    );
    return { save, list };
}

const titles = () => screen.getAllByRole("heading", { level: 6 }).map((h) => h.textContent);

describe("PracticePlannerList favorites", () => {
    it("puts favorites first, then the chosen date order, using the ids read on the server", () => {
        const { list } = renderList();
        expect(titles()).toEqual(["Riverside Friday", "Riverside Monday", "Riverside Wednesday"]);
        expect(screen.getByRole("button", { name: "Favorite Riverside Friday" })).toHaveAttribute("aria-pressed", "true");
        expect(list).not.toHaveBeenCalled();
    });

    it("stars a practice outside its link and saves it", () => {
        const { save } = renderList([]);
        const button = screen.getByRole("button", { name: "Favorite Riverside Wednesday" });
        expect(button.closest("a")).toBeNull();
        fireEvent.click(button);
        expect(button).toHaveAttribute("aria-pressed", "true");
        expect(save).toHaveBeenCalledWith({ kind: "PRACTICE", targetId: WEDNESDAY.id, favorite: true });
        expect(titles()[0]).toBe("Riverside Wednesday");
    });

    it("filters to favorites, and says so when there are none", () => {
        renderList();
        fireEvent.click(screen.getByRole("button", { name: "Favorites" }));
        expect(titles()).toEqual(["Riverside Friday"]);
        fireEvent.click(screen.getByRole("button", { name: "Favorite Riverside Friday" }));
        expect(screen.getByText("No favorite practices yet")).toBeInTheDocument();
        expect(within(document.body).queryByText("Riverside Monday")).toBeNull();
    });

    it("shows no stars outside the planner layout", () => {
        render(<PracticePlannerList sessions={[MONDAY]} teamId="cteamxxxxxxxxxxxxxxxxxxxx" teamName="Riverside 901" isAdmin canImport={false} />);
        expect(screen.queryByRole("button", { name: /^Favorite/ })).toBeNull();
    });
});

/** The static practice list's stars, Favorites filter and favorites-first order (practice favorites spec R7). */
import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PlannerApp } from "@/apps/planner/src/App";
import { createStaleSignal } from "@/apps/planner/src/store/open-store";
import { memoryStore } from "./render-screen";

afterEach(() => {
    window.history.replaceState(null, "", "/");
});

async function saved(store: ReturnType<typeof memoryStore>["store"], title: string, date: string) {
    const created = await store.createSession({ title, date: new Date(date), duration: 60, plays: [] });
    if (!created.success) throw new Error(created.error);
    return created.data.id;
}

const titles = () => screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);

describe("static practice list favorites", () => {
    it("stars a practice, keeps it first, filters to it, and remembers it", async () => {
        const { store } = memoryStore();
        await saved(store, "Lakeview Monday", "2026-10-05T19:00:00");
        const wednesday = await saved(store, "Lakeview Wednesday", "2026-10-07T19:00:00");
        const view = render(<PlannerApp store={store} durable stale={createStaleSignal()} />);
        await screen.findByText("Lakeview Monday");
        expect(titles()).toEqual(["Lakeview Wednesday", "Lakeview Monday"]);

        const star = screen.getByRole("button", { name: "Favorite Lakeview Monday" });
        expect(star).toHaveAttribute("aria-pressed", "false");
        expect(star.closest("a")).toBeNull();
        fireEvent.click(star);
        expect(star).toHaveAttribute("aria-pressed", "true");
        expect(titles()).toEqual(["Lakeview Monday", "Lakeview Wednesday"]);
        await waitFor(async () => expect(await store.listPlannerFavorites({ kind: "PRACTICE" })).toEqual({ success: true, data: [expect.any(String)] }));

        fireEvent.click(screen.getByRole("button", { name: "Favorites" }));
        expect(titles()).toEqual(["Lakeview Monday"]);

        view.unmount();
        render(<PlannerApp store={store} durable stale={createStaleSignal()} />);
        await waitFor(() => expect(screen.getByRole("button", { name: "Favorite Lakeview Monday" })).toHaveAttribute("aria-pressed", "true"));
        expect(screen.getByRole("button", { name: "Favorite Lakeview Wednesday" })).toHaveAttribute("aria-pressed", "false");
        expect(wednesday).toBeTruthy();
    });

    it("says so when no practice is starred", async () => {
        const { store } = memoryStore();
        await saved(store, "Lakeview Monday", "2026-10-05T19:00:00");
        render(<PlannerApp store={store} durable stale={createStaleSignal()} />);
        await screen.findByText("Lakeview Monday");
        fireEvent.click(screen.getByRole("button", { name: "Favorites" }));
        expect(await screen.findByText("No favorite practices yet")).toBeInTheDocument();
    });
});

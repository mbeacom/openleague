// __tests__/apps/planner/rankings-team-setup.test.tsx
import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { RankingsTeamScreen, TEAM_NOT_FOUND_MESSAGE } from "@/apps/planner/src/screens/rankings/RankingsTeamScreen";
import { RankingsSetupScreen, SAVE_SETUP_LABEL } from "@/apps/planner/src/screens/rankings/RankingsSetupScreen";
import { memoryStore, renderScreen } from "./render-screen";
import { sampleRankingsDoc } from "./rankings-fixtures";

describe("RankingsTeamScreen", () => {
    it("shows the game log, the cap and the arithmetic", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc());
        renderScreen(<RankingsTeamScreen store={store} number="903" />, store);
        expect(await screen.findByRole("heading", { name: /Hilltop M1/ })).toBeInTheDocument();
        expect(screen.getByText(/AGD .+ \+ SCHED .+ = Lodin .+/)).toBeInTheDocument();
        expect(screen.getAllByText(/capped at 8/).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/Brookside M1/).length).toBeGreaterThan(0);
    });

    it("says when the team doesn't exist", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc());
        renderScreen(<RankingsTeamScreen store={store} number="999" />, store);
        expect(await screen.findByText(TEAM_NOT_FOUND_MESSAGE)).toBeInTheDocument();
    });
});

describe("RankingsSetupScreen", () => {
    it("marks a team excluded and changes a level size", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc());
        renderScreen(<RankingsSetupScreen store={store} />, store);
        const row = (await screen.findByText("Brookside M1")).closest("tr")!;
        fireEvent.click(within(row).getByRole("checkbox", { name: "Excluded" }));
        fireEvent.change(screen.getByLabelText("Size of level 1"), { target: { value: "3" } });
        fireEvent.click(screen.getByRole("button", { name: SAVE_SETUP_LABEL }));
        await waitFor(async () => {
            const saved = await store.getRankings();
            expect(saved.success && saved.data!.teams.find((t) => t.number === "904")!.excluded).toBe(true);
            expect(saved.success && saved.data!.method.levels[0].size).toBe(3);
        });
    });

    it("shows the validation message instead of saving bad input", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc());
        renderScreen(<RankingsSetupScreen store={store} />, store);
        fireEvent.change(await screen.findByLabelText("Size of level 1"), { target: { value: "0" } });
        fireEvent.click(screen.getByRole("button", { name: SAVE_SETUP_LABEL }));
        expect(await screen.findByText(/Level size must be at least 1/)).toBeInTheDocument();
    });
});

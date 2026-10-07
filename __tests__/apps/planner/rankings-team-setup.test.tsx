// __tests__/apps/planner/rankings-team-setup.test.tsx
import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { RankingsTeamScreen, TEAM_NOT_FOUND_MESSAGE } from "@/apps/planner/src/screens/rankings/RankingsTeamScreen";
import { CLEAR_ALL_LABEL, RankingsSetupScreen, SAVE_SETUP_LABEL } from "@/apps/planner/src/screens/rankings/RankingsSetupScreen";
import { memoryStore, renderScreen } from "./render-screen";
import { sampleRankingsDoc } from "./rankings-fixtures";

describe("RankingsTeamScreen", () => {
    it("shows the game log, the cap and the arithmetic", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc());
        renderScreen(<RankingsTeamScreen store={store} number="903" />, store);
        expect(await screen.findByRole("heading", { name: /Hilltop M1/ })).toBeInTheDocument();
        expect(screen.getByText(/AGD .+ \+ SCHED .+ = Lodin .+/)).toBeInTheDocument();
        const log = within(screen.getByRole("table", { name: "Game log" }));
        expect(log.getByText(/capped at 8/)).toBeInTheDocument();
        const uncapped = log.getByText("Lakeview M2").closest("tr")!;
        expect(within(uncapped).queryByText(/capped/)).not.toBeInTheDocument();
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
        const row = (await screen.findByLabelText("Name of 904")).closest("tr")!;
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

    it("keeps the data when the delete is cancelled and removes it when confirmed", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc());
        renderScreen(<RankingsSetupScreen store={store} />, store);
        fireEvent.click(await screen.findByRole("button", { name: CLEAR_ALL_LABEL }));
        fireEvent.click(screen.getByRole("button", { name: "Keep them" }));
        expect(screen.getByRole("button", { name: CLEAR_ALL_LABEL })).toBeInTheDocument();
        const kept = await store.getRankings();
        expect(kept.success && kept.data).not.toBeNull();
        fireEvent.click(screen.getByRole("button", { name: CLEAR_ALL_LABEL }));
        fireEvent.click(screen.getByRole("button", { name: "Yes, delete them" }));
        await waitFor(async () => {
            const gone = await store.getRankings();
            expect(gone.success && gone.data).toBeNull();
        });
    });

    it("ignores bad score keystrokes and refuses a half-entered score", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc());
        renderScreen(<RankingsSetupScreen store={store} />, store);
        const homes = await screen.findAllByLabelText("Home");
        fireEvent.change(homes[0], { target: { value: "123" } });
        expect(homes[0]).toHaveValue("3");
        fireEvent.change(homes[0], { target: { value: "x" } });
        expect(homes[0]).toHaveValue("3");
        fireEvent.change(homes[0], { target: { value: "" } });
        expect(homes[0]).toHaveValue("");
        fireEvent.click(screen.getByRole("button", { name: SAVE_SETUP_LABEL }));
        expect(await screen.findByText("Enter both scores or neither for 2026-09-20 901 vs 902.")).toBeInTheDocument();
        const saved = await store.getRankings();
        expect(saved.success && saved.data!.games[0].homeGoals).toBe(3);
    });
});

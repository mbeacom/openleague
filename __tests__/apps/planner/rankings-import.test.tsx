// __tests__/apps/planner/rankings-import.test.tsx
import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { READ_SCHEDULE_LABEL, READ_SNAKE_LABEL, RankingsImportScreen, SAVE_IMPORT_LABEL } from "@/apps/planner/src/screens/rankings/RankingsImportScreen";
import { memoryStore, renderScreen } from "./render-screen";
import { sampleRankingsDoc } from "./rankings-fixtures";

const PAGE = ["9/20", "9:25am", "901 Riverside M1", "11", "-", "4", "902 Lakeview M2", "North Rink", "10/12", "8:00am", "901 Riverside M1", "902 Lakeview M2", "904 Orphan Team"].join("\n");
const SNAKE = ["Program\tRed\tWhite", "Strength\tstr\tstr", "Riverside\t901\t", "Lakeview\t\t902"].join("\n");

describe("RankingsImportScreen", () => {
    it("previews a pasted schedule, applies a snake chart and saves", async () => {
        const { store } = memoryStore();
        renderScreen(<RankingsImportScreen store={store} />, store);
        fireEvent.change(await screen.findByLabelText("Season starts in"), { target: { value: "2026" } });
        fireEvent.change(screen.getByLabelText("Schedule page"), { target: { value: PAGE } });
        fireEvent.click(screen.getByRole("button", { name: READ_SCHEDULE_LABEL }));
        expect(await screen.findByText(/1 completed game, 1 scheduled, 2 teams/)).toBeInTheDocument();
        expect(screen.getByText("904 Orphan Team")).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText("Snake chart"), { target: { value: SNAKE } });
        fireEvent.click(screen.getByRole("button", { name: READ_SNAKE_LABEL }));
        expect(await screen.findByText(/2 teams with a starting bracket/)).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: SAVE_IMPORT_LABEL }));
        await waitFor(async () => {
            const saved = await store.getRankings();
            expect(saved.success && saved.data?.games).toHaveLength(2);
        });
        const saved = await store.getRankings();
        if (saved.success) expect(saved.data!.teams.find((t) => t.number === "902")!.startingBracket).toBe("White Strong");
    });

    it("shows conflicts on re-import and lets the user take the imported score", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc());
        renderScreen(<RankingsImportScreen store={store} />, store);
        const changed = ["9/20", "9:00am", "901 Riverside M1", "3 - 2", "902 Lakeview M2"].join("\n");
        // Pin the season: the default comes from today's date, which would rot this fixture.
        fireEvent.change(await screen.findByLabelText("Season starts in"), { target: { value: "2026" } });
        fireEvent.change(screen.getByLabelText("Schedule page"), { target: { value: changed } });
        fireEvent.click(screen.getByRole("button", { name: READ_SCHEDULE_LABEL }));
        fireEvent.click(await screen.findByRole("button", { name: "Use imported 3–2" }));
        fireEvent.click(screen.getByRole("button", { name: SAVE_IMPORT_LABEL }));
        await waitFor(async () => {
            const saved = await store.getRankings();
            expect(saved.success && saved.data!.games[0].awayGoals).toBe(2);
        });
    });
});

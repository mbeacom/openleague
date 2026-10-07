import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { RECORD_FINAL_LABEL, RankingsWhatIfScreen, SWEEP_HEADING } from "@/apps/planner/src/screens/rankings/RankingsWhatIfScreen";
import { memoryStore, renderScreen } from "./render-screen";
import { sampleRankingsDoc } from "./rankings-fixtures";

describe("RankingsWhatIfScreen", () => {
    it("lists my team's unplayed game and sweeps every margin", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc());
        renderScreen(<RankingsWhatIfScreen store={store} />, store);
        expect((await screen.findAllByText(/vs Brookside M1/)).length).toBeGreaterThan(0);
        const sweep = screen.getByRole("list", { name: SWEEP_HEADING });
        expect(within(sweep).getAllByRole("listitem")).toHaveLength(17);
    });

    it("ignores blank or invalid scores and never writes them", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc());
        renderScreen(<RankingsWhatIfScreen store={store} />, store);
        fireEvent.change(await screen.findByLabelText("Hilltop M1 goals"), { target: { value: "abc" } });
        expect(screen.getByRole("button", { name: RECORD_FINAL_LABEL })).toBeDisabled();
        const saved = await store.getRankings();
        expect(saved.success && saved.data!.games.at(-1)!.status).toBe("scheduled");
    });

    it("shows before → after for my team and records a result as final", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc());
        renderScreen(<RankingsWhatIfScreen store={store} />, store);
        fireEvent.change(await screen.findByLabelText("Hilltop M1 goals"), { target: { value: "8" } });
        fireEvent.change(screen.getByLabelText("Brookside M1 goals"), { target: { value: "0" } });
        expect(await screen.findByText(/Rank \d+ → \d+/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: RECORD_FINAL_LABEL }));
        await waitFor(async () => {
            const saved = await store.getRankings();
            expect(saved.success && saved.data!.games.at(-1)).toMatchObject({ status: "final", homeGoals: 8, awayGoals: 0 });
        });
    });
});

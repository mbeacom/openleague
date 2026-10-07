import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ADD_HYPOTHETICAL_LABEL, RECORD_FINAL_LABEL, RankingsWhatIfScreen, SWEEP_HEADING } from "@/apps/planner/src/screens/rankings/RankingsWhatIfScreen";
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

    it("does not write a valid score until Record is clicked", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc());
        renderScreen(<RankingsWhatIfScreen store={store} />, store);
        fireEvent.change(await screen.findByLabelText("Hilltop M1 goals"), { target: { value: "5" } });
        fireEvent.change(screen.getByLabelText("Brookside M1 goals"), { target: { value: "1" } });
        expect(await screen.findByText(/Rank \d+ → \d+/)).toBeInTheDocument();
        const saved = await store.getRankings();
        expect(saved.success && saved.data!.games.at(-1)).toMatchObject({ status: "scheduled" });
    });

    it("keeps typed scores and shows the error when recording fails", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc());
        const failing = { ...store, saveRankings: async () => ({ success: false as const, error: "Disk full" }) };
        renderScreen(<RankingsWhatIfScreen store={failing} />, store);
        fireEvent.change(await screen.findByLabelText("Hilltop M1 goals"), { target: { value: "8" } });
        fireEvent.change(screen.getByLabelText("Brookside M1 goals"), { target: { value: "0" } });
        fireEvent.click(screen.getByRole("button", { name: RECORD_FINAL_LABEL }));
        expect(await screen.findByText("Disk full")).toBeInTheDocument();
        expect(screen.getByLabelText("Hilltop M1 goals")).toHaveValue("8");
        const saved = await store.getRankings();
        expect(saved.success && saved.data!.games.at(-1)!.status).toBe("scheduled");
    });

    it("includes other entered hypotheticals in the sweep", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc());
        renderScreen(<RankingsWhatIfScreen store={store} />, store);
        await screen.findByLabelText("Hilltop M1 goals");
        fireEvent.click(screen.getAllByRole("button", { name: "Sweep this game" })[0]);
        const before = screen.getByRole("list", { name: SWEEP_HEADING }).textContent;
        fireEvent.mouseDown(screen.getByRole("combobox", { name: "Opponent" }));
        fireEvent.click(await screen.findByRole("option", { name: /Riverside M1/ }));
        fireEvent.click(screen.getByRole("button", { name: ADD_HYPOTHETICAL_LABEL }));
        const homeFields = await screen.findAllByLabelText("Hilltop M1 goals");
        const awayFields = screen.getAllByLabelText("Riverside M1 goals");
        fireEvent.change(homeFields[1], { target: { value: "8" } });
        fireEvent.change(awayFields[0], { target: { value: "0" } });
        await waitFor(() => expect(screen.getByRole("list", { name: SWEEP_HEADING }).textContent).not.toBe(before));
    });
});

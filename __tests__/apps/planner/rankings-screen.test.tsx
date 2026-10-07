// __tests__/apps/planner/rankings-screen.test.tsx
import { describe, expect, it } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { RankingsScreen } from "@/apps/planner/src/screens/rankings/RankingsScreen";
import { NO_RANKINGS_MESSAGE, START_OVER_LABEL } from "@/apps/planner/src/screens/rankings/display";
import { META_RANKINGS } from "@/apps/planner/src/store/records";
import { memoryStore, renderScreen } from "./render-screen";
import { sampleRankingsDoc } from "./rankings-fixtures";

describe("RankingsScreen", () => {
    it("invites an import when there's nothing saved", async () => {
        const { store } = memoryStore();
        renderScreen(<RankingsScreen store={store} />, store);
        expect(await screen.findByText(NO_RANKINGS_MESSAGE)).toBeInTheDocument();
    });

    it("shows my team's tiles and every team in the ladder", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc());
        renderScreen(<RankingsScreen store={store} />, store);
        expect(await screen.findByText("CSHL-compatible RPI")).toBeInTheDocument();
        expect(screen.getByText(/of 4/)).toBeInTheDocument();
        for (const name of ["Riverside M1", "Lakeview M2", "Hilltop M1", "Brookside M1"]) expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    });

    it("switches to the table with the league's columns", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc());
        renderScreen(<RankingsScreen store={store} />, store);
        fireEvent.click(await screen.findByRole("button", { name: "Table" }));
        for (const column of ["AGD", "SCHED", "Lodin", "Walkush (approx.)", "RPI", "Level"]) expect(screen.getByRole("columnheader", { name: new RegExp(column.replace(/[()]/g, "\\$&")) })).toBeInTheDocument();
    });

    it("filters by team name", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc());
        renderScreen(<RankingsScreen store={store} />, store);
        fireEvent.change(await screen.findByLabelText("Find a team"), { target: { value: "Brook" } });
        expect(screen.queryByRole("link", { name: "Riverside M1" })).not.toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Brookside M1" })).toBeInTheDocument();
    });

    it("offers Start over for a damaged record", async () => {
        const { store, repo } = memoryStore();
        await repo.write((tx) => tx.putMeta(META_RANKINGS, { format: "openleague.rankings", version: 1 }));
        renderScreen(<RankingsScreen store={store} />, store);
        fireEvent.click(await screen.findByRole("button", { name: START_OVER_LABEL }));
        expect(await screen.findByText(NO_RANKINGS_MESSAGE)).toBeInTheDocument();
    });
});

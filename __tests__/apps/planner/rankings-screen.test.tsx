// __tests__/apps/planner/rankings-screen.test.tsx
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { composite } from "@/lib/ratings";
import { toRatingInputs } from "@/lib/rankings-document";
import { downloadBlob } from "@/components/features/practice-planner/export/download";
import { RankingsScreen } from "@/apps/planner/src/screens/rankings/RankingsScreen";
import { NO_RANKINGS_MESSAGE, START_OVER_LABEL } from "@/apps/planner/src/screens/rankings/display";
import { META_RANKINGS } from "@/apps/planner/src/store/records";
import { memoryStore, renderScreen } from "./render-screen";
import { sampleRankingsDoc } from "./rankings-fixtures";

vi.mock("@/components/features/practice-planner/export/download", () => ({ downloadBlob: vi.fn() }));

const EXCLUDED = { number: "905", name: "Pinewood M1", startingBracket: null, excluded: true };

function withExcluded() {
    const base = sampleRankingsDoc();
    return sampleRankingsDoc({
        teams: [...base.teams, EXCLUDED],
        method: { ...base.method, levels: [{ name: "X", size: 2 }, { name: "Y", size: 1 }] },
    });
}

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

    it("labels each ladder group once", async () => {
        const { store } = memoryStore();
        await store.saveRankings(withExcluded());
        renderScreen(<RankingsScreen store={store} />, store);
        const ladder = within(await screen.findByRole("list", { name: "Rankings ladder" }));
        for (const header of ["X", "Y", "Below the last level", "Not ranked"]) expect(ladder.getAllByText(header, { exact: true })).toHaveLength(1);
    });

    it("keeps unranked teams last when sorting the table either way", async () => {
        const { store } = memoryStore();
        await store.saveRankings(withExcluded());
        renderScreen(<RankingsScreen store={store} />, store);
        fireEvent.click(await screen.findByRole("button", { name: "Table" }));
        const lastRow = () => {
            const rows = within(screen.getByRole("table")).getAllByRole("row");
            return rows[rows.length - 1];
        };
        expect(lastRow()).toHaveTextContent("Pinewood M1");
        fireEvent.click(screen.getByRole("button", { name: /^Rank/ }));
        expect(lastRow()).toHaveTextContent("Pinewood M1");
        const first = within(screen.getByRole("table")).getAllByRole("row")[1];
        expect(first).not.toHaveTextContent("Pinewood M1");
    });

    it("exports the document as a rankings file", async () => {
        const { store } = memoryStore();
        const doc = sampleRankingsDoc();
        await store.saveRankings(doc);
        renderScreen(<RankingsScreen store={store} />, store);
        fireEvent.click(await screen.findByRole("button", { name: "Export rankings file" }));
        const [blob, name] = vi.mocked(downloadBlob).mock.calls.at(-1) as [Blob, string];
        expect(name).toBe("fall-pre-season.rankings.json");
        const parsed = JSON.parse(await blob.text());
        expect(parsed.format).toBe("openleague.rankings");
        expect(parsed.teams).toHaveLength(doc.teams.length);
        expect(parsed.games).toHaveLength(doc.games.length);
    });

    it("filters by starting bracket", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc());
        renderScreen(<RankingsScreen store={store} />, store);
        fireEvent.mouseDown(await screen.findByRole("combobox", { name: "Starting bracket" }));
        fireEvent.click(await screen.findByRole("option", { name: "White Strong" }));
        expect(screen.getByRole("link", { name: "Hilltop M1" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Brookside M1" })).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: "Riverside M1" })).not.toBeInTheDocument();
        expect(screen.queryByRole("link", { name: "Lakeview M2" })).not.toBeInTheDocument();
    });

    it("limits the list to my team and its opponents", async () => {
        const { store } = memoryStore();
        const base = sampleRankingsDoc();
        await store.saveRankings(
            sampleRankingsDoc({
                games: [
                    { ...base.games[0], home: "901", away: "902" },
                    { ...base.games[1], home: "902", away: "904" },
                    { ...base.games[2], home: "903", away: "901" },
                ],
            }),
        );
        renderScreen(<RankingsScreen store={store} />, store);
        fireEvent.click(await screen.findByLabelText("My team's opponents"));
        expect(screen.getByRole("link", { name: "Hilltop M1" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Riverside M1" })).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: "Lakeview M2" })).not.toBeInTheDocument();
        expect(screen.queryByRole("link", { name: "Brookside M1" })).not.toBeInTheDocument();
    });

    it("shows my team's computed rank and level in the tiles", async () => {
        const { store } = memoryStore();
        const doc = sampleRankingsDoc();
        await store.saveRankings(doc);
        const { games, teams } = toRatingInputs(doc);
        const mine = composite(games, teams, doc.method).byNumber.get("903")!;
        renderScreen(<RankingsScreen store={store} />, store);
        await screen.findByText("CSHL-compatible RPI");
        expect(screen.getByText(`${mine.rank} of 4`)).toBeInTheDocument();
        expect(screen.getByText("Suggested level").parentElement).toHaveTextContent(mine.level ?? "—");
    });
});

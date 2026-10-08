// __tests__/apps/planner/rankings-screen.test.tsx
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { composite } from "@/lib/ratings";
import { MAX_RANKINGS_FILE_BYTES, parseRankings, readRankingsFile, serializeRankings, toRatingInputs } from "@/lib/rankings-document";
import { DOWNLOAD_AS_LABEL, rankingsReopenProblem } from "@/apps/planner/src/screens/rankings/RankingsFormatMenu";
import { ENVELOPE_OVERHEAD_BYTES } from "@/lib/document-envelope";
import { downloadBlob } from "@/components/features/practice-planner/export/download";
import { RankingsScreen, levelsShortMessage } from "@/apps/planner/src/screens/rankings/RankingsScreen";
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
        const columns = [
            "Rank",
            "Team",
            "Starting bracket",
            "GP",
            "W-L-T",
            "AGD",
            "SCHED",
            "Lodin",
            "Walkush (approx.)",
            "Lodin scaled",
            "Walkush (approx.) scaled",
            "CSHL-compatible RPI",
            "Level",
            "Movement",
            "Few games",
        ];
        expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(columns);
        expect(screen.queryByRole("columnheader", { name: "RPI" })).not.toBeInTheDocument();
    });

    it("fills the scaled, bracket, movement and few-games columns", async () => {
        const { store } = memoryStore();
        const doc = sampleRankingsDoc();
        await store.saveRankings(doc);
        const { games, teams, options } = toRatingInputs(doc);
        const row = composite(games, teams, doc.method, options).byNumber.get("903")!;
        renderScreen(<RankingsScreen store={store} />, store);
        fireEvent.click(await screen.findByRole("button", { name: "Table" }));
        const cells = within(screen.getByRole("link", { name: "Hilltop M1" }).closest("tr")!).getAllByRole("cell").map((cell) => cell.textContent);
        expect(cells[2]).toBe("White Strong");
        expect(cells[9]).toBe(row.lodinScaled!.toFixed(1));
        expect(cells[10]).toBe(row.walkushScaled!.toFixed(1));
        expect(cells[11]).toBe(row.rpi!.toFixed(1));
        expect(cells[13]).toMatch(/^▲ Up from White Strong$|^▬ Same as White Strong$|^▼ Down from White Strong$/);
        expect(cells[14]).toBe(row.lowConfidence ? "Few games" : "");
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

    it.each([
        ["YAML (.yaml)", "fall-pre-season.rankings.yaml"],
        ["TOML (.toml)", "fall-pre-season.rankings.toml"],
        ["JSONC (.jsonc)", "fall-pre-season.rankings.jsonc"],
    ])("downloads the rankings as %s, readable again", async (label, fileName) => {
        const { store } = memoryStore();
        const doc = sampleRankingsDoc();
        await store.saveRankings(doc);
        renderScreen(<RankingsScreen store={store} />, store);
        fireEvent.click(await screen.findByRole("button", { name: DOWNLOAD_AS_LABEL }));
        fireEvent.click(await screen.findByRole("menuitem", { name: label }));
        await waitFor(() => expect(vi.mocked(downloadBlob).mock.calls.at(-1)?.[1]).toBe(fileName));
        const [blob] = vi.mocked(downloadBlob).mock.calls.at(-1) as [Blob, string];
        const read = await readRankingsFile(new File([await blob.text()], fileName));
        const expected = parseRankings(JSON.parse(JSON.stringify(doc)));
        expect(read.ok && expected.ok && read.doc).toEqual(expected.ok && expected.doc);
    });

    describe("warns when a downloaded file couldn't be opened again", () => {
        /** A document whose compact JSON is `extra` bytes over (or, negative, under) the limit. */
        const sized = (extra: number) => {
            const base = sampleRankingsDoc({ snapshots: [{ note: "" }] });
            const pad = MAX_RANKINGS_FILE_BYTES - new TextEncoder().encode(JSON.stringify(base)).byteLength + extra;
            return sampleRankingsDoc({ snapshots: [{ note: "x".repeat(pad) }] });
        };

        it("bare JSON is held to the limit with no envelope allowance, and never suggests JSON", () => {
            const doc = sampleRankingsDoc();
            expect(rankingsReopenProblem(doc, "x".repeat(MAX_RANKINGS_FILE_BYTES), "json")).toBeNull();
            const problem = rankingsReopenProblem(doc, "x".repeat(MAX_RANKINGS_FILE_BYTES + 1), "json");
            expect(problem).toBe("This JSON file is too large to open again (the limit is 2 MB).");
            expect(problem).not.toMatch(/as JSON/);
        });

        it("another format is also measured as compact JSON once decoded", () => {
            // The written text fits its ceiling; the decoded document does not.
            expect(rankingsReopenProblem(sized(-1), "short", "yaml")).toBeNull();
            expect(rankingsReopenProblem(sized(1), "short", "yaml")).toBe("This YAML file is too large to open again (the limit is 2 MB).");
        });

        it("another format's written text is held to the limit plus the envelope allowance", () => {
            const doc = sampleRankingsDoc();
            expect(serializeRankings(doc).length).toBeLessThan(MAX_RANKINGS_FILE_BYTES);
            expect(rankingsReopenProblem(doc, "x".repeat(MAX_RANKINGS_FILE_BYTES + ENVELOPE_OVERHEAD_BYTES), "toml")).toBeNull();
            expect(rankingsReopenProblem(doc, "x".repeat(MAX_RANKINGS_FILE_BYTES + ENVELOPE_OVERHEAD_BYTES + 1), "toml")).toBe(
                "This TOML file is too large to open again (the limit is 2 MB). Export it as JSON instead.",
            );
        });
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

    it("labels movement with the real starting bracket", async () => {
        const { store } = memoryStore();
        // 903 and 904 (White Strong) beat everyone; the chart lists Red Strong first.
        const base = sampleRankingsDoc();
        const games = [
            { ...base.games[0], home: "903", away: "901", homeGoals: 5, awayGoals: 0 },
            { ...base.games[1], home: "904", away: "902", homeGoals: 5, awayGoals: 0 },
            { ...base.games[2], home: "903", away: "902", homeGoals: 5, awayGoals: 0 },
            { ...base.games[3], home: "904", away: "901", homeGoals: 5, awayGoals: 0 },
        ];
        await store.saveRankings(sampleRankingsDoc({ games, bracketOrder: ["Red Strong", "White Strong"] }));
        renderScreen(<RankingsScreen store={store} />, store);
        expect((await screen.findByText("Suggested level")).parentElement).toHaveTextContent("Up from White Strong");
        expect(screen.queryByText(/from [XY]\b/)).not.toBeInTheDocument();
    });

    it("says No games yet for a team without final games", async () => {
        const { store } = memoryStore();
        const base = sampleRankingsDoc();
        await store.saveRankings(sampleRankingsDoc({ teams: [...base.teams, { number: "906", name: "Pinewood M2", startingBracket: null, excluded: false }] }));
        renderScreen(<RankingsScreen store={store} />, store);
        const ladder = within(await screen.findByRole("list", { name: "Rankings ladder" }));
        expect(ladder.getByText("906 · No games yet")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Table" }));
        const cells = within(screen.getByRole("link", { name: "Pinewood M2" }).closest("tr")!).getAllByRole("cell").map((cell) => cell.textContent);
        expect(cells[12]).toBe("No games yet");
    });

    it("warns when more teams are ranked than the levels hold, and says so in my tile", async () => {
        const { store } = memoryStore();
        const base = sampleRankingsDoc();
        await store.saveRankings(sampleRankingsDoc({ method: { ...base.method, levels: [{ name: "X", size: 1 }, { name: "Y", size: 1 }] } }));
        renderScreen(<RankingsScreen store={store} />, store);
        expect(await screen.findByText("Your levels hold 2 teams but 4 are ranked, so 2 have no suggested level.")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Edit levels" })).toHaveAttribute("href", "#/rankings/setup");
        const { games, teams, options } = toRatingInputs(sampleRankingsDoc({ method: { ...base.method, levels: [{ name: "X", size: 1 }, { name: "Y", size: 1 }] } }));
        const mine = composite(games, teams, { ...base.method, levels: [{ name: "X", size: 1 }, { name: "Y", size: 1 }] }, options).byNumber.get("903")!;
        expect(screen.getByText("Suggested level").parentElement).toHaveTextContent(mine.level ?? "Below the last level");
    });

    it("offers the starting brackets strongest first in the filter", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc({ bracketOrder: ["White Strong", "Red Strong"] }));
        renderScreen(<RankingsScreen store={store} />, store);
        fireEvent.mouseDown(await screen.findByRole("combobox", { name: "Starting bracket" }));
        const options = within(screen.getByRole("listbox")).getAllByRole("option").map((o) => o.textContent);
        expect(options).toEqual(["All brackets", "White Strong", "Red Strong"]);
    });

    it("says has for a single team past the levels", () => {
        expect(levelsShortMessage(6, 7)).toBe("Your levels hold 6 teams but 7 are ranked, so 1 has no suggested level.");
    });

    it("lists every method setting", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc());
        renderScreen(<RankingsScreen store={store} />, store);
        const method = within(await screen.findByRole("region", { name: "Method" }));
        expect(method.getByText(/capped at 8/)).toBeInTheDocument();
        expect(method.getByText(/Walkush \(approx\.\) variant: plus-one/)).toBeInTheDocument();
        expect(method.getByText(/fewer than 3 final games/)).toBeInTheDocument();
        expect(method.getByText("Levels, top first: X 2, Y 2 (4 teams).")).toBeInTheDocument();
    });

    it("emits a dark-scheme background for the level bands under the real theme", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc());
        renderScreen(<RankingsScreen store={store} />, store);
        await screen.findByRole("list", { name: "Rankings ladder" });
        const css = [...document.querySelectorAll("style")]
            .map((style) => style.textContent || [...(style.sheet?.cssRules ?? [])].map((rule) => rule.cssText).join("\n"))
            .join("\n");
        // Light: League Blue (#0D47A1) at the top level's alpha; dark: the dark primary (#64B5F6) at 0.28, behind the scheme selector.
        expect(css).toContain("rgba(13, 71, 161, 0.26)");
        expect(css).toMatch(/\[data-mui-color-scheme="dark"\][^{]*\{[^}]*rgba\(100, 181, 246, 0\.28\)/);
    });
});

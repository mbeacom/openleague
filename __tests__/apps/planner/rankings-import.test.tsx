// __tests__/apps/planner/rankings-import.test.tsx
import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import {
    KEEP_MINE_LABEL,
    READ_SCHEDULE_LABEL,
    READ_SNAKE_LABEL,
    REPLACE_CONFIRM_MESSAGE,
    REPLACE_LABEL,
    RankingsImportScreen,
    SAVE_IMPORT_LABEL,
} from "@/apps/planner/src/screens/rankings/RankingsImportScreen";
import { serializeRankings } from "@/lib/rankings-document";
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
        expect(await screen.findByText(/2 of 2 teams in this schedule got a starting bracket from the chart · 0 chart teams matched no team/)).toBeInTheDocument();
        expect(screen.queryByRole("list", { name: "Teams without a starting bracket" })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: SAVE_IMPORT_LABEL }));
        await waitFor(async () => {
            const saved = await store.getRankings();
            expect(saved.success && saved.data?.games).toHaveLength(2);
        });
        const saved = await store.getRankings();
        expect(saved.success).toBe(true);
        expect(saved.success && saved.data!.teams.find((t) => t.number === "902")!.startingBracket).toBe("White Strong");
    });

    it("won't save an edited snake chart until it is read again", async () => {
        const { store } = memoryStore();
        renderScreen(<RankingsImportScreen store={store} />, store);
        fireEvent.change(await screen.findByLabelText("Season starts in"), { target: { value: "2026" } });
        fireEvent.change(screen.getByLabelText("Schedule page"), { target: { value: PAGE } });
        fireEvent.click(screen.getByRole("button", { name: READ_SCHEDULE_LABEL }));
        await screen.findByText(/1 completed game, 1 scheduled, 2 teams/);
        const save = screen.getByRole("button", { name: SAVE_IMPORT_LABEL });
        expect(save).toBeEnabled();

        fireEvent.change(screen.getByLabelText("Snake chart"), { target: { value: SNAKE } });
        expect(save).toBeDisabled();
        fireEvent.click(screen.getByRole("button", { name: READ_SNAKE_LABEL }));
        await waitFor(() => expect(save).toBeEnabled());

        fireEvent.change(screen.getByLabelText("Snake chart"), { target: { value: "" } });
        expect(save).toBeEnabled();
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

    const CHANGED = ["9/20", "9:00am", "901 Riverside M1", "3 - 2", "902 Lakeview M2"].join("\n");
    async function readChanged() {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc());
        renderScreen(<RankingsImportScreen store={store} />, store);
        fireEvent.change(await screen.findByLabelText("Season starts in"), { target: { value: "2026" } });
        fireEvent.change(screen.getByLabelText("Schedule page"), { target: { value: CHANGED } });
        fireEvent.click(screen.getByRole("button", { name: READ_SCHEDULE_LABEL }));
        await screen.findByRole("button", { name: "Use imported 3–2" });
        return store;
    }

    it("keeps Save disabled while a conflict remains", async () => {
        await readChanged();
        expect(screen.getByRole("button", { name: SAVE_IMPORT_LABEL })).toBeDisabled();
    });

    it("keeps the existing score when the user chooses Keep", async () => {
        const store = await readChanged();
        fireEvent.click(screen.getByRole("button", { name: "Keep 3–1" }));
        fireEvent.click(screen.getByRole("button", { name: SAVE_IMPORT_LABEL }));
        await waitFor(async () => {
            const saved = await store.getRankings();
            expect(saved.success && saved.data!.games[0].awayGoals).toBe(1);
        });
    });

    it("keeps a resolved conflict when a snake chart is read afterwards", async () => {
        const store = await readChanged();
        fireEvent.click(screen.getByRole("button", { name: "Use imported 3–2" }));
        fireEvent.change(screen.getByLabelText("Snake chart"), { target: { value: SNAKE } });
        fireEvent.click(screen.getByRole("button", { name: READ_SNAKE_LABEL }));
        // Counted against the two teams this schedule lists, not the four already saved.
        await screen.findByText(/2 of 2 teams in this schedule got a starting bracket from the chart/);
        expect(screen.queryByRole("button", { name: "Use imported 3–2" })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: SAVE_IMPORT_LABEL }));
        await waitFor(async () => {
            const saved = await store.getRankings();
            expect(saved.success && saved.data!.games[0].awayGoals).toBe(2);
        });
    });

    it("disables Save when the schedule text is edited after reading", async () => {
        await readChanged();
        fireEvent.click(screen.getByRole("button", { name: "Keep 3–1" }));
        expect(screen.getByRole("button", { name: SAVE_IMPORT_LABEL })).toBeEnabled();
        fireEvent.change(screen.getByLabelText("Schedule page"), { target: { value: `${CHANGED}\n` } });
        expect(screen.getByRole("button", { name: SAVE_IMPORT_LABEL })).toBeDisabled();
    });

    it("fills the schedule box from a picked file", async () => {
        const { store } = memoryStore();
        renderScreen(<RankingsImportScreen store={store} />, store);
        const input = await screen.findByTestId("schedule-file-input");
        fireEvent.change(input, { target: { files: [new File(["9/20\n9:00am"], "page.txt", { type: "text/plain" })] } });
        await waitFor(() => expect(screen.getByLabelText("Schedule page")).toHaveValue("9/20\n9:00am"));
    });

    it("previews how the snake chart fits the schedule and lists teams left without a bracket", async () => {
        const { store } = memoryStore();
        renderScreen(<RankingsImportScreen store={store} />, store);
        fireEvent.change(await screen.findByLabelText("Season starts in"), { target: { value: "2026" } });
        fireEvent.change(screen.getByLabelText("Schedule page"), { target: { value: PAGE } });
        fireEvent.click(screen.getByRole("button", { name: READ_SCHEDULE_LABEL }));
        await screen.findByText(/1 completed game/);
        const chart = ["Program\tRed\tWhite", "Strength\tstr\tstr", "Riverside\t901\t", "Hilltop\t\t903", "Brookside\t\t904"].join("\n");
        fireEvent.change(screen.getByLabelText("Snake chart"), { target: { value: chart } });
        fireEvent.click(screen.getByRole("button", { name: READ_SNAKE_LABEL }));
        expect(await screen.findByText(/1 of 2 teams in this schedule got a starting bracket from the chart · 2 chart teams matched no team/)).toBeInTheDocument();
        const missing = screen.getByRole("list", { name: "Teams without a starting bracket" });
        expect(missing).toHaveTextContent("902 Lakeview M2");
        expect(missing).not.toHaveTextContent("901");
    });

    it("reads a chart against the saved teams and leaves excluded teams off the missing list", async () => {
        const { store } = memoryStore();
        const base = sampleRankingsDoc();
        await store.saveRankings(
            sampleRankingsDoc({
                teams: base.teams.map((t) => (t.number === "903" ? { ...t, startingBracket: null } : t.number === "904" ? { ...t, startingBracket: null, excluded: true } : t)),
            }),
        );
        renderScreen(<RankingsImportScreen store={store} />, store);
        fireEvent.change(await screen.findByLabelText("Snake chart"), { target: { value: SNAKE } });
        fireEvent.click(screen.getByRole("button", { name: READ_SNAKE_LABEL }));
        expect(await screen.findByText(/2 of 4 saved teams got a starting bracket from the chart · 0 chart teams matched no team/)).toBeInTheDocument();
        const missing = screen.getByRole("list", { name: "Teams without a starting bracket" });
        expect(missing).toHaveTextContent("903 Hilltop M1");
        expect(missing).not.toHaveTextContent("904");
    });

    describe("opening a rankings file over saved rankings", () => {
        const incoming = sampleRankingsDoc({ meta: { title: "Other rankings", ageGroup: null, seasonLabel: null, source: null } });
        const file = () => new File([serializeRankings(incoming)], "other.rankings.json", { type: "application/json" });

        async function openOverSaved() {
            const { store } = memoryStore();
            await store.saveRankings(sampleRankingsDoc());
            renderScreen(<RankingsImportScreen store={store} />, store);
            fireEvent.change(await screen.findByTestId("rankings-file-input"), { target: { files: [file()] } });
            expect(await screen.findByText(REPLACE_CONFIRM_MESSAGE)).toBeInTheDocument();
            return store;
        }

        it("keeps the saved rankings when the user chooses Keep mine", async () => {
            const store = await openOverSaved();
            fireEvent.click(screen.getByRole("button", { name: KEEP_MINE_LABEL }));
            expect(screen.queryByText(REPLACE_CONFIRM_MESSAGE)).not.toBeInTheDocument();
            const saved = await store.getRankings();
            expect(saved.success && saved.data!.meta.title).toBe("Fall Pre-season");
        });

        it("replaces them only after the user confirms", async () => {
            const store = await openOverSaved();
            const before = await store.getRankings();
            expect(before.success && before.data!.meta.title).toBe("Fall Pre-season");
            fireEvent.click(screen.getByRole("button", { name: REPLACE_LABEL }));
            await waitFor(async () => {
                const saved = await store.getRankings();
                expect(saved.success && saved.data!.meta.title).toBe("Other rankings");
            });
        });

        it("opens straight away when nothing is saved", async () => {
            const { store } = memoryStore();
            renderScreen(<RankingsImportScreen store={store} />, store);
            fireEvent.change(await screen.findByTestId("rankings-file-input"), { target: { files: [file()] } });
            await waitFor(async () => {
                const saved = await store.getRankings();
                expect(saved.success && saved.data?.meta.title).toBe("Other rankings");
            });
            expect(screen.queryByText(REPLACE_CONFIRM_MESSAGE)).not.toBeInTheDocument();
        });
    });

    it("names the preset with its level-size year", async () => {
        const { store } = memoryStore();
        renderScreen(<RankingsImportScreen store={store} />, store);
        expect(await screen.findByRole("combobox", { name: "Rules" })).toHaveTextContent("CSHL 8U (2025 level sizes)");
    });
});

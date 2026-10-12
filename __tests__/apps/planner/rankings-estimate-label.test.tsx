/** Ratings are estimates (team directory spec, R10; phase 0): the label and the note on every screen that shows a computed rating or rank. */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import theme from "@/lib/theme";
import { composite } from "@/lib/ratings";
import { serializeRankings, toRatingInputs } from "@/lib/rankings-document";
import { ESTIMATE_LABEL, ESTIMATE_NOTE, EstimateLabel, EstimateNote } from "@/apps/planner/src/screens/rankings/EstimateLabel";
import { RankingsScreen } from "@/apps/planner/src/screens/rankings/RankingsScreen";
import { RankingsTeamScreen } from "@/apps/planner/src/screens/rankings/RankingsTeamScreen";
import { RankingsWhatIfScreen } from "@/apps/planner/src/screens/rankings/RankingsWhatIfScreen";
import { RankingsTierChart, TIER_CHART_TITLE } from "@/apps/planner/src/screens/rankings/RankingsTierChart";
import { memoryStore, renderScreen } from "./render-screen";
import { sampleRankingsDoc } from "./rankings-fixtures";

describe("EstimateLabel", () => {
    it("says Estimate in text, so it never relies on colour alone", () => {
        render(
            <ThemeProvider theme={theme}>
                <EstimateLabel />
            </ThemeProvider>,
        );
        expect(screen.getByText(ESTIMATE_LABEL)).toBeVisible();
        expect(ESTIMATE_LABEL).toBe("Estimate");
    });

    it("isn't interactive: no button, link or tab stop", () => {
        const { container } = render(
            <ThemeProvider theme={theme}>
                <EstimateLabel />
            </ThemeProvider>,
        );
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
        expect(screen.queryByRole("link")).not.toBeInTheDocument();
        expect(container.querySelector("[tabindex]")).toBeNull();
    });

    it("pairs the label with the one-line note, as a note", () => {
        render(
            <ThemeProvider theme={theme}>
                <EstimateNote />
            </ThemeProvider>,
        );
        const note = screen.getByRole("note");
        expect(within(note).getByText(ESTIMATE_LABEL)).toBeInTheDocument();
        expect(within(note).getByText(ESTIMATE_NOTE)).toBeInTheDocument();
    });

    it("words the note calmly and says what it's estimated from", () => {
        expect(ESTIMATE_NOTE).toBe("Estimated from the games in these rankings; not checked against the league's published results.");
    });
});

describe("estimate labels on the rankings screens", () => {
    it("labels my team's tiles and notes it once on Rankings", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc());
        renderScreen(<RankingsScreen store={store} />, store);
        await screen.findByText("CSHL-compatible RPI");
        // The rating, the rank and the suggested level each carry the label in their own tile.
        for (const tile of ["CSHL-compatible RPI", "Rank", "Suggested level"]) {
            const heading = screen.getByText(tile, { selector: ".MuiTypography-overline" });
            const card = heading.closest(".MuiPaper-root") as HTMLElement;
            expect(within(card).getByText(ESTIMATE_LABEL)).toBeInTheDocument();
        }
        expect(screen.getAllByRole("note").some((note) => note.textContent?.includes(ESTIMATE_NOTE))).toBe(true);
    });

    it("labels the tier chart beside its title", async () => {
        const { store } = memoryStore();
        const doc = sampleRankingsDoc();
        const { games, teams, options } = toRatingInputs(doc);
        const result = composite(games, teams, doc.method, options);
        renderScreen(<RankingsTierChart teams={result.teams} levels={doc.method.levels} myTeam={doc.myTeam} />, store);
        const figure = screen.getByRole("figure", { name: TIER_CHART_TITLE });
        expect(within(figure).getByText(ESTIMATE_LABEL)).toBeInTheDocument();
        // The label sits beside the heading, not inside its accessible name.
        expect(screen.getByRole("heading", { name: TIER_CHART_TITLE })).toBeInTheDocument();
    });

    it("labels a team's rank, rating and level on its page", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc());
        renderScreen(<RankingsTeamScreen store={store} number="903" />, store);
        await screen.findByText(/Rank \d+ · CSHL-compatible RPI/);
        expect(screen.getByText(ESTIMATE_LABEL)).toBeInTheDocument();
        expect(screen.getByText(ESTIMATE_NOTE)).toBeInTheDocument();
    });

    it("notes the estimate on What-if", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc());
        renderScreen(<RankingsWhatIfScreen store={store} />, store);
        await screen.findByRole("heading", { name: "What-if" });
        expect(screen.getByText(ESTIMATE_NOTE)).toBeInTheDocument();
    });

    it("labels my team's before → after rank on What-if", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc());
        renderScreen(<RankingsWhatIfScreen store={store} />, store);
        fireEvent.change(await screen.findByLabelText("Hilltop M1 goals"), { target: { value: "8" } });
        fireEvent.change(screen.getByLabelText("Brookside M1 goals"), { target: { value: "0" } });
        const change = await screen.findByText(/Rank \d+ → \d+/);
        expect(within(change).getByText(ESTIMATE_LABEL)).toBeInTheDocument();
    });
});

describe("estimate labels and the rankings file", () => {
    it("adds nothing to the rankings file: it holds games and settings, never a computed rating", () => {
        const text = serializeRankings(sampleRankingsDoc());
        expect(text).not.toContain(ESTIMATE_LABEL);
        expect(text).not.toContain(ESTIMATE_NOTE);
        expect(text).not.toMatch(/"rpi"|"rank"/);
    });
});

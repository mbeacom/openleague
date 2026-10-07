// __tests__/apps/planner/rankings-team-setup.test.tsx
import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { RankingsTeamScreen, TEAM_NOT_FOUND_MESSAGE } from "@/apps/planner/src/screens/rankings/RankingsTeamScreen";
import { CLEAR_ALL_LABEL, RankingsSetupScreen, SAVE_SETUP_LABEL } from "@/apps/planner/src/screens/rankings/RankingsSetupScreen";
import { levelsShortMessage } from "@/apps/planner/src/screens/rankings/display";
import { composite } from "@/lib/ratings";
import { toRatingInputs } from "@/lib/rankings-document";
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

    it("shows Walkush (approx.) and the RPI arithmetic", async () => {
        const { store } = memoryStore();
        const doc = sampleRankingsDoc();
        await store.saveRankings(doc);
        const { games, teams, options } = toRatingInputs(doc);
        const row = composite(games, teams, doc.method, options).byNumber.get("903")!;
        renderScreen(<RankingsTeamScreen store={store} number="903" />, store);
        expect(await screen.findByText(`Walkush (approx.) ${row.walkush!.toFixed(2)}`)).toBeInTheDocument();
        expect(
            screen.getByText(
                `(Lodin scaled ${row.lodinScaled!.toFixed(1)} + Walkush (approx.) scaled ${row.walkushScaled!.toFixed(1)}) ÷ 2 = CSHL-compatible RPI ${row.rpi!.toFixed(1)}`,
            ),
        ).toBeInTheDocument();
    });

    it("lists the game log by date, then time", async () => {
        const { store } = memoryStore();
        const base = sampleRankingsDoc();
        const late = { ...base.games[2], date: "2026-09-21", time: "18:00" };
        const early = { ...base.games[1], date: "2026-09-21", time: "07:30" };
        // Stored out of order: latest first.
        await store.saveRankings(sampleRankingsDoc({ games: [base.games[3], late, early] }));
        renderScreen(<RankingsTeamScreen store={store} number="903" />, store);
        const log = await screen.findByRole("table", { name: "Game log" });
        const dates = within(log).getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("cell")[0].textContent);
        expect(dates).toEqual(["2026-09-21 07:30", "2026-09-21 18:00", "2026-09-23 09:00"]);
    });

    it("says No games yet for a team without final games", async () => {
        const { store } = memoryStore();
        const base = sampleRankingsDoc();
        await store.saveRankings(sampleRankingsDoc({ teams: [...base.teams, { number: "905", name: "Pinewood M1", startingBracket: null, excluded: false }] }));
        renderScreen(<RankingsTeamScreen store={store} number="905" />, store);
        expect(await screen.findByText(/No games yet: this team has no final games/)).toBeInTheDocument();
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
        fireEvent.click(within(row).getByRole("checkbox", { name: "Excluded: Brookside M1" }));
        fireEvent.change(screen.getByLabelText("Size of level 1"), { target: { value: "3" } });
        fireEvent.click(screen.getByRole("button", { name: SAVE_SETUP_LABEL }));
        await waitFor(async () => {
            const saved = await store.getRankings();
            expect(saved.success && saved.data!.teams.find((t) => t.number === "904")!.excluded).toBe(true);
            expect(saved.success && saved.data!.method.levels[0].size).toBe(3);
        });
    });

    it("warns when the levels hold fewer teams than are ranked", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc());
        renderScreen(<RankingsSetupScreen store={store} />, store);
        expect(await screen.findByText("Your levels hold 4 teams and 4 are ranked.")).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText("Size of level 2"), { target: { value: "1" } });
        const warning = screen.getByRole("alert");
        expect(warning).toHaveTextContent(levelsShortMessage(3, 4));
        expect(warning.className).toMatch(/Warning/);
    });

    it("counts ranked teams the way the rankings screen does: a team with no games isn't ranked", async () => {
        const { store } = memoryStore();
        const base = sampleRankingsDoc();
        const doc = sampleRankingsDoc({
            teams: [...base.teams, { number: "905", name: "Pinewood M1", startingBracket: null, excluded: false }],
            method: { ...base.method, levels: [{ name: "X", size: 2 }, { name: "Y", size: 1 }] },
        });
        await store.saveRankings(doc);
        const { games, teams, options } = toRatingInputs(doc);
        const ranked = composite(games, teams, doc.method, options).ranked.length;
        expect(ranked).toBe(4);
        renderScreen(<RankingsSetupScreen store={store} />, store);
        expect(await screen.findByRole("alert")).toHaveTextContent(levelsShortMessage(3, ranked));
    });

    describe("starting brackets", () => {
        it("lists the brackets strongest first, in the saved order", async () => {
            const { store } = memoryStore();
            await store.saveRankings(sampleRankingsDoc({ bracketOrder: ["White Strong", "Red Strong"] }));
            renderScreen(<RankingsSetupScreen store={store} />, store);
            expect(await screen.findByLabelText("Name of bracket 1")).toHaveValue("White Strong");
            expect(screen.getByLabelText("Name of bracket 2")).toHaveValue("Red Strong");
            expect(screen.getByRole("button", { name: "Move White Strong up" })).toBeDisabled();
            expect(screen.getByRole("button", { name: "Move Red Strong down" })).toBeDisabled();
        });

        it("moves a bracket up, saves the order, and the movement follows it", async () => {
            const { store } = memoryStore();
            const doc = sampleRankingsDoc();
            await store.saveRankings(doc);
            const before = toRatingInputs(doc);
            expect(composite(before.games, before.teams, doc.method, before.options).byNumber.get("903")!.movement).toBe("same");

            renderScreen(<RankingsSetupScreen store={store} />, store);
            const up = await screen.findByRole("button", { name: "Move White Strong up" });
            expect(up).toHaveStyle({ width: "44px", height: "44px" });
            fireEvent.click(up);
            expect(screen.getByLabelText("Name of bracket 1")).toHaveValue("White Strong");
            fireEvent.click(screen.getByRole("button", { name: SAVE_SETUP_LABEL }));
            await waitFor(async () => {
                const saved = await store.getRankings();
                expect(saved.success && saved.data!.bracketOrder).toEqual(["White Strong", "Red Strong"]);
            });
            const saved = await store.getRankings();
            if (!saved.success || !saved.data) throw new Error("not saved");
            const after = toRatingInputs(saved.data);
            expect(composite(after.games, after.teams, saved.data.method, after.options).byNumber.get("903")!.movement).toBe("down");
        });

        it("renames a bracket for every team in it", async () => {
            const { store } = memoryStore();
            await store.saveRankings(sampleRankingsDoc());
            renderScreen(<RankingsSetupScreen store={store} />, store);
            fireEvent.change(await screen.findByLabelText("Name of bracket 1"), { target: { value: "Red Top" } });
            expect(screen.getByLabelText("Starting bracket of 901")).toHaveDisplayValue("Red Top");
            fireEvent.click(screen.getByRole("button", { name: SAVE_SETUP_LABEL }));
            await waitFor(async () => {
                const saved = await store.getRankings();
                expect(saved.success && saved.data!.bracketOrder).toEqual(["Red Top", "White Strong"]);
                expect(saved.success && saved.data!.teams.filter((t) => t.startingBracket === "Red Top").map((t) => t.number)).toEqual(["901", "902"]);
            });
        });

        it("adds a bracket and puts a team in it", async () => {
            const { store } = memoryStore();
            await store.saveRankings(sampleRankingsDoc());
            renderScreen(<RankingsSetupScreen store={store} />, store);
            fireEvent.click(await screen.findByRole("button", { name: "Add bracket" }));
            fireEvent.change(screen.getByLabelText("Name of bracket 3"), { target: { value: "White Weak" } });
            fireEvent.change(screen.getByLabelText("Starting bracket of 904"), { target: { value: "2" } });
            expect(screen.getByLabelText("Starting bracket of 904")).toHaveDisplayValue("White Weak");
            fireEvent.click(screen.getByRole("button", { name: SAVE_SETUP_LABEL }));
            await waitFor(async () => {
                const saved = await store.getRankings();
                expect(saved.success && saved.data!.bracketOrder).toEqual(["Red Strong", "White Strong", "White Weak"]);
                expect(saved.success && saved.data!.teams.find((t) => t.number === "904")!.startingBracket).toBe("White Weak");
            });
        });

        it("refuses a repeated or empty bracket name", async () => {
            const { store } = memoryStore();
            await store.saveRankings(sampleRankingsDoc());
            renderScreen(<RankingsSetupScreen store={store} />, store);
            fireEvent.change(await screen.findByLabelText("Name of bracket 2"), { target: { value: "Red Strong" } });
            fireEvent.click(screen.getByRole("button", { name: SAVE_SETUP_LABEL }));
            expect(await screen.findByText("Starting bracket Red Strong is listed twice.")).toBeInTheDocument();
            fireEvent.change(screen.getByLabelText("Name of bracket 2"), { target: { value: " " } });
            fireEvent.click(screen.getByRole("button", { name: SAVE_SETUP_LABEL }));
            expect(await screen.findByText("Give starting bracket 2 a name.")).toBeInTheDocument();
            const saved = await store.getRankings();
            expect(saved.success && saved.data!.bracketOrder).toEqual([]);
        });
    });

    it("refuses two levels with the same name", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc());
        renderScreen(<RankingsSetupScreen store={store} />, store);
        fireEvent.change(await screen.findByLabelText("Name of level 2"), { target: { value: "X" } });
        fireEvent.click(screen.getByRole("button", { name: SAVE_SETUP_LABEL }));
        expect(await screen.findByText(/Level name X is used twice/)).toBeInTheDocument();
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

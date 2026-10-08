// __tests__/apps/planner/rankings-team-setup.test.tsx
import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { RankingsTeamScreen, TEAM_NOT_FOUND_MESSAGE } from "@/apps/planner/src/screens/rankings/RankingsTeamScreen";
import { CLEAR_ALL_LABEL, RankingsSetupScreen, SAVE_SETUP_LABEL, SCHEDULE_PAGE_LABEL } from "@/apps/planner/src/screens/rankings/RankingsSetupScreen";
import { levelsShortMessage } from "@/apps/planner/src/screens/rankings/display";
import { ADD_GAME_LABEL, GAMES_PAGE_SIZE, HALF_SCORE_MESSAGE, SAME_TEAM_MESSAGE } from "@/apps/planner/src/screens/rankings/SetupGamesPanel";
import { NO_TEAMS_MATCH, TEAM_SEARCH_LABEL } from "@/apps/planner/src/screens/rankings/SetupTeamsPanel";
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

/** Opens a Setup section (its tab's name starts with the label). */
async function openTab(label: string) {
    fireEvent.click(await screen.findByRole("tab", { name: new RegExp(`^${label}`) }));
}

/** Opens a team's or game's edit dialog by its button's name; returns queries scoped to the dialog. */
function openDialog(name: string) {
    fireEvent.click(screen.getByRole("button", { name }));
    return within(screen.getByRole("dialog"));
}

describe("RankingsSetupScreen", () => {
    it("marks a team excluded and changes a level size", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc());
        renderScreen(<RankingsSetupScreen store={store} />, store);
        fireEvent.change(await screen.findByLabelText("Size of level 1"), { target: { value: "3" } });
        await openTab("Teams");
        const dialog = openDialog("Edit 904 Brookside M1");
        expect(dialog.getByLabelText("Name of 904")).toHaveValue("Brookside M1");
        fireEvent.click(dialog.getByRole("checkbox", { name: "Excluded: Brookside M1" }));
        fireEvent.click(dialog.getByRole("button", { name: "Done" }));
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
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
            await openTab("Brackets");
            expect(screen.getByLabelText("Name of bracket 1")).toHaveValue("White Strong");
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
            await openTab("Brackets");
            const up = screen.getByRole("button", { name: "Move White Strong up" });
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
            await openTab("Brackets");
            fireEvent.change(screen.getByLabelText("Name of bracket 1"), { target: { value: "Red Top" } });
            await openTab("Teams");
            const row = screen.getByRole("button", { name: "Edit 901 Riverside M1" });
            expect(within(row).getByText("Red Top")).toBeInTheDocument();
            const dialog = openDialog("Edit 901 Riverside M1");
            expect(dialog.getByLabelText("Starting bracket of 901")).toHaveDisplayValue("Red Top");
            fireEvent.click(dialog.getByRole("button", { name: "Done" }));
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
            await openTab("Brackets");
            fireEvent.click(screen.getByRole("button", { name: "Add bracket" }));
            fireEvent.change(screen.getByLabelText("Name of bracket 3"), { target: { value: "White Weak" } });
            await openTab("Teams");
            const dialog = openDialog("Edit 904 Brookside M1");
            fireEvent.change(dialog.getByLabelText("Starting bracket of 904"), { target: { value: "2" } });
            expect(dialog.getByLabelText("Starting bracket of 904")).toHaveDisplayValue("White Weak");
            fireEvent.click(dialog.getByRole("button", { name: "Done" }));
            expect(within(screen.getByRole("button", { name: "Edit 904 Brookside M1" })).getByText("White Weak")).toBeInTheDocument();
            fireEvent.click(screen.getByRole("button", { name: SAVE_SETUP_LABEL }));
            await waitFor(async () => {
                const saved = await store.getRankings();
                expect(saved.success && saved.data!.bracketOrder).toEqual(["Red Strong", "White Strong", "White Weak"]);
                expect(saved.success && saved.data!.teams.find((t) => t.number === "904")!.startingBracket).toBe("White Weak");
            });
        });

        // Renders the old single-page Setup with 25 teams: slow on a shared CI runner.
        it("removes a bracket that has teams, so a file with too many brackets can be saved again", async () => {
            const { store } = memoryStore();
            const base = sampleRankingsDoc({ bracketOrder: [] });
            const extra = Array.from({ length: 21 }, (_, i) => ({ number: String(910 + i), name: `Pinewood ${i + 1}`, startingBracket: `Bracket ${i + 1}`, excluded: false }));
            await store.saveRankings({ ...base, teams: [...base.teams.map((t) => ({ ...t, startingBracket: null })), ...extra] });
            renderScreen(<RankingsSetupScreen store={store} />, store);
            fireEvent.click(await screen.findByRole("button", { name: SAVE_SETUP_LABEL }));
            expect(await screen.findByText("At most 20 starting brackets. Remove 1 to save.")).toBeInTheDocument();
            // The problem opens the section it is in.
            expect(screen.getByRole("tab", { name: /^Brackets/ })).toHaveAttribute("aria-selected", "true");
            fireEvent.click(screen.getByRole("button", { name: "Remove Bracket 21 (its 1 team gets no starting bracket)" }));
            fireEvent.click(screen.getByRole("button", { name: SAVE_SETUP_LABEL }));
            await waitFor(async () => {
                const saved = await store.getRankings();
                expect(saved.success && saved.data!.bracketOrder).toHaveLength(20);
                expect(saved.success && saved.data!.teams.find((t) => t.number === "930")!.startingBracket).toBeNull();
            });
        }, 20_000);

        it("refuses a repeated or empty bracket name", async () => {
            const { store } = memoryStore();
            await store.saveRankings(sampleRankingsDoc());
            renderScreen(<RankingsSetupScreen store={store} />, store);
            await openTab("Brackets");
            fireEvent.change(screen.getByLabelText("Name of bracket 2"), { target: { value: "Red Strong" } });
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
        await openTab("Danger zone");
        fireEvent.click(screen.getByRole("button", { name: CLEAR_ALL_LABEL }));
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
        await openTab("Games");
        const dialog = openDialog("Edit game 2026-09-20 901 vs 902");
        const home = dialog.getByLabelText("Home");
        fireEvent.change(home, { target: { value: "123" } });
        expect(home).toHaveValue("3");
        fireEvent.change(home, { target: { value: "x" } });
        expect(home).toHaveValue("3");
        fireEvent.change(home, { target: { value: "" } });
        expect(home).toHaveValue("");
        expect(dialog.getByText(HALF_SCORE_MESSAGE)).toBeInTheDocument();
        fireEvent.click(dialog.getByRole("button", { name: "Done" }));
        await openTab("Rules");
        fireEvent.click(screen.getByRole("button", { name: SAVE_SETUP_LABEL }));
        expect(await screen.findByText("Enter both scores or neither for 2026-09-20 901 vs 902.")).toBeInTheDocument();
        expect(screen.getByRole("tab", { name: /^Games/ })).toHaveAttribute("aria-selected", "true");
        const saved = await store.getRankings();
        expect(saved.success && saved.data!.games[0].homeGoals).toBe(3);
    });

    it("sets and moves my team from the team dialog", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc());
        renderScreen(<RankingsSetupScreen store={store} />, store);
        await openTab("Teams");
        expect(within(screen.getByRole("button", { name: "Edit 903 Hilltop M1" })).getByText("My team")).toBeInTheDocument();
        const dialog = openDialog("Edit 901 Riverside M1");
        fireEvent.click(dialog.getByRole("checkbox", { name: "This is my team" }));
        fireEvent.change(dialog.getByLabelText("Name of 901"), { target: { value: "Riverside Blue" } });
        fireEvent.click(dialog.getByRole("button", { name: "Done" }));
        expect(within(screen.getByRole("button", { name: "Edit 903 Hilltop M1" })).queryByText("My team")).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: SAVE_SETUP_LABEL }));
        await waitFor(async () => {
            const saved = await store.getRankings();
            expect(saved.success && saved.data!.myTeam).toBe("901");
            expect(saved.success && saved.data!.teams[0].name).toBe("Riverside Blue");
        });
    });

    it("finds teams by name or number, by bracket, and those excluded or without games", async () => {
        const { store } = memoryStore();
        const base = sampleRankingsDoc();
        await store.saveRankings(
            sampleRankingsDoc({
                teams: [...base.teams.map((t) => (t.number === "902" ? { ...t, excluded: true } : t)), { number: "905", name: "Pinewood M1", startingBracket: null, excluded: false }],
            }),
        );
        renderScreen(<RankingsSetupScreen store={store} />, store);
        await openTab("Teams");
        const list = () => within(screen.getByRole("list", { name: "Teams" }));
        const shown = () => list().getAllByRole("button").map((b) => b.getAttribute("aria-label"));
        expect(shown()).toHaveLength(5);
        // A row shows its record from final games: 901 won both.
        expect(within(screen.getByRole("button", { name: "Edit 901 Riverside M1" })).getByText("2–0–0")).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText(TEAM_SEARCH_LABEL), { target: { value: "brook" } });
        expect(shown()).toEqual(["Edit 904 Brookside M1"]);
        fireEvent.change(screen.getByLabelText(TEAM_SEARCH_LABEL), { target: { value: "90" } });
        expect(shown()).toHaveLength(5);
        fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));

        fireEvent.change(screen.getByLabelText("Bracket"), { target: { value: "none" } });
        expect(shown()).toEqual(["Edit 905 Pinewood M1"]);
        fireEvent.change(screen.getByLabelText("Bracket"), { target: { value: "all" } });

        fireEvent.click(screen.getByRole("button", { name: /^Excluded/ }));
        expect(shown()).toEqual(["Edit 902 Lakeview M2"]);
        fireEvent.click(screen.getByRole("button", { name: /^No games/ }));
        expect(shown()).toEqual(["Edit 905 Pinewood M1"]);
        fireEvent.change(screen.getByLabelText(TEAM_SEARCH_LABEL), { target: { value: "zzz" } });
        expect(screen.getByText(NO_TEAMS_MATCH)).toBeInTheDocument();
    });

    it("lists games by day as scoreboard cards and filters them", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc());
        renderScreen(<RankingsSetupScreen store={store} />, store);
        await openTab("Games");
        const days = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
        expect(days).toEqual(["Sun 20 Sep 2026", "Mon 21 Sep 2026", "Tue 22 Sep 2026", "Wed 23 Sep 2026", "Thu 24 Sep 2026", "Mon 12 Oct 2026"]);
        const scheduled = screen.getByRole("button", { name: "Edit game 2026-10-12 903 vs 904" });
        expect(within(scheduled).getByText("Scheduled")).toBeInTheDocument();
        expect(within(scheduled).getByText("Rink B")).toBeInTheDocument();
        expect(within(screen.getByRole("button", { name: "Edit game 2026-09-22 901 vs 903" })).getByText("12")).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText("Team"), { target: { value: "904" } });
        expect(screen.getAllByRole("button", { name: /^Edit game/ }).map((b) => b.getAttribute("aria-label"))).toEqual([
            "Edit game 2026-09-23 904 vs 903",
            "Edit game 2026-09-24 902 vs 904",
            "Edit game 2026-10-12 903 vs 904",
        ]);
        fireEvent.click(screen.getByRole("button", { name: "Scheduled" }));
        expect(screen.getAllByRole("button", { name: /^Edit game/ })).toHaveLength(1);
        fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
        fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-09-21" } });
        expect(screen.getAllByRole("button", { name: /^Edit game/ }).map((b) => b.getAttribute("aria-label"))).toEqual(["Edit game 2026-09-21 902 vs 903"]);
    });

    it("shows a long schedule a page at a time", async () => {
        const { store } = memoryStore();
        const base = sampleRankingsDoc();
        const total = GAMES_PAGE_SIZE + 5;
        const many = Array.from({ length: total }, (_, i) => ({ ...base.games[0], date: `2026-09-${String(1 + (i % 28)).padStart(2, "0")}` }));
        await store.saveRankings(sampleRankingsDoc({ games: many }));
        renderScreen(<RankingsSetupScreen store={store} />, store);
        await openTab("Games");
        expect(screen.getAllByRole("button", { name: /^Edit game/ })).toHaveLength(GAMES_PAGE_SIZE);
        expect(screen.getByText(`Showing ${GAMES_PAGE_SIZE} of ${total} games`)).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Show 5 more (5 left)" }));
        expect(screen.getAllByRole("button", { name: /^Edit game/ })).toHaveLength(total);
        expect(screen.queryByRole("button", { name: /^Show \d+ more/ })).not.toBeInTheDocument();
    });

    it("adds a game, and deletes one", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc());
        renderScreen(<RankingsSetupScreen store={store} />, store);
        await openTab("Games");
        fireEvent.click(screen.getByRole("button", { name: ADD_GAME_LABEL }));
        const add = within(screen.getByRole("dialog"));
        const confirm = add.getByRole("button", { name: ADD_GAME_LABEL });
        expect(confirm).toBeDisabled();
        fireEvent.change(add.getByLabelText("Date"), { target: { value: "2026-10-03" } });
        fireEvent.change(add.getByLabelText("Home team"), { target: { value: "904" } });
        fireEvent.change(add.getByLabelText("Away team"), { target: { value: "904" } });
        expect(add.getByText(SAME_TEAM_MESSAGE)).toBeInTheDocument();
        expect(confirm).toBeDisabled();
        fireEvent.change(add.getByLabelText("Away team"), { target: { value: "901" } });
        fireEvent.change(add.getByLabelText("Home"), { target: { value: "2" } });
        fireEvent.change(add.getByLabelText("Away"), { target: { value: "5" } });
        fireEvent.change(add.getByLabelText("Rink"), { target: { value: "Rink A" } });
        fireEvent.click(confirm);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

        const edit = openDialog("Edit game 2026-09-21 902 vs 903");
        fireEvent.click(edit.getByRole("button", { name: "Delete this game" }));
        expect(screen.queryByRole("button", { name: "Edit game 2026-09-21 902 vs 903" })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: SAVE_SETUP_LABEL }));
        await waitFor(async () => {
            const saved = await store.getRankings();
            if (!saved.success || !saved.data) throw new Error("not saved");
            expect(saved.data.games).toHaveLength(6);
            expect(saved.data.games.some((g) => g.date === "2026-09-21")).toBe(false);
            expect(saved.data.games.at(-1)).toEqual({ date: "2026-10-03", time: null, home: "904", away: "901", homeGoals: 2, awayGoals: 5, status: "final", rink: "Rink A" });
        });
    });

    it("opens at the section its route names", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc());
        renderScreen(<RankingsSetupScreen store={store} section="pages" />, store);
        expect(await screen.findByRole("tab", { name: "League pages" })).toHaveAttribute("aria-selected", "true");
        expect(screen.getByLabelText(SCHEDULE_PAGE_LABEL)).toBeInTheDocument();
    });

    it("opens a team's games from its dialog", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc());
        renderScreen(<RankingsSetupScreen store={store} />, store);
        await openTab("Teams");
        const dialog = openDialog("Edit 902 Lakeview M2");
        fireEvent.click(dialog.getByRole("button", { name: "Show this team's games" }));
        expect(screen.getByRole("tab", { name: /^Games/ })).toHaveAttribute("aria-selected", "true");
        expect(screen.getByLabelText("Team")).toHaveValue("902");
        expect(screen.getAllByRole("button", { name: /^Edit game/ })).toHaveLength(3);
    });
});

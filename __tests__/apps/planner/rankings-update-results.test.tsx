// __tests__/apps/planner/rankings-update-results.test.tsx
/** Remembered league pages and the one-step Update results flow. Fictional addresses only (spec R6). */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { RankingsScreen } from "@/apps/planner/src/screens/rankings/RankingsScreen";
import {
    READ_SCHEDULE_LABEL,
    RankingsImportScreen,
    SAVE_IMPORT_LABEL,
    SCHEDULE_ADDRESS_LABEL,
    UPDATE_HINT,
} from "@/apps/planner/src/screens/rankings/RankingsImportScreen";
import { RankingsSetupScreen, SAVE_SETUP_LABEL, SCHEDULE_PAGE_LABEL, SNAKE_PAGE_LABEL } from "@/apps/planner/src/screens/rankings/RankingsSetupScreen";
import {
    ADD_SCHEDULE_PAGE_LABEL,
    NEVER_UPDATED_LABEL,
    NO_SCHEDULE_PAGE_MESSAGE,
    UPDATE_RESULTS_LABEL,
    UpdateResultsPanel,
    relativeDay,
} from "@/apps/planner/src/screens/rankings/UpdateResultsPanel";
import { staticRoutes } from "@/apps/planner/src/routes";
import { SOURCE_URL_MESSAGE } from "@/lib/rankings-document";
import { memoryStore, renderScreen } from "./render-screen";
import { sampleRankingsDoc } from "./rankings-fixtures";
import { SCHEDULE_HTML } from "../../lib/ratings/league-page-fixtures";

const SCHEDULE_URL = "https://league.example/schedule?division=8u";
const SNAKE_URL = "https://league.example/snake-chart";
const READ_AT = "2026-10-04T15:00:00.000Z";

const clipboard = (data: Record<string, string>) => ({ clipboardData: { getData: (type: string) => data[type] ?? "" } });

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    window.location.hash = "";
});

async function saved(store: ReturnType<typeof memoryStore>["store"]) {
    const result = await store.getRankings();
    if (!result.success || !result.data) throw new Error("nothing saved");
    return result.data;
}

describe("Rankings screen: Update results", () => {
    it("opens the saved schedule page in a new tab and goes on to the import paste box", async () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(new Date("2026-10-07T12:00:00"));
        const open = vi.spyOn(window, "open").mockImplementation(() => null);
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc({ sources: { schedule: { url: SCHEDULE_URL, lastReadAt: new Date("2026-10-04T12:00:00").toISOString() } } }));
        renderScreen(<RankingsScreen store={store} />, store);

        const action = await screen.findByRole("link", { name: UPDATE_RESULTS_LABEL });
        expect(screen.getByText("Last updated 3 days ago")).toBeInTheDocument();
        expect(action).toHaveAttribute("href", SCHEDULE_URL);
        expect(action).toHaveAttribute("target", "_blank");
        expect(action).toHaveAttribute("rel", "noopener noreferrer");

        fireEvent.click(action);
        expect(open).toHaveBeenCalledTimes(1);
        expect(open.mock.calls[0][0]).toBe(SCHEDULE_URL);
        expect(open.mock.calls[0][1]).toBe("_blank");
        expect(open.mock.calls[0][2]).toContain("noopener");
        expect(window.location.hash).toBe(staticRoutes.rankingsUpdate());
    });

    it("invites the user to add the schedule page when none is saved", async () => {
        const open = vi.spyOn(window, "open").mockImplementation(() => null);
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc());
        renderScreen(<RankingsScreen store={store} />, store);
        expect(await screen.findByText(NO_SCHEDULE_PAGE_MESSAGE)).toBeInTheDocument();
        expect(screen.getByRole("link", { name: ADD_SCHEDULE_PAGE_LABEL })).toHaveAttribute("href", staticRoutes.rankingsSetup());
        expect(screen.queryByRole("link", { name: UPDATE_RESULTS_LABEL })).not.toBeInTheDocument();
        expect(open).not.toHaveBeenCalled();
    });

    it("says when a saved page hasn't been read yet, and has an unused slot for a second action", () => {
        renderScreen(
            <UpdateResultsPanel source={{ url: SCHEDULE_URL, lastReadAt: null }} fetchAction={<button type="button">Fetch it for me</button>} />,
            memoryStore().store,
        );
        expect(screen.getByText(NEVER_UPDATED_LABEL)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Fetch it for me" })).toBeInTheDocument();
    });

    it("words the last update in calendar days", () => {
        const now = new Date("2026-10-07T09:00:00");
        expect(relativeDay("2026-10-07T08:00:00", now)).toBe("today");
        expect(relativeDay("2026-10-06T23:00:00", now)).toBe("yesterday");
        expect(relativeDay("2026-10-04T12:00:00", now)).toBe("3 days ago");
        expect(relativeDay("2026-09-28T12:00:00", now)).toBe("last week");
        expect(relativeDay("2026-08-01T12:00:00", now)).toBe("2 months ago");
    });
});

describe("Import: remembering the pages", () => {
    it("captures the page address with a paste and stamps when it was read", async () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(new Date(READ_AT));
        const { store } = memoryStore();
        renderScreen(<RankingsImportScreen store={store} />, store);
        fireEvent.change(await screen.findByLabelText("Season starts in"), { target: { value: "2026" } });
        fireEvent.paste(screen.getByLabelText("Schedule page"), clipboard({ "text/html": SCHEDULE_HTML }));
        fireEvent.change(screen.getByLabelText(SCHEDULE_ADDRESS_LABEL), { target: { value: SCHEDULE_URL } });
        fireEvent.click(screen.getByRole("button", { name: SAVE_IMPORT_LABEL }));
        await waitFor(async () => expect((await saved(store)).sources).toEqual({ schedule: { url: SCHEDULE_URL, lastReadAt: READ_AT } }));
    });

    it("won't save an address that isn't https", async () => {
        const { store } = memoryStore();
        renderScreen(<RankingsImportScreen store={store} />, store);
        fireEvent.change(await screen.findByLabelText("Season starts in"), { target: { value: "2026" } });
        fireEvent.paste(screen.getByLabelText("Schedule page"), clipboard({ "text/html": SCHEDULE_HTML }));
        fireEvent.change(screen.getByLabelText(SCHEDULE_ADDRESS_LABEL), { target: { value: "http://league.example/schedule" } });
        expect(screen.getByText(SOURCE_URL_MESSAGE)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: SAVE_IMPORT_LABEL })).toBeDisabled();
    });

    it("arrives from Update results with the paste box focused, the hint shown and the saved address filled in", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc({ sources: { schedule: { url: SCHEDULE_URL, lastReadAt: READ_AT } } }));
        renderScreen(<RankingsImportScreen store={store} update />, store);
        const box = await screen.findByLabelText("Schedule page");
        expect(box).toHaveFocus();
        expect(screen.getByText(UPDATE_HINT)).toBeInTheDocument();
        expect(screen.getByLabelText(SCHEDULE_ADDRESS_LABEL)).toHaveValue(SCHEDULE_URL);
    });

    it("shows the merge summary after an update, and saves with a fresh read time", async () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(new Date("2026-10-07T18:00:00.000Z"));
        const { store } = memoryStore();
        await store.saveRankings(
            sampleRankingsDoc({ sources: { schedule: { url: SCHEDULE_URL, lastReadAt: READ_AT }, snakeChart: { url: SNAKE_URL, lastReadAt: READ_AT } } }),
        );
        renderScreen(<RankingsImportScreen store={store} update />, store);
        fireEvent.change(await screen.findByLabelText("Season starts in"), { target: { value: "2026" } });
        const page = [
            ["9/20", "9:00am", "901 Riverside M1", "3 - 1", "902 Lakeview M2"], // unchanged
            ["9/21", "9:00am", "902 Lakeview M2", "5 - 1", "903 Hilltop M1"], // conflict (saved 4–1)
            ["10/12", "8:00am", "903 Hilltop M1", "4 - 2", "904 Brookside M1"], // a scheduled game gets its result
            ["10/19", "9:00am", "901 Riverside M1", "904 Brookside M1"], // new
        ]
            .flat()
            .join("\n");
        fireEvent.change(screen.getByLabelText("Schedule page"), { target: { value: page } });
        fireEvent.click(screen.getByRole("button", { name: READ_SCHEDULE_LABEL }));
        expect(await screen.findByText("1 added · 1 updated · 1 unchanged · 1 conflict")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Keep 4–1" }));
        fireEvent.click(screen.getByRole("button", { name: SAVE_IMPORT_LABEL }));
        await waitFor(async () => expect((await saved(store)).games).toHaveLength(7));
        const doc = await saved(store);
        // The schedule was read now; the snake chart wasn't, so it keeps its time.
        expect(doc.sources).toEqual({
            schedule: { url: SCHEDULE_URL, lastReadAt: "2026-10-07T18:00:00.000Z" },
            snakeChart: { url: SNAKE_URL, lastReadAt: READ_AT },
        });
    });
});

describe("Setup: the league pages", () => {
    it("adds, changes and removes the page addresses", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc({ sources: { schedule: { url: SCHEDULE_URL, lastReadAt: READ_AT } } }));
        renderScreen(<RankingsSetupScreen store={store} />, store);
        expect(await screen.findByLabelText(SCHEDULE_PAGE_LABEL)).toHaveValue(SCHEDULE_URL);
        fireEvent.change(screen.getByLabelText(SNAKE_PAGE_LABEL), { target: { value: SNAKE_URL } });
        fireEvent.click(screen.getByRole("button", { name: SAVE_SETUP_LABEL }));
        await waitFor(async () =>
            expect((await saved(store)).sources).toEqual({ schedule: { url: SCHEDULE_URL, lastReadAt: READ_AT }, snakeChart: { url: SNAKE_URL, lastReadAt: null } }),
        );
    });

    it("forgets a page whose address is cleared, and refuses one that isn't https", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc({ sources: { schedule: { url: SCHEDULE_URL, lastReadAt: READ_AT } } }));
        renderScreen(<RankingsSetupScreen store={store} />, store);
        fireEvent.change(await screen.findByLabelText(SNAKE_PAGE_LABEL), { target: { value: "http://league.example/snake" } });
        fireEvent.click(screen.getByRole("button", { name: SAVE_SETUP_LABEL }));
        expect(await screen.findAllByText(SOURCE_URL_MESSAGE)).not.toHaveLength(0);
        expect((await saved(store)).sources?.snakeChart).toBeUndefined();

        fireEvent.change(screen.getByLabelText(SNAKE_PAGE_LABEL), { target: { value: "" } });
        fireEvent.change(screen.getByLabelText(SCHEDULE_PAGE_LABEL), { target: { value: "" } });
        fireEvent.click(screen.getByRole("button", { name: SAVE_SETUP_LABEL }));
        await waitFor(async () => expect("sources" in (await saved(store))).toBe(false));
    });
});

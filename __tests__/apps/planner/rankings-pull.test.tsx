/** The static side of "Fetch it for me" (ADR-0024): the pull route, the hosted link and the import preview. */
import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { matchRoute, staticRoutes } from "@/apps/planner/src/routes";
import { hostedFetchUrl, HOSTED_URL } from "@/apps/planner/src/config";
import { RankingsImportScreen, SAVE_IMPORT_LABEL } from "@/apps/planner/src/screens/rankings/RankingsImportScreen";
import { pulledScheduleLabel, readPulledSchedule } from "@/apps/planner/src/screens/rankings/pulled-schedule";
import { encodeSchedulePull, PULL_NEWER_MESSAGE, PULL_UNREADABLE_MESSAGE, SCHEDULE_PULL_FORMAT } from "@/lib/rankings-document";
import { base64UrlEncode, deflateRaw } from "@/lib/plan-document/link";
import { leagueSourceFragmentValue } from "@/lib/plan-document/pending";
import { RankingsScreen } from "@/apps/planner/src/screens/rankings/RankingsScreen";
import { FetchForMeAction, FETCH_FOR_ME_LABEL, FETCH_FOR_ME_NOTE } from "@/apps/planner/src/screens/rankings/FetchForMeAction";
import { UPDATE_RESULTS_LABEL } from "@/apps/planner/src/screens/rankings/UpdateResultsPanel";
import { memoryStore, renderScreen } from "./render-screen";
import { sampleRankingsDoc } from "./rankings-fixtures";
import { fictionalPull, fictionalSchedule } from "../../lib/rankings-document/pull-fixtures";

afterEach(() => {
    window.history.replaceState(null, "", "/");
});

describe("pull route", () => {
    it.each([
        ["#/rankings/import?pull=abc_-1", { name: "rankingsImport", pull: "abc_-1" }],
        ["#rankings/import?pull=abc", { name: "rankingsImport", pull: "abc" }],
        ["#/rankings/import/?pull=abc", { name: "rankingsImport", pull: "abc" }],
        ["#/rankings/import?pull=", { name: "rankingsImport" }],
        ["#/rankings/import?other=1", { name: "rankingsImport" }],
        ["#/rankings?pull=abc", { name: "notFound" }],
        ["#/library?pull=abc", { name: "notFound" }],
    ])("%s", (hash, expected) => {
        expect(matchRoute(hash)).toEqual(expected);
    });

    it("is not mistaken for a plan link", () => {
        expect(matchRoute("#/rankings/import?pull=plan").name).toBe("rankingsImport");
    });

    it("leaves the plain import route as it was", () => {
        expect(matchRoute(staticRoutes.rankingsImport())).toEqual({ name: "rankingsImport" });
    });
});

describe("hostedFetchUrl", () => {
    it("puts the league address in the fragment, where the login carry-over reads it", () => {
        const league = "https://league.example.org/schedule?division=8u&x=1";
        const url = new URL(hostedFetchUrl(league));
        expect(`${url.origin}`).toBe(HOSTED_URL);
        expect(url.pathname).toBe("/practice-planner/fetch-schedule");
        expect(url.search).toBe("");
        expect(leagueSourceFragmentValue(url.hash)).toBe(league);
    });
});

describe("readPulledSchedule", () => {
    it("reads a pull as a labelled page source", async () => {
        const result = await readPulledSchedule(await encodeSchedulePull(fictionalPull()));
        expect(result.ok && result.schedule.label).toBe(pulledScheduleLabel("league.example.org"));
        expect(result.ok && result.schedule.sourceUrl).toBe("https://league.example.org/schedule?division=8u");
    });

    it("words a newer version and a damaged pull for the user", async () => {
        const newer = base64UrlEncode(await deflateRaw(new TextEncoder().encode(JSON.stringify({ f: SCHEDULE_PULL_FORMAT, v: 9 }))));
        expect(await readPulledSchedule(newer)).toEqual({ ok: false, message: PULL_NEWER_MESSAGE });
        expect(await readPulledSchedule("%%%")).toEqual({ ok: false, message: PULL_UNREADABLE_MESSAGE });
    });
});

describe("RankingsImportScreen with a pull", () => {
    it("previews the pulled schedule, clears it from the address bar and saves only on the user's OK", async () => {
        const pull = fictionalPull(fictionalSchedule(10));
        const value = await encodeSchedulePull(pull);
        window.history.replaceState(null, "", `/#/rankings/import?pull=${value}`);
        const { store } = memoryStore();
        renderScreen(<RankingsImportScreen store={store} pull={value} />, store);

        expect(await screen.findByText(/8 completed games, 2 scheduled/)).toBeInTheDocument();
        expect(screen.getByText(/Schedule fetched from league\.example\.org/)).toBeInTheDocument();
        expect(window.location.hash).toBe("#/rankings/import");

        const before = await store.getRankings();
        expect(before.success && before.data).toBeFalsy();

        fireEvent.click(screen.getByRole("button", { name: SAVE_IMPORT_LABEL }));
        await waitFor(async () => {
            const saved = await store.getRankings();
            expect(saved.success && saved.data?.games).toHaveLength(10);
        });
    });

    it("shows a damaged pull as an error and loads nothing", async () => {
        const { store } = memoryStore();
        renderScreen(<RankingsImportScreen store={store} pull="AAAA" />, store);
        expect(await screen.findByText(PULL_UNREADABLE_MESSAGE)).toBeInTheDocument();
        expect(screen.queryByText(/Schedule fetched from/)).not.toBeInTheDocument();
    });
});

describe("Fetch it for me button", () => {
    const LEAGUE = "https://league.example.org/schedule?division=8u";

    it("links to the hosted fetch page with the saved schedule address, with its note and a 44px target", () => {
        const { store } = memoryStore();
        renderScreen(<FetchForMeAction source={{ url: LEAGUE, lastReadAt: null }} />, store);
        const link = screen.getByRole("link", { name: FETCH_FOR_ME_LABEL });
        expect(link).toHaveAttribute("href", hostedFetchUrl(LEAGUE));
        expect(leagueSourceFragmentValue(new URL(link.getAttribute("href")!).hash)).toBe(LEAGUE);
        expect(link).toHaveAccessibleDescription(FETCH_FOR_ME_NOTE);
        expect(getComputedStyle(link).minHeight).toBe("44px");
    });

    it("renders nothing without a saved schedule page", () => {
        const { store } = memoryStore();
        const { container } = renderScreen(<FetchForMeAction source={null} />, store);
        expect(container).toBeEmptyDOMElement();
    });

    it("sits in the Update results panel when a schedule page is saved", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc({ sources: { schedule: { url: LEAGUE, lastReadAt: null } } }));
        renderScreen(<RankingsScreen store={store} />, store);
        const panel = await screen.findByRole("region", { name: UPDATE_RESULTS_LABEL });
        expect(within(panel).getByRole("link", { name: FETCH_FOR_ME_LABEL })).toHaveAttribute("href", hostedFetchUrl(LEAGUE));
    });

    it("is absent from the panel when no schedule page is saved", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc());
        renderScreen(<RankingsScreen store={store} />, store);
        const panel = await screen.findByRole("region", { name: UPDATE_RESULTS_LABEL });
        expect(within(panel).queryByRole("link", { name: FETCH_FOR_ME_LABEL })).toBeNull();
    });
});

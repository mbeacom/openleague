/** The #src= hand-off across login for "Fetch it for me" (ADR-0024), beside the #plan= one. */
import { beforeEach, describe, expect, it } from "vitest";
import {
    MAX_LEAGUE_SOURCE_LENGTH,
    PENDING_LEAGUE_SOURCE_KEY,
    PENDING_PLAN_KEY,
    PENDING_PLAN_TTL_MS,
    hasPendingLeagueSource,
    hasPendingPlan,
    leagueSourceFragmentValue,
    stashLeagueSourceFragment,
    stashPlanFragment,
    takeIncomingLeagueSource,
} from "@/lib/plan-document/pending";

const NOW = Date.parse("2026-10-07T18:00:00.000Z");
const LEAGUE = "https://league.example.org/schedule?division=8u";
const SRC = `#src=${encodeURIComponent(LEAGUE)}`;

beforeEach(() => {
    sessionStorage.clear();
    window.history.replaceState(null, "", "/");
});

describe("leagueSourceFragmentValue", () => {
    it("reads and decodes the src value", () => {
        expect(leagueSourceFragmentValue(SRC)).toBe(LEAGUE);
        expect(leagueSourceFragmentValue("#plan=abc")).toBeNull();
    });
    it("ignores a value too long to be a page address", () => {
        expect(leagueSourceFragmentValue(`#src=${"a".repeat(MAX_LEAGUE_SOURCE_LENGTH + 1)}`)).toBeNull();
    });
});

describe("login carry-over", () => {
    it("stashes #src= under its own key and clears the hash; the plan stash ignores it", () => {
        window.history.replaceState(null, "", `/login${SRC}`);
        expect(stashPlanFragment(NOW)).toBe(false);
        expect(window.location.hash).toBe(SRC);
        expect(stashLeagueSourceFragment(NOW)).toBe(true);
        expect(window.location.hash).toBe("");
        expect(sessionStorage.getItem(PENDING_PLAN_KEY)).toBeNull();
        expect(JSON.parse(sessionStorage.getItem(PENDING_LEAGUE_SOURCE_KEY) ?? "null")).toEqual({ value: LEAGUE, savedAt: NOW });
        expect(hasPendingLeagueSource(NOW)).toBe(true);
        expect(hasPendingPlan(NOW)).toBe(false);
    });

    it("expires like a plan stash", () => {
        window.history.replaceState(null, "", `/login${SRC}`);
        stashLeagueSourceFragment(NOW);
        expect(hasPendingLeagueSource(NOW + PENDING_PLAN_TTL_MS + 1)).toBe(false);
    });

    it("the fetch page takes the fragment first, else the stash, and clears both", () => {
        window.history.replaceState(null, "", `/login${SRC}`);
        stashLeagueSourceFragment(NOW);
        window.history.replaceState(null, "", "/practice-planner/fetch-schedule");
        expect(takeIncomingLeagueSource(NOW)).toBe(LEAGUE);
        expect(takeIncomingLeagueSource(NOW)).toBeNull();

        window.history.replaceState(null, "", `/practice-planner/fetch-schedule${SRC}`);
        expect(takeIncomingLeagueSource(NOW)).toBe(LEAGUE);
        expect(window.location.hash).toBe("");
    });
});

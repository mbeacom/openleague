import { describe, expect, it } from "vitest";
import { LEAGUE_FETCH_TIMEOUT_MS } from "@/lib/league-fetch/guard";
import { DEFAULT_STATIC_PLANNER_URL, leagueFetchAllowedHosts, leagueFetchTimeoutMs, staticPlannerBaseUrl, staticPullUrl } from "@/lib/league-fetch/config";

describe("leagueFetchTimeoutMs", () => {
    it("defaults to 60 s", () => {
        expect(LEAGUE_FETCH_TIMEOUT_MS).toBe(60_000);
        expect(leagueFetchTimeoutMs({})).toBe(60_000);
    });

    it.each([
        [undefined, 60_000],
        ["", 60_000],
        ["  ", 60_000],
        ["abc", 60_000],
        ["Infinity", 60_000],
        ["30000", 30_000],
        [" 45000 ", 45_000],
        ["1", 5_000],
        ["0", 5_000],
        ["-100", 5_000],
        ["5000", 5_000],
        ["90000", 90_000],
        ["120000", 90_000],
        ["99999999", 90_000],
    ])("LEAGUE_FETCH_TIMEOUT_MS=%j -> %i ms", (raw, expected) => {
        expect(leagueFetchTimeoutMs({ LEAGUE_FETCH_TIMEOUT_MS: raw })).toBe(expected);
    });
});

describe("staticPlannerBaseUrl", () => {
    it.each([
        [undefined, DEFAULT_STATIC_PLANNER_URL],
        ["", DEFAULT_STATIC_PLANNER_URL],
        ["not a url", DEFAULT_STATIC_PLANNER_URL],
        ["http://planner.example.org/", DEFAULT_STATIC_PLANNER_URL],
        ["javascript:alert(1)", DEFAULT_STATIC_PLANNER_URL],
        ["https://planner.example.org/planner", "https://planner.example.org/planner/"],
        ["https://planner.example.org/planner/?x=1#/old", "https://planner.example.org/planner/"],
        ["http://localhost:5173/", "http://localhost:5173/"],
    ])("%j → %s", (raw, expected) => {
        expect(staticPlannerBaseUrl(raw)).toBe(expected);
    });

    it("builds the pull URL on the configured base", () => {
        expect(staticPullUrl("abc", "https://planner.example.org/")).toBe("https://planner.example.org/#/rankings/import?pull=abc");
    });
});

describe("leagueFetchAllowedHosts", () => {
    it("reads LEAGUE_FETCH_ALLOWED_HOSTS", () => {
        expect(leagueFetchAllowedHosts({ LEAGUE_FETCH_ALLOWED_HOSTS: "a.example.org,b.example.org" })).toEqual(["a.example.org", "b.example.org"]);
        expect(leagueFetchAllowedHosts({})).toEqual(["www.cshlhockey.org"]);
    });
});

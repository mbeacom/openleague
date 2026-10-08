import { describe, expect, it } from "vitest";
import { DEFAULT_STATIC_PLANNER_URL, leagueFetchAllowedHosts, staticPlannerBaseUrl, staticPullUrl } from "@/lib/league-fetch/config";

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

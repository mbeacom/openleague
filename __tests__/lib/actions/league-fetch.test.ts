/** "Fetch it for me" server action (ADR-0024). Fetch and DNS are mocked: no network. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SCHEDULE_HTML } from "../ratings/league-page-fixtures";

const mocks = vi.hoisted(() => ({
    requireUserId: vi.fn(),
    checkRateLimit: vi.fn(),
    lookup: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireUserId: mocks.requireUserId }));
vi.mock("@/lib/utils/durable-rate-limit", () => ({
    checkRateLimit: mocks.checkRateLimit,
    rateLimitMessage: () => "Too many requests — try again in 30 minutes.",
    RATE_LIMITS: { LEAGUE_FETCH_PER_USER: { limit: 10, windowSec: 3600 } },
}));
vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup, default: { lookup: mocks.lookup } }));

import { fetchLeagueSchedule } from "@/lib/actions/league-fetch";
import { decodeSchedulePull, ROBOTS_DISALLOWED_MESSAGE, ROBOTS_UNAVAILABLE_MESSAGE } from "@/lib/rankings-document";
import { leagueFetchRobotsGate } from "@/lib/league-fetch/config";
import { LEAGUE_FETCH_USER_AGENT } from "@/lib/league-fetch/guard";

const USER = "cuserxxxxxxxxxxxxxxxxxxxx";
const HOST = "league.example.org";
const PAGE = `https://${HOST}/schedule/8u`;
const PLANNER = "https://planner.example.org/planner/";

const fetchMock = vi.fn();
/** robots.txt requests go here; every other request to fetchMock. No robots.txt (404) unless a test says otherwise. */
const robotsMock = vi.fn();

function page(body = SCHEDULE_HTML, init: ResponseInit = {}) {
    return new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" }, ...init });
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("LEAGUE_FETCH_ALLOWED_HOSTS", HOST);
    vi.stubEnv("NEXT_PUBLIC_STATIC_PLANNER_URL", PLANNER);
    leagueFetchRobotsGate.clear();
    robotsMock.mockResolvedValue(new Response("", { status: 404 }));
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) => (String(url).endsWith("/robots.txt") ? robotsMock(url, init) : fetchMock(url, init)));
    vi.spyOn(console, "info").mockImplementation(() => {});
    mocks.requireUserId.mockResolvedValue(USER);
    mocks.checkRateLimit.mockResolvedValue({ allowed: true });
    mocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe("fetchLeagueSchedule", () => {
    it("requires sign-in before anything else", async () => {
        const redirect = new Error("NEXT_REDIRECT");
        mocks.requireUserId.mockRejectedValue(redirect);
        await expect(fetchLeagueSchedule({ url: PAGE })).rejects.toBe(redirect);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    });

    it.each([[""], ["not a url"], ["x".repeat(3000)]])("rejects an invalid URL %#", async (url) => {
        const result = await fetchLeagueSchedule({ url });
        expect(result.success).toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    });

    it("rejects a disallowed host without using up the rate limit", async () => {
        const result = await fetchLeagueSchedule({ url: "https://evil.example.net/schedule" });
        expect(result).toMatchObject({ success: false, error: "OpenLeague can't fetch pages from that site yet.", details: { kind: "host-not-allowed" } });
        expect(mocks.checkRateLimit).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects an http URL", async () => {
        expect(await fetchLeagueSchedule({ url: `http://${HOST}/schedule` })).toMatchObject({ success: false, details: { kind: "not-https" } });
    });

    it("refuses a redirect to another host", async () => {
        fetchMock.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://elsewhere.example.net/" } }));
        expect(await fetchLeagueSchedule({ url: PAGE })).toMatchObject({ success: false, details: { kind: "redirect-off-host" } });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("refuses an oversized page", async () => {
        fetchMock.mockResolvedValueOnce(page("x".repeat(2 * 1024 * 1024 + 1)));
        expect(await fetchLeagueSchedule({ url: PAGE })).toMatchObject({ success: false, error: "That page is larger than OpenLeague will fetch.", details: { kind: "too-large" } });
    });

    it("times out", async () => {
        vi.useFakeTimers();
        fetchMock.mockImplementationOnce(() => new Promise(() => {}));
        const pending = fetchLeagueSchedule({ url: PAGE });
        await vi.advanceTimersByTimeAsync(10_001);
        // Still waiting: the default deadline is 60 s, not 10 s.
        await vi.advanceTimersByTimeAsync(50_000);
        expect(await pending).toMatchObject({ success: false, error: expect.stringMatching(/too slow/), details: { kind: "timeout" } });
    });

    it("uses LEAGUE_FETCH_TIMEOUT_MS as the deadline", async () => {
        vi.useFakeTimers();
        vi.stubEnv("LEAGUE_FETCH_TIMEOUT_MS", "5000");
        fetchMock.mockImplementationOnce(() => new Promise(() => {}));
        const pending = fetchLeagueSchedule({ url: PAGE });
        await vi.advanceTimersByTimeAsync(5_001);
        expect(await pending).toMatchObject({ success: false, details: { kind: "timeout" } });
    });

    it("refuses a non-HTML content type", async () => {
        fetchMock.mockResolvedValueOnce(page("{}", { headers: { "content-type": "application/json" } }));
        expect(await fetchLeagueSchedule({ url: PAGE })).toMatchObject({ success: false, error: "That address isn't a web page.", details: { kind: "content-type" } });
    });

    it("refuses when the host resolves to a private address", async () => {
        mocks.lookup.mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
        expect(await fetchLeagueSchedule({ url: PAGE })).toMatchObject({ success: false, details: { kind: "private-address" } });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("is rate limited per user, fail-closed, before fetching", async () => {
        mocks.checkRateLimit.mockResolvedValueOnce({ allowed: false, retryAfterSec: 1800 });
        const result = await fetchLeagueSchedule({ url: PAGE });
        expect(result).toMatchObject({ success: false, error: "Too many requests — try again in 30 minutes.", details: { kind: "rate-limited" } });
        expect(mocks.checkRateLimit).toHaveBeenCalledWith(`league-fetch:user:${USER}`, { limit: 10, windowSec: 3600 }, { failOpen: false });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("says so when the page has no games", async () => {
        fetchMock.mockResolvedValueOnce(page("<html><body><p>Nothing here</p></body></html>"));
        expect(await fetchLeagueSchedule({ url: PAGE })).toMatchObject({ success: false, details: { kind: "no-games" } });
    });

    it("fetches, parses and returns the configured planner URL carrying the schedule", async () => {
        fetchMock.mockResolvedValueOnce(page());
        const result = await fetchLeagueSchedule({ url: PAGE });
        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data).toMatchObject({ host: HOST, games: 7, teams: 6 });
        const prefix = `${PLANNER}#/rankings/import?pull=`;
        expect(result.data.redirectUrl.startsWith(prefix)).toBe(true);
        const decoded = await decodeSchedulePull(result.data.redirectUrl.slice(prefix.length));
        expect(decoded.ok).toBe(true);
        if (!decoded.ok) return;
        expect(decoded.pull.sourceUrl).toBe(PAGE);
        expect(decoded.pull.schedule.games).toHaveLength(7);
        expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: "omit", redirect: "manual" });
    });

    it("takes the planner URL from configuration only, falling back to the default", async () => {
        vi.stubEnv("NEXT_PUBLIC_STATIC_PLANNER_URL", "");
        fetchMock.mockResolvedValueOnce(page());
        const result = await fetchLeagueSchedule({ url: PAGE });
        expect(result.success && result.data.redirectUrl.startsWith("https://openleague.dev/planner/#/rankings/import?pull=")).toBe(true);
    });

    describe("robots.txt", () => {
        const robots = (body: string, status = 200) => new Response(body, { status, headers: { "content-type": "text/plain" } });

        it("checks robots.txt first with the same User-Agent as the page", async () => {
            fetchMock.mockResolvedValueOnce(page());
            expect((await fetchLeagueSchedule({ url: PAGE })).success).toBe(true);
            expect(robotsMock).toHaveBeenCalledTimes(1);
            expect(robotsMock.mock.calls[0][0]).toBe(`https://${HOST}/robots.txt`);
            expect(robotsMock.mock.calls[0][1].headers["User-Agent"]).toBe(LEAGUE_FETCH_USER_AGENT);
            expect(fetchMock.mock.calls[0][1].headers["User-Agent"]).toBe(LEAGUE_FETCH_USER_AGENT);
            expect(LEAGUE_FETCH_USER_AGENT.startsWith("OpenLeague/")).toBe(true);
        });

        it("refuses a page robots.txt disallows, with the paste-or-upload message, without fetching it", async () => {
            robotsMock.mockResolvedValueOnce(robots("User-agent: *\nDisallow: /schedule/"));
            const result = await fetchLeagueSchedule({ url: PAGE });
            expect(result).toMatchObject({ success: false, error: ROBOTS_DISALLOWED_MESSAGE, details: { kind: "robots-disallowed" } });
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it("fails closed when robots.txt can't be read", async () => {
            robotsMock.mockResolvedValueOnce(robots("", 503));
            const result = await fetchLeagueSchedule({ url: PAGE });
            expect(result).toMatchObject({ success: false, error: ROBOTS_UNAVAILABLE_MESSAGE, details: { kind: "robots-unavailable" } });
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it("refuses a long Crawl-delay with a retry time", async () => {
            robotsMock.mockResolvedValueOnce(robots("User-agent: OpenLeague\nCrawl-delay: 30"));
            const result = await fetchLeagueSchedule({ url: PAGE });
            expect(result).toMatchObject({ success: false, error: expect.stringMatching(/try again in 30 seconds/), details: { kind: "crawl-delay", retryAfterSec: 30 } });
            expect(fetchMock).not.toHaveBeenCalled();
        });
    });
});

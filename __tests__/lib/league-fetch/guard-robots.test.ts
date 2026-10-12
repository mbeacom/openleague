/**
 * robots.txt inside the league page fetch (ADR-0024, 2026-10-11 amendment):
 * fetched under the same SSRF guard and deadline as the page, RFC 9309 status
 * handling, the cache, Crawl-delay spacing and the written-permission list.
 * Fetch and DNS are fakes: no network.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLeaguePage, LEAGUE_FETCH_USER_AGENT, LeagueFetchError, type LeagueFetchLogEntry, type LookupFn } from "@/lib/league-fetch/guard";
import { ROBOTS_CACHE_TTL_MS, ROBOTS_MAX_BYTES, RobotsGate, type RobotsPermission } from "@/lib/league-fetch/robots";

const HOST = "league.example.org";
const ALLOWED = [HOST, "other.example.org"];
const PAGE = `https://${HOST}/schedule/8u`;
const ROBOTS_URL = `https://${HOST}/robots.txt`;
const HTML = "<html><body><table><tr><td>9/26</td></tr></table></body></html>";

const publicLookup: LookupFn = async () => [{ address: "93.184.216.34", family: 4 }];

const html = () => new Response(HTML, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
const robots = (body: string, init: ResponseInit = {}) => new Response(body, { status: 200, headers: { "content-type": "text/plain" }, ...init });
const status = (code: number) => new Response("", { status: code });
const redirect = (location: string) => new Response(null, { status: 301, headers: { location } });

type Reply = Response | (() => Promise<Response>);

/** A fake fetch that answers robots.txt and page requests from separate queues. */
function setup({ robotsReplies = [] as Reply[], pageReplies = [] as Reply[], lookup = publicLookup, permissions = [] as RobotsPermission[] } = {}) {
    const robotsQueue = [...robotsReplies];
    const pageQueue = [...pageReplies];
    const fetchImpl = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
        const queue = new URL(String(url)).pathname === "/robots.txt" ? robotsQueue : pageQueue;
        const next = queue.shift();
        if (!next) throw new Error(`unexpected fetch of ${String(url)}`);
        return typeof next === "function" ? next() : next;
    });
    const log = vi.fn<(entry: LeagueFetchLogEntry) => void>();
    const lookupSpy = vi.fn(lookup);
    const gate = new RobotsGate({ permissions });
    const run = (url = PAGE, extra: Record<string, unknown> = {}) =>
        fetchLeaguePage(url, { allowedHosts: ALLOWED, robots: gate, fetchImpl: fetchImpl as unknown as typeof fetch, lookup: lookupSpy, log, ...extra });
    const urls = () => fetchImpl.mock.calls.map(([url]) => String(url));
    return { fetchImpl, log, lookup: lookupSpy, gate, run, urls, robotsQueue, pageQueue };
}

async function kindOf(promise: Promise<unknown>): Promise<string> {
    try {
        await promise;
    } catch (error) {
        if (error instanceof LeagueFetchError) return error.kind;
        throw error;
    }
    return "ok";
}

afterEach(() => {
    vi.useRealTimers();
});

describe("robots.txt request", () => {
    it("is fetched first, through the guard, with the page's User-Agent and no credentials", async () => {
        const t = setup({ robotsReplies: [robots("User-agent: *\nAllow: /")], pageReplies: [html()] });
        await expect(t.run()).resolves.toMatchObject({ html: HTML });
        expect(t.urls()).toEqual([ROBOTS_URL, PAGE]);
        const init = t.fetchImpl.mock.calls[0][1]!;
        expect(init).toMatchObject({ method: "GET", redirect: "manual", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer" });
        expect(init.headers).toEqual({ "User-Agent": LEAGUE_FETCH_USER_AGENT, Accept: "text/plain" });
        expect((t.fetchImpl.mock.calls[1][1]!.headers as Record<string, string>)["User-Agent"]).toBe(LEAGUE_FETCH_USER_AGENT);
        // The DNS check runs for the robots request as well as the page.
        expect(t.lookup).toHaveBeenCalledTimes(2);
    });

    it("never reaches a host that resolves to a private address", async () => {
        const t = setup({ lookup: async () => [{ address: "10.0.0.5", family: 4 }] });
        expect(await kindOf(t.run())).toBe("private-address");
        expect(t.fetchImpl).not.toHaveBeenCalled();
    });

    it("follows up to five same-host redirects", async () => {
        const hops = [1, 2, 3, 4, 5].map((n) => redirect(`/robots-${n}.txt`));
        const t = setup({ robotsReplies: [hops[0]], pageReplies: [...hops.slice(1), robots("User-agent: *\nDisallow: /schedule"), html()] });
        // Hops after the first are not at /robots.txt, so they come from the page queue in order.
        expect(await kindOf(t.run())).toBe("robots-disallowed");
        expect(t.urls()).toEqual([ROBOTS_URL, ...[1, 2, 3, 4, 5].map((n) => `https://${HOST}/robots-${n}.txt`)]);
    });

    it("fails closed past five redirects", async () => {
        const t = setup({ robotsReplies: [redirect("/r1")], pageReplies: [2, 3, 4, 5, 6].map((n) => redirect(`/r${n}`)) });
        expect(await kindOf(t.run())).toBe("robots-unavailable");
        expect(t.fetchImpl).toHaveBeenCalledTimes(6);
    });

    it("fails closed on a redirect to another host, without requesting it", async () => {
        const t = setup({ robotsReplies: [redirect("https://other.example.org/robots.txt")] });
        expect(await kindOf(t.run())).toBe("robots-unavailable");
        expect(t.urls()).toEqual([ROBOTS_URL]);
    });

    it("fails closed on a redirect to an internal address or plain http", async () => {
        for (const location of ["https://127.0.0.1/robots.txt", `http://${HOST}/robots.txt`, `https://${HOST}:8443/robots.txt`]) {
            const t = setup({ robotsReplies: [redirect(location)] });
            expect(await kindOf(t.run())).toBe("robots-unavailable");
            expect(t.fetchImpl).toHaveBeenCalledTimes(1);
        }
    });
});

describe("robots.txt status handling (RFC 9309)", () => {
    it.each([404, 410, 401, 403])("treats %i as no rules and fetches the page", async (code) => {
        const t = setup({ robotsReplies: [status(code)], pageReplies: [html()] });
        expect(await kindOf(t.run())).toBe("ok");
    });

    it.each([429, 500, 502, 503])("fails closed on %i", async (code) => {
        const t = setup({ robotsReplies: [status(code)] });
        expect(await kindOf(t.run())).toBe("robots-unavailable");
        expect(t.urls()).toEqual([ROBOTS_URL]);
    });

    it("fails closed on a network error", async () => {
        const t = setup({ robotsReplies: [() => Promise.reject(new TypeError("fetch failed"))] });
        expect(await kindOf(t.run())).toBe("robots-unavailable");
    });

    it("fails closed when robots.txt doesn't answer within the deadline", async () => {
        vi.useFakeTimers();
        const t = setup({ robotsReplies: [() => new Promise<Response>(() => {})] });
        const pending = kindOf(t.run(PAGE, { timeoutMs: 5_000 }));
        await vi.advanceTimersByTimeAsync(5_001);
        expect(await pending).toBe("robots-unavailable");
        expect(t.log).toHaveBeenCalledWith(expect.objectContaining({ outcome: "robots-unavailable" }));
    });

    it("shares one deadline between robots.txt and the page", async () => {
        vi.useFakeTimers();
        const slowRobots = () => new Promise<Response>((resolve) => setTimeout(() => resolve(status(404)), 4_000));
        const t = setup({ robotsReplies: [slowRobots], pageReplies: [() => new Promise<Response>(() => {})] });
        const pending = kindOf(t.run(PAGE, { timeoutMs: 5_000 }));
        // The page gets only what robots.txt left: 1 s, not another 5.
        await vi.advanceTimersByTimeAsync(5_001);
        expect(await pending).toBe("timeout");
    });

    it("fails closed on a declared size over 500 KiB, unread", async () => {
        const t = setup({ robotsReplies: [robots("User-agent: *", { headers: { "content-length": String(ROBOTS_MAX_BYTES + 1) } })] });
        expect(await kindOf(t.run())).toBe("robots-unavailable");
    });

    it("fails closed on a streamed body over 500 KiB", async () => {
        const t = setup({ robotsReplies: [robots(`User-agent: *\n${"#".repeat(ROBOTS_MAX_BYTES)}`)] });
        expect(await kindOf(t.run())).toBe("robots-unavailable");
        expect(t.urls()).toEqual([ROBOTS_URL]);
    });

    it("parses a file at the cap", async () => {
        const body = `User-agent: *\nDisallow: /schedule\n`;
        const t = setup({ robotsReplies: [robots(body + "#".repeat(ROBOTS_MAX_BYTES - body.length))] });
        expect(await kindOf(t.run())).toBe("robots-disallowed");
    });

    it("fails closed on a file that isn't UTF-8", async () => {
        const t = setup({ robotsReplies: [robots(new Uint8Array([0x55, 0x73, 0xff, 0xfe, 0x0a]) as unknown as string)] });
        expect(await kindOf(t.run())).toBe("robots-unavailable");
    });

    it("reads a robots.txt served with a wrong content type", async () => {
        const t = setup({ robotsReplies: [robots("User-agent: *\nDisallow: /", { headers: { "content-type": "text/html" } })] });
        expect(await kindOf(t.run())).toBe("robots-disallowed");
    });
});

describe("robots.txt rules", () => {
    it("refuses a disallowed page without requesting it, and logs only the kind", async () => {
        const t = setup({ robotsReplies: [robots("User-agent: OpenLeague\nDisallow: /schedule/")] });
        expect(await kindOf(t.run())).toBe("robots-disallowed");
        expect(t.urls()).toEqual([ROBOTS_URL]);
        expect(t.log).toHaveBeenCalledWith({ event: "league_page_fetch", host: HOST, status: 200, outcome: "robots-disallowed" });
        expect(JSON.stringify(t.log.mock.calls)).not.toContain("/schedule");
    });

    it("matches the query string too", async () => {
        const t = setup({ robotsReplies: [robots("User-agent: *\nDisallow: /*?print")] });
        expect(await kindOf(t.run(`${PAGE}?print=1`))).toBe("robots-disallowed");
    });

    it("refuses a page redirect to a disallowed path", async () => {
        const t = setup({ robotsReplies: [robots("User-agent: *\nDisallow: /private")], pageReplies: [redirect("/private/schedule")] });
        expect(await kindOf(t.run())).toBe("robots-disallowed");
        expect(t.urls()).toEqual([ROBOTS_URL, PAGE]);
    });
});

describe("robots.txt cache", () => {
    it("reuses a host's robots.txt for 24 hours, then fetches it again", async () => {
        vi.useFakeTimers();
        const t = setup({ robotsReplies: [robots("User-agent: *\nAllow: /"), robots("User-agent: *\nDisallow: /")], pageReplies: [html(), html()] });
        expect(await kindOf(t.run())).toBe("ok");
        expect(await kindOf(t.run())).toBe("ok");
        expect(t.urls().filter((u) => u === ROBOTS_URL)).toHaveLength(1);
        vi.setSystemTime(Date.now() + ROBOTS_CACHE_TTL_MS);
        expect(await kindOf(t.run())).toBe("robots-disallowed");
        expect(t.urls().filter((u) => u === ROBOTS_URL)).toHaveLength(2);
    });

    it("caches a 404 as no rules", async () => {
        const t = setup({ robotsReplies: [status(404)], pageReplies: [html(), html()] });
        await t.run();
        await t.run();
        expect(t.urls().filter((u) => u === ROBOTS_URL)).toHaveLength(1);
    });

    it("doesn't cache a failure: the next fetch asks again", async () => {
        const t = setup({ robotsReplies: [status(503), status(404)], pageReplies: [html()] });
        expect(await kindOf(t.run())).toBe("robots-unavailable");
        expect(await kindOf(t.run())).toBe("ok");
    });

    it("fetches robots.txt once for concurrent first requests to a host", async () => {
        let answer: (r: Response) => void = () => {};
        const slow = () => new Promise<Response>((resolve) => (answer = resolve));
        const t = setup({ robotsReplies: [slow, robots("User-agent: *\nAllow: /")], pageReplies: [html(), html()] });
        const first = kindOf(t.run());
        const second = kindOf(t.run());
        await vi.waitFor(() => expect(t.urls()).toEqual([ROBOTS_URL]));
        answer(robots("User-agent: *\nAllow: /"));
        expect(await first).toBe("ok");
        expect(await second).toBe("ok");
        expect(t.urls()).toEqual([ROBOTS_URL, PAGE, PAGE]);
    });

    it("shares a failed robots.txt read with the requests waiting on it, then asks again", async () => {
        let answer: (r: Response) => void = () => {};
        const slow = () => new Promise<Response>((resolve) => (answer = resolve));
        const t = setup({ robotsReplies: [slow, status(404)], pageReplies: [html()] });
        const first = kindOf(t.run());
        const second = kindOf(t.run());
        await vi.waitFor(() => expect(t.urls()).toEqual([ROBOTS_URL]));
        answer(status(503));
        expect(await first).toBe("robots-unavailable");
        expect(await second).toBe("robots-unavailable");
        expect(await kindOf(t.run())).toBe("ok");
        expect(t.urls()).toEqual([ROBOTS_URL, ROBOTS_URL, PAGE]);
    });

    it("honours a shorter Cache-Control max-age", async () => {
        vi.useFakeTimers();
        const t = setup({
            robotsReplies: [robots("User-agent: *\nAllow: /", { headers: { "cache-control": "max-age=60" } }), status(404)],
            pageReplies: [html(), html()],
        });
        await t.run();
        vi.setSystemTime(Date.now() + 61_000);
        await t.run();
        expect(t.urls().filter((u) => u === ROBOTS_URL)).toHaveLength(2);
    });
});

describe("Crawl-delay", () => {
    it("waits a short delay before the page, counting the robots.txt request", async () => {
        vi.useFakeTimers();
        const t = setup({ robotsReplies: [robots("User-agent: *\nCrawl-delay: 3")], pageReplies: [html()] });
        const pending = kindOf(t.run());
        await vi.advanceTimersByTimeAsync(2_900);
        expect(t.urls()).toEqual([ROBOTS_URL]);
        await vi.advanceTimersByTimeAsync(200);
        expect(await pending).toBe("ok");
        expect(t.urls()).toEqual([ROBOTS_URL, PAGE]);
    });

    it("waits the delay again before following a same-host page redirect", async () => {
        vi.useFakeTimers();
        const t = setup({ robotsReplies: [robots("User-agent: *\nCrawl-delay: 3")], pageReplies: [redirect("/schedule/9u"), html()] });
        const pending = kindOf(t.run());
        await vi.advanceTimersByTimeAsync(3_000);
        expect(t.urls()).toEqual([ROBOTS_URL, PAGE]);
        await vi.advanceTimersByTimeAsync(2_900);
        expect(t.urls()).toEqual([ROBOTS_URL, PAGE]);
        await vi.advanceTimersByTimeAsync(200);
        expect(await pending).toBe("ok");
        expect(t.urls()).toEqual([ROBOTS_URL, PAGE, `https://${HOST}/schedule/9u`]);
    });

    it("refuses a redirect whose delay wouldn't leave the page enough of the deadline", async () => {
        vi.useFakeTimers();
        const t = setup({ robotsReplies: [robots("User-agent: *\nCrawl-delay: 6")], pageReplies: [redirect("/schedule/9u")] });
        const pending = t.run(PAGE, { timeoutMs: 15_000 }).catch((e: unknown) => e);
        await vi.advanceTimersByTimeAsync(6_000);
        expect(await pending).toMatchObject({ kind: "crawl-delay", retryAfterSec: 6 });
        expect(t.urls()).toEqual([ROBOTS_URL, PAGE]);
    });

    it("spaces consecutive fetches to the same host", async () => {
        vi.useFakeTimers();
        const t = setup({ robotsReplies: [robots("User-agent: *\nCrawl-delay: 2")], pageReplies: [html(), html()] });
        const first = kindOf(t.run());
        await vi.advanceTimersByTimeAsync(2_000);
        expect(await first).toBe("ok");
        const second = kindOf(t.run());
        await vi.advanceTimersByTimeAsync(1_900);
        expect(t.urls()).toHaveLength(2);
        await vi.advanceTimersByTimeAsync(200);
        expect(await second).toBe("ok");
        expect(t.urls()).toHaveLength(3);
    });

    it("refuses a delay over 10 s with a retry time, and claims no slot", async () => {
        vi.useFakeTimers();
        const t = setup({ robotsReplies: [robots("User-agent: *\nCrawl-delay: 45")], pageReplies: [html()] });
        const error = await t.run().catch((e: unknown) => e);
        expect(error).toMatchObject({ kind: "crawl-delay", retryAfterSec: 45 });
        expect(t.urls()).toEqual([ROBOTS_URL]);
        // Once the gap has passed (the robots.txt is cached), the fetch goes ahead.
        vi.setSystemTime(Date.now() + 45_000);
        expect(await kindOf(t.run())).toBe("ok");
    });

    it("refuses a short delay that wouldn't leave the page enough of the deadline", async () => {
        vi.useFakeTimers();
        const t = setup({ robotsReplies: [robots("User-agent: *\nCrawl-delay: 8")] });
        const error = await t.run(PAGE, { timeoutMs: 10_000 }).catch((e: unknown) => e);
        expect(error).toMatchObject({ kind: "crawl-delay", retryAfterSec: 8 });
    });
});

describe("written permission", () => {
    const permissions = [{ host: HOST, note: "Fictional: permission email on file" }];

    it("skips the robots.txt refusal for a permitted host", async () => {
        const t = setup({ permissions, robotsReplies: [robots("User-agent: *\nDisallow: /")], pageReplies: [html()] });
        expect(await kindOf(t.run())).toBe("ok");
        expect(t.urls()).toEqual([ROBOTS_URL, PAGE]);
    });

    it("still respects Crawl-delay", async () => {
        vi.useFakeTimers();
        const t = setup({ permissions, robotsReplies: [robots("User-agent: *\nDisallow: /\nCrawl-delay: 30")] });
        expect(await t.run().catch((e: unknown) => e)).toMatchObject({ kind: "crawl-delay", retryAfterSec: 30 });
    });

    it("still fails closed when robots.txt can't be read", async () => {
        const t = setup({ permissions, robotsReplies: [status(503)] });
        expect(await kindOf(t.run())).toBe("robots-unavailable");
    });

    it("doesn't extend to other hosts", async () => {
        const t = setup({ permissions, robotsReplies: [robots("User-agent: *\nDisallow: /")] });
        expect(await kindOf(t.run("https://other.example.org/schedule"))).toBe("robots-disallowed");
    });
});

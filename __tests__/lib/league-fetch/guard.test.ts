/** Every SSRF and abuse rule of the league page fetch (ADR-0024), with a mocked fetch and DNS. No network. */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    checkLeagueUrl,
    DEFAULT_ALLOWED_HOSTS,
    fetchLeaguePage,
    isPublicAddress,
    LEAGUE_FETCH_USER_AGENT,
    LeagueFetchError,
    parseAllowedHosts,
    type LeagueFetchLogEntry,
    type LookupFn,
} from "@/lib/league-fetch/guard";

const HOST = "league.example.org";
const ALLOWED = [HOST, "other.example.org"];
const PAGE = `https://${HOST}/schedule?division=8u`;
const HTML = "<html><body><table><tr><td>9/26</td></tr></table></body></html>";

const publicLookup: LookupFn = async () => [{ address: "93.184.216.34", family: 4 }];

function html(body = HTML, init: ResponseInit = {}): Response {
    return new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" }, ...init });
}

function redirect(location: string, status = 302): Response {
    return new Response(null, { status, headers: { location } });
}

function setup(responses: Array<Response | (() => Promise<Response>)>, lookup: LookupFn = publicLookup) {
    const queue = [...responses];
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
        const next = queue.shift();
        if (!next) throw new Error("unexpected fetch");
        return typeof next === "function" ? next() : next;
    });
    const log = vi.fn<(entry: LeagueFetchLogEntry) => void>();
    const lookupSpy = vi.fn(lookup);
    const run = (url = PAGE, extra: Record<string, unknown> = {}) =>
        fetchLeaguePage(url, { allowedHosts: ALLOWED, fetchImpl: fetchImpl as unknown as typeof fetch, lookup: lookupSpy, log, ...extra });
    return { fetchImpl, log, lookup: lookupSpy, run };
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

describe("checkLeagueUrl", () => {
    it.each([
        ["not a URL", "not a url", "invalid-url"],
        ["http", `http://${HOST}/schedule`, "not-https"],
        ["another scheme", `ftp://${HOST}/schedule`, "not-https"],
        ["a non-443 port", `https://${HOST}:8443/schedule`, "bad-port"],
        ["port 80 on https", `https://${HOST}:80/schedule`, "bad-port"],
        ["user info", `https://user:pass@${HOST}/schedule`, "credentials"],
        ["an IPv4 literal", "https://93.184.216.34/schedule", "ip-literal"],
        ["a decimal IPv4 literal", "https://2130706433/schedule", "ip-literal"],
        ["an IPv6 literal", "https://[::1]/schedule", "ip-literal"],
        ["a host off the allowlist", "https://evil.example.net/schedule", "host-not-allowed"],
        ["a lookalike subdomain", `https://${HOST}.evil.example.net/`, "host-not-allowed"],
        ["a subdomain of an allowed host", `https://x.${HOST}/`, "host-not-allowed"],
    ])("refuses %s", (_label, url, kind) => {
        expect(() => checkLeagueUrl(url, ALLOWED)).toThrow(expect.objectContaining({ kind }));
    });

    it("accepts an allowlisted https URL, explicit :443, any case, and drops the fragment", () => {
        expect(checkLeagueUrl(`https://LEAGUE.example.org:443/schedule#x`, ALLOWED).toString()).toBe(`https://${HOST}/schedule`);
        expect(checkLeagueUrl(`https://${HOST}./schedule`, ALLOWED).hostname).toBe(HOST);
    });
});

describe("parseAllowedHosts", () => {
    it("defaults when unset or empty", () => {
        expect(parseAllowedHosts(undefined)).toEqual([...DEFAULT_ALLOWED_HOSTS]);
        expect(parseAllowedHosts("  ")).toEqual([...DEFAULT_ALLOWED_HOSTS]);
    });
    it("reads a comma- or space-separated list, normalized", () => {
        expect(parseAllowedHosts("A.example.org, b.example.org. a.example.org")).toEqual(["a.example.org", "b.example.org"]);
    });
});

describe("isPublicAddress", () => {
    it.each([
        "127.0.0.1",
        "10.1.2.3",
        "172.16.0.1",
        "172.31.255.255",
        "192.168.1.1",
        "169.254.169.254",
        "100.64.0.1",
        "0.0.0.0",
        "224.0.0.1",
        "255.255.255.255",
        "::",
        "::1",
        "fc00::1",
        "fd12:3456::1",
        "fe80::1",
        "fec0::1",
        "ff02::1",
        "::ffff:127.0.0.1",
        "::ffff:7f00:1",
        "::ffff:169.254.169.254",
        "64:ff9b::10.0.0.1",
        "not an address",
    ])("refuses %s", (address) => {
        expect(isPublicAddress(address)).toBe(false);
    });

    it.each(["93.184.216.34", "8.8.8.8", "172.32.0.1", "2606:4700::1111", "::ffff:93.184.216.34"])("accepts %s", (address) => {
        expect(isPublicAddress(address)).toBe(true);
    });
});

describe("fetchLeaguePage", () => {
    it("fetches with a fixed User-Agent, no credentials, no cache and manual redirects", async () => {
        const { fetchImpl, run, log } = setup([html()]);
        const result = await run();
        expect(result).toEqual({ url: PAGE, html: HTML });
        const [url, init] = fetchImpl.mock.calls[0];
        expect(url).toBe(PAGE);
        expect(init).toMatchObject({ method: "GET", redirect: "manual", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer" });
        expect(init!.headers).toEqual({ "User-Agent": LEAGUE_FETCH_USER_AGENT, Accept: "text/html" });
        expect(Object.keys(init!.headers as object)).not.toContain("Cookie");
        expect(log).toHaveBeenCalledWith({ event: "league_page_fetch", host: HOST, status: 200, outcome: "ok" });
    });

    it("logs only the host, the status and the outcome, never the path, query or content", async () => {
        const { run, log } = setup([html("<p>secret-content</p>")]);
        await run();
        const logged = JSON.stringify(log.mock.calls);
        expect(logged).not.toContain("schedule");
        expect(logged).not.toContain("division");
        expect(logged).not.toContain("secret-content");
    });

    it("refuses a disallowed host without resolving or fetching it", async () => {
        const { run, fetchImpl, lookup } = setup([html()]);
        expect(await kindOf(run("https://evil.example.net/"))).toBe("host-not-allowed");
        expect(lookup).not.toHaveBeenCalled();
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("refuses a host that resolves to a private address", async () => {
        const { run, fetchImpl } = setup([html()], async () => [{ address: "10.0.0.5", family: 4 }]);
        expect(await kindOf(run())).toBe("private-address");
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("refuses when any one of the resolved addresses is not public", async () => {
        const { run } = setup([html()], async () => [
            { address: "93.184.216.34", family: 4 },
            { address: "::1", family: 6 },
        ]);
        expect(await kindOf(run())).toBe("private-address");
    });

    it("refuses when DNS fails or returns nothing", async () => {
        expect(await kindOf(setup([html()], async () => Promise.reject(new Error("ENOTFOUND"))).run())).toBe("dns-failed");
        expect(await kindOf(setup([html()], async () => []).run())).toBe("dns-failed");
    });

    it("follows up to 3 same-host redirects, re-checking each hop", async () => {
        const { run, fetchImpl, lookup } = setup([redirect("/a"), redirect(`https://${HOST}/b`, 301), redirect("/c", 308), html()]);
        const result = await run();
        expect(result.url).toBe(`https://${HOST}/c`);
        expect(fetchImpl).toHaveBeenCalledTimes(4);
        expect(lookup).toHaveBeenCalledTimes(4);
    });

    it("stops after 3 redirects", async () => {
        const { run, fetchImpl } = setup([redirect("/a"), redirect("/b"), redirect("/c"), redirect("/d"), html()]);
        expect(await kindOf(run())).toBe("too-many-redirects");
        expect(fetchImpl).toHaveBeenCalledTimes(4);
    });

    it("never follows a redirect to another host, even an allowlisted one", async () => {
        const { run, fetchImpl } = setup([redirect("https://other.example.org/schedule"), html()]);
        expect(await kindOf(run())).toBe("redirect-off-host");
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("refuses a redirect to an internal address", async () => {
        expect(await kindOf(setup([redirect("https://169.254.169.254/latest/meta-data")]).run())).toBe("redirect-off-host");
    });

    it("refuses a same-host redirect that drops https or changes the port", async () => {
        expect(await kindOf(setup([redirect(`http://${HOST}/schedule`)]).run())).toBe("not-https");
        expect(await kindOf(setup([redirect(`https://${HOST}:8443/schedule`)]).run())).toBe("bad-port");
    });

    it("re-resolves on a redirect and refuses if the host now points inward", async () => {
        let calls = 0;
        const { run } = setup([redirect("/next"), html()], async () => (calls++ === 0 ? [{ address: "93.184.216.34", family: 4 }] : [{ address: "127.0.0.1", family: 4 }]));
        expect(await kindOf(run())).toBe("private-address");
    });

    it("refuses a redirect without a Location", async () => {
        expect(await kindOf(setup([new Response(null, { status: 302 })]).run())).toBe("bad-redirect");
    });

    it("refuses a non-200 status and logs it", async () => {
        const { run, log } = setup([new Response("gone", { status: 404, headers: { "content-type": "text/html" } })]);
        await expect(run()).rejects.toMatchObject({ kind: "http-status", status: 404 });
        expect(log).toHaveBeenCalledWith({ event: "league_page_fetch", host: HOST, status: 404, outcome: "http-status" });
    });

    it.each(["application/json", "text/plain", "application/xhtml+xml", "text/htmlx", ""])("refuses content type %j", async (type) => {
        const response = new Response(HTML, { status: 200, headers: type ? { "content-type": type } : {} });
        if (!type) response.headers.delete("content-type");
        expect(await kindOf(setup([response]).run())).toBe("content-type");
    });

    it("refuses a declared Content-Length over the cap without reading", async () => {
        const response = html(HTML, { headers: { "content-type": "text/html", "content-length": String(3 * 1024 * 1024) } });
        expect(await kindOf(setup([response]).run())).toBe("too-large");
    });

    it("streams the body and aborts past the size cap", async () => {
        let pulled = 0;
        const endless = new ReadableStream<Uint8Array>({
            pull(controller) {
                pulled++;
                controller.enqueue(new Uint8Array(64 * 1024));
            },
        });
        const response = new Response(endless, { status: 200, headers: { "content-type": "text/html" } });
        expect(await kindOf(setup([response]).run(PAGE, { maxBytes: 256 * 1024 }))).toBe("too-large");
        expect(pulled).toBeLessThan(10);
    });

    it("times out a fetch that never answers", async () => {
        vi.useFakeTimers();
        const { run } = setup([
            () =>
                new Promise<Response>(() => {
                    // never settles
                }),
        ]);
        const outcome = kindOf(run());
        await vi.advanceTimersByTimeAsync(10_001);
        expect(await outcome).toBe("timeout");
    });

    it("times out a body that stalls", async () => {
        vi.useFakeTimers();
        const stalled = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new TextEncoder().encode("<html>"));
            },
        });
        const { run } = setup([new Response(stalled, { status: 200, headers: { "content-type": "text/html" } })]);
        const outcome = kindOf(run());
        await vi.advanceTimersByTimeAsync(10_001);
        expect(await outcome).toBe("timeout");
    });

    it("times out a DNS lookup that never answers", async () => {
        vi.useFakeTimers();
        const { run } = setup([html()], () => new Promise(() => {}));
        const outcome = kindOf(run());
        await vi.advanceTimersByTimeAsync(10_001);
        expect(await outcome).toBe("timeout");
    });

    it("reports a network failure", async () => {
        const { run } = setup([() => Promise.reject(new TypeError("fetch failed"))]);
        expect(await kindOf(run())).toBe("network");
    });

    it("decodes the declared charset", async () => {
        const bytes = new Uint8Array([0x3c, 0x70, 0x3e, 0xe9, 0x3c, 0x2f, 0x70, 0x3e]); // <p>é</p> in latin1
        const response = new Response(bytes, { status: 200, headers: { "content-type": "text/html; charset=iso-8859-1" } });
        expect((await setup([response]).run()).html).toBe("<p>é</p>");
    });

    it("never puts the URL in an error message", async () => {
        try {
            await setup([new Response("", { status: 500, headers: { "content-type": "text/html" } })]).run();
        } catch (error) {
            expect(String((error as Error).message)).not.toContain(HOST);
            expect(String((error as Error).message)).not.toContain("schedule");
        }
    });
});

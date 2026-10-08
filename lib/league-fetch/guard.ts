/**
 * The outbound fetch behind "Fetch it for me" (hosted league page fetch spec,
 * ADR-0024). It fetches one public league page on a signed-in user's request,
 * and nothing else: every rule below is a control against server-side request
 * forgery or abuse, and each has its own test.
 *
 * - https only, port 443 only, no user info in the URL, no IP-literal hosts;
 * - the host must be on an exact allowlist from server config;
 * - redirects are followed by hand, at most 3, only to the same host, with
 *   every check re-run on each hop;
 * - every address the host resolves to must be public (defense in depth: the
 *   allowlist is the primary control, see the spec for the residual);
 * - one deadline for the whole fetch (60 s by default, see config.ts), a streamed size cap, text/html only;
 * - a fixed, identifiable User-Agent (never a browser's), no cookies or credentials, no cache;
 * - logs carry the host, the status and an error kind, never the path,
 *   query or page content.
 *
 * Server-only: it imports node:dns. The fetch and DNS lookup are injectable
 * so the tests never touch the network.
 */
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

export const LEAGUE_FETCH_USER_AGENT = "OpenLeague-LeaguePageFetch/1.0 (+https://openleague.dev; user-requested)";
export const DEFAULT_ALLOWED_HOSTS: readonly string[] = ["www.cshlhockey.org"];
/** The one total deadline (DNS, every hop and the body). The real league site can take 30 s to first byte. */
export const LEAGUE_FETCH_TIMEOUT_MS = 60_000;
export const LEAGUE_FETCH_MIN_TIMEOUT_MS = 5_000;
export const LEAGUE_FETCH_MAX_TIMEOUT_MS = 90_000;
export const LEAGUE_FETCH_MAX_BYTES = 2 * 1024 * 1024;
export const LEAGUE_FETCH_MAX_REDIRECTS = 3;

export type LeagueFetchErrorKind =
    | "invalid-url"
    | "not-https"
    | "bad-port"
    | "credentials"
    | "ip-literal"
    | "host-not-allowed"
    | "dns-failed"
    | "private-address"
    | "redirect-off-host"
    | "too-many-redirects"
    | "bad-redirect"
    | "http-status"
    | "content-type"
    | "too-large"
    | "timeout"
    | "network";

/** Carries a kind (and an HTTP status), never the URL: messages may reach logs and telemetry. */
export class LeagueFetchError extends Error {
    constructor(
        readonly kind: LeagueFetchErrorKind,
        readonly status?: number,
    ) {
        super(status === undefined ? `League page fetch refused: ${kind}` : `League page fetch refused: ${kind} (${status})`);
        this.name = "LeagueFetchError";
    }
}

export type LookupFn = (hostname: string, options: { all: true }) => Promise<Array<{ address: string; family: number }>>;

export interface LeagueFetchLogEntry {
    event: "league_page_fetch";
    host: string;
    status: number | null;
    outcome: "ok" | LeagueFetchErrorKind;
}

export interface LeagueFetchOptions {
    allowedHosts: readonly string[];
    fetchImpl?: typeof fetch;
    lookup?: LookupFn;
    timeoutMs?: number;
    maxBytes?: number;
    maxRedirects?: number;
    log?: (entry: LeagueFetchLogEntry) => void;
}

export interface LeagueFetchResult {
    /** The final URL, after any same-host redirects. */
    url: string;
    html: string;
}

/** LEAGUE_FETCH_ALLOWED_HOSTS: comma- or space-separated host names; unset or empty means the default. */
export function parseAllowedHosts(raw: string | undefined): string[] {
    const hosts = (raw ?? "")
        .split(/[\s,]+/)
        .map((host) => normalizeHost(host))
        .filter((host) => host.length > 0);
    return hosts.length > 0 ? [...new Set(hosts)] : [...DEFAULT_ALLOWED_HOSTS];
}

function normalizeHost(host: string): string {
    return host.trim().toLowerCase().replace(/\.$/, "");
}

/** Every URL rule except DNS. Returns the URL without its fragment. Throws LeagueFetchError. */
export function checkLeagueUrl(raw: string, allowedHosts: readonly string[]): URL {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        throw new LeagueFetchError("invalid-url");
    }
    if (url.protocol !== "https:") throw new LeagueFetchError("not-https");
    // The URL parser drops the default port, so "" is 443 and anything else is another port.
    if (url.port !== "") throw new LeagueFetchError("bad-port");
    if (url.username !== "" || url.password !== "") throw new LeagueFetchError("credentials");
    const host = normalizeHost(url.hostname);
    // The parser normalizes decimal, hex and octal IPv4 forms to dotted quads, and keeps IPv6 bracketed.
    if (isIP(host) !== 0 || isIP(host.replace(/^\[|\]$/g, "")) !== 0) throw new LeagueFetchError("ip-literal");
    if (!allowedHosts.map(normalizeHost).includes(host)) throw new LeagueFetchError("host-not-allowed");
    // Connect to the same normalized name the allowlist and DNS check saw.
    url.hostname = host;
    url.hash = "";
    return url;
}

function ipv4Parts(address: string): number[] | null {
    const parts = address.split(".");
    if (parts.length !== 4) return null;
    const numbers = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : NaN));
    return numbers.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) ? numbers : null;
}

function isPublicIpv4(address: string): boolean {
    const p = ipv4Parts(address);
    if (!p) return false;
    const [a, b, c] = p;
    if (a === 0 || a === 10 || a === 127) return false; // this network, private, loopback
    if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
    if (a === 169 && b === 254) return false; // link-local (incl. cloud metadata)
    if (a === 172 && b >= 16 && b <= 31) return false; // private
    if (a === 192 && b === 168) return false; // private
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return false; // IETF protocol assignments, documentation
    if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
    if (a === 198 && b === 51 && c === 100) return false; // documentation
    if (a === 203 && b === 0 && c === 113) return false; // documentation
    if (a >= 224) return false; // multicast, reserved, broadcast
    return true;
}

/** The eight 16-bit groups of an IPv6 address, or null. Handles "::" and a trailing dotted IPv4. */
function ipv6Groups(address: string): number[] | null {
    let text = address.toLowerCase().replace(/%.*$/, "");
    const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
    if (dotted) {
        const v4 = ipv4Parts(dotted[1]);
        if (!v4) return null;
        text = text.slice(0, -dotted[1].length) + `${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
    }
    const halves = text.split("::");
    if (halves.length > 2) return null;
    const parse = (half: string) => (half === "" ? [] : half.split(":").map((group) => (/^[0-9a-f]{1,4}$/.test(group) ? parseInt(group, 16) : NaN)));
    const head = parse(halves[0]);
    const tail = halves.length === 2 ? parse(halves[1]) : [];
    const missing = 8 - head.length - tail.length;
    if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
    const groups = [...head, ...new Array<number>(halves.length === 2 ? missing : 0).fill(0), ...tail];
    return groups.length === 8 && groups.every((g) => Number.isInteger(g)) ? groups : null;
}

function isPublicIpv6(address: string): boolean {
    const g = ipv6Groups(address);
    if (!g) return false;
    if (g.every((x) => x === 0)) return false; // unspecified
    if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return false; // loopback
    const embeddedV4 = () => `${g[6] >> 8}.${g[6] & 0xff}.${g[7] >> 8}.${g[7] & 0xff}`;
    // IPv4-mapped (::ffff:a.b.c.d) and NAT64 (64:ff9b::a.b.c.d): judge the IPv4 address inside.
    if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return isPublicIpv4(embeddedV4());
    if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return isPublicIpv4(embeddedV4());
    if ((g[0] & 0xfe00) === 0xfc00) return false; // unique local
    if ((g[0] & 0xffc0) === 0xfe80) return false; // link-local
    if ((g[0] & 0xffc0) === 0xfec0) return false; // deprecated site-local
    if ((g[0] & 0xff00) === 0xff00) return false; // multicast
    if (g[0] === 0x2001 && g[1] === 0x0db8) return false; // documentation
    if (g.slice(0, 6).every((x) => x === 0)) return false; // deprecated IPv4-compatible
    return true;
}

/** True only for a globally routable unicast address. Anything unparseable counts as not public. */
export function isPublicAddress(address: string): boolean {
    const family = isIP(address);
    if (family === 4) return isPublicIpv4(address);
    if (family === 6) return isPublicIpv6(address);
    return false;
}

async function assertPublicHost(host: string, lookup: LookupFn): Promise<void> {
    let addresses: Array<{ address: string }>;
    try {
        addresses = await lookup(host, { all: true });
    } catch {
        throw new LeagueFetchError("dns-failed");
    }
    if (addresses.length === 0) throw new LeagueFetchError("dns-failed");
    if (!addresses.every(({ address }) => isPublicAddress(address))) throw new LeagueFetchError("private-address");
}

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

function charsetOf(contentType: string): string {
    const match = /charset\s*=\s*"?([^";\s]+)/i.exec(contentType);
    return match ? match[1] : "utf-8";
}

function decode(bytes: Uint8Array, charset: string): string {
    try {
        return new TextDecoder(charset).decode(bytes);
    } catch {
        return new TextDecoder("utf-8").decode(bytes);
    }
}

async function readCapped(response: Response, maxBytes: number, abort: () => void): Promise<Uint8Array> {
    if (!response.body) return new Uint8Array(0);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
            abort();
            await reader.cancel().catch(() => {});
            throw new LeagueFetchError("too-large");
        }
        chunks.push(value);
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return out;
}

function defaultLog(entry: LeagueFetchLogEntry): void {
    console.info(JSON.stringify(entry));
}

/** Fetches one allowlisted league page under every rule above. Throws LeagueFetchError. */
export async function fetchLeaguePage(raw: string, options: LeagueFetchOptions): Promise<LeagueFetchResult> {
    const {
        allowedHosts,
        fetchImpl = fetch,
        lookup = dnsLookup as LookupFn,
        timeoutMs = LEAGUE_FETCH_TIMEOUT_MS,
        maxBytes = LEAGUE_FETCH_MAX_BYTES,
        maxRedirects = LEAGUE_FETCH_MAX_REDIRECTS,
        log = defaultLog,
    } = options;

    let url = checkLeagueUrl(raw, allowedHosts);
    const host = normalizeHost(url.hostname);
    let status: number | null = null;

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, timeoutMs);
    // The deadline also covers DNS: a lookup that never settles must not hold the action open.
    const deadline = new Promise<never>((_, reject) => {
        controller.signal.addEventListener("abort", () => reject(new LeagueFetchError(timedOut ? "timeout" : "too-large")), { once: true });
    });
    deadline.catch(() => {});

    try {
        for (let hop = 0; ; hop++) {
            await Promise.race([assertPublicHost(host, lookup), deadline]);
            let response: Response;
            try {
                response = await Promise.race([
                    fetchImpl(url.toString(), {
                        method: "GET",
                        redirect: "manual",
                        credentials: "omit",
                        cache: "no-store",
                        referrerPolicy: "no-referrer",
                        headers: { "User-Agent": LEAGUE_FETCH_USER_AGENT, Accept: "text/html" },
                        signal: controller.signal,
                    }),
                    deadline,
                ]);
            } catch (error) {
                if (error instanceof LeagueFetchError) throw error;
                throw new LeagueFetchError(timedOut ? "timeout" : "network");
            }
            status = response.status;

            if (REDIRECTS.has(response.status)) {
                await response.body?.cancel().catch(() => {});
                if (hop >= maxRedirects) throw new LeagueFetchError("too-many-redirects");
                const location = response.headers.get("location");
                if (!location) throw new LeagueFetchError("bad-redirect");
                let next: URL;
                try {
                    next = new URL(location, url);
                } catch {
                    throw new LeagueFetchError("bad-redirect");
                }
                // Never to another host, even an allowlisted one; then every URL rule again.
                if (normalizeHost(next.hostname) !== host) throw new LeagueFetchError("redirect-off-host");
                url = checkLeagueUrl(next.toString(), allowedHosts);
                continue;
            }
            if (response.status !== 200) {
                await response.body?.cancel().catch(() => {});
                throw new LeagueFetchError("http-status", response.status);
            }
            const contentType = response.headers.get("content-type") ?? "";
            if (!/^text\/html\s*(;|$)/i.test(contentType)) {
                await response.body?.cancel().catch(() => {});
                throw new LeagueFetchError("content-type");
            }
            const declared = Number(response.headers.get("content-length"));
            if (Number.isFinite(declared) && declared > maxBytes) {
                await response.body?.cancel().catch(() => {});
                throw new LeagueFetchError("too-large");
            }
            let bytes: Uint8Array;
            try {
                bytes = await Promise.race([readCapped(response, maxBytes, () => controller.abort()), deadline]);
            } catch (error) {
                if (error instanceof LeagueFetchError) throw error;
                throw new LeagueFetchError(timedOut ? "timeout" : "network");
            }
            const html = decode(bytes, charsetOf(contentType));
            log({ event: "league_page_fetch", host, status, outcome: "ok" });
            return { url: url.toString(), html };
        }
    } catch (error) {
        const failure = error instanceof LeagueFetchError ? error : new LeagueFetchError(timedOut ? "timeout" : "network");
        log({ event: "league_page_fetch", host, status, outcome: failure.kind });
        throw failure;
    } finally {
        clearTimeout(timer);
    }
}

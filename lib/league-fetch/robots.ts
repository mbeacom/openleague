/**
 * robots.txt for the hosted league page fetch (ADR-0024, 2026-10-11
 * amendment). OpenLeague does not fetch a page the site's robots.txt
 * disallows for its product token.
 *
 * - `parseRobotsTxt` and `isAllowedByRobots` follow RFC 9309: groups by
 *   user-agent (case-insensitive product token, falling back to `*`, groups
 *   for the same agent combined), the longest matching Allow or Disallow
 *   wins, an Allow wins a tie, `*` matches any run of characters, a trailing
 *   `$` anchors the end, paths compare case-sensitively after
 *   percent-encoding normalisation, and an empty Disallow matches nothing.
 * - `RobotsGate` holds what lasts between fetches, in this process only: the
 *   parsed rules per host (at most 24 hours), when each host last saw a
 *   request from us (for Crawl-delay), and the hosts whose owners gave
 *   written permission to fetch despite robots.txt.
 *
 * Pure: no network and no Node built-ins. guard.ts fetches the file, under
 * the same SSRF rules and deadline as the page, and applies the gate.
 */

/** The product token sites name in robots.txt, and the first word of our User-Agent. */
export const ROBOTS_PRODUCT_TOKEN = "OpenLeague";
/** RFC 9309 asks crawlers to parse at least 500 KiB; a larger file is refused (fail closed). */
export const ROBOTS_MAX_BYTES = 500 * 1024;
/** RFC 9309 allows at least five consecutive redirects for robots.txt. */
export const ROBOTS_MAX_REDIRECTS = 5;
/** RFC 9309: a cached robots.txt should not be used for more than 24 hours. */
export const ROBOTS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/** A Crawl-delay wait longer than this is refused with a retry time instead of held open. */
export const ROBOTS_MAX_WAIT_MS = 10_000;
const ROBOTS_CACHE_MAX_HOSTS = 256;

export interface RobotsRule {
    allow: boolean;
    /** Normalised path pattern, never empty. */
    pattern: string;
}

/** The rules that apply to our product token on one host. */
export interface RobotsPolicy {
    rules: RobotsRule[];
    /** Seconds between requests, from Crawl-delay; null when the group sets none. */
    crawlDelaySec: number | null;
}

/** A policy with no rules: everything is allowed (no robots.txt, or a 4xx). */
export const ALLOW_ALL: RobotsPolicy = Object.freeze({ rules: [], crawlDelaySec: null }) as RobotsPolicy;

const UNRESERVED = /[A-Za-z0-9\-._~]/;

/**
 * RFC 9309 section 2.2.2: percent-encode what isn't US-ASCII (as UTF-8), and
 * decode a percent-encoded octet only when it is an unreserved character.
 * Hex digits of the encodings that remain are upper-cased so `%2f` and `%2F`
 * compare equal. `*` and `$` pass through: the matcher gives them meaning.
 */
export function normalizeRobotsPath(value: string): string {
    let out = "";
    for (let i = 0; i < value.length; i++) {
        const ch = value[i];
        if (ch === "%" && /^[0-9A-Fa-f]{2}$/.test(value.slice(i + 1, i + 3))) {
            const code = parseInt(value.slice(i + 1, i + 3), 16);
            const decoded = String.fromCharCode(code);
            out += code < 0x80 && UNRESERVED.test(decoded) ? decoded : `%${value.slice(i + 1, i + 3).toUpperCase()}`;
            i += 2;
            continue;
        }
        const code = ch.charCodeAt(0);
        if (code > 0x7e || code <= 0x20) {
            // A surrogate pair is one character to encodeURIComponent.
            const pair = code >= 0xd800 && code <= 0xdbff && i + 1 < value.length ? value.slice(i, i + 2) : ch;
            try {
                out += encodeURIComponent(pair);
            } catch {
                out += "%EF%BF%BD"; // a lone surrogate: U+FFFD, never a match for a real path
            }
            i += pair.length - 1;
            continue;
        }
        out += ch;
    }
    return out;
}

function productTokenOf(value: string): string {
    // "OpenLeague/1.0 (…)" names the product token "OpenLeague".
    return value.trim().split(/[\s/]/, 1)[0].toLowerCase();
}

interface Group {
    agents: string[];
    rules: RobotsRule[];
    crawlDelaySec: number | null;
}

/** Parses robots.txt and returns the rules for `productToken` (or the `*` group). Never throws. */
export function parseRobotsTxt(text: string, productToken: string = ROBOTS_PRODUCT_TOKEN): RobotsPolicy {
    const groups: Group[] = [];
    let current: Group | null = null;
    let inAgents = false;

    for (const rawLine of text.replace(/^﻿/, "").split(/\r\n|\r|\n/)) {
        const hash = rawLine.indexOf("#");
        const line = (hash === -1 ? rawLine : rawLine.slice(0, hash)).trim();
        const colon = line.indexOf(":");
        if (colon === -1) continue;
        const key = line.slice(0, colon).trim().toLowerCase();
        const value = line.slice(colon + 1).trim();

        if (key === "user-agent") {
            if (!inAgents || !current) {
                current = { agents: [], rules: [], crawlDelaySec: null };
                groups.push(current);
                inAgents = true;
            }
            const token = value === "*" ? "*" : productTokenOf(value);
            if (token) current.agents.push(token);
            continue;
        }
        if (key === "allow" || key === "disallow") {
            inAgents = false;
            // Rules before any user-agent line belong to no group.
            if (!current || value === "") continue;
            current.rules.push({ allow: key === "allow", pattern: normalizeRobotsPath(value) });
            continue;
        }
        if (key === "crawl-delay") {
            inAgents = false;
            if (!current) continue;
            const seconds = Number(value);
            if (value !== "" && Number.isFinite(seconds) && seconds >= 0) {
                current.crawlDelaySec = Math.max(current.crawlDelaySec ?? 0, seconds);
            }
            continue;
        }
        // Any other record (Sitemap, Host, unknown) ends a run of user-agent lines.
        inAgents = false;
    }

    const ours = productToken.toLowerCase();
    let chosen = groups.filter((g) => g.agents.includes(ours));
    if (chosen.length === 0) chosen = groups.filter((g) => g.agents.includes("*"));
    if (chosen.length === 0) return { rules: [], crawlDelaySec: null };
    const delays = chosen.map((g) => g.crawlDelaySec).filter((d): d is number => d !== null);
    return { rules: chosen.flatMap((g) => g.rules), crawlDelaySec: delays.length ? Math.max(...delays) : null };
}

/**
 * True when `pattern` (with `*` and a trailing `$`) matches the start of
 * `path`. A two-pointer wildcard match: O(pattern × path) at worst, so a
 * hostile pattern full of `*` can't backtrack exponentially.
 */
export function matchesRobotsPattern(pattern: string, path: string): boolean {
    const anchored = pattern.endsWith("$");
    const body = anchored ? pattern.slice(0, -1) : pattern;
    let p = 0;
    let s = 0;
    let star = -1;
    let resume = 0;
    while (s < path.length) {
        if (p < body.length && body[p] !== "*" && body[p] === path[s]) {
            p++;
            s++;
        } else if (p < body.length && body[p] === "*") {
            star = p++;
            resume = s;
        } else if (p >= body.length && !anchored) {
            return true; // a prefix match: the rest of the path is free
        } else if (star !== -1) {
            p = star + 1;
            s = ++resume;
        } else {
            return false;
        }
    }
    while (p < body.length && body[p] === "*") p++;
    return p === body.length;
}

/** The pattern's length in octets, which ranks matches (RFC 9309 section 2.2.2). */
function specificity(pattern: string): number {
    return new TextEncoder().encode(pattern).length;
}

/** Whether `pathAndQuery` (the URL's path plus any query) may be fetched under `policy`. */
export function isAllowedByRobots(policy: RobotsPolicy, pathAndQuery: string): boolean {
    const path = normalizeRobotsPath(pathAndQuery || "/");
    // The robots.txt file itself is always allowed.
    if (path === "/robots.txt") return true;
    let best: RobotsRule | null = null;
    let bestLength = -1;
    for (const rule of policy.rules) {
        if (!matchesRobotsPattern(rule.pattern, path)) continue;
        const length = specificity(rule.pattern);
        if (length > bestLength || (length === bestLength && rule.allow && best && !best.allow)) {
            best = rule;
            bestLength = length;
        }
    }
    return best === null || best.allow;
}

/** One host's written permission to fetch despite robots.txt. Crawl-delay still applies. */
export interface RobotsPermission {
    host: string;
    /** Where the permission is recorded (an issue, an email on file), in a few words. */
    note: string;
}

export interface RobotsGateOptions {
    permissions?: readonly RobotsPermission[];
    ttlMs?: number;
    now?: () => number;
}

interface CachedPolicy {
    policy: RobotsPolicy;
    expiresAt: number;
}

/**
 * The in-process robots state. Serverless instances don't share it, so each
 * instance fetches robots.txt for itself and spaces only its own requests;
 * the durable per-user rate limit still bounds the total.
 */
export class RobotsGate {
    private readonly cache = new Map<string, CachedPolicy>();
    private readonly lastRequestAt = new Map<string, number>();
    private readonly permitted: Set<string>;
    private readonly ttlMs: number;
    readonly now: () => number;

    constructor(options: RobotsGateOptions = {}) {
        this.permitted = new Set((options.permissions ?? []).map((p) => p.host.trim().toLowerCase().replace(/\.$/, "")));
        this.ttlMs = options.ttlMs ?? ROBOTS_CACHE_TTL_MS;
        this.now = options.now ?? (() => Date.now());
    }

    /** True when the host's owner gave written permission (config.ts). */
    hasPermission(host: string): boolean {
        return this.permitted.has(host);
    }

    cached(host: string): RobotsPolicy | null {
        const entry = this.cache.get(host);
        if (!entry) return null;
        if (entry.expiresAt <= this.now()) {
            this.cache.delete(host);
            return null;
        }
        return entry.policy;
    }

    /** Caches a policy for at most the TTL; `maxAgeMs` (from Cache-Control) can only shorten it. */
    store(host: string, policy: RobotsPolicy, maxAgeMs?: number | null): void {
        const ttl = maxAgeMs === null || maxAgeMs === undefined ? this.ttlMs : Math.min(this.ttlMs, Math.max(0, maxAgeMs));
        if (ttl <= 0) return;
        if (this.cache.size >= ROBOTS_CACHE_MAX_HOSTS && !this.cache.has(host)) {
            const oldest = this.cache.keys().next().value;
            if (oldest !== undefined) this.cache.delete(oldest);
        }
        this.cache.set(host, { policy, expiresAt: this.now() + ttl });
    }

    /** Records a request to the host now (a robots.txt fetch counts). */
    noteRequest(host: string): void {
        const now = this.now();
        this.lastRequestAt.set(host, Math.max(now, this.lastRequestAt.get(host) ?? 0));
    }

    /**
     * Claims the next request slot for the host under its Crawl-delay and
     * returns how long to wait before sending it (0: now). When the wait would
     * exceed `maxWaitMs`, nothing is claimed and `{ refused: retryAfterMs }`
     * comes back. Claiming up front keeps two concurrent fetches in this
     * process from both going at once.
     */
    reserve(host: string, crawlDelaySec: number | null, maxWaitMs: number): { waitMs: number } | { refusedMs: number } {
        const now = this.now();
        const delayMs = Math.ceil((crawlDelaySec ?? 0) * 1000);
        const last = this.lastRequestAt.get(host);
        const at = last === undefined ? now : Math.max(now, last + delayMs);
        const waitMs = at - now;
        if (waitMs > maxWaitMs) return { refusedMs: waitMs };
        this.lastRequestAt.set(host, at);
        return { waitMs };
    }

    /** Forgets everything: tests, and nothing else. */
    clear(): void {
        this.cache.clear();
        this.lastRequestAt.clear();
    }
}

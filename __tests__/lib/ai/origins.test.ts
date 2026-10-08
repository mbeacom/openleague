/**
 * The no-divergence test (spec R4): the adapters' URL check and the generated
 * connect-src must accept exactly the same URLs. The CSP side is a source-
 * expression matcher written here from CSP Level 3, independent of both
 * aiConnectSrc and isAllowedUrl, so the list isn't checked against itself.
 */
import { describe, expect, it } from "vitest";
import { aiConnectSrc, resolveAiOrigins } from "@/apps/planner/ai-origins";
import { isAllowedUrl, isLoopbackHost } from "@/lib/ai/origins";

const DEFAULT_PORTS: Record<string, string> = { "http:": "80", "https:": "443" };

/** CSP3 "does url match expression in origin with redirect count" for scheme://host[:port] sources. */
function sourceMatches(source: string, url: URL): boolean {
    const match = /^([a-z][a-z0-9+.-]*):\/\/([^/:]+)(?::(\d+|\*))?$/i.exec(source);
    if (!match) return false;
    const [, scheme, host, port] = match;
    const urlScheme = url.protocol.slice(0, -1);
    // An http: source also matches https: (and never the reverse).
    const schemeOk = scheme === urlScheme || (scheme === "http" && urlScheme === "https");
    if (!schemeOk) return false;
    if (host.toLowerCase() !== url.hostname.toLowerCase()) return false;
    const urlPort = url.port || DEFAULT_PORTS[url.protocol];
    if (port === "*") return true;
    if (port === undefined) {
        // No port: the source scheme's default, or the upgraded default for http→https.
        return urlPort === DEFAULT_PORTS[`${scheme}:`] || (scheme === "http" && urlScheme === "https" && urlPort === "443");
    }
    return port === urlPort;
}

/** Whether a connect-src directive (from aiConnectSrc) allows a cross-origin URL. 'self' is the planner's own origin, never a provider. */
function cspAllows(directive: string, raw: string): boolean {
    const [name, ...sources] = directive.split(/\s+/);
    expect(name).toBe("connect-src");
    const url = new URL(raw);
    return sources.filter((source) => source !== "'self'").some((source) => sourceMatches(source, url));
}

const TABLE = [
    "https://api.anthropic.com/v1/messages",
    "https://api.anthropic.com:443/v1/messages",
    "https://api.openai.com/v1/responses",
    "http://localhost:11434/v1/chat/completions",
    "http://localhost:1234/v1/chat/completions",
    "https://localhost:8443/v1/chat/completions",
    "http://127.0.0.1:11434/v1",
    "https://127.0.0.1:9000/v1",
    "http://localhost/v1",
    "https://api.anthropic.com:8443/v1/messages",
    "http://api.anthropic.com/v1/messages",
    "http://api.openai.com/v1/responses",
    "https://eu.api.anthropic.com/v1/messages",
    "https://api.anthropic.com.example/v1",
    "https://evil.example/v1",
    "http://[::1]:11434/v1",
    "http://192.168.1.20:11434/v1",
    "https://models.example:8443/v1",
    "https://models.example/v1",
    "http://models.example:8443/v1",
    "https://gpu.models.example:8443/v1",
];

describe("isAllowedUrl and connect-src agree", () => {
    const lists: Array<[string, string[]]> = [
        ["the public list", resolveAiOrigins(undefined)],
        ["a self-hosted list", resolveAiOrigins("https://models.example:8443")],
    ];
    for (const [label, list] of lists) {
        it.each(TABLE)(`${label}: %s`, (url) => {
            expect(isAllowedUrl(url, list)).toBe(cspAllows(aiConnectSrc(list), url));
        });
    }

    it("accepts the provider origins and loopback, and refuses the rest, on the public list", () => {
        const list = resolveAiOrigins(undefined);
        expect(isAllowedUrl("https://api.anthropic.com/v1/messages", list)).toBe(true);
        expect(isAllowedUrl("https://api.openai.com/v1/responses", list)).toBe(true);
        expect(isAllowedUrl("http://localhost:11434/v1", list)).toBe(true);
        expect(isAllowedUrl("https://models.example:8443/v1", list)).toBe(false);
        expect(isAllowedUrl("http://[::1]:11434/v1", list)).toBe(false);
    });

    it("allows a self-hoster's origin only on its exact scheme and port", () => {
        const list = resolveAiOrigins("https://models.example:8443");
        expect(isAllowedUrl("https://models.example:8443/v1", list)).toBe(true);
        expect(isAllowedUrl("https://models.example/v1", list)).toBe(false);
        expect(isAllowedUrl("http://models.example:8443/v1", list)).toBe(false);
    });

    it("refuses non-http schemes, user info and garbage", () => {
        const list = resolveAiOrigins(undefined);
        expect(isAllowedUrl("ws://localhost:11434", list)).toBe(false);
        expect(isAllowedUrl("http://user:pw@localhost:11434/v1", list)).toBe(false);
        expect(isAllowedUrl("not a url", list)).toBe(false);
    });
});

describe("isLoopbackHost", () => {
    it("is localhost and 127.0.0.1 only", () => {
        expect(isLoopbackHost("localhost")).toBe(true);
        expect(isLoopbackHost("127.0.0.1")).toBe(true);
        expect(isLoopbackHost("[::1]")).toBe(false);
        expect(isLoopbackHost("localhost.example")).toBe(false);
    });
});

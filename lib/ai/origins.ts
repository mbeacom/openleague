/**
 * The adapters' side of the origin allowlist (ADR-0023, spec R4). The list is
 * the one apps/planner/ai-origins.ts resolves at build time and writes into
 * connect-src; this module only reads it, so lib/ai never imports the app.
 */

/** Hostnames the public list allows on any port: what `http://localhost:*` and `http://127.0.0.1:*` cover. */
export function isLoopbackHost(hostname: string): boolean {
    return hostname === "localhost" || hostname === "127.0.0.1";
}

/** A list entry written with a `:*` port: the loopback pair. */
function anyPortHost(entry: string): string | null {
    const match = /^http:\/\/([^/:]+):\*$/.exec(entry);
    return match ? match[1] : null;
}

/**
 * True when `url` may be fetched: its origin is exactly a listed origin, or its
 * host is a listed any-port host (over http: or https:, since a CSP http: source
 * also admits https:). Anything unparseable, or not http(s), is refused.
 */
export function isAllowedUrl(url: string, origins: readonly string[]): boolean {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return false;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    if (parsed.username || parsed.password) return false;
    return origins.some((entry) => {
        const host = anyPortHost(entry);
        if (host !== null) return parsed.hostname === host;
        return parsed.origin === entry;
    });
}

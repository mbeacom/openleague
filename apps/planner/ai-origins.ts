/**
 * The one list of origins AI features may reach (ADR-0023, spec R4). Pure and
 * build-time, like build-config.ts: the Vite config turns it into the CSP's
 * connect-src and into a constant the adapters check base URLs against, so the
 * two can never disagree.
 */

/** Loopback on any port, for local OpenAI-compatible servers (Ollama, LM Studio). Written as CSP source expressions. */
export const LOOPBACK_AI_ORIGINS = ["http://localhost:*", "http://127.0.0.1:*"] as const;

/** The public build's list: the two official provider origins, then loopback. */
export const PUBLIC_AI_ORIGINS: readonly string[] = ["https://api.anthropic.com", "https://api.openai.com", ...LOOPBACK_AI_ORIGINS];

const VARIABLE = "OPENLEAGUE_AI_CONNECT_ORIGINS";

/** One self-hosted entry: an exact https origin, no path, wildcard, user info or trailing slash. */
function validEntry(entry: string): string {
    if (entry.includes("*")) throw new Error(`${VARIABLE} entries can't contain wildcards: ${entry}`);
    let url: URL;
    try {
        url = new URL(entry);
    } catch {
        throw new Error(`${VARIABLE} entry is not a URL: ${entry}`);
    }
    if (url.protocol !== "https:") throw new Error(`${VARIABLE} entries must be https: ${entry}`);
    if (url.origin !== entry) {
        throw new Error(`${VARIABLE} entries must be an exact origin (scheme, host and optional port; no path, user info or trailing slash): ${entry}`);
    }
    return entry;
}

/**
 * The public list plus each comma-separated OPENLEAGUE_AI_CONNECT_ORIGINS entry.
 * A malformed entry fails the build; duplicates are dropped.
 */
export function resolveAiOrigins(raw: string | undefined): string[] {
    const added = (raw ?? "")
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
        .map(validEntry);
    return Array.from(new Set([...PUBLIC_AI_ORIGINS, ...added]));
}

/** The CSP directive for a resolved list. */
export function aiConnectSrc(origins: readonly string[]): string {
    return ["connect-src", "'self'", ...origins].join(" ");
}

/**
 * Build-time settings for the static planner (ADR-0020). Pure, so the Vite
 * config and the tests share it without loading Vite.
 */
export const DEFAULT_HOSTED_URL = "https://openl.app";

/** OPENLEAGUE_HOSTED_URL, normalized. https only; http is allowed for localhost testing. */
export function resolveHostedUrl(raw: string | undefined): string {
    const value = (raw ?? "").trim().replace(/\/+$/, "") || DEFAULT_HOSTED_URL;
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new Error(`OPENLEAGUE_HOSTED_URL is not a URL: ${value}`);
    }
    const local = url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    if (url.protocol !== "https:" && !local) {
        throw new Error(`OPENLEAGUE_HOSTED_URL must be https: ${value}`);
    }
    return value;
}

/**
 * Added as a <meta> at build time only (the dev server injects inline scripts).
 * Emotion needs inline styles; thumbnails are data: PNGs; downloads use blob:.
 */
export const PLANNER_CSP = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://api.fontshare.com https://fonts.googleapis.com",
    "font-src 'self' https://cdn.fontshare.com https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
].join("; ");

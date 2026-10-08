/**
 * Build-time settings for the static planner (ADR-0020). Pure, so the Vite
 * config and the tests share it without loading Vite.
 */
import { PUBLIC_AI_ORIGINS, aiConnectSrc } from "./ai-origins";

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

/** Trusted Types (ADR-0023, spec R6): on only once the phase 1 compatibility check passes. */
export const TRUSTED_TYPES_ENABLED = false;

/**
 * Added as a <meta> at build time only (the dev server injects inline scripts).
 * Emotion needs inline styles; thumbnails are data: PNGs; downloads use blob:.
 * connect-src is generated from the AI origin allowlist (apps/planner/ai-origins.ts),
 * the same list the adapters check base URLs against.
 */
export function plannerCsp(aiOrigins: readonly string[], { trustedTypes = TRUSTED_TYPES_ENABLED }: { trustedTypes?: boolean } = {}): string {
    return [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline' https://api.fontshare.com https://fonts.googleapis.com",
        "font-src 'self' https://cdn.fontshare.com https://fonts.gstatic.com",
        "img-src 'self' data: blob:",
        aiConnectSrc(aiOrigins),
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'none'",
        ...(trustedTypes ? ["require-trusted-types-for 'script'"] : []),
    ].join("; ");
}

/** The public build's policy. */
export const PLANNER_CSP = plannerCsp(PUBLIC_AI_ORIGINS);

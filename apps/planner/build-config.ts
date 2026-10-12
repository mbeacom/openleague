/**
 * Build-time settings for the static planner (ADR-0020). Pure, so the Vite
 * config and the tests share it without loading Vite.
 */
import { PUBLIC_AI_ORIGINS, aiConnectSrc } from "./ai-origins";
import { NO_CLOUD, cloudCspAdditions, type CloudSettings } from "./cloud-config";

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

/** A directive with a provider's sources appended (none: unchanged). */
const withSources = (directive: string, sources: readonly string[] | undefined): string => (sources && sources.length > 0 ? `${directive} ${sources.join(" ")}` : directive);

/**
 * Added as a <meta> at build time only (the dev server injects inline scripts).
 * Emotion needs inline styles; thumbnails are data: PNGs; downloads use blob:.
 * connect-src is generated from the AI origin allowlist (apps/planner/ai-origins.ts),
 * the same list the adapters check base URLs against.
 *
 * Cloud connectors (storage connectors spec R9) add their hosts only when
 * built in. With none, the policy is exactly the one before them. frame-src
 * appears only when a provider needs it, and then always starts with 'self':
 * an explicit frame-src stops the fallback to default-src, and MSAL's silent
 * iframe ends on the planner's own page.
 */
export function plannerCsp(
    aiOrigins: readonly string[],
    { trustedTypes = TRUSTED_TYPES_ENABLED, cloud = NO_CLOUD }: { trustedTypes?: boolean; cloud?: CloudSettings } = {},
): string {
    const added = cloudCspAdditions(cloud);
    const frames = added["frame-src"];
    return [
        "default-src 'self'",
        withSources("script-src 'self'", added["script-src"]),
        withSources("style-src 'self' 'unsafe-inline' https://api.fontshare.com https://fonts.googleapis.com", added["style-src"]),
        "font-src 'self' https://cdn.fontshare.com https://fonts.gstatic.com",
        "img-src 'self' data: blob:",
        withSources(aiConnectSrc(aiOrigins), added["connect-src"]),
        ...(frames && frames.length > 0 ? [withSources("frame-src 'self'", frames)] : []),
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'none'",
        ...(trustedTypes ? ["require-trusted-types-for 'script'"] : []),
    ].join("; ");
}

/**
 * The public build's policy. Marked pure: the app imports this module for
 * DEFAULT_HOSTED_URL, and the policy (with its provider hosts) must not ride along.
 */
export const PLANNER_CSP = /* @__PURE__ */ plannerCsp(PUBLIC_AI_ORIGINS);

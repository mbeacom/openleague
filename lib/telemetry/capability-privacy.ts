/**
 * Capability-route privacy for telemetry.
 *
 * Public capability routes are unauthenticated URLs whose path segment *is* the
 * credential — `/gear-wishlist/<shareToken>` grants anyone holding the link read
 * access to the wishlist and the ability to pledge against it. Any telemetry
 * payload that carries that URL (a Sentry request URL, transaction name, span
 * description, breadcrumb, navigation event, error message, or a `callbackUrl`
 * query parameter) leaks the credential to a third-party processor.
 *
 * This module is deliberately isomorphic and dependency-free: the same
 * redaction runs in the browser bundle (`instrumentation-client.ts`), on the
 * Node server (`sentry.server.config.ts`), and on the edge runtime
 * (`sentry.edge.config.ts`), so a token cannot escape through a runtime that was
 * forgotten. It must never touch `window`, `document`, or `process`.
 */

/**
 * Path prefixes whose *next* segment is a bearer credential.
 * Prefixes must be absolute and end with `/` so only the token segment matches.
 */
export const PUBLIC_CAPABILITY_ROUTE_PREFIXES = ['/gear-wishlist/'] as const;

/** Replacement written in place of a capability token. */
export const CAPABILITY_TOKEN_REDACTION = '[redacted]';

/** Umami's documented client-side kill switch (re-read on every send). */
export const UMAMI_DISABLED_STORAGE_KEY = 'umami.disabled';

/**
 * Marks the `umami.disabled` flag as ours so a later resume clears only the
 * value this app wrote and never a visitor's own opt-out.
 */
export const UMAMI_DISABLED_OWNER_STORAGE_KEY = 'openleague.umami.disabled.owner';

/** Deep-scrub recursion ceiling; Sentry envelopes are far shallower than this. */
const MAX_SCRUB_DEPTH = 12;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A token stops at the next path/query/fragment delimiter or whitespace, so a
 * longer URL keeps everything after the credential (`?utm=x`, `#items`).
 */
const RAW_TOKEN_PATTERNS = PUBLIC_CAPABILITY_ROUTE_PREFIXES.map(
  (prefix) => new RegExp(`(${escapeRegExp(prefix)})([^/?#&\\s"'\`\\\\]+)`, 'gi')
);

/**
 * The same prefixes percent-encoded, which is how the path arrives inside a
 * query parameter (`?callbackUrl=%2Fgear-wishlist%2F<token>`).
 */
const ENCODED_TOKEN_PATTERNS = PUBLIC_CAPABILITY_ROUTE_PREFIXES.map(
  (prefix) =>
    new RegExp(`(${escapeRegExp(prefix.replace(/\//g, '%2F'))})([^/?#&\\s"'\`\\\\%]+)`, 'gi')
);

/** Next.js renders parameterized routes as `/gear-wishlist/[token]` — already safe. */
function isPlaceholderSegment(segment: string): boolean {
  return /^\[.*\]$/.test(segment) || segment === CAPABILITY_TOKEN_REDACTION;
}

/** True when `pathname` addresses a public capability route. */
export function isPublicCapabilityPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const path = pathname.split(/[?#]/)[0] ?? '';
  return PUBLIC_CAPABILITY_ROUTE_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/** True when `url` (absolute, or relative to `base`) addresses a capability route. */
export function isPublicCapabilityUrl(url: string | null | undefined, base?: string): boolean {
  if (!url) return false;

  try {
    return isPublicCapabilityPath(new URL(url, base ?? 'http://capability.invalid').pathname);
  } catch {
    return isPublicCapabilityPath(url);
  }
}

/**
 * Replace every capability token in a string with `[redacted]`, leaving the rest
 * of the URL (and any surrounding text) intact so telemetry stays groupable.
 */
export function scrubCapabilityTokens(value: string): string {
  if (!value) return value;

  let scrubbed = value;

  for (const pattern of [...RAW_TOKEN_PATTERNS, ...ENCODED_TOKEN_PATTERNS]) {
    // Reset explicitly: these patterns are module-level and /g is stateful.
    pattern.lastIndex = 0;
    scrubbed = scrubbed.replace(pattern, (match: string, prefix: string, token: string) =>
      isPlaceholderSegment(token) ? match : `${prefix}${CAPABILITY_TOKEN_REDACTION}`
    );
  }

  return scrubbed;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Frozen payloads and accessor-only properties must not throw mid-flush. */
function assign(target: Record<string, unknown>, key: string, next: unknown): void {
  if (target[key] === next) return;
  try {
    target[key] = next;
  } catch {
    // Non-writable property: keep the original value rather than drop the event.
  }
}

function scrubValue(value: unknown, seen: WeakSet<object>, depth: number): unknown {
  if (typeof value === 'string') return scrubCapabilityTokens(value);
  if (typeof value !== 'object' || value === null || depth >= MAX_SCRUB_DEPTH) return value;

  if (seen.has(value)) return value;
  seen.add(value);

  if (Array.isArray(value)) {
    const entries = value as unknown as Record<string, unknown>;
    for (let index = 0; index < value.length; index += 1) {
      assign(entries, String(index), scrubValue(value[index], seen, depth + 1));
    }
    return value;
  }

  // Only plain objects are traversed: an Error, Date, or host object reachable
  // from a hint must not be mutated, and Sentry envelopes are plain by design.
  if (!isPlainObject(value)) return value;

  for (const key of Object.keys(value)) {
    assign(value, key, scrubValue(value[key], seen, depth + 1));
  }

  return value;
}

/**
 * Deep-redact capability tokens from any telemetry payload (Sentry error event,
 * transaction, span, or breadcrumb) immediately before it is exported.
 *
 * The payload is mutated in place and returned, which is what Sentry's
 * `beforeSend*` contract expects.
 */
export function scrubTelemetryPayload<T>(payload: T): T {
  if (payload === null || payload === undefined) return payload;
  return scrubValue(payload, new WeakSet<object>(), 0) as T;
}

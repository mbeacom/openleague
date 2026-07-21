import { headers } from "next/headers";
import { prisma } from "@/lib/db/prisma";

/**
 * Durable, serverless-safe rate limiting for Server Actions, backed by the
 * rate_limit_buckets table (H7). The in-memory limiters in
 * lib/utils/rate-limit.ts only cover /api/* via proxy.ts and reset on every
 * cold start; Server Actions POST to page URLs, so this module is their only
 * production throttle.
 *
 * Semantics: FIXED-window counting (one row per key + window), not sliding —
 * bursts of up to 2x the limit are possible across a window boundary. That is
 * acceptable at these thresholds and keeps the check to a single round-trip.
 */

export interface RateLimitOptions {
  limit: number;
  windowSec: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the current window resets; set only when not allowed. */
  retryAfterSec?: number;
}

/** Every Server Action rate-limit policy, defined in one place. */
export const RATE_LIMITS = {
  /** Signup burns a bcrypt hash (cost 12) + a verification email per account. */
  SIGNUP_PER_IP: { limit: 5, windowSec: 60 * 60 },
  SIGNUP_PER_EMAIL: { limit: 3, windowSec: 60 * 60 },
  /**
   * Unauthenticated email senders. Per-account issuance is already capped at
   * 3/hr in lib/auth/tokens.ts; these cap cross-account spraying per IP.
   */
  PASSWORD_RESET_PER_IP: { limit: 10, windowSec: 15 * 60 },
  VERIFICATION_RESEND_PER_IP: { limit: 10, windowSec: 15 * 60 },
  /**
   * Credentials-login attempts keyed by target email — unlike the in-memory
   * proxy limiter, this survives cold starts and scale-out.
   */
  LOGIN_PER_EMAIL: { limit: 10, windowSec: 15 * 60 },
  /** Admin-gated email fan-out (invitations and resends share one bucket). */
  INVITATION_SEND_PER_USER: { limit: 30, windowSec: 60 * 60 },
  /** League/team message fan-out per sender. */
  MESSAGE_SEND_PER_USER: { limit: 20, windowSec: 60 * 60 },
} as const satisfies Record<string, RateLimitOptions>;

/** Fraction of checks that piggyback a delete of expired buckets. */
const CLEANUP_PROBABILITY = 0.01;

/**
 * Count a hit against `key` for the current fixed window and report whether
 * it is within `opts.limit`.
 *
 * Atomicity: the where clause is exactly the composite primary key and there
 * are no nested writes, so Prisma executes the upsert as a single native
 * `INSERT .. ON CONFLICT DO UPDATE .. RETURNING` — each concurrent caller
 * observes its own post-increment count, race-free across lambdas.
 *
 * FAIL-OPEN: any database error logs and allows the request. A degraded
 * database must not lock everyone out of signup/login; the guarded action's
 * own DB work will surface real outages.
 */
export async function checkRateLimit(
  key: string,
  opts: RateLimitOptions
): Promise<RateLimitResult> {
  try {
    const now = Date.now();
    const windowMs = opts.windowSec * 1000;
    const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
    const expiresAt = new Date(windowStart.getTime() + windowMs);

    const bucket = await prisma.rateLimitBucket.upsert({
      where: { key_windowStart: { key, windowStart } },
      create: { key, windowStart, expiresAt }, // count defaults to 1
      update: { count: { increment: 1 } },
    });

    // Opportunistic cleanup keeps the table bounded without a dedicated cron;
    // fire-and-forget so it never adds latency or failures to the caller.
    if (Math.random() < CLEANUP_PROBABILITY) {
      prisma.rateLimitBucket
        .deleteMany({ where: { expiresAt: { lt: new Date(now) } } })
        .catch((cleanupError) => {
          console.error("Rate-limit bucket cleanup failed:", cleanupError);
        });
    }

    if (bucket.count > opts.limit) {
      return {
        allowed: false,
        retryAfterSec: Math.max(1, Math.ceil((expiresAt.getTime() - now) / 1000)),
      };
    }
    return { allowed: true };
  } catch (error) {
    console.error(`Rate-limit check failed for "${key}" (failing open):`, error);
    return { allowed: true };
  }
}

/** User-facing rejection message matching the actions' error-string shape. */
export function rateLimitMessage(retryAfterSec?: number): string {
  const minutes = Math.max(1, Math.ceil((retryAfterSec ?? 60) / 60));
  return `Too many requests — try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

/**
 * Client IP for keying unauthenticated actions, read from proxy-set headers
 * (same trust model as getClientIp in lib/utils/rate-limit.ts). Returns null
 * when no IP is available — callers should SKIP their per-IP check in that
 * case rather than throttle all IP-less traffic in one shared bucket.
 */
export async function getClientIp(): Promise<string | null> {
  try {
    const headerList = await headers();
    const forwarded = headerList.get("x-forwarded-for");
    const realIp = headerList.get("x-real-ip");
    const cfConnectingIp = headerList.get("cf-connecting-ip"); // Cloudflare
    return forwarded?.split(",")[0]?.trim() || realIp || cfConnectingIp || null;
  } catch {
    // headers() throws outside a request scope (e.g. unit tests).
    return null;
  }
}

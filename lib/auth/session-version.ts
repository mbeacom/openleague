import { prisma } from "@/lib/db/prisma";

/**
 * Stateless-JWT session revocation. The JWT carries a `sv` (session-version)
 * snapshot taken at sign-in; bumping `User.sessionVersion` (on password reset /
 * change / email change) makes every outstanding token's `sv` stale, and the
 * auth `jwt` callback drops those tokens on its next (throttled) re-check.
 *
 * Kept in its own module — importing the NextAuth config pulls the next-auth
 * runtime, so this logic lives here to stay directly unit-testable.
 */

/** Re-check at most this often per token, to bound the per-request DB load. */
export const SESSION_RECHECK_MS = 60_000;

interface SessionToken {
  id?: unknown;
  sv?: number;
  svCheckedAt?: number;
}

/** Seed a freshly-signed-in token with the current session-version snapshot. */
export function seedSessionToken<T extends SessionToken>(
  token: T,
  userId: string,
  sessionVersion: number
): T {
  token.id = userId;
  token.sv = sessionVersion;
  token.svCheckedAt = Date.now();
  return token;
}

/**
 * Re-validate an existing token against the DB, throttled to once per
 * SESSION_RECHECK_MS unless `force` is set (an explicit session update).
 * Returns the token to keep the session, or null to invalidate it (version
 * advanced past this token, or the user no longer exists).
 */
export async function revalidateSessionToken<T extends SessionToken>(
  token: T,
  options?: { force?: boolean }
): Promise<T | null> {
  const now = Date.now();
  const stale = !token.svCheckedAt || now - token.svCheckedAt > SESSION_RECHECK_MS;
  if (token.id && (options?.force || stale)) {
    const current = await prisma.user.findUnique({
      where: { id: token.id as string },
      select: { sessionVersion: true },
    });
    if (!current || current.sessionVersion !== (token.sv ?? 0)) {
      return null;
    }
    token.svCheckedAt = now;
  }
  return token;
}

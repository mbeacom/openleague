import { createHash, randomBytes } from "crypto";
import type { VerificationTokenType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

/**
 * Single-use account-lifecycle tokens (email verification, password reset,
 * email change). Raw tokens are 256-bit base64url strings that exist only in
 * the emailed link; the database stores their SHA-256 hash, so a leaked table
 * cannot be replayed into an account takeover.
 */

export const TOKEN_TTLS_MS: Record<VerificationTokenType, number> = {
  EMAIL_VERIFICATION: 24 * 60 * 60 * 1000,
  PASSWORD_RESET: 60 * 60 * 1000,
  EMAIL_CHANGE: 24 * 60 * 60 * 1000,
};

/** Max token issues per (user, type) per hour — DB-backed, serverless-safe. */
const MAX_ISSUES_PER_HOUR = 3;

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export type IssueTokenResult = { raw: string } | { throttled: true };

/**
 * Issue a new token of the given type for a user. Previously issued tokens
 * stay valid until consumed or expired; issuance is throttled per user+type
 * by counting recent rows, which also serves as the rate-limit audit trail.
 */
export async function issueVerificationToken(
  userId: string,
  type: VerificationTokenType,
  options?: { newEmail?: string }
): Promise<IssueTokenResult> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentCount = await prisma.verificationToken.count({
    where: { userId, type, createdAt: { gt: oneHourAgo } },
  });
  if (recentCount >= MAX_ISSUES_PER_HOUR) {
    return { throttled: true };
  }

  const raw = randomBytes(32).toString("base64url");
  await prisma.verificationToken.create({
    data: {
      tokenHash: hashToken(raw),
      type,
      userId,
      newEmail: options?.newEmail,
      expiresAt: new Date(Date.now() + TOKEN_TTLS_MS[type]),
    },
  });

  // Opportunistic cleanup of this user's long-expired tokens (keep the last
  // hour intact — it backs the throttle above).
  await prisma.verificationToken.deleteMany({
    where: { userId, expiresAt: { lt: oneHourAgo }, createdAt: { lt: oneHourAgo } },
  });

  return { raw };
}

export interface ConsumedToken {
  userId: string;
  newEmail: string | null;
}

/**
 * Atomically consume a raw token: valid only if it exists, matches the
 * expected type, is unused, and is unexpired. Marking usedAt via a guarded
 * updateMany makes concurrent consumption of the same token single-winner.
 */
export async function consumeVerificationToken(
  raw: string,
  type: VerificationTokenType
): Promise<ConsumedToken | null> {
  const tokenHash = hashToken(raw);
  const now = new Date();

  const updated = await prisma.verificationToken.updateMany({
    where: { tokenHash, type, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  if (updated.count === 0) {
    return null;
  }

  const token = await prisma.verificationToken.findUnique({
    where: { tokenHash },
    select: { userId: true, newEmail: true },
  });
  if (!token) {
    return null;
  }

  // A consumed token retires its unused siblings of the same type.
  await prisma.verificationToken.deleteMany({
    where: { userId: token.userId, type, usedAt: null },
  });

  return { userId: token.userId, newEmail: token.newEmail };
}

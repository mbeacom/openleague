"use server";

import { hash } from "bcryptjs";
import { ZodError } from "zod";
import { prisma } from "@/lib/db/prisma";
import { consumeVerificationToken, issueVerificationToken } from "@/lib/auth/tokens";
import {
  sendEmailChangedNoticeEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "@/lib/email/templates";
import {
  checkRateLimit,
  getClientIp,
  rateLimitMessage,
  RATE_LIMITS,
} from "@/lib/utils/durable-rate-limit";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  type ForgotPasswordInput,
  type ResetPasswordInput,
} from "@/lib/utils/validation";

export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Request a password-reset email. Deliberately unauthenticated and
 * enumeration-safe: the response is identical whether or not the address has
 * an account, and issuance is throttled per account in lib/auth/tokens.ts.
 */
export async function requestPasswordReset(
  input: ForgotPasswordInput
): Promise<ActionResult<{ message: string }>> {
  const message =
    "If an account exists for that address, we've sent a password reset link. Check your email.";
  try {
    const validated = forgotPasswordSchema.parse(input);

    // Per-IP durable throttle: caps cross-account spraying before identity is
    // known. Still enumeration-safe — the rejection depends only on request
    // volume from this IP, never on whether the account exists.
    const ip = await getClientIp();
    if (ip) {
      const rl = await checkRateLimit(`pw-reset:ip:${ip}`, RATE_LIMITS.PASSWORD_RESET_PER_IP);
      if (!rl.allowed) {
        return { success: false, error: rateLimitMessage(rl.retryAfterSec) };
      }
    }

    const user = await prisma.user.findUnique({
      where: { email: validated.email },
      select: { id: true, email: true, name: true },
    });

    if (user) {
      const issued = await issueVerificationToken(user.id, "PASSWORD_RESET");
      if ("raw" in issued) {
        await sendPasswordResetEmail({ email: user.email, name: user.name, token: issued.raw });
      }
      // Throttled requests fall through to the same generic response.
    }

    return { success: true, data: { message } };
  } catch (error) {
    if (error instanceof ZodError) {
      return { success: false, error: "Please enter a valid email address" };
    }
    console.error("Error requesting password reset:", error);
    // Still enumeration-safe: transport failures return the generic message.
    return { success: true, data: { message } };
  }
}

/**
 * Complete a password reset with an emailed token. Consuming the token also
 * proves inbox ownership, so unverified accounts become verified here.
 */
export async function resetPassword(
  input: ResetPasswordInput
): Promise<ActionResult<{ message: string }>> {
  try {
    const validated = resetPasswordSchema.parse(input);

    const consumed = await consumeVerificationToken(validated.token, "PASSWORD_RESET");
    if (!consumed) {
      return {
        success: false,
        error: "This reset link is invalid or has expired. Please request a new one.",
      };
    }

    const passwordHash = await hash(validated.password, 12);
    // Resetting the password proves inbox ownership (verifies email) and must
    // evict any outstanding sessions — this flow exists to recover a
    // compromised account, so bump sessionVersion to invalidate them.
    await prisma.user.update({
      where: { id: consumed.userId },
      data: {
        passwordHash,
        sessionVersion: { increment: 1 },
      },
    });
    await prisma.user.updateMany({
      where: { id: consumed.userId, emailVerified: null },
      data: { emailVerified: new Date() },
    });

    return { success: true, data: { message: "Password updated" } };
  } catch (error) {
    if (error instanceof ZodError) {
      const first = error.issues[0]?.message ?? "Invalid input";
      return { success: false, error: first };
    }
    console.error("Error resetting password:", error);
    return { success: false, error: "Something went wrong. Please try again." };
  }
}

/**
 * Re-send the email-verification link. Enumeration-safe like
 * requestPasswordReset; already-verified accounts are silently skipped.
 */
export async function resendVerificationEmail(
  input: ForgotPasswordInput
): Promise<ActionResult<{ message: string }>> {
  const message =
    "If an unverified account exists for that address, we've sent a new verification link.";
  try {
    const validated = forgotPasswordSchema.parse(input);

    // Per-IP durable throttle, enumeration-safe (see requestPasswordReset).
    const ip = await getClientIp();
    if (ip) {
      const rl = await checkRateLimit(
        `verify-resend:ip:${ip}`,
        RATE_LIMITS.VERIFICATION_RESEND_PER_IP
      );
      if (!rl.allowed) {
        return { success: false, error: rateLimitMessage(rl.retryAfterSec) };
      }
    }

    const user = await prisma.user.findUnique({
      where: { email: validated.email },
      select: { id: true, email: true, name: true, emailVerified: true },
    });

    if (user && !user.emailVerified) {
      const issued = await issueVerificationToken(user.id, "EMAIL_VERIFICATION");
      if ("raw" in issued) {
        await sendVerificationEmail({ email: user.email, name: user.name, token: issued.raw });
      }
    }

    return { success: true, data: { message } };
  } catch (error) {
    if (error instanceof ZodError) {
      return { success: false, error: "Please enter a valid email address" };
    }
    console.error("Error resending verification email:", error);
    return { success: true, data: { message } };
  }
}

/**
 * Confirm an email-verification token. Invoked by an explicit user action on
 * the /verify-email/[token] page (a POST-style Server Action), NOT a plain GET
 * — so email-security scanners that prefetch the link cannot consume the
 * single-use token before the human clicks.
 */
export async function confirmEmailVerification(
  token: string
): Promise<ActionResult<{ message: string }>> {
  try {
    const consumed = await consumeVerificationToken(token, "EMAIL_VERIFICATION");
    if (!consumed) {
      return {
        success: false,
        error: "This verification link is invalid or has expired. Request a new one from the login page.",
      };
    }
    // Guarded update: never regress an already-verified timestamp.
    await prisma.user.updateMany({
      where: { id: consumed.userId, emailVerified: null },
      data: { emailVerified: new Date() },
    });
    return { success: true, data: { message: "Email verified" } };
  } catch (error) {
    console.error("Error verifying email:", error);
    return { success: false, error: "Something went wrong. Please try again." };
  }
}

/**
 * Confirm a pending email change. Invoked by an explicit user action on the
 * /confirm-email-change/[token] page (scanner-safe, like verification). Applies
 * the new address, evicts existing sessions, revokes the user's other
 * outstanding tokens, and notifies the OLD address.
 */
export async function confirmEmailChange(
  token: string
): Promise<ActionResult<{ message: string }>> {
  try {
    const consumed = await consumeVerificationToken(token, "EMAIL_CHANGE");
    if (!consumed || !consumed.newEmail) {
      return {
        success: false,
        error: "This confirmation link is invalid or has expired.",
      };
    }

    // The address may have been claimed since the request was made.
    const taken = await prisma.user.findUnique({
      where: { email: consumed.newEmail },
      select: { id: true },
    });
    if (taken && taken.id !== consumed.userId) {
      return {
        success: false,
        error: "That email address is no longer available.",
      };
    }

    const user = await prisma.user.findUnique({
      where: { id: consumed.userId },
      select: { email: true, name: true },
    });
    if (!user) {
      return { success: false, error: "Account not found." };
    }

    await prisma.user.update({
      where: { id: consumed.userId },
      // Changing the login identity evicts existing sessions (sessionVersion).
      data: {
        email: consumed.newEmail,
        emailVerified: new Date(),
        sessionVersion: { increment: 1 },
      },
    });

    // Don't leave live tokens (password reset, verification) sitting in the OLD
    // inbox — revoke every outstanding unused token for this user.
    await prisma.verificationToken.deleteMany({
      where: { userId: consumed.userId, usedAt: null },
    });

    try {
      await sendEmailChangedNoticeEmail({
        oldEmail: user.email,
        newEmail: consumed.newEmail,
        name: user.name,
      });
    } catch (noticeError) {
      console.error("Error sending email-changed notice:", noticeError);
    }

    return { success: true, data: { message: "Email address updated" } };
  } catch (error) {
    console.error("Error confirming email change:", error);
    return { success: false, error: "Something went wrong. Please try again." };
  }
}

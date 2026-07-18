"use server";

import { hash } from "bcryptjs";
import { ZodError } from "zod";
import { prisma } from "@/lib/db/prisma";
import { consumeVerificationToken, issueVerificationToken } from "@/lib/auth/tokens";
import { sendPasswordResetEmail, sendVerificationEmail } from "@/lib/email/templates";
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
    await prisma.user.update({
      where: { id: consumed.userId },
      data: { passwordHash },
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

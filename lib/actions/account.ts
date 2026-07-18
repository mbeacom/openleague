"use server";

import { compare, hash } from "bcryptjs";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/auth/session";
import { issueVerificationToken } from "@/lib/auth/tokens";
import { sendEmailChangeVerificationEmail } from "@/lib/email/templates";
import {
  changePasswordSchema,
  deleteAccountSchema,
  requestEmailChangeSchema,
  updateProfileSchema,
  type ChangePasswordInput,
  type DeleteAccountInput,
  type RequestEmailChangeInput,
  type UpdateProfileInput,
} from "@/lib/utils/validation";

export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

/** Fetch the current user or fail — shared by the password-guarded actions. */
async function requireUserWithPassword(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, passwordHash: true },
  });
}

export async function updateProfile(
  input: UpdateProfileInput
): Promise<ActionResult<{ name: string | null }>> {
  try {
    const userId = await requireUserId();
    const validated = updateProfileSchema.parse(input);

    const user = await prisma.user.update({
      where: { id: userId },
      data: { name: validated.name || null },
      select: { name: true },
    });

    revalidatePath("/account");
    return { success: true, data: { name: user.name } };
  } catch (error) {
    if (error instanceof ZodError) {
      return { success: false, error: error.issues[0]?.message ?? "Invalid input" };
    }
    console.error("Error updating profile:", error);
    return { success: false, error: "Failed to update profile. Please try again." };
  }
}

export async function changePassword(
  input: ChangePasswordInput
): Promise<ActionResult<{ message: string }>> {
  try {
    const userId = await requireUserId();
    const validated = changePasswordSchema.parse(input);

    const user = await requireUserWithPassword(userId);
    if (!user) {
      return { success: false, error: "Account not found" };
    }

    const passwordValid = await compare(validated.currentPassword, user.passwordHash);
    if (!passwordValid) {
      return { success: false, error: "Current password is incorrect" };
    }

    const passwordHash = await hash(validated.newPassword, 12);
    // Changing the password evicts every existing session (sessionVersion);
    // the caller's own client signs out and re-authenticates afterward.
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash, sessionVersion: { increment: 1 } },
    });

    return { success: true, data: { message: "Password updated" } };
  } catch (error) {
    if (error instanceof ZodError) {
      return { success: false, error: error.issues[0]?.message ?? "Invalid input" };
    }
    console.error("Error changing password:", error);
    return { success: false, error: "Failed to change password. Please try again." };
  }
}

/**
 * Start an email change: password-confirmed, then a verification link is
 * sent to the NEW address. The address only changes when that link is
 * clicked (see /api/auth/confirm-email-change/[token]).
 */
export async function requestEmailChange(
  input: RequestEmailChangeInput
): Promise<ActionResult<{ message: string }>> {
  try {
    const userId = await requireUserId();
    const validated = requestEmailChangeSchema.parse(input);

    const user = await requireUserWithPassword(userId);
    if (!user) {
      return { success: false, error: "Account not found" };
    }

    const passwordValid = await compare(validated.password, user.passwordHash);
    if (!passwordValid) {
      return { success: false, error: "Password is incorrect" };
    }

    if (validated.newEmail === user.email.toLowerCase()) {
      return { success: false, error: "That is already your email address" };
    }

    const taken = await prisma.user.findUnique({
      where: { email: validated.newEmail },
      select: { id: true },
    });
    if (taken) {
      return { success: false, error: "An account with that email already exists" };
    }

    const issued = await issueVerificationToken(userId, "EMAIL_CHANGE", {
      newEmail: validated.newEmail,
    });
    if ("throttled" in issued) {
      return {
        success: false,
        error: "Too many email change requests. Please try again in an hour.",
      };
    }

    await sendEmailChangeVerificationEmail({
      newEmail: validated.newEmail,
      name: user.name,
      token: issued.raw,
    });

    return {
      success: true,
      data: { message: `Verification link sent to ${validated.newEmail}. Your email will change once you confirm it there.` },
    };
  } catch (error) {
    if (error instanceof ZodError) {
      return { success: false, error: error.issues[0]?.message ?? "Invalid input" };
    }
    console.error("Error requesting email change:", error);
    return { success: false, error: "Failed to request email change. Please try again." };
  }
}

/**
 * Permanently delete the caller's account. Password-confirmed; relies on
 * schema-level cascades to remove memberships, RSVPs, tokens, etc.
 */
export async function deleteAccount(
  input: DeleteAccountInput
): Promise<ActionResult<{ message: string }>> {
  try {
    const userId = await requireUserId();
    const validated = deleteAccountSchema.parse(input);

    const user = await requireUserWithPassword(userId);
    if (!user) {
      return { success: false, error: "Account not found" };
    }

    const passwordValid = await compare(validated.password, user.passwordHash);
    if (!passwordValid) {
      return { success: false, error: "Password is incorrect" };
    }

    // Personal data (memberships, RSVPs, tokens, guardianships, players) is
    // removed by ON DELETE CASCADE. Authored/audit rows (created seasons,
    // venues, plays, sent invitations, etc.) reference the user via ON DELETE
    // RESTRICT, so if the caller owns any of that content the delete raises a
    // Postgres FK violation (Prisma P2003). Surface that as an actionable
    // message rather than a silent generic failure. (Anonymizing those
    // authorship pointers so admins can also self-delete is Track 2 work.)
    try {
      await prisma.user.delete({ where: { id: userId } });
    } catch (deleteError) {
      if (
        deleteError instanceof Prisma.PrismaClientKnownRequestError &&
        deleteError.code === "P2003"
      ) {
        return {
          success: false,
          error:
            "Your account owns content that others depend on (teams, seasons, venues, or sent invitations). Transfer or remove it first, then try again — or contact support to complete deletion.",
        };
      }
      throw deleteError;
    }

    return { success: true, data: { message: "Account deleted" } };
  } catch (error) {
    if (error instanceof ZodError) {
      return { success: false, error: error.issues[0]?.message ?? "Invalid input" };
    }
    console.error("Error deleting account:", error);
    return { success: false, error: "Failed to delete account. Please try again." };
  }
}

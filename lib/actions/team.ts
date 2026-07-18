"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireUserId, requireTeamAdmin } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import {
  createTeamSchema,
  updateTeamSchema,
  type CreateTeamInput,
  type UpdateTeamInput,
} from "@/lib/utils/validation";
import { sanitizeErrorForLogging } from "@/lib/utils/error-handling";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: unknown };

const ACCOUNT_NOT_FOUND_ERROR =
  "Your account was not found. Please sign out and sign up again.";

/**
 * Create a new team and assign the creator as ADMIN
 */
export async function createTeam(
  input: CreateTeamInput
): Promise<ActionResult<{ id: string; name: string; sport: string; season: string }>> {
  try {
    // Authorization check - user must be authenticated
    const userId = await requireUserId();

    // Validate input
    const validated = createTeamSchema.parse(input);

    // Create team and assign creator as ADMIN
    // Prisma enforces referential integrity — if userId is invalid,
    // a foreign key constraint error (P2003) is thrown and caught below.
    const team = await prisma.team.create({
      data: {
        name: validated.name,
        sport: validated.sport,
        season: validated.season,
        members: {
          create: {
            userId,
            role: "ADMIN",
          },
        },
      },
      select: {
        id: true,
        name: true,
        sport: true,
        season: true,
      },
    });

    // Revalidate dashboard/team pages to show the new team immediately.
    revalidatePath("/");
    revalidatePath("/dashboard");
    revalidatePath(`/team/${team.id}`);

    return {
      success: true,
      data: team,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Format validation errors for better UX
      const fieldErrors = error.issues.map(issue =>
        `${issue.path.join('.')}: ${issue.message}`
      ).join(', ');
      return {
        success: false,
        error: `Validation failed: ${fieldErrors}`,
        details: error.issues,
      };
    }

    // Log sanitized error to avoid leaking sensitive details
    console.error("Error creating team:", sanitizeErrorForLogging(error));

    // Check for foreign key violation (user doesn't exist in DB)
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      return {
        success: false,
        error: ACCOUNT_NOT_FOUND_ERROR,
      };
    }

    return {
      success: false,
      error: "Failed to create team. Please try again.",
    };
  }
}

/**
 * Update an existing team's editable profile fields (name, sport, season).
 * Only team admins may make changes.
 */
export async function updateTeam(
  input: UpdateTeamInput
): Promise<ActionResult<{ id: string; name: string; sport: string; season: string }>> {
  try {
    // 1. Authenticate the caller.
    await requireUserId();

    // 2. Validate input before it touches the database or the auth check.
    const validated = updateTeamSchema.parse(input);

    // 3. Authorize — only team admins can edit team settings.
    await requireTeamAdmin(validated.id);

    // 4. Persist the change (Prisma parameterized query — no raw SQL).
    const team = await prisma.team.update({
      where: { id: validated.id },
      data: {
        name: validated.name,
        sport: validated.sport,
        season: validated.season,
      },
      select: {
        id: true,
        name: true,
        sport: true,
        season: true,
      },
    });

    // 5. Revalidate pages that surface the team name/details.
    revalidatePath("/");
    revalidatePath("/dashboard");
    revalidatePath("/settings");
    revalidatePath(`/team/${team.id}`);

    return {
      success: true,
      data: team,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const fieldErrors = error.issues.map(issue =>
        `${issue.path.join('.')}: ${issue.message}`
      ).join(', ');
      return {
        success: false,
        error: `Validation failed: ${fieldErrors}`,
        details: error.issues,
      };
    }

    // requireTeamAdmin throws a plain "Unauthorized: ..." error for non-admins.
    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return {
        success: false,
        error: "You do not have permission to update this team.",
      };
    }

    console.error("Error updating team:", sanitizeErrorForLogging(error));

    // Team was deleted between load and save.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return {
        success: false,
        error: "Team not found.",
      };
    }

    return {
      success: false,
      error: "Failed to update team. Please try again.",
    };
  }
}

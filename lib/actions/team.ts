"use server";

import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import { createTeamSchema, type CreateTeamInput } from "@/lib/utils/validation";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: unknown };

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

    // Verify the user actually exists in the database
    // (JWT session can outlive a database reset)
    const userExists = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!userExists) {
      return {
        success: false,
        error:
          "Your account was not found. Please sign out and sign up again.",
      };
    }

    // Create team and assign creator as ADMIN
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

    // Revalidate the dashboard page to show the new team
    revalidatePath("/");

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

    // Log full error for debugging
    console.error("Error creating team:", error);

    // Check for foreign key violation (user doesn't exist in DB)
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (
      errorMessage.includes("Foreign key constraint") ||
      errorMessage.includes("foreign key") ||
      errorMessage.includes("violates foreign key")
    ) {
      return {
        success: false,
        error:
          "Your account was not found. Please sign out and sign up again.",
      };
    }

    return {
      success: false,
      error: "Failed to create team. Please try again.",
    };
  }
}

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

    // Log error for debugging but don't expose internals to client
    console.error("Error creating team:", error);

    // Check for database constraints or common errors
    if (error && typeof error === 'object' && 'code' in error) {
      const dbError = error as { code?: string };
      if (dbError.code === 'P2002') {
        return {
          success: false,
          error: "A team with this name already exists.",
        };
      }
    }

    return {
      success: false,
      error: "Failed to create team. Please try again.",
    };
  }
}

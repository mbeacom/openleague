"use server";

import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";

// Helper for optional string fields that allow empty string
function optionalString(schema: z.ZodString) {
  return schema.optional().or(z.literal(""));
}

// Validation schemas
export const addPlayerSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must be less than 100 characters"),
  email: optionalString(z.string().email("Invalid email address")),
  phone: optionalString(z.string().max(20, "Phone must be less than 20 characters")),
  emergencyContact: optionalString(
    z.string().max(100, "Emergency contact must be less than 100 characters")
  ),
  emergencyPhone: optionalString(
    z.string().max(20, "Emergency phone must be less than 20 characters")
  ),
  teamId: z.string().min(1, "Team ID is required"),
});

export const updatePlayerSchema = addPlayerSchema.extend({
  id: z.string().min(1, "Player ID is required"),
});

export type AddPlayerInput = z.infer<typeof addPlayerSchema>;
export type UpdatePlayerInput = z.infer<typeof updatePlayerSchema>;

/**
 * Check if user is an admin of the team
 * Uses count for efficiency - lets database handle the check
 */
async function isTeamAdmin(userId: string, teamId: string): Promise<boolean> {
  const count = await prisma.teamMember.count({
    where: {
      userId,
      teamId,
      role: "ADMIN",
    },
  });

  return count > 0;
}

/**
 * Add a player to the team roster
 * Only ADMIN role can add players
 */
export async function addPlayer(input: AddPlayerInput) {
  try {
    // Validate input
    const validated = addPlayerSchema.parse(input);

    // Check authentication
    const userId = await requireUserId();

    // Check authorization - only ADMIN can add players
    const isAdmin = await isTeamAdmin(userId, validated.teamId);
    if (!isAdmin) {
      return {
        error: "Unauthorized: Only team admins can add players",
      };
    }

    // Create player
    const player = await prisma.player.create({
      data: {
        name: validated.name,
        email: validated.email || null,
        phone: validated.phone || null,
        emergencyContact: validated.emergencyContact || null,
        emergencyPhone: validated.emergencyPhone || null,
        teamId: validated.teamId,
      },
    });

    // Revalidate roster page
    revalidatePath(`/roster`);

    return {
      success: true,
      data: player,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        error: "Invalid input",
        details: error.issues,
      };
    }

    console.error("Error adding player:", error);
    return {
      error: "Failed to add player. Please try again.",
    };
  }
}

/**
 * Update a player's information
 * Only ADMIN role can update players
 */
export async function updatePlayer(input: UpdatePlayerInput) {
  try {
    // Validate input
    const validated = updatePlayerSchema.parse(input);

    // Check authentication
    const userId = await requireUserId();

    // Check authorization - only ADMIN can update players
    const isAdmin = await isTeamAdmin(userId, validated.teamId);
    if (!isAdmin) {
      return {
        error: "Unauthorized: Only team admins can update players",
      };
    }

    // Verify player belongs to the team before updating
    const existingPlayer = await prisma.player.findUnique({
      where: { id: validated.id },
      select: { teamId: true },
    });

    if (!existingPlayer) {
      return {
        error: "Player not found",
      };
    }

    if (existingPlayer.teamId !== validated.teamId) {
      return {
        error: "Unauthorized: Player does not belong to this team",
      };
    }

    // Update player
    const player = await prisma.player.update({
      where: {
        id: validated.id,
      },
      data: {
        name: validated.name,
        email: validated.email || null,
        phone: validated.phone || null,
        emergencyContact: validated.emergencyContact || null,
        emergencyPhone: validated.emergencyPhone || null,
      },
    });

    // Revalidate roster page
    revalidatePath(`/roster`);

    return {
      success: true,
      data: player,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        error: "Invalid input",
        details: error.issues,
      };
    }

    console.error("Error updating player:", error);
    return {
      error: "Failed to update player. Please try again.",
    };
  }
}

/**
 * Delete a player from the roster
 * Only ADMIN role can delete players
 */
export async function deletePlayer(playerId: string, teamId: string) {
  try {
    // Check authentication
    const userId = await requireUserId();

    // Check authorization - only ADMIN can delete players
    const isAdmin = await isTeamAdmin(userId, teamId);
    if (!isAdmin) {
      return {
        error: "Unauthorized: Only team admins can delete players",
      };
    }

    // Verify player belongs to the team before deleting
    const existingPlayer = await prisma.player.findUnique({
      where: { id: playerId },
      select: { teamId: true },
    });

    if (!existingPlayer) {
      return {
        error: "Player not found",
      };
    }

    if (existingPlayer.teamId !== teamId) {
      return {
        error: "Unauthorized: Player does not belong to this team",
      };
    }

    // Delete player
    await prisma.player.delete({
      where: {
        id: playerId,
      },
    });

    // Revalidate roster page
    revalidatePath(`/roster`);

    return {
      success: true,
    };
  } catch (error) {
    console.error("Error deleting player:", error);
    return {
      error: "Failed to delete player. Please try again.",
    };
  }
}

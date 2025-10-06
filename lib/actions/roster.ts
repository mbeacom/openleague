"use server";

import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireTeamAdmin } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import { 
  addPlayerSchema, 
  updatePlayerSchema,
  type AddPlayerInput,
  type UpdatePlayerInput 
} from "@/lib/utils/validation";



/**
 * Add a player to the team roster
 * Only ADMIN role can add players
 */
export async function addPlayer(input: AddPlayerInput) {
  try {
    // Validate input
    const validated = addPlayerSchema.parse(input);

    // Check authentication and authorization - only ADMIN can add players
    await requireTeamAdmin(validated.teamId);

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

    // Check authentication and authorization - only ADMIN can update players
    await requireTeamAdmin(validated.teamId);

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
    // Check authentication and authorization - only ADMIN can delete players
    await requireTeamAdmin(teamId);

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

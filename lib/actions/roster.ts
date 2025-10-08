"use server";

import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireTeamAdmin, requireUserId } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import {
  addPlayerSchema,
  updatePlayerSchema,
  transferPlayerSchema,
  type AddPlayerInput,
  type UpdatePlayerInput,
  type TransferPlayerInput
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

/**
 * Transfer a player between teams within a league
 * Only league admins can transfer players
 */
export async function transferPlayer(input: TransferPlayerInput) {
  try {
    const validated = transferPlayerSchema.parse(input);
    const userId = await requireUserId();

    // Verify user is league admin
    const leagueUser = await prisma.leagueUser.findFirst({
      where: {
        userId,
        leagueId: validated.leagueId,
        role: "LEAGUE_ADMIN",
      },
    });

    if (!leagueUser) {
      return {
        error: "Unauthorized: Only league admins can transfer players",
      };
    }

    // Verify player exists and belongs to the from team
    const player = await prisma.player.findUnique({
      where: { id: validated.playerId },
      include: {
        team: { select: { id: true, name: true, leagueId: true } },
      },
    });

    if (!player) {
      return {
        error: "Player not found",
      };
    }

    if (player.teamId !== validated.fromTeamId) {
      return {
        error: "Player does not belong to the specified team",
      };
    }

    if (player.team.leagueId !== validated.leagueId) {
      return {
        error: "Player does not belong to the specified league",
      };
    }

    // Verify destination team exists and belongs to the league
    const toTeam = await prisma.team.findUnique({
      where: { id: validated.toTeamId },
      select: { id: true, name: true, leagueId: true, isActive: true },
    });

    if (!toTeam || !toTeam.isActive) {
      return {
        error: "Destination team not found or inactive",
      };
    }

    if (toTeam.leagueId !== validated.leagueId) {
      return {
        error: "Destination team does not belong to the specified league",
      };
    }

    // Check for duplicate player in destination team (by email if available)
    if (player.email) {
      const duplicatePlayer = await prisma.player.findFirst({
        where: {
          teamId: validated.toTeamId,
          email: player.email,
          id: { not: player.id },
        },
      });

      if (duplicatePlayer) {
        return {
          error: `A player with email ${player.email} already exists on the destination team`,
        };
      }
    }

    // Perform the transfer in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update player's team
      const updatedPlayer = await tx.player.update({
        where: { id: validated.playerId },
        data: { teamId: validated.toTeamId },
        include: {
          team: { select: { name: true } },
        },
      });

      // Create transfer history record
      await tx.playerTransfer.create({
        data: {
          playerId: validated.playerId,
          fromTeamId: validated.fromTeamId,
          toTeamId: validated.toTeamId,
          leagueId: validated.leagueId,
          transferredById: userId,
          reason: "League admin transfer",
        },
      });

      return updatedPlayer;
    });

    // Revalidate relevant pages
    revalidatePath(`/league/${validated.leagueId}/roster`);
    revalidatePath(`/roster`);

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        error: "Invalid input",
        details: error.issues,
      };
    }

    console.error("Error transferring player:", error);
    return {
      error: "Failed to transfer player. Please try again.",
    };
  }
}

/**
 * Export league roster data as CSV
 * Only league admins can export league roster
 */
export async function exportLeagueRoster(leagueId: string) {
  try {
    const userId = await requireUserId();

    // Verify user is league admin
    const leagueUser = await prisma.leagueUser.findFirst({
      where: {
        userId,
        leagueId,
        role: "LEAGUE_ADMIN",
      },
    });

    if (!leagueUser) {
      return {
        error: "Unauthorized: Only league admins can export roster data",
      };
    }

    // Fetch all players in the league
    const players = await prisma.player.findMany({
      where: {
        leagueId,
      },
      include: {
        team: {
          select: {
            name: true,
            division: {
              select: {
                name: true,
                ageGroup: true,
                skillLevel: true,
              },
            },
          },
        },
        user: {
          select: {
            email: true,
          },
        },
      },
      orderBy: [
        { team: { name: "asc" } },
        { name: "asc" },
      ],
    });

    // Generate CSV content with proper escaping
    const headers = [
      "Player Name",
      "Email",
      "Phone",
      "Team",
      "Division",
      "Age Group",
      "Skill Level",
      "Registered",
      "Emergency Contact",
      "Emergency Phone",
    ];

    // Helper function to properly escape CSV fields
    const escapeCSVField = (field: string | null | undefined): string => {
      if (!field) return '';
      // Convert to string and escape double quotes by doubling them
      const stringField = String(field).replace(/"/g, '""');
      // Wrap in quotes if field contains comma, quote, or newline
      if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n') || stringField.includes('\r')) {
        return `"${stringField}"`;
      }
      return stringField;
    };

    const csvRows = [
      headers.join(","),
      ...players.map(player => [
        escapeCSVField(player.name),
        escapeCSVField(player.email),
        escapeCSVField(player.phone),
        escapeCSVField(player.team.name),
        escapeCSVField(player.team.division?.name),
        escapeCSVField(player.team.division?.ageGroup),
        escapeCSVField(player.team.division?.skillLevel),
        player.user ? "Yes" : "No",
        escapeCSVField(player.emergencyContact),
        escapeCSVField(player.emergencyPhone),
      ].join(","))
    ];

    const csvContent = csvRows.join("\n");

    return {
      success: true,
      data: csvContent,
    };
  } catch (error) {
    console.error("Error exporting league roster:", error);
    return {
      error: "Failed to export roster data. Please try again.",
    };
  }
}

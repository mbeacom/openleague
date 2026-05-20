"use server";

import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireTeamAdmin, requireUserId } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import {
  addPlayerSchema,
  updatePlayerSchema,
  transferPlayerSchema,
  updateTeamMemberUsahIdSchema,
  type AddPlayerInput,
  type UpdatePlayerInput,
  type TransferPlayerInput,
  type UpdateTeamMemberUsahIdInput,
} from "@/lib/utils/validation";

function revalidateRosterPaths(...teamIds: string[]) {
  revalidatePath("/roster");

  for (const teamId of new Set(teamIds)) {
    revalidatePath(`/team/${teamId}`);
    revalidatePath(`/team/${teamId}/roster`);
  }
}

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
        jerseyNumber: validated.jerseyNumber ?? null,
        usahMemberId: validated.usahMemberId || null,
      },
    });

    // Check for duplicate jersey number on same team
    let warning: string | undefined;
    if (validated.jerseyNumber != null) {
      const duplicate = await prisma.player.findFirst({
        where: {
          teamId: validated.teamId,
          jerseyNumber: validated.jerseyNumber,
          id: { not: player.id },
        },
        select: { name: true },
      });
      if (duplicate) {
        warning = `Jersey #${validated.jerseyNumber} is already assigned to ${duplicate.name}`;
      }
    }

    // Revalidate roster pages
    revalidateRosterPaths(validated.teamId);

    return {
      success: true,
      data: player,
      warning,
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
        ...(validated.jerseyNumber !== undefined && { jerseyNumber: validated.jerseyNumber }),
        ...(validated.usahMemberId !== undefined && { usahMemberId: validated.usahMemberId || null }),
      },
    });

    // Check for duplicate jersey number on same team (excluding the updated player)
    let warning: string | undefined;
    if (validated.jerseyNumber != null) {
      const duplicate = await prisma.player.findFirst({
        where: {
          teamId: validated.teamId,
          jerseyNumber: validated.jerseyNumber,
          id: { not: validated.id },
        },
        select: { name: true },
      });
      if (duplicate) {
        warning = `Jersey #${validated.jerseyNumber} is already assigned to ${duplicate.name}`;
      }
    }

    // Revalidate roster pages
    revalidateRosterPaths(validated.teamId);

    return {
      success: true,
      data: player,
      warning,
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

    // Revalidate roster pages
    revalidateRosterPaths(teamId);

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
    revalidateRosterPaths(validated.fromTeamId, validated.toTeamId);

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
 * Update the USA Hockey Member ID for a team official (coach/manager)
 * Only ADMIN role can update team member USAH IDs
 */
export async function updateTeamMemberUsahId(input: UpdateTeamMemberUsahIdInput) {
  try {
    const validated = updateTeamMemberUsahIdSchema.parse(input);

    await requireTeamAdmin(validated.teamId);

    // Verify the TeamMember belongs to the given team
    const member = await prisma.teamMember.findUnique({
      where: { id: validated.teamMemberId },
      select: { teamId: true },
    });

    if (!member) {
      return { success: false as const, error: "Team member not found" };
    }

    if (member.teamId !== validated.teamId) {
      return { success: false as const, error: "Unauthorized: Team member does not belong to this team" };
    }

    const updateData: { usahMemberId?: string | null } = {};
    if (validated.usahMemberId !== undefined) {
      updateData.usahMemberId = validated.usahMemberId || null;
    }

    const updated = await prisma.teamMember.update({
      where: { id: validated.teamMemberId },
      data: updateData,
      select: { id: true, usahMemberId: true },
    });

    revalidateRosterPaths(validated.teamId);

    return { success: true as const, data: updated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false as const, error: "Invalid input", details: error.issues };
    }
    console.error("Error updating team member USAH ID:", error);
    return { success: false as const, error: "Failed to update USA Hockey Member ID. Please try again." };
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

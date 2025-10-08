"use server";

import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import {
  createLeagueSchema,
  updateLeagueSettingsSchema,
  addTeamToLeagueSchema,
  migrateTeamToLeagueSchema,
  type CreateLeagueInput,
  type UpdateLeagueSettingsInput,
  type AddTeamToLeagueInput,
  type MigrateTeamToLeagueInput,
} from "@/lib/utils/validation";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: unknown };

/**
 * Create a new league and assign the creator as LEAGUE_ADMIN
 */
export async function createLeague(
  input: CreateLeagueInput
): Promise<ActionResult<{ id: string; name: string; sport: string }>> {
  try {
    // Authorization check - user must be authenticated
    const userId = await requireUserId();

    // Validate input
    const validated = createLeagueSchema.parse(input);

    // Create league and assign creator as LEAGUE_ADMIN
    const league = await prisma.league.create({
      data: {
        name: validated.name,
        sport: validated.sport,
        contactEmail: validated.contactEmail,
        contactPhone: validated.contactPhone,
        users: {
          create: {
            userId,
            role: "LEAGUE_ADMIN",
          },
        },
      },
      select: {
        id: true,
        name: true,
        sport: true,
      },
    });

    // Revalidate relevant pages
    revalidatePath("/");
    revalidatePath("/dashboard");

    return {
      success: true,
      data: league,
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

    console.error("Error creating league:", error);
    return {
      success: false,
      error: "Failed to create league. Please try again.",
    };
  }
}

/**
 * Migrate an existing team to become the first team in a new league
 */
export async function migrateTeamToLeague(
  input: MigrateTeamToLeagueInput
): Promise<ActionResult<{ league: { id: string; name: string }; team: { id: string; name: string } }>> {
  try {
    const userId = await requireUserId();
    const validated = migrateTeamToLeagueSchema.parse(input);

    // Verify user is admin of the team
    const teamMember = await prisma.teamMember.findFirst({
      where: {
        teamId: validated.teamId,
        userId,
        role: "ADMIN",
      },
      include: {
        team: true,
      },
    });

    if (!teamMember) {
      return {
        success: false,
        error: "Unauthorized - you must be an admin of this team",
      };
    }

    // Verify team is not already in a league
    if (teamMember.team.leagueId) {
      return {
        success: false,
        error: "Team is already part of a league",
      };
    }

    // Use transaction to ensure data consistency
    const result = await prisma.$transaction(async (tx) => {
      // Create league
      const league = await tx.league.create({
        data: {
          name: validated.leagueData.name,
          sport: validated.leagueData.sport,
          contactEmail: validated.leagueData.contactEmail,
          contactPhone: validated.leagueData.contactPhone,
          users: {
            create: {
              userId,
              role: "LEAGUE_ADMIN",
            },
          },
        },
        select: {
          id: true,
          name: true,
        },
      });

      // Update team to belong to league
      const team = await tx.team.update({
        where: { id: validated.teamId },
        data: { leagueId: league.id },
        select: {
          id: true,
          name: true,
        },
      });

      // Update all team's events to belong to league
      await tx.event.updateMany({
        where: { teamId: validated.teamId },
        data: { leagueId: league.id },
      });

      // Update all team's players to belong to league
      await tx.player.updateMany({
        where: { teamId: validated.teamId },
        data: { leagueId: league.id },
      });

      return { league, team };
    });

    revalidatePath("/");
    revalidatePath("/dashboard");

    return {
      success: true,
      data: result,
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

    console.error("Error migrating team to league:", error);
    return {
      success: false,
      error: "Failed to migrate team to league. Please try again.",
    };
  }
}

/**
 * Add a new team to an existing league
 */
export async function addTeamToLeague(
  input: AddTeamToLeagueInput
): Promise<ActionResult<{ id: string; name: string; sport: string; season: string }>> {
  try {
    const userId = await requireUserId();
    const validated = addTeamToLeagueSchema.parse(input);

    // Verify user has league admin permissions
    const leagueUser = await prisma.leagueUser.findFirst({
      where: {
        leagueId: validated.leagueId,
        userId,
        role: "LEAGUE_ADMIN",
      },
    });

    if (!leagueUser) {
      return {
        success: false,
        error: "Unauthorized - you must be a league admin",
      };
    }

    // Verify league exists and is active
    const league = await prisma.league.findFirst({
      where: {
        id: validated.leagueId,
        isActive: true,
      },
    });

    if (!league) {
      return {
        success: false,
        error: "League not found or inactive",
      };
    }

    // If divisionId is provided, verify it belongs to this league
    if (validated.divisionId) {
      const division = await prisma.division.findFirst({
        where: {
          id: validated.divisionId,
          leagueId: validated.leagueId,
          isActive: true,
        },
      });

      if (!division) {
        return {
          success: false,
          error: "Division not found or does not belong to this league",
        };
      }
    }

    // Create team within the league
    const team = await prisma.team.create({
      data: {
        name: validated.name,
        sport: validated.sport,
        season: validated.season,
        leagueId: validated.leagueId,
        divisionId: validated.divisionId,
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

    revalidatePath("/");
    revalidatePath("/dashboard");
    revalidatePath(`/league/${validated.leagueId}`);

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

    console.error("Error adding team to league:", error);
    return {
      success: false,
      error: "Failed to add team to league. Please try again.",
    };
  }
}

/**
 * Update league settings (league admin only)
 */
export async function updateLeagueSettings(
  input: UpdateLeagueSettingsInput
): Promise<ActionResult<{ id: string; name: string; sport: string }>> {
  try {
    const userId = await requireUserId();
    const validated = updateLeagueSettingsSchema.parse(input);

    // Verify user has league admin permissions
    const leagueUser = await prisma.leagueUser.findFirst({
      where: {
        leagueId: validated.id,
        userId,
        role: "LEAGUE_ADMIN",
      },
    });

    if (!leagueUser) {
      return {
        success: false,
        error: "Unauthorized - you must be a league admin",
      };
    }

    // Update league settings
    const league = await prisma.league.update({
      where: { id: validated.id },
      data: {
        name: validated.name,
        sport: validated.sport,
        contactEmail: validated.contactEmail,
        contactPhone: validated.contactPhone,
      },
      select: {
        id: true,
        name: true,
        sport: true,
      },
    });

    revalidatePath("/");
    revalidatePath("/dashboard");
    revalidatePath(`/league/${validated.id}`);

    return {
      success: true,
      data: league,
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

    console.error("Error updating league settings:", error);
    return {
      success: false,
      error: "Failed to update league settings. Please try again.",
    };
  }
}

/**
 * Helper function to verify league admin permissions
 */
export async function verifyLeagueAdmin(leagueId: string, userId?: string): Promise<boolean> {
  try {
    const currentUserId = userId || await requireUserId();
    
    const leagueUser = await prisma.leagueUser.findFirst({
      where: {
        leagueId,
        userId: currentUserId,
        role: "LEAGUE_ADMIN",
      },
    });

    return !!leagueUser;
  } catch {
    return false;
  }
}

/**
 * Helper function to verify team admin permissions within a league context
 */
export async function verifyTeamAdminInLeague(
  teamId: string, 
  leagueId: string, 
  userId?: string
): Promise<boolean> {
  try {
    const currentUserId = userId || await requireUserId();
    
    // Check if user is league admin (has access to all teams)
    const isLeagueAdmin = await verifyLeagueAdmin(leagueId, currentUserId);
    if (isLeagueAdmin) return true;

    // Check if user is admin of the specific team
    const teamMember = await prisma.teamMember.findFirst({
      where: {
        teamId,
        userId: currentUserId,
        role: "ADMIN",
        team: {
          leagueId,
        },
      },
    });

    return !!teamMember;
  } catch {
    return false;
  }
}
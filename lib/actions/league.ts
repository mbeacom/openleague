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
  createDivisionSchema,
  updateDivisionSchema,
  deleteDivisionSchema,
  assignTeamToDivisionSchema,
  getLeagueTeamsSchema,
  type CreateLeagueInput,
  type UpdateLeagueSettingsInput,
  type AddTeamToLeagueInput,
  type MigrateTeamToLeagueInput,
  type CreateDivisionInput,
  type UpdateDivisionInput,
  type DeleteDivisionInput,
  type AssignTeamToDivisionInput,
  type GetLeagueTeamsInput,
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

// Division Management Actions

/**
 * Create a new division within a league
 */
export async function createDivision(
  input: CreateDivisionInput
): Promise<ActionResult<{ id: string; name: string; ageGroup: string | null; skillLevel: string | null }>> {
  try {
    const userId = await requireUserId();
    const validated = createDivisionSchema.parse(input);

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

    // Check for duplicate division name within the league
    const existingDivision = await prisma.division.findFirst({
      where: {
        leagueId: validated.leagueId,
        name: validated.name,
        isActive: true,
      },
    });

    if (existingDivision) {
      return {
        success: false,
        error: "A division with this name already exists in the league",
      };
    }

    // Create division
    const division = await prisma.division.create({
      data: {
        name: validated.name,
        ageGroup: validated.ageGroup || null,
        skillLevel: validated.skillLevel || null,
        leagueId: validated.leagueId,
      },
      select: {
        id: true,
        name: true,
        ageGroup: true,
        skillLevel: true,
      },
    });

    revalidatePath(`/league/${validated.leagueId}`);
    revalidatePath(`/league/${validated.leagueId}/teams`);

    return {
      success: true,
      data: division,
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

    console.error("Error creating division:", error);
    return {
      success: false,
      error: "Failed to create division. Please try again.",
    };
  }
}

/**
 * Update an existing division
 */
export async function updateDivision(
  input: UpdateDivisionInput
): Promise<ActionResult<{ id: string; name: string; ageGroup: string | null; skillLevel: string | null }>> {
  try {
    const userId = await requireUserId();
    const validated = updateDivisionSchema.parse(input);

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

    // Verify division exists and belongs to the league
    const existingDivision = await prisma.division.findFirst({
      where: {
        id: validated.id,
        leagueId: validated.leagueId,
        isActive: true,
      },
    });

    if (!existingDivision) {
      return {
        success: false,
        error: "Division not found or does not belong to this league",
      };
    }

    // Check for duplicate division name within the league (excluding current division)
    const duplicateDivision = await prisma.division.findFirst({
      where: {
        leagueId: validated.leagueId,
        name: validated.name,
        isActive: true,
        id: { not: validated.id },
      },
    });

    if (duplicateDivision) {
      return {
        success: false,
        error: "A division with this name already exists in the league",
      };
    }

    // Update division
    const division = await prisma.division.update({
      where: { id: validated.id },
      data: {
        name: validated.name,
        ageGroup: validated.ageGroup || null,
        skillLevel: validated.skillLevel || null,
      },
      select: {
        id: true,
        name: true,
        ageGroup: true,
        skillLevel: true,
      },
    });

    revalidatePath(`/league/${validated.leagueId}`);
    revalidatePath(`/league/${validated.leagueId}/teams`);

    return {
      success: true,
      data: division,
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

    console.error("Error updating division:", error);
    return {
      success: false,
      error: "Failed to update division. Please try again.",
    };
  }
}

/**
 * Delete a division (soft delete by setting isActive to false)
 */
export async function deleteDivision(
  input: DeleteDivisionInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const userId = await requireUserId();
    const validated = deleteDivisionSchema.parse(input);

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

    // Verify division exists and belongs to the league
    const existingDivision = await prisma.division.findFirst({
      where: {
        id: validated.id,
        leagueId: validated.leagueId,
        isActive: true,
      },
      include: {
        teams: {
          where: { isActive: true },
          select: { id: true },
        },
      },
    });

    if (!existingDivision) {
      return {
        success: false,
        error: "Division not found or does not belong to this league",
      };
    }

    // Use transaction to handle division deletion and team reassignment
    await prisma.$transaction(async (tx) => {
      // Remove division assignment from all teams in this division
      await tx.team.updateMany({
        where: {
          divisionId: validated.id,
          isActive: true,
        },
        data: {
          divisionId: null,
        },
      });

      // Soft delete the division
      await tx.division.update({
        where: { id: validated.id },
        data: { isActive: false },
      });
    });

    revalidatePath(`/league/${validated.leagueId}`);
    revalidatePath(`/league/${validated.leagueId}/teams`);

    return {
      success: true,
      data: { id: validated.id },
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

    console.error("Error deleting division:", error);
    return {
      success: false,
      error: "Failed to delete division. Please try again.",
    };
  }
}

/**
 * Assign a team to a division or remove division assignment
 */
export async function assignTeamToDivision(
  input: AssignTeamToDivisionInput
): Promise<ActionResult<{ teamId: string; divisionId: string | null }>> {
  try {
    const userId = await requireUserId();
    const validated = assignTeamToDivisionSchema.parse(input);

    // Verify user has league admin permissions or is admin of the specific team
    const hasPermission = await verifyTeamAdminInLeague(
      validated.teamId,
      validated.leagueId,
      userId
    );

    if (!hasPermission) {
      return {
        success: false,
        error: "Unauthorized - you must be a league admin or team admin",
      };
    }

    // Verify team exists and belongs to the league
    const team = await prisma.team.findFirst({
      where: {
        id: validated.teamId,
        leagueId: validated.leagueId,
        isActive: true,
      },
    });

    if (!team) {
      return {
        success: false,
        error: "Team not found or does not belong to this league",
      };
    }

    // If divisionId is provided, verify it exists and belongs to the league
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

    // Update team's division assignment
    await prisma.team.update({
      where: { id: validated.teamId },
      data: { divisionId: validated.divisionId },
    });

    revalidatePath(`/league/${validated.leagueId}`);
    revalidatePath(`/league/${validated.leagueId}/teams`);

    return {
      success: true,
      data: {
        teamId: validated.teamId,
        divisionId: validated.divisionId,
      },
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

    console.error("Error assigning team to division:", error);
    return {
      success: false,
      error: "Failed to assign team to division. Please try again.",
    };
  }
}

/**
 * Get paginated teams for a league with filtering support
 */
export async function getLeagueTeamsPaginated(
  input: GetLeagueTeamsInput
): Promise<ActionResult<{
  teams: Array<{
    id: string;
    name: string;
    sport: string;
    season: string;
    divisionId: string | null;
    _count: { players: number; events: number };
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}>> {
  try {
    const userId = await requireUserId();
    const validated = getLeagueTeamsSchema.parse(input);

    // Verify user has access to the league
    const leagueUser = await prisma.leagueUser.findFirst({
      where: {
        leagueId: validated.leagueId,
        userId,
      },
    });

    if (!leagueUser) {
      return {
        success: false,
        error: "Unauthorized - you are not a member of this league",
      };
    }

    // Build filter conditions
    const where: {
      leagueId: string;
      isActive: boolean;
      name?: { contains: string; mode: 'insensitive' };
      sport?: string;
      season?: string;
      divisionId?: string | null;
    } = {
      leagueId: validated.leagueId,
      isActive: true,
    };

    if (validated.search) {
      where.name = {
        contains: validated.search,
        mode: 'insensitive',
      };
    }

    if (validated.sport) {
      where.sport = validated.sport;
    }

    if (validated.season) {
      where.season = validated.season;
    }

    if (validated.divisionId !== undefined) {
      where.divisionId = validated.divisionId;
    }

    // Get total count
    const total = await prisma.team.count({ where });

    // Calculate pagination
    const totalPages = Math.ceil(total / validated.limit);
    const skip = (validated.page - 1) * validated.limit;

    // Fetch teams
    const teams = await prisma.team.findMany({
      where,
      skip,
      take: validated.limit,
      select: {
        id: true,
        name: true,
        sport: true,
        season: true,
        divisionId: true,
        _count: {
          select: {
            players: true,
            events: true,
          },
        },
      },
      orderBy: [
        { name: 'asc' },
      ],
    });

    return {
      success: true,
      data: {
        teams,
        pagination: {
          page: validated.page,
          limit: validated.limit,
          total,
          totalPages,
        },
      },
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

    console.error("Error fetching league teams:", error);
    return {
      success: false,
      error: "Failed to fetch league teams. Please try again.",
    };
  }
}

/**
 * Check if a user has access to a specific league
 */
export async function hasLeagueAccess(userId: string, leagueId: string): Promise<boolean> {
  try {
    const leagueUser = await prisma.leagueUser.findFirst({
      where: {
        leagueId,
        userId,
        league: {
          isActive: true,
        },
      },
    });

    return !!leagueUser;
  } catch {
    return false;
  }
}

/**
 * Get league data with comprehensive statistics for dashboard
 */
export async function getLeagueWithStats(leagueId: string): Promise<{
  id: string;
  name: string;
  sport: string;
  contactEmail: string;
  contactPhone: string | null;
  createdAt: Date;
  stats: {
    totalTeams: number;
    totalPlayers: number;
    totalEvents: number;
    upcomingEvents: number;
    activeDivisions: number;
  };
  recentActivity: Array<{
    id: string;
    type: 'team_created' | 'player_added' | 'event_scheduled' | 'division_created';
    description: string;
    timestamp: Date;
    teamName?: string;
    playerName?: string;
    eventTitle?: string;
    divisionName?: string;
  }>;
  upcomingEvents: Array<{
    id: string;
    title: string;
    startAt: Date;
    location: string;
    teamName: string;
    homeTeamName?: string;
    awayTeamName?: string;
    type: string;
  }>;
  divisions: Array<{
    id: string;
    name: string;
    ageGroup: string | null;
    skillLevel: string | null;
    teamCount: number;
  }>;
} | null> {
  try {
    // Get basic league info
    const league = await prisma.league.findFirst({
      where: {
        id: leagueId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        sport: true,
        contactEmail: true,
        contactPhone: true,
        createdAt: true,
      },
    });

    if (!league) return null;

    // Get statistics
    const [
      totalTeams,
      totalPlayers,
      totalEvents,
      upcomingEventsCount,
      activeDivisions,
    ] = await Promise.all([
      prisma.team.count({
        where: { leagueId, isActive: true },
      }),
      prisma.player.count({
        where: { leagueId },
      }),
      prisma.event.count({
        where: { leagueId },
      }),
      prisma.event.count({
        where: {
          leagueId,
          startAt: { gte: new Date() },
        },
      }),
      prisma.division.count({
        where: { leagueId, isActive: true },
      }),
    ]);

    // Get recent activity (last 10 items)
    const [recentTeams, recentPlayers, recentEvents, recentDivisions] = await Promise.all([
      prisma.team.findMany({
        where: { leagueId, isActive: true },
        select: {
          id: true,
          name: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 3,
      }),
      prisma.player.findMany({
        where: { leagueId },
        select: {
          id: true,
          name: true,
          createdAt: true,
          team: {
            select: { name: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 3,
      }),
      prisma.event.findMany({
        where: { leagueId },
        select: {
          id: true,
          title: true,
          createdAt: true,
          team: {
            select: { name: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 3,
      }),
      prisma.division.findMany({
        where: { leagueId, isActive: true },
        select: {
          id: true,
          name: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 2,
      }),
    ]);

    // Combine and sort recent activity
    const recentActivity = [
      ...recentTeams.map(team => ({
        id: team.id,
        type: 'team_created' as const,
        description: `Team "${team.name}" was created`,
        timestamp: team.createdAt,
        teamName: team.name,
      })),
      ...recentPlayers.map(player => ({
        id: player.id,
        type: 'player_added' as const,
        description: `${player.name} joined ${player.team.name}`,
        timestamp: player.createdAt,
        playerName: player.name,
        teamName: player.team.name,
      })),
      ...recentEvents.map(event => ({
        id: event.id,
        type: 'event_scheduled' as const,
        description: `Event "${event.title}" scheduled for ${event.team.name}`,
        timestamp: event.createdAt,
        eventTitle: event.title,
        teamName: event.team.name,
      })),
      ...recentDivisions.map(division => ({
        id: division.id,
        type: 'division_created' as const,
        description: `Division "${division.name}" was created`,
        timestamp: division.createdAt,
        divisionName: division.name,
      })),
    ]
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 10);

    // Get upcoming events (next 5)
    const upcomingEvents = await prisma.event.findMany({
      where: {
        leagueId,
        startAt: { gte: new Date() },
      },
      select: {
        id: true,
        title: true,
        startAt: true,
        location: true,
        type: true,
        team: {
          select: { name: true },
        },
        homeTeam: {
          select: { name: true },
        },
        awayTeam: {
          select: { name: true },
        },
      },
      orderBy: { startAt: 'asc' },
      take: 5,
    });

    // Get divisions with team counts
    const divisions = await prisma.division.findMany({
      where: { leagueId, isActive: true },
      select: {
        id: true,
        name: true,
        ageGroup: true,
        skillLevel: true,
        _count: {
          select: {
            teams: {
              where: { isActive: true },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return {
      ...league,
      stats: {
        totalTeams,
        totalPlayers,
        totalEvents,
        upcomingEvents: upcomingEventsCount,
        activeDivisions,
      },
      recentActivity,
      upcomingEvents: upcomingEvents.map(event => ({
        id: event.id,
        title: event.title,
        startAt: event.startAt,
        location: event.location,
        type: event.type,
        teamName: event.team.name,
        homeTeamName: event.homeTeam?.name,
        awayTeamName: event.awayTeam?.name,
      })),
      divisions: divisions.map(division => ({
        id: division.id,
        name: division.name,
        ageGroup: division.ageGroup,
        skillLevel: division.skillLevel,
        teamCount: division._count.teams,
      })),
    };
  } catch (error) {
    console.error("Error fetching league with stats:", error);
    return null;
  }
}

/**
 * Get league teams organized by divisions for team management interface
 */
export async function getLeagueTeamsWithDivisions(leagueId: string): Promise<{
  id: string;
  name: string;
  sport: string;
  divisions: Array<{
    id: string;
    name: string;
    ageGroup: string | null;
    skillLevel: string | null;
    teams: Array<{
      id: string;
      name: string;
      sport: string;
      season: string;
      createdAt: Date;
      _count: {
        players: number;
        events: number;
      };
    }>;
  }>;
  unassignedTeams: Array<{
    id: string;
    name: string;
    sport: string;
    season: string;
    createdAt: Date;
    _count: {
      players: number;
      events: number;
    };
  }>;
  stats: {
    totalTeams: number;
    totalPlayers: number;
    totalDivisions: number;
  };
} | null> {
  try {
    // Get basic league info
    const league = await prisma.league.findFirst({
      where: {
        id: leagueId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        sport: true,
      },
    });

    if (!league) return null;

    // Get divisions with their teams
    const divisions = await prisma.division.findMany({
      where: {
        leagueId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        ageGroup: true,
        skillLevel: true,
        teams: {
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            sport: true,
            season: true,
            createdAt: true,
            _count: {
              select: {
                players: true,
                events: true,
              },
            },
          },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    // Get teams not assigned to any division
    const unassignedTeams = await prisma.team.findMany({
      where: {
        leagueId,
        divisionId: null,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        sport: true,
        season: true,
        createdAt: true,
        _count: {
          select: {
            players: true,
            events: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    // Get statistics
    const [totalTeams, totalPlayers] = await Promise.all([
      prisma.team.count({
        where: { leagueId, isActive: true },
      }),
      prisma.player.count({
        where: { leagueId },
      }),
    ]);

    return {
      ...league,
      divisions,
      unassignedTeams,
      stats: {
        totalTeams,
        totalPlayers,
        totalDivisions: divisions.length,
      },
    };
  } catch (error) {
    console.error("Error fetching league teams with divisions:", error);
    return null;
  }
}

/**
 * Get all divisions for a league (for form dropdowns)
 */
export async function getLeagueDivisions(leagueId: string): Promise<Array<{
  id: string;
  name: string;
  ageGroup: string | null;
  skillLevel: string | null;
}>> {
  try {
    const divisions = await prisma.division.findMany({
      where: {
        leagueId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        ageGroup: true,
        skillLevel: true,
      },
      orderBy: { name: 'asc' },
    });

    return divisions;
  } catch (error) {
    console.error("Error fetching league divisions:", error);
    return [];
  }
}
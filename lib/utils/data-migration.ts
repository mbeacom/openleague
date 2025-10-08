import { prisma } from "@/lib/db/prisma";

/**
 * Utility functions for migrating existing data to support league features
 */

/**
 * Check if a user needs data migration (has teams but no league relationships)
 */
export async function needsDataMigration(userId: string): Promise<boolean> {
  // Check if user has teams
  const teamCount = await prisma.teamMember.count({
    where: { userId },
  });

  if (teamCount === 0) return false;

  // Check if user has any league relationships
  const leagueCount = await prisma.leagueUser.count({
    where: { userId },
  });

  // If user has teams but no league relationships, they might need migration
  return leagueCount === 0;
}

/**
 * Get migration suggestions for a user
 */
export async function getMigrationSuggestions(userId: string): Promise<{
  canMigrate: boolean;
  teamCount: number;
  suggestions: Array<{
    type: 'create_league' | 'keep_separate';
    description: string;
    teams: Array<{ id: string; name: string; sport: string; season: string }>;
  }>;
}> {
  const teams = await prisma.teamMember.findMany({
    where: { 
      userId,
      role: "ADMIN", // Only suggest migration for teams user administers
    },
    include: {
      team: {
        select: {
          id: true,
          name: true,
          sport: true,
          season: true,
          leagueId: true,
        },
      },
    },
  });

  // Filter out teams already in leagues
  const unmigratedTeams = teams.filter(tm => !tm.team.leagueId);

  if (unmigratedTeams.length === 0) {
    return {
      canMigrate: false,
      teamCount: 0,
      suggestions: [],
    };
  }

  // Group teams by sport for migration suggestions
  const teamsBySport = unmigratedTeams.reduce((acc, tm) => {
    const sport = tm.team.sport;
    if (!acc[sport]) acc[sport] = [];
    acc[sport].push({
      id: tm.team.id,
      name: tm.team.name,
      sport: tm.team.sport,
      season: tm.team.season,
    });
    return acc;
  }, {} as Record<string, Array<{ id: string; name: string; sport: string; season: string }>>);

  const suggestions = Object.entries(teamsBySport).map(([sport, sportTeams]) => {
    if (sportTeams.length > 1) {
      return {
        type: 'create_league' as const,
        description: `Create a ${sport} league with ${sportTeams.length} teams`,
        teams: sportTeams,
      };
    } else {
      return {
        type: 'keep_separate' as const,
        description: `Keep ${sportTeams[0].name} as a standalone team`,
        teams: sportTeams,
      };
    }
  });

  return {
    canMigrate: true,
    teamCount: unmigratedTeams.length,
    suggestions,
  };
}

/**
 * Ensure data consistency after league operations
 */
export async function ensureDataConsistency(leagueId: string): Promise<void> {
  // Ensure all teams in league have their events and players linked to league
  const teams = await prisma.team.findMany({
    where: { leagueId },
    select: { id: true },
  });

  const teamIds = teams.map(t => t.id);

  if (teamIds.length === 0) return;

  // Update events that belong to league teams but aren't linked to league
  await prisma.event.updateMany({
    where: {
      teamId: { in: teamIds },
      leagueId: null,
    },
    data: { leagueId },
  });

  // Update players that belong to league teams but aren't linked to league
  await prisma.player.updateMany({
    where: {
      teamId: { in: teamIds },
      leagueId: null,
    },
    data: { leagueId },
  });
}

/**
 * Clean up orphaned data (teams without active members, etc.)
 */
export async function cleanupOrphanedData(): Promise<{
  teamsDeleted: number;
  eventsDeleted: number;
  playersDeleted: number;
}> {
  // Find teams with no active members
  const teamsWithoutMembers = await prisma.team.findMany({
    where: {
      members: {
        none: {},
      },
      isActive: true,
    },
    select: { id: true },
  });

  const orphanedTeamIds = teamsWithoutMembers.map(t => t.id);

  if (orphanedTeamIds.length === 0) {
    return { teamsDeleted: 0, eventsDeleted: 0, playersDeleted: 0 };
  }

  // Count what will be deleted
  const eventsToDelete = await prisma.event.count({
    where: { teamId: { in: orphanedTeamIds } },
  });

  const playersToDelete = await prisma.player.count({
    where: { teamId: { in: orphanedTeamIds } },
  });

  // Delete in correct order (foreign key constraints)
  await prisma.event.deleteMany({
    where: { teamId: { in: orphanedTeamIds } },
  });

  await prisma.player.deleteMany({
    where: { teamId: { in: orphanedTeamIds } },
  });

  await prisma.team.updateMany({
    where: { id: { in: orphanedTeamIds } },
    data: { isActive: false },
  });

  return {
    teamsDeleted: orphanedTeamIds.length,
    eventsDeleted: eventsToDelete,
    playersDeleted: playersToDelete,
  };
}
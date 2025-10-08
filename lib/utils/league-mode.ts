import { prisma } from "@/lib/db/prisma";

/**
 * Determine if a user is in league mode or single-team mode
 */
export async function getUserMode(userId: string): Promise<{
  isLeagueMode: boolean;
  leagues: Array<{ id: string; name: string; sport: string }>;
  teams: Array<{ id: string; name: string; sport: string; season: string; leagueId: string | null }>;
}> {
  // Get user's league memberships
  const leagueUsers = await prisma.leagueUser.findMany({
    where: { userId },
    include: {
      league: {
        select: {
          id: true,
          name: true,
          sport: true,
          isActive: true,
        },
      },
    },
    orderBy: {
      joinedAt: "desc",
    },
  });

  const activeLeagues = leagueUsers
    .filter(lu => lu.league.isActive)
    .map(lu => ({
      id: lu.league.id,
      name: lu.league.name,
      sport: lu.league.sport,
    }));

  // Get user's team memberships
  const teamMembers = await prisma.teamMember.findMany({
    where: { userId },
    include: {
      team: {
        select: {
          id: true,
          name: true,
          sport: true,
          season: true,
          leagueId: true,
          isActive: true,
        },
      },
    },
    orderBy: {
      joinedAt: "desc",
    },
  });

  const activeTeams = teamMembers
    .filter(tm => tm.team.isActive)
    .map(tm => ({
      id: tm.team.id,
      name: tm.team.name,
      sport: tm.team.sport,
      season: tm.team.season,
      leagueId: tm.team.leagueId,
    }));

  // User is in league mode if they have any league memberships
  const isLeagueMode = activeLeagues.length > 0;

  return {
    isLeagueMode,
    leagues: activeLeagues,
    teams: activeTeams,
  };
}

/**
 * Get the primary context for a user (either their main league or main team)
 */
export async function getUserPrimaryContext(userId: string): Promise<{
  type: 'league' | 'team' | 'none';
  id: string | null;
  name: string | null;
}> {
  const userMode = await getUserMode(userId);

  if (userMode.isLeagueMode && userMode.leagues.length > 0) {
    // Return the first (most recent) league
    const primaryLeague = userMode.leagues[0];
    return {
      type: 'league',
      id: primaryLeague.id,
      name: primaryLeague.name,
    };
  }

  if (userMode.teams.length > 0) {
    // Return the first (most recent) team that's not in a league
    const primaryTeam = userMode.teams.find(team => !team.leagueId) || userMode.teams[0];
    return {
      type: 'team',
      id: primaryTeam.id,
      name: primaryTeam.name,
    };
  }

  return {
    type: 'none',
    id: null,
    name: null,
  };
}

/**
 * Check if a user has access to a specific team (either as team admin or league admin)
 */
export async function hasTeamAccess(userId: string, teamId: string): Promise<boolean> {
  // Check direct team membership
  const teamMember = await prisma.teamMember.findFirst({
    where: {
      userId,
      teamId,
      team: { isActive: true },
    },
  });

  if (teamMember) return true;

  // Check league admin access
  const team = await prisma.team.findFirst({
    where: {
      id: teamId,
      isActive: true,
      leagueId: { not: null },
    },
    select: { leagueId: true },
  });

  if (team?.leagueId) {
    const leagueUser = await prisma.leagueUser.findFirst({
      where: {
        userId,
        leagueId: team.leagueId,
        role: "LEAGUE_ADMIN",
      },
    });

    return !!leagueUser;
  }

  return false;
}

/**
 * Check if a user has admin access to a specific team
 */
export async function hasTeamAdminAccess(userId: string, teamId: string): Promise<boolean> {
  // Check direct team admin membership
  const teamMember = await prisma.teamMember.findFirst({
    where: {
      userId,
      teamId,
      role: "ADMIN",
      team: { isActive: true },
    },
  });

  if (teamMember) return true;

  // Check league admin access
  const team = await prisma.team.findFirst({
    where: {
      id: teamId,
      isActive: true,
      leagueId: { not: null },
    },
    select: { leagueId: true },
  });

  if (team?.leagueId) {
    const leagueUser = await prisma.leagueUser.findFirst({
      where: {
        userId,
        leagueId: team.leagueId,
        role: "LEAGUE_ADMIN",
      },
    });

    return !!leagueUser;
  }

  return false;
}

/**
 * Get navigation items based on user mode
 */
export function getNavigationItems(userMode: {
  isLeagueMode: boolean;
  leagues: Array<{ id: string; name: string; sport: string }>;
  teams: Array<{ id: string; name: string; sport: string; season: string; leagueId: string | null }>;
}) {
  if (userMode.isLeagueMode) {
    // League mode navigation
    return [
      { label: "Dashboard", path: "/", icon: "Dashboard" },
      { label: "Teams", path: "/teams", icon: "Groups" },
      { label: "Schedule", path: "/schedule", icon: "CalendarMonth" },
      { label: "Roster", path: "/roster", icon: "People" },
      { label: "Settings", path: "/settings", icon: "Settings" },
    ];
  } else {
    // Single-team mode navigation (original)
    return [
      { label: "Dashboard", path: "/", icon: "Dashboard" },
      { label: "Roster", path: "/roster", icon: "People" },
      { label: "Calendar", path: "/calendar", icon: "CalendarMonth" },
      { label: "Events", path: "/events", icon: "Event" },
    ];
  }
}
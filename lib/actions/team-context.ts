"use server";

import { prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/auth/session";
import type { Player } from "@/types/roster";

export type TeamContext = {
  teamId: string;
  teamName: string;
  role: string;
  isAdmin: boolean;
};

/**
 * Get the current user's primary team membership (most recently joined).
 * Returns null if the user has no team memberships.
 */
export async function getUserTeamContext(): Promise<TeamContext | null> {
  const userId = await requireUserId();

  const teamMember = await prisma.teamMember.findFirst({
    where: { userId },
    select: {
      role: true,
      team: { select: { id: true, name: true } },
    },
    orderBy: { joinedAt: "desc" },
  });

  if (!teamMember) return null;

  return {
    teamId: teamMember.team.id,
    teamName: teamMember.team.name,
    role: teamMember.role,
    isAdmin: teamMember.role === "ADMIN",
  };
}

/**
 * Get the current user's primary team membership where they are an admin.
 * Returns null if the user has no admin team memberships.
 */
export async function getUserAdminTeamContext(): Promise<TeamContext | null> {
  const userId = await requireUserId();

  const teamMember = await prisma.teamMember.findFirst({
    where: { userId, role: "ADMIN" },
    select: {
      role: true,
      team: { select: { id: true, name: true } },
    },
    orderBy: { joinedAt: "desc" },
  });

  if (!teamMember) return null;

  return {
    teamId: teamMember.team.id,
    teamName: teamMember.team.name,
    role: teamMember.role,
    isAdmin: true,
  };
}

/**
 * Get the user's dashboard data: all team memberships and upcoming practice sessions.
 */
export async function getDashboardData() {
  const userId = await requireUserId();

  const teams = await prisma.teamMember.findMany({
    where: { userId },
    select: {
      id: true,
      role: true,
      joinedAt: true,
      team: {
        select: {
          id: true,
          name: true,
          sport: true,
          season: true,
          leagueId: true,
          league: { select: { id: true, name: true } },
          division: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { joinedAt: "desc" },
  });

  const firstTeam = teams[0]?.team;
  const upcomingPractices = firstTeam
    ? await prisma.practiceSession.findMany({
        where: {
          teamId: firstTeam.id,
          date: { gte: new Date() },
          OR: [{ isShared: true }, { createdById: userId }],
        },
        orderBy: { date: "asc" },
        take: 3,
        include: { _count: { select: { plays: true } } },
      })
    : [];

  const serializedPractices = upcomingPractices.map((p) => ({
    id: p.id,
    title: p.title,
    date: p.date.toISOString(),
    duration: p.duration,
    playCount: p._count.plays,
  }));

  return { teams, upcomingPractices: serializedPractices };
}

/**
 * Get the calendar events for the user's primary team.
 */
export async function getCalendarData(): Promise<{
  teamId: string;
  teamName: string;
  upcomingEvents: Array<{
    id: string;
    type: "GAME" | "PRACTICE";
    title: string;
    startAt: string;
    location: string;
    opponent: string | null;
  }>;
  pastEvents: Array<{
    id: string;
    type: "GAME" | "PRACTICE";
    title: string;
    startAt: string;
    location: string;
    opponent: string | null;
  }>;
} | null> {
  const userId = await requireUserId();

  const teamMember = await prisma.teamMember.findFirst({
    where: { userId },
    select: {
      team: { select: { id: true, name: true } },
    },
    orderBy: { joinedAt: "desc" },
  });

  if (!teamMember) return null;

  const now = new Date();
  const allEvents = await prisma.event.findMany({
    where: { teamId: teamMember.team.id },
    orderBy: { startAt: "asc" },
    select: {
      id: true,
      type: true,
      title: true,
      startAt: true,
      location: true,
      opponent: true,
    },
  });

  const upcomingEvents = allEvents
    .filter((e) => e.startAt >= now)
    .map((e) => ({ ...e, type: e.type as "GAME" | "PRACTICE", startAt: e.startAt.toISOString() }));

  const pastEvents = allEvents
    .filter((e) => e.startAt < now)
    .reverse()
    .map((e) => ({ ...e, type: e.type as "GAME" | "PRACTICE", startAt: e.startAt.toISOString() }));

  return {
    teamId: teamMember.team.id,
    teamName: teamMember.team.name,
    upcomingEvents,
    pastEvents,
  };
}

type TeamRole = "ADMIN" | "MEMBER";
type LeagueRole = "LEAGUE_ADMIN" | "TEAM_ADMIN" | "MEMBER";

type TeamRosterData = {
  teamId: string;
  teamName: string;
  isAdmin: boolean;
  players: Player[];
  teamMembers: Array<{
    id: string;
    role: string;
    usahMemberId: string | null;
    user: { id: string; name: string | null; email: string };
  }>;
  invitations: Array<{
    id: string;
    email: string;
    status: "PENDING" | "ACCEPTED" | "EXPIRED";
    expiresAt: string;
    createdAt: string;
  }>;
};

function getEffectiveTeamRole(directRole: TeamRole | null, leagueRole: LeagueRole | null): string {
  if (leagueRole === "LEAGUE_ADMIN") {
    return "LEAGUE_ADMIN";
  }

  if (directRole === "ADMIN") {
    return "ADMIN";
  }

  if (leagueRole === "TEAM_ADMIN") {
    return "TEAM_ADMIN";
  }

  return directRole ?? leagueRole ?? "MEMBER";
}

async function getRosterPayload({
  teamId,
  teamName,
  isAdmin,
}: {
  teamId: string;
  teamName: string;
  isAdmin: boolean;
}): Promise<TeamRosterData> {
  const [players, teamMembers, rawInvitations] = await Promise.all([
    prisma.player.findMany({
      where: { teamId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        emergencyContact: isAdmin,
        emergencyPhone: isAdmin,
        jerseyNumber: true,
        // FR-008: USAH Member IDs are admin-only — must not appear in non-admin queries
        usahMemberId: isAdmin,
      },
    }),
    prisma.teamMember.findMany({
      where: { teamId },
      select: {
        id: true,
        role: true,
        // FR-008: USAH Member IDs are admin-only
        usahMemberId: isAdmin,
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
    }),
    isAdmin
      ? prisma.invitation.findMany({
          where: { teamId },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            email: true,
            status: true,
            expiresAt: true,
            createdAt: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const invitations = rawInvitations.map((inv) => ({
    ...inv,
    status: inv.status as "PENDING" | "ACCEPTED" | "EXPIRED",
    expiresAt: inv.expiresAt.toISOString(),
    createdAt: inv.createdAt.toISOString(),
  }));

  return {
    teamId,
    teamName,
    isAdmin,
    players,
    teamMembers,
    invitations,
  };
}

/**
 * Get roster data for the user's primary team.
 */
export async function getRosterData(): Promise<{
  teamId: string;
  teamName: string;
  isAdmin: boolean;
  players: Player[];
  teamMembers: Array<{
    id: string;
    role: string;
    usahMemberId: string | null;
    user: { id: string; name: string | null; email: string };
  }>;
  invitations: Array<{
    id: string;
    email: string;
    status: "PENDING" | "ACCEPTED" | "EXPIRED";
    expiresAt: string;
    createdAt: string;
  }>;
} | null> {
  const userId = await requireUserId();

  const teamMember = await prisma.teamMember.findFirst({
    where: { userId },
    select: {
      role: true,
      team: { select: { id: true, name: true } },
    },
    orderBy: { joinedAt: "desc" },
  });

  if (!teamMember) return null;

  const teamId = teamMember.team.id;
  const isAdmin = teamMember.role === "ADMIN";

  return getRosterPayload({
    teamId,
    teamName: teamMember.team.name,
    isAdmin,
  });
}

type AccessibleTeamData = {
  id: string;
  name: string;
  sport: string;
  season: string;
  createdAt: Date;
  role: string;
  isAdmin: boolean;
  canOpenEventDetails: boolean;
  league: { id: string; name: string } | null;
  division: { id: string; name: string } | null;
  stats: {
    players: number;
    events: number;
    members: number;
  };
};

async function getAccessibleTeamData(teamId: string): Promise<AccessibleTeamData | null> {
  const userId = await requireUserId();

  const team = await prisma.team.findFirst({
    where: { id: teamId, isActive: true },
    select: {
      id: true,
      name: true,
      sport: true,
      season: true,
      createdAt: true,
      league: {
        select: {
          id: true,
          name: true,
          isActive: true,
          users: {
            where: { userId },
            select: { role: true },
          },
        },
      },
      division: { select: { id: true, name: true } },
      members: {
        where: { userId },
        select: { role: true },
      },
      _count: {
        select: {
          players: true,
          events: true,
          members: true,
        },
      },
    },
  });

  if (!team) return null;

  const directRole = team.members[0]?.role ?? null;
  const leagueRole = team.league?.isActive ? team.league.users[0]?.role ?? null : null;

  if (!directRole && !leagueRole) {
    return null;
  }

  return {
    id: team.id,
    name: team.name,
    sport: team.sport,
    season: team.season,
    createdAt: team.createdAt,
    role: getEffectiveTeamRole(directRole as TeamRole | null, leagueRole as LeagueRole | null),
    isAdmin: directRole === "ADMIN",
    canOpenEventDetails: !!directRole || leagueRole === "LEAGUE_ADMIN",
    league: team.league?.isActive ? { id: team.league.id, name: team.league.name } : null,
    division: team.division,
    stats: {
      players: team._count.players,
      events: team._count.events,
      members: team._count.members,
    },
  };
}

/**
 * Get overview data for a specific team the current user can access.
 */
export async function getTeamOverviewData(teamId: string): Promise<{
  id: string;
  name: string;
  sport: string;
  season: string;
  createdAt: string;
  role: string;
  isAdmin: boolean;
  canOpenEventDetails: boolean;
  league: { id: string; name: string } | null;
  division: { id: string; name: string } | null;
  stats: {
    players: number;
    events: number;
    members: number;
  };
  upcomingEvents: Array<{
    id: string;
    type: "GAME" | "PRACTICE";
    title: string;
    startAt: string;
    location: string;
    opponent: string | null;
  }>;
} | null> {
  const team = await getAccessibleTeamData(teamId);
  if (!team) return null;

  const upcomingEvents = await prisma.event.findMany({
    where: {
      teamId: team.id,
      startAt: { gte: new Date() },
    },
    orderBy: { startAt: "asc" },
    take: 5,
    select: {
      id: true,
      type: true,
      title: true,
      startAt: true,
      location: true,
      opponent: true,
    },
  });

  return {
    ...team,
    createdAt: team.createdAt.toISOString(),
    upcomingEvents: upcomingEvents.map((event) => ({
      ...event,
      type: event.type as "GAME" | "PRACTICE",
      startAt: event.startAt.toISOString(),
    })),
  };
}

/**
 * Get roster data for a specific team the current user can access.
 */
export async function getTeamRosterDataById(teamId: string): Promise<{
  teamId: string;
  teamName: string;
  isAdmin: boolean;
  players: Player[];
  teamMembers: Array<{
    id: string;
    role: string;
    usahMemberId: string | null;
    user: { id: string; name: string | null; email: string };
  }>;
  invitations: Array<{
    id: string;
    email: string;
    status: "PENDING" | "ACCEPTED" | "EXPIRED";
    expiresAt: string;
    createdAt: string;
  }>;
} | null> {
  const team = await getAccessibleTeamData(teamId);
  if (!team) return null;

  return getRosterPayload({
    teamId: team.id,
    teamName: team.name,
    isAdmin: team.isAdmin,
  });
}

/**
 * Verify that an active team belongs to an active league.
 * Used by route aliases before redirecting to canonical team pages.
 */
export async function isActiveTeamInLeague(teamId: string, leagueId: string): Promise<boolean> {
  const team = await prisma.team.findFirst({
    where: {
      id: teamId,
      leagueId,
      isActive: true,
      league: { isActive: true },
    },
    select: { id: true },
  });

  return !!team;
}

/**
 * Verify that the current user can safely follow a league-scoped team alias.
 * Prevents redirect-vs-404 probing of team/league relationships by requiring
 * either direct team membership or active league membership before redirecting.
 */
export async function canAccessActiveTeamInLeague(teamId: string, leagueId: string): Promise<boolean> {
  const userId = await requireUserId();

  const team = await prisma.team.findFirst({
    where: {
      id: teamId,
      leagueId,
      isActive: true,
      league: { isActive: true },
    },
    select: {
      members: {
        where: { userId },
        select: { id: true },
        take: 1,
      },
      league: {
        select: {
          users: {
            where: { userId },
            select: { id: true },
            take: 1,
          },
        },
      },
    },
  });

  return !!team && (team.members.length > 0 || (team.league?.users.length ?? 0) > 0);
}

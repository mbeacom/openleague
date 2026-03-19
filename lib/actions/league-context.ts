"use server";

import { prisma } from "@/lib/db/prisma";
import { requireUserId, canUserCreateLeagueGames } from "@/lib/auth/session";

/**
 * Get league membership and access info for the messages page.
 * Returns null if the user has no access to this league.
 */
export async function getLeagueMessagesData(leagueId: string): Promise<{
  leagueData: {
    id: string;
    name: string;
    divisions: Array<{ id: string; name: string; teamCount: number }>;
    teams: Array<{
      id: string;
      name: string;
      divisionName: string | undefined;
      memberCount: number;
    }>;
  };
  canSendMessages: boolean;
} | null> {
  const userId = await requireUserId();

  const leagueUser = await prisma.leagueUser.findFirst({
    where: { userId, leagueId },
    include: { league: { select: { id: true, name: true, isActive: true } } },
  });

  if (!leagueUser || !leagueUser.league.isActive) return null;

  const canSendMessages =
    leagueUser.role === "LEAGUE_ADMIN" || leagueUser.role === "TEAM_ADMIN";

  const [divisions, teams] = await Promise.all([
    prisma.division.findMany({
      where: { leagueId, isActive: true },
      select: { id: true, name: true, _count: { select: { teams: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.team.findMany({
      where: { leagueId, isActive: true },
      select: {
        id: true,
        name: true,
        division: { select: { name: true } },
        _count: { select: { members: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  return {
    leagueData: {
      id: leagueUser.league.id,
      name: leagueUser.league.name,
      divisions: divisions.map((d) => ({
        id: d.id,
        name: d.name,
        teamCount: d._count.teams,
      })),
      teams: teams.map((t) => ({
        id: t.id,
        name: t.name,
        divisionName: t.division?.name,
        memberCount: t._count.members,
      })),
    },
    canSendMessages,
  };
}

/**
 * Get league schedule page data: events, teams, divisions, and create-game permission.
 * Returns null if user has no access.
 */
export async function getLeagueScheduleData(leagueId: string): Promise<{
  league: { id: string; name: string; sport: string };
  canCreateGames: boolean;
  events: Array<{
    id: string;
    type: "GAME" | "PRACTICE";
    title: string;
    startAt: string;
    location: string;
    opponent: string | null;
    team: { id: string; name: string };
    homeTeam: { id: string; name: string } | null;
    awayTeam: { id: string; name: string } | null;
  }>;
  teams: Awaited<
    ReturnType<
      typeof prisma.team.findMany<{
        where: { leagueId: string; isActive: true };
        include: { division: { select: { id: true; name: true } } };
      }>
    >
  >;
  divisions: Awaited<
    ReturnType<typeof prisma.division.findMany<{ where: { leagueId: string; isActive: true } }>>
  >;
} | null> {
  const userId = await requireUserId();

  const leagueUser = await prisma.leagueUser.findFirst({
    where: { leagueId, userId },
    include: {
      league: { select: { id: true, name: true, sport: true, isActive: true } },
    },
  });

  if (!leagueUser || !leagueUser.league.isActive) return null;

  const [canCreateGames, events, teams, divisions] = await Promise.all([
    canUserCreateLeagueGames(userId, leagueId, leagueUser.role),
    prisma.event.findMany({
      where: { leagueId },
      include: {
        team: { select: { id: true, name: true } },
        homeTeam: { select: { id: true, name: true } },
        awayTeam: { select: { id: true, name: true } },
      },
      orderBy: { startAt: "asc" },
    }),
    prisma.team.findMany({
      where: { leagueId, isActive: true },
      include: { division: { select: { id: true, name: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.division.findMany({
      where: { leagueId, isActive: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const serializedEvents = events.map((event) => ({
    id: event.id,
    type: event.type as "GAME" | "PRACTICE",
    title: event.title,
    startAt: event.startAt.toISOString(),
    location: event.location ?? "",
    opponent: event.opponent,
    team: event.team ?? { id: "", name: "" },
    homeTeam: event.homeTeam,
    awayTeam: event.awayTeam,
  }));

  return {
    league: {
      id: leagueUser.league.id,
      name: leagueUser.league.name,
      sport: leagueUser.league.sport,
    },
    canCreateGames,
    events: serializedEvents,
    teams,
    divisions,
  };
}

/**
 * Get the new-game page context for a league.
 * Returns null if user has no access or insufficient permission.
 */
export async function getNewLeagueGameContext(leagueId: string): Promise<{
  league: { id: string; name: string; sport: string };
  teams: Array<{
    id: string;
    name: string;
    division: { id: string; name: string } | null;
  }>;
} | null> {
  const userId = await requireUserId();

  const leagueUser = await prisma.leagueUser.findFirst({
    where: { leagueId, userId },
    include: {
      league: { select: { id: true, name: true, sport: true, isActive: true } },
    },
  });

  if (!leagueUser || !leagueUser.league.isActive) return null;

  const canCreateGames = await canUserCreateLeagueGames(userId, leagueId, leagueUser.role);
  if (!canCreateGames) return null;

  const teams = await prisma.team.findMany({
    where: { leagueId, isActive: true },
    include: { division: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  });

  return {
    league: {
      id: leagueUser.league.id,
      name: leagueUser.league.name,
      sport: leagueUser.league.sport,
    },
    teams,
  };
}

/**
 * Get league invitations page data.
 * Returns null if user has no access.
 */
export async function getLeagueInvitationsData(leagueId: string): Promise<{
  league: { id: string; name: string; sport: string };
  isLeagueAdmin: boolean;
  teams: Array<{
    id: string;
    name: string;
    division: { name: string; ageGroup: string | null } | null;
  }>;
  invitations: Array<{
    id: string;
    email: string;
    status: string;
    expiresAt: string;
    createdAt: string;
    team: { name: string; division: { name: string } | null };
  }>;
} | null> {
  const userId = await requireUserId();

  const leagueUser = await prisma.leagueUser.findFirst({
    where: { userId, leagueId, league: { isActive: true } },
    include: { league: { select: { id: true, name: true, sport: true } } },
  });

  if (!leagueUser) return null;

  const isLeagueAdmin = leagueUser.role === "LEAGUE_ADMIN";

  const [teams, rawInvitations] = await Promise.all([
    prisma.team.findMany({
      where: { leagueId, isActive: true },
      select: {
        id: true,
        name: true,
        division: { select: { name: true, ageGroup: true } },
      },
      orderBy: { name: "asc" },
    }),
    isLeagueAdmin
      ? prisma.invitation.findMany({
          where: { team: { leagueId } },
          include: {
            team: {
              select: { name: true, division: { select: { name: true } } },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 50,
        })
      : Promise.resolve([]),
  ]);

  const invitations = rawInvitations.map((inv) => ({
    ...inv,
    expiresAt: inv.expiresAt.toISOString(),
    createdAt: inv.createdAt.toISOString(),
    team: inv.team ?? { name: "", division: null },
  }));

  return {
    league: leagueUser.league,
    isLeagueAdmin,
    teams,
    invitations,
  };
}

/**
 * Get league roster page data.
 * Returns null if user has no access.
 */
export async function getLeagueRosterData(leagueId: string): Promise<{
  league: { id: string; name: string; sport: string };
  isLeagueAdmin: boolean;
  players: Array<{
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    emergencyContact: string | null;
    emergencyPhone: string | null;
    teamId: string;
    leagueId: string | null;
    userId: string | null;
    createdAt: Date;
    updatedAt: Date;
    user: { id: string; email: string } | null;
    team: {
      id: string;
      name: string;
      division: { id: string; name: string; ageGroup: string | null; skillLevel: string | null } | null;
    };
  }>;
  teams: Array<{
    id: string;
    name: string;
    divisionId: string | null;
    division: { name: string; ageGroup: string | null } | null;
  }>;
  divisions: Array<{
    id: string;
    name: string;
    ageGroup: string | null;
    skillLevel: string | null;
  }>;
  invitations: Array<{
    id: string;
    email: string;
    status: string;
    expiresAt: string;
    createdAt: string;
    team: { name: string; division: { name: string } | null };
  }>;
} | null> {
  const userId = await requireUserId();

  const leagueUser = await prisma.leagueUser.findFirst({
    where: { userId, leagueId, league: { isActive: true } },
    include: { league: { select: { id: true, name: true, sport: true } } },
  });

  if (!leagueUser) return null;

  const isLeagueAdmin = leagueUser.role === "LEAGUE_ADMIN";

  const [players, teams, divisions, rawInvitations] = await Promise.all([
    prisma.player.findMany({
      where: { leagueId },
      include: {
        team: {
          select: {
            id: true,
            name: true,
            division: {
              select: { id: true, name: true, ageGroup: true, skillLevel: true },
            },
          },
        },
        user: { select: { id: true, email: true } },
      },
      orderBy: [{ team: { name: "asc" } }, { name: "asc" }],
    }),
    prisma.team.findMany({
      where: { leagueId, isActive: true },
      select: {
        id: true,
        name: true,
        divisionId: true,
        division: { select: { name: true, ageGroup: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.division.findMany({
      where: { leagueId, isActive: true },
      select: { id: true, name: true, ageGroup: true, skillLevel: true },
      orderBy: { name: "asc" },
    }),
    isLeagueAdmin
      ? prisma.invitation.findMany({
          where: { team: { leagueId } },
          include: {
            team: {
              select: { name: true, division: { select: { name: true } } },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        })
      : Promise.resolve([]),
  ]);

  const invitations = rawInvitations.map((inv) => ({
    ...inv,
    expiresAt: inv.expiresAt.toISOString(),
    createdAt: inv.createdAt.toISOString(),
    team: inv.team ?? { name: "", division: null },
  }));

  return {
    league: leagueUser.league,
    isLeagueAdmin,
    players,
    teams,
    divisions,
    invitations,
  };
}

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

// Default calendar window: recent past through the next year, so the query is
// always bounded even without an explicit window.
const CALENDAR_PAST_WINDOW_DAYS = 90;
const CALENDAR_FUTURE_WINDOW_DAYS = 365;
// Hard cap on a caller-supplied window (this is a Server Action, so the
// arguments are client input).
const CALENDAR_MAX_WINDOW_DAYS = 550;

export type CalendarEventItem = {
  id: string;
  type: "GAME" | "PRACTICE";
  title: string;
  startAt: string;
  location: string;
  opponent: string | null;
  teamId: string;
  teamName: string;
};

function parseWindowDate(value: Date | string | undefined): Date | null {
  if (value === undefined) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Get the calendar events across ALL of the user's teams within a bounded
 * date window. `teamId`/`teamName` remain the primary (most recently joined)
 * team for backward compatibility; `teams` lists every membership.
 */
export async function getCalendarData(window?: {
  from?: Date | string;
  to?: Date | string;
}): Promise<{
  teamId: string;
  teamName: string;
  teams: Array<{ id: string; name: string }>;
  upcomingEvents: CalendarEventItem[];
  pastEvents: CalendarEventItem[];
} | null> {
  const userId = await requireUserId();

  const memberships = await prisma.teamMember.findMany({
    where: { userId, team: { isActive: true } },
    select: {
      team: { select: { id: true, name: true } },
    },
    orderBy: { joinedAt: "desc" },
  });

  if (memberships.length === 0) return null;

  const teams = memberships.map((membership) => membership.team);
  const now = new Date();

  let from =
    parseWindowDate(window?.from) ??
    new Date(now.getTime() - CALENDAR_PAST_WINDOW_DAYS * 86_400_000);
  let to =
    parseWindowDate(window?.to) ??
    new Date(now.getTime() + CALENDAR_FUTURE_WINDOW_DAYS * 86_400_000);
  // Reversed windows are invalid client input — fall back to the defaults.
  if (to <= from) {
    from = new Date(now.getTime() - CALENDAR_PAST_WINDOW_DAYS * 86_400_000);
    to = new Date(now.getTime() + CALENDAR_FUTURE_WINDOW_DAYS * 86_400_000);
  }
  const maxTo = new Date(from.getTime() + CALENDAR_MAX_WINDOW_DAYS * 86_400_000);
  if (to > maxTo) to = maxTo;

  const allEvents = await prisma.event.findMany({
    where: {
      teamId: { in: teams.map((team) => team.id) },
      startAt: { gte: from, lt: to },
    },
    orderBy: { startAt: "asc" },
    select: {
      id: true,
      type: true,
      title: true,
      startAt: true,
      location: true,
      opponent: true,
      team: { select: { id: true, name: true } },
    },
  });

  const serialize = (event: (typeof allEvents)[number]): CalendarEventItem => ({
    id: event.id,
    type: event.type as "GAME" | "PRACTICE",
    title: event.title,
    startAt: event.startAt.toISOString(),
    location: event.location,
    opponent: event.opponent,
    teamId: event.team.id,
    teamName: event.team.name,
  });

  const upcomingEvents = allEvents.filter((e) => e.startAt >= now).map(serialize);
  const pastEvents = allEvents
    .filter((e) => e.startAt < now)
    .reverse()
    .map(serialize);

  return {
    teamId: teams[0].id,
    teamName: teams[0].name,
    teams,
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
        position: true,
        // FR-008: USAH Member IDs are admin-only — must not appear in non-admin queries
        usahMemberId: isAdmin,
        // Date of birth is admin-only, like emergencyContact (COPPA surface)
        dateOfBirth: isAdmin,
        // Active consent rows so admins see COPPA status next to DOB
        parentalConsents: isAdmin
          ? {
              where: { revokedAt: null },
              select: { id: true, grantedAt: true },
              orderBy: { grantedAt: "desc" as const },
            }
          : false,
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

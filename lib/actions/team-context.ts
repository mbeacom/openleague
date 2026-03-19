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
    include: { team: { select: { id: true, name: true } } },
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
    include: { team: { select: { id: true, name: true } } },
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
    include: {
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
    include: { team: { select: { id: true, name: true } } },
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
    include: { team: { select: { id: true, name: true } } },
    orderBy: { joinedAt: "desc" },
  });

  if (!teamMember) return null;

  const teamId = teamMember.team.id;
  const isAdmin = teamMember.role === "ADMIN";

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
    teamName: teamMember.team.name,
    isAdmin,
    players,
    teamMembers,
    invitations,
  };
}

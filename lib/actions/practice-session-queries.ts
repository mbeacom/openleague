"use server";

import { prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/auth/session";
import type { PlayData } from "@/types/practice-planner";
import { parseStoredPlayData, playDataOrEmpty } from "@/lib/utils/play-data";

/**
 * Get the practice planner list page data for the user's primary team.
 * Returns null if the user has no team membership.
 */
export async function getPracticePlannerListData(): Promise<{
  teamId: string;
  teamName: string;
  isAdmin: boolean;
  sessions: Array<{
    id: string;
    title: string;
    date: string;
    duration: number;
    isShared: boolean;
    createdByName: string;
    playCount: number;
    firstPlayThumbnail: string | null;
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

  const sessions = await prisma.practiceSession.findMany({
    where: {
      teamId,
      ...(isAdmin ? {} : { isShared: true }),
    },
    orderBy: { date: "desc" },
    include: {
      createdBy: { select: { name: true } },
      plays: {
        select: { play: { select: { thumbnail: true } } },
        orderBy: { sequence: "asc" },
        take: 1,
      },
      _count: { select: { plays: true } },
    },
  });

  return {
    teamId,
    teamName: teamMember.team.name,
    isAdmin,
    sessions: sessions.map((s) => ({
      id: s.id,
      title: s.title,
      date: s.date.toISOString(),
      duration: s.duration,
      isShared: s.isShared,
      createdByName: s.createdBy.name || "Unknown",
      playCount: s._count.plays,
      firstPlayThumbnail: s.plays[0]?.play?.thumbnail || null,
    })),
  };
}

/**
 * Get a single practice session detail page data.
 * Returns null if the session is not found or user has no access.
 */
export async function getPracticeSessionDetail(sessionId: string): Promise<{
  session: {
    id: string;
    title: string;
    date: string;
    duration: number;
    isShared: boolean;
    createdByName: string;
    teamId: string;
    teamName: string;
    // Optional venue attachment (FR-019, feature 006)
    venueId: string | null;
    venueName: string | null;
    surfaceId: string | null;
    surfaceName: string | null;
    segmentId: string | null;
    segmentName: string | null;
    startAt: string | null;
    plays: Array<{
      id: string;
      sequence: number;
      duration: number;
      instructions: string | null;
      play: {
        id: string;
        name: string;
        description: string | null;
        thumbnail: string | null;
        /** null = stored data unreadable; hide the legend. */
        playData: PlayData | null;
      };
    }>;
  };
  isAdmin: boolean;
} | null> {
  const userId = await requireUserId();

  const teamMember = await prisma.teamMember.findFirst({
    where: { userId },
    orderBy: { joinedAt: "desc" },
  });

  if (!teamMember) return null;

  const session = await prisma.practiceSession.findUnique({
    where: { id: sessionId },
    include: {
      createdBy: { select: { name: true } },
      plays: {
        orderBy: { sequence: "asc" },
        include: {
          play: {
            select: {
              id: true,
              name: true,
              description: true,
              thumbnail: true,
              playData: true,
            },
          },
        },
      },
      team: { select: { id: true, name: true } },
      venue: { select: { name: true } },
      surface: { select: { name: true } },
      segment: { select: { name: true } },
    },
  });

  if (!session) return null;

  const membership = await prisma.teamMember.findFirst({
    where: { userId, teamId: session.teamId },
  });

  if (!membership) return null;

  const isAdmin = membership.role === "ADMIN";
  if (!isAdmin && !session.isShared) return null;

  return {
    session: {
      id: session.id,
      title: session.title,
      date: session.date.toISOString(),
      duration: session.duration,
      isShared: session.isShared,
      createdByName: session.createdBy.name || "Unknown",
      teamId: session.team.id,
      teamName: session.team.name,
      venueId: session.venueId,
      venueName: session.venue?.name ?? null,
      surfaceId: session.surfaceId,
      surfaceName: session.surface?.name ?? null,
      segmentId: session.segmentId,
      segmentName: session.segment?.name ?? null,
      startAt: session.startAt ? session.startAt.toISOString() : null,
      plays: session.plays.map((sp) => ({
        id: sp.id,
        sequence: sp.sequence,
        duration: sp.duration ?? 0,
        instructions: sp.instructions,
        play: {
          id: sp.play.id,
          name: sp.play.name,
          description: sp.play.description,
          thumbnail: sp.play.thumbnail,
          playData: (() => {
            const parsed = parseStoredPlayData(sp.play.playData);
            if (!parsed.ok) console.error(`Unreadable playData (play ${sp.play.id}):`, parsed.error);
            return parsed.ok ? parsed.data : null;
          })(),
        },
      })),
    },
    isAdmin,
  };
}

/**
 * Get a practice session for editing (admin only).
 * Returns null if not found or user is not an admin for the team.
 */
export async function getPracticeSessionForEdit(sessionId: string): Promise<{
  sessionId: string;
  teamId: string;
  initialData: {
    title: string;
    date: Date;
    duration: number;
    isShared: boolean;
    // Optional venue attachment (FR-019, feature 006)
    venueId: string | null;
    surfaceId: string | null;
    segmentId: string | null;
    startAt: Date | null;
    plays: Array<{
      id: string;
      playId: string;
      name: string;
      description: string;
      sequence: number;
      duration: number;
      instructions: string;
      playData: PlayData;
      thumbnail: string;
    }>;
  };
} | null> {
  const userId = await requireUserId();

  const session = await prisma.practiceSession.findUnique({
    where: { id: sessionId },
    include: {
      plays: {
        orderBy: { sequence: "asc" },
        include: {
          play: {
            select: {
              id: true,
              name: true,
              description: true,
              thumbnail: true,
              playData: true,
            },
          },
        },
      },
    },
  });

  if (!session) return null;

  const membership = await prisma.teamMember.findFirst({
    where: { userId, teamId: session.teamId, role: "ADMIN" },
  });

  if (!membership) return null;

  return {
    sessionId: session.id,
    teamId: session.teamId,
    initialData: {
      title: session.title,
      date: session.date,
      duration: session.duration,
      isShared: session.isShared,
      venueId: session.venueId,
      surfaceId: session.surfaceId,
      segmentId: session.segmentId,
      startAt: session.startAt,
      // Plays are ordered by sequence asc. Deleting a library play cascades
      // its PracticeSessionPlay row away and leaves gaps (e.g. 0,2), which the
      // save validator rejects — so renumber to consecutive 0-based indices.
      plays: session.plays.map((sp, index) => ({
        id: sp.id,
        playId: sp.play.id,
        name: sp.play.name,
        description: sp.play.description ?? "",
        sequence: index,
        duration: sp.duration ?? 0,
        instructions: sp.instructions || "",
        playData: playDataOrEmpty(sp.play.playData, `play ${sp.play.id}`),
        thumbnail: sp.play.thumbnail || "",
      })),
    },
  };
}

/**
 * Get play library page access context.
 * Returns null if user has no team membership.
 * Returns { teamId, isAdmin } — caller redirects if not admin.
 */
export async function getPlayLibraryContext(): Promise<{
  teamId: string;
  teamName: string;
  isAdmin: boolean;
} | null> {
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
    isAdmin: teamMember.role === "ADMIN",
  };
}

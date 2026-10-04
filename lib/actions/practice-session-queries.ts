"use server";

import { prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/auth/session";
import type { PlayData, PlayFocus, PlayGoalies } from "@/types/practice-planner";
import { drillTags } from "@/lib/utils/drill-tags";
import { createEmptyPlayData, parseStoredPlayData } from "@/lib/utils/play-data";
import type { SegmentKind } from "@prisma/client";
import { normalizeGroups } from "@/lib/utils/session-timeline";

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
    /** The booked venue's IANA zone (3b); null when no venue is attached. */
    venueTimezone: string | null;
    surfaceId: string | null;
    surfaceName: string | null;
    segmentId: string | null;
    segmentName: string | null;
    segmentKind: SegmentKind | null;
    startAt: string | null;
    goaliesAttending: number | null;
    plays: Array<{
      id: string;
      sequence: number;
      duration: number;
      instructions: string | null;
      runsWithPrevious: boolean;
      play: {
        id: string;
        name: string;
        description: string | null;
        thumbnail: string | null;
        focus: PlayFocus;
        goalies: PlayGoalies;
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
              focus: true,
              goalies: true,
            },
          },
        },
      },
      team: { select: { id: true, name: true } },
      venue: { select: { name: true, timezone: true } },
      surface: { select: { name: true } },
      segment: { select: { name: true, kind: true } },
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
      venueTimezone: session.venue?.timezone ?? null,
      surfaceId: session.surfaceId,
      surfaceName: session.surface?.name ?? null,
      segmentId: session.segmentId,
      segmentName: session.segment?.name ?? null,
      segmentKind: session.segment?.kind ?? null,
      startAt: session.startAt ? session.startAt.toISOString() : null,
      goaliesAttending: session.goaliesAttending ?? null,
      plays: session.plays.map((sp) => ({
        id: sp.id,
        sequence: sp.sequence,
        duration: sp.duration ?? 0,
        instructions: sp.instructions,
        runsWithPrevious: sp.runsWithPrevious,
        play: {
          id: sp.play.id,
          name: sp.play.name,
          description: sp.play.description,
          thumbnail: sp.play.thumbnail,
          ...drillTags(sp.play),
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

/** What the session detail page and the bench sheet read (3b). */
export type PracticeSessionDetail = NonNullable<Awaited<ReturnType<typeof getPracticeSessionDetail>>>;

/**
 * An unreadable diagram becomes an empty board (logged) flagged
 * `playDataUnreadable`, so the editor's station warnings skip the drill
 * instead of reading its missing area as full ice (2b).
 */
function editorPlayData(raw: unknown, playId: string): { playData: PlayData; playDataUnreadable?: true } {
  const parsed = parseStoredPlayData(raw);
  if (parsed.ok) return { playData: parsed.data };
  console.error(`Unreadable playData (play ${playId}):`, parsed.error);
  return { playData: createEmptyPlayData(), playDataUnreadable: true };
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
    goaliesAttending: number | null;
    plays: Array<{
      id: string;
      playId: string;
      name: string;
      description: string;
      sequence: number;
      runsWithPrevious: boolean;
      duration: number;
      instructions: string;
      focus: PlayFocus;
      goalies: PlayGoalies;
      playData: PlayData;
      /** The stored diagram couldn't be read; playData is an empty stand-in (2b warnings skip it). */
      playDataUnreadable?: true;
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
              focus: true,
              goalies: true,
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
      goaliesAttending: session.goaliesAttending ?? null,
      // Plays are ordered by sequence asc. Before 3a, deleting a library play
      // cascaded its PracticeSessionPlay row away and could leave gaps (e.g.
      // 0,2), which the save validator rejects, or a block's stations without
      // their first drill. normalizeGroups renumbers to consecutive 0-based
      // indices and clears the first drill's station flag (2b).
      plays: normalizeGroups(session.plays.map((sp) => ({
        id: sp.id,
        playId: sp.play.id,
        name: sp.play.name,
        description: sp.play.description ?? "",
        sequence: sp.sequence,
        runsWithPrevious: sp.runsWithPrevious,
        duration: sp.duration ?? 0,
        instructions: sp.instructions || "",
        ...drillTags(sp.play),
        ...editorPlayData(sp.play.playData, sp.play.id),
        thumbnail: sp.play.thumbnail || "",
      }))),
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

/**
 * Teams the current user may import a practice plan into (ADR-0020): those
 * where createPracticeSession's scheduler check passes without a reservation,
 * i.e. a team ADMIN membership (requireTeamAdmin has no isActive filter, so
 * neither does this).
 */
export async function getPlanImportTeams(): Promise<Array<{ id: string; name: string }>> {
  const userId = await requireUserId();
  const memberships = await prisma.teamMember.findMany({
    where: { userId, role: "ADMIN" },
    select: { team: { select: { id: true, name: true } } },
    orderBy: { team: { name: "asc" } },
  });
  return memberships.map((membership) => membership.team);
}

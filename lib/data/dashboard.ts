// Server-only read layer for the dashboard. These are RSC data-fetching
// helpers (NOT Server Actions — no "use server"): they must never be imported
// from Client Components. Every query scopes strictly to the viewer's own
// memberships, which come from one cache()-deduped fetch per request.
import { cache } from "react";
import { addDays } from "date-fns";
import { prisma } from "@/lib/db/prisma";
import type { EventType, LeagueRole, Role, RSVPStatus } from "@prisma/client";
import type { RsvpTarget } from "@/types/events";

const SCHEDULE_WINDOW_DAYS = 14;
const SCHEDULE_LIMIT = 10;
const NEEDS_RSVP_LIMIT = 5;
const ADMIN_EVENTS_LIMIT = 5;
const RECENT_MESSAGES_LIMIT = 5;
const MESSAGE_SNIPPET_LENGTH = 140;

export type ViewerTeamMembership = {
  role: Role;
  team: {
    id: string;
    name: string;
    sport: string;
    season: string;
    leagueId: string | null;
    league: { id: string; name: string } | null;
    division: { id: string; name: string } | null;
    _count: { players: number; events: number };
  };
};

export type ViewerLeagueMembership = {
  role: LeagueRole;
  league: {
    id: string;
    name: string;
    sport: string;
    _count: { teams: number; players: number; events: number; divisions: number };
  };
};

export type ViewerMemberships = {
  teams: ViewerTeamMembership[];
  leagues: ViewerLeagueMembership[];
};

/**
 * The viewer's active team + league memberships (with roles). Deduped with
 * React cache() so the page shell and every widget share one fetch per request.
 */
export const getViewerMemberships = cache(
  async (userId: string): Promise<ViewerMemberships> => {
    const [teams, leagues] = await Promise.all([
      prisma.teamMember.findMany({
        where: { userId, team: { isActive: true } },
        select: {
          role: true,
          team: {
            select: {
              id: true,
              name: true,
              sport: true,
              season: true,
              leagueId: true,
              league: { select: { id: true, name: true } },
              division: { select: { id: true, name: true } },
              _count: { select: { players: true, events: true } },
            },
          },
        },
        orderBy: { joinedAt: "desc" },
      }),
      prisma.leagueUser.findMany({
        where: { userId, league: { isActive: true } },
        select: {
          role: true,
          league: {
            select: {
              id: true,
              name: true,
              sport: true,
              _count: {
                select: { teams: true, players: true, events: true, divisions: true },
              },
            },
          },
        },
        orderBy: { joinedAt: "desc" },
      }),
    ]);

    return { teams, leagues };
  }
);

export type UpcomingEventItem = {
  kind: "event";
  id: string;
  eventType: EventType;
  title: string;
  startAt: string; // ISO string — serialized before crossing to any client leaf
  timezone: string;
  location: string;
  opponent: string | null;
  teamId: string;
  teamName: string;
  rsvpStatus: RSVPStatus;
};

export type UpcomingPracticeItem = {
  kind: "practice";
  id: string;
  title: string;
  startAt: string; // ISO string
  duration: number;
  playCount: number;
  teamId: string;
  teamName: string;
};

export type ScheduleItem = UpcomingEventItem | UpcomingPracticeItem;

/**
 * Events across ALL the viewer's teams (next 14 days, with the viewer's own
 * RSVP status) merged with upcoming shared/own practice sessions, sorted by
 * start and capped at 10 items.
 */
export async function getUpcomingSchedule(userId: string): Promise<ScheduleItem[]> {
  const { teams } = await getViewerMemberships(userId);
  const teamIds = teams.map((membership) => membership.team.id);
  if (teamIds.length === 0) return [];

  const now = new Date();
  const horizon = addDays(now, SCHEDULE_WINDOW_DAYS);

  const [events, practices] = await Promise.all([
    prisma.event.findMany({
      where: { teamId: { in: teamIds }, startAt: { gte: now, lte: horizon } },
      orderBy: { startAt: "asc" },
      take: SCHEDULE_LIMIT,
      select: {
        id: true,
        type: true,
        title: true,
        startAt: true,
        timezone: true,
        location: true,
        opponent: true,
        team: { select: { id: true, name: true } },
        rsvps: { where: { userId }, select: { status: true } },
      },
    }),
    prisma.practiceSession.findMany({
      where: {
        teamId: { in: teamIds },
        date: { gte: now, lte: horizon },
        OR: [{ isShared: true }, { createdById: userId }],
      },
      orderBy: { date: "asc" },
      take: SCHEDULE_LIMIT,
      select: {
        id: true,
        title: true,
        date: true,
        duration: true,
        teamId: true,
        team: { select: { name: true } },
        _count: { select: { plays: true } },
      },
    }),
  ]);

  const items: ScheduleItem[] = [
    ...events.map(
      (event): UpcomingEventItem => ({
        kind: "event",
        id: event.id,
        eventType: event.type,
        title: event.title,
        startAt: event.startAt.toISOString(),
        timezone: event.timezone,
        location: event.location,
        opponent: event.opponent,
        teamId: event.team.id,
        teamName: event.team.name,
        rsvpStatus: event.rsvps[0]?.status ?? "NO_RESPONSE",
      })
    ),
    ...practices.map(
      (practice): UpcomingPracticeItem => ({
        kind: "practice",
        id: practice.id,
        title: practice.title,
        startAt: practice.date.toISOString(),
        duration: practice.duration,
        playCount: practice._count.plays,
        teamId: practice.teamId,
        teamName: practice.team.name,
      })
    ),
  ];

  // ISO-8601 UTC strings sort correctly lexicographically.
  return items.sort((a, b) => a.startAt.localeCompare(b.startAt)).slice(0, SCHEDULE_LIMIT);
}

export type NeedsRsvpItem = {
  eventId: string;
  eventType: EventType;
  title: string;
  startAt: string; // ISO string
  timezone: string;
  location: string;
  opponent: string | null;
  teamName: string;
  /** Which identity the pending response is for: self or a guarded player. */
  target: RsvpTarget;
};

// Shared select for the event fields a NeedsRsvpItem carries.
const needsRsvpEventSelect = {
  id: true,
  type: true,
  title: true,
  startAt: true,
  timezone: true,
  location: true,
  opponent: true,
  team: { select: { name: true } },
} as const;

type NeedsRsvpEventRow = {
  id: string;
  type: EventType;
  title: string;
  startAt: Date;
  timezone: string;
  location: string;
  opponent: string | null;
  team: { name: string };
};

// Upper bound on upcoming guarded-team events scanned for missing per-child
// rows (each event can yield several player rows; final list is capped below).
const NEEDS_RSVP_EVENT_SCAN_LIMIT = 25;

function toNeedsRsvpItem(event: NeedsRsvpEventRow, target: RsvpTarget): NeedsRsvpItem {
  return {
    eventId: event.id,
    eventType: event.type,
    title: event.title,
    startAt: event.startAt.toISOString(),
    timezone: event.timezone,
    location: event.location,
    opponent: event.opponent,
    teamName: event.team.name,
    target,
  };
}

/**
 * The viewer's pending RSVPs on future events, per identity (soonest first,
 * max 5):
 * - self rows: the viewer's own NO_RESPONSE rows (playerId null — per-child
 *   rows are answered separately and never count against "you");
 * - player rows: players the viewer guards (canRsvp) that have no per-child
 *   RSVP row yet for an upcoming event of their team (event fan-out only
 *   creates per-user rows; per-child rows appear on first response).
 */
export async function getNeedsRsvp(userId: string): Promise<NeedsRsvpItem[]> {
  const now = new Date();

  const [selfRsvps, guardians] = await Promise.all([
    prisma.rSVP.findMany({
      where: {
        userId,
        playerId: null,
        status: "NO_RESPONSE",
        event: { startAt: { gte: now } },
      },
      orderBy: { event: { startAt: "asc" } },
      take: NEEDS_RSVP_LIMIT,
      select: { event: { select: needsRsvpEventSelect } },
    }),
    prisma.playerGuardian.findMany({
      where: { userId, canRsvp: true, player: { team: { isActive: true } } },
      select: {
        playerId: true,
        player: { select: { name: true, teamId: true } },
      },
    }),
  ]);

  const items: NeedsRsvpItem[] = selfRsvps.map(({ event }) =>
    toNeedsRsvpItem(event, { kind: "self" })
  );

  if (guardians.length > 0) {
    const guardedPlayerIds = guardians.map((guardian) => guardian.playerId);
    const teamIds = [...new Set(guardians.map((guardian) => guardian.player.teamId))];

    const events = await prisma.event.findMany({
      where: { teamId: { in: teamIds }, startAt: { gte: now } },
      orderBy: { startAt: "asc" },
      take: NEEDS_RSVP_EVENT_SCAN_LIMIT,
      select: {
        ...needsRsvpEventSelect,
        teamId: true,
        rsvps: {
          where: { playerId: { in: guardedPlayerIds } },
          select: { playerId: true },
        },
      },
    });

    for (const event of events) {
      const answeredPlayerIds = new Set(event.rsvps.map((rsvp) => rsvp.playerId));
      for (const guardian of guardians) {
        if (
          guardian.player.teamId !== event.teamId ||
          answeredPlayerIds.has(guardian.playerId)
        ) {
          continue;
        }
        items.push(
          toNeedsRsvpItem(event, {
            kind: "player",
            playerId: guardian.playerId,
            playerName: guardian.player.name,
          })
        );
      }
    }
  }

  // ISO-8601 UTC strings sort correctly lexicographically.
  return items
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
    .slice(0, NEEDS_RSVP_LIMIT);
}

export type RecentMessageItem = {
  id: string; // LeagueMessage id
  subject: string;
  snippet: string;
  sentAt: string; // ISO string
  leagueId: string;
  leagueName: string;
  senderName: string;
};

/** Collapse whitespace and truncate message content to a one-line teaser. */
function toSnippet(content: string): string {
  const collapsed = content.replace(/\s+/g, " ").trim();
  return collapsed.length > MESSAGE_SNIPPET_LENGTH
    ? `${collapsed.slice(0, MESSAGE_SNIPPET_LENGTH).trimEnd()}…`
    : collapsed;
}

/**
 * The viewer's most recently received league messages (newest first, max 5).
 * Reads MessageRecipient rows scoped to the viewer — relies on the
 * MessageRecipient @@index([userId, sentAt]) added alongside TeamOfficial.
 */
export async function getRecentMessages(
  userId: string,
  limit: number = RECENT_MESSAGES_LIMIT
): Promise<RecentMessageItem[]> {
  const recipients = await prisma.messageRecipient.findMany({
    where: { userId },
    orderBy: { sentAt: "desc" },
    take: limit,
    select: {
      sentAt: true,
      message: {
        select: {
          id: true,
          subject: true,
          content: true,
          league: { select: { id: true, name: true } },
          sender: { select: { name: true, email: true } },
        },
      },
    },
  });

  return recipients.map(({ sentAt, message }) => ({
    id: message.id,
    subject: message.subject,
    snippet: toSnippet(message.content),
    sentAt: sentAt.toISOString(),
    leagueId: message.league.id,
    leagueName: message.league.name,
    senderName: message.sender.name ?? message.sender.email,
  }));
}

export type AdminAttentionData = {
  events: Array<{
    id: string;
    eventType: EventType;
    title: string;
    startAt: string; // ISO string
    timezone: string;
    teamId: string;
    teamName: string;
    noResponseCount: number;
  }>;
  pendingInvitations: Array<{ teamId: string; teamName: string; count: number }>;
};

/**
 * Admin-only attention items for teams the viewer administers: upcoming events
 * with unanswered RSVPs and pending (non-expired) invitations per team.
 * Returns null when the viewer administers no teams.
 */
export async function getAdminAttention(userId: string): Promise<AdminAttentionData | null> {
  const { teams } = await getViewerMemberships(userId);
  const adminTeams = teams.filter((membership) => membership.role === "ADMIN");
  if (adminTeams.length === 0) return null;

  const adminTeamIds = adminTeams.map((membership) => membership.team.id);
  const teamNames = new Map(
    adminTeams.map((membership) => [membership.team.id, membership.team.name])
  );
  const now = new Date();

  const [events, invitationGroups] = await Promise.all([
    prisma.event.findMany({
      where: {
        teamId: { in: adminTeamIds },
        startAt: { gte: now },
        rsvps: { some: { status: "NO_RESPONSE" } },
      },
      orderBy: { startAt: "asc" },
      take: ADMIN_EVENTS_LIMIT,
      select: {
        id: true,
        type: true,
        title: true,
        startAt: true,
        timezone: true,
        teamId: true,
        _count: { select: { rsvps: { where: { status: "NO_RESPONSE" } } } },
      },
    }),
    prisma.invitation.groupBy({
      by: ["teamId"],
      where: {
        teamId: { in: adminTeamIds },
        status: "PENDING",
        expiresAt: { gt: now },
      },
      _count: { _all: true },
    }),
  ]);

  return {
    events: events.map((event) => ({
      id: event.id,
      eventType: event.type,
      title: event.title,
      startAt: event.startAt.toISOString(),
      timezone: event.timezone,
      teamId: event.teamId,
      teamName: teamNames.get(event.teamId) ?? "",
      noResponseCount: event._count.rsvps,
    })),
    // Invitation.teamId is nullable since the unified-target migration; the
    // where clause restricts to the viewer's admin teams, so null groups
    // cannot occur — the flatMap only narrows the type.
    pendingInvitations: invitationGroups.flatMap((group) =>
      group.teamId === null
        ? []
        : [
            {
              teamId: group.teamId,
              teamName: teamNames.get(group.teamId) ?? "",
              count: group._count._all,
            },
          ]
    ),
  };
}

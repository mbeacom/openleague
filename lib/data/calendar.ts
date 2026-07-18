// Server-only read layer for the unified calendar (Tier 2 W1a). These are RSC
// data-fetching helpers (NOT Server Actions — no "use server"): they must never
// be imported from Client Components. Every query scopes strictly to the
// viewer's own memberships (teams, leagues, signup registrations/management,
// venue staff), following the multi-source union pattern of
// lib/utils/availability.ts.
import { differenceInCalendarDays, addDays } from "date-fns";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getViewableTeamIds, requireUserId } from "@/lib/auth/session";
import { getViewerMemberships } from "@/lib/data/dashboard";
import { expandRecurrenceWindow } from "@/lib/utils/venue-schedule";
import type { CalendarItem } from "@/types/events";

export type { CalendarItem, CalendarItemScope, CalendarSource } from "@/types/events";

/** Hard cap on the query window so a bad caller can never go unbounded. */
const MAX_WINDOW_DAYS = 550;

export type CalendarWindow = {
  from: Date | string;
  to: Date | string;
};

/**
 * Every calendar item visible to the signed-in viewer over [from, to), from
 * four sources queried in parallel:
 *
 * 1. Events for all of the viewer's teams, plus league events for their leagues.
 * 2. PracticeSessions (shared or their own) across their teams.
 * 3. SignupEvents they registered for, manage, or that one of their teams hosts.
 * 4. PUBLISHED VenueScheduleBlocks at venues where they are ACTIVE staff
 *    (recurring blocks expanded per occurrence within the window).
 *
 * All dates are ISO-serialized; items are deduped and sorted by start time.
 */
export async function getUserCalendarItems(window: CalendarWindow): Promise<CalendarItem[]> {
  const userId = await requireUserId();
  const { from, to } = normalizeWindow(window);

  const { teams, leagues } = await getViewerMemberships(userId);
  const memberTeamIds = teams.map((membership) => membership.team.id);
  const adminTeamIds = new Set(
    teams.filter((membership) => membership.role === "ADMIN").map((membership) => membership.team.id)
  );
  const leagueIds = leagues.map((membership) => membership.league.id);

  // Events also surface teams the viewer can see via guardianship (a parent of
  // a rostered player who is not a TeamMember), so a guardian-only parent sees
  // their child's team schedule here just like a member. Practices and signups
  // stay scoped to direct memberships — guardian view access is for the games
  // and practices their child's team runs, not team-internal planning tools.
  const viewableTeamIds = await getViewableTeamIds(userId);

  const [events, practices, signups, venueBlocks] = await Promise.all([
    fetchTeamAndLeagueEvents({ teamIds: viewableTeamIds, leagueIds, from, to }),
    fetchPracticeSessions({ userId, teamIds: memberTeamIds, from, to }),
    fetchSignupEvents({ userId, teamIds: memberTeamIds, adminTeamIds, from, to }),
    fetchVenueScheduleBlocks({ userId, from, to }),
  ]);

  // ISO-8601 UTC strings sort correctly lexicographically.
  return dedupeItems([...events, ...practices, ...signups, ...venueBlocks]).sort((a, b) =>
    a.startAt.localeCompare(b.startAt)
  );
}

function normalizeWindow(window: CalendarWindow): { from: Date; to: Date } {
  const from = new Date(window.from);
  const to = new Date(window.to);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new Error("Invalid calendar window: from/to must be valid dates");
  }
  if (to <= from) {
    throw new Error("Invalid calendar window: to must be after from");
  }

  return differenceInCalendarDays(to, from) > MAX_WINDOW_DAYS
    ? { from, to: addDays(from, MAX_WINDOW_DAYS) }
    : { from, to };
}

/**
 * Two scopes can reach the same row (e.g. a team event in the viewer's league),
 * and recurring venue blocks emit one item per occurrence under the block's id,
 * so the identity key is source + id + startAt.
 */
function dedupeItems(items: CalendarItem[]): CalendarItem[] {
  const seen = new Map<string, CalendarItem>();
  for (const item of items) {
    const key = `${item.source}:${item.id}:${item.startAt}`;
    if (!seen.has(key)) seen.set(key, item);
  }
  return [...seen.values()];
}

// ---------------------------------------------------------------------------
// Source fetchers — each returns fully serialized CalendarItem rows.
// ---------------------------------------------------------------------------

async function fetchTeamAndLeagueEvents(params: {
  teamIds: string[];
  leagueIds: string[];
  from: Date;
  to: Date;
}): Promise<CalendarItem[]> {
  const scopeOr: Prisma.EventWhereInput[] = [
    ...(params.teamIds.length > 0 ? [{ teamId: { in: params.teamIds } }] : []),
    ...(params.leagueIds.length > 0 ? [{ leagueId: { in: params.leagueIds } }] : []),
  ];
  if (scopeOr.length === 0) return [];

  const events = await prisma.event.findMany({
    where: {
      AND: [
        { OR: scopeOr },
        // Window overlap; endAt-less events are point-in-time (availability.ts semantics).
        { startAt: { lt: params.to } },
        {
          OR: [{ endAt: { gt: params.from } }, { endAt: null, startAt: { gte: params.from } }],
        },
      ],
    },
    select: {
      id: true,
      type: true,
      title: true,
      startAt: true,
      endAt: true,
      timezone: true,
      team: { select: { id: true, name: true } },
      league: { select: { id: true, name: true } },
    },
  });

  return events.map(
    (event): CalendarItem => ({
      id: event.id,
      source: "event",
      title: event.title,
      startAt: event.startAt.toISOString(),
      endAt: event.endAt?.toISOString() ?? null,
      timezone: event.timezone,
      scope: {
        teamId: event.team.id,
        teamName: event.team.name,
        ...(event.league ? { leagueId: event.league.id, leagueName: event.league.name } : {}),
      },
      href: `/events/${event.id}`,
      eventType: event.type,
    })
  );
}

async function fetchPracticeSessions(params: {
  userId: string;
  teamIds: string[];
  from: Date;
  to: Date;
}): Promise<CalendarItem[]> {
  if (params.teamIds.length === 0) return [];

  const practices = await prisma.practiceSession.findMany({
    where: {
      teamId: { in: params.teamIds },
      OR: [{ isShared: true }, { createdById: params.userId }],
      date: { gte: params.from, lt: params.to },
    },
    select: {
      id: true,
      title: true,
      date: true,
      // Venue-attached sessions carry an exact startAt; `date` is the fallback.
      startAt: true,
      duration: true,
      teamId: true,
      team: { select: { name: true } },
    },
  });

  return practices.map((practice): CalendarItem => {
    const start = practice.startAt ?? practice.date;
    return {
      id: practice.id,
      source: "practice",
      title: practice.title,
      startAt: start.toISOString(),
      endAt: new Date(start.getTime() + practice.duration * 60_000).toISOString(),
      scope: { teamId: practice.teamId, teamName: practice.team.name },
      href: `/practice-planner/${practice.id}`,
    };
  });
}

async function fetchSignupEvents(params: {
  userId: string;
  teamIds: string[];
  adminTeamIds: Set<string>;
  from: Date;
  to: Date;
}): Promise<CalendarItem[]> {
  const scopeOr: Prisma.SignupEventWhereInput[] = [
    {
      registrations: {
        some: {
          registrantId: params.userId,
          status: { notIn: ["CANCELED", "EXPIRED", "REFUNDED"] },
        },
      },
    },
    { managers: { some: { userId: params.userId } } },
    // Hosted-by-my-team scope must not leak drafts to non-manager members.
    ...(params.teamIds.length > 0
      ? [{ hostTeamId: { in: params.teamIds }, status: "PUBLISHED" as const }]
      : []),
  ];

  const signups = await prisma.signupEvent.findMany({
    where: {
      status: { not: "CANCELED" },
      OR: scopeOr,
      startAt: { lt: params.to },
      endAt: { gt: params.from },
    },
    select: {
      id: true,
      title: true,
      category: true,
      startAt: true,
      endAt: true,
      timezone: true,
      hostTeamId: true,
      hostTeam: { select: { id: true, name: true } },
      hostLeague: { select: { id: true, name: true } },
      venue: { select: { id: true, name: true } },
      managers: { where: { userId: params.userId }, select: { id: true } },
    },
  });

  return signups.map((signup): CalendarItem => {
    // Explicit managers and host-team admins (implicit managers) get the
    // manage view; everyone else gets the public detail page.
    const canManage =
      signup.managers.length > 0 ||
      (signup.hostTeamId !== null && params.adminTeamIds.has(signup.hostTeamId));

    return {
      id: signup.id,
      source: "signup",
      title: signup.title,
      startAt: signup.startAt.toISOString(),
      endAt: signup.endAt.toISOString(),
      timezone: signup.timezone,
      scope: {
        ...(signup.hostTeam ? { teamId: signup.hostTeam.id, teamName: signup.hostTeam.name } : {}),
        ...(signup.hostLeague
          ? { leagueId: signup.hostLeague.id, leagueName: signup.hostLeague.name }
          : {}),
        ...(signup.venue ? { venueId: signup.venue.id, venueName: signup.venue.name } : {}),
      },
      href: canManage ? `/signup-events/${signup.id}` : `/signups/${signup.id}`,
      eventType: signup.category,
    };
  });
}

async function fetchVenueScheduleBlocks(params: {
  userId: string;
  from: Date;
  to: Date;
}): Promise<CalendarItem[]> {
  const staffRows = await prisma.venueStaff.findMany({
    where: {
      userId: params.userId,
      status: "ACTIVE",
      organization: { status: { in: ["DRAFT", "ACTIVE"] } },
    },
    select: { venueId: true, organizationId: true },
  });
  if (staffRows.length === 0) return [];

  // venueId null = organization-wide staff row covering every org venue.
  const explicitVenueIds = [
    ...new Set(staffRows.flatMap((row) => (row.venueId ? [row.venueId] : []))),
  ];
  const orgWideOrgIds = [
    ...new Set(staffRows.filter((row) => row.venueId === null).map((row) => row.organizationId)),
  ];

  const scopeOr: Prisma.VenueScheduleBlockWhereInput[] = [
    ...(explicitVenueIds.length > 0 ? [{ venueId: { in: explicitVenueIds } }] : []),
    ...(orgWideOrgIds.length > 0 ? [{ venue: { organizationId: { in: orgWideOrgIds } } }] : []),
  ];

  const blocks = await prisma.venueScheduleBlock.findMany({
    where: {
      status: "PUBLISHED",
      venue: { is: { isActive: true } },
      AND: [
        { OR: scopeOr },
        // Occurrences never start before the base startsAt (availability.ts).
        { startsAt: { lt: params.to } },
        {
          OR: [
            { recurrenceRule: null, endsAt: { gt: params.from } },
            { recurrenceRule: { not: null } },
          ],
        },
      ],
    },
    select: {
      id: true,
      title: true,
      startsAt: true,
      endsAt: true,
      recurrenceRule: true,
      recurrenceEndDate: true,
      activityType: true,
      venueId: true,
      venue: { select: { name: true, timezone: true, organizationId: true } },
    },
  });

  const items: CalendarItem[] = [];
  for (const block of blocks) {
    const base = {
      id: block.id,
      source: "venue-block" as const,
      title: block.title,
      timezone: block.venue.timezone,
      scope: { venueId: block.venueId, venueName: block.venue.name },
      // Staff-reachable venues always belong to an organization; the plain
      // venue detail route is a guard for legacy rows only.
      href: block.venue.organizationId
        ? `/venue-admin/${block.venue.organizationId}/venues/${block.venueId}/schedule`
        : `/venues/${block.venueId}`,
      eventType: block.activityType,
    };

    if (block.recurrenceRule) {
      let occurrences: Array<{ startAt: Date; endAt: Date }>;
      try {
        occurrences = expandRecurrenceWindow(
          {
            startAt: block.startsAt,
            endAt: block.endsAt,
            recurrenceRule: block.recurrenceRule,
            recurrenceEndAt: block.recurrenceEndDate,
          },
          params.from,
          params.to
        );
      } catch {
        // One unsupported/legacy rule must not break the whole feed; fall back
        // to the base slot when it overlaps the window.
        occurrences =
          block.startsAt < params.to && block.endsAt > params.from
            ? [{ startAt: block.startsAt, endAt: block.endsAt }]
            : [];
      }
      for (const occurrence of occurrences) {
        items.push({
          ...base,
          startAt: occurrence.startAt.toISOString(),
          endAt: occurrence.endAt.toISOString(),
        });
      }
    } else {
      items.push({
        ...base,
        startAt: block.startsAt.toISOString(),
        endAt: block.endsAt.toISOString(),
      });
    }
  }
  return items;
}

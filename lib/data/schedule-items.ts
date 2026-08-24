import { SeasonScheduleVisibility, type Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { canViewSignupEvent, isSignupEventManager } from "@/lib/utils/event-access";
import type { AssociationScheduleItemView } from "@/types/association-operations";

export type ScheduleIdentityInput = {
  venueReservationId?: string | null;
  source: AssociationScheduleItemView["source"];
  sourceId: string;
  startsAt: Date;
};

export type ScheduleItemsWindow = {
  from?: Date;
  to?: Date;
};

export type ScheduleItemsScope = ScheduleItemsWindow & {
  leagueIds?: string[];
  teamIds?: string[];
  /** Team scope for participant-facing Events; unlike teamIds, this may
   * include guardian-viewable teams. */
  eventTeamIds?: string[];
  venueIds?: string[];
  userId?: string;
  publicOnly?: boolean;
  /** Resolved by the league wrapper; direct callers omit it. */
  leagueViewerRole?: "ADMIN" | "MEMBER" | "PUBLIC";
};

/**
 * Linked aliases use the reservation as their one stable schedule identity.
 * Unlinked legacy rows retain a source- and occurrence-qualified identity.
 */
export function canonicalScheduleIdentity(
  input: ScheduleIdentityInput,
): string {
  return input.venueReservationId
    ? `reservation:${input.venueReservationId}`
    : `${input.source}:${input.sourceId}:${input.startsAt.toISOString()}`;
}

const SOURCE_PRIORITY: Record<AssociationScheduleItemView["source"], number> = {
  venueReservation: 0,
  event: 1,
  signupEvent: 2,
  eventGame: 3,
  practice: 4,
  seasonGame: 5,
};

/**
 * Removes linked aliases without collapsing independent unlinked legacy rows.
 * A domain activity wins over the bare reservation and Event aliases so the
 * schedule keeps its most useful participant-facing title.
 */
export function deduplicateAssociationScheduleItems<
  T extends AssociationScheduleItemView,
>(items: readonly T[]): T[] {
  const chosen = new Map<string, T>();
  const participantEventHrefs = new Map<string, string>();

  for (const item of items) {
    const identity = canonicalScheduleIdentity({
      venueReservationId: item.venueReservationId,
      source: item.source,
      sourceId: item.sourceId,
      startsAt: item.startsAt,
    });

    if (item.venueReservationId && item.source === "event" && item.href) {
      const currentHref = participantEventHrefs.get(identity);
      if (!currentHref || item.href.localeCompare(currentHref) < 0) {
        participantEventHrefs.set(identity, item.href);
      }
    }

    const current = chosen.get(identity);
    if (
      !current
      || SOURCE_PRIORITY[item.source] > SOURCE_PRIORITY[current.source]
    ) {
      chosen.set(identity, { ...item, canonicalScheduleId: identity });
    }
  }

  return [...chosen.entries()]
    .map(([identity, item]) => {
      const participantEventHref = participantEventHrefs.get(identity);
      return participantEventHref
        ? { ...item, href: participantEventHref }
        : item;
    })
    .sort(
      (a, b) =>
        a.startsAt.getTime() - b.startsAt.getTime()
        || a.canonicalScheduleId.localeCompare(b.canonicalScheduleId),
    );
}

type ScheduleItemExtras = {
  eventType?: string | null;
  location?: string | null;
  opponent?: string | null;
  notes?: string | null;
  updatedAt?: Date | null;
  teamId?: string | null;
  teamName?: string | null;
  divisionName?: string | null;
  homeTeam?: { id: string; name: string } | null;
  awayTeam?: { id: string; name: string } | null;
  venueName?: string | null;
  leagueId?: string | null;
  leagueName?: string | null;
  href?: string | null;
};

/**
 * The canonical schedule reader. All calendar, report, and ICS consumers use
 * this boundary rather than querying the five historical occupancy sources.
 *
 * The legacy source queries are intentionally retained as a compatibility
 * read during the additive reservation cutover. Linked rows are collapsed by
 * reservation identity and confirmed reservations are added only when they
 * have a relevant tenant/resource scope.
 */
export async function getScheduleItems(
  scope: ScheduleItemsScope = {},
): Promise<AssociationScheduleItemView[]> {
  const effectiveScope: ScheduleItemsScope = {
    ...scope,
    leagueViewerRole:
      scope.leagueViewerRole ?? (scope.publicOnly ? "PUBLIC" : "MEMBER"),
  };
  const from = effectiveScope.from ?? new Date(0);
  const to = effectiveScope.to ?? new Date("9999-12-31T23:59:59.999Z");
  const [events, seasonGames, practices, signupEvents, eventGames, reservations] =
    await Promise.all([
      readEvents(effectiveScope, from, to),
      readSeasonGames(effectiveScope, from, to),
      readPractices(effectiveScope, from, to),
      readSignupEvents(effectiveScope, from, to),
      readEventGames(effectiveScope, from, to),
      readReservations(effectiveScope, from, to),
    ]);

  return deduplicateAssociationScheduleItems([
    ...events,
    ...seasonGames,
    ...practices,
    ...signupEvents,
    ...eventGames,
    ...reservations,
  ]);
}

export async function getLeagueScheduleItems(
  leagueId: string,
  window: ScheduleItemsWindow & {
    publicOnly?: boolean;
    userId?: string;
    leagueRole?: "LEAGUE_ADMIN" | "TEAM_ADMIN" | "MEMBER";
  } = {},
) {
  const publicOnly = window.publicOnly ?? false;
  if (!publicOnly && !window.userId) return [];

  let role: ScheduleItemsScope["leagueViewerRole"] = publicOnly ? "PUBLIC" : "MEMBER";
  if (!publicOnly && window.userId) {
    const suppliedRole = window.leagueRole;
    const row = suppliedRole
      ? { role: suppliedRole }
      : await findFirst<{ role: "LEAGUE_ADMIN" | "TEAM_ADMIN" | "MEMBER" }>(
          model("leagueUser"),
          {
            where: { userId: window.userId, leagueId },
            select: { role: true },
          },
        );
    role = row?.role === "LEAGUE_ADMIN" ? "ADMIN" : "MEMBER";
  }

  const teams = await findMany<{ id: string }>(model("team"), {
    where: {
      leagueId,
      isActive: true,
      ...(role === "MEMBER"
        ? { members: { some: { userId: window.userId } } }
        : {}),
    },
    select: { id: true },
  });
  const teamIds = teams.map(({ id }) => id);
  const eventTeamIds = role === "MEMBER"
    ? (
        await findMany<{ id: string }>(model("team"), {
          where: {
            leagueId,
            isActive: true,
            OR: [
              { members: { some: { userId: window.userId } } },
              { players: { some: { guardians: { some: { userId: window.userId } } } } },
            ],
          },
          select: { id: true },
        })
      ).map(({ id }) => id)
    : teamIds;

  const privateItems = await getScheduleItems({
    ...window,
    leagueIds: [leagueId],
    teamIds,
    eventTeamIds,
    leagueViewerRole: role,
  });
  if (role !== "MEMBER") return privateItems;

  const publicTeams = await findMany<{ id: string }>(model("team"), {
    where: { leagueId, isActive: true },
    select: { id: true },
  });
  const publicTeamIds = publicTeams.map(({ id }) => id);
  const publicItems = await getScheduleItems({
    from: window.from,
    to: window.to,
    leagueIds: [leagueId],
    teamIds: publicTeamIds,
    eventTeamIds: publicTeamIds,
    publicOnly: true,
    leagueViewerRole: "PUBLIC",
  });

  return deduplicateAssociationScheduleItems([...privateItems, ...publicItems]);
}

export function getPublicAssociationScheduleItems(
  leagueId: string,
  window: ScheduleItemsWindow = {},
) {
  return getLeagueScheduleItems(leagueId, {
    ...window,
    publicOnly: true,
  });
}

export async function getPublicTeamScheduleItems(
  leagueId: string,
  teamId: string,
  window: ScheduleItemsWindow = {},
) {
  const items = await getPublicAssociationScheduleItems(leagueId, window);
  return items.filter(
    (item) =>
      item.teamId === teamId
      || item.homeTeam?.id === teamId
      || item.awayTeam?.id === teamId,
  );
}

/** Resolve the exact active venue resources a signed-in staff user may read. */
export async function getUserVenueIds(userId: string): Promise<string[]> {
  const rows = await findMany<{
    venueId?: string | null;
    organization?: { venues?: Array<{ id: string }> } | null;
  }>(model("venueStaff"), {
    where: {
      userId,
      status: "ACTIVE",
      organization: { status: { in: ["DRAFT", "ACTIVE"] } },
    },
    select: {
      venueId: true,
      organization: { select: { venues: { select: { id: true } } } },
    },
  });
  return [...new Set(rows.flatMap((row) =>
    row.venueId
      ? [row.venueId]
      : row.organization?.venues?.map((venue) => venue.id) ?? [],
  ))];
}

type FindManyModel = {
  findMany?: (args: unknown) => Promise<unknown[]>;
  findFirst?: (args: unknown) => Promise<unknown>;
};

/**
 * A few compatibility tests and older deployments do not have every newer
 * model mocked/available. Missing readers are treated as an empty source while
 * the reservation-backed deployment uses all of the models below.
 */
async function findMany<T>(
  model: FindManyModel | undefined,
  args: unknown,
): Promise<T[]> {
  if (!model?.findMany) return [];
  return (await model.findMany(args)) as T[];
}

async function findFirst<T>(
  model: FindManyModel | undefined,
  args: unknown,
): Promise<T | null> {
  if (!model?.findFirst) return null;
  return ((await model.findFirst(args)) as T | null) ?? null;
}

function model(name: string): FindManyModel | undefined {
  return (prisma as unknown as Record<string, FindManyModel | undefined>)[name];
}

function overlap(from: Date, to: Date): Prisma.EventWhereInput {
  return {
    startAt: { lt: to },
    OR: [{ endAt: { gt: from } }, { endAt: null, startAt: { gte: from } }],
  };
}

function boundedOverlap(from: Date, to: Date): Prisma.EventWhereInput {
  return { startAt: { lt: to }, endAt: { gt: from } };
}

function eventScope(scope: ScheduleItemsScope): Prisma.EventWhereInput[] {
  const teamIds = scope.eventTeamIds ?? scope.teamIds;
  return [
    ...(scope.leagueIds?.length && scope.leagueViewerRole !== "MEMBER"
      ? [{ leagueId: { in: scope.leagueIds } }]
      : []),
    ...(teamIds?.length ? [{ teamId: { in: teamIds } }] : []),
    ...(scope.venueIds?.length ? [{ venueId: { in: scope.venueIds } }] : []),
  ];
}

function reservationTimezone(
  reservation: { timezone?: string | null; venue?: { timezone?: string | null } | null } | null | undefined,
  fallback = "America/New_York",
) {
  return reservation?.timezone || reservation?.venue?.timezone || fallback;
}

function reservationId(row: { venueReservationId?: string | null; venueReservation?: { id?: string } | null }) {
  return row.venueReservationId ?? row.venueReservation?.id ?? null;
}

function base(
  row: {
    id: string;
    startAt: Date;
    endAt: Date | null;
    timezone?: string | null;
    venue?: { timezone?: string | null } | null;
    venueId?: string | null;
    surfaceId?: string | null;
    segmentId?: string | null;
    venueReservationId?: string | null;
    venueReservation?: {
      id?: string;
      timezone?: string | null;
      venue?: { timezone?: string | null } | null;
    } | null;
  },
  source: AssociationScheduleItemView["source"],
  title: string,
  extras: ScheduleItemExtras = {},
): AssociationScheduleItemView {
  const linkedReservation = row.venueReservation ?? null;
  return {
    id: row.id,
    canonicalScheduleId: "",
    venueReservationId: reservationId(row),
    source,
    sourceId: row.id,
    title,
    startsAt: row.startAt,
    endsAt: row.endAt,
    // Reservation/venue time is authoritative once a row is linked.
    timezone: reservationTimezone(
      linkedReservation,
      row.venue?.timezone ?? row.timezone ?? undefined,
    ),
    venueId: row.venueId ?? null,
    surfaceId: row.surfaceId ?? null,
    segmentId: row.segmentId ?? null,
    ...extras,
  };
}

async function readEvents(
  scope: ScheduleItemsScope,
  from: Date,
  to: Date,
): Promise<AssociationScheduleItemView[]> {
  // Event has no publication state. Public calendars use the explicitly
  // published SeasonGame/SignupEvent rows instead; private calendars retain
  // Event for participant RSVP links.
  if (scope.publicOnly) return [];

  const scopes = eventScope(scope);
  if (scopes.length === 0) return [];

  const where: Prisma.EventWhereInput = {
    AND: [
      ...(scopes.length ? [{ OR: scopes }] : []),
      overlap(from, to),
    ],
  };
  const rows = await findMany<{
    id: string;
    type: string;
    title: string;
    startAt: Date;
    endAt: Date | null;
    timezone?: string | null;
    location?: string | null;
    opponent?: string | null;
    notes?: string | null;
    updatedAt?: Date | null;
    venueId?: string | null;
    venue?: { timezone?: string | null; name?: string | null } | null;
    team?: { id: string; name: string; division?: { name: string } | null } | null;
    league?: { id: string; name: string } | null;
    homeTeam?: { id: string; name: string } | null;
    awayTeam?: { id: string; name: string } | null;
    venueReservationId?: string | null;
    venueReservation?: { id?: string; timezone?: string | null; venue?: { timezone?: string | null } | null } | null;
  }>(model("event"), {
    where,
    select: {
      id: true,
      type: true,
      title: true,
      startAt: true,
      endAt: true,
      timezone: true,
      location: true,
      opponent: true,
      ...(!scope.publicOnly && scope.leagueViewerRole !== "MEMBER"
        ? { notes: true }
        : {}),
      updatedAt: true,
      venueId: true,
      venue: { select: { name: true, timezone: true } },
      team: { select: { id: true, name: true, division: { select: { name: true } } } },
      league: { select: { id: true, name: true } },
      homeTeam: { select: { id: true, name: true } },
      awayTeam: { select: { id: true, name: true } },
      venueReservationId: true,
      venueReservation: { select: { id: true, timezone: true, venue: { select: { timezone: true } } } },
    },
  });

  return rows.map((row) =>
    base(row, "event", row.title, {
      eventType: row.type,
      location: row.location ?? row.venue?.name,
      opponent: row.opponent,
      notes: row.notes,
      updatedAt: row.updatedAt,
      teamId: row.team?.id,
      teamName: row.team?.name,
      divisionName: row.team?.division?.name,
      leagueId: row.league?.id,
      leagueName: row.league?.name,
      homeTeam: row.homeTeam,
      awayTeam: row.awayTeam,
      venueName: row.venue?.name,
      href: `/events/${row.id}`,
    }),
    );
}

async function readSeasonGames(
  scope: ScheduleItemsScope,
  from: Date,
  to: Date,
): Promise<AssociationScheduleItemView[]> {
  const teamRelationship = scope.teamIds?.length
    ? { OR: [{ homeTeamId: { in: scope.teamIds } }, { awayTeamId: { in: scope.teamIds } }] }
    : null;
  const relationScopes: Prisma.SeasonGameWhereInput[] =
    scope.leagueViewerRole === "MEMBER"
      ? [
          ...(scope.leagueIds?.length
            ? [{
                season: {
                  leagueId: { in: scope.leagueIds },
                  scheduleVisibility: {
                    in: [
                      SeasonScheduleVisibility.PUBLIC,
                      SeasonScheduleVisibility.AUTHENTICATED,
                    ],
                  },
                },
              }]
            : []),
          ...(teamRelationship
            ? [{
                AND: [
                  teamRelationship,
                  {
                    season: {
                      scheduleVisibility: {
                        in: [
                          SeasonScheduleVisibility.RELATIONSHIP_ONLY,
                          SeasonScheduleVisibility.PRIVATE,
                        ],
                      },
                    },
                  },
                ],
              }]
            : []),
        ]
      : [
          ...(scope.leagueIds?.length
            ? [{ season: { leagueId: { in: scope.leagueIds } } }]
            : []),
          ...(teamRelationship ? [teamRelationship] : []),
          ...(scope.venueIds?.length ? [{ venueId: { in: scope.venueIds } }] : []),
        ];
  if (relationScopes.length === 0) return [];

  const rows = await findMany<{
    id: string;
    status: string;
    startAt: Date;
    endAt: Date;
    timezone?: string | null;
    venueId?: string | null;
    surfaceId?: string | null;
    segmentId?: string | null;
    notes?: string | null;
    updatedAt?: Date | null;
    homeTeam?: { id: string; name: string } | null;
    awayTeam?: { id: string; name: string } | null;
    venue?: { name?: string | null; timezone?: string | null } | null;
    venueReservationId?: string | null;
    venueReservation?: { id?: string; timezone?: string | null; venue?: { timezone?: string | null } | null } | null;
    event?: { id: string } | null;
  }>(model("seasonGame"), {
    where: {
      status: { in: scope.publicOnly ? ["SCHEDULED", "COMPLETED"] : ["SCHEDULED", "COMPLETED"] },
      AND: [
        boundedOverlap(from, to),
        { OR: relationScopes },
        ...(scope.publicOnly
          ? [{ season: { scheduleVisibility: "PUBLIC" } }]
          : []),
      ],
    },
    select: {
      id: true,
      status: true,
      startAt: true,
      endAt: true,
      timezone: true,
      venueId: true,
      surfaceId: true,
      segmentId: true,
      ...(!scope.publicOnly && scope.leagueViewerRole !== "MEMBER"
        ? { notes: true }
        : {}),
      updatedAt: true,
      homeTeam: { select: { id: true, name: true } },
      awayTeam: { select: { id: true, name: true } },
      venue: { select: { name: true, timezone: true } },
      venueReservationId: true,
      venueReservation: { select: { id: true, timezone: true, venue: { select: { timezone: true } } } },
      event: { select: { id: true } },
    },
  });

  return rows.map((row) => {
    const matchup =
      row.homeTeam && row.awayTeam
        ? `${row.homeTeam.name} vs ${row.awayTeam.name}`
        : "Scheduled game";
    return base(row, "seasonGame", matchup, {
      eventType: "GAME",
      location: row.venue?.name,
      updatedAt: row.updatedAt,
      homeTeam: row.homeTeam,
      awayTeam: row.awayTeam,
      venueName: row.venue?.name,
      href: row.event ? `/events/${row.event.id}` : null,
    });
  });
}

async function readPractices(
  scope: ScheduleItemsScope,
  from: Date,
  to: Date,
): Promise<AssociationScheduleItemView[]> {
  if (
    (!scope.leagueIds?.length && !scope.teamIds?.length && !scope.venueIds?.length)
    || scope.publicOnly
  ) return [];
  // A signed-in calendar viewer may use only direct team membership for
  // practice scope. League and venue scopes are resource filters, not
  // authorization to read every team's private planning sessions.
  const scopes = scope.userId && scope.leagueViewerRole !== "ADMIN"
    ? (scope.teamIds?.length ? [{ teamId: { in: scope.teamIds } }] : [])
    : [
      ...(scope.leagueIds?.length
        ? [{ team: { leagueId: { in: scope.leagueIds } } }]
        : []),
      ...(scope.teamIds?.length ? [{ teamId: { in: scope.teamIds } }] : []),
      ...(scope.venueIds?.length ? [{ venueId: { in: scope.venueIds } }] : []),
    ];
  if (scopes.length === 0) return [];

  const rows = await findMany<{
    id: string;
    title: string;
    date: Date;
    duration: number;
    startAt?: Date | null;
    timezone?: string | null;
    venueId?: string | null;
    surfaceId?: string | null;
    segmentId?: string | null;
    teamId: string;
    team?: { id: string; name: string; division?: { name: string } | null } | null;
    venue?: { name?: string | null; timezone?: string | null } | null;
    venueReservationId?: string | null;
    venueReservation?: { id?: string; timezone?: string | null; venue?: { timezone?: string | null } | null } | null;
  }>(model("practiceSession"), {
    where: {
      AND: [
        { OR: scopes },
        ...(scope.userId && scope.leagueViewerRole !== "ADMIN"
          ? [{ OR: [{ isShared: true }, { createdById: scope.userId }] }]
          : []),
        {
          OR: [
            { startAt: { gte: from, lt: to } },
            { startAt: null, date: { gte: from, lt: to } },
          ],
        },
      ],
    },
    select: {
      id: true,
      title: true,
      date: true,
      duration: true,
      startAt: true,
      timezone: true,
      venueId: true,
      surfaceId: true,
      segmentId: true,
      teamId: true,
      team: { select: { id: true, name: true, division: { select: { name: true } } } },
      venue: { select: { name: true, timezone: true } },
      venueReservationId: true,
      venueReservation: { select: { id: true, timezone: true, venue: { select: { timezone: true } } } },
    },
  });

  return rows.map((row) => {
    const startAt = row.startAt ?? row.date;
    const endAt = new Date(startAt.getTime() + row.duration * 60_000);
    return base({ ...row, startAt, endAt }, "practice", row.title, {
      eventType: "PRACTICE",
      teamId: row.teamId,
      teamName: row.team?.name,
      divisionName: row.team?.division?.name,
      venueName: row.venue?.name,
      href: `/practice-planner/${row.id}`,
    });
  });
}

async function readSignupEvents(
  scope: ScheduleItemsScope,
  from: Date,
  to: Date,
): Promise<AssociationScheduleItemView[]> {
  const hostScopes: Prisma.SignupEventWhereInput[] = [
    ...(scope.leagueIds?.length ? [{ hostLeagueId: { in: scope.leagueIds } }] : []),
    ...(scope.teamIds?.length ? [{ hostTeamId: { in: scope.teamIds } }] : []),
    ...(scope.venueIds?.length ? [{ venueId: { in: scope.venueIds } }] : []),
  ];
  if (hostScopes.length === 0 && !scope.userId) return [];

  const where: Prisma.SignupEventWhereInput = {
    status: scope.publicOnly ? "PUBLISHED" : { not: "CANCELED" },
    ...(scope.publicOnly ? { visibility: "PUBLIC" } : {}),
    AND: [
      boundedOverlap(from, to) as Prisma.SignupEventWhereInput,
      ...(hostScopes.length ? [{ OR: hostScopes }] : []),
    ],
  };

  const rows = await findMany<{
    id: string;
    title: string;
    category: string;
    startAt: Date;
    endAt: Date;
    timezone?: string | null;
    venueId?: string | null;
    venue?: { name?: string | null; timezone?: string | null } | null;
    hostTeamId?: string | null;
    hostTeam?: { id: string; name: string } | null;
    hostLeague?: { id: string; name: string } | null;
    status: "DRAFT" | "PUBLISHED" | "CANCELED" | "COMPLETED";
    visibility: "PRIVATE" | "INVITE_ONLY" | "LINK" | "PUBLIC";
    linkToken?: string | null;
    venueReservationId?: string | null;
    venueReservation?: { id?: string; timezone?: string | null; venue?: { timezone?: string | null } | null } | null;
  }>(model("signupEvent"), {
    where,
    select: {
      id: true,
      title: true,
      category: true,
      status: true,
      visibility: true,
      linkToken: true,
      startAt: true,
      endAt: true,
      timezone: true,
      venueId: true,
      venue: { select: { name: true, timezone: true } },
      hostTeamId: true,
      hostTeam: { select: { id: true, name: true } },
      hostLeague: { select: { id: true, name: true } },
      venueReservationId: true,
      venueReservation: { select: { id: true, timezone: true, venue: { select: { timezone: true } } } },
    },
  });

  const visibleRows =
    scope.publicOnly || !scope.userId || scope.leagueViewerRole === "ADMIN"
      ? rows
      : (
          await Promise.all(
            rows.map(async (row) =>
              (await isSignupEventManager(scope.userId!, row.id))
              || (await canViewSignupEvent(
                {
                  id: row.id,
                  status: row.status,
                  visibility: row.visibility,
                  linkToken: row.linkToken ?? null,
                },
                { userId: scope.userId! },
              ))
                ? row
                : null,
            ),
          )
        ).filter((row): row is (typeof rows)[number] => Boolean(row));

  return visibleRows.map((row) =>
    base(row, "signupEvent", row.title, {
      eventType: row.category,
      teamId: row.hostTeam?.id,
      teamName: row.hostTeam?.name,
      venueName: row.venue?.name,
      href: `/signups/${row.id}`,
    }),
  );
}

async function readEventGames(
  scope: ScheduleItemsScope,
  from: Date,
  to: Date,
): Promise<AssociationScheduleItemView[]> {
  if (scope.publicOnly && !scope.leagueIds?.length) return [];
  // A private calendar must carry the authenticated viewer context. In
  // particular, a league/team scope alone is not an event visibility grant.
  if (!scope.publicOnly && !scope.userId) return [];

  const eventScopes = [
    ...(scope.leagueIds?.length
      ? [{ event: { hostLeagueId: { in: scope.leagueIds }, ...(scope.publicOnly ? { status: "PUBLISHED", visibility: "PUBLIC" } : {}) } }]
      : []),
    ...(scope.teamIds?.length
      ? [{
        event: {
          hostTeamId: { in: scope.teamIds },
          ...(scope.publicOnly ? { status: "PUBLISHED", visibility: "PUBLIC" } : {}),
        },
      }]
      : []),
    ...(scope.venueIds?.length
      ? [{ event: { venueId: { in: scope.venueIds } } }]
      : []),
  ] as Prisma.EventGameWhereInput[];
  if (eventScopes.length === 0) return [];

  const rows = await findMany<{
    id: string;
    name?: string | null;
    status: string;
    startAt: Date;
    endAt: Date;
    surfaceId?: string | null;
    segmentId?: string | null;
    event?: {
      id: string;
      title: string;
      status: "DRAFT" | "PUBLISHED" | "CANCELED" | "COMPLETED";
      visibility: "PRIVATE" | "INVITE_ONLY" | "LINK" | "PUBLIC";
      linkToken?: string | null;
      teamsPublishedAt?: Date | null;
      timezone?: string | null;
      venueId?: string | null;
      venue?: { name?: string | null; timezone?: string | null } | null;
    };
    venueReservationId?: string | null;
    venueReservation?: { id?: string; timezone?: string | null; venue?: { timezone?: string | null } | null } | null;
    homeTeam?: { id: string; name: string } | null;
    awayTeam?: { id: string; name: string } | null;
  }>(model("eventGame"), {
    where: {
      status: { in: ["SCHEDULED", "COMPLETED"] as never },
      AND: [
        boundedOverlap(from, to),
        { OR: eventScopes },
        ...(scope.publicOnly
          ? [{
            event: {
              status: "PUBLISHED",
              visibility: "PUBLIC",
              teamsPublishedAt: { not: null },
            },
          }]
          : [{
            event: { teamsPublishedAt: { not: null } },
          }]),
      ],
    },
    select: {
      id: true,
      name: true,
      status: true,
      startAt: true,
      endAt: true,
      surfaceId: true,
      segmentId: true,
      event: {
        select: {
          id: true,
          title: true,
          status: true,
          visibility: true,
          linkToken: true,
          teamsPublishedAt: true,
          timezone: true,
          venueId: true,
          venue: { select: { name: true, timezone: true } },
        },
      },
      venueReservationId: true,
      venueReservation: { select: { id: true, timezone: true, venue: { select: { timezone: true } } } },
      homeTeam: { select: { id: true, name: true } },
      awayTeam: { select: { id: true, name: true } },
    },
  });

  const visibleRows = scope.publicOnly
    ? rows
    : await filterViewableEventGames(rows, scope.userId as string);

  return visibleRows.map((row) => {
    const title = row.name
      || (row.homeTeam && row.awayTeam
        ? `${row.homeTeam.name} vs ${row.awayTeam.name}`
        : row.event?.title ?? "Scheduled game");
    return base({
      ...row,
      timezone: row.event?.timezone,
      venueId: row.event?.venueId,
      venue: row.event?.venue,
      startAt: row.startAt,
      endAt: row.endAt,
    }, "eventGame", title, {
      eventType: "GAME",
      location: row.event?.venue?.name,
      venueName: row.event?.venue?.name,
      homeTeam: row.homeTeam,
      awayTeam: row.awayTeam,
      href: row.event ? `/signups/${row.event.id}` : null,
    });
  });
}

async function filterViewableEventGames<
  T extends {
    event?: {
      id: string;
      status: "DRAFT" | "PUBLISHED" | "CANCELED" | "COMPLETED";
      visibility: "PRIVATE" | "INVITE_ONLY" | "LINK" | "PUBLIC";
      linkToken?: string | null;
      teamsPublishedAt?: Date | null;
    };
  },
>(rows: T[], userId: string): Promise<T[]> {
  const gates = new Map(
    rows.flatMap((row) => row.event ? [[row.event.id, row.event] as const] : []),
  );
  const visibleEventIds = new Set(
    (await Promise.all([...gates.values()].map(async (gate) => {
      if (!gate.teamsPublishedAt) return null;
      if (await isSignupEventManager(userId, gate.id)) return gate.id;

      // Private calendars intentionally never accept a public LINK token.
      // INVITE_ONLY access still follows the canonical helper's invitation
      // and registrant checks for this signed-in viewer.
      const allowed = await canViewSignupEvent(
        {
          id: gate.id,
          status: gate.status,
          visibility: gate.visibility,
          linkToken: gate.linkToken ?? null,
        },
        { userId },
      );
      return allowed ? gate.id : null;
    }))).filter((id): id is string => Boolean(id)),
  );

  return rows.filter((row) => row.event && visibleEventIds.has(row.event.id));
}

async function readReservations(
  scope: ScheduleItemsScope,
  from: Date,
  to: Date,
): Promise<AssociationScheduleItemView[]> {
  const ownership: Prisma.VenueReservationWhereInput[] = (scope.publicOnly
    ? [
      ...(scope.leagueIds?.length
        ? [
          // scheduleVisibility belongs to the season, not to the leagueId
          // filter. Nested one level deeper it lands inside a StringFilter,
          // which Prisma rejects at request time with "Unknown argument
          // scheduleVisibility" — taking down the public schedule and the
          // /api/associations/[slug]/schedule.ics feed for any association
          // reaching this branch. Type-checking cannot catch it: the misplaced
          // key is still a valid object literal.
          {
            seasonGames: {
              some: {
                season: { leagueId: { in: scope.leagueIds }, scheduleVisibility: "PUBLIC" },
                status: { in: ["SCHEDULED", "COMPLETED"] },
              },
            },
          },
          { signupEvents: { some: { hostLeagueId: { in: scope.leagueIds }, status: "PUBLISHED", visibility: "PUBLIC" } } },
        ]
        : []),
      ...(scope.leagueIds?.length
        ? [{
          OR: [
            {
              sourceScheduleBlock: {
                status: "PUBLISHED",
                visibility: "PUBLIC",
                venue: {
                  is: {
                    isActive: true,
                    visibility: "PUBLIC",
                    profileStatus: "PUBLISHED",
                    leagueId: { in: scope.leagueIds },
                  },
                },
              },
            },
            {
              sourceScheduleBlock: {
                status: "PUBLISHED",
                visibility: "PUBLIC",
                venue: {
                  is: {
                    isActive: true,
                    visibility: "PUBLIC",
                    profileStatus: "PUBLISHED",
                    relationships: {
                      some: {
                        leagueId: { in: scope.leagueIds },
                        status: "ACTIVE",
                        OR: [
                          { expiresAt: null },
                          { expiresAt: { gte: new Date() } },
                        ],
                      },
                    },
                  },
                },
              },
            },
          ],
        }] : []),
    ]
    : [
      ...(scope.leagueIds?.length && scope.leagueViewerRole !== "MEMBER"
        ? [{ ownerLeagueId: { in: scope.leagueIds } }]
        : []),
      ...(scope.teamIds?.length ? [{ ownerTeamId: { in: scope.teamIds } }] : []),
      ...(scope.venueIds?.length ? [{ venueId: { in: scope.venueIds } }] : []),
    ]) as Prisma.VenueReservationWhereInput[];
  if (ownership.length === 0) return [];

  const rows = await findMany<{
    id: string;
    startsAt: Date;
    endsAt: Date;
    timezone: string;
    venueId: string;
    surfaceId?: string | null;
    segmentId?: string | null;
    venue?: { name?: string | null; timezone?: string | null } | null;
  }>(model("venueReservation"), {
    where: {
      status: { in: ["CONFIRMED", "COMPLETED"] },
      startsAt: { lt: to },
      endsAt: { gt: from },
      OR: ownership,
    },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      timezone: true,
      venueId: true,
      surfaceId: true,
      segmentId: true,
      venue: { select: { name: true, timezone: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    canonicalScheduleId: "",
    venueReservationId: row.id,
    source: "venueReservation",
    sourceId: row.id,
    title: "Reserved venue time",
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    timezone: reservationTimezone(row, row.venue?.timezone ?? undefined),
    venueId: row.venueId,
    surfaceId: row.surfaceId ?? null,
    segmentId: row.segmentId ?? null,
    venueName: row.venue?.name,
    href: null,
  }));
}

export type IcsCalendarOptions = {
  calendarName: string;
  prodId?: string;
};

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function foldIcsLine(line: string): string {
  if (line.length <= 75) return line;
  const chars = Array.from(line);
  const parts: string[] = [];
  let start = 0;
  let width = 75;
  while (start < chars.length) {
    parts.push(chars.slice(start, start + width).join(""));
    start += width;
    width = 74;
  }
  return parts.join("\r\n ");
}

function formatIcsDate(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
}

export function buildScheduleIcs(
  items: readonly AssociationScheduleItemView[],
  options: IcsCalendarOptions,
): string {
  const timezones = [...new Set(items.map((item) => item.timezone).filter(Boolean))];
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${options.prodId ?? "-//OpenLeague//Schedule//EN"}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(options.calendarName)}`,
    ...(timezones.length === 1 ? [`X-WR-TIMEZONE:${escapeIcsText(timezones[0])}`] : []),
  ];

  for (const item of items) {
    const end = item.endsAt ?? new Date(item.startsAt.getTime() + 2 * 60 * 60 * 1000);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeIcsText(item.canonicalScheduleId)}@openleague.app`,
      `DTSTAMP:${formatIcsDate(item.updatedAt ?? item.startsAt)}`,
      `DTSTART:${formatIcsDate(item.startsAt)}`,
      `DTEND:${formatIcsDate(end)}`,
      `SUMMARY:${escapeIcsText(item.title)}`,
      `CATEGORIES:${escapeIcsText(item.eventType ?? item.source)}`,
    );
    if (item.location || item.venueName) {
      lines.push(`LOCATION:${escapeIcsText(item.location ?? item.venueName ?? "")}`);
    }
    if (item.opponent) {
      lines.push(`DESCRIPTION:${escapeIcsText(`vs ${item.opponent}`)}`);
    }
    if (item.href) {
      lines.push(`URL:${escapeIcsText(item.href)}`);
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

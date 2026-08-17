import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  expandFiniteVenueBlockOccurrences,
  resolveLinkedAliasVenueReservationId,
} from "@/scripts/backfill-venue-reservations";

type VerificationClient = Pick<
  PrismaClient,
  | "seasonGame"
  | "event"
  | "eventGame"
  | "practiceSession"
  | "iceTimeRequest"
  | "venueScheduleBlock"
  | "signupEvent"
>;

export type VenueReservationCutoverReport = {
  clean: boolean;
  unlinkedLegacy: {
    seasonGames: number;
    events: number;
    eventGames: number;
    practices: number;
    acceptedRequests: number;
    occupyingBlocks: number;
  };
  inconsistentAliases: Array<{
    source: "SEASON_GAME_EVENT" | "PRACTICE_EVENT" | "SIGNUP_EVENT_GAME";
    primaryId: string;
    aliasId: string;
    reservationIds: string[];
  }>;
  incompleteBlockOccurrences: Array<{
    blockId: string;
    startsAt: Date | null;
    endsAt: Date | null;
    reason: string;
  }>;
  mismatchedLinkedReservations: Array<{
    source:
      | "SEASON_GAME"
      | "EVENT"
      | "EVENT_GAME"
      | "SIGNUP_EVENT"
      | "PRACTICE"
      | "ICE_REQUEST"
      | "VENUE_BLOCK";
    sourceId: string;
    reservationId: string;
    mismatchedFields: string[];
  }>;
};

type ReservationIdentity = {
  id: string;
  venueId: string;
  surfaceId: string | null;
  segmentId: string | null;
  startsAt: Date;
  endsAt: Date;
  ownerLeagueId: string | null;
  ownerTeamId: string | null;
  ownerVenueOrganizationId: string | null;
  sourceRequestId: string | null;
  offeringBlockId: string | null;
  sourceScheduleBlockId: string | null;
};

const reservationIdentitySelect = {
  id: true,
  venueId: true,
  surfaceId: true,
  segmentId: true,
  startsAt: true,
  endsAt: true,
  ownerLeagueId: true,
  ownerTeamId: true,
  ownerVenueOrganizationId: true,
  sourceRequestId: true,
  offeringBlockId: true,
  sourceScheduleBlockId: true,
} as const;

function mismatchedFields(
  reservation: ReservationIdentity,
  expected: Partial<Omit<ReservationIdentity, "id">>,
): string[] {
  return Object.entries(expected).flatMap(([field, value]) => {
    const actual = reservation[field as keyof Omit<ReservationIdentity, "id">];
    if (actual instanceof Date && value instanceof Date) {
      return actual.getTime() === value.getTime() ? [] : [field];
    }
    return actual === value ? [] : [field];
  });
}

export async function verifyVenueReservationCutover(
  client: VerificationClient = prisma,
): Promise<VenueReservationCutoverReport> {
  const [
    seasonGames,
    events,
    eventGames,
    unlinkedPractices,
    acceptedRequests,
    occupyingBlocks,
    seasonGameAliases,
    eventGameAliases,
    aliasPractices,
    practiceEvents,
    linkedRequests,
    linkedSignupEvents,
  ] = await Promise.all([
    client.seasonGame.count({
      where: {
        venueId: { not: null },
        status: { in: ["SCHEDULED", "COMPLETED"] },
        venueReservationId: null,
      },
    }),
    client.event.count({
      where: {
        venueId: { not: null },
        endAt: { not: null },
        seasonGame: null,
        venueReservationId: null,
      },
    }),
    client.eventGame.count({
      where: {
        status: { not: "CANCELED" },
        event: { venueId: { not: null }, status: "PUBLISHED" },
        venueReservationId: null,
      },
    }),
    client.practiceSession.count({
      where: {
        venueId: { not: null },
        startAt: { not: null },
        venueReservationId: null,
      },
    }),
    client.iceTimeRequest.count({
      where: {
        status: { in: ["ACCEPTED", "PARTIALLY_ACCEPTED"] },
        venueReservation: null,
      },
    }),
    client.venueScheduleBlock.findMany({
      where: {
        status: "PUBLISHED",
        intent: { in: ["VENUE_ACTIVITY", "CLOSURE"] },
      },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        recurrenceRule: true,
        recurrenceEndDate: true,
        venueId: true,
        surfaceId: true,
        segmentId: true,
        venue: {
          select: {
            timezone: true,
            organizationId: true,
            leagueId: true,
            teamId: true,
          },
        },
        reservationOccurrences: {
          select: {
            id: true,
            startsAt: true,
            endsAt: true,
            status: true,
            heldUntil: true,
            venueId: true,
            surfaceId: true,
            segmentId: true,
            ownerLeagueId: true,
            ownerTeamId: true,
            ownerVenueOrganizationId: true,
            sourceRequestId: true,
            offeringBlockId: true,
            sourceScheduleBlockId: true,
          },
        },
      },
    }),
    client.seasonGame.findMany({
      where: {
        OR: [
          { venueReservationId: { not: null } },
          { event: { venueReservationId: { not: null } } },
        ],
      },
      select: {
        id: true,
        startAt: true,
        endAt: true,
        venueId: true,
        surfaceId: true,
        segmentId: true,
        homeTeamId: true,
        venueReservationId: true,
        venueReservation: { select: reservationIdentitySelect },
        season: { select: { leagueId: true, teamId: true } },
        event: {
          select: {
            id: true,
            venueId: true,
            startAt: true,
            endAt: true,
            venueReservationId: true,
            venueReservation: { select: reservationIdentitySelect },
          },
        },
      },
    }),
    client.eventGame.findMany({
      where: {
        OR: [
          { venueReservationId: { not: null } },
          { event: { venueReservationId: { not: null } } },
        ],
      },
      select: {
        id: true,
        status: true,
        startAt: true,
        endAt: true,
        surfaceId: true,
        segmentId: true,
        venueReservationId: true,
        venueReservation: { select: reservationIdentitySelect },
        event: {
          select: {
            id: true,
            startAt: true,
            endAt: true,
            venueId: true,
            hostOrganizationId: true,
            hostLeagueId: true,
            hostTeamId: true,
            venueReservationId: true,
            venueReservation: { select: reservationIdentitySelect },
            surfaces: { select: { id: true } },
            _count: {
              select: {
                games: { where: { status: { not: "CANCELED" } } },
              },
            },
          },
        },
      },
    }),
    client.practiceSession.findMany({
      where: { venueId: { not: null }, startAt: { not: null } },
      select: {
        id: true,
        teamId: true,
        venueId: true,
        surfaceId: true,
        segmentId: true,
        startAt: true,
        duration: true,
        venueReservationId: true,
        venueReservation: { select: reservationIdentitySelect },
      },
    }),
    client.event.findMany({
      where: {
        venueId: { not: null },
        endAt: { not: null },
        seasonGame: null,
      },
      select: {
        id: true,
        type: true,
        teamId: true,
        venueId: true,
        startAt: true,
        endAt: true,
        venueReservationId: true,
        venueReservation: { select: reservationIdentitySelect },
      },
    }),
    client.iceTimeRequest.findMany({
      where: {
        status: { in: ["ACCEPTED", "PARTIALLY_ACCEPTED"] },
        venueReservation: { isNot: null },
      },
      select: {
        id: true,
        requestedStartAt: true,
        requestedEndAt: true,
        approvedStartAt: true,
        approvedEndAt: true,
        approvedSurfaceId: true,
        approvedSegmentId: true,
        requesterTeamId: true,
        requesterLeagueId: true,
        venueId: true,
        scheduleBlockId: true,
        venueReservation: { select: reservationIdentitySelect },
      },
    }),
    client.signupEvent.findMany({
      where: { venueReservationId: { not: null } },
      select: {
        id: true,
        startAt: true,
        endAt: true,
        venueId: true,
        hostOrganizationId: true,
        hostLeagueId: true,
        hostTeamId: true,
        surfaces: { select: { id: true } },
        venueReservation: { select: reservationIdentitySelect },
      },
    }),
  ]);

  const inconsistentSeasonGameAliases = seasonGameAliases.flatMap((game) => {
    if (!game.event) return [];
    const resolution = resolveLinkedAliasVenueReservationId([
      game.venueReservationId,
      game.event.venueReservationId,
    ]);
    const partiallyLinked =
      Boolean(game.venueReservationId) !==
      Boolean(game.event.venueReservationId);
    if (!resolution.inconsistent && !partiallyLinked) return [];
    return [{
      source: "SEASON_GAME_EVENT" as const,
      primaryId: game.id,
      aliasId: game.event.id,
      reservationIds: [
        game.venueReservationId,
        game.event.venueReservationId,
      ].filter((id): id is string => !!id),
    }];
  });
  const inconsistentEventGameAliases = eventGameAliases.flatMap((game) => {
    const isSingleSessionAlias =
      game.status !== "CANCELED"
      && game.event._count.games === 1
      && game.startAt.getTime() === game.event.startAt.getTime()
      && game.endAt.getTime() === game.event.endAt.getTime();
    if (!isSingleSessionAlias) return [];
    const resolution = resolveLinkedAliasVenueReservationId([
      game.venueReservationId,
      game.event.venueReservationId,
    ]);
    const partiallyLinked =
      Boolean(game.venueReservationId) !==
      Boolean(game.event.venueReservationId);
    if (!resolution.inconsistent && !partiallyLinked) return [];
    return [{
      source: "SIGNUP_EVENT_GAME" as const,
      primaryId: game.event.id,
      aliasId: game.id,
      reservationIds: [
        game.venueReservationId,
        game.event.venueReservationId,
      ].filter((id): id is string => !!id),
    }];
  });
  const inconsistentPracticeAliases = aliasPractices.flatMap((practice) => {
    if (!practice.startAt || !practice.venueId) return [];
    const endsAt = new Date(
      practice.startAt.getTime() + practice.duration * 60_000,
    );
    const matches = practiceEvents.filter(
      (event) =>
        event.type === "PRACTICE"
        &&
        event.teamId === practice.teamId
        && event.venueId === practice.venueId
        && event.startAt.getTime() === practice.startAt!.getTime()
        && event.endAt?.getTime() === endsAt.getTime(),
    );
    if (matches.length !== 1) return [];
    const event = matches[0];
    const resolution = resolveLinkedAliasVenueReservationId([
      practice.venueReservationId,
      event.venueReservationId,
    ]);
    const partiallyLinked =
      Boolean(practice.venueReservationId) !==
      Boolean(event.venueReservationId);
    if (!resolution.inconsistent && !partiallyLinked) return [];
    return [{
      source: "PRACTICE_EVENT" as const,
      primaryId: practice.id,
      aliasId: event.id,
      reservationIds: [
        practice.venueReservationId,
        event.venueReservationId,
      ].filter((id): id is string => !!id),
    }];
  });
  const inconsistentAliases = [
    ...inconsistentSeasonGameAliases,
    ...inconsistentPracticeAliases,
    ...inconsistentEventGameAliases,
  ];
  const linkedMismatchMap = new Map<
    string,
    VenueReservationCutoverReport["mismatchedLinkedReservations"][number]
  >();
  const recordMismatch = (
    source: VenueReservationCutoverReport["mismatchedLinkedReservations"][number]["source"],
    sourceId: string,
    reservation: ReservationIdentity | null,
    expected: Partial<Omit<ReservationIdentity, "id">>,
    additionalFields: string[] = [],
  ) => {
    if (!reservation) return;
    const fields = [
      ...new Set([...mismatchedFields(reservation, expected), ...additionalFields]),
    ];
    if (fields.length === 0) return;
    linkedMismatchMap.set(`${source}:${sourceId}:${reservation.id}`, {
      source,
      sourceId,
      reservationId: reservation.id,
      mismatchedFields: fields,
    });
  };

  for (const game of seasonGameAliases) {
    const ownerLeagueId = game.season.leagueId;
    const ownerTeamId = ownerLeagueId
      ? null
      : game.season.teamId ?? game.homeTeamId;
    const expected = {
      venueId: game.venueId!,
      startsAt: game.startAt,
      endsAt: game.endAt,
      ownerLeagueId,
      ownerTeamId,
      ownerVenueOrganizationId: null,
    };
    recordMismatch("SEASON_GAME", game.id, game.venueReservation, {
      ...expected,
      surfaceId: game.surfaceId,
      segmentId: game.segmentId,
    });
    if (game.event) {
      recordMismatch("EVENT", game.event.id, game.event.venueReservation, {
        ...expected,
        venueId: game.event.venueId!,
        startsAt: game.event.startAt,
        endsAt: game.event.endAt!,
      });
    }
  }

  for (const practice of aliasPractices) {
    if (!practice.venueId || !practice.startAt) continue;
    recordMismatch("PRACTICE", practice.id, practice.venueReservation, {
      venueId: practice.venueId,
      surfaceId: practice.surfaceId,
      segmentId: practice.segmentId,
      startsAt: practice.startAt,
      endsAt: new Date(practice.startAt.getTime() + practice.duration * 60_000),
      ownerLeagueId: null,
      ownerTeamId: practice.teamId,
      ownerVenueOrganizationId: null,
    });
  }

  for (const event of practiceEvents) {
    if (!event.venueId || !event.endAt) continue;
    recordMismatch("EVENT", event.id, event.venueReservation, {
      venueId: event.venueId,
      startsAt: event.startAt,
      endsAt: event.endAt,
      ownerLeagueId: null,
      ownerTeamId: event.teamId,
      ownerVenueOrganizationId: null,
    });
  }

  for (const game of eventGameAliases) {
    const owner = {
      ownerLeagueId: game.event.hostLeagueId,
      ownerTeamId: game.event.hostTeamId,
      ownerVenueOrganizationId: game.event.hostOrganizationId,
    };
    recordMismatch("EVENT_GAME", game.id, game.venueReservation, {
      venueId: game.event.venueId!,
      surfaceId: game.surfaceId,
      segmentId: game.segmentId,
      startsAt: game.startAt,
      endsAt: game.endAt,
      ...owner,
    });
  }

  for (const request of linkedRequests) {
    recordMismatch("ICE_REQUEST", request.id, request.venueReservation, {
      venueId: request.venueId,
      surfaceId: request.approvedSurfaceId,
      segmentId: request.approvedSegmentId,
      startsAt: request.approvedStartAt ?? request.requestedStartAt,
      endsAt: request.approvedEndAt ?? request.requestedEndAt,
      ownerLeagueId: request.requesterTeamId
        ? null
        : request.requesterLeagueId,
      ownerTeamId: request.requesterTeamId,
      ownerVenueOrganizationId: null,
      sourceRequestId: request.id,
      offeringBlockId: request.scheduleBlockId,
    });
  }

  for (const event of linkedSignupEvents) {
    const reservation = event.venueReservation;
    const surfaceMismatch =
      reservation
      && reservation.surfaceId !== null
      && !event.surfaces.some(({ id }) => id === reservation.surfaceId)
        ? ["surfaceId"]
        : [];
    recordMismatch("SIGNUP_EVENT", event.id, reservation, {
      venueId: event.venueId!,
      startsAt: event.startAt,
      endsAt: event.endAt,
      ownerLeagueId: event.hostLeagueId,
      ownerTeamId: event.hostTeamId,
      ownerVenueOrganizationId: event.hostOrganizationId,
    }, surfaceMismatch);
  }

  const incompleteBlockOccurrences: VenueReservationCutoverReport["incompleteBlockOccurrences"] = [];
  for (const block of occupyingBlocks) {
    const expansion = expandFiniteVenueBlockOccurrences({
      ...block,
      timezone: block.venue.timezone,
    });
    if (expansion.reason) {
      incompleteBlockOccurrences.push({
        blockId: block.id,
        startsAt: null,
        endsAt: null,
        reason: expansion.reason,
      });
      continue;
    }
    for (const reservation of block.reservationOccurrences) {
      recordMismatch("VENUE_BLOCK", block.id, reservation, {
        venueId: block.venueId,
        surfaceId: block.surfaceId,
        segmentId: block.segmentId,
        ownerLeagueId: block.venue.organizationId ? null : block.venue.leagueId,
        ownerTeamId:
          block.venue.organizationId || block.venue.leagueId
            ? null
            : block.venue.teamId,
        ownerVenueOrganizationId: block.venue.organizationId,
        sourceScheduleBlockId: block.id,
      }, expansion.occurrences.some(
        (occurrence) =>
          occurrence.startsAt.getTime() === reservation.startsAt.getTime()
          && occurrence.endsAt.getTime() === reservation.endsAt.getTime(),
      )
        ? []
        : ["startsAt", "endsAt"]);
    }
    for (const occurrence of expansion.occurrences) {
      if (!block.reservationOccurrences.some(
        (reservation) =>
          reservation.startsAt.getTime() === occurrence.startsAt.getTime()
          && reservation.endsAt.getTime() === occurrence.endsAt.getTime()
          && reservation.venueId === block.venueId
          && reservation.surfaceId === block.surfaceId
          && reservation.segmentId === block.segmentId,
      )) {
        incompleteBlockOccurrences.push({
          blockId: block.id,
          startsAt: occurrence.startsAt,
          endsAt: occurrence.endsAt,
          reason: "Missing materialized reservation occurrence.",
        });
      }
    }
  }

  const unlinkedLegacy = {
    seasonGames,
    events,
    eventGames,
    practices: unlinkedPractices,
    acceptedRequests,
    occupyingBlocks: incompleteBlockOccurrences.length,
  };
  const mismatchedLinkedReservations = [...linkedMismatchMap.values()];
  return {
    clean:
      Object.values(unlinkedLegacy).every((count) => count === 0)
      && inconsistentAliases.length === 0
      && incompleteBlockOccurrences.length === 0
      && mismatchedLinkedReservations.length === 0,
    unlinkedLegacy,
    inconsistentAliases,
    incompleteBlockOccurrences,
    mismatchedLinkedReservations,
  };
}

export function assessVenueReservationRollback(input: {
  legacyReadsEnabled: boolean;
  destructiveCleanupDetected: boolean;
}): { safe: boolean; reason: string | null } {
  if (input.destructiveCleanupDetected) {
    return {
      safe: false,
      reason: "Legacy occupancy data has been destructively cleaned up.",
    };
  }
  if (!input.legacyReadsEnabled) {
    return {
      safe: false,
      reason: "The dual-read compatibility path is disabled.",
    };
  }
  return { safe: true, reason: null };
}

async function main(): Promise<void> {
  const report = await verifyVenueReservationCutover();
  console.log(JSON.stringify(report, null, 2));
  if (!report.clean) process.exitCode = 1;
}

if (import.meta.main) {
  main()
    .catch((error) => {
      console.error(
        error instanceof Error
          ? error.message
          : "Venue reservation cutover verification failed",
      );
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { findVenueReservationConflicts } from "@/lib/services/venue-reservation-availability";
import {
  venueReservationTransactionOptions,
  withVenueReservationSerializableRetry,
} from "@/lib/services/venue-reservation-transaction";
import { expandRecurrenceWindow } from "@/lib/utils/venue-schedule";

export type VenueReservationBackfillSource =
  | "SEASON_GAME"
  | "EVENT"
  | "EVENT_GAME"
  | "PRACTICE"
  | "ICE_REQUEST"
  | "VENUE_BLOCK";

export type VenueReservationBackfillReport = {
  dryRun: boolean;
  scanned: number;
  candidates: number;
  created: number;
  linkedAliases: number;
  skippedAlreadyLinked: number;
  preservedOverlaps: number;
  unresolved: Array<{
    source: VenueReservationBackfillSource;
    sourceId: string;
    reason: string;
  }>;
};

export type VenueReservationBackfillOptions = {
  dryRun?: boolean;
  systemActorId: string;
  batchSize?: number;
};

type ReservationOwner = {
  ownerLeagueId: string | null;
  ownerTeamId: string | null;
  ownerVenueOrganizationId: string | null;
};

type ReservationMaterialization = ReservationOwner & {
  source: VenueReservationBackfillSource;
  sourceId: string;
  venueId: string;
  surfaceId: string | null;
  segmentId: string | null;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  status: "CONFIRMED" | "COMPLETED";
  sourceRequestId?: string;
  offeringBlockId?: string;
  sourceScheduleBlockId?: string;
  aliasIds: {
    seasonGameId?: string;
    eventId?: string;
    eventGameId?: string;
    signupEventId?: string;
    practiceId?: string;
  };
};

type UnitResult = {
  created: number;
  linkedAliases: number;
  skippedAlreadyLinked: number;
  preservedOverlaps: number;
  unresolved?: string;
};

export type FiniteVenueBlock = {
  startsAt: Date;
  endsAt: Date;
  recurrenceRule: string | null;
  recurrenceEndDate: Date | null;
  timezone: string;
};

export function resolveLinkedAliasVenueReservationId(
  ids: readonly (string | null | undefined)[],
): { venueReservationId: string | null; inconsistent: boolean } {
  const linked = [...new Set(ids.filter((id): id is string => !!id))];
  return linked.length > 1
    ? { venueReservationId: null, inconsistent: true }
    : { venueReservationId: linked[0] ?? null, inconsistent: false };
}

export function buildPreservedOverlapOverride(
  reason: string,
  conflictingReservationIds: readonly string[],
): { reason: string; conflictingReservationIds: string[] } {
  return {
    reason: reason.trim(),
    conflictingReservationIds: [...new Set(conflictingReservationIds)],
  };
}

function recurrenceCount(rule: string): number | null {
  const match = rule
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.toUpperCase().startsWith("COUNT="));
  if (!match) return null;
  const count = Number(match.slice(match.indexOf("=") + 1));
  return Number.isSafeInteger(count) && count > 0 ? count : null;
}

function recurrenceUntil(rule: string): Date | null {
  const match = rule
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.toUpperCase().startsWith("UNTIL="));
  if (!match) return null;
  const value = match.slice(match.indexOf("=") + 1);
  const compact = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/i.exec(
    value,
  );
  const parsed = compact
    ? new Date(
        `${compact[1]}-${compact[2]}-${compact[3]}T${compact[4]}:${compact[5]}:${compact[6]}Z`,
      )
    : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function expandFiniteVenueBlockOccurrences(
  block: FiniteVenueBlock,
): { occurrences: Array<{ startsAt: Date; endsAt: Date }>; reason: string | null } {
  if (block.endsAt <= block.startsAt) {
    return { occurrences: [], reason: "Block end time must be after its start time." };
  }
  if (!block.recurrenceRule) {
    return {
      occurrences: [{ startsAt: block.startsAt, endsAt: block.endsAt }],
      reason: null,
    };
  }

  const count = recurrenceCount(block.recurrenceRule);
  const until = recurrenceUntil(block.recurrenceRule);
  const recurrenceEndAt = block.recurrenceEndDate ?? until;
  if (!recurrenceEndAt && count === null) {
    return {
      occurrences: [],
      reason: "Recurring occupying block is not finite (no end date or valid COUNT).",
    };
  }

  const durationMs = block.endsAt.getTime() - block.startsAt.getTime();
  const intervalMatch = /(?:^|;)INTERVAL=(\d+)(?:;|$)/i.exec(
    block.recurrenceRule,
  );
  const interval = Math.max(Number(intervalMatch?.[1] ?? 1), 1);
  const countHorizon = new Date(
    block.startsAt.getTime()
      + ((count ?? 1) * interval * 7 + 7) * 86_400_000
      + durationMs,
  );
  const rangeEnd = recurrenceEndAt
    ? new Date(recurrenceEndAt.getTime() + durationMs)
    : countHorizon;

  try {
    return {
      occurrences: expandRecurrenceWindow(
        {
          startAt: block.startsAt,
          endAt: block.endsAt,
          recurrenceRule: block.recurrenceRule,
          recurrenceEndAt,
          timezone: block.timezone,
        },
        block.startsAt,
        rangeEnd,
      ).map(({ startAt, endAt }) => ({
        startsAt: startAt,
        endsAt: endAt,
      })),
      reason: null,
    };
  } catch (error) {
    return {
      occurrences: [],
      reason:
        error instanceof Error
          ? `Cannot expand recurrence: ${error.message}`
          : "Cannot expand recurrence.",
    };
  }
}

function exactlyOneOwner(
  owner: ReservationOwner,
): ReservationOwner | null {
  return [
    owner.ownerLeagueId,
    owner.ownerTeamId,
    owner.ownerVenueOrganizationId,
  ].filter(Boolean).length === 1
    ? owner
    : null;
}

function candidateSnapshot(input: ReservationMaterialization) {
  return {
    venueId: input.venueId,
    surfaceId: input.surfaceId,
    segmentId: input.segmentId,
    startsAt: input.startsAt.toISOString(),
    endsAt: input.endsAt.toISOString(),
    migrationSource: input.source,
    migrationSourceId: input.sourceId,
  };
}

function reservationMatches(
  reservation: {
    venueId: string;
    surfaceId: string | null;
    segmentId: string | null;
    startsAt: Date;
    endsAt: Date;
  },
  input: ReservationMaterialization,
): boolean {
  return (
    reservation.venueId === input.venueId
    && reservation.surfaceId === input.surfaceId
    && reservation.segmentId === input.segmentId
    && reservation.startsAt.getTime() === input.startsAt.getTime()
    && reservation.endsAt.getTime() === input.endsAt.getTime()
  );
}

async function materialize(
  tx: Prisma.TransactionClient,
  input: ReservationMaterialization,
  actorId: string,
): Promise<UnitResult> {
  if (input.endsAt <= input.startsAt) {
    return {
      created: 0,
      linkedAliases: 0,
      skippedAlreadyLinked: 0,
      preservedOverlaps: 0,
      unresolved: "End time must be after start time.",
    };
  }
  if (!exactlyOneOwner(input)) {
    return {
      created: 0,
      linkedAliases: 0,
      skippedAlreadyLinked: 0,
      preservedOverlaps: 0,
      unresolved: "Cannot derive exactly one reservation owner.",
    };
  }

  const aliasReservationIds: Array<string | null | undefined> = [];
  if (input.aliasIds.seasonGameId) {
    aliasReservationIds.push(
      (await tx.seasonGame.findUnique({
        where: { id: input.aliasIds.seasonGameId },
        select: { venueReservationId: true },
      }))?.venueReservationId,
    );
  }
  if (input.aliasIds.eventId) {
    aliasReservationIds.push(
      (await tx.event.findUnique({
        where: { id: input.aliasIds.eventId },
        select: { venueReservationId: true },
      }))?.venueReservationId,
    );
  }
  if (input.aliasIds.eventGameId) {
    aliasReservationIds.push(
      (await tx.eventGame.findUnique({
        where: { id: input.aliasIds.eventGameId },
        select: { venueReservationId: true },
      }))?.venueReservationId,
    );
  }
  if (input.aliasIds.signupEventId) {
    aliasReservationIds.push(
      (await tx.signupEvent.findUnique({
        where: { id: input.aliasIds.signupEventId },
        select: { venueReservationId: true },
      }))?.venueReservationId,
    );
  }
  if (input.aliasIds.practiceId) {
    aliasReservationIds.push(
      (await tx.practiceSession.findUnique({
        where: { id: input.aliasIds.practiceId },
        select: { venueReservationId: true },
      }))?.venueReservationId,
    );
  }

  let resolution = resolveLinkedAliasVenueReservationId(aliasReservationIds);
  if (resolution.inconsistent) {
    return {
      created: 0,
      linkedAliases: 0,
      skippedAlreadyLinked: 0,
      preservedOverlaps: 0,
      unresolved: "Aliases already point to different reservations.",
    };
  }

  if (input.sourceRequestId) {
    const requestReservation = await tx.venueReservation.findUnique({
      where: { sourceRequestId: input.sourceRequestId },
      select: {
        id: true,
        venueId: true,
        surfaceId: true,
        segmentId: true,
        startsAt: true,
        endsAt: true,
      },
    });
    if (
      requestReservation
      && resolution.venueReservationId
      && requestReservation.id !== resolution.venueReservationId
    ) {
      return {
        created: 0,
        linkedAliases: 0,
        skippedAlreadyLinked: 0,
        preservedOverlaps: 0,
        unresolved: "Request and activity aliases point to different reservations.",
      };
    }
    if (requestReservation && !reservationMatches(requestReservation, input)) {
      return {
        created: 0,
        linkedAliases: 0,
        skippedAlreadyLinked: 0,
        preservedOverlaps: 0,
        unresolved: "Existing request reservation does not match legacy occupancy.",
      };
    }
    resolution = {
      venueReservationId:
        resolution.venueReservationId ?? requestReservation?.id ?? null,
      inconsistent: false,
    };
  }

  if (input.sourceScheduleBlockId) {
    const occurrenceReservation = await tx.venueReservation.findUnique({
      where: {
        sourceScheduleBlockId_startsAt: {
          sourceScheduleBlockId: input.sourceScheduleBlockId,
          startsAt: input.startsAt,
        },
      },
      select: {
        id: true,
        venueId: true,
        surfaceId: true,
        segmentId: true,
        startsAt: true,
        endsAt: true,
      },
    });
    if (occurrenceReservation && !reservationMatches(occurrenceReservation, input)) {
      return {
        created: 0,
        linkedAliases: 0,
        skippedAlreadyLinked: 0,
        preservedOverlaps: 0,
        unresolved: "Existing block occurrence reservation does not match its source.",
      };
    }
    resolution = {
      venueReservationId:
        resolution.venueReservationId ?? occurrenceReservation?.id ?? null,
      inconsistent: false,
    };
  }

  let reservationId = resolution.venueReservationId;
  let created = 0;
  let preservedOverlaps = 0;
  if (reservationId) {
    const reservation = await tx.venueReservation.findUnique({
      where: { id: reservationId },
      select: {
        venueId: true,
        surfaceId: true,
        segmentId: true,
        startsAt: true,
        endsAt: true,
      },
    });
    if (!reservation || !reservationMatches(reservation, input)) {
      return {
        created: 0,
        linkedAliases: 0,
        skippedAlreadyLinked: 0,
        preservedOverlaps: 0,
        unresolved: "Existing alias reservation does not match legacy occupancy.",
      };
    }
  } else {
    const conflicts = await findVenueReservationConflicts(tx, input);
    const overlap = buildPreservedOverlapOverride(
      "Legacy commitments overlap during venue reservation migration",
      conflicts.map(({ id }) => id),
    );
    const reservation = await tx.venueReservation.create({
      data: {
        status: input.status,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        timezone: input.timezone,
        confirmedAt: new Date(),
        completedAt: input.status === "COMPLETED" ? input.endsAt : null,
        venueId: input.venueId,
        surfaceId: input.surfaceId,
        segmentId: input.segmentId,
        ownerLeagueId: input.ownerLeagueId,
        ownerTeamId: input.ownerTeamId,
        ownerVenueOrganizationId: input.ownerVenueOrganizationId,
        sourceRequestId: input.sourceRequestId ?? null,
        offeringBlockId: input.offeringBlockId ?? null,
        sourceScheduleBlockId: input.sourceScheduleBlockId ?? null,
        createdById: actorId,
        assignedById:
          Object.keys(input.aliasIds).length > 0 ? actorId : null,
        transitions: {
          create: {
            previousStatus: null,
            nextStatus: input.status,
            actorId,
            reason: "Legacy venue occupancy materialized",
            snapshot: candidateSnapshot(input),
          },
        },
        ...(overlap.conflictingReservationIds.length > 0
          ? {
              overrides: {
                create: {
                  actorId,
                  reason: overlap.reason,
                  candidateSnapshot: candidateSnapshot(input),
                  conflictingReservationIds:
                    overlap.conflictingReservationIds,
                },
              },
            }
          : {}),
      },
      select: { id: true },
    });
    reservationId = reservation.id;
    created = 1;
    preservedOverlaps =
      overlap.conflictingReservationIds.length > 0 ? 1 : 0;
  }

  let linkedAliases = 0;
  const link = async (
    delegate: {
      update: (args: {
        where: { id: string };
        data: { venueReservationId: string };
      }) => Promise<unknown>;
    },
    id: string | undefined,
    currentIndex: number,
  ) => {
    if (!id || aliasReservationIds[currentIndex]) return;
    await delegate.update({
      where: { id },
      data: { venueReservationId: reservationId! },
    });
    linkedAliases += 1;
  };
  let aliasIndex = 0;
  if (input.aliasIds.seasonGameId) {
    await link(tx.seasonGame, input.aliasIds.seasonGameId, aliasIndex++);
  }
  if (input.aliasIds.eventId) {
    await link(tx.event, input.aliasIds.eventId, aliasIndex++);
  }
  if (input.aliasIds.eventGameId) {
    await link(tx.eventGame, input.aliasIds.eventGameId, aliasIndex++);
  }
  if (input.aliasIds.signupEventId) {
    await link(tx.signupEvent, input.aliasIds.signupEventId, aliasIndex++);
  }
  if (input.aliasIds.practiceId) {
    await link(tx.practiceSession, input.aliasIds.practiceId, aliasIndex++);
  }

  return {
    created,
    linkedAliases,
    skippedAlreadyLinked: created === 0 && linkedAliases === 0 ? 1 : 0,
    preservedOverlaps,
  };
}

async function inUnitTransaction(
  client: PrismaClient,
  work: (tx: Prisma.TransactionClient) => Promise<UnitResult>,
): Promise<UnitResult> {
  return withVenueReservationSerializableRetry(() =>
    client.$transaction(work, venueReservationTransactionOptions));
}

const emptyResult = (): UnitResult => ({
  created: 0,
  linkedAliases: 0,
  skippedAlreadyLinked: 0,
  preservedOverlaps: 0,
});

/**
 * Materializes legacy venue occupancy one logical unit per serializable
 * transaction. The default dry-run performs only candidate reads.
 */
export async function backfillVenueReservations(
  options: VenueReservationBackfillOptions,
  client: PrismaClient = prisma,
): Promise<VenueReservationBackfillReport> {
  const dryRun = options.dryRun ?? true;
  const batchSize = Math.min(Math.max(options.batchSize ?? 500, 1), 2_000);
  const [seasonGames, events, eventGames, practices, requests, blocks] =
    await Promise.all([
      client.seasonGame.findMany({
        where: {
          venueId: { not: null },
          status: { in: ["SCHEDULED", "COMPLETED"] },
          OR: [
            { venueReservationId: null },
            { event: { venueReservationId: null } },
          ],
        },
        select: { id: true },
        take: batchSize,
      }),
      client.event.findMany({
        where: {
          venueId: { not: null },
          endAt: { not: null },
          seasonGame: null,
          venueReservationId: null,
        },
        select: { id: true },
        take: batchSize,
      }),
      client.eventGame.findMany({
        where: {
          status: { not: "CANCELED" },
          event: { venueId: { not: null }, status: "PUBLISHED" },
          venueReservationId: null,
        },
        select: { id: true },
        take: batchSize,
      }),
      client.practiceSession.findMany({
        where: {
          venueId: { not: null },
          startAt: { not: null },
          venueReservationId: null,
        },
        select: { id: true },
        take: batchSize,
      }),
      client.iceTimeRequest.findMany({
        where: {
          status: { in: ["ACCEPTED", "PARTIALLY_ACCEPTED"] },
          venueReservation: null,
        },
        select: { id: true },
        take: batchSize,
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
          venue: { select: { timezone: true } },
          reservationOccurrences: {
            select: {
              startsAt: true,
              endsAt: true,
              status: true,
              heldUntil: true,
              venueId: true,
              surfaceId: true,
              segmentId: true,
            },
          },
        },
      }),
    ]);

  const blockCandidates = blocks.flatMap((block) => {
    const expansion = expandFiniteVenueBlockOccurrences({
      ...block,
      timezone: block.venue.timezone,
    });
    if (expansion.reason) return [];
    return expansion.occurrences
      .filter(
        (occurrence) =>
          !block.reservationOccurrences.some(
            (reservation) =>
              reservation.startsAt.getTime() === occurrence.startsAt.getTime()
              && reservation.endsAt.getTime() === occurrence.endsAt.getTime()
              && reservation.venueId === block.venueId
              && reservation.surfaceId === block.surfaceId
              && reservation.segmentId === block.segmentId,
          ),
      )
      .map((occurrence) => ({ blockId: block.id, ...occurrence }));
  }).slice(0, batchSize);
  const candidates =
    seasonGames.length
    + events.length
    + eventGames.length
    + practices.length
    + requests.length
    + blockCandidates.length;
  const report: VenueReservationBackfillReport = {
    dryRun,
    scanned: candidates,
    candidates,
    created: 0,
    linkedAliases: 0,
    skippedAlreadyLinked: 0,
    preservedOverlaps: 0,
    unresolved: blocks.flatMap((block) => {
      const reason = expandFiniteVenueBlockOccurrences({
        ...block,
        timezone: block.venue.timezone,
      }).reason;
      return reason
        ? [{ source: "VENUE_BLOCK" as const, sourceId: block.id, reason }]
        : [];
    }),
  };
  if (dryRun) return report;

  const applyResult = (
    source: VenueReservationBackfillSource,
    sourceId: string,
    result: UnitResult,
  ) => {
    report.created += result.created;
    report.linkedAliases += result.linkedAliases;
    report.skippedAlreadyLinked += result.skippedAlreadyLinked;
    report.preservedOverlaps += result.preservedOverlaps;
    if (result.unresolved) {
      report.unresolved.push({ source, sourceId, reason: result.unresolved });
    }
  };
  const run = async (
    source: VenueReservationBackfillSource,
    sourceId: string,
    load: (tx: Prisma.TransactionClient) => Promise<ReservationMaterialization | string | null>,
  ) => {
    try {
      const result = await inUnitTransaction(client, async (tx) => {
        const loaded = await load(tx);
        if (loaded === null) {
          return { ...emptyResult(), skippedAlreadyLinked: 1 };
        }
        if (typeof loaded === "string") {
          return { ...emptyResult(), unresolved: loaded };
        }
        return materialize(tx, loaded, options.systemActorId);
      });
      applyResult(source, sourceId, result);
    } catch (error) {
      applyResult(source, sourceId, {
        ...emptyResult(),
        unresolved:
          error instanceof Error ? error.message : "Transactional materialization failed.",
      });
    }
  };

  for (const { id } of seasonGames) {
    await run("SEASON_GAME", id, async (tx) => {
      const game = await tx.seasonGame.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          startAt: true,
          endAt: true,
          timezone: true,
          venueId: true,
          surfaceId: true,
          segmentId: true,
          venueReservationId: true,
          eventId: true,
          event: {
            select: {
              id: true,
              venueId: true,
              startAt: true,
              endAt: true,
              venueReservationId: true,
            },
          },
          season: { select: { leagueId: true, teamId: true } },
          homeTeamId: true,
        },
      });
      if (!game || !game.venueId || game.status === "CANCELED") return null;
      if (
        game.event
        && (
          game.event.venueId !== game.venueId
          || game.event.startAt.getTime() !== game.startAt.getTime()
          || game.event.endAt?.getTime() !== game.endAt.getTime()
        )
      ) {
        return "Linked Event does not match the season game interval and venue.";
      }
      return {
        source: "SEASON_GAME",
        sourceId: game.id,
        venueId: game.venueId,
        surfaceId: game.surfaceId,
        segmentId: game.segmentId,
        startsAt: game.startAt,
        endsAt: game.endAt,
        timezone: game.timezone,
        status: game.status === "COMPLETED" ? "COMPLETED" : "CONFIRMED",
        ownerLeagueId: game.season.leagueId,
        ownerTeamId: game.season.leagueId
          ? null
          : game.season.teamId ?? game.homeTeamId,
        ownerVenueOrganizationId: null,
        aliasIds: {
          seasonGameId: game.id,
          ...(game.eventId ? { eventId: game.eventId } : {}),
        },
      };
    });
  }

  for (const { id } of practices) {
    await run("PRACTICE", id, async (tx) => {
      const practice = await tx.practiceSession.findUnique({
        where: { id },
        select: {
          id: true,
          duration: true,
          teamId: true,
          venueId: true,
          surfaceId: true,
          segmentId: true,
          startAt: true,
          venueReservationId: true,
          venue: { select: { timezone: true } },
        },
      });
      if (!practice?.venueId || !practice.startAt) return null;
      const endsAt = new Date(
        practice.startAt.getTime() + practice.duration * 60_000,
      );
      const aliases = await tx.event.findMany({
        where: {
          type: "PRACTICE",
          teamId: practice.teamId,
          venueId: practice.venueId,
          startAt: practice.startAt,
          endAt: endsAt,
        },
        select: { id: true, venueReservationId: true },
        take: 2,
      });
      if (aliases.length > 1) {
        return "Multiple Events match this practice; alias identity is ambiguous.";
      }
      return {
        source: "PRACTICE",
        sourceId: practice.id,
        venueId: practice.venueId,
        surfaceId: practice.surfaceId,
        segmentId: practice.segmentId,
        startsAt: practice.startAt,
        endsAt,
        timezone: practice.venue?.timezone ?? "America/New_York",
        status: "CONFIRMED",
        ownerLeagueId: null,
        ownerTeamId: practice.teamId,
        ownerVenueOrganizationId: null,
        aliasIds: {
          practiceId: practice.id,
          ...(aliases[0] ? { eventId: aliases[0].id } : {}),
        },
      };
    });
  }

  for (const { id } of eventGames) {
    await run("EVENT_GAME", id, async (tx) => {
      const game = await tx.eventGame.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          startAt: true,
          endAt: true,
          surfaceId: true,
          segmentId: true,
          venueReservationId: true,
          event: {
            select: {
              id: true,
              status: true,
              startAt: true,
              endAt: true,
              timezone: true,
              venueId: true,
              venueReservationId: true,
              hostOrganizationId: true,
              hostLeagueId: true,
              hostTeamId: true,
              games: {
                where: { status: { not: "CANCELED" } },
                select: { id: true },
                take: 2,
              },
            },
          },
        },
      });
      if (
        !game
        || game.status === "CANCELED"
        || game.event.status !== "PUBLISHED"
        || !game.event.venueId
      ) {
        return null;
      }
      const singleSessionAlias =
        game.event.games.length === 1
        && game.event.games[0].id === game.id
        && game.event.startAt.getTime() === game.startAt.getTime()
        && game.event.endAt.getTime() === game.endAt.getTime();
      return {
        source: "EVENT_GAME",
        sourceId: game.id,
        venueId: game.event.venueId,
        surfaceId: game.surfaceId,
        segmentId: game.segmentId,
        startsAt: game.startAt,
        endsAt: game.endAt,
        timezone: game.event.timezone,
        status: game.status === "COMPLETED" ? "COMPLETED" : "CONFIRMED",
        ownerLeagueId: game.event.hostLeagueId,
        ownerTeamId: game.event.hostTeamId,
        ownerVenueOrganizationId: game.event.hostOrganizationId,
        aliasIds: {
          eventGameId: game.id,
          ...(singleSessionAlias ? { signupEventId: game.event.id } : {}),
        },
      };
    });
  }

  for (const { id } of events) {
    await run("EVENT", id, async (tx) => {
      const event = await tx.event.findUnique({
        where: { id },
        select: {
          id: true,
          type: true,
          teamId: true,
          startAt: true,
          endAt: true,
          venueId: true,
          venueReservationId: true,
          venue: { select: { timezone: true } },
          seasonGame: { select: { id: true } },
        },
      });
      if (
        !event?.venueId
        || !event.endAt
        || event.seasonGame
        || event.venueReservationId
      ) {
        return null;
      }
      let practice:
        | {
            id: string;
            surfaceId: string | null;
            segmentId: string | null;
            venueReservationId: string | null;
          }
        | undefined;
      if (event.type === "PRACTICE") {
        const duration = Math.round(
          (event.endAt.getTime() - event.startAt.getTime()) / 60_000,
        );
        const matches = await tx.practiceSession.findMany({
          where: {
            teamId: event.teamId,
            venueId: event.venueId,
            startAt: event.startAt,
            duration,
          },
          select: {
            id: true,
            surfaceId: true,
            segmentId: true,
            venueReservationId: true,
          },
          take: 2,
        });
        if (matches.length > 1) {
          return "Multiple practices match this Event; alias identity is ambiguous.";
        }
        practice = matches[0];
      }
      return {
        source: "EVENT",
        sourceId: event.id,
        venueId: event.venueId,
        surfaceId: practice?.surfaceId ?? null,
        segmentId: practice?.segmentId ?? null,
        startsAt: event.startAt,
        endsAt: event.endAt,
        timezone: event.venue?.timezone ?? "America/New_York",
        status: "CONFIRMED",
        ownerLeagueId: null,
        ownerTeamId: event.teamId,
        ownerVenueOrganizationId: null,
        aliasIds: {
          eventId: event.id,
          ...(practice ? { practiceId: practice.id } : {}),
        },
      };
    });
  }

  for (const { id } of requests) {
    await run("ICE_REQUEST", id, async (tx) => {
      const request = await tx.iceTimeRequest.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          requestedStartAt: true,
          requestedEndAt: true,
          approvedStartAt: true,
          approvedEndAt: true,
          approvedSurfaceId: true,
          approvedSegmentId: true,
          requesterTeamId: true,
          requesterLeagueId: true,
          venueId: true,
          venue: { select: { timezone: true, organizationId: true } },
          venueReservation: { select: { id: true } },
          scheduleBlockId: true,
        },
      });
      if (
        !request
        || !["ACCEPTED", "PARTIALLY_ACCEPTED"].includes(request.status)
      ) {
        return null;
      }
      return {
        source: "ICE_REQUEST",
        sourceId: request.id,
        venueId: request.venueId,
        surfaceId: request.approvedSurfaceId,
        segmentId: request.approvedSegmentId,
        startsAt: request.approvedStartAt ?? request.requestedStartAt,
        endsAt: request.approvedEndAt ?? request.requestedEndAt,
        timezone: request.venue.timezone,
        status: "CONFIRMED",
        ownerLeagueId: request.requesterTeamId
          ? null
          : request.requesterLeagueId,
        ownerTeamId: request.requesterTeamId,
        ownerVenueOrganizationId:
          request.requesterTeamId || request.requesterLeagueId
            ? null
            : request.venue.organizationId,
        sourceRequestId: request.id,
        offeringBlockId: request.scheduleBlockId,
        aliasIds: {},
      };
    });
  }

  for (const candidate of blockCandidates) {
    await run("VENUE_BLOCK", candidate.blockId, async (tx) => {
      const block = await tx.venueScheduleBlock.findUnique({
        where: { id: candidate.blockId },
        select: {
          id: true,
          status: true,
          intent: true,
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
        },
      });
      if (
        !block
        || block.status !== "PUBLISHED"
        || !["VENUE_ACTIVITY", "CLOSURE"].includes(block.intent)
      ) {
        return null;
      }
      const refreshedExpansion = expandFiniteVenueBlockOccurrences({
        ...block,
        timezone: block.venue.timezone,
      });
      if (
        refreshedExpansion.reason
        || !refreshedExpansion.occurrences.some(
          (occurrence) =>
            occurrence.startsAt.getTime() === candidate.startsAt.getTime()
            && occurrence.endsAt.getTime() === candidate.endsAt.getTime(),
        )
      ) {
        // The scan is only a candidate snapshot. A concurrent edit may move,
        // shorten, unpublish, or invalidate the recurrence before this
        // serializable transaction begins. Never materialize that stale slot.
        return null;
      }
      return {
        source: "VENUE_BLOCK",
        sourceId: block.id,
        venueId: block.venueId,
        surfaceId: block.surfaceId,
        segmentId: block.segmentId,
        startsAt: candidate.startsAt,
        endsAt: candidate.endsAt,
        timezone: block.venue.timezone,
        status: "CONFIRMED",
        ownerLeagueId: block.venue.organizationId
          ? null
          : block.venue.leagueId,
        ownerTeamId:
          block.venue.organizationId || block.venue.leagueId
            ? null
            : block.venue.teamId,
        ownerVenueOrganizationId: block.venue.organizationId,
        sourceScheduleBlockId: block.id,
        aliasIds: {},
      };
    });
  }

  return report;
}

async function main(): Promise<void> {
  const dryRun = !process.argv.includes("--write");
  const actorArg = process.argv.find((arg) => arg.startsWith("--actor="));
  const systemActorId = actorArg?.slice("--actor=".length);
  if (!systemActorId) {
    throw new Error("--actor=<user-id> is required");
  }
  const report = await backfillVenueReservations({ dryRun, systemActorId });
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.main) {
  main()
    .catch((error) => {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError
        || error instanceof Error
      ) {
        console.error(error.message);
      }
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

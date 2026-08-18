import type { Prisma } from "@prisma/client";
import { expandRecurrenceWindow } from "@/lib/utils/venue-schedule";
import { findUnlinkedLegacyBookingConflicts } from "@/lib/utils/availability";
import type { BookingConflictSource } from "@/types/segments";

const OCCUPYING_STATUSES = ["HELD", "CONFIRMED", "COMPLETED"] as const;

export type VenueReservationAvailabilityCandidate = {
  venueId: string;
  surfaceId?: string | null;
  segmentId?: string | null;
  startsAt: Date;
  endsAt: Date;
  now?: Date;
  excludeReservationId?: string;
  excludeReservationIds?: readonly string[];
};

export type VenueReservationConflict = {
  id: string;
  source?: BookingConflictSource | "iceTimeRequest";
  title?: string;
  status?: "HELD" | "CONFIRMED" | "COMPLETED";
  startsAt: Date;
  endsAt: Date;
  timezone?: string;
  venueId: string;
  surfaceId: string | null;
  segmentId: string | null;
  ownerLeagueId?: string | null;
  ownerTeamId?: string | null;
  ownerVenueOrganizationId?: string | null;
  sourceRequestId?: string | null;
};

type ReservationRow = VenueReservationConflict & {
  status: "HELD" | "CONFIRMED" | "COMPLETED";
  timezone: string;
  ownerLeagueId: string | null;
  ownerTeamId: string | null;
  ownerVenueOrganizationId: string | null;
  sourceRequestId: string | null;
};

function pairKey(a: string, b: string): string {
  return a < b ? `${a}\0${b}` : `${b}\0${a}`;
}

type VenueReservationWriteCandidate = VenueReservationAvailabilityCandidate & {
  excludeEventId?: string;
  excludeSeasonGameId?: string;
  excludeEventGameId?: string;
  excludeBlockId?: string;
  excludePracticeId?: string;
  excludeRequestId?: string;
};

/**
 * Complete dual-read conflict boundary for canonical writes. All queries use
 * the caller's TransactionClient, so canonical reservations, unlinked legacy
 * activities, occupying schedule-block occurrences, practices, and accepted
 * legacy requests are observed in the same serializable transaction.
 */
export async function findVenueReservationWriteConflicts(
  tx: Prisma.TransactionClient,
  candidate: VenueReservationWriteCandidate,
): Promise<VenueReservationConflict[]> {
  const [canonical, legacyBookings, legacyRequests] = await Promise.all([
    findVenueReservationConflicts(tx, candidate),
    findUnlinkedLegacyBookingConflicts({
      venueId: candidate.venueId,
      surfaceId: candidate.surfaceId,
      segmentId: candidate.segmentId,
      startAt: candidate.startsAt,
      endAt: candidate.endsAt,
      excludeEventId: candidate.excludeEventId,
      excludeSeasonGameId: candidate.excludeSeasonGameId,
      excludeEventGameId: candidate.excludeEventGameId,
      excludeBlockId: candidate.excludeBlockId,
      excludePracticeId: candidate.excludePracticeId,
      excludeReservationIds: candidate.excludeReservationIds
        ?? (candidate.excludeReservationId ? [candidate.excludeReservationId] : undefined),
    }, tx),
    findLegacyAcceptedRequestConflicts(tx, {
      ...candidate,
      excludeRequestId: candidate.excludeRequestId,
    }),
  ]);

  return [
    ...canonical.map((conflict) => ({
      ...conflict,
      source: "venueReservation" as const,
      title: "Reserved venue time",
    })),
    ...legacyBookings.map((conflict, index) => ({
      id: `legacy:${conflict.source}:${index}:${conflict.startAt.toISOString()}`,
      source: conflict.source,
      title: conflict.title,
      status: "CONFIRMED" as const,
      startsAt: conflict.startAt,
      endsAt: conflict.endAt ?? conflict.startAt,
      venueId: candidate.venueId,
      surfaceId: conflict.surfaceId,
      segmentId: conflict.segmentId,
    })),
    ...legacyRequests.map((conflict) => ({
      id: conflict.id,
      source: "iceTimeRequest" as const,
      title: "Accepted ice-time request",
      status: "CONFIRMED" as const,
      startsAt: candidate.startsAt,
      endsAt: candidate.endsAt,
      venueId: candidate.venueId,
      surfaceId: candidate.surfaceId ?? null,
      segmentId: candidate.segmentId ?? null,
    })),
  ];
}

export function venueReservationScopesConflict(
  candidateSurfaceId: string | null,
  candidateSegmentId: string | null,
  existing: { surfaceId: string | null; segmentId: string | null },
  coexistence: Set<string>,
): boolean {
  if (candidateSurfaceId === null || existing.surfaceId === null) return true;
  if (candidateSurfaceId !== existing.surfaceId) return false;
  if (candidateSegmentId === null || existing.segmentId === null) return true;
  if (candidateSegmentId === existing.segmentId) return true;
  return !coexistence.has(pairKey(candidateSegmentId, existing.segmentId));
}

export function approvedSpaceWithinRequestedSpace(
  requested: { surfaceId: string | null; segmentId: string | null },
  approved: { surfaceId: string | null; segmentId: string | null },
): boolean {
  if (requested.surfaceId === null) return true;
  if (approved.surfaceId !== requested.surfaceId) return false;
  if (requested.segmentId === null) return true;
  return approved.segmentId === requested.segmentId;
}

async function loadCoexistence(
  tx: Prisma.TransactionClient,
  surfaceId: string,
): Promise<Set<string>> {
  const pairs = await tx.segmentCoexistence.findMany({
    where: {
      OR: [
        { segmentA: { surfaceId } },
        { segmentB: { surfaceId } },
      ],
    },
    select: { segmentAId: true, segmentBId: true },
  });
  return new Set(
    pairs.map(({ segmentAId, segmentBId }) => pairKey(segmentAId, segmentBId)),
  );
}

export async function findVenueReservationConflicts(
  tx: Prisma.TransactionClient,
  candidate: VenueReservationAvailabilityCandidate,
): Promise<VenueReservationConflict[]> {
  if (candidate.endsAt <= candidate.startsAt) {
    throw new Error("Venue reservation end time must be after its start time");
  }

  const surfaceId = candidate.surfaceId ?? null;
  const segmentId = surfaceId ? candidate.segmentId ?? null : null;
  const now = candidate.now ?? new Date();

  const rows = await tx.venueReservation.findMany({
    where: {
      venueId: candidate.venueId,
      ...(candidate.excludeReservationIds?.length
        ? { id: { notIn: [...candidate.excludeReservationIds] } }
        : candidate.excludeReservationId
          ? { id: { not: candidate.excludeReservationId } }
        : {}),
      startsAt: { lt: candidate.endsAt },
      endsAt: { gt: candidate.startsAt },
      status: { in: [...OCCUPYING_STATUSES] },
      AND: [
        {
          OR: [
            { status: { not: "HELD" } },
            { heldUntil: { gt: now } },
          ],
        },
        ...(surfaceId
          ? [{ OR: [{ surfaceId }, { surfaceId: null }] }]
          : []),
      ],
    },
    select: {
      id: true,
      status: true,
      startsAt: true,
      endsAt: true,
      timezone: true,
      venueId: true,
      surfaceId: true,
      segmentId: true,
      ownerLeagueId: true,
      ownerTeamId: true,
      ownerVenueOrganizationId: true,
      sourceRequestId: true,
    },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
  });

  const coexistence =
    surfaceId && segmentId
      ? await loadCoexistence(tx, surfaceId)
      : new Set<string>();

  return (rows as ReservationRow[])
    .filter((row) =>
      venueReservationScopesConflict(surfaceId, segmentId, row, coexistence)
    )
    .map((row) => row);
}

export async function findLegacyAcceptedRequestConflicts(
  tx: Prisma.TransactionClient,
  candidate: VenueReservationAvailabilityCandidate & {
    excludeRequestId?: string;
  },
): Promise<Array<{ id: string }>> {
  const surfaceId = candidate.surfaceId ?? null;
  const segmentId = surfaceId ? candidate.segmentId ?? null : null;
  const rows = await tx.iceTimeRequest.findMany({
    where: {
      id: candidate.excludeRequestId
        ? { not: candidate.excludeRequestId }
        : undefined,
      venueId: candidate.venueId,
      status: { in: ["ACCEPTED", "PARTIALLY_ACCEPTED"] },
      venueReservation: null,
      requestedStartAt: { lt: candidate.endsAt },
      requestedEndAt: { gt: candidate.startsAt },
    },
    select: {
      id: true,
      requestedStartAt: true,
      requestedEndAt: true,
      approvedStartAt: true,
      approvedEndAt: true,
      approvedSurfaceId: true,
      approvedSegmentId: true,
      scheduleBlock: {
        select: { surfaceId: true, segmentId: true },
      },
    },
  });
  const coexistence =
    surfaceId && segmentId
      ? await loadCoexistence(tx, surfaceId)
      : new Set<string>();

  return rows.filter((row) => {
    const hasApprovalSnapshot =
      row.approvedStartAt !== null && row.approvedEndAt !== null;
    const startsAt = row.approvedStartAt ?? row.requestedStartAt;
    const endsAt = row.approvedEndAt ?? row.requestedEndAt;
    const legacySurfaceId = hasApprovalSnapshot
      ? row.approvedSurfaceId
      : row.scheduleBlock.surfaceId;
    const legacySegmentId = hasApprovalSnapshot
      ? row.approvedSegmentId
      : row.scheduleBlock.segmentId;
    return startsAt < candidate.endsAt
      && endsAt > candidate.startsAt
      && venueReservationScopesConflict(
        surfaceId,
        segmentId,
        {
          surfaceId: legacySurfaceId,
          segmentId: legacySegmentId,
        },
        coexistence,
      );
  }).map(({ id }) => ({ id }));
}

export type VenueReservationOffering = {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  surfaceId: string | null;
  segmentId: string | null;
};

export type VenueReservationAvailabilitySlice = {
  startsAt: Date;
  endsAt: Date;
};

export type VenueReservationOfferingOccurrence = VenueReservationOffering & {
  offeringBlockId?: string;
  surfaceName?: string | null;
};

export type VenueReservationOfferingWithAvailability =
  VenueReservationOfferingOccurrence & {
    occupancy: VenueReservationAvailabilitySlice[];
    remainingSlices: VenueReservationAvailabilitySlice[];
  };

export type PublicVenueReservationOfferingAvailability =
  VenueReservationOfferingOccurrence & {
    remainingSlices: VenueReservationAvailabilitySlice[];
  };

/**
 * Subtract canonical, scope-compatible occupancy from one concrete offering
 * occurrence. Intervals are clipped to the offering and merged before
 * subtraction so overlapping reservations cannot create duplicate or negative
 * slices.
 */
export function subtractVenueReservationOccupancy(
  offering: Pick<VenueReservationOfferingOccurrence, "startsAt" | "endsAt">,
  occupancy: Array<Pick<VenueReservationConflict, "startsAt" | "endsAt">>,
): {
  occupancy: VenueReservationAvailabilitySlice[];
  remainingSlices: VenueReservationAvailabilitySlice[];
} {
  const start = offering.startsAt.getTime();
  const end = offering.endsAt.getTime();
  const clipped = occupancy
    .map((item) => ({
      startsAt: new Date(Math.max(start, item.startsAt.getTime())),
      endsAt: new Date(Math.min(end, item.endsAt.getTime())),
    }))
    .filter((item) => item.startsAt < item.endsAt)
    .sort(
      (left, right) =>
        left.startsAt.getTime() - right.startsAt.getTime()
        || left.endsAt.getTime() - right.endsAt.getTime(),
    );

  const merged: VenueReservationAvailabilitySlice[] = [];
  for (const item of clipped) {
    const previous = merged.at(-1);
    if (previous && item.startsAt <= previous.endsAt) {
      if (item.endsAt > previous.endsAt) previous.endsAt = item.endsAt;
      continue;
    }
    merged.push({ ...item });
  }

  const remainingSlices: VenueReservationAvailabilitySlice[] = [];
  let cursor = start;
  for (const item of merged) {
    if (cursor < item.startsAt.getTime()) {
      remainingSlices.push({
        startsAt: new Date(cursor),
        endsAt: item.startsAt,
      });
    }
    cursor = Math.max(cursor, item.endsAt.getTime());
  }
  if (cursor < end) {
    remainingSlices.push({ startsAt: new Date(cursor), endsAt: new Date(end) });
  }

  return { occupancy: merged, remainingSlices };
}

/**
 * Resolve concrete requestable offering occurrences against canonical
 * reservation occupancy. Conflict lookup applies venue-wide, whole-surface,
 * segment, and coexistence rules before interval subtraction. Public mode
 * returns remaining slices only; authenticated staff mode also returns the
 * merged occupancy intervals needed for venue operations.
 */
export async function populateVenueOfferingAvailability(
  tx: Prisma.TransactionClient,
  input: {
    venueId: string;
    offerings: VenueReservationOfferingOccurrence[];
    now?: Date;
    mode: "PUBLIC";
  },
): Promise<PublicVenueReservationOfferingAvailability[]>;
export async function populateVenueOfferingAvailability(
  tx: Prisma.TransactionClient,
  input: {
    venueId: string;
    offerings: VenueReservationOfferingOccurrence[];
    now?: Date;
    mode: "STAFF";
  },
): Promise<VenueReservationOfferingWithAvailability[]>;
export async function populateVenueOfferingAvailability(
  tx: Prisma.TransactionClient,
  input: {
    venueId: string;
    offerings: VenueReservationOfferingOccurrence[];
    now?: Date;
    mode: "PUBLIC" | "STAFF";
  },
): Promise<
  Array<
    | VenueReservationOfferingWithAvailability
    | PublicVenueReservationOfferingAvailability
  >
> {
  return Promise.all(
    input.offerings.map(async (offering) => {
      const conflicts = await findVenueReservationConflicts(tx, {
        venueId: input.venueId,
        surfaceId: offering.surfaceId,
        segmentId: offering.segmentId,
        startsAt: offering.startsAt,
        endsAt: offering.endsAt,
        now: input.now,
      });
      const availability = subtractVenueReservationOccupancy(offering, conflicts);
      return {
        ...offering,
        ...(input.mode === "STAFF"
          ? availability
          : { remainingSlices: availability.remainingSlices }),
      };
    }),
  );
}

export async function findVenueReservationAvailability(
  tx: Prisma.TransactionClient,
  input: VenueReservationAvailabilityCandidate & {
    includeOfferings?: boolean;
    offeringAccess?: "PUBLIC" | "STAFF";
  },
): Promise<{
  offerings: VenueReservationOffering[];
  occupancy: VenueReservationConflict[];
  conflicts: VenueReservationConflict[];
}> {
  const occupancy = await findVenueReservationConflicts(tx, input);
  const offeringBlocks = input.includeOfferings
    ? await tx.venueScheduleBlock.findMany({
        where: {
          venueId: input.venueId,
          intent: "OFFERING",
          status: "PUBLISHED",
          ...(input.offeringAccess === "PUBLIC"
            ? { audience: "PUBLIC", visibility: "PUBLIC" }
            : {}),
          startsAt: { lt: input.endsAt },
          AND: [
            {
              OR: [
                {
                  recurrenceRule: null,
                  endsAt: { gt: input.startsAt },
                },
                { recurrenceRule: { not: null } },
              ],
            },
          ],
          ...(input.surfaceId
            ? { OR: [{ surfaceId: input.surfaceId }, { surfaceId: null }] }
            : {}),
        },
        select: {
          id: true,
          title: true,
          startsAt: true,
          endsAt: true,
          surfaceId: true,
          segmentId: true,
          recurrenceRule: true,
          recurrenceEndDate: true,
          venue: { select: { timezone: true } },
        },
        orderBy: { startsAt: "asc" },
      })
    : [];
  const offerings = offeringBlocks
    .flatMap((block) => {
      if (!block.recurrenceRule) return [block];
      return expandRecurrenceWindow(
        {
          startAt: block.startsAt,
          endAt: block.endsAt,
          recurrenceRule: block.recurrenceRule,
          recurrenceEndAt: block.recurrenceEndDate,
          timezone: block.venue.timezone,
        },
        input.startsAt,
        input.endsAt,
      ).map((occurrence) => ({
        id: block.id,
        title: block.title,
        startsAt: occurrence.startAt,
        endsAt: occurrence.endAt,
        surfaceId: block.surfaceId,
        segmentId: block.segmentId,
      }));
    })
    .sort(
      (left, right) =>
        left.startsAt.getTime() - right.startsAt.getTime() ||
        left.id.localeCompare(right.id),
    );

  return { offerings, occupancy, conflicts: occupancy };
}

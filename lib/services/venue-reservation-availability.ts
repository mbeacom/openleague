import type { Prisma } from "@prisma/client";
import { expandRecurrenceWindow } from "@/lib/utils/venue-schedule";

const OCCUPYING_STATUSES = ["HELD", "CONFIRMED", "COMPLETED"] as const;

export type VenueReservationAvailabilityCandidate = {
  venueId: string;
  surfaceId?: string | null;
  segmentId?: string | null;
  startsAt: Date;
  endsAt: Date;
  now?: Date;
  excludeReservationId?: string;
  publicView?: boolean;
};

export type VenueReservationConflict = {
  id: string;
  status: "HELD" | "CONFIRMED" | "COMPLETED";
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  venueId: string;
  surfaceId: string | null;
  segmentId: string | null;
  ownerLeagueId?: string | null;
  ownerTeamId?: string | null;
  ownerVenueOrganizationId?: string | null;
  sourceRequestId?: string | null;
};

type ReservationRow = VenueReservationConflict & {
  ownerLeagueId: string | null;
  ownerTeamId: string | null;
  ownerVenueOrganizationId: string | null;
  sourceRequestId: string | null;
};

function pairKey(a: string, b: string): string {
  return a < b ? `${a}\0${b}` : `${b}\0${a}`;
}

function scopesConflict(
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
      ...(candidate.excludeReservationId
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
    .filter((row) => scopesConflict(surfaceId, segmentId, row, coexistence))
    .map((row) => {
      if (!candidate.publicView) return row;
      return {
        id: row.id,
        status: row.status,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        timezone: row.timezone,
        venueId: row.venueId,
        surfaceId: row.surfaceId,
        segmentId: row.segmentId,
      };
    });
}

export type VenueReservationOffering = {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  surfaceId: string | null;
  segmentId: string | null;
};

export async function findVenueReservationAvailability(
  tx: Prisma.TransactionClient,
  input: VenueReservationAvailabilityCandidate & { includeOfferings?: boolean },
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

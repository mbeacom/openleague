import { prisma } from "@/lib/db/prisma";

export type GameConflictCandidate = {
  venueId: string;
  surfaceId?: string | null;
  startAt: Date;
  endAt: Date;
  excludeSeasonGameId?: string;
  excludeEventId?: string;
};

export type GameConflict = {
  source: "event" | "seasonGame" | "scheduleBlock";
  title: string;
  startAt: Date;
  endAt: Date | null;
  surfaceId: string | null;
};

/**
 * Find existing bookings that overlap a candidate game slot at a venue (FR-012).
 *
 * Checks three sources: calendar Events at the venue, other SeasonGames
 * (SCHEDULED or COMPLETED — drafts and canceled games hold no ice), and
 * PUBLISHED VenueScheduleBlocks.
 *
 * Overlap: existing.startAt < candidate.endAt AND existing.end > candidate.startAt,
 * so intervals that merely touch do not conflict. Events with no endAt are
 * treated as point-in-time (mirroring findVenueConflicts): they conflict when
 * their startAt falls within the candidate range.
 *
 * Surface rule: a SeasonGame or VenueScheduleBlock conflicts only when the
 * candidate or the existing row is venue-wide (no surfaceId) or both are on
 * the same surface — bookings on different surfaces of the same venue do not
 * conflict. Calendar Events have no surface and are always venue-wide.
 *
 * Results are warnings, not hard blocks: saving over a conflict requires an
 * explicit recorded override (SeasonGame.conflictOverriddenBy/At).
 */
export async function findGameConflicts(
  candidate: GameConflictCandidate
): Promise<GameConflict[]> {
  const { venueId, surfaceId, startAt, endAt, excludeSeasonGameId, excludeEventId } =
    candidate;

  // A surface-specific candidate conflicts with rows on the same surface and
  // with venue-wide rows; a venue-wide candidate conflicts with every surface.
  const surfaceFilter = surfaceId
    ? { OR: [{ surfaceId }, { surfaceId: null }] }
    : {};

  const [events, seasonGames, scheduleBlocks] = await Promise.all([
    prisma.event.findMany({
      where: {
        venueId,
        ...(excludeEventId ? { id: { not: excludeEventId } } : {}),
        // Overlap check: existing start is before candidate end, AND existing end is after candidate start
        AND: [
          {
            OR: [
              // Existing event has endAt: standard overlap check
              {
                endAt: { not: null },
                startAt: { lt: endAt },
              },
              // Existing event has no endAt: treat as point-in-time, conflict if within our range
              {
                endAt: null,
                startAt: { gte: startAt, lt: endAt },
              },
            ],
          },
          {
            OR: [
              { endAt: { gt: startAt } },
              { endAt: null, startAt: { gte: startAt } },
            ],
          },
        ],
      },
      select: {
        title: true,
        startAt: true,
        endAt: true,
      },
    }),
    prisma.seasonGame.findMany({
      where: {
        venueId,
        status: { in: ["SCHEDULED", "COMPLETED"] },
        ...(excludeSeasonGameId ? { id: { not: excludeSeasonGameId } } : {}),
        ...surfaceFilter,
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
      select: {
        startAt: true,
        endAt: true,
        surfaceId: true,
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
      },
    }),
    prisma.venueScheduleBlock.findMany({
      where: {
        venueId,
        status: "PUBLISHED",
        ...surfaceFilter,
        startsAt: { lt: endAt },
        endsAt: { gt: startAt },
      },
      select: {
        title: true,
        startsAt: true,
        endsAt: true,
        surfaceId: true,
      },
    }),
  ]);

  const conflicts: GameConflict[] = [
    ...events.map((event) => ({
      source: "event" as const,
      title: event.title,
      startAt: event.startAt,
      endAt: event.endAt,
      surfaceId: null,
    })),
    ...seasonGames.map((game) => ({
      source: "seasonGame" as const,
      title: `${game.homeTeam.name} vs ${game.awayTeam.name}`,
      startAt: game.startAt,
      endAt: game.endAt,
      surfaceId: game.surfaceId,
    })),
    ...scheduleBlocks.map((block) => ({
      source: "scheduleBlock" as const,
      title: block.title,
      startAt: block.startsAt,
      endAt: block.endsAt,
      surfaceId: block.surfaceId,
    })),
  ];

  return conflicts.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

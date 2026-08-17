import { prisma } from "@/lib/db/prisma";
import { getAvailableVenues } from "@/lib/actions/venues";
import { requireUserId } from "@/lib/auth/session";
import type {
  VenueBookingOption,
  VenueReservationBookingOption,
} from "@/components/features/practice-planner/PracticeSessionEditor";

/**
 * Venue/surface/segment option data for the practice editor's optional
 * "Ice Booking" section (feature 006, FR-019). Loaded server-side by the
 * new/edit practice pages, mirroring how the season detail page builds
 * surfacesByVenue/segmentsBySurface for GameForm.
 */
export interface VenueBookingOptions {
  venues: VenueBookingOption[];
  reservations: VenueReservationBookingOption[];
  currentReservationId: string | null;
  /** Active surfaces per venue id. */
  surfacesByVenue: Record<string, Array<{ id: string; name: string }>>;
  /** Active segments per surface id. */
  segmentsBySurface: Record<string, Array<{ id: string; name: string }>>;
  /** Display name of the implicit whole-surface option per surface ("Full ice"). */
  wholeLabelBySurface: Record<string, string>;
}

export async function getVenueBookingOptions(
  teamId: string,
  practiceSessionId?: string,
): Promise<VenueBookingOptions> {
  const userId = await requireUserId();
  // Venues visible to the user (PUBLIC + their leagues/teams).
  const venueRows = await getAvailableVenues();
  const venues = venueRows.map((venue) => ({
    id: venue.id,
    name: venue.name,
    timezone: venue.timezone,
  }));
  const [team, currentPractice] = await Promise.all([
    prisma.team.findUnique({
      where: { id: teamId },
      select: { leagueId: true },
    }),
    practiceSessionId
      ? prisma.practiceSession.findFirst({
          where: { id: practiceSessionId, teamId },
          select: { venueReservationId: true },
        })
      : Promise.resolve(null),
  ]);
  const mayAssignLeagueInventory = team?.leagueId
    ? Boolean(await prisma.leagueUser.findFirst({
        where: {
          userId,
          leagueId: team.leagueId,
          role: "LEAGUE_ADMIN",
        },
        select: { id: true },
      }))
    : false;
  const currentReservationId = currentPractice?.venueReservationId ?? null;
  const ownership = [
    { ownerTeamId: teamId },
    ...(team?.leagueId && mayAssignLeagueInventory
      ? [{ ownerLeagueId: team.leagueId }]
      : []),
    ...(currentReservationId ? [{ id: currentReservationId }] : []),
  ];
  const unassigned = {
    events: { none: {} },
    seasonGames: { none: {} },
    eventGames: { none: {} },
    signupEvents: { none: {} },
    practiceSessions: { none: {} },
    proposalEntries: { none: {} },
  };
  const reservationRows = await prisma.venueReservation.findMany({
    where: {
      status: "CONFIRMED",
      OR: ownership,
      AND: [
        currentReservationId
          ? {
              OR: [
                unassigned,
                {
                  id: currentReservationId,
                  practiceSessions: {
                    some: { id: practiceSessionId, teamId },
                  },
                },
              ],
            }
          : unassigned,
      ],
    },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      timezone: true,
      venueId: true,
      surfaceId: true,
      segmentId: true,
      ownerLeagueId: true,
      ownerTeamId: true,
      venue: { select: { name: true } },
      surface: { select: { name: true } },
      segment: { select: { name: true } },
    },
    orderBy: { startsAt: "asc" },
  });
  const reservations: VenueReservationBookingOption[] = reservationRows.map(
    (reservation) => ({
      id: reservation.id,
      startsAt: reservation.startsAt.toISOString(),
      endsAt: reservation.endsAt.toISOString(),
      timezone: reservation.timezone,
      venueId: reservation.venueId,
      venueName: reservation.venue.name,
      surfaceId: reservation.surfaceId,
      surfaceName: reservation.surface?.name ?? null,
      segmentId: reservation.segmentId,
      segmentName: reservation.segment?.name ?? null,
      ownerType: reservation.ownerLeagueId ? "league" : "team",
    }),
  );

  const surfaces = venues.length
    ? await prisma.iceSurface.findMany({
        where: { venueId: { in: venues.map((venue) => venue.id) }, isActive: true },
        select: { id: true, name: true, venueId: true, wholeLabel: true },
        orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      })
    : [];
  const surfacesByVenue: Record<string, Array<{ id: string; name: string }>> = {};
  const wholeLabelBySurface: Record<string, string> = {};
  for (const surface of surfaces) {
    (surfacesByVenue[surface.venueId] ??= []).push({ id: surface.id, name: surface.name });
    if (surface.wholeLabel) {
      wholeLabelBySurface[surface.id] = surface.wholeLabel;
    }
  }

  const segments = surfaces.length
    ? await prisma.surfaceSegment.findMany({
        where: { surfaceId: { in: surfaces.map((surface) => surface.id) }, isActive: true },
        select: { id: true, name: true, surfaceId: true },
        orderBy: { name: "asc" },
      })
    : [];
  const segmentsBySurface: Record<string, Array<{ id: string; name: string }>> = {};
  for (const segment of segments) {
    (segmentsBySurface[segment.surfaceId] ??= []).push({ id: segment.id, name: segment.name });
  }

  return {
    venues,
    reservations,
    currentReservationId,
    surfacesByVenue,
    segmentsBySurface,
    wholeLabelBySurface,
  };
}

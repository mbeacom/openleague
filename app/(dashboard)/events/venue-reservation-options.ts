import { prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/auth/session";
import type { EventReservationOption } from "@/components/features/events/EventForm";

const unassignedReservation = {
  events: { none: {} },
  seasonGames: { none: {} },
  eventGames: { none: {} },
  signupEvents: { none: {} },
  practiceSessions: { none: {} },
  proposalEntries: { none: {} },
};

export async function getEventReservationOptions(
  teamId: string,
  eventId?: string,
): Promise<EventReservationOption[]> {
  const userId = await requireUserId();
  const [team, currentEvent] = await Promise.all([
    prisma.team.findUnique({
      where: { id: teamId },
      select: { leagueId: true },
    }),
    eventId
      ? prisma.event.findFirst({
          where: { id: eventId, teamId },
          select: { venueReservationId: true },
        })
      : Promise.resolve(null),
  ]);
  const currentReservationId = currentEvent?.venueReservationId ?? null;
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

  const rows = await prisma.venueReservation.findMany({
    where: {
      status: "CONFIRMED",
      OR: [
        { ownerTeamId: teamId },
        ...(team?.leagueId && mayAssignLeagueInventory
          ? [{ ownerLeagueId: team.leagueId }]
          : []),
        ...(currentReservationId ? [{ id: currentReservationId }] : []),
      ],
      AND: [
        currentReservationId
          ? {
              OR: [
                unassignedReservation,
                {
                  id: currentReservationId,
                  events: { some: { id: eventId, teamId } },
                },
              ],
            }
          : unassignedReservation,
      ],
    },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      timezone: true,
      venueId: true,
      venue: { select: { name: true } },
      surface: { select: { name: true } },
      segment: { select: { name: true } },
    },
    orderBy: { startsAt: "asc" },
  });

  return rows.map((row) => ({
    id: row.id,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    timezone: row.timezone,
    venueId: row.venueId,
    venueName: row.venue.name,
    surfaceName: row.surface?.name ?? null,
    segmentName: row.segment?.name ?? null,
  }));
}

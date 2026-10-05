import type { Prisma } from "@prisma/client";

/**
 * Create the calendar Event + dual-roster RSVP fan-out for a game inside a
 * transaction and link it back to the game (FR-009). Mirrors the platform's
 * inter-team game pattern: one Event anchored on the home team.
 *
 * Runs inside a caller-owned transaction, so it is a service rather than a
 * server action.
 */
export async function createGameEventWithRsvps(
  tx: Prisma.TransactionClient,
  game: {
    id: string;
    startAt: Date;
    endAt: Date;
    timezone: string;
    venueId: string | null;
    locationText: string | null;
    homeTeamId: string;
    awayTeamId: string;
    leagueId: string | null;
    venueReservationId?: string | null;
  }
): Promise<string> {
  const [homeTeam, awayTeam, venue, members] = await Promise.all([
    tx.team.findUniqueOrThrow({ where: { id: game.homeTeamId }, select: { name: true } }),
    tx.team.findUniqueOrThrow({ where: { id: game.awayTeamId }, select: { name: true } }),
    game.venueId
      ? tx.venue.findUnique({ where: { id: game.venueId }, select: { name: true } })
      : Promise.resolve(null),
    tx.teamMember.findMany({
      where: { teamId: { in: [game.homeTeamId, game.awayTeamId] } },
      select: { userId: true },
    }),
  ]);

  const uniqueUserIds = [...new Set(members.map((m) => m.userId))];

  const event = await tx.event.create({
    data: {
      type: "GAME",
      title: `${homeTeam.name} vs ${awayTeam.name}`,
      startAt: game.startAt,
      endAt: game.endAt,
      timezone: game.timezone,
      location: venue?.name || game.locationText || "TBD",
      venueId: game.venueId,
      opponent: awayTeam.name,
      teamId: game.homeTeamId,
      homeTeamId: game.homeTeamId,
      awayTeamId: game.awayTeamId,
      leagueId: game.leagueId,
      venueReservationId: game.venueReservationId ?? null,
      rsvps: {
        create: uniqueUserIds.map((userId) => ({ userId, status: "NO_RESPONSE" as const })),
      },
    },
    select: { id: true },
  });

  await tx.seasonGame.update({
    where: { id: game.id },
    data: { eventId: event.id, status: "SCHEDULED" },
  });

  return event.id;
}

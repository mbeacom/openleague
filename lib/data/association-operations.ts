import { Prisma } from "@prisma/client";

import { requireLeagueRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export type AssociationOperationsWindow = {
  from?: Date | string;
  to?: Date | string;
};

export type OperationsAction = {
  id: string;
  title: string;
  detail?: string;
  href: string;
  at?: string;
};

export type AssociationOperationsData = {
  leagueId: string;
  window: { from: string; to: string };
  counts: {
    pendingIceRequests: number;
    unassignedReservations: number;
    staleDrafts: number;
    unresolvedConflicts: number;
    migrationOverrides: number;
    unscheduledTeams: number;
    phaseGaps: number;
    upcomingReservations: number;
    upcomingChanges: number;
    volunteerShortages: number;
    urgentGearNeeds: number;
    overdueGearCustody: number;
    outboxPending: number;
    outboxFailed: number;
  };
  pendingIceRequests: OperationsAction[];
  unassignedReservations: OperationsAction[];
  staleDrafts: OperationsAction[];
  unresolvedConflicts: OperationsAction[];
  migrationOverrides: OperationsAction[];
  unscheduledTeams: OperationsAction[];
  phaseGaps: OperationsAction[];
  upcomingReservations: OperationsAction[];
  upcomingChanges: OperationsAction[];
  volunteerShortages: OperationsAction[];
  gear: {
    urgentNeeds: OperationsAction[];
    overdueCustody: OperationsAction[];
    outbox: {
      pending: number;
      processing: number;
      failed: number;
      oldestPendingAt: string | null;
      backlog: boolean;
    };
  };
};

function asDate(value: Date | string | undefined, fallback: Date): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return fallback;
}

function href(leagueId: string, path: string): string {
  return `/league/${encodeURIComponent(leagueId)}${path}`;
}

function iso(value: Date | null | undefined): string | undefined {
  return value?.toISOString();
}

/**
 * Association-admin operational read model.
 *
 * This reader deliberately returns labels and counts, not source rows. In
 * particular, gear custody is queried separately from venue reservations.
 */
export async function getAssociationOperationsData(
  leagueId: string,
  window: AssociationOperationsWindow = {},
): Promise<AssociationOperationsData> {
  await requireLeagueRole(leagueId, "LEAGUE_ADMIN");

  const now = new Date();
  const from = asDate(window.from, new Date(now.getTime() - 7 * 86400000));
  const to = asDate(window.to, new Date(now.getTime() + 30 * 86400000));
  if (from >= to) throw new Error("Invalid operations window");
  const staleBefore = new Date(now.getTime() - 7 * 86400000);

  const [
    requests,
    reservations,
    overrides,
    games,
    seasons,
    teams,
    urgentNeeds,
    custody,
    outbox,
    volunteerNeeds,
  ] = await Promise.all([
    prisma.iceTimeRequest.findMany({
      where: {
        status: { in: ["SUBMITTED", "UNDER_REVIEW"] },
        requestedStartAt: { lt: to },
        requestedEndAt: { gt: from },
        OR: [{ requesterLeagueId: leagueId }, { requesterTeam: { leagueId } }],
      },
      select: {
        id: true,
        status: true,
        requestedStartAt: true,
        requestedEndAt: true,
        requesterTeam: { select: { name: true } },
      },
      orderBy: { requestedStartAt: "asc" },
    }),
    prisma.venueReservation.findMany({
      where: {
        status: "CONFIRMED",
        startsAt: { lt: to },
        endsAt: { gt: from },
        OR: [
          { ownerLeagueId: leagueId },
          { ownerLeagueId: null, ownerTeam: { leagueId, isActive: true } },
        ],
      },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        venue: { select: { name: true } },
        ownerTeam: { select: { name: true } },
        events: { select: { id: true }, take: 1 },
        seasonGames: { select: { id: true }, take: 1 },
        signupEvents: { select: { id: true }, take: 1 },
        eventGames: { select: { id: true }, take: 1 },
        practiceSessions: { select: { id: true }, take: 1 },
        proposalEntries: { select: { id: true }, take: 1 },
        transitions: {
          select: { id: true, nextStatus: true, occurredAt: true },
          orderBy: { occurredAt: "desc" },
          take: 1,
        },
      },
      orderBy: { startsAt: "asc" },
    }),
    prisma.venueReservationOverride.findMany({
      where: {
        occurredAt: { gte: from, lt: to },
        reason: "Legacy commitments overlap during venue reservation migration",
        candidateSnapshot: {
          path: ["migrationSource"],
          not: Prisma.AnyNull,
        },
        reservation: {
          OR: [
            { ownerLeagueId: leagueId },
            { ownerLeagueId: null, ownerTeam: { leagueId, isActive: true } },
          ],
        },
      },
      select: {
        id: true,
        occurredAt: true,
        reservation: {
          select: { id: true, startsAt: true, venue: { select: { name: true } } },
        },
      },
      orderBy: { occurredAt: "desc" },
    }),
    prisma.seasonGame.findMany({
      where: {
        season: { leagueId },
        startAt: { lt: to },
        endAt: { gt: from },
      },
      select: {
        id: true,
        status: true,
        startAt: true,
        endAt: true,
        updatedAt: true,
        venueId: true,
        venueReservationId: true,
        conflictOverriddenAt: true,
        phase: { select: { id: true, name: true } },
        homeTeam: { select: { id: true, name: true } },
        awayTeam: { select: { id: true, name: true } },
      },
      orderBy: { startAt: "asc" },
    }),
    prisma.season.findMany({
      where: { leagueId, archivedAt: null },
      select: {
        id: true,
        name: true,
        phases: {
          select: {
            id: true,
            name: true,
            startDate: true,
            endDate: true,
            games: { select: { id: true, status: true } },
          },
        },
      },
    }),
    prisma.team.findMany({
      where: { leagueId, isActive: true },
      select: { id: true, name: true },
    }),
    prisma.teamGearNeed.findMany({
      where: {
        leagueId,
        status: { in: ["SUBMITTED", "APPROVED"] },
        lines: { some: { priority: "URGENT", status: { in: ["OPEN", "PARTIALLY_FULFILLED"] } } },
      },
      select: {
        id: true,
        title: true,
        team: { select: { name: true } },
        lines: {
          where: { priority: "URGENT", status: { in: ["OPEN", "PARTIALLY_FULFILLED"] } },
          select: { requestedQty: true, fulfilledQty: true },
        },
      },
      orderBy: { updatedAt: "asc" },
    }),
    prisma.gearReservation.findMany({
      where: {
        leagueId,
        status: { in: ["APPROVED", "FULFILLED"] },
        OR: [
          { approvedEndDate: { lt: now } },
          { approvedEndDate: null, requestedEndDate: { lt: now } },
        ],
        custodyEndedAt: null,
      },
      select: {
        id: true,
        requestedEndDate: true,
        approvedEndDate: true,
        team: { select: { name: true } },
      },
      orderBy: { requestedEndDate: "asc" },
    }),
    prisma.notificationOutbox.findMany({
      where: {
        leagueId,
        eventType: { startsWith: "gear." },
        status: { in: ["PENDING", "PROCESSING", "FAILED"] },
      },
      select: { status: true, scheduledAt: true },
      orderBy: { scheduledAt: "asc" },
    }),
    // Open volunteer needs overlapping the window. The shortfall itself
    // (acceptedCount < capacity) is computed below rather than in the `where`:
    // Prisma cannot compare two columns of the same row, and a bounded take
    // keeps this a dashboard query rather than a table scan.
    prisma.volunteerNeed.findMany({
      where: {
        leagueId,
        status: "OPEN",
        startAt: { lt: to },
        endAt: { gt: from },
      },
      select: {
        id: true,
        roleLabel: true,
        capacity: true,
        acceptedCount: true,
        startAt: true,
        team: { select: { name: true } },
      },
      orderBy: { startAt: "asc" },
      take: 50,
    }),
  ]);

  const unassignedReservations = reservations.filter(
    (reservation) =>
      reservation.events.length === 0 &&
      reservation.seasonGames.length === 0 &&
      reservation.signupEvents.length === 0 &&
      (reservation.eventGames?.length ?? 0) === 0 &&
      reservation.practiceSessions.length === 0 &&
      reservation.proposalEntries.length === 0,
  );
  const overdueCustody = custody.filter(
    (reservation) => (reservation.approvedEndDate ?? reservation.requestedEndDate) < now,
  );
  const upcomingReservations = reservations.filter((reservation) => !unassignedReservations.includes(reservation));
  const upcomingChanges = reservations.filter(
    (reservation) => reservation.startsAt >= now && (reservation.transitions ?? []).length > 0,
  );
  const staleDrafts = games.filter(
    (game) =>
      game.status === "DRAFT" &&
      (game.updatedAt ?? game.startAt) < staleBefore,
  );
  const unresolvedConflicts = games.filter(
    (game) =>
      game.venueId
      && game.conflictOverriddenAt === null
      && game.status !== "CANCELED"
      && !game.venueReservationId,
  );
  const unscheduledTeamIds = new Set(
    games.flatMap((game) => game.status !== "DRAFT" && game.status !== "CANCELED"
      ? [game.homeTeam.id, game.awayTeam.id]
      : []),
  );
  const unscheduledTeams = teams.filter((team) => !unscheduledTeamIds.has(team.id));
  const phaseGaps = seasons.flatMap((season) =>
    season.phases
      .filter((phase) =>
        phase.endDate >= from &&
        phase.startDate <= to &&
        !phase.games.some((game) => game.status !== "DRAFT" && game.status !== "CANCELED"),
      )
      .map((phase) => ({ id: phase.id, title: `${season.name}: ${phase.name}`, href: href(leagueId, "/schedule") })),
  );
  const outboxPending = outbox.filter((row) => row.status === "PENDING");
  const outboxProcessing = outbox.filter((row) => row.status === "PROCESSING");
  const outboxFailed = outbox.filter((row) => row.status === "FAILED");

  // A shortage is an open need that still has unfilled slots. Surfaced to
  // organizers so a game is not discovered to be unstaffed on the morning.
  const volunteerShortages = volunteerNeeds
    .filter((need) => need.acceptedCount < need.capacity)
    .map((need) => ({
      id: need.id,
      title: need.roleLabel,
      detail: `${need.capacity - need.acceptedCount} of ${need.capacity} unfilled${
        need.team?.name ? ` · ${need.team.name}` : ""
      }`,
      href: href(leagueId, "/workforce"),
      at: need.startAt.toISOString(),
    }));

  return {
    leagueId,
    window: { from: from.toISOString(), to: to.toISOString() },
    counts: {
      pendingIceRequests: requests.length,
      unassignedReservations: unassignedReservations.length,
      staleDrafts: staleDrafts.length,
      unresolvedConflicts: unresolvedConflicts.length,
      migrationOverrides: overrides.length,
      unscheduledTeams: unscheduledTeams.length,
      phaseGaps: phaseGaps.length,
      upcomingReservations: upcomingReservations.length,
      upcomingChanges: upcomingChanges.length,
      volunteerShortages: volunteerShortages.length,
      urgentGearNeeds: urgentNeeds.length,
      overdueGearCustody: overdueCustody.length,
      outboxPending: outboxPending.length,
      outboxFailed: outboxFailed.length,
    },
    pendingIceRequests: requests.map((request) => ({
      id: request.id,
      title: `Ice request${request.requesterTeam?.name ? ` · ${request.requesterTeam.name}` : ""}`,
      detail: request.status.replaceAll("_", " ").toLowerCase(),
      href: href(leagueId, "/venue-reservations"),
      at: request.requestedStartAt.toISOString(),
    })),
    unassignedReservations: unassignedReservations.map((reservation) => ({
      id: reservation.id,
      title: reservation.venue.name,
      detail: "Confirmed reservation needs an activity assignment",
      href: href(leagueId, "/venue-reservations"),
      at: reservation.startsAt.toISOString(),
    })),
    staleDrafts: staleDrafts.map((game) => ({
      id: game.id,
      title: `${game.homeTeam.name} vs ${game.awayTeam.name}`,
      detail: "Draft game is past its planning window",
      href: href(leagueId, "/schedule"),
      at: game.startAt.toISOString(),
    })),
    unresolvedConflicts: unresolvedConflicts.map((game) => ({
      id: game.id,
      title: `${game.homeTeam.name} vs ${game.awayTeam.name}`,
      detail: "Game has no canonical venue reservation",
      href: href(leagueId, "/schedule"),
      at: game.startAt.toISOString(),
    })),
    migrationOverrides: overrides.map((override) => ({
      id: override.id,
      title: override.reservation.venue.name,
      detail: "Reservation migration override needs reconciliation",
      href: href(leagueId, "/venue-reservations"),
      at: override.occurredAt.toISOString(),
    })),
    unscheduledTeams: unscheduledTeams.map((team) => ({
      id: team.id,
      title: team.name,
      detail: "No scheduled game in this operations window",
      href: href(leagueId, `/teams/${encodeURIComponent(team.id)}`),
    })),
    phaseGaps,
    upcomingReservations: upcomingReservations.map((reservation) => ({
      id: reservation.id,
      title: reservation.venue.name,
      detail: reservation.ownerTeam?.name ?? "Association reservation",
      href: href(leagueId, "/venue-reservations"),
      at: reservation.startsAt.toISOString(),
    })),
    upcomingChanges: upcomingChanges.map((reservation) => ({
      id: reservation.id,
      title: reservation.venue.name,
      detail: `Reservation status changed to ${reservation.transitions?.[0]?.nextStatus.toLowerCase() ?? "updated"}`,
      href: href(leagueId, "/venue-reservations"),
      at: reservation.transitions?.[0]?.occurredAt.toISOString(),
    })),
    volunteerShortages,
    gear: {
      urgentNeeds: urgentNeeds.map((need) => ({
        id: need.id,
        title: need.title,
        detail: need.team.name,
        href: href(leagueId, "/gear/needs"),
      })),
      overdueCustody: overdueCustody.map((reservation) => ({
        id: reservation.id,
        title: reservation.team.name,
        detail: "Gear custody is past its planned end date",
        href: href(leagueId, "/gear/reservations"),
        at: iso(reservation.approvedEndDate ?? reservation.requestedEndDate),
      })),
      outbox: {
        pending: outboxPending.length,
        processing: outboxProcessing.length,
        failed: outboxFailed.length,
        oldestPendingAt: outboxPending[0]?.scheduledAt.toISOString() ?? null,
        backlog: outboxPending.length > 0 || outboxProcessing.length > 0 || outboxFailed.length > 0,
      },
    },
  };
}

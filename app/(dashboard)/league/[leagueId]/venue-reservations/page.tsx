import { notFound } from "next/navigation";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  VenueReservationInventory,
  type VenueReservationFilters,
  type VenueReservationInventoryItem,
} from "@/components/features/association-operations/VenueReservationInventory";
import { requireUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { formatDateTimeInZone } from "@/lib/utils/date";

export const dynamic = "force-dynamic";

interface VenueReservationsPageProps {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{
    assignment?: string | string[];
    owner?: string | string[];
    venueId?: string | string[];
  }>;
}

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function parseFilters(
  search: Awaited<VenueReservationsPageProps["searchParams"]>,
): VenueReservationFilters {
  const assignment = one(search.assignment);
  const owner = one(search.owner);
  return {
    assignment:
      assignment === "assigned" || assignment === "unassigned" ? assignment : "all",
    owner: owner === "league" || owner === "team" ? owner : "all",
    venueId: one(search.venueId),
  };
}

function assignmentLabel(reservation: {
  practiceSessions: Array<{ title: string; team: { name: string } }>;
  seasonGames: Array<{ id: string }>;
  events: Array<{ id: string }>;
  signupEvents: Array<{ id: string }>;
  eventGames: Array<{ id: string }>;
  proposalEntries: Array<{ id: string }>;
}): string | null {
  const practice = reservation.practiceSessions[0];
  if (practice) return `Practice: ${practice.team.name} — ${practice.title}`;
  if (reservation.seasonGames.length) return "Season game";
  if (reservation.eventGames.length) return "Signup-event game";
  if (reservation.signupEvents.length) return "Signup event";
  if (reservation.events.length) return "Event";
  if (reservation.proposalEntries.length) return "Game proposal";
  return null;
}

export default async function VenueReservationsPage({
  params,
  searchParams,
}: VenueReservationsPageProps) {
  const [{ leagueId }, search, userId] = await Promise.all([
    params,
    searchParams,
    requireUserId(),
  ]);
  const filters = parseFilters(search);

  // Bind authorization to this exact league before loading any inventory.
  const membership = await prisma.leagueUser.findUnique({
    where: { userId_leagueId: { userId, leagueId } },
    select: {
      role: true,
      league: { select: { id: true, name: true, isActive: true } },
    },
  });
  if (
    !membership
    || membership.role !== "LEAGUE_ADMIN"
    || !membership.league.isActive
  ) {
    notFound();
  }

  const [rawReservations, practices] = await Promise.all([
    prisma.venueReservation.findMany({
      where: {
        status: "CONFIRMED",
        OR: [
          { ownerLeagueId: leagueId },
          {
            ownerLeagueId: null,
            ownerTeam: { is: { leagueId, isActive: true } },
          },
        ],
      },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        timezone: true,
        surfaceId: true,
        segmentId: true,
        venue: { select: { id: true, name: true } },
        surface: { select: { name: true, wholeLabel: true } },
        segment: { select: { name: true } },
        ownerLeague: { select: { name: true } },
        ownerTeamId: true,
        ownerTeam: {
          select: {
            name: true,
            members: {
              where: { userId, role: "ADMIN" },
              select: { id: true },
              take: 1,
            },
          },
        },
        practiceSessions: {
          where: { team: { leagueId } },
          select: { title: true, team: { select: { name: true } } },
        },
        seasonGames: { select: { id: true } },
        events: { select: { id: true } },
        signupEvents: { select: { id: true } },
        eventGames: { select: { id: true } },
        proposalEntries: { select: { id: true } },
      },
      orderBy: [{ startsAt: "asc" }, { venue: { name: "asc" } }],
    }),
    prisma.practiceSession.findMany({
      where: {
        team: { leagueId, isActive: true },
        venueReservationId: null,
        venueId: { not: null },
        startAt: { not: null },
      },
      select: {
        id: true,
        title: true,
        duration: true,
        venueId: true,
        surfaceId: true,
        segmentId: true,
        startAt: true,
        team: { select: { name: true } },
        teamId: true,
      },
      orderBy: [{ startAt: "asc" }, { title: "asc" }],
    }),
  ]);

  const allItems: Array<VenueReservationInventoryItem & { venueId: string }> =
    rawReservations.map((reservation) => {
      const assignment = assignmentLabel(reservation);
      const matchingPractices = practices.filter((practice) => {
        if (!practice.startAt || practice.venueId !== reservation.venue.id) return false;
        if (
          reservation.ownerTeamId
          && practice.teamId !== reservation.ownerTeamId
        ) {
          return false;
        }
        const practiceEndsAt =
          practice.startAt.getTime() + practice.duration * 60_000;
        const spaceMatches =
          reservation.surfaceId === null
          || (
            practice.surfaceId === reservation.surfaceId
            && (
              reservation.segmentId === null
              || practice.segmentId === reservation.segmentId
            )
          );
        return (
          practice.startAt.getTime() === reservation.startsAt.getTime()
          && practiceEndsAt === reservation.endsAt.getTime()
          && spaceMatches
        );
      });

      return {
        id: reservation.id,
        venueId: reservation.venue.id,
        venueName: reservation.venue.name,
        localTime: `${formatDateTimeInZone(
          reservation.startsAt,
          reservation.timezone,
        )} – ${formatDateTimeInZone(reservation.endsAt, reservation.timezone)}`,
        space: reservation.surface
          ? `${reservation.surface.name} / ${
              reservation.segment?.name
              ?? reservation.surface.wholeLabel
              ?? "Full surface"
            }`
          : "Venue-wide",
        owner: reservation.ownerLeague?.name ?? reservation.ownerTeam?.name ?? "Unknown owner",
        ownerType: reservation.ownerLeague ? "LEAGUE" : "TEAM",
        assignment,
        canAssign:
          !assignment
          && Boolean(reservation.ownerLeague || reservation.ownerTeam?.members.length),
        practices: matchingPractices.map((practice) => ({
          id: practice.id,
          title: practice.title,
          teamName: practice.team.name,
        })),
      };
    });

  const venues = Array.from(
    new Map(
      allItems.map((item) => [item.venueId, { id: item.venueId, name: item.venueName }]),
    ).values(),
  ).sort((a, b) => a.name.localeCompare(b.name));
  const effectiveFilters = {
    ...filters,
    venueId: venues.some((venue) => venue.id === filters.venueId)
      ? filters.venueId
      : "",
  };
  const items = allItems.filter((item) => {
    if (effectiveFilters.venueId && item.venueId !== effectiveFilters.venueId) return false;
    if (effectiveFilters.owner === "league" && item.ownerType !== "LEAGUE") return false;
    if (effectiveFilters.owner === "team" && item.ownerType !== "TEAM") return false;
    if (effectiveFilters.assignment === "assigned" && !item.assignment) return false;
    if (effectiveFilters.assignment === "unassigned" && item.assignment) return false;
    return true;
  });

  return (
    <PageContainer maxWidth="xl">
      <PageHeader
        title="Venue reservations"
        subtitle={`Confirmed ice inventory for ${membership.league.name}. Times are shown in each venue's local timezone.`}
      />
      <VenueReservationInventory
        leagueId={leagueId}
        reservations={items}
        venues={venues}
        filters={effectiveFilters}
      />
    </PageContainer>
  );
}

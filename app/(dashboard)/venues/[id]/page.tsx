import { Container, Box } from "@mui/material";
import { prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/auth/session";
import { notFound } from "next/navigation";
import { getVenue } from "@/lib/actions/venues";
import VenueDetail from "@/components/features/venues/VenueDetail";

export default async function VenueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await requireUserId();

  const venue = await getVenue(id);
  if (!venue) {
    notFound();
  }

  // Check if user can edit this venue
  const canEdit =
    venue.createdById === userId ||
    (venue.visibility === "TEAM" &&
      venue.teamId &&
      (await prisma.teamMember.findUnique({
        where: { userId_teamId: { userId, teamId: venue.teamId } },
      }))?.role === "ADMIN") ||
    (venue.visibility === "LEAGUE" &&
      venue.leagueId &&
      (await prisma.leagueUser.findUnique({
        where: { userId_leagueId: { userId, leagueId: venue.leagueId } },
      }))?.role === "LEAGUE_ADMIN");

  // Get upcoming events at this venue
  const upcomingEvents = await prisma.event.findMany({
    where: {
      venueId: id,
      startAt: { gte: new Date() },
    },
    select: {
      id: true,
      title: true,
      startAt: true,
      type: true,
      team: { select: { name: true } },
    },
    orderBy: { startAt: "asc" },
    take: 10,
  });

  const serializedEvents = upcomingEvents.map((e) => ({
    ...e,
    startAt: e.startAt.toISOString(),
  }));

  return (
    <Container maxWidth="md">
      <Box sx={{ py: 4 }}>
        <VenueDetail
          venue={venue}
          canEdit={!!canEdit}
          upcomingEvents={serializedEvents}
        />
      </Box>
    </Container>
  );
}

import { Container, Box } from "@mui/material";
import { prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/auth/session";
import { notFound, redirect } from "next/navigation";
import { getVenue } from "@/lib/actions/venues";
import VenueForm from "@/components/features/venues/VenueForm";

export default async function EditVenuePage({
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

  // Check edit permission
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

  if (!canEdit) {
    redirect(`/venues/${id}`);
  }

  // Get user's teams and leagues for the form
  const memberships = await prisma.teamMember.findMany({
    where: { userId, role: "ADMIN" },
    select: { team: { select: { id: true, name: true } } },
  });
  const teams = memberships.map((m) => m.team);

  const leagueUsers = await prisma.leagueUser.findMany({
    where: { userId, role: "LEAGUE_ADMIN" },
    select: { league: { select: { id: true, name: true } } },
  });
  const leagues = leagueUsers.map((lu) => lu.league);

  return (
    <Container maxWidth="md">
      <Box sx={{ py: 4 }}>
        <VenueForm
          venueId={venue.id}
          initialData={{
            name: venue.name,
            address: venue.address || "",
            city: venue.city || "",
            state: venue.state || "",
            zipCode: venue.zipCode || "",
            surfaceType: venue.surfaceType,
            capacity: venue.capacity,
            amenities: venue.amenities,
            phone: venue.phone || "",
            website: venue.website || "",
            notes: venue.notes || "",
            visibility: venue.visibility,
            teamId: venue.teamId || "",
            leagueId: venue.leagueId || "",
          }}
          teams={teams}
          leagues={leagues}
        />
      </Box>
    </Container>
  );
}

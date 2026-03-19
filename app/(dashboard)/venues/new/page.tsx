import { Container, Box } from "@mui/material";
import { prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import VenueForm from "@/components/features/venues/VenueForm";

export default async function NewVenuePage() {
  const userId = await requireUserId();

  // Get user's teams (admin role) and leagues for the form
  const memberships = await prisma.teamMember.findMany({
    where: { userId, role: "ADMIN" },
    select: {
      team: { select: { id: true, name: true, leagueId: true } },
    },
  });

  if (memberships.length === 0) {
    redirect("/venues");
  }

  const teams = memberships.map((m) => m.team);

  // Get leagues user is admin of
  const leagueUsers = await prisma.leagueUser.findMany({
    where: { userId, role: "LEAGUE_ADMIN" },
    select: {
      league: { select: { id: true, name: true } },
    },
  });

  const leagues = leagueUsers.map((lu) => lu.league);

  return (
    <Container maxWidth="md">
      <Box sx={{ py: 4 }}>
        <VenueForm teams={teams} leagues={leagues} />
      </Box>
    </Container>
  );
}

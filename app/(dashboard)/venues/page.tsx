import { Container, Box, Typography } from "@mui/material";
import { prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getAvailableVenues } from "@/lib/actions/venues";
import VenueList from "@/components/features/venues/VenueList";

export default async function VenuesPage() {
  const userId = await requireUserId();

  // Check if user has any team membership
  const membership = await prisma.teamMember.findFirst({
    where: { userId },
    select: { role: true },
  });

  if (!membership) {
    redirect("/");
  }

  const isAdmin = membership.role === "ADMIN";
  const venues = await getAvailableVenues();

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Venues
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Manage rinks, fields, and facilities for scheduling games and practices.
        </Typography>
        <VenueList venues={venues} isAdmin={isAdmin} />
      </Box>
    </Container>
  );
}

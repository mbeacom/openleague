import { Container, Box, Typography } from "@mui/material";
import { redirect } from "next/navigation";
import { getAvailableVenues, getVenuesPageAccess } from "@/lib/actions/venues";
import VenueList from "@/components/features/venues/VenueList";

export default async function VenuesPage() {
  const access = await getVenuesPageAccess();
  if (!access) {
    redirect("/");
  }

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
        <VenueList venues={venues} isAdmin={access.isAdmin} />
      </Box>
    </Container>
  );
}

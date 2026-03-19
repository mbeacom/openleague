import { Container, Box } from "@mui/material";
import { redirect } from "next/navigation";
import { getVenueFormContext } from "@/lib/actions/venues";
import VenueForm from "@/components/features/venues/VenueForm";

export default async function NewVenuePage() {
  const context = await getVenueFormContext();
  if (!context) {
    redirect("/venues");
  }

  return (
    <Container maxWidth="md">
      <Box sx={{ py: 4 }}>
        <VenueForm teams={context.teams} leagues={context.leagues} />
      </Box>
    </Container>
  );
}

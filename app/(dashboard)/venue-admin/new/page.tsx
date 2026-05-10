import { Container, Stack, Typography } from "@mui/material";
import { VenueOrganizationOnboarding } from "@/components/features/venue-admin";

export default function NewVenueOrganizationPage() {
  return (
    <Container maxWidth="md">
      <Stack spacing={3} sx={{ py: 4 }}>
        <Typography variant="h4" component="h1">
          New Venue Organization
        </Typography>
        <VenueOrganizationOnboarding />
      </Stack>
    </Container>
  );
}

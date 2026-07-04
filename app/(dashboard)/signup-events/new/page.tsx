import { Alert, Container, Stack, Typography } from "@mui/material";
import { listMyHostOptions, listVenueOptions } from "@/lib/actions/signup-events";
import { EventForm } from "@/components/features/signup-events";
import { requireAuth } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function NewSignupEventPage() {
  await requireAuth();
  const [hostOptions, venueOptions] = await Promise.all([listMyHostOptions(), listVenueOptions()]);

  return (
    <Container maxWidth="md">
      <Stack spacing={3} sx={{ py: { xs: 3, md: 5 } }}>
        <Typography variant="h4" component="h1">
          New signup event
        </Typography>
        {hostOptions.length === 0 ? (
          <Alert severity="info">
            You need an admin role in a rink organization, association, or team to host signup
            events.
          </Alert>
        ) : (
          <EventForm hostOptions={hostOptions} venueOptions={venueOptions} />
        )}
      </Stack>
    </Container>
  );
}

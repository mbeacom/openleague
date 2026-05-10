import { Box, Container, Grid, Stack, Typography } from "@mui/material";
import { PublicRinkProfileCard } from "@/components/features/venue-admin/PublicRinkProfile";
import { getPublicRinkSummaries } from "@/lib/actions/venue-organizations";

export default async function PublicRinksPage() {
  const rinks = await getPublicRinkSummaries();

  return (
    <Container maxWidth="lg">
      <Stack spacing={3} sx={{ py: { xs: 8, md: 10 } }}>
        <Box>
          <Typography variant="h3" component="h1" gutterBottom>
            Find Rinks
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Discover published rink profiles, schedules, available ice, lessons, and events.
          </Typography>
        </Box>
        <Grid container spacing={3}>
          {rinks.map((rink) => (
            <Grid key={rink.id} size={{ xs: 12, md: 6, lg: 4 }}>
              <PublicRinkProfileCard venue={rink} />
            </Grid>
          ))}
        </Grid>
        {rinks.length === 0 ? (
          <Typography variant="body1" color="text.secondary">
            No published rink profiles are available yet.
          </Typography>
        ) : null}
      </Stack>
    </Container>
  );
}

import { Box, Button, Card, CardContent, Container, Stack, Typography } from "@mui/material";
import Link from "next/link";
import { getVenueAdminDashboard } from "@/lib/actions/venue-organizations";

export default async function VenueAdminPage() {
  const { organizations } = await getVenueAdminDashboard();

  return (
    <Container maxWidth="lg">
      <Stack spacing={3} sx={{ py: 4 }}>
        <Box>
          <Typography variant="h4" component="h1" gutterBottom>
            Venue Admin
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage rink profiles, staff, schedules, requests, content, and team relationships.
          </Typography>
        </Box>

        {organizations.length === 0 ? (
          <Stack spacing={2} sx={{ maxWidth: 560 }}>
            <Typography variant="body1">
              Create a rink or venue organization to publish a branded profile and manage ice time.
            </Typography>
            <Button component={Link} href="/venue-admin/new" variant="contained">
              Create Venue Organization
            </Button>
          </Stack>
        ) : (
          <Stack spacing={2}>
            {organizations.map((organization) => (
              <Card key={organization.id}>
                <CardContent>
                  <Stack spacing={2}>
                    <Box>
                      <Typography variant="h6">{organization.name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {organization.type} - {organization.status}
                      </Typography>
                    </Box>
                    <Box>
                      <Button
                        component={Link}
                        href={`/venue-admin/${organization.id}/payments`}
                        variant="text"
                        size="small"
                      >
                        Payments &amp; payouts
                      </Button>
                    </Box>
                      <Stack spacing={1}>
                      {organization.venues.map((venue) => (
                          <Stack key={venue.id} direction={{ xs: "column", sm: "row" }} spacing={1}>
                            <Button
                              component={Link}
                              href={`/venue-admin/${organization.id}/venues/${venue.id}/profile`}
                              variant="outlined"
                            >
                              Manage {venue.name}
                            </Button>
                            <Button
                              component={Link}
                              href={`/venue-admin/${organization.id}/venues/${venue.id}/schedule`}
                              variant="text"
                            >
                              Schedule
                            </Button>
                            <Button
                              component={Link}
                              href={`/venue-admin/${organization.id}/venues/${venue.id}/registrations`}
                              variant="text"
                            >
                              Registrations
                            </Button>
                          </Stack>
                      ))}
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>
        )}
      </Stack>
    </Container>
  );
}

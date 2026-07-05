import { Box, Card, CardContent, Container, Stack, Typography } from "@mui/material";
import { LinkButton } from "@/components/ui/NextLinkComposites";
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
            <LinkButton href="/venue-admin/new" variant="contained">
              Create Venue Organization
            </LinkButton>
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
                      <LinkButton
                        href={`/venue-admin/${organization.id}/payments`}
                        variant="text"
                        size="small"
                      >
                        Payments &amp; payouts
                      </LinkButton>
                    </Box>
                      <Stack spacing={1}>
                      {organization.venues.map((venue) => (
                          <Stack key={venue.id} direction={{ xs: "column", sm: "row" }} spacing={1}>
                            <LinkButton
                              href={`/venue-admin/${organization.id}/venues/${venue.id}/profile`}
                              variant="outlined"
                            >
                              Manage {venue.name}
                            </LinkButton>
                            <LinkButton
                              href={`/venue-admin/${organization.id}/venues/${venue.id}/schedule`}
                              variant="text"
                            >
                              Schedule
                            </LinkButton>
                            <LinkButton
                              href={`/venue-admin/${organization.id}/venues/${venue.id}/layout`}
                              variant="text"
                            >
                              Layout
                            </LinkButton>
                            <LinkButton
                              href={`/venue-admin/${organization.id}/venues/${venue.id}/registrations`}
                              variant="text"
                            >
                              Registrations
                            </LinkButton>
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

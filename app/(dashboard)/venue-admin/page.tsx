import { Box, Card, CardContent, Stack, Typography } from "@mui/material";
import BusinessIcon from "@mui/icons-material/Business";
import { LinkButton } from "@/components/ui/NextLinkComposites";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { getVenueAdminDashboard } from "@/lib/actions/venue-organizations";
import { getMyPendingVenueStaffInvites } from "@/lib/actions/venue-staff";
import { InviteResponseButtons } from "./InviteResponseButtons";

function formatVenueStaffRoleLabel(role: string): string {
  return role.toLowerCase().split("_").join(" ");
}

export default async function VenueAdminPage() {
  const [{ organizations }, pendingInvites] = await Promise.all([
    getVenueAdminDashboard(),
    getMyPendingVenueStaffInvites(),
  ]);

  return (
    <PageContainer>
      <PageHeader
        title="Venue Admin"
        subtitle="Manage rink profiles, staff, schedules, requests, content, and team relationships."
        actions={
          organizations.length > 0 ? (
            <LinkButton href="/venue-admin/new" variant="outlined" size="small">
              New organization
            </LinkButton>
          ) : undefined
        }
      />

      {pendingInvites.length > 0 ? (
        <Stack spacing={2} sx={{ mb: 3 }}>
          <Typography variant="h6" component="h2">
            Venue staff invitations
          </Typography>
          {pendingInvites.map((invite) => {
            const invitedByName = invite.invitedBy?.name ?? invite.invitedBy?.email;
            return (
              <Card key={invite.id}>
                <CardContent>
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={2}
                    alignItems={{ sm: "center" }}
                    justifyContent="space-between"
                  >
                    <Box>
                      <Typography variant="subtitle1">{invite.organization.name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {invitedByName ? `${invitedByName} invited you` : "You were invited"} to
                        join as {formatVenueStaffRoleLabel(invite.role)}.
                      </Typography>
                    </Box>
                    <InviteResponseButtons staffId={invite.id} />
                  </Stack>
                </CardContent>
              </Card>
            );
          })}
        </Stack>
      ) : null}

      {organizations.length === 0 ? (
        <EmptyState
          icon={<BusinessIcon />}
          title="No venue organizations yet"
          description="Venue Admin is for rink and venue operators who run facilities: publish a branded public profile, manage staff, and schedule ice time across your surfaces. Facilities your team or league books for games and practices are handled under Venues instead."
          action={
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <LinkButton href="/venue-admin/new" variant="contained">
                Create Venue Organization
              </LinkButton>
              <LinkButton href="/venues" variant="outlined">
                Go to Venues
              </LinkButton>
            </Stack>
          }
        />
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
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <LinkButton
                      href={`/venue-admin/${organization.id}`}
                      variant="text"
                      size="small"
                    >
                      Venues
                    </LinkButton>
                    <LinkButton
                      href={`/venue-admin/${organization.id}/staff`}
                      variant="text"
                      size="small"
                    >
                      Staff
                    </LinkButton>
                    <LinkButton
                      href={`/venue-admin/${organization.id}/payments`}
                      variant="text"
                      size="small"
                    >
                      Payments &amp; payouts
                    </LinkButton>
                    {organization.viewerCanManageVenues && (
                      <LinkButton
                        href={`/venue-admin/${organization.id}/venues/new`}
                        variant="outlined"
                        size="small"
                      >
                        Add venue
                      </LinkButton>
                    )}
                  </Stack>
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
    </PageContainer>
  );
}

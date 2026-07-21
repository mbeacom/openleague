import { notFound } from "next/navigation";
import { Card, CardContent, Stack, Typography } from "@mui/material";
import StadiumIcon from "@mui/icons-material/Stadium";
import { LinkButton } from "@/components/ui/NextLinkComposites";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { prisma } from "@/lib/db/prisma";
import { getUserVenueStaffRole, requireUserId } from "@/lib/auth/session";

interface VenueOrganizationPageProps {
  params: Promise<{ organizationId: string }>;
}

export default async function VenueOrganizationPage({ params }: VenueOrganizationPageProps) {
  const { organizationId } = await params;
  const userId = await requireUserId();

  const viewerRole = await getUserVenueStaffRole(userId, organizationId);
  if (!viewerRole) {
    notFound();
  }
  const canManage = viewerRole === "OWNER" || viewerRole === "MANAGER";

  const organization = await prisma.venueOrganization.findFirst({
    where: { id: organizationId, status: { in: ["DRAFT", "ACTIVE"] } },
    select: {
      id: true,
      name: true,
      type: true,
      venues: {
        select: {
          id: true,
          name: true,
          profileStatus: true,
          city: true,
          state: true,
        },
        orderBy: { name: "asc" },
      },
    },
  });

  if (!organization) {
    notFound();
  }

  return (
    <PageContainer>
      <PageHeader
        title={organization.name}
        subtitle="Venues managed by this organization."
        actions={
          canManage ? (
            <LinkButton
              href={`/venue-admin/${organization.id}/venues/new`}
              variant="contained"
              size="small"
            >
              Add venue
            </LinkButton>
          ) : undefined
        }
      />

      {organization.venues.length === 0 ? (
        <EmptyState
          icon={<StadiumIcon />}
          title="No venues yet"
          description="Add a venue to publish its public profile and start scheduling ice time."
          action={
            canManage ? (
              <LinkButton href={`/venue-admin/${organization.id}/venues/new`} variant="contained">
                Add venue
              </LinkButton>
            ) : undefined
          }
        />
      ) : (
        <Stack spacing={2}>
          {organization.venues.map((venue) => (
            <Card key={venue.id}>
              <CardContent>
                <Stack spacing={1.5}>
                  <div>
                    <Typography variant="h6">{venue.name}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {[venue.city, venue.state].filter(Boolean).join(", ") || "No location set"}
                      {" - "}
                      {venue.profileStatus}
                    </Typography>
                  </div>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <LinkButton
                      href={`/venue-admin/${organization.id}/venues/${venue.id}/profile`}
                      variant="outlined"
                      size="small"
                    >
                      Manage
                    </LinkButton>
                    <LinkButton
                      href={`/venue-admin/${organization.id}/venues/${venue.id}/schedule`}
                      variant="text"
                      size="small"
                    >
                      Schedule
                    </LinkButton>
                    <LinkButton
                      href={`/venue-admin/${organization.id}/venues/${venue.id}/layout`}
                      variant="text"
                      size="small"
                    >
                      Layout
                    </LinkButton>
                    <LinkButton
                      href={`/venue-admin/${organization.id}/venues/${venue.id}/registrations`}
                      variant="text"
                      size="small"
                    >
                      Registrations
                    </LinkButton>
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

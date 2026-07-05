import { notFound } from "next/navigation";
import { Box, Container, Stack, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { LinkButton } from "@/components/ui/NextLinkComposites";
import { prisma } from "@/lib/db/prisma";
import { requireVenueProfileManager } from "@/lib/auth/session";
import { getVenueLayout } from "@/lib/actions/venue-layout";
import { VenueLayoutEditor } from "@/components/features/venue-admin/VenueLayoutEditor";

interface VenueLayoutPageProps {
  params: Promise<{
    organizationId: string;
    venueId: string;
  }>;
}

export default async function VenueLayoutPage({ params }: VenueLayoutPageProps) {
  const { organizationId, venueId } = await params;
  await requireVenueProfileManager(organizationId, venueId);

  const venue = await prisma.venue.findFirst({
    where: { id: venueId, organizationId },
    select: { name: true },
  });
  if (!venue) {
    notFound();
  }

  const result = await getVenueLayout(venueId);
  if (!result.success) {
    notFound();
  }

  return (
    <Container maxWidth="lg">
      <Stack spacing={3} sx={{ py: 4 }}>
        <Box>
          <LinkButton
            href={`/venue-admin/${organizationId}/venues/${venueId}/profile`}
            startIcon={<ArrowBackIcon />}
            size="small"
          >
            Back to venue profile
          </LinkButton>
          <Typography variant="h4" component="h1" sx={{ mt: 1 }}>
            Facility Layout — {venue.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Arrange surfaces on a schematic map and add landmark labels. A saved layout appears on
            the public rink profile.
          </Typography>
        </Box>
        <VenueLayoutEditor
          organizationId={organizationId}
          venueId={venueId}
          initialLayout={result.data.layout}
          surfaces={result.data.surfaces}
        />
      </Stack>
    </Container>
  );
}

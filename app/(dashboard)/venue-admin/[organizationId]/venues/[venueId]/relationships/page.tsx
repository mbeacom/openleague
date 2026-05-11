import { notFound } from "next/navigation";
import { Container, Stack, Typography } from "@mui/material";
import { getVenueRelationshipAdminData } from "@/lib/actions/venue-relationships";
import { VenueRelationshipManager } from "@/components/features/venue-admin";

interface VenueRelationshipsAdminPageProps {
  params: Promise<{
    organizationId: string;
    venueId: string;
  }>;
}

export default async function VenueRelationshipsAdminPage({ params }: VenueRelationshipsAdminPageProps) {
  const { organizationId, venueId } = await params;
  const result = await getVenueRelationshipAdminData(organizationId, venueId);

  if (!result.success) {
    notFound();
  }

  return (
    <Container maxWidth="lg">
      <Stack spacing={4} sx={{ py: 4 }}>
        <Typography variant="h4" component="h1">
          Venue Relationships
        </Typography>
        <VenueRelationshipManager
          relationships={result.data.relationships as Array<{
            id: string;
            relationshipType: string;
            targetType: string;
            targetName?: string | null;
            status: string;
            team?: { name: string } | null;
            league?: { name: string } | null;
          }>}
        />
      </Stack>
    </Container>
  );
}

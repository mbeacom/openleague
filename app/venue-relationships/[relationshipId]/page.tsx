import { notFound } from "next/navigation";
import { Container, Stack, Typography } from "@mui/material";
import { getVenueRelationshipInvitation } from "@/lib/actions/venue-relationships";
import { VenueRelationshipInvitation } from "@/components/features/venue-admin";

export const dynamic = "force-dynamic";

interface VenueRelationshipInvitationPageProps {
  params: Promise<{ relationshipId: string }>;
}

export default async function VenueRelationshipInvitationPage({ params }: VenueRelationshipInvitationPageProps) {
  const { relationshipId } = await params;
  const result = await getVenueRelationshipInvitation(relationshipId);

  if (!result.success) {
    notFound();
  }

  return (
    <Container maxWidth="sm">
      <Stack spacing={3} sx={{ py: { xs: 8, md: 10 } }}>
        <Typography variant="h3" component="h1">
          Review rink invitation
        </Typography>
        <VenueRelationshipInvitation
          relationshipId={result.data.relationshipId}
          venueName={result.data.venueName}
          relationshipType={result.data.relationshipType.toLowerCase()}
        />
      </Stack>
    </Container>
  );
}
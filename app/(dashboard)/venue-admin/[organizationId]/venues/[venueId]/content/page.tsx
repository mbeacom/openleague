import { notFound } from "next/navigation";
import { Container, Stack, Typography } from "@mui/material";
import { getVenueContentAdminData } from "@/lib/actions/venue-content";
import { LessonOfferingEditor, SpecialtyEventEditor, VenueContentManager } from "@/components/features/venue-admin";

interface VenueContentAdminPageProps {
  params: Promise<{
    organizationId: string;
    venueId: string;
  }>;
}

export default async function VenueContentAdminPage({ params }: VenueContentAdminPageProps) {
  const { organizationId, venueId } = await params;
  const result = await getVenueContentAdminData(organizationId, venueId);

  if (!result.success) {
    notFound();
  }

  return (
    <Container maxWidth="lg">
      <Stack spacing={4} sx={{ py: 4 }}>
        <Typography variant="h4" component="h1">
          Venue Content
        </Typography>
        <LessonOfferingEditor organizationId={organizationId} venueId={venueId} />
        <SpecialtyEventEditor organizationId={organizationId} venueId={venueId} />
        <VenueContentManager posts={result.data.posts as Array<{ id: string; title: string; status: string }>} />
      </Stack>
    </Container>
  );
}

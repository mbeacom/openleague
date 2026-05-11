import { notFound } from "next/navigation";
import { Container, Stack, Typography } from "@mui/material";
import { getVenueRequestQueue } from "@/lib/actions/venue-requests";
import { IceTimeRequestQueue } from "@/components/features/venue-admin";

interface VenueRequestsPageProps {
  params: Promise<{
    organizationId: string;
    venueId: string;
  }>;
}

export default async function VenueRequestsPage({ params }: VenueRequestsPageProps) {
  const { organizationId, venueId } = await params;
  const result = await getVenueRequestQueue(organizationId, venueId);

  if (!result.success) {
    notFound();
  }

  return (
    <Container maxWidth="lg">
      <Stack spacing={4} sx={{ py: 4 }}>
        <Typography variant="h4" component="h1">
          Ice Time Requests
        </Typography>
        <IceTimeRequestQueue requests={result.data.requests} />
      </Stack>
    </Container>
  );
}

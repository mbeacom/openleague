import { Container, Box } from "@mui/material";
import { notFound } from "next/navigation";
import { getVenuePageData } from "@/lib/actions/venues";
import VenueDetail from "@/components/features/venues/VenueDetail";

export default async function VenueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const data = await getVenuePageData(id);
  if (!data) {
    notFound();
  }

  return (
    <Container maxWidth="md">
      <Box sx={{ py: 4 }}>
        <VenueDetail
          venue={data.venue!}
          canEdit={data.canEdit}
          upcomingEvents={data.upcomingEvents}
        />
      </Box>
    </Container>
  );
}

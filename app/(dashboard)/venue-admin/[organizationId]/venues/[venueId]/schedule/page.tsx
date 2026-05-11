import { notFound } from "next/navigation";
import { Container, Stack, Typography } from "@mui/material";
import { getVenueScheduleAdminData } from "@/lib/actions/venue-schedules";
import { ScheduleBlockEditor, VenueScheduleCalendar } from "@/components/features/venue-admin";

interface VenueScheduleAdminPageProps {
  params: Promise<{
    organizationId: string;
    venueId: string;
  }>;
}

export default async function VenueScheduleAdminPage({ params }: VenueScheduleAdminPageProps) {
  const { organizationId, venueId } = await params;
  const result = await getVenueScheduleAdminData(organizationId, venueId);

  if (!result.success) {
    notFound();
  }

  return (
    <Container maxWidth="lg">
      <Stack spacing={4} sx={{ py: 4 }}>
        <Typography variant="h4" component="h1">
          Venue Schedule
        </Typography>
        <ScheduleBlockEditor organizationId={organizationId} venueId={venueId} />
        <VenueScheduleCalendar blocks={result.data.scheduleBlocks} />
      </Stack>
    </Container>
  );
}

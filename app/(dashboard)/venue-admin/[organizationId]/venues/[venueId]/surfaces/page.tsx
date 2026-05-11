import { notFound } from "next/navigation";
import { Container, Stack, Typography } from "@mui/material";
import { getVenueScheduleAdminData } from "@/lib/actions/venue-schedules";
import { IceSurfaceManager, OperatingHoursEditor } from "@/components/features/venue-admin";

interface VenueSurfacesPageProps {
  params: Promise<{
    organizationId: string;
    venueId: string;
  }>;
}

export default async function VenueSurfacesPage({ params }: VenueSurfacesPageProps) {
  const { organizationId, venueId } = await params;
  const result = await getVenueScheduleAdminData(organizationId, venueId);

  if (!result.success) {
    notFound();
  }

  return (
    <Container maxWidth="lg">
      <Stack spacing={4} sx={{ py: 4 }}>
        <Typography variant="h4" component="h1">
          Surfaces and Operating Hours
        </Typography>
        <IceSurfaceManager organizationId={organizationId} venueId={venueId} surfaces={result.data.surfaces} />
        <OperatingHoursEditor organizationId={organizationId} venueId={venueId} operatingHours={result.data.operatingHours} />
      </Stack>
    </Container>
  );
}

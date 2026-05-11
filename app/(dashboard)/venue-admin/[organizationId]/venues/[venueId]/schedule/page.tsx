import { notFound } from "next/navigation";
import { Container, Stack, Typography } from "@mui/material";
import { getVenueScheduleAdminData } from "@/lib/actions/venue-schedules";
import {
  IceSurfaceManager,
  OperatingHoursEditor,
  ScheduleBlockEditor,
  VenueScheduleCalendar,
} from "@/components/features/venue-admin";

interface VenueSchedulePageProps {
  params: Promise<{
    organizationId: string;
    venueId: string;
  }>;
}

interface SurfaceSummary {
  id: string;
  name: string;
  surfaceType: string;
  isActive: boolean;
  capacity?: number | null;
}

interface OperatingHourSummary {
  id: string;
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
  status: string;
}

interface ScheduleBlockSummary {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  activityType: string;
  status: string;
}

export default async function VenueSchedulePage({ params }: VenueSchedulePageProps) {
  const { organizationId, venueId } = await params;
  const result = await getVenueScheduleAdminData(venueId);

  if (!result.success) {
    notFound();
  }

  const surfaces = result.data.surfaces as SurfaceSummary[];
  const operatingHours = result.data.operatingHours as OperatingHourSummary[];
  const scheduleBlocks = result.data.scheduleBlocks as ScheduleBlockSummary[];

  return (
    <Container maxWidth="lg">
      <Stack spacing={3} sx={{ py: 4 }}>
        <Typography variant="h4" component="h1">
          Manage Venue Schedule
        </Typography>
        <IceSurfaceManager organizationId={organizationId} venueId={venueId} surfaces={surfaces} />
        <OperatingHoursEditor organizationId={organizationId} venueId={venueId} operatingHours={operatingHours} />
        <ScheduleBlockEditor organizationId={organizationId} venueId={venueId} />
        <VenueScheduleCalendar blocks={scheduleBlocks} />
      </Stack>
    </Container>
  );
}
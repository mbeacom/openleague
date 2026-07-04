import { notFound } from "next/navigation";
import { TZDate } from "@date-fns/tz";
import { Container, Stack, Typography } from "@mui/material";
import {
  getVenueScheduleAdminData,
  getVenueScheduleBoard,
} from "@/lib/actions/venue-schedules";
import { resolveTimeZone } from "@/lib/utils/date";
import { IceSurfaceManager, OperatingHoursEditor } from "@/components/features/venue-admin";
import { VenueScheduleBoard } from "@/components/features/venue-admin/VenueScheduleBoard";

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

export default async function VenueSchedulePage({ params }: VenueSchedulePageProps) {
  const { organizationId, venueId } = await params;
  const result = await getVenueScheduleAdminData(organizationId, venueId);

  if (!result.success) {
    notFound();
  }

  const surfaces = result.data.surfaces as SurfaceSummary[];
  const operatingHours = result.data.operatingHours as OperatingHourSummary[];
  const timeZone = resolveTimeZone(result.data.timezone);

  // Initial board window: the current week, starting Sunday at midnight in
  // the VENUE's timezone — not the server's local zone (UTC on Vercel) — so
  // the board's days line up with the rink's wall clock. The client owns week
  // navigation from here, stepping in the same zone.
  const nowZoned = new TZDate(new Date().getTime(), timeZone);
  const weekStart = new Date(
    new TZDate(
      nowZoned.getFullYear(),
      nowZoned.getMonth(),
      nowZoned.getDate() - nowZoned.getDay(),
      0,
      0,
      0,
      timeZone
    ).getTime()
  );
  const weekStartZoned = new TZDate(weekStart.getTime(), timeZone);
  const weekEnd = new Date(
    new TZDate(
      weekStartZoned.getFullYear(),
      weekStartZoned.getMonth(),
      weekStartZoned.getDate() + 7,
      0,
      0,
      0,
      timeZone
    ).getTime()
  );

  const board = await getVenueScheduleBoard({
    organizationId,
    venueId,
    from: weekStart,
    to: weekEnd,
  });

  return (
    <Container maxWidth="lg">
      <Stack spacing={3} sx={{ py: 4 }}>
        <Typography variant="h4" component="h1">
          Manage Venue Schedule
        </Typography>
        <IceSurfaceManager organizationId={organizationId} venueId={venueId} surfaces={surfaces} />
        <OperatingHoursEditor organizationId={organizationId} venueId={venueId} operatingHours={operatingHours} />
        <VenueScheduleBoard
          organizationId={organizationId}
          venueId={venueId}
          timeZone={timeZone}
          initialFrom={weekStart}
          initialBookings={board.success ? board.data.bookings : []}
          initialSurfaces={board.success ? board.data.surfaces : []}
          initialBlocks={board.success ? board.data.blocks : []}
        />
      </Stack>
    </Container>
  );
}

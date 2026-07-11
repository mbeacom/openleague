import { Box, Divider, Typography } from "@mui/material";
import {
  CalendarMonth as CalendarMonthIcon,
  Event as EventIcon,
} from "@mui/icons-material";
import EventList from "@/components/features/calendar/EventList";
import { getCalendarData } from "@/lib/actions/team-context";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { LinkButton } from "@/components/ui/NextLinkComposites";

export default async function CalendarPage() {
  const data = await getCalendarData();

  if (!data) {
    return (
      <PageContainer>
        <PageHeader title="Calendar" />
        <EmptyState
          icon={<CalendarMonthIcon />}
          title="No team yet"
          description="You are not a member of any team yet. Join or create a team to see its schedule here."
          action={
            <LinkButton href="/dashboard" variant="contained">
              Go to dashboard
            </LinkButton>
          }
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader title="Calendar" subtitle={data.teamName} />

      <Box sx={{ mb: 4 }}>
        <Typography variant="h5" component="h2" gutterBottom>
          Upcoming Events
        </Typography>
        {data.upcomingEvents.length === 0 ? (
          <EmptyState
            icon={<EventIcon />}
            title="No upcoming events"
            description="Games and practices will appear here once they are scheduled."
          />
        ) : (
          <EventList events={data.upcomingEvents} />
        )}
      </Box>

      {data.pastEvents.length > 0 && (
        <>
          <Divider sx={{ my: 4 }} />
          <Box>
            <Typography variant="h5" component="h2" gutterBottom>
              Past Events
            </Typography>
            <EventList
              events={data.pastEvents}
              emptyMessage="No past events"
            />
          </Box>
        </>
      )}
    </PageContainer>
  );
}

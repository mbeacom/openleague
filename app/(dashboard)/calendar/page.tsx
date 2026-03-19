import { Container, Typography, Box, Divider } from "@mui/material";
import EventList from "@/components/features/calendar/EventList";
import { getCalendarData } from "@/lib/actions/team-context";

export default async function CalendarPage() {
  const data = await getCalendarData();

  if (!data) {
    return (
      <Container maxWidth="lg">
        <Box sx={{ py: 4 }}>
          <Typography variant="h4" component="h1" gutterBottom>
            Calendar
          </Typography>
          <Typography variant="body1" color="text.secondary">
            You are not a member of any team yet.
          </Typography>
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Calendar
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          {data.teamName}
        </Typography>

        <Box sx={{ mb: 4 }}>
          <Typography variant="h5" component="h2" gutterBottom>
            Upcoming Events
          </Typography>
          <EventList
            events={data.upcomingEvents}
            emptyMessage="No upcoming events scheduled"
          />
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
      </Box>
    </Container>
  );
}

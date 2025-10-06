import { requireUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { Container, Typography, Box, Divider } from "@mui/material";
import EventList from "@/components/features/calendar/EventList";

export default async function CalendarPage() {
  const userId = await requireUserId();

  // Get user's first team (MVP: single team focus)
  const teamMember = await prisma.teamMember.findFirst({
    where: { userId },
    include: {
      team: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      joinedAt: "desc",
    },
  });

  if (!teamMember) {
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

  // Fetch all team events sorted by date
  const now = new Date();
  const allEvents = await prisma.event.findMany({
    where: {
      teamId: teamMember.team.id,
    },
    orderBy: {
      startAt: "asc",
    },
    select: {
      id: true,
      type: true,
      title: true,
      startAt: true,
      location: true,
      opponent: true,
    },
  });

  // Separate upcoming and past events
  // Convert dates to ISO strings for client component serialization
  type EventWithDate = typeof allEvents[number];
  const upcomingEvents = allEvents
    .filter((event: EventWithDate) => event.startAt >= now)
    .map((event: EventWithDate) => ({
      ...event,
      startAt: event.startAt.toISOString(),
    }));
  const pastEvents = allEvents
    .filter((event: EventWithDate) => event.startAt < now)
    .reverse() // Most recent first
    .map((event: EventWithDate) => ({
      ...event,
      startAt: event.startAt.toISOString(),
    }));

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Calendar
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          {teamMember.team.name}
        </Typography>

        {/* Upcoming Events Section */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h5" component="h2" gutterBottom>
            Upcoming Events
          </Typography>
          <EventList
            events={upcomingEvents}
            emptyMessage="No upcoming events scheduled"
          />
        </Box>

        {/* Past Events Section */}
        {pastEvents.length > 0 && (
          <>
            <Divider sx={{ my: 4 }} />
            <Box>
              <Typography variant="h5" component="h2" gutterBottom>
                Past Events
              </Typography>
              <EventList
                events={pastEvents}
                emptyMessage="No past events"
              />
            </Box>
          </>
        )}
      </Box>
    </Container>
  );
}

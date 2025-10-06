import { requireUserId } from "@/lib/auth/session";
import { getEvent } from "@/lib/actions/events";
import { Box, Container, Divider } from "@mui/material";
import { redirect, notFound } from "next/navigation";
import EventDetail from "@/components/features/events/EventDetail";
import RSVPButtons from "@/components/features/events/RSVPButtons";
import AttendanceView from "@/components/features/events/AttendanceView";

interface EventPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function EventPage({ params }: EventPageProps) {
  const userId = await requireUserId();
  const { id } = await params;

  try {
    const event = await getEvent(id);

    if (!event) {
      notFound();
    }

    const isAdmin = event.userRole === "ADMIN";

    // Find current user's RSVP
    const userRSVP = event.rsvps.find(
      (rsvp: { user: { id: string } }) => rsvp.user.id === userId
    );
    const currentStatus = userRSVP?.status || "NO_RESPONSE";

    return (
      <Container maxWidth="lg">
        <Box sx={{ py: 4 }}>
          <EventDetail
            event={{
              id: event.id,
              type: event.type,
              title: event.title,
              startAt: event.startAt,
              location: event.location,
              opponent: event.opponent,
              notes: event.notes,
              team: event.team,
            }}
            userRole={event.userRole}
          />

          <Divider sx={{ my: 4 }} />

          <RSVPButtons eventId={event.id} currentStatus={currentStatus} />

          {isAdmin && (
            <>
              <Divider sx={{ my: 4 }} />
              <AttendanceView rsvps={event.rsvps} />
            </>
          )}
        </Box>
      </Container>
    );
  } catch (error) {
    console.error("Error loading event:", error);
    redirect("/calendar");
  }
}

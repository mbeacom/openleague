import { requireUserId } from "@/lib/auth/session";
import { getEvent } from "@/lib/actions/events";
import { Box } from "@mui/material";
import { redirect, notFound } from "next/navigation";
import EventForm from "@/components/features/events/EventForm";
import { PageContainer } from "@/components/ui/PageContainer";
import { getEventReservationOptions } from "../../venue-reservation-options";

interface EditEventPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function EditEventPage({ params }: EditEventPageProps) {
  const [, { id }] = await Promise.all([
    requireUserId(),
    params,
  ]);

  const event = await getEvent(id);

  if (!event) {
    notFound();
  }

  // Only admins can edit events
  if (event.userRole !== "ADMIN") {
    redirect(`/events/${id}`);
  }
  const reservations = await getEventReservationOptions(event.teamId, event.id);

  return (
    <PageContainer maxWidth="md">
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <EventForm
          teamId={event.teamId}
          eventId={event.id}
          reservations={reservations}
          initialData={{
            type: event.type as "GAME" | "PRACTICE",
            title: event.title,
            startAt: event.startAt,
            endAt: event.endAt ?? undefined,
            timezone: event.timezone,
            location: event.location,
            venueId: event.venueId ?? undefined,
            reservationId: event.venueReservationId ?? undefined,
            opponent: event.opponent || "",
            notes: event.notes || "",
          }}
        />
      </Box>
    </PageContainer>
  );
}

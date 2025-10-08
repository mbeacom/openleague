import { requireUserId } from "@/lib/auth/session";
import { getEvent } from "@/lib/actions/events";
import { Box, Container } from "@mui/material";
import { redirect, notFound } from "next/navigation";
import EventForm from "@/components/features/events/EventForm";

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

    return (
      <Container maxWidth="md">
        <Box
          sx={{
            py: 4,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <EventForm
            teamId={event.teamId}
            eventId={event.id}
            initialData={{
              type: event.type as "GAME" | "PRACTICE",
              title: event.title,
              startAt: event.startAt,
              location: event.location,
              opponent: event.opponent || "",
              notes: event.notes || "",
            }}
          />
        </Box>
      </Container>
    );
}

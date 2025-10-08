import { requireUserId } from "@/lib/auth/session";
import { getEvent } from "@/lib/actions/events";
import { Box, Container } from "@mui/material";
import { notFound } from "next/navigation";
import EventDetail from "@/components/features/events/EventDetail";

interface EventPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function EventPage({ params }: EventPageProps) {
  const [userId, { id }] = await Promise.all([
    requireUserId(),
    params,
  ]);

  const event = await getEvent(id);

  if (!event) {
    notFound();
  }

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <EventDetail
          event={event}
          userRole={event.userRole}
          currentUserId={userId}
        />
      </Box>
    </Container>
  );
}

import { notFound } from "next/navigation";
import { Alert, Container, Stack } from "@mui/material";
import { getPublicSignupEvent } from "@/lib/actions/signup-events";
import { getMyEventAssignments, getPublicEventGames } from "@/lib/actions/event-teams";
import { PublicEventView } from "@/components/features/signup-events/PublicEventView";
import { getCurrentUserId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function PublicEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ registration?: string }>;
}) {
  const [{ eventId }, { registration }] = await Promise.all([params, searchParams]);
  const [view, userId, games, myAssignments] = await Promise.all([
    getPublicSignupEvent({ eventId }),
    getCurrentUserId(),
    getPublicEventGames(eventId),
    getMyEventAssignments(eventId),
  ]);
  if (!view) {
    notFound();
  }

  return (
    <Container maxWidth="md">
      <Stack spacing={3} sx={{ py: { xs: 4, md: 6 } }}>
        {registration === "success" ? (
          <Alert severity="success">
            Payment received — we&apos;re confirming your spot. It will appear under My
            Registrations once your payment finishes processing.
          </Alert>
        ) : null}
        {registration === "canceled" ? (
          <Alert severity="warning">Checkout was canceled — you have not been charged.</Alert>
        ) : null}
        <PublicEventView
          view={view}
          isAuthenticated={Boolean(userId)}
          loginRedirect={`/events/${eventId}`}
          games={games}
          myAssignments={myAssignments}
        />
      </Stack>
    </Container>
  );
}

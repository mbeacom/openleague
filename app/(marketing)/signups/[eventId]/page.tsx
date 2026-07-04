import { notFound } from "next/navigation";
import { Alert, Container, Stack } from "@mui/material";
import { getPublicSignupEvent } from "@/lib/actions/signup-events";
import { getEventStandings, getMyEventAssignments, getPublicEventGames } from "@/lib/actions/event-teams";
import { listEventMedia } from "@/lib/actions/event-media";
import { PublicEventView } from "@/components/features/signup-events/PublicEventView";
import { MediaGallery } from "@/components/features/signup-events/MediaGallery";
import { StandingsTable } from "@/components/features/signup-events/StandingsTable";
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
  const [view, userId, games, myAssignments, gallery, standings] = await Promise.all([
    getPublicSignupEvent({ eventId }),
    getCurrentUserId(),
    getPublicEventGames(eventId),
    getMyEventAssignments(eventId),
    listEventMedia({ eventId }),
    getEventStandings(eventId),
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
          loginRedirect={`/signups/${eventId}`}
          games={games}
          myAssignments={myAssignments}
        />
        {standings ? <StandingsTable standings={standings} /> : null}
        {gallery ? (
          <MediaGallery
            eventId={eventId}
            items={gallery.items}
            canUpload={gallery.canUpload}
            canModerate={gallery.canModerate}
          />
        ) : null}
      </Stack>
    </Container>
  );
}

import { notFound } from "next/navigation";
import { Container, Stack } from "@mui/material";
import { getPublicSignupEvent } from "@/lib/actions/signup-events";
import { getEventStandings, getMyEventAssignments, getPublicEventGames } from "@/lib/actions/event-teams";
import { listEventMedia } from "@/lib/actions/event-media";
import { PublicEventView } from "@/components/features/signup-events/PublicEventView";
import { MediaGallery } from "@/components/features/signup-events/MediaGallery";
import { StandingsTable } from "@/components/features/signup-events/StandingsTable";
import { getCurrentUserId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function LinkAccessEventPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [view, userId] = await Promise.all([
    getPublicSignupEvent({ linkToken: token }),
    getCurrentUserId(),
  ]);
  if (!view) {
    notFound();
  }

  const [games, myAssignments, gallery, standings] = await Promise.all([
    getPublicEventGames(view.event.id, token),
    getMyEventAssignments(view.event.id),
    listEventMedia({ eventId: view.event.id, linkToken: token }),
    getEventStandings(view.event.id, token),
  ]);

  return (
    <Container maxWidth="md">
      <Stack sx={{ py: { xs: 4, md: 6 } }}>
        <PublicEventView
          view={view}
          isAuthenticated={Boolean(userId)}
          loginRedirect={`/signups/l/${token}`}
          linkToken={token}
          games={games}
          myAssignments={myAssignments}
        />
        {standings ? <StandingsTable standings={standings} /> : null}
        {gallery ? (
          <MediaGallery
            eventId={view.event.id}
            items={gallery.items}
            canUpload={gallery.canUpload}
            canModerate={gallery.canModerate}
          />
        ) : null}
      </Stack>
    </Container>
  );
}

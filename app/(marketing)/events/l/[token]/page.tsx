import { notFound } from "next/navigation";
import { Container, Stack } from "@mui/material";
import { getPublicSignupEvent } from "@/lib/actions/signup-events";
import { getMyEventAssignments, getPublicEventGames } from "@/lib/actions/event-teams";
import { PublicEventView } from "@/components/features/signup-events/PublicEventView";
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

  const [games, myAssignments] = await Promise.all([
    getPublicEventGames(view.event.id, token),
    getMyEventAssignments(view.event.id),
  ]);

  return (
    <Container maxWidth="md">
      <Stack sx={{ py: { xs: 4, md: 6 } }}>
        <PublicEventView
          view={view}
          isAuthenticated={Boolean(userId)}
          loginRedirect={`/events/l/${token}`}
          linkToken={token}
          games={games}
          myAssignments={myAssignments}
        />
      </Stack>
    </Container>
  );
}

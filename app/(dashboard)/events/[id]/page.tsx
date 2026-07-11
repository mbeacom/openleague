import { requireUserId } from "@/lib/auth/session";
import { getEvent } from "@/lib/actions/events";
import { getEventAttendance } from "@/lib/actions/rsvp";
import { getMyPlayers } from "@/lib/actions/guardians";
import { notFound } from "next/navigation";
import EventDetail, {
  type GuardedPlayerRsvp,
} from "@/components/features/events/EventDetail";
import { PageContainer } from "@/components/ui/PageContainer";

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

  // Identity graph (Tier 3): guardian context for per-child RSVP rows and the
  // server-computed attendance view (player-level entries with attribution).
  const [myPlayersResult, attendanceResult] = await Promise.all([
    event.canRSVP ? getMyPlayers() : null,
    event.canManageEvent ? getEventAttendance(id) : null,
  ]);

  // Players the viewer guards (with canRsvp) on this event's team, each with
  // their current per-child status for this event. Empty for single-identity
  // users → EventDetail renders exactly the pre-Tier-3 UI.
  const guardedPlayers: GuardedPlayerRsvp[] =
    myPlayersResult?.success
      ? myPlayersResult.data
          .filter(
            (player) => player.teamId === event.team.id && player.canRsvp
          )
          .map((player) => ({
            playerId: player.playerId,
            playerName: player.playerName,
            status:
              player.upcoming.find((entry) => entry.eventId === id)
                ?.myChildStatus ??
              event.rsvps.find((rsvp) => rsvp.playerId === player.playerId)
                ?.status ??
              "NO_RESPONSE",
          }))
      : [];

  const attendance = attendanceResult?.success ? attendanceResult.data : null;

  return (
    <PageContainer>
      <EventDetail
        event={event}
        userRole={event.userRole}
        currentUserId={userId}
        guardedPlayers={guardedPlayers}
        attendance={attendance}
      />
    </PageContainer>
  );
}

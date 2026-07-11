import { notFound } from "next/navigation";
import { Place as PlaceIcon } from "@mui/icons-material";
import { prisma } from "@/lib/db/prisma";
import { requireUserId, getUserLeagueRole } from "@/lib/auth/session";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { LinkButton } from "@/components/ui/NextLinkComposites";
import VenueList from "@/components/features/venues/VenueList";

interface LeagueVenuesPageProps {
  params: Promise<{
    leagueId: string;
  }>;
}

/**
 * League-scoped venue list (roadmap D1): venues owned by the league plus
 * venues owned by the league's teams that are visible beyond the owning team.
 * Read-only v1 — cards link through to /venues/[id].
 */
export default async function LeagueVenuesPage({ params }: LeagueVenuesPageProps) {
  const [userId, { leagueId }] = await Promise.all([requireUserId(), params]);

  const role = await getUserLeagueRole(userId, leagueId);
  if (!role) {
    notFound();
  }
  const isLeagueAdmin = role === "LEAGUE_ADMIN";

  const league = await prisma.league.findFirst({
    where: { id: leagueId, isActive: true },
    select: { id: true, name: true },
  });

  if (!league) {
    notFound();
  }

  const venues = await prisma.venue.findMany({
    where: {
      isActive: true,
      OR: [
        { leagueId },
        // Team-owned venues stay hidden here when visibility is TEAM.
        { team: { leagueId }, visibility: { in: ["PUBLIC", "LEAGUE"] } },
      ],
    },
    select: {
      id: true,
      name: true,
      address: true,
      city: true,
      state: true,
      surfaceType: true,
      capacity: true,
      visibility: true,
      isActive: true,
      team: { select: { id: true, name: true } },
      league: { select: { id: true, name: true } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <PageContainer>
      <PageHeader
        title="League Venues"
        subtitle={`Rinks, fields, and facilities used across ${league.name}.`}
      />
      {venues.length === 0 ? (
        <EmptyState
          icon={<PlaceIcon />}
          title="No venues in this league yet"
          description={
            isLeagueAdmin
              ? "Add a venue to start scheduling games and practices across your league."
              : "League admins haven't added any venues yet."
          }
          action={
            isLeagueAdmin ? (
              <LinkButton href="/venues/new" variant="contained">
                Add Venue
              </LinkButton>
            ) : undefined
          }
        />
      ) : (
        <VenueList venues={venues} isAdmin={isLeagueAdmin} />
      )}
    </PageContainer>
  );
}

import { Suspense } from "react";
import { Box, Container, Typography, Card, CardContent, Chip, Stack } from "@mui/material";
import { LinkButton } from "@/components/ui/NextLinkComposites";
import OnboardingFlow from "@/components/features/onboarding/OnboardingFlow";
import CreateTeamDisclosure from "@/components/features/dashboard/CreateTeamDisclosure";
import TeamCard from "@/components/features/dashboard/TeamCard";
import UpcomingScheduleWidget, {
  UpcomingScheduleWidgetSkeleton,
} from "@/components/features/dashboard/widgets/UpcomingScheduleWidget";
import NeedsRsvpWidget, {
  NeedsRsvpWidgetSkeleton,
} from "@/components/features/dashboard/widgets/NeedsRsvpWidget";
import AdminAttentionWidget, {
  AdminAttentionWidgetSkeleton,
} from "@/components/features/dashboard/widgets/AdminAttentionWidget";
import MyLeaguesWidget, {
  MyLeaguesWidgetSkeleton,
} from "@/components/features/dashboard/widgets/MyLeaguesWidget";
import RecentMessagesWidget, {
  RecentMessagesWidgetSkeleton,
} from "@/components/features/dashboard/widgets/RecentMessagesWidget";
import { getViewerMemberships } from "@/lib/data/dashboard";
import { getTeamVenueRelationships } from "@/lib/actions/venue-relationships";
import { requireUserId } from "@/lib/auth/session";

export default async function DashboardPage() {
  const userId = await requireUserId();
  const { teams, leagues } = await getViewerMemberships(userId);

  if (teams.length === 0 && leagues.length === 0) {
    return (
      <Container maxWidth="md">
        <OnboardingFlow />
      </Container>
    );
  }

  const isLeagueMode = leagues.length > 0;
  const teamIds = teams.map((membership) => membership.team.id);

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          {isLeagueMode ? "League Dashboard" : "My Teams"}
        </Typography>

        {teams.length > 0 && (
          <>
            {isLeagueMode && (
              <Typography variant="h5" component="h2" gutterBottom>
                My Teams
              </Typography>
            )}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  sm: "repeat(2, 1fr)",
                  md: "repeat(3, 1fr)",
                },
                gap: 3,
                mt: 2,
              }}
            >
              {teams.map((membership) => (
                <TeamCard
                  key={membership.team.id}
                  team={membership.team}
                  role={membership.role}
                  showLeagueInfo={isLeagueMode}
                  showStats
                />
              ))}
            </Box>
          </>
        )}

        {/* Widget stack (decision D7 order). Each widget is an independent
            async RSC that streams in behind its own Suspense fallback. */}
        <Stack spacing={4} sx={{ mt: 4 }}>
          <Suspense fallback={<UpcomingScheduleWidgetSkeleton />}>
            <UpcomingScheduleWidget userId={userId} />
          </Suspense>
          <Suspense fallback={<NeedsRsvpWidgetSkeleton />}>
            <NeedsRsvpWidget userId={userId} />
          </Suspense>
          <Suspense fallback={<AdminAttentionWidgetSkeleton />}>
            <AdminAttentionWidget userId={userId} />
          </Suspense>
          <Suspense fallback={<MyLeaguesWidgetSkeleton />}>
            <MyLeaguesWidget userId={userId} />
          </Suspense>
          {isLeagueMode && (
            <Suspense fallback={<RecentMessagesWidgetSkeleton />}>
              <RecentMessagesWidget userId={userId} />
            </Suspense>
          )}
          <Suspense fallback={null}>
            <VenueRelationshipsSection teamIds={teamIds} />
          </Suspense>
        </Stack>

        <Box sx={{ mt: 4 }}>
          <CreateTeamDisclosure
            label={teams.length > 0 ? "Create Another Team" : "Create Team"}
          />
        </Box>
      </Box>
    </Container>
  );
}

async function VenueRelationshipsSection({ teamIds }: { teamIds: string[] }) {
  const venueRelationships = await getTeamVenueRelationships(teamIds);
  if (venueRelationships.length === 0) return null;

  return (
    <Box component="section">
      <Typography variant="h5" component="h2" gutterBottom>
        Preferred and home rinks
      </Typography>
      <Stack spacing={1.5}>
        {venueRelationships.map((relationship) => (
          <Card key={relationship.id} variant="outlined">
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Typography variant="subtitle1">{relationship.venue.name}</Typography>
                <Chip size="small" label={relationship.relationshipType} />
                {relationship.venue.slug ? (
                  <LinkButton href={`/rinks/${relationship.venue.slug}`} size="small">
                    View rink
                  </LinkButton>
                ) : null}
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Stack>
    </Box>
  );
}

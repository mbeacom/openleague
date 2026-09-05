import { Suspense } from "react";
import { Box, Card, CardContent, Chip, Stack, Typography } from "@mui/material";
import { LinkButton } from "@/components/ui/NextLinkComposites";
import { PageContainer } from "@/components/ui/PageContainer";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Crest } from "@/components/ui/Crest";
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

const TEAM_GRID = {
  display: "grid",
  gridTemplateColumns: {
    xs: "1fr",
    sm: "repeat(2, 1fr)",
    md: "repeat(3, 1fr)",
  },
  gap: 2,
} as const;

export default async function DashboardPage() {
  const userId = await requireUserId();
  const { teams, leagues } = await getViewerMemberships(userId);

  if (teams.length === 0 && leagues.length === 0) {
    return (
      <PageContainer maxWidth="md">
        <OnboardingFlow />
      </PageContainer>
    );
  }

  const isLeagueMode = leagues.length > 0;
  const teamIds = teams.map((membership) => membership.team.id);

  return (
    <PageContainer>
      <Box sx={{ mb: 4 }}>
        <Typography
          component="p"
          sx={{
            fontSize: "0.6875rem",
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "text.secondary",
            mb: 0.5,
          }}
        >
          {isLeagueMode ? "League dashboard" : "Dashboard"}
        </Typography>
        <Typography
          variant="h4"
          component="h1"
          sx={{ fontWeight: 800, letterSpacing: "-0.02em" }}
        >
          Your season at a glance
        </Typography>
      </Box>

      {teams.length > 0 && (
        <Box component="section" sx={{ mb: 4 }}>
          <SectionHeader title="My teams" badge={teams.length} />
          <Box sx={TEAM_GRID}>
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
          {/* The disclosure expands a full form, so it sits under the grid
              rather than in the header's action slot. */}
          <Box sx={{ mt: 2 }}>
            <CreateTeamDisclosure label="Create another team" />
          </Box>
        </Box>
      )}

      {/* Widget stack (decision D7 order). Each widget is an independent
          async RSC that streams in behind its own Suspense fallback. */}
      <Stack spacing={4}>
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

      {teams.length === 0 ? (
        <Box sx={{ mt: 4 }}>
          <CreateTeamDisclosure label="Create team" />
        </Box>
      ) : null}
    </PageContainer>
  );
}

async function VenueRelationshipsSection({ teamIds }: { teamIds: string[] }) {
  const venueRelationships = await getTeamVenueRelationships(teamIds);
  if (venueRelationships.length === 0) return null;

  return (
    <Box component="section">
      <SectionHeader title="Home and preferred rinks" badge={venueRelationships.length} />
      <Stack spacing={1.5}>
        {venueRelationships.map((relationship) => (
          <Card key={relationship.id} variant="outlined">
            <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
              <Stack
                direction="row"
                spacing={1.5}
                alignItems="center"
                flexWrap="wrap"
                useFlexGap
              >
                <Crest
                  name={relationship.venue.name}
                  id={relationship.venue.id}
                  logoUrl={relationship.venue.logoUrl}
                  size="sm"
                />
                <Typography variant="subtitle1" sx={{ fontWeight: 600, flex: 1 }}>
                  {relationship.venue.name}
                </Typography>
                <Chip size="small" variant="outlined" label={relationship.relationshipType} />
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

import { Box, Container, Typography, Card, CardContent, Chip, Stack } from "@mui/material";
import { LinkButton, LinkCard } from "@/components/ui/NextLinkComposites";
import {
  SportsHockey as SportsHockeyIcon,
  AccessTime as ClockIcon,
  CalendarToday as CalendarIcon,
  ArrowForward as ArrowForwardIcon,
} from "@mui/icons-material";
import OnboardingFlow from "@/components/features/onboarding/OnboardingFlow";
import CreateTeamDisclosure from "@/components/features/dashboard/CreateTeamDisclosure";
import TeamCard from "@/components/features/dashboard/TeamCard";
import { getUserMode } from "@/lib/utils/league-mode";
import { getDashboardData } from "@/lib/actions/team-context";
import { getTeamVenueRelationships } from "@/lib/actions/venue-relationships";
import { requireUserId } from "@/lib/auth/session";
import { formatSport } from "@/lib/utils/validation";
import type { LeagueRole } from "@prisma/client";

const LEAGUE_ROLE_LABELS: Record<LeagueRole, string> = {
  LEAGUE_ADMIN: "League Admin",
  TEAM_ADMIN: "Team Admin",
  MEMBER: "Member",
};

const LEAGUE_ROLE_COLORS: Record<LeagueRole, "primary" | "secondary" | "default"> = {
  LEAGUE_ADMIN: "primary",
  TEAM_ADMIN: "secondary",
  MEMBER: "default",
};

export default async function DashboardPage() {
  const userId = await requireUserId();

  const [userMode, { teams, upcomingPractices, venueRelationships }] = await Promise.all([
    getUserMode(userId),
    getDashboardData().then(async (data) => ({
      ...data,
      venueRelationships: await getTeamVenueRelationships(
        data.teams.map((teamMember) => teamMember.team.id)
      ),
    })),
  ]);

  if (teams.length === 0 && userMode.leagues.length === 0) {
    return (
      <Container maxWidth="md">
        <OnboardingFlow />
      </Container>
    );
  }

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        {userMode.isLeagueMode ? (
          <>
            <Typography variant="h4" component="h1" gutterBottom>
              League Dashboard
            </Typography>

            {userMode.leagues.length > 0 && (
              <Box sx={{ mb: 4 }}>
                <Typography variant="h5" component="h2" gutterBottom>
                  My Leagues
                </Typography>
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: {
                      xs: "1fr",
                      sm: "repeat(2, 1fr)",
                      md: "repeat(3, 1fr)",
                    },
                    gap: 2,
                    mb: 3,
                  }}
                >
                  {userMode.leagues.map((league) => (
                    <LinkCard
                      key={league.id}
                      variant="outlined"
                      href={`/league/${league.id}/dashboard`}
                      sx={{
                        textDecoration: "none",
                        color: "inherit",
                        transition: "all 0.2s",
                        "&:hover": {
                          borderColor: "primary.main",
                          boxShadow: 1,
                        },
                      }}
                    >
                      <CardContent>
                        <Typography variant="h6" component="h3" gutterBottom>
                          {league.name}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {formatSport(league.sport)}
                        </Typography>
                        <Chip
                          label={LEAGUE_ROLE_LABELS[league.role]}
                          size="small"
                          color={LEAGUE_ROLE_COLORS[league.role]}
                          sx={{ mt: 1 }}
                        />
                      </CardContent>
                    </LinkCard>
                  ))}
                </Box>
              </Box>
            )}

            <Typography variant="h5" component="h2" gutterBottom>
              My Teams
            </Typography>
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
              {teams.map((teamMember) => (
                <TeamCard
                  key={teamMember.team.id}
                  team={teamMember.team}
                  role={teamMember.role}
                  showLeagueInfo={true}
                />
              ))}
            </Box>
          </>
        ) : (
          <>
            <Typography variant="h4" component="h1" gutterBottom>
              My Teams
            </Typography>

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  sm: "repeat(2, 1fr)",
                  md: "repeat(3, 1fr)",
                },
                gap: 3,
                mt: 3,
              }}
            >
              {teams.map((teamMember) => (
                <TeamCard
                  key={teamMember.team.id}
                  team={teamMember.team}
                  role={teamMember.role}
                  showLeagueInfo={false}
                />
              ))}
            </Box>
          </>
        )}

        {!userMode.isLeagueMode && upcomingPractices.length > 0 && (
          <Box sx={{ mt: 4 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Typography variant="h5" component="h2">
                Upcoming Practices
              </Typography>
              <LinkButton
                href="/practice-planner"
                endIcon={<ArrowForwardIcon />}
                size="small"
              >
                View All
              </LinkButton>
            </Stack>
            <Stack spacing={1.5}>
              {upcomingPractices.map((practice) => (
                <LinkCard
                  key={practice.id}
                  variant="outlined"
                  href={`/practice-planner/${practice.id}`}
                  sx={{
                    textDecoration: "none",
                    color: "inherit",
                    transition: "all 0.2s",
                    "&:hover": {
                      borderColor: "primary.main",
                      boxShadow: 1,
                    },
                  }}
                >
                  <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Stack direction="row" alignItems="center" spacing={1.5}>
                        <SportsHockeyIcon sx={{ color: "primary.main", fontSize: 20 }} />
                        <Box>
                          <Typography variant="subtitle2" fontWeight={600}>
                            {practice.title}
                          </Typography>
                          <Stack direction="row" spacing={1.5} sx={{ color: "text.secondary" }}>
                            <Stack direction="row" alignItems="center" spacing={0.5}>
                              <CalendarIcon sx={{ fontSize: 13 }} />
                              <Typography variant="caption">
                                {new Date(practice.date).toLocaleDateString("en-US", {
                                  weekday: "short",
                                  month: "short",
                                  day: "numeric",
                                })}
                              </Typography>
                            </Stack>
                            <Stack direction="row" alignItems="center" spacing={0.5}>
                              <ClockIcon sx={{ fontSize: 13 }} />
                              <Typography variant="caption">
                                {practice.duration} min
                              </Typography>
                            </Stack>
                            <Typography variant="caption">
                              {practice.playCount} play{practice.playCount !== 1 ? "s" : ""}
                            </Typography>
                          </Stack>
                        </Box>
                      </Stack>
                    </Stack>
                  </CardContent>
                </LinkCard>
              ))}
            </Stack>
          </Box>
        )}

        {venueRelationships.length > 0 && (
          <Box sx={{ mt: 4 }}>
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
        )}

        <Box sx={{ mt: 4 }}>
          <CreateTeamDisclosure
            label={teams.length > 0 ? "Create Another Team" : "Create Team"}
          />
        </Box>
      </Box>
    </Container>
  );
}

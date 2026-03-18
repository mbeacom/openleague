import { requireUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { Box, Container, Typography, Card, CardContent, Chip, Stack, Button } from "@mui/material";
import Link from "next/link";
import {
  SportsHockey as SportsHockeyIcon,
  AccessTime as ClockIcon,
  CalendarToday as CalendarIcon,
  ArrowForward as ArrowForwardIcon,
} from "@mui/icons-material";
import CreateTeamForm from "@/components/features/team/CreateTeamForm";
import TeamCard from "@/components/features/dashboard/TeamCard";
import { getUserMode } from "@/lib/utils/league-mode";

export default async function DashboardPage() {
  const userId = await requireUserId();

  // Get user mode and context
  const userMode = await getUserMode(userId);

  // Fetch user's teams with league information
  const teams = await prisma.teamMember.findMany({
    where: { userId },
    include: {
      team: {
        select: {
          id: true,
          name: true,
          sport: true,
          season: true,
          leagueId: true,
          league: {
            select: {
              id: true,
              name: true,
            },
          },
          division: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
    orderBy: {
      joinedAt: "desc",
    },
  });

  // Fetch upcoming practice sessions for the user's first team
  const firstTeam = teams[0]?.team;
  const upcomingPractices = firstTeam
    ? await prisma.practiceSession.findMany({
        where: {
          teamId: firstTeam.id,
          date: { gte: new Date() },
          OR: [
            { isShared: true },
            { createdById: userId },
          ],
        },
        orderBy: { date: "asc" },
        take: 3,
        include: {
          _count: { select: { plays: true } },
        },
      })
    : [];

  // If user has no teams, show empty state with create team form
  if (teams.length === 0 && userMode.leagues.length === 0) {
    return (
      <Container maxWidth="md">
        <Box
          sx={{
            minHeight: "80vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            py: 4,
          }}
        >
          <Typography
            variant="h4"
            component="h1"
            gutterBottom
            sx={{ textAlign: "center", mb: 2 }}
          >
            Welcome to OpenLeague
          </Typography>
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{ textAlign: "center", mb: 4, maxWidth: 500 }}
          >
            Get started by creating your first team. You&apos;ll be able to manage
            your roster, schedule events, and track attendance all in one place.
          </Typography>
          <CreateTeamForm />
        </Box>
      </Container>
    );
  }

  // Display dashboard based on user mode
  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        {userMode.isLeagueMode ? (
          // League Mode Dashboard
          <>
            <Typography variant="h4" component="h1" gutterBottom>
              League Dashboard
            </Typography>
            
            {/* League Overview */}
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
                    <Card key={league.id} variant="outlined">
                      <CardContent>
                        <Typography variant="h6" component="h3" gutterBottom>
                          {league.name}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {league.sport}
                        </Typography>
                        <Chip 
                          label="League Admin" 
                          size="small" 
                          color="primary" 
                          sx={{ mt: 1 }}
                        />
                      </CardContent>
                    </Card>
                  ))}
                </Box>
              </Box>
            )}

            {/* Teams in League Mode */}
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
              {teams.map((teamMember: typeof teams[0]) => (
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
          // Single-Team Mode Dashboard (Original)
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
              {teams.map((teamMember: typeof teams[0]) => (
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

        {/* Upcoming Practice Sessions Widget - single team mode only */}
        {!userMode.isLeagueMode && upcomingPractices.length > 0 && (
          <Box sx={{ mt: 4 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Typography variant="h5" component="h2">
                Upcoming Practices
              </Typography>
              <Button
                component={Link}
                href="/practice-planner"
                endIcon={<ArrowForwardIcon />}
                size="small"
              >
                View All
              </Button>
            </Stack>
            <Stack spacing={1.5}>
              {upcomingPractices.map((practice) => (
                <Card
                  key={practice.id}
                  variant="outlined"
                  component={Link}
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
                                {practice.date.toLocaleDateString("en-US", {
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
                              {practice._count.plays} play{practice._count.plays !== 1 ? "s" : ""}
                            </Typography>
                          </Stack>
                        </Box>
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          </Box>
        )}

        {/* Add new team button - available in both modes */}
        <Box sx={{ mt: 4 }}>
          <Typography variant="h5" component="h2" gutterBottom>
            {userMode.isLeagueMode ? "Create New Team" : "Create Another Team"}
          </Typography>
          <CreateTeamForm />
        </Box>
      </Box>
    </Container>
  );
}

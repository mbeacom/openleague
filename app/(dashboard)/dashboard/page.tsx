import { requireUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { Box, Container, Typography, Card, CardContent, Chip } from "@mui/material";
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

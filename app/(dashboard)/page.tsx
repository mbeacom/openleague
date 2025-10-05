import { requireUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { Box, Container, Typography, Card, CardContent } from "@mui/material";
import CreateTeamForm from "@/components/features/team/CreateTeamForm";

export default async function DashboardPage() {
  const userId = await requireUserId();

  // Fetch user's teams
  const teams = await prisma.teamMember.findMany({
    where: { userId },
    include: {
      team: {
        select: {
          id: true,
          name: true,
          sport: true,
          season: true,
        },
      },
    },
    orderBy: {
      joinedAt: "desc",
    },
  });

  // If user has no teams, show empty state with create team form
  if (teams.length === 0) {
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

  // Display user's teams
  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
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
            <Card key={teamMember.team.id}>
              <CardContent>
                <Typography variant="h6" component="h2" gutterBottom>
                  {teamMember.team.name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {teamMember.team.sport} • {teamMember.team.season}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    mt: 1,
                    display: "inline-block",
                    px: 1,
                    py: 0.5,
                    borderRadius: 1,
                    bgcolor: teamMember.role === "ADMIN" ? "primary.main" : "grey.300",
                    color: teamMember.role === "ADMIN" ? "white" : "text.primary",
                  }}
                >
                  {teamMember.role}
                </Typography>
              </CardContent>
            </Card>
          ))}
        </Box>

        {/* Add new team button */}
        <Box sx={{ mt: 4 }}>
          <Typography variant="h5" component="h2" gutterBottom>
            Create Another Team
          </Typography>
          <CreateTeamForm />
        </Box>
      </Box>
    </Container>
  );
}

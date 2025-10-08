import { requireUserId, canUserCreateLeagueGames } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { Container, Box, Typography } from "@mui/material";
import { notFound } from "next/navigation";
import InterTeamGameForm from "@/components/features/events/InterTeamGameForm";

interface NewGamePageProps {
  params: Promise<{
    leagueId: string;
  }>;
}

export default async function NewGamePage({ params }: NewGamePageProps) {
  const userId = await requireUserId();
  const { leagueId } = await params;

  // Verify user has access to this league and can create games
  const leagueUser = await prisma.leagueUser.findFirst({
    where: {
      leagueId,
      userId,
    },
    include: {
      league: {
        select: {
          id: true,
          name: true,
          sport: true,
          isActive: true,
        },
      },
    },
  });

  if (!leagueUser || !leagueUser.league.isActive) {
    notFound();
  }

  // Check if user can create inter-team games (league admin or team admin)
  const canCreateGames = await canUserCreateLeagueGames(userId, leagueId, leagueUser.role);

  if (!canCreateGames) {
    notFound();
  }

  // Fetch all teams in the league
  const teams = await prisma.team.findMany({
    where: {
      leagueId,
      isActive: true,
    },
    include: {
      division: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      name: "asc",
    },
  });

  if (teams.length < 2) {
    return (
      <Container maxWidth="md">
        <Box sx={{ py: 4 }}>
          <Typography variant="h4" component="h1" gutterBottom>
            Schedule Inter-Team Game
          </Typography>
          <Typography variant="body1" color="text.secondary">
            You need at least 2 teams in the league to schedule inter-team games.
          </Typography>
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="md">
      <Box sx={{ py: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Schedule Inter-Team Game
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
          {leagueUser.league.name} • Create a game between two teams
        </Typography>

        <InterTeamGameForm
          leagueId={leagueId}
          teams={teams}
        />
      </Box>
    </Container>
  );
}
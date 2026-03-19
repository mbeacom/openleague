import { Container, Box, Typography } from "@mui/material";
import { notFound } from "next/navigation";
import InterTeamGameForm from "@/components/features/events/InterTeamGameForm";
import { getNewLeagueGameContext } from "@/lib/actions/league-context";

interface NewGamePageProps {
  params: Promise<{ leagueId: string }>;
}

export default async function NewGamePage({ params }: NewGamePageProps) {
  const { leagueId } = await params;

  const data = await getNewLeagueGameContext(leagueId);

  if (!data) {
    notFound();
  }

  if (data.teams.length < 2) {
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
          {data.league.name} • Create a game between two teams
        </Typography>

        <InterTeamGameForm
          leagueId={leagueId}
          teams={data.teams}
        />
      </Box>
    </Container>
  );
}

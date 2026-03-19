import { Container, Box, Typography, Button } from "@mui/material";
import { Add } from "@mui/icons-material";
import Link from "next/link";
import { notFound } from "next/navigation";
import LeagueCalendar from "@/components/features/calendar/LeagueCalendar";
import { getLeagueScheduleData } from "@/lib/actions/league-context";

interface LeagueSchedulePageProps {
  params: Promise<{ leagueId: string }>;
}

export default async function LeagueSchedulePage({ params }: LeagueSchedulePageProps) {
  const { leagueId } = await params;

  const data = await getLeagueScheduleData(leagueId);
  if (!data) {
    notFound();
  }

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <Box sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          mb: 3,
          flexWrap: "wrap",
          gap: 2,
        }}>
          <Box>
            <Typography variant="h4" component="h1" gutterBottom>
              League Schedule
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {data.league.name} • {data.league.sport}
            </Typography>
          </Box>

          {data.canCreateGames && (
            <Button
              component={Link}
              href={`/league/${leagueId}/schedule/new-game`}
              variant="contained"
              startIcon={<Add />}
            >
              Schedule Game
            </Button>
          )}
        </Box>

        <LeagueCalendar
          events={data.events}
          teams={data.teams}
          divisions={data.divisions}
          leagueId={leagueId}
          leagueName={data.league.name}
        />
      </Box>
    </Container>
  );
}

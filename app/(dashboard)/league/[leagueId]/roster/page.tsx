import { Box, Container, Typography, Divider } from "@mui/material";
import { notFound } from "next/navigation";
import LeagueRosterView from "@/components/features/roster/LeagueRosterView";
import LeagueInvitationManager from "@/components/features/roster/LeagueInvitationManager";
import { getLeagueRosterData } from "@/lib/actions/league-context";

interface LeagueRosterPageProps {
  params: Promise<{ leagueId: string }>;
}

export default async function LeagueRosterPage({ params }: LeagueRosterPageProps) {
  const { leagueId } = await params;

  const data = await getLeagueRosterData(leagueId);
  if (!data) {
    notFound();
  }

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 3,
          }}
        >
          <Typography variant="h4" component="h1">
            League Roster - {data.league.name}
          </Typography>
        </Box>

        {data.isLeagueAdmin && (
          <>
            <LeagueInvitationManager
              teams={data.teams}
              invitations={data.invitations}
              leagueId={leagueId}
              isLeagueAdmin={data.isLeagueAdmin}
            />
            <Divider sx={{ my: 4 }} />
          </>
        )}

        <LeagueRosterView
          players={data.players}
          teams={data.teams}
          divisions={data.divisions}
          leagueId={leagueId}
          isLeagueAdmin={data.isLeagueAdmin}
        />
      </Box>
    </Container>
  );
}

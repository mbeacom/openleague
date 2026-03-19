import { Box, Container, Typography } from "@mui/material";
import { notFound } from "next/navigation";
import LeagueInvitationManager from "@/components/features/roster/LeagueInvitationManager";
import { getLeagueInvitationsData } from "@/lib/actions/league-context";

interface LeagueInvitationsPageProps {
  params: Promise<{ leagueId: string }>;
}

export default async function LeagueInvitationsPage({ params }: LeagueInvitationsPageProps) {
  const { leagueId } = await params;

  const data = await getLeagueInvitationsData(leagueId);
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
            Invitations - {data.league.name}
          </Typography>
        </Box>

        <LeagueInvitationManager
          teams={data.teams}
          invitations={data.invitations}
          leagueId={leagueId}
          isLeagueAdmin={data.isLeagueAdmin}
        />
      </Box>
    </Container>
  );
}

import { notFound } from "next/navigation";
import { Box, Button, Container, Divider, Stack, Typography } from "@mui/material";
import { ArrowBack as ArrowBackIcon } from "@mui/icons-material";
import RosterList from "@/components/features/roster/RosterList";
import InvitationManager from "@/components/features/roster/InvitationManager";
import { getTeamRosterDataById } from "@/lib/actions/team-context";

interface TeamRosterPageProps {
  params: Promise<{ teamId: string }>;
}

export default async function TeamRosterPage({ params }: TeamRosterPageProps) {
  const { teamId } = await params;
  const data = await getTeamRosterDataById(teamId);

  if (!data) {
    notFound();
  }

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <Button
          href={`/team/${teamId}`}
          startIcon={<ArrowBackIcon />}
          sx={{ mb: 3 }}
        >
          Back to team
        </Button>

        <Stack
          direction={{ xs: "column", sm: "row" }}
          justifyContent="space-between"
          alignItems={{ xs: "flex-start", sm: "center" }}
          spacing={2}
          sx={{ mb: 3 }}
        >
          <Box>
            <Typography variant="h4" component="h1" fontWeight={800}>
              {data.teamName} roster
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {data.isAdmin ? "Manage players, invitations, and team official IDs." : "View players and team officials."}
            </Typography>
          </Box>
        </Stack>

        {data.isAdmin && (
          <>
            <InvitationManager invitations={data.invitations} teamId={data.teamId} />
            <Divider sx={{ my: 4 }} />
          </>
        )}

        <RosterList
          players={data.players}
          teamMembers={data.teamMembers}
          teamId={data.teamId}
          isAdmin={data.isAdmin}
        />
      </Box>
    </Container>
  );
}
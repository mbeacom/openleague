import { Box, Container, Typography, Divider } from "@mui/material";
import { redirect } from "next/navigation";
import RosterList from "@/components/features/roster/RosterList";
import InvitationManager from "@/components/features/roster/InvitationManager";
import { getRosterData } from "@/lib/actions/team-context";

export default async function RosterPage() {
  const data = await getRosterData();

  if (!data) {
    redirect("/");
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
            Roster
          </Typography>
        </Box>

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

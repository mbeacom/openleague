import { requireUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { Box, Container, Typography, Divider } from "@mui/material";
import { redirect } from "next/navigation";
import RosterList from "@/components/features/roster/RosterList";
import InvitationManager from "@/components/features/roster/InvitationManager";

export default async function RosterPage() {
  const userId = await requireUserId();

  // Get user's first team (MVP: single team focus)
  const teamMember = await prisma.teamMember.findFirst({
    where: { userId },
    include: {
      team: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      joinedAt: "desc",
    },
  });

  // If user has no teams, redirect to dashboard
  if (!teamMember) {
    redirect("/");
  }

  const teamId = teamMember.team.id;
  const isAdmin = teamMember.role === "ADMIN";

  // Fetch roster
  const players = await prisma.player.findMany({
    where: {
      teamId,
    },
    orderBy: {
      name: "asc",
    },
  });

  // Fetch invitations (only for admins)
  const invitations = isAdmin
    ? await prisma.invitation.findMany({
        where: {
          teamId,
        },
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          email: true,
          status: true,
          expiresAt: true,
          createdAt: true,
        },
      })
    : [];

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

        {isAdmin && (
          <>
            <InvitationManager invitations={invitations} teamId={teamId} />
            <Divider sx={{ my: 4 }} />
          </>
        )}

        <RosterList
          players={players}
          teamId={teamId}
          isAdmin={isAdmin}
        />
      </Box>
    </Container>
  );
}

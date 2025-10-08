import { requireUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { Box, Container, Typography } from "@mui/material";
import { notFound } from "next/navigation";
import LeagueInvitationManager from "@/components/features/roster/LeagueInvitationManager";

interface LeagueInvitationsPageProps {
  params: {
    leagueId: string;
  };
}

export default async function LeagueInvitationsPage({ params }: LeagueInvitationsPageProps) {
  const userId = await requireUserId();
  const { leagueId } = params;

  // Verify user has access to this league
  const leagueUser = await prisma.leagueUser.findFirst({
    where: {
      userId,
      leagueId,
      league: { isActive: true },
    },
    include: {
      league: {
        select: {
          id: true,
          name: true,
          sport: true,
        },
      },
    },
  });

  if (!leagueUser) {
    notFound();
  }

  const isLeagueAdmin = leagueUser.role === "LEAGUE_ADMIN";

  // Fetch teams in the league
  const teams = await prisma.team.findMany({
    where: {
      leagueId,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      division: {
        select: {
          name: true,
          ageGroup: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  // Fetch recent invitations for the league (only for league admins)
  const rawInvitations = isLeagueAdmin
    ? await prisma.invitation.findMany({
        where: {
          team: {
            leagueId,
          },
        },
        include: {
          team: {
            select: {
              name: true,
              division: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 50, // Limit to recent invitations
      })
    : [];

  // Serialize dates for client component
  const invitations = rawInvitations.map((inv) => ({
    ...inv,
    expiresAt: inv.expiresAt.toISOString(),
    createdAt: inv.createdAt.toISOString(),
  }));

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
            Invitations - {leagueUser.league.name}
          </Typography>
        </Box>

        <LeagueInvitationManager
          teams={teams}
          invitations={invitations}
          leagueId={leagueId}
          isLeagueAdmin={isLeagueAdmin}
        />
      </Box>
    </Container>
  );
}
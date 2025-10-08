import { requireUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { Box, Container, Typography, Divider } from "@mui/material";
import { notFound } from "next/navigation";
import LeagueRosterView from "@/components/features/roster/LeagueRosterView";
import LeagueInvitationManager from "@/components/features/roster/LeagueInvitationManager";

interface LeagueRosterPageProps {
  params: Promise<{
    leagueId: string;
  }>;
}

export default async function LeagueRosterPage({ params }: LeagueRosterPageProps) {
  const userId = await requireUserId();
  const { leagueId } = await params;

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

  // Fetch data in parallel for better performance
  const [players, teams, divisions, rawInvitations] = await Promise.all([
    // Fetch all players in the league with team and division information
    prisma.player.findMany({
      where: {
        leagueId,
      },
      include: {
        team: {
          select: {
            id: true,
            name: true,
            division: {
              select: {
                id: true,
                name: true,
                ageGroup: true,
                skillLevel: true,
              },
            },
          },
        },
        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
      orderBy: [
        { team: { name: "asc" } },
        { name: "asc" },
      ],
    }),
    // Fetch teams for filtering
    prisma.team.findMany({
      where: {
        leagueId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        divisionId: true,
        division: {
          select: {
            name: true,
            ageGroup: true,
          },
        },
      },
      orderBy: { name: "asc" },
    }),
    // Fetch divisions for filtering
    prisma.division.findMany({
      where: {
        leagueId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        ageGroup: true,
        skillLevel: true,
      },
      orderBy: { name: "asc" },
    }),
    // Fetch recent invitations for the league (only for league admins)
    isLeagueAdmin
      ? prisma.invitation.findMany({
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
          take: 10, // Limit to recent invitations for roster page
        })
      : Promise.resolve([]),
  ]);

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
            League Roster - {leagueUser.league.name}
          </Typography>
        </Box>

        {isLeagueAdmin && (
          <>
            <LeagueInvitationManager
              teams={teams}
              invitations={invitations}
              leagueId={leagueId}
              isLeagueAdmin={isLeagueAdmin}
            />
            <Divider sx={{ my: 4 }} />
          </>
        )}

        <LeagueRosterView
          players={players}
          teams={teams}
          divisions={divisions}
          leagueId={leagueId}
          isLeagueAdmin={isLeagueAdmin}
        />
      </Box>
    </Container>
  );
}
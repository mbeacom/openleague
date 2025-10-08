import React from "react";
import { Box, Typography, Card, CardContent } from "@mui/material";
import { prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/auth/session";
import { notFound } from "next/navigation";
import { LeagueMessagesView } from "@/components/features/communication/LeagueMessagesView";

interface LeagueMessagesPageProps {
  params: Promise<{
    leagueId: string;
  }>;
}

export default async function LeagueMessagesPage({ params }: LeagueMessagesPageProps) {
  const { leagueId } = await params;
  const userId = await requireUserId();

  // Verify user has access to this league
  const leagueUser = await prisma.leagueUser.findFirst({
    where: {
      userId,
      leagueId,
    },
    include: {
      league: {
        select: {
          id: true,
          name: true,
          isActive: true,
        },
      },
    },
  });

  if (!leagueUser || !leagueUser.league.isActive) {
    notFound();
  }

  // Check if user has permission to send messages (league admin or team admin)
  const canSendMessages = leagueUser.role === "LEAGUE_ADMIN" || leagueUser.role === "TEAM_ADMIN";

  // Get league structure for message targeting
  const [divisions, teams] = await Promise.all([
    prisma.division.findMany({
      where: {
        leagueId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            teams: true,
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    }),
    prisma.team.findMany({
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
          },
        },
        _count: {
          select: {
            members: true,
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    }),
  ]);

  const leagueData = {
    id: leagueUser.league.id,
    name: leagueUser.league.name,
    divisions: divisions.map((division) => ({
      id: division.id,
      name: division.name,
      teamCount: division._count.teams,
    })),
    teams: teams.map((team) => ({
      id: team.id,
      name: team.name,
      divisionName: team.division?.name,
      memberCount: team._count.members,
    })),
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" component="h1">
          League Messages
        </Typography>
      </Box>

      <Typography variant="body1" color="text.secondary" mb={3}>
        Send targeted messages and announcements to league members, divisions, or specific teams.
      </Typography>

      {!canSendMessages && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="body2" color="text.secondary">
              You can view messages but cannot send them. Only league and team administrators can send messages.
            </Typography>
          </CardContent>
        </Card>
      )}

      <LeagueMessagesView
        leagueData={leagueData}
        canSendMessages={canSendMessages}
      />
    </Box>
  );
}
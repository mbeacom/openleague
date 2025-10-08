import { requireUserId, canUserCreateLeagueGames } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { Container, Box, Typography, Button } from "@mui/material";
import { Add } from "@mui/icons-material";
import Link from "next/link";
import { notFound } from "next/navigation";
import LeagueCalendar from "@/components/features/calendar/LeagueCalendar";

interface LeagueSchedulePageProps {
  params: Promise<{
    leagueId: string;
  }>;
}

export default async function LeagueSchedulePage({ params }: LeagueSchedulePageProps) {
  const [userId, { leagueId }] = await Promise.all([
    requireUserId(),
    params,
  ]);

  // Verify user has access to this league
  const leagueUser = await prisma.leagueUser.findFirst({
    where: {
      leagueId,
      userId,
    },
    include: {
      league: {
        select: {
          id: true,
          name: true,
          sport: true,
          isActive: true,
        },
      },
    },
  });

  if (!leagueUser || !leagueUser.league.isActive) {
    notFound();
  }

  // Check if user can create inter-team games (league admin or team admin)
  const [canCreateGames, events, teams, divisions] = await Promise.all([
    canUserCreateLeagueGames(userId, leagueId, leagueUser.role),
    // Fetch all league events
    prisma.event.findMany({
      where: {
        leagueId,
      },
      include: {
        team: {
          select: {
            id: true,
            name: true,
          },
        },
        homeTeam: {
          select: {
            id: true,
            name: true,
          },
        },
        awayTeam: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        startAt: "asc",
      },
    }),
    // Fetch all teams in the league
    prisma.team.findMany({
      where: {
        leagueId,
        isActive: true,
      },
      include: {
        division: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    }),
    // Fetch all divisions in the league
    prisma.division.findMany({
      where: {
        leagueId,
        isActive: true,
      },
      orderBy: {
        name: "asc",
      },
    }),
  ]);

  // Serialize events for client component
  const serializedEvents = events.map(event => ({
    id: event.id,
    type: event.type as "GAME" | "PRACTICE",
    title: event.title,
    startAt: event.startAt.toISOString(),
    location: event.location,
    opponent: event.opponent,
    team: event.team,
    homeTeam: event.homeTeam,
    awayTeam: event.awayTeam,
  }));

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <Box sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          mb: 3,
          flexWrap: 'wrap',
          gap: 2
        }}>
          <Box>
            <Typography variant="h4" component="h1" gutterBottom>
              League Schedule
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {leagueUser.league.name} • {leagueUser.league.sport}
            </Typography>
          </Box>

          {canCreateGames && (
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
          events={serializedEvents}
          teams={teams}
          divisions={divisions}
          leagueId={leagueId}
          leagueName={leagueUser.league.name}
        />
      </Box>
    </Container>
  );
}
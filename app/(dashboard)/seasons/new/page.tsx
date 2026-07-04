import { Alert, Card, CardContent, Container, Stack, Typography } from "@mui/material";
import { prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/auth/session";
import { SeasonForm, type SeasonOwnerOption } from "@/components/features/seasons/SeasonForm";

export const dynamic = "force-dynamic";

export default async function NewSeasonPage() {
  const userId = await requireUserId();

  // Owner contexts the user can create seasons for (FR-001): leagues they
  // administer, plus standalone teams (no league) where they are team ADMIN.
  const [leagueAdminships, standaloneTeamAdminships] = await Promise.all([
    prisma.leagueUser.findMany({
      where: { userId, role: "LEAGUE_ADMIN", league: { isActive: true } },
      select: { league: { select: { id: true, name: true } } },
      orderBy: { league: { name: "asc" } },
    }),
    prisma.teamMember.findMany({
      where: { userId, role: "ADMIN", team: { leagueId: null, isActive: true } },
      select: { team: { select: { id: true, name: true } } },
      orderBy: { team: { name: "asc" } },
    }),
  ]);

  const ownerOptions: SeasonOwnerOption[] = [
    ...leagueAdminships.map(({ league }) => ({
      name: `${league.name} (league)`,
      owner: { leagueId: league.id },
    })),
    ...standaloneTeamAdminships.map(({ team }) => ({
      name: `${team.name} (team)`,
      owner: { teamId: team.id },
    })),
  ];

  return (
    <Container maxWidth="sm">
      <Stack spacing={3} sx={{ py: { xs: 3, md: 5 } }}>
        <Stack spacing={0.5}>
          <Typography variant="h4" component="h1">
            New season
          </Typography>
          <Typography color="text.secondary">
            Just a name and dates — you can schedule games one at a time. No format or rotation
            scheme is ever required.
          </Typography>
        </Stack>

        {ownerOptions.length === 0 ? (
          <Alert severity="info">
            You need to be a league administrator or a standalone team&apos;s administrator to
            create seasons.
          </Alert>
        ) : (
          <Card>
            <CardContent>
              <SeasonForm ownerOptions={ownerOptions} />
            </CardContent>
          </Card>
        )}
      </Stack>
    </Container>
  );
}

import Link from "next/link";
import { Alert, Button, Chip, Container, Stack, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/auth/session";
import { getPlacementBoard } from "@/lib/actions/placements";
import { PlacementBoard } from "@/components/features/seasons/PlacementBoard";

export const dynamic = "force-dynamic";

/**
 * Pre-season placement view (FR-025..028). getPlacementBoard enforces
 * LEAGUE_ADMIN of the season's league; its failure message (non-league
 * season, non-admin, unknown season) renders as an alert instead of the
 * board. `?phaseId=` narrows the qualifying results to one phase.
 */
export default async function PlacementPage({
  params,
  searchParams,
}: {
  params: Promise<{ seasonId: string }>;
  searchParams: Promise<{ phaseId?: string }>;
}) {
  const { seasonId } = await params;
  const { phaseId } = await searchParams;
  // Auth first so unauthenticated visitors get the login redirect rather
  // than an authorization error alert.
  await requireUserId();

  const board = await getPlacementBoard({ seasonId, ...(phaseId ? { phaseId } : {}) });

  const backLink = (
    <Stack direction="row">
      <Button
        component={Link}
        href={`/seasons/${seasonId}`}
        startIcon={<ArrowBackIcon />}
        sx={{ minHeight: 44 }}
      >
        Back to season
      </Button>
    </Stack>
  );

  if (!board.success) {
    return (
      <Container maxWidth="lg">
        <Stack spacing={3} sx={{ py: { xs: 3, md: 5 } }}>
          {backLink}
          <Typography variant="h4" component="h1">
            Pre-season placement
          </Typography>
          <Alert severity="error">{board.error}</Alert>
        </Stack>
      </Container>
    );
  }

  // Board access implies the season exists, belongs to a league, and the
  // viewer is a LEAGUE_ADMIN of that league.
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    select: { name: true, leagueId: true },
  });
  const leagueId = season?.leagueId ?? null;

  const [divisions, phases] = await Promise.all([
    leagueId
      ? prisma.division.findMany({
          where: { leagueId, isActive: true },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    prisma.seasonPhase.findMany({
      where: { seasonId },
      select: { id: true, name: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  return (
    <Container maxWidth="lg">
      <Stack spacing={3} sx={{ py: { xs: 3, md: 5 } }}>
        {backLink}

        <Stack spacing={0.5}>
          <Typography variant="h4" component="h1">
            Pre-season placement
          </Typography>
          {season ? <Typography color="text.secondary">{season.name}</Typography> : null}
        </Stack>

        {phases.length > 0 ? (
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip
              component={Link}
              href={`/seasons/${seasonId}/placement`}
              clickable
              label="All games"
              color={phaseId ? "default" : "primary"}
              variant={phaseId ? "outlined" : "filled"}
            />
            {phases.map((phase) => (
              <Chip
                key={phase.id}
                component={Link}
                href={`/seasons/${seasonId}/placement?phaseId=${phase.id}`}
                clickable
                label={phase.name}
                color={phaseId === phase.id ? "primary" : "default"}
                variant={phaseId === phase.id ? "filled" : "outlined"}
              />
            ))}
          </Stack>
        ) : null}

        {leagueId ? (
          <PlacementBoard
            seasonId={seasonId}
            leagueId={leagueId}
            rows={board.data}
            divisions={divisions}
          />
        ) : (
          <Alert severity="error">Placement is available for league seasons</Alert>
        )}
      </Stack>
    </Container>
  );
}

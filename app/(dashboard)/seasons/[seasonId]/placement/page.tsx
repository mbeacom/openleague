import { Alert, Stack } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { LinkButton, LinkChip } from "@/components/ui/NextLinkComposites";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
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
    <LinkButton
      href={`/seasons/${seasonId}`}
      startIcon={<ArrowBackIcon />}
      sx={{ minHeight: 44 }}
    >
      Back to season
    </LinkButton>
  );

  if (!board.success) {
    return (
      <PageContainer>
        <PageHeader title="Pre-season placement" breadcrumbs={backLink} />
        <Alert severity="error">{board.error}</Alert>
      </PageContainer>
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
    <PageContainer>
      <PageHeader
        title="Pre-season placement"
        subtitle={season?.name}
        breadcrumbs={backLink}
      />

      <Stack spacing={3}>
        {phases.length > 0 ? (
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <LinkChip
              href={`/seasons/${seasonId}/placement`}
              clickable
              label="All games"
              color={phaseId ? "default" : "primary"}
              variant={phaseId ? "outlined" : "filled"}
            />
            {phases.map((phase) => (
              <LinkChip
                key={phase.id}
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
    </PageContainer>
  );
}

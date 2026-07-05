import { notFound } from "next/navigation";
import { Container, Stack } from "@mui/material";
import { LinkButton } from "@/components/ui/NextLinkComposites";
import { getSeasonDetail } from "@/lib/actions/seasons";
import { getAvailableVenues } from "@/lib/actions/venues";
import { prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/auth/session";
import { STATS_MIN_AGE_LEVEL } from "@/lib/env";
import { AGE_CLASSIFICATION_RANK, isStatsEligible } from "@/lib/utils/age-level";
import { computeSeasonStandings } from "@/lib/utils/season-standings";
import { SeasonDetail } from "@/components/features/seasons/SeasonDetail";
import { GenerationWizard } from "@/components/features/seasons/GenerationWizard";
import { PhaseEditor } from "@/components/features/seasons/PhaseEditor";
import { SeasonStandingsTable } from "@/components/features/seasons/SeasonStandingsTable";
import type { SeasonGameView } from "@/types/seasons";
import type { AgeClassification, Sport } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function SeasonDetailPage({
  params,
}: {
  params: Promise<{ seasonId: string }>;
}) {
  const { seasonId } = await params;
  // Auth first so login redirects happen outside the not-found handling below.
  const userId = await requireUserId();

  let season: Awaited<ReturnType<typeof getSeasonDetail>> = null;
  try {
    season = await getSeasonDetail(seasonId);
  } catch {
    // Missing season or no view access — 404 rather than leaking existence.
    notFound();
  }
  if (!season) {
    notFound();
  }

  // Light permission probe mirroring requireSeasonManager (FR-038): league
  // seasons need LEAGUE_ADMIN; standalone team seasons need team ADMIN.
  const canManage = season.leagueId
    ? (await prisma.leagueUser.count({
        where: { userId, leagueId: season.leagueId, role: "LEAGUE_ADMIN" },
      })) > 0
    : season.teamId
      ? (await prisma.teamMember.count({
          where: { userId, teamId: season.teamId, role: "ADMIN" },
        })) > 0
      : false;

  // Eligible opponents (FR-008): the league's teams for league seasons; for
  // team-owned seasons, any teams the viewer administers (legacy team scope).
  const teams = season.leagueId
    ? await prisma.team.findMany({
        where: { leagueId: season.leagueId, isActive: true },
        select: { id: true, name: true, divisionId: true },
        orderBy: { name: "asc" },
      })
    : (
        await prisma.teamMember.findMany({
          where: { userId, role: "ADMIN", team: { isActive: true } },
          select: { team: { select: { id: true, name: true, divisionId: true } } },
          orderBy: { team: { name: "asc" } },
        })
      ).map((membership) => membership.team);

  // League divisions feed the generation wizard's division preselect (FR-018).
  const divisions = season.leagueId
    ? await prisma.division.findMany({
        where: { leagueId: season.leagueId, isActive: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

  // Venues visible to the user, plus active surfaces per venue (FR-014).
  const venueRows = await getAvailableVenues();
  const venues = venueRows.map((venue) => ({
    id: venue.id,
    name: venue.name,
    timezone: venue.timezone,
  }));
  const surfaces = venues.length
    ? await prisma.iceSurface.findMany({
        where: { venueId: { in: venues.map((venue) => venue.id) }, isActive: true },
        select: { id: true, name: true, venueId: true, wholeLabel: true },
        orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      })
    : [];
  const surfacesByVenue: Record<string, Array<{ id: string; name: string }>> = {};
  const wholeLabelBySurface: Record<string, string> = {};
  for (const surface of surfaces) {
    (surfacesByVenue[surface.venueId] ??= []).push({ id: surface.id, name: surface.name });
    if (surface.wholeLabel) {
      wholeLabelBySurface[surface.id] = surface.wholeLabel;
    }
  }

  // Active segments per surface feed the game form's segment picker (006).
  const segments = venues.length
    ? await prisma.surfaceSegment.findMany({
        where: { surface: { venueId: { in: venues.map((venue) => venue.id) } }, isActive: true },
        select: { id: true, name: true, surfaceId: true },
        orderBy: { name: "asc" },
      })
    : [];
  const segmentsBySurface: Record<string, Array<{ id: string; name: string }>> = {};
  for (const segment of segments) {
    (segmentsBySurface[segment.surfaceId] ??= []).push({ id: segment.id, name: segment.name });
  }

  const sport: Sport = season.league?.sport ?? season.team?.sport ?? "OTHER";

  // Standings (FR-030) over the season's games between the distinct teams
  // that appear in them; computeSeasonStandings counts COMPLETED games only.
  const participatingTeamIds = [
    ...new Set(season.games.flatMap((game) => [game.homeTeamId, game.awayTeamId])),
  ];
  const participatingTeams = participatingTeamIds.length
    ? await prisma.team.findMany({
        where: { id: { in: participatingTeamIds } },
        select: {
          id: true,
          name: true,
          division: { select: { ageClassification: true } },
        },
      })
    : [];

  // Age gating (FR-040, mirroring recordSeasonGameScore): the season's level
  // is the most restrictive (youngest) participating team's division
  // classification; unclassified-only seasons stay score-eligible. Below the
  // stats threshold the whole standings table is suppressed.
  const participantLevels = participatingTeams
    .map((team) => team.division?.ageClassification)
    .filter((level): level is AgeClassification => Boolean(level));
  const mostRestrictiveLevel =
    participantLevels.length > 0
      ? participantLevels.reduce((a, b) =>
          AGE_CLASSIFICATION_RANK[a] <= AGE_CLASSIFICATION_RANK[b] ? a : b
        )
      : null;
  const standingsGated =
    mostRestrictiveLevel !== null &&
    !isStatsEligible(mostRestrictiveLevel, STATS_MIN_AGE_LEVEL as AgeClassification);
  const standingsRows = standingsGated
    ? []
    : computeSeasonStandings(
        participatingTeams.map((team) => ({ id: team.id, name: team.name })),
        season.games.map((game) => ({
          status: game.status,
          homeTeamId: game.homeTeamId,
          awayTeamId: game.awayTeamId,
          homeScore: game.homeScore,
          awayScore: game.awayScore,
        }))
      );

  const phaseGameCounts = new Map<string, number>();
  for (const game of season.games) {
    if (game.phaseId) {
      phaseGameCounts.set(game.phaseId, (phaseGameCounts.get(game.phaseId) ?? 0) + 1);
    }
  }
  const phases = season.phases.map((phase) => ({
    id: phase.id,
    name: phase.name,
    type: phase.type,
    sortOrder: phase.sortOrder,
    startDate: phase.startDate,
    endDate: phase.endDate,
    format: phase.format,
    formatRounds: phase.formatRounds,
    gameCount: phaseGameCounts.get(phase.id) ?? 0,
  }));

  const games: SeasonGameView[] = season.games.map((game) => ({
    id: game.id,
    status: game.status,
    startAt: game.startAt,
    endAt: game.endAt,
    timezone: game.timezone,
    homeTeam: game.homeTeam,
    awayTeam: game.awayTeam,
    venue: game.venue,
    surface: game.surface,
    segment: game.segment,
    locationText: game.locationText,
    homeScore: game.homeScore,
    awayScore: game.awayScore,
    notes: game.notes,
    phaseId: game.phaseId,
    eventId: game.eventId,
    conflictOverriddenAt: game.conflictOverriddenAt,
  }));

  return (
    <Container maxWidth="lg">
      <Stack sx={{ py: { xs: 3, md: 5 } }}>
        <SeasonDetail
          season={{
            id: season.id,
            name: season.name,
            description: season.description,
            startDate: season.startDate,
            endDate: season.endDate,
            archivedAt: season.archivedAt,
            format: season.format,
            formatRounds: season.formatRounds,
            ownerName: season.league?.name ?? season.team?.name ?? "",
          }}
          games={games}
          teams={teams}
          venues={venues}
          surfacesByVenue={surfacesByVenue}
          segmentsBySurface={segmentsBySurface}
          wholeLabelBySurface={wholeLabelBySurface}
          sport={sport}
          canManage={canManage}
          extraSections={
            <>
              {canManage && season.leagueId ? (
                <Stack direction="row" justifyContent="flex-end">
                  <LinkButton
                    href={`/seasons/${season.id}/placement`}
                    sx={{ minHeight: 44 }}
                  >
                    Pre-season placement
                  </LinkButton>
                </Stack>
              ) : null}
              {canManage ? (
                <PhaseEditor
                  seasonId={season.id}
                  seasonStartDate={season.startDate}
                  seasonEndDate={season.endDate}
                  phases={phases}
                />
              ) : null}
              {canManage ? (
                <GenerationWizard
                  seasonId={season.id}
                  seasonStartDate={season.startDate}
                  seasonEndDate={season.endDate}
                  phases={phases.map((phase) => ({ id: phase.id, name: phase.name }))}
                  teams={teams}
                  divisions={divisions}
                  venues={venues}
                />
              ) : null}
              <SeasonStandingsTable rows={standingsRows} gated={standingsGated} />
            </>
          }
        />
      </Stack>
    </Container>
  );
}

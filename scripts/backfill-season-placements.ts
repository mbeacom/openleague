import { prisma } from "@/lib/db/prisma";

export type SeasonPlacementBackfillReport = {
  dryRun: boolean;
  seasonsScanned: number;
  teamsScanned: number;
  placementsCreated: number;
  placementsAlreadyPresent: number;
};

export type SeasonPlacementBackfillOptions = {
  dryRun?: boolean;
  now?: Date;
};

/**
 * Populate the current season/team projection without changing placement
 * history or Team.divisionId. Existing projections are never overwritten, so
 * this can be safely re-run after a partial deployment.
 */
export async function backfillSeasonPlacements(
  options: SeasonPlacementBackfillOptions = {},
): Promise<SeasonPlacementBackfillReport> {
  const dryRun = options.dryRun ?? false;
  const now = options.now ?? new Date();
  const seasons = await prisma.season.findMany({
    select: {
      id: true,
      leagueId: true,
      teamId: true,
      createdById: true,
      startDate: true,
      endDate: true,
      archivedAt: true,
      placements: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          teamId: true,
          divisionId: true,
          rank: true,
          privateNote: true,
          decidedById: true,
          team: { select: { name: true } },
          division: { select: { name: true } },
        },
      },
      games: {
        select: {
          homeTeamId: true,
          awayTeamId: true,
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      },
    },
    orderBy: { id: "asc" },
  });

  const report: SeasonPlacementBackfillReport = {
    dryRun,
    seasonsScanned: seasons.length,
    teamsScanned: 0,
    placementsCreated: 0,
    placementsAlreadyPresent: 0,
  };

  for (const season of seasons) {
    const isCurrentApplicable =
      season.archivedAt === null
      && season.startDate <= now
      && season.endDate >= now;
    const candidateTeamIds = new Set<string>();
    const historicalTeamNames = new Map<string, string>();
    for (const decision of season.placements) {
      candidateTeamIds.add(decision.teamId);
      historicalTeamNames.set(decision.teamId, decision.team.name);
    }
    for (const game of season.games) {
      candidateTeamIds.add(game.homeTeamId);
      candidateTeamIds.add(game.awayTeamId);
      historicalTeamNames.set(game.homeTeamId, game.homeTeam.name);
      historicalTeamNames.set(game.awayTeamId, game.awayTeam.name);
    }

    // Team.divisionId is a compatibility default for the current roster only.
    // Applying it to every old season would rewrite history after transfers or
    // after new teams join the league.
    if (isCurrentApplicable) {
      const currentRoster = await prisma.team.findMany({
        where: season.leagueId
          ? { leagueId: season.leagueId }
          : season.teamId
            ? { id: season.teamId }
            : { id: "" },
        select: { id: true },
      });
      for (const team of currentRoster) candidateTeamIds.add(team.id);
    }

    const teams = await prisma.team.findMany({
      where: { id: { in: [...candidateTeamIds] } },
      select: {
        id: true,
        name: true,
        divisionId: true,
        division: { select: { name: true } },
      },
      orderBy: { id: "asc" },
    });
    report.teamsScanned += teams.length;

    const latestDecisionByTeam = new Map<string, (typeof season.placements)[number]>();
    for (const decision of season.placements) {
      if (!latestDecisionByTeam.has(decision.teamId)) {
        latestDecisionByTeam.set(decision.teamId, decision);
      }
    }

    for (const team of teams) {
      const decision = latestDecisionByTeam.get(team.id);
      const divisionId = decision
        ? decision.divisionId
        : isCurrentApplicable
          ? team.divisionId ?? null
          : null;
      const divisionName = decision
        ? decision.division?.name ?? null
        : isCurrentApplicable
          ? team.division?.name ?? null
          : null;
      const placedById = decision?.decidedById ?? season.createdById;

      const existing = await prisma.seasonTeamPlacement.findUnique({
        where: { seasonId_teamId: { seasonId: season.id, teamId: team.id } },
        select: { id: true },
      });
      if (existing) {
        report.placementsAlreadyPresent += 1;
        continue;
      }

      report.placementsCreated += 1;
      if (dryRun) continue;

      await prisma.seasonTeamPlacement.upsert({
        where: { seasonId_teamId: { seasonId: season.id, teamId: team.id } },
        create: {
          seasonId: season.id,
          teamId: team.id,
          divisionId,
          teamNameSnapshot: historicalTeamNames.get(team.id) ?? team.name,
          divisionNameSnapshot: divisionName,
          rank: decision?.rank ?? null,
          privateNote: decision?.privateNote ?? null,
          placedById,
        },
        // Never replace a projection that was written by an administrator or
        // by a concurrent backfill run after the existence check.
        update: {},
      });
    }
  }

  return report;
}

async function main() {
  const report = await backfillSeasonPlacements({
    dryRun: process.argv.includes("--dry-run"),
  });
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.main) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}

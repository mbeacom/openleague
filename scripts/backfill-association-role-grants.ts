import { prisma } from "@/lib/db/prisma";

export type AssociationRoleGrantBackfillReport = {
  dryRun: boolean;
  leaguesScanned: number;
  leagueAdminsScanned: number;
  grantsCreated: number;
  grantsAlreadyPresent: number;
};

export type AssociationRoleGrantBackfillOptions = {
  dryRun?: boolean;
};

/**
 * Give every existing LEAGUE_ADMIN an explicit ASSOCIATION_ADMIN grant.
 *
 * Until this runs, league admins keep full authority through the legacy
 * compatibility branch in `lib/auth/capabilities.ts`, so the feature can ship
 * before the backfill without locking anybody out. Running it moves them onto
 * the same explicit footing as every other delegate, which is what makes the
 * grant table a truthful record of who can do what.
 *
 * Two things this deliberately does NOT do:
 *
 *  - It never reads `TeamOfficial`. Those rows are descriptive labels — "Head
 *    Coach", "Team Manager" — that associations hand out for roster listings.
 *    Inferring authority from them would silently promote people who were only
 *    ever labelled, which spec 007 US3 prohibits.
 *  - It never touches `TeamMember` ADMIN rows. Team admins keep working through
 *    the same legacy branch; converting them would be a separate decision about
 *    what a team admin is, not a backfill.
 *
 * Idempotent: an existing ACTIVE association-scoped grant is left alone, so a
 * partial run can simply be repeated.
 */
export async function backfillAssociationRoleGrants(
  options: AssociationRoleGrantBackfillOptions = {},
): Promise<AssociationRoleGrantBackfillReport> {
  const dryRun = options.dryRun ?? false;

  const report: AssociationRoleGrantBackfillReport = {
    dryRun,
    leaguesScanned: 0,
    leagueAdminsScanned: 0,
    grantsCreated: 0,
    grantsAlreadyPresent: 0,
  };

  const leagues = await prisma.league.findMany({ select: { id: true } });
  report.leaguesScanned = leagues.length;

  for (const league of leagues) {
    const admins = await prisma.leagueUser.findMany({
      where: { leagueId: league.id, role: "LEAGUE_ADMIN" },
      select: { userId: true },
    });
    report.leagueAdminsScanned += admins.length;

    for (const admin of admins) {
      const existing = await prisma.associationRoleGrant.findFirst({
        where: {
          userId: admin.userId,
          leagueId: league.id,
          role: "ASSOCIATION_ADMIN",
          scopeType: "ASSOCIATION",
          state: "ACTIVE",
        },
        select: { id: true },
      });

      if (existing) {
        report.grantsAlreadyPresent += 1;
        continue;
      }

      report.grantsCreated += 1;
      if (dryRun) continue;

      await prisma.associationRoleGrant.create({
        data: {
          userId: admin.userId,
          leagueId: league.id,
          role: "ASSOCIATION_ADMIN",
          scopeType: "ASSOCIATION",
          // grantedById stays null: nobody granted these, they are a record of
          // authority that already existed before grants were introduced.
          notes: "Backfilled from existing LEAGUE_ADMIN membership.",
        },
      });
    }
  }

  return report;
}

async function main() {
  const report = await backfillAssociationRoleGrants({
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

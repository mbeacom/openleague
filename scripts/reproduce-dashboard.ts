import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error(
      'DATABASE_URL environment variable is not set. Please configure your database connection (e.g. in .env.local) before running scripts/reproduce-dashboard.ts.'
    );
    process.exit(1);
  }

  const adapter = new PrismaNeon({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter, log: ['query', 'error'] });

  try {
    // Reproduce the exact dashboard query (using select to match getDashboardData)
    try {
      const teams = await prisma.teamMember.findMany({
        where: { userId: 'test-nonexistent-user' },
        select: {
          id: true,
          role: true,
          joinedAt: true,
          team: {
            select: {
              id: true,
              name: true,
              sport: true,
              season: true,
              leagueId: true,
              league: { select: { id: true, name: true } },
              division: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { joinedAt: "desc" },
      });
      console.log('getDashboardData query succeeded:', teams.length, 'results');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const code = e instanceof Error && 'code' in e ? (e as any).code : undefined;
      console.error('getDashboardData query FAILED:', code, msg.substring(0, 300));
    }

    // Reproduce the getUserMode leagueUser query
    try {
      const leagueUsers = await prisma.leagueUser.findMany({
        where: { userId: 'test-nonexistent-user' },
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
        orderBy: { joinedAt: "desc" },
      });
      console.log('getUserMode leagueUser query succeeded:', leagueUsers.length, 'results');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const code = e instanceof Error && 'code' in e ? (e as any).code : undefined;
      console.error('getUserMode leagueUser query FAILED:', code, msg.substring(0, 300));
    }
  } finally {
    await prisma.$disconnect();
  }
}
main().catch(console.error);

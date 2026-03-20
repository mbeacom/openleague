import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter, log: ['query', 'error'] });

  // Reproduce the exact dashboard query
  try {
    const teams = await prisma.teamMember.findMany({
      where: { userId: 'test-nonexistent-user' },
      include: {
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
  } catch (e: any) {
    console.error('getDashboardData query FAILED:', e.code, e.message.substring(0, 300));
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
  } catch (e: any) {
    console.error('getUserMode leagueUser query FAILED:', e.code, e.message.substring(0, 300));
  }

  await prisma.$disconnect();
}
main().catch(console.error);

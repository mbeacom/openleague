import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  const cols: any[] = await prisma.$queryRaw`SELECT column_name::text FROM information_schema.columns WHERE table_name='TeamMember' ORDER BY ordinal_position`;
  console.log('TeamMember columns:', cols.map((c: any) => c.column_name));

  const teamCols: any[] = await prisma.$queryRaw`SELECT column_name::text FROM information_schema.columns WHERE table_name='Team' ORDER BY ordinal_position`;
  console.log('Team columns:', teamCols.map((c: any) => c.column_name));

  const leagueCols: any[] = await prisma.$queryRaw`SELECT column_name::text FROM information_schema.columns WHERE table_name='leagues' ORDER BY ordinal_position`;
  console.log('League (leagues) columns:', leagueCols.map((c: any) => c.column_name));

  const divCols: any[] = await prisma.$queryRaw`SELECT column_name::text FROM information_schema.columns WHERE table_name='divisions' ORDER BY ordinal_position`;
  console.log('Division (divisions) columns:', divCols.map((c: any) => c.column_name));

  const leagueUserCols: any[] = await prisma.$queryRaw`SELECT column_name::text FROM information_schema.columns WHERE table_name='league_users' ORDER BY ordinal_position`;
  console.log('LeagueUser (league_users) columns:', leagueUserCols.map((c: any) => c.column_name));

  // Also check all tables
  const allTables: any[] = await prisma.$queryRaw`SELECT table_name::text FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`;
  console.log('All tables:', allTables.map((t: any) => t.table_name));
  await prisma.$disconnect();
}
main().catch(console.error);

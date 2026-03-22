import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

async function printTableColumns(prisma: PrismaClient, tableName: string, displayName: string) {
  const cols: { column_name: string }[] = await prisma.$queryRaw`SELECT column_name::text FROM information_schema.columns WHERE table_name=${tableName} ORDER BY ordinal_position`;
  console.log(`${displayName} columns:`, cols.map((c) => c.column_name));
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error(
      'DATABASE_URL is not set. Please configure it in your environment (for example, in .env.local) before running scripts/check-cols.ts.'
    );
    process.exit(1);
  }

  const adapter = new PrismaNeon({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  try {
    await printTableColumns(prisma, 'TeamMember', 'TeamMember');
    await printTableColumns(prisma, 'Team', 'Team');
    await printTableColumns(prisma, 'leagues', 'League (leagues)');
    await printTableColumns(prisma, 'divisions', 'Division (divisions)');
    await printTableColumns(prisma, 'league_users', 'LeagueUser (league_users)');

    // Also check all tables
    const allTables: { table_name: string }[] = await prisma.$queryRaw`SELECT table_name::text FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`;
    console.log('All tables:', allTables.map((t) => t.table_name));
  } finally {
    await prisma.$disconnect();
  }
}
main().catch(console.error);

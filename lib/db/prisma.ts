import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Neon's serverless driver only speaks to Neon endpoints; any other
// PostgreSQL (self-hosted, CI service containers) goes through the standard
// pg adapter.
function createAdapter() {
  const connectionString = process.env.DATABASE_URL!;
  if (/\.neon\.tech[/:]/.test(connectionString)) {
    return new PrismaNeon({ connectionString });
  }
  return new PrismaPg({ connectionString });
}

function createPrismaClient() {
  return new PrismaClient({
    adapter: createAdapter(),
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

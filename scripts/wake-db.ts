#!/usr/bin/env tsx
/**
 * Wake up Neon database (free tier auto-pauses after inactivity)
 * Run this before starting development: bun run db:wake
 *
 * This script uses a retry mechanism to poll the database until it's ready,
 * rather than relying on a fixed timeout.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { existsSync, readFileSync } from 'node:fs';

const MAX_RETRIES = 20; // Try for up to 40 seconds (20 * 2s)
const RETRY_DELAY = 2000; // 2 seconds between retries

function loadDatabaseUrlFromEnvFiles() {
  if (process.env.DATABASE_URL) {
    return;
  }

  for (const file of ['.env', '.env.local']) {
    if (!existsSync(file)) {
      continue;
    }

    for (const rawLine of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) {
        continue;
      }

      const match = line.match(/^(?:export\s+)?DATABASE_URL\s*=\s*(.*)$/);
      if (!match) {
        continue;
      }

      let value = match[1].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      process.env.DATABASE_URL = value;
    }
  }
}

async function wakeDatabase() {
  loadDatabaseUrlFromEnvFiles();

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  console.log('🔌 Connecting to database...');

  try {
    await prisma.$connect();
    console.log('✅ Database connection established');

    // Poll the database until it's fully active
    console.log('⏳ Verifying database is active...');

    for (let i = 0; i < MAX_RETRIES; i++) {
      try {
        const userCount = await prisma.user.count();
        console.log(`📊 Found ${userCount} user(s) in database`);
        console.log('👋 Disconnected successfully\n');
        console.log('✨ Database is ready! You can now run: bun run dev\n');
        break; // Query succeeded, database is ready
      } catch (error) {
        if (i === MAX_RETRIES - 1) {
          // Last attempt failed, re-throw the error
          throw error;
        }
        // Wait before retrying
        console.log(`⏳ Database not ready yet, retrying (${i + 1}/${MAX_RETRIES})...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      }
    }

    process.exit(0);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Database connection failed:', errorMessage);
    console.error('\nTroubleshooting:');
    console.error('1. Check your DATABASE_URL in .env.local');
    console.error('2. Verify your Neon database is not suspended');
    console.error('3. Try running this script again (Neon may need time to wake up)');
    console.error('4. Check your internet connection\n');

    process.exit(1);
  } finally {
    // Always disconnect, even on error
    await prisma.$disconnect();
  }
}

wakeDatabase();

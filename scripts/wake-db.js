#!/usr/bin/env node
/**
 * Wake up Neon database (free tier auto-pauses after inactivity)
 * Run this before starting development: node scripts/wake-db.js
 */

const { PrismaClient } = require('@prisma/client');

async function wakeDatabase() {
  const prisma = new PrismaClient();

  console.log('🔌 Connecting to database...');

  try {
    await prisma.$connect();
    console.log('✅ Database connection established');

    // Give Neon time to fully wake up
    console.log('⏳ Waiting for database to fully activate...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Run a simple query to ensure it's fully active
    const userCount = await prisma.user.count();
    console.log(`📊 Found ${userCount} user(s) in database`);

    await prisma.$disconnect();
    console.log('👋 Disconnected successfully\n');
    console.log('✨ Database is ready! You can now run: bun run dev\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Check your DATABASE_URL in .env.local');
    console.error('2. Verify your Neon database is not suspended');
    console.error('3. Try running this script again (Neon may need time to wake up)');
    console.error('4. Check your internet connection\n');

    process.exit(1);
  }
}wakeDatabase();

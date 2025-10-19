import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting database seed...')

  // Create test users
  const adminPassword = await bcrypt.hash('admin123', 12)
  const memberPassword = await bcrypt.hash('member123', 12)

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@test.com' },
    update: { approved: true }, // Ensure existing users are approved
    create: {
      email: 'admin@test.com',
      passwordHash: adminPassword,
      name: 'Test Admin',
      approved: true, // Pre-approve test accounts
    },
  })

  const memberUser = await prisma.user.upsert({
    where: { email: 'member@test.com' },
    update: { approved: true }, // Ensure existing users are approved
    create: {
      email: 'member@test.com',
      passwordHash: memberPassword,
      name: 'Test Member',
      approved: true, // Pre-approve test accounts
    },
  })

  // Create test team
  const team = await prisma.team.upsert({
    where: { id: 'test-team-id' },
    update: {},
    create: {
      id: 'test-team-id',
      name: 'Test Soccer Team',
      sport: 'Soccer',
      season: 'Fall 2025',
    },
  })

  // Add team members
  await prisma.teamMember.upsert({
    where: {
      userId_teamId: {
        userId: adminUser.id,
        teamId: team.id,
      },
    },
    update: {},
    create: {
      userId: adminUser.id,
      teamId: team.id,
      role: 'ADMIN',
    },
  })

  await prisma.teamMember.upsert({
    where: {
      userId_teamId: {
        userId: memberUser.id,
        teamId: team.id,
      },
    },
    update: {},
    create: {
      userId: memberUser.id,
      teamId: team.id,
      role: 'MEMBER',
    },
  })

  // Create test players
  await prisma.player.upsert({
    where: { id: 'test-player-1' },
    update: {},
    create: {
      id: 'test-player-1',
      name: 'John Smith',
      email: 'john@test.com',
      phone: '555-0101',
      emergencyContact: 'Jane Smith',
      emergencyPhone: '555-0102',
      teamId: team.id,
      userId: adminUser.id,
    },
  })

  await prisma.player.upsert({
    where: { id: 'test-player-2' },
    update: {},
    create: {
      id: 'test-player-2',
      name: 'Mike Johnson',
      email: 'mike@test.com',
      phone: '555-0201',
      emergencyContact: 'Sarah Johnson',
      emergencyPhone: '555-0202',
      teamId: team.id,
      userId: memberUser.id,
    },
  })

  // Create test events
  const gameDate = new Date()
  gameDate.setDate(gameDate.getDate() + 7) // Next week

  const practiceDate = new Date()
  practiceDate.setDate(practiceDate.getDate() + 3) // In 3 days

  const game = await prisma.event.upsert({
    where: { id: 'test-game-1' },
    update: {},
    create: {
      id: 'test-game-1',
      type: 'GAME',
      title: 'vs Rival Team',
      startAt: gameDate,
      location: 'Main Stadium',
      opponent: 'Rival Team',
      notes: 'Important game - please arrive 30 minutes early',
      teamId: team.id,
    },
  })

  const practice = await prisma.event.upsert({
    where: { id: 'test-practice-1' },
    update: {},
    create: {
      id: 'test-practice-1',
      type: 'PRACTICE',
      title: 'Team Practice',
      startAt: practiceDate,
      location: 'Training Ground',
      notes: 'Focus on passing drills',
      teamId: team.id,
    },
  })

  // Create test RSVPs
  await prisma.rSVP.upsert({
    where: {
      userId_eventId: {
        userId: adminUser.id,
        eventId: game.id,
      },
    },
    update: {},
    create: {
      userId: adminUser.id,
      eventId: game.id,
      status: 'GOING',
    },
  })

  await prisma.rSVP.upsert({
    where: {
      userId_eventId: {
        userId: memberUser.id,
        eventId: game.id,
      },
    },
    update: {},
    create: {
      userId: memberUser.id,
      eventId: game.id,
      status: 'MAYBE',
    },
  })

  console.log('✅ Database seeded successfully!')
  console.log('📧 Test accounts:')
  console.log('   Admin: admin@test.com / admin123')
  console.log('   Member: member@test.com / member123')
  console.log('🏆 Team: Test Soccer Team (Fall 2025)')
  console.log('👥 Players: 2 test players added')
  console.log('📅 Events: 1 game and 1 practice scheduled')
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error('❌ Seed failed:', e)
    await prisma.$disconnect()
    process.exit(1)
  })
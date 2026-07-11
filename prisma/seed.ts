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

  // Fixed IDs below must pass Zod v4's cuid check (/^[cC][0-9a-z]{6,}$/) so
  // seeded rows can be exercised through Server Action schemas. They stay
  // deterministic and human-decodable to keep upserts idempotent.

  // Create hockey team (primary sport)
  const hockeyTeam = await prisma.team.upsert({
    where: { id: 'cseedhockeyteam0000000001' },
    update: {},
    create: {
      id: 'cseedhockeyteam0000000001',
      name: 'Northside Ice Hawks',
      sport: 'HOCKEY',
      season: 'Winter 2026-27',
    },
  })

  // Create lacrosse team
  const lacrosseTeam = await prisma.team.upsert({
    where: { id: 'cseedlacrosseteam00000001' },
    update: {},
    create: {
      id: 'cseedlacrosseteam00000001',
      name: 'Eastside Thunder',
      sport: 'LACROSSE',
      season: 'Spring 2026',
    },
  })

  // Add team members — hockey team
  await prisma.teamMember.upsert({
    where: {
      userId_teamId: {
        userId: adminUser.id,
        teamId: hockeyTeam.id,
      },
    },
    update: {},
    create: {
      userId: adminUser.id,
      teamId: hockeyTeam.id,
      role: 'ADMIN',
    },
  })

  await prisma.teamMember.upsert({
    where: {
      userId_teamId: {
        userId: memberUser.id,
        teamId: hockeyTeam.id,
      },
    },
    update: {},
    create: {
      userId: memberUser.id,
      teamId: hockeyTeam.id,
      role: 'MEMBER',
    },
  })

  // Add admin to lacrosse team too
  await prisma.teamMember.upsert({
    where: {
      userId_teamId: {
        userId: adminUser.id,
        teamId: lacrosseTeam.id,
      },
    },
    update: {},
    create: {
      userId: adminUser.id,
      teamId: lacrosseTeam.id,
      role: 'ADMIN',
    },
  })

  // Create hockey players
  await prisma.player.upsert({
    where: { id: 'cseedplayer00000000000001' },
    update: {},
    create: {
      id: 'cseedplayer00000000000001',
      name: 'Connor MacTavish',
      email: 'connor@test.com',
      phone: '555-0101',
      jerseyNumber: 97,
      position: 'Center',
      emergencyContact: 'Linda MacTavish',
      emergencyPhone: '555-0102',
      teamId: hockeyTeam.id,
      userId: adminUser.id,
    },
  })

  await prisma.player.upsert({
    where: { id: 'cseedplayer00000000000002' },
    update: {},
    create: {
      id: 'cseedplayer00000000000002',
      name: 'Jake Sullivan',
      email: 'jake@test.com',
      phone: '555-0201',
      jerseyNumber: 14,
      position: 'Left Wing',
      emergencyContact: 'Karen Sullivan',
      emergencyPhone: '555-0202',
      teamId: hockeyTeam.id,
      userId: memberUser.id,
    },
  })

  await prisma.player.upsert({
    where: { id: 'cseedplayer00000000000003' },
    update: {},
    create: {
      id: 'cseedplayer00000000000003',
      name: 'Dylan Bouchard',
      email: 'dylan@test.com',
      phone: '555-0301',
      jerseyNumber: 31,
      position: 'Goalie',
      emergencyContact: 'Marie Bouchard',
      emergencyPhone: '555-0302',
      teamId: hockeyTeam.id,
    },
  })

  await prisma.player.upsert({
    where: { id: 'cseedplayer00000000000004' },
    update: {},
    create: {
      id: 'cseedplayer00000000000004',
      name: 'Sam Kowalski',
      email: 'sam@test.com',
      phone: '555-0401',
      jerseyNumber: 5,
      position: 'Defense',
      emergencyContact: 'Tom Kowalski',
      emergencyPhone: '555-0402',
      teamId: hockeyTeam.id,
    },
  })

  // Create lacrosse players
  await prisma.player.upsert({
    where: { id: 'cseedplayer00000000000005' },
    update: {},
    create: {
      id: 'cseedplayer00000000000005',
      name: 'Marcus Rivera',
      email: 'marcus@test.com',
      phone: '555-0501',
      jerseyNumber: 22,
      position: 'Attack',
      emergencyContact: 'Elena Rivera',
      emergencyPhone: '555-0502',
      teamId: lacrosseTeam.id,
    },
  })

  await prisma.player.upsert({
    where: { id: 'cseedplayer00000000000006' },
    update: {},
    create: {
      id: 'cseedplayer00000000000006',
      name: 'Tyler Brennan',
      email: 'tyler@test.com',
      phone: '555-0601',
      jerseyNumber: 44,
      position: 'Midfield',
      emergencyContact: 'Lisa Brennan',
      emergencyPhone: '555-0602',
      teamId: lacrosseTeam.id,
    },
  })

  // Create hockey events
  const hockeyGameDate = new Date()
  hockeyGameDate.setDate(hockeyGameDate.getDate() + 7)

  const hockeyPracticeDate = new Date()
  hockeyPracticeDate.setDate(hockeyPracticeDate.getDate() + 3)

  const hockeyGame = await prisma.event.upsert({
    where: { id: 'cseedgame0000000000000001' },
    update: {},
    create: {
      id: 'cseedgame0000000000000001',
      type: 'GAME',
      title: 'vs Westside Wolves',
      startAt: hockeyGameDate,
      location: 'Northside Ice Arena - Rink A',
      opponent: 'Westside Wolves',
      notes: 'Arrive 45 min early for warm-ups. Full gear required.',
      teamId: hockeyTeam.id,
    },
  })

  await prisma.event.upsert({
    where: { id: 'cseedpractice000000000001' },
    update: {},
    create: {
      id: 'cseedpractice000000000001',
      type: 'PRACTICE',
      title: 'Stick Handling & Power Play Drills',
      startAt: hockeyPracticeDate,
      location: 'Northside Ice Arena - Rink B',
      notes: 'Focus on breakout plays and power play formations. Bring extra tape.',
      teamId: hockeyTeam.id,
    },
  })

  // Create lacrosse events
  const lacrosseGameDate = new Date()
  lacrosseGameDate.setDate(lacrosseGameDate.getDate() + 10)

  const lacrossePracticeDate = new Date()
  lacrossePracticeDate.setDate(lacrossePracticeDate.getDate() + 4)

  await prisma.event.upsert({
    where: { id: 'cseedgame0000000000000002' },
    update: {},
    create: {
      id: 'cseedgame0000000000000002',
      type: 'GAME',
      title: 'vs Southside Scorpions',
      startAt: lacrosseGameDate,
      location: 'Memorial Field',
      opponent: 'Southside Scorpions',
      notes: 'First league game of the season. Wear white jerseys.',
      teamId: lacrosseTeam.id,
    },
  })

  await prisma.event.upsert({
    where: { id: 'cseedpractice000000000002' },
    update: {},
    create: {
      id: 'cseedpractice000000000002',
      type: 'PRACTICE',
      title: 'Ground Balls & Clearing Drills',
      startAt: lacrossePracticeDate,
      location: 'Memorial Field',
      notes: 'Work on ground ball pickups and transition clearing. Full pads.',
      teamId: lacrosseTeam.id,
    },
  })

  // Create test RSVPs for hockey game
  await prisma.rSVP.upsert({
    where: {
      userId_eventId: {
        userId: adminUser.id,
        eventId: hockeyGame.id,
      },
    },
    update: {},
    create: {
      userId: adminUser.id,
      eventId: hockeyGame.id,
      status: 'GOING',
    },
  })

  await prisma.rSVP.upsert({
    where: {
      userId_eventId: {
        userId: memberUser.id,
        eventId: hockeyGame.id,
      },
    },
    update: {},
    create: {
      userId: memberUser.id,
      eventId: hockeyGame.id,
      status: 'MAYBE',
    },
  })

  console.log('✅ Database seeded successfully!')
  console.log('📧 Test accounts:')
  console.log('   Admin: admin@test.com / admin123')
  console.log('   Member: member@test.com / member123')
  console.log('🏒 Hockey: Northside Ice Hawks (Winter 2026-27) — 4 players')
  console.log('🥍 Lacrosse: Eastside Thunder (Spring 2026) — 2 players')
  console.log('📅 Events: 2 games + 2 practices scheduled')
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
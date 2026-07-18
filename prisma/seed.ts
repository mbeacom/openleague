import { PrismaClient } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'

// Guard before constructing the client so a refused run never attempts a
// connection (calls the hoisted declaration below).
assertSeedTargetIsDev()

// Mirrors lib/db/prisma.ts: Neon's serverless driver only speaks to Neon
// endpoints; any other PostgreSQL goes through the standard pg adapter.
function createSeedAdapter() {
  const connectionString = process.env.DATABASE_URL!
  if (/\.neon\.tech[/:]/.test(connectionString)) {
    return new PrismaNeon({ connectionString })
  }
  return new PrismaPg({ connectionString })
}

const prisma = new PrismaClient({ adapter: createSeedAdapter() })

const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * DAY_MS)
}

function hoursAfter(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * HOUR_MS)
}

type SeedRsvpStatus = 'GOING' | 'NOT_GOING' | 'MAYBE' | 'NO_RESPONSE'

/**
 * Idempotently ensure a self/household RSVP row (playerId null). The composite
 * unique (userId, eventId, playerId) rejects null members, so upsert can't
 * target these rows — integrity comes from the partial unique index
 * "RSVP_userId_eventId_self_key"; existing rows are left untouched (matches
 * the old `update: {}` upsert semantics).
 */
async function ensureSelfRsvp(userId: string, eventId: string, status: SeedRsvpStatus) {
  const existing = await prisma.rSVP.findFirst({
    where: { userId, eventId, playerId: null },
    select: { id: true },
  })
  if (existing) return
  await prisma.rSVP.create({
    data: { userId, eventId, status },
  })
}

/**
 * Refuse to seed anything that doesn't look like a local/dev database.
 * Neon hostnames are identical between production and dev branches, so
 * remote hosts always require an explicit FORCE_SEED=1 opt-in.
 */
function assertSeedTargetIsDev(): void {
  if (process.env.FORCE_SEED === '1') {
    console.warn('⚠️  FORCE_SEED=1 — skipping DATABASE_URL safety check')
    return
  }
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('❌ DATABASE_URL is not set — refusing to seed')
    process.exit(1)
  }
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    console.error('❌ DATABASE_URL is not a parseable URL — refusing to seed')
    process.exit(1)
  }
  const isLocal =
    host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local')
  if (!isLocal) {
    console.error(`❌ Refusing to seed non-local database host "${host}"`)
    console.error('   Re-run with FORCE_SEED=1 only if this is a disposable dev database')
    console.error('   (e.g. a Neon dev branch — prod and dev branch hostnames are indistinguishable).')
    process.exit(1)
  }
}

// --- Metro Hockey League fixtures (league mode, role matrix, proposal inbox) ---

async function seedMetroLeague() {
  const league = await prisma.league.upsert({
    where: { id: 'cseedleague00000000000001' },
    update: { isActive: true },
    create: {
      id: 'cseedleague00000000000001',
      name: 'Metro Hockey League',
      sport: 'HOCKEY',
      contactEmail: 'league-admin@test.com',
    },
  })

  const u12Division = await prisma.division.upsert({
    where: { id: 'cseeddivision000000000001' },
    update: { isActive: true },
    create: {
      id: 'cseeddivision000000000001',
      name: 'U12 Recreational',
      ageGroup: 'U12',
      skillLevel: 'Recreational',
      leagueId: league.id,
    },
  })

  const adultDivision = await prisma.division.upsert({
    where: { id: 'cseeddivision000000000002' },
    update: { isActive: true },
    create: {
      id: 'cseeddivision000000000002',
      name: 'Adult Competitive',
      ageGroup: 'Adult',
      skillLevel: 'Competitive',
      leagueId: league.id,
    },
  })

  return { league, u12Division, adultDivision }
}

async function seedLeagueTeams(leagueId: string, u12DivisionId: string, adultDivisionId: string) {
  const upsertLeagueTeam = (id: string, name: string, divisionId: string) =>
    prisma.team.upsert({
      where: { id },
      // Re-runs repair league/division links if they drifted during manual testing.
      update: { leagueId, divisionId, isActive: true },
      create: {
        id,
        name,
        sport: 'HOCKEY',
        season: 'Winter 2026-27',
        isActive: true,
        leagueId,
        divisionId,
      },
    })

  const blades = await upsertLeagueTeam('cseedlgteam00000000000001', 'Metro Blades', u12DivisionId)
  const hawks = await upsertLeagueTeam('cseedlgteam00000000000002', 'Harbor Hawks', u12DivisionId)
  const flyers = await upsertLeagueTeam('cseedlgteam00000000000003', 'Foundry Flyers', adultDivisionId)
  const storm = await upsertLeagueTeam('cseedlgteam00000000000004', 'Summit Storm', adultDivisionId)

  return { blades, hawks, flyers, storm }
}

async function seedLeagueRoleMatrix(leagueId: string, bladesTeamId: string, hawksTeamId: string) {
  const adminPassword = await bcrypt.hash('admin123', 12)
  const memberPassword = await bcrypt.hash('member123', 12)

  const upsertUser = (email: string, name: string, passwordHash: string) =>
    prisma.user.upsert({
      where: { email },
      update: { approved: true, emailVerified: new Date() }, // Test accounts can always log in
      create: { email, passwordHash, name, approved: true, emailVerified: new Date() },
    })

  const leagueAdmin = await upsertUser('league-admin@test.com', 'Test League Admin', adminPassword)
  const teamAdmin1 = await upsertUser('team-admin1@test.com', 'Test Team Admin One', adminPassword)
  const teamAdmin2 = await upsertUser('team-admin2@test.com', 'Test Team Admin Two', adminPassword)
  const leagueMember = await upsertUser('league-member@test.com', 'Test League Member', memberPassword)

  const upsertLeagueUser = (userId: string, role: 'LEAGUE_ADMIN' | 'TEAM_ADMIN' | 'MEMBER') =>
    prisma.leagueUser.upsert({
      where: { userId_leagueId: { userId, leagueId } },
      update: { role },
      create: { userId, leagueId, role },
    })

  await upsertLeagueUser(leagueAdmin.id, 'LEAGUE_ADMIN')
  await upsertLeagueUser(teamAdmin1.id, 'TEAM_ADMIN')
  await upsertLeagueUser(teamAdmin2.id, 'TEAM_ADMIN')
  await upsertLeagueUser(leagueMember.id, 'MEMBER')

  const upsertTeamMember = (userId: string, teamId: string, role: 'ADMIN' | 'MEMBER') =>
    prisma.teamMember.upsert({
      where: { userId_teamId: { userId, teamId } },
      update: { role },
      create: { userId, teamId, role },
    })

  // Team admins hold BOTH a TeamMember ADMIN row and a LeagueUser TEAM_ADMIN row.
  await upsertTeamMember(teamAdmin1.id, bladesTeamId, 'ADMIN')
  await upsertTeamMember(teamAdmin2.id, hawksTeamId, 'ADMIN')
  await upsertTeamMember(leagueMember.id, bladesTeamId, 'MEMBER')

  return { leagueAdmin, teamAdmin1, teamAdmin2, leagueMember }
}

async function seedLeagueVenue(leagueId: string, createdById: string) {
  return prisma.venue.upsert({
    where: { id: 'cseedvenue000000000000001' },
    update: { timezone: 'America/Chicago', isActive: true },
    create: {
      id: 'cseedvenue000000000000001',
      name: 'Metro Ice Center',
      address: '400 Rinkside Drive',
      city: 'Chicago',
      state: 'IL',
      surfaceType: 'ICE',
      timezone: 'America/Chicago',
      leagueId,
      createdById,
    },
  })
}

async function seedLeagueSeason(leagueId: string, createdById: string) {
  // Relative dates are recomputed each run so the regular phase always covers "now".
  const season = await prisma.season.upsert({
    where: { id: 'cseedseason00000000000001' },
    update: { startDate: daysFromNow(-30), endDate: daysFromNow(120), archivedAt: null },
    create: {
      id: 'cseedseason00000000000001',
      name: 'Metro Winter Season',
      startDate: daysFromNow(-30),
      endDate: daysFromNow(120),
      leagueId,
      createdById,
    },
  })

  const upsertPhase = (
    id: string,
    name: string,
    type: 'PRE_SEASON' | 'REGULAR_SEASON' | 'PLAYOFFS',
    sortOrder: number,
    startDays: number,
    endDays: number
  ) =>
    prisma.seasonPhase.upsert({
      where: { id },
      update: { startDate: daysFromNow(startDays), endDate: daysFromNow(endDays), sortOrder },
      create: {
        id,
        name,
        type,
        sortOrder,
        startDate: daysFromNow(startDays),
        endDate: daysFromNow(endDays),
        seasonId: season.id,
      },
    })

  await upsertPhase('cseedphase000000000000001', 'Pre-Season', 'PRE_SEASON', 0, -30, -8)
  await upsertPhase('cseedphase000000000000002', 'Regular Season', 'REGULAR_SEASON', 1, -7, 60)
  await upsertPhase('cseedphase000000000000003', 'Playoffs', 'PLAYOFFS', 2, 61, 120)

  return season
}

async function seedProposalInbox(opts: {
  leagueId: string
  seasonId: string
  venueId: string
  bladesTeamId: string
  hawksTeamId: string
  flyersTeamId: string
  teamAdmin1Id: string
  teamAdmin2Id: string
}) {
  const upsertProposal = (args: {
    id: string
    status: 'PENDING' | 'DECLINED' | 'EXPIRED'
    proposingTeamId: string
    receivingTeamId: string
    createdById: string
    resolvedAt?: Date
  }) =>
    prisma.gameProposal.upsert({
      where: { id: args.id },
      // Re-runs reset status/resolution so the four inbox states stay canonical.
      update: { status: args.status, resolvedAt: args.resolvedAt ?? null },
      create: {
        id: args.id,
        status: args.status,
        leagueId: opts.leagueId,
        seasonId: opts.seasonId,
        proposingTeamId: args.proposingTeamId,
        receivingTeamId: args.receivingTeamId,
        createdById: args.createdById,
        resolvedAt: args.resolvedAt ?? null,
      },
    })

  const upsertEntry = (args: {
    id: string
    proposalId: string
    kind: 'PROPOSE' | 'DECLINE'
    startAt: Date | null
    endAt: Date | null
    venueId?: string
    note?: string
    actorTeamId: string
    actorUserId: string
  }) =>
    prisma.gameProposalEntry.upsert({
      where: { id: args.id },
      // The latest PROPOSE entry's startAt drives lazy expiry, so re-runs must
      // shift it to keep PENDING fixtures unexpired (and the EXPIRED one past).
      update: { startAt: args.startAt, endAt: args.endAt },
      create: {
        id: args.id,
        proposalId: args.proposalId,
        kind: args.kind,
        startAt: args.startAt,
        endAt: args.endAt,
        venueId: args.venueId ?? null,
        note: args.note ?? null,
        actorTeamId: args.actorTeamId,
        actorUserId: args.actorUserId,
      },
    })

  // 1. PENDING incoming for Metro Blades: Harbor Hawks proposed to team-admin1's team.
  const incomingStart = daysFromNow(14)
  await upsertProposal({
    id: 'cseedproposal000000000001',
    status: 'PENDING',
    proposingTeamId: opts.hawksTeamId,
    receivingTeamId: opts.bladesTeamId,
    createdById: opts.teamAdmin2Id,
  })
  await upsertEntry({
    id: 'cseedpropentry00000000001',
    proposalId: 'cseedproposal000000000001',
    kind: 'PROPOSE',
    startAt: incomingStart,
    endAt: hoursAfter(incomingStart, 2),
    venueId: opts.venueId,
    note: 'Saturday matchup at Metro Ice Center?',
    actorTeamId: opts.hawksTeamId,
    actorUserId: opts.teamAdmin2Id,
  })

  // 2. PENDING outgoing from Metro Blades to Foundry Flyers.
  const outgoingStart = daysFromNow(21)
  await upsertProposal({
    id: 'cseedproposal000000000002',
    status: 'PENDING',
    proposingTeamId: opts.bladesTeamId,
    receivingTeamId: opts.flyersTeamId,
    createdById: opts.teamAdmin1Id,
  })
  await upsertEntry({
    id: 'cseedpropentry00000000002',
    proposalId: 'cseedproposal000000000002',
    kind: 'PROPOSE',
    startAt: outgoingStart,
    endAt: hoursAfter(outgoingStart, 2),
    note: 'Cross-division exhibition game — open to a weeknight.',
    actorTeamId: opts.bladesTeamId,
    actorUserId: opts.teamAdmin1Id,
  })

  // 3. DECLINED: Metro Blades proposed to Harbor Hawks; Hawks declined.
  const declinedStart = daysFromNow(10)
  await upsertProposal({
    id: 'cseedproposal000000000003',
    status: 'DECLINED',
    proposingTeamId: opts.bladesTeamId,
    receivingTeamId: opts.hawksTeamId,
    createdById: opts.teamAdmin1Id,
    resolvedAt: daysFromNow(-1),
  })
  await upsertEntry({
    id: 'cseedpropentry00000000003',
    proposalId: 'cseedproposal000000000003',
    kind: 'PROPOSE',
    startAt: declinedStart,
    endAt: hoursAfter(declinedStart, 2),
    actorTeamId: opts.bladesTeamId,
    actorUserId: opts.teamAdmin1Id,
  })
  await upsertEntry({
    id: 'cseedpropentry00000000004',
    proposalId: 'cseedproposal000000000003',
    kind: 'DECLINE',
    startAt: null,
    endAt: null,
    note: 'That date clashes with our tournament weekend.',
    actorTeamId: opts.hawksTeamId,
    actorUserId: opts.teamAdmin2Id,
  })

  // 4. EXPIRED: Hawks → Blades with the proposed start already in the past.
  // Lazy expiry (FR-022) only flips status, so resolvedAt stays null.
  const expiredStart = daysFromNow(-3)
  await upsertProposal({
    id: 'cseedproposal000000000004',
    status: 'EXPIRED',
    proposingTeamId: opts.hawksTeamId,
    receivingTeamId: opts.bladesTeamId,
    createdById: opts.teamAdmin2Id,
  })
  await upsertEntry({
    id: 'cseedpropentry00000000005',
    proposalId: 'cseedproposal000000000004',
    kind: 'PROPOSE',
    startAt: expiredStart,
    endAt: hoursAfter(expiredStart, 2),
    actorTeamId: opts.hawksTeamId,
    actorUserId: opts.teamAdmin2Id,
  })
}

async function main() {
  console.log('🌱 Starting database seed...')

  // Create test users
  const adminPassword = await bcrypt.hash('admin123', 12)
  const memberPassword = await bcrypt.hash('member123', 12)

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@test.com' },
    update: { approved: true, emailVerified: new Date() }, // Test accounts can always log in
    create: {
      email: 'admin@test.com',
      passwordHash: adminPassword,
      name: 'Test Admin',
      approved: true,
      emailVerified: new Date(), // Pre-verify test accounts
    },
  })

  const memberUser = await prisma.user.upsert({
    where: { email: 'member@test.com' },
    update: { approved: true, emailVerified: new Date() }, // Test accounts can always log in
    create: {
      email: 'member@test.com',
      passwordHash: memberPassword,
      name: 'Test Member',
      approved: true,
      emailVerified: new Date(), // Pre-verify test accounts
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

  // Create test RSVPs for hockey game (self/household rows, playerId null)
  await ensureSelfRsvp(adminUser.id, hockeyGame.id, 'GOING')
  await ensureSelfRsvp(memberUser.id, hockeyGame.id, 'MAYBE')

  // Guardian fixtures (identity graph, Tier 3): parent@test.com guards the two
  // hockey players without linked accounts. One per-child RSVP is answered
  // (Dylan GOING on the hockey game); the other (Sam) has no per-child row —
  // per-child rows are only created on response, so Sam shows as pending.
  const parentUser = await prisma.user.upsert({
    where: { email: 'parent@test.com' },
    update: { approved: true },
    create: {
      email: 'parent@test.com',
      passwordHash: memberPassword,
      name: 'Test Parent',
      approved: true,
    },
  })

  await prisma.teamMember.upsert({
    where: {
      userId_teamId: {
        userId: parentUser.id,
        teamId: hockeyTeam.id,
      },
    },
    update: {},
    create: {
      userId: parentUser.id,
      teamId: hockeyTeam.id,
      role: 'MEMBER',
    },
  })

  const dylanPlayerId = 'cseedplayer00000000000003' // Dylan Bouchard (no linked user)
  const samPlayerId = 'cseedplayer00000000000004' // Sam Kowalski (no linked user)

  for (const playerId of [dylanPlayerId, samPlayerId]) {
    await prisma.playerGuardian.upsert({
      where: {
        playerId_userId: {
          playerId,
          userId: parentUser.id,
        },
      },
      update: {},
      create: {
        playerId,
        userId: parentUser.id,
        relationship: 'Parent',
      },
    })
  }

  // Per-child response: upsert on the composite unique works here because
  // playerId is non-null.
  await prisma.rSVP.upsert({
    where: {
      userId_eventId_playerId: {
        userId: parentUser.id,
        eventId: hockeyGame.id,
        playerId: dylanPlayerId,
      },
    },
    update: {},
    create: {
      userId: parentUser.id,
      eventId: hockeyGame.id,
      playerId: dylanPlayerId,
      status: 'GOING',
    },
  })

  // League-mode fixtures: Metro Hockey League role matrix + proposal inbox
  const { league, u12Division, adultDivision } = await seedMetroLeague()
  const teams = await seedLeagueTeams(league.id, u12Division.id, adultDivision.id)
  const users = await seedLeagueRoleMatrix(league.id, teams.blades.id, teams.hawks.id)
  const venue = await seedLeagueVenue(league.id, users.leagueAdmin.id)
  const season = await seedLeagueSeason(league.id, users.leagueAdmin.id)
  await seedProposalInbox({
    leagueId: league.id,
    seasonId: season.id,
    venueId: venue.id,
    bladesTeamId: teams.blades.id,
    hawksTeamId: teams.hawks.id,
    flyersTeamId: teams.flyers.id,
    teamAdmin1Id: users.teamAdmin1.id,
    teamAdmin2Id: users.teamAdmin2.id,
  })

  console.log('✅ Database seeded successfully!')
  console.log('📧 Standalone-team accounts:')
  console.log('   Admin: admin@test.com / admin123 — ADMIN of both standalone teams')
  console.log('   Member: member@test.com / member123 — MEMBER of Northside Ice Hawks')
  console.log('   Parent: parent@test.com / member123 — MEMBER of Northside Ice Hawks + guardian of Dylan Bouchard & Sam Kowalski')
  console.log('🏒 Hockey: Northside Ice Hawks (Winter 2026-27) — 4 players')
  console.log('🥍 Lacrosse: Eastside Thunder (Spring 2026) — 2 players')
  console.log('📅 Events: 2 games + 2 practices scheduled')
  console.log('👨‍👧 Guardians: parent@test.com answered per child for the hockey game (Dylan GOING); Sam has no per-child row yet (pending)')
  console.log('')
  console.log('🏆 Metro Hockey League (HOCKEY)')
  console.log('   Divisions: U12 Recreational, Adult Competitive')
  console.log('   Teams: Metro Blades + Harbor Hawks (U12 Rec); Foundry Flyers + Summit Storm (Adult Comp)')
  console.log('🏟️  Venue: Metro Ice Center (America/Chicago)')
  console.log('📆 Season: Metro Winter Season, now−30d → now+120d')
  console.log('   Phases: Pre-Season / Regular Season (covers today) / Playoffs')
  console.log('📧 League accounts (role matrix):')
  console.log('   league-admin@test.com / admin123 — LeagueUser LEAGUE_ADMIN')
  console.log('   team-admin1@test.com / admin123 — TeamMember ADMIN (Metro Blades) + LeagueUser TEAM_ADMIN')
  console.log('   team-admin2@test.com / admin123 — TeamMember ADMIN (Harbor Hawks) + LeagueUser TEAM_ADMIN')
  console.log('   league-member@test.com / member123 — TeamMember MEMBER (Metro Blades) + LeagueUser MEMBER')
  console.log('📨 Proposal inbox states (log in as team-admin1@test.com unless noted):')
  console.log('   PENDING incoming: Harbor Hawks → Metro Blades (team-admin2 sees it as outgoing)')
  console.log('   PENDING outgoing: Metro Blades → Foundry Flyers')
  console.log('   DECLINED:         Metro Blades → Harbor Hawks (declined by team-admin2)')
  console.log('   EXPIRED:          Harbor Hawks → Metro Blades (proposed start already passed)')
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
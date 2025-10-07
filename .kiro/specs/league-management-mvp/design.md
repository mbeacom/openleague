# Design Document

## Overview

The League Management MVP extends the existing team-management-mvp architecture to support basic multi-team coordination within a single league. This design maintains the current Next.js 14+ foundation while adding minimal complexity to handle 2-5 teams per league.

The approach prioritizes backward compatibility and incremental enhancement over architectural revolution. All existing team-management-mvp functionality remains unchanged, with league features added as an optional layer that users can adopt when ready.

**Key Design Principles:**
- **Backward Compatibility**: Existing single-team users continue working unchanged
- **Incremental Adoption**: Users can upgrade from single team to league when needed
- **Minimal Complexity**: Add only essential multi-team features, defer advanced capabilities
- **Familiar Patterns**: Reuse existing UI patterns and user flows where possible
- **Performance First**: Maintain current performance characteristics with league features

## Architecture

### Enhanced Data Model (Minimal Changes)

The current Prisma schema already includes league-related models, but we'll implement only the essential subset:

**Core Models to Implement:**
- `League` (simplified version)
- `Division` (basic grouping only)
- Enhanced `Team` with league relationship
- Enhanced `Event` with multi-team support

**Models to Defer:**
- `Facility` and related booking models
- `Tournament` and related models
- `CustomField` and extensibility features
- Complex user roles beyond basic League Admin/Team Admin

### Simplified League Schema

```prisma
// Simplified League model (subset of existing schema)
model League {
  id               String   @id @default(cuid())
  name             String
  sport            String
  contactEmail     String
  contactPhone     String?
  isActive         Boolean  @default(true)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  // Essential relationships only
  divisions        Division[]
  teams            Team[]
  events           Event[]
  players          Player[]
  users            LeagueUser[]
  
  @@map("leagues")
}

// Basic Division model
model Division {
  id          String   @id @default(cuid())
  name        String
  ageGroup    String?  // U8, U10, Adult, etc.
  skillLevel  String?  // Recreational, Competitive
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())

  leagueId    String
  league      League   @relation(fields: [leagueId], references: [id], onDelete: Cascade)
  teams       Team[]
  
  @@map("divisions")
}

// Enhanced Team model (minimal changes)
model Team {
  id              String   @id @default(cuid())
  name            String
  sport           String   // Keep for backward compatibility
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  // New league relationship (optional for backward compatibility)
  leagueId        String?
  league          League?  @relation(fields: [leagueId], references: [id], onDelete: Cascade)

  divisionId      String?
  division        Division? @relation(fields: [divisionId], references: [id])

  // Existing relationships unchanged
  members         TeamMember[]
  players         Player[]
  events          Event[]
  homeEvents      Event[]  @relation("HomeTeam")
  awayEvents      Event[]  @relation("AwayTeam")
  invitations     Invitation[]
  
  @@map("teams")
}

// Simplified LeagueUser model
model LeagueUser {
  id       String   @id @default(cuid())
  role     LeagueRole
  joinedAt DateTime @default(now())

  userId   String
  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  leagueId String
  league   League   @relation(fields: [leagueId], references: [id], onDelete: Cascade)

  @@unique([userId, leagueId])
  @@map("league_users")
}

enum LeagueRole {
  LEAGUE_ADMIN  // Full league control
  TEAM_ADMIN    // Team management within league
  MEMBER        // Basic member
}

// Enhanced Event model (minimal changes)
model Event {
  id              String      @id @default(cuid())
  type            EventType
  title           String
  startAt         DateTime
  location        String
  opponent        String?
  notes           String?
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  // New league relationship (optional for backward compatibility)
  leagueId        String?
  league          League?     @relation(fields: [leagueId], references: [id], onDelete: Cascade)

  // Existing team relationship
  teamId          String
  team            Team        @relation(fields: [teamId], references: [id], onDelete: Cascade)

  // New multi-team game support
  homeTeamId      String?
  homeTeam        Team?       @relation("HomeTeam", fields: [homeTeamId], references: [id])

  awayTeamId      String?
  awayTeam        Team?       @relation("AwayTeam", fields: [awayTeamId], references: [id])

  // Existing relationships unchanged
  rsvps           RSVP[]
  
  @@map("events")
}
```

### Migration Strategy

**Phase 1: Dual Mode Support**
- Existing teams continue working without league (leagueId = null)
- New teams can optionally be created within leagues
- UI adapts based on whether user has leagues or just teams

**Phase 2: Gradual Migration**
- Provide "Upgrade to League" option for existing single-team users
- Migrate existing team to become first team in new league
- Preserve all existing data and URLs

**Phase 3: League-First Experience**
- New users start with league creation
- Single-team mode becomes "Simple League" with one team

## User Interface Design

### Navigation Enhancement

**Current Navigation (Team-Only):**
```
Dashboard | Roster | Calendar | Events
```

**Enhanced Navigation (League Mode):**
```
League Dashboard | Teams | Schedule | Roster | Settings
```

**Adaptive Navigation:**
- Single-team users see existing navigation
- League users see enhanced navigation
- Context switcher for multi-team users

### League Dashboard

**Key Components:**
- League overview with team summary
- Recent activity across all teams
- Upcoming events from all teams
- Quick actions (create team, schedule game, send announcement)

**Layout (Desktop):**
```
+------------------+------------------+
| League Overview  | Recent Activity  |
| - 3 Teams        | - Game scheduled |
| - 45 Players     | - Player added   |
| - 12 Events      | - Message sent   |
+------------------+------------------+
| Upcoming Events (All Teams)        |
| [Team A vs Team B - Tomorrow 7pm]  |
| [Team C Practice - Friday 6pm]     |
+-------------------------------------+
| Quick Actions                       |
| [+ Team] [+ Game] [+ Announcement]  |
+-------------------------------------+
```

### Team Management Interface

**Team List View:**
```typescript
interface TeamListProps {
  teams: Team[];
  divisions: Division[];
  onCreateTeam: () => void;
  onManageTeam: (teamId: string) => void;
}

const TeamList: React.FC<TeamListProps> = ({ teams, divisions }) => {
  return (
    <div className="team-list">
      {divisions.map(division => (
        <div key={division.id} className="division-section">
          <h3>{division.name}</h3>
          {teams
            .filter(team => team.divisionId === division.id)
            .map(team => (
              <TeamCard key={team.id} team={team} />
            ))}
        </div>
      ))}
      
      {/* Unassigned teams */}
      <div className="unassigned-teams">
        <h3>Other Teams</h3>
        {teams
          .filter(team => !team.divisionId)
          .map(team => (
            <TeamCard key={team.id} team={team} />
          ))}
      </div>
    </div>
  );
};
```

### Multi-Team Scheduling

**Game Creation Flow:**
1. Select event type (Practice vs Game)
2. If Game: Select home team and away team from league
3. Set date, time, location
4. System automatically creates RSVPs for both teams

**Schedule Conflict Detection:**
```typescript
const detectSchedulingConflicts = async (
  eventData: CreateEventInput,
  leagueId: string
): Promise<SchedulingConflict[]> => {
  const conflicts: SchedulingConflict[] = [];
  
  // Check if home team has conflicting event
  if (eventData.homeTeamId) {
    const homeTeamConflicts = await checkTeamConflicts(
      eventData.homeTeamId,
      eventData.startAt
    );
    conflicts.push(...homeTeamConflicts);
  }
  
  // Check if away team has conflicting event
  if (eventData.awayTeamId) {
    const awayTeamConflicts = await checkTeamConflicts(
      eventData.awayTeamId,
      eventData.startAt
    );
    conflicts.push(...awayTeamConflicts);
  }
  
  return conflicts;
};
```

## Core Services Implementation

### League Management Service

```typescript
class LeagueService {
  async createLeague(data: CreateLeagueInput, userId: string): Promise<League> {
    const league = await prisma.league.create({
      data: {
        name: data.name,
        sport: data.sport,
        contactEmail: data.contactEmail,
        contactPhone: data.contactPhone,
        users: {
          create: {
            userId,
            role: 'LEAGUE_ADMIN'
          }
        }
      }
    });
    
    return league;
  }
  
  async addTeamToLeague(
    leagueId: string,
    teamData: CreateTeamInput,
    userId: string
  ): Promise<Team> {
    // Verify user has league admin permissions
    await this.verifyLeagueAdmin(leagueId, userId);
    
    const team = await prisma.team.create({
      data: {
        ...teamData,
        leagueId,
        members: {
          create: {
            userId,
            role: 'ADMIN'
          }
        }
      }
    });
    
    return team;
  }
  
  async migrateTeamToLeague(
    teamId: string,
    leagueData: CreateLeagueInput,
    userId: string
  ): Promise<{ league: League; team: Team }> {
    // Create league
    const league = await this.createLeague(leagueData, userId);
    
    // Update team to belong to league
    const team = await prisma.team.update({
      where: { id: teamId },
      data: { leagueId: league.id }
    });
    
    // Update all team's events to belong to league
    await prisma.event.updateMany({
      where: { teamId },
      data: { leagueId: league.id }
    });
    
    // Update all team's players to belong to league
    await prisma.player.updateMany({
      where: { teamId },
      data: { leagueId: league.id }
    });
    
    return { league, team };
  }
}
```

### Enhanced Scheduling Service

```typescript
class SchedulingService {
  async createInterTeamGame(
    gameData: CreateGameInput,
    leagueId: string,
    userId: string
  ): Promise<Event> {
    // Verify user has permission to schedule games
    await this.verifySchedulingPermission(leagueId, userId);
    
    // Check for conflicts
    const conflicts = await this.detectConflicts(gameData, leagueId);
    if (conflicts.length > 0) {
      throw new SchedulingConflictError(conflicts);
    }
    
    // Create event
    const event = await prisma.event.create({
      data: {
        type: 'GAME',
        title: `${gameData.homeTeam.name} vs ${gameData.awayTeam.name}`,
        startAt: gameData.startAt,
        location: gameData.location,
        leagueId,
        teamId: gameData.homeTeamId, // Primary team for backward compatibility
        homeTeamId: gameData.homeTeamId,
        awayTeamId: gameData.awayTeamId
      }
    });
    
    // Create RSVPs for both teams
    await this.createRSVPsForBothTeams(event.id, gameData.homeTeamId, gameData.awayTeamId);
    
    // Send notifications to both teams
    await this.notifyTeamsOfNewGame(event);
    
    return event;
  }
  
  private async createRSVPsForBothTeams(
    eventId: string,
    homeTeamId: string,
    awayTeamId: string
  ): Promise<void> {
    // Get all members from both teams
    const homeTeamMembers = await prisma.teamMember.findMany({
      where: { teamId: homeTeamId },
      include: { user: true }
    });
    
    const awayTeamMembers = await prisma.teamMember.findMany({
      where: { teamId: awayTeamId },
      include: { user: true }
    });
    
    const allMembers = [...homeTeamMembers, ...awayTeamMembers];
    
    // Create RSVP records for all members
    await prisma.rsvp.createMany({
      data: allMembers.map(member => ({
        eventId,
        userId: member.userId,
        status: 'NO_RESPONSE'
      }))
    });
  }
}
```

### Communication Service Enhancement

```typescript
class CommunicationService {
  async sendLeagueAnnouncement(
    leagueId: string,
    message: MessageInput,
    senderId: string,
    targeting: MessageTargeting
  ): Promise<void> {
    // Verify sender has league communication permissions
    await this.verifyLeagueCommunicationPermission(leagueId, senderId);
    
    // Get recipients based on targeting
    const recipients = await this.getMessageRecipients(leagueId, targeting);
    
    // Send emails
    await this.emailService.sendBulkEmail({
      from: message.senderEmail,
      subject: message.subject,
      content: message.content,
      recipients: recipients.map(r => ({
        email: r.email,
        name: r.name
      }))
    });
    
    // Log message for audit trail
    await this.logLeagueMessage(leagueId, message, recipients, senderId);
  }
  
  private async getMessageRecipients(
    leagueId: string,
    targeting: MessageTargeting
  ): Promise<User[]> {
    let whereClause: any = {};
    
    if (targeting.entireLeague) {
      // All league members
      whereClause = {
        leagueUsers: {
          some: { leagueId }
        }
      };
    } else if (targeting.divisions?.length) {
      // Members of specific divisions
      whereClause = {
        teamMembers: {
          some: {
            team: {
              divisionId: { in: targeting.divisions }
            }
          }
        }
      };
    } else if (targeting.teams?.length) {
      // Members of specific teams
      whereClause = {
        teamMembers: {
          some: {
            teamId: { in: targeting.teams }
          }
        }
      };
    }
    
    return await prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        email: true,
        name: true
      }
    });
  }
}

interface MessageTargeting {
  entireLeague?: boolean;
  divisions?: string[];
  teams?: string[];
}
```

## Server Actions Implementation

### League Management Actions

```typescript
// lib/actions/league.ts
export async function createLeague(data: CreateLeagueInput) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return { error: 'Unauthorized' };
    }

    const validated = createLeagueSchema.parse(data);
    
    const league = await leagueService.createLeague(validated, session.user.id);
    
    revalidatePath('/dashboard');
    return { success: true, data: league };
  } catch (error) {
    if (error instanceof ZodError) {
      return { error: 'Invalid input', details: error.errors };
    }
    return { error: 'Failed to create league' };
  }
}

export async function migrateTeamToLeague(
  teamId: string,
  leagueData: CreateLeagueInput
) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return { error: 'Unauthorized' };
    }

    // Verify user owns the team
    const teamMember = await prisma.teamMember.findFirst({
      where: {
        teamId,
        userId: session.user.id,
        role: 'ADMIN'
      }
    });

    if (!teamMember) {
      return { error: 'Unauthorized - not team admin' };
    }

    const result = await leagueService.migrateTeamToLeague(
      teamId,
      leagueData,
      session.user.id
    );
    
    revalidatePath('/dashboard');
    return { success: true, data: result };
  } catch (error) {
    return { error: 'Failed to migrate team to league' };
  }
}
```

### Enhanced Event Actions

```typescript
// lib/actions/events.ts (enhanced)
export async function createInterTeamGame(data: CreateGameInput) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return { error: 'Unauthorized' };
    }

    const validated = createGameSchema.parse(data);
    
    const event = await schedulingService.createInterTeamGame(
      validated,
      validated.leagueId,
      session.user.id
    );
    
    revalidatePath('/calendar');
    revalidatePath('/schedule');
    return { success: true, data: event };
  } catch (error) {
    if (error instanceof SchedulingConflictError) {
      return { 
        error: 'Scheduling conflict detected', 
        conflicts: error.conflicts 
      };
    }
    if (error instanceof ZodError) {
      return { error: 'Invalid input', details: error.errors };
    }
    return { error: 'Failed to create game' };
  }
}
```

## UI Components

### League Context Provider

```typescript
// components/providers/LeagueProvider.tsx
interface LeagueContextType {
  currentLeague: League | null;
  leagues: League[];
  switchLeague: (leagueId: string) => void;
  isLeagueMode: boolean;
}

export const LeagueProvider: React.FC<{ children: React.ReactNode }> = ({ 
  children 
}) => {
  const [currentLeague, setCurrentLeague] = useState<League | null>(null);
  const [leagues, setLeagues] = useState<League[]>([]);
  
  const isLeagueMode = leagues.length > 0;
  
  const switchLeague = useCallback((leagueId: string) => {
    const league = leagues.find(l => l.id === leagueId);
    if (league) {
      setCurrentLeague(league);
      // Update URL to reflect league context
      router.push(`/league/${league.id}/dashboard`);
    }
  }, [leagues]);
  
  return (
    <LeagueContext.Provider value={{
      currentLeague,
      leagues,
      switchLeague,
      isLeagueMode
    }}>
      {children}
    </LeagueContext.Provider>
  );
};
```

### Adaptive Navigation

```typescript
// components/layout/Navigation.tsx
export const Navigation: React.FC = () => {
  const { isLeagueMode, currentLeague } = useLeague();
  
  if (!isLeagueMode) {
    // Show original team-management-mvp navigation
    return (
      <nav className="navigation">
        <NavLink href="/dashboard">Dashboard</NavLink>
        <NavLink href="/roster">Roster</NavLink>
        <NavLink href="/calendar">Calendar</NavLink>
        <NavLink href="/events/new">New Event</NavLink>
      </nav>
    );
  }
  
  // Show enhanced league navigation
  return (
    <nav className="navigation">
      <NavLink href={`/league/${currentLeague?.id}/dashboard`}>
        League Dashboard
      </NavLink>
      <NavLink href={`/league/${currentLeague?.id}/teams`}>
        Teams
      </NavLink>
      <NavLink href={`/league/${currentLeague?.id}/schedule`}>
        Schedule
      </NavLink>
      <NavLink href={`/league/${currentLeague?.id}/roster`}>
        All Players
      </NavLink>
      <NavLink href={`/league/${currentLeague?.id}/settings`}>
        Settings
      </NavLink>
    </nav>
  );
};
```

### Team Selector Component

```typescript
// components/features/league/TeamSelector.tsx
interface TeamSelectorProps {
  teams: Team[];
  selectedTeamId?: string;
  onTeamSelect: (teamId: string) => void;
  allowMultiple?: boolean;
}

export const TeamSelector: React.FC<TeamSelectorProps> = ({
  teams,
  selectedTeamId,
  onTeamSelect,
  allowMultiple = false
}) => {
  return (
    <FormControl fullWidth>
      <InputLabel>Select Team</InputLabel>
      <Select
        value={selectedTeamId || ''}
        onChange={(e) => onTeamSelect(e.target.value)}
        label="Select Team"
      >
        {teams.map(team => (
          <MenuItem key={team.id} value={team.id}>
            <Box display="flex" alignItems="center" gap={1}>
              {team.logoUrl && (
                <Avatar src={team.logoUrl} sx={{ width: 24, height: 24 }} />
              )}
              <Typography>{team.name}</Typography>
              {team.division && (
                <Chip 
                  label={team.division.name} 
                  size="small" 
                  variant="outlined" 
                />
              )}
            </Box>
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
};
```

## Performance Considerations

### Database Optimization

**Key Indexes for League Features:**
```sql
-- Optimize league-team queries
CREATE INDEX CONCURRENTLY idx_teams_league_id ON teams(league_id) WHERE league_id IS NOT NULL;

-- Optimize division-team queries  
CREATE INDEX CONCURRENTLY idx_teams_division_id ON teams(division_id) WHERE division_id IS NOT NULL;

-- Optimize league events
CREATE INDEX CONCURRENTLY idx_events_league_start ON events(league_id, start_at) WHERE league_id IS NOT NULL;

-- Optimize multi-team games
CREATE INDEX CONCURRENTLY idx_events_home_away ON events(home_team_id, away_team_id) WHERE home_team_id IS NOT NULL;
```

### Caching Strategy

**League Data Caching:**
```typescript
// Cache league structure (teams, divisions) for 5 minutes
const getLeagueStructure = cache(async (leagueId: string) => {
  return await prisma.league.findUnique({
    where: { id: leagueId },
    include: {
      divisions: {
        include: {
          teams: {
            include: {
              _count: {
                select: { players: true, events: true }
              }
            }
          }
        }
      }
    }
  });
}, { ttl: 300 }); // 5 minutes

// Cache league events for 2 minutes
const getLeagueEvents = cache(async (leagueId: string, dateRange: DateRange) => {
  return await prisma.event.findMany({
    where: {
      leagueId,
      startAt: {
        gte: dateRange.start,
        lte: dateRange.end
      }
    },
    include: {
      team: { select: { name: true } },
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } }
    },
    orderBy: { startAt: 'asc' }
  });
}, { ttl: 120 }); // 2 minutes
```

## Testing Strategy

### Unit Tests for League Logic

```typescript
// __tests__/services/league.test.ts
describe('LeagueService', () => {
  describe('createLeague', () => {
    it('should create league and assign creator as admin', async () => {
      const leagueData = {
        name: 'Test League',
        sport: 'Hockey',
        contactEmail: 'admin@test.com'
      };
      
      const league = await leagueService.createLeague(leagueData, 'user-123');
      
      expect(league.name).toBe('Test League');
      
      const leagueUser = await prisma.leagueUser.findFirst({
        where: { leagueId: league.id, userId: 'user-123' }
      });
      
      expect(leagueUser?.role).toBe('LEAGUE_ADMIN');
    });
  });
  
  describe('migrateTeamToLeague', () => {
    it('should migrate existing team data to league context', async () => {
      // Create existing team with events and players
      const team = await createTestTeam();
      const events = await createTestEvents(team.id);
      const players = await createTestPlayers(team.id);
      
      const leagueData = {
        name: 'Migrated League',
        sport: 'Hockey',
        contactEmail: 'admin@test.com'
      };
      
      const result = await leagueService.migrateTeamToLeague(
        team.id,
        leagueData,
        'user-123'
      );
      
      // Verify team now belongs to league
      expect(result.team.leagueId).toBe(result.league.id);
      
      // Verify events migrated
      const migratedEvents = await prisma.event.findMany({
        where: { teamId: team.id }
      });
      expect(migratedEvents.every(e => e.leagueId === result.league.id)).toBe(true);
      
      // Verify players migrated
      const migratedPlayers = await prisma.player.findMany({
        where: { teamId: team.id }
      });
      expect(migratedPlayers.every(p => p.leagueId === result.league.id)).toBe(true);
    });
  });
});
```

### Integration Tests

```typescript
// __tests__/integration/league-scheduling.test.ts
describe('League Scheduling Integration', () => {
  it('should create inter-team game with RSVPs for both teams', async () => {
    const league = await createTestLeague();
    const homeTeam = await createTestTeam({ leagueId: league.id });
    const awayTeam = await createTestTeam({ leagueId: league.id });
    
    // Add players to both teams
    await createTestPlayers(homeTeam.id, 5);
    await createTestPlayers(awayTeam.id, 5);
    
    const gameData = {
      homeTeamId: homeTeam.id,
      awayTeamId: awayTeam.id,
      startAt: new Date('2025-12-01T19:00:00Z'),
      location: 'Test Arena',
      leagueId: league.id
    };
    
    const event = await schedulingService.createInterTeamGame(
      gameData,
      league.id,
      'admin-user-id'
    );
    
    // Verify event created correctly
    expect(event.homeTeamId).toBe(homeTeam.id);
    expect(event.awayTeamId).toBe(awayTeam.id);
    expect(event.leagueId).toBe(league.id);
    
    // Verify RSVPs created for all players
    const rsvps = await prisma.rsvp.findMany({
      where: { eventId: event.id }
    });
    
    expect(rsvps).toHaveLength(10); // 5 players per team
    expect(rsvps.every(r => r.status === 'NO_RESPONSE')).toBe(true);
  });
});
```

## Deployment Considerations

### Environment Variables

```bash
# .env.local additions for league features
# All existing team-management-mvp variables remain unchanged

# League-specific features (optional)
ENABLE_LEAGUE_FEATURES=true
MAX_TEAMS_PER_LEAGUE=8
MAX_DIVISIONS_PER_LEAGUE=4

# Email service (enhanced for league communications)
EMAIL_FROM_LEAGUE="noreply@openleague.app"
EMAIL_REPLY_TO_LEAGUE="support@openleague.app"
```

### Database Migration Strategy

```typescript
// Migration script for existing installations
export async function migrateToLeagueSupport() {
  console.log('Starting league support migration...');
  
  // 1. Add league columns to existing tables (already done via Prisma migrate)
  
  // 2. For existing single-team users, optionally create leagues
  // This is done on-demand when users choose to upgrade
  
  // 3. Update indexes for performance
  await prisma.$executeRaw`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_teams_league_id 
    ON teams(league_id) WHERE league_id IS NOT NULL;
  `;
  
  await prisma.$executeRaw`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_league_start 
    ON events(league_id, start_at) WHERE league_id IS NOT NULL;
  `;
  
  console.log('League support migration completed');
}
```

## Future Considerations

### Phase 2 Enhancements (6-12 months)
- Basic facility booking integration
- Simple tournament brackets
- Enhanced reporting and analytics
- Mobile app considerations

### Phase 3 Advanced Features (12+ months)
- Multi-league support per user
- Advanced scheduling algorithms
- Payment processing integration
- White-label customization

This design provides a solid foundation for league management while maintaining the simplicity and performance of the existing team-management-mvp. The incremental approach allows users to adopt league features when ready while preserving all existing functionality.
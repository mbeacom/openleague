import { LeagueOverviewCard } from 'openleague';

const league = {
  id: 'l1',
  name: 'Metro Hockey League',
  sport: 'HOCKEY',
  _count: { teams: 12, players: 210, events: 96, divisions: 4 },
};

export const AdminView = () => (
  <div style={{ maxWidth: 380 }}>
    <LeagueOverviewCard
      league={league as any}
      userRole="LEAGUE_ADMIN"
      recentActivity={{ description: 'Riverside Renegades added 2 players', timestamp: new Date('2026-02-09T15:30:00') }}
    />
  </div>
);

export const MemberView = () => (
  <div style={{ maxWidth: 380 }}>
    <LeagueOverviewCard league={league as any} userRole="MEMBER" />
  </div>
);

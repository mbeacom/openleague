import { TeamCard } from 'openleague';

const team = {
  id: 't1',
  name: 'Riverside Renegades',
  sport: 'HOCKEY',
  season: '2025-2026',
  league: { id: 'l1', name: 'Metro Hockey League' },
  division: { id: 'd1', name: 'U16 A' },
  _count: { players: 18, events: 24 },
};

export const MemberView = () => (
  <div style={{ maxWidth: 360 }}>
    <TeamCard team={team as any} role="MEMBER" showStats />
  </div>
);

export const AdminWithLeague = () => (
  <div style={{ maxWidth: 360 }}>
    <TeamCard team={team as any} role="ADMIN" showLeagueInfo showStats />
  </div>
);

import { EventCard } from 'openleague';

export const Game = () => (
  <div style={{ maxWidth: 380 }}>
    <EventCard id="e1" type="GAME" title="Game vs Lakeside Sharks" startAt="2026-02-14T14:00:00" location="Riverside Ice Arena, Rink 2" opponent="Lakeside Sharks" />
  </div>
);

export const Practice = () => (
  <div style={{ maxWidth: 380 }}>
    <EventCard id="e2" type="PRACTICE" title="Power Play Drills" startAt="2026-02-10T18:30:00" location="Main Rink" opponent={null} teamName="Riverside Renegades" />
  </div>
);

export const LeagueMatchup = () => (
  <div style={{ maxWidth: 380 }}>
    <EventCard id="e3" type="GAME" title="" startAt="2026-02-16T09:00:00" location="Metro Arena" opponent={null} leagueId="l1" homeTeam={{ id: 't1', name: 'Renegades' }} awayTeam={{ id: 't2', name: 'Sharks' }} />
  </div>
);

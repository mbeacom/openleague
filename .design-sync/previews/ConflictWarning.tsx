import { ConflictWarning } from 'openleague';

const at = (s: string) => new Date(s);

export const WithSuggestions = () => (
  <div style={{ maxWidth: 660 }}>
    <ConflictWarning
      conflicts={[
        { teamId: 't1', teamName: 'Riverside Renegades', conflictingEvent: { id: 'e1', title: 'Practice — Skating', startAt: at('2026-02-14T14:00:00') } },
      ]}
      suggestions={[
        { startAt: at('2026-02-14T16:00:00'), reason: 'rink free' },
        { startAt: at('2026-02-15T09:00:00'), reason: 'next morning' },
      ]}
    />
  </div>
);

export const AdminOverride = () => (
  <div style={{ maxWidth: 660 }}>
    <ConflictWarning
      conflicts={[
        { teamId: 't2', teamName: 'Lakeside Sharks', conflictingEvent: { id: 'e2', title: 'Game vs Hawks', startAt: at('2026-02-14T18:30:00') } },
      ]}
      canOverride
    />
  </div>
);

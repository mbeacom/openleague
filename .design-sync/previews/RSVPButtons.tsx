import { RSVPButtons } from 'openleague';

export const Going = () => (
  <div style={{ maxWidth: 520 }}>
    <RSVPButtons eventId="e1" currentStatus="GOING" />
  </div>
);

export const NoResponse = () => (
  <div style={{ maxWidth: 520 }}>
    <RSVPButtons eventId="e2" currentStatus="NO_RESPONSE" />
  </div>
);

export const NotGoing = () => (
  <div style={{ maxWidth: 520 }}>
    <RSVPButtons eventId="e3" currentStatus="NOT_GOING" />
  </div>
);

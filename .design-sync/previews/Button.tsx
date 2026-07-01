import { Button } from 'openleague';

const row: React.CSSProperties = { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' };

export const Variants = () => (
  <div style={row}>
    <Button variant="contained">Create Team</Button>
    <Button variant="outlined">Add Player</Button>
    <Button variant="text">Learn more</Button>
  </div>
);

export const MarketingCTAs = () => (
  <div style={row}>
    <Button variant="marketing">Start Your Season</Button>
    <Button variant="marketingSecondary">View Pricing</Button>
  </div>
);

export const Colors = () => (
  <div style={row}>
    <Button variant="contained" color="primary">Save Roster</Button>
    <Button variant="contained" color="secondary">Invite</Button>
    <Button variant="contained" color="success">Confirm RSVP</Button>
    <Button variant="contained" color="error">Cancel Event</Button>
  </div>
);

export const Sizes = () => (
  <div style={row}>
    <Button variant="contained" size="small">Small</Button>
    <Button variant="contained" size="medium">Medium</Button>
    <Button variant="contained" size="large">Large</Button>
  </div>
);

export const FullWidth = () => (
  <div style={{ maxWidth: 320 }}>
    <Button variant="contained" fullWidth>Join the League</Button>
  </div>
);

export const Disabled = () => (
  <div style={row}>
    <Button variant="contained" disabled>Unavailable</Button>
    <Button variant="outlined" disabled>Locked</Button>
  </div>
);

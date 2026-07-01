import { Card, Button } from 'openleague';

const title: React.CSSProperties = { fontSize: 20, fontWeight: 700, color: 'var(--league-blue)', margin: 0, letterSpacing: '-0.01em' };
const meta: React.CSSProperties = { fontSize: 14, color: 'rgba(0,0,0,0.6)', marginTop: 6 };
const body: React.CSSProperties = { fontSize: 15, color: 'rgba(0,0,0,0.75)', marginTop: 12, lineHeight: 1.5 };

export const TeamCard = () => (
  <div style={{ maxWidth: 360 }}>
    <Card>
      <Card.Content>
        <h3 style={title}>Riverside Renegades</h3>
        <div style={meta}>U16 · Division A · 18 players</div>
        <p style={body}>Next game vs. Lakeside Sharks on Saturday at 9:00 AM, Rink 2.</p>
      </Card.Content>
      <Card.Actions>
        <Button variant="text" color="primary">View roster</Button>
        <Button variant="contained" size="small">Manage</Button>
      </Card.Actions>
    </Card>
  </div>
);

export const Outlined = () => (
  <div style={{ maxWidth: 360 }}>
    <Card variant="outlined">
      <Card.Content>
        <h3 style={title}>Practice — Power Play Drills</h3>
        <div style={meta}>Tuesday · 6:30 PM · Main Rink</div>
        <p style={body}>Bring full gear. Focus on breakout passing and zone entries.</p>
      </Card.Content>
    </Card>
  </div>
);

export const MarketingCard = () => (
  <div style={{ maxWidth: 420 }}>
    <Card variant="marketing">
      <Card.Content>
        <h3 style={{ ...title, fontSize: 26, fontWeight: 800 }}>Simplify Your Season</h3>
        <p style={body}>Rosters, schedules, RSVPs, and communication — one place for the whole team.</p>
      </Card.Content>
      <Card.Actions>
        <Button variant="marketing">Get started free</Button>
      </Card.Actions>
    </Card>
  </div>
);

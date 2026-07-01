import { Input } from 'openleague';

const stack: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 340 };

export const Basic = () => (
  <div style={stack}>
    <Input label="Team name" placeholder="e.g. Riverside Renegades" defaultValue="Riverside Renegades" fullWidth />
  </div>
);

export const Variants = () => (
  <div style={stack}>
    <Input label="Outlined" variant="outlined" defaultValue="Default style" fullWidth />
    <Input label="Filled" variant="filled" defaultValue="Filled style" fullWidth />
    <Input label="Standard" variant="standard" defaultValue="Standard style" fullWidth />
  </div>
);

export const WithHelperText = () => (
  <div style={stack}>
    <Input label="Email address" type="email" placeholder="you@example.com" helperText="Invitations are sent to this address." fullWidth />
  </div>
);

export const ErrorState = () => (
  <div style={stack}>
    <Input label="Jersey number" defaultValue="99" error helperText="That number is already taken." fullWidth />
  </div>
);

export const Multiline = () => (
  <div style={stack}>
    <Input label="Announcement" multiline rows={3} defaultValue="Playoffs start next week — check the schedule for updated game times." fullWidth />
  </div>
);

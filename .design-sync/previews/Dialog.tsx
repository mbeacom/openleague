import { Dialog, Button, Input } from 'openleague';

const bodyText: React.CSSProperties = { margin: 0, color: 'rgba(0,0,0,0.7)', lineHeight: 1.5, fontSize: 15 };

export const ConfirmDelete = () => (
  <Dialog open onClose={() => {}} maxWidth="xs" fullWidth>
    <Dialog.Title>Cancel this event?</Dialog.Title>
    <Dialog.Content>
      <p style={bodyText}>
        Saturday&apos;s game vs. Lakeside Sharks will be removed and all 18 players notified. This can&apos;t be undone.
      </p>
    </Dialog.Content>
    <Dialog.Actions>
      <Button variant="text">Keep event</Button>
      <Button variant="contained" color="error">Cancel event</Button>
    </Dialog.Actions>
  </Dialog>
);

export const FormDialog = () => (
  <Dialog open onClose={() => {}} maxWidth="sm" fullWidth>
    <Dialog.Title>Invite a player</Dialog.Title>
    <Dialog.Content>
      <div style={{ paddingTop: 8 }}>
        <Input label="Player email" type="email" placeholder="player@example.com" fullWidth />
      </div>
    </Dialog.Content>
    <Dialog.Actions>
      <Button variant="text">Cancel</Button>
      <Button variant="contained">Send invite</Button>
    </Dialog.Actions>
  </Dialog>
);

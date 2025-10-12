import type { Metadata } from 'next';
import { Container, Box, Typography, List, ListItem, ListItemText } from '@mui/material';

export const metadata: Metadata = {
  title: 'Terms of Service - OpenLeague',
  description: 'Understand the basic terms for using the OpenLeague platform.',
};

export default function TermsPage() {
  return (
    <Container maxWidth="md">
      <Box sx={{ py: 8 }}>
        <Typography variant="h1" component="h1" gutterBottom>
          Terms of Service
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
          Last updated: {new Date().getFullYear()}
        </Typography>
        <Typography variant="body1" paragraph>
          We&apos;re preparing the formal Terms of Service for OpenLeague. Until those are finalized, here&apos;s what you can expect:
        </Typography>

        <List sx={{ listStyleType: 'disc', pl: 3, '& .MuiListItem-root': { display: 'list-item' } }}>
          <ListItem>
            <ListItemText
              primaryTypographyProps={{ variant: 'body1', color: 'text.secondary' }}
              primary="You retain ownership of the content you add to OpenLeague."
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primaryTypographyProps={{ variant: 'body1', color: 'text.secondary' }}
              primary="You agree to use the platform responsibly and respect other members of your teams and leagues."
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primaryTypographyProps={{ variant: 'body1', color: 'text.secondary' }}
              primary="We provide OpenLeague as-is while the service is in early access. We&apos;ll communicate any breaking changes in advance."
            />
          </ListItem>
        </List>

        <Typography variant="body1" color="text.secondary" sx={{ mt: 4 }}>
          The detailed terms—including acceptable use, subscription billing, and dispute resolution—are coming soon. Contact support@openl.app if you need specifics before then.
        </Typography>
      </Box>
    </Container>
  );
}

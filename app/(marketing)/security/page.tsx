import type { Metadata } from 'next';
import { Container, Box, Typography, Stack } from '@mui/material';

export const metadata: Metadata = {
  title: 'Security - OpenLeague',
  description: 'Overview of OpenLeague’s security practices and upcoming improvements.',
};

export default function SecurityPage() {
  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 8 }}>
        <Typography variant="h1" component="h1" gutterBottom>
          Security at OpenLeague
        </Typography>
        <Typography variant="h5" color="text.secondary" sx={{ mb: 4 }}>
          Keeping team data safe is core to the product. Here&apos;s what we have today and what&apos;s coming next.
        </Typography>

        <Stack spacing={4}>
          <Box>
            <Typography variant="h5" component="h2" gutterBottom>
              Current Practices
            </Typography>
            <Typography variant="body1" color="text.secondary" paragraph>
              OpenLeague uses industry-standard encryption in transit (HTTPS) and role-based access controls inside the app.
              Production credentials are stored in encrypted secrets managers.
            </Typography>
          </Box>

          <Box>
            <Typography variant="h5" component="h2" gutterBottom>
              On Our Roadmap
            </Typography>
            <Typography variant="body1" color="text.secondary" paragraph>
              We&apos;re working on SOC 2 aligned processes, regular penetration testing, and customer-facing security tooling such as audit logging and two-factor authentication.
            </Typography>
          </Box>

          <Box>
            <Typography variant="h5" component="h2" gutterBottom>
              Report a Concern
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Found a vulnerability? Email security@openl.app. We acknowledge reports within two business days and will work with you on responsible disclosure.
            </Typography>
          </Box>
        </Stack>
      </Box>
    </Container>
  );
}

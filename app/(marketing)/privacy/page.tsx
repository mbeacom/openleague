import type { Metadata } from 'next';
import { Container, Box, Typography, Divider, Stack } from '@mui/material';

export const metadata: Metadata = {
  title: 'Privacy Policy - OpenLeague',
  description: 'Learn how OpenLeague handles personal data and keeps your information safe.',
};

export default function PrivacyPolicyPage() {
  return (
    <Container maxWidth="md">
      <Box sx={{ py: 8 }}>
        <Typography variant="h1" component="h1" gutterBottom>
          Privacy Policy
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
          Last updated: {new Date().getFullYear()}
        </Typography>
        <Typography variant="body1" paragraph>
          We&apos;re drafting a comprehensive privacy policy that reflects how OpenLeague collects, uses, and protects data.
          While that work is in progress, the summary below highlights the principles we follow today.
        </Typography>

        <Stack spacing={4} sx={{ mt: 4 }}>
          <Box>
            <Typography variant="h5" component="h2" gutterBottom>
              Data Ownership
            </Typography>
            <Typography variant="body1" color="text.secondary">
              You own your team&apos;s data. We never sell or share personal information with third parties,
              and we only use your data to deliver OpenLeague features.
            </Typography>
          </Box>

          <Box>
            <Typography variant="h5" component="h2" gutterBottom>
              Data Storage
            </Typography>
            <Typography variant="body1" color="text.secondary">
              OpenLeague stores information in secure, access-controlled environments. We limit retention to what&apos;s needed for
              operating the platform and delete data when you request it.
            </Typography>
          </Box>

          <Box>
            <Typography variant="h5" component="h2" gutterBottom>
              Next Steps
            </Typography>
            <Typography variant="body1" color="text.secondary">
              A full policy—covering data processors, regional requirements, and contact details—is coming soon.
              If you have urgent compliance questions, reach out to support@openl.app and we&apos;ll help right away.
            </Typography>
          </Box>
        </Stack>

        <Divider sx={{ my: 6 }} />

        <Typography variant="body2" color="text.secondary">
          This page is a placeholder and does not constitute legal advice. We&apos;ll replace it with a finalized policy before launch.
        </Typography>
      </Box>
    </Container>
  );
}

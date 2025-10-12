import type { Metadata } from 'next';
import Link from 'next/link';
import { Container, Box, Typography, Button, Stack } from '@mui/material';

export const metadata: Metadata = {
  title: 'Careers - OpenLeague',
  description: 'Learn about future opportunities to work with the OpenLeague team.',
};

export default function CareersPage() {
  return (
    <Container maxWidth="md">
      <Box sx={{ py: 8, textAlign: 'center' }}>
        <Typography variant="h1" component="h1" gutterBottom>
          Join the Team
        </Typography>
        <Typography variant="h5" color="text.secondary" paragraph>
          We&apos;re not hiring right now, but we&apos;re always excited to connect with people who love building tools for sports teams.
        </Typography>
        <Typography variant="body1" color="text.secondary" paragraph>
          Follow the project on GitHub to track progress, or reach out if you&apos;d like to collaborate on the open-source roadmap.
        </Typography>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center" sx={{ mt: 4 }}>
          <Button component={Link} href="https://github.com/mbeacom/openleague" target="_blank" rel="noopener noreferrer" variant="contained">
            View GitHub
          </Button>
          <Button component={Link} href="/contact" variant="outlined">
            Say Hello
          </Button>
        </Stack>
      </Box>
    </Container>
  );
}

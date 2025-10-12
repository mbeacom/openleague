import type { Metadata } from 'next';
import Link from 'next/link';
import { Container, Box, Typography, Button, Stack } from '@mui/material';

export const metadata: Metadata = {
  title: 'Blog - OpenLeague',
  description: 'Insights, updates, and stories from the OpenLeague team. Stay tuned for upcoming articles.',
};

export default function BlogPage() {
  return (
    <Container maxWidth="md">
      <Box sx={{ py: 8, textAlign: 'center' }}>
        <Typography variant="h1" component="h1" gutterBottom>
          OpenLeague Blog
        </Typography>
        <Typography variant="h5" color="text.secondary" paragraph>
          We&apos;re working on fresh content covering product updates, best practices, and stories from real teams.
        </Typography>
        <Typography variant="body1" color="text.secondary" paragraph>
          Check back soon for our first posts. In the meantime, you can explore our documentation or reach out with ideas for topics you&apos;d like to see.
        </Typography>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center" sx={{ mt: 4 }}>
          <Button component={Link} href="/docs" variant="contained">
            Explore Documentation
          </Button>
          <Button component={Link} href="/contact" variant="outlined">
            Share Blog Ideas
          </Button>
        </Stack>
      </Box>
    </Container>
  );
}

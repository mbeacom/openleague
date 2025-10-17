import Link from 'next/link';
import { Container, Box, Typography, Button, Stack } from '@mui/material';
import { generatePageMetadata, getBreadcrumbSchema } from '@/lib/config/seo';
import StructuredData from '@/components/ui/StructuredData';

export const metadata = generatePageMetadata({
  title: 'Blog',
  description: 'Insights, updates, and stories from the OpenLeague team. Product updates, best practices, and team management tips.',
  path: '/blog',
  keywords: ['blog', 'updates', 'news', 'team management tips'],
});

export default function BlogPage() {
  const breadcrumbSchema = getBreadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: 'Blog', url: '/blog' },
  ]);

  return (
    <>
      <StructuredData data={breadcrumbSchema} />
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
    </>
  );
}

import { Container, Box, Typography, Stack } from '@mui/material';
import { generatePageMetadata, getBreadcrumbSchema } from '@/lib/config/seo';
import StructuredData from '@/components/ui/StructuredData';

export const metadata = generatePageMetadata({
  title: 'Cookie Policy',
  description: 'Learn how OpenLeague uses cookies and similar technologies. Privacy-friendly analytics and essential cookies only.',
  path: '/cookies',
  noIndex: true, // Don't index placeholder legal pages
});

export default function CookiePolicyPage() {
  const breadcrumbSchema = getBreadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: 'Cookie Policy', url: '/cookies' },
  ]);

  return (
    <>
      <StructuredData data={breadcrumbSchema} />
      <Container maxWidth="md">
        <Box sx={{ py: 8 }}>
          <Typography variant="h1" component="h1" gutterBottom>
            Cookie Policy
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
            Last updated: October 2025
          </Typography>
          <Typography variant="body1" paragraph>
            OpenLeague uses a limited set of cookies to keep you signed in and remember basic preferences.
            We don&apos;t run ads or sell tracking data, and we&apos;ll give you full control when advanced settings are available.
          </Typography>

          <Stack spacing={3} sx={{ mt: 4 }}>
            <Box>
              <Typography variant="h5" component="h2" gutterBottom>
                Essential Cookies
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Required for authentication and security. These cookies make sure the right people access the right teams.
              </Typography>
            </Box>
            <Box>
              <Typography variant="h5" component="h2" gutterBottom>
                Analytics
              </Typography>
              <Typography variant="body1" color="text.secondary">
                We use privacy-friendly analytics to understand usage patterns. No personal data is sold or shared.
              </Typography>
            </Box>
            <Box>
              <Typography variant="h5" component="h2" gutterBottom>
                Future Controls
              </Typography>
              <Typography variant="body1" color="text.secondary">
                A detailed cookie dashboard is on the roadmap. Until then, contact support@openl.app for questions or deletion requests.
              </Typography>
            </Box>
          </Stack>
        </Box>
      </Container>
    </>
  );
}

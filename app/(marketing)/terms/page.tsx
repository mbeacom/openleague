import { Container, Box, Typography } from '@mui/material';
import { generatePageMetadata, getBreadcrumbSchema } from '@/lib/config/seo';
import StructuredData from '@/components/ui/StructuredData';

export const metadata = generatePageMetadata({
  title: 'Terms of Service',
  description: 'Understand the basic terms for using the OpenLeague platform. Your rights and responsibilities as a user.',
  path: '/terms',
  noIndex: true, // Don't index placeholder legal pages
});

export default function TermsPage() {
  const breadcrumbSchema = getBreadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: 'Terms of Service', url: '/terms' },
  ]);

  return (
    <>
      <StructuredData data={breadcrumbSchema} />
      <Container maxWidth="md">
        <Box sx={{ py: 8 }}>
          <Typography variant="h1" component="h1" gutterBottom>
            Terms of Service
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
            Last updated: October 2025
          </Typography>
          <Typography variant="body1" paragraph>
            We&apos;re preparing the formal Terms of Service for OpenLeague. Until those are finalized, here&apos;s what you can expect:
          </Typography>

          <Box component="ul" sx={{ listStyleType: 'disc', pl: 3, mt: 2, '& li': { pl: 1, mb: 1.5 } }}>
            <li>
              <Typography variant="body1" color="text.secondary">
                You retain ownership of the content you add to OpenLeague.
              </Typography>
            </li>
            <li>
              <Typography variant="body1" color="text.secondary">
                You agree to use the platform responsibly and respect other members of your teams and leagues.
              </Typography>
            </li>
            <li>
              <Typography variant="body1" color="text.secondary">
                We provide OpenLeague as-is while the service is in early access. We&apos;ll communicate any breaking changes in advance.
              </Typography>
            </li>
          </Box>

          <Typography variant="body1" color="text.secondary" sx={{ mt: 4 }}>
            The detailed terms—including acceptable use, subscription billing, and dispute resolution—are coming soon. Contact support@openl.app if you need specifics before then.
          </Typography>
        </Box>
      </Container>
    </>
  );
}

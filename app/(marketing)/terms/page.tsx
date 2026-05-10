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
            Last updated: May 2026
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
                We provide OpenLeague as-is while the service is in early access. When practical, we&apos;ll communicate material changes in advance.
              </Typography>
            </li>
          </Box>

          <Box sx={{ mt: 5 }}>
            <Typography variant="h4" component="h2" gutterBottom>
              Current Free Access
            </Typography>
            <Typography variant="body1" color="text.secondary" paragraph>
              OpenLeague is currently offered without subscription billing or paid feature tiers. This current free access is not a promise that the hosted service, any particular feature, or any future release will remain free indefinitely.
            </Typography>
            <Typography variant="body1" color="text.secondary" paragraph>
              We will not retroactively charge you for prior free use. If we introduce paid subscriptions, paid add-ons, usage limits, sponsored placements, advertising, or feature gates in the future, those changes will apply prospectively according to the terms presented at that time.
            </Typography>
          </Box>

          <Box sx={{ mt: 5 }}>
            <Typography variant="h4" component="h2" gutterBottom>
              Service and Feature Changes
            </Typography>
            <Typography variant="body1" color="text.secondary" paragraph>
              OpenLeague is an early-stage service. We reserve the right to modify, limit, suspend, discontinue, or shut down the hosted service or any feature at any time, with or without notice where permitted by law.
            </Typography>
            <Typography variant="body1" color="text.secondary" paragraph>
              We may also change which features are available for free, move features into paid plans, introduce new paid features, change usage limits, or change access requirements as the platform matures. Continuing to use OpenLeague after changes take effect means you accept the updated terms.
            </Typography>
            <Typography variant="body1" color="text.secondary" paragraph>
              When practical, we will try to provide reasonable advance notice for material changes and an opportunity to export your team data before discontinuing hosted access. That said, OpenLeague is provided as-is during early access and should not be treated as a guaranteed permanent free service.
            </Typography>
          </Box>

          <Typography variant="body1" color="text.secondary" sx={{ mt: 4 }}>
            The detailed terms—including acceptable use, service availability, and dispute resolution—are coming soon. Contact support@openl.app if you need specifics before then.
          </Typography>
        </Box>
      </Container>
    </>
  );
}

import { Container, Typography, Box, Card, CardContent, Stack, Chip } from '@mui/material';
import { Email as EmailIcon, GitHub as GitHubIcon, BugReport as BugReportIcon } from '@mui/icons-material';
import { generatePageMetadata, getBreadcrumbSchema } from '@/lib/config/seo';
import StructuredData from '@/components/ui/StructuredData';

export const metadata = generatePageMetadata({
  title: 'Contact',
  description: 'Get in touch with the OpenLeague team for support, feedback, or questions. We\'re here to help with your team management needs.',
  path: '/contact',
  keywords: ['contact', 'support', 'help', 'customer service'],
});

export default function ContactPage() {
  const breadcrumbSchema = getBreadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: 'Contact', url: '/contact' },
  ]);

  return (
    <>
      <StructuredData data={breadcrumbSchema} />
      <Container maxWidth="lg">
        <Box sx={{ py: 8 }}>
          <Typography variant="h1" component="h1" gutterBottom>
            Contact Us
          </Typography>
          <Typography variant="h5" color="text.secondary" sx={{ mb: 6 }}>
            We&apos;re here to help. Reach out with questions, feedback, or support requests.
          </Typography>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 3, mb: 6 }}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <EmailIcon sx={{ fontSize: 40, color: 'primary.main', mr: 2 }} />
                  <Typography variant="h6">Email Support</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" paragraph>
                  For general inquiries, support questions, or feedback:
                </Typography>
                <Typography
                  component="a"
                  href="mailto:support@openl.app"
                  variant="body1"
                  sx={{
                    color: 'primary.main',
                    textDecoration: 'none',
                    '&:hover': { textDecoration: 'underline' },
                  }}
                >
                  support@openl.app
                </Typography>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <GitHubIcon sx={{ fontSize: 40, color: 'primary.main', mr: 2 }} />
                  <Typography variant="h6">GitHub</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" paragraph>
                  For open-source contributions, discussions, and community support:
                </Typography>
                <Typography
                  component="a"
                  href="https://github.com/mbeacom/openleague"
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="body1"
                  sx={{
                    color: 'primary.main',
                    textDecoration: 'none',
                    '&:hover': { textDecoration: 'underline' },
                  }}
                >
                  github.com/mbeacom/openleague
                </Typography>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <BugReportIcon sx={{ fontSize: 40, color: 'primary.main', mr: 2 }} />
                  <Typography variant="h6">Report Issues</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Found a bug or have a feature request? Submit an issue on GitHub:
                </Typography>
                <Typography
                  component="a"
                  href="https://github.com/mbeacom/openleague/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="body1"
                  sx={{
                    color: 'primary.main',
                    textDecoration: 'none',
                    '&:hover': { textDecoration: 'underline' },
                  }}
                >
                  Submit an Issue
                </Typography>
              </CardContent>
            </Card>
          </Box>

          <Box sx={{ mb: 6 }}>
            <Typography variant="h4" component="h2" gutterBottom>
              What to Expect
            </Typography>
            <Stack spacing={2}>
              <Box>
                <Typography variant="h6" gutterBottom>
                  Response Time
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  We aim to respond to all inquiries within 24-48 hours during business days.
                  For urgent issues affecting your team, please indicate priority in your message.
                </Typography>
              </Box>
              <Box>
                <Typography variant="h6" gutterBottom>
                  Support Hours
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Our core support hours are Monday-Friday, 9 AM - 5 PM EST. Community support
                  via GitHub Discussions is available 24/7.
                </Typography>
              </Box>
              <Box>
                <Typography variant="h6" gutterBottom>
                  Before Contacting
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  To help us assist you faster, please check our documentation first:
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Chip
                    label="Documentation"
                    component="a"
                    href="/docs"
                    clickable
                    color="primary"
                    variant="outlined"
                  />
                  <Chip
                    label="User Guide"
                    component="a"
                    href="/docs/user-guide"
                    clickable
                    color="primary"
                    variant="outlined"
                  />
                  <Chip
                    label="FAQ"
                    component="a"
                    href="/docs/guides"
                    clickable
                    color="primary"
                    variant="outlined"
                  />
                </Stack>
              </Box>
            </Stack>
          </Box>

          <Box>
            <Typography variant="h4" component="h2" gutterBottom>
              Community
            </Typography>
            <Typography variant="body1" paragraph>
              OpenLeague is an open-source project built by and for the community. Join our
              GitHub Discussions to connect with other users, share ideas, and help shape the
              future of the platform.
            </Typography>
          </Box>
        </Box>
      </Container>
    </>
  );
}
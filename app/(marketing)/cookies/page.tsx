import {
  Container,
  Box,
  Typography,
  Divider,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from '@mui/material';
import { generatePageMetadata, getBreadcrumbSchema } from '@/lib/config/seo';
import StructuredData from '@/components/ui/StructuredData';
import {
  DraftNotice,
  CounselPlaceholder,
  LegalSection,
  LegalToc,
} from '@/components/features/legal/LegalScaffold';

export const metadata = generatePageMetadata({
  title: 'Cookie Policy',
  description: 'Learn how OpenLeague uses cookies and similar technologies. Privacy-friendly analytics and essential cookies only.',
  path: '/cookies',
  noIndex: true, // Don't index draft legal pages until counsel-approved
});

const SECTIONS = [
  { id: 'what-cookies-are', title: 'What Cookies Are' },
  { id: 'cookies-we-use', title: 'Types of Cookies We Use' },
  { id: 'third-parties', title: 'Third-Party Services' },
  { id: 'managing-preferences', title: 'Managing Your Preferences' },
  { id: 'contact', title: 'Contact Us' },
];

// Factual inventory of current cookie categories. Counsel finalizes the
// descriptions; engineering keeps the rows accurate as the product changes.
const COOKIE_ROWS = [
  {
    category: 'Essential — authentication',
    example: 'Auth.js session cookies (__Secure- prefixed, HTTP-only)',
    purpose: 'Keeps you signed in and protects against request forgery. Required for the app to function.',
  },
  {
    category: 'Preferences',
    example: 'Theme / display preferences',
    purpose: 'Remembers basic UI choices such as color scheme.',
  },
  {
    category: 'Analytics',
    example: 'Umami (privacy-friendly, cookieless where possible)',
    purpose: 'Aggregate usage statistics. No advertising or cross-site tracking.',
  },
];

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
            Draft structure — July 2026 · final text pending legal review
          </Typography>

          <DraftNotice />
          <LegalToc items={SECTIONS} />

          <Stack spacing={5}>
            <LegalSection
              id="what-cookies-are"
              title="What Cookies Are"
              covers="Will describe cookies and similar technologies (local storage) in plain language."
            />

            <LegalSection
              id="cookies-we-use"
              title="Types of Cookies We Use"
              covers="The table below is the current factual inventory of cookie categories OpenLeague uses."
            >
              <TableContainer component={Paper} variant="outlined" sx={{ mt: 2 }}>
                <Table size="small" aria-label="Cookie categories used by OpenLeague">
                  <TableHead>
                    <TableRow>
                      <TableCell>Category</TableCell>
                      <TableCell>Examples</TableCell>
                      <TableCell>Purpose</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {COOKIE_ROWS.map((row) => (
                      <TableRow key={row.category}>
                        <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {row.category}
                        </TableCell>
                        <TableCell>{row.example}</TableCell>
                        <TableCell>{row.purpose}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <CounselPlaceholder note="Final cookie inventory, durations, and legal descriptions to be confirmed with counsel" />
            </LegalSection>

            <LegalSection
              id="third-parties"
              title="Third-Party Services"
              covers="Will describe third parties that may set cookies or receive requests (e.g., Stripe during checkout) and link to their policies."
            />

            <LegalSection
              id="managing-preferences"
              title="Managing Your Preferences"
              covers="Will describe browser-level cookie controls and any in-app preference controls, and note that blocking essential cookies prevents sign-in."
            />

            <LegalSection
              id="contact"
              title="Contact Us"
              covers="Cookie questions can be sent to support@openl.app."
            />
          </Stack>

          <Divider sx={{ my: 6 }} />

          <Typography variant="body2" color="text.secondary">
            This page is a structural draft and does not constitute legal advice. The finalized,
            counsel-reviewed policy will replace it before public launch.
          </Typography>
        </Box>
      </Container>
    </>
  );
}

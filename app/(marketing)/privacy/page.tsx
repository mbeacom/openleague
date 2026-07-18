import { Container, Box, Typography, Divider, Stack } from '@mui/material';
import { generatePageMetadata, getBreadcrumbSchema } from '@/lib/config/seo';
import StructuredData from '@/components/ui/StructuredData';
import {
  DraftNotice,
  CounselPlaceholder,
  LegalSection,
  LegalToc,
} from '@/components/features/legal/LegalScaffold';

export const metadata = generatePageMetadata({
  title: 'Privacy Policy',
  description: 'Learn how OpenLeague handles personal data and keeps your information safe. Your data ownership and privacy are our priorities.',
  path: '/privacy',
  noIndex: true, // Don't index draft legal pages until counsel-approved
});

const SECTIONS = [
  { id: 'information-we-collect', title: 'Information We Collect' },
  { id: 'how-we-use-information', title: 'How We Use Information' },
  { id: 'how-we-share-information', title: 'How Information Is Shared' },
  { id: 'childrens-privacy', title: "Children's Privacy (COPPA)" },
  { id: 'data-retention', title: 'Data Retention' },
  { id: 'your-rights', title: 'Your Rights & Choices' },
  { id: 'security', title: 'Data Security' },
  { id: 'changes', title: 'Changes to This Policy' },
  { id: 'contact', title: 'Contact Us' },
];

export default function PrivacyPolicyPage() {
  const breadcrumbSchema = getBreadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: 'Privacy Policy', url: '/privacy' },
  ]);

  return (
    <>
      <StructuredData data={breadcrumbSchema} />
      <Container maxWidth="md">
        <Box sx={{ py: 8 }}>
          <Typography variant="h1" component="h1" gutterBottom>
            Privacy Policy
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
            Draft structure — July 2026 · final text pending legal review
          </Typography>

          <DraftNotice />
          <LegalToc items={SECTIONS} />

          <Stack spacing={5}>
            <LegalSection
              id="information-we-collect"
              title="Information We Collect"
              covers="Will describe the categories of data OpenLeague collects: account details (name, email, password), roster information entered by team admins (including player contact details, emergency contacts, and dates of birth), event and RSVP activity, payment records processed by Stripe, and technical/log data."
            />

            <LegalSection
              id="how-we-use-information"
              title="How We Use Information"
              covers="Will describe the purposes for processing: operating team, league, scheduling, and communication features; sending transactional email; and maintaining security and preventing abuse."
            />

            <LegalSection
              id="how-we-share-information"
              title="How Information Is Shared"
              covers="Will describe sharing within teams and leagues (what admins vs. regular members can see), the service providers acting as processors (hosting, database, email delivery, payments), and legally compelled disclosure."
            />

            <LegalSection
              id="childrens-privacy"
              title="Children's Privacy (COPPA)"
              covers="Will describe how OpenLeague handles children's data: rosters may include players under 13, the platform records a date of birth and requires a parental-consent attestation before storing an under-13 player's information, and parents/guardians can request review or deletion of a child's data."
            >
              <CounselPlaceholder note="COPPA disclosure, verifiable-parental-consent description, and parental rights process to be provided by counsel" />
            </LegalSection>

            <LegalSection
              id="data-retention"
              title="Data Retention"
              covers="Will describe how long account, roster, and audit data is kept and what happens when an account or player entry is deleted."
            />

            <LegalSection
              id="your-rights"
              title="Your Rights & Choices"
              covers="Will describe access, correction, export, and deletion rights, plus any region-specific rights (e.g., GDPR/CCPA) that apply."
            />

            <LegalSection
              id="security"
              title="Data Security"
              covers="Will describe the technical and organizational measures protecting data (encryption in transit, hashed credentials, role-based access controls)."
            />

            <LegalSection
              id="changes"
              title="Changes to This Policy"
              covers="Will describe how policy updates are published and how material changes are communicated to users."
            />

            <LegalSection
              id="contact"
              title="Contact Us"
              covers="Privacy questions can be sent to support@openl.app."
            >
              <CounselPlaceholder note="Formal privacy contact details and any required designated-representative information to be provided by counsel" />
            </LegalSection>
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

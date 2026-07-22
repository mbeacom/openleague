import {
  Box,
  Card,
  CardContent,
  Chip,
  Container,
  Divider,
  Stack,
  Typography,
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Event as EventIcon,
  Groups as GroupsIcon,
  Mail as MailIcon,
  Security as SecurityIcon,
  MoneyOff as MoneyOffIcon,
  Shield as ShieldIcon,
  Code as CodeIcon,
  CloudDownload as CloudDownloadIcon,
  AccountTree as AccountTreeIcon,
} from '@mui/icons-material';
import CTAButton from '@/components/features/marketing/CTAButton';
import { generatePageMetadata, getBreadcrumbSchema, getFAQSchema } from '@/lib/config/seo';
import StructuredData from '@/components/ui/StructuredData';

export const metadata = generatePageMetadata({
  title: 'Pricing',
  description:
    'OpenLeague is free forever for teams — roster, scheduling, RSVPs, and communication with no subscriptions and no credit card. Optional paid tiers for leagues and clubs fund the free team plan.',
  path: '/pricing',
  keywords: ['pricing', 'free team management', 'free sports team software', 'league management pricing'],
});

const includedFeatures = [
  {
    icon: GroupsIcon,
    title: 'Roster management',
    description: 'Create teams, invite members, and keep roster details in one secure place.',
  },
  {
    icon: EventIcon,
    title: 'Scheduling and RSVPs',
    description: 'Publish games and practices, then track attendance before every event.',
  },
  {
    icon: MailIcon,
    title: 'Team communication',
    description: 'Send invitations and event updates without juggling spreadsheets or group chats.',
  },
  {
    icon: SecurityIcon,
    title: 'Role-based access',
    description: 'Give admins and members the right level of access for each team or league.',
  },
];

const commitments = [
  {
    icon: MoneyOffIcon,
    title: 'No per-team paywall, ever',
    description:
      'Teams manage rosters, schedules, and communication for free — no seat limits, no per-roster fees, no countdown to a bill.',
  },
  {
    icon: ShieldIcon,
    title: 'No third-party ads',
    description:
      'We never sell ads against your team — especially not on pages that include kids’ data.',
  },
  {
    icon: CodeIcon,
    title: 'Open-source and self-hostable',
    description:
      'The source is public under the Apache License 2.0 — fork it, self-host it, or run it commercially, anytime.',
  },
  {
    icon: CloudDownloadIcon,
    title: 'Your data is exportable',
    description:
      'Your roster and schedule belong to you. Export your data whenever you need it — no lock-in.',
  },
];

const leagueFeatures = [
  'Multiple teams and divisions in one organization',
  'Cross-team and cross-division scheduling',
  'Facility and ice allocation across teams',
  'Org-wide communications and announcements',
  'Custom domain for your league or club',
  'Single sign-on (SSO) for staff and admins',
  'Data export for your whole organization',
  'Priority support from the OpenLeague team',
];

const faqs = [
  {
    question: 'Is OpenLeague free?',
    answer:
      'Yes. Managing your team on OpenLeague is free, permanently — no subscriptions, no paid feature gates, and no credit card.',
  },
  {
    question: 'Is it really free for teams?',
    answer:
      'Yes, permanently. The free team plan is a commitment, not a trial. Teams don’t pay us to run their roster, schedule, and communication — not per player, not per season, not ever.',
  },
  {
    question: 'Do I need a credit card to start?',
    answer:
      'No. Teams can sign up and start using OpenLeague right away without a credit card — now or ever.',
  },
  {
    question: 'How does OpenLeague make money?',
    answer:
      'Through optional paid tiers for leagues and clubs (below) and, later, opt-in local sponsorships that clubs choose — never by charging teams or showing third-party ads.',
  },
];

export default function PricingPage() {
  const breadcrumbSchema = getBreadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: 'Pricing', url: '/pricing' },
  ]);
  const faqSchema = getFAQSchema(faqs);

  return (
    <>
      <StructuredData data={[breadcrumbSchema, faqSchema]} />
      <Container maxWidth="lg">
        <Box sx={{ py: { xs: 8, md: 10 } }}>
          <Stack spacing={3} alignItems="center" textAlign="center" sx={{ mb: 8 }}>
            <Chip label="Free forever for teams" color="success" variant="outlined" />
            <Typography variant="h1" component="h1" gutterBottom>
              Simple Pricing for Busy Teams
            </Typography>
            <Typography variant="h5" color="text.secondary" sx={{ maxWidth: 820 }}>
              OpenLeague gives coaches and managers the core team-management tools they need — free, forever, with no subscriptions, paid tiers, or credit card.
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ pt: 2 }}>
              <CTAButton
                href="/signup"
                variant="contained"
                size="large"
                trackingAction="pricing_start_free_click"
                trackingLabel="pricing_hero"
              >
                Start Free Today
              </CTAButton>
              <CTAButton
                href="/features"
                variant="outlined"
                size="large"
                trackingAction="pricing_compare_features_click"
                trackingLabel="pricing_hero"
              >
                Compare Features
              </CTAButton>
            </Stack>
          </Stack>

          <Card
            sx={{
              mb: 4,
              border: '2px solid',
              borderColor: 'success.main',
              boxShadow: '0 12px 32px rgba(46, 125, 50, 0.12)',
            }}
          >
            <CardContent sx={{ p: { xs: 3, md: 5 } }}>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={4} justifyContent="space-between">
                <Box>
                  <Typography variant="h3" component="h2" gutterBottom>
                    Free Team Plan
                  </Typography>
                  <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 620 }}>
                    Built for teams replacing spreadsheets, email chains, and group chats with one organized hub.
                  </Typography>
                </Box>
                <Box sx={{ textAlign: { xs: 'left', md: 'right' } }}>
                  <Typography variant="h2" component="p" color="success.main">
                    $0
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    No credit card required
                  </Typography>
                </Box>
              </Stack>
              <Divider sx={{ my: 4 }} />
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 3 }}>
                {includedFeatures.map((feature) => {
                  const Icon = feature.icon;
                  return (
                    <Stack key={feature.title} direction="row" spacing={2} alignItems="flex-start">
                      <Icon sx={{ color: 'primary.main', fontSize: 32, mt: 0.5 }} />
                      <Box>
                        <Typography variant="h6" component="h3" gutterBottom>
                          {feature.title}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {feature.description}
                        </Typography>
                      </Box>
                    </Stack>
                  );
                })}
              </Box>
            </CardContent>
          </Card>

          {/* Explicit, written free commitment */}
          <Box
            sx={{
              mb: 8,
              p: { xs: 3, md: 4 },
              borderRadius: 2,
              bgcolor: 'rgba(46, 125, 50, 0.06)',
              border: '1px solid',
              borderColor: 'success.main',
            }}
          >
            <Stack direction="row" spacing={2} alignItems="flex-start">
              <CheckCircleIcon color="success" sx={{ fontSize: 32, mt: 0.25 }} />
              <Typography variant="h6" component="p" sx={{ fontWeight: 600 }}>
                This isn&apos;t a trial or a countdown. Teams don&apos;t pay us — not per player, not per season, not ever.
              </Typography>
            </Stack>
          </Box>

          {/* League & Club tier — contact-driven, funds the free team plan */}
          <Card
            sx={{
              mb: 8,
              border: '2px solid',
              borderColor: 'primary.main',
              boxShadow: '0 12px 32px rgba(13, 71, 161, 0.12)',
            }}
          >
            <CardContent sx={{ p: { xs: 3, md: 5 } }}>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={4} justifyContent="space-between" alignItems={{ md: 'center' }}>
                <Box>
                  <Chip
                    icon={<AccountTreeIcon />}
                    label="For leagues, clubs, and associations"
                    color="primary"
                    variant="outlined"
                    sx={{ mb: 2 }}
                  />
                  <Typography variant="h3" component="h2" gutterBottom>
                    League &amp; Club
                  </Typography>
                  <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 620 }}>
                    Everything a multi-team organization needs to run a season — and the tier that funds the free team plan.
                  </Typography>
                </Box>
                <Box sx={{ textAlign: { xs: 'left', md: 'right' } }}>
                  <Typography variant="h4" component="p" color="primary.main">
                    Let&apos;s talk
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Pricing set with design-partner clubs
                  </Typography>
                </Box>
              </Stack>
              <Divider sx={{ my: 4 }} />
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 2 }}>
                {leagueFeatures.map((feature) => (
                  <Stack key={feature} direction="row" spacing={1.5} alignItems="center">
                    <CheckCircleIcon sx={{ color: 'primary.main', fontSize: 22 }} />
                    <Typography variant="body1">{feature}</Typography>
                  </Stack>
                ))}
              </Box>
              <Box sx={{ mt: 4 }}>
                <CTAButton
                  href="/contact"
                  variant="contained"
                  size="large"
                  trackingAction="pricing_league_contact_click"
                  trackingLabel="pricing_league_tier"
                >
                  Talk to us about your league or club
                </CTAButton>
              </Box>
            </CardContent>
          </Card>

          {/* What's included, free + Our commitments */}
          <Box sx={{ mb: 8 }}>
            <Typography variant="h4" component="h2" gutterBottom textAlign="center">
              Free, and honest about it
            </Typography>
            <Typography variant="body1" color="text.secondary" textAlign="center" sx={{ mb: 4, maxWidth: 720, mx: 'auto' }}>
              Here is exactly what teams get for free, and the commitments we make to keep it that way.
            </Typography>

            <Typography variant="h6" component="h3" gutterBottom>
              What&apos;s included, free
            </Typography>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
                gap: 2,
                mb: 5,
              }}
            >
              {includedFeatures.map((feature) => (
                <Stack key={feature.title} direction="row" spacing={1.5} alignItems="center">
                  <CheckCircleIcon color="success" sx={{ fontSize: 22 }} />
                  <Typography variant="body1">{feature.title}</Typography>
                </Stack>
              ))}
            </Box>

            <Typography variant="h6" component="h3" gutterBottom>
              Our commitments
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 2 }}>
              {commitments.map((commitment) => {
                const Icon = commitment.icon;
                return (
                  <Card key={commitment.title} variant="outlined">
                    <CardContent>
                      <Stack direction="row" spacing={2} alignItems="flex-start">
                        <Icon sx={{ color: 'primary.main', fontSize: 32, mt: 0.5 }} />
                        <Box>
                          <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                            {commitment.title}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {commitment.description}
                          </Typography>
                        </Box>
                      </Stack>
                    </CardContent>
                  </Card>
                );
              })}
            </Box>
          </Box>

          <Box sx={{ mb: 8 }}>
            <Typography variant="h4" component="h2" gutterBottom>
              Pricing FAQ
            </Typography>
            <Stack spacing={3}>
              {faqs.map((faq) => (
                <Box key={faq.question}>
                  <Typography variant="h6" component="h3" gutterBottom>
                    {faq.question}
                  </Typography>
                  <Typography variant="body1" color="text.secondary">
                    {faq.answer}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </Box>

          <Box sx={{ textAlign: 'center', p: { xs: 3, md: 5 }, bgcolor: 'background.paper', borderRadius: 2 }}>
            <Typography variant="h4" component="h2" gutterBottom>
              Ready to organize your team?
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
              Create your account, set up a team, and invite players in minutes.
            </Typography>
            <CTAButton
              href="/signup"
              variant="contained"
              size="large"
              trackingAction="pricing_get_started_click"
              trackingLabel="pricing_final_cta"
            >
              Get Started Free
            </CTAButton>
          </Box>
        </Box>
      </Container>
    </>
  );
}

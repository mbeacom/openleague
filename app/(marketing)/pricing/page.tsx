import {
  Box,
  Button,
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
} from '@mui/icons-material';
import { generatePageMetadata, getBreadcrumbSchema, getFAQSchema } from '@/lib/config/seo';
import StructuredData from '@/components/ui/StructuredData';

export const metadata = generatePageMetadata({
  title: 'Pricing',
  description:
    'OpenLeague is free for teams today. See what is included, compare value against paid alternatives, and start managing your team without a credit card.',
  path: '/pricing',
  keywords: ['pricing', 'free team management', 'free sports team software', 'team management cost'],
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

const comparisonRows = [
  ['Hosted access for early teams', 'Included today', 'Often paid per team or per roster'],
  ['Roster, schedule, and RSVP tools', 'Included', 'May require multiple tools'],
  ['No credit card to start', 'Yes', 'Frequently required for trials'],
  ['Open-source codebase', 'Public repository', 'Usually closed source'],
];

const faqs = [
  {
    question: 'Is OpenLeague free?',
    answer:
      'OpenLeague currently offers free hosted access with no subscription billing or paid feature gates.',
  },
  {
    question: 'Do I need a credit card to start?',
    answer: 'No. Teams can sign up and begin using OpenLeague without a credit card.',
  },
  {
    question: 'Will pricing change later?',
    answer:
      'OpenLeague is early-stage. If paid plans, add-ons, limits, ads, or sponsored placements are introduced later, those changes will apply prospectively under the terms presented at that time.',
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
            <Chip label="Free hosted access today" color="success" variant="outlined" />
            <Typography variant="h1" component="h1" gutterBottom>
              Simple Pricing for Busy Teams
            </Typography>
            <Typography variant="h5" color="text.secondary" sx={{ maxWidth: 820 }}>
              OpenLeague currently gives coaches and managers the core team-management tools they need without subscriptions, paid tiers, or a credit card.
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ pt: 2 }}>
              <Button href="/signup" variant="contained" size="large">
                Start Free Today
              </Button>
              <Button href="/features" variant="outlined" size="large">
                Compare Features
              </Button>
            </Stack>
          </Stack>

          <Card
            sx={{
              mb: 8,
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

          <Box sx={{ mb: 8 }}>
            <Typography variant="h4" component="h2" gutterBottom textAlign="center">
              Value Compared with Paid Alternatives
            </Typography>
            <Typography variant="body1" color="text.secondary" textAlign="center" sx={{ mb: 4 }}>
              OpenLeague focuses on the common jobs teams need first, without forcing an immediate buying decision.
            </Typography>
            <Box sx={{ display: 'grid', gap: 2 }}>
              {comparisonRows.map(([capability, openLeague, alternatives]) => (
                <Card key={capability} variant="outlined">
                  <CardContent
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr', md: '1.2fr 1fr 1fr' },
                      gap: 2,
                      alignItems: 'center',
                    }}
                  >
                    <Typography variant="subtitle1" fontWeight={700}>
                      {capability}
                    </Typography>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <CheckCircleIcon color="success" fontSize="small" />
                      <Typography variant="body2">{openLeague}</Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      {alternatives}
                    </Typography>
                  </CardContent>
                </Card>
              ))}
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
            <Button href="/signup" variant="contained" size="large">
              Get Started Free
            </Button>
          </Box>
        </Box>
      </Container>
    </>
  );
}

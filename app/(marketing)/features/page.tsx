import {
  Container,
  Typography,
  Box,
  Card,
  CardContent,
  Stack,
  Chip,
} from '@mui/material';
import {
  People as PeopleIcon,
  Event as EventIcon,
  Notifications as NotificationsIcon,
  PhoneAndroid as PhoneAndroidIcon,
  Email as EmailIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import { generatePageMetadata, getBreadcrumbSchema } from '@/lib/config/seo';
import StructuredData from '@/components/ui/StructuredData';

export const metadata = generatePageMetadata({
  title: 'Features',
  description: 'Discover all the features that make OpenLeague the perfect solution for sports team management. Roster management, scheduling, RSVP tracking, and more.',
  path: '/features',
  keywords: ['team features', 'roster management features', 'scheduling features', 'sports software features'],
});

const features = [
  {
    icon: PeopleIcon,
    title: 'Roster Management',
    description:
      'Manage your team roster with ease. Track player information, roles, and availability all in one place.',
    highlights: ['Player profiles', 'Email invitations', 'Role management', 'Contact information'],
  },
  {
    icon: EventIcon,
    title: 'Event Scheduling',
    description:
      'Schedule games and practices with detailed information about location, time, and requirements.',
    highlights: ['Games & practices', 'Location tracking', 'Time management', 'Event details'],
  },
  {
    icon: CheckCircleIcon,
    title: 'RSVP Tracking',
    description:
      'Know who&apos;s coming to each event. Players can RSVP with Going, Not Going, or Maybe status.',
    highlights: ['Real-time updates', 'Attendance tracking', 'Status notifications', 'Team visibility'],
  },
  {
    icon: NotificationsIcon,
    title: 'Notifications',
    description:
      'Keep everyone informed with email notifications for invitations, event updates, and team changes.',
    highlights: ['Email alerts', 'Event reminders', 'Status updates', 'Team announcements'],
  },
  {
    icon: EmailIcon,
    title: 'Invitation System',
    description:
      'Invite players to join your team with email invitations. Track pending and accepted invitations.',
    highlights: ['Email invitations', 'Invite tracking', 'Expiration management', 'Automatic reminders'],
  },
  {
    icon: PhoneAndroidIcon,
    title: 'Mobile-First Design',
    description:
      'Access OpenLeague from any device. Our mobile-first design ensures a great experience on phones and tablets.',
    highlights: ['Responsive layout', 'Touch-optimized', 'Fast loading', 'Offline-ready'],
  },
];

export default function FeaturesPage() {
  const breadcrumbSchema = getBreadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: 'Features', url: '/features' },
  ]);

  return (
    <>
      <StructuredData data={breadcrumbSchema} />
      <Container maxWidth="lg">
        <Box sx={{ py: 8 }}>
          <Typography variant="h1" component="h1" gutterBottom textAlign="center">
            Everything You Need to Manage Your Team
          </Typography>
          <Typography variant="h5" color="text.secondary" textAlign="center" sx={{ mb: 8 }}>
            A complete set of features designed to replace spreadsheets, group chats, and email chains.
          </Typography>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 4 }}>
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <Card key={feature.title} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <CardContent sx={{ flexGrow: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                      <Icon sx={{ fontSize: 40, color: 'primary.main', mr: 2 }} />
                      <Typography variant="h5" component="h3">
                        {feature.title}
                      </Typography>
                    </Box>
                    <Typography variant="body1" color="text.secondary" paragraph>
                      {feature.description}
                    </Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {feature.highlights.map((highlight) => (
                        <Chip key={highlight} label={highlight} size="small" />
                      ))}
                    </Stack>
                  </CardContent>
                </Card>
              );
            })}
          </Box>

          <Box sx={{ mt: 8, p: 4, bgcolor: 'primary.main', color: 'primary.contrastText', borderRadius: 2 }}>
            <Typography variant="h4" component="h2" gutterBottom textAlign="center">
              Affordable Pricing, Open Source
            </Typography>
            <Typography variant="body1" textAlign="center" paragraph>
              All features available across our simple pricing tiers.
              OpenLeague is open-source (BSL 1.1) and community-driven.
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mt: 3 }}>
              <Chip
                label="Transparent Pricing"
                sx={{ bgcolor: 'rgba(255, 255, 255, 0.2)', color: 'inherit' }}
              />
              <Chip
                label="No Hidden Fees"
                sx={{ bgcolor: 'rgba(255, 255, 255, 0.2)', color: 'inherit' }}
              />
              <Chip label="Open Source" sx={{ bgcolor: 'rgba(255, 255, 255, 0.2)', color: 'inherit' }} />
            </Box>
          </Box>
        </Box>
      </Container>
    </>
  );
}
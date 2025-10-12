import type { Metadata } from 'next';
import { Container, Box, Typography, Card, CardContent, Chip, Stack } from '@mui/material';

const roadmapItems = [
  {
    label: 'Season Setup Tools',
    description:
      'Create recurring events, manage scheduling conflicts, and duplicate last season\'s schedule so managers can launch a new season in minutes.',
    status: 'In Progress',
  },
  {
    label: 'Mobile App Preview',
    description:
      'Early access to the React Native companion app focused on RSVP flows, chat, and real-time updates while on the go.',
    status: 'Planned',
  },
  {
    label: 'Advanced Permissions',
    description:
      'Role-based access for coaches, captains, and volunteers with scoped control over rosters, announcements, and financial data.',
    status: 'Planned',
  },
  {
    label: 'Integrations & API',
    description:
      'REST and GraphQL endpoints, calendar sync (iCal, Google Calendar), and automation hooks for Zapier and other tools.',
    status: 'Researching',
  },
];

export const metadata: Metadata = {
  title: 'Product Roadmap - OpenLeague Docs',
  description: 'See the high-level roadmap for upcoming OpenLeague features and improvements.',
};

export default function RoadmapPage() {
  return (
    <Container maxWidth="md">
      <Box sx={{ py: 6 }}>
        <Typography variant="h2" component="h1" gutterBottom>
          Product Roadmap
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
          We&apos;re actively building OpenLeague with the community. This roadmap highlights the initiatives on deck. Timelines may shift, and we&apos;ll keep this page updated as milestones are reached.
        </Typography>

        <Stack spacing={3}>
          {roadmapItems.map((item) => (
            <Card key={item.label}>
              <CardContent>
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={2}
                  alignItems={{ xs: 'flex-start', sm: 'center' }}
                  justifyContent="space-between"
                >
                  <Typography variant="h5" component="h2">
                    {item.label}
                  </Typography>
                  <Chip label={item.status} color="primary" variant="outlined" />
                </Stack>
                <Typography variant="body1" color="text.secondary" sx={{ mt: 2 }}>
                  {item.description}
                </Typography>
              </CardContent>
            </Card>
          ))}
        </Stack>

        <Typography variant="body2" color="text.secondary" sx={{ mt: 4 }}>
          Have feedback or want to influence the roadmap? Join the discussion on GitHub issues or reach out through the contact page.
        </Typography>
      </Box>
    </Container>
  );
}

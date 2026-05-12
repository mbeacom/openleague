'use client';

import {
  Box,
  Card,
  CardContent,
  Chip,
  Container,
  Grid,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import GroupsIcon from '@mui/icons-material/Groups';
import EventIcon from '@mui/icons-material/Event';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import PhoneIphoneIcon from '@mui/icons-material/PhoneIphone';

const features = [
  {
    icon: GroupsIcon,
    title: 'Team Roster Management',
    description: 'Keep players, guardians, team officials, and emergency details organized in one secure roster.',
    tone: 'primary' as const,
    demoLabel: 'Live roster demo',
    stats: ['18 players', '4 staff', '2 invites pending'],
    progress: 86,
  },
  {
    icon: EventIcon,
    title: 'Event Scheduling & RSVPs',
    description: 'Schedule games and practices with instant RSVP tracking so coaches know who is available.',
    tone: 'secondary' as const,
    demoLabel: 'Attendance snapshot demo',
    stats: ['14 going', '2 maybe', '1 out'],
    progress: 78,
  },
  {
    icon: NotificationsActiveIcon,
    title: 'Automated Communications',
    description: 'Send targeted updates and reminders without chasing responses across multiple channels.',
    tone: 'success' as const,
    demoLabel: 'Reminder queue demo',
    stats: ['Reminder queued', '48h before', 'Team notified'],
    progress: 92,
  },
  {
    icon: PhoneIphoneIcon,
    title: 'Mobile-First Experience',
    description: 'Manage the season from the rink, car, or sideline with touch-friendly workflows on any device.',
    tone: 'warning' as const,
    demoLabel: 'Mobile dashboard demo',
    stats: ['Tonight 6:30 PM', 'Game vs Hawks', 'Tap to RSVP'],
    progress: 88,
  },
];

export default function FeaturesPreview() {
  return (
    <Box
      component="section"
      aria-labelledby="feature-showcase-heading"
      sx={{
        py: { xs: 10, md: 14 },
        bgcolor: 'background.default',
        position: 'relative',
        backgroundImage: `
          linear-gradient(rgba(13, 71, 161, 0.02) 1px, transparent 1px),
          linear-gradient(90deg, rgba(13, 71, 161, 0.02) 1px, transparent 1px)
        `,
        backgroundSize: '40px 40px',
      }}
    >
      <Container maxWidth="lg">
        <Box sx={{ textAlign: 'center', mb: 10 }}>
          <Typography
            id="feature-showcase-heading"
            variant="sectionTitle"
            component="h2"
            sx={{ mb: 3, color: 'text.primary' }}
          >
            See the Season Run from{' '}
            <Box
              component="span"
              sx={{
                color: 'primary.main',
                position: 'relative',
                '&::after': {
                  content: '""',
                  position: 'absolute',
                  bottom: -4,
                  left: 0,
                  right: 0,
                  height: '4px',
                  background: 'linear-gradient(90deg, #1976D2 0%, #42A5F5 100%)',
                  borderRadius: 2,
                },
              }}
            >
              One Playbook
            </Box>
          </Typography>
          <Typography
            variant="marketingBody"
            sx={{ color: 'text.secondary', maxWidth: 760, mx: 'auto' }}
          >
            Visual snapshots show how OpenLeague replaces spreadsheets and group chats with clear,
            actionable views for rosters, schedules, RSVPs, and updates.
          </Typography>
        </Box>

        <Grid container spacing={4}>
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <Grid size={{ xs: 12, md: 6 }} key={feature.title}>
                <Card
                  variant="marketing"
                  tabIndex={0}
                  aria-label={`${feature.title} feature demo`}
                  sx={(theme) => {
                    const accent = theme.palette[feature.tone].main;
                    return {
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      outline: 'none',
                      '@keyframes slideUp': {
                        from: { opacity: 0, transform: 'translateY(40px)' },
                        to: { opacity: 1, transform: 'translateY(0)' },
                      },
                      animation: `slideUp 0.6s cubic-bezier(0.4, 0, 0.2, 1) ${index * 0.1}s both`,
                      transition: 'transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease',
                      border: `1px solid ${alpha(accent, 0.14)}`,
                      '&:hover, &:focus-visible': {
                        transform: 'translateY(-6px)',
                        boxShadow: `0 18px 40px ${alpha(accent, 0.18)}`,
                        borderColor: alpha(accent, 0.34),
                      },
                      '@media (prefers-reduced-motion: reduce)': {
                        animation: 'none',
                        transition: 'none',
                        '&:hover, &:focus-visible': { transform: 'none' },
                      },
                    };
                  }}
                >
                  <CardContent sx={{ p: { xs: 3, md: 4 }, flexGrow: 1 }}>
                    <Stack spacing={3} sx={{ height: '100%' }}>
                      <Stack direction="row" spacing={2} alignItems="center">
                        <Box
                          sx={(theme) => {
                            const accent = theme.palette[feature.tone].main;
                            return {
                              width: 64,
                              height: 64,
                              borderRadius: '50%',
                              background: `linear-gradient(135deg, ${accent} 0%, ${alpha(accent, 0.72)} 100%)`,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'common.white',
                              flexShrink: 0,
                            };
                          }}
                        >
                          <Icon sx={{ fontSize: 34 }} />
                        </Box>
                        <Box>
                          <Typography variant="featureTitle" component="h3" sx={{ color: 'text.primary' }}>
                            {feature.title}
                          </Typography>
                          <Chip label={feature.demoLabel} size="small" color={feature.tone} sx={{ mt: 1 }} />
                        </Box>
                      </Stack>

                      <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.7 }}>
                        {feature.description}
                      </Typography>

                      <Box
                        sx={(theme) => {
                          const accent = theme.palette[feature.tone].main;
                          return {
                            mt: 'auto',
                            p: 2.5,
                            borderRadius: 3,
                            bgcolor: alpha(accent, 0.07),
                            border: `1px solid ${alpha(accent, 0.18)}`,
                          };
                        }}
                      >
                        <Stack spacing={1.5}>
                          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                            {feature.stats.map((stat) => (
                              <Chip
                                key={stat}
                                label={stat}
                                size="small"
                                sx={(theme) => ({
                                  bgcolor: alpha(theme.palette.background.paper, 0.9),
                                  fontWeight: 700,
                                })}
                              />
                            ))}
                          </Stack>
                          <LinearProgress
                            variant="determinate"
                            value={feature.progress}
                            aria-label={`${feature.demoLabel} progress`}
                            sx={(theme) => ({
                              height: 10,
                              borderRadius: 999,
                              bgcolor: alpha(theme.palette[feature.tone].main, 0.16),
                              '& .MuiLinearProgress-bar': {
                                borderRadius: 999,
                                bgcolor: theme.palette[feature.tone].main,
                              },
                            })}
                          />
                        </Stack>
                      </Box>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      </Container>
    </Box>
  );
}

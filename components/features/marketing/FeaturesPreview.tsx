'use client';

import { Box, Container, Typography, Grid, Card, CardContent, keyframes } from '@mui/material';
import GroupsIcon from '@mui/icons-material/Groups';
import EventIcon from '@mui/icons-material/Event';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import PhoneIphoneIcon from '@mui/icons-material/PhoneIphone';

const features = [
  {
    icon: GroupsIcon,
    title: 'Team Roster Management',
    description: 'Keep track of players, contact info, and emergency details all in one secure place.',
    color: '#0D47A1',
  },
  {
    icon: EventIcon,
    title: 'Event Scheduling & RSVPs',
    description: 'Schedule games and practices with instant RSVP tracking. Know who&apos;s coming at a glance.',
    color: '#1976D2',
  },
  {
    icon: NotificationsActiveIcon,
    title: 'Automated Communications',
    description: 'Send event updates and reminders automatically. No more chasing down responses.',
    color: '#42A5F5',
  },
  {
    icon: PhoneIphoneIcon,
    title: 'Mobile-First Experience',
    description: 'Designed for on-the-go team management. Works perfectly on any device.',
    color: '#1565C0',
  },
];

// Pulse animation for icon containers
const pulse = keyframes`
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(25, 118, 210, 0.4);
  }
  50% {
    box-shadow: 0 0 0 12px rgba(25, 118, 210, 0);
  }
`;

export default function FeaturesPreview() {
  return (
    <Box
      sx={{
        py: { xs: 10, md: 14 },
        bgcolor: 'background.default',
        position: 'relative',
        // Subtle playbook grid pattern
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
            variant="sectionTitle"
            component="h2"
            sx={{
              mb: 3,
              color: 'text.primary',
            }}
          >
            Everything in{' '}
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
            sx={{
              color: 'text.secondary',
              maxWidth: 700,
              mx: 'auto',
            }}
          >
            Simple, powerful tools that eliminate the chaos of spreadsheets and group chats.
            Everything your team needs to stay organized and focused on the game.
          </Typography>
        </Box>

        <Grid container spacing={4}>
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <Grid size={{ xs: 12, sm: 6, md: 3 }} key={feature.title}>
                <Card
                  variant="marketing"
                  sx={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    // Staggered entrance animation
                    '@keyframes slideUp': {
                      from: {
                        opacity: 0,
                        transform: 'translateY(40px)',
                      },
                      to: {
                        opacity: 1,
                        transform: 'translateY(0)',
                      },
                    },
                    animation: `slideUp 0.6s cubic-bezier(0.4, 0, 0.2, 1) ${index * 0.1}s both`,
                  }}
                >
                  <CardContent sx={{ flexGrow: 1, textAlign: 'center', p: 4 }}>
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'center',
                        mb: 3,
                      }}
                    >
                      <Box
                        sx={{
                          width: 80,
                          height: 80,
                          borderRadius: '50%',
                          background: `linear-gradient(135deg, ${feature.color} 0%, ${feature.color}dd 100%)`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          position: 'relative',
                          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                          '&:hover': {
                            transform: 'scale(1.1) rotate(5deg)',
                            animation: `${pulse} 1.5s infinite`,
                          },
                        }}
                      >
                        <Icon sx={{ fontSize: 40, color: 'white' }} />
                      </Box>
                    </Box>
                    <Typography
                      variant="featureTitle"
                      component="h3"
                      gutterBottom
                      sx={{
                        fontWeight: 700,
                        color: 'text.primary',
                        mb: 2,
                      }}
                    >
                      {feature.title}
                    </Typography>
                    <Typography
                      variant="body1"
                      color="text.secondary"
                      sx={{ lineHeight: 1.7 }}
                    >
                      {feature.description}
                    </Typography>
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

'use client';

import { Box, Container, Typography, Grid } from '@mui/material';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import GroupAddIcon from '@mui/icons-material/GroupAdd';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';

const steps = [
  {
    icon: PersonAddIcon,
    step: '1',
    title: 'Create Your Account',
    description: 'Sign up for free in seconds. No credit card required.',
  },
  {
    icon: GroupAddIcon,
    step: '2',
    title: 'Set Up Your Team',
    description: 'Add your team details and invite players via email.',
  },
  {
    icon: RocketLaunchIcon,
    step: '3',
    title: 'Start Managing',
    description: 'Schedule events, track RSVPs, and stay organized all season long.',
  },
];

export default function HowItWorks() {
  return (
    <Box
      sx={{
        py: { xs: 8, md: 12 },
        background: 'linear-gradient(180deg, #F8FAFC 0%, #FFFFFF 100%)',
      }}
    >
      <Container maxWidth="lg">
        <Box sx={{ textAlign: 'center', mb: 8 }}>
          <Typography
            variant="h2"
            component="h2"
            sx={{
              fontSize: { xs: '2rem', md: '2.5rem' },
              fontWeight: 700,
              mb: 2,
              color: 'text.primary',
            }}
          >
            Get Started in Minutes
          </Typography>
          <Typography
            variant="h6"
            sx={{
              color: 'text.secondary',
              maxWidth: 700,
              mx: 'auto',
            }}
          >
            From signup to scheduling your first event—it&apos;s that simple
          </Typography>
        </Box>

        <Grid container spacing={4} alignItems="stretch">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <Grid size={{ xs: 12, md: 4 }} key={step.step}>
                <Box
                  sx={{
                    textAlign: 'center',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'relative',
                  }}
                >
                  {/* Step number badge */}
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'center',
                      mb: 3,
                      position: 'relative',
                    }}
                  >
                    <Box
                      sx={{
                        width: 80,
                        height: 80,
                        borderRadius: '50%',
                        bgcolor: 'primary.main',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: 3,
                      }}
                    >
                      <Icon sx={{ fontSize: 40, color: 'white' }} />
                    </Box>
                    <Box
                      sx={{
                        position: 'absolute',
                        top: -8,
                        right: 'calc(50% - 50px)',
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        bgcolor: 'secondary.main',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontWeight: 700,
                        fontSize: '1.1rem',
                        boxShadow: 2,
                      }}
                    >
                      {step.step}
                    </Box>
                  </Box>

                  {/* Connecting line (hide on mobile and last item) */}
                  {index < steps.length - 1 && (
                    <Box
                      sx={{
                        display: { xs: 'none', md: 'block' },
                        position: 'absolute',
                        top: 40,
                        left: 'calc(50% + 40px)',
                        width: 'calc(100% - 80px)',
                        height: 2,
                        bgcolor: 'divider',
                        zIndex: 0,
                      }}
                    />
                  )}

                  <Typography
                    variant="h5"
                    component="h3"
                    gutterBottom
                    sx={{ fontWeight: 600, mb: 2 }}
                  >
                    {step.title}
                  </Typography>
                  <Typography variant="body1" color="text.secondary">
                    {step.description}
                  </Typography>
                </Box>
              </Grid>
            );
          })}
        </Grid>
      </Container>
    </Box>
  );
}

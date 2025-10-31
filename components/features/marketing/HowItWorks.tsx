'use client';

import { Box, Container, Typography, Grid, keyframes } from '@mui/material';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import GroupAddIcon from '@mui/icons-material/GroupAdd';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';

const steps = [
  {
    icon: PersonAddIcon,
    step: '1',
    title: 'Create Your Account',
    description: 'Sign up for free in seconds. No credit card required.',
    color: '#0D47A1',
  },
  {
    icon: GroupAddIcon,
    step: '2',
    title: 'Set Up Your Team',
    description: 'Add your team details and invite players via email.',
    color: '#1976D2',
  },
  {
    icon: RocketLaunchIcon,
    step: '3',
    title: 'Start Managing',
    description: 'Schedule events, track RSVPs, and stay organized all season long.',
    color: '#42A5F5',
  },
];

// Arrow animation for connecting lines
const dashFlow = keyframes`
  to {
    stroke-dashoffset: 0;
  }
`;

export default function HowItWorks() {
  return (
    <Box
      sx={{
        py: { xs: 10, md: 14 },
        background: `
          linear-gradient(180deg, #FFFFFF 0%, #F8FAFB 50%, #FFFFFF 100%)
        `,
        position: 'relative',
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
            Get Started in{' '}
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
              3 Simple Steps
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
            From signup to scheduling your first event—it&apos;s that simple. No complicated setup,
            no training required.
          </Typography>
        </Box>

        <Grid container spacing={6} alignItems="stretch">
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
                    // Staggered animation
                    '@keyframes fadeInScale': {
                      from: {
                        opacity: 0,
                        transform: 'scale(0.9)',
                      },
                      to: {
                        opacity: 1,
                        transform: 'scale(1)',
                      },
                    },
                    animation: `fadeInScale 0.6s cubic-bezier(0.4, 0, 0.2, 1) ${index * 0.15}s both`,
                  }}
                >
                  {/* Step number badge with icon */}
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'center',
                      mb: 4,
                      position: 'relative',
                    }}
                  >
                    <Box
                      sx={{
                        width: 100,
                        height: 100,
                        borderRadius: '50%',
                        background: `linear-gradient(135deg, ${step.color} 0%, ${step.color}dd 100%)`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: `0 8px 24px ${step.color}40`,
                        position: 'relative',
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        '&:hover': {
                          transform: 'scale(1.1) rotate(5deg)',
                          boxShadow: `0 12px 32px ${step.color}50`,
                        },
                        // Orbital ring
                        '&::before': {
                          content: '""',
                          position: 'absolute',
                          inset: -8,
                          borderRadius: '50%',
                          border: `2px solid ${step.color}30`,
                          animation: 'spin 10s linear infinite',
                        },
                        '@keyframes spin': {
                          from: { transform: 'rotate(0deg)' },
                          to: { transform: 'rotate(360deg)' },
                        },
                      }}
                    >
                      <Icon sx={{ fontSize: 48, color: 'white' }} />
                    </Box>
                    {/* Step number badge */}
                    <Box
                      sx={{
                        position: 'absolute',
                        top: -4,
                        right: 'calc(50% - 60px)',
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        bgcolor: 'success.main',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontWeight: 800,
                        fontSize: '1.25rem',
                        boxShadow: '0 4px 12px rgba(46, 125, 50, 0.3)',
                        border: '3px solid white',
                      }}
                    >
                      {step.step}
                    </Box>
                  </Box>

                  {/* Connecting arrow (hide on mobile and last item) */}
                  {index < steps.length - 1 && (
                    <Box
                      sx={{
                        display: { xs: 'none', md: 'block' },
                        position: 'absolute',
                        top: 50,
                        left: 'calc(50% + 50px)',
                        width: 'calc(100% - 100px)',
                        height: 3,
                        zIndex: 0,
                      }}
                    >
                      <svg
                        width="100%"
                        height="3"
                        style={{ overflow: 'visible' }}
                      >
                        <defs>
                          <marker
                            id={`arrow-${index}`}
                            markerWidth="10"
                            markerHeight="10"
                            refX="5"
                            refY="5"
                            orient="auto"
                          >
                            <path
                              d="M0,0 L10,5 L0,10 L3,5 Z"
                              fill="#1976D2"
                            />
                          </marker>
                        </defs>
                        <line
                          x1="0"
                          y1="1.5"
                          x2="100%"
                          y2="1.5"
                          stroke="#1976D2"
                          strokeWidth="2"
                          strokeDasharray="8 4"
                          strokeDashoffset="100"
                          markerEnd={`url(#arrow-${index})`}
                          style={{
                            animation: `${dashFlow} 2s ease-in-out ${index * 0.3}s forwards`,
                          }}
                        />
                      </svg>
                    </Box>
                  )}

                  <Typography
                    variant="featureTitle"
                    component="h3"
                    gutterBottom
                    sx={{
                      fontWeight: 700,
                      mb: 2,
                      color: 'text.primary',
                    }}
                  >
                    {step.title}
                  </Typography>
                  <Typography
                    variant="body1"
                    color="text.secondary"
                    sx={{ lineHeight: 1.7 }}
                  >
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

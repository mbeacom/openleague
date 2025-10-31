'use client';

import { Box, Container, Typography, Stack } from '@mui/material';
import { keyframes } from '@mui/system';
import CTAButton from './CTAButton';
import BrandLogo from '@/components/ui/BrandLogo';
import { marketingEvents } from '@/lib/analytics/tracking';
import { useEffect } from 'react';

// Staggered reveal animations for orchestrated page load
const fadeInUp = keyframes`
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const scaleIn = keyframes`
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
`;

const slideInLeft = keyframes`
  from {
    opacity: 0;
    transform: translateX(-30px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
`;

// Subtle background pattern animation
const patternShift = keyframes`
  0%, 100% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
`;

export default function HeroSection() {
  // Track hero section view for engagement analytics
  useEffect(() => {
    marketingEvents.heroSectionView();
  }, []);

  return (
    <Box
      sx={{
        background: `
          linear-gradient(135deg, rgba(13, 71, 161, 0.03) 0%, rgba(25, 118, 210, 0.05) 50%, rgba(248, 250, 251, 1) 100%),
          repeating-linear-gradient(45deg, transparent, transparent 35px, rgba(13, 71, 161, 0.02) 35px, rgba(13, 71, 161, 0.02) 70px)
        `,
        backgroundSize: '400% 400%, auto',
        animation: `${patternShift} 20s ease infinite`,
        '@media (prefers-reduced-motion: reduce)': {
          animation: 'none',
          backgroundPosition: '50% 50%',
        },
        py: { xs: 8, md: 12 },
        position: 'relative',
        overflow: 'hidden',
        minHeight: { xs: 'auto', md: '90vh' },
        display: 'flex',
        alignItems: 'center',
        // Subtle orbital accent elements (inspired by logo)
        '&::before': {
          content: '""',
          position: 'absolute',
          top: '-10%',
          right: '-5%',
          width: '500px',
          height: '500px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(25, 118, 210, 0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        },
        '&::after': {
          content: '""',
          position: 'absolute',
          bottom: '-15%',
          left: '-5%',
          width: '600px',
          height: '600px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(13, 71, 161, 0.06) 0%, transparent 70%)',
          pointerEvents: 'none',
        },
      }}
    >
      <Container maxWidth="lg">
        <Box
          sx={{
            position: 'relative',
            zIndex: 1,
            textAlign: 'center',
            px: { xs: 2, sm: 4 },
          }}
        >
          {/* Prominent Brand Logo with scale-in animation */}
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              mb: 5,
              animation: `${scaleIn} 0.6s cubic-bezier(0.4, 0, 0.2, 1) 0.1s both`,
              '@media (prefers-reduced-motion: reduce)': {
                animation: 'none',
              },
            }}
          >
            <BrandLogo
              variant="full"
              size="xlarge"
              priority
              interactive
              href={null}
            />
          </Box>

          {/* Hero Title with staggered reveal */}
          <Typography
            variant="heroTitle"
            component="h1"
            sx={{
              color: 'text.primary',
              mb: 4,
              animation: `${fadeInUp} 0.8s cubic-bezier(0.4, 0, 0.2, 1) 0.3s both`,
              '@media (prefers-reduced-motion: reduce)': {
                animation: 'none',
              },
            }}
          >
            Simplify Your Season.{' '}
            <Box
              component="span"
              sx={{
                color: 'primary.main',
                position: 'relative',
                display: 'inline-block',
                '&::after': {
                  content: '""',
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: '8px',
                  background: 'linear-gradient(90deg, #1976D2 0%, #42A5F5 100%)',
                  borderRadius: 4,
                  opacity: 0.3,
                },
              }}
            >
              Play More.
            </Box>
          </Typography>

          {/* Hero Subtitle */}
          <Typography
            variant="heroSubtitle"
            sx={{
              mb: 6,
              color: 'text.secondary',
              maxWidth: 800,
              mx: 'auto',
              animation: `${fadeInUp} 0.8s cubic-bezier(0.4, 0, 0.2, 1) 0.5s both`,
              '@media (prefers-reduced-motion: reduce)': {
                animation: 'none',
              },
            }}
          >
            The free, open-source team management platform built for coaches and players.
            Replace chaotic spreadsheets and group chats with one organized hub for rosters,
            schedules, attendance, and communication.
          </Typography>

          {/* Trust indicators with slide-in animation */}
          <Box
            sx={{
              mb: 6,
              animation: `${fadeInUp} 0.8s cubic-bezier(0.4, 0, 0.2, 1) 0.7s both`,
              '@media (prefers-reduced-motion: reduce)': {
                animation: 'none',
              },
            }}
          >
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={{ xs: 2, sm: 4 }}
              justifyContent="center"
              alignItems="center"
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  animation: `${slideInLeft} 0.6s cubic-bezier(0.4, 0, 0.2, 1) 0.9s both`,
                  '@media (prefers-reduced-motion: reduce)': {
                    animation: 'none',
                  },
                }}
              >
                <Box
                  sx={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    bgcolor: 'success.main',
                    boxShadow: '0 0 0 4px rgba(46, 125, 50, 0.1)',
                  }}
                />
                <Typography variant="body1" color="text.primary" fontWeight={600}>
                  100% Free Forever
                </Typography>
              </Box>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  animation: `${slideInLeft} 0.6s cubic-bezier(0.4, 0, 0.2, 1) 1s both`,
                  '@media (prefers-reduced-motion: reduce)': {
                    animation: 'none',
                  },
                }}
              >
                <Box
                  sx={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    bgcolor: 'success.main',
                    boxShadow: '0 0 0 4px rgba(46, 125, 50, 0.1)',
                  }}
                />
                <Typography variant="body1" color="text.primary" fontWeight={600}>
                  No Credit Card
                </Typography>
              </Box>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  animation: `${slideInLeft} 0.6s cubic-bezier(0.4, 0, 0.2, 1) 1.1s both`,
                  '@media (prefers-reduced-motion: reduce)': {
                    animation: 'none',
                  },
                }}
              >
                <Box
                  sx={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    bgcolor: 'success.main',
                    boxShadow: '0 0 0 4px rgba(46, 125, 50, 0.1)',
                  }}
                />
                <Typography variant="body1" color="text.primary" fontWeight={600}>
                  Mobile-First
                </Typography>
              </Box>
            </Stack>
          </Box>

          {/* CTA Buttons with staggered animation */}
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={3}
            justifyContent="center"
            sx={{
              mb: 6,
              animation: `${fadeInUp} 0.8s cubic-bezier(0.4, 0, 0.2, 1) 0.9s both`,
              '@media (prefers-reduced-motion: reduce)': {
                animation: 'none',
              },
            }}
          >
            <CTAButton
              href="/signup"
              variant="marketing"
              size="large"
              trackingAction="hero_get_started_click"
              trackingLabel="hero_section"
              sx={{
                minWidth: { xs: '100%', sm: 220 },
                py: 1.75,
                fontSize: '1.125rem',
              }}
            >
              Get Started Free
            </CTAButton>
            <CTAButton
              href="/features"
              variant="marketingSecondary"
              size="large"
              trackingAction="hero_see_features_click"
              trackingLabel="hero_section"
              sx={{
                minWidth: { xs: '100%', sm: 200 },
                py: 1.75,
                fontSize: '1.125rem',
              }}
            >
              Explore Features
            </CTAButton>
          </Stack>

          {/* Social proof / trust signal */}
          <Box
            sx={{
              animation: `${fadeInUp} 0.8s cubic-bezier(0.4, 0, 0.2, 1) 1.1s both`,
              '@media (prefers-reduced-motion: reduce)': {
                animation: 'none',
              },
            }}
          >
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                fontStyle: 'italic',
                maxWidth: 700,
                mx: 'auto',
                px: 2,
              }}
            >
              Built by coaches, for coaches. Open-source and community-driven—because team
              management should be simple, transparent, and free.
            </Typography>
          </Box>
        </Box>
      </Container>
    </Box>
  );
}

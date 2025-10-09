'use client';

import { Box, Container, Typography, Grid, Stack } from '@mui/material';
import Image from 'next/image';
import CTAButton from './CTAButton';
import { marketingEvents } from '@/lib/analytics/tracking';
import { useEffect } from 'react';

export default function HeroSection() {
  // Track hero section view for engagement analytics
  useEffect(() => {
    marketingEvents.heroSectionView();
  }, []);

  return (
    <Box
      sx={{
        background: 'linear-gradient(135deg, #F8FAFC 0%, #E3F2FD 100%)',
        py: { xs: 8, md: 12 },
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Background decoration */}
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: '50%',
          height: '100%',
          background: 'linear-gradient(135deg, rgba(25, 118, 210, 0.05) 0%, rgba(66, 165, 245, 0.02) 100%)',
          borderRadius: '0 0 0 100px',
          display: { xs: 'none', md: 'block' },
        }}
      />

      <Container maxWidth="lg">
        <Grid container spacing={4} alignItems="center">
          {/* Left side - Content */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Box sx={{ position: 'relative', zIndex: 1 }}>
              <Typography
                variant="heroTitle"
                component="h1"
                sx={{
                  color: 'text.primary',
                  mb: 3,
                  maxWidth: { xs: '100%', md: '90%' },
                }}
              >
                Replace Chaotic Spreadsheets with{' '}
                <Box
                  component="span"
                  sx={{
                    color: 'marketing.primary',
                    position: 'relative',
                    '&::after': {
                      content: '""',
                      position: 'absolute',
                      bottom: -4,
                      left: 0,
                      right: 0,
                      height: 4,
                      background: 'linear-gradient(90deg, #FF9800 0%, #FFB74D 100%)',
                      borderRadius: 2,
                    },
                  }}
                >
                  OpenLeague
                </Box>
              </Typography>

              <Typography
                variant="heroSubtitle"
                sx={{
                  mb: 4,
                  maxWidth: { xs: '100%', md: '85%' },
                  color: 'text.secondary',
                }}
              >
                The single source of truth for sports team management.
                Stop juggling group chats, email chains, and messy spreadsheets.
                Get organized with Who, What, When, and Where—all in one place.
              </Typography>

              {/* Trust indicators */}
              <Box sx={{ mb: 4 }}>
                <Stack direction="row" spacing={3} flexWrap="wrap" sx={{ mb: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        bgcolor: 'success.main',
                      }}
                    />
                    <Typography variant="body2" color="text.secondary">
                      100% Free to Use
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        bgcolor: 'success.main',
                      }}
                    />
                    <Typography variant="body2" color="text.secondary">
                      No Credit Card Required
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        bgcolor: 'success.main',
                      }}
                    />
                    <Typography variant="body2" color="text.secondary">
                      Mobile-First Design
                    </Typography>
                  </Box>
                </Stack>
              </Box>

              {/* CTA Buttons with conversion tracking */}
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={2}
                sx={{ mb: 4 }}
              >
                <CTAButton
                  href="/signup"
                  variant="marketing"
                  size="large"
                  trackingAction="hero_get_started_click"
                  trackingLabel="hero_section"
                  sx={{
                    minWidth: { xs: '100%', sm: 200 },
                    py: 1.5,
                  }}
                >
                  Get Started Free
                </CTAButton>
                <CTAButton
                  href="/features"
                  variant="marketingSecondary"
                  size="large"
                  trackingAction="hero_see_how_it_works_click"
                  trackingLabel="hero_section"
                  sx={{
                    minWidth: { xs: '100%', sm: 160 },
                    py: 1.5,
                  }}
                >
                  See How It Works
                </CTAButton>
              </Stack>

              {/* Additional trust signal */}
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ fontStyle: 'italic' }}
              >
                Join teams already using OpenLeague to stay organized and focused on what matters most—playing the game.
              </Typography>
            </Box>
          </Grid>

          {/* Right side - Hero Image */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Box
              sx={{
                position: 'relative',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                mt: { xs: 4, md: 0 },
              }}
            >
              {/* Hero dashboard mockup image */}
              <Box
                sx={{
                  position: 'relative',
                  width: '100%',
                  maxWidth: 600,
                  height: { xs: 300, md: 400 },
                  borderRadius: 3,
                  boxShadow: '0px 20px 40px rgba(0, 0, 0, 0.1)',
                  overflow: 'hidden',
                  border: '1px solid',
                  borderColor: 'divider',
                  bgcolor: 'background.paper',
                }}
              >
                <Image
                  src="/images/hero-dashboard-mockup.svg"
                  alt="OpenLeague Dashboard - Clean and organized team management interface"
                  fill
                  style={{ objectFit: 'contain' }}
                  priority
                />
              </Box>

              {/* Decorative elements */}
              <Box
                sx={{
                  position: 'absolute',
                  top: -20,
                  right: -20,
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  bgcolor: 'marketing.secondary',
                  opacity: 0.1,
                  zIndex: 0,
                }}
              />
              <Box
                sx={{
                  position: 'absolute',
                  bottom: -15,
                  left: -15,
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  bgcolor: 'marketing.primary',
                  opacity: 0.1,
                  zIndex: 0,
                }}
              />
            </Box>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}
'use client';

import { Box, Container, Typography, Stack } from '@mui/material';
import CTAButton from './CTAButton';
import BrandLogo from '@/components/ui/BrandLogo';
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
        py: { xs: 6, md: 10 },
        position: 'relative',
        overflow: 'hidden',
        minHeight: { xs: 'auto', md: '85vh' },
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <Container maxWidth="md">
        <Box
          sx={{
            position: 'relative',
            zIndex: 1,
            textAlign: 'center',
            px: { xs: 2, sm: 4 },
          }}
        >
          {/* Prominent Brand Logo */}
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              mb: 4,
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

          <Typography
            variant="heroTitle"
            component="h1"
            sx={{
              color: 'text.primary',
              mb: 3,
            }}
          >
            Replace Chaotic Spreadsheets with{' '}
            <Box
              component="span"
              sx={{
                color: 'marketing.primary',
                position: 'relative',
                display: 'inline-block',
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
              One Platform
            </Box>
          </Typography>

          <Typography
            variant="heroSubtitle"
            sx={{
              mb: 5,
              color: 'text.secondary',
              maxWidth: 700,
              mx: 'auto',
            }}
          >
            The single source of truth for sports team management.
            Stop juggling group chats, email chains, and messy spreadsheets.
            Get organized with Who, What, When, and Where—all in one place.
          </Typography>

          {/* Trust indicators */}
          <Box sx={{ mb: 5 }}>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={{ xs: 2, sm: 4 }}
              justifyContent="center"
              alignItems="center"
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: 'success.main',
                  }}
                />
                <Typography variant="body2" color="text.secondary" fontWeight={500}>
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
                <Typography variant="body2" color="text.secondary" fontWeight={500}>
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
                <Typography variant="body2" color="text.secondary" fontWeight={500}>
                  Mobile-First Design
                </Typography>
              </Box>
            </Stack>
          </Box>

          {/* CTA Buttons with conversion tracking */}
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            justifyContent="center"
            sx={{ mb: 5 }}
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
            sx={{
              fontStyle: 'italic',
              maxWidth: 600,
              mx: 'auto',
            }}
          >
            Join teams already using OpenLeague to stay organized and focused on what matters most—playing the game.
          </Typography>
        </Box>
      </Container>
    </Box>
  );
}
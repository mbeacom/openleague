'use client';

import { Box, Container, Typography, Stack } from '@mui/material';
import { keyframes } from '@mui/system';
import CTAButton from './CTAButton';

// Floating animation for decorative elements
const float = keyframes`
  0%, 100% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-20px);
  }
`;

export default function FinalCTA() {
  return (
    <Box
      sx={{
        py: { xs: 10, md: 14 },
        background: 'linear-gradient(135deg, #0D47A1 0%, #1976D2 50%, #42A5F5 100%)',
        backgroundSize: '200% 200%',
        position: 'relative',
        overflow: 'hidden',
        // Animated gradient shift
        '@keyframes gradientShift': {
          '0%, 100%': {
            backgroundPosition: '0% 50%',
          },
          '50%': {
            backgroundPosition: '100% 50%',
          },
        },
        animation: 'gradientShift 8s ease infinite',
        '@media (prefers-reduced-motion: reduce)': {
          animation: 'none',
          backgroundPosition: '50% 50%',
        },
      }}
    >
      {/* Decorative orbital elements - inspired by logo */}
      <Box
        sx={{
          position: 'absolute',
          top: -80,
          right: -80,
          width: 300,
          height: 300,
          borderRadius: '50%',
          border: '2px solid rgba(255, 255, 255, 0.1)',
          animation: `${float} 6s ease-in-out infinite`,
          '@media (prefers-reduced-motion: reduce)': {
            animation: 'none',
          },
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          top: '20%',
          right: '15%',
          width: 150,
          height: 150,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255, 255, 255, 0.15) 0%, transparent 70%)',
          animation: `${float} 8s ease-in-out infinite`,
          animationDelay: '1s',
          '@media (prefers-reduced-motion: reduce)': {
            animation: 'none',
          },
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          bottom: -100,
          left: -100,
          width: 400,
          height: 400,
          borderRadius: '50%',
          border: '3px solid rgba(255, 255, 255, 0.08)',
          animation: `${float} 10s ease-in-out infinite`,
          animationDelay: '2s',
          '@media (prefers-reduced-motion: reduce)': {
            animation: 'none',
          },
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          bottom: '30%',
          left: '10%',
          width: 200,
          height: 200,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255, 255, 255, 0.1) 0%, transparent 70%)',
          animation: `${float} 7s ease-in-out infinite`,
          animationDelay: '0.5s',
          '@media (prefers-reduced-motion: reduce)': {
            animation: 'none',
          },
        }}
      />

      <Container maxWidth="md">
        <Box
          sx={{
            textAlign: 'center',
            position: 'relative',
            zIndex: 1,
          }}
        >
          <Typography
            variant="sectionTitle"
            component="h2"
            sx={{
              fontSize: { xs: '2.5rem', md: '3.5rem' },
              fontWeight: 900,
              mb: 4,
              color: 'white',
              textShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
              letterSpacing: '-0.02em',
            }}
          >
            Ready to Win Back Your Time?
          </Typography>
          <Typography
            variant="marketingBody"
            sx={{
              color: 'rgba(255, 255, 255, 0.95)',
              mb: 6,
              maxWidth: 650,
              mx: 'auto',
              fontSize: '1.25rem',
              textShadow: '0 1px 4px rgba(0, 0, 0, 0.15)',
            }}
          >
            Join coaches and team managers who&apos;ve ditched the spreadsheets and endless
            group chats. Get organized in minutes, stay organized all season.
          </Typography>

          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={3}
            justifyContent="center"
            sx={{ mb: 6 }}
          >
            <CTAButton
              href="/signup"
              variant="contained"
              size="large"
              trackingAction="final_cta_get_started_click"
              trackingLabel="final_cta_section"
              sx={{
                bgcolor: 'white',
                color: 'primary.main',
                minWidth: { xs: '100%', sm: 240 },
                py: 2,
                fontSize: '1.125rem',
                fontWeight: 700,
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)',
                '&:hover': {
                  bgcolor: 'rgba(255, 255, 255, 0.95)',
                  transform: 'translateY(-4px)',
                  boxShadow: '0 12px 32px rgba(0, 0, 0, 0.25)',
                },
              }}
            >
              Start Free Today
            </CTAButton>
            <CTAButton
              href="/features"
              variant="outlined"
              size="large"
              trackingAction="final_cta_learn_more_click"
              trackingLabel="final_cta_section"
              sx={{
                borderColor: 'white',
                borderWidth: 2,
                color: 'white',
                minWidth: { xs: '100%', sm: 200 },
                py: 2,
                fontSize: '1.125rem',
                fontWeight: 700,
                '&:hover': {
                  borderColor: 'white',
                  borderWidth: 2,
                  bgcolor: 'rgba(255, 255, 255, 0.15)',
                  transform: 'translateY(-4px)',
                },
              }}
            >
              See Features
            </CTAButton>
          </Stack>

          {/* Trust indicators */}
          <Box sx={{ mt: 5 }}>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={{ xs: 2, sm: 5 }}
              justifyContent="center"
              alignItems="center"
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                }}
              >
                <Box
                  sx={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    bgcolor: 'rgba(255, 255, 255, 0.95)',
                    boxShadow: '0 0 0 4px rgba(255, 255, 255, 0.2)',
                  }}
                />
                <Typography
                  variant="body1"
                  sx={{
                    color: 'rgba(255, 255, 255, 0.95)',
                    fontWeight: 600,
                  }}
                >
                  No Credit Card
                </Typography>
              </Box>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                }}
              >
                <Box
                  sx={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    bgcolor: 'rgba(255, 255, 255, 0.95)',
                    boxShadow: '0 0 0 4px rgba(255, 255, 255, 0.2)',
                  }}
                />
                <Typography
                  variant="body1"
                  sx={{
                    color: 'rgba(255, 255, 255, 0.95)',
                    fontWeight: 600,
                  }}
                >
                  Free Forever
                </Typography>
              </Box>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                }}
              >
                <Box
                  sx={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    bgcolor: 'rgba(255, 255, 255, 0.95)',
                    boxShadow: '0 0 0 4px rgba(255, 255, 255, 0.2)',
                  }}
                />
                <Typography
                  variant="body1"
                  sx={{
                    color: 'rgba(255, 255, 255, 0.95)',
                    fontWeight: 600,
                  }}
                >
                  Ready in 3 Minutes
                </Typography>
              </Box>
            </Stack>
          </Box>
        </Box>
      </Container>
    </Box>
  );
}

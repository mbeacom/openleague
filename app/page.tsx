"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Box, Typography, Container, Button, CircularProgress, AppBar, Toolbar } from "@mui/material";
import Link from "next/link";
import Image from "next/image";

/**
 * Marketing Landing Page
 * - Shows marketing landing page for unauthenticated users
 * - Redirects authenticated users to dashboard
 * - Client Component to prevent hydration mismatches
 */
export default function HomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Redirect authenticated users to dashboard
  useEffect(() => {
    if (session?.user) {
      router.push('/dashboard');
    }
  }, [session, router]);

  // Show loading state while checking session
  if (status === "loading") {
    return (
      <Container maxWidth="md">
        <Box
          sx={{
            marginTop: 12,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  // Don't render anything if user is authenticated (will redirect)
  if (session?.user) {
    return null;
  }

  // Unauthenticated user - show marketing landing page
  return (
    <>
      {/* Header with prominent logo */}
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          bgcolor: 'background.paper',
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Container maxWidth="lg">
          <Toolbar disableGutters sx={{ justifyContent: 'space-between', py: 1.5 }}>
            <Box
              component={Link}
              href="/"
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                textDecoration: 'none',
                color: 'inherit',
                transition: 'transform 0.2s ease-in-out',
                '&:hover': {
                  transform: 'scale(1.02)',
                },
              }}
            >
              <Image
                src="/images/logo.webp"
                alt="OpenLeague Logo"
                width={48}
                height={48}
                priority
              />
              <Typography
                variant="h5"
                component="div"
                sx={{
                  fontWeight: 700,
                  color: 'primary.main',
                  letterSpacing: '-0.02em',
                }}
              >
                OpenLeague
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button component={Link} href="/login" color="inherit" sx={{ color: 'text.primary' }}>
                Sign In
              </Button>
              <Button component={Link} href="/signup" variant="contained">
                Start Free Trial
              </Button>
            </Box>
          </Toolbar>
        </Container>
      </AppBar>

      <Container maxWidth="lg">
        <Box
          sx={{
            marginTop: 8,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
          }}
        >
          {/* Hero Section */}
        <Typography component="h1" variant="h2" gutterBottom>
          Replace Chaotic Spreadsheets with OpenLeague
        </Typography>
        <Typography variant="h5" color="text.secondary" sx={{ mb: 4, maxWidth: 800 }}>
          Affordable sports team management that brings order to your team&apos;s chaos.
          One source of truth for Who, What, When, and Where.
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 6, maxWidth: 600 }}>
          Stop juggling spreadsheets, group chats, and email chains. OpenLeague centralizes
          your roster, schedule, and communication in one simple, mobile-friendly platform.
        </Typography>

        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 8 }}>
          <Button
            component={Link}
            href="/signup"
            variant="contained"
            size="large"
            sx={{ minWidth: 160, py: 1.5 }}
          >
            Start Free Trial
          </Button>
          <Button
            component={Link}
            href="/features"
            variant="outlined"
            size="large"
            sx={{ minWidth: 160, py: 1.5 }}
          >
            See Features
          </Button>
        </Box>

        {/* Value Proposition */}
        <Box sx={{ maxWidth: 800, textAlign: 'left' }}>
          <Typography variant="h4" component="h2" gutterBottom sx={{ textAlign: 'center', mb: 4 }}>
            Why Teams Choose OpenLeague
          </Typography>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 4 }}>
            <Box>
              <Typography variant="h6" component="h3" gutterBottom>
                📋 Centralized Roster Management
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Send email invitations, manage player information, and keep everyone&apos;s contact details in one place.
              </Typography>
            </Box>

            <Box>
              <Typography variant="h6" component="h3" gutterBottom>
                📅 Smart Scheduling
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Create games and practices with RSVP tracking. Know who&apos;s coming before you show up.
              </Typography>
            </Box>

            <Box>
              <Typography variant="h6" component="h3" gutterBottom>
                📱 Mobile-First Design
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Works perfectly on phones, tablets, and desktops. Your team can access everything on the go.
              </Typography>
            </Box>

            <Box>
              <Typography variant="h6" component="h3" gutterBottom>
                💰 Affordable Pricing
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Transparent pricing starting at $5/month. 14-day free trial, no credit card required.
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* CTA Section */}
        <Box sx={{ mt: 8, textAlign: 'center' }}>
          <Typography variant="h5" component="h2" gutterBottom>
            Ready to organize your team?
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            Join teams already using OpenLeague to stay organized.
          </Typography>
          <Button
            component={Link}
            href="/signup"
            variant="contained"
            size="large"
            sx={{ minWidth: 200, py: 1.5 }}
          >
            Start Your Team
          </Button>
        </Box>
      </Box>
    </Container>
    </>
  );
}

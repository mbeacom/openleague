"use client";

import { useSession } from "next-auth/react";
import { Box, Typography, Container, Button, CircularProgress } from "@mui/material";
import Link from "next/link";
import { logout } from "@/lib/actions/logout";

/**
 * Home/Dashboard page
 * - Shows landing page for unauthenticated users
 * - Shows dashboard for authenticated users
 * - Client Component to prevent hydration mismatches
 */
export default function HomePage() {
  const { data: session, status } = useSession();

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

  // Authenticated user - show dashboard
  if (session?.user) {
    return (
      <Container maxWidth="lg">
        <Box
          sx={{
            marginTop: 8,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <Typography component="h1" variant="h4" gutterBottom>
            Welcome to OpenLeague
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            Hello, {session.user.name || session.user.email}!
          </Typography>
          <Typography variant="body2" sx={{ mb: 4 }}>
            Your team management dashboard will be available soon.
          </Typography>

          <form action={logout}>
            <Button type="submit" variant="outlined" color="primary">
              Log Out
            </Button>
          </form>
        </Box>
      </Container>
    );
  }

  // Unauthenticated user - show landing page
  return (
    <Container maxWidth="md">
      <Box
        sx={{
          marginTop: 12,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
        }}
      >
        <Typography component="h1" variant="h2" gutterBottom>
          OpenLeague
        </Typography>
        <Typography variant="h5" color="text.secondary" sx={{ mb: 4 }}>
          Free sports team management platform
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 6 }}>
          Simplify rostering, scheduling, and communication for your team.
          Replace chaotic spreadsheets and group chats with a single source of
          truth.
        </Typography>

        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          <Button
            component={Link}
            href="/signup"
            variant="contained"
            size="large"
            sx={{ minWidth: 140 }}
          >
            Get Started
          </Button>
          <Button
            component={Link}
            href="/login"
            variant="outlined"
            size="large"
            sx={{ minWidth: 140 }}
          >
            Log In
          </Button>
        </Box>
      </Box>
    </Container>
  );
}

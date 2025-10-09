"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Box, Container, CircularProgress } from "@mui/material";
import HeroSection from "@/components/features/marketing/HeroSection";
import { useScrollTracking } from "@/lib/hooks/useScrollTracking";

/**
 * Root Landing Page
 * - Shows marketing landing page for unauthenticated users
 * - Redirects authenticated users to dashboard
 * - Client Component to prevent hydration mismatches
 */
export default function HomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  // Track scroll engagement for analytics
  useScrollTracking();

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

  // Unauthenticated user - show marketing landing page with header/footer
  return (
    <Box>
      <HeroSection />
      {/* Additional marketing sections will be added in future tasks */}
    </Box>
  );
}

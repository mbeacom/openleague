import { ReactNode } from "react";
import { requireAuth, requireUserId } from "@/lib/auth/session";
import { Box, AppBar, Toolbar, Typography } from "@mui/material";
import Link from "next/link";
import DashboardNav from "@/components/features/dashboard/DashboardNav";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import { getUserMode } from "@/lib/utils/league-mode";
import Logo from "@/components/ui/Logo";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Require authentication for all dashboard routes
  await requireAuth();

  // Get user mode for adaptive navigation
  const userId = await requireUserId();
  const userMode = await getUserMode(userId);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      {/* Top App Bar */}
      <AppBar
        position="sticky"
        sx={{
          display: { xs: "flex", md: "none" },
        }}
      >
        <Toolbar>
          <Box
            component={Link}
            href="/dashboard"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              textDecoration: 'none',
              color: 'inherit',
              flexGrow: 1,
            }}
          >
            <Logo size="medium" href={null} priority />
            <Typography variant="h6" component="div">
              OpenLeague
            </Typography>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Desktop Sidebar + Content */}
      <Box sx={{ display: "flex", flex: 1 }}>
        {/* Desktop Sidebar Navigation */}
        <Box
          component="nav"
          sx={{
            display: { xs: "none", md: "block" },
            width: 240,
            flexShrink: 0,
            borderRight: 1,
            borderColor: "divider",
            bgcolor: "background.paper",
          }}
        >
          <Box
            component={Link}
            href="/dashboard"
            sx={{
              p: 2,
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
            <Logo size="large" href={null} priority />
            <Typography variant="h5" component="div" color="primary" sx={{ fontWeight: 600 }}>
              OpenLeague
            </Typography>
          </Box>
          <DashboardNav isLeagueMode={userMode.isLeagueMode} />
        </Box>

        {/* Main Content */}
        <Box
          component="main"
          sx={{
            flex: 1,
            pb: { xs: 8, md: 0 },
            bgcolor: "background.default",
          }}
        >
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </Box>
      </Box>

      {/* Mobile Bottom Navigation */}
      <DashboardNav mobile isLeagueMode={userMode.isLeagueMode} />
    </Box>
  );
}

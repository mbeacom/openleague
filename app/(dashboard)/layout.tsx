import { ReactNode } from "react";
import { requireAuth, requireUserId } from "@/lib/auth/session";
import { Box, AppBar, Toolbar, Typography } from "@mui/material";
import Link from "next/link";
import DashboardNav from "@/components/features/dashboard/DashboardNav";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import { getUserMode } from "@/lib/utils/league-mode";
import Logo from "@/components/ui/Logo";
import { LeagueProvider } from "@/components/providers/LeagueProvider";
import BreadcrumbNav from "@/components/features/navigation/BreadcrumbNav";
import LeagueContextSwitcher from "@/components/features/navigation/LeagueContextSwitcher";
import MobileNavigation from "@/components/features/navigation/MobileNavigation";
import KeyboardShortcutsHelp from "@/components/features/navigation/KeyboardShortcutsHelp";
import { KeyboardShortcutsProvider } from "@/components/features/navigation/KeyboardShortcutsProvider";

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
    <LeagueProvider initialData={userMode}>
      <KeyboardShortcutsProvider>
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
              {/* Mobile League Switcher */}
              <LeagueContextSwitcher variant="compact" />
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

              {/* Desktop League Switcher */}
              <Box sx={{ px: 2, pb: 2 }}>
                <LeagueContextSwitcher />
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
              {/* Breadcrumb Navigation */}
              <Box sx={{ px: 3, pt: 2 }}>
                <BreadcrumbNav />
              </Box>

              <ErrorBoundary>
                {children}
              </ErrorBoundary>
            </Box>
          </Box>

          {/* Mobile Bottom Navigation */}
          <MobileNavigation isLeagueMode={userMode.isLeagueMode} />

          {/* Keyboard Shortcuts Help Button */}
          <KeyboardShortcutsHelp />
        </Box>
      </KeyboardShortcutsProvider>
    </LeagueProvider>
  );
}

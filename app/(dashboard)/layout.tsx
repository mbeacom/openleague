import { ReactNode } from "react";
import { requireAuth, requireUserId } from "@/lib/auth/session";
import { Box, AppBar, Toolbar } from "@mui/material";
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
          {/* Top App Bar - Digital Playbook styling */}
          <AppBar
            position="sticky"
            sx={(theme) => ({
              display: { xs: "flex", md: "none" },
              background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.light} 100%)`,
              boxShadow: `0 4px 12px rgba(13, 71, 161, 0.15)`,
            })}
          >
            <Toolbar>
              <Logo
                size="medium"
                href="/dashboard"
                showText
                priority
                sx={{ flexGrow: 1 }}
              />
              {/* Mobile League Switcher */}
              <LeagueContextSwitcher variant="compact" />
            </Toolbar>
          </AppBar>

          {/* Desktop Sidebar + Content */}
          <Box sx={{ display: "flex", flex: 1 }}>
            {/* Desktop Sidebar Navigation - Digital Playbook styling */}
            <Box
              component="nav"
              sx={(theme) => ({
                display: { xs: "none", md: "block" },
                width: 260,
                flexShrink: 0,
                borderRight: '2px solid',
                borderColor: `rgba(${theme.palette.mode === 'light' ? '13, 71, 161' : '255, 255, 255'}, 0.08)`,
                bgcolor: "background.paper",
                boxShadow: `4px 0 12px rgba(13, 71, 161, 0.03)`,
              })}
            >
              <Logo
                size="large"
                href="/dashboard"
                showText
                priority
                sx={{
                  p: 2,
                  transition: 'transform 0.2s ease-in-out',
                  '&:hover': {
                    transform: 'scale(1.02)',
                  },
                }}
              />

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

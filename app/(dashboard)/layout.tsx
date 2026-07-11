import { ReactNode } from "react";
import { requireAuth, requireUserId } from "@/lib/auth/session";
import { Box } from "@mui/material";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import { getUserMode } from "@/lib/utils/league-mode";
import { LeagueProvider } from "@/components/providers/LeagueProvider";
import BreadcrumbNav from "@/components/features/navigation/BreadcrumbNav";
import { KeyboardShortcutsProvider } from "@/components/features/navigation/KeyboardShortcutsProvider";
import DashboardShell from "@/components/features/dashboard/DashboardShell";
import ThemeToggle from "@/components/ui/ThemeToggle";

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
        <DashboardShell isLeagueMode={userMode.isLeagueMode}>
          {/* Main Content */}
          <Box
            component="main"
            sx={{
              flex: 1,
              pb: { xs: 8, md: 0 },
              bgcolor: "background.default",
            }}
          >
            {/* Breadcrumb Navigation + theme toggle */}
            <Box sx={{ px: 3, pt: 2, display: "flex", alignItems: "center", gap: 1 }}>
              <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                <BreadcrumbNav />
              </Box>
              <ThemeToggle />
            </Box>

            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </Box>
        </DashboardShell>
      </KeyboardShortcutsProvider>
    </LeagueProvider>
  );
}

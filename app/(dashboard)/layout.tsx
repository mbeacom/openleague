import { ReactNode } from "react";
import { requireAuth } from "@/lib/auth/session";
import { Box, AppBar, Toolbar, Typography } from "@mui/material";
import DashboardNav from "@/components/features/dashboard/DashboardNav";
import ErrorBoundary from "@/components/ui/ErrorBoundary";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Require authentication for all dashboard routes
  await requireAuth();

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
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            OpenLeague
          </Typography>
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
          <Box sx={{ p: 2 }}>
            <Typography variant="h5" component="div" color="primary">
              OpenLeague
            </Typography>
          </Box>
          <DashboardNav />
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
      <DashboardNav mobile />
    </Box>
  );
}

"use client";

import { ReactNode } from "react";
import { Box, AppBar, Toolbar } from "@mui/material";
import Logo from "@/components/ui/Logo";
import LeagueContextSwitcher from "@/components/features/navigation/LeagueContextSwitcher";
import DashboardNav from "@/components/features/dashboard/DashboardNav";
import MobileNavigation from "@/components/features/navigation/MobileNavigation";
import KeyboardShortcutsHelp from "@/components/features/navigation/KeyboardShortcutsHelp";

interface DashboardShellProps {
  isLeagueMode: boolean;
  children: ReactNode;
}

export default function DashboardShell({ isLeagueMode, children }: DashboardShellProps) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      {/* Top App Bar - mobile only */}
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
          <LeagueContextSwitcher variant="compact" />
        </Toolbar>
      </AppBar>

      {/* Desktop Sidebar + Content */}
      <Box sx={{ display: "flex", flex: 1 }}>
        {/* Desktop Sidebar */}
        <Box
          component="nav"
          sx={(theme) => ({
            display: { xs: "none", md: "block" },
            width: 260,
            flexShrink: 0,
            borderRight: "2px solid",
            borderColor: `rgba(${theme.palette.mode === "light" ? "13, 71, 161" : "255, 255, 255"}, 0.08)`,
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
              transition: "transform 0.2s ease-in-out",
              "&:hover": { transform: "scale(1.02)" },
            }}
          />
          <Box sx={{ px: 2, pb: 2 }}>
            <LeagueContextSwitcher />
          </Box>
          <DashboardNav isLeagueMode={isLeagueMode} />
        </Box>

        {/* Main Content */}
        {children}
      </Box>

      {/* Mobile Bottom Navigation */}
      <MobileNavigation isLeagueMode={isLeagueMode} />

      {/* Keyboard Shortcuts Help Button */}
      <KeyboardShortcutsHelp />
    </Box>
  );
}

"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  BottomNavigation,
  BottomNavigationAction,
  Paper,
  Divider,
  Menu,
  MenuItem,
  ListItemText as MenuListItemText,
} from "@mui/material";
import {
  Dashboard as DashboardIcon,
  People as PeopleIcon,
  CalendarMonth as CalendarIcon,
  Event as EventIcon,
  Groups as GroupsIcon,
  Logout as LogoutIcon,
  MoreVert as MoreVertIcon,
  Analytics as AnalyticsIcon,
  Assessment as ReportsIcon,
} from "@mui/icons-material";
import { logout } from "@/lib/actions/logout";
import { useLeague } from "@/components/providers/LeagueProvider";

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

interface DashboardNavProps {
  mobile?: boolean;
  isLeagueMode?: boolean;
}

export default function DashboardNav({ mobile = false, isLeagueMode = false }: DashboardNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const menuOpen = Boolean(anchorEl);

  // Use league context if available
  let currentLeague = null;
  try {
    const leagueContext = useLeague();
    currentLeague = leagueContext.currentLeague;
  } catch {
    // Not in league context, use props
  }

  // Generate navigation items based on mode and context
  const getNavItems = (): NavItem[] => {
    if (!isLeagueMode) {
      // Single-team mode navigation (original)
      return [
        { label: "Dashboard", path: "/dashboard", icon: <DashboardIcon /> },
        { label: "Roster", path: "/roster", icon: <PeopleIcon /> },
        { label: "Calendar", path: "/calendar", icon: <CalendarIcon /> },
        { label: "Events", path: "/events", icon: <EventIcon /> },
      ];
    }

    // League mode navigation with dynamic paths
    const leaguePrefix = currentLeague ? `/league/${currentLeague.id}` : '';
    return [
      { label: "Dashboard", path: `${leaguePrefix}/dashboard`, icon: <DashboardIcon /> },
      { label: "Teams", path: `${leaguePrefix}/teams`, icon: <GroupsIcon /> },
      { label: "Schedule", path: `${leaguePrefix}/schedule`, icon: <CalendarIcon /> },
      { label: "Roster", path: `${leaguePrefix}/roster`, icon: <PeopleIcon /> },
      { label: "Statistics", path: `${leaguePrefix}/statistics`, icon: <AnalyticsIcon /> },
      { label: "Reports", path: `${leaguePrefix}/reports`, icon: <ReportsIcon /> },
    ];
  };

  const navItems = getNavItems();

  const handleNavigation = (path: string) => {
    router.push(path);
  };

  const handleLogout = async () => {
    await logout();
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleMenuLogout = async () => {
    handleMenuClose();
    await handleLogout();
  };

  // Mobile Bottom Navigation
  if (mobile) {
    return (
      <>
        <Paper
          sx={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            display: { xs: "block", md: "none" },
            zIndex: 1000,
          }}
          elevation={3}
        >
          <BottomNavigation
            value={pathname}
            onChange={(event, newValue) => {
              if (newValue !== "more") {
                handleNavigation(newValue);
              }
            }}
            showLabels
            sx={{
              // Ensure touch targets meet 44x44px minimum
              '& .MuiBottomNavigationAction-root': {
                minHeight: 56, // Ensures adequate touch target
                minWidth: 64, // Slightly smaller to fit 5 items
              },
            }}
          >
            {navItems.map((item) => (
              <BottomNavigationAction
                key={item.path}
                label={item.label}
                value={item.path}
                icon={item.icon}
              />
            ))}
            {/* More menu for secondary actions */}
            <BottomNavigationAction
              label="More"
              value="more"
              icon={<MoreVertIcon />}
              onClick={handleMenuOpen}
              aria-haspopup="menu"
              aria-expanded={menuOpen ? "true" : "false"}
              aria-controls={menuOpen ? "mobile-more-menu" : undefined}
            />
          </BottomNavigation>
        </Paper>

        {/* Mobile hamburger menu for secondary actions */}
        <Menu
          id="mobile-more-menu"
          anchorEl={anchorEl}
          open={menuOpen}
          onClose={handleMenuClose}
          anchorOrigin={{
            vertical: 'top',
            horizontal: 'right',
          }}
          transformOrigin={{
            vertical: 'bottom',
            horizontal: 'right',
          }}
          sx={{
            '& .MuiMenuItem-root': {
              px: 2,
            },
          }}
        >
          <MenuItem onClick={handleMenuLogout}>
            <ListItemIcon>
              <LogoutIcon />
            </ListItemIcon>
            <MenuListItemText>Logout</MenuListItemText>
          </MenuItem>
        </Menu>
      </>
    );
  }

  // Desktop Sidebar Navigation
  return (
    <List>
      {navItems.map((item) => (
        <ListItem key={item.path} disablePadding>
          <ListItemButton
            selected={pathname === item.path}
            onClick={() => handleNavigation(item.path)}
          >
            <ListItemIcon>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItemButton>
        </ListItem>
      ))}
      <Divider sx={{ my: 1 }} />
      <ListItem disablePadding>
        <ListItemButton onClick={handleLogout} sx={{ minHeight: 48 }}>
          <ListItemIcon>
            <LogoutIcon />
          </ListItemIcon>
          <ListItemText primary="Logout" />
        </ListItemButton>
      </ListItem>
    </List>
  );
}

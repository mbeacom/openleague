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
  Settings as SettingsIcon,
  Logout as LogoutIcon,
  MoreVert as MoreVertIcon,
} from "@mui/icons-material";
import { logout } from "@/lib/actions/logout";

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

// Single-team mode navigation (original)
const singleTeamNavItems: NavItem[] = [
  { label: "Dashboard", path: "/", icon: <DashboardIcon /> },
  { label: "Roster", path: "/roster", icon: <PeopleIcon /> },
  { label: "Calendar", path: "/calendar", icon: <CalendarIcon /> },
  { label: "Events", path: "/events", icon: <EventIcon /> },
];

// League mode navigation
const leagueNavItems: NavItem[] = [
  { label: "Dashboard", path: "/", icon: <DashboardIcon /> },
  { label: "Teams", path: "/teams", icon: <GroupsIcon /> },
  { label: "Schedule", path: "/schedule", icon: <CalendarIcon /> },
  { label: "Roster", path: "/roster", icon: <PeopleIcon /> },
  { label: "Settings", path: "/settings", icon: <SettingsIcon /> },
];

interface DashboardNavProps {
  mobile?: boolean;
  isLeagueMode?: boolean;
}

export default function DashboardNav({ mobile = false, isLeagueMode = false }: DashboardNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const menuOpen = Boolean(anchorEl);

  // Select navigation items based on mode
  const navItems = isLeagueMode ? leagueNavItems : singleTeamNavItems;

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

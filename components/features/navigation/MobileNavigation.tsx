"use client";

import React, { useState } from 'react';
import {
  BottomNavigation,
  BottomNavigationAction,
  Paper,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  People as PeopleIcon,
  CalendarMonth as CalendarIcon,
  Groups as GroupsIcon,
  Logout as LogoutIcon,
  MoreVert as MoreVertIcon,
  Settings as SettingsIcon,
  SportsHockey as SportsHockeyIcon,
  HowToReg as HowToRegIcon,
  ManageAccounts as ManageAccountsIcon,
} from '@mui/icons-material';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logout } from '@/lib/actions/logout';
import { useLeague } from '@/components/providers/LeagueProvider';

interface MobileNavigationProps {
  isLeagueMode?: boolean;
}

export default function MobileNavigation({ isLeagueMode = false }: MobileNavigationProps) {
  const pathname = usePathname();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const menuOpen = Boolean(anchorEl);

  let currentLeague = null;
  try {
    const leagueContext = useLeague();
    currentLeague = leagueContext.currentLeague;
  } catch (err) {
    // Not in league context - only ignore context-related errors
    const isContextError =
      err &&
      typeof err === "object" &&
      "message" in err &&
      typeof err.message === "string" &&
      (err.message.includes("useLeague") || err.message.includes("context"));

    if (!isContextError) {
      console.error('Unexpected error in MobileNavigation/useLeague:', err);
    }
  }

  const getNavItems = () => {
    if (!isLeagueMode) {
      return [
        { label: "Dashboard", path: "/dashboard", icon: <DashboardIcon /> },
        { label: "Roster", path: "/roster", icon: <PeopleIcon /> },
        { label: "Calendar", path: "/calendar", icon: <CalendarIcon /> },
      ];
    }

    const leaguePrefix = currentLeague ? `/league/${currentLeague.id}` : '';
    return [
      { label: "Dashboard", path: `${leaguePrefix}/dashboard`, icon: <DashboardIcon /> },
      { label: "Teams", path: `${leaguePrefix}/teams`, icon: <GroupsIcon /> },
      { label: "Schedule", path: `${leaguePrefix}/schedule`, icon: <CalendarIcon /> },
      { label: "Roster", path: `${leaguePrefix}/roster`, icon: <PeopleIcon /> },
    ];
  };

  const navItems = getNavItems();

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = async () => {
    handleMenuClose();
    await logout();
  };

  const getCurrentValue = () => {
    // Match current pathname to nav item
    const currentItem = navItems.find(item => {
      if (item.path === '/dashboard' && (pathname === '/' || pathname === '/dashboard')) {
        return true;
      }
      return pathname.startsWith(item.path);
    });
    return currentItem?.path || pathname;
  };

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
          value={getCurrentValue()}
          showLabels
          sx={{
            '& .MuiBottomNavigationAction-root': {
              minHeight: 56,
              minWidth: 64,
              '&.Mui-selected': {
                color: 'primary.main',
              },
            },
          }}
        >
          {navItems.map((item) => (
            <BottomNavigationAction
              key={item.path}
              component={Link}
              href={item.path}
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

      {/* More menu */}
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
            minHeight: 48,
          },
        }}
      >
        {!isLeagueMode && (
          <MenuItem
            component={Link}
            href="/practice-planner"
            onClick={handleMenuClose}
          >
            <ListItemIcon>
              <SportsHockeyIcon />
            </ListItemIcon>
            <ListItemText>Practice Planner</ListItemText>
          </MenuItem>
        )}
        <MenuItem
          component={Link}
          href="/signup-events"
          onClick={handleMenuClose}
        >
          <ListItemIcon>
            <HowToRegIcon />
          </ListItemIcon>
          <ListItemText>Signup Events</ListItemText>
        </MenuItem>
        {!isLeagueMode && (
          <MenuItem
            component={Link}
            href="/settings"
            onClick={handleMenuClose}
          >
            <ListItemIcon>
              <SettingsIcon />
            </ListItemIcon>
            <ListItemText>Team Settings</ListItemText>
          </MenuItem>
        )}
        {isLeagueMode && currentLeague && (
          <MenuItem
            component={Link}
            href={`/league/${currentLeague.id}/settings`}
            onClick={handleMenuClose}
          >
            <ListItemIcon>
              <SettingsIcon />
            </ListItemIcon>
            <ListItemText>League Settings</ListItemText>
          </MenuItem>
        )}
        <MenuItem
          component={Link}
          href="/account"
          onClick={handleMenuClose}
        >
          <ListItemIcon>
            <ManageAccountsIcon />
          </ListItemIcon>
          <ListItemText>Account</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleLogout}>
          <ListItemIcon>
            <LogoutIcon />
          </ListItemIcon>
          <ListItemText>Logout</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
}
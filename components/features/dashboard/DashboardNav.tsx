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
  Logout as LogoutIcon,
  MoreVert as MoreVertIcon,
} from "@mui/icons-material";
import { logout } from "@/lib/actions/logout";

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { label: "Dashboard", path: "/", icon: <DashboardIcon /> },
  { label: "Roster", path: "/roster", icon: <PeopleIcon /> },
  { label: "Calendar", path: "/calendar", icon: <CalendarIcon /> },
  { label: "Events", path: "/events", icon: <EventIcon /> },
];

interface DashboardNavProps {
  mobile?: boolean;
}

export default function DashboardNav({ mobile = false }: DashboardNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const menuOpen = Boolean(anchorEl);

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
            />
          </BottomNavigation>
        </Paper>

        {/* Mobile hamburger menu for secondary actions */}
        <Menu
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
              minHeight: 48, // Ensure 44x44px touch targets
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
            sx={{ minHeight: 48 }} // Ensure adequate touch target
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

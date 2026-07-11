"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
} from "@mui/material";
import {
  Dashboard as DashboardIcon,
  People as PeopleIcon,
  CalendarMonth as CalendarIcon,
  Groups as GroupsIcon,
  Logout as LogoutIcon,
  Analytics as AnalyticsIcon,
  Assessment as ReportsIcon,
  SportsHockey as SportsHockeyIcon,
  Place as PlaceIcon,
  DateRange as DateRangeIcon,
  Storefront as StorefrontIcon,
  ConfirmationNumber as ConfirmationNumberIcon,
  HowToReg as HowToRegIcon,
} from "@mui/icons-material";
import { logout } from "@/lib/actions/logout";
import { useLeague } from "@/components/providers/LeagueProvider";

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

interface DashboardNavProps {
  isLeagueMode?: boolean;
}

export default function DashboardNav({ isLeagueMode = false }: DashboardNavProps) {
  const pathname = usePathname();
  const router = useRouter();

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
        { label: "Signup Events", path: "/signup-events", icon: <HowToRegIcon /> },
        { label: "Venues", path: "/venues", icon: <PlaceIcon /> },
        { label: "Venue Admin", path: "/venue-admin", icon: <StorefrontIcon /> },
        { label: "My Registrations", path: "/my-registrations", icon: <ConfirmationNumberIcon /> },
        { label: "Seasons", path: "/seasons", icon: <DateRangeIcon /> },
        { label: "Practice Planner", path: "/practice-planner", icon: <SportsHockeyIcon /> },
      ];
    }

    // League mode navigation with dynamic paths
    const leaguePrefix = currentLeague ? `/league/${currentLeague.id}` : '';
    return [
      { label: "Dashboard", path: `${leaguePrefix}/dashboard`, icon: <DashboardIcon /> },
      { label: "Teams", path: `${leaguePrefix}/teams`, icon: <GroupsIcon /> },
      { label: "Schedule", path: `${leaguePrefix}/schedule`, icon: <CalendarIcon /> },
      { label: "Signup Events", path: "/signup-events", icon: <HowToRegIcon /> },
      // Points to the global venues page until /league/[id]/venues ships (roadmap D1)
      { label: "Venues", path: "/venues", icon: <PlaceIcon /> },
      { label: "Venue Admin", path: "/venue-admin", icon: <StorefrontIcon /> },
      { label: "My Registrations", path: "/my-registrations", icon: <ConfirmationNumberIcon /> },
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

  // Desktop Sidebar Navigation (mobile uses MobileNavigation)
  return (
    <List>
      {navItems.map((item) => (
        <ListItem key={item.path} disablePadding>
          <ListItemButton
            selected={pathname === item.path || pathname.startsWith(`${item.path}/`)}
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

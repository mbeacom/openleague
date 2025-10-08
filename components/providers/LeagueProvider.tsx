"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';

interface League {
  id: string;
  name: string;
  sport: string;
}

interface Team {
  id: string;
  name: string;
  sport: string;
  season: string;
  leagueId: string | null;
}

interface LeagueContextType {
  currentLeague: League | null;
  leagues: League[];
  teams: Team[];
  isLeagueMode: boolean;
  switchLeague: (leagueId: string) => void;
  getCurrentPath: () => string;
  getBreadcrumbs: () => Array<{ label: string; href?: string }>;
}

const LeagueContext = createContext<LeagueContextType | undefined>(undefined);

interface LeagueProviderProps {
  children: React.ReactNode;
  initialData: {
    isLeagueMode: boolean;
    leagues: League[];
    teams: Team[];
  };
}

export const LeagueProvider: React.FC<LeagueProviderProps> = ({
  children,
  initialData
}) => {
  const router = useRouter();
  const pathname = usePathname();

  const [currentLeague, setCurrentLeague] = useState<League | null>(
    initialData.leagues.length > 0 ? initialData.leagues[0] : null
  );
  const [leagues] = useState<League[]>(initialData.leagues);
  const [teams] = useState<Team[]>(initialData.teams);
  const isLeagueMode = initialData.isLeagueMode;

  const switchLeague = useCallback((leagueId: string) => {
    const league = leagues.find(l => l.id === leagueId);
    if (league) {
      setCurrentLeague(league);
      // Navigate to league dashboard
      router.push(`/league/${league.id}/dashboard`);
    }
  }, [leagues, router]);

  const getCurrentPath = useCallback(() => {
    if (!isLeagueMode) {
      return pathname;
    }

    if (currentLeague) {
      return `/league/${currentLeague.id}${pathname.startsWith('/league/') ? pathname.split('/').slice(3).join('/') : pathname}`;
    }

    return pathname;
  }, [pathname, currentLeague, isLeagueMode]);

  const getBreadcrumbs = useCallback(() => {
    const breadcrumbs: Array<{ label: string; href?: string }> = [];
    const segments = pathname.split('/').filter(Boolean);

    if (!isLeagueMode) {
      // Single team mode - simple breadcrumbs
      if (pathname === '/dashboard' || pathname === '/') {
        breadcrumbs.push({ label: 'Dashboard' });
      } else if (pathname === '/roster') {
        breadcrumbs.push({ label: 'Dashboard', href: '/dashboard' });
        breadcrumbs.push({ label: 'Roster' });
      } else if (pathname === '/calendar') {
        breadcrumbs.push({ label: 'Dashboard', href: '/dashboard' });
        breadcrumbs.push({ label: 'Calendar' });
      } else if (segments[0] === 'events') {
        breadcrumbs.push({ label: 'Dashboard', href: '/dashboard' });
        breadcrumbs.push({ label: 'Events' });
      }
      return breadcrumbs;
    }

    // League mode - hierarchical breadcrumbs using segments
    if (currentLeague && segments[0] === 'league' && segments[1] === currentLeague.id) {
      breadcrumbs.push({
        label: currentLeague.name,
        href: `/league/${currentLeague.id}/dashboard`
      });

      // Parse segments to determine page
      const pageSegment = segments[2]; // e.g., 'teams', 'schedule', 'roster', 'settings', 'dashboard'

      if (pageSegment === 'teams') {
        breadcrumbs.push({
          label: 'Teams',
          href: segments.length === 3 ? undefined : `/league/${currentLeague.id}/teams`
        });
        // Check for nested routes like /teams/new or /teams/{teamId}
        if (segments[3] === 'new') {
          breadcrumbs.push({ label: 'Create New Team' });
        } else if (segments[3]) {
          breadcrumbs.push({ label: 'Team Details' });
        }
      } else if (pageSegment === 'schedule') {
        breadcrumbs.push({ label: 'Schedule' });
      } else if (pageSegment === 'roster') {
        breadcrumbs.push({ label: 'All Players' });
      } else if (pageSegment === 'settings') {
        breadcrumbs.push({ label: 'Settings' });
      } else if (pageSegment === 'dashboard') {
        breadcrumbs.push({ label: 'Dashboard' });
      }
    }

    return breadcrumbs;
  }, [pathname, currentLeague, isLeagueMode]);

  // Update current league based on URL
  useEffect(() => {
    if (isLeagueMode && pathname.startsWith('/league/')) {
      const leagueIdFromPath = pathname.split('/')[2];
      const leagueFromPath = leagues.find(l => l.id === leagueIdFromPath);
      if (leagueFromPath && leagueFromPath.id !== currentLeague?.id) {
        setCurrentLeague(leagueFromPath);
      }
    }
  }, [pathname, leagues, currentLeague, isLeagueMode]);

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(() => ({
    currentLeague,
    leagues,
    teams,
    isLeagueMode,
    switchLeague,
    getCurrentPath,
    getBreadcrumbs
  }), [currentLeague, leagues, teams, isLeagueMode, switchLeague, getCurrentPath, getBreadcrumbs]);

  return (
    <LeagueContext.Provider value={contextValue}>
      {children}
    </LeagueContext.Provider>
  );
};

export const useLeague = (): LeagueContextType => {
  const context = useContext(LeagueContext);
  if (context === undefined) {
    throw new Error('useLeague must be used within a LeagueProvider');
  }
  return context;
};
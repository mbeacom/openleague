"use client";

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
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

// Top-level dashboard routes (segment -> label) shared by both modes.
const SECTION_LABELS: Record<string, string> = {
  roster: 'Roster',
  calendar: 'Calendar',
  events: 'Events',
  seasons: 'Seasons',
  venues: 'Venues',
  'venue-admin': 'Venue Admin',
  'signup-events': 'Signup Events',
  'my-registrations': 'My Registrations',
  settings: 'Team Settings',
  account: 'Account',
};

// League-scoped routes (/league/[leagueId]/<segment> -> label).
const LEAGUE_SECTION_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  schedule: 'Schedule',
  roster: 'All Players',
  settings: 'Settings',
  statistics: 'Statistics',
  reports: 'Reports',
  venues: 'Venues',
  messages: 'Messages',
  divisions: 'Divisions',
  invitations: 'Invitations',
  payments: 'Payments',
};

// Well-known nested segments; unknown tails (ids) render as 'Details'.
const SUBPAGE_LABELS: Record<string, string> = {
  new: 'New',
  edit: 'Edit',
  'new-game': 'New Game',
  proposals: 'Proposals',
  placement: 'Placement',
};

/** Push "Section" or "Section > Subpage" crumbs for a top-level route. */
function pushSectionCrumbs(
  breadcrumbs: Array<{ label: string; href?: string }>,
  segments: string[],
  label: string,
  sectionHref: string,
  sectionDepth: number
) {
  if (segments.length === sectionDepth) {
    breadcrumbs.push({ label });
    return;
  }
  breadcrumbs.push({ label, href: sectionHref });
  const tail = segments[segments.length - 1];
  breadcrumbs.push({ label: SUBPAGE_LABELS[tail] ?? 'Details' });
}

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

  const [manualLeague, setManualLeague] = useState<League | null>(
    initialData.leagues.length > 0 ? initialData.leagues[0] : null
  );
  const [leagues] = useState<League[]>(initialData.leagues);
  const [teams] = useState<Team[]>(initialData.teams);
  const isLeagueMode = initialData.isLeagueMode;

  // Derive current league from URL when in league mode
  const currentLeague = useMemo(() => {
    if (isLeagueMode && pathname.startsWith('/league/')) {
      const leagueIdFromPath = pathname.split('/')[2];
      const leagueFromPath = leagues.find(l => l.id === leagueIdFromPath);
      if (leagueFromPath) return leagueFromPath;
    }
    return manualLeague;
  }, [isLeagueMode, pathname, leagues, manualLeague]);

  const switchLeague = useCallback((leagueId: string) => {
    const league = leagues.find(l => l.id === leagueId);
    if (league) {
      setManualLeague(league);
      // Navigate to league dashboard
      router.push(`/league/${league.id}/dashboard`);
    }
  }, [leagues, router]);

  const getCurrentPath = useCallback(() => {
    if (!isLeagueMode) {
      return pathname;
    }

    if (currentLeague) {
      if (pathname.startsWith('/league/')) {
        const remainder = pathname.split('/').slice(3).join('/');
        return `/league/${currentLeague.id}${remainder ? `/${remainder}` : ''}`;
      }
      return `/league/${currentLeague.id}${pathname}`;
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
      } else if (segments[0] === 'practice-planner') {
        breadcrumbs.push({ label: 'Dashboard', href: '/dashboard' });
        if (segments.length === 1) {
          breadcrumbs.push({ label: 'Practice Planner' });
        } else if (segments[1] === 'new') {
          breadcrumbs.push({ label: 'Practice Planner', href: '/practice-planner' });
          breadcrumbs.push({ label: 'New Session' });
        } else if (segments[1] === 'library') {
          breadcrumbs.push({ label: 'Practice Planner', href: '/practice-planner' });
          breadcrumbs.push({ label: 'Play Library' });
        } else if (segments[2] === 'edit') {
          breadcrumbs.push({ label: 'Practice Planner', href: '/practice-planner' });
          breadcrumbs.push({ label: 'Session', href: `/practice-planner/${segments[1]}` });
          breadcrumbs.push({ label: 'Edit' });
        } else {
          breadcrumbs.push({ label: 'Practice Planner', href: '/practice-planner' });
          breadcrumbs.push({ label: 'Session' });
        }
      } else if (SECTION_LABELS[segments[0]]) {
        breadcrumbs.push({ label: 'Dashboard', href: '/dashboard' });
        pushSectionCrumbs(breadcrumbs, segments, SECTION_LABELS[segments[0]], `/${segments[0]}`, 1);
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
      const pageSegment = segments[2]; // e.g., 'teams', 'schedule', 'divisions', 'messages'

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
      } else if (LEAGUE_SECTION_LABELS[pageSegment]) {
        pushSectionCrumbs(
          breadcrumbs,
          segments,
          LEAGUE_SECTION_LABELS[pageSegment],
          `/league/${currentLeague.id}/${pageSegment}`,
          3
        );
      }
    } else if (SECTION_LABELS[segments[0]]) {
      // Global (non-league-scoped) pages reached while in league mode.
      breadcrumbs.push({
        label: 'Dashboard',
        href: currentLeague ? `/league/${currentLeague.id}/dashboard` : '/dashboard',
      });
      pushSectionCrumbs(breadcrumbs, segments, SECTION_LABELS[segments[0]], `/${segments[0]}`, 1);
    }

    return breadcrumbs;
  }, [pathname, currentLeague, isLeagueMode]);

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
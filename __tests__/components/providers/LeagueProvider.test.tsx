import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LeagueProvider, useLeague } from '@/components/providers/LeagueProvider';

const mocks = vi.hoisted(() => ({
  pathname: vi.fn(),
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: mocks.pathname,
  useRouter: () => ({ push: mocks.push }),
}));

function Crumbs() {
  const { getBreadcrumbs } = useLeague();
  return (
    <div data-testid="crumbs">
      {getBreadcrumbs()
        .map((crumb) => crumb.label)
        .join(' > ')}
    </div>
  );
}

const singleTeamData = {
  isLeagueMode: false,
  leagues: [],
  teams: [
    { id: 't1', name: 'Team One', sport: 'hockey', season: '2026', leagueId: null },
  ],
};

const leagueData = {
  isLeagueMode: true,
  leagues: [{ id: 'l1', name: 'League One', sport: 'hockey' }],
  teams: [],
};

function renderCrumbs(initialData: typeof singleTeamData | typeof leagueData) {
  return render(
    <LeagueProvider initialData={initialData}>
      <Crumbs />
    </LeagueProvider>
  );
}

describe('LeagueProvider getBreadcrumbs', () => {
  beforeEach(() => {
    mocks.pathname.mockReset();
    mocks.push.mockReset();
  });

  describe('single-team mode', () => {
    it('keeps existing roster breadcrumbs', () => {
      mocks.pathname.mockReturnValue('/roster');
      renderCrumbs(singleTeamData);
      expect(screen.getByTestId('crumbs')).toHaveTextContent('Dashboard > Roster');
    });

    it.each([
      ['/seasons', 'Dashboard > Seasons'],
      ['/venues', 'Dashboard > Venues'],
      ['/venue-admin', 'Dashboard > Venue Admin'],
      ['/signup-events', 'Dashboard > Signup Events'],
      ['/my-registrations', 'Dashboard > My Registrations'],
      ['/settings', 'Dashboard > Team Settings'],
      ['/account', 'Dashboard > Account'],
    ])('covers %s', (pathname, expected) => {
      mocks.pathname.mockReturnValue(pathname);
      renderCrumbs(singleTeamData);
      expect(screen.getByTestId('crumbs')).toHaveTextContent(expected);
    });

    it('labels nested new/edit pages', () => {
      mocks.pathname.mockReturnValue('/venues/venue-1/edit');
      renderCrumbs(singleTeamData);
      expect(screen.getByTestId('crumbs')).toHaveTextContent('Dashboard > Venues > Edit');
    });

    it('labels unknown nested segments as details', () => {
      mocks.pathname.mockReturnValue('/signup-events/event-1');
      renderCrumbs(singleTeamData);
      expect(screen.getByTestId('crumbs')).toHaveTextContent(
        'Dashboard > Signup Events > Details'
      );
    });
  });

  describe('league mode', () => {
    it('keeps existing nested teams breadcrumbs', () => {
      mocks.pathname.mockReturnValue('/league/l1/teams/new');
      renderCrumbs(leagueData);
      expect(screen.getByTestId('crumbs')).toHaveTextContent(
        'League One > Teams > Create New Team'
      );
    });

    it.each([
      ['/league/l1/divisions', 'League One > Divisions'],
      ['/league/l1/messages', 'League One > Messages'],
      ['/league/l1/statistics', 'League One > Statistics'],
      ['/league/l1/reports', 'League One > Reports'],
      ['/league/l1/venues', 'League One > Venues'],
      ['/league/l1/invitations', 'League One > Invitations'],
      ['/league/l1/payments', 'League One > Payments'],
    ])('covers %s', (pathname, expected) => {
      mocks.pathname.mockReturnValue(pathname);
      renderCrumbs(leagueData);
      expect(screen.getByTestId('crumbs')).toHaveTextContent(expected);
    });

    it('labels league-scoped nested pages', () => {
      mocks.pathname.mockReturnValue('/league/l1/schedule/new-game');
      renderCrumbs(leagueData);
      expect(screen.getByTestId('crumbs')).toHaveTextContent(
        'League One > Schedule > New Game'
      );
    });

    it('covers global pages while in league mode', () => {
      mocks.pathname.mockReturnValue('/seasons');
      renderCrumbs(leagueData);
      expect(screen.getByTestId('crumbs')).toHaveTextContent('Dashboard > Seasons');
    });
  });
});

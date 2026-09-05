import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import theme from '@/lib/theme';
import TeamCard from '@/components/features/dashboard/TeamCard';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const TEAM = {
  id: 'team-1',
  name: 'Ice Breakers',
  sport: 'HOCKEY',
  season: 'Winter 2026',
  _count: { players: 18, events: 7 },
};

function renderCard(props: Partial<React.ComponentProps<typeof TeamCard>> = {}) {
  return render(
    <ThemeProvider theme={theme}>
      <TeamCard team={TEAM} role="MEMBER" showStats {...props} />
    </ThemeProvider>,
  );
}

describe('TeamCard', () => {
  it('makes the whole tile a link to the team', () => {
    // The tile used to push with the router from a small "View Team" button,
    // which left the obvious target inert and unopenable in a new tab.
    renderCard();
    const link = screen.getByRole('link', { name: /Ice Breakers/ });
    expect(link).toHaveAttribute('href', '/team/team-1');
  });

  it('exposes exactly one link, so the tile is a single tab stop', () => {
    renderCard();
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('shows the sport and season', () => {
    renderCard();
    expect(screen.getByText(/Winter 2026/)).toBeInTheDocument();
  });

  it('renders roster counts as a scoreboard strip', () => {
    renderCard();
    expect(screen.getByText('18')).toBeInTheDocument();
    expect(screen.getByText('Players')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('Events')).toBeInTheDocument();
  });

  it('omits the stat strip when counts are not loaded', () => {
    renderCard({ team: { ...TEAM, _count: undefined }, showStats: true });
    expect(screen.queryByText('Players')).not.toBeInTheDocument();
  });

  it('marks admins', () => {
    renderCard({ role: 'ADMIN' });
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });

  it('does not mark members as admins', () => {
    renderCard({ role: 'MEMBER' });
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
  });

  it('shows league and division only in league mode', () => {
    const team = {
      ...TEAM,
      league: { id: 'lg-1', name: 'Metro League' },
      division: { id: 'dv-1', name: 'Division A' },
    };

    const { unmount } = renderCard({ team, showLeagueInfo: false });
    expect(screen.queryByText('Metro League')).not.toBeInTheDocument();
    unmount();

    renderCard({ team, showLeagueInfo: true });
    expect(screen.getByText('Metro League')).toBeInTheDocument();
    expect(screen.getByText('Division A')).toBeInTheDocument();
  });

  it('renders an uploaded crest when the team has one', () => {
    const { container } = renderCard({
      team: { ...TEAM, logoUrl: 'https://example.com/crest.png' },
    });
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      'https://example.com/crest.png',
    );
  });

  it('falls back to a monogram when the team has no logo', () => {
    renderCard();
    expect(screen.getByText('IB')).toBeInTheDocument();
  });
});

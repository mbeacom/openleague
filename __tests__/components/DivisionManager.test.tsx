import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DivisionManager from '@/components/features/team/DivisionManager';

// Mock the Server Actions
vi.mock('@/lib/actions/league', () => ({
  createDivision: vi.fn(),
  updateDivision: vi.fn(),
  deleteDivision: vi.fn(),
}));

describe('DivisionManager Component', () => {
  const mockDivisions = [
    {
      id: 'division-1',
      name: 'U10 Division',
      ageGroup: 'Under 10',
      skillLevel: 'Recreational',
      _count: { teams: 3 },
    },
    {
      id: 'division-2',
      name: 'U12 Division',
      ageGroup: 'Under 12',
      skillLevel: 'Competitive',
      _count: { teams: 5 },
    },
  ];

  it('should render divisions list', () => {
    render(
      <DivisionManager
        divisions={mockDivisions}
        leagueId="league-1"
        canManage={false}
      />
    );

    expect(screen.getByText('Divisions')).toBeInTheDocument();
    expect(screen.getByText('U10 Division')).toBeInTheDocument();
    expect(screen.getByText('U12 Division')).toBeInTheDocument();
  });

  it('should show "Add Division" button when user can manage', () => {
    render(
      <DivisionManager
        divisions={mockDivisions}
        leagueId="league-1"
        canManage={true}
      />
    );

    // Button now has tooltip aria-label with keyboard shortcut hint
    expect(screen.getByRole('button', { name: /create new division.*ctrl\+n/i })).toBeInTheDocument();
  });

  it('should not show "Add Division" button when user cannot manage', () => {
    render(
      <DivisionManager
        divisions={mockDivisions}
        leagueId="league-1"
        canManage={false}
      />
    );

    // Check for the button with the full accessible name
    expect(screen.queryByRole('button', { name: /create new division/i })).not.toBeInTheDocument();
  });

  it('should display empty state when no divisions exist', () => {
    render(
      <DivisionManager
        divisions={[]}
        leagueId="league-1"
        canManage={false}
      />
    );

    expect(screen.getByText(/no divisions created yet/i)).toBeInTheDocument();
  });

  it('should show create division dialog when "Add Division" is clicked', async () => {
    const user = userEvent.setup();

    render(
      <DivisionManager
        divisions={mockDivisions}
        leagueId="league-1"
        canManage={true}
      />
    );

    const addButton = screen.getByRole('button', { name: /create new division.*ctrl\+n/i });
    await user.click(addButton);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /create division/i })).toBeInTheDocument();
    });
  });

  it('should display division details including team count', () => {
    render(
      <DivisionManager
        divisions={mockDivisions}
        leagueId="league-1"
        canManage={false}
      />
    );

    expect(screen.getByText('3 teams')).toBeInTheDocument();
    expect(screen.getByText('5 teams')).toBeInTheDocument();
    expect(screen.getByText(/Age: Under 10/i)).toBeInTheDocument();
    expect(screen.getByText(/Level: Recreational/i)).toBeInTheDocument();
  });

  it('should display age group and skill level when provided', () => {
    const divisionsWithDetails = [
      {
        id: 'division-1',
        name: 'Elite Division',
        ageGroup: 'Adult',
        skillLevel: 'Elite',
        _count: { teams: 2 },
      },
    ];

    render(
      <DivisionManager
        divisions={divisionsWithDetails}
        leagueId="league-1"
        canManage={false}
      />
    );

    expect(screen.getByText(/Age: Adult/i)).toBeInTheDocument();
    expect(screen.getByText(/Level: Elite/i)).toBeInTheDocument();
  });
});

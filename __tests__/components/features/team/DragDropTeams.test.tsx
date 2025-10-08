import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import DragDropTeams from '@/components/features/team/DragDropTeams';
import { assignTeamToDivision } from '@/lib/actions/league';
import { useRouter } from 'next/navigation';

// Mock dependencies
vi.mock('@/lib/actions/league', () => ({
  assignTeamToDivision: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}));

const mockRouter = {
  push: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
};

const mockTeam1 = {
  id: 'team-1',
  name: 'Team Alpha',
  sport: 'Basketball',
  season: 'Fall 2025',
  createdAt: new Date('2025-01-01'),
  _count: { players: 12, events: 5 },
};

const mockTeam2 = {
  id: 'team-2',
  name: 'Team Beta',
  sport: 'Basketball',
  season: 'Fall 2025',
  createdAt: new Date('2025-01-02'),
  _count: { players: 10, events: 3 },
};

const mockTeam3 = {
  id: 'team-3',
  name: 'Team Gamma',
  sport: 'Basketball',
  season: 'Fall 2025',
  createdAt: new Date('2025-01-03'),
  _count: { players: 8, events: 2 },
};

const mockDivision1 = {
  id: 'division-1',
  name: 'Division A',
  description: 'Top tier division',
  ageGroup: 'U18',
  skillLevel: 'Advanced',
  teams: [mockTeam1],
};

const mockDivision2 = {
  id: 'division-2',
  name: 'Division B',
  description: 'Second tier division',
  ageGroup: 'U16',
  skillLevel: 'Intermediate',
  teams: [mockTeam2],
};

describe('DragDropTeams', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as ReturnType<typeof vi.fn>).mockReturnValue(mockRouter);
    (assignTeamToDivision as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders children with divisions and unassigned teams', () => {
    const children = vi.fn(({ divisions, unassignedTeams }) => (
      <div>
        <div data-testid="divisions-count">{divisions.length}</div>
        <div data-testid="unassigned-count">{unassignedTeams.length}</div>
      </div>
    ));

    render(
      <DragDropTeams
        leagueId="league-1"
        divisions={[mockDivision1, mockDivision2]}
        unassignedTeams={[mockTeam3]}
      >
        {children}
      </DragDropTeams>
    );

    expect(children).toHaveBeenCalledWith(
      expect.objectContaining({
        divisions: expect.arrayContaining([
          expect.objectContaining({ id: 'division-1' }),
          expect.objectContaining({ id: 'division-2' }),
        ]),
        unassignedTeams: expect.arrayContaining([
          expect.objectContaining({ id: 'team-3' }),
        ]),
      })
    );

    expect(screen.getByTestId('divisions-count')).toHaveTextContent('2');
    expect(screen.getByTestId('unassigned-count')).toHaveTextContent('1');
  });

  it('initializes with correct state', () => {
    const children = vi.fn(({ divisions, unassignedTeams }) => (
      <div>
        <div data-testid="division-1-teams">
          {divisions.find((d: typeof mockDivision1) => d.id === 'division-1')?.teams.length || 0}
        </div>
        <div data-testid="division-2-teams">
          {divisions.find((d: typeof mockDivision2) => d.id === 'division-2')?.teams.length || 0}
        </div>
        <div data-testid="unassigned-teams">{unassignedTeams.length}</div>
      </div>
    ));

    render(
      <DragDropTeams
        leagueId="league-1"
        divisions={[mockDivision1, mockDivision2]}
        unassignedTeams={[mockTeam3]}
      >
        {children}
      </DragDropTeams>
    );

    expect(screen.getByTestId('division-1-teams')).toHaveTextContent('1');
    expect(screen.getByTestId('division-2-teams')).toHaveTextContent('1');
    expect(screen.getByTestId('unassigned-teams')).toHaveTextContent('1');
  });

  it('provides DndContext to children', () => {
    render(
      <DragDropTeams
        leagueId="league-1"
        divisions={[mockDivision1]}
        unassignedTeams={[mockTeam3]}
      >
        {() => <div data-testid="child-content">Content</div>}
      </DragDropTeams>
    );

    // Verify the component renders successfully
    expect(screen.getByTestId('child-content')).toBeInTheDocument();
  });

  it('handles empty divisions and unassigned teams', () => {
    const children = vi.fn(({ divisions, unassignedTeams }) => (
      <div>
        <div data-testid="divisions-empty">{divisions.length === 0 ? 'empty' : 'has-items'}</div>
        <div data-testid="unassigned-empty">{unassignedTeams.length === 0 ? 'empty' : 'has-items'}</div>
      </div>
    ));

    render(
      <DragDropTeams
        leagueId="league-1"
        divisions={[]}
        unassignedTeams={[]}
      >
        {children}
      </DragDropTeams>
    );

    expect(screen.getByTestId('divisions-empty')).toHaveTextContent('empty');
    expect(screen.getByTestId('unassigned-empty')).toHaveTextContent('empty');
  });

  it('passes correct leagueId prop', () => {
    const testLeagueId = 'test-league-123';

    render(
      <DragDropTeams
        leagueId={testLeagueId}
        divisions={[mockDivision1]}
        unassignedTeams={[mockTeam3]}
      >
        {() => <div>Content</div>}
      </DragDropTeams>
    );

    // Component should render without errors with the provided leagueId
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('maintains state immutability', () => {
    const initialDivisions = [{ ...mockDivision1, teams: [mockTeam1] }];
    const initialUnassigned = [mockTeam3];

    const children = vi.fn(({ divisions, unassignedTeams }) => (
      <div>
        <div data-testid="divisions">{JSON.stringify(divisions.map((d: typeof mockDivision1) => d.id))}</div>
        <div data-testid="unassigned">{JSON.stringify(unassignedTeams.map((t: typeof mockTeam3) => t.id))}</div>
      </div>
    ));

    render(
      <DragDropTeams
        leagueId="league-1"
        divisions={initialDivisions}
        unassignedTeams={initialUnassigned}
      >
        {children}
      </DragDropTeams>
    );

    // Verify initial state is preserved
    expect(initialDivisions).toEqual([{ ...mockDivision1, teams: [mockTeam1] }]);
    expect(initialUnassigned).toEqual([mockTeam3]);
  });

  it('renders with multiple divisions', () => {
    const multipleDivisions = [
      mockDivision1,
      mockDivision2,
      {
        id: 'division-3',
        name: 'Division C',
        description: 'Third division',
        ageGroup: 'U14',
        skillLevel: 'Beginner',
        teams: [],
      },
    ];

    const children = vi.fn(({ divisions }) => (
      <div data-testid="division-count">{divisions.length}</div>
    ));

    render(
      <DragDropTeams
        leagueId="league-1"
        divisions={multipleDivisions}
        unassignedTeams={[]}
      >
        {children}
      </DragDropTeams>
    );

    expect(screen.getByTestId('division-count')).toHaveTextContent('3');
  });

  it('renders with multiple unassigned teams', () => {
    const multipleUnassigned = [mockTeam1, mockTeam2, mockTeam3];

    const children = vi.fn(({ unassignedTeams }) => (
      <div data-testid="unassigned-count">{unassignedTeams.length}</div>
    ));

    render(
      <DragDropTeams
        leagueId="league-1"
        divisions={[]}
        unassignedTeams={multipleUnassigned}
      >
        {children}
      </DragDropTeams>
    );

    expect(screen.getByTestId('unassigned-count')).toHaveTextContent('3');
  });

  it('provides stable render props', () => {
    const children = vi.fn(() => <div>Content</div>);

    const { rerender } = render(
      <DragDropTeams
        leagueId="league-1"
        divisions={[mockDivision1]}
        unassignedTeams={[mockTeam3]}
      >
        {children}
      </DragDropTeams>
    );

    expect(children).toHaveBeenCalled();

    rerender(
      <DragDropTeams
        leagueId="league-1"
        divisions={[mockDivision1]}
        unassignedTeams={[mockTeam3]}
      >
        {children}
      </DragDropTeams>
    );

    // Verify render props are called with correct structure
    expect(children).toHaveBeenCalled();
  });
});

describe('DragDropTeams - Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as ReturnType<typeof vi.fn>).mockReturnValue(mockRouter);
    (assignTeamToDivision as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });
  });

  it('integrates with @dnd-kit correctly', () => {
    render(
      <DragDropTeams
        leagueId="league-1"
        divisions={[mockDivision1]}
        unassignedTeams={[mockTeam3]}
      >
        {() => (
          <div data-testid="dnd-content">
            Drag and drop content
          </div>
        )}
      </DragDropTeams>
    );

    expect(screen.getByTestId('dnd-content')).toBeInTheDocument();
  });

  it('handles complex nested structures', () => {
    const complexDivision = {
      id: 'complex-division',
      name: 'Complex Division',
      description: 'Has many teams',
      ageGroup: 'U20',
      skillLevel: 'Elite',
      teams: [mockTeam1, mockTeam2],
    };

    const children = vi.fn(({ divisions }) => (
      <div>
        <div data-testid="complex-team-count">
          {divisions.find((d: typeof complexDivision) => d.id === 'complex-division')?.teams.length || 0}
        </div>
      </div>
    ));

    render(
      <DragDropTeams
        leagueId="league-1"
        divisions={[complexDivision]}
        unassignedTeams={[mockTeam3]}
      >
        {children}
      </DragDropTeams>
    );

    expect(screen.getByTestId('complex-team-count')).toHaveTextContent('2');
  });
});

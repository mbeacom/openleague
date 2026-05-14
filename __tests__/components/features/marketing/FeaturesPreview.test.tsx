import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import theme from '@/lib/theme';
import FeaturesPreview from '@/components/features/marketing/FeaturesPreview';

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

describe('FeaturesPreview', () => {
  it('renders a feature showcase with visual demo labels', () => {
    renderWithTheme(<FeaturesPreview />);

    expect(
      screen.getByRole('heading', { level: 2, name: /see the season run from one playbook/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/visual snapshots show how OpenLeague replaces spreadsheets/i)).toBeInTheDocument();

    expect(screen.getByRole('article', { name: 'Team Roster Management' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Event Scheduling & RSVPs' })).toBeInTheDocument();
    expect(screen.getByText('Live roster demo')).toBeInTheDocument();
    expect(screen.getByText('Attendance snapshot demo')).toBeInTheDocument();
  });

  it('includes concrete demo stats and accessible progress indicators', () => {
    renderWithTheme(<FeaturesPreview />);

    expect(screen.getByText('18 players')).toBeInTheDocument();
    expect(screen.getByText('14 going')).toBeInTheDocument();
    expect(screen.getByText('Reminder queued')).toBeInTheDocument();
    expect(screen.getByText('Game vs Hawks')).toBeInTheDocument();
    expect(screen.getByLabelText('Live roster demo progress')).toHaveAttribute('aria-valuenow', '86');
    expect(screen.getByLabelText('Mobile dashboard demo progress')).toHaveAttribute('aria-valuenow', '88');
  });

  it('keeps demo cards out of the keyboard tab order because they are non-interactive', () => {
    renderWithTheme(<FeaturesPreview />);

    const rosterDemo = screen.getByRole('article', { name: 'Team Roster Management' });

    expect(rosterDemo).not.toHaveAttribute('tabindex');
  });
});

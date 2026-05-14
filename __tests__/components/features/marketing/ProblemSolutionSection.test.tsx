import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import theme from '@/lib/theme';
import ProblemSolutionSection from '@/components/features/marketing/ProblemSolutionSection';

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

describe('ProblemSolutionSection', () => {
  it('renders the problem/solution comparison heading and summary', () => {
    renderWithTheme(<ProblemSolutionSection />);

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: /trade team-management chaos for one clear playbook/i,
      })
    ).toBeInTheDocument();
    expect(screen.getByText('Problem → Solution')).toBeInTheDocument();
    expect(screen.getByText(/everyday admin grind/i)).toBeInTheDocument();
  });

  it('shows before and after comparison panels', () => {
    renderWithTheme(<ProblemSolutionSection />);

    expect(
      screen.getByRole('region', { name: 'The usual team-management chaos' })
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'The OpenLeague playbook' })).toBeInTheDocument();
    expect(screen.getByText(/roster details scattered/i)).toBeInTheDocument();
    expect(screen.getByText(/one secure roster/i)).toBeInTheDocument();
    expect(screen.getByText(/coaches guess attendance/i)).toBeInTheDocument();
    expect(screen.getByText(/live RSVP status/i)).toBeInTheDocument();
  });
});

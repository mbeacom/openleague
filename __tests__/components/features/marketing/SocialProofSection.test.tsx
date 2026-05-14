import { act } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import theme from '@/lib/theme';
import SocialProofSection from '@/components/features/marketing/SocialProofSection';

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

describe('SocialProofSection', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders testimonial section copy and cards', () => {
    renderWithTheme(<SocialProofSection />);

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: /trusted by the people who keep teams moving/i,
      })
    ).toBeInTheDocument();
    expect(screen.getByText(/representative feedback, transparent community signals/i)).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(3);
    expect(screen.getByText('Youth hockey coach')).toBeInTheDocument();
    expect(screen.getByText('Team manager')).toBeInTheDocument();
    expect(screen.getByText('Club organizer')).toBeInTheDocument();
  });

  it('renders build-safe credibility and GitHub community indicators', () => {
    renderWithTheme(<SocialProofSection />);

    expect(screen.getByRole('heading', { level: 3, name: /credibility you can verify/i })).toBeInTheDocument();
    expect(screen.getByText('Open community project')).toBeInTheDocument();
    expect(screen.getByText('Public GitHub repository')).toBeInTheDocument();
    expect(screen.getByText('Community-shaped roadmap')).toBeInTheDocument();
    expect(screen.getByText('No credit card required')).toBeInTheDocument();

    const githubLink = screen.getByRole('link', { name: /view openleague on github/i });
    expect(githubLink).toHaveAttribute('href', 'https://github.com/mbeacom/openleague');
    expect(githubLink).toHaveAttribute('target', '_blank');
    expect(githubLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('animates statistic counters to final values', () => {
    vi.useFakeTimers();
    renderWithTheme(<SocialProofSection />);

    expect(within(screen.getByTestId('stat-open-source')).getByText('0%')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(within(screen.getByTestId('stat-open-source')).getByText('100%')).toBeInTheDocument();
    expect(within(screen.getByTestId('stat-workflows')).getByText('4')).toBeInTheDocument();
    expect(within(screen.getByTestId('stat-touch-target')).getByText('44px')).toBeInTheDocument();
    expect(within(screen.getByTestId('stat-setup')).getByText('3')).toBeInTheDocument();
  });

  it('shows final statistic values immediately when reduced motion is preferred', () => {
    vi.useFakeTimers();
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    try {
      renderWithTheme(<SocialProofSection />);

      act(() => {
        vi.runOnlyPendingTimers();
      });

      expect(within(screen.getByTestId('stat-open-source')).getByText('100%')).toBeInTheDocument();
      expect(within(screen.getByTestId('stat-touch-target')).getByText('44px')).toBeInTheDocument();
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });
});

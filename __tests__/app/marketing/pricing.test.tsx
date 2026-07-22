import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import theme from '@/lib/theme';
import PricingPage, { metadata } from '@/app/(marketing)/pricing/page';

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

describe('PricingPage', () => {
  it('communicates permanent free-for-teams pricing and no-credit-card onboarding', () => {
    renderWithTheme(<PricingPage />);

    expect(screen.getByRole('heading', { level: 1, name: /simple pricing for busy teams/i })).toBeInTheDocument();
    expect(screen.getByText('Free forever for teams')).toBeInTheDocument();
    expect(screen.getByText('$0')).toBeInTheDocument();
    expect(screen.getAllByText(/no credit card/i).length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        (_content, element) =>
          element?.tagName.toLowerCase() === 'p' &&
          /a trial or a countdown[\s\S]*not per player, not per season, not ever/i.test(
            element.textContent ?? ''
          )
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /start free today/i })).toHaveAttribute('href', '/signup');
  });

  it('offers a contact-driven league and club tier without a public price', () => {
    renderWithTheme(<PricingPage />);

    expect(screen.getByRole('heading', { level: 2, name: /league & club/i })).toBeInTheDocument();
    expect(screen.getByText(/for leagues, clubs, and associations/i)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /talk to us about your league or club/i })
    ).toHaveAttribute('href', '/contact');
  });

  it('states commitments and the repositioned pricing FAQ without future-bill hedging', () => {
    renderWithTheme(<PricingPage />);

    // Comparison table and the future-bill FAQ are gone.
    expect(screen.queryByText(/value compared with paid alternatives/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/will pricing change later/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/sponsored placements/i)).not.toBeInTheDocument();

    // Commitments block replaces the comparison.
    expect(screen.getByRole('heading', { level: 3, name: /our commitments/i })).toBeInTheDocument();
    expect(screen.getByText(/no per-team paywall, ever/i)).toBeInTheDocument();
    expect(screen.getByText(/no third-party ads/i)).toBeInTheDocument();

    // FAQ affirms the permanent-free stance and explains the revenue model.
    expect(screen.getByRole('heading', { level: 2, name: /pricing faq/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: /how does openleague make money/i })).toBeInTheDocument();
  });

  it('sets indexable SEO metadata with canonical pricing URL', () => {
    expect(metadata.title).toBe('Pricing - OpenLeague');
    expect(metadata.description).toMatch(/free forever for teams/i);
    expect(metadata.alternates?.canonical).toBe('https://openl.app/pricing');
    expect(metadata.robots).toHaveProperty('index', true);
  });
});

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import theme from '@/lib/theme';
import PricingPage, { metadata } from '@/app/(marketing)/pricing/page';

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

describe('PricingPage', () => {
  it('communicates permanent free pricing and no-credit-card onboarding', () => {
    renderWithTheme(<PricingPage />);

    expect(screen.getByRole('heading', { level: 1, name: /free\. all of it\./i })).toBeInTheDocument();
    expect(screen.getByText('Free forever')).toBeInTheDocument();
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

  it('offers multi-team organization capabilities on the same free terms, with no paid tier', () => {
    renderWithTheme(<PricingPage />);

    // Org capabilities are presented as part of the free plan...
    expect(
      screen.getByRole('heading', { level: 3, name: /for leagues, clubs, and associations/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/multiple teams and divisions in one organization/i)).toBeInTheDocument();
    expect(screen.getByText(/cross-team and cross-division scheduling/i)).toBeInTheDocument();

    // ...and never as a separate, sellable tier.
    expect(screen.queryByRole('heading', { level: 2, name: /league & club/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /talk to us about your league or club/i })
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/funds the free/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/let's talk/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/pricing set with design-partner clubs/i)).not.toBeInTheDocument();
  });

  it('states commitments and a sustainability FAQ that claims no revenue model', () => {
    renderWithTheme(<PricingPage />);

    // Comparison table and the future-bill FAQ are gone.
    expect(screen.queryByText(/value compared with paid alternatives/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/will pricing change later/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/sponsored placements/i)).not.toBeInTheDocument();

    // Commitments block replaces the comparison.
    expect(screen.getByRole('heading', { level: 3, name: /our commitments/i })).toBeInTheDocument();
    expect(screen.getByText(/no per-team paywall, ever/i)).toBeInTheDocument();
    expect(screen.getByText(/no third-party ads/i)).toBeInTheDocument();

    // The FAQ explains sustainability via open source, not a revenue model.
    expect(screen.getByRole('heading', { level: 2, name: /pricing faq/i })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: /how is openleague sustained/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/an open-source project, not a business/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { level: 3, name: /how does openleague make money/i })
    ).not.toBeInTheDocument();
  });

  it('sets indexable SEO metadata with canonical pricing URL', () => {
    expect(metadata.title).toBe('Pricing - OpenLeague');
    expect(metadata.description).toMatch(/no paid tiers/i);
    expect(metadata.description).not.toMatch(/fund the free team plan/i);
    expect(metadata.alternates?.canonical).toBe('https://openl.app/pricing');
    expect(metadata.robots).toHaveProperty('index', true);
  });
});

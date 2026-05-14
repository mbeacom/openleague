import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import theme from '@/lib/theme';
import PricingPage, { metadata } from '@/app/(marketing)/pricing/page';

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

describe('PricingPage', () => {
  it('communicates current free pricing and no-credit-card onboarding', () => {
    renderWithTheme(<PricingPage />);

    expect(screen.getByRole('heading', { level: 1, name: /simple pricing for busy teams/i })).toBeInTheDocument();
    expect(screen.getByText('$0')).toBeInTheDocument();
    expect(screen.getAllByText(/no credit card/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /start free today/i })).toHaveAttribute('href', '/signup');
  });

  it('includes value comparison and pricing FAQ content', () => {
    renderWithTheme(<PricingPage />);

    expect(screen.getByRole('heading', { level: 2, name: /value compared with paid alternatives/i })).toBeInTheDocument();
    expect(screen.getByText('Open-source codebase')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /pricing faq/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: /will pricing change later/i })).toBeInTheDocument();
  });

  it('sets indexable SEO metadata with canonical pricing URL', () => {
    expect(metadata.title).toBe('Pricing - OpenLeague');
    expect(metadata.description).toMatch(/free for teams/i);
    expect(metadata.alternates?.canonical).toBe('https://openl.app/pricing');
    expect(metadata.robots).toHaveProperty('index', true);
  });
});

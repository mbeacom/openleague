import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import theme from '@/lib/theme';
import LayoutProvider from '@/components/providers/LayoutProvider';

const mocks = vi.hoisted(() => ({
  pathname: vi.fn(),
  useSession: vi.fn(),
}));

vi.mock('next-auth/react', () => ({
  useSession: mocks.useSession,
}));

vi.mock('next/navigation', () => ({
  usePathname: mocks.pathname,
}));

vi.mock('@/components/features/navigation/MarketingHeader', () => ({
  default: () => <header>Marketing header</header>,
}));

vi.mock('@/components/features/navigation/MarketingFooter', () => ({
  default: () => <footer>Marketing footer</footer>,
}));

function renderWithProviders(children: ReactNode) {
  return render(
    <ThemeProvider theme={theme}>
      <LayoutProvider>{children}</LayoutProvider>
    </ThemeProvider>
  );
}

describe('LayoutProvider marketing chrome routing', () => {
  beforeEach(() => {
    mocks.pathname.mockReset();
    mocks.useSession.mockReset();
    mocks.useSession.mockReturnValue({ data: null, status: 'unauthenticated' });
  });

  it('wraps the root landing page with accessible marketing chrome', () => {
    mocks.pathname.mockReturnValue('/');

    renderWithProviders(<div>Landing content</div>);

    expect(screen.getByRole('link', { name: /skip to main content/i })).toHaveAttribute('href', '#main-content');
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('does not duplicate chrome for marketing route-group pages such as pricing', () => {
    mocks.pathname.mockReturnValue('/pricing');

    renderWithProviders(<main>Pricing content</main>);

  expect(screen.getByText('Pricing content').closest('main')).toBeInTheDocument();
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /skip to main content/i })).not.toBeInTheDocument();
  });
});
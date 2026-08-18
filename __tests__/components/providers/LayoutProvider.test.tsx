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

  // The landing page and the auth pages bake light backgrounds into their
  // sections and cards, so the chrome around them has to be pinned light too —
  // otherwise a dark-mode visitor gets a dark header and footer bracketing a
  // light page. /docs is genuinely scheme-aware and must keep following the
  // visitor's theme.
  describe('light-scheme pinning', () => {
    const pinned = (container: HTMLElement) =>
      container.querySelector('[data-mui-color-scheme="light"]');

    it.each(['/', '/login', '/signup'])('pins the light scheme for %s', (path) => {
      mocks.pathname.mockReturnValue(path);

      const { container } = renderWithProviders(<div>content</div>);

      expect(pinned(container)).not.toBeNull();
    });

    it('leaves /docs following the visitor theme', () => {
      mocks.pathname.mockReturnValue('/docs');

      const { container } = renderWithProviders(<div>Docs content</div>);

      expect(screen.getByRole('banner')).toBeInTheDocument();
      expect(pinned(container)).toBeNull();
    });
  });

  // All six routes in app/(auth) get the same light pin from its layout, so
  // they must get the same chrome here too. /forgot-password and the three
  // token routes previously matched no branch at all and rendered with no skip
  // link and no #main-content landmark.
  describe('auth chrome is uniform across the route group', () => {
    it.each([
      '/login',
      '/signup',
      '/forgot-password',
      '/reset-password/tok123',
      '/verify-email/tok123',
      '/confirm-email-change/tok123',
    ])('gives %s a skip link and a main landmark', (path) => {
      mocks.pathname.mockReturnValue(path);

      renderWithProviders(<div>Auth content</div>);

      expect(screen.getByRole('link', { name: /skip to main content/i })).toHaveAttribute(
        'href',
        '#main-content'
      );
      expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
      expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    });

    // The prefix match this replaced also caught the public /signups pages,
    // which bring their own chrome from app/(marketing)/layout.tsx.
    it.each(['/signups', '/signups/evt_1', '/signup-events'])(
      'does not add a second copy of the chrome to %s',
      (path) => {
        mocks.pathname.mockReturnValue(path);

        renderWithProviders(<main>Signups content</main>);

        expect(screen.queryByRole('banner')).not.toBeInTheDocument();
        expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
      }
    );
  });
});
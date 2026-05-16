import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import theme from '@/lib/theme';
import HomePage from '@/app/page';
import { marketingEvents } from '@/lib/analytics/tracking';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  useSession: vi.fn(),
}));

vi.mock('next-auth/react', () => ({
  useSession: mocks.useSession,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.push,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    width,
    height,
    fill,
    priority,
    ...props
  }: {
    src: string;
    alt: string;
    width?: number;
    height?: number;
    fill?: boolean;
    priority?: boolean;
    [key: string]: unknown;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      data-fill={fill ? 'true' : undefined}
      data-priority={priority ? 'true' : undefined}
      {...props}
    />
  ),
}));

vi.mock('@/lib/analytics/tracking', () => ({
  trackConversion: vi.fn(),
  marketingEvents: {
    heroSectionView: vi.fn(),
    pageScroll: vi.fn(),
  },
}));

const renderWithTheme = (component: React.ReactElement) =>
  render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);

describe('HomePage landing integration', () => {
  beforeEach(() => {
    mocks.push.mockClear();
    mocks.useSession.mockReset();
    vi.mocked(marketingEvents.heroSectionView).mockClear();
    mocks.useSession.mockReturnValue({ data: null, status: 'unauthenticated' });
  });

  it('renders the complete unauthenticated landing funnel with named regions and CTAs', async () => {
    renderWithTheme(<HomePage />);

    expect(
      screen.getByRole('heading', { level: 1, name: /simplify your season.*play more/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /simplify your season.*play more/i })).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: /trade team-management chaos for one clear playbook/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: /see the season run from one playbook/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /get started in 3 simple steps/i })).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: /trusted by the people who keep teams moving/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /ready to win back your time/i })).toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'Get Started Free' })).toHaveAttribute('href', '/signup');
    expect(screen.getByRole('link', { name: 'Explore Features' })).toHaveAttribute('href', '/features');
    expect(screen.getByRole('link', { name: 'Start Free Today' })).toHaveAttribute('href', '/signup');
    expect(screen.getByRole('link', { name: 'See Features' })).toHaveAttribute('href', '/features');
    expect(screen.getByRole('link', { name: /view openleague on github/i })).toHaveAttribute(
      'href',
      'https://github.com/mbeacom/openleague'
    );

    await waitFor(() => expect(marketingEvents.heroSectionView).toHaveBeenCalledTimes(1));
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('shows an accessible loading state while auth status is resolving', () => {
    mocks.useSession.mockReturnValue({ data: null, status: 'loading' });

    renderWithTheme(<HomePage />);

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('redirects authenticated visitors away from the marketing funnel', async () => {
    mocks.useSession.mockReturnValue({
      data: { user: { id: 'user-1', name: 'Coach Example' } },
      status: 'authenticated',
    });

    const { container } = renderWithTheme(<HomePage />);

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/dashboard'));
    expect(container).toBeEmptyDOMElement();
  });
});

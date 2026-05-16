import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import theme from '@/lib/theme';
import LayoutProvider from '@/components/providers/LayoutProvider';
import HomePage from '@/app/page';
import { marketingEvents, trackConversion } from '@/lib/analytics/tracking';

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
    headerSignInClick: vi.fn(),
    heroSectionView: vi.fn(),
    pageScroll: vi.fn(),
  },
}));

const renderLandingJourney = () => render(
  <ThemeProvider theme={theme}>
    <LayoutProvider>
      <HomePage />
    </LayoutProvider>
  </ThemeProvider>
);

describe('Landing page user journey', () => {
  beforeEach(() => {
    mocks.push.mockClear();
    mocks.useSession.mockReset();
    vi.mocked(trackConversion).mockClear();
    vi.mocked(marketingEvents.headerSignInClick).mockClear();
    vi.mocked(marketingEvents.heroSectionView).mockClear();
    mocks.useSession.mockReturnValue({ data: null, status: 'unauthenticated' });
  });

  it('renders accessible marketing chrome around the full landing funnel', async () => {
    renderLandingJourney();

    expect(screen.getByRole('link', { name: /skip to main content/i })).toHaveAttribute(
      'href',
      '#main-content'
    );
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /primary marketing navigation/i })).toBeInTheDocument();

    expect(
      screen.getByRole('heading', { level: 1, name: /simplify your season.*play more/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /ready to win back your time/i })).toBeInTheDocument();

    await waitFor(() => expect(marketingEvents.heroSectionView).toHaveBeenCalledTimes(1));
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('tracks the primary conversion path from header and hero CTAs', () => {
    renderLandingJourney();

    fireEvent.click(screen.getByRole('link', { name: 'Sign In' }));
    expect(marketingEvents.headerSignInClick).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getAllByRole('link', { name: 'Get Started Free' })[0]);
    expect(trackConversion).toHaveBeenCalledWith('header_sign_up_click', 'header');

    fireEvent.click(screen.getByRole('link', { name: 'Explore Features' }));
    expect(trackConversion).toHaveBeenCalledWith('hero_see_features_click', 'hero_section');
  });
});
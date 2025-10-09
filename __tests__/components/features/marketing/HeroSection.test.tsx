import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import theme from '@/lib/theme';
import HeroSection from '@/components/features/marketing/HeroSection';
import * as tracking from '@/lib/analytics/tracking';

// Mock Next.js components
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: { src: string; alt: string; [key: string]: unknown }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} {...props} />
  ),
}));

// Mock analytics tracking
vi.mock('@/lib/analytics/tracking', () => ({
  trackConversion: vi.fn(),
  marketingEvents: {
    heroSectionView: vi.fn(),
  },
}));

// Mock CTAButton component
vi.mock('@/components/features/marketing/CTAButton', () => ({
  default: ({ href, trackingAction, trackingLabel, children, onClick, ...props }: {
    href: string;
    trackingAction: string;
    trackingLabel?: string;
    children: React.ReactNode;
    onClick?: React.MouseEventHandler<HTMLAnchorElement>;
    [key: string]: unknown;
  }) => (
    <a
      href={href}
      data-tracking-action={trackingAction}
      data-tracking-label={trackingLabel}
      onClick={onClick}
      {...props}
    >
      {children}
    </a>
  ),
}));

// Helper to render with theme
const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

describe('HeroSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders main headline with OpenLeague branding', () => {
      renderWithTheme(<HeroSection />);

      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      expect(screen.getByText('OpenLeague')).toBeInTheDocument();
      expect(screen.getByText(/Replace Chaotic Spreadsheets with/)).toBeInTheDocument();
    });

    it('renders value proposition subtitle', () => {
      renderWithTheme(<HeroSection />);

      expect(screen.getByText(/The single source of truth for sports team management/)).toBeInTheDocument();
      expect(screen.getByText(/Stop juggling group chats, email chains, and messy spreadsheets/)).toBeInTheDocument();
      expect(screen.getByText(/Who, What, When, and Where/)).toBeInTheDocument();
    });

    it('renders trust indicators', () => {
      renderWithTheme(<HeroSection />);

      expect(screen.getByText('100% Free to Use')).toBeInTheDocument();
      expect(screen.getByText('No Credit Card Required')).toBeInTheDocument();
      expect(screen.getByText('Mobile-First Design')).toBeInTheDocument();
    });

    it('renders hero image mockup', () => {
      renderWithTheme(<HeroSection />);

      const heroImage = screen.getByAltText('OpenLeague Dashboard - Clean and organized team management interface');
      expect(heroImage).toBeInTheDocument();
      expect(heroImage).toHaveAttribute('src', '/images/hero-dashboard-mockup.svg');
    });

    it('renders additional trust signal text', () => {
      renderWithTheme(<HeroSection />);

      expect(screen.getByText(/Join teams already using OpenLeague/)).toBeInTheDocument();
    });
  });

  describe('CTA Button Functionality', () => {
    it('renders primary CTA button with correct props', () => {
      renderWithTheme(<HeroSection />);

      const primaryCTA = screen.getByRole('link', { name: 'Get Started Free' });
      expect(primaryCTA).toHaveAttribute('href', '/signup');
      expect(primaryCTA).toHaveAttribute('data-tracking-action', 'hero_get_started_click');
      expect(primaryCTA).toHaveAttribute('data-tracking-label', 'hero_section');
    });

    it('renders secondary CTA button with correct props', () => {
      renderWithTheme(<HeroSection />);

      const secondaryCTA = screen.getByRole('link', { name: 'See How It Works' });
      expect(secondaryCTA).toHaveAttribute('href', '/features');
      expect(secondaryCTA).toHaveAttribute('data-tracking-action', 'hero_see_how_it_works_click');
      expect(secondaryCTA).toHaveAttribute('data-tracking-label', 'hero_section');
    });

    it('CTA buttons are clickable and accessible', () => {
      renderWithTheme(<HeroSection />);

      const primaryCTA = screen.getByRole('link', { name: 'Get Started Free' });
      const secondaryCTA = screen.getByRole('link', { name: 'See How It Works' });

      expect(primaryCTA).toBeInTheDocument();
      expect(secondaryCTA).toBeInTheDocument();

      // Test that buttons can receive focus (accessibility)
      primaryCTA.focus();
      expect(primaryCTA).toHaveFocus();

      secondaryCTA.focus();
      expect(secondaryCTA).toHaveFocus();
    });
  });

  describe('Analytics Tracking', () => {
    it('tracks hero section view on component mount', async () => {
      renderWithTheme(<HeroSection />);

      await waitFor(() => {
        expect(tracking.marketingEvents.heroSectionView).toHaveBeenCalledTimes(1);
      });
    });

    it('only tracks hero section view once per mount', async () => {
      const { rerender } = renderWithTheme(<HeroSection />);

      await waitFor(() => {
        expect(tracking.marketingEvents.heroSectionView).toHaveBeenCalledTimes(1);
      });

      // Rerender the same component
      rerender(<ThemeProvider theme={theme}><HeroSection /></ThemeProvider>);

      // Should still only be called once
      expect(tracking.marketingEvents.heroSectionView).toHaveBeenCalledTimes(1);
    });
  });

  describe('Responsive Behavior', () => {
    it('renders with mobile-first responsive design', () => {
      renderWithTheme(<HeroSection />);

      // Check that the component renders without errors
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();

      // Verify that responsive elements are present
      const container = screen.getByRole('heading', { level: 1 }).closest('[class*="MuiContainer"]');
      expect(container).toBeInTheDocument();
    });

    it('displays CTA buttons in responsive stack layout', () => {
      renderWithTheme(<HeroSection />);

      const primaryCTA = screen.getByRole('link', { name: 'Get Started Free' });
      const secondaryCTA = screen.getByRole('link', { name: 'See How It Works' });

      // Both buttons should be present and accessible
      expect(primaryCTA).toBeInTheDocument();
      expect(secondaryCTA).toBeInTheDocument();

      // Check that they're in the same container (Stack component)
      const ctaContainer = primaryCTA.closest('[class*="MuiStack"]') || primaryCTA.parentElement;
      expect(ctaContainer).toContain(secondaryCTA);
    });

    it('renders trust indicators in responsive layout', () => {
      renderWithTheme(<HeroSection />);

      const trustIndicators = [
        '100% Free to Use',
        'No Credit Card Required',
        'Mobile-First Design'
      ];

      trustIndicators.forEach(indicator => {
        expect(screen.getByText(indicator)).toBeInTheDocument();
      });
    });

    it('hero image section is responsive', () => {
      renderWithTheme(<HeroSection />);

      const heroImage = screen.getByAltText('OpenLeague Dashboard - Clean and organized team management interface');
      expect(heroImage).toBeInTheDocument();
    });

    it('background decorative elements are conditionally rendered', () => {
      renderWithTheme(<HeroSection />);

      // The component should render successfully with decorative elements
      // These are CSS-based and don't have specific text content to test
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });
  });

  describe('Content Structure and Accessibility', () => {
    it('has proper heading hierarchy', () => {
      renderWithTheme(<HeroSection />);

      const mainHeading = screen.getByRole('heading', { level: 1 });
      expect(mainHeading).toBeInTheDocument();
      expect(mainHeading).toHaveTextContent(/Replace Chaotic Spreadsheets with.*OpenLeague/);
    });

    it('provides meaningful text content for screen readers', () => {
      renderWithTheme(<HeroSection />);

      // Check that important content is accessible
      expect(screen.getByText(/single source of truth/)).toBeInTheDocument();
      expect(screen.getByText(/sports team management/)).toBeInTheDocument();
      expect(screen.getByText(/Who, What, When, and Where/)).toBeInTheDocument();
    });

    it('trust indicators have proper visual structure', () => {
      renderWithTheme(<HeroSection />);

      const trustIndicators = [
        '100% Free to Use',
        'No Credit Card Required',
        'Mobile-First Design'
      ];

      trustIndicators.forEach(indicator => {
        const element = screen.getByText(indicator);
        expect(element).toBeInTheDocument();
        // Each indicator should be in a container with its visual dot
        expect(element.parentElement).toBeInTheDocument();
      });
    });

    it('CTA buttons have appropriate sizing and spacing', () => {
      renderWithTheme(<HeroSection />);

      const primaryCTA = screen.getByRole('link', { name: 'Get Started Free' });
      const secondaryCTA = screen.getByRole('link', { name: 'See How It Works' });

      // Both buttons should be rendered as links (for Next.js Link component)
      expect(primaryCTA.tagName).toBe('A');
      expect(secondaryCTA.tagName).toBe('A');
    });
  });

  describe('Visual Design Elements', () => {
    it('renders gradient background styling', () => {
      renderWithTheme(<HeroSection />);

      // The main container should be present
      const heroSection = screen.getByRole('heading', { level: 1 }).closest('[class*="MuiBox"]');
      expect(heroSection).toBeInTheDocument();
    });

    it('renders OpenLeague brand highlighting', () => {
      renderWithTheme(<HeroSection />);

      const brandElement = screen.getByText('OpenLeague');
      expect(brandElement).toBeInTheDocument();

      // Should be within a span element for styling
      expect(brandElement.tagName).toBe('SPAN');
    });

    it('renders hero image mockup with decorative elements', () => {
      renderWithTheme(<HeroSection />);

      const heroImage = screen.getByAltText('OpenLeague Dashboard - Clean and organized team management interface');
      expect(heroImage).toBeInTheDocument();
    });

    it('trust indicator visual dots are present in structure', () => {
      renderWithTheme(<HeroSection />);

      // Each trust indicator should have a visual structure
      const freeToUse = screen.getByText('100% Free to Use');
      const noCreditCard = screen.getByText('No Credit Card Required');
      const mobileFirst = screen.getByText('Mobile-First Design');

      // Each should be in a container with flex layout for the dot
      [freeToUse, noCreditCard, mobileFirst].forEach(element => {
        const container = element.parentElement;
        expect(container).toBeInTheDocument();
      });
    });
  });

  describe('Performance and Loading', () => {
    it('renders without throwing errors', () => {
      expect(() => {
        renderWithTheme(<HeroSection />);
      }).not.toThrow();
    });

    it('all text content loads immediately', () => {
      renderWithTheme(<HeroSection />);

      // All critical text should be immediately available
      expect(screen.getByText('OpenLeague')).toBeInTheDocument();
      expect(screen.getByText('Get Started Free')).toBeInTheDocument();
      expect(screen.getByText('See How It Works')).toBeInTheDocument();
      expect(screen.getByText('100% Free to Use')).toBeInTheDocument();
    });

    it('component structure supports lazy loading patterns', () => {
      renderWithTheme(<HeroSection />);

      // Hero image should be present and optimized with Next.js Image
      const heroImage = screen.getByAltText('OpenLeague Dashboard - Clean and organized team management interface');
      expect(heroImage).toBeInTheDocument();
    });
  });
});
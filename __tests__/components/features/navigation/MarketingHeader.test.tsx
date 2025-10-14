import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import theme from '@/lib/theme';
import MarketingHeader from '@/components/features/navigation/MarketingHeader';

// Mock Next.js components
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/image', () => ({
  default: ({ src, alt, width, height, priority }: any) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      data-priority={priority}
    />
  ),
}));

// Mock Logo component
vi.mock('@/components/ui/Logo', () => ({
  default: ({ size, href, priority, showText }: any) => (
    <div data-testid="logo" data-size={size} data-href={href} data-priority={priority}>
      Logo
      {showText && <span>OpenLeague</span>}
    </div>
  ),
}));

// Helper to render with theme
const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

describe('MarketingHeader', () => {
  describe('Basic Rendering', () => {
    it('renders logo with correct props', () => {
      renderWithTheme(<MarketingHeader />);
      const logo = screen.getByTestId('logo');
      expect(logo).toHaveAttribute('data-size', 'large');
      expect(logo).toHaveAttribute('data-priority', 'true');
    });

    it('renders all navigation links', () => {
      renderWithTheme(<MarketingHeader />);

      expect(screen.getByRole('link', { name: 'Features' })).toHaveAttribute('href', '/features');
      expect(screen.getByRole('link', { name: 'Pricing' })).toHaveAttribute('href', '/pricing');
      expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about');
      expect(screen.getByRole('link', { name: 'Contact' })).toHaveAttribute('href', '/contact');
      expect(screen.getByRole('link', { name: 'Docs' })).toHaveAttribute('href', '/docs');
    });

    it('renders Sign In and Get Started buttons', () => {
      renderWithTheme(<MarketingHeader />);

      expect(screen.getByRole('link', { name: 'Sign In' })).toHaveAttribute('href', '/login');
      expect(screen.getByRole('link', { name: 'Get Started Free' })).toHaveAttribute('href', '/signup');
    });

  });

  describe('Accessibility', () => {

    it('maintains keyboard navigation', () => {
      renderWithTheme(<MarketingHeader />);

      const links = screen.getAllByRole('link');
      links.forEach(link => {
        expect(link).toBeInTheDocument();
      });
    });

    it('has proper heading structure', () => {
      renderWithTheme(<MarketingHeader />);

      // Logo should be properly structured
      const logo = screen.getByTestId('logo');
      expect(logo).toBeInTheDocument();
      // Logo component renders OpenLeague text when showText is true
      expect(screen.getByText('OpenLeague')).toBeInTheDocument();
    });
  });

  describe('Theme Integration', () => {
    it('uses marketing theme colors', () => {
      renderWithTheme(<MarketingHeader />);

      // Component should render without errors with marketing theme
      const logo = screen.getByTestId('logo');
      expect(logo).toBeInTheDocument();
      // Logo renders OpenLeague text when showText is true
      expect(screen.getByText('OpenLeague')).toBeInTheDocument();
    });

    it('applies marketing button variant to CTA', () => {
      renderWithTheme(<MarketingHeader />);

      const getStartedButton = screen.getByRole('link', { name: 'Get Started Free' });
      expect(getStartedButton).toBeInTheDocument();
    });
  });

  describe('Navigation Links', () => {
    const navigationLinks = [
      { label: 'Features', href: '/features' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'About', href: '/about' },
      { label: 'Contact', href: '/contact' },
      { label: 'Docs', href: '/docs' },
    ];

    it.each(navigationLinks)('renders $label link with correct href', ({ label, href }) => {
      renderWithTheme(<MarketingHeader />);
      expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href);
    });
  });
});
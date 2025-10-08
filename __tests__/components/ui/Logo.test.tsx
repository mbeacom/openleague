import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import Logo from '@/components/ui/Logo';

interface MockImageProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  priority?: boolean;
}

interface MockLinkProps {
  href: string;
  children: React.ReactNode;
  [key: string]: unknown;
}

// Mock Next.js Image component
vi.mock('next/image', () => ({
  default: ({ src, alt, width, height, priority }: MockImageProps) => (
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

// Mock Next.js Link component
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: MockLinkProps) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const theme = createTheme();

// Helper to render with theme
const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

describe('Logo Component', () => {
  describe('Rendering', () => {
    it('renders logo image with correct alt text', () => {
      renderWithTheme(<Logo />);
      const logo = screen.getByAltText('OpenLeague Logo');
      expect(logo).toBeInTheDocument();
    });

    it('renders with correct image source', () => {
      renderWithTheme(<Logo />);
      const logo = screen.getByAltText('OpenLeague Logo');
      expect(logo).toHaveAttribute('src', '/images/logo.webp');
    });
  });

  describe('Size Variants', () => {
    it('renders small size (32px)', () => {
      renderWithTheme(<Logo size="small" />);
      const logo = screen.getByAltText('OpenLeague Logo');
      expect(logo).toHaveAttribute('width', '32');
      expect(logo).toHaveAttribute('height', '32');
    });

    it('renders medium size (44px)', () => {
      renderWithTheme(<Logo size="medium" />);
      const logo = screen.getByAltText('OpenLeague Logo');
      expect(logo).toHaveAttribute('width', '44');
      expect(logo).toHaveAttribute('height', '44');
    });

    it('renders large size (56px) by default', () => {
      renderWithTheme(<Logo />);
      const logo = screen.getByAltText('OpenLeague Logo');
      expect(logo).toHaveAttribute('width', '56');
      expect(logo).toHaveAttribute('height', '56');
    });

    it('renders xlarge size (64px)', () => {
      renderWithTheme(<Logo size="xlarge" />);
      const logo = screen.getByAltText('OpenLeague Logo');
      expect(logo).toHaveAttribute('width', '64');
      expect(logo).toHaveAttribute('height', '64');
    });

    it('accepts custom width and height', () => {
      renderWithTheme(<Logo width={100} height={80} />);
      const logo = screen.getByAltText('OpenLeague Logo');
      expect(logo).toHaveAttribute('width', '100');
      expect(logo).toHaveAttribute('height', '80');
    });

    it('custom dimensions override size preset', () => {
      renderWithTheme(<Logo size="small" width={100} />);
      const logo = screen.getByAltText('OpenLeague Logo');
      expect(logo).toHaveAttribute('width', '100');
    });
  });

  describe('Link Behavior', () => {
    it('renders as link with default href "/" for default variant', () => {
      renderWithTheme(<Logo />);
      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', '/');
    });

    it('accepts custom href', () => {
      renderWithTheme(<Logo href="/dashboard" />);
      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', '/dashboard');
    });

    it('does not render as link for footer variant', () => {
      renderWithTheme(<Logo variant="footer" />);
      const links = screen.queryAllByRole('link');
      expect(links).toHaveLength(0);
    });

    it('respects explicit href={null} to disable linking', () => {
      renderWithTheme(<Logo href={null} />);
      const links = screen.queryAllByRole('link');
      expect(links).toHaveLength(0);
    });
  });

  describe('Priority Loading', () => {
    it('does not use priority by default', () => {
      renderWithTheme(<Logo />);
      const logo = screen.getByAltText('OpenLeague Logo');
      expect(logo).toHaveAttribute('data-priority', 'false');
    });

    it('applies priority when specified', () => {
      renderWithTheme(<Logo priority />);
      const logo = screen.getByAltText('OpenLeague Logo');
      expect(logo).toHaveAttribute('data-priority', 'true');
    });
  });

  describe('Styling', () => {
    it('accepts custom className', () => {
      const { container } = renderWithTheme(<Logo className="custom-logo" />);
      expect(container.querySelector('.custom-logo')).toBeInTheDocument();
    });

    it('accepts custom sx props', () => {
      renderWithTheme(<Logo sx={{ marginTop: 2 }} />);
      // Note: Testing MUI sx props thoroughly requires theme provider
      // This is a basic check that the prop is accepted
      expect(screen.getByAltText('OpenLeague Logo')).toBeInTheDocument();
    });
  });

  describe('Variants', () => {
    it('default variant creates interactive link', () => {
      renderWithTheme(<Logo variant="default" />);
      const link = screen.getByRole('link');
      expect(link).toBeInTheDocument();
    });

    it('footer variant creates static logo without link', () => {
      renderWithTheme(<Logo variant="footer" />);
      const logo = screen.getByAltText('OpenLeague Logo');
      expect(logo).toBeInTheDocument();
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has descriptive alt text', () => {
      renderWithTheme(<Logo />);
      expect(screen.getByAltText('OpenLeague Logo')).toBeInTheDocument();
    });

    it('maintains alt text across all variants', () => {
      const { rerender } = renderWithTheme(<Logo variant="default" />);
      expect(screen.getByAltText('OpenLeague Logo')).toBeInTheDocument();

      rerender(<ThemeProvider theme={theme}><Logo variant="footer" /></ThemeProvider>);
      expect(screen.getByAltText('OpenLeague Logo')).toBeInTheDocument();
    });
  });

  describe('Common Use Cases', () => {
    it('renders correctly for navbar usage', () => {
      renderWithTheme(<Logo size="large" priority />);
      const logo = screen.getByAltText('OpenLeague Logo');
      const link = screen.getByRole('link');

      expect(logo).toHaveAttribute('width', '56');
      expect(logo).toHaveAttribute('data-priority', 'true');
      expect(link).toHaveAttribute('href', '/');
    });

    it('renders correctly for mobile navbar usage', () => {
      renderWithTheme(<Logo size="medium" priority />);
      const logo = screen.getByAltText('OpenLeague Logo');

      expect(logo).toHaveAttribute('width', '44');
      expect(logo).toHaveAttribute('data-priority', 'true');
    });

    it('renders correctly for footer usage', () => {
      renderWithTheme(<Logo size="small" variant="footer" />);
      const logo = screen.getByAltText('OpenLeague Logo');

      expect(logo).toHaveAttribute('width', '32');
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    it('renders correctly for dashboard usage', () => {
      renderWithTheme(<Logo size="large" href="/dashboard" priority />);
      const link = screen.getByRole('link');

      expect(link).toHaveAttribute('href', '/dashboard');
    });
  });
});

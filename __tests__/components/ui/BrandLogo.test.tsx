import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import theme from '@/lib/theme';
import BrandLogo from '@/components/ui/BrandLogo';

// Mock Next.js components
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/image', () => ({
  default: ({ src, alt, fill, priority, style }: { src: string; alt: string; fill?: boolean; priority?: boolean; style?: React.CSSProperties; [key: string]: unknown }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      data-fill={fill}
      data-priority={priority}
      style={style}
    />
  ),
}));

// Helper to render with theme
const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

describe('BrandLogo', () => {
  describe('Basic Rendering', () => {
    it('renders icon variant with correct image', () => {
      renderWithTheme(<BrandLogo variant="icon" />);
      const logo = screen.getByAltText('OpenLeague - Simplify Your Season');
      expect(logo).toBeInTheDocument();
      expect(logo).toHaveAttribute('src', '/images/logo.webp');
    });

    it('renders full variant with branded logo', () => {
      renderWithTheme(<BrandLogo variant="full" />);
      const logo = screen.getByAltText('OpenLeague - Simplify Your Season');
      expect(logo).toBeInTheDocument();
      expect(logo).toHaveAttribute('src', '/images/alt-logo-transparent-background.png');
    });

    it('renders compact variant with branded logo', () => {
      renderWithTheme(<BrandLogo variant="compact" />);
      const logo = screen.getByAltText('OpenLeague - Simplify Your Season');
      expect(logo).toBeInTheDocument();
      expect(logo).toHaveAttribute('src', '/images/alt-logo-transparent-background.png');
    });

    it('renders with default variant when not specified', () => {
      renderWithTheme(<BrandLogo />);
      const logo = screen.getByAltText('OpenLeague - Simplify Your Season');
      expect(logo).toBeInTheDocument();
    });
  });

  describe('Size Variants', () => {
    it('renders with small size', () => {
      renderWithTheme(<BrandLogo size="small" />);
      const logo = screen.getByAltText('OpenLeague - Simplify Your Season');
      expect(logo).toBeInTheDocument();
    });

    it('renders with medium size', () => {
      renderWithTheme(<BrandLogo size="medium" />);
      const logo = screen.getByAltText('OpenLeague - Simplify Your Season');
      expect(logo).toBeInTheDocument();
    });

    it('renders with large size (default)', () => {
      renderWithTheme(<BrandLogo size="large" />);
      const logo = screen.getByAltText('OpenLeague - Simplify Your Season');
      expect(logo).toBeInTheDocument();
    });

    it('renders with xlarge size', () => {
      renderWithTheme(<BrandLogo size="xlarge" />);
      const logo = screen.getByAltText('OpenLeague - Simplify Your Season');
      expect(logo).toBeInTheDocument();
    });

    it('respects custom width', () => {
      renderWithTheme(<BrandLogo width={100} />);
      const logo = screen.getByAltText('OpenLeague - Simplify Your Season');
      expect(logo).toBeInTheDocument();
    });

    it('respects custom height', () => {
      renderWithTheme(<BrandLogo height={100} />);
      const logo = screen.getByAltText('OpenLeague - Simplify Your Season');
      expect(logo).toBeInTheDocument();
    });

    it('respects both custom width and height', () => {
      renderWithTheme(<BrandLogo width={120} height={80} />);
      const logo = screen.getByAltText('OpenLeague - Simplify Your Season');
      expect(logo).toBeInTheDocument();
    });
  });

  describe('Link Behavior', () => {
    it('renders as link with default href', () => {
      renderWithTheme(<BrandLogo />);
      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', '/');
    });

    it('renders as link with custom href', () => {
      renderWithTheme(<BrandLogo href="/dashboard" />);
      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', '/dashboard');
    });

    it('renders without link when href is null', () => {
      renderWithTheme(<BrandLogo href={null} />);
      const links = screen.queryAllByRole('link');
      expect(links).toHaveLength(0);
    });
  });

  describe('Image Priority', () => {
    it('renders with priority when specified', () => {
      renderWithTheme(<BrandLogo priority />);
      const logo = screen.getByAltText('OpenLeague - Simplify Your Season');
      expect(logo).toHaveAttribute('data-priority', 'true');
    });

    it('renders without priority by default', () => {
      renderWithTheme(<BrandLogo />);
      const logo = screen.getByAltText('OpenLeague - Simplify Your Season');
      expect(logo).toHaveAttribute('data-priority', 'false');
    });
  });

  describe('Interactive Behavior', () => {
    it('applies interactive styles by default', () => {
      const { container } = renderWithTheme(<BrandLogo />);
      expect(container.querySelector('a')).toBeInTheDocument();
    });

    it('applies interactive styles when explicitly enabled', () => {
      const { container } = renderWithTheme(<BrandLogo interactive />);
      expect(container.querySelector('a')).toBeInTheDocument();
    });

    it('does not apply interactive styles when disabled', () => {
      renderWithTheme(<BrandLogo interactive={false} href={null} />);
      const links = screen.queryAllByRole('link');
      expect(links).toHaveLength(0);
    });
  });

  describe('Accessibility', () => {
    it('has proper alt text', () => {
      renderWithTheme(<BrandLogo />);
      const logo = screen.getByAltText('OpenLeague - Simplify Your Season');
      expect(logo).toBeInTheDocument();
    });

    it('link is keyboard accessible when present', () => {
      renderWithTheme(<BrandLogo />);
      const link = screen.getByRole('link');
      expect(link).toBeInTheDocument();
      
      // Link should be focusable
      link.focus();
      expect(link).toHaveFocus();
    });

    it('image has alt attribute', () => {
      renderWithTheme(<BrandLogo />);
      const logo = screen.getByAltText('OpenLeague - Simplify Your Season');
      expect(logo).toHaveAttribute('alt');
    });
  });

  describe('Icon vs Full Variants', () => {
    it('icon variant uses icon image path', () => {
      renderWithTheme(<BrandLogo variant="icon" />);
      const logo = screen.getByAltText('OpenLeague - Simplify Your Season');
      expect(logo).toHaveAttribute('src', '/images/logo.webp');
    });

    it('full variant uses full branded logo path', () => {
      renderWithTheme(<BrandLogo variant="full" />);
      const logo = screen.getByAltText('OpenLeague - Simplify Your Season');
      expect(logo).toHaveAttribute('src', '/images/alt-logo-transparent-background.png');
    });

    it('compact variant uses full branded logo path', () => {
      renderWithTheme(<BrandLogo variant="compact" />);
      const logo = screen.getByAltText('OpenLeague - Simplify Your Season');
      expect(logo).toHaveAttribute('src', '/images/alt-logo-transparent-background.png');
    });
  });

  describe('Custom Styling', () => {
    it('accepts custom className', () => {
      const { container } = renderWithTheme(<BrandLogo className="custom-class" />);
      expect(container.querySelector('.custom-class')).toBeInTheDocument();
    });

    it('accepts custom sx props', () => {
      renderWithTheme(<BrandLogo sx={{ margin: 2 }} />);
      // Component should render successfully with sx props
      const logo = screen.getByAltText('OpenLeague - Simplify Your Season');
      expect(logo).toBeInTheDocument();
    });
  });

  describe('Different Size and Variant Combinations', () => {
    const variants = ['icon', 'full', 'compact'] as const;
    const sizes = ['small', 'medium', 'large', 'xlarge'] as const;

    variants.forEach((variant) => {
      sizes.forEach((size) => {
        it(`renders ${variant} variant with ${size} size`, () => {
          renderWithTheme(<BrandLogo variant={variant} size={size} />);
          const logo = screen.getByAltText('OpenLeague - Simplify Your Season');
          expect(logo).toBeInTheDocument();
        });
      });
    });
  });

  describe('Hero Section Use Case', () => {
    it('renders correctly for hero section with full branding', () => {
      renderWithTheme(
        <BrandLogo 
          variant="full" 
          size="xlarge" 
          priority 
          interactive
        />
      );
      
      const logo = screen.getByAltText('OpenLeague - Simplify Your Season');
      expect(logo).toBeInTheDocument();
      expect(logo).toHaveAttribute('src', '/images/alt-logo-transparent-background.png');
      expect(logo).toHaveAttribute('data-priority', 'true');
      
      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', '/');
    });
  });

  describe('Navbar Use Case', () => {
    it('renders correctly for navbar with icon logo', () => {
      renderWithTheme(
        <BrandLogo 
          variant="icon" 
          size="large" 
          href="/dashboard"
        />
      );
      
      const logo = screen.getByAltText('OpenLeague - Simplify Your Season');
      expect(logo).toBeInTheDocument();
      expect(logo).toHaveAttribute('src', '/images/logo.webp');
      
      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', '/dashboard');
    });
  });

  describe('Static Display Use Case', () => {
    it('renders correctly without link for static display', () => {
      renderWithTheme(
        <BrandLogo 
          variant="full" 
          size="medium" 
          href={null}
          interactive={false}
        />
      );
      
      const logo = screen.getByAltText('OpenLeague - Simplify Your Season');
      expect(logo).toBeInTheDocument();
      
      const links = screen.queryAllByRole('link');
      expect(links).toHaveLength(0);
    });
  });

  describe('Edge Cases', () => {
    it('renders without errors when all props are provided', () => {
      expect(() => {
        renderWithTheme(
          <BrandLogo 
            variant="full"
            size="large"
            width={200}
            height={200}
            href="/custom"
            priority
            interactive
            sx={{ margin: 2 }}
            className="test-class"
          />
        );
      }).not.toThrow();
    });

    it('renders without errors when minimal props are provided', () => {
      expect(() => {
        renderWithTheme(<BrandLogo />);
      }).not.toThrow();
    });

    it('handles zero dimensions gracefully', () => {
      renderWithTheme(<BrandLogo width={0} height={0} />);
      const logo = screen.getByAltText('OpenLeague - Simplify Your Season');
      expect(logo).toBeInTheDocument();
    });

    it('handles negative dimensions gracefully', () => {
      renderWithTheme(<BrandLogo width={-50} height={-50} />);
      const logo = screen.getByAltText('OpenLeague - Simplify Your Season');
      expect(logo).toBeInTheDocument();
    });
  });
});

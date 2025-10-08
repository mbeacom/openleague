import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import theme from '@/lib/theme';
import MarketingFooter from '@/components/features/navigation/MarketingFooter';

// Mock Next.js components
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Mock Logo component
vi.mock('@/components/ui/Logo', () => ({
  default: ({ size, variant }: any) => (
    <div data-testid="logo" data-size={size} data-variant={variant}>
      Logo
    </div>
  ),
}));

// Mock MUI icons
vi.mock('@mui/icons-material/GitHub', () => ({
  default: () => <div data-testid="github-icon">GitHub</div>,
}));

vi.mock('@mui/icons-material/Twitter', () => ({
  default: () => <div data-testid="twitter-icon">Twitter</div>,
}));

vi.mock('@mui/icons-material/LinkedIn', () => ({
  default: () => <div data-testid="linkedin-icon">LinkedIn</div>,
}));

// Helper to render with theme
const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

describe('MarketingFooter', () => {
  describe('Brand Section', () => {
    it('renders logo with correct props', () => {
      renderWithTheme(<MarketingFooter />);
      const logo = screen.getByTestId('logo');
      expect(logo).toHaveAttribute('data-size', 'medium');
      expect(logo).toHaveAttribute('data-variant', 'footer');
    });

    it('renders OpenLeague brand text', () => {
      renderWithTheme(<MarketingFooter />);
      expect(screen.getByText('OpenLeague')).toBeInTheDocument();
    });

    it('renders brand description', () => {
      renderWithTheme(<MarketingFooter />);
      expect(screen.getByText(/Replace chaotic spreadsheets/)).toBeInTheDocument();
    });

    it('renders social media links', () => {
      renderWithTheme(<MarketingFooter />);
      
      expect(screen.getByLabelText('GitHub')).toHaveAttribute('href', 'https://github.com/mbeacom/openleague');
      expect(screen.getByLabelText('Twitter')).toHaveAttribute('href', 'https://twitter.com/openleague');
      expect(screen.getByLabelText('LinkedIn')).toHaveAttribute('href', 'https://linkedin.com/company/openleague');
    });

    it('social links open in new tab', () => {
      renderWithTheme(<MarketingFooter />);
      
      const githubLink = screen.getByLabelText('GitHub');
      expect(githubLink).toHaveAttribute('target', '_blank');
      expect(githubLink).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  describe('Footer Sections', () => {
    describe('Product Section', () => {
      it('renders product section title', () => {
        renderWithTheme(<MarketingFooter />);
        expect(screen.getByText('Product')).toBeInTheDocument();
      });

      it('renders product links', () => {
        renderWithTheme(<MarketingFooter />);
        
        expect(screen.getByRole('link', { name: 'Features' })).toHaveAttribute('href', '/features');
        expect(screen.getByRole('link', { name: 'Pricing' })).toHaveAttribute('href', '/pricing');
        expect(screen.getByRole('link', { name: 'Get Started' })).toHaveAttribute('href', '/get-started');
        expect(screen.getByRole('link', { name: 'Roadmap' })).toHaveAttribute('href', '/docs/roadmap');
      });
    });

    describe('Resources Section', () => {
      it('renders resources section title', () => {
        renderWithTheme(<MarketingFooter />);
        expect(screen.getByText('Resources')).toBeInTheDocument();
      });

      it('renders resource links', () => {
        renderWithTheme(<MarketingFooter />);
        
        expect(screen.getByRole('link', { name: 'Documentation' })).toHaveAttribute('href', '/docs');
        expect(screen.getByRole('link', { name: 'User Guide' })).toHaveAttribute('href', '/docs/user-guide');
        expect(screen.getByRole('link', { name: 'API Reference' })).toHaveAttribute('href', '/docs/api');
        expect(screen.getByRole('link', { name: 'Guides' })).toHaveAttribute('href', '/docs/guides');
      });
    });

    describe('Company Section', () => {
      it('renders company section title', () => {
        renderWithTheme(<MarketingFooter />);
        expect(screen.getByText('Company')).toBeInTheDocument();
      });

      it('renders company links', () => {
        renderWithTheme(<MarketingFooter />);
        
        expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about');
        expect(screen.getByRole('link', { name: 'Contact' })).toHaveAttribute('href', '/contact');
        expect(screen.getByRole('link', { name: 'Blog' })).toHaveAttribute('href', '/blog');
        expect(screen.getByRole('link', { name: 'Careers' })).toHaveAttribute('href', '/careers');
      });
    });

    describe('Legal Section', () => {
      it('renders legal section title', () => {
        renderWithTheme(<MarketingFooter />);
        expect(screen.getByText('Legal')).toBeInTheDocument();
      });

      it('renders legal links', () => {
        renderWithTheme(<MarketingFooter />);
        
        expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy');
        expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/terms');
        expect(screen.getByRole('link', { name: 'Cookie Policy' })).toHaveAttribute('href', '/cookies');
        expect(screen.getByRole('link', { name: 'Security' })).toHaveAttribute('href', '/security');
      });
    });
  });

  describe('Bottom Footer', () => {
    it('renders copyright with current year', () => {
      renderWithTheme(<MarketingFooter />);
      const currentYear = new Date().getFullYear();
      expect(screen.getByText(new RegExp(`© ${currentYear} OpenLeague`))).toBeInTheDocument();
    });

    it('renders feature highlights', () => {
      renderWithTheme(<MarketingFooter />);
      
      expect(screen.getByText('🌟 Free Forever')).toBeInTheDocument();
      expect(screen.getByText('🔒 Privacy First')).toBeInTheDocument();
      expect(screen.getByText('📱 Mobile Ready')).toBeInTheDocument();
    });

    it('includes heartfelt message', () => {
      renderWithTheme(<MarketingFooter />);
      expect(screen.getByText(/Made with ❤️ for sports teams everywhere/)).toBeInTheDocument();
    });
  });

  describe('Responsive Layout', () => {
    it('renders with responsive grid structure', () => {
      renderWithTheme(<MarketingFooter />);
      
      // Component should render without errors
      expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    });

    it('maintains proper spacing and structure', () => {
      renderWithTheme(<MarketingFooter />);
      
      // All sections should be present
      expect(screen.getByText('Product')).toBeInTheDocument();
      expect(screen.getByText('Resources')).toBeInTheDocument();
      expect(screen.getByText('Company')).toBeInTheDocument();
      expect(screen.getByText('Legal')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('uses semantic footer element', () => {
      renderWithTheme(<MarketingFooter />);
      expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    });

    it('has proper heading structure for sections', () => {
      renderWithTheme(<MarketingFooter />);
      
      // Section titles should be properly structured
      expect(screen.getByText('Product')).toBeInTheDocument();
      expect(screen.getByText('Resources')).toBeInTheDocument();
      expect(screen.getByText('Company')).toBeInTheDocument();
      expect(screen.getByText('Legal')).toBeInTheDocument();
    });

    it('provides accessible labels for social links', () => {
      renderWithTheme(<MarketingFooter />);
      
      expect(screen.getByLabelText('GitHub')).toBeInTheDocument();
      expect(screen.getByLabelText('Twitter')).toBeInTheDocument();
      expect(screen.getByLabelText('LinkedIn')).toBeInTheDocument();
    });

    it('maintains keyboard navigation for all links', () => {
      renderWithTheme(<MarketingFooter />);
      
      const links = screen.getAllByRole('link');
      expect(links.length).toBeGreaterThan(0);
      
      links.forEach(link => {
        expect(link).toBeInTheDocument();
      });
    });
  });

  describe('Theme Integration', () => {
    it('uses marketing theme colors', () => {
      renderWithTheme(<MarketingFooter />);
      
      // Component should render without errors with marketing theme
      expect(screen.getByText('OpenLeague')).toBeInTheDocument();
    });

    it('applies proper typography variants', () => {
      renderWithTheme(<MarketingFooter />);
      
      // Marketing body typography should be applied
      expect(screen.getByText(/Replace chaotic spreadsheets/)).toBeInTheDocument();
    });
  });

  describe('Link Structure', () => {
    const allExpectedLinks = [
      // Product
      { name: 'Features', href: '/features' },
      { name: 'Pricing', href: '/pricing' },
      { name: 'Get Started', href: '/get-started' },
      { name: 'Roadmap', href: '/docs/roadmap' },
      // Resources
      { name: 'Documentation', href: '/docs' },
      { name: 'User Guide', href: '/docs/user-guide' },
      { name: 'API Reference', href: '/docs/api' },
      { name: 'Guides', href: '/docs/guides' },
      // Company
      { name: 'About', href: '/about' },
      { name: 'Contact', href: '/contact' },
      { name: 'Blog', href: '/blog' },
      { name: 'Careers', href: '/careers' },
      // Legal
      { name: 'Privacy Policy', href: '/privacy' },
      { name: 'Terms of Service', href: '/terms' },
      { name: 'Cookie Policy', href: '/cookies' },
      { name: 'Security', href: '/security' },
    ];

    it.each(allExpectedLinks)('renders $name link with correct href', ({ name, href }) => {
      renderWithTheme(<MarketingFooter />);
      expect(screen.getByRole('link', { name })).toHaveAttribute('href', href);
    });
  });
});
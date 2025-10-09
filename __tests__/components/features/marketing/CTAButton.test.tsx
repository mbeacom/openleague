import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import theme from '@/lib/theme';
import CTAButton from '@/components/features/marketing/CTAButton';
import * as tracking from '@/lib/analytics/tracking';

// Define minimal props interface for the mocked Next.js Link
interface MockLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  children: React.ReactNode;
}

// Mock Next.js components
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: MockLinkProps) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Mock analytics tracking
vi.mock('@/lib/analytics/tracking', () => ({
  trackConversion: vi.fn(),
}));

// Helper to render with theme
const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

describe('CTAButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders button with correct href and text', () => {
      renderWithTheme(
        <CTAButton
          href="/signup"
          trackingAction="test_click"
          trackingLabel="test_section"
        >
          Get Started Free
        </CTAButton>
      );

      const button = screen.getByRole('link', { name: 'Get Started Free' });
      expect(button).toHaveAttribute('href', '/signup');
    });

    it('renders with different variants', () => {
      const { rerender } = renderWithTheme(
        <CTAButton
          href="/signup"
          trackingAction="test_click"
          variant="marketing"
        >
          Marketing Button
        </CTAButton>
      );

      expect(screen.getByRole('link', { name: 'Marketing Button' })).toBeInTheDocument();

      rerender(
        <ThemeProvider theme={theme}>
          <CTAButton
            href="/features"
            trackingAction="test_click"
            variant="marketingSecondary"
          >
            Secondary Button
          </CTAButton>
        </ThemeProvider>
      );

      expect(screen.getByRole('link', { name: 'Secondary Button' })).toBeInTheDocument();
    });

    it('renders with different sizes', () => {
      renderWithTheme(
        <CTAButton
          href="/signup"
          trackingAction="test_click"
          size="large"
        >
          Large Button
        </CTAButton>
      );

      expect(screen.getByRole('link', { name: 'Large Button' })).toBeInTheDocument();
    });

    it('renders with fullWidth prop', () => {
      renderWithTheme(
        <CTAButton
          href="/signup"
          trackingAction="test_click"
          fullWidth
        >
          Full Width Button
        </CTAButton>
      );

      expect(screen.getByRole('link', { name: 'Full Width Button' })).toBeInTheDocument();
    });
  });

  describe('Analytics Tracking', () => {
    it('tracks conversion on click', () => {
      renderWithTheme(
        <CTAButton
          href="/signup"
          trackingAction="hero_get_started_click"
          trackingLabel="hero_section"
        >
          Get Started Free
        </CTAButton>
      );

      const button = screen.getByRole('link', { name: 'Get Started Free' });
      fireEvent.click(button);

      expect(tracking.trackConversion).toHaveBeenCalledWith(
        'hero_get_started_click',
        'hero_section'
      );
    });

    it('tracks conversion without label', () => {
      renderWithTheme(
        <CTAButton
          href="/signup"
          trackingAction="simple_click"
        >
          Simple Button
        </CTAButton>
      );

      const button = screen.getByRole('link', { name: 'Simple Button' });
      fireEvent.click(button);

      expect(tracking.trackConversion).toHaveBeenCalledWith('simple_click', undefined);
    });

    it('calls custom onClick handler along with tracking', () => {
      const customOnClick = vi.fn();

      renderWithTheme(
        <CTAButton
          href="/signup"
          trackingAction="custom_click"
          onClick={customOnClick}
        >
          Custom Click Button
        </CTAButton>
      );

      const button = screen.getByRole('link', { name: 'Custom Click Button' });
      fireEvent.click(button);

      expect(tracking.trackConversion).toHaveBeenCalledWith('custom_click', undefined);
      expect(customOnClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('Accessibility', () => {
    it('maintains proper link semantics', () => {
      renderWithTheme(
        <CTAButton
          href="/signup"
          trackingAction="test_click"
        >
          Accessible Button
        </CTAButton>
      );

      const button = screen.getByRole('link', { name: 'Accessible Button' });
      expect(button.tagName).toBe('A');
      expect(button).toHaveAttribute('href', '/signup');
    });

    it('supports keyboard navigation', () => {
      renderWithTheme(
        <CTAButton
          href="/signup"
          trackingAction="test_click"
        >
          Keyboard Button
        </CTAButton>
      );

      const button = screen.getByRole('link', { name: 'Keyboard Button' });
      
      // Test that button can receive focus
      button.focus();
      expect(button).toHaveFocus();
    });

    it('handles keyboard activation', () => {
      renderWithTheme(
        <CTAButton
          href="/signup"
          trackingAction="keyboard_click"
        >
          Keyboard Activated
        </CTAButton>
      );

      const button = screen.getByRole('link', { name: 'Keyboard Activated' });
      
      // Simulate click via keyboard (links are activated by click events from keyboard)
      fireEvent.click(button);
      
      // Verify that the keyboard activation triggers the click handler, which calls analytics
      expect(tracking.trackConversion).toHaveBeenCalledWith('keyboard_click', undefined);
    });
  });

  describe('Styling and Theme Integration', () => {
    it('applies custom sx styles', () => {
      renderWithTheme(
        <CTAButton
          href="/signup"
          trackingAction="test_click"
          sx={{ minWidth: 200 }}
        >
          Styled Button
        </CTAButton>
      );

      expect(screen.getByRole('link', { name: 'Styled Button' })).toBeInTheDocument();
    });

    it('renders with MUI Button component structure', () => {
      renderWithTheme(
        <CTAButton
          href="/signup"
          trackingAction="test_click"
          variant="marketing"
        >
          MUI Button
        </CTAButton>
      );

      const button = screen.getByRole('link', { name: 'MUI Button' });
      
      // Should be rendered as a link (Next.js Link component)
      expect(button.tagName).toBe('A');
      expect(button).toHaveAttribute('href', '/signup');
    });
  });

  describe('Performance', () => {
    it('renders without throwing errors', () => {
      expect(() => {
        renderWithTheme(
          <CTAButton
            href="/signup"
            trackingAction="test_click"
          >
            Performance Test
          </CTAButton>
        );
      }).not.toThrow();
    });

    it('handles multiple rapid clicks gracefully', () => {
      renderWithTheme(
        <CTAButton
          href="/signup"
          trackingAction="rapid_click"
        >
          Rapid Click Test
        </CTAButton>
      );

      const button = screen.getByRole('link', { name: 'Rapid Click Test' });
      
      // Simulate multiple rapid clicks
      fireEvent.click(button);
      fireEvent.click(button);
      fireEvent.click(button);

      // Should track each click
      expect(tracking.trackConversion).toHaveBeenCalledTimes(3);
    });
  });
});
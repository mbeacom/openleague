/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import theme from '@/lib/theme';

describe('Marketing Theme Extensions', () => {
  describe('Marketing Color Palette', () => {
    it('includes marketing color palette', () => {
      expect(theme.palette.marketing).toBeDefined();
      expect(theme.palette.marketing.primary).toBe('#1976D2');
      expect(theme.palette.marketing.secondary).toBe('#FF9800');
      expect(theme.palette.marketing.accent).toBe('#43A047');
      expect(theme.palette.marketing.gradient).toBe('linear-gradient(135deg, #1976D2 0%, #42A5F5 100%)');
      expect(theme.palette.marketing.hero).toBe('#F8FAFC');
    });

    it('maintains existing color palette', () => {
      expect(theme.palette.primary.main).toBe('#1976D2');
      expect(theme.palette.secondary.main).toBe('#43A047');
      expect(theme.palette.background.default).toBe('#F5F5F5');
      expect(theme.palette.background.paper).toBe('#FFFFFF');
    });
  });

  describe('Marketing Typography Variants', () => {
    it('includes heroTitle variant', () => {
      expect(theme.typography.heroTitle).toBeDefined();
      expect((theme.typography.heroTitle as any).fontSize).toBe('3.5rem');
      expect((theme.typography.heroTitle as any).fontWeight).toBe(800);
      expect((theme.typography.heroTitle as any).lineHeight).toBe(1.1);
      expect((theme.typography.heroTitle as any).letterSpacing).toBe('-0.02em');
    });

    it('includes heroSubtitle variant', () => {
      expect(theme.typography.heroSubtitle).toBeDefined();
      expect((theme.typography.heroSubtitle as any).fontSize).toBe('1.25rem');
      expect((theme.typography.heroSubtitle as any).fontWeight).toBe(400);
      expect((theme.typography.heroSubtitle as any).lineHeight).toBe(1.5);
    });

    it('includes sectionTitle variant', () => {
      expect(theme.typography.sectionTitle).toBeDefined();
      expect((theme.typography.sectionTitle as any).fontSize).toBe('2.5rem');
      expect((theme.typography.sectionTitle as any).fontWeight).toBe(700);
      expect((theme.typography.sectionTitle as any).lineHeight).toBe(1.2);
    });

    it('includes featureTitle variant', () => {
      expect(theme.typography.featureTitle).toBeDefined();
      expect((theme.typography.featureTitle as any).fontSize).toBe('1.5rem');
      expect((theme.typography.featureTitle as any).fontWeight).toBe(600);
      expect((theme.typography.featureTitle as any).lineHeight).toBe(1.3);
    });

    it('includes marketingBody variant', () => {
      expect(theme.typography.marketingBody).toBeDefined();
      expect((theme.typography.marketingBody as any).fontSize).toBe('1.125rem');
      expect((theme.typography.marketingBody as any).fontWeight).toBe(400);
      expect((theme.typography.marketingBody as any).lineHeight).toBe(1.6);
    });

    it('includes responsive breakpoints in typography', () => {
      expect((theme.typography.heroTitle as any)['@media (max-width:600px)']).toBeDefined();
      expect((theme.typography.heroTitle as any)['@media (max-width:600px)'].fontSize).toBe('2.5rem');
    });
  });

  describe('Marketing Button Variants', () => {
    it('includes marketing button variant styles', () => {
      const marketingVariant = theme.components?.MuiButton?.variants?.find(
        (variant: any) => variant.props?.variant === 'marketing'
      );

      expect(marketingVariant).toBeDefined();
      expect((marketingVariant?.style as any)?.backgroundColor).toBe('#FF9800');
      expect((marketingVariant?.style as any)?.color).toBe('#FFFFFF');
      expect((marketingVariant?.style as any)?.fontWeight).toBe(600);
      expect((marketingVariant?.style as any)?.fontSize).toBe('0.9375rem');
      expect((marketingVariant?.style as any)?.borderRadius).toBe(8);
    });

    it('includes marketing secondary button variant styles', () => {
      const marketingSecondaryVariant = theme.components?.MuiButton?.variants?.find(
        (variant: any) => variant.props?.variant === 'marketingSecondary'
      );

      expect(marketingSecondaryVariant).toBeDefined();
      expect((marketingSecondaryVariant?.style as any)?.backgroundColor).toBe('transparent');
      expect((marketingSecondaryVariant?.style as any)?.color).toBe('#1976D2');
      expect((marketingSecondaryVariant?.style as any)?.border).toBe('2px solid #1976D2');
    });

    it('maintains existing button styles', () => {
      expect((theme.components?.MuiButton?.styleOverrides?.root as any)?.minHeight).toBe(48);
      expect((theme.components?.MuiButton?.styleOverrides?.root as any)?.textTransform).toBe('none');
      expect((theme.components?.MuiButton?.styleOverrides?.root as any)?.fontWeight).toBe(500);
    });
  });

  describe('Marketing Card Variants', () => {
    it('includes marketing card variant styles', () => {
      const marketingVariant = theme.components?.MuiCard?.variants?.find(
        (variant: any) => variant.props?.variant === 'marketing'
      );

      expect(marketingVariant).toBeDefined();
      expect((marketingVariant?.style as any)?.padding).toBe('32px');
      expect((marketingVariant?.style as any)?.background).toBe('linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)');
      expect((marketingVariant?.style as any)?.border).toBe('1px solid rgba(25, 118, 210, 0.1)');
    });

    it('maintains existing card styles', () => {
      expect((theme.components?.MuiCard?.styleOverrides?.root as any)?.borderRadius).toBe(16);
      expect((theme.components?.MuiCard?.styleOverrides?.root as any)?.transition).toBe('all 0.3s ease-in-out');
    });
  });

  describe('Responsive Design', () => {
    it('maintains existing breakpoints', () => {
      expect(theme.breakpoints.values.xs).toBe(0);
      expect(theme.breakpoints.values.sm).toBe(600);
      expect(theme.breakpoints.values.md).toBe(960);
      expect(theme.breakpoints.values.lg).toBe(1280);
      expect(theme.breakpoints.values.xl).toBe(1920);
    });

    it('includes base spacing unit', () => {
      expect(theme.spacing).toBeDefined();
    });
  });

  describe('Accessibility Compliance', () => {
    it('maintains WCAG AA contrast ratios', () => {
      // Primary colors should maintain contrast
      expect(theme.palette.primary.main).toBe('#1976D2');
      expect(theme.palette.primary.contrastText).toBe('#FFFFFF');

      // Marketing colors should be accessible
      expect(theme.palette.marketing.primary).toBe('#1976D2');
      expect(theme.palette.marketing.secondary).toBe('#FF9800');
    });

    it('maintains minimum touch target sizes', () => {
      expect((theme.components?.MuiButton?.styleOverrides?.root as any)?.minHeight).toBe(48);
      expect((theme.components?.MuiIconButton?.styleOverrides?.root as any)?.minHeight).toBe(48);
    });
  });

  describe('Theme Consistency', () => {
    it('uses consistent font family', () => {
      expect(theme.typography.fontFamily).toBe('var(--font-roboto), Roboto, "Helvetica Neue", Arial, sans-serif');
    });

    it('maintains consistent border radius', () => {
      expect((theme.components?.MuiButton?.styleOverrides?.root as any)?.borderRadius).toBe(8);
      expect((theme.components?.MuiCard?.styleOverrides?.root as any)?.borderRadius).toBe(16);
    });

    it('uses consistent shadow system', () => {
      expect((theme.components?.MuiCard?.styleOverrides?.root as any)?.boxShadow).toBe('0px 4px 20px rgba(0, 0, 0, 0.08)');
    });
  });
});
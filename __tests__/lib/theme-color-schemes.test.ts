import { describe, it, expect } from 'vitest';
import theme from '@/lib/theme';

describe('Theme Color Schemes (dark mode)', () => {
  describe('CSS variables setup', () => {
    it('enables CSS theme variables', () => {
      expect(theme.vars).toBeDefined();
      expect(theme.cssVarPrefix).toBe('mui');
    });

    it('uses the data-mui-color-scheme selector (matches InitColorSchemeScript default)', () => {
      expect(theme.colorSchemeSelector).toBe('data-mui-color-scheme');
      expect(theme.getColorSchemeSelector('dark')).toContain('data-mui-color-scheme="dark"');
    });

    it('defaults to the light scheme (theme.palette mirrors light)', () => {
      expect(theme.defaultColorScheme).toBe('light');
      expect(theme.palette.mode).toBe('light');
    });
  });

  describe('Light scheme', () => {
    it('preserves the Digital Playbook light palette', () => {
      const light = theme.colorSchemes.light!.palette;
      expect(light.primary.main).toBe('#0D47A1'); // League Blue
      expect(light.secondary.main).toBe('#1976D2'); // Action Blue
      expect(light.success.main).toBe('#2E7D32'); // Scoreboard Green
      expect(light.error.main).toBe('#C62828'); // Penalty Box Red
      expect(light.background.default).toBe('#F8FAFB'); // Fresh Ice
      expect(light.background.paper).toBe('#FFFFFF');
    });
  });

  describe('Dark scheme', () => {
    it('exists with dark mode', () => {
      expect(theme.colorSchemes.dark).toBeDefined();
      expect(theme.colorSchemes.dark!.palette.mode).toBe('dark');
    });

    it('uses deep blue-gray surfaces, not pure black', () => {
      const dark = theme.colorSchemes.dark!.palette;
      expect(dark.background.default).toBe('#0A1929');
      expect(dark.background.paper).toBe('#102A43');
      expect(dark.background.default).not.toBe('#000000');
    });

    it('lightens League/Action Blue for contrast on dark surfaces', () => {
      const dark = theme.colorSchemes.dark!.palette;
      expect(dark.primary.main).toBe('#64B5F6');
      expect(dark.secondary.main).toBe('#42A5F5');
      // Dark text on the lightened blues (buttons stay readable)
      expect(dark.primary.contrastText).toBe('#0A1929');
    });

    it('preserves Scoreboard Green / Penalty Box Red semantics', () => {
      const dark = theme.colorSchemes.dark!.palette;
      expect(dark.success.main).toBe('#66BB6A');
      expect(dark.success.dark).toBe('#388E3C');
      expect(dark.error.main).toBe('#EF5350');
      expect(dark.error.dark).toBe('#C62828');
    });

    it('provides the marketing palette in both schemes', () => {
      expect(theme.colorSchemes.light!.palette.marketing).toBeDefined();
      expect(theme.colorSchemes.dark!.palette.marketing).toBeDefined();
      expect(theme.colorSchemes.dark!.palette.marketing.hero).toBe('#0A1929');
    });
  });

  describe('Scheme-aware component overrides', () => {
    it('keeps Card root overrides static with a dark-scheme block', () => {
      const root = theme.components?.MuiCard?.styleOverrides?.root as Record<string, unknown>;
      expect(root.boxShadow).toBe('0px 4px 24px rgba(13, 71, 161, 0.08)');
      const darkBlock = root['*:where([data-mui-color-scheme="dark"]) &'];
      expect(darkBlock).toBeDefined();
    });

    it('uses a theme-aware TextField override (no hardcoded light input colors)', () => {
      expect(typeof theme.components?.MuiTextField?.styleOverrides?.root).toBe('function');
    });
  });
});

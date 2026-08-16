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
      expect(root['--ol-card-shadow']).toBe('0px 4px 24px rgba(13, 71, 161, 0.08)');
      expect(root.boxShadow).toBe('var(--ol-card-shadow)');
      const darkBlock = root['*:where([data-mui-color-scheme="dark"]) &'];
      expect(darkBlock).toBeDefined();
    });

    it('uses a theme-aware TextField override (no hardcoded light input colors)', () => {
      expect(typeof theme.components?.MuiTextField?.styleOverrides?.root).toBe('function');
    });

    // applyStyles('dark', …) compiles to the ANCESTOR selector
    // *:where([data-mui-color-scheme="dark"]) &, which a dark <html> keeps
    // matching through a LightThemeScope subtree — CSS variables cannot
    // override a rule that never reads them. Each dark block therefore needs a
    // light block AFTER it (equal specificity, later source order wins) or the
    // pinned-light marketing pages get dark card shadows and near-invisible
    // input outlines. Order is the whole mechanism, so assert on it.
    const DARK = '*:where([data-mui-color-scheme="dark"]) &';
    // ...and the restore must name BOTH ancestors. Keyed on the light attribute
    // alone it would also match in ordinary light mode, where <html> carries it
    // — and being a separate later rule at equal specificity it would outrank
    // call-site sx, flattening things like the pricing page's green card
    // outline. That regression is the reason for the compound selector.
    const LIGHT = '*:where([data-mui-color-scheme="dark"]) *:where([data-mui-color-scheme="light"]) &';

    // Both scheme blocks must set ONLY custom properties. If either set
    // `boxShadow`/`border`/`borderColor` directly it would compile to a nested
    // rule emitted after the base one at equal specificity, and would then
    // outrank every call-site sx — e.g. the pricing page's green free-plan
    // outline, or the practice planner's selected-play border.
    const onlyCustomProps = (block: Record<string, unknown>) =>
      Object.keys(block).filter((k) => !k.startsWith('--'));

    it('varies the Card scheme blocks through custom properties only', () => {
      const root = theme.components?.MuiCard?.styleOverrides?.root as Record<string, unknown>;
      const keys = Object.keys(root);

      expect(keys).toContain(DARK);
      expect(keys).toContain(LIGHT);
      expect(keys.indexOf(LIGHT)).toBeGreaterThan(keys.indexOf(DARK));
      // a restore keyed on the light attribute alone would also match in
      // ordinary light mode, where <html> carries it
      expect(keys).not.toContain('*:where([data-mui-color-scheme="light"]) &');

      const darkBlock = root[DARK] as Record<string, unknown>;
      const lightBlock = root[LIGHT] as Record<string, unknown>;
      expect(onlyCustomProps(darkBlock)).toEqual([]);
      expect(onlyCustomProps(lightBlock)).toEqual([]);

      // the restore must put every property the dark block overrode back to the
      // base value
      for (const prop of Object.keys(darkBlock)) {
        expect(lightBlock[prop]).toBe(root[prop]);
      }
    });

    it('varies the TextField scheme blocks through custom properties only', () => {
      const rootFn = theme.components?.MuiTextField?.styleOverrides?.root as (
        args: { theme: typeof theme }
      ) => Record<string, Record<string, unknown>>;
      const outlined = rootFn({ theme })['& .MuiOutlinedInput-root'];
      const keys = Object.keys(outlined);

      expect(keys).toContain(DARK);
      expect(keys).toContain(LIGHT);
      expect(keys.indexOf(LIGHT)).toBeGreaterThan(keys.indexOf(DARK));

      const darkBlock = outlined[DARK] as Record<string, unknown>;
      const lightBlock = outlined[LIGHT] as Record<string, unknown>;
      expect(onlyCustomProps(darkBlock)).toEqual([]);
      expect(onlyCustomProps(lightBlock)).toEqual([]);
      for (const prop of Object.keys(darkBlock)) {
        expect(lightBlock[prop]).toBe(outlined[prop]);
      }
    });
  });

  describe('Informational palette', () => {
    // MUI's default info (#0288D1) sits at 4.4:1 on white, so an outlined
    // color="info" chip missed AA for small text on the public roadmap page.
    it('defines info in both schemes rather than inheriting MUI defaults', () => {
      expect(theme.colorSchemes.light!.palette.info.main).toBe('#0277BD');
      expect(theme.colorSchemes.dark!.palette.info.main).toBe('#4FC3F7');
      expect(theme.colorSchemes.light!.palette.info.main).not.toBe('#0288d1');
    });
  });
});

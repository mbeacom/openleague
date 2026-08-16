import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { Typography } from '@mui/material';
import theme from '@/lib/theme';
import LightThemeScope from '@/components/ui/LightThemeScope';

/**
 * Regression cover for the marketing/auth "washed out text" bug.
 *
 * Pinning the scheme re-declares --mui-palette-* for the subtree, but the
 * `color` PROPERTY is inherited, and the only element that sets it is <body>,
 * which sits outside the pin and resolved to whatever scheme the visitor is in.
 * A scope that pins the variables but not `color` therefore leaves every
 * unstyled heading and paragraph rendering dark-palette text on light-pinned
 * backgrounds (~1.07:1 measured on /about).
 */
describe('LightThemeScope', () => {
  const scopeOf = (container: HTMLElement) =>
    container.querySelector('[data-mui-color-scheme="light"]') as HTMLElement;

  it('stamps the light scheme attribute so --mui-palette-* is re-declared for the subtree', () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <LightThemeScope>content</LightThemeScope>
      </ThemeProvider>
    );

    expect(scopeOf(container)).not.toBeNull();
  });

  it('pins the inherited color, not just the variables', () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <LightThemeScope>
          <Typography variant="h1">About OpenLeague</Typography>
        </LightThemeScope>
      </ThemeProvider>
    );

    // Emotion resolves theme.vars at style time, so the declaration carries the
    // text.primary custom property rather than a baked literal — that is what
    // lets the re-declared light value apply inside the scope.
    const declared = getComputedStyle(scopeOf(container)).color;
    expect(declared).toContain('--mui-palette-text-primary');

    // and an unstyled heading inside the scope inherits that pinned color
    // rather than whatever <body> was resolved to.
    const heading = screen.getByText('About OpenLeague');
    expect(getComputedStyle(heading).color).toBe(declared);
  });

  it('keeps native controls and scrollbars light', () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <LightThemeScope>content</LightThemeScope>
      </ThemeProvider>
    );

    expect(getComputedStyle(scopeOf(container)).colorScheme).toBe('light');
  });

  it('lets callers override the pinned color and background via sx', () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <LightThemeScope sx={{ color: 'error.main' }}>content</LightThemeScope>
      </ThemeProvider>
    );

    // caller sx is merged after the defaults, so it wins
    expect(getComputedStyle(scopeOf(container)).color).toContain('--mui-palette-error-main');
  });
});

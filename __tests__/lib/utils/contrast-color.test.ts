import { describe, it, expect } from 'vitest';
import { getContrastRatio } from '@mui/material/styles';
import theme from '@/lib/theme';
import { contrastTextFor } from '@/lib/utils/contrast-color';

/**
 * These backgrounds are user-supplied data (a venue's brand colour, a team's
 * hex), so nothing constrains their luminance. Pinning the ink to
 * primary.contrastText gave white-on-light the moment someone picked a pale
 * brand colour — and on the marketing surfaces, which are pinned light,
 * contrastText is always #FFFFFF, so it could never self-correct.
 */
describe('contrastTextFor', () => {
  it('returns dark ink on a light supplied colour', () => {
    expect(contrastTextFor(theme, '#FFEB3B')).toMatch(/rgba\(0, 0, 0|#000/);
    expect(contrastTextFor(theme, '#FFFFFF')).toMatch(/rgba\(0, 0, 0|#000/);
  });

  // Both candidates must be opaque: getLuminance reads only RGB, so a
  // semi-transparent ink measures as if it were fully saturated while rendering
  // lighter — the ratio we check would not be the ratio a reader sees.
  it.each(['#FFEB3B', '#4A7FBF', '#000000', '#FFFFFF'])(
    'returns an opaque ink for %s',
    (background) => {
      expect(contrastTextFor(theme, background)).not.toMatch(/rgba/);
    }
  );

  it('returns light ink on a dark supplied colour', () => {
    expect(contrastTextFor(theme, '#0D47A1')).toBe('#fff');
    expect(contrastTextFor(theme, '#000')).toBe('#fff');
  });

  it('accepts the 3-digit form the validator allows', () => {
    expect(contrastTextFor(theme, '#fff')).toMatch(/rgba\(0, 0, 0|#000/);
  });

  it('falls back to the token when there is no colour', () => {
    expect(contrastTextFor(theme, null)).toBe('primary.contrastText');
    expect(contrastTextFor(theme, undefined)).toBe('primary.contrastText');
    expect(contrastTextFor(theme, '')).toBe('primary.contrastText');
  });

  // MUI's own getContrastText picks white as soon as it clears its
  // contrastThreshold, which defaults to 3 — so mid-luminance brand colours got
  // white at 3.6-4.3:1 and failed SC 1.4.3 for normal text, even though black
  // was available and would have passed. These are the exact backgrounds where
  // the two helpers disagree.
  it.each(['#4A7FBF', '#868686', '#7a7a7a'])(
    'clears AA on %s where getContrastText does not',
    (background) => {
      const ours = contrastTextFor(theme, background);
      expect(getContrastRatio(background, ours)).toBeGreaterThanOrEqual(4.5);
      expect(getContrastRatio(background, theme.palette.getContrastText(background)))
        .toBeLessThan(4.5);
    }
  );

  it.each(['#000000', '#FFFFFF', '#0D47A1', '#FFEB3B'])(
    'still clears AA on unambiguous background %s',
    (background) => {
      expect(getContrastRatio(background, contrastTextFor(theme, background)))
        .toBeGreaterThanOrEqual(4.5);
    }
  );

  it('falls back rather than throwing on a value that predates validation', () => {
    expect(contrastTextFor(theme, 'rebeccapurple')).toBe('primary.contrastText');
    expect(contrastTextFor(theme, '#12345')).toBe('primary.contrastText');
    expect(contrastTextFor(theme, 'text.primary', 'common.white')).toBe('common.white');
  });
});

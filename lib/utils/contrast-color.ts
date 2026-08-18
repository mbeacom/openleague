import { getContrastRatio } from '@mui/material/styles';
import type { Theme } from '@mui/material/styles';

/** Matches the 3- or 6-digit hex the venue/team colour inputs validate against. */
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** WCAG SC 1.4.3 for normal-sized text. */
const AA_NORMAL = 4.5;

/**
 * Ink for a surface painted with a user-supplied colour.
 *
 * These backgrounds are *data*, not tokens — a venue's `brandPrimaryColor`, a
 * team's `colorHex` — so nothing constrains their luminance, and pinning the
 * text to `primary.contrastText` (or a literal `#fff`) gives white-on-yellow
 * the moment someone picks a light brand colour. The comparison is done in JS
 * against the light palette, which is correct here precisely because the
 * background is a literal too: both sides are scheme-independent.
 *
 * Deliberately NOT `theme.palette.getContrastText`. That helper picks white as
 * soon as it clears `contrastThreshold`, which defaults to 3 — so a mid-luminance
 * brand colour like #4A7FBF gets white at 4.1:1 and fails SC 1.4.3 for normal
 * text, even though black would have given 5.1:1. Here both candidates are
 * measured and the AA-conformant one wins; when neither clears 4.5:1 (a colour
 * in the narrow band around L≈0.18 where nothing does) the better of the two is
 * returned, since some contrast beats an arbitrary pick.
 *
 * Falls back to the token when there is no colour, or when a stored value
 * predates validation and would make `decomposeColor` throw.
 */
export function contrastTextFor(
  theme: Theme,
  color: string | null | undefined,
  fallback = 'primary.contrastText'
): string {
  if (!color || !HEX.test(color.trim())) return fallback;
  const background = color.trim();
  // Both candidates must be OPAQUE. MUI's getLuminance reads only the RGB
  // channels, so a semi-transparent ink like text.primary (rgba(0,0,0,0.87))
  // scores as pure black while rendering as a lighter composite — on #7a7a7a
  // that is a measured 4.90:1 against a real 4.45:1, i.e. the measurement would
  // certify a background that actually fails.
  const light = theme.palette.common.white;
  const dark = theme.palette.common.black;
  try {
    const lightRatio = getContrastRatio(background, light);
    const darkRatio = getContrastRatio(background, dark);
    if (lightRatio >= AA_NORMAL && lightRatio >= darkRatio) return light;
    if (darkRatio >= AA_NORMAL) return dark;
    return lightRatio >= darkRatio ? light : dark;
  } catch {
    return fallback;
  }
}

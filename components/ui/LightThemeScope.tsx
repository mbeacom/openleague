'use client';

import { createContext, useContext } from 'react';
import { Box, type BoxProps } from '@mui/material';

/**
 * The scheme a subtree has been pinned to, or null when nothing has pinned it.
 *
 * Needed because the pin is a DOM-inheritance mechanism, and portals break DOM
 * inheritance: a Drawer or Dialog mounts under `<body>`, outside whatever scope
 * wraps it in the React tree, so its `--mui-palette-*` resolve from `<html>`.
 * React context does follow the React tree, so a portal-rendering component can
 * read the scheme it *should* have had and restamp it on the portaled element.
 */
const PinnedSchemeContext = createContext<'light' | null>(null);

/** The scheme an ancestor LightThemeScope pinned, or null if none did. */
export function usePinnedScheme(): 'light' | null {
  return useContext(PinnedSchemeContext);
}

/**
 * Pins its subtree to the light ("Fresh Ice") color scheme regardless of the
 * visitor's active theme (system or app toggle).
 *
 * Why: the public marketing surfaces are designed light-only — white section
 * and card backgrounds are baked in, either as literals or via
 * `alpha(theme.palette.background.paper, …)`, which resolves to the default
 * (light) palette in JS. Their text, however, uses scheme-aware tokens
 * (`color: 'text.primary' | 'text.secondary'` → `var(--mui-palette-text-*)`).
 * In dark mode the backgrounds stay light while the text flips light, leaving
 * light text on white blocks (illegible). Pinning the scheme keeps the text
 * tokens on the light palette so the whole composition stays legible.
 *
 * Mechanism: MUI's cssVariables mode (see lib/theme.ts `colorSchemeSelector`)
 * emits the light palette under both `:root` and `[data-mui-color-scheme="light"]`.
 * Setting that attribute here re-declares `--mui-palette-*` for this subtree —
 * custom properties inherit from the nearest ancestor that sets them, so the
 * light values win over an ancestor `<html data-mui-color-scheme="dark">`.
 * `colorScheme: 'light'` also keeps native controls/scrollbars light.
 *
 * `color` is pinned explicitly, and that is not redundant: re-declaring the
 * variables only changes what `var(--mui-palette-text-primary)` resolves to for
 * elements that *reference* it. Plain text — a `<Typography>` with no `color`
 * prop — inherits the `color` property itself, and the only element that sets
 * it is `<body>`, where CssBaseline resolved it outside this subtree (i.e. to
 * the dark palette). Without this line every unstyled heading and paragraph
 * inherits dark-scheme text onto the pinned light backgrounds — near-white on
 * #F8FAFB, ~1.07:1.
 *
 * Known limit: rules keyed off `theme.applyStyles('dark', …)` compile to the
 * *ancestor* selector `*:where([data-mui-color-scheme="dark"]) &`, which the
 * dark `<html>` still matches through this subtree — CSS variables cannot
 * override a rule that never reads them. lib/theme.ts pairs each of its own
 * dark blocks with a later light block so the light one wins here; MUI's
 * built-in dark overrides have to be sidestepped at the call site (e.g.
 * MarketingHeader uses `<AppBar color="inherit">`).
 *
 * All Box props (sx, className, component, …) are forwarded.
 */
export default function LightThemeScope({ sx, ...props }: BoxProps) {
  return (
    <PinnedSchemeContext.Provider value="light">
      <Box
        data-mui-color-scheme="light"
        sx={[{ colorScheme: 'light', color: 'text.primary' }, ...(Array.isArray(sx) ? sx : [sx])]}
        {...props}
      />
    </PinnedSchemeContext.Provider>
  );
}

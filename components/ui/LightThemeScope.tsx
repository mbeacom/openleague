import { Box, type BoxProps } from '@mui/material';

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
 * All Box props (sx, className, component, …) are forwarded.
 */
export default function LightThemeScope({ sx, ...props }: BoxProps) {
  return (
    <Box
      data-mui-color-scheme="light"
      sx={[{ colorScheme: 'light' }, ...(Array.isArray(sx) ? sx : [sx])]}
      {...props}
    />
  );
}

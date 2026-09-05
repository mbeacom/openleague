import type { SxProps, Theme } from "@mui/material";
import { Box } from "@mui/material";
import { crestInitials, resolveCrestColor } from "@/lib/utils/crest";
import { contrastTextFor } from "@/lib/utils/contrast-color";
import theme from "@/lib/theme";

/**
 * Palette values as CSS variables rather than an sx theme callback.
 *
 * A function-valued sx property cannot cross the Server -> Client boundary in
 * Next 16 — React refuses to serialize it and the page 500s at render time,
 * invisibly to tsc, eslint, and jsdom tests. These composite values interpolate
 * palette colors into single strings, so the theme has to reach them some other
 * way; MUI already emits every palette entry as a CSS variable (cssVariables is
 * enabled in lib/theme.ts), and those follow the active color scheme on their
 * own.
 */
const VAR_DIVIDER = "var(--mui-palette-divider)";
const VAR_PAPER = "var(--mui-palette-background-paper)";
const VAR_SECONDARY = "var(--mui-palette-secondary-main)";

export type CrestSize = "xs" | "sm" | "md" | "lg" | "xl";

/** Diameter, monogram size, and monogram tracking per step. */
const SIZES: Record<CrestSize, { box: number; font: number; tracking: string }> = {
  xs: { box: 28, font: 11, tracking: "0.02em" },
  sm: { box: 36, font: 13, tracking: "0.02em" },
  md: { box: 48, font: 17, tracking: "0.01em" },
  lg: { box: 72, font: 25, tracking: "0" },
  xl: { box: 104, font: 36, tracking: "-0.01em" },
};

export interface CrestProps {
  /** Display name — the monogram source, and the accessible label. */
  name: string;
  /** Entity id. Seeds the fallback color, so it must be the durable id. */
  id: string;
  /** Uploaded mark, when the owner has one. */
  logoUrl?: string | null;
  /** Owner-chosen brand color; overrides the derived one. */
  brandColor?: string | null;
  size?: CrestSize;
  /**
   * Draws the orbital ring — the logo's signature form. "accent" marks an
   * entity the viewer administers; "none" is the default resting state.
   */
  ring?: "none" | "accent";
  /**
   * "solid" fills the circle with the entity's color — right on the neutral
   * pages where crests usually live. "inverted" puts the color in the letters
   * on a paper ground, for the brand-colored hero on a public profile, where a
   * solid crest would be the same color as the surface behind it.
   */
  tone?: "solid" | "inverted";
  sx?: SxProps<Theme>;
}

/**
 * The crest: one circular identity mark for a team, league, association, or
 * venue, at five sizes.
 *
 * A logo is drawn *contained* on a light ground rather than cropped to fill.
 * Club artwork is overwhelmingly square or a horizontal wordmark, and a circle
 * that fills would behead both. Containing costs a little presence and buys
 * every logo rendering intact, which is the whole reason an owner uploaded one.
 *
 * Server-safe: no hooks, no client directive, so it drops into RSC pages.
 */
export function Crest({
  name,
  id,
  logoUrl,
  brandColor,
  size = "md",
  ring = "none",
  tone = "solid",
  sx,
}: CrestProps) {
  const { box, font, tracking } = SIZES[size];
  const color = resolveCrestColor(id, brandColor);
  const hasLogo = Boolean(logoUrl);

  return (
    <Box
      aria-hidden
      sx={{
        flexShrink: 0,
        width: box,
        height: box,
        borderRadius: "50%",
        display: "grid",
        placeItems: "center",
        overflow: "hidden",
        position: "relative",
        // A logo sits on paper so transparent PNGs and dark wordmarks survive
        // the dark scheme; a solid monogram owns the full circle.
        //
        // An inverted crest gets a literal white ground rather than
        // background.paper. It exists to sit on a saturated brand color, which
        // is dark in either scheme, so a paper ground that follows the theme
        // would put the brand color's own letters on near-black in dark mode.
        backgroundColor: hasLogo
          ? "background.paper"
          : tone === "inverted"
            ? "common.white"
            : color,
        // An owner may pick any brand color, so the solid monogram's ink is
        // measured against it rather than assumed white — the one way this
        // system could otherwise render something unreadable. Inverted crests
        // put that color in the letters, on a ground we control.
        //
        // Measured here against the imported theme rather than in an sx
        // callback: both the ink candidates and the background are literals, so
        // the result is a plain string that serializes across the RSC boundary.
        color: tone === "inverted" ? color : contrastTextFor(theme, color),
        // The inner hairline keeps a dark crest from dissolving into a dark
        // page; the outer offset ring is the orbit from the wordmark, and is
        // spent only where it means something (an entity you administer).
        boxShadow:
          ring === "accent"
            ? `inset 0 0 0 1px ${VAR_DIVIDER}, 0 0 0 2px ${VAR_PAPER}, 0 0 0 4px ${VAR_SECONDARY}`
            : `inset 0 0 0 1px ${VAR_DIVIDER}`,
        ...sx,
      }}
    >
      {hasLogo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl as string}
          alt=""
          loading="lazy"
          decoding="async"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            // Breathing room so a full-bleed square logo does not touch the
            // ring on all four sides.
            padding: Math.round(box * 0.1),
            display: "block",
          }}
        />
      ) : (
        <Box
          component="span"
          sx={{
            fontSize: font,
            fontWeight: 800,
            letterSpacing: tracking,
            lineHeight: 1,
            userSelect: "none",
          }}
        >
          {crestInitials(name)}
        </Box>
      )}
    </Box>
  );
}

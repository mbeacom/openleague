import Image from 'next/image';
import Link from 'next/link';
import { Box, SxProps, Theme, Typography } from '@mui/material';

const LOGO_IMAGE_PATH = '/images/logo.webp';
const LOGO_ALT_TEXT = 'OpenLeague Logo';

export type LogoSize = 'small' | 'medium' | 'large' | 'xlarge';
export type LogoVariant = 'default' | 'footer';

/**
 * Responsive display configuration for text visibility across breakpoints
 */
type ResponsiveTextDisplay = {
  xs?: boolean;
  sm?: boolean;
  md?: boolean;
  lg?: boolean;
  xl?: boolean;
} | boolean;

/**
 * MUI-compatible responsive display type for the text element
 */
type MuiResponsiveDisplay = 'none' | 'block' | {
  xs?: 'none' | 'block';
  sm?: 'none' | 'block';
  md?: 'none' | 'block';
  lg?: 'none' | 'block';
  xl?: 'none' | 'block';
};

interface LogoProps {
  /**
   * Size preset for the logo
   * - small: 32px (footer, compact spaces)
   * - medium: 44px (mobile navbar)
   * - large: 56px (desktop navbar, marketing)
   * - xlarge: 64px (hero sections)
   */
  size?: LogoSize;
  /**
   * Custom width in pixels (overrides size preset)
   */
  width?: number;
  /**
   * Custom height in pixels (overrides size preset)
   */
  height?: number;
  /**
   * Variant affects styling and behavior
   * - default: Interactive with hover effect
   * - footer: Static, no hover effect
   */
  variant?: LogoVariant;
  /**
   * Link destination (defaults to '/' for default variant, null for footer)
   */
  href?: string | null;
  /**
   * Whether to load the image with priority (for above-the-fold content)
   */
  priority?: boolean;
  /**
   * Whether to show the "OpenLeague" text next to the logo
   */
  showText?: boolean;
  /**
   * Responsive behavior for text visibility
   * Object with breakpoint keys (xs, sm, md, etc.) or boolean
   */
  showTextResponsive?: ResponsiveTextDisplay;
  /**
   * Additional MUI sx props for the container Box
   */
  sx?: SxProps<Theme>;
  /**
   * Additional class name for the container
   */
  className?: string;
}

const SIZE_MAP: Record<LogoSize, number> = {
  small: 32,
  medium: 44,
  large: 56,
  xlarge: 64,
};

// Typography variant mapping based on logo size
const TEXT_VARIANT_MAP: Record<LogoSize, 'body1' | 'h6' | 'h5' | 'h4'> = {
  small: 'body1',
  medium: 'h6',
  large: 'h5',
  xlarge: 'h4',
};

/**
 * Logo component for OpenLeague branding
 *
 * Can display just the logo icon or include the "OpenLeague" wordmark.
 * Supports responsive text visibility for optimal display across devices.
 *
 * @example
 * ```tsx
 * // In navbar with text
 * <Logo size="large" showText priority />
 *
 * // In navbar with responsive text (hidden on mobile, shown on desktop)
 * <Logo size="large" showTextResponsive={{ xs: false, md: true }} priority />
 *
 * // In footer without text
 * <Logo size="small" variant="footer" />
 *
 * // Custom size with different link
 * <Logo width={48} height={48} href="/dashboard" showText />
 * ```
 */
export default function Logo({
  size = 'large',
  width: customWidth,
  height: customHeight,
  variant = 'default',
  href,
  priority = false,
  showText = false,
  showTextResponsive,
  sx,
  className,
}: LogoProps) {
  // Determine dimensions - maintain square aspect ratio when only one dimension is provided
  const width = customWidth ?? customHeight ?? SIZE_MAP[size];
  const height = customHeight ?? customWidth ?? SIZE_MAP[size];

  // Determine link behavior
  // Footer variant never links, otherwise use explicit href or default to '/'
  const linkHref = href !== undefined ? href : (variant === 'footer' ? null : '/');

  // Determine text visibility
  let textDisplay: MuiResponsiveDisplay = 'none';

  if (showTextResponsive) {
    if (typeof showTextResponsive === 'boolean') {
      textDisplay = showTextResponsive ? 'block' : 'none';
    } else {
      // Create responsive display object using Object.entries for cleaner code
      textDisplay = {};
      Object.entries(showTextResponsive).forEach(([breakpoint, value]) => {
        (textDisplay as Record<string, 'none' | 'block'>)[breakpoint] = value ? 'block' : 'none';
      });
    }
  } else if (showText) {
    textDisplay = 'block';
  }

  // Get appropriate text variant for logo size
  const textVariant = TEXT_VARIANT_MAP[size];

  // Base styles
  const baseStyles: SxProps<Theme> = {
    display: 'flex',
    alignItems: 'center',
    gap: showText || showTextResponsive ? 1.5 : 0,
    ...sx,
  };

  // Interactive styles for default variant
  const interactiveStyles: SxProps<Theme> = variant === 'default' ? {
    textDecoration: 'none',
    color: 'inherit',
    transition: 'transform 0.2s ease-in-out',
    '&:hover': {
      transform: 'scale(1.05)',
    },
    cursor: 'pointer',
  } : {};

  const logoImage = (
    <Image
      src={LOGO_IMAGE_PATH}
      alt={LOGO_ALT_TEXT}
      width={width}
      height={height}
      priority={priority}
    />
  );

  const logoContent = (
    <>
      {logoImage}
      {(showText || showTextResponsive) && (
        <Typography
          variant={textVariant}
          component="div"
          sx={{
            fontWeight: 700,
            color: variant === 'footer' ? 'text.primary' : 'primary.main',
            letterSpacing: '-0.02em',
            display: textDisplay,
          }}
        >
          OpenLeague
        </Typography>
      )}
    </>
  );

  // Render with link wrapper if applicable
  if (linkHref) {
    const combinedStyles = { ...baseStyles, ...interactiveStyles };
    return (
      <Box
        component={Link}
        href={linkHref}
        sx={combinedStyles}
        className={className}
      >
        {logoContent}
      </Box>
    );
  }

  // Render without link
  return (
    <Box sx={baseStyles} className={className}>
      {logoContent}
    </Box>
  );
}

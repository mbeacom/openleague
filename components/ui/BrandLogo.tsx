import Image from 'next/image';
import Link from 'next/link';
import { Box, SxProps, Theme } from '@mui/material';

const BRAND_LOGO_PATH = '/images/alt-logo-transparent-background.png';
const ICON_LOGO_PATH = '/images/logo.webp';
const LOGO_ALT_TEXT = 'OpenLeague - Simplify Your Season';

export type BrandLogoVariant = 'icon' | 'full' | 'compact';
export type BrandLogoSize = 'small' | 'medium' | 'large' | 'xlarge';

interface BrandLogoProps {
  /**
   * Logo variant to display
   * - icon: Just the circular logo icon (for navbar)
   * - full: Complete branded logo with "OpenLeague" and "Simplify Your Season"
   * - compact: Medium-sized branded logo
   */
  variant?: BrandLogoVariant;
  /**
   * Size preset for the logo
   * - small: 120px (compact spaces)
   * - medium: 200px (standard navbar/sections)
   * - large: 280px (hero sections)
   * - xlarge: 360px (prominent hero displays)
   */
  size?: BrandLogoSize;
  /**
   * Custom width in pixels (overrides size preset)
   */
  width?: number;
  /**
   * Custom height in pixels (overrides size preset)
   */
  height?: number;
  /**
   * Link destination (defaults to '/')
   */
  href?: string | null;
  /**
   * Whether to load the image with priority (for above-the-fold content)
   */
  priority?: boolean;
  /**
   * Whether to show hover effect
   */
  interactive?: boolean;
  /**
   * Additional MUI sx props for the container Box
   */
  sx?: SxProps<Theme>;
  /**
   * Additional class name for the container
   */
  className?: string;
}

const SIZE_MAP: Record<BrandLogoSize, number> = {
  small: 120,
  medium: 200,
  large: 280,
  xlarge: 360,
};

const ICON_SIZE_MAP: Record<BrandLogoSize, number> = {
  small: 32,
  medium: 44,
  large: 56,
  xlarge: 64,
};

/**
 * BrandLogo component for OpenLeague branding
 *
 * Displays either the icon-only logo or the full branded logo with tagline.
 * Use the full branded logo in hero sections and key landing areas for maximum impact.
 * Use the icon logo in navbars for a clean, professional look.
 *
 * @example
 * ```tsx
 * // Hero section with full branded logo
 * <BrandLogo variant="full" size="xlarge" priority />
 *
 * // Navbar with icon logo
 * <BrandLogo variant="icon" size="large" />
 *
 * // Compact branded logo
 * <BrandLogo variant="compact" size="medium" />
 * ```
 */
export default function BrandLogo({
  variant = 'icon',
  size = 'large',
  width: customWidth,
  height: customHeight,
  href = '/',
  priority = false,
  interactive = true,
  sx,
  className,
}: BrandLogoProps) {
  // Determine dimensions based on variant
  const isIcon = variant === 'icon';
  const baseSize = isIcon ? ICON_SIZE_MAP[size] : SIZE_MAP[size];

  const width = customWidth ?? baseSize;
  const height = customHeight ?? baseSize;

  // Determine which image to use
  const imagePath = isIcon ? ICON_LOGO_PATH : BRAND_LOGO_PATH;

  // Base styles
  const baseStyles: SxProps<Theme> = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    ...sx,
  };

  // Interactive styles
  const interactiveStyles: SxProps<Theme> = interactive ? {
    transition: 'transform 0.3s ease-in-out',
    '&:hover': {
      transform: 'scale(1.05)',
    },
    cursor: 'pointer',
  } : {};

  const logoImage = (
    <Box
      sx={{
        position: 'relative',
        width,
        height,
      }}
    >
      <Image
        src={imagePath}
        alt={LOGO_ALT_TEXT}
        fill
        style={{ objectFit: 'contain' }}
        priority={priority}
      />
    </Box>
  );

  // Render with link wrapper if href is provided
  if (href) {
    const combinedStyles = { ...baseStyles, ...interactiveStyles };
    return (
      <Box
        component={Link}
        href={href}
        sx={combinedStyles}
        className={className}
      >
        {logoImage}
      </Box>
    );
  }

  // Render without link
  const combinedStyles = { ...baseStyles, ...interactiveStyles };
  return (
    <Box sx={combinedStyles} className={className}>
      {logoImage}
    </Box>
  );
}

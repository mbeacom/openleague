import Image from 'next/image';
import Link from 'next/link';
import { Box, SxProps, Theme } from '@mui/material';

const LOGO_IMAGE_PATH = '/images/logo.webp';
const LOGO_ALT_TEXT = 'OpenLeague Logo';

export type LogoSize = 'small' | 'medium' | 'large' | 'xlarge';
export type LogoVariant = 'default' | 'footer';

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

/**
 * Logo component for OpenLeague branding
 *
 * The logo includes the "OpenLeague" wordmark, so no additional text is needed.
 *
 * @example
 * ```tsx
 * // In navbar
 * <Logo size="large" priority />
 *
 * // In footer
 * <Logo size="small" variant="footer" />
 *
 * // Custom size with different link
 * <Logo width={48} height={48} href="/dashboard" />
 * ```
 */
export default function Logo({
  size = 'large',
  width: customWidth,
  height: customHeight,
  variant = 'default',
  href,
  priority = false,
  sx,
  className,
}: LogoProps) {
  // Determine dimensions - maintain square aspect ratio when only one dimension is provided
  const width = customWidth ?? customHeight ?? SIZE_MAP[size];
  const height = customHeight ?? customWidth ?? SIZE_MAP[size];

  // Determine link behavior
  // Footer variant never links, otherwise use explicit href or default to '/'
  const linkHref = href !== undefined ? href : (variant === 'footer' ? null : '/');

  // Base styles
  const baseStyles: SxProps<Theme> = {
    display: 'flex',
    alignItems: 'center',
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
        {logoImage}
      </Box>
    );
  }

  // Render without link
  return (
    <Box sx={baseStyles} className={className}>
      {logoImage}
    </Box>
  );
}

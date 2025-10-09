'use client';

import { Button, ButtonProps, alpha } from '@mui/material';
import Link from 'next/link';
import { trackConversion } from '@/lib/analytics/tracking';

interface CTAButtonProps {
  href: string;
  trackingAction: string;
  trackingLabel?: string;
  children: React.ReactNode;
  variant?: 'marketing' | 'marketingSecondary' | 'contained' | 'outlined' | 'text';
  size?: 'small' | 'medium' | 'large';
  fullWidth?: boolean;
  onClick?: (event: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => void;
  sx?: ButtonProps['sx'];
}

/**
 * Enhanced CTA Button with conversion tracking and optimized hover states
 */
export default function CTAButton({ 
  href, 
  trackingAction, 
  trackingLabel, 
  children, 
  variant = 'marketing',
  size,
  fullWidth,
  onClick,
  sx
}: CTAButtonProps) {
  const handleClick = (event: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
    trackConversion(trackingAction, trackingLabel);
    onClick?.(event);
  };

  return (
    <Button
      component={Link}
      href={href}
      variant={variant}
      size={size}
      fullWidth={fullWidth}
      onClick={handleClick}
      sx={(theme) => {
        const baseSx = {
          // Enhanced hover states using MUI's sx prop and theme
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': {
            transform: 'translateY(-2px)',
            boxShadow: variant === 'marketing'
              ? `0px 8px 20px ${alpha(theme.palette.marketing.secondary, 0.4)}`
              : `0px 4px 12px ${alpha(theme.palette.primary.main, 0.3)}`,
          },
          '&:active': {
            transform: 'translateY(0px)',
          },
          // Focus states for accessibility
          '&:focus-visible': {
            outline: '2px solid',
            outlineColor: 'primary.main',
            outlineOffset: '2px',
          },
        };
        
        // Merge with custom sx prop if provided
        if (sx) {
          if (typeof sx === 'function') {
            return { ...baseSx, ...sx(theme) };
          }
          return { ...baseSx, ...sx };
        }
        
        return baseSx;
      }}
    >
      {children}
    </Button>
  );
}
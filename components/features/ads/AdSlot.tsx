'use client';

import { useEffect } from 'react';
import { Box } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import { ADS_CONFIG, type AdPlacement, getConfiguredAdSlot, isAdsEnabled } from '@/lib/config/ads';

type AdsWindow = Window & {
  adsbygoogle?: unknown[];
};

interface AdSlotProps {
  placement?: AdPlacement;
  slot?: string;
  format?: 'auto' | 'fluid' | 'rectangle' | 'horizontal' | 'vertical';
  fullWidthResponsive?: boolean;
  minHeight?: number;
  sx?: SxProps<Theme>;
}

export default function AdSlot({
  placement = 'marketing',
  slot,
  format = 'auto',
  fullWidthResponsive = true,
  minHeight = 90,
  sx,
}: AdSlotProps) {
  const resolvedSlot = slot ?? getConfiguredAdSlot(placement);
  const shouldRender = isAdsEnabled() && Boolean(resolvedSlot);

  useEffect(() => {
    if (!shouldRender) {
      return;
    }

    try {
      const adsWindow = window as AdsWindow;
      adsWindow.adsbygoogle = adsWindow.adsbygoogle ?? [];
      adsWindow.adsbygoogle.push({});
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('Unable to initialize ad slot', error);
      }
    }
  }, [resolvedSlot, shouldRender]);

  if (!shouldRender) {
    return null;
  }

  return (
    <Box
      component="aside"
      aria-label="Advertisement"
      data-ad-placement={placement}
      sx={[
        {
          width: '100%',
          minHeight,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        },
        ...(sx ? (Array.isArray(sx) ? sx : [sx]) : []),
      ]}
    >
      <Box
        component="ins"
        className="adsbygoogle"
        sx={{ display: 'block', width: '100%' }}
        data-ad-client={ADS_CONFIG.adsenseClient}
        data-ad-slot={resolvedSlot}
        data-ad-format={format}
        data-full-width-responsive={fullWidthResponsive ? 'true' : 'false'}
      />
    </Box>
  );
}

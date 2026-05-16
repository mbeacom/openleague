'use client';

import type { ReactNode } from 'react';
import Script from 'next/script';
import { Box } from '@mui/material';
import AdSlot from '@/components/features/ads/AdSlot';
import MarketingHeader from '@/components/features/navigation/MarketingHeader';
import MarketingFooter from '@/components/features/navigation/MarketingFooter';
import SkipLink from '@/components/ui/SkipLink';
import { ADS_CONFIG, isAdsEnabled } from '@/lib/config/ads';
import './marketing.css';

interface MarketingLayoutProps {
  children: ReactNode;
}

export default function MarketingLayout({ children }: MarketingLayoutProps) {
  const adsEnabled = isAdsEnabled();

  return (
    <Box
      className="marketing-layout"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        bgcolor: 'background.default',
      }}
    >
      {adsEnabled && (
        <Script
          id="adsense-script"
          async
          crossOrigin="anonymous"
          strategy="afterInteractive"
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADS_CONFIG.adsenseClient}`}
        />
      )}
      <SkipLink />
      <MarketingHeader />
      <Box
        component="main"
        id="main-content"
        tabIndex={-1}
        sx={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          pt: { xs: '64px', md: '72px' },
        }}
      >
        {children}
      </Box>
      <AdSlot
        placement="marketing"
        sx={{
          px: { xs: 2, md: 4 },
          py: { xs: 2, md: 3 },
          bgcolor: 'background.default',
        }}
      />
      <MarketingFooter />
    </Box>
  );
}

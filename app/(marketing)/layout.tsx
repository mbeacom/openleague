'use client';

import type { ReactNode } from 'react';
import { Box } from '@mui/material';
import MarketingHeader from '@/components/features/navigation/MarketingHeader';
import MarketingFooter from '@/components/features/navigation/MarketingFooter';
import SkipLink from '@/components/ui/SkipLink';
import './marketing.css';

interface MarketingLayoutProps {
  children: ReactNode;
}

export default function MarketingLayout({ children }: MarketingLayoutProps) {
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
      <MarketingFooter />
    </Box>
  );
}

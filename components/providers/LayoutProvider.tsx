'use client';

import { ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { Box } from '@mui/material';
import MarketingHeader from '@/components/features/navigation/MarketingHeader';
import MarketingFooter from '@/components/features/navigation/MarketingFooter';

interface LayoutProviderProps {
  children: ReactNode;
}

export default function LayoutProvider({ children }: LayoutProviderProps) {
  const { data: session } = useSession();
  const pathname = usePathname();
  
  // Determine if we should show marketing layout
  const isMarketingRoute = pathname === '/' || pathname.startsWith('/(marketing)');
  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/signup');
  
  // Show marketing layout for unauthenticated users on marketing routes
  const shouldShowMarketingLayout = !session?.user && (isMarketingRoute || isAuthRoute);
  
  if (shouldShowMarketingLayout) {
    return (
      <Box 
        sx={{ 
          display: 'flex', 
          flexDirection: 'column', 
          minHeight: '100vh',
          bgcolor: 'background.default',
        }}
      >
        <MarketingHeader />
        <Box 
          component="main" 
          sx={{ 
            flexGrow: 1,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {children}
        </Box>
        <MarketingFooter />
      </Box>
    );
  }
  
  // For authenticated users or dashboard routes, render without marketing layout
  return <>{children}</>;
}
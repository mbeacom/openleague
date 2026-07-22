'use client';

import { ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { Box } from '@mui/material';
import MarketingHeader from '@/components/features/navigation/MarketingHeader';
import MarketingFooter from '@/components/features/navigation/MarketingFooter';
import SkipLink from '@/components/ui/SkipLink';

interface LayoutProviderProps {
  children: ReactNode;
}

export default function LayoutProvider({ children }: LayoutProviderProps) {
  const { data: session } = useSession();
  const pathname = usePathname();

  // Determine if we should show marketing layout
  // Note: Route groups like (marketing) are excluded from the pathname by Next.js
  const marketingPaths = [
    '/',
    '/features',
    '/about',
    '/contact',
    '/get-started',
    '/blog',
    '/privacy',
    '/terms',
    '/cookies',
    '/security',
    '/docs',
  ];
  // Routes that already render their own marketing layout components
  const marketingRouteGroupPaths = [
    '/features',
    '/pricing',
    '/about',
    '/contact',
    '/get-started',
    '/blog',
    '/rinks',
    '/privacy',
    '/terms',
    '/cookies',
    '/security',
  ];
  const isMarketingRoute = marketingPaths.some(path =>
    pathname === path || (path !== '/' && pathname.startsWith(path))
  );
  const isMarketingRouteGroup = marketingRouteGroupPaths.some(path =>
    pathname === path || pathname.startsWith(`${path}/`)
  );
  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/signup');
  const isDocsRoute = pathname === '/docs' || pathname.startsWith('/docs/');

  // Show marketing layout for unauthenticated users on marketing routes
  const shouldShowMarketingLayout =
    !session?.user && ((isMarketingRoute && !isMarketingRouteGroup) || isAuthRoute);

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
        <SkipLink />
        <MarketingHeader />
        {isDocsRoute ? (
          children
        ) : (
          <Box
            component="main"
            id="main-content"
            tabIndex={-1}
            sx={{
              flexGrow: 1,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {children}
          </Box>
        )}
        <MarketingFooter />
      </Box>
    );
  }

  // For authenticated users or dashboard routes, render without marketing layout
  return <>{children}</>;
}

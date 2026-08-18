'use client';

import { ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { Box } from '@mui/material';
import MarketingHeader from '@/components/features/navigation/MarketingHeader';
import MarketingFooter from '@/components/features/navigation/MarketingFooter';
import SkipLink from '@/components/ui/SkipLink';
import LightThemeScope from '@/components/ui/LightThemeScope';
import { isAuthRoute } from '@/lib/config/auth-routes';

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
  // Whole-segment match from the shared roster (lib/config/auth-routes.ts).
  // A bare startsWith('/signup') also swallowed the public '/signups*' pages —
  // which already get chrome and a pin from app/(marketing)/layout.tsx, so they
  // ended up with two headers, two footers, two skip links and a duplicated
  // id="main-content" — and the authenticated '/signup-events*' dashboard,
  // which renders through this branch during the window where useSession() has
  // not resolved yet.
  const isAuth = isAuthRoute(pathname);
  const isDocsRoute = pathname === '/docs' || pathname.startsWith('/docs/');

  // Show marketing layout for unauthenticated users on marketing routes
  const shouldShowMarketingLayout =
    !session?.user && ((isMarketingRoute && !isMarketingRouteGroup) || isAuth);

  // The landing page and the auth pages are light-only compositions (their
  // sections and cards bake in white and Fresh Ice backgrounds), so the chrome
  // has to be pinned with them — otherwise a dark-mode visitor gets a dark
  // header and footer bracketing a light page. /docs is genuinely
  // scheme-aware, so it keeps the plain Box and follows the visitor's theme.
  const LayoutRoot = isDocsRoute ? Box : LightThemeScope;

  if (shouldShowMarketingLayout) {
    return (
      <LayoutRoot
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
      </LayoutRoot>
    );
  }

  // For authenticated users or dashboard routes, render without marketing layout
  return <>{children}</>;
}

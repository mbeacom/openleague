'use client';

import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import InitColorSchemeScript from '@mui/material/InitColorSchemeScript';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import theme from '@/lib/theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <AppRouterCacheProvider>
      {/* Stamps data-mui-color-scheme on <html> before first paint (no SSR
          flash). Rendered here rather than the server-owned root layout; the
          inline script still lands at the top of <body> in the SSR stream.
          Its defaults (attribute, mui-mode/mui-color-scheme storage keys)
          match MuiThemeProvider's and lib/theme.ts's colorSchemeSelector. */}
      <InitColorSchemeScript attribute="data-mui-color-scheme" defaultMode="system" />
      <MuiThemeProvider theme={theme} defaultMode="system" disableTransitionOnChange>
        {/* Single app-wide MUI X pickers provider (AdapterDateFns = date-fns v3/v4). */}
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <CssBaseline />
          {children}
        </LocalizationProvider>
      </MuiThemeProvider>
    </AppRouterCacheProvider>
  );
}

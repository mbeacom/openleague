import * as React from 'react';
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import theme from '@/lib/theme';

// Design-sync preview provider: the OpenLeague "Digital Playbook" MUI theme +
// CssBaseline. Mirrors components/providers/ThemeProvider.tsx but drops the
// AppRouterCacheProvider (which needs Next app-router context) — Emotion's
// default cache is fine for static preview rendering.
export function DesignSystemProvider({ children }: { children: React.ReactNode }) {
  return (
    <MuiThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </MuiThemeProvider>
  );
}

export default DesignSystemProvider;

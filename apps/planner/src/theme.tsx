/**
 * The hosted ThemeProvider minus its Next-only parts: no AppRouterCacheProvider
 * (Next), no InitColorSchemeScript (an inline pre-paint script for SSR, which
 * the CSP forbids and a client-rendered app doesn't need).
 */
import type { ReactNode } from "react";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import theme from "@/lib/theme";

export function StaticThemeProvider({ children }: { children: ReactNode }) {
    return (
        <ThemeProvider theme={theme} defaultMode="system" disableTransitionOnChange>
            {/* PracticeSessionEditor's DateTimePicker needs the adapter. */}
            <LocalizationProvider dateAdapter={AdapterDateFns}>
                <CssBaseline />
                {children}
            </LocalizationProvider>
        </ThemeProvider>
    );
}

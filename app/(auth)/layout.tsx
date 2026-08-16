import type { ReactNode } from 'react';
import LightThemeScope from '@/components/ui/LightThemeScope';

/**
 * The auth surfaces are a light-only composition, the same call the marketing
 * pages make (see components/ui/LightThemeScope.tsx): login, forgot-password,
 * reset-password, verify-email and confirm-email-change all bake their card in
 * `linear-gradient(135deg, #FFFFFF 0%, #F8FAFB 100%)` over a Fresh Ice page
 * wash, while their text stays on scheme-aware tokens. Unpinned, a dark-mode
 * visitor got dark-palette text on those light literals — "Log in to your
 * OpenLeague account" landed at 1.17:1.
 *
 * Pinning here rather than per page also settles an inconsistency: /signup
 * carried no card treatment at all, so the two halves of the same flow used to
 * render in different schemes.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    // Deliberately no minHeight: LayoutProvider already wraps /login and
    // /signup in a 100vh flex column whose <main> grows, and the other four
    // pages carry their own 100vh box. Adding one here would force <main> past
    // the viewport and push MarketingFooter a full footer-height below the fold
    // on /signup, whose form is short and top-aligned.
    <LightThemeScope
      sx={{
        display: 'flex',
        flexDirection: 'column',
        flexGrow: 1,
        bgcolor: 'background.default',
      }}
    >
      {children}
    </LightThemeScope>
  );
}

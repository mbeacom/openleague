"use client";

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";

/**
 * Session Provider with configured refetch intervals
 * - Checks session every 5 minutes when tab is active
 * - Checks on window focus to catch session changes
 * - Prevents excessive polling that could trigger rate limits
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextAuthSessionProvider
      // Refetch session every 5 minutes (300 seconds)
      refetchInterval={5 * 60}
      // Refetch on window focus to catch session changes
      refetchOnWindowFocus={true}
      // Ensure session is fetched when mounting
      refetchWhenOffline={false}
    >
      {children}
    </NextAuthSessionProvider>
  );
}

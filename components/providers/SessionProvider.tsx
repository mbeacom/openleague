"use client";

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";

// Session refetch interval (5 minutes)
const SESSION_REFETCH_INTERVAL_SECONDS = 5 * 60;

/**
 * Session Provider with configured refetch intervals
 * - Checks session every 5 minutes when tab is active
 * - Checks on window focus to catch session changes
 * - Prevents excessive polling that could trigger rate limits
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextAuthSessionProvider
      // Refetch session every 5 minutes
      refetchInterval={SESSION_REFETCH_INTERVAL_SECONDS}
      // Refetch on window focus to catch session changes
      refetchOnWindowFocus={true}
      // Ensure session is fetched when mounting
      refetchWhenOffline={false}
    >
      {children}
    </NextAuthSessionProvider>
  );
}

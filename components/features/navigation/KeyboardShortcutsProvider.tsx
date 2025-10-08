"use client";

import { useLeagueKeyboardShortcuts } from '@/lib/hooks/useLeagueKeyboardShortcuts';

/**
 * Provider component that enables keyboard shortcuts
 * Place this high in the component tree to enable shortcuts throughout the app
 */
export function KeyboardShortcutsProvider({ children }: { children: React.ReactNode }) {
  useLeagueKeyboardShortcuts();
  return <>{children}</>;
}

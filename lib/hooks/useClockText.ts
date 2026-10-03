"use client";

import { useSyncExternalStore } from "react";
import { formatClockTime, formatLongDate } from "@/lib/utils/date";

const noopSubscribe = () => () => {};

/** false while server-rendering and hydrating, true afterwards. */
export function useMounted(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

/** Stands in for a viewer-zone time until the browser can format it. */
export const TIME_PLACEHOLDER = "—";

export interface ClockText {
  /** "6:00 PM", or "6:00 PM EDT" when `withZone` (default: the session's showZone) */
  time: (date: Date, withZone?: boolean) => string;
  /** "Tuesday, April 7, 2026" */
  longDate: (date: Date) => string;
}

/**
 * Session clock formatting that hydrates cleanly (3b). A venue zone formats
 * the same instant identically on the server and in the browser, so it renders
 * at once. Without one, the text depends on the viewer's zone, which the
 * server can't know, so it renders TIME_PLACEHOLDER until mount.
 * suppressHydrationWarning would only hide the warning: React keeps the
 * server's text.
 */
export function useClockText(timeZone: string | undefined, showZone: boolean): ClockText {
  const ready = useMounted() || showZone;
  return {
    time: (date, withZone = showZone) => (ready ? formatClockTime(date, timeZone, withZone) : TIME_PLACEHOLDER),
    longDate: (date) => (ready ? formatLongDate(date, timeZone) : TIME_PLACEHOLDER),
  };
}

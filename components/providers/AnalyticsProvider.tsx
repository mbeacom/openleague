'use client';

import { useCallback, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import Script from 'next/script';
import { useReportWebVitals } from 'next/web-vitals';
import {
  ANALYTICS_CONSENT_STORAGE_KEY,
  isAnalyticsOptedOut,
  trackClientError,
  trackWebVital,
} from '@/lib/analytics/tracking';
import {
  UMAMI_DISABLED_OWNER_STORAGE_KEY,
  UMAMI_DISABLED_STORAGE_KEY,
  isPublicCapabilityPath,
  isPublicCapabilityUrl,
} from '@/lib/telemetry/capability-privacy';

type ReportWebVitalsCallback = Parameters<typeof useReportWebVitals>[0];
type AnalyticsWindow = Record<string, unknown>;
type UmamiTracker = NonNullable<Window['umami']>;

const TRACKER_SCRIPT_SELECTOR =
  'script[src*="cloud.umami.is"], script[src*="googletagmanager.com/gtag/js"]';

/** Marks the history wrapper installed below so it is never stacked twice. */
const HISTORY_GUARD_FLAG = '__openleagueCapabilityGuard';

/**
 * Real `window.umami` methods, parked while a capability route is displayed so
 * they can be handed back when the visitor returns to a tracked route.
 */
let suspendedUmami: UmamiTracker | null = null;

function getGaDisableKey(): string | null {
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
  return measurementId ? `ga-disable-${measurementId}` : null;
}

function readLocalStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocalStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage unavailable (private mode, blocked cookies): the in-page stubs
    // and the GA disable flag below still hold.
  }
}

function clearLocalStorage(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to clear -- the key was never persisted.
  }
}

/**
 * Turn the third-party trackers off for a public capability route.
 *
 * Un-rendering `<Script>` is not enough: once umami or gtag.js has executed it
 * has already hooked `history.pushState`, so a client-side navigation from a
 * tracked page into `/gear-wishlist/<token>` would emit a pageview carrying the
 * share token. Each tracker is therefore stopped through its own documented
 * kill switch -- both are re-read on every hit -- plus a stub for first-party
 * calls and removal of any tag that has not finished loading.
 *
 * Safe to call repeatedly (link click, history hook, route effect).
 */
function suppressTrackers(): void {
  if (typeof window === 'undefined') return;

  const gaDisableKey = getGaDisableKey();
  if (gaDisableKey) {
    (window as unknown as AnalyticsWindow)[gaDisableKey] = true;
  }

  // Umami's history hook calls its *internal* sender rather than window.umami,
  // so only the localStorage switch can stop the pageview it queues. Never
  // overwrite an existing value; the owner marker records that this app set it,
  // so a visitor's own opt-out is never cleared later.
  if (readLocalStorage(UMAMI_DISABLED_STORAGE_KEY) === null) {
    writeLocalStorage(UMAMI_DISABLED_STORAGE_KEY, '1');
    writeLocalStorage(UMAMI_DISABLED_OWNER_STORAGE_KEY, '1');
  }

  const umami = window.umami;
  if (umami && !suspendedUmami) {
    suspendedUmami = umami;
    window.umami = {
      track: () => {},
      identify: () => {},
    };
  }

  if (typeof document !== 'undefined') {
    document
      .querySelectorAll(TRACKER_SCRIPT_SELECTOR)
      .forEach((element) => element.remove());
  }
}

/**
 * Hand the trackers back on a tracked route.
 *
 * This runs on every tracked-route mount, not only after a suppression in the
 * same document: `umami.disabled` is persistent, so a capability route visited
 * in an earlier document would otherwise keep analytics off forever.
 */
function resumeTrackers(): void {
  if (typeof window === 'undefined') return;

  const gaDisableKey = getGaDisableKey();
  if (gaDisableKey) {
    (window as unknown as AnalyticsWindow)[gaDisableKey] = isAnalyticsOptedOut();
  }

  if (readLocalStorage(UMAMI_DISABLED_OWNER_STORAGE_KEY) === '1') {
    clearLocalStorage(UMAMI_DISABLED_STORAGE_KEY);
    clearLocalStorage(UMAMI_DISABLED_OWNER_STORAGE_KEY);
  }

  if (suspendedUmami) {
    window.umami = suspendedUmami;
    suspendedUmami = null;
  }
}

/**
 * Wrap `history.pushState`/`replaceState` so a programmatic navigation into a
 * capability route disables the trackers before they observe the URL.
 *
 * Re-installed after each tracker script loads: a tracker that patched history
 * after us would otherwise run its own handler first.
 */
function installHistoryGuard(): void {
  if (typeof window === 'undefined' || !window.history) return;

  for (const method of ['pushState', 'replaceState'] as const) {
    const current = window.history[method] as History['pushState'] & {
      [HISTORY_GUARD_FLAG]?: true;
    };

    // Still the outermost wrapper: nothing has patched history since last time.
    if (current[HISTORY_GUARD_FLAG]) continue;

    const guarded = function guardedHistoryMethod(
      this: History,
      ...args: Parameters<History['pushState']>
    ) {
      const target = args[2];
      const href =
        target instanceof URL ? target.href : typeof target === 'string' ? target : null;

      if (href && isPublicCapabilityUrl(href, window.location.href)) {
        suppressTrackers();
      }

      return current.apply(this, args);
    } as History['pushState'] & { [HISTORY_GUARD_FLAG]?: true };

    guarded[HISTORY_GUARD_FLAG] = true;
    window.history[method] = guarded;
  }
}

/**
 * Capture-phase click guard: disables the trackers before the router starts a
 * client-side transition into a capability route, closing the window between a
 * tracker's own history hook firing and the route effect running.
 */
function handleCapabilityLinkClick(event: MouseEvent): void {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

  const eventTarget = event.target;
  if (!(eventTarget instanceof Element)) return;

  const anchor = eventTarget.closest('a[href]') as HTMLAnchorElement | null;
  if (!anchor) return;

  // A new tab or a download leaves this document on its tracked route, so its
  // analytics must keep running.
  if (anchor.target && anchor.target !== '_self') return;
  if (anchor.hasAttribute('download')) return;
  if (anchor.origin !== window.location.origin) return;
  if (!isPublicCapabilityPath(anchor.pathname)) return;

  suppressTrackers();
}

export default function AnalyticsProvider() {
  const pathname = usePathname();
  const publicWishlistRoute = isPublicCapabilityPath(pathname);
  const publicWishlistRouteRef = useRef(publicWishlistRoute);
  useEffect(() => {
    publicWishlistRouteRef.current = publicWishlistRoute;
  }, [publicWishlistRoute]);
  const reportWebVital = useCallback<ReportWebVitalsCallback>((metric) => {
    if (!publicWishlistRouteRef.current) trackWebVital(metric);
  }, []);
  useReportWebVitals(reportWebVital);

  useEffect(() => {
    if (publicWishlistRoute) {
      suppressTrackers();
      return;
    }

    resumeTrackers();
  }, [publicWishlistRoute]);

  useEffect(() => {
    installHistoryGuard();
    document.addEventListener('click', handleCapabilityLinkClick, true);

    return () => {
      document.removeEventListener('click', handleCapabilityLinkClick, true);
    };
  }, []);

  useEffect(() => {
    if (publicWishlistRoute) return;
    const handleWindowError = (event: ErrorEvent) => {
      const errorType = event.error instanceof Error ? event.error.name : 'Error';
      trackClientError(errorType, 'window_error');
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const errorType = reason instanceof Error ? reason.name : typeof reason;
      trackClientError(errorType || 'unknown', 'unhandled_rejection');
    };

    window.addEventListener('error', handleWindowError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleWindowError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [publicWishlistRoute]);

  if (publicWishlistRoute) return null;

  const umamiWebsiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID?.trim();
  const gaMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
  const gaDisableKey = gaMeasurementId ? `ga-disable-${gaMeasurementId}` : undefined;

  return (
    <>
      {umamiWebsiteId && (
        <Script
          src="https://cloud.umami.is/script.js"
          data-website-id={umamiWebsiteId}
          strategy="afterInteractive"
          onLoad={installHistoryGuard}
        />
      )}
      {gaMeasurementId && gaDisableKey && (
        <>
          <Script id="ga4-privacy-defaults" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){window.dataLayer.push(arguments);}
              window.gtag = gtag;
              var consentStorageKey = ${JSON.stringify(ANALYTICS_CONSENT_STORAGE_KEY)};
              var analyticsOptedOut =
                navigator.doNotTrack === '1' ||
                navigator.doNotTrack === 'yes' ||
                navigator.globalPrivacyControl === true;
              try {
                analyticsOptedOut = analyticsOptedOut ||
                  window.localStorage.getItem(consentStorageKey) === 'denied';
              } catch (_) {
                // Preserve DNT/GPC decisions even when localStorage is unavailable.
              }
              window[${JSON.stringify(gaDisableKey)}] = analyticsOptedOut;
              gtag('js', new Date());
              gtag('config', ${JSON.stringify(gaMeasurementId)}, {
                anonymize_ip: true,
                allow_google_signals: false,
                allow_ad_personalization_signals: false,
                send_page_view: !window[${JSON.stringify(gaDisableKey)}]
              });
            `}
          </Script>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaMeasurementId)}`}
            strategy="afterInteractive"
            onLoad={installHistoryGuard}
          />
        </>
      )}
    </>
  );
}

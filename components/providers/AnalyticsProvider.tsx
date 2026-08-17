'use client';

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import Script from 'next/script';
import { useReportWebVitals } from 'next/web-vitals';
import {
  ANALYTICS_CONSENT_STORAGE_KEY,
  isAnalyticsOptedOut,
  trackClientError,
  trackWebVital,
} from '@/lib/analytics/tracking';
import { isPublicCapabilityPath } from '@/lib/telemetry/capability-privacy';

type ReportWebVitalsCallback = Parameters<typeof useReportWebVitals>[0];
type AnalyticsWindow = Window & {
  gtag?: (...args: unknown[]) => void;
  umami?: { track: (payload: { url: string }) => void };
};

function trackManualPageView(pathname: string, umamiEnabled: boolean, gaEnabled: boolean): void {
  if (isPublicCapabilityPath(pathname) || typeof window === 'undefined') return;

  // Both vendors have autonomous history tracking disabled at initialization.
  // A page view is emitted only here, with a pathname that cannot carry a
  // capability token or query-string value.
  const analyticsWindow = window as AnalyticsWindow;
  if (umamiEnabled) analyticsWindow.umami?.track({ url: pathname });
  if (gaEnabled && typeof analyticsWindow.gtag === 'function') {
    analyticsWindow.gtag('event', 'page_view', {
      page_path: pathname,
      page_location: `${window.location.origin}${pathname}`,
    });
  }
}

export default function AnalyticsProvider() {
  const pathname = usePathname();
  const publicWishlistRoute = isPublicCapabilityPath(pathname);
  const publicWishlistRouteRef = useRef(publicWishlistRoute);
  const activePathnameRef = useRef(pathname);
  const umamiWebsiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID?.trim();
  const gaMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();

  useLayoutEffect(() => {
    // A script can finish loading after a client navigation. Keep its callback
    // bound to the committed active route rather than the pathname that rendered
    // the tag.
    activePathnameRef.current = pathname;
    publicWishlistRouteRef.current = publicWishlistRoute;
  }, [pathname, publicWishlistRoute]);

  const reportWebVital = useCallback<ReportWebVitalsCallback>((metric) => {
    if (!publicWishlistRouteRef.current) trackWebVital(metric);
  }, []);
  useReportWebVitals(reportWebVital);

  useEffect(() => {
    if (publicWishlistRoute) return;
    trackManualPageView(pathname, Boolean(umamiWebsiteId), Boolean(gaMeasurementId));
  }, [gaMeasurementId, pathname, publicWishlistRoute, umamiWebsiteId]);

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

  return (
    <>
      {umamiWebsiteId && (
        <Script
          src="https://cloud.umami.is/script.js"
          data-website-id={umamiWebsiteId}
          data-auto-track="false"
          strategy="afterInteractive"
          onLoad={() => trackManualPageView(activePathnameRef.current, true, false)}
        />
      )}
      {gaMeasurementId && (
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
              window['ga-disable-${gaMeasurementId}'] = analyticsOptedOut;
              gtag('js', new Date());
              gtag('config', ${JSON.stringify(gaMeasurementId)}, {
                anonymize_ip: true,
                allow_google_signals: false,
                allow_ad_personalization_signals: false,
                send_page_view: false
              });
            `}
          </Script>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaMeasurementId)}`}
            strategy="afterInteractive"
            onLoad={() => trackManualPageView(activePathnameRef.current, false, true)}
          />
        </>
      )}
    </>
  );
}

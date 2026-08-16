'use client';

import { useCallback, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import Script from 'next/script';
import { useReportWebVitals } from 'next/web-vitals';
import {
  ANALYTICS_CONSENT_STORAGE_KEY,
  trackClientError,
  trackWebVital,
} from '@/lib/analytics/tracking';

type ReportWebVitalsCallback = Parameters<typeof useReportWebVitals>[0];

function isPublicWishlistRoute(pathname: string | null) {
  return pathname?.startsWith('/gear-wishlist/') ?? false;
}

export default function AnalyticsProvider() {
  const pathname = usePathname();
  const publicWishlistRoute = isPublicWishlistRoute(pathname);
  const publicWishlistRouteRef = useRef(publicWishlistRoute);
  useEffect(() => {
    publicWishlistRouteRef.current = publicWishlistRoute;
  }, [publicWishlistRoute]);
  const reportWebVital = useCallback<ReportWebVitalsCallback>((metric) => {
    if (!publicWishlistRouteRef.current) trackWebVital(metric);
  }, []);
  useReportWebVitals(reportWebVital);

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
          />
        </>
      )}
    </>
  );
}

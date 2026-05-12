'use client';

import { useEffect } from 'react';
import { useReportWebVitals } from 'next/web-vitals';
import { trackClientError, trackWebVital } from '@/lib/analytics/tracking';

type ReportWebVitalsCallback = Parameters<typeof useReportWebVitals>[0];

const reportWebVital: ReportWebVitalsCallback = (metric) => {
  trackWebVital(metric);
};

export default function AnalyticsProvider() {
  useReportWebVitals(reportWebVital);

  useEffect(() => {
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
  }, []);

  return null;
}

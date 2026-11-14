import * as Sentry from "@sentry/nextjs";

import {
  capabilityTokenPrivacyOptions,
  restrictedDataCollection,
} from "@/lib/telemetry/sentry-privacy";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

// No-op when the DSN is not configured (local dev, forks, CI).
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    // v11 collects cookies, bodies, user info and query data unless told not
    // to; this keeps the restrictive v10 defaults.
    dataCollection: restrictedDataCollection,
    // Redacts /gear-wishlist/<token> from every edge envelope (proxy.ts runs
    // here) before it is exported.
    ...capabilityTokenPrivacyOptions,
  });
}

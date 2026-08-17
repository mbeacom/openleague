import * as Sentry from "@sentry/nextjs";

import { capabilityTokenPrivacyOptions } from "@/lib/telemetry/sentry-privacy";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

// No-op when the DSN is not configured (local dev, forks, CI).
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    // Redacts /gear-wishlist/<token> from every browser envelope -- request
    // URLs, pageload/navigation transactions, spans, and breadcrumbs -- before
    // it is exported.
    ...capabilityTokenPrivacyOptions,
  });
}

// Instruments App Router navigations (safe no-op without a DSN). Navigation
// spans are named from the target URL, so they are redacted by the
// beforeSendSpan/beforeSendTransaction hooks above before they are sent.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

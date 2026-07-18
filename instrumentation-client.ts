import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

// No-op when the DSN is not configured (local dev, forks, CI).
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0.1,
  });
}

// Instruments App Router navigations (safe no-op without a DSN).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
